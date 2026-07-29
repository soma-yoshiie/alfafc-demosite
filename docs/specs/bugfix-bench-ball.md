# 実装指示書: ベンチD&Dの残留ゴースト修正＋アニメ中のボール前面化

作成: PM（2026-07-09）／ユーザー承認済み（バグ①は修正依頼、バグ②は暫定修正を先行の承認）

## バグ①: ベンチ→ピッチのドラッグで分身アイコンが残留・配置が不安定（PCマウス）

### 原因
`components/Bench.tsx` のドラッグ実装に2点の欠陥:
1. `onPointerDown` で `e.preventDefault()` していないため、マウスドラッグ中にブラウザのネイティブドラッグ/テキスト選択が横取りし `pointercancel` が発生することがある
2. `onPointerCancel` ハンドラが無いため、その際 `ghost`（`.bench-ghost` 分身）と `drag.current`・`drop-target` ハイライトが残留する（分身は pointer-events:none のため「何をしても消えない」）

### 修正（components/Bench.tsx / app/globals.css）
- `onPointerDown` の先頭で `e.preventDefault()` を追加
- `onPointerCancel` ハンドラを追加: `drag.current = null; setGhost(null); setTarget(null)`（`setTarget(null)` は drag.current を null にした後でも `.drop-target` クラス除去が走るよう実装を確認して調整）
- `lostpointercapture` 相当の保険として、`onPointerUp` / `onPointerCancel` の双方で `.tok.drop-target` の除去漏れがないことを確認
- CSS: `.bcard { user-select: none; -webkit-user-select: none; }` を追加（テキスト選択ドラッグの抑止）
- カード内の `.bav` 等に `draggable` な要素は無いが、画像等を今後置いても安全なよう `.bcard * { -webkit-user-drag: none; }` は任意（入れる場合はコメントで理由明記）

### 受け入れ条件
- [ ] ベンチ→空き枠/選手のいる枠へのD&Dが安定して成功する
- [ ] ドラッグを途中でキャンセル（ESCや領域外・pointercancel）しても分身・ハイライトが残らない
- [ ] タップ（動かさず離す）で従来どおり選手詳細が開く

## バグ②: アニメ中、選手と重なったボールが選択できない（暫定修正）

### 原因
アニメモードは `.app.anim .tok { z-index: 5 }` に対し `.ball { z-index: 4 }` のため、重なると常に選手が勝つ。

### 修正（app/globals.css のみ）
- `.app.anim .ball { z-index: 6; }` を追加（アニメ中のみボールを選手より前面に）
- 編集モードは現状維持（ball 4 > tok 2 で既にボール優先）

### 受け入れ条件
- [ ] アニメモードで選手の真上にあるボールを掴んでルートを描ける
- [ ] ボール（22px）が選手ディスク（44px）を覆い切らず、周縁で選手も掴める
- [ ] `npx tsc --noEmit` クリーン

## やらないこと
ボール操作の再設計（所有モデル）は別指示書。今回の2修正以外の変更禁止。
