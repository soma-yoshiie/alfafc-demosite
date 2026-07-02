"use client";

import { useBoard } from "./BoardProvider";

export default function StatBar() {
  const board = useBoard();
  const { slots, players } = board.state;
  const total = slots.length;
  const filled = slots.filter((s) => s.pid != null).length;
  const inXi = new Set(slots.map((s) => s.pid).filter(Boolean));
  const bench = players.filter((p) => !inXi.has(p.id)).length;

  return (
    <div className="statbar">
      <div className="stat">
        <div className="k">スタメン</div>
        <div className="v">
          {filled}
          <small>/{total}</small>
        </div>
      </div>
      <div className="stat">
        <div className="k">控え</div>
        <div className="v">
          {bench}
          <small>人</small>
        </div>
      </div>
      <div className="stat">
        <div className="k">登録選手</div>
        <div className="v">
          {players.length}
          <small>人</small>
        </div>
      </div>
    </div>
  );
}
