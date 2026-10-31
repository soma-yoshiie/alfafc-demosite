# スマホの「チーム」をタイルの目次に・個人ページのチップを 2 段に・選手のノートのホームを目次に（2026-10-31）

提案 PDF「ALFA_FOOTBALL_スマホの帯をやめるUI案_2026-10-31.pdf」（生成元 ~/.claude/alfa-verify-tools/hubres-report/design.md）からユーザーが選んだ案を実装する。
- **チーム（スタッフ）＝案 A-3**：タイル 2 列の目次を内容の領域の縦の中央に置き、タイルの中に「今の状態」（これから 7 日の帯・次の試合・怪我の人数・最新の未読 2 件）を入れる。
- **チーム（選手・保護者）＝案 A-1 ＋ 週の帯**：タイルだけ（全幅のカレンダー＋試合記録／チャット）。カレンダーのタイルにはスタッフの A-3 と同じ「これから 7 日」の帯を入れる。
- **個人ページ／プロフィール（スマホ）＝案 B**：チップ列を 2 段に折り返して 9 個全部を見せる。中身の切り替えは今のまま（その場）。
- **選手のノート＝案 A ＋ ヘッダー右のベル**：下部タブ「ノート」でホーム（目次つき）。上のセグメントをやめ、ヘッダー右に通知のベル（赤い数字。案 B にあったもの。スタッフのノートと同じ部品）。目次の「通知」の行も残す。
- **PC は変えない**（レールと PC 専用の構成があり、帯の問題は無い）。

## 0. 共通の約束事（design.md §0-3）
1. **下部タブは残す**（目次でも、その先の画面でも）。
2. その先の画面のヘッダーは **「‹」＋画面名**（例「‹ カレンダー」）。「‹」で目次へ。右の操作はその画面のもの（今の headerAction のまま）。
3. **下部タブの再タップ**：ConsoleShell は同じタブの再タップで `window.dispatchEvent(new CustomEvent("alfa-tabreselect", { detail: { key } }))`（key は MtabDef.key）を発火し、今までどおり scrollActiveScreenToTop() も呼ぶ。受け手（TeamHub／NotebookScreen）は「先の画面・詳細にいれば目次へ戻す。目次にいれば何もしない（先頭へのスクロールは ConsoleShell 側）」。mobile-redesign §8-5-27 を「先の画面では目次へ、目次では先頭へ」に改める。新規ノートの書きかけは下書き（useNoteDraft。入力が止まって 600ms 後に保存）が残るので確認は出さない。残らないもの＝既存ノートの編集フォーム、スタッフの送っていないコメント・図（NoteDetail の dirty）と、試合記録フォームの未保存は、戻す前に `window.confirm("保存せずに終了しますか？")`（TeamHub の confirmLeaveMatch と同じ文言）を通し、キャンセルなら何もしない。
4. **目次は毎回出す**（最後に開いた画面を覚えない）。
5. **深いリンク**（ホームの「出欠を確認」→ カレンダー、お知らせ・通知 → スレッド、活動のノート → ノート、チャットの「ノート」→ 提出）は今の intent のまま目的の画面を直接開く。その画面の「‹」は目次へ。
6. **バッジ**：下部タブの数字は今のまま。チームの目次ではチャットのタイルに同じ数字（chatBadge）。ノートの目次の「通知」の行には赤い数字を付けない（ベルに付ける）。
7. **mobile-redesign §8-14 の例外**：チームの目次のタイルは項目が 4 個以下で各タイルが今の状態を持つので、「同じ大きさのカードのグリッドを作らない」の例外とする。mobile-redesign.md #14 に #16 と同じ形で例外の文を足す。
8. mobile-redesign-v2 §3-3 の「スタッフ『チーム運営』」を「スタッフ・選手とも『チーム』」に改める（PC の題名「チーム運営」はそのまま）。

## 1. チーム（TeamHub.tsx のスマホ分岐）

