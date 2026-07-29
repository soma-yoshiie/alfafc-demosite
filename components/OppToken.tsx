"use client";

import { useCallback } from "react";
import type { Actor } from "@/lib/types";
import { yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";
import { usePointerDrag } from "./usePointerDrag";

/** 相手チームの簡易トークン（赤・番号のみ）。ドラッグ移動／アニメのルート描画に対応 */
export default function OppToken({ index }: { index: number }) {
  const board = useBoard();
  const actor = `opp${index}` as Actor;
  const o = (board.state.opponents ?? [])[index];
  const drag = usePointerDrag(actor);
  const sel = board.mode === "anim" && board.selActor === actor;
  // アニメ中は場面ごとの保持者、編集中は盤面の保持者を表示する
  const hasBall =
    board.mode === "anim"
      ? board.holderAtStep(board.activeStep) === actor
      : board.state.holder === actor;

  const { registerToken } = board;
  const setRef = useCallback(
    (el: HTMLDivElement | null) => registerToken(actor, el),
    [registerToken, actor]
  );

  if (!o) return null;
  return (
    <div
      ref={setRef}
      className={`tok opp${sel ? " sel" : ""}`}
      style={{ left: `${o.x}%`, top: `${yToTop(o.y, board.state.pitchView)}%` }}
      {...drag}
    >
      <div className={`disc oppdisc${hasBall ? " hasball" : ""}`}>{o.label}</div>
    </div>
  );
}
