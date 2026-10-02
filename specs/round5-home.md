# ホーム画面の作り直し（2026-10-02・第 5 弾）

統括・設計：Fable 5.1 ／ 実装：Sonnet 5.5 ／ 読解・レビュー：Opus 5.5
前提：これまでの設計書の「共通の約束」（`@media` 9 本・基底と PC reset の置き場所・1 本目の PC ブロックは編集しない・色はトークン・文字 12px 以上・スマホのタップ 44px・dev サーバー操作とビルドの禁止・コミットしない・`E` を新しい見出しに使わない・入力欄は `.formfield`）。変えた箇所の注記は「p18 §n」。
現状の読解メモ：`~/.claude/alfa-verify-tools/p18/reports/`（pc-home.md・mobile-home.md・feeds.md。行番号つき）。

## 0. 依頼（ユーザーの言葉）

1. サッカーノートの予定別の「これからの予定」はいらない。
2. ホーム（スタッフ）：今月のトピックと最新の動きを削除。今週の提出〜リーグ順位の 4 つの枠は、サッカーノートとチャットのタイムラインにする（すべて・中1・中2・中3 の 4 つ。サッカーノートの提出と、メッセージが届いた場合）。それと最新のお知らせ。
3. ホーム（選手）：マイスタッツとノート未読を消して、目標と最新のお知らせ。
4. 選手用の PC 版だけ、ホームの次の予定の表示が簡素なので、スタッフ側のような表示にする。
5. 名簿のポジションが緑の人がいる。意味が無ければほかと同じ黒にそろえる。

---

## §1 予定別の「これからの予定」を外す（components/NotebookScreen.tsx・app/globals.css）

p17 §1 で足したものを全部外す：`upcoming`・`soonAll` の state と useMemo、「これからの予定」「今日までの予定」の見出し、`.evgrow.soon` の行、`.evgmore`、関係する CSS（基底の `.evgsech`・`.evgrow.soon*`・`.evgrowcount.soon`・`.evgmore`、PC reset と `(pointer: coarse)` の該当ルール）。予定別は p16 の状態（今日までの予定だけ。0 件の文言は p16 のまま）に戻す。

## §2 名簿のポジションの色（app/globals.css）

原因：ポジションの大分類（GK／DF／MF／FW）ごとに色を付けていた古いデザインの名残。GK・DF・FW の色トークン（`--gold`／`--blue`／`--orange`）は黒（`--ink`）に置き換え済みだが、MF の `--lime` だけ緑のまま残っていた。**緑に意味は無い。**

- 基底の `.pos.mf { background: var(--lime); }` を `var(--ink)` にする（名簿の PC の表・スマホ、戦術ボードの名簿／配置シートのポジションのピルが全部黒になる）。
- 不要になる `.teamapp:has(.mhead) .pos.mf { … }` の上書きは消す。
- 戦術ボードのコマ（`.disc.mf` の枠の色）や描画の色（lib/colors.ts）は変えない。

---

## §3 共通の部品（新規 `components/HomePanels.tsx`）

PC（HomeMenu.tsx）とスマホ（MobileHome.tsx）の両方から使う。データの集計は `components/homeData.tsx` に置く。

### 3-1 タイムライン（スタッフ）

`homeData.tsx`：

```ts
export type HomeTimelineItem = {
  id: string;                    // "note-<id>" | "msg-<id>"
  kind: "note" | "message";
  ts: number;
  playerId: string;
  name: string;
  /** 一覧に出す 1 行。ノート＝「練習ノートを提出」、メッセージ＝本文の先頭（改行は空白に。添付だけなら「画像を送信」など既存の文言に合わせる） */
  text: string;
  unread: boolean;               // ノート＝staffSeenAt が無い／メッセージ＝ts > (chatReads[m.to]?.staff ?? 0)
  noteKind?: NoteKind;
  noteId?: string;
};
export type HomeTimelineScope = { key: string; label: string; items: HomeTimelineItem[]; unread: number; unreadNotes: number; unreadMessages: number };
/** スタッフのホームのタイムライン。scope は「すべて」＋学年グループ（team.groups の kind==="grade" の並び順） */
export function useHomeTimeline(board: BoardCtx, team: TeamCtx): HomeTimelineScope[];
```

