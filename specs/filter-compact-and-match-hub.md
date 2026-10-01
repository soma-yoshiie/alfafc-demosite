# 絞り込みの詰め・試合記録の刷新（2026-10-01）

統括・設計：Fable 5.1 ／ 実装：Sonnet 5.5 ／ 読解・レビュー：Opus 5.5

## 0. 依頼（ユーザーの言葉）

1. カレンダー・名簿・サッカーノートの絞り込みの一番下にある「グループを編集」を「絞り込みを編集」に変える。
2. PC 版は絞り込みをもっと左上にぎゅっと寄せて、文字の隙間を消す。チェックする部分も小さく（スマホ版はチェックの大きさだけ同じに変える）。
3. その改良した絞り込みを試合記録にも入れる。
4. 試合記録で順位表を編集できるようにする。
5. 各試合記録（「vs 高砂フットボールクラブ 4-2」の行）をもっと薄くコンパクトに。
6. 試合記録を押したときの詳細を、名簿の詳細表示（個人ページ）と同じような UI に。

## 共通の約束（全工程）

- `app/globals.css` の行頭 `@media` は 9 本のまま（`grep -c "^@media" app/globals.css` が 9）。新しい `@media` を作らない。
- スマホ・共通のルールは基底（15961 行より前）へ。PC だけの調整は 2 本目の PC ブロック末尾「mobile-redesign PC reset」の中（ブロックの閉じ括弧の直前）へ。1 本目の PC ブロックは触らない。PC reset 内の既存ルールは書き換えてよい（同じセレクタを二重に書かず、既存の行を直す）。
- 既存の `@media (min-width: 1600px)` と `@media (pointer: coarse) and (min-width: 1024px)` への追記は可。
- 色はトークンだけ（新しい hex を書かない）。グループ色だけインライン style。文字は 12px 以上。スマホのタップ領域は 44px 以上。PC の操作部品は四角（`--r-md` 以下）。グラデーション・影の追加は禁止。
- 絵文字コンポーネント `E` を新しい見出し・行アイコンに使わない。アイコンは `components/icons.tsx`。
- dev サーバーの起動・停止、`next build`、`npm run export` は禁止。確認は `npx tsc --noEmit` と grep。
- コミットしない（統括がまとめてコミットする）。
- 仕様に無い改善・リファクタはしない。既存コメントは消さず、変えた箇所に「p14 §n」で短い注記を足す。

---

## §1 絞り込みの共通化（文言・位置・チェックの大きさ・PC の密度）

### 1-1 文言と位置

- 文言は「絞り込みを編集…」（末尾は三点リーダ 1 文字）。動作は今までどおりグループ管理を開く。
- どの画面でも**パネルの一番下**に置く。
  - カレンダー `CalFilterPanel`（TeamHub.tsx）：文言だけ変える（位置は既に一番下）。コメント中の「グループを編集…」も直す。
  - 名簿 `RosterFilterPanel`：ボタンを「状態」セクションの後（一番下）へ移す。
  - サッカーノート `NotebookFilterPanel`（NotebookScreen.tsx）：今はリンクが無いので足す。props に `onManageGroups?: () => void` を足し、「状態」セクションの後に `<button type="button" className="nbfmanage" onClick={onManageGroups}>絞り込みを編集…</button>`。
- サッカーノートからグループ管理を開く経路：
  - `BoardProvider.tsx` の `teamIntent` の型（3 か所：1163・1165・2047 行付近）に `openGroups?: boolean` を足す。
  - `TeamHub.tsx` の teamIntent 消費 effect（`if (intent.eventId) …` の後）に `if (intent.openGroups) setSheet({ type: "groups" });` を足す。
  - `NotebookScreen` 側：`onManageGroups={() => { setFilterSheet(false); board.setTeamIntent({ tab: "ros", openGroups: true }); board.setScreen("team"); }}`（intent → setScreen の順。Bench.tsx:197 と同じ作法）。スタッフ（`isCoach`）のときだけ渡す。
- 基底 CSS：`.noteapp .nbfmanage` を `.rosfmanage`（14409 行付近）と同じ値で足す（`.noteapp .nbfdone` の後）。

### 1-2 チェックの大きさ（スマホ・PC 共通）

基底の `.calchk`（3518 行付近）を書き換える。行の高さ（スマホ 44px）は変えない。

```css
.calchk { width: 16px; height: 16px; /* ほかは今のまま */ }
.calchk.on::after {
  left: 50%; top: 50%;
  width: 7px; height: 4px;
  margin: -4px 0 0 -4px;
  border-left: 1.5px solid var(--on-primary);
  border-bottom: 1.5px solid var(--on-primary);
  transform: rotate(-45deg);
}
```

丸トグル（`.calfilter-toggle`）のスマホの大きさは変えない。

### 1-3 PC の密度（PC reset だけ）

狙い：列を左上へ詰め、行間を無くす。列幅 220px → **184px**、行 44/36px → **24px**、行の束の枠・罫線は無くして文字だけのリストにする。チェックは全部左側にそろえる。

名簿・サッカーノート・試合記録（§2）の列（`.rosside`／`.nbside`）：

