"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * 個人ページ（PlayerHub）のグラフ部品（player-hub §4）。依存なしの SVG。
 * 既存の components/Charts.tsx（Y 軸が 0 始まり・X 軸が等間隔・小さいほど良い向きを持たない）は
 * 身長体重や走タイムに合わないので別に持つ。CSS は基底の .phub .tchart / .rchart / .sbars（.noteapp に依存しない）。
 * 文字を 12px 未満に縮めないため、コンテナの幅を測ってその幅のまま SVG を描く（viewBox で拡縮しない）。
 * 色はトークンのみ（--accent / --primary-dim / --mut / --danger）。
 */

/** SSR 時の警告を避けるための useLayoutEffect（AppFlow はクライアントだけだが念のため） */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** 要素の幅を測る（リサイズに追従）。測れるまでは fallback */
export function useWidth<T extends HTMLElement>(fallback: number): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(Math.round(cw));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 文字列の描画幅の概算（12px。ASCII は約 6.8px、全角は約 12px）。ラベルの重なり・はみ出しの回避に使う */
function textW(s: string, size = 12): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) < 256 ? size * 0.57 : size;
  return w;
}

/** 0.0 のような末尾ゼロを落とす（171.50 → 171.5） */
function trimNum(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** 見やすい目盛り（1・2・5 × 10^k）。lo〜hi の間に count 個ほど */
function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/* ===================== TrendChart ===================== */

export interface TrendPoint {
  /** date なら YYYY-MM-DD、category ならそのままラベルになる文字列 */
  x: string;
  y: number;
  /** ツールチップの先頭に添える名前（例: テスト名） */
  title?: string;
}
export interface TrendSeries {
  label: string;
  points: TrendPoint[];
  /** 既定 var(--accent) */
  color?: string;
}

/** "YYYY-MM-DD" → 時刻（ローカル 0 時）。壊れた文字列は NaN */
function dateMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : NaN;
}

function shortDate(s: string, withYear: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return withYear ? `${m[1]}/${Number(m[2])}` : `${Number(m[2])}/${Number(m[3])}`;
}
function fullDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : s;
}

