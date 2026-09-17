# グループ機能の全面展開 Phase 2 仕様

作成：2026-09-17／設計：fable5／実装：sonnet5／レビュー：opus5
前提：`specs/groups-everywhere.md`（Phase 1 実装済み・commit 2ed08a6）。§5 の残り 4 領域を実装する。
対象：戦術ボード／試合記録／サッカーノート（コーチ）／チャット。スマホ・PC 両方。

## 0. 目的

選手 70 人（中1〜中3）になったので、選手を選ぶ・並べる・集計する画面はどこも「全員」だと使えない。
学年グループとスタッフが作るカスタムグループで、どの画面も絞り込めるようにする。

共通ルール（全領域）：
- グループの正本は `useTeam().groups`（学年が先・カスタムが後）。選手は `useBoard().state.players`。所属判定は `lib/groups.ts` の `playerInGroup` / `membersOf`。`loadTeam()` 直読みで groups を取らない。
- 絞り込みの保存は `useGroupFilter(key)`。**保存されている ID が現在の groups に無ければ「すべて」とみなす**（描画に使う前に無効化。TeamHub の `calGroupEff` と同じ作法）。
- 「グループ」という語はポジション大分類（`lib/formations.ts` の `Group`/`groupOf`）と衝突する。新しい変数名はチームのグループ側を `teamGroup` / `tg` / `filterGroup` とし、`groupOf` と混同しない。
- グループが 1 つも無いチームでは、チップの行ごと出さない（既存の挙動を変えない）。

## 1. 共通部品の拡張（`components/GroupChips.tsx`・`lib/storage.ts`）

- `saveGroupFilter(key, ids)` の保存後に `window.dispatchEvent(new Event("alfa-groupfilter"))` を発火。`useGroupFilter` はこのイベントを購読して同じ key の値を読み直す（同じ key を使う複数の部品が同時に出ていても揃う。`alfa-notifseen` と同じ作法）。
- `useGroupFilter` の戻り値はそのまま（`[string[], (ids) => void]`）。有効化の判定は呼び出し側で行う。小さなヘルパー `resolveFilterGroup(ids, groups): TeamGroup | null`（単一選択用。ID が無効なら null）を `lib/groups.ts` に追加して各画面で使う。

## 2. 戦術ボード

保存 key は **`"board"` の 1 本**（配置シート・ボードの名簿シート・ベンチで共有）。単一選択、`allowAll`、`onManage` は付けない。

### 2-1. 「選手を配置」シート（`SheetManager.tsx` の `AssignBody`。スマホのシートと PC の右パネルで共通）

- 検索欄（`.controls`）と一覧（`.list`）の間に `GroupChips`。
- 一覧は「未配置 ∧ 検索語 ∧ 選択グループの所属」で絞る。並びは現状どおり（枠の役割と同じ大分類を上）。
- グループ選択中は、チップの下に 1 行の補助文（12px `--mut`）：「中3：23人（配置済み 8人）」。
- 一覧が 0 件で、理由が「このグループの選手が全員配置済み」のときは空メッセージを「このグループの選手は全員配置済みです。」に変える。
- **「このグループで自動配置」**：グループ選択中だけ、補助文の右（狭ければ下）に枠線ボタン（高さ 44px、`--accent` 文字・1px `--outline`）。
  - 対象は **空いている枠だけ**（配置済みの選手は動かさない）。候補は「選択グループの所属 ∧ 未配置」。
  - 割り当て順：枠を GK→DF→MF→FW（`groupOf(slot.role)`）の順、同分類内は slots の配列順に処理。各枠に対し ①`p.position === slot.role` の選手 ②同じ大分類の選手 の順で名簿順に先頭を取る。どちらも居なければその枠は空きのまま（FW を GK に入れない）。
  - 1 回の dispatch で反映する。`BoardProvider` に reducer アクション `ASSIGN_MANY { pairs: { slot: number; pid: string }[] }` と API `assignMany(pairs)` を追加（同じ pid が他の枠に居れば外してから入れる点は `ASSIGN` と同じ）。取り消し用に `UNASSIGN_MANY { pairs }` と `unassignMany(pairs)`：**その枠の pid が pairs の pid と一致する枠だけ** null に戻す（その枠が `holder` なら `REMOVE` と同じく holder も解除）。context の公開箇所すべてに足す。
  - 実行後、シートは閉じず **結果表示**に切り替える（`AssignBody` のローカル state）：見出し「自動配置しました」、本文「中3 から 8人を空き枠に配置しました。」（空きが残れば「3 枠は合う選手がいないため空きのままです。」を足す）、配置した「役割 → 選手名」の一覧（`.prow` の文法、タップ不可）、ボタン 2 つ：「元に戻す」（枠線）＝`unassignMany` して通常の一覧へ戻る／「閉じる」（`.bigbtn`）＝`closeSheet`。
  - 配置できる選手が 0 人なら実行せず toast「配置できる選手がいません」。
