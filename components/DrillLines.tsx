"use client";

import { useRef } from "react";
import type React from "react";
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
  const selectable = drill.tool === null;
  const drag = useRef({
    id: null as string | null,
    sx: 0,
    sy: 0,
    orig: [] as Point[],
    moved: false,
    began: false,
    rect: null as DOMRect | null,
  });

  const onLinePointerDown = (l: DrillLine) => (e: React.PointerEvent<SVGPolylineElement>) => {
    if (!selectable) return;
    e.stopPropagation();
    drill.select({ type: "line", id: l.id });
    const st = drag.current;
    st.id = l.id;
    st.sx = e.clientX;
    st.sy = e.clientY;
    st.orig = l.path.map((p) => ({ ...p }));
    st.moved = false;
    st.began = false;
    st.rect = drill.getPitchRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onLinePointerMove = (e: React.PointerEvent<SVGPolylineElement>) => {
    const st = drag.current;
    if (!st.id || !st.rect) return;
    if (Math.abs(e.clientX - st.sx) > 4 || Math.abs(e.clientY - st.sy) > 4)
      st.moved = true;
    if (!st.moved) return;
    if (!st.began) {
      drill.beginGesture();
      st.began = true;
    }
    const dx = ((e.clientX - st.sx) / st.rect.width) * 100;
    const dy = -((e.clientY - st.sy) / st.rect.height) * 100;
    drill.translateLineLive(st.id, dx, dy, st.orig);
  };

  const onLinePointerUp = () => {
    drag.current.id = null;
  };

  const renderLine = (l: DrillLine) => {
    if (l.path.length < 2) return null;
    const col = LINE_COLORS[l.kind];
    const drawPath = l.kind === "dribble" ? wavy(l.path, 1.6, 7) : l.path;
    const a = l.path[l.path.length - 2];
    const b = l.path[l.path.length - 1];
    const selected = drill.selection?.type === "line" && drill.selection.id === l.id;
    return (
      <g key={l.id}>
        {selected && (
          <polyline
            points={toPts(drawPath)}
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
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
        {selectable && (
          <polyline
            points={toPts(l.path)}
            fill="none"
            stroke="transparent"
            strokeWidth={6}
            style={{ pointerEvents: "stroke", cursor: selected ? "move" : "pointer", touchAction: "none" }}
            onPointerDown={onLinePointerDown(l)}
            onPointerMove={onLinePointerMove}
            onPointerUp={onLinePointerUp}
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
      style={{ pointerEvents: "none", zIndex: 3 }}
    >
      {drill.doc.lines.filter((l) => (l.step ?? 0) === drill.scene).map(renderLine)}
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
