"use client";

// ゴースト残像レイヤー：場面2以降を編集中、「前の場面の開始時点」の選手・相手・ボールの位置を
// 薄いディスクで表示し、「どこから動いてきたか」を見せる。操作は受け付けない静的表示のみ。

import type { Actor } from "@/lib/types";
import { actorPos, stepStartTime } from "@/lib/animation";
import { yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";

export default function GhostLayer() {
  const board = useBoard();
  const { mode, activeStep, showGhost, isPlaying, state } = board;

  if (mode !== "anim" || activeStep <= 0 || !showGhost || isPlaying) return null;

  const { moves, slots, ball, opponents, players, pitchView, holder } = state;
  const t0 = stepStartTime(moves, activeStep - 1);

  return (
    <>
      {slots.map((s, i) => {
        if (!s.pid) return null;
        const p = players.find((x) => x.id === s.pid);
        const q = actorPos(i, t0, moves, slots, ball, opponents, holder);
        return (
          <div
            key={`gp${i}`}
            className="ghosttok"
            style={{ left: `${q.x}%`, top: `${yToTop(q.y, pitchView)}%` }}
          >
            {p?.number ?? "–"}
          </div>
        );
      })}
      {(opponents ?? []).map((o, i) => {
        const actor = `opp${i}` as Actor;
        const q = actorPos(actor, t0, moves, slots, ball, opponents, holder);
        return (
          <div
            key={`go${i}`}
            className="ghosttok opp"
            style={{ left: `${q.x}%`, top: `${yToTop(q.y, pitchView)}%` }}
          >
            {o.label}
          </div>
        );
      })}
      {(() => {
        const q = actorPos("ball", t0, moves, slots, ball, opponents, holder);
        return (
          <div
            className="ghosttok ball"
            style={{ left: `${q.x}%`, top: `${yToTop(q.y, pitchView)}%` }}
          />
        );
      })()}
    </>
  );
}
