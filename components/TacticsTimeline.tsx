"use client";

// 戦術アニメの「詳細タイミング」タイムライン（上級者向け・折りたたみ内）。
// 全ルートを絶対時間軸に並べ、バーのドラッグ＝場面内の動き出しオフセット、
// 右端ハンドル＝長さ。他ルートの開始/終了・場面頭に自動スナップする。

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  absStart,
  animTotal,
  stepDur,
  stepStartTime,
} from "@/lib/animation";
import { actorColor } from "@/lib/colors";
import type { Actor } from "@/lib/types";
import { isOppActor, oppIndex } from "@/lib/types";
import { useBoard } from "./BoardProvider";

export interface TimelineHandle {
  /** 再生・シークに合わせて再生ヘッドを動かす（再描画なし） */
  setTime(t: number): void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface DragState {
  mode: "move" | "resize";
  index: number; // moves配列上のindex
  actor: Actor;
  step: number;
  /** 所属場面の開始絶対秒（オフセット0の位置） */
  stepBase: number;
  /** move移動の下限絶対秒。前の場面へ食い込ませられるよう stepBase - 前場面の長さ（先頭場面は0） */
  lowerBound: number;
  rectW: number;
  tview: number;
  startX: number;
  /** 開始絶対秒（ドラッグ前） */
  origAbs: number;
  origDur: number;
  snaps: number[];
  moved: boolean;
  // コミット用の最新値（絶対秒）
  abs: number;
  dur: number;
}

const TacticsTimeline = forwardRef<TimelineHandle, object>(function TacticsTimeline(
  _props,
  ref
) {
  const board = useBoard();
  const { moves, slots, players } = board.state;

  const [ghost, setGhost] = useState<{ index: number; abs: number; dur: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const tviewRef = useRef(4);
  const lastTRef = useRef(0);

  // 表示レンジ（ドラッグ中は固定してガタつきを防ぐ）
  const T = animTotal(moves, board.state.stepCount);
  const tview = dragRef.current?.tview ?? Math.max(T + 0.8, 4);
  tviewRef.current = tview;

  const setPlayhead = (t: number) => {
    lastTRef.current = t;
    if (playheadRef.current)
      playheadRef.current.style.left =
        clamp((t / tviewRef.current) * 100, 0, 100) + "%";
  };

  useImperativeHandle(ref, () => ({ setTime: setPlayhead }), []);

  // マウント時・レンジ変更時に現在時刻へ合わせる
  useEffect(() => {
    setPlayhead(board.getTime());
  });

  const actorLabel = (actor: Actor): string => {
    if (actor === "ball") return "ボール";
    if (isOppActor(actor)) {
      const o = (board.state.opponents ?? [])[oppIndex(actor)];
      return o ? `相手${o.label}` : "相手";
    }
    const s = slots[actor as number];
    if (!s) return "選手";
    const p = s.pid ? players.find((x) => x.id === s.pid) : null;
    return p ? `${s.role} ${p.name.split(/\s+/)[0]}` : s.role;
  };

  // 行は 場面→アクター順 で固定：ドラッグ中に行が飛ばない
  const actorRank = (a: Actor) =>
    a === "ball" ? 900 : isOppActor(a) ? 500 + oppIndex(a) : (a as number);
  const rows = moves
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        (a.m.step ?? 0) - (b.m.step ?? 0) ||
        actorRank(a.m.actor) - actorRank(b.m.actor)
    );

  const isSel = (m: (typeof moves)[number]) =>
    board.selMove != null &&
    board.selMove.actor === m.actor &&
    board.selMove.step === (m.step ?? 0);

  const toggleSel = (m: (typeof moves)[number]) => {
    if (isSel(m)) {
      board.setSelMove(null);
      board.setSelActor(null);
    } else {
      board.setSelMove({ actor: m.actor, step: m.step ?? 0 });
      board.setSelActor(m.actor);
    }
  };

  /* ---- バーのドラッグ ---- */
  const onBarDown = (
    e: React.PointerEvent<HTMLElement>,
    index: number,
    mode: "move" | "resize"
  ) => {
    e.stopPropagation();
    const track = (e.currentTarget.closest(".tltrack") as HTMLElement) ?? null;
    if (!track) return;
    const m = moves[index];
    const step = m.step ?? 0;
    const stepBase = stepStartTime(moves, step);
    // 前の場面がまだ再生中のうちに動き出せるよう、下限を前場面の長さぶん手前まで許容する
    // （場面0＝先頭は前場面が無いため従来どおり0が下限）
    const lowerBound = step === 0 ? 0 : stepBase - stepDur(moves, step - 1);
    const snaps = [stepBase];
    moves.forEach((x, j) => {
      if (j === index) return;
      const s = absStart(moves, x);
      snaps.push(+s.toFixed(2), +(s + x.dur).toFixed(2));
    });
    dragRef.current = {
      mode,
      index,
      actor: m.actor,
      step,
      stepBase,
      lowerBound,
      rectW: track.getBoundingClientRect().width,
      tview: tviewRef.current,
      startX: e.clientX,
      origAbs: absStart(moves, m),
      origDur: m.dur,
      snaps,
      moved: false,
      abs: absStart(moves, m),
      dur: m.dur,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    if (!d.moved) return;
    const ds = (dx / d.rectW) * d.tview;
    const snapS = (10 / d.rectW) * d.tview; // 10px相当でスナップ

    if (d.mode === "move") {
      // 前の場面へ食い込ませられるよう lowerBound を下限にする（先頭場面は0が下限のまま）
      let ns = clamp(d.origAbs + ds, d.lowerBound, d.stepBase + 120);
      for (const c of d.snaps) {
        if (Math.abs(ns - c) < snapS && c >= d.stepBase) ns = c; // 開始をスナップ
        else if (
          Math.abs(ns + d.origDur - c) < snapS &&
          c - d.origDur >= d.stepBase
        )
          ns = c - d.origDur; // 終了をスナップ
      }
      d.abs = +ns.toFixed(2);
      setGhost({ index: d.index, abs: d.abs, dur: d.origDur });
    } else {
      let nd = clamp(d.origDur + ds, 0.3, 30);
      for (const c of d.snaps) {
        if (Math.abs(d.origAbs + nd - c) < snapS && c - d.origAbs >= 0.3)
          nd = c - d.origAbs;
      }
      d.dur = +nd.toFixed(2);
      setGhost({ index: d.index, abs: d.origAbs, dur: d.dur });
    }
  };

  const onBarUp = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setGhost(null);
    if (!d.moved) {
      // タップ＝選択（ピッチ上のルートもハイライト）
      toggleSel(moves[d.index]);
      return;
    }
    if (d.mode === "move") {
      board.updateMove(d.index, { start: +(d.abs - d.stepBase).toFixed(2) });
      board.seek(d.abs); // その瞬間の盤面を見せる
    } else {
      board.updateMove(d.index, { dur: d.dur });
      board.seek(d.origAbs + d.dur);
    }
  };

  /* ---- 目盛りのシーク ---- */
  const rulerSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = clamp(((e.clientX - r.left) / r.width) * tviewRef.current, 0, T);
    board.seek(t);
  };

  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(tview); s++) ticks.push(s);
  const labelEvery = tview > 9 ? 2 : 1;

