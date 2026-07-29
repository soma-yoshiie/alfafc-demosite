# 実装指示書: ベンチD&D分身残留の恒久対策（windowリスナー方式へ再構築）

作成: PM（2026-07-09）／背景: preventDefault＋onPointerCancel を入れた後もユーザー環境（PC/マウス）で分身（.bench-ghost＝番号ディスク＋黒ピルの名前）が残留する。カード要素へのイベント配送に依存する限り、要素の非表示化・キャプチャ喪失・未知の経路で取りこぼしうるため、**ドラッグのライフサイクルを window に移し、どんな終わり方でも必ず後片付けされる構造**に作り替える。

## 対象
`components/Bench.tsx`（必要なら `app/globals.css` 微修正）

## 実装内容

### 1. ドラッグを window リスナー駆動に再構築
- `onPointerDown`（カード側・現状維持: `e.preventDefault()`＋pointerId記録）で:
  - `drag.current = { pid, pointerId: e.pointerId, moved: false, sx, sy, target: null }`
  - `window.addEventListener("pointermove", onWinMove)` / `"pointerup"`, `"pointercancel"` を **capture: true** で登録（`{ capture: true }`。他要素の stopPropagation の影響を受けないため）
  - `setPointerCapture` は**廃止**（windowリスナーが全て受けるため不要。カード側の onPointerMove/onPointerUp/onPointerCancel props も削除）
- `onWinMove(ev: PointerEvent)`: `drag.current` が null または `ev.pointerId !== drag.current.pointerId` なら無視。以降は現行 onPointerMove と同等（6px閾値→ghost表示・追従・setTarget）
- `onWinUp(ev)`: pointerId 一致時のみ。現行 onPointerUp と同等（moved ならドロップ判定＋assign、タップなら playerDetail）。**必ず** `endDrag()` を通す
- `onWinCancel`: `endDrag()` のみ
- `endDrag()`（一元化された後片付け）: `drag.current = null; setGhost(null); setTarget(null);` ＋ **登録した window リスナーを必ず remove**（リスナー参照は useRef に保持）
- さらに保険として `window.addEventListener("blur", endDrag)` もドラッグ中のみ登録（ウィンドウ切替・OSダイアログ等での取りこぼし対策）

### 2. アンマウント時の保険
- `useEffect(() => () => endDrag相当のクリーンアップ, [])`（Bench がドラッグ中にアンマウントされてもリスナー・分身が残らない）

### 3. レンダリング側の保険
- ghost の描画条件は現行どおり state（`ghost`）だが、`endDrag` がすべての経路で呼ばれることを保証する構造にする（上記1・2で担保）

### 4. 触らないもの
- ドロップ判定 `slotElAt` / `setTarget` のロジック、タップで playerDetail、toast 文言、`.bcard` の見た目・`user-select: none`。指示書外の変更禁止

## 受け入れ条件
- [ ] 通常のD&D（空き枠・選手枠・芝・ベンチ内キャンセル）で従来どおり動作
- [ ] ドラッグ中に pointercancel / ウィンドウ blur / ボタンを離す場所がどこであっても、分身・ハイライト・内部状態が**必ず**消える
- [ ] タップで選手詳細が開く（回帰）
- [ ] `npx tsc --noEmit` クリーン
