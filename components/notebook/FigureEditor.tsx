"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FigLineKind, FigMarkKind, FigUnderlay, NoteFigure } from "@/lib/types";
import {
  FIG_M,
  FIG_W,
  LINE_LABEL,
  LINE_PTS,
  MAX_HISTORY,
  MAX_LINES,
  MAX_MARKS,
  MAX_TEXTS,
  MAX_TEXT_LEN,
  PEN_PTS,
  UNDERLAYS,
  UNDERLAY_ORDER,
  figureIsEmpty,
  roundFigure,
  thinPath,
} from "@/lib/figures";
import { IconPen, IconRedo, IconTextLabel, IconUndo } from "../icons";
import { FigLine, FigureSvg, FigureView, useWidth } from "./FigureView";

/* note-reflection-figure §3-2: 作図の画面。スマホは全画面、PC は中央のパネル（幅 420px） */

type Tool = "pen" | "line" | "mark" | "text" | "erase";
type Pt = { x: number; y: number };
type Moving = { kind: "mark" | "text"; idx: number; x: number; y: number };

const LINE_KINDS: FigLineKind[] = ["pass", "dribble", "run", "shot"];
const MARK_KINDS: { k: FigMarkKind; label: string }[] = [
  { k: "me", label: "自分" },
  { k: "mate", label: "味方" },
  { k: "opp", label: "相手" },
  { k: "ball", label: "ボール" },
];

/* ---- 小さな線画（24px 系。絵文字は使わない） ---- */
const ico = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
function IcoArrow() {
  return (
    <svg {...ico} width={20} height={20} aria-hidden="true">
      <path d="M6 18 18 6" />
      <path d="M9 6h9v9" />
    </svg>
  );
}
function IcoMarks() {
  return (
    <svg {...ico} width={20} height={20} aria-hidden="true">
      <circle cx="8" cy="8" r="3.5" />
      <path d="m16.5 20-3.5-6h7Z" />
    </svg>
  );
}
function IcoEraser() {
  return (
    <svg {...ico} width={20} height={20} aria-hidden="true">
      <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}
function IcoDown() {
  return (
    <svg {...ico} width={16} height={16} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function LineSwatch({ k, w = 28 }: { k: FigLineKind; w?: number }) {
  const common = { stroke: "currentColor", fill: "none", strokeLinecap: "butt" as const };
  return (
    <svg width={w} height={8} viewBox="0 0 28 8" aria-hidden="true">
      {k === "pass" && <path d="M0 4H28" {...common} strokeWidth={2} strokeDasharray="5 3" />}
      {k === "dribble" && <path d="M0 4q2.3-4 4.7 0t4.7 0 4.7 0 4.7 0 4.7 0 4.5 0" {...common} strokeWidth={2} strokeLinecap="round" />}
      {k === "run" && <path d="M0 4H28" {...common} strokeWidth={1.3} />}
      {k === "shot" && <path d="M0 4H28" {...common} strokeWidth={4} />}
    </svg>
  );
}
function MarkSwatch({ k }: { k: FigMarkKind }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      {k === "me" && <circle cx="12" cy="12" r="8" fill="currentColor" />}
      {k === "mate" && <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2} />}
      {k === "opp" && <path d="M12 4 20.5 19h-17Z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />}
      {k === "ball" && <circle cx="12" cy="12" r="4" fill="currentColor" />}
    </svg>
  );
}

const distSeg = (p: Pt, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2));
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
};

