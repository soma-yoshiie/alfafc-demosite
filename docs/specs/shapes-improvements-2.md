# 実装指示書: 図形機能の改善（スポットライト削除・テキスト刷新・線太さ・連結ライン端点）

作成: PM（2026-07-08）

## 1. 要件

### R1. スポットライト機能の完全削除
- `lib/types.ts`: `ShapeKind` から `"spotlight"` を除去、`SpotlightShape` を削除、`Shape` ユニオン・`ShapePatch` から dim 関連を除去。pendingShape の kind 型は `"link" | "hull"` に縮小
- `components/BoardProvider.tsx`: `normalizeBoard` で旧データの spotlight 図形を除去（`(state.shapes ?? []).filter((s) => (s as { kind?: string }).kind !== "spotlight")` 相当）。`spotlitActors` / `spotlightDimOn` / `startPendingShape`・`pendingShapeTap` の spotlight 分岐 / `applyPlayhead` の spotlight 更新 / `DELETE_OPPONENT` の spotlight 分岐 を削除
- `components/ShapesLayer.tsx`: spotlightring・pitchdim の描画と登録、背景解除リスナーの `.spotlightring` 参照を削除
- `components/ShapesBar.tsx`: スポットライト追加ボタン・減光トグルを削除
- `components/PlayerToken.tsx` / `OppToken.tsx` / `Ball.tsx`: `spotlit` クラス付与を削除
- `lib/renderFrame.ts` / `lib/exportImage.ts`: spotlight 描画（リング・減光）を削除
- `components/icons.tsx`: `IconSpotlight` を削除
- `app/globals.css`: `.spotlightring` / `.pitchdim` / `.tok.spotlit` / `.ball.spotlit` 規則を削除

### R2. テキスト図形の入力刷新（バグ修正）
原因: 図形ドラッグの `preventDefault` により dblclick 編集が発火しない＋`window.prompt` 依存。
- `window.prompt` を全廃する（`BoardProvider.addShape("text")` と `ShapesLayer` の onDoubleClick 編集の両方）
- `addShape("text")`: 既定文字「テキスト」で即作成し、その図形を選択状態にする
- `components/ShapesBar.tsx`: **text 図形の選択中、インライン `<input type="text">` を表示**（`value = sel.text`、`onChange` で即 `updateShape(id, { text: 値 })`。IME対応のため composition 中も普通の controlled input でよい。`maxLength 30` 程度）。既存のサイズ3段トグルは維持
- `components/ShapesLayer.tsx`: onDoubleClick + prompt の編集コードを削除（編集はパレットの入力欄に一本化）
- 空文字になった場合は表示上そのまま（削除は既存の削除ボタン）

### R3. 線の太さ選択（楕円ゾーン・矩形ゾーン・連結ライン・曲線矢印）
- `lib/types.ts`: `ShapeBase` に `width?: number`（ピッチ%単位の線幅。text では未使用）を追加
- 既定値（width 未定義時）は現状の描画値を維持: zone 輪郭 0.5 / arrow 1.1 / link 1.0
- `components/ShapesBar.tsx`: zoneEllipse / zoneRect / arrow / link の選択中に**太さ3段トグル**を表示（既存 `.penwidth` UI 流用）。値表: zone は 細0.4/中0.8/太1.5、arrow・link は 細0.7/中1.1/太1.8。トグルの on 判定は「現在の実効幅（width ?? 既定値）に最も近い段」でよい
- `components/ShapesLayer.tsx`: strokeWidth に width を反映（選択時の強調 +0.2 等の既存ロジックは踏襲）
- `lib/renderFrame.ts` / `lib/exportImage.ts`: 同様に反映（%→px 換算はペンの実装と同じ方式）

### R4. 連結ライン・囲み枠の端点を「ディスクの中心」に（線の端を見せない）
現状は `actorPos`（トークン列＝ディスク+ラベルの中心）にアンカーされ、ディスクの下に端が見える。
- `components/BoardProvider.tsx` に `discCenterPct(actor: Actor): Point | null` を追加: `tokenEls` の登録要素から選手/相手は `.disc`、ボールは `.b` の `getBoundingClientRect()` 中心を取り、`getPitchRect()` で x% / top% に変換して `{ x, y: topToY(top, pitchView) }` を返す。要素が無ければ null
- `components/ShapesLayer.tsx` の link / hull の点計算: `discCenterPct(a) ?? actorPos(...)` に変更
- `applyPlayhead` の link / hull 更新も同じヘルパーを使用。**トークンの style を全て更新し終えた後**に図形を更新する順序にすること（ディスク実測位置が最新になるため）
- ディスクはトークン側（z-index 上位）に描かれるため、端点がディスク中心なら線の端は自然に隠れる
- `renderFrame` / `exportImage` はトークン円の中心＝線端が既に一致しているため変更不要（目視確認のみ）

### R5. アニメ側での図形・ペン編集
調査の結果、図形の選択・移動・リサイズはアニメモードでも既に動作（実測済み）。ペンの取り消し・全消しもスタジオに存在。**追加実装は不要**。R2 の修正によりテキストもアニメ側で編集可能になる。回帰確認項目に含めること。