- 材料：`board.notebook`（全件。提出時刻 `ts`）と、`board.messages` のうち選手・保護者から届いたもの（`isMemberFrom(m.from)`。lib/chat.ts）。名簿に居ない選手の分は入れない。
- 並びは `ts` の新しい順。scope ごとに最大 30 件（未読の件数は切る前の全件で数える）。
- 学年の scope は `playerInGroup(player, g)` で絞る。学年グループが 0 件のチームは「すべて」だけ。

部品 `HomeTimeline({ scopes, variant })`（`variant: "pc" | "mobile"`）：

- 上：scope の数だけタイル（今の 4 つの枠の見た目をそのまま使う）。
  - PC：`div.kpicard2.mdb-pulse.hp-tl` の中の `div.kpiband.hp-scopes` に `button.kpitile`（色のクラスは `mdb-tile-notes`／`mdb-tile-att`／`mdb-tile-win`／`mdb-tile-rank` を順に繰り返す）。選択中は `.on`。
  - スマホ：`div.mh-section.mh-kpis.hp-scopes` に同じ `button.kpitile`。
  - タイルの中身：`.kv`＝未読の件数、`.kl`＝scope の名前（「すべて」「中1」…）、`.mdb-kpidelta`＝「ノート N ・ メッセージ M」（未読の内訳。どちらも 0 なら「未読なし」）。
  - 選択の state は部品の中（既定は「すべて」）。自動で切り替える機能・チェックボックスは無くす。
- 下：選んだ scope の一覧（PC は同じカードの中の `div.kpichart.hp-tllist`、スマホは `div.mh-section.mh-panel.hp-tllist`）。見出し `.hp-h`「タイムライン」＋右に小さく scope の名前。
  - 行 `button.hp-row`（`.unread` で未読）：左にアイコン（ノート＝`NoteKindIcon` を `.notecond.k-*` と同じ色で 20px／メッセージ＝`IconChat` 20px・`--mut`）、中央に `.hp-row-main`（`<b>{名前}</b>`＋`<span>{text}</span>`。1 行・省略記号）、右に `.hp-row-time`（lib/chat.ts の `fmtListDate(ts)`：今日は HH:MM、昨日、M/D）。未読は名前の前に青い点（`.hp-dot`）。
  - 押したとき：
    - ノート → サッカーノートでそのノートの詳細を開く。`BoardProvider` に `noteIntent: { noteId: string } | null` と `setNoteIntent` を足し（`teamIntent` と同じ作法）、`board.setNoteIntent({ noteId }); board.setScreen("notebook");`。`NotebookScreen` は起動時・変化時に intent を読んで、提出の一覧でそのノートを選び（PC＝右ペイン、スマホ＝詳細の表示）、intent を null に戻す。ノートが見つからなければ何もしない。
    - メッセージ → `board.setScreen("chat"); board.openSheet({ type: "chat", chatTo: dmThreadKey(playerId) });`（NotebookScreen.tsx の既存の遷移と同じ順）。
  - 0 件：`.hp-empty`「まだ届いていません。」
  - 件数が多いとき：PC は一覧の高さを最大 360px にして中でスクロール。スマホは先頭 8 件＋「すべて表示（N 件）」のテキストボタン（`.hp-more`。押すと全部）。

### 3-2 最新のお知らせ（スタッフ・選手共通）

`HomeAnnouncements({ viewer, variant })`（`viewer: "staff" | "player"`）：

