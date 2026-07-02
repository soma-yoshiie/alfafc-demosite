"use client";

import { useBoard } from "./BoardProvider";
import PlayerToken from "./PlayerToken";
import Ball from "./Ball";
import PathLayer from "./PathLayer";

export default function Pitch() {
  const board = useBoard();
  const filled = board.state.slots.filter((s) => s.pid != null).length;
  const showHint = board.mode === "edit" && filled === 0;

  return (
    <div className="pitchwrap">
      <div className="pitch" ref={board.pitchRef}>
        <div className="markings">
          <div className="mk center-line" />
          <div className="mk center-circle" />
          <div className="mk spot" />
          <div className="mk box-top" />
          <div className="mk box-top-s" />
          <div className="mk box-bot" />
          <div className="mk box-bot-s" />
        </div>

        <PathLayer />

        {board.state.slots.map((_, i) => (
          <PlayerToken key={i} index={i} />
        ))}
        <Ball />

        {showHint && (
          <div className="hint">
            空きの ◯ をタップして選手を配置
            <br />
            配置後はドラッグで微調整・重ねると入れ替え
          </div>
        )}
      </div>
    </div>
  );
}