- PC のセットプレー画面ではこのシートが中央ダイアログで出る。レイアウトが崩れないこと。

### 2-2. ボードの名簿シート（`SheetManager.tsx` の `RosterSheet`）

- 検索欄の下に同じ `GroupChips`（key `"board"`）。見出しの人数は絞り込み後の人数「名簿 23人」。

### 2-3. ベンチ（`components/Bench.tsx`）

- 見出し行（`.bh`）の下に `GroupChips`（key `"board"`）。控えの一覧を選択グループで絞る。見出しの「控え n人」は絞り込み後の人数。
- 絞り込みで 0 人のとき：「このグループの控え選手はいません。」
- ドラッグ交代の挙動は変えない。PC 右カラムのスタッツ（スタメン／控え／登録選手）は変えない（全体の数のまま）。

## 3. 試合記録

### 3-1. データ

```ts
export interface MatchRecord {
  // 既存のまま…
  /** 対象グループ。未定義または空＝チーム全体 */
  groupIds?: string[];
}
```

- `lib/storage.ts` の正規化：配列でなければ `undefined`。`TeamProvider.removeGroup` と学校区分変更の後始末（`setSchoolStage` の removedIds）で `matches[].groupIds` からも ID を外す（空になったら `undefined`）。
- ラベルは `targetLabel` と同じ作法（解決できる ID が無ければ「全体」）。小さなヘルパー `matchTargetLabel(m, groups)` を `lib/groups.ts` に。
- サンプル：`TeamProvider` のサンプル試合のうち 1 件（練習試合）に `groupIds: [SAMPLE_GROUP_A_ID]`。他は未設定のまま。

### 3-2. 試合記録フォーム（`TeamHub.tsx` の `SheetHost` 内 `sheet.type === "match"`）

- フォーメーションの select の **前** に「対象」欄（`.formfield` > label「対象」> `GroupChips multi allowAll allLabel="全体"`、`onManage` は付けない）。保存時に `groupIds`（0 件なら `undefined`）。
  - 初期値：編集＝`mr.groupIds`。予定から開いた新規（`mpf.eventId`）＝その予定の `groupIds` のうち現存するもの。それ以外の新規＝`loadGroupFilter("matchForm")`（前回の選択。無効 ID は除く）。変更のたびに `saveGroupFilter("matchForm", ids)`（編集時は保存しない）。
