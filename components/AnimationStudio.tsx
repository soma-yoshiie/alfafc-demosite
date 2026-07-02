"use client";

import { useEffect, useRef } from "react";
import { animTotal } from "@/lib/animation";
import { actorColor } from "@/lib/colors";
import type { Actor } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import { E } from "./Emoji";

export default function AnimationStudio() {
  const board = useBoard();
  const { moves, slots, players } = board.state;
  const scrubRef = useRef<HTMLInputElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const totRef = useRef<HTMLSpanElement>(null);

  const T = animTotal(moves);

  const actorLabel = (actor: Actor): string => {
    if (actor === "ball") return "ボール";
    const s = slots[actor as number];
    const p = s.pid ? players.find((x) => x.id === s.pid) : null;
    return `${p ? p.name : "(空き)"} · ${s.role}`;
  };

  // 再生・シーク中の時間表示更新（再描画なし）
  useEffect(() => {
    board.onTick.current = (t, total) => {
      if (scrubRef.current)
        scrubRef.current.value = String(
          Math.round((Math.min(t, total) / total) * 1000)
        );
      if (curRef.current) curRef.current.textContent = Math.min(t, total).toFixed(1) + "s";
      if (totRef.current) totRef.current.textContent = total.toFixed(1) + "s";
    };
    return () => {
      board.onTick.current = null;
    };
  }, [board]);

  // クリップの増減・尺変更で表示を同期し、ポーズ中の盤面も反映
  useEffect(() => {
    const t = board.getTime();
    if (scrubRef.current)
      scrubRef.current.value = String(Math.round((Math.min(t, T) / T) * 1000));
    if (curRef.current) curRef.current.textContent = Math.min(t, T).toFixed(1) + "s";
    if (totRef.current) totRef.current.textContent = T.toFixed(1) + "s";
    if (board.mode === "anim" && !board.isPlaying)
      board.applyPlayhead(Math.min(t, T));
  }, [T, moves, board]);

  const sorted = moves
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.start - b.m.start);

  return (
    <div className="studio">
      <div className="stitle">
        <b>ANIM STUDIO</b>
        <div className="hintxt">
          選手・ボールをピッチ上でなぞるとルートを描けます
          <br />
          複数描けば同時／時間差で動きます
        </div>
      </div>

      <div className="transport">
        <div
          className="tbtn play"
          onClick={() => (board.isPlaying ? board.stopPlay() : board.startPlay())}
        >
          {board.isPlaying ? "⏸ 停止" : "▶ 再生"}
        </div>
        <div className="tbtn" title="先頭へ" onClick={board.resetPlay}>
          ⟲
        </div>
        <div
          className="tbtn"
          title="最後のルートを削除"
          onClick={() => {
            if (!moves.length) {
              board.toast("元に戻すルートがありません");
              return;
            }
            board.stopPlay();
            const last = moves[moves.length - 1];
            if (board.selActor === last.actor) board.setSelActor(null);
            board.undoMove();
            board.toast("最後のルートを削除しました");
          }}
        >
          ↩
        </div>
        <div className="spd">
          速度
          <select
            value={board.speed}
            onChange={(e) => board.setSpeed(+e.target.value)}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
        <div
          className="tbtn warn"
          title="全消去"
          onClick={() => {
            board.stopPlay();
            board.clearMoves();
            board.setSelActor(null);
            board.toast("全ルートを消去しました");
          }}
        >
          <E n="trash" />
        </div>
        <div className="tbtn done" onClick={board.closeStudio}>
          完了
        </div>
      </div>

      <input
        ref={scrubRef}
        type="range"
        className="scrub"
        min={0}
        max={1000}
        defaultValue={0}
        onInput={(e) => {
          const v = +(e.target as HTMLInputElement).value;
          board.seek((v / 1000) * animTotal(board.state.moves));
        }}
      />
      <div className="tline">
        <span ref={curRef}>0.0s</span>
        <span ref={totRef}>0.0s</span>
      </div>

      <div className="sttools">
        <div
          className={`toolchip${board.showPaths ? " on" : ""}`}
          onClick={() => board.setShowPaths(!board.showPaths)}
        >
          〰 ルート{board.showPaths ? "表示" : "非表示"}
        </div>
        <div className="toolchip" onClick={board.enterFullplay}>
          ⛶ 全画面再生
        </div>
      </div>

      <div className="clips">
        {moves.length === 0 ? (
          <div className="clipsEmpty">
            選手やボールをピッチ上で指でなぞると、その軌道がクリップとして追加されます。
            <br />
            複数追加して「開始」をずらせば、時間差での連動も作れます。
          </div>
        ) : (
          sorted.map(({ m, i }) => {
            const col = actorColor(m.actor, slots);
            const sel = m.actor === board.selActor;
            return (
              <div
                key={i}
                className={`clip${sel ? " sel" : ""}`}
                onClick={() => board.setSelActor(sel ? null : m.actor)}
              >
                <div className="crow">
                  <span className="cdot" style={{ background: col }} />
                  <span className="cname">{actorLabel(m.actor)}</span>
                  <span className="ctime">
                    開始 {m.start.toFixed(1)}s ・ {m.dur.toFixed(1)}s
                  </span>
                </div>
                <div className="gantt">
                  <div
                    className="gbar"
                    style={{
                      left: `${(m.start / T) * 100}%`,
                      width: `${(m.dur / T) * 100}%`,
                      background: col,
                    }}
                  />
                </div>
                <div className="cedit" onClick={(e) => e.stopPropagation()}>
                  <label>
                    開始
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={Math.round(m.start * 10)}
                      onChange={(e) =>
                        board.updateMove(i, { start: +e.target.value / 10 })
                      }
                    />
                    <b>{m.start.toFixed(1)}s</b>
                  </label>
                  <label>
                    長さ
                    <input
                      type="range"
                      min={3}
                      max={60}
                      value={Math.round(m.dur * 10)}
                      onChange={(e) =>
                        board.updateMove(i, {
                          dur: Math.max(0.3, +e.target.value / 10),
                        })
                      }
                    />
                    <b>{m.dur.toFixed(1)}s</b>
                  </label>
                  <button
                    className="cdel"
                    onClick={() => {
                      if (board.selActor === m.actor) board.setSelActor(null);
                      board.deleteMove(i);
                      board.toast("ルートを削除しました");
                    }}
                  >
                    このルートを削除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
