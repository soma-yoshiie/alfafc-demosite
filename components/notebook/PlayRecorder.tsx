"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MatchPhase, PlayKind, PlayLine, PlayLineKind, PlayPoint, Point } from "@/lib/types";
import { MATCH_PHASE_LABEL, PLAY_KIND_LABEL, PLAY_LINE_LABEL } from "@/lib/types";
import {
  PLAY_KINDS,
  PLAY_LINE_KINDS,
  groupPlays,
  markCanvas,
  markPhase,
  nextOrd,
  playNotes,
  playStats,
  playTitle,
  popPhaseCanvas,
} from "@/lib/plays";
import { PlayAreaPitch, fieldPct, isInGoalFrame, type PitchView, type PlayTool } from "../MiniPitch";
import { PlayStatsRow } from "./PlayStatsRow";
import { LineResultSheet, ShotCourseSheet } from "./PlaySheets";

/* note-pitch-v2 §2-2・§2-3: プレーの記録（選手）／ピッチに描いて伝える（スタッフ）の編集部品。
   データ（plays・playLines）は親が持つ。画面の状態（道具・フェーズ・ピッチ番号・全面／ハーフ・シート）はここに持つ */

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props =
  | {
      mode: "player";
      plays: PlayPoint[];
      playLines: PlayLine[];
      onPlays: Setter<PlayPoint[]>;
      onLines: Setter<PlayLine[]>;
      phases: MatchPhase[];
    }
  | {
      mode: "staff";
      plays: PlayPoint[];
      playLines: PlayLine[];
      onPlays: Setter<PlayPoint[]>;
      onLines: Setter<PlayLine[]>;
    };

/** note-play-chain §4-2（C4）: 作図中のプレーの終わりに吸い付く距離（画面上の px。指の太さに合わせた値） */
const SNAP_PX = 16;

/** ハーフ表示で見える範囲（敵陣側）の下端。y（保存の座標）がこれ未満の印は入れ物の外 */
const HALF_VISIBLE_MIN_Y = 100 - 54 / 1.05;