- 材料：`sortAnnouncements(visibleAnnouncements(team.team.announcements, isStaff, me, team.groups))`（lib/chat.ts。固定が先、新しい順）の先頭 5 件。
- 器：PC は `div.mdb-panel.hp-ann`、スマホは `div.mh-section.mh-panel.hp-ann`。見出し `.hp-h`「最新のお知らせ」＋右にテキストボタン `.hp-link`「すべて見る ›」（→ `board.setScreen("chat")`。チャットは「お知らせ」側が開くこと。既存の保存値 `soccer_tactics_chatseg_v1` の扱いを確かめ、必要なら「お知らせ」に切り替えてから移る）。
- 行 `button.hp-row`：`.hp-row-main` に `<b>{件名}</b>`（`announcementParts(a).subject`。固定は前に「固定」の小さなタグ `.hp-tag`）＋`<span>`（宛先 `announcementTarget(a, groups).label`。スタッフは続けて「・既読 N／M」＝`announcementStats`）。右に `.hp-row-time`（`fmtListDate`）。選手は未読（`!a.seenBy?.includes(me)`）のとき `.unread`＋青い点。
- 押したとき：`board.setScreen("chat"); board.openSheet({ type: "annDetail", annId: a.id });`
- 0 件：`.hp-empty`「お知らせはまだありません。」

### 3-3 目標（選手）

専用の「目標」データは無い（2026-10-02 時点）。既にある 3 つの目標をまとめて出す。新しい入力画面は作らない。

`HomeGoals({ playerId, variant })`：器は PC `div.mdb-panel.hp-goals`／スマホ `div.mh-section.mh-panel.hp-goals`。見出し `.hp-h`「目標」。行は値があるものだけ（`dl.hp-goallist > div.hp-goal > dt + dd`。押せる行は `button.hp-goal`）：

| 行（dt） | 値（dd） | 元 | 押したとき |
|---|---|---|---|
| 練習の目標 | 直近の練習ノートの `goalPre`。下に小さく「M/D(曜) ・ 達成度 N%」（`achievement` があるとき） | `board.notebook` の自分の `PracticeNote` のうち `goalPre` があるもので `date` が最新 | `board.setScreen("notebook")` |
| 成績の目標 | 「評定平均 3.8」＋期限があれば「（中3・2学期まで）」。`actions` があれば下に小さく | `useProfiles()` の `gradeGoal`（lib/profile.ts の GradeGoal。学年のラベルは `gradeLabel(team.schoolStage, g)`） | `board.setScreen("profile")` |
| 将来の目標 | `career.futureGoal` | `useProfiles()` | `board.setScreen("profile")` |

- 3 つとも無いとき：`.hp-empty`「目標はまだありません。サッカーノートの「今日の目標」や、プロフィールの成績表・進路で設定できます。」
- プロフィールの取り方（`useProfiles` の API・`PlayerProfile` の形）は `components/ProfileProvider.tsx` と `lib/profile.ts` を読んで合わせる。

### 3-4 CSS（app/globals.css）

新しいクラスは `hp-*`。**基底に書く**（スマホ・PC 共通）。PC だけの調整は PC reset。

- `.hp-h`（見出し行。flex・space-between・`--fs-title-s`・700・margin-bottom 8px）、`.hp-h small`（`--mut`・12px・400）、`.hp-link`（テキストボタン。`--accent`・12px・700・min-height 44px。PC reset で 28px）。
- `.hp-row`（全幅のボタン。flex・align center・gap 10px・min-height 48px・padding 6px 2px・背景なし・下罫 1px `--outline`・左寄せ。最後の行は罫なし）、`.hp-row-main`（flex 1・min-width 0・縦 2 段。`b` は 14px・700・1 行省略、`span` は 12px・`--mut`・1 行省略）、`.hp-row-time`（12px・`--mut`・nowrap）、`.hp-dot`（8px の丸・`--accent`・未読だけ）、`.hp-row svg`（20px）、`.hp-tag`（12px・`--mut`・1px `--outline`・`--r-sm`・padding 0 4px）。
- `.hp-empty`（12px・`--mut`・padding 12px 2px）、`.hp-more`（`.hp-link` と同じ見た目・左寄せ）。
- `.hp-goallist`（margin 0）、`.hp-goal`（全幅・縦 2 段・padding 8px 2px・下罫。`dt` は 12px・`--mut`、`dd` は 14px・margin 0。`dd small` は 12px・`--mut`・display block）。
- `.hp-tllist`（PC reset で `max-height: 360px; overflow-y: auto`）。
- PC reset：`.hp-row { min-height: 40px }`、`(pointer: coarse)` で 44px に戻す。PC の `.hp-scopes.kpiband` は scope が 5 つ以上でも崩れないよう `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`（既存の `.mdb-pulse .kpiband` の指定を確かめ、同じ詳細度以上で上書き）。