- 「対象」の直下にチェック 1 つ：**「対象外の選手も候補に出す」**（既定オフ。`.formcheck` 相当の既存の文法があればそれを使う。無ければ label＋checkbox を基底 CSS で追加）。
- 選手を選ぶ select の候補（スタメン各枠・得点者・アシスト・交代 OUT/IN のすべて）：
  - `base` = 対象が空 または チェック ON → 全選手。そうでなければ対象グループのいずれかに所属する選手（OR）。
  - 各 select の option = `base` ∪ **その select で現在選ばれている選手**（末尾に足し、ラベルに「（対象外）」）。選択済みの値が候補から消えて表示と state がずれる事故を防ぐ。
  - `selectedElsewhere`（他枠で選択済みを disabled）は全選手ベースのまま。
  - 「＋ 得点者を追加」「＋ 交代を追加」の既定選手（`firstPid`）は `base` の先頭。
  - 対象を狭めたとき、選択済みの選手は消さない（自動クリアしない）。
- `sheetKey` の match キーに `prefill.eventId` を含める（別の予定から開いたら作り直す）。
- 試合詳細（`MatchDetailBody`・PC の `RecMatchPane`）に「対象」行（全体のときは出さない）。

### 3-3. 試合記録の一覧（`MatchesTab`・PC の `RecSummaryPane`）

- 大会フィルタの下に `GroupChips`（単一選択・`allowAll`）。state は `Inner` に持ち上げ（`cmp` と同じ。`useGroupFilter("matches")`）。
- 絞り込み：選択グループを `groupIds` に含む記録 **＋ 対象が全体の記録**（カレンダーと同じ考え方）。勝敗・得失点・得点ランキング・PC 右ペインのサマリーは絞り込み後の記録から計算。
- 記録カードに対象バッジ（`.evgroups targeted` の文法。全体のときは出さない）。
- 選手・保護者の表示（公開時）にもチップは出す（絞り込みのみ）。

## 4. サッカーノート（コーチ）

保存 key は **`"notebook"` の 1 本**（提出一覧・ダッシュボード・KPI 内訳・検索で共有）。単一選択・`allowAll`。

- `NotebookScreen`：コーチのとき、種別チップ（`.fbar`）の下に `GroupChips` の行（`.nbgroupbar`）を **ホーム（ダッシュボード）と提出のタブで** 出す（配信・通知のタブでは出さない）。変更時は `setSelNote(null)` など PC 右ペインの選択を解除（種別チップと同じ）。
- 絞り込みの実体は「対象選手の集合」：`filterGroup ? players.filter(p => playerInGroup(p, filterGroup)) : players`。
- 提出一覧（`NoteList`）：`entries` を対象選手の `playerId` で絞る（「予定別」表示も同じ）。名簿外の選手のノートは「すべて」のときだけ出る。
- ダッシュボード（`NotebookTools.tsx` の `CoachDashboard`）：props で対象選手と、対象選手のノートだけにした notebook を受け、**すべての値を同じ母集合に揃える**：`kpis`／`computeTeamSummary` の第 2 引数／`weekNoteDiff`／`teamWeeklyChart`／`unseenAll`／`heatByPlayer`／`AnalyticsPanel`（種別・選手別・合計）。useMemo の依存に足すこと。
  - `AnalyticsPanel` の静的チップ「選手 全員」は、絞り込み中は「選手 中3（23人）」。
  - groups・TeamData は `useTeam()` から（`loadTeam()` 直読みをやめる）。
- KPI 内訳（`SheetManager.tsx` の `KpiBody`。スマホのシートと PC のインライン）：同じ key を `useGroupFilter("notebook")` で読み、同じ母集合で計算。見出しに「（中3）」を添える。絞り込み中は「名簿外の選手」の行を出さない（「すべて」のときだけ）。
- 検索（`NoteSearch`）の選手 select：絞り込み中は対象選手だけ ∪ 現在の選択。
- 選手・保護者の画面は変えない。

## 5. チャット：グループスレッド

### 5-1. キーと見え方

