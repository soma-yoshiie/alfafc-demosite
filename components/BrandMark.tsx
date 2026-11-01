/**
 * ALFA FOOTBALL のブランドマーク（A＋ボール＋金の弧）。起動時のスプラッシュで使う。
 * 正本 specs/splash-brand.md §1。部品ごとに class（bm-silver / bm-gold / bm-arc / bm-ball）を付け、
 * 描く順番は CSS（.splash .bm-*）で決める。色はブランド色の生値（トークンにしない）。
 * viewBox は A の頂点 x=152 が箱の中央に近くなるようにずらしてある。
 */

const PENT = "0.0,-24.0 22.8,-7.4 14.1,19.4 -14.1,19.4 -22.8,-7.4";

/** ボールの黒い五角形 5 つ（中央の頂点の方向 −90°+72°k に距離 64、径方向に 0.65 に潰す） */
const PENTAGONS: { outer: string; rot: number }[] = [
  { outer: "translate(294 135) rotate(-90) translate(64 0) scale(0.65 1) rotate(90)", rot: 180 },
  { outer: "translate(294 135) rotate(-18) translate(64 0) scale(0.65 1) rotate(18)", rot: 252 },
  { outer: "translate(294 135) rotate(54) translate(64 0) scale(0.65 1) rotate(-54)", rot: 324 },
  { outer: "translate(294 135) rotate(126) translate(64 0) scale(0.65 1) rotate(-126)", rot: 36 },
  { outer: "translate(294 135) rotate(198) translate(64 0) scale(0.65 1) rotate(-198)", rot: 108 },
];

export default function BrandMark({
  className,
  uid = "bm",
}: {
  className?: string;
  /** グラデーション・clipPath の id の衝突回避用 */
  uid?: string;
}) {
  const clip = `url(#${uid}_clip)`;
  return (
    <svg
      className={className}
      viewBox="-85 0 510 400"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ALFA FOOTBALL"
    >
      <defs>
        <linearGradient id={`${uid}_silver`} gradientUnits="userSpaceOnUse" x1="152" y1="41" x2="40" y2="361">
          <stop offset="0" stopColor="#eef1ee" />
          <stop offset="1" stopColor="#c5cdc8" />
        </linearGradient>
        <linearGradient id={`${uid}_gold`} gradientUnits="userSpaceOnUse" x1="152" y1="41" x2="265" y2="361">
          <stop offset="0" stopColor="#d8b866" />
          <stop offset="1" stopColor="#b38935" />
        </linearGradient>
        <linearGradient id={`${uid}_arc`} gradientUnits="userSpaceOnUse" x1="219.8" y1="54.8" x2="393.7" y2="170.1">
          <stop offset="0" stopColor="#d4b562" />
          <stop offset="1" stopColor="#bd9a47" />
        </linearGradient>
        <radialGradient id={`${uid}_ball`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.75" stopColor="#f4f4f4" />
          <stop offset="1" stopColor="#d9dbda" />
        </radialGradient>
        <clipPath id={`${uid}_clip`}>
          <circle cx="294" cy="135" r="72" />
        </clipPath>
      </defs>

      {/* 銀の棒（左下→頂点）→ 金の棒（頂点→右下）→ 金の弧（左上→右下の時計回り）。d の向きが描く向き。
          弧は参考画像の金の画素に円を当てはめた値（中心 (304.4,116.1)・半径 104.4・太さ 15.6）。ボールとは同心ではない */}
      <path
        className="bm-silver"
        d="M40 361 L152 41"
        pathLength={1}
        stroke={`url(#${uid}_silver)`}
        strokeWidth="60"
        strokeLinecap="round"
        fill="none"
      />
      <path
        className="bm-gold"
        d="M152 41 L265 361"
        pathLength={1}
        stroke={`url(#${uid}_gold)`}
        strokeWidth="60"
        strokeLinecap="round"
        fill="none"
      />
      <path
        className="bm-arc"
        d="M219.8 54.8 A104.4 104.4 0 0 1 393.7 170.1"
        pathLength={1}
        stroke={`url(#${uid}_arc)`}
        strokeWidth="15.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* .bm-ball は CSS の transform アニメ（回りながら現れる）を持つので、参考に合わせた位置の補正は内側の <g> に入れる */}
      <g className="bm-ball">
        <g transform="translate(-0.5 -4.5)">
          <circle cx="294" cy="135" r="72" fill={`url(#${uid}_ball)`} stroke="#1b1c1e" strokeWidth="6" />
          <g clipPath={clip} fill="#1b1c1e">
            <polygon points="294.0,108.0 319.7,126.7 309.9,156.8 278.1,156.8 268.3,126.7" />
            {PENTAGONS.map((p) => (
              <g key={p.rot} transform={p.outer}>
                <polygon points={PENT} transform={`rotate(${p.rot})`} />
              </g>
            ))}
          </g>
          <g stroke="#1b1c1e" strokeWidth="4.5" strokeLinecap="round" fill="none" clipPath={clip}>
            <line x1="294.0" y1="108.0" x2="294.0" y2="86.6" />
            <line x1="319.7" y1="126.7" x2="340.0" y2="120.0" />
            <line x1="309.9" y1="156.8" x2="322.4" y2="174.2" />
            <line x1="278.1" y1="156.8" x2="265.6" y2="174.2" />
            <line x1="268.3" y1="126.7" x2="248.0" y2="120.0" />
          </g>
        </g>
      </g>
    </svg>
  );
}
