"use client";

import { useRef, useState } from "react";
import type React from "react";
import type { PlayLine, PlayLineKind, PlayPoint, Point } from "@/lib/types";
import { PLAY_KIND_LABEL } from "@/lib/types";
import { buildSlots } from "@/lib/formations";
import { simplify } from "@/lib/animation";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 編集中の選択ツール（点 or 軌道） */
export type PlayTool =
  | { mode: "point"; kind: PlayPoint["kind"] }
  | { mode: "line"; kind: PlayLineKind };

/** ピッチの装飾（センターライン・サークル・両PA） */
function Markings() {
  return (
    <div className="mpmk">
      <div className="mpline" />
      <div className="mpcircle" />
      <div className="mpbox top" />
      <div className="mpbox bot" />
    </div>
  );
}

/**
 * ① フォーメーション記録用ピッチ。
 * 自チームは下半分、相手は上半分（左右反転）に表示。自分のポジションはタップで選択。
 * BoardProvider に依存しない表示専用コンポーネント。
 */
export function FormationPitch({
  ownFormation,
  ownPositionIndex,
  onPickPosition,
  oppFormation,
}: {
  ownFormation: string;
  ownPositionIndex: number | null;
  onPickPosition?: (index: number) => void;
  oppFormation?: string;
}) {
  const own = buildSlots(ownFormation);
  const opp = oppFormation ? buildSlots(oppFormation) : [];
  return (
    <div className="mpitch">
      <Markings />
      {/* 相手（上・左右反転） */}
      {opp.map((s, i) => (
        <div
          key={"o" + i}
          className="mtok opp"
          style={{ left: 100 - s.x + "%", top: s.y * 0.46 + "%" }}
        >
          {s.role}
        </div>
      ))}
      {/* 自チーム（下） */}
      {own.map((s, i) => {
        const sel = i === ownPositionIndex;
        return (
          <button
            key={"m" + i}
            type="button"
            className={`mtok own${sel ? " sel" : ""}`}
            style={{ left: s.x + "%", top: 100 - s.y * 0.5 + "%" }}
            onClick={onPickPosition ? () => onPickPosition(i) : undefined}
          >
            {s.role}
          </button>
        );
      })}
    </div>
  );
}

/** 軌道をSVGで描画（点[%]→viewBox 0..100 × 0..133.33 で歪みなく描く） */
const VBH = 133.333;
function pathD(path: Point[]): string {
  return path.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${((100 - p.y) * VBH / 100).toFixed(1)}`).join(" ");
}
function PlayLinesSvg({ lines, temp }: { lines: PlayLine[]; temp: { kind: PlayLineKind; path: Point[] } | null }) {
  const all = temp && temp.path.length > 1 ? [...lines, temp] : lines;
  return (
    <svg className="mplines" viewBox={`0 0 100 ${VBH}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="mparrow" markerWidth="6" markerHeight="6" refX="4.2" refY="3" orient="auto">
          <path d="M0,0 L5,3 L0,6 z" fill="currentColor" />
        </marker>
      </defs>
      {all.map((l, i) => (
        <path key={i} className={`mpline-path ${l.kind}`} d={pathD(l.path)} markerEnd="url(#mparrow)" />
      ))}
    </svg>
  );
}

/**
 * ② プレーエリア記録用ピッチ。
 * 点ツール（受け/シュート/ミス）＝タップで点を追加、軌道ツール（ドリブル/パス/シュートコース）＝なぞって線を追加。
 * y:0自陣→100敵陣（上が敵陣）。
 */
export function PlayAreaPitch({
  points,
  lines = [],
  tool,
  onAddPoint,
  onAddLine,
}: {
  points: PlayPoint[];
  lines?: PlayLine[];
  tool?: PlayTool;
  onAddPoint?: (x: number, y: number) => void;
  onAddLine?: (path: Point[]) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const draw = useRef<{ active: boolean; pts: Point[]; moved: boolean }>({ active: false, pts: [], moved: false });
  const [temp, setTemp] = useState<Point[] | null>(null);
  const editable = !!tool && (!!onAddPoint || !!onAddLine);

  const toPct = (e: React.PointerEvent<HTMLDivElement>): Point | null => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return null;
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 2, 98);
    const y = clamp(100 - ((e.clientY - r.top) / r.height) * 100, 2, 98);
    return { x, y };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const p = toPct(e);
    if (!p) return;
    draw.current = { active: true, pts: [p], moved: false };
    if (tool!.mode === "line") {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      setTemp([p]);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = draw.current;
    if (!st.active || tool!.mode !== "line") return;
    const p = toPct(e);
    if (!p) return;
    const last = st.pts[st.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 2) {
      st.pts.push(p);
      st.moved = true;
      setTemp(st.pts.slice());
    }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = draw.current;
    if (!st.active) return;
    st.active = false;
    if (tool!.mode === "line") {
      setTemp(null);
      if (st.pts.length >= 2 && onAddLine) onAddLine(simplify(st.pts));
    } else {
      const p = toPct(e) ?? st.pts[0];
      if (onAddPoint) onAddPoint(p.x, p.y);
    }
  };

  return (
    <div
      className={`mpitch play${editable ? " editable" : ""}`}
      ref={ref}
      onPointerDown={editable ? onDown : undefined}
      onPointerMove={editable ? onMove : undefined}
      onPointerUp={editable ? onUp : undefined}
    >
      <Markings />
      <div className="mpgoalhint">敵陣 ↑</div>
      <PlayLinesSvg lines={lines} temp={temp && tool?.mode === "line" ? { kind: tool.kind, path: temp } : null} />
      {points.map((p, i) => (
        <span
          key={i}
          className={`mdot ${p.kind}`}
          style={{ left: p.x + "%", top: 100 - p.y + "%" }}
          title={PLAY_KIND_LABEL[p.kind]}
        />
      ))}
    </div>
  );
}
