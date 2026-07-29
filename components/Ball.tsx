"use client";

import { useCallback } from "react";
import { yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";
import { usePointerDrag } from "./usePointerDrag";

export default function Ball() {
  const board = useBoard();
  const { ball } = board.state;
  const drag = usePointerDrag("ball");
  const sel = board.mode === "anim" && board.selActor === "ball";

  const { registerToken } = board;
  const setRef = useCallback(
    (el: HTMLDivElement | null) => registerToken("ball", el),
    [registerToken]
  );

  return (
    <div
      ref={setRef}
      className={`ball${sel ? " sel" : ""}`}
      style={{ left: `${ball.x}%`, top: `${yToTop(ball.y, board.state.pitchView)}%` }}
      {...drag}
    >
      <div className="b" />
    </div>
  );
}