### 1-1. 状態
- `Tab` に `"menu"` を足す。スマホの初期値は `"menu"`、PC は今のまま `"cal"`（`useState(() => pcNow ? "cal" : "menu")`。pcNow は matchMedia の初期判定）。
- `activeTab` の丸め：PC は今のまま（tabs に無ければ "cal"。"menu" も "cal"）。スマホは tabs に無い値（"menu"・"att"・"home"）はすべて `"menu"`。
- teamIntent は今のまま setTab（"att"／"home" → "cal"）。他画面から来たときは目次を通らず直接その画面。
- `alfa-tabreselect`（detail.key === "team"、スマホだけ）：`confirmLeaveMatch()` が false なら何もしない。それ以外は setSheet(null)・setRecOpen(null)・setRosSel(null)・setRosBack(null)・setTab("menu")。最新の state は ref 越しに読む（confirmLeaveRef と同じ作法）。
- スマホの **MobileSegments（.fbar の帯）は描かない**。
- スマホのヘッダー：
  - 目次：`<MobileHeader title="チーム" />`（スタッフも「チーム運営」ではなく「チーム」。右は空。戻る無し）。
  - その先の画面（cal／rec／ros／chat。rosFull・recFull でないとき）：`title` はタブの名前（カレンダー／試合記録／名簿／チャット）、`onBack={() => setTab("menu")}`、`actions` は今のまま（絞り込み・＋）。
  - rosFull（個人ページ）・recFull（試合の詳細）のヘッダーは今のまま（‹ は一覧へ）。
  - 「〜さんとして閲覧中」の帯（.mrolebanner）は今のまま（目次の上にも出る。選手として閲覧中の目次は選手の並び）。
- 帯が無くなるぶん、その先の画面の内容がヘッダーの線に付くので、`.teamapp:has(.mhead) .scroll:not(.hubmenu):not(.hubfull) { padding-top: 12px }`（ux-fix R1-6「ヘッダーのすぐ下は 12px あける」と同じ値）。rosFull（個人ページ）・recFull（試合の詳細）のときは `.scroll` に `hubfull` を付けて外す（`.phub` が上に 12px を持っていて帯も元から無かったので足さない。二重にして 24px に戻さない。`hubfull` を外してはいけない）。カレンダーも `.cal` 自身が上に 12px を持つので、`… > .cal { padding-top: 0 }` で打ち消す（5 週の月の凡例が下部タブの上端 788 に収まる）。

### 1-2. 目次の画面（activeTab === "menu"。スマホだけ）
- `.scroll` に修飾クラス `hubmenu` を付け、中に `<div className="hubtiles-wrap">`（`margin-block: auto` で縦の中央）→ `<div className="hubtiles">`（2 列グリッド、gap 12）→ タイル `<button type="button" className="hubtile half|full">`。
- CSS（基底ブロックに追加。PC では描かれないので PC reset は不要）：
  - `.teamapp .scroll.hubmenu { display:flex; flex-direction:column; padding: 12px 16px calc(56px + 12px + env(safe-area-inset-bottom)); }`（min-height の calc は使わない。はみ出したときは普通にスクロール。下部タブ `.mtab` は fixed で、`.scroll` はその裏まで伸びる。下の padding をタブの高さちょうどにすると `margin-block:auto` の中央が見える領域より 12px 下にずれ、はみ出す画面ではタイルの下端がタブに付く。そのため上と同じ 12px を下にも足し、見える領域＝ヘッダーの線〜タブの上端で中央にする）
  - `.hubtiles-wrap { margin-block: auto; }` `.hubtiles { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }` `.hubtile.full { grid-column: 1 / -1; }`
  - `.hubtile`：白いカード（--surface-lowest、1px --outline、角 var(--r-lg)）、`position:relative; text-align:left; width:100%; overflow:hidden; font-family: var(--font-ui)`。半幅 `padding: 16px 12px 22px`（› の置き場が右下）、全幅 `padding: 16px 36px 16px 12px`（› が右端の縦の中央）。`:active` は .mrow と同じ --surface-low。
  - 名前の行 `.hubtile-h`（flex、gap 8、高さ 28）：アイコン `.hubtile-ic` 24px（icons.tsx の線画。カレンダー IconCalendarCheck／試合記録 IconFlag／名簿 IconUsers／チャット IconChat）＋名前 `.hubtile-n`（17px・700・--ink・nowrap）。チャットは名前の右に `.mrow-badge`（chatBadge。0 なら出さない）。
  - 状態 `.hubtile-st`（margin-top 8、12px、--mut、line-height 19px）。**行は項目ごとに固定**し、各行 `.hubtile-ln` は高さ 19px・1 行・はみ出しは省略（flex＋`.ell { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }`。札など縮めない要素は `flex:none`）。青（--accent・700）は未回答の数字だけ。
  - › `.hubtile-chev`（文字「›」18px --mut。.mrow-chev と同じ）：半幅は `right:8px; bottom:6px`、全幅は右端の縦の中央。
  - 「これから 7 日」の帯 `.hubwk`（カレンダーのタイルだけ。名前と状態の下に縦に積む。右の余白は › のぶん）：小見出し `.hubwk-lab`「これから 7 日」12px --mut。7 日 `.hubwk-d`（flex・space-between・各 38px）：曜日 `.hubwk-w` 12px --mut（日曜は --danger）／日 `.hubwk-n` 13px・24px の丸（今日だけ --accent の地に白・700。ほかは地なし＝押せるマスに見せない）／点 `.hubwk-dots`（高さ 6px、点 6px、gap 2、**1 日に最大 3 個**。色は eventColorOf(e, groups, categories, calColorMode)。予定の無い日は空）。