| 対象 | 値 |
|---|---|
| `.teamapp.rosside-open:has(.teammain)` の列 | `184px 300px minmax(0, 1fr)`（1600px ブロックは `184px 340px minmax(0, 1fr)`） |
| `.coachapp.noteapp:has(.nbside)` の列 | `184px 320px minmax(0, 1fr)` |
| `.teamapp.rosside-open .rosside`／`.coachapp.noteapp .nbside` の padding | `8px 10px calc(env(safe-area-inset-bottom) + 16px)` |
| `.rosside-hide`／`.nbside-hide`／`.calside-hide` | `min-height: 24px; font-size: 12px; margin: 0`（`.calside-hide` は `display:flex; align-items:center; justify-content:flex-end` にそろえる） |
| `.rosfsec-h`／`.noteapp .nbfsec-h` | `padding: 8px 2px 2px`。列の先頭のセクションだけ `padding-top: 2px`（既存の `:first-of-type` ルールを直す） |
| `.rosfrows`／`.noteapp .nbfrows` | `border: 0; border-radius: 0; background: none; overflow: visible` |
| `.rosfrow`／`.noteapp .nbfrow` | `min-height: 24px; padding: 0 4px; gap: 6px; border-bottom: 0; background: none; border-radius: var(--r-xs); font-size: 13px`。hover は今の `--surface-low` のまま |
| `.rosfrow .calchk.sq`／`.noteapp .nbfrow .calchk.sq` | `order: -1`（四角のチェックも左へ） |
| `.rosfmanage`／`.noteapp .nbfmanage` | `min-height: 24px; margin-top: 6px; padding: 0 4px; font-size: 12px` |

カレンダー（`.cal` の中の `.calside`。TSX は変えず CSS だけで列を左上へ貼り付ける）：

```css
/* カレンダータブだけ .scroll の余白を外し、絞り込み列を左上へ貼り付ける */
.teamapp .scroll:has(> .cal) { padding: 0; }
.teamapp .cal {            /* 既存の 21685 行付近のルールを書き換える */
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
  align-items: start;
  gap: 0;
  max-width: none;
  margin: 0;
  min-height: 100%;
  padding-top: 0;          /* 基底の .cal の 12px を外す（本体側の .calmain が持つ。§7） */
}
/* 列の白地と右の罫線（列は sticky なので、地は疑似要素を全高に伸ばして描く） */
.teamapp .cal::before {
  content: "";
  grid-column: 1; grid-row: 1;
  align-self: stretch;
  background: var(--surface-lowest);
  border-right: 1px solid var(--outline);
}
.calside { grid-column: 1; grid-row: 1; position: sticky; top: 0; padding: 8px 8px 16px 10px; }  /* 右だけ 8px（§7） */
.calmain { grid-column: 2; grid-row: 1; padding: 28px 32px 40px 24px; /* width/max-width/justify-self/min-width は今のまま */ }
.cal.side-hidden { grid-template-columns: minmax(0, 1fr); }
.teamapp .cal.side-hidden::before { display: none; }
.cal.side-hidden .calside { display: none; }
.cal.side-hidden .calmain { grid-column: 1; padding-left: 32px; }
```

`.calside` の中の密度：

| 対象 | 値 |
|---|---|
| `.calside .calfilterpanel-sec` | `margin-bottom: 0` |
| `.calside .calfilterpanel-sech` | `padding: 8px 2px 2px`（先頭のセクションは `padding-top: 2px`） |
| `.calside .calfilterpanel-all` | `min-height: 20px; padding: 0 2px` |
| `.calside .calfilterpanel-row` | `min-height: 24px; gap: 6px; padding: 0 4px; font-size: 13px; border-radius: var(--r-xs)`、hover `background: var(--surface-low)` |
| `.calside .grouppick` | `gap: 0 10px; margin: 0; padding: 0` |
| `.calside .calfilterpanel-catchip` | `min-height: 24px; padding: 0 4px; gap: 6px; font-size: 13px` |
| `.calside .calfilter-toggle` | `min-height: 28px; margin-top: 6px; padding: 2px 0 2px 4px; gap: 4px; font-size: 12px; white-space: nowrap`（既存 21777 行付近を書き換え） |
| `.calside .calfilter-toggle > span` | `width: 26px; height: 16px`、つまみ `::after` は `width: 12px; height: 12px; top: 1px; left: 1px`、ON は `translateX(10px)` |
| `.calside .calfilterpanel-manage` | `min-height: 24px; margin-top: 6px; padding: 0 4px; font-size: 12px` |

`(pointer: coarse)` ブロック：PC で 24px に詰めた行・リンク（`.noteapp .nbfrow`、`.noteapp .nbfmanage`、`.calside-hide`、`.calside .calfilterpanel-row`、`.calside .calfilterpanel-catchip`、`.calside .calfilterpanel-all`、`.calside .calfilter-toggle`、`.calside .calfilterpanel-manage`）を `min-height: 44px` に戻す（`.rosfrow`・`.rosfmanage`・`.rosside-hide`・`.nbside-hide` は既にある）。

### 1-4 スマホ

変えるのは「チェックの大きさ」「文言」「リンクの位置（名簿は一番下へ／サッカーノートは追加）」だけ。行の高さ・枠・余白は今のまま。

---

## §2 試合記録の絞り込み

今の「大会の select（PC）／チップ列（スマホ）」「＋ 大会を登録・管理」ボタン「グループのチップ列（GroupChips）」を撤去し、名簿と同じ絞り込みパネルに置き換える。状態（`cmp`、`useGroupFilter("matches")`）と絞り込みの意味（どちらも単一選択）は変えない。

### 2-1 部品 `RecFilterPanel`（TeamHub.tsx。`RosterFilterPanel` の直前か直後に置く）