- スレッドキー `grp:<groupId>`。`lib/types.ts` に `groupThreadKey(id)`／`threadGroupId(key)` を追加し、コメントのキー体系も更新。`"p:" +` のベタ書き（`SendTarget.tsx`・`SheetManager.tsx` の `ChatSheet`）は `dmThreadKey`／`threadPlayerId` に寄せる。
- 参加者＝そのグループの **現在の** メンバー＋スタッフ。所属は毎回 `playerInGroup` で評価する（外れた選手には過去分も見えなくなる。配信・連絡と同じ）。
- **グループが削除されたら、そのスレッドは誰にも表示しない**（予定・連絡の「全員にフォールバック」はチャットでは行わない。グループ宛の内容が全員に漏れるのを防ぐ）。メッセージ自体は消さない。
- スタッフ：グループスレッドを開いて送信できる。
- 選手・保護者：既存どおり 1 本のタイムライン。**「チーム全員」＋「所属グループ宛」＋「自分の個別」** をまとめて表示する。送信は既存どおり自分の個別スレッド（スタッフ宛）だけ。グループスレッドへの選手の投稿は今回は入れない（「チーム全員」と同じ、スタッフからの一斉連絡の扱い）。
  - 吹き出しの宛先バッジ（`.chatbadge`）：チーム全員＝「全員」（既存）、グループ宛＝グループ名、個別＝なし。
  - タイムラインの上に 1 行の説明（12px `--mut`）：「チーム全員・中2・Aチーム宛てと、スタッフとの個別メッセージが表示されます」（所属グループ名を並べる。所属なしなら既存の意味の文）。`TeamHub` の `ChatTab` と PC の `ChatScreen`（選手ログイン時）の両方。
- 未読バッジ・通知への追加は今回やらない（チャットには元から未読の仕組みが無い）。

### 5-2. 会話一覧（`ChatScreen.tsx` の `CoachConversations`。PC とスマホ共通）

- 構成：「チーム全員」→ 小見出し **「グループ」**＋各グループの行（学年→カスタムの順）→ 小見出し **「個人」**＋`GroupChips`（key `"chat"`・単一選択・`allowAll`）＋個人の行。
- グループの行：アバターはラベルの短縮（末尾の「チーム」を外して先頭 2 文字。「中3」「A」「GK」）。名前の右に人数「23人」（12px `--mut`）。プレビューは既存と同じ（0 件なら「メッセージはまだありません」）。
- 個人の行：選択グループで絞り込み。並びは **メッセージがある相手を新しい順に先**、その後ろに名簿順。
- グループが無いチームでは「グループ」の小見出しごと出さない。小見出しは新規クラス `.convsec`（12px・`--mut`・左右 16px）。
- PC の選択復元（`lastCoachThread`）：存在しないグループのキーなら未選択に戻す。

### 5-3. スレッドの見出し

- PC の `.chatpanehead`：`threadTitle` をグループ対応。グループのときはアバターを短縮ラベルに、名前の右のピル（既存 `.chatpaneall` の文法）に「23人」。
- スマホの `ChatSheet`：`MobileHeader` の title を「中3（23人）」。

### 5-4. 宛先の選択（`SendTarget.tsx`。戦術・セットプレー・練習メニューの送信）

- `mode` に `"group"` を追加、`groupIds?: string[]`。UI はラジオ「グループ」＋選択時に `GroupChips multi`（groups は props で受ける）。
- `targetThreadKey` を `targetThreadKeys(t): string[]` に（none＝[]、team＝["team"]、player＝[dm]、group＝各 `grp:`）。呼び出し 2 箇所（`SheetManager.tsx` の送信・`DrillEditor.tsx` の `sendDrill`）はキーごとに `sendMessage`。グループ未選択のまま送信しようとしたら toast「グループを選んでください」。

### 5-5. サンプル

- `BoardProvider.sampleMessages()` に 2 通追加：`grp:grp_grade_3` 宛「中3は土曜の公式戦に向けて、木曜はセットプレーの確認をします。」、`grp:grp_a` 宛「Aチームは金曜の練習試合、9時15分キックオフです。集合は8時30分。」（初回シード時のみ）。

## 6. CSS（`app/globals.css`）

