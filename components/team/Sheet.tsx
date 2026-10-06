"use client";

import type React from "react";

/**
 * 下からのシート（スマホ）／1ペイン（PC の pane 指定）。TeamHub から移して共用にした
 * （練習試合の絞り込み・募集フォームも同じ部品を使う）。見た目・挙動は移す前のまま。
 */
export function Sheet({
  open,
  onClose,
  children,
  pane,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** PC専用: モーダル(scrim/sheet)の代わりに.teammain内の1ペインとして描画する */
  pane?: boolean;
}) {
  if (pane) {
    if (!open) return null;
    return (
      <div className="tmdetail tm-sheetpane">
        <div className="tmback" onClick={onClose}>
          ‹ 戻る
        </div>
        {children}
      </div>
    );
  }
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <div className={`sheet${open ? " on" : ""}`}>
        <div className="grabzone" onClick={onClose}>
          <div className="grab" />
        </div>
        {/* PCダイアログ用の閉じるボタン（モバイルでは基底CSSで非表示） */}
        <button className="sheetx" type="button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
        <div className="sheetBody">{open ? children : null}</div>
      </div>
    </>
  );
}
