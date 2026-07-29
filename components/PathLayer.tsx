"use client";

// ルート（矢印）レイヤー。
// 線種：ラン=実線 / パス=破線 / ドリブル=波線（戦術図の標準記法）。
// 現在編集中の場面のルートを強調し、他の場面は薄く表示する。

import { useEffect, useReducer } from "react";
import { alongPath, orderRank, pathLen } from "@/lib/animation";
import { actorColor } from "@/lib/colors";
import type { Actor, Move, Point, PitchViewMode } from "@/lib/types";
import { moveKind } from "@/lib/types";
import { yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";

function arrowHead(a: Point, b: Point, col: string, key: string, view: PitchViewMode | undefined) {
  const ax = a.x,
    ay = yToTop(a.y, view),
    bx = b.x,
    by = yToTop(b.y, view);
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
      )} ${x2.toFixed(1)},${y2.toFixed(2)}`}
      fill={col}
    />
  );
}

/** シュート用：2点直線を法線方向に±0.55オフセットした平行2本の点列文字列を返す（二重線） */
function shotLines(path: Point[], view: PitchViewMode | undefined): [string, string] {
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = 0.55;
  const toStr = (p: Point) => `${p.x.toFixed(1)},${yToTop(p.y, view).toFixed(1)}`;
  const line = (s: number) =>
    `${toStr({ x: a.x + nx * s, y: a.y + ny * s })} ${toStr({ x: b.x + nx * s, y: b.y + ny * s })}`;
  return [line(off), line(-off)];
}

/** ドリブル用：ルートに沿って直交方向に揺らした波線の点列を作る */
function wavyPoints(path: Point[], view: PitchViewMode | undefined): string {
  const L = pathLen(path);
  if (L === 0) return "";
  const n = Math.max(10, Math.round(L / 1.1));
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const a = alongPath(path, p);
    const b = alongPath(path, Math.min(1, p + 0.02));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    // 始点・終点は揺らさない（矢頭と繋がりを保つ）
    const edge = i === 0 || i === n ? 0 : 1;
    const off = Math.sin(((p * L) / 2.6) * Math.PI) * 0.9 * edge;
    const x = a.x - dy * off;
    const y = a.y + dx * off;
    out.push(`${x.toFixed(1)},${yToTop(y, view).toFixed(1)}`);
  }
  return out.join(" ");
}

export default function PathLayer() {
  const board = useBoard();
  // 記録中の一時ルートは ref + 購読で再描画（トークンは再描画しない）
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => board.subscribeTempDraw(force), [board]);

  if (board.mode !== "anim") return <svg className="pathsvg routes" />;

  const { moves, slots, pitchView: view } = board.state;
  const tempDraw = board.tempDrawRef.current;

  const isSel = (m: Move, i: number) =>
    (board.selMove &&
      board.selMove.actor === m.actor &&
      board.selMove.step === (m.step ?? 0)) ||
    (board.selActor != null &&
      m.actor === board.selActor &&
      (m.step ?? 0) === board.activeStep) ||
    false;

  const renderMove = (m: Move, i: number) => {
    if (m.path.length < 2) return null;
    const col = actorColor(m.actor, slots);
    const sel = isSel(m, i);
    const inStep = (m.step ?? 0) === board.activeStep;
    const kind = moveKind(m);
    const pts =
      kind === "dribble"
        ? wavyPoints(m.path, view)
        : m.path
            .map((p) => `${p.x.toFixed(1)},${yToTop(p.y, view).toFixed(1)}`)
            .join(" ");
    const st = m.path[0];
    const n = orderRank(moves, m);
    const alpha = inStep ? (sel ? 1 : 0.85) : 0.22;
    const shotPts = kind === "shot" ? shotLines(m.path, view) : null;
    return (
      <g key={`${String(m.actor)}-${m.step ?? 0}`} opacity={alpha}>
        {shotPts ? (
          <>
            <polyline
              points={shotPts[0]}
              fill="none"
              stroke={col}
              strokeWidth={sel ? 1.1 : 0.8}
              strokeLinecap="round"
            />
            <polyline
              points={shotPts[1]}
              fill="none"
              stroke={col}
              strokeWidth={sel ? 1.1 : 0.8}
              strokeLinecap="round"
            />
          </>
        ) : (
          <polyline
            points={pts}
            fill="none"
            stroke={col}
            strokeWidth={sel ? 1.1 : 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={kind === "pass" ? "2.4 1.6" : undefined}
          />
        )}
        {arrowHead(m.path[m.path.length - 2], m.path[m.path.length - 1], col, `a${i}`, view)}
        {inStep && (
          <>
            <circle
              cx={st.x.toFixed(1)}
              cy={yToTop(st.y, view).toFixed(1)}
              r={2.7}
              fill={col}
              stroke="#0a0e0c"
              strokeWidth={0.4}
            />
            <text
              x={st.x.toFixed(1)}
              y={(yToTop(st.y, view) + 1).toFixed(1)}
              textAnchor="middle"
              style={{ font: "800 3px Manrope, sans-serif" }}
              fill="#0a0e0c"
            >
              {n}
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <svg
      className="pathsvg routes"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {/* 他の場面（薄く）→ 現在の場面（前面）」の順で描く */}
      {moves.map((m, i) => ((m.step ?? 0) !== board.activeStep ? renderMove(m, i) : null))}
      {moves.map((m, i) => ((m.step ?? 0) === board.activeStep ? renderMove(m, i) : null))}
      {tempDraw && tempDraw.pts.length > 1 && (
        <polyline
          points={tempDraw.pts
            .map((p) => `${p.x.toFixed(1)},${yToTop(p.y, view).toFixed(1)}`)
            .join(" ")}
          fill="none"
          stroke={actorColor(tempDraw.actor as Actor, slots)}
          strokeWidth={1}
          strokeDasharray="2 1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