  // 場面の境界線（場面2以降の開始位置）
  const stepMarks: { s: number; t: number }[] = [];
  for (let s = 1; s < board.stepCount; s++) {
    stepMarks.push({ s, t: stepStartTime(moves, s) });
  }

  if (moves.length === 0) {
    return (
      <div className="clipsEmpty">
        ルートを描くと、各選手の動きがここに一覧表示されます。
        <br />
        バーを左右にドラッグ＝開始タイミング、右端をドラッグ＝所要時間。
      </div>
    );
  }

  let lastStep = -1;

  return (
    <div className="tlwrap">
      {/* 目盛り（タップ/ドラッグでシーク） */}
      <div
        className="tlruler"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          rulerSeek(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) rulerSeek(e);
        }}
      >
        {ticks.map((s) => (
          <span key={s} className="tltick" style={{ left: (s / tview) * 100 + "%" }}>
            {s % labelEvery === 0 && s <= tview && <i>{s}s</i>}
          </span>
        ))}
      </div>

      <div className="tlrows">
        <div ref={playheadRef} className="tlplayhead" />
        {stepMarks.map(({ s, t }) => (
          <div
            key={`sm${s}`}
            className="tlstepmark"
            style={{ left: (t / tview) * 100 + "%" }}
          />
        ))}
        {rows.map(({ m, i }) => {
          const g = ghost?.index === i ? ghost : null;
          const abs = g?.abs ?? absStart(moves, m);
          const dur = g?.dur ?? m.dur;
          const col = actorColor(m.actor, slots);
          const selected = isSel(m);
          const step = m.step ?? 0;
          const header =
            board.stepCount > 1 && step !== lastStep ? (
              <div key={`h${step}`} className="tlstephead">
                場面{step + 1}
              </div>
            ) : null;
          lastStep = step;
          return (
            <div key={`${String(m.actor)}-${step}`} className="tlrowwrap">
              {header}
              <div className="tlrow">
                <div
                  className={`tllabel${selected ? " sel" : ""}`}
                  onClick={() => toggleSel(m)}
                >
                  <span className="cdot" style={{ background: col }} />
                  {actorLabel(m.actor)}
                </div>
                <div className="tltrack">
                  <div
                    className={`tlbar${selected ? " sel" : ""}${g ? " drag" : ""}`}
                    style={{
                      left: (abs / tview) * 100 + "%",
                      width: Math.max((dur / tview) * 100, 3) + "%",
                      background: col,
                    }}
                    onPointerDown={(e) => onBarDown(e, i, "move")}
                    onPointerMove={onBarMove}
                    onPointerUp={onBarUp}
                    onPointerCancel={onBarUp}
                  >
                    <span className="tldur">
                      {g ? `${abs.toFixed(1)}s ・ ${dur.toFixed(1)}s` : `${dur.toFixed(1)}s`}
                    </span>
                    <span
                      className="tlhandle"
                      onPointerDown={(e) => onBarDown(e, i, "resize")}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tlhint">
        バーをドラッグ＝開始タイミング ／ 右端をドラッグ＝所要時間（縦点線＝場面の境界）
        <br />
        バーを前の場面へ食い込ませると動きを重ねられます（ワンツー等）
      </div>
    </div>
  );
});

export default TacticsTimeline;