クラスは名簿の `.rosf*` をそのまま使う（新しい CSS は要らない）。

```
<div className="rosfpanel">
  [大会]      … comps.length > 0 || hasOther のときだけ。行＝すべて／各大会／その他(hasOther のとき)。右の四角チェック(.calchk.sq)。単一選択
  「大会を登録・管理…」 … スタッフだけ。button.rosfmanage。大会セクションの直下
  [学年]      … すべて＋学年グループ。左に色の丸チェック。名簿と同じ
  [グループ]  … カスタムグループ（学年が 0 件のときは先頭に「すべて」）
  「絞り込みを編集…」 … スタッフだけ。button.rosfmanage。一番下。グループ管理を開く
</div>
```

props：`comps`, `hasOther`, `cmp`, `onCmp`, `groups`, `groupId`, `onGroup`, `onManageCompetitions?`, `onManageGroups?`。大会が 0 件で「その他」も無いとき、スタッフには「大会を登録・管理…」だけ出す（見出しなし）。

### 2-2 置き場所

Inner（TeamHub.tsx）で持つ：

- `recSideOpen`（PC の列の開閉。既定＝開く）。`lib/storage.ts` に `loadRecSideOpen`／`saveRecSideOpen`（キー `soccer_tactics_recside_v1`。`loadRosSideOpen` と同じ作法）。
- `recFilterSheet`（スマホのシートの開閉）。PC 幅になったら閉じる。
- `recVisible = isCoach || board.matchesPublic`（選手で非公開なら絞り込みを出さない）。
- `recFilterOn = cmp !== "all" || !!matchGroupEff`。
- `hasOther` は Inner でも計算する（`team.team.matches.some((m) => !m.competitionId)`）。

PC：

- `recSideOn = pc && activeTab === "rec" && recSideOpen && recVisible && !sheetInline && !recOpen`（`recOpen` は §5。PC のスタッフは常に null）。
- 名簿の列と同じ器を使う：ルートのクラス `rosside-open` を `rosSideOn || recSideOn` で付け、`<aside className="rosside" aria-label="試合記録の絞り込み">` に `button.rosside-hide`「‹ 絞り込みを隠す」＋ `RecFilterPanel`。名簿の aside と排他で描く。
- スタッフ（`.teammain` あり）は 3 列（184｜300｜1fr）。既存の `.teamapp.rosside-open:has(.teammain)` がそのまま効く。
- 選手・保護者（`.teammain` なし）は 2 列。PC reset に足す：

```css
.teamapp.rosside-open:not(:has(.teammain)) {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-columns: 184px minmax(0, 1fr);
  height: 100dvh;
}
.teamapp.rosside-open:not(:has(.teammain)) header { grid-row: 1; grid-column: 1 / -1; }
.teamapp.rosside-open:not(:has(.teammain)) .rolebar { grid-row: 2; grid-column: 1 / -1; }
.teamapp.rosside-open:not(:has(.teammain)) .scroll { grid-row: 3; grid-column: 2; }
```

- 列を畳んでいる間は、一覧の先頭に `.rostop`（`button.rosfilterbtn`「絞り込み」＋絞り込み中の点 `.dot`。検索欄は無い）を出し、押すと列を開く。

スマホ：

- 試合記録タブのとき、ヘッダー右に「絞り込み」（`MobileHeaderAction`＋`IconFilter`、絞り込み中は `.dot`。カレンダーと同じ並び＝絞り込み→＋）。`recVisible` のときだけ。
- 押すと下からのシート。`RosterFilterSheet` に `title` prop を足して共用する（名簿＝「表示する選手」、試合記録＝「表示する試合」）。
- 「大会を登録・管理…」「絞り込みを編集…」を押したら、先にシートを閉じてから `setSheet({ type: "competitions" })`／`setSheet({ type: "groups" })`。

### 2-3 `MatchesTab` の並び

- 撤去：`select.cmpselect`、`.cmpbar`、`button.cmpmanage`、`GroupChips`。props から `setCmp`・`setMatchGroupIds` は外し、`showFilterBtn`・`filterOn`・`onFilter`・`onOpenMatch`（§5）・`onOpenLeague`（§3）を足す。
- 追加：選択中の 1 行 `.rossel`（名簿と同じ文法。未選択は「すべて」、選択中は「● 中2 ・ 春季リーグ U-12」。グループが先、大会が後）。
- 並び（上から）：
  - PC スタッフ：`.teamsumrow` → `.pubnote` → （列を畳んでいるとき `.rostop`）→ `.rossel` → `.reclist`
  - スマホ／PC 選手：`.pubnote`（スタッフだけ）→（PC 選手で列を畳んでいるとき `.rostop`）→ `.rossel` → 順位表の入口（§3-3）→ `.statcard` → `.reclist`
- 0 件のときの文言は今のまま。

---

## §3 順位表の編集

### 3-1 データ

`lib/types.ts`：

```ts
/** リーグ順位表の 1 行（p14 §3）。試合数・勝点・順位は保存せず計算する */
export interface LeagueRow {
  id: string;
  /** チーム名。自チームの行（own）は表示時にチーム名（board.state.teamName）へ差し替える */
  name: string;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  own?: true;
}
export interface LeagueTable {
  /** 見出し。未設定は「リーグ順位表」 */
  title?: string;
  rows: LeagueRow[];
  updatedAt?: number;
  updatedBy?: string;
}
// TeamData に足す
/** リーグ順位表（p14 §3）。未定義＝デモの既定値（lib/sampleLeague.ts の DEFAULT_LEAGUE） */
league?: LeagueTable;
```