- タイルの高さは中身で決まる（半幅 2 行 ≒ 114、3 行 ≒ 133、全幅チャット 2 行 ≒ 108、全幅カレンダー＋帯 ≒ 190）。かたまりは縦の中央（スタッフ ≒ 455px・上下 ≒ 140px、選手 ≒ 316px・上下 ≒ 210px）。
- タイルを押す：setRecOpen(null) して setTab(そのタブ)。押せる範囲はタイル全体。

### 1-3. タイルの中身（スタッフ＝A-3）
並び：全幅 カレンダー／半幅 試合記録・名簿／全幅 チャット。
1. **カレンダー**（全幅＋帯）：
   - 1 行目「次は 10/31(土) 17:00 全体練習」（`次は ${fmtEventDate(date)} ${time ?? ""} ${title}`。長ければ末尾を省略）。2 行目「未回答 49名」（数字と「名」を --accent・700。0 なら「未回答 0名」を --mut のまま）。次の予定が無ければ 1 行目「次の予定はまだありません」、2 行目は空（高さは保つ）。
   - nextEvent／unansweredNext は **ホームのヒーローと同じ** `useMatchdayData(board, team)`（homeData.tsx）を使う（試合記録に紐づいた予定・終わった予定を除く条件が同じになる）。選手のときは `useMatchdayData(board, team, me.id)`。
   - 帯：今日（localDateStr()）から 7 日。各日の予定は `team.team.events` を `calEventVisible(e, calFilterEff, { isCoach, me, groups, categories, calMine })` で絞り（カレンダー本体と同じ絞り込みに従う）、`occursOn(e, ymd)` で拾い、byStartAsc の先頭 3 件の色を点にする。
   - 押すとカレンダー。表示モード（月／リスト）と表示月は `calView`・`calYm`（Inner の state。タブを跨いで保持する）のまま＝前回の続き（初期は月表示で今月）。目次を通るたびに月・今月へ戻すことはしない。
2. **試合記録**（半幅）：1 行目の先頭に結果の札（`<span className="evresult w|d|l">勝 4-2</span>`。TeamHub の matchResultOf と同じ。flex:none）＋「10/20 vs 高砂フットボールクラブ」（`${M/D} vs ${opponent}`。相手名だけ省略）。最新の試合＝`team.team.matches` を date の新しい順（同じ日付は配列の後ろを新しいとみなす）の先頭。2 行目「次 11/3(火) vs 加古川FC」＝カレンダーの試合の予定（kind==="match"、date ≥ 今日、試合記録に紐づいていない（linkedEventIds）、eventPhase が "after" でない）の最初。相手名は opponentFromTitle(title) ?? title。無ければ 2 行目は空。試合が 1 件も無ければ 1 行目「まだ試合がありません」（札なし）。
3. **名簿**（半幅。showRos のときだけ）：1 行目「70 人」、2 行目「中1 23／中2 24／中3 23」（学年ごとの人数。学年の種類が 3 つ以下のときだけ内訳。4 つ以上は「N 学年」。学年未設定の選手は内訳に含めない。ラベルは gradeLabel(stage, g)）、3 行目「離脱中 1 ・ 復帰途上 1」（怪我の状態の人数。1 人は重いほうで 1 回＝ injuries に status "out" があれば離脱中、無くて "recovering" があれば復帰途上。両方 0 なら「怪我 なし」）。
4. **チャット**（全幅）：名前の右に赤い数字（chatBadge）。状態は **最新の未読 2 件** を「送り主：本文」で 2 行（各 1 行で省略。本文は ChatHome の previewOf と同じ整形＝空白を畳み、添付だけなら添付の名前）。未読が 1 件なら 1 行、未読が無ければ最新のメッセージ 1 件、1 件も無ければ「メッセージはまだありません」。送り主＝`m.fromName?.trim() || (m.from === "coach" ? "スタッフ" : 名簿の名前 ?? "選手")`。
   - 未読の集め方は **lib/badges.ts に新設**する `hubChatPreview(input: ChatBadgeInput, limit: number): ChatMessage[]`：chatBadge と同じ範囲・同じ数え方で未読を新しい順に limit 件。未読が 0 なら同じ範囲の最新 1 件。無ければ []。chatBadge と件数の基準が食い違わないよう、範囲の判定は staffUnreadTotal／memberUnreadTotal と同じ条件を使う（lib/chat.ts に「未読の一覧」を返す関数を切り出して、合計はその length にしてよい）。

