"use client";

import { useRef } from "react";
import type React from "react";
import type { DrillItem } from "@/lib/types";
import { useDrill } from "./DrillProvider";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function DrillItemView({ item }: { item: DrillItem }) {
  const drill = useDrill();
  const interactive = drill.tool === "move" || drill.tool === "delete";
  const d = useRef({
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
    nx: 0,
    ny: 0,
    moved: false,
    rect: null as DOMRect | null,
    active: false,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    e.stopPropagation();
    const st = d.current;
    st.sx = e.clientX;
    st.sy = e.clientY;
    st.ox = item.x;
    st.oy = item.y;
    st.nx = item.x;
    st.ny = item.y;
    st.moved = false;
    st.rect = drill.getPitchRect();
    st.active = true;
    if (drill.tool === "move") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.currentTarget.classList.add("drag");
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = d.current;
    if (!st.active || drill.tool !== "move" || !st.rect) return;
    if (Math.abs(e.clientX - st.sx) > 4 || Math.abs(e.clientY - st.sy) > 4)
      st.moved = true;
    const nx = clamp(st.ox + ((e.clientX - st.sx) / st.rect.width) * 100, 2, 98);
    const ny = clamp(st.oy - ((e.clientY - st.sy) / st.rect.height) * 100, 2, 98);
    st.nx = nx;
    st.ny = ny;
    e.currentTarget.style.left = nx + "%";
    e.currentTarget.style.top = 100 - ny + "%";
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = d.current;
    if (!st.active) return;
    st.active = false;
    e.currentTarget.classList.remove("drag");
    if (drill.tool === "delete") {
      drill.removeItem(item.id);
      return;
    }
    if (drill.tool === "move") {
      if (st.moved) drill.moveItem(item.id, st.nx, st.ny);
      else if (item.kind === "goal") drill.rotateItem(item.id); // タップで向き変更
    }
  };

  let inner: React.ReactNode = null;
  if (item.kind === "cone") inner = <div className="d-cone" />;
  else if (item.kind === "player")
    inner = <div className="d-disc d-player">{item.label ?? ""}</div>;
  else if (item.kind === "oppo")
    inner = <div className="d-disc d-oppo">{item.label ?? ""}</div>;
  else if (item.kind === "ball") inner = <div className="d-ball" />;
  else if (item.kind === "goal")
    inner = (
      <div className="d-goal" style={{ transform: `rotate(${item.rot ?? 0}deg)` }} />
    );
  else if (item.kind === "marker") inner = <div className="d-marker" />;

  return (
    <div
      className={`ditem${drill.tool === "delete" ? " deletable" : ""}`}
      style={{
        left: `${item.x}%`,
        top: `${100 - item.y}%`,
        pointerEvents: interactive ? "auto" : "none",
        cursor: drill.tool === "move" ? "grab" : drill.tool === "delete" ? "pointer" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {inner}
    </div>
  );
}
