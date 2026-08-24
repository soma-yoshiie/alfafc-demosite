"use client";

import { useCallback } from "react";
import { groupOf } from "@/lib/formations";
import { yToTop } from "@/lib/pitchView";
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
  // アニメ中は場面ごとの保持者、編集中は盤面の保持者を表示する
  const hasBall =
    board.mode === "anim"
      ? board.holderAtStep(board.activeStep) === index
      : board.state.holder === index;

  const { registerToken } = board;
  const setRef = useCallback(
    (el: HTMLDivElement | null) => registerToken(index, el),
    [registerToken, index]
  );

  return (
    <div
      ref={setRef}
      className={`tok${sel ? " sel" : ""}`}
      data-slot={index}
      style={{ left: `${s.x}%`, top: `${yToTop(s.y, board.state.pitchView)}%` }}
      {...drag}
    >
      {player ? (
        <div className={`disc ${g}${hasBall ? " hasball" : ""}`}>
          {board.state.captain === s.pid && <span className="capt">C</span>}
          {player.roleNote && <span className="memodot" title="役割メモあり"><E n="note" /></span>}
          {player.number ?? "–"}
        </div>
      ) : (
        // セットプレーデザイン中は「+」（追加の意味合い）を出さず、薄い破線ディスクのまま
        // 表示して空き枠だと分かるようにする（名簿変更・共有取込で空き枠が生じうるため）
        <div className={`disc empty${board.state.setPiece ? " spempty" : ""}`}>
          {board.state.setPiece ? "" : "+"}
        </div>
      )}
      <div className="role">{s.role}</div>
      {player && <div className="pname">{player.name}</div>}
    </div>
  );
}
