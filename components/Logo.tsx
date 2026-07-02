"use client";

/** ALFA FOOTBALL のロゴマーク（A＋ボール）。splash/login で使用 */
export default function LogoMark({
  className,
  pitch = false,
  uid = "lm",
}: {
  className?: string;
  /** 背景に戦術ボードの薄いマーキングを描く */
  pitch?: boolean;
  /** グラデーションIDの衝突回避用 */
  uid?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ALFA FOOTBALL"
    >
      <defs>
        <linearGradient id={`${uid}_silver`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c4ccc6" />
        </linearGradient>
        <linearGradient id={`${uid}_gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d680" />
          <stop offset="1" stopColor="#a9802f" />
        </linearGradient>
        <radialGradient id={`${uid}_ball`} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#dfe4df" />
          <stop offset="1" stopColor="#aab0aa" />
        </radialGradient>
      </defs>

      {pitch && (
        <>
          <g className="lm-pitch" stroke="#caa84a" strokeWidth="1.2" fill="none" opacity="0.18">
            <rect x="74" y="6" width="52" height="26" />
            <line x1="6" y1="100" x2="194" y2="100" />
            <circle cx="100" cy="100" r="32" />
          </g>
          <g className="lm-marks" stroke="#8a8f8a" strokeWidth="2" opacity="0.2" strokeLinecap="round">
            <path d="M34 56 l10 10 M44 56 l-10 10" />
            <path d="M156 150 l10 10 M166 150 l-10 10" />
            <circle cx="40" cy="128" r="6" fill="none" />
            <circle cx="166" cy="70" r="6" fill="none" />
          </g>
          <g className="lm-arrow" stroke="#caa84a" strokeWidth="1.8" fill="none" opacity="0.4" strokeDasharray="4 4">
            <path d="M28 152 q16 -58 48 -58" />
          </g>
        </>
      )}

      {/* A */}
      <g className="lm-a" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M100 46 L62 166" stroke={`url(#${uid}_silver)`} strokeWidth="20" />
        <path d="M100 46 L138 166" stroke={`url(#${uid}_gold)`} strokeWidth="20" />
        <path d="M76 126 L124 126" stroke={`url(#${uid}_silver)`} strokeWidth="16" />
      </g>

      {/* ボール */}
      <g className="lm-ball">
        <path
          d="M120 50 A 34 34 0 0 1 176 92"
          stroke={`url(#${uid}_gold)`}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="142" cy="78" r="25" fill={`url(#${uid}_ball)`} stroke="#0a0e0c" strokeWidth="3" />
        <polygon points="142,70 150,76 147,86 137,86 134,76" fill="#14171a" />
        <g stroke="#14171a" strokeWidth="2.4" strokeLinecap="round">
          <line x1="142" y1="70" x2="142" y2="56" />
          <line x1="150" y1="76" x2="162" y2="72" />
          <line x1="147" y1="86" x2="153" y2="98" />
          <line x1="137" y1="86" x2="131" y2="98" />
          <line x1="134" y1="76" x2="122" y2="72" />
        </g>
      </g>
    </svg>
  );
}
