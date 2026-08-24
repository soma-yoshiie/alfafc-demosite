// ピッチ表示モード（フル/ハーフ/種目別ボックス）に応じた座標変換ユーティリティ。
// データ座標（y:0自陣-100敵陣）は変えず、表示（画面上のtop%）だけを変換する。
// full のとき yToTop(y, "full") === 100 - y（従来と完全一致）であること。
// half/full の計算式は元の実装から1文字も変えていない（既存の戦術ボードの見た目を非破壊に保つ）。
//
// boxatk/boxdef は Phase0 で追加した種目別フレーミング用のズーム表示。
// boxatk＝敵陣ボックス周辺（y58-100）、boxdef＝自陣ボックス周辺（y0-42）を全高に拡大する。
// いずれも y の可視範囲を [lo, hi] として、top% = ((hi - y) / (hi - lo)) * 100 の形（＝halfの一般化）。

import type { PitchViewMode } from "./types";

/** データ座標 y(0-100) → 画面 top% 。half は敵陣（y50-100）、boxatk/boxdefは該当ボックス周辺を全高に拡大 */
export function yToTop(y: number, view: PitchViewMode | undefined): number {
  if (view === "half") return (100 - y) * 2;
  if (view === "boxatk") return (100 - y) * (100 / 42); // 可視範囲 y[58,100]
  if (view === "boxdef") return (42 - y) * (100 / 42); // 可視範囲 y[0,42]
  return 100 - y;
}

/** 画面 top% → データ座標 y */
export function topToY(top: number, view: PitchViewMode | undefined): number {
  if (view === "half") return 100 - top / 2;
  if (view === "boxatk") return 100 - (top / 100) * 42;
  if (view === "boxdef") return 42 - (top / 100) * 42;
  return 100 - top;
}

/** ドラッグ量の換算係数: 画面高さ全体が y何%ぶんか */
export function ySpan(view: PitchViewMode | undefined): number {
  if (view === "half") return 50;
  if (view === "boxatk" || view === "boxdef") return 42;
  return 100;
}