export function TrendChart({
  series,
  reference,
  target,
  invert,
  unit = "",
  xKind,
  height = 176,
  domain,
  format,
  ariaLabel,
}: {
  series: TrendSeries[];
  /** 水平の参照線（破線。例: 全国平均） */
  reference?: { label: string; value: number };
  /** 水平の目標線（例: 目標合計） */
  target?: { label: string; value: number };
  /** true＝小さい値が上（走タイムなど「良い方が上」） */
  invert?: boolean;
  unit?: string;
  xKind: "date" | "category";
  height?: number;
  /** Y の範囲を固定する（出席率の 0〜100 など）。省略時は系列の min〜max に 10% の余白 */
  domain?: [number, number];
  /** 目盛りと値ラベルの整形（走タイムの「分秒」表記など） */
  format?: (v: number) => string;
  ariaLabel?: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(320);
  const [active, setActive] = useState<{ s: number; p: number } | null>(null);
  const fmt = format ?? trimNum;

  const geo = useMemo(() => {
    // 日付は実際の間隔を反映（Date.parse）、カテゴリは出てきた順に等間隔
    const prepared = series.map((s) => {
      const pts = s.points
        .map((p) => ({ ...p, t: xKind === "date" ? dateMs(p.x) : NaN }))
        .filter((p) => Number.isFinite(p.y) && (xKind === "category" || Number.isFinite(p.t)));
      if (xKind === "date") pts.sort((a, b) => a.t - b.t);
      return { ...s, points: pts };
    });
    const cats: string[] = [];
    if (xKind === "category") {
      prepared.forEach((s) => s.points.forEach((p) => cats.includes(p.x) || cats.push(p.x)));
    }
    const drawable = prepared.some((s) => s.points.length >= 2);
    const ys: number[] = [];
    prepared.forEach((s) => s.points.forEach((p) => ys.push(p.y)));
    if (reference) ys.push(reference.value);
    if (target) ys.push(target.value);
    if (ys.length === 0) return null;
    let lo: number;
    let hi: number;
    if (domain) {
      [lo, hi] = domain;
    } else {
      const mn = Math.min(...ys);
      const mx = Math.max(...ys);
      const span = mx - mn || Math.max(1, Math.abs(mx) * 0.1);
      lo = mn - span * 0.1;
      hi = mx + span * 0.1;
    }
    const ticks = niceTicks(lo, hi, 4);
    const ts: number[] = [];
    prepared.forEach((s) => s.points.forEach((p) => Number.isFinite(p.t) && ts.push(p.t)));
    return { prepared, cats, drawable, lo, hi, ticks, tMin: Math.min(...ts), tMax: Math.max(...ts) };
  }, [series, reference, target, domain, xKind]);

  if (!geo || !geo.drawable) return null;
  const { prepared, cats, lo, hi, ticks, tMin, tMax } = geo;

  const labelMax = Math.max(...ticks.map((t) => fmt(t).length), 3);
  const padL = Math.round(labelMax * 7 + 12);
  const pad = { l: padL, r: 16, t: 22, b: 28 };
  const pw = Math.max(40, W - pad.l - pad.r);
  const ph = height - pad.t - pad.b;
  const inner = 8; // 端の点が切れないための内側の余白
  const px = (p: { x: string; t: number }) => {
    let frac = 0.5;
    if (xKind === "date") frac = tMax > tMin ? (p.t - tMin) / (tMax - tMin) : 0.5;
    else frac = cats.length > 1 ? cats.indexOf(p.x) / (cats.length - 1) : 0.5;
    return pad.l + inner + frac * (pw - inner * 2);
  };
  const py = (v: number) => {
    const f = (v - lo) / (hi - lo || 1);
    return pad.t + (invert ? f : 1 - f) * ph;
  };

  // X の目盛りラベル：端と中間の数点（重ならない個数に絞る）
  const spanDays = xKind === "date" ? (tMax - tMin) / 86400000 : 0;
  const withYear = spanDays >= 150;
  const xs: { x: string; t: number; px: number; label: string }[] = [];
  const seen = new Set<string>();
  prepared.forEach((s) =>
    s.points.forEach((p) => {
      if (seen.has(p.x)) return;
      seen.add(p.x);
      xs.push({ x: p.x, t: p.t, px: px(p), label: xKind === "date" ? shortDate(p.x, withYear) : p.x });
    })
  );
  xs.sort((a, b) => a.px - b.px);
  const wMax = Math.max(...xs.map((q) => textW(q.label)), 24);
  const slots = Math.max(2, Math.floor(pw / (wMax + 14)));
  const pick = new Set<number>();
  if (xs.length <= slots) xs.forEach((_, i) => pick.add(i));
  else for (let i = 0; i < slots; i++) pick.add(Math.round((i * (xs.length - 1)) / (slots - 1)));
  const xLabels = xs.filter((_, i) => pick.has(i));

  const lineColor = (s: TrendSeries) => s.color ?? "var(--accent)";

  // ツールチップ（点にホバー／タップ）
  let tip: { x: number; y: number; w: number; text: string } | null = null;
  if (active) {
    const s = prepared[active.s];
    const p = s?.points[active.p];
    if (s && p) {
      const when = xKind === "date" ? fullDate(p.x) : p.x;
      const text = `${p.title ? p.title + " " : ""}${fmt(p.y)}${unit}（${when}）`;
      const w = textW(text) + 16;
      const cx = px(p);
      const cy = py(p.y);
      const x = Math.min(Math.max(cx - w / 2, 2), W - w - 2);
      tip = { x, y: cy - 38 < 0 ? cy + 12 : cy - 38, w, text };
    }
  }

  return (
    <div className="tchart" ref={ref}>
      <svg
        width={W}
        height={height}
        role="img"
        aria-label={ariaLabel ?? `${series.map((s) => s.label).join("・")}の推移`}
        onClick={() => setActive(null)}
      >
        {/* 目盛りと横罫 */}
        {ticks.map((t) => (
          <g key={t}>
            <line className="tc-grid" x1={pad.l} x2={W - pad.r} y1={py(t)} y2={py(t)} />
            <text className="tc-tick" x={pad.l - 6} y={py(t)} dy="0.35em" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* 参照線（破線）と目標線 */}
        {reference && (
          <line
            className="tc-ref"
            x1={pad.l}
            x2={W - pad.r}
            y1={py(reference.value)}
            y2={py(reference.value)}
            stroke="var(--mut)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}
        {target && (
          <line
            className="tc-target"
            x1={pad.l}
            x2={W - pad.r}
            y1={py(target.value)}
            y2={py(target.value)}
            stroke="var(--primary-dim)"
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        )}
        {/* X 軸ラベル */}
        {xLabels.map((q) => {
          const w = textW(q.label);
          const cx = Math.min(Math.max(q.px, w / 2), W - w / 2);
          return (
            <text key={q.x} className="tc-tick" x={cx} y={height - 8} textAnchor="middle">
              {q.label}
            </text>
          );
        })}
        {/* 系列の線・点 */}
        {prepared.map((s, si) => {
          if (s.points.length === 0) return null;
          const color = lineColor(s);
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${px(p).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");
          const last = s.points[s.points.length - 1];
          const lx = px(last);
          const nearRight = lx > W - 44;
          return (
            <g key={si}>
              {s.points.length >= 2 && (
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {s.points.map((p, pi) => {
                const isLast = pi === s.points.length - 1;
                return (
                  <circle
                    key={pi}
                    className="tc-dot"
                    cx={px(p)}
                    cy={py(p.y)}
                    r={3.5}
                    fill={isLast ? color : "var(--surface-lowest)"}
                    stroke={color}
                    strokeWidth={2}
                  />
                );
              })}
              {/* 最新の点の値ラベル（ツールチップを出している間は重ならないよう隠す） */}
              {!tip && (
                <text className="tc-val" x={lx} y={py(last.y) - 9} textAnchor={nearRight ? "end" : "middle"}>
                  {fmt(last.y)}
                  {unit}
                </text>
              )}
              {/* 当たり判定（指で押しやすいよう大きめ）。title はマウスのツールチップ */}
              {s.points.map((p, pi) => (
                <circle
                  key={"h" + pi}
                  cx={px(p)}
                  cy={py(p.y)}
                  r={16}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setActive({ s: si, p: pi })}
                  onMouseLeave={() => setActive(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive((cur) => (cur && cur.s === si && cur.p === pi ? null : { s: si, p: pi }));
                  }}
                >
                  <title>{`${p.title ? p.title + " " : ""}${fmt(p.y)}${unit}（${xKind === "date" ? fullDate(p.x) : p.x}）`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {tip && (
          <g className="tc-tip" pointerEvents="none">
            <rect x={tip.x} y={tip.y} width={tip.w} height={26} rx={6} fill="var(--ink)" />
            <text className="tc-tiptext" x={tip.x + 8} y={tip.y + 13} dy="0.35em">
              {tip.text}
            </text>
          </g>
        )}
      </svg>
      {/* 凡例（SVG の外に置く＝文字が縮まず、折り返せる） */}
      <div className="tchart-legend">
        {prepared.map((s, i) => (
          <span key={i} className="tl-item">
            <i className="tl-sw" style={{ background: lineColor(s) }} />
            {s.label}
          </span>
        ))}
        {reference && (
          <span className="tl-item">
            <i className="tl-sw dash" style={{ color: "var(--mut)" }} />
            {reference.label} {fmt(reference.value)}
            {unit}
          </span>
        )}
        {target && (
          <span className="tl-item">
            <i className="tl-sw dot" style={{ color: "var(--primary-dim)" }} />
            {target.label} {fmt(target.value)}
            {unit}
          </span>
        )}
        {invert && <span className="tl-item tl-note">上ほど良い記録</span>}
      </div>
    </div>
  );
}

/* ===================== SubjectBars ===================== */

export interface SubjectBarRow {
  label: string;
  /** 自分の点。未入力は null（棒を描かず「—」） */
  value: number | null;
  /** 満点（既定 100） */
  max?: number;
  /** 学年平均（細い線） */
  avg?: number | null;
  /** 目標（小さな三角） */
  target?: number | null;
}

/** 教科ごとの横棒：自分＝--accent の棒、平均＝--mut の細い線、目標＝小さな三角（100 点満点基準が既定） */
export function SubjectBars({ rows }: { rows: SubjectBarRow[] }) {
  return (
    <div className="sbars">
      {rows.map((r) => {
        const max = r.max && r.max > 0 ? r.max : 100;
        const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
        return (
          <div className="sbar" key={r.label}>
            <span className="sbar-l">{r.label}</span>
            <div
              className="sbar-track"
              role="img"
              aria-label={`${r.label} ${r.value ?? "未入力"}${r.avg != null ? `、平均 ${r.avg}` : ""}${r.target != null ? `、目標 ${r.target}` : ""}`}
            >
              {r.value != null && <div className="sbar-fill" style={{ width: `${pct(r.value)}%` }} />}
              {r.avg != null && <span className="sbar-avg" style={{ left: `${pct(r.avg)}%` }} title={`平均 ${r.avg}`} />}
              {r.target != null && <span className="sbar-tgt" style={{ left: `${pct(r.target)}%` }} title={`目標 ${r.target}`} />}
            </div>
            <span className="sbar-v">
              <b>{r.value ?? "—"}</b>
              {r.avg != null && <small>平均 {trimNum(r.avg)}</small>}
            </span>
          </div>
        );
      })}
      <div className="sbars-legend">
        <span className="tl-item">
          <i className="tl-sw" style={{ background: "var(--accent)" }} />
          自分の点
        </span>
        {rows.some((r) => r.avg != null) && (
          <span className="tl-item">
            <i className="tl-sw bar" style={{ background: "var(--mut)" }} />
            学年平均
          </span>
        )}
        {rows.some((r) => r.target != null) && (
          <span className="tl-item">
            <i className="tl-sw tri" />
            目標
          </span>
        )}
      </div>
    </div>
  );
}

/* ===================== RadarChart ===================== */

export interface RadarSeries {
  label: string;
  /** 0〜10（軸の数と同じ長さ。測っていない軸は 0） */
  values: number[];
  /** true＝塗る（最新）。false＝薄い線だけ（前回） */
  fill?: boolean;
}

/** 多角形のレーダー（8 軸など）。目盛りは 5 と 10 */
export function RadarChart({ axes, series, max = 10 }: { axes: string[]; series: RadarSeries[]; max?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(320);
  const n = axes.length;
  if (n < 3) return null;
  // ラベルが左右にはみ出さないよう、半径は「幅の半分 − 最長ラベル」から決める
  // （下限 32：名簿の 3 列で個人ページが 250px 前後になっても、左右のラベルが切れないように。player-hub §4）
  const labelW = Math.max(...axes.map((a) => textW(a)));
  const R = Math.max(32, Math.min(W / 2 - labelW - 14, 118));
  const H = Math.round(R * 2 + 56);
  const cx = W / 2;
  const cy = H / 2;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number) => {
    const r = (Math.max(0, Math.min(max, v)) / max) * R;
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
  };
  const poly = (vals: number[]) => axes.map((_, i) => pt(i, vals[i] ?? 0).map((q) => q.toFixed(1)).join(",")).join(" ");
  const ring = (v: number) => poly(axes.map(() => v));
  // 塗らない系列（前回）を先に、塗る系列（最新）を後に重ねる
  const ordered = [...series].sort((a, b) => Number(!!a.fill) - Number(!!b.fill));

  return (
    <div className="rchart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`${axes.join("・")}のレーダーチャート`}>
        {[max / 2, max].map((v) => (
          <polygon key={v} className="rc-ring" points={ring(v)} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, max);
          return <line key={i} className="rc-spoke" x1={cx} y1={cy} x2={x} y2={y} />;
        })}
        {[max / 2, max].map((v) => (
          <text key={"t" + v} className="tc-tick" x={cx + 4} y={cy - (v / max) * R + 12}>
            {v}
          </text>
        ))}
        {ordered.map((s, si) => (
          <g key={si}>
            <polygon
              points={poly(s.values)}
              fill={s.fill ? "var(--accent-tint-strong)" : "none"}
              stroke={s.fill ? "var(--accent)" : "var(--mut)"}
              strokeWidth={s.fill ? 2 : 1.5}
              strokeDasharray={s.fill ? undefined : "4 3"}
              strokeLinejoin="round"
            />
            {s.fill &&
              axes.map((a, i) => {
                const [x, y] = pt(i, s.values[i] ?? 0);
                return (
                  <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)">
                    <title>{`${a} ${s.values[i] ?? 0}点`}</title>
                  </circle>
                );
              })}
          </g>
        ))}
        {axes.map((a, i) => {
          const c = Math.cos(ang(i));
          const s = Math.sin(ang(i));
          const lx = cx + (R + 9) * c;
          const ly = cy + (R + 9) * s;
          return (
            <text
              key={a}
              className="rc-axis"
              x={lx}
              y={ly}
              dy={s < -0.5 ? "-0.1em" : s > 0.5 ? "0.95em" : "0.35em"}
              textAnchor={Math.abs(c) < 0.3 ? "middle" : c > 0 ? "start" : "end"}
            >
              {a}
            </text>
          );
        })}
      </svg>
      <div className="tchart-legend">
        {series.map((s, i) => (
          <span key={i} className="tl-item">
            <i
              className={`tl-sw${s.fill ? "" : " dash"}`}
              style={s.fill ? { background: "var(--accent)" } : { color: "var(--mut)" }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
