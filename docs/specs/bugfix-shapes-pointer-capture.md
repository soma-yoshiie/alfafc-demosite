# 実装指示書: 図形レイヤーのポインタ奪取バグ修正

作成: PM（2026-07-08）／対象リポジトリ: 戦術ボード サンドボックス

## 1. 要件

- 目的 / 背景: 図形パレットを開いた状態（または図形が選択されたままの状態）では、選手・ボール・相手トークンをドラッグで移動できない。原因は `components/ShapesLayer.tsx` が編集可能時に **SVGルート要素全体** を `pointer-events: auto` にしていること。`.pathsvg` は z-index:3、トークン `.tok` は z-index:2 のため、SVGの矩形全域（ピッチ全面）がトークンより上でポインタを吸収する。実測で `document.elementFromPoint(トークン中心)` が `pathsvg shapes active` を返すことを確認済み。
- 受け入れ条件（チェックリスト）:
  - [ ] 図形パレットを開いたまま、選手・ボール・相手トークンをドラッグ移動できる（編集モード）
  - [ ] 同状態で、既存図形（ゾーン楕円/矩形・曲線矢印・テキスト・連結ライン・囲み枠・スポットライトリング）を**図形の上をタップ**したときだけ選択でき、本体ドラッグ・ハンドル操作も従来どおり動く
  - [ ] 図形の無い場所（ピッチ背景）をタップすると選択解除される（従来挙動の維持）
  - [ ] パレットを閉じ、かつ何も選択していないとき、図形類は一切ポインタを受けない（従来どおり）
  - [ ] アニメモードでも同様（ルート描画・移動ツール・選手タップ選択と共存）
  - [ ] `npx tsc --noEmit` エラーなし

## 2. 影響範囲

- 変更対象: `components/ShapesLayer.tsx`、`app/globals.css`（`.pathsvg.shapes.active` 関連）のみ
- 影響を受ける機能: 図形の選択/ドラッグ/リサイズ/ハンドル操作、背景タップでの選択解除、トークンのドラッグ（主目的）、ペン（同系レイヤだが**変更禁止**・挙動維持）

## 3. 実装計画

1. ShapesLayer の SVG ルートは**常に** `pointer-events: none`（インラインstyle か CSS）。`.pathsvg.shapes.active { pointer-events: auto }` 系のCSSは削除。
2. `editable = board.shapesOpen || board.selShape != null` のとき、**個々の図形要素にだけ**ポインタを付与する:
   - SVG子要素（ellipse / rect / path / polyline / polygon / ハンドルのcircle）: `pointerEvents: editable ? "auto" : "none"`（SVGでは `style` またはプレゼンテーション属性）。ヒット領域が細すぎる線（arrow の path、link の polyline）は、必要なら同座標に `stroke="transparent" strokeWidth={3}` の当たり判定用要素を重ねてよい（見た目を変えないこと）
   - HTML要素（`.shapetext`、`.spotlightring`）: 同様に editable のときのみ `pointer-events: auto`
3. 背景タップの選択解除は SVG 背景では拾えなくなるため、`useEffect` で `board.pitchRef.current` に `pointerdown` リスナーを登録し、`selShape != null` かつ `e.target` が図形要素・トークン・ボール以外（＝ピッチ背景/罫線）なら `setSelShape(null)` する。クリーンアップでリスナー解除。トークン側の `onPointerDown` は `stopPropagation()` 済みであることを確認し、干渉しないこと。
4. `npx tsc --noEmit` を通す。

## 4. 壊れる可能性のある機能（リスク一覧）

| 機能 | 壊れる理由 | 確認方法 |
|------|-----------|---------|
| 図形の選択・移動・リサイズ | pointer-events の付け替えでヒット対象が変わる | パレット開で各図形のタップ選択→ドラッグ→ハンドル |
| 背景タップの選択解除 | 解除の仕組みを svg 背景→pitch リスナーに移すため | 図形選択→背景タップ→ハンドル消滅 |
| 細い線（矢印/連結）の選択 | 線のヒット幅が細い | 矢印・連結ラインをタップで選択できる |
| ペン描画 | 同系レイヤ（変更禁止） | ペンONで従来どおり描ける |
| アニメのルート描画/選手タップ | pitch への新リスナー追加 | アニメでなぞり・タップ選択が従来どおり |

## 5. 実装担当への指示

- やること: 上記実装計画のみ。変更ファイルは `components/ShapesLayer.tsx` と `app/globals.css` に限定
- やらないこと: リファクタ・「ついで修正」・PenLayer/usePointerDrag/BoardProvider の変更（必要が生じたら実装を止めて確認事項として報告）
- 規約: コメントは日本語・絵文字グリフ禁止・既存の PointerEvent + setPointerCapture パターン踏襲
- 完了条件（DoD）: 受け入れ条件のチェックリスト全項目＋tsc クリーン＋変更ファイル一覧の報告

## 6. PMからの確認事項

なし（原因は実測で確定済み）