export function FigureEditor({
  initial,
  onDone,
  onCancel,
}: {
  /** 直す図（新しい図は空の図を渡す） */
  initial: NoteFigure;
  /** 完了。何も描いていないときは null（今ある図なら消す・新しい図なら入れない） */
  onDone: (fig: NoteFigure | null) => void;
  onCancel: () => void;
}) {
  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);
  const [fig, setFig] = useState<NoteFigure>(initial);
  const figRef = useRef(fig);
  figRef.current = fig;
  const [past, setPast] = useState<NoteFigure[]>([]);
  const [future, setFuture] = useState<NoteFigure[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [lineKind, setLineKind] = useState<FigLineKind>("pass");
  const [markKind, setMarkKind] = useState<FigMarkKind>("me");
  const [temp, setTemp] = useState<number[] | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [underlayOpen, setUnderlayOpen] = useState(false);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [textVal, setTextVal] = useState("");
  const [toast, setToast] = useState("");
  const [zoom, setZoom] = useState({ k: 1, tx: 0, ty: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [stageWrap, stageW] = useWidth<HTMLDivElement>();
  // 図の幅：画面に収まるよう、使える高さからも決める（凡例と余白のぶんを引く）
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState({ w: 358, h: 560 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    // スマホ（全画面）は余った高さいっぱい。PC のパネルは図の高さに合わせて縮み、上限だけ決める
    const upd = () =>
      setRoom({
        w: el.clientWidth,
        h: getComputedStyle(el).flexGrow === "1" ? el.clientHeight : Math.min(640, 0.7 * window.innerHeight),
      });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    window.addEventListener("resize", upd);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", upd);
    };
  }, []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const H = UNDERLAYS[fig.underlay].h;
  const changed = JSON.stringify(fig) !== initialJson;

  /* ---- 開いている間は後ろの画面をスクロールさせない ---- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---- 履歴（1 手ずつ・40 手まで） ---- */
  const commit = useCallback((next: NoteFigure) => {
    // 直前の図は更新関数の外で取る（更新関数が走るころには figRef が新しい図になっている）
    const prev = figRef.current;
    setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), prev]);
    setFuture([]);
    setFig(next);
  }, []);
  const undo = () => {
    if (past.length === 0) return;
    setFuture((f) => [fig, ...f]);
    setFig(past[past.length - 1]);
    setPast(past.slice(0, -1));
  };
  const redo = () => {
    if (future.length === 0) return;
    setPast((p) => [...p, fig].slice(-MAX_HISTORY));
    setFig(future[0]);
    setFuture(future.slice(1));
  };

  const tryCancel = useCallback(() => {
    if (changed && !window.confirm("描いた内容を捨てますか？")) return;
    onCancel();
  }, [changed, onCancel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !underlayOpen && !textAt) tryCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryCancel, underlayOpen, textAt]);

  const done = () => {
    const r = roundFigure(fig);
    onDone(figureIsEmpty(r) ? null : r);
  };

  /* ---- 指の位置 → 図の座標（拡大した後の見た目の矩形から求める） ---- */
  const toFig = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: Math.max(0, Math.min(FIG_W, Math.round(((e.clientX - r.left) / r.width) * FIG_W))),
      y: Math.max(0, Math.min(H, Math.round(((e.clientY - r.top) / r.height) * H))),
    };
  };
  const pxToFig = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width ? FIG_W / r.width : FIG_W / 358;
  };

  /** 印・文字・線のうち、押した所にいちばん近い物（ratio＝しきい値に対する近さ。1 以下なら当たり） */
  const hitTest = (p: Pt, withLines: boolean): { kind: "mark" | "text" | "line"; idx: number } | null => {
    const f = pxToFig();
    let best: { kind: "mark" | "text" | "line"; idx: number; ratio: number } | null = null;
    const take = (kind: "mark" | "text" | "line", idx: number, ratio: number) => {
      if (ratio <= 1 && (!best || ratio < best.ratio)) best = { kind, idx, ratio };
    };
    figRef.current.marks.forEach((m, i) => take("mark", i, Math.hypot(m.x - p.x, m.y - p.y) / (16 * f)));
    figRef.current.texts.forEach((t, i) => {
      const hw = (t.t.length * 12 + 8) / 2;
      const dx = Math.max(0, Math.abs(t.x - p.x) / f - hw);
      const dy = Math.max(0, Math.abs(t.y - p.y) / f - 10);
      take("text", i, Math.hypot(dx, dy) / 6 || 0.01);
    });
    if (withLines)
      figRef.current.lines.forEach((l, i) => {
        let d = Infinity;
        if (l.p.length === 2) d = Math.hypot(l.p[0] - p.x, l.p[1] - p.y);
        for (let j = 0; j + 3 < l.p.length; j += 2) d = Math.min(d, distSeg(p, l.p[j], l.p[j + 1], l.p[j + 2], l.p[j + 3]));
        take("line", i, d / (12 * f));
      });
    return best;
  };

  /* ---- 指の操作（Pointer Events） ---- */
  type G = {
    mode: "idle" | "draw" | "hold" | "move" | "tap" | "pinch";
    id: number;
    start: { x: number; y: number }; // 画面の座標
    startFig: Pt | null;
    pts: number[];
    hit: { kind: "mark" | "text" | "line"; idx: number } | null;
    timer: ReturnType<typeof setTimeout> | null;
    pinch?: { d0: number; k0: number; tx0: number; ty0: number; mx: number; my: number };
  };
  const g = useRef<G>({ mode: "idle", id: -1, start: { x: 0, y: 0 }, startFig: null, pts: [], hit: null, timer: null });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const movingRef = useRef<Moving | null>(null);

  const clearTimer = () => {
    if (g.current.timer) clearTimeout(g.current.timer);
    g.current.timer = null;
  };
  const resetGesture = () => {
    clearTimer();
    g.current.mode = "idle";
    g.current.pts = [];
    g.current.hit = null;
    movingRef.current = null;
    setTemp(null);
    setMoving(null);
  };

  const addLine = (k: FigLineKind, raw: number[]) => {
    const cur = figRef.current;
    if (cur.lines.length >= MAX_LINES) {
      showToast(`線は 1 枚に ${MAX_LINES} 本までです`);
      return;
    }
    // 短すぎる線（ほぼ点）は入れない
    let len = 0;
    for (let i = 2; i + 1 < raw.length; i += 2) len += Math.hypot(raw[i] - raw[i - 2], raw[i + 1] - raw[i - 1]);
    if (raw.length < 4 || len < 20) return;
    const p = thinPath(raw, k === "pen" ? PEN_PTS : LINE_PTS);
    commit({ ...cur, lines: [...cur.lines, { k, p }] });
  };
  const addMark = (k: FigMarkKind, at: Pt) => {
    const cur = figRef.current;
    if (cur.marks.length >= MAX_MARKS) {
      showToast(`印は 1 枚に ${MAX_MARKS} 個までです`);
      return;
    }
    commit({ ...cur, marks: [...cur.marks, { k, x: at.x, y: at.y }] });
  };
  const eraseAt = (at: Pt) => {
    const h = hitTest(at, true);
    if (!h) return;
    const cur = figRef.current;
    if (h.kind === "mark") commit({ ...cur, marks: cur.marks.filter((_, i) => i !== h.idx) });
    else if (h.kind === "text") commit({ ...cur, texts: cur.texts.filter((_, i) => i !== h.idx) });
    else commit({ ...cur, lines: cur.lines.filter((_, i) => i !== h.idx) });
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType !== "mouse") touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 2 本目の指：描きかけは捨てて拡大・移動へ
    if (touches.current.size >= 2) {
      const [a, b] = Array.from(touches.current.values());
      resetGesture();
      const z = zoomRef.current;
      g.current.mode = "pinch";
      g.current.pinch = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k0: z.k,
        tx0: z.tx,
        ty0: z.ty,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      return;
    }
    if (g.current.mode !== "idle") return;
    const p = toFig(e);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    g.current.id = e.pointerId;
    g.current.start = { x: e.clientX, y: e.clientY };
    g.current.startFig = p;
    if (tool === "erase") {
      // 消すのは指を離したとき（2 本目の指が触れたら拡大に移り、消さない）
      g.current.mode = "tap";
      g.current.hit = null;
      return;
    }
    const hit = hitTest(p, false);
    if (hit && (hit.kind === "mark" || hit.kind === "text")) {
      g.current.mode = "hold";
      g.current.hit = hit;
      g.current.timer = setTimeout(() => {
        g.current.timer = null;
        if (g.current.mode !== "hold" || !g.current.hit) return;
        g.current.mode = "move";
        const h = g.current.hit;
        const src = h.kind === "mark" ? figRef.current.marks[h.idx] : figRef.current.texts[h.idx];
        if (!src) return;
        const mv = { kind: h.kind as "mark" | "text", idx: h.idx, x: src.x, y: src.y };
        movingRef.current = mv;
        setMoving(mv);
      }, 400);
      return;
    }
    if (tool === "pen" || tool === "line") {
      g.current.mode = "draw";
      g.current.pts = [p.x, p.y];
      setTemp([p.x, p.y]);
    } else {
      g.current.mode = "tap";
    }
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = g.current;
    if (s.mode === "pinch") {
      if (touches.current.size < 2 || !s.pinch) return;
      const [a, b] = Array.from(touches.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const st = stageRef.current?.getBoundingClientRect();
      if (!st) return;
      const k = Math.max(1, Math.min(3, s.pinch.k0 * (d / s.pinch.d0)));
      // 指の中点の下にある図の点が、動かした中点の下に来るように
      const cx = (s.pinch.mx - st.left - s.pinch.tx0) / s.pinch.k0;
      const cy = (s.pinch.my - st.top - s.pinch.ty0) / s.pinch.k0;
      const tx = Math.max(st.width * (1 - k), Math.min(0, mx - st.left - cx * k));
      const ty = Math.max(st.height * (1 - k), Math.min(0, my - st.top - cy * k));
      setZoom({ k, tx, ty });
      return;
    }
    if (e.pointerId !== s.id) return;
    const p = toFig(e);
    if (!p) return;
    if (s.mode === "hold") {
      if (Math.hypot(e.clientX - s.start.x, e.clientY - s.start.y) > 8) {
        clearTimer();
        s.hit = null;
        if (tool === "pen" || tool === "line") {
          s.mode = "draw";
          s.pts = [s.startFig!.x, s.startFig!.y, p.x, p.y];
          setTemp(s.pts.slice());
        } else s.mode = "tap";
      }
    } else if (s.mode === "draw") {
      const lx = s.pts[s.pts.length - 2];
      const ly = s.pts[s.pts.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) > 6 * pxToFig() * 0.5 && s.pts.length < 800) {
        s.pts.push(p.x, p.y);
        setTemp(s.pts.slice());
      }
    } else if (s.mode === "move" && movingRef.current) {
      const mv = { ...movingRef.current, x: p.x, y: p.y };
      movingRef.current = mv;
      setMoving(mv);
    }
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    const s = g.current;
    if (s.mode === "pinch") {
      if (touches.current.size === 0) resetGesture();
      return;
    }
    if (e.pointerId !== s.id) return;
    const p = toFig(e) ?? s.startFig;
    const mode = s.mode;
    const mv = movingRef.current;
    const startFig = s.startFig;
    const rawPts = s.pts.slice();
    clearTimer();
    resetGesture();
    if (mode === "draw") {
      const raw = rawPts;
      if (p && (raw[raw.length - 2] !== p.x || raw[raw.length - 1] !== p.y)) raw.push(p.x, p.y);
      addLine(tool === "pen" ? "pen" : lineKind, raw);
    } else if (mode === "move" && mv) {
      const cur = figRef.current;
      const src = mv.kind === "mark" ? cur.marks[mv.idx] : cur.texts[mv.idx];
      if (!src || (src.x === mv.x && src.y === mv.y)) return; // 動かしていなければ履歴に積まない
      if (mv.kind === "mark") commit({ ...cur, marks: cur.marks.map((m, i) => (i === mv.idx ? { ...m, x: mv.x, y: mv.y } : m)) });
      else commit({ ...cur, texts: cur.texts.map((t, i) => (i === mv.idx ? { ...t, x: mv.x, y: mv.y } : t)) });
    } else if ((mode === "tap" || mode === "hold") && startFig) {
      const at = p ?? startFig;
      if (tool === "erase") eraseAt(startFig);
      else if (tool === "mark") addMark(markKind, at);
      else if (tool === "text") {
        if (figRef.current.texts.length >= MAX_TEXTS) showToast(`文字は 1 枚に ${MAX_TEXTS} 個までです`);
        else {
          setTextVal("");
          setTextAt(at);
        }
      }
    }
  };

  const onCancelPtr = (e: React.PointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size === 0 || g.current.mode !== "pinch") resetGesture();
  };

  const chooseUnderlay = (u: FigUnderlay) => {
    if (u === fig.underlay) return;
    // 新しい下敷きの高さに収まらない物があるときは替えない（見えなくなって、保存で下の端に潰れるため）
    const h = UNDERLAYS[u].h;
    const out =
      fig.lines.some((l) => l.p.some((v, i) => i % 2 === 1 && v > h)) ||
      fig.marks.some((m) => m.y > h) ||
      fig.texts.some((t) => t.y > h);
    if (out) {
      setUnderlayOpen(false);
      showToast(`${UNDERLAYS[u].label}に替えると、はみ出す物があります。先に消すか動かしてください`);
      return;
    }
    commit({ ...fig, underlay: u });
  };
  const addText = () => {
    const t = textVal.trim().slice(0, MAX_TEXT_LEN);
    if (t && textAt) {
      const cur = figRef.current;
      if (cur.texts.length >= MAX_TEXTS) showToast(`文字は 1 枚に ${MAX_TEXTS} 個までです`);
      else commit({ ...cur, texts: [...cur.texts, { x: textAt.x, y: textAt.y, t }] });
    }
    setTextAt(null);
  };

  /* ---- 表示用の図（動かしている物は仮の位置で） ---- */
  const shown: NoteFigure = useMemo(() => {
    if (!moving) return fig;
    if (moving.kind === "mark") return { ...fig, marks: fig.marks.map((m, i) => (i === moving.idx ? { ...m, x: moving.x, y: moving.y } : m)) };
    return { ...fig, texts: fig.texts.map((t, i) => (i === moving.idx ? { ...t, x: moving.x, y: moving.y } : t)) };
  }, [fig, moving]);

  const subRow = tool === "line" ? "line" : tool === "mark" ? "mark" : null;
  const tempNode =
    temp && temp.length >= 2 ? <FigLine k={tool === "pen" ? "pen" : lineKind} p={temp} /> : null;

  const TOOLS: { t: Tool; label: string; icon: React.ReactNode }[] = [
    { t: "pen", label: "ペン", icon: <IconPen width={20} height={20} /> },
    { t: "line", label: "線", icon: <IcoArrow /> },
    { t: "mark", label: "印", icon: <IcoMarks /> },
    { t: "text", label: "文字", icon: <IconTextLabel width={20} height={20} /> },
    { t: "erase", label: "消しゴム", icon: <IcoEraser /> },
  ];

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="figed" role="dialog" aria-modal="true" aria-label="作図">
      <div className="figed-panel">
        <div className="figed-head">
          <button type="button" className="figed-hbtn" onClick={tryCancel}>
            やめる
          </button>
          <button type="button" className="figed-title" onClick={() => setUnderlayOpen(true)} aria-label="下敷きを選ぶ">
            {UNDERLAYS[fig.underlay].label}
            <IcoDown />
          </button>
          <button type="button" className="figed-hbtn done" onClick={done}>
            完了
          </button>
        </div>

        <div ref={canvasRef} className="figed-canvas">
          <div
            ref={stageWrap}
            className="figed-stagewrap"
            style={{
              width: Math.max(
                120,
                Math.min(358, room.w - 32, ((room.h - 24 - 8 - 18) * FIG_M) / UNDERLAYS[fig.underlay].vbH - 2)
              ),
            }}
          >
            <div
              ref={stageRef}
              className="figed-stage"
              data-tool={tool}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancelPtr}
            >
              <div className="figed-zoom" style={{ transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.k})` }}>
                <FigureSvg fig={shown} pxWidth={stageW * zoom.k} extra={tempNode} svgRef={svgRef} />
              </div>
            </div>
            {zoom.k > 1.001 && (
              <button type="button" className="figed-reset" onClick={() => setZoom({ k: 1, tx: 0, ty: 0 })}>
                等倍に戻す
              </button>
            )}
          </div>
          <div className="figed-legend" aria-hidden="true">
            {LINE_KINDS.map((k) => (
              <span key={k} className="figed-lg">
                <LineSwatch k={k} />
                {LINE_LABEL[k]}
              </span>
            ))}
          </div>
        </div>

        <div className="figed-foot">
          {toast && (
            <div className="figed-toast" role="status">
              {toast}
            </div>
          )}
          {subRow && (
            <div className="figed-sub" role="group" aria-label={subRow === "line" ? "線の種類" : "印の種類"}>
              {subRow === "line"
                ? LINE_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={"figtool" + (lineKind === k ? " on" : "")}
                      aria-pressed={lineKind === k}
                      onClick={() => setLineKind(k)}
                    >
                      <LineSwatch k={k} />
                      <span>{LINE_LABEL[k]}</span>
                    </button>
                  ))
                : MARK_KINDS.map((m) => (
                    <button
                      key={m.k}
                      type="button"
                      className={"figtool" + (markKind === m.k ? " on" : "")}
                      aria-pressed={markKind === m.k}
                      onClick={() => setMarkKind(m.k)}
                    >
                      <MarkSwatch k={m.k} />
                      <span>{m.label}</span>
                    </button>
                  ))}
            </div>
          )}
          <div className="figed-undo">
            <button type="button" className="figtool sq" onClick={undo} disabled={past.length === 0} aria-label="元に戻す" title="元に戻す">
              <IconUndo width={20} height={20} />
            </button>
            <button type="button" className="figtool sq" onClick={redo} disabled={future.length === 0} aria-label="やり直す" title="やり直す">
              <IconRedo width={20} height={20} />
            </button>
          </div>
          <div className="figed-tools" role="group" aria-label="道具">
            {TOOLS.map((t) => (
              <button
                key={t.t}
                type="button"
                className={"figtool" + (tool === t.t ? " on" : "")}
                aria-pressed={tool === t.t}
                onClick={() => setTool(t.t)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {underlayOpen && (
          <div className="figed-sheetback" onClick={() => setUnderlayOpen(false)}>
            <div className="figed-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="figed-sheet-h">
                <b>下敷き</b>
                <button type="button" className="figed-hbtn done" onClick={() => setUnderlayOpen(false)}>
                  完了
                </button>
              </div>
              <div className="figed-ulgrid">
                {UNDERLAY_ORDER.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={"figed-ul" + (fig.underlay === u ? " on" : "")}
                    aria-pressed={fig.underlay === u}
                    onClick={() => chooseUnderlay(u)}
                  >
                    <span className="figed-ulpv">
                      <span style={{ display: "block", width: `min(100%, ${Math.round((136 * FIG_M) / UNDERLAYS[u].vbH)}px)` }}>
                        <FigureView thumb fig={{ id: "pv", at: 0, underlay: u, lines: [], marks: [], texts: [] }} />
                      </span>
                    </span>
                    <span>{UNDERLAYS[u].label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {textAt && (
          <div className="figed-sheetback" onClick={() => setTextAt(null)}>
            <div className="figed-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="figed-sheet-h">
                <b>文字を入れる</b>
                <span className="figed-cnt">
                  {textVal.length} / {MAX_TEXT_LEN}
                </span>
              </div>
              <input
                className="st-input"
                value={textVal}
                maxLength={MAX_TEXT_LEN}
                autoFocus
                placeholder="例）ここで前を向く"
                onChange={(e) => setTextVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) addText();
                }}
              />
              <button type="button" className="st-btn figed-textok" onClick={addText}>
                入れる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