`lib/sampleLeague.ts` を作り直す（ファイル名は残す）：

- `DEFAULT_LEAGUE: LeagueTable`（今の 13 チームと同じ勝・分・敗・得点・失点。`id` は `"lg01"`〜`"lg13"`、自チームは `own: true`、`name: SAMPLE_TEAM_NAME`）。
- `export interface Standing extends LeagueRow { rank: number; played: number; pts: number; diff: number }`
- `computeStandings(table: LeagueTable, ownName: string): Standing[]`：`played = win + draw + loss`、`pts = win * 3 + draw`、`diff = gf - ga`。並びは 勝点 → 得失点差 → 得点 の降順、同じなら入力順。`rank` は 1 からの連番。own の行は `name` を `ownName` に差し替える。
- `leaguePositionOf(st: Standing[]): { rank: number | null; size: number }`（自チーム行が無ければ rank は null）。
- `leagueMiniRows(st: Standing[]): (Standing | { gap: true })[]`（上位 5 ＋ 自チームが 6 位以下なら区切り＋自チーム）。
- 旧 `LEAGUE_STANDINGS`・`leaguePosition()` は消し、使っている所を全部直す（homeData.tsx・HomeMenu.tsx・MobileHome.tsx・TeamHub.tsx）。

`lib/storage.ts` の `loadTeam()`：`data.league` が壊れていたら（`rows` が配列でない）`delete data.league`。各行は `id`・`name` が文字列、数値は 0 以上の整数に丸める（NaN は 0）。own は高々 1 行（2 行目以降の own は外す）。

`components/TeamProvider.tsx`：

- Context に `league: LeagueTable`（`useMemo(() => team.league ?? DEFAULT_LEAGUE, [team.league])`）と `setLeague: (t: { title?: string; rows: LeagueRow[] }) => void` を足す（interface・value・依存配列の 3 か所）。
- `setLeague` は `updatedAt: Date.now()`・`updatedBy`（PlayerHub の記録と同じ作法。`lib/profile.ts` などで `updatedBy` に何を入れているか確認して合わせる。分からなければ `board.auth.name ?? "スタッフ"`）を付けて `setTeam`、toast「順位表を保存しました」。

`components/homeData.tsx`：

- 定数 `LEAGUE_MINI_ROWS` を消す。`useMatchdayData` の中で `const standings = computeStandings(team.league, board.state.teamName ?? "マイチーム")` を作り、戻り値に `leagueRank`（`leaguePositionOf`）と `leagueMini`（`leagueMiniRows`）を入れる。
- HomeMenu.tsx／MobileHome.tsx は `leagueMini` を使う。行の key は `r.id`。
- 自チーム行が無い・0 チームのとき：タイルは「—」と「未登録」、簡易表は 1 行「順位表が未登録です」。

### 3-2 PC（スタッフ）の右ペイン `RecSummaryPane`

- 見出し行を `<div className="leaguehead"><div className="sech">{title}</div><button type="button" className="phubedit" aria-label="順位表を編集" title="順位表を編集" onClick={onEditLeague}><IconEdit /></button></div>` にする（`title` は `team.league.title || "リーグ順位表"`）。
- 表は共通部品 `LeagueTableView`（下）で描く。行の key は `r.id`。0 チームなら表の代わりに `.empty-msg`「順位表が未登録です。右上の編集から登録できます。」
- 見出しの下に `.phubupd`「最終更新 M/D(曜) 名前」（`updatedAt` があるときだけ。`hub/common.tsx` の `LastUpdated` を使う）。
- `RecSummaryPane` に `setSheet` を渡し、`onEditLeague = () => setSheet({ type: "league" })`。

共通部品（TeamHub.tsx 内）：

```tsx
function LeagueTableView({ rows }: { rows: Standing[] })
// <div className="leaguewrap"><table className="ptable leaguetable">…今と同じ 8 列（順位／チーム／試合／勝／分／敗／得失／勝点）…</table></div>
```

### 3-3 スマホ・PC の選手（右ペインが無い画面）の入口

`MatchesTab` の `.rossel` の下に 1 行：

```tsx
<button type="button" className="phublink lglink" onClick={onOpenLeague}>
  <span>{title}</span>
  <span className="lglink-v">{rank != null ? `${rank}位 / ${size}チーム` : "未登録"} ›</span>
</button>
```

- 出す条件：`!(pc && isCoach)`（PC のスタッフは右ペインに表があるので出さない）。
- 押すと `setSheet({ type: "leagueView" })`：h2「{title}」＋ `LeagueTableView`（横スクロール可）＋ `LastUpdated` ＋ スタッフだけ `button.bigbtn.ghost.accent`「編集する」（→ `setSheet({ type: "league" })`）。

### 3-4 編集シート `{ type: "league" }`

`SheetState` に `{ type: "league" }` と `{ type: "leagueView" }` を足す（`sheetKey` は既定の `s.type` のまま）。`paneBack`：`league` を閉じたら、スマホ・PC 選手は `leagueView` へ戻る。PC スタッフ（`.teammain` のペイン）は `null`（サマリーに戻る）。判定は「開いたときに `from: "view"` を持たせる」形でよい（`{ type: "league"; from?: "view" }`）。

中身（`<Sheet open={sheet?.type === "league"} …>`。state は SheetHost の中、`key={sheetKey(sheet)}` で開くたび初期化される）：