- 新規ルールは基底に書く。`@media` は 9 本のまま。PC で崩れる箇所だけ、2 つ目の PC ブロック末尾の `/* === mobile-redesign PC reset === */` に追記。
- 新規クラスの候補：`.assignhint`（補助文＋自動配置ボタンの行）、`.assignresult`、`.benchfilter`、`.nbgroupbar`、`.convsec`、`.convcount`、`.formcheck`（無ければ）。色はトークンのみ（`--accent`／`--mut`／`--outline`／`--surface*`）。新規 hex・グラデーション・絵文字は禁止。文字は 12px 以上。スマホのタップ領域は 44px 以上。緑（`--primary`）は主ボタンだけ。
- チップは既存の `.grouppick` をそのまま使う。横に溢れるときは折り返し（既存の挙動）。ベンチ・会話一覧など狭い場所でも横はみ出しゼロ。

## 7. 変えないもの

- Phase 1 の挙動すべて。カレンダーの絞り込み（`soccer_tactics_calgroup_v1`）。保存キー。旧データの互換（`groupIds` 無しの試合記録＝全体）。
- 戦術ボードの保存データ形式（slots／ライブラリ）。ホームのスタッツ（勝率など）はチーム全体のまま。
- チャットの既存スレッド（チーム全員・個人）とメッセージの保存形式（`to` に新しいキーが増えるだけ）。

## 8. 受け入れ基準

1. 配置シート：チップで一覧が絞られる。中3 を選んで「このグループで自動配置」→ 空き枠だけが中3 の選手で埋まり、GK 枠には GK の選手だけが入る。結果表示の「元に戻す」で配置前に戻る（元から居た選手は動かない）。ベンチと名簿シートも同じ選択で絞られる。
2. 試合記録：Aチーム対象の予定から「この試合の結果を記録」→ 対象に Aチームが入り、スタメンの候補が Aチームの選手だけ。「対象外の選手も候補に出す」で 70 人。選んだ後に対象を変えても選択は消えず「（対象外）」付きで残る。保存後、一覧で Aチームを選ぶとその記録と全体の記録が出て、Bチームではその記録が出ない。
3. サッカーノート：中2 を選ぶと提出一覧が中2 の選手のノートだけになり、ダッシュボードの選手数・今週のノート・未確認の提出・ヒート表・KPI 内訳が同じ母集合で一致する。
4. チャット：スタッフの会話一覧にグループの行が出て、中2 宛に送ると選手（佐藤 蒼空＝中2）のタイムラインに「中2」バッジ付きで出る。中3 の選手（yamato@alfafc.example）には出ない。グループを削除するとそのスレッドは一覧から消え、選手にも出ない。戦術の送信でグループ宛を選べる。
5. `npx tsc --noEmit` 成功、`@media` 9 本、スマホ全画面ではみ出しゼロ、PC の変更対象外の画面は変更前と一致（動的差分を除く）。

## 9. 検証手段

- 開発サーバー http://localhost:3000（落ちていたら `(nohup npm run dev > /tmp/alfa_dev.log 2>&1 &)`）。`next build` 禁止。
- ツール：`scratchpad/tools/`（`mobile_audit.js <outdir>`、`pc_baseline.js <outdir>`、`compare.py diff <base> <new> <diffdir>`）。Phase 2 着手前の基準は `p2_pc_base/`・`p2_m_base/`。PC のホーム／チャット／チーム運営／サッカーノートは日付由来の動的差分あり。
- 初回シードを確認するときは localStorage を全消去してから読み込む。スタッフはデモログイン（任意メール）、選手は `sora@alfafc.example`（中2・Aチーム）と `yamato@alfafc.example`（中3・Bチーム）、共通パスワードはログイン画面に表示。
- `window.confirm` は puppeteer で `page.on("dialog", d => d.accept())`。PC のトークンのタップは `pointerType: "mouse"` が必要。
