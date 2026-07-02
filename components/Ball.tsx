"use client";

import { useCallback } from "react";
import { useBoard } from "./BoardProvider";
import { usePointerDrag } from "./usePointerDrag";

export default function Ball() {
  const board = useBoard();
  const { ball } = board.state;
  const drag = usePointerDrag("ball");
  const sel = board.mode === "anim" && board.selActor === "ball";

  const setRef = useCallback(
    (el: HTMLDivElement | null) => board.registerToken("ball", el),
    [board]
  );

  return (
    <div
      ref={setRef}
      className={`ball${sel ? " sel" : ""}`}
      style={{ left: `${ball.x}%`, top: `${100 - ball.y}%` }}
      {...drag}
    >
      <div className="b" />
    </div>
  );
}