/** 道具の絵。ピッチの上の印・線と同じ形（受けた＝輪、シュート＝黄の丸、ミス＝赤の ×、ドリブル＝波線、パス＝破線） */
function ToolIcon({ kind }: { kind: PlayKind | PlayLineKind }) {
  const common = { width: 28, height: 18, viewBox: "0 0 28 18", "aria-hidden": true, focusable: false } as const;
  if (kind === "receive") {
    return (
      <svg {...common}>
        <circle cx="14" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    );
  }
  if (kind === "shot") {
    return (
      <svg {...common}>
        <circle cx="14" cy="9" r="6" fill="#ffd166" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "miss") {
    return (
      <svg {...common}>
        <circle cx="14" cy="9" r="7" fill="#ffffff" stroke="var(--danger)" strokeWidth="1.5" />
        <path d="M10.5 5.5L17.5 12.5M17.5 5.5L10.5 12.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "dribble") {
    return (
      <svg {...common}>
        <path
          d="M1 9q2.5 -6 5 0t5 0t5 0t4 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="27,9 21,5.8 21,12.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M1 9H20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3.4 2.4" />
      <polygon points="27,9 21,5.8 21,12.2" fill="currentColor" />
    </svg>
  );
}

function ToolLabel({ kind }: { kind: PlayKind | PlayLineKind }) {
  // 3 つ目は「トラップミス」を 1 行に収めるため「ミス」と書く（aria-label は「トラップミス」）
  if (kind === "miss") return <span>ミス</span>;
  if (kind === "receive" || kind === "shot") return <span>{PLAY_KIND_LABEL[kind]}</span>;
  return <span>{PLAY_LINE_LABEL[kind]}</span>;
}

/** 1 列 5 つの道具（受けた・シュート・ミス・ドリブル・パス） */
function PlayTools({ tool, onTool }: { tool: PlayTool; onTool: (t: PlayTool) => void }) {
  return (
    <div className="playtools">
      {PLAY_KINDS.map((k) => {
        const on = tool.mode === "point" && tool.kind === k;
        return (
          <button
            key={k}
            type="button"
            className={`playkind ${k}${on ? " on" : ""}`}
            aria-pressed={on}
            aria-label={k === "miss" ? "トラップミス" : undefined}
            onClick={() => onTool({ mode: "point", kind: k })}
          >
            <ToolIcon kind={k} />
            <ToolLabel kind={k} />
          </button>
        );
      })}
      {PLAY_LINE_KINDS.map((k) => {
        const on = tool.mode === "line" && tool.kind === k;
        return (
          <button
            key={k}
            type="button"
            className={`playline ${k}${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onTool({ mode: "line", kind: k })}
          >
            <ToolIcon kind={k} />
            <ToolLabel kind={k} />
          </button>
        );
      })}
    </div>
  );
}

export function PlayRecorder(props: Props) {
  const { plays, playLines, onPlays, onLines } = props;
  const player = props.mode === "player";
  const phases: MatchPhase[] = props.mode === "player" ? props.phases : [];
  const [tool, setTool] = useState<PlayTool>(player ? { mode: "point", kind: "receive" } : { mode: "line", kind: "pass" });
  // 記録・表示フェーズ（前半/後半/延長）
  const [playPhase, setPlayPhase] = useState<MatchPhase>("1st");
  // 現フェーズ内で表示・記録中のピッチ番号（複数ピッチ記録用）
  const [activeCanvas, setActiveCanvas] = useState(0);
  // 表示の切り替え（保存しない。既定は全面）
  const [view, setView] = useState<PitchView>("full");
  // シュートコース編集シートの対象（plays 配列の index。null なら非表示）
  const [shotEditIndex, setShotEditIndex] = useState<number | null>(null);
  // パス/ドリブル結果編集シートの対象（playLines 配列の index。null なら非表示）
  const [lineEditIndex, setLineEditIndex] = useState<number | null>(null);
  // note-play-chain §4: 作図中のプレーの chain（終わりの位置・次の順番は印から毎回求める。「1つ戻す」で自然に戻る）
  const [pendingChain, setPendingChain] = useState<string | null>(null);
  // 行の「ドリブル」「パス」を押した直後の 1 本は、始点を作図中のプレーの終わりに固定する
  const [forced, setForced] = useState(false);
  // 一覧で選んだプレー
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const etPresent = phases.includes("et");
  // 延長のマークを全消去して延長チップが消えたら前半へフォールバック
  useEffect(() => {
    if (playPhase === "et" && !etPresent) setPlayPhase("1st");
  }, [playPhase, etPresent]);
  // フェーズを切り替えたらピッチ選択を 1 枚目に戻す
  useEffect(() => {
    setActiveCanvas(0);
  }, [playPhase]);

  /* ---------- 今の範囲の印（元の配列の位置 pIdx・lIdx つき） ----------
     選手：現フェーズ×現ピッチ。スタッフ：全部（フェーズ・ピッチ番号なし） */
  const inScope = (x: { phase?: MatchPhase; canvas?: number }) =>
    !player || (markPhase(x.phase) === playPhase && markCanvas(x.canvas) === activeCanvas);
  const pIdx = plays.map((_, i) => i).filter((i) => inScope(plays[i]));
  const lIdx = playLines.map((_, i) => i).filter((i) => inScope(playLines[i]));
  const scopedPlays = pIdx.map((i) => plays[i]);
  const scopedPlayLines = lIdx.map((i) => playLines[i]);
  const pitchView: PitchView = player ? view : "full";

  /* ---------- 作図中のプレー（印から求める） ---------- */
  type Pend = { chain: string; end: Point; seq: number; points: number[] };
  const pend: Pend | null = (() => {
    if (!pendingChain) return null;
    const ms: { seq: number; ord: number; end: Point; pointIdx: number | null; lineIdx: number }[] = [];
    scopedPlays.forEach((p, si) => {
      if (p.chain === pendingChain) ms.push({ seq: p.seq ?? 0, ord: p.ord ?? 0, end: { x: p.x, y: p.y }, pointIdx: si, lineIdx: -1 });
    });
    scopedPlayLines.forEach((l, si) => {
      if (l.chain === pendingChain && l.path.length > 0) ms.push({ seq: l.seq ?? 0, ord: l.ord ?? 0, end: l.path[l.path.length - 1], pointIdx: null, lineIdx: si });
    });
    if (ms.length === 0) return null;
    ms.sort((a, b) => a.seq - b.seq || a.ord - b.ord);
    const last = ms[ms.length - 1];
    return {
      chain: pendingChain,
      end: last.end,
      seq: last.seq + 1,
      points: ms.filter((m) => m.pointIdx != null).map((m) => m.pointIdx as number),
    };
  })();
  const hasPend = !!pend;
  // 作図中の印が全部消えた（「1つ戻す」など）ら chain も消す。残すと、下書きの復元で同じ id の別のプレーが作図中として生き返る
  useEffect(() => {
    if (pendingChain && !hasPend) setPendingChain(null);
  }, [pendingChain, hasPend]);
  const lastMarkIsLine = (() => {
    if (!pend) return -1;
    const li = scopedPlayLines
      .map((l, si) => ({ l, si }))
      .filter(({ l }) => l.chain === pend.chain)
      .sort((a, b) => (a.l.seq ?? 0) - (b.l.seq ?? 0))
      .pop();
    const pt = scopedPlays.filter((p) => p.chain === pend.chain).reduce((m, p) => Math.max(m, p.seq ?? 0), -1);
    return li && (li.l.seq ?? 0) > pt ? li.si : -1;
  })();

  /** 画面上の距離（px）。ピッチの入れ物の大きさから測る */
  const pxDist = (a: Point, b: Point): number => {
    const el = wrapRef.current?.querySelector(".npitch");
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0) return Infinity;
    const pa = fieldPct(a.x, a.y, pitchView);
    const pb = fieldPct(b.x, b.y, pitchView);
    return Math.hypot(((pa.left - pb.left) / 100) * r.width, ((pa.top - pb.top) / 100) * r.height);
  };

  const stamp = (): { phase?: MatchPhase; canvas?: number } => (player ? { phase: playPhase, canvas: activeCanvas } : {});

  const endPlay = () => {
    setPendingChain(null);
    setForced(false);
  };
  /** シートの「削除」で印を 1 つ消した後：同じプレーの印が残っていれば、そのプレーを作図中に戻す（続きを描き直せる） */
  const reopenAfterRemove = (type: "point" | "line", idx: number) => {
    const ch = type === "point" ? plays[idx]?.chain : playLines[idx]?.chain;
    if (!ch) return;
    const remains =
      pIdx.some((i) => !(type === "point" && i === idx) && plays[i].chain === ch) ||
      lIdx.some((i) => !(type === "line" && i === idx) && playLines[i].chain === ch);
    if (remains) {
      setPendingChain(ch);
      setForced(false);
    }
  };

  // ピッチタップで点を追加。シュートは追加直後にコース編集シートを開く（スタッフはシートが無い）
  const addPoint = (x: number, y: number) => {
    const kind = tool.mode === "point" ? tool.kind : "receive";
    // 親の更新関数の中で自分の state を変えると React が警告するので、追加する位置は先に決める
    const at = plays.length;
    const ord = nextOrd(plays, playLines);
    // 行の選択と作図中は同時に持たない（選んだままだと新しい印が薄くなる）
    setSelectedId(null);
    const snap = !!pend && kind === "shot" && pxDist(pend.end, { x, y }) <= SNAP_PX;
    let mark: PlayPoint;
    if (snap && pend) {
      mark = { x: pend.end.x, y: pend.end.y, kind, ...stamp(), chain: pend.chain, seq: pend.seq, ord };
      endPlay();
    } else if (kind === "receive") {
      const chain = "c" + ord;
      mark = { x, y, kind, ...stamp(), chain, seq: 0, ord };
      setPendingChain(chain);
      setForced(false);
    } else {
      mark = { x, y, kind, ...stamp(), ord };
      endPlay();
    }
    onPlays((prev) => [...prev, mark]);
    if (kind === "shot" && player) setShotEditIndex(at);
  };

  // なぞって軌道を追加。結果は聞かない（最後の「ここまで」で聞く）
  const addLine = (path: Point[]) => {
    const kind = tool.mode === "line" ? tool.kind : "dribble";
    const ord = nextOrd(plays, playLines);
    setSelectedId(null);
    let chain = "c" + ord;
    let seq = 0;
    let pts = path;
    if (pend && forced) {
      // 始点は、なぞり始めの位置に関係なく作図中のプレーの終わりに固定する
      const same = path.length > 0 && Math.hypot(path[0].x - pend.end.x, path[0].y - pend.end.y) < 0.5;
      pts = [pend.end, ...(same ? path.slice(1) : path)];
      chain = pend.chain;
      seq = pend.seq;
    } else if (pend && path.length > 0 && pxDist(pend.end, path[0]) <= SNAP_PX) {
      pts = [pend.end, ...path.slice(1)];
      chain = pend.chain;
      seq = pend.seq;
    }
    onLines((prev) => [...prev, { kind, path: pts, ...stamp(), chain, seq, ord }]);
    setPendingChain(chain);
    setForced(false);
  };

  /* 「続けて」の行 */
  const nextLine = (k: PlayLineKind) => {
    setTool({ mode: "line", kind: k });
    setForced(true);
  };
  const nextShot = () => {
    if (!pend) return;
    const at = plays.length;
    const ord = nextOrd(plays, playLines);
    setSelectedId(null);
    const mark: PlayPoint = { x: pend.end.x, y: pend.end.y, kind: "shot", ...stamp(), chain: pend.chain, seq: pend.seq, ord };
    onPlays((prev) => [...prev, mark]);
    endPlay();
    if (player) setShotEditIndex(at);
  };
  const finish = () => {
    if (player && lastMarkIsLine >= 0) setLineEditIndex(lIdx[lastMarkIsLine]);
    endPlay();
  };

  const nextStep = pend ? (
    <div className="nextstep">
      <span className="nextstep-t">続けて</span>
      <div className="nextstep-b">
        <button type="button" className={`nsbtn${forced && tool.mode === "line" && tool.kind === "dribble" ? " on" : ""}`} aria-pressed={forced && tool.mode === "line" && tool.kind === "dribble"} onClick={() => nextLine("dribble")}>
          ドリブル
        </button>
        <button type="button" className={`nsbtn${forced && tool.mode === "line" && tool.kind === "pass" ? " on" : ""}`} aria-pressed={forced && tool.mode === "line" && tool.kind === "pass"} onClick={() => nextLine("pass")}>
          パス
        </button>
        <button type="button" className="nsbtn" onClick={nextShot}>
          シュート
        </button>
        <button type="button" className="nsbtn end" onClick={finish}>
          ここまで
        </button>
      </div>
    </div>
  ) : null;

  const chooseTool = (t: PlayTool) => {
    setTool(t);
    setForced(false);
  };

  /* 「1つ戻す」：ord が最も大きい 1 つを消す（点と軌道をまたいで時間順）。ord が無い古いノートは今まで通り */
  const undo = () => {
    let b: { type: "point" | "line"; idx: number; ord: number } | null = null;
    for (const i of pIdx) {
      const o = plays[i].ord;
      if (o != null && (!b || o > b.ord)) b = { type: "point", idx: i, ord: o };
    }
    for (const i of lIdx) {
      const o = playLines[i].ord;
      if (o != null && (!b || o > b.ord)) b = { type: "line", idx: i, ord: o };
    }
    setSelectedId(null);
    if (b) {
      const { type, idx } = b;
      // 1 つ前の印を置いた直後の状態に戻す：残った中でいちばん新しい印が、つながったプレーの途中（シュート以外）なら、
      // そのプレーを作図中に戻す（消した後に続きを描き直せる）。それ以外は作図中を消す
      let prev: { chain?: string; shot: boolean; ord: number } | null = null;
      for (const i of pIdx) {
        if (type === "point" && i === idx) continue;
        const o = plays[i].ord;
        if (o != null && (!prev || o > prev.ord)) prev = { chain: plays[i].chain, shot: plays[i].kind === "shot", ord: o };
      }
      for (const i of lIdx) {
        if (type === "line" && i === idx) continue;
        const o = playLines[i].ord;
        if (o != null && (!prev || o > prev.ord)) prev = { chain: playLines[i].chain, shot: false, ord: o };
      }
      setPendingChain(prev && prev.chain && !prev.shot ? prev.chain : null);
      setForced(false);
      if (type === "point") onPlays((p) => p.filter((_, i) => i !== idx));
      else onLines((p) => p.filter((_, i) => i !== idx));
      return;
    }
    if (player) {
      if (tool.mode === "line") onLines((p) => popPhaseCanvas(p, playPhase, activeCanvas));
      else onPlays((p) => popPhaseCanvas(p, playPhase, activeCanvas));
    } else if (tool.mode === "line") onLines((p) => p.slice(0, -1));
    else onPlays((p) => p.slice(0, -1));
  };

  // 作図中のプレーの番号（点が 1 つでも出す。note-play-chain §3）
  const pendBadges = pend && pend.points.length >= 1 ? pend.points.map((p, n) => ({ point: p, n: n + 1 })) : undefined;

  /* ---------- スタッフ（ピッチに描いて伝える）：フェーズ・ピッチ番号なし ---------- */
  if (props.mode === "staff") {
    return (
      <>
        <div className="npwrap" ref={wrapRef}>
          <PlayAreaPitch
            tone="staff"
            points={plays}
            lines={playLines}
            tool={tool}
            snapAt={pend ? pend.end : null}
            badges={pendBadges}
            onAddPoint={addPoint}
            onAddLine={addLine}
          />
          {/* 道具・「続けて」の行・1つ戻す／全消去もピッチと同じ幅の箱の中に置く（ピッチ → 道具 → 続けて の順。選手と同じ） */}
          <PlayTools tool={tool} onTool={chooseTool} />
          {nextStep}
          {(plays.length > 0 || playLines.length > 0) && (
            <div className="playacts">
              <button type="button" className="dynadd" onClick={undo}>
                1つ戻す
              </button>
              <button
                type="button"
                className="dynadd"
                onClick={() => {
                  onPlays([]);
                  onLines([]);
                  endPlay();
                }}
              >
                全消去
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  /* ---------- 選手（自分のプレー） ---------- */
  const phaseMarkCount = (p: MatchPhase) =>
    plays.filter((pt) => markPhase(pt.phase) === p).length + playLines.filter((l) => markPhase(l.phase) === p).length;
  // 現フェーズで使われているピッチ枚数（未使用でも選択中のピッチまでは表示。最低1・最大4枚）
  const canvasMaxUsed = Math.max(
    0,
    ...plays.filter((p) => markPhase(p.phase) === playPhase).map((p) => markCanvas(p.canvas)),
    ...playLines.filter((l) => markPhase(l.phase) === playPhase).map((l) => markCanvas(l.canvas))
  );
  const canvasCount = Math.min(4, Math.max(1, canvasMaxUsed + 1, activeCanvas + 1));

  // ハーフで自陣側に隠れている印（点は位置、軌道は全点が隠れているもの）
  const hiddenCount =
    view === "half"
      ? scopedPlays.filter((p) => p.y < HALF_VISIBLE_MIN_Y).length +
        scopedPlayLines.filter((l) => l.path.length > 0 && l.path.every((pt) => pt.y < HALF_VISIBLE_MIN_Y)).length
      : 0;

  // プレーの一覧（index は scoped の配列の中の位置）
  const groups = groupPlays(scopedPlays, scopedPlayLines);
  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const strong = selected
    ? {
        points: selected.steps.filter((s) => s.type === "point").map((s) => s.index),
        lines: selected.steps.filter((s) => s.type === "line").map((s) => s.index),
      }
    : null;
  // 番号は「受けた」「シュート」にだけ付ける（単独のトラップミスの行を選んでも番号は出さない）
  const selBadges = selected
    ? selected.steps
        .filter((s) => s.type === "point" && s.kind !== "miss")
        .map((s, n) => ({ point: s.index, n: n + 1 }))
    : undefined;

  const resetPending = () => {
    setPendingChain(null);
    setForced(false);
    setSelectedId(null);
  };
  const changePhase = (p: MatchPhase) => {
    resetPending();
    setPlayPhase(p);
  };
  const changeCanvas = (i: number) => {
    resetPending();
    setActiveCanvas(i);
  };
  const changeView = (v: PitchView) => {
    resetPending();
    setView(v);
  };
  const pickRow = (id: string) => {
    // 選んだプレーのピッチが画面の外にあるときは見える所まで寄せる（note-play-chain §10-13）
    wrapRef.current?.querySelector<HTMLElement>(".npitch")?.scrollIntoView({ block: "nearest" });
    setPendingChain(null);
    setForced(false);
    setSelectedId((cur) => (cur === id ? null : id));
  };
  const fixGroup = () => {
    if (!selected) return;
    const last = selected.steps[selected.steps.length - 1];
    if (last.type === "line") setLineEditIndex(lIdx[last.index]);
    else if (last.kind === "shot") setShotEditIndex(pIdx[last.index]);
  };
  const deleteGroup = () => {
    if (!selected) return;
    if (selected.steps.length >= 2 && !window.confirm(`このプレー（印 ${selected.steps.length} つ）を消しますか？`)) return;
    const dp = new Set(selected.steps.filter((s) => s.type === "point").map((s) => pIdx[s.index]));
    const dl = new Set(selected.steps.filter((s) => s.type === "line").map((s) => lIdx[s.index]));
    onPlays((prev) => prev.filter((_, i) => !dp.has(i)));
    onLines((prev) => prev.filter((_, i) => !dl.has(i)));
    setSelectedId(null);
  };

  const clearCanvas = () => {
    const n = scopedPlays.length;
    const m = scopedPlayLines.length;
    if (n === 0 && m === 0) return;
    if (!window.confirm(`このピッチの記録（点 ${n} ・ 軌道 ${m}）を消しますか？`)) return;
    onPlays((prev) => prev.filter((p) => !(markPhase(p.phase) === playPhase && markCanvas(p.canvas) === activeCanvas)));
    onLines((prev) => prev.filter((l) => !(markPhase(l.phase) === playPhase && markCanvas(l.canvas) === activeCanvas)));
    resetPending();
  };

  const counts = `${MATCH_PHASE_LABEL[playPhase]} ・ 点 ${scopedPlays.length} ／ 軌道 ${scopedPlayLines.length}${
    canvasCount > 1 ? ` ・ ピッチ ${activeCanvas + 1}` : ""
  }`;
  const hint =
    tool.mode === "point"
      ? `ピッチを押して「${PLAY_KIND_LABEL[tool.kind]}」を置く（${counts}）`
      : `ピッチをなぞって「${PLAY_LINE_LABEL[tool.kind]}」を描く（${counts}）`;

  let chainNo = 0;

  return (
    <>
      <div className="notesec-h" style={{ marginTop: 14 }}>自分のプレー</div>
      <div className="phasebar">
        {phases.map((p) => {
          const cnt = phaseMarkCount(p);
          return (
            <button
              key={p}
              type="button"
              className={`phasechip${playPhase === p ? " on" : ""}`}
              aria-pressed={playPhase === p}
              onClick={() => changePhase(p)}
            >
              {MATCH_PHASE_LABEL[p]}{cnt > 0 ? ` ${cnt}` : ""}
            </button>
          );
        })}
      </div>
      <div className="npbar">
        <div className="npbar-l">
          <span className="npbar-t">ピッチ</span>
          {Array.from({ length: canvasCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`canvaschip${activeCanvas === i ? " on" : ""}`}
              aria-label={`ピッチ${i + 1}`}
              aria-pressed={activeCanvas === i}
              onClick={() => changeCanvas(i)}
            >
              {i + 1}
            </button>
          ))}
          {canvasCount < 4 && (
            <button
              type="button"
              className="canvaschip add"
              aria-label="ピッチを追加"
              onClick={() => changeCanvas(canvasCount)}
            >
              ＋
            </button>
          )}
        </div>
        <div className="npbar-r">
          <button type="button" className={`canvaschip${view === "full" ? " on" : ""}`} aria-pressed={view === "full"} onClick={() => changeView("full")}>
            全面
          </button>
          <button type="button" className={`canvaschip${view === "half" ? " on" : ""}`} aria-pressed={view === "half"} onClick={() => changeView("half")}>
            ハーフ
          </button>
        </div>
      </div>
      <div className="npwrap" ref={wrapRef}>
        <PlayAreaPitch
          points={scopedPlays}
          lines={scopedPlayLines}
          tool={tool}
          view={view}
          strong={strong}
          badges={selBadges ?? pendBadges}
          snapAt={pend ? pend.end : null}
          onAddPoint={addPoint}
          onAddLine={addLine}
        />
        <PlayTools tool={tool} onTool={chooseTool} />
        {nextStep}
      </div>
      <div className="phasehint">{hint}</div>
      {hiddenCount > 0 && <div className="phasehint">自陣側の印 {hiddenCount} 個は「全面」で見える</div>}
      {(plays.length > 0 || playLines.length > 0) && (
        <div className="playacts">
          <button type="button" className="dynadd" onClick={undo}>
            1つ戻す
          </button>
          <button type="button" className="dynadd danger" onClick={clearCanvas}>
            このピッチを消去
          </button>
        </div>
      )}

      {groups.length > 0 && <div className="notesec-h playlist-h">プレーの一覧</div>}
      {groups.length > 0 && (
        <div className="playlist">
          {groups.map((g) => {
            const on = g.id === selected?.id;
            const notes = playNotes(g, scopedPlays, scopedPlayLines);
            const lastStep = g.steps[g.steps.length - 1];
            const canFix = lastStep.type === "line" || lastStep.kind === "shot";
            const tag = g.chained ? `プレー ${++chainNo}` : "単独";
            return (
              <div key={g.id} className={`playitem${on ? " on" : ""}`}>
                <button type="button" className={`playrow${on ? " on" : ""}`} aria-pressed={on} onClick={() => pickRow(g.id)}>
                  <span className="playrow-tag">{tag}</span>
                  <span className="playrow-b">
                    <span className="playrow-t">{playTitle(g, scopedPlays, scopedPlayLines)}</span>
                    {notes.length > 0 && <span className="playrow-n">{notes.join(" ・ ")}</span>}
                  </span>
                </button>
                {on && (
                  <div className="playrow-acts">
                    {canFix && (
                      <button type="button" className="playrow-fix" onClick={fixGroup}>
                        直す
                      </button>
                    )}
                    <button type="button" className="playrow-del" onClick={deleteGroup}>
                      削除
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(plays.length > 0 || playLines.length > 0) && <PlayStatsRow stats={playStats(plays, playLines)} />}

      {shotEditIndex != null && plays[shotEditIndex] && (
        <ShotCourseSheet
          shot={plays[shotEditIndex]}
          onPick={(x, y) => {
            const scored = isInGoalFrame(x, y);
            onPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, course: { x, y }, scored } : p)));
          }}
          onSetScored={(v) => onPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, scored: v } : p)))}
          onSetNote={(v) => onPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, shotNote: v } : p)))}
          onClose={() => setShotEditIndex(null)}
          onDelete={() => {
            reopenAfterRemove("point", shotEditIndex);
            onPlays((prev) => prev.filter((_, i) => i !== shotEditIndex));
            setShotEditIndex(null);
            setSelectedId(null);
          }}
        />
      )}

      {lineEditIndex != null && playLines[lineEditIndex] && (
        <LineResultSheet
          line={playLines[lineEditIndex]}
          onSetSuccess={(v) => onLines((prev) => prev.map((l, i) => (i === lineEditIndex ? { ...l, success: v } : l)))}
          onSetNote={(v) => onLines((prev) => prev.map((l, i) => (i === lineEditIndex ? { ...l, note: v } : l)))}
          onClose={() => setLineEditIndex(null)}
          onDelete={() => {
            reopenAfterRemove("line", lineEditIndex);
            onLines((prev) => prev.filter((_, i) => i !== lineEditIndex));
            setLineEditIndex(null);
            setSelectedId(null);
          }}
        />
      )}
    </>
  );
}