---

## §4 スタッフのホーム

### PC（HomeMenu.tsx の MatchdayBoard）

上から：あいさつ・ベル（今のまま）→ ヒーロー（今のまま）→ **`HomeTimeline`**（今の 4 つの枠＋グラフの場所）→ **`HomeAnnouncements viewer="staff"`** → 今月のハイライトのチップ（今のまま。1 件以上のときだけ）。

- 削除：4 つの指標タイルとグラフ（`.kpicard2.mdb-pulse` の中身。自動切り替えの state・effect・`localStorage[alfa_home_autorotate]` の読み書きも）、「今月のトピック」、「最新の動き」（自動送りの state・effect も）、`.mdb-cols` の 2 列。
- 使わなくなった import・state・補助関数（`MdbChart`・`MdbRing`・count-up など、ほかで使っていなければ）を消す。`useMatchdayData` の戻り値の未使用の項目は、フックの側はそのままでよい（スマホ・選手と共用のため、無理に削らない）。
- `HomeAnnouncements` は全幅の 1 枚（`.mdb-panel`）。

### スマホ（MobileHome.tsx の MobileStaffHome）

上から：ヘッダー・あいさつ・ベル（今のまま）→ ヒーロー（今のまま）→ **`HomeTimeline variant="mobile"`** → **`HomeAnnouncements viewer="staff" variant="mobile"`** → ハイライトのチップ・フッター（今のまま）。指標 2×2・グラフ・今月のトピック・最新の動きは削除。

---

## §5 選手のホーム

### PC（HomeMenu.tsx の選手の分岐）

今の `.app.homeapp` の旧 JSX（`.homehero`・`.hdash`（予定＋ノート未読）・マイスタッツ・スタッツの内訳・`.appgrid`）をやめ、スタッフの PC ホームと同じ器で作り直す：

```
div.mdb-root
  div.mdb-greetrow > div.mdb-greetin
    div.mdb-greet（.mdb-date ／ .mdb-name「こんにちは、{名前}さん」＋ .mdb-role「選手・保護者」）
    div.mdb-greetactions（button.homeout「ログアウト」。ベルは出さない）
  div.scroll.mdb-scroll
    ヒーロー（スタッフと同じ .mdb-hero ／ 予定が無いときは .mdb-herothin）
    div.mdb-cols（2 列）：HomeGoals ｜ HomeAnnouncements viewer="player"
```

- ヒーローはスタッフの JSX を共通の部品（`MdbHero`。HomeMenu.tsx 内でよい）に切り出して両方から使う。データは `useMatchdayData(board, team, playerId)`（自分が対象の予定だけ）。選手のときの違いは、スマホの選手のヒーロー（`MhomeHero` の呼び出し）と同じ：出欠の欄は見出し「自分の出欠」・値は自分の回答（出席／欠席／未定／未回答）、ボタンは「出欠を回答する」（→ `setTeamIntent({ tab: "cal", eventId })` して team へ）、予定が無いときは「次の予定はまだありません」＋「チームのカレンダーを見る ›」。
- 1 本目の PC ブロックの `.mdb-*` の CSS は編集しない（そのまま効く）。選手で足りない調整があれば PC reset に足す。
- 選手の PC ホームでしか使っていなかったコード（`noteUnread`・`todayInfo`・`myTech`・`openStat`・`statSel`・`Tile`・`StatBody` の import など）は、ほかで使っていなければ消す。フックの呼び出し順（React のルール）を壊さないこと。

### スマホ（MobileHome.tsx の MobilePlayerHome）

上から：ヘッダー・あいさつ（今のまま）→ ヒーロー（今のまま）→ **`HomeGoals variant="mobile"`** → **`HomeAnnouncements viewer="player" variant="mobile"`** → フッター。4 つの数値の枠・直近の試合・最新の動きは削除。

---

