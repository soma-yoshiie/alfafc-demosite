"use client";

// 戦術アニメの「感覚的な」タイミング編集タイムライン。
// 全ルートを1本の時間軸に並べ、バーのドラッグ＝開始時間、右端ハンドル＝長さ。
// 他ルートの開始/終了・0秒に自動スナップするので「同時に動く」「終わったら動く」が指先で作れる。

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { animTotal, durFromPath } from "@/lib/animation";
import { actorColor } from "@/lib/colors";
import type { Actor } from "@/lib/types";
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
  rectW: number;
  tview: number;
  startX: number;
  origStart: number;
  origDur: number;
  snaps: number[];
  moved: boolean;
  // コミット用の最新値
  start: number;
  dur: number;
}

const TacticsTimeline = forwardRef<TimelineHandle, object>(function TacticsTimeline(
  _props,
  ref
) {
  const board = useBoard();
  const { moves, slots, players } = board.state;

  const [ghost, setGhost] = useState<{ index: number; start: number; dur: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const tviewRef = useRef(4);
  const lastTRef = useRef(0);

  // 表示レンジ（ドラッグ中は固定してガタつきを防ぐ）
  const T = animTotal(moves);
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
    const s = slots[actor as number];
    if (!s) return "選手";
    const p = s.pid ? players.find((x) => x.id === s.pid) : null;
    return p ? `${s.role} ${p.name.split(/\s+/)[0]}` : s.role;
  };

  // 行はアクター順（背番号順＋ボール最後）で固定：ドラッグ中に行が飛ばない
  const rows = moves
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ra = a.m.actor === "ball" ? 999 : (a.m.actor as number);
      const rb = b.m.actor === "ball" ? 999 : (b.m.actor as number);
      return ra - rb;
    });

  const selIndex = moves.findIndex((m) => m.actor === board.selActor);
  const sel = selIndex >= 0 ? moves[selIndex] : null;

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
    const snaps = [0];
    moves.forEach((x, j) => {
      if (j === index) return;
      snaps.push(+x.start.toFixed(2), +(x.start + x.dur).toFixed(2));
    });
    dragRef.current = {
      mode,
      index,
      actor: m.actor,
      rectW: track.getBoundingClientRect().width,
      tview: tviewRef.current,
      startX: e.clientX,
      origStart: m.start,
      origDur: m.dur,
      snaps,
      moved: false,
      start: m.start,
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
      let ns = clamp(d.origStart + ds, 0, 120);
      for (const c of d.snaps) {
        if (Math.abs(ns - c) < snapS) ns = c; // 開始をスナップ
        else if (Math.abs(ns + d.origDur - c) < snapS && c - d.origDur >= 0)
          ns = c - d.origDur; // 終了をスナップ
      }
      d.start = +ns.toFixed(2);
      setGhost({ index: d.index, start: d.start, dur: d.origDur });
    } else {
      let nd = clamp(d.origDur + ds, 0.3, 30);
      for (const c of d.snaps) {
        if (Math.abs(d.origStart + nd - c) < snapS && c - d.origStart >= 0.3)
          nd = c - d.origStart;
      }
      d.dur = +nd.toFixed(2);
      setGhost({ index: d.index, start: d.origStart, dur: d.dur });
    }
  };

  const onBarUp = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setGhost(null);
    if (!d.moved) {
      // タップ＝選択（ピッチ上のルートもハイライト）
      board.setSelActor(board.selActor === d.actor ? null : d.actor);
      return;
    }
    if (d.mode === "move") {
      board.updateMove(d.index, { start: d.start });
      board.seek(d.start); // その瞬間の盤面を見せる
    } else {
      board.updateMove(d.index, { dur: d.dur });
      board.seek(d.origStart + d.dur);
    }
  };

  /* ---- 目盛りのシーク ---- */
  const rulerSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = clamp(((e.clientX - r.left) / r.width) * tviewRef.current, 0, T);
    board.seek(t);
  };

  /* ---- 選択クリップのクイック操作 ---- */
  const others = (idx: number) => moves.filter((_, j) => j !== idx);
  const applySel = (patch: { start?: number; dur?: number }, seekTo?: number) => {
    if (selIndex < 0) return;
    board.updateMove(selIndex, patch);
    if (seekTo != null) board.seek(seekTo);
  };

  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(tview); s++) ticks.push(s);
  const labelEvery = tview > 9 ? 2 : 1;

  if (moves.length === 0) {
    return (
      <div className="clipsEmpty">
        選手やボールをピッチ上で指でなぞると、その軌道がここに並びます。
        <br />
        バーを左右にドラッグ＝動き出しのタイミング、右端をドラッグ＝スピード調整。
      </div>
    );
  }

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
        {rows.map(({ m, i }) => {
          const g = ghost?.index === i ? ghost : null;
          const start = g?.start ?? m.start;
          const dur = g?.dur ?? m.dur;
          const col = actorColor(m.actor, slots);
          const isSel = m.actor === board.selActor;
          return (
            <div key={String(m.actor)} className="tlrow">
              <div
                className={`tllabel${isSel ? " sel" : ""}`}
                onClick={() =>
                  board.setSelActor(board.selActor === m.actor ? null : m.actor)
                }
              >
                <span className="cdot" style={{ background: col }} />
                {actorLabel(m.actor)}
              </div>
              <div className="tltrack">
                <div
                  className={`tlbar${isSel ? " sel" : ""}${g ? " drag" : ""}`}
                  style={{
                    left: (start / tview) * 100 + "%",
                    width: Math.max((dur / tview) * 100, 3) + "%",
                    background: col,
                  }}
                  onPointerDown={(e) => onBarDown(e, i, "move")}
                  onPointerMove={onBarMove}
                  onPointerUp={onBarUp}
                  onPointerCancel={onBarUp}
                >
                  <span className="tldur">
                    {g ? `${start.toFixed(1)}s ・ ${dur.toFixed(1)}s` : `${dur.toFixed(1)}s`}
                  </span>
                  <span
                    className="tlhandle"
                    onPointerDown={(e) => onBarDown(e, i, "resize")}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tlhint">
        バーを左右にドラッグ＝タイミング ／ 右端をつまむ＝はやさ（他の動きにピタッと揃います）
      </div>

      {sel && selIndex >= 0 && (
        <div className="tlacts">
          <span className="tlselinfo">
            {actorLabel(sel.actor)}：開始 {sel.start.toFixed(1)}s ・ {sel.dur.toFixed(1)}s
          </span>
          <div className="tlchips">
            <button className="tlchip" onClick={() => applySel({ start: 0 }, 0)}>
              最初から
            </button>
            <button
              className="tlchip"
              onClick={() => {
                const after = Math.max(0, ...others(selIndex).map((x) => x.start + x.dur));
                applySel({ start: +after.toFixed(2) }, after);
              }}
            >
              みんなのあと
            </button>
            <button
              className="tlchip"
              onClick={() =>
                applySel({ dur: Math.max(0.3, +(durFromPath(sel.path) * 0.6).toFixed(2)) })
              }
            >
              はやく
            </button>
            <button className="tlchip" onClick={() => applySel({ dur: durFromPath(sel.path) })}>
              ふつう
            </button>
            <button
              className="tlchip"
              onClick={() => applySel({ dur: +(durFromPath(sel.path) * 1.6).toFixed(2) })}
            >
              ゆっくり
            </button>
            <button
              className="tlchip danger"
              onClick={() => {
                board.setSelActor(null);
                board.deleteMove(selIndex);
                board.toast("ルートを削除しました");
              }}
            >
              削除
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default TacticsTimeline;