```
h2「順位表を編集」
[名称]  .formfield > input（placeholder「リーグ順位表」。例：春季リーグ U-12）
.lgedit（チームごとに 1 枚のカード .lgedit-row）
   1 行目：チーム名 input（自チームの行は入力欄でなく、チーム名の文字＋タグ「自チーム」。編集不可）／右端に削除（IconTrash、aria-label「このチームを削除」。自チームの行には出さない）
   2 行目：5 つの数値欄（勝／分／敗／得点／失点）。上に小さなラベル、下に input（inputMode="numeric"、幅は 5 等分）
「＋ チームを追加」 button.dynadd（空の行を末尾に足し、その行のチーム名にフォーカス）
注記 .evnote：「順位は 勝点（勝 3・分 1）→ 得失点差 → 得点 の順に自動で並びます。試合数は 勝＋分＋敗 です。」
button.bigbtn「保存する」
```

- 並びは入力順のまま編集する（保存後の表示で並び替わる）。初期の並びは今の順位順。
- 検証：チーム名が空の行があれば toast「チーム名を入力してください」。数値は空欄＝0、0 以上の整数だけ（それ以外は toast「数値は 0 以上の整数で入力してください」）。
- 自チームの行が無いデータ（壊れた・全部消した）を開いたら、自チームの行を先頭に補ってから編集する。
- 保存：`team.setLeague({ title: 名称.trim() || undefined, rows })` → 閉じる（`paneBack` と同じ戻り先）。
- 新しい行の id は `"lg_" + Date.now().toString(36) + "_" + 連番`。

CSS（基底）：`.leaguehead`（flex・space-between・align center。中の `.sech` は margin を 0 に）、`.lglink-v`（`--mut`・`--fs-body-s`・nowrap）、`.lgedit`／`.lgedit-row`（白地・1px `--outline`・`--r-lg`・padding 10px 12px・margin 0 16px 8px）、`.lgedit-top`（flex・gap 8px・align center）、`.lgedit-name`（flex 1・input は `.formfield > input` と同じ見た目になるよう既存クラスを流用）、`.lgedit-own`（タグ。`.phubtag` を流用してよい）、`.lgedit-nums`（grid 5 等分・gap 6px・margin-top 8px）、`.lgedit-nums label`（12px `--mut`、縦並び）、`.lgedit-del`（44×44・枠なし・`--mut`、svg 18px）。スマホで表を出すための `.teamapp:has(.mhead) .leaguetable`（`.ptable` は PC 専用なので、ホームの `.mhome-root .mh-chart .ptable`（12222 行付近）と同じ値で `width:100%`・`border-collapse`・`font-size:12px`・`tabular-nums`・td padding 8px 6px・下罫線・`.num` 右寄せ・`tr.own td` は `--accent-tint` 地・`th` は 12px `--mut` 左寄せ／`.num` 右寄せ）、`.leaguewrap`（基底にも `overflow-x:auto`）。PC reset：`.lgedit-row` は `--r-md`、`.lgedit-del` は 32×32。

---

## §4 試合の行をコンパクトに

対象は試合記録タブの一覧だけ（`.reclist .matchcard`）。ホームの「直近の試合」（`.mhome-root .mh-panel .matchcard`）は変えない＝基底の `.matchcard`・`.mres`・`.mopp`・`.msub`・`.mscore` 単体のルールは触らない。

TSX（`MatchesTab` の行）：対戦相手名を `<span className="moppname">vs {m.opponent}</span>` で包む（`MatchGroupsBadge` はその後ろのまま）。クリックは §5 の `onOpenMatch(m.id)` に一本化する。行は `role="button"`・`tabIndex={0}`・Enter／Space で開く。

基底（スマホ・PC 選手）：

```css
.reclist .matchcard { gap: 8px; padding: 6px 12px; margin-bottom: 6px; border-radius: var(--r-lg); min-height: 48px; }
.reclist .mres { width: 24px; height: 24px; border-radius: var(--r-sm); font-size: 12px; font-weight: 700; }
.reclist .mopp { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 14px; font-weight: 700; }
.reclist .moppname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reclist .mopp .evgroups { flex: 0 1 auto; min-width: 0; max-width: 45%; }  /* 相手名を優先し、バッジの方を省略記号に（§7） */
.reclist .msub { margin-top: 0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reclist .mscore { font-family: var(--font-ui); font-size: 17px; font-weight: 700; letter-spacing: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
.reclist .mscore span { margin: 0 2px; }
```

PC reset（スタッフの左列。既存の `.teamapp:has(.teammain) .scroll .matchcard` 系より詳細度を上げて上書き）：

```css
.teamapp:has(.teammain) .scroll .reclist .matchcard { gap: 8px; padding: 4px 8px; min-height: 0; }
.teamapp:has(.teammain) .reclist .mres { width: 20px; height: 20px; font-size: 12px; }
.teamapp:has(.teammain) .reclist .mopp { font-size: 13px; font-weight: 600; }
.teamapp:has(.teammain) .reclist .mscore { font-size: 15px; font-weight: 600; }
```

目標の行の高さ：PC スタッフ 約 44px（今は約 79px）、スマホ 約 52px。`(pointer: coarse)` ブロックで `.teamapp:has(.teammain) .scroll .reclist .matchcard { min-height: 44px; }`。

---

## §5 試合の詳細を「個人ページ」と同じ文法に（MatchHub）

