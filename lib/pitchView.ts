// ピッチ表示モード（フル/ハーフ）に応じた座標変換ユーティリティ。
// データ座標（y:0自陣-100敵陣）は変えず、表示（画面上のtop%）だけを変換する。
// full のとき yToTop(y, "full") === 100 - y（従来と完全一致）であること。

import type { PitchViewMode } from "./types";

/** データ座標 y(0-100) → 画面 top% 。half は敵陣（y50-100）を全高に拡大 */
export function yToTop(y: number, view: PitchViewMode | undefined): number {
  return view === "half" ? (100 - y) * 2 : 100 - y;
}

/** 画面 top% → データ座標 y */
export function topToY(top: number, view: PitchViewMode | undefined): number {
  return view === "half" ? 100 - top / 2 : 100 - top;
}

/** ドラッグ量の換算係数: 画面高さ全体が y何%ぶんか */
export function ySpan(view: PitchViewMode | undefined): number {
  return view === "half" ? 50 : 100;
}
