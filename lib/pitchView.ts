// ピッチ表示モード（フル/ハーフ/種目別ボックス）に応じた座標変換ユーティリティ。
// データ座標（y:0自陣-100敵陣）は変えず、表示（画面上のtop%）だけを変換する。
// full のとき yToTop(y, "full") === 100 - y（従来と完全一致）であること。
// half/full の計算式は元の実装から1文字も変えていない（既存の戦術ボードの見た目を非破壊に保つ）。
//
// boxatk/boxdef は Phase0 で追加した種目別フレーミング用のズーム表示。
// boxatk＝敵陣ボックス周辺（y58-100）、boxdef＝自陣ボックス周辺（y0-42）を全高に拡大する。
// いずれも y の可視範囲を [lo, hi] として、top% = ((hi - y) / (hi - lo)) * 100 の形（＝halfの一般化）。
//
// paatk/padef（PA拡大。setpiece-redesign §6）は y の変換式そのものはboxatk/boxdefと
// 同じにする（既存の式は1文字も変えない）。横方向の追加の切り出しはCSS側のscale変形
// （Pitch.tsxの.pitchzoom）で行うため、ここでは分岐を追加するだけでよい。

import type { PitchViewMode } from "./types";

/** データ座標 y(0-100) → 画面 top% 。half は敵陣（y50-100）、boxatk/boxdef・paatk/padefは該当ボックス周辺を全高に拡大 */
export function yToTop(y: number, view: PitchViewMode | undefined): number {
  if (view === "half") return (100 - y) * 2;
  if (view === "boxatk" || view === "paatk") return (100 - y) * (100 / 42); // 可視範囲 y[58,100]
  if (view === "boxdef" || view === "padef") return (42 - y) * (100 / 42); // 可視範囲 y[0,42]
  return 100 - y;
}

/** 画面 top% → データ座標 y */
export function topToY(top: number, view: PitchViewMode | undefined): number {
  if (view === "half") return 100 - top / 2;
  if (view === "boxatk" || view === "paatk") return 100 - (top / 100) * 42;
  if (view === "boxdef" || view === "padef") return 42 - (top / 100) * 42;
  return 100 - top;
}

/** ドラッグ量の換算係数: 画面高さ全体が y何%ぶんか */
export function ySpan(view: PitchViewMode | undefined): number {
  if (view === "half") return 50;
  if (view === "boxatk" || view === "boxdef" || view === "paatk" || view === "padef") return 42;
  return 100;
}

/** PA拡大(paatk/padef)時、SVGの線の太さに掛ける逆倍率（setpiece-redesign §6）。
 * レビュー指摘(2回目・major): PA拡大は描画層(.pitchzoom)をCSSでscale(--sp-pa-scale=100/72)
 * するため、中のSVGの線もそのまま1.39倍太く見えてしまう。トークン等は逆倍率のtransformを
 * CSS側(globals.css)で掛けて戻しているが、SVGの線幅(stroke-width)は要素ごとに値が違う
 * （PenLayer/ShapesLayerは可変。ペン幅・図形の太さ設定に依存）ため、CSSの固定値上書きでは
 * 対応できない（deliverysvgだけは太さが固定値のためCSS側で処理している）。描画時に直接
 * この倍率を掛けて解決する（globals.cssの--sp-pa-inv(=72/100)と同じ値） */
export function paZoomStrokeScale(view: PitchViewMode | undefined): number {
  return view === "paatk" || view === "padef" ? 72 / 100 : 1;
}
