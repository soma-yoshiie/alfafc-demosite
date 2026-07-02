"use client";

import { useEffect, useReducer } from "react";
import { groupOf } from "@/lib/formations";
import { orderRank } from "@/lib/animation";
import type { Actor, Point } from "@/lib/types";
import { useBoard } from "./BoardProvider";

const COLORS: Record<string, string> = {
  gk: "#ffd166",
  df: "#4fc3f7",
  mf: "#caff3a",
  fw: "#ff8a65",
  ball: "#ffffff",
};

function actorColor(actor: Actor, roleOf: (a: Actor) => string): string {
  if (actor === "ball") return COLORS.ball;
  return COLORS[roleOf(actor)] ?? COLORS.mf;
}

function arrowHead(a: Point, b: Point, col: string, key: string) {
  const ax = a.x,
    ay = 100 - a.y,
    bx = b.x,
    by = 100 - b.y;
  const ang = Math.atan2(by - ay, bx - ax);
  const Lh = 2.6,
    W = 1.6;
  const x1 = bx - Lh * Math.cos(ang) + W * Math.sin(ang);
  const y1 = by - Lh * Math.sin(ang) - W * Math.cos(ang);
  const x2 = bx - Lh * Math.cos(ang) - W * Math.sin(ang);
  const y2 = by - Lh * Math.sin(ang) + W * Math.cos(ang);
  return (
    <polygon
      key={key}
      points={`${bx.toFixed(1)},${by.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(
        1
      )} ${x2.toFixed(1)},${y2.toFixed(1)}`}
      fill={col}
    />
  );
}

export default function PathLayer() {
  const board = useBoard();
  // 記録中の一時ルートは ref + 購読で再描画（トークンは再描画しない）
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => board.subscribeTempDraw(force), [board]);

  if (board.mode !== "anim") return <svg className="pathsvg routes" />;

  const { moves, slots } = board.state;
  const tempDraw = board.tempDrawRef.current;
  const roleOf = (a: Actor): string =>
    a === "ball" ? "ball" : groupOf(slots[a as number].role);

  return (
    <svg
      className="pathsvg routes"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {moves.map((m, i) => {
        if (m.path.length < 2) return null;
        const col = actorColor(m.actor, roleOf);
        const sel = m.actor === board.selActor;
        const pts = m.path
          .map((p) => `${p.x.toFixed(1)},${(100 - p.y).toFixed(1)}`)
          .join(" ");
        const st = m.path[0];
        const n = orderRank(moves, m);
        return (
          <g key={i}>
            <polyline
              points={pts}
              fill="none"
              stroke={col}
              strokeWidth={sel ? 1 : 0.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={sel ? 1 : 0.8}
              strokeDasharray={sel ? undefined : "2 1.4"}
            />
            {arrowHead(m.path[m.path.length - 2], m.path[m.path.length - 1], col, `a${i}`)}
            <circle
              cx={st.x.toFixed(1)}
              cy={(100 - st.y).toFixed(1)}
              r={2.7}
              fill={col}
              stroke="#0a0e0c"
              strokeWidth={0.4}
            />
            <text
              x={st.x.toFixed(1)}
              y={(100 - st.y + 1).toFixed(1)}
              textAnchor="middle"
              style={{ font: "800 3px Manrope, sans-serif" }}
              fill="#0a0e0c"
            >
              {n}
            </text>
          </g>
        );
      })}
      {tempDraw && tempDraw.pts.length > 1 && (
        <polyline
          points={tempDraw.pts
            .map((p) => `${p.x.toFixed(1)},${(100 - p.y).toFixed(1)}`)
            .join(" ")}
          fill="none"
          stroke={actorColor(tempDraw.actor, roleOf)}
          strokeWidth={1}
          strokeDasharray="2 1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
