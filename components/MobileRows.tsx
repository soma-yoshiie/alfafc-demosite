"use client";

/**
 * スマホ版ホーム／コーチングハブで共有する行部品（mobile-redesign §1-2/§1-3）。
 * 「同じ大きさのカードを並べるグリッド」ではなく、白カード内に56〜72pxの行を
 * 1pxの区切り線で積むリストにする（§8-3-14）。色は既存トークンのみ使用。
 */

export function MenuGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mrowgroup">
      {title && <div className="mrowgroup-h">{title}</div>}
      <div className="mrowcard">{children}</div>
    </div>
  );
}

export function MenuRow({
  icon,
  label,
  desc,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="mrow"
      onClick={onClick}
      aria-label={badge ? `${label} 未読${badge}件` : undefined}
    >
      <span className="mrow-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mrow-body">
        <span className="mrow-toprow">
          {/* .mrow-labelのtextContentはラベル文字列のみに保つ（バッジは兄弟要素にする）。
              E2E監査(mobile_audit.js)がラベル文字列の完全一致でタップ対象を探すため */}
          <span className="mrow-label">{label}</span>
          {!!badge && badge > 0 && (
            <span className="mrow-badge" aria-hidden="true">{badge > 9 ? "9+" : badge}</span>
          )}
        </span>
        {desc && <span className="mrow-desc">{desc}</span>}
      </span>
      <span className="mrow-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
