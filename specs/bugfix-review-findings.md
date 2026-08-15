# 実装指示書: レビュー指摘の修正（pendingShape 未解除ほか）

作成: PM（2026-07-08）／前提: `bugfix-shapes-pointer-capture.md` の修正が先に適用されていること

## 1. 要件

reviewer の点検で確定した Critical 1件・Warning 5件・軽微2件を修正する。**指摘の修正のみ**を行い、機能追加やリファクタはしない。

### 受け入れ条件
- [ ] C1: 連結ライン/囲み枠の「選手タップ待ち」を開始した後にパレットを閉じても・スタジオを開閉しても、以降のトークンタップが乗っ取られない（editで選手メニューが開き、animで選択トグルが効く）
- [ ] W1: アニメ中に図形を選択したまま「完了」しても、編集モードに `shapesOpen`/`selShape` が引き継がれず、パレットは閉じ選択も解除される
- [ ] W2: WebM 書き出しがエラー時も interval が止まり、成功/失敗どちらでも captureStream のトラックが停止される。エラー後に進捗表示が復活しない
- [ ] W3: 印刷ビューが全画像の読み込み完了を待ってから window.print() を呼ぶ
- [ ] W4: ハーフコート表示の画像/GIF/印刷出力で、画面（GuideLayer）に出ない自陣側サードのラベル・帯が描かれない
- [ ] W5: `.pathsvg.shapes.active` と `.shapehandle` に `touch-action: none` が付き、タッチ端末で図形ドラッグ中にスクロールが誘発されない
- [ ] S1: `resetPlay`/`seek` の `animTotal(...)` 呼び出しに `stepCount` を渡し、再生系と総尺が一致する
- [ ] S2: 相手トークン削除時に `selActor`/`selMove` が削除対象・後続インデックスを指していたら解除（またはremap）される
- [ ] `npx tsc --noEmit` エラーなし

## 2. 修正内容（ファイル別）

### components/BoardProvider.tsx
- **C1**: `setShapesOpen(false)` 相当の処理・`openStudio`・`closeStudio` で `pendingShape` を必ず解除（`setPendingShape(null)` ＋ ref 更新。既存の cancelPendingShape を呼ぶ形でよい）
- **W1**: `openStudio`/`closeStudio` で `setShapesOpen(false)`（内部で selShape 解除）を明示的に呼ぶ
- **S1**: `resetPlay` と `seek` 内の `animTotal(stateRef.current.moves)` を `animTotal(stateRef.current.moves, stateRef.current.stepCount)` に統一
- **S2**: `deleteOpponent`（または DELETE_OPPONENT 後の呼び出し側）で、`selActor` が `opp${削除index}` なら null、より大きい opp インデックスなら -1 して詰め替え。`selMove` も同様

### lib/exportAnim.ts（W2）
- `recorder.onerror` で `clearInterval(iv)`
- 正常 stop 時・エラー時の双方で `stream.getTracks().forEach((t) => t.stop())`
- reject 後に `onProgress` が呼ばれないよう、停止フラグで interval 内処理をガード

### lib/printView.ts（W3）
- 生成 HTML 内のスクリプトを「全 `<img>` の load/error を待ってから `window.print()`」に変更（`Promise.all` + フォールバックで 3秒タイムアウト後に print）

### lib/renderFrame.ts（W4）
- `guides.zones` 描画時、`view === "half"` なら自陣側（y<50 が基準のサード帯・境界線・「ディフェンディングサード」「ミドルサード」のうち画面表示されないもの）を describe しない。画面の GuideLayer.tsx の half 分岐と同じ条件に揃える

### app/globals.css（W5）
- `.pathsvg.shapes.active { touch-action: none; }`（前指示書で active クラス自体を廃止した場合は、図形要素がポインタを受ける状態のセレクタに対して付与）
- `.shapehandle { touch-action: none; }`

## 3. やらないこと
- Suggestion のうち「context value の再生成による再登録チャーン」「Actor 型の境界検証」は今回見送り（挙動バグではないため）
- 上記以外のファイル変更・リファクタ

## 4. リスク

| 機能 | 理由 | 確認方法 |
|------|------|---------|
| 図形の選手タップ待ちフロー | 解除タイミング追加 | 連結/囲みの作成が従来どおり完了できる |
| スタジオ開閉 | shapesOpen/pending の強制解除 | 開閉後にパレット・選択が初期状態 |
| WebM出力 | interval/トラック停止の追加 | 正常書き出しが従来どおり成功する |
| 印刷 | print タイミング変更 | 画像が揃った状態で印刷ダイアログが出る |

## 5. 完了条件（DoD）
受け入れ条件全チェック＋tsc クリーン＋変更ファイル一覧の報告。

---

# 追補（QA指摘 D1/D2/D4 の修正）

## D1/D2: 塗り図形が edit のトークンを覆いポインタを奪う
- 方針: 図形レイヤーをトークンより下に恒久変更（視覚的にもゾーンは選手の下が正しい）
- `app/globals.css`: `.pathsvg.shapes { z-index: 1; }`（既定の .pathsvg z3 を上書き）、`.shapetext { z-index: 1 }` に変更
- 受け入れ: パレット開で、ゾーン/囲み枠が重なった選手をドラッグ移動できる。図形はトークンの無い面で従来どおり選択できる。ゾーンの塗りが選手ディスクの下に描かれる

## D4: 相手トークン削除時の selShape 残留
- `components/BoardProvider.tsx` の `deleteOpponent` で `setSelShape(null)` を追加（無条件でよい）
- 受け入れ: 相手削除後に selShape が存在しない図形を指さない

上記以外は変更しないこと。`npx tsc --noEmit` クリーン必須。
