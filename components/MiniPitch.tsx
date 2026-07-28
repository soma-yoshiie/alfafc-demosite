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
/** 軌道の色（芝の上で見えるよう明色。ボタンの凡例・CSSと揃える） */
const LINE_COLOR: Record<PlayLineKind, string> = {
  dribble: "#4fc3f7",
  pass: "#ffffff",
  shot: "#ffd166",
};

function PlayLinesSvg({ lines, temp }: { lines: PlayLine[]; temp: { kind: PlayLineKind; path: Point[] } | null }) {
  const all: (PlayLine | { kind: PlayLineKind; path: Point[] })[] = temp && temp.path.length > 1 ? [...lines, temp] : lines;
  return (
    <svg className="mplines" viewBox={`0 0 100 ${VBH}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {(Object.keys(LINE_COLOR) as PlayLineKind[]).map((k) => (
          <marker key={k} id={`mparrow-${k}`} markerWidth="4.5" markerHeight="4.5" refX="3" refY="2.25" orient="auto">
            <path d="M0,0 L3.8,2.25 L0,4.5 z" fill={LINE_COLOR[k]} />
          </marker>
        ))}
      </defs>
      {all.map((l, i) => {
        const missed = "success" in l && l.success === false;
        const end = l.path[l.path.length - 1];
        return (
          <g key={i} opacity={missed ? 0.55 : undefined}>
            <path className={`mpline-path ${l.kind}`} d={pathD(l.path)} markerEnd={`url(#mparrow-${l.kind})`} />
            {missed && end && (
              <circle
                cx={end.x}
                cy={(100 - end.y) * VBH / 100}
                r={2.6}
                fill="none"
                stroke="#ff5b6e"
                strokeWidth={1.6}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * ② プレーエリア記録用ピッチ。
 * 点ツール（受けた/シュート/トラップミス）＝タップで点を追加、軌道ツール（ドリブル/パス）＝なぞって線を追加。
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

/* ===== ゴール正面図（シュートコース） ===== */
/** ゴール枠の座標（viewBox "0 0 100 50" 基準）。GoalCourseView と isInGoalFrame で共有 */
const GOAL_LEFT = 14;
const GOAL_RIGHT = 86;
const GOAL_TOP = 10;
const GOAL_BOTTOM = 46;

/** course座標(x:0-100 / y:0-100)がゴール枠内かどうか（yはviewBoxのy10〜46を0-100に正規化した範囲で判定） */
export function isInGoalFrame(x: number, y: number): boolean {
  return x >= GOAL_LEFT && x <= GOAL_RIGHT && y >= GOAL_TOP * 2 && y <= GOAL_BOTTOM * 2;
}

/** ゴール正面図。シュートコースの打点表示・記録（高さも表現できる） */
export function GoalCourseView({
  shots,
  onPick,
}: {
  shots: { course: Point; scored?: boolean; label?: number }[];
  onPick?: (x: number, y: number) => void;
}) {
  const editable = !!onPick;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
    const yHalf = clamp(((e.clientY - r.top) / r.height) * 50, 0, 50);
    onPick(x, yHalf * 2);
  };

  return (
    <div className={`goalview${editable ? " editable" : ""}`}>
      <svg viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" onClick={editable ? handleClick : undefined}>
        {/* 枠内グリッド */}
        {[26, 38, 50, 62, 74].map((gx) => (
          <line key={`v${gx}`} x1={gx} y1={GOAL_TOP} x2={gx} y2={GOAL_BOTTOM} stroke="rgba(21,35,60,0.14)" strokeWidth={0.5} />
        ))}
        {[19, 28, 37].map((gy) => (
          <line key={`h${gy}`} x1={GOAL_LEFT} y1={gy} x2={GOAL_RIGHT} y2={gy} stroke="rgba(21,35,60,0.14)" strokeWidth={0.5} />
        ))}
        {/* グラウンドライン */}
        <line x1={2} y1={GOAL_BOTTOM} x2={98} y2={GOAL_BOTTOM} stroke="var(--ink)" strokeWidth={1.5} />
        {/* ゴール枠（クロスバー＋両ポスト） */}
        <polyline
          points={`${GOAL_LEFT},${GOAL_BOTTOM} ${GOAL_LEFT},${GOAL_TOP} ${GOAL_RIGHT},${GOAL_TOP} ${GOAL_RIGHT},${GOAL_BOTTOM}`}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={2.5}
        />
        {/* シュート打点（ゴール=緑◯ / ノーゴール=赤◯） */}
        {shots.map((s, i) => {
          const color = s.scored === true ? "#2eb872" : "#ff5b6e";
          const cy = s.course.y / 2;
          return (
            <g key={i}>
              <circle cx={s.course.x} cy={cy} r={3.2} fill="none" stroke={color} strokeWidth={1.8} />
              {s.label != null && (
                <text x={s.course.x} y={cy} fontSize={3.5} fill={color} textAnchor="middle" dominantBaseline="central">
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
