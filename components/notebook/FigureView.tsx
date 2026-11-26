"use client";

import { useEffect, useRef, useState } from "react";
import type { FigLineKind, FigMarkKind, NoteFigure } from "@/lib/types";
import { FIG_M, FIG_W, UNDERLAYS } from "@/lib/figures";
import { PitchMarkings, WAVE_K, arrowPoints, ptsD } from "../MiniPitch";
import { wavy } from "@/lib/drillDraw";

/* note-reflection-figure §3-1: 図の表示。紙の色（白地）に、ピッチの線は var(--outline-strong)。
   選手が描いた物は var(--ink)、スタッフ（by:"staff"）は var(--accent) */

const INK = "var(--ink)";
const STAFF = "var(--accent)";
const SCALE = FIG_M / FIG_W; // 図の単位 → m
const toMx = (v: number) => v * SCALE - 3;

const WIDTH: Record<FigLineKind, number> = { pen: 0.42, pass: 0.45, dribble: 0.45, run: 0.3, shot: 0.66 };

/** ペンは隣り合う点の中点を通る 2 次曲線で滑らかにつなぐ */
function smoothD(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}h0.01`;
  if (pts.length === 2) return ptsD(pts);
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += `Q${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${f(last.x)} ${f(last.y)}`;
}

export function FigLine({ k, p, staff }: { k: FigLineKind; p: number[]; staff?: boolean }) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) pts.push({ x: toMx(p[i]), y: toMx(p[i + 1]) });
  if (pts.length === 0) return null;
  const color = staff ? STAFF : INK;
  const common = { fill: "none", stroke: color, strokeWidth: WIDTH[k], strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k === "pen") return <path d={smoothD(pts)} {...common} />;
  const drawn =
    k === "dribble"
      ? wavy(pts.map((q) => ({ x: q.x * WAVE_K, y: q.y * WAVE_K })), 0.85 * WAVE_K, 3.3 * WAVE_K).map((q) => ({
          x: q.x / WAVE_K,
          y: q.y / WAVE_K,
        }))
      : pts;
  const arrow = arrowPoints(pts);
  return (
    <g>
      <path
        d={ptsD(drawn)}
        {...common}
        strokeDasharray={k === "pass" ? "1.45 1.05" : undefined}
        strokeLinecap={k === "pass" ? "butt" : "round"}
      />
      {arrow && <polygon points={arrow} fill={color} stroke="none" />}
    </g>
  );
}

export function FigMark({ k, x, y, staff }: { k: FigMarkKind; x: number; y: number; staff?: boolean }) {
  const color = staff ? STAFF : INK;
  const cx = toMx(x);
  const cy = toMx(y);
  if (k === "me") return <circle cx={cx} cy={cy} r={1.7} fill={color} />;
  if (k === "mate") return <circle cx={cx} cy={cy} r={1.65} fill="var(--surface-lowest)" stroke={color} strokeWidth={0.45} />;
  if (k === "opp")
    return (
      <polygon
        points={`${cx},${cy - 2} ${cx - 1.9},${cy + 1.5} ${cx + 1.9},${cy + 1.5}`}
        fill="var(--surface-lowest)"
        stroke={color}
        strokeWidth={0.45}
        strokeLinejoin="round"
      />
    );
  return <circle cx={cx} cy={cy} r={0.95} fill={color} stroke="var(--surface-lowest)" strokeWidth={0.35} />;
}

/** 図の SVG（下敷き＋描いた物）。pxWidth＝画面上の幅（文字を 12px にするため） */
export function FigureSvg({
  fig,
  pxWidth,
  extra,
  svgRef,
  thumb,
}: {
  fig: NoteFigure;
  pxWidth: number;
  /** 下敷きを選ぶシートの小さな図：縮小しても線が見える太さにする */
  thumb?: boolean;
  /** 描きかけの線など、上に重ねる物（m の座標系） */
  extra?: React.ReactNode;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const u = UNDERLAYS[fig.underlay];
  const fs = (12 * FIG_M) / Math.max(120, pxWidth);
  return (
    <svg
      ref={svgRef}
      viewBox={`-3 -3 ${FIG_M} ${u.vbH}`}
      style={{ display: "block", width: "100%", aspectRatio: `${FIG_M} / ${u.vbH}` }}
      role="img"
      aria-label="図"
    >
      <rect x={-3} y={-3} width={FIG_M} height={u.vbH} fill="var(--surface-lowest)" />
      {fig.underlay !== "blank" && (
        // 承認図の線は var(--outline-strong) より濃い灰色。既存の --mut を薄めて使う（新しいトークンは足さない）
        <g opacity={thumb ? 0.75 : 0.6}>
          <PitchMarkings paint={{ stroke: "var(--mut)", width: thumb ? 0.8 : 0.31 }} />
        </g>
      )}
      {fig.lines.map((l, i) => (
        <FigLine key={"l" + i} k={l.k} p={l.p} staff={l.by === "staff"} />
      ))}
      {fig.marks.map((m, i) => (
        <FigMark key={"m" + i} k={m.k} x={m.x} y={m.y} staff={m.by === "staff"} />
      ))}
      {fig.texts.map((t, i) => (
        <text
          key={"t" + i}
          x={toMx(t.x)}
          y={toMx(t.y)}
          fontSize={fs}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
          fill={t.by === "staff" ? STAFF : INK}
          stroke="var(--surface-lowest)"
          strokeWidth={fs * 0.25}
          paintOrder="stroke"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {t.t}
        </text>
      ))}
      {extra}
    </svg>
  );
}

/** 親の幅を測る */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(358);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setW(el.getBoundingClientRect().width || 358);
    upd();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 図の箱（表示）。幅は親いっぱい（最大 358px） */
export function FigureView({ fig, className, thumb }: { fig: NoteFigure; className?: string; thumb?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className={"figview" + (className ? " " + className : "")}>
      <FigureSvg fig={fig} pxWidth={w} thumb={thumb} />
    </div>
  );
}
