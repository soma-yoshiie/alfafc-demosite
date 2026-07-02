"use client";

import { useCallback } from "react";
import { groupOf } from "@/lib/formations";
import { useBoard } from "./BoardProvider";
import { usePointerDrag } from "./usePointerDrag";
import { E } from "./Emoji";

export default function PlayerToken({ index }: { index: number }) {
  const board = useBoard();
  const s = board.state.slots[index];
  const drag = usePointerDrag(index);
  const player = s.pid
    ? board.state.players.find((p) => p.id === s.pid) ?? null
    : null;
  const g = groupOf(s.role);
  const sel = board.mode === "anim" && board.selActor === index;

  const setRef = useCallback(
    (el: HTMLDivElement | null) => board.registerToken(index, el),
    [board, index]
  );

  return (
    <div
      ref={setRef}
      className={`tok${sel ? " sel" : ""}`}
      data-slot={index}
      style={{ left: `${s.x}%`, top: `${100 - s.y}%` }}
      {...drag}
    >
      {player ? (
        <div className={`disc ${g}`}>
          {board.state.captain === s.pid && <span className="capt">C</span>}
          {player.roleNote && <span className="memodot" title="役割メモあり"><E n="note" /></span>}
          {player.number ?? "–"}
        </div>
      ) : (
        <div className="disc empty">+</div>
      )}
      <div className="role">{s.role}</div>
      {player && <div className="pname">{player.name}</div>}
    </div>
  );
}
