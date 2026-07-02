"use client";

import type { DrillLine, Point } from "@/lib/types";
import { LINE_COLORS, wavy } from "@/lib/drillDraw";
import { useDrill } from "./DrillProvider";

function toPts(path: Point[]): string {
  return path.map((p) => `${p.x.toFixed(1)},${(100 - p.y).toFixed(1)}`).join(" ");
}

function arrow(a: Point, b: Point, col: string, key: string) {
  const ax = a.x,
    ay = 100 - a.y,
    bx = b.x,
    by = 100 - b.y;
  const ang = Math.atan2(by - ay, bx - ax);
  const L = 3,
    W = 1.9;
  return (
    <polygon
      key={key}
      points={`${bx.toFixed(1)},${by.toFixed(1)} ${(
        bx - L * Math.cos(ang) + W * Math.sin(ang)
      ).toFixed(1)},${(by - L * Math.sin(ang) - W * Math.cos(ang)).toFixed(1)} ${(
        bx - L * Math.cos(ang) - W * Math.sin(ang)
      ).toFixed(1)},${(by - L * Math.sin(ang) + W * Math.cos(ang)).toFixed(1)}`}
      fill={col}
    />
  );
}

export default function DrillLines() {
  const drill = useDrill();
  const deleteMode = drill.tool === "delete";

  const renderLine = (l: DrillLine) => {
    if (l.path.length < 2) return null;
    const col = LINE_COLORS[l.kind];
    const drawPath = l.kind === "dribble" ? wavy(l.path, 1.6, 7) : l.path;
    const a = l.path[l.path.length - 2];
    const b = l.path[l.path.length - 1];
    return (
      <g key={l.id}>
        <polyline
          points={toPts(drawPath)}
          fill="none"
          stroke={col}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={l.kind === "pass" ? "3 2.2" : undefined}
        />
        {l.kind !== "line" && arrow(a, b, col, l.id + "a")}
        {deleteMode && (
          <polyline
            points={toPts(l.path)}
            fill="none"
            stroke="transparent"
            strokeWidth={5}
            style={{ pointerEvents: "stroke", cursor: "pointer" }}
            onClick={() => drill.removeLine(l.id)}
          />
        )}
      </g>
    );
  };

  return (
    <svg
      className="pathsvg routes"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ pointerEvents: deleteMode ? "auto" : "none", zIndex: 3 }}
    >
      {drill.doc.lines.map(renderLine)}
      {drill.tempLine && drill.tempLine.length > 1 && (
        <polyline
          points={toPts(drill.tempLine)}
          fill="none"
          stroke={
            drill.tool === "run" || drill.tool === "pass" || drill.tool === "dribble"
              ? LINE_COLORS[drill.tool]
              : "#caff3a"
          }
          strokeWidth={1}
          strokeDasharray="2 1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