## §6 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. サッカーノートの予定別に「これからの予定」が無い。
3. 名簿の PC の表で MF のポジションが黒。
4. スタッフ（PC・スマホ）：今月のトピック・最新の動き・指標のグラフが無い。すべて／中1／中2／中3 のタイルがあり、選ぶと下のタイムラインが切り替わる。ノートの行を押すとそのノートの詳細、メッセージの行を押すとその選手とのチャットが開く。最新のお知らせがあり、押すと詳細が開く。
5. 選手（PC・スマホ）：ヒーロー＋目標＋最新のお知らせ。マイスタッツ・ノート未読・数値の枠・直近の試合・最新の動きが無い。PC のヒーローがスタッフと同じ濃紺の表示。
6. 横はみ出しなし（スマホ 390px・PC 1440px）。ほかの画面に差分が無い。

---

## §7 実装時の判断（2026-10-02。以後はここが正）

実画面の確認（受け入れ 37 項目）と、Opus 5.5 のレビュー（確定 9 件＝重複を除いて 6 件。どれも軽微）を受けて、統括が次のとおり決めた。

- **名簿のポジションの緑**：意味は無かった。ポジションの帯（GK／DF／MF／FW）ごとに色を分けていた頃の名残で、ほかの 3 つは `--ink`（黒）に直してあったのに、MF の `--lime`（＝緑）だけ PC の表で残っていた。`.pos.mf` を `--ink` にし、スマホだけ黒に上書きしていたルールは消した。
- **目標**：専用のデータは作らず、既にある 3 つをまとめて出す（練習ノートの「今日の目標」の最新・成績表の目標・進路の将来の目標）。入力は今までの場所（サッカーノート／プロフィール）。行を押すとその画面へ移る。成績の目標は「評定平均 3.4（中3・2学期まで）」（小数 1 桁。「まで」は学年だけ・学期だけのときも付く）。
- **選手のスマホのホーム**：PC とそろえて、ヒーロー＋目標＋最新のお知らせにした。4 つの数値の枠（出席率・ノート・ゴール・アシスト）・直近の試合・最新の動きは外した。
- **選手の PC のホーム**：スタッフと同じ器（`.mdb-root`）と同じヒーロー（`MdbHero`。HomeMenu.tsx）にした。違いは出欠の欄だけ（「自分の出欠」＋自分の回答、ボタンは「出欠を回答する」）。ベルは出さない。下は 2 列（目標｜最新のお知らせ）。
- **タイムラインのタイル**：数字は未読の件数（ノート＝スタッフが開いていない提出、メッセージ＝スタッフが読んでいない選手・保護者からのメッセージ）。下の小さい文字は内訳「ノート N ・ メッセージ M」。ピル（枠・背景）にせず 12px の普通の文字にした（スマホの 2 列では折り返すため）。PC の 4 色（青・緑・橙・紫）は元の 4 つの枠の色をそのまま使っている。
- **行を押したとき**：ノート → そのノートの詳細（`noteIntent`。スタッフだけが読む）。メッセージ → チャットを「メッセージ」側にしてから、その選手とのスレッド。お知らせ → チャットを「お知らせ」側にしてから詳細。
- **お知らせの既読**：チャットの一覧と同じ半角の「既読 N/M」。スタッフだけに出す。
- **scope**：「すべて」＋学年グループ。学年が 5 つ以上あるチームは PC でタイルが 2 段に折り返す（そのとき段の間の罫が無い。今のデモは 4 つなので見送り）。
- **消したコード**：`homeData.tsx` の指標・グラフ・トピック・最新の動きの集計と部品（`MdbChart`・`MdbRing`・`rankTop3` ほか）。`useMatchdayData` は次の予定・ベル・ハイライトだけを返す。`lib/homeStats.ts` は週ごとのノート提出件数（ハイライトが使う）だけを残し、出席率・勝率の系列は消した。
- **予定別**：前回足した「これからの予定」は外した。予定別は今日までの予定だけを並べる（反映をオンにした先の予定は、当日になると出る）。

**検証**：`~/.claude/alfa-verify-tools/p18_verify.js`（37 項目）。