### 5-1 新しい部品 `components/MatchHub.tsx`

名簿の `PlayerHub` と同じ骨格・同じクラス（`.phub*`）で組む。`PlayerHub.tsx` を読み、narrow の判定（`useWidth`・`NARROW_ON/OFF`）、チップ列／縦メニューの出し分け（`chips = !pc || narrow`）、セクション切替時のスクロール（`scrollParent`・`go`）を同じ作りで写す。共通部品は `hub/common.tsx` の `usePc`・`HubHead`・`HubEmpty`・`LastUpdated` を使う。

```tsx
export type MatchHubSection = "overview" | "goals" | "members";
export function MatchHub(props: {
  matchId: string;
  players: Player[];
  /** スタッフ表示か（鉛筆・削除・選手行のリンクを出す） */
  canEdit: boolean;
  onEdit: () => void;
  /** 削除後に呼ぶ（一覧へ戻す） */
  onDeleted: () => void;
  section?: MatchHubSection;
  onSection?: (s: MatchHubSection) => void;
})
```

骨格：

```
<div className="phub mhub [narrow]" ref>
  <div className="phubhead">
    <div className="phubhead-top">
      <div className="phubid"><span className="mres w|d|l">勝|分|敗</span></div>
      <div className="phubwho">
        <h2 className="phubname">vs {opponent}</h2>
        <div className="phubsub">
          <span>{日付 M/D(曜)}</span>
          {大会名 && <span>{大会名}</span>}
          {対象が全体でなければ <span className="phubgroups"><span className="phubgroup">{グループ名}</span>…</span>}
          {halfLabel && <span>{halfLabel}</span>}
        </div>
      </div>
      {canEdit && <button className="phubedit" aria-label="試合記録を編集" title="試合記録を編集" onClick={onEdit}><IconEdit /></button>}
    </div>
    <div className="phubkpi">   … 4 マス（button.phubkpi-item、.v と .l）
      スコア「4 - 2」→ overview ／ 得点者「3<small>人</small>」（重複を除いた人数）→ goals ／ 先発「8<small>人</small>」→ members ／ 交代「1<small>回</small>」→ members
    </div>
  </div>
  {chips && <div className="phubtabs" role="tablist" aria-label="セクション">…</div>}
  <div className={`phubbody${sideNav ? " withnav" : ""}`}>
    {sideNav && <nav className="phubnav" role="tablist" aria-orientation="vertical" aria-label="セクション">…</nav>}
    <div className="phubmain" role="tabpanel" key={sec}>…セクション…</div>
  </div>
</div>
```

セクション（ラベル：基本／得点・失点／メンバー）：

- **基本**（`section.phubsec`）
  - `HubHead title="基本情報"` ＋ `dl.phubkv`：日付（`YYYY/M/D(曜)`）／対戦相手／結果（「勝 ・ 4 - 2」）／大会（無ければ「—」＝`.phubkv-empty`）／対象（グループのピル。全体なら「全体」）／試合時間（`halfLabel`。無ければ「—」）／フォーメーション（無ければ「—」）
  - `HubHead title="メモ"` ＋ `.phubcard`（`.phubmemo` に本文。無ければ `.phubkv-empty`「未入力です。」）
  - `canEdit` のとき末尾に `button.phubdel`「この試合記録を削除」（`window.confirm("この試合記録を削除しますか？")` → `team.removeMatch(id)` → `onDeleted()`）
- **得点・失点**
  - `HubHead title="得点" sub="{N} 件"` ＋ `.phublist`：行 `.phubrow` > `.phubrow-main`（`<b>{分}' {得点者}</b>`、`<span>アシスト {名前} ・ {形}</span>`（どちらも無ければ span を出さない））。分が無ければ名前だけ。0 件は `HubEmpty compact title="得点の記録がありません"`
  - `HubHead title="失点" sub="{N} 件"` ＋ `.phublist`：`<b>{分}'</b>`（無ければ「—」）と形（無ければ「形は未記録」）。0 件は、`theirScore > 0` なら `HubEmpty compact title="失点の記録がありません"`、0 失点なら `HubEmpty compact title="無失点です"`
- **メンバー**
  - `HubHead title="先発" sub={formation}` ＋ `.phublist`：`<b>{選手名}</b><span>{pos}</span>`。`canEdit` のときは行を `button.phubrow`（右端に `.phubrow-st`「›」）にして、押すと名簿の個人ページへ（`board.setTeamIntent({ tab: "ros", playerId })`。TeamHub.tsx:3042 と同じ経路）。0 件は `HubEmpty compact title="先発の記録がありません"`
  - `HubHead title="交代" sub="{N} 回"` ＋ `.phublist`：`<b>{分}' {OUT} → {IN}</b>`。0 件は `HubEmpty compact title="交代の記録がありません"`

選手名は `players.find(...)?.name ?? "—"`。試合が見つからないときは `<div className="phub"><HubEmpty title="この試合記録は見つかりません" /></div>`。

追加の CSS は最小限（基底）：`.mhub .phubid .mres`（ヘッダーの勝敗バッジ。基底の `.mres` 30px をそのまま使い、`.d` は `--mut`、`.w`／`.l` は既存の色。上書きは `.mhub .mres.d { background: var(--mut); }` だけ）、`button.phubrow` を使う場合のボタン既定の打ち消し（`.mhub button.phubrow { width: 100%; border: 0; border-top: …; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }` — 既存の `.phubrow` の罫線の付き方を確認して合わせる）。`.phubkpi` は 4 マス（スマホ 2 列／PC 4 列）なので既存のままでよい。

