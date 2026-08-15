# 実装指示書 Round B: ペン・図形の Keynote 風選択UI

作成: PM（2026-07-09）／ユーザー承認済み（採用: 常時クリック選択＋Delete削除＋Esc解除＋選択物近くのミニツールバー。複製・矢印キー・ストロークのドラッグ移動は今回対象外）

## B1. パレットを開かなくても図形をクリックで選択できるように
- `components/ShapesLayer.tsx`: 図形要素（zone/arrow/text/link/hull とハンドル）の `pointerEvents` を現在の「`shapesOpen || selShape` のときのみ auto」から**常時 auto**に変更（ペン penMode 中は pen svg が最前面で覆うため描画と衝突しない。図形は z-index 1 でトークンの下＝トークン優先は維持）
- 図形を選択したら該当パレットを自動で開く: 選択ハンドラで `board.setShapesOpen(true)` を呼ぶ（編集の fbarshapes・スタジオの ShapesBar は同じ `shapesOpen` を参照しているため一本で両対応）
- ドラッグ移動・リサイズも常時可能になる（Keynote と同じ）。既存の背景タップ選択解除・トークン優先は維持

## B2. ペンストロークの選択と個別削除
- `lib/types.ts`: `PenStroke` に `id?: string` を追加。`normalizeBoard`（BoardProvider）で id 欠損ストロークに `stroke_<連番>_<rand>` を補完。`addStroke` も id 付与
- `components/BoardProvider.tsx`:
  - `selStroke: string | null` / `setSelStroke` を追加（**相互排他**: `setSelStroke` は selShape を、`setSelShape` は selStroke を解除する）
  - reducer `UPDATE_STROKE { id, patch: { color?, width?, dash? } }` と `DELETE_STROKE` の id 対応（既存 index 版は id 版へ変更し、呼び出し元を追随。UNDO_STROKE/CLEAR_STROKES は現状のまま）
  - 相手削除・場面削除などとの関係なし（ストロークは actor 非依存）
- `components/PenLayer.tsx`:
  - 各ストロークに**当たり判定用の透明ポリライン**（同じ points、`stroke="transparent"`、`strokeWidth = max(実効幅 * 2.5, 3)`、`pointerEvents: penMode ? "none" : "auto"`）を重ね、pointerdown で `setSelStroke(id)`（＋ `e.stopPropagation()`。ドラッグ移動は今回なし＝選択のみ）
  - 選択中ストロークの下に白のハイライト線（同 points、幅+0.8、opacity 0.85）を描く
  - penMode 中は当たり判定を無効化（描画優先）
- **キーボード**（`components/BoardProvider.tsx` の useEffect で document keydown を1箇所に集約）:
  - 入力中（`document.activeElement` が input/textarea）は無視
  - `Delete` / `Backspace`: 優先順位 selShape → selStroke → （アニメ中の）selMove の順で、選択中のものを1つ削除（toast「削除しました」）
  - `Escape`: selShape / selStroke / pendingShape / selMove / selActor を解除
- ストローク選択時の背景タップ解除: ShapesLayer の既存 pitch リスナーに selStroke も含める（`.pathsvg.pen` 配下は除外対象に追加）

## B3. 選択物の近くにミニツールバー（Keynote の書式バー風）
- 新規 `components/FormatBar.tsx`: `selShape` または `selStroke` があるとき、`.pitch` 内の absolute 要素として**選択対象のバウンディングボックス上辺の少し上**（ピッチ外にはみ出す場合は下側/内側にクランプ）に表示
  - 位置: 対象 DOM（shapeEls 登録要素・text div・ストローク polyline）の `getBoundingClientRect` を `getPitchRect` 基準の % に変換。レンダー毎計算でよい（図形の updateShape で再レンダーされるため追従する。位置読みは軽微につき許容）
  - 内容（既存クラス penswatch / penwidth / pendash / penscope / penact を流用した横一列・小型）:
    - ストローク選択時: 色5・太さ3（ペンと同じ値）・実線/点線・削除
    - 図形選択時: 色5・kind 別コントロール（zone/arrow/link=太さ3、arrow=実線/点線、text=サイズ3＋インライン入力（uncontrolled・ShapesBar と同仕様）、hull=人数バッジ）・（アニメ中のみ）場面スコープ・削除
  - `pointer-events: auto`、z-index 50、`touch-action: none`
- ShapesBar（パレット）の既存コントロールはそのまま残す（追加ボタン・ガイドトグルの場として継続。編集コントロールの重複は許容）
- `components/Pitch.tsx` に `<FormatBar />` を挿入（PenLayer より後）

## 受け入れ条件
- [ ] パレットを閉じた状態で図形をクリック→選択＋パレット自動オープン、ドラッグ移動・ハンドルも動く
- [ ] ペンの線をクリック→選択（白ハイライト）→ Delete キーまたはミニバーの削除で1本だけ消える
- [ ] Delete/Backspace が図形・ストローク・（アニメの）選択ルートに効き、テキスト入力中は誤発火しない
- [ ] Esc で選択・タップ待ちが解除される
- [ ] ミニツールバーが選択物の近くに出て、色・太さ・線種・削除が機能する（画面端でもはみ出さない）
- [ ] ペン描画（penMode）中はストローク選択が発動せず従来どおり描ける
- [ ] 旧データ互換（id なしストロークの読込）・保存/共有/出力非破壊・`npx tsc --noEmit` クリーン

## やらないこと
複製・矢印キー移動・ストロークのドラッグ移動・マーキー（範囲）選択・ShapesBar の再設計。指示書外の変更禁止。
