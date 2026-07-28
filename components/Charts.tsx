"use client";

// 依存なしのSVG折れ線チャート（面塗り+グリッド。分析サイト風）
export function LineChart({
  data,
  max,
  detailed = false,
  secondary,
  primaryLabel = "自分",
}: {
  data: { label?: string; value: number }[];
  max?: number;
  /** true: ドット+値ラベル付きの詳細表示（分析ビュー用）。false: クリーン表示 */
  detailed?: boolean;
  /** 第2系列（破線・凡例付き）例: チーム平均 */
  secondary?: { label: string; values: number[] };
  primaryLabel?: string;
}) {
  const n = data.length;
  if (n < 2) return null;

  const step = 34;
  const w = n * step;
  const m =
    max ??
    Math.max(1, ...data.map((d) => d.value), ...(secondary ? secondary.values : []));

  const points = data.map((d, i) => {
    const x = step / 2 + i * step;
    const y = 84 - (d.value / m) * 68;
    return { x, y, d };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${linePoints} ${points[n - 1].x},84 ${points[0].x},84`;

  const secondaryPoints = secondary
    ? secondary.values
        .map((v, i) => {
          const x = step / 2 + i * step;
          const y = 84 - (v / m) * 68;
          return `${x},${y}`;
        })
        .join(" ")
    : null;

  return (
    <div className="chart-line">
      <svg viewBox={`0 0 ${w} 112`}>
        <line className="clg" x1={0} y1={16} x2={w} y2={16} />
        <line className="clg" x1={0} y1={50} x2={w} y2={50} />
        <line className="clg" x1={0} y1={84} x2={w} y2={84} />
        <polygon className="cla" points={areaPoints} />
        {secondaryPoints && <polyline className="cl2" points={secondaryPoints} />}
        <polyline className="cl" points={linePoints} />
        {points.map((p, i) => (
          <g key={i}>
            {detailed && (
              <>
                <circle className="clp" cx={p.x} cy={p.y} r={2.2} />
                {i === n - 1 && <circle className="clp" cx={p.x} cy={p.y} r={3.4} />}
                <text className="clv" x={p.x} y={p.y - 7} textAnchor="middle">
                  {p.d.value}
                </text>
              </>
            )}
            {p.d.label !== undefined && (
              <text className="cll" x={p.x} y={101} textAnchor="middle">
                {p.d.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {secondary && (
        <div className="cl-legend">
          <span className="lg1">— {primaryLabel}</span>
          <span className="lg2">--- {secondary.label}</span>
        </div>
      )}
    </div>
  );
}

/** 多系列折れ線（Y軸目盛+グリッド+細線。案Dのメインチャート） */
export function MultiLine({
  series,
  labels,
  max,
}: {
  series: { label: string; color: string; values: number[] }[];
  /** X軸ラベル（週の M/D）。系列と同じ長さ */
  labels: string[];
  max?: number;
}) {
  const n = labels.length;
  if (n < 2 || series.length === 0) return null;

  const x0 = 42;
  const x1 = 510;
  const y0 = 20;
  const y1 = 140;
  const m = Math.max(1, max ?? Math.max(1, ...series.flatMap((s) => s.values)));

  const xAt = (i: number) => x0 + (i * (x1 - x0)) / (n - 1);
  const yAt = (v: number) => y1 - (v / m) * (y1 - y0);

  // 目盛り: max, 2/3, 1/3, 0（丸めて表示。重複値は間引き）
  const rawTicks = [
    { y: y0, v: Math.round(m) },
    { y: y0 + (y1 - y0) / 3, v: Math.round((m * 2) / 3) },
    { y: y0 + ((y1 - y0) * 2) / 3, v: Math.round(m / 3) },
    { y: y1, v: 0 },
  ];
  const seen = new Set<number>();
  const ticks = rawTicks.filter((t) => (seen.has(t.v) ? false : (seen.add(t.v), true)));

  return (
    <div className="mlchart">
      <svg viewBox="0 0 520 190">
        <line className="gr" x1={x0} y1={20} x2={x1} y2={20} />
        <line className="gr" x1={x0} y1={60} x2={x1} y2={60} />
        <line className="gr" x1={x0} y1={100} x2={x1} y2={100} />
        <line className="gr" x1={x0} y1={140} x2={x1} y2={140} />
        {ticks.map((t, i) => (
          <text key={i} x={x0 - 8} y={t.y + 3} textAnchor="end">
            {t.v}
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ")}
          />
        ))}
        {labels.map(
          (l, i) =>
            i % 2 === 0 && (
              <text key={i} x={xAt(i)} y={158} textAnchor="middle">
                {l}
              </text>
            )
        )}
      </svg>
    </div>
  );
}

/** KPIタイル用の極小スパークライン（線のみ） */
export function Sparkline({ values }: { values: number[] }) {
  const n = values.length;
  if (n < 2) return null;

  const m = Math.max(1, ...values);
  const step = n > 1 ? 96 / (n - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = 2 + i * step;
      const y = 23 - (v / m) * 20;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="spark">
      <svg viewBox="0 0 100 26">
        <polyline className="sp" points={points} />
      </svg>
    </div>
  );
}