### 5-2 組み込み（TeamHub.tsx）

- `MatchDetailBody`・`SheetState` の `"matchView"`・SheetHost の matchView ブロック・`sheetKey` の matchView 分岐・保険 effect の matchView 分岐を**削除**する。
- Inner に `recOpen: string | null`（スマホと PC 選手で開いている試合の id）と `recSection: MatchHubSection`（既定 overview）を足す。
- 一覧の行を押したとき（`onOpenMatch(id)`）：`pc && isCoach` なら `setRecSel({ kind: "match", id })`、それ以外は一覧のスクロール位置を覚えて `setRecOpen(id)`。どちらも `setRecSection("overview")`。
- **PC スタッフ**（`RecMatchPane`）：`.tmdetail` のカードで包むのをやめ、`<div className="mhubpane"><div className="tmback" …>‹ サマリー</div><MatchHub … /></div>` にする（カードの二重化を避ける。`.mhubpane` に CSS は要らない）。`onEdit = () => setSheet({ type: "match", record: m })`、`onDeleted = () => setRecSel({ kind: "summary" })`。
- **スマホ**：名簿の `rosFull` と同じ全画面。`recFull = !pc && activeTab === "rec" && !!recOpen`。
  - ヘッダーは `<MobileHeader title={`vs ${相手名}`} onBack={() => setRecOpen(null)} />`（試合が消えていたらタイトル「試合記録」）。
  - セグメント（`MobileSegments`）は `!rosFull && !recFull` のときだけ。
  - `.scroll` の中身は `MatchesTab` の代わりに `<MatchHub … />`。一覧⇄詳細のスクロール位置は名簿と同じ作法（`rosScrollRef` を共用し、`recListTop` を別に持つ。詳細は先頭から、戻ったら元の位置）。
  - `onEdit` は `setSheet({ type: "match", record: m })`（下からのシートが全画面の上に出る）。`onDeleted = () => setRecOpen(null)`。
- **PC の選手・保護者**（`.teammain` なし）：`.scroll` の中身を `<div className="mhubpane"><div className="tmback" onClick={() => setRecOpen(null)}>‹ 試合記録</div><MatchHub canEdit={false} … /></div>` に差し替える（`recOpen` があり、`activeTab === "rec"` で、シートが開いていないとき）。このとき絞り込み列は出さない（§2-2 の `recSideOn` の条件）。
- 画面幅が変わったとき：`pc && isCoach && recOpen` になったら `setRecSel({ kind: "match", id: recOpen }); setRecOpen(null)`。
- タブを切り替えたら `recOpen` は閉じる（`setTab` を呼ぶ 2 か所＝セグメントとサブナビ。teamIntent で `rec` に来たときも閉じる）。
- 選手で非公開（`!isCoach && !board.matchesPublic`）のときは `recOpen` を無視して今の鍵メッセージを出す。

### 5-3 変えないもの

- 試合記録フォーム（`type: "match"`）の中身。
- `RecSummaryPane` の順位表以外（KPI・グラフ・チーム技術・大会別成績・個人成績）。
- ホームの「直近の試合」カード、戦術ボード側の `PlayerDetail` シート（`.dsec` 系）。`.dsec`／`.mvscore`／`.mvmeta` の CSS は消さない（予定詳細・出欠記録が使っている）。

---

## §6 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. 「グループを編集」という文言が `app/`・`components/`・`lib/` に残っていない（コメント含む）。
3. PC 1440×1000：カレンダー・名簿・サッカーノート・試合記録の絞り込み列が幅 184px・行 24px・チェック 16px で、列が左のレールと上の帯に接している。カレンダー本体・名簿の一覧・個人ページが崩れていない。
4. スマホ 390×844：3 つの絞り込みシートは行 44px のまま、チェックだけ 16px。横はみ出しなし（`document.documentElement.scrollWidth === innerWidth`）。
5. 試合記録：絞り込み（大会・学年・グループ）で一覧と PC のサマリーが絞られる。列の開閉が再読み込み後も残る。スマホはヘッダーの「絞り込み」からシート。
6. 順位表：PC スタッフは見出し右の鉛筆から、スマホは「リーグ順位表 ›」→「編集する」から編集でき、保存すると表・ホームの「リーグ順位」タイルと簡易表が変わる。再読み込み後も残る。
7. 試合の行：PC スタッフの行の高さが 48px 以下、対戦相手名は 1 行（省略記号）。
8. 試合の詳細：PC は右ペインに個人ページと同じ構成（ヘッダーカード＋4 マス＋縦メニュー＋本文）、スマホは全画面（戻るで一覧の元の位置）。鉛筆で編集フォーム、基本の末尾で削除。
9. ほかの画面（ホーム・戦術ボード・チャット・コーチラボ・設定）は、順位表タイル以外に差分が無い。

---

## §7 実装時の判断（2026-10-01。以後はここが正）

実画面の確認（PC 1440×1000／1100／1700、スマホ 390×844、スタッフ・選手・選手プレビュー）と、Opus 5.5 のレビュー（6 観点、指摘 13 件のうち反証を通過した 9 件）を受けて、統括が次のとおり決めた。

**統括の調整（実画面で見つけたもの）**