### 1-4. タイルの中身（選手・保護者＝A-1 ＋ 帯）
並び：全幅 カレンダー（帯つき）／半幅 試合記録・チャット。
1. **カレンダー**：1 行目は §1-3 と同じ（自分の予定だけ）。2 行目「出欠 未回答」（未回答だけ「未回答」を --accent・700。出席／欠席／未定は --ink のまま。`team.team.attendance[e.id]?.[me.id]?.status`：yes→出席、no→欠席、maybe→未定、無し→未回答）。帯は §1-3 と同じ（calMine に従う）。
2. **試合記録**：§1-3 の 1 行目だけ（2 行目は空）。`!board.matchesPublic` なら札なしで「公開されていません」（押すと今の鍵のメッセージの画面）。
3. **チャット**：1 行目「送り主」、2 行目「本文」（hubChatPreview(…, 1) の 1 件を 2 行に分ける）。未読が無ければ最新のメッセージ、無ければ「メッセージはまだありません」。名前の右に赤い数字。

### 1-5. 変えないこと
- PC（tabs の配列・サブナビ・rolebar・CTA・3 ペイン）。
- CalendarTab／MatchesTab／RosterTab／ChatHome／MatchHub／PlayerHub の中身。
- rosFull・recFull の全画面と戻り先（rosBack）。

## 2. 個人ページ／プロフィール（案 B。スマホだけ）
- `.phubtabs` をスマホだけ折り返す：`.app:has(> .mhead) .phubtabs { flex-wrap: wrap; overflow-x: visible; }`、チップは `padding: 0 10px`（390px 幅で **5＋4 の 2 段**に収まる：基本・怪我・成長・成績表・体力測定／定期テスト・進路・活動・レポート）。sticky・高さ 44px・gap 8px・色は今のまま。`.phubtabs.more` の右端のフェードと最後のチップの余白は、折り返すと useTabRowMore が false になるので変更不要。
- PlayerHub.tsx のチップの横スクロールの補正（scrollLeft）は折り返しでは効かないだけなので触らない。PC（広い＝縦メニュー、狭い＝チップ列）は変えない。
- 中身の切り替え・ヘッダーカード・鉛筆・各セクションは今のまま。

## 3. 選手のノート（案 A ＋ ベル。NotebookScreen.tsx のスマホ・選手の分岐）
- スマホの選手の **セグメント（.mseg-wrap）を描かない**。PC（レールのサブナビ・PC ヘッダーのベル）は今のまま。
- スマホのヘッダー（選手）：
  - 題名：tab==="home" → 「サッカーノート」、"notes" → 「ノート一覧」、"notifs" → 「通知」、"report" → 「レポート」。view が root でないとき（詳細・フォーム・検索・配信の詳細）は今のまま「サッカーノート」。
  - 戻る：root でなければ今のまま `setView({ mode: "root" })`。root で tab !== "home" なら `switchTab("home")`。ホームは戻る無し。
  - 右：**ベル**（MobileHeaderAction＋IconBell＋`.mhead-badge` の赤い数字＝unread。スタッフの提出画面のベルと同じ部品・同じ数）。root の home／notes／report に出す。通知の画面（tab==="notifs"）と root でない画面には出さない。押すと switchTab("notifs")（既読時刻の更新は今のまま）。