## 2. 受け入れ条件
- [ ] スポットライトがUI・描画・出力・型から消え、spotlight を含む旧データも正常に読み込める（当該図形は無視）
- [ ] テキスト: 追加→即ピッチに現れ、パレットの入力欄で文字を打つとリアルタイムに反映される（編集モード・アニメ両方）。prompt は一切出ない
- [ ] zone/arrow/link の選択中に太さ3段が表示され、切替が画面・PNG・GIF に反映される
- [ ] 連結ライン・囲み枠の線がディスクの中心から出て、端がディスクに隠れる（編集・アニメ再生中とも）
- [ ] `npx tsc --noEmit` エラーなし
- [ ] 既存機能（ゾーン/矢印の編集・場面スコープ・ガイド・ペン・アニメ・保存/共有/出力）非破壊

## 3. やらないこと
- 上記以外の変更・リファクタ。ペンの機能変更。連結ライン以外の新図形。

## 4. リスク
| 機能 | 理由 | 確認方法 |
|------|------|---------|
| 旧データ読込 | spotlight 除去フィルタ追加 | spotlight入りlocalStorageで起動 |
| pendingフロー | kind 型縮小 | link/hull の作成が従来どおり |
| 再生追従 | applyPlayhead の更新順序変更 | 再生中に link/hull がディスク中心に追従 |
| 出力 | 太さ反映・spotlight除去 | PNG/GIF/印刷の目視 |

## 5. 完了条件（DoD）
受け入れ条件全チェック＋tsc クリーン＋変更ファイル一覧の報告。

---

# 追補: reviewer/qa 指摘の修正（C1ほか）

## F1（Critical）: link/hull 端点の stale（レンダー中の getBoundingClientRect 読み）
qa不具合1・2 / reviewer C1・W2 の統合対応。**レンダー中に discCenterPct を呼ぶ設計を廃止**する。
- `components/BoardProvider.tsx`:
  - `applyPlayhead` 内の link/hull 更新部を `syncAttachedShapes(st?: BoardState)` として関数に抽出（`st` 省略時は `stateRef.current`）。**read→write の二相化**: 先に `getPitchRect()` を1回と必要な全ディスク rect を読み取り、その後にまとめて `setAttribute`/style 書き込み（reviewer W2 対応）。`discCenterPct` は pitch rect を引数で受ける内部形に変更してループ内の冗長な getPitchRect を排除
  - `applyPlayhead` はトークン配置後に `syncAttachedShapes()` を呼ぶ（従来の更新順を維持）
  - context に `syncAttachedShapes` を公開
- `components/ShapesLayer.tsx`:
  - render 中の点計算は **actorPos のみ**（discCenterPct をレンダーから排除）
  - `useLayoutEffect`（依存: shapes / slots / opponents / ball / pitchView / mode / viewStep）で `board.syncAttachedShapes(board.state)` を呼び、コミット後の実測ディスク中心で補正（ペイント前に走るためチラつきなし）。**最新の state を引数で渡す**（stateRef はこの時点でまだ旧値のため）
- 受け入れ: 編集モードで link/hull が参照する選手をドラッグ→ドロップ直後に線が新位置へ追従。リロード（HYDRATE）直後も保存位置に一致。ハーフ/フル切替直後もズレない

## F2（Warning W1）: 毎キーストロークの全 state 保存
- `BoardProvider` の `saveState(state)` effect を **300ms デバウンス**（タイマー ref、次の変更でクリア）。挙動は保存タイミングのみの変更
- 受け入れ: テキスト連続入力中に localStorage 書き込みが毎打鍵で走らない

## F3（qa不具合4 / reviewer S3・S6）: テキスト入力の IME 安定化＋フォーカス
- `ShapesBar` のテキスト入力を **uncontrolled** に変更: `key={sel.id}` + `defaultValue={sel.text}` + `onChange` で `updateShape`（React が変換中に value を再供給しない）
- `autoFocus` を付与（新規作成→即入力できる）
- 受け入れ: 日本語IMEで「あいうえお」を変換入力しても欠落・カーソル跳びが起きにくい構造になっている（uncontrolled）

## F4（qa不具合3 / reviewer S5）: 太さ3段の値を既定値と一致させる
- 段値を変更: zone = 0.5 / 0.9 / 1.5、arrow = 0.7 / 1.1 / 1.8、link = 0.7 / 1.0 / 1.8
- 受け入れ: width 未設定の図形でも点灯段と実線幅が一致

## F5（reviewer W3）: addShape の型の抜け穴
- `addShape` の引数型を `"zoneEllipse" | "zoneRect" | "text" | "arrow"` に縮小し、else フォールバックを text 明示分岐に

## F6（reviewer S1）: renderFrame の取り残しコメント
- `drawActorToken` の doc から「スポットライト再描画」の文言を削除

## やらないこと
- reviewer S2（フォールバックのアンカーオフセット）・S4（SVG/Canvas の太さ比の厳密一致）は見送り（過渡的・軽微）

## DoD
受け入れ条件全チェック＋`npx tsc --noEmit` クリーン＋変更ファイル一覧の報告。指示書外の変更禁止。
