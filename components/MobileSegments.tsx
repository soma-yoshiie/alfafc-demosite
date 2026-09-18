"use client";

import { useEffect, useRef } from "react";

/**
 * スマホ版・画面内の切替（タブ／セグメント）共通部品（mobile-redesign §1-7）。
 * サッカーノート／コーチラボの新セグメント、チーム運営の既存タブ帯（.fbar）の
 * 様式統一に使う。高さ36px・角丸var(--r-md)・非アクティブ=白地+outline・
 * アクティブ=accent-tint地+accent文字700（§1-7）。5項目以上は横スクロール
 * （wrapClassNameの既定値.mseg／.fbarいずれもoverflow-x:autoでスクロールバー非表示）。
 */

export type MobileSegmentItem = {
  key: string;
  label: string;
  badge?: number;
  on: boolean;
  onSelect: () => void;
  /** groups-editing-and-place-history §5: 選択トグルではなく単発の操作（例:「＋ 管理」）。
   *  onは常にfalseで渡す想定。.mseg-item.actionクラスが付き、aria-currentは出さない */
  kind?: "action";
};

export function MobileSegments({
  items,
  wrapClassName = "mseg",
  ariaLabel,
}: {
  items: MobileSegmentItem[];
  /** 既存の横スクロール帯(.fbar等)に乗せたい場合はそのクラス名を渡す（PC非表示規則を再利用できる） */
  wrapClassName?: string;
  ariaLabel?: string;
}) {
  const activeKey = items.find((it) => it.on)?.key;
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // mobile-redesign Phase D-2(major §1-7): 横スクロール帯でアクティブ項目が右端に隠れたまま
  // になる問題(例: コーチラボ>プロフィール)への対策。アクティブになった項目を可視域へ運ぶ
  // （既に見えていれば何もしない="nearest"）。マウント直後の初期アクティブが末尾で隠れている
  // ケースも含めて解消するため、キー変化・初回の両方で実行する
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeKey]);

  return (
    // mobile-redesign Phase D-1(C2-minor 観点5 a11y): role="tablist"/"tab"+aria-selectedは
    // 対応するrole="tabpanel"・aria-controls・矢印キー移動(roving tabindex)が無く、WAI-ARIAの
    // tabパターンとして不完全だった(スクリーンリーダーが「タブ」と読み上げるのに矢印キーが
    // 効かない)。また wrapClassName="fbar" 経由ではチーム運営の絞り込みチップにも同じ役割が
    // 付き意味論がぶれていたため、.mtabと同じ文法(nav+aria-current)に揃えて簡素化する
    <nav className={wrapClassName} aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.key}
          ref={it.on ? activeRef : undefined}
          type="button"
          aria-current={it.kind === "action" ? undefined : it.on ? "true" : undefined}
          aria-label={it.badge ? `${it.label} ${it.badge}件` : undefined}
          className={`mseg-item${it.on ? " on" : ""}${it.kind === "action" ? " action" : ""}`}
          onClick={it.onSelect}
        >
          {it.label}
          {!!it.badge && it.badge > 0 && (
            <span className="mseg-badge" aria-hidden="true">{it.badge > 9 ? "9+" : it.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
