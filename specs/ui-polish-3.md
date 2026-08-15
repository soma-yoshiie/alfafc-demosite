# 実装指示書: 送信先1段化・矢頭はみ出し修正・アニメ時のピッチ上バー

作成: PM（2026-07-09）

## R1. 「戦術を保存・送信」の送信先を1段に
- 現状: `.sendtgt label` にネイティブラジオの丸が表示され幅を圧迫し、スペースが余っているのに折り返す
- `app/globals.css`:
  - `.sendtgt { flex-wrap: nowrap; }` に変更
  - `.sendtgt input { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }` でネイティブラジオを視覚的に隠す（チップの .on 状態が選択表示。a11yのため display:none は使わない）
  - `.sendtgt label { min-width: 0; }` に緩め、`position: relative;` を追加（absolute input の基準）。フォントサイズ 12.5px 程度に微調整してよい
- 受け入れ: 保存シートの「送信しない／チーム全員／個人」が1段に収まる（モバイル幅375pxでも）

## R2. 曲線矢印の軸線が矢頭からはみ出す問題
- 現状: `components/ShapesLayer.tsx` の arrow は `M p0 Q c p1` を p1 まで描き、矢頭（長さ Lh≈2.6）も p1 先端に描くため、軸線の先が三角の脇からはみ出す
- 修正: **軸線を矢頭の根元で切り詰める**
  - `lib/geometry.ts` に `trimQuadEnd(p0: Point, c: Point, p1: Point, trim: number): { c: Point; end: Point }` を追加: 曲線を16分割サンプリングで弧長を推定し、終端から `trim` 分手前のパラメータ t* を求め、de Casteljau で [0, t*] に分割した左側曲線の制御点（`lerp(p0, c, t*)`）と終点（曲線上の点 B(t*)）を返す。曲線長が trim 以下の場合はそのまま返す（切り詰めない）
  - `components/ShapesLayer.tsx`: arrow の path を `M p0 Q c' end`（trim = 2.1）で描く。**矢頭は従来どおり p1 に、方向も従来どおり (p1 - c) で描く**（見た目の先端は不変）。当たり判定用の透明パスがある場合はそちらは p1 まででよい
  - `lib/renderFrame.ts` / `lib/exportImage.ts` の arrow 描画（quadraticCurveTo）にも同じ trim を適用（共通ヘルパーを import）
- 受け入れ: 太さ「太（1.8）」の曲線矢印でも軸線が矢頭の三角から突き出ない（画面・PNG・GIF）

## R3. アニメ中もピッチ上部にバーを表示（ペン・図形・ハーフ＋表示トグル）＋アニメ入口
### R3-1. FormationBar をモード対応の「ピッチ上バー」に
- `components/FormationBar.tsx` を mode 対応に変更:
  - **編集モード**（現状のまま）: フォーメーション変更・新規・整列・＋相手・ペン・図形・ハーフ ＋ **新規「アニメ」ボタン**（ハーフの右隣。`board.openStudio()` を呼ぶ。アイコンは `components/icons.tsx` に `IconFilm`（ヘッダーの映写機アイコンと同じパス）を追加して使用。ラベル「アニメ」）
  - **アニメモード**: フォーメーション変更・新規・整列・＋相手・アニメ は出さず、代わりに [ペン] [図形] [ハーフ] [ルート表示] [描き込み] [残像] を表示（すべて `fmini` スタイル・ON状態は `.on`）
    - ルート表示 = `board.showPaths` トグル（IconRoute）
    - 描き込み = **新設** `board.showDrawings` トグル（IconPen または IconShapes。「図形やペンで描いたもの」の表示/非表示）
    - 残像 = `board.showGhost` トグル（IconGhost）
  - `role !== "coach"` の早期 return は現状維持