- **ホーム（PlayerHome）の並び（スマホだけ。PC は今のまま）**：日付 → 「今日のノート」カード（.homecta。weekdots の下に「今週 2 件 ・ 連続 2 週 ・ 達成度 72%（直近 8 週）」の 1 行 `.homecta-nums`（12px・--mut）を入れ、末尾の `.pnum` カードはスマホでは出さない）→ **目次のカード**（MenuGroup＋MenuRow 3 行。アイコンは icons.tsx の線画：IconNote／IconBell／IconClipboard）→ スタッフからのコメント → コーチから（DeliverBlock）。
  - ノート一覧 ─ 「14 件 ・ 最新 10/29 練習」（自分のノートの件数と最新の 1 件の日付・種類。0 件なら「まだノートがありません」）。
  - 通知 ─ 「新着 4 ・ 練習ノートにコーチのコメントが付きました」（新着＝ベルと同じ unread、続けて新着の最新 1 件の text。0 件なら「新しい通知はありません」）。赤い数字は付けない。
  - レポート ─ 「今季 ノート 14 件 ・ 出席率 100%」（buildSeasonReport を SeasonReport の既定の期間＝今年 1/1〜今日で呼び、noteCounts.total と attendancePct。attendancePct が null なら出席率を省く。0 件なら「まだ記録がありません」）。
  - 行を押すと switchTab(その tab)。
  - **コメントは未読だけ**（未読が 0 なら最新の既読 1 枚）。未読の見出しの「未読 N 件」は今のまま。
  - PC は今のまま（PlayerHome に `pc` を渡し、pc のときは今の並び・今の .pnum・今の「未読＋既読で 3 枚」）。
- **一覧の帯の整理**（tab==="notes"、スマホ）：2 段目は「検索」＋種類チップ **3 個（試合／練習／自主練）**。「すべて」のチップを外す。どれも選んでいない＝すべて（noteKind "all"）。選んだチップをもう一度押すと外れる（"all" に戻す）。横スクロールが無くなる（合計 ≒ 290px）。
- `alfa-tabreselect`（detail.key === "notebook"。スマホだけ）：既存ノートの編集フォームを開いている、またはスタッフが詳細で送っていないコメント・図を持っているときは §0-3 の確認を出し、キャンセルなら何もしない。それ以外は、選手は setView root・setTab("home")・setSheetOpen(false)・setFilterSheet(false)（switchTab("home") が行う）。スタッフは setView root・switchTab("notes")（通知にいれば提出へ）。新規ノートのフォームは確認なしで閉じる（下書きが残る。直前 600ms の入力は残らないことがあるが、ヘッダーの「‹」や別のタブへ移るときと同じ）。
- FAB「＋」はホームと一覧に今のまま。

## 4. 検証（p36。~/.claude/alfa-verify-tools/p36_*.js。既存の番号は上書きしない）
- スタッフ：チームの目次（タイルの rect、かたまりの上下の余白が同じ±4px、各 .hubtile-ln の scrollWidth ≤ clientWidth＋1、帯の点の数 ≤ 3）、タイル → カレンダー（‹ の有無、月のマスの y）、‹ → 目次、下部タブ再タップ（カレンダーから目次へ）、ホームの「出欠を確認」→ カレンダーを直接。試合記録・名簿・チャットの画面に帯が無いこと。
- 選手：チームの目次（同じ計測。2 行目の出欠）、プロフィール（チップの行数 = 2・9 個すべて見える・帯の高さ）、ノートのホーム（目次 3 行の文言、ベルの数字、.pnum が無い）、ノート一覧（チップ 3 個・横スクロール無し）、ベル → 通知 → ‹ → ホーム。
- PC：p14_baseline／pc_baseline と比較して差分なし（identical）。
- `npx tsc --noEmit` と `npm run lint` が通ること。

## 5. 触らないこと
- PC のすべて（globals.css の PC ブロックには何も足さない）。
- ホーム・コーチング・その他・設定・練習試合・コーチラボ。
- スタッフのノート（提出｜通知）。
- カレンダー／試合記録／名簿／チャットの各画面の中身。
