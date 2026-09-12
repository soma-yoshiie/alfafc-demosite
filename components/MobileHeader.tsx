"use client";

import { useState } from "react";
import { IconChevronLeft, IconMore } from "./icons";

/**
 * スマホ版・各画面共通ヘッダー（mobile-redesign §1-6）。
 * 高さ52px・白地・下端1px var(--outline)。左は戻る（サブ画面のみ・44×44以上）、
 * 中央左寄せは画面名（17px 700 --ink）、右はアイコンアクション（各44×44以上）。
 * PCのヘッダー（Header.tsx のPC分岐やConsoleShell）はこの部品を使わず変更しない。
 */

export function MobileHeader({
  title,
  subtitle,
  onBack,
  backLabel = "戻る",
  actions,
}: {
  title: React.ReactNode;
  /** 画面名の下に小さく出す補足（§1-6: 廃止した.tag.teamの緑ピルの代わり。省略可） */
  subtitle?: React.ReactNode;
  /** 指定時のみ左に戻るボタンを出す（タブ直下の画面には出さない） */
  onBack?: () => void;
  backLabel?: string;
  /** 右側のアイコンアクション（MobileHeaderAction を並べる。最大3つ推奨） */
  actions?: React.ReactNode;
}) {
  return (
    <header className="mhead">
      {onBack ? (
        <button type="button" className="mhead-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
          <IconChevronLeft />
        </button>
      ) : (
        <span className="mhead-back mhead-spacer" aria-hidden="true" />
      )}
      <div className="mhead-tx">
        <div className="mhead-title">{title}</div>
        {subtitle && <div className="mhead-sub">{subtitle}</div>}
      </div>
      {actions && <div className="mhead-actions">{actions}</div>}
    </header>
  );
}

export function MobileHeaderAction({
  label,
  onClick,
  primary,
  children,
}: {
  label: string;
  onClick: () => void;
  /** trueで--accent色にする（保存・送信など主アクション用） */
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`mhead-action${primary ? " primary" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * ヘッダー右のアクションが3つを超える画面向けの「…」オーバーフローメニュー
 * （mobile-redesign Phase D-1: §1-6「アイコンボタン最大3つ」を満たすため、
 * 4つ目以降の副次アクションをここへ集約する）。MobileHeaderAction と並べて使う。
 */
export function MobileHeaderMore({
  label = "その他",
  items,
}: {
  label?: string;
  items: { label: string; icon: React.ReactNode; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mhead-more">
      <button
        type="button"
        className="mhead-action"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore />
      </button>
      {open && (
        <>
          <div className="mhead-more-backdrop" onClick={() => setOpen(false)} />
          <div className="mhead-more-pop" role="menu" aria-label={label}>
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="mhead-more-item"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