- カレンダーの列の上に 12px のすき間が残った（基底の `.cal { padding-top: 12px }`）。PC では `.teamapp .cal { padding-top: 0 }` にし、その分を `.calmain` の上余白（28px）へ移した。カレンダー本体の位置は変更前と同じ（列を隠した画面は変更前と画素一致）。
- 「全員向けの予定を含める」が 184px の列で折り返した。つまみ 26px・間 4px・`white-space: nowrap`、`.calside` の右だけ 8px にして 1 行に収めた（余りは 0px。文言を伸ばすときは列幅から見直す）。
- PC スタッフの一覧の行が内容の幅に縮み、長い行はスコアが列の外へ切れていた（1 本目の PC ブロックの `.teamapp .reclist { align-items: start }` が縦並びにも残っていたため。変更前からの不具合）。`.teamapp:has(.teammain) .reclist { align-items: stretch }` で列幅いっぱいにした。行の高さは PC 46px（変更前 約 79px）、スマホ 52px。
- 順位表の「勝点」列が、絞り込み列を開いた 1440px 幅とスマホ 390px 幅で横スクロールの外へ出た。セルの左右を詰め、チーム名の列だけ省略記号（`.col-name { max-width: 0; overflow: hidden; text-overflow: ellipsis }`）にして 8 列を常に収めた。

**レビュー指摘への対応（全 9 件を採用）**

- PC の選手・保護者の詳細も「詳細は先頭から／戻ったら一覧の元の位置」にした（`recDetail = recFull || recPcOpen` を 1 つの effect で見る。dev は StrictMode の二重実行で隠れていた）。
- 選手・保護者で絞る対象（大会・学年・グループ）が 1 つも無いチームでは、空の列・空のシート・「絞り込み」を出さない（`recHasFilter`。スタッフは管理リンクがあるので常に出す）。
- 先発の行のリンクは、名簿に居る選手だけ（削除済みの選手＝「—」の行はリンクにしない）。
- スマホで先発の行から個人ページへ移ったとき、「戻る」で元の試合の同じセクションへ戻る（`MatchHub` の `onOpenPlayer`、Inner の `rosBack`）。PC は右ペインの選択（recSel）が残るので今のまま teamIntent。
- 対象グループが多い行は、相手名を優先してバッジの方を省略記号にする（`max-width: 45%`）。
- 試合の詳細の表だけラベル欄を 100px に（「フォーメーション」が 88px で折れるため）。
- コメントの食い違い（名簿の列＝試合記録も使う、隠すボタン 24px）を直した。

**採用しなかった指摘（反証されたもの）**

- 順位表の行 id の重複（アプリ内に重複を作る経路が無い）。
- 「‹ 試合記録」「‹ サマリー」が div（既存の `.tmback` 全体の作法。直すなら全画面まとめて別件）。
- 順位表の削除ボタンの読み上げが同じ・削除後のフォーカス（既存の一覧の削除と同じ作法）。

**実装担当の逸脱で、そのまま認めたもの**

- `halfLabel` は `MatchHub.tsx` に同じ式を複製（TeamHub 側はローカル関数のまま）。
- teamIntent で来たときは、行き先のタブに関係なく試合の詳細（recOpen）を閉じる。
- ホームの簡易順位表は、自チーム行が無いとき（rank が null）は常に「順位表が未登録です」の 1 行。
- 順位表の編集：名称の placeholder は「リーグ順位表（例：春季リーグ U-12）」、数値は全角数字も受ける、自チーム行の name は保存時のチーム名で書く（表示は常に今のチーム名へ差し替え）、編集シートは閉じたら閲覧シートへ戻る（スマホ・PC 選手。PC スタッフはサマリーへ）。
- `updatedBy` は個人ページの記録と同じ作法（スタッフは `"staff:" + 名前`）。

**部品と状態の所在**

- 絞り込み：`RecFilterPanel`（TeamHub.tsx。`.rosf*` を流用）、列の開閉 `soccer_tactics_recside_v1`、ルートのクラス `rosside-open` は名簿と試合記録で共用。サッカーノートの「絞り込みを編集…」は `teamIntent.openGroups` で チーム運営 › 名簿 のグループ管理を開く（閉じてもノートへは戻らない）。
- 試合の詳細：`components/MatchHub.tsx`。PC スタッフは `recSel`、スマホと PC 選手は `recOpen`／`recSection`。`matchView` シートと `MatchDetailBody` は廃止。
- 順位表：`TeamData.league`（未保存は `lib/sampleLeague.ts` の `DEFAULT_LEAGUE`）、`team.league`／`team.setLeague`、計算は `computeStandings`。シートは `league`（編集）と `leagueView`（閲覧）。
- 検証：`~/.claude/alfa-verify-tools/p14_verify.js`（受け入れ 81 項目）、`p14_review_verify.js`（レビュー修正 13 項目）、`p14_baseline.js <outdir> [url]`（全 29 画面の撮影。変更前は HEAD の worktree を別ポートで起動して撮る）、`p14_probe.js`（幅違い・選手プレビュー・削除）。

**残した課題**

- 順位は 勝点 → 得失点差 → 得点 の自動並びだけ（直接対決などリーグ独自の順位決定には未対応。手動の並び替えは無い）。
- 順位表は 1 つだけ（大会ごとには持たない）。ホームの見出し「リーグ順位表（上位5チーム）」は名称（title）に追従しない。
- 「絞り込みを編集…」が開くのはグループ管理。大会は「大会を登録・管理…」、カレンダーの種類は予定フォーム側の管理のまま（1 つの入口にはまとめていない）。
