# 実装指示書: ボール所有モデル R1（保持・自動追従・互換）

作成: PM（2026-07-09）／ユーザー承認済み（案A: 所有モデル＋受け手直接タップ。R1はコア部分のみ、パス/シュート生成UIは R2 で別途）

## 概要
ボールを選手に「持たせる」と、以降ボールは保持者に自動追従する（ドリブルは保持者のルートを描くだけで再現）。従来の独立ボール（なぞりルート・自由配置）は完全に併存し、旧データは無改修で動くこと。

## 1. データモデル（lib/types.ts）
- `BoardState` に `holder?: Actor | null` を追加 — **アニメ開始時点（t=0）の保持者**。undefined/null = 従来どおり独立ボール
- `Move` に `to?: Actor | "goal"` を追加 — ボール move の到達先（R2 のパス/シュート生成で使用。R1 では型と再生解決のみ）
- `MoveKind` に `"shot"` を追加（R1 では型のみ。描画・生成は R2）
- `SavedPlay` / `ShareSnapshot` に `holder` を追加（lib/share.ts の buildSnapshot / snapshotToBoard も対応）

## 2. 再生の解決（lib/animation.ts）
- `export function holderAt(t: number, moves: Move[], initialHolder: Actor | null | undefined): Actor | null`
  - initialHolder から開始。**ボールの move**（actor==="ball"、絶対時刻順）を走査し、
    - move の開始時刻以降は保持解除（ボールが離れて飛んでいる）
    - move の終了時刻以降は `to` が Actor なら holder = to、`to === "goal"` または未定義なら null
- `actorPos` の ball 分岐を拡張（シグネチャ末尾に `holder?: Actor | null` を optional 追加）:
  1. t がボール move の区間内 → 従来どおり alongPath（ルート優先）
  2. 区間外 → `holderAt(t, moves, holder)` が非null → **保持者位置（actorPos再帰）＋前方オフセット `{ x: +1.2, y: +3 }`**（座標は 2..98 にクランプ）
  3. holder が null → 従来ロジック（直近 move 終点 or base の ball 位置）
- 呼び出し元すべてに holder を渡す: BoardProvider（applyPlayhead / syncAttachedShapes / playStep等は stateRef 経由）、GhostLayer、ShapesLayer、lib/renderFrame.ts、lib/printView.ts（renderFrame経由なら自動）

## 3. 状態・reducer（components/BoardProvider.tsx）
- `SET_HOLDER { holder: Actor | null }` アクションを追加。context に `setHolder(holder)` を公開
- `makeInitial` / `NEW_TACTIC`: `holder: null`。`normalizeBoard`: そのまま補完不要（undefined可）。`LOAD_TACTIC` / `IMPORT_SHARED` / `cloneTactic` に holder を追加
- 整合処理:
  - `REMOVE`（スタメンから外す）: 外した slot が holder なら `holder: null`
  - `DELETE_OPPONENT`: holder が削除 opp なら null、より大きい opp インデックスなら詰め替え（moves と同じルール）
- **保持中の編集追従**: `MOVE_SLOT` / `TRANSLATE_ACTOR` / `SWAP` の後、holder が非null なら `ball` 座標を「holder の現在位置＋前方オフセット { x:+1.2, y:+3 }（クランプ）」に更新（reducer 内で一貫処理。ヘルパー関数化してよい）

## 4. 「持たせる／外す」UI（components/usePointerDrag.ts、編集モードのボールのみ）
- 編集モードでボールをドラッグして離したとき:
  - ドロップ位置がいずれかの**選手（pid あり slot）または相手トークン**のディスク中心から 40px 以内（既存 `overlappingOccupiedSlot` と同じ px 閾値。opp も対象に含める拡張判定を実装）→ `setHolder(そのactor)`＋ball をそのactor前方へ（reducer の SET_HOLDER 内で ball も前方座標へ更新してよい）＋toast「◯◯（名前 or 相手n）にボールを持たせました」
  - どのディスクにも重ならない → `setHolder(null)`＋従来どおり `setBall(位置)`（保持解除。保持中だった場合は toast「ボールを離しました」、元々 null なら toast なし）
- アニメモードのボール操作（なぞり＝独立ルート、移動ツール）は**変更しない**

## 5. 可視化
- 保持中はボールが保持者の前方に表示される（データ上 ball 座標が前方に保たれる＋再生は actorPos が追従）
- 保持者のディスクに小さなボールマーク: PlayerToken / OppToken で `board.state.holder === actor` のとき `.disc` に `hasball` クラス → CSS で右下に小さな白いボール風の円（12px、白グラデ＋黒极点、既存 .capt バッジと同様の absolute 配置。左上の .capt と被らないよう**右下**）
- 凡例や線種は変更なし（R2で shot 追加予定）

## 6. 受け入れ条件
- [ ] 編集モード: ボールを選手のディスクへドロップ→保持（ボールが前方に付き、ディスクにマーク表示・toast）。相手トークンにも持たせられる
- [ ] 編集モード: 保持者をドラッグ移動するとボールも前方に付いてくる。入れ替え（SWAP）でも破綻しない
- [ ] アニメ: 保持者にルートを描いて再生すると**ボールがルート不要で自動追従**する（前方オフセット付き）
- [ ] アニメ: ボール単体のなぞりルートは従来どおり動き、その move 区間はルート優先・終了後は保持なし（こぼれ球）として振る舞う
- [ ] ボールを空きスペースへドラッグ→保持解除で完全に従来動作へ戻る
- [ ] スタメンから外す/相手削除で holder が正しく解除/詰め替えされる
- [ ] 旧データ（holder なし）は全機能従来どおり
- [ ] 保存/読込/共有リンク/複製で holder が保持される。GIF/WebM（renderFrame）でも追従が反映される
- [ ] `npx tsc --noEmit` クリーン

## 7. やらないこと（R2 以降）
- 受け手タップによるパス生成、ゴールタップのシュート、shot 線種の描画、保持者選択時のヒント表示
- 上記以外の変更・リファクタ禁止

## 8. 実装メモ
- 前方オフセットは共有定数（例: `lib/animation.ts` に `BALL_CARRY_OFFSET = { x: 1.2, y: 3 }`）とし、reducer / actorPos で共用
- actorPos の ball→holder 再帰は1段のみ（holder は ball を持てないため無限再帰なし）
- コメント日本語・絵文字グリフ禁止・devサーバー起動禁止