- `app/globals.css`: `.app.anim .fbar { display: none }`（622行付近）と `.app.anim .fbarpen` / `.app.anim .fbarshapes` の非表示ルールを削除（アニメ中もバーとパレットが出る）
### R3-2. showDrawings（描き込み表示）の新設
- `components/BoardProvider.tsx`: UI 状態 `showDrawings: boolean`（既定 true、永続化しない）+ `setShowDrawings` を context に追加
- `components/PenLayer.tsx`: `mode === "anim" && !showDrawings` のときストロークを描画しない（penMode での新規描画レイヤーは従来どおり動作してよいが、OFF中にペンを使うケースは稀なので「OFF中はストローク非表示のまま描ける」で可）
- `components/ShapesLayer.tsx`: `mode === "anim" && !showDrawings` のとき図形を描画しない（選択中なら選択も解除されるのが安全: トグルOFF時に `setSelShape(null)` / `setSelStroke(null)` を呼ぶのは FormationBar のトグル onClick 側で行う）
- FormatBar は選択が無ければ出ないため追加対応不要
- 編集モードでは常に表示（トグルはアニメバーにのみ存在）
### R3-3. スタジオ側の重複チップ整理
- `components/AnimationStudio.tsx` の sttools から [ペン] [図形] [ルート表示] [残像] の toolchip を削除（上部バーへ移設したため）。残すのは [移動|ルート toolseg] [ワードで作成] [全画面再生]
- sttools 直下にあった `{board.penMode && <PenControls />}` と ShapesBar の条件レンダーも削除（アニメ中は fbarpen / fbarshapes が出るため）。※削除の際、编集モード側の表示経路（FormationBar 側）が両モードで機能することを確認

## 受け入れ条件
- [ ] 送信先3択が1段（375px幅でも）
- [ ] 太い曲線矢印で軸線が矢頭からはみ出ない（画面・PNG/GIF）
- [ ] 編集モードのバーに「アニメ」ボタンがあり、押すとスタジオが開く
- [ ] アニメ中、ピッチ上部に ペン/図形/ハーフ/ルート表示/描き込み/残像 のバーが表示され、各トグルが機能する（ペン・図形はパレットがバー直下に開く）
- [ ] 「描き込み」OFFでアニメ中の図形・ペンが消え、ONで戻る（編集モードには影響しない）
- [ ] スタジオ内に重複チップが残っていない
- [ ] `npx tsc --noEmit` クリーン・既存機能非破壊（保存/共有/出力・全画面再生・Keynote選択系）

## やらないこと
ヘッダーの映写機アイコンの削除（残す）。ルート矢印（PathLayer）の軸線トリム（今回対象外）。指示書外の変更禁止。

## レビュー指摘の修正（reviewer 2026-07-11）
### M-1. 全画面再生でペン/図形パレットが残留（回帰・要修正）
- fullplay 時は `.app` に `anim` と `fullplay` の両クラスが載るが、`.app.fullplay` の非表示ルールは `.fbar` のみで兄弟の `.fbarpen`/`.fbarshapes` を隠していない。アニメバーでペン/図形を開いたまま全画面再生に入るとパレットが残留し、FullPlayOverlay 内の `.fppen` と二重表示になる
- 修正: `app/globals.css` の `.app.fullplay .fbar` 非表示ルール（1613行付近）に `.app.fullplay .fbarpen, .app.fullplay .fbarshapes` を追加
### L-1. 送信先チップのフォーカスリング（a11y・軽微）
- 修正: `.sendtgt label:has(input:focus-visible) { outline: 2px solid var(--lime); outline-offset: 2px; }` を追加（--lime が無ければ既存のアクセント色変数を使用）
- 併せて `components/SendTarget.tsx` の3つの radio に共通 `name` 属性を付与（矢印キーでのラジオグループ移動を回復）。name は field ごとに一意になるよう既存 props から導出（固定文字列で衝突しないこと）
### 受け入れ追加
- [ ] ペン/図形パレットを開いたまま全画面再生に入ってもパレットが残らない
- [ ] Tab で送信先チップにフォーカスするとリングが見える・矢印キーで選択移動できる
