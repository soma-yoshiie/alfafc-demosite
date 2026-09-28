# カレンダーの絞り込みと色の作り直し（案 A）— 2026-09-28

出典：` 分析/ALFA_FOOTBALL_カレンダー分類UI調査_2026-09-22.pdf` の「ALFA への提案 案 A」。ユーザーの追加指示 3 点を含む。

1. **スマホの月表示は Apple カレンダーのように「枠（マス）」を無くし、線で区切る。**
2. **PC の「月表示／リスト表示」の切替は今の場所・見た目のまま**（変えない）。
3. **スマホのリスト表示に「画像で保存」ボタン**。押すと、その月の予定（リスト表示に出ている全件）が 1 枚の画像に入る。

対象：`components/TeamHub.tsx`（`CalendarTab`・`SheetHost`・グループ管理シート・スマホヘッダー）、`lib/groups.ts`、`lib/storage.ts`、`lib/types.ts`、`components/TeamProvider.tsx`、新規 `lib/exportCalendar.ts`、`app/globals.css`。

## 1. 色の役割を変える

- **グループ＝色、種類＝文字。** 月のマスとリスト行の色は「対象グループ」の色にする。種類（練習／試合／遠征・合宿／保護者会）は色ではなく文字（ラベル・帯の先頭 1 文字）で表す。
- `TeamGroup` に `color?: string`（HEX）を足す。値は固定パレット `GROUP_PALETTE`（`lib/groups.ts`、8 色）のみ：
  `#15803d`（緑）`#2563eb`（青）`#7c5cbf`（紫）`#0f766e`（ティール）`#d6324b`（赤）`#c2418f`（ピンク）`#8a5a2b`（ブラウン）`#b7791f`（琥珀）。
  オレンジ（試合のカテゴリ色 `#d9731f`）とネイビー（全員向け）は入れない。
- **全員向け（`groupIds` なし／空／全部削除済み）＝ネイビー**（CSS は `var(--blue)`＝`--ink`、Canvas は `#15233c`）。定数 `ALL_TARGETS_COLOR` を `lib/groups.ts` に置く。
- 割り当ては自動：`ensureGroupColors(groups)`（`lib/groups.ts`）が、色の無いグループに「まだ使われていないパレット色」を配列順（学年→カスタム）に付ける。8 個を超えたら使用回数が最少の色。呼ぶ場所は `lib/storage.ts` の読み込み正規化（`kind` を補っている箇所）と `components/TeamProvider.tsx` の `groups`（`ensureGradeGroups` の後）、`addGroup`／`addGradeGroup`、`lib/groups.ts` の `gradeGroupsFor` が新規に作るとき。デモの初期グループ（`lib/sampleTeam.ts`）にも色を書いておく。
- ヘルパー `groupColorOf(e: TeamEvent, groups: TeamGroup[]): string`（最初に解決できた対象グループの色。無ければ `ALL_TARGETS_COLOR`）。
- **グループ管理シート**（`sheet.type === "groups"`）の各行の先頭に色の丸（14px）を出す。丸をタップするとその行の下に 8 色のパレット（`.grouppick` 文法の丸いチップ）が開き、選ぶと `team.updateGroup({...g, color})`。PC も同じ（パレットのチップは四角 `--r-md`）。
- 他の画面（名簿・戦術ボード・ノート・チャット）の見た目は**今回は変えない**（色を持たせるだけ）。

## 2. 絞り込みの状態

コーチ（`isCoach`）：

- 減算型の複数選択。保存する値は「隠しているもの」：`{ hiddenGroupIds: string[]; hideAllTargets: boolean; hiddenCategoryIds: string[] }`。新しく作ったグループ・カテゴリは自動で表示側に入る。
- `lib/storage.ts` に `loadCalFilter()`／`saveCalFilter()`（localStorage `soccer_tactics_calfilter_v2`）。旧 `loadCalGroup`／`saveCalGroup`（`soccer_tactics_calgroup_v1`）と `Inner` の `calGroup`／`calGroupEff` は撤去し、旧キーは読まない（読み込み時に `removeItem`）。
- 予定 `e` を表示する条件：`!hiddenCategoryIds.includes(categoryOf(e).id)` かつ（`isAllTargets(e)`（解決できる対象グループが 0 件を含む）なら `!hideAllTargets`、そうでなければ「解決できた対象グループのうち 1 つでも隠していない」）。
- 存在しない ID が `hidden*` に残っていても無視する（掃除は保存時に現存 ID だけ残す）。

選手・保護者（`!isCoach`）：

- 既存の `calMine`（既定 true＝自分の予定）はそのまま。加えて種類の非表示 `hiddenCategoryIds` を同じ保存値で持つ（グループの非表示は持たない）。
- `calMine=false`（すべて）のとき、自分が対象でない予定はリスト行の対象名の代わりに薄い「対象外」ラベル（`.evgroups.outside`、`--mut` 文字・枠線のみ）を出す。月のマスの点は出す。

同じ判定関数 `calEventVisible(e, filter, ctx)` を `CalendarTab`・日別シート（`SheetHost` の `dayPassesFilter`）・「今日からの予定」・画像保存の 4 か所で共用する（`lib/calendarUtils.ts` に置く。`ctx = { isCoach, me, groups, categories, calMine }`）。

## 3. 絞り込みの入口と部品

### 3-1. 共通部品 `CalFilterPanel`

`components/TeamHub.tsx` 内の関数コンポーネント（`props: { filter, setFilter, isCoach, me, calMine, setCalMine, groups, categories, onManageGroups?, compact?: boolean }`）。中身は上から：

- 見出し行（スマホのシートだけ）：「表示する予定」＋右上「完了」（シートを閉じる）。
- コーチ：セクション **学年**（`kind==="grade"`）／**グループ**（`kind==="custom"`。0 件なら見出しごと出さない）／**種類**（`team.categories`）。各セクション見出しの右に「すべて選択」または「すべて解除」（全部表示中なら「すべて解除」、それ以外は「すべて選択」の 1 つだけ）。
  - グループの行：**丸いチェック**（`.calchk`、22px。表示中＝グループ色で塗り＋白いチェック、非表示＝グループ色の 1.5px 枠だけ）＋グループ名。行全体（高さ 44px）がタップ領域。
  - 種類の行：四角いチェック（`.calchk.sq`、ネイビー）＋カテゴリ名。横並びの折り返し（`.grouppick` と同じ並び）でよい。
  - 末尾：トグル「全員向けの予定を含める」（`.calfilter-toggle`、既存のトグル文法があればそれ）／リンク「グループを編集…」（`onManageGroups` → `setSheet({type:"groups"})`。PC は同じ関数で pane 表示）。
- 選手・保護者：トグル「自分の予定だけ」（`calMine`）＋セクション **種類**。グループのセクションと「全員向け」トグルは出さない。
- 「＋ 管理」チップ・`.calfilter` の行・`.calfilterhint` は **撤去**。

### 3-2. スマホ（`.teamapp:has(.mhead)`）

- `MobileHeader` の右アクションに「絞り込み」（`IconFilter` が無ければ `components/icons.tsx` に漏斗アイコンを足す。線画・24px）を **カレンダータブのとき** 追加する（コーチは「絞り込み」→「＋ 予定を追加」の順、選手は「絞り込み」だけ）。何かを隠しているとき（`hiddenGroupIds`／`hiddenCategoryIds` が 1 件以上、または `hideAllTargets`、選手は `calMine`）はアイコン右上に小さな点（`.mhead-action .dot`、8px、`--accent`）を出す。数字のバッジは出さない。
- 押すと下からのシート `setSheet({ type: "calfilter" })`（`SheetState` に追加。既存の `Sheet` 部品）に `CalFilterPanel` を出す。「完了」で閉じる。
- 月の見出し（`.calnav`）の直下に **選択中の 1 行** `.calsel`（12px、`--mut`）：
  - 何も隠していない：「すべての予定」。
  - それ以外（コーチ）：表示中のグループを「● 中2 ● GK」（点はグループ色、8px）で並べ、`hideAllTargets` でなければ末尾に「＋ 全員向け」。種類を隠していれば「・練習のみ」のように表示中の種類名を続ける。長ければ 1 行で省略（`text-overflow: ellipsis`）。
  - 選手：「自分の予定」または「すべての予定」（種類を隠していれば同様に続ける）。
- 本文の前は「セグメント（カレンダー／試合記録／…）→ 月送り → 選択中の 1 行 → 月・リスト切替」の順。

### 3-3. PC（`usePc()`）

- `.cal` を 2 列にする：左 `.calside`（幅 200px、上端そろえ、`position: sticky; top: 0`）に `CalFilterPanel`（見出し行なし、常時表示）、右に従来のカレンダー本体（`.calmain`）。`.teamapp .cal` の `max-width: 720px` は `.calmain` に移し、`.cal` 自体は `max-width: 940px`。
- **月送り・「月表示／リスト表示」の切替・「＋ 予定を追加」は今のまま**（位置・見た目・CSS を変えない）。
- 選択中の 1 行 `.calsel` は PC でも `.calnav` の直下に出す（左のリストがあっても、月の見出しの近くで状態が読める）。
- PC の操作部品は四角（`--r-md`）。ただし色の丸チェック `.calchk` は「状態を示す部品」なので丸のまま。

## 4. 月のマス

### 4-1. スマホ（`.teamapp:has(.mhead) .calcell`）

- **枠を無くす**：`border: 0; border-radius: 0; background: transparent; box-shadow: none`。行の区切りは各マスの `border-bottom: 1px solid var(--line)`。曜日行 `.calhead` の下にも 1px。マスの間隔 `gap: 0`（横の区切り線は引かない）。マスの高さは固定 `min-height: 52px`（`aspect-ratio` は外す）。
- 日付は中央上（`.caldate`、13px 700）。**今日**は日付の後ろに `--accent` の丸（26px、白文字）。既存の `.calcell.today` の枠と inset の影は出さない。
- 点 `.caldot`：**グループ色**（`groupColorOf`）、7px、影なし、最大 3 個。4 個目からは点 2 個＋「+」（`.caldotmore`、12px。現在の「+n」から数字を外して「+」だけにする＝BAND 式。数字は下のリストで分かる）。
- **試合**（`e.kind === "match"`）の点は塗りではなく **輪（2px の枠、中は透明）**。
- 先月・翌月の空きマス（`.calcell.empty`）は日付なしで区切り線だけ。

### 4-2. PC・タブレット（`@media (min-width: 700px)` の `.teamapp .calcell`）

- マスの枠は**今のまま**（角丸の箱）。
- 帯 `.calev` の色を**グループ色**にする（`background: groupColorOf`）。テキストは「時刻 タイトル」のまま。**試合**は帯の先頭に「試 」を付ける。練習は付けない。その他のカテゴリは先頭 1 文字（「遠 」「保 」）。
- 帯は 2 本＋「+N」（既存の `＋N件` を「+N」に短くする。12px）。

## 5. リスト行（`.agrow`／`.agbar`）とスマホの「今日からの予定」

- `.agbar` の左の縦線（`borderLeftColor`）を**グループ色**にする。
- `.agkind`（種類バッジ）は色を付けない：文字 `--ink`、地は `--surface`（薄い灰）。先頭の `.evdot` はグループ色（スマホ）。PC も `.agkind` の背景色（カテゴリ色）をやめて同じ見た目にする。
- 対象名（`EvGroupsBadge`）の先頭に点（グループ色、7px）を付ける。全員向けは点なし。
- 選手の「すべて」で対象外なら §2 の「対象外」ラベル。
- リスト行の構成は「日付｜点＋種類｜タイトル｜対象｜時刻」。

## 6. スマホのリスト表示「画像で保存」

- リスト表示（`view === "list"`、スマホのみ。PC は出さない）の先頭に 1 行 `.callistbar`：左「この月の予定 N 件」（12px `--mut`）、右にボタン「画像で保存」（`.callistsave`、高さ 36px、`--accent` の枠と文字、白地。アイコン `IconDownload` があれば先頭に）。
- 押すと `lib/exportCalendar.ts` の `renderCalendarListPng(input): string`（dataURL）で PNG を作る。**Canvas 2D だけ**で描く（html2canvas 等は入れない）。`lib/exportImage.ts` の `renderTacticPng` と同じ作法（`scale = 2`、`clip()` でタイトルを省略）。
  - 入力：`{ ym: {y, m}, teamName: string | null, days: { d: number; wd: number; evs: { title; timeLabel; categoryLabel; color; targetLabel; isMatch; outside?: boolean }[] }[], selLabel: string }`（`CalendarTab` の `monthDays` をそのまま渡す。絞り込み後の全件＝リスト表示と同じ内容。**スクロールに関係なく全部**）。
  - 画面設計（幅 540px × 高さは内容で伸びる。上から）：白地。ヘッダー 88px：左「2026年9月の予定」（22px 700 `#1d1f24`）、その下にチーム名と選択中の 1 行（12px `#6b7280`）。右上に「ALFA FOOTBALL」（12px 700）。日ごとに：左 56px に日付（22px 700）と曜日（11px。日は `#d6324b`、土は `#2c6fd6`）、右に予定 1 件 1 行（行高 44px、行間 6px）：左端にグループ色の縦線 4px、点（試合は輪）＋種類ラベル（11px、灰の角丸）、タイトル（14px 700、幅に収まらなければ「…」）、その下に時刻・対象（12px `#6b7280`）。日と日の間に 1px `#e3e6ea` の線。フッター 32px：「ALFA FOOTBALL で作成」（10px `#9aa4b2`）。
  - 予定が 0 件なら Canvas を作らず `board.toast("この月の予定はありません")`。
- 保存の手段：`navigator.canShare && navigator.canShare({ files })` が使えれば `navigator.share({ files: [File(png)], title })`（iPhone では「画像を保存」が共有シートに出る）。使えなければ `downloadDataUrl(dataUrl, "予定_2026-09.png")`。共有をキャンセルしたとき（`AbortError`）は何もしない。成功時 `board.toast("画像を保存しました")`（共有の場合は出さない）。
- ファイル名：`予定_YYYY-MM.png`。

## 7. 変えないもの

- 予定フォームの「カテゴリ」「対象」の 2 段（正しい分離）。予定詳細・日別シートの `.evkind`（カテゴリ色バッジ）はそのまま。
- カテゴリの色設定（`categories` シート）はそのまま（予定詳細などで使い続ける）。
- 他画面の `useGroupFilter`／`GroupChips`。チャット・名簿・ノート・戦術ボードの絞り込み。
- PC の月送り・月／リスト切替・「＋ 予定を追加」・右上 `.teamcta`。
- スマホ下部タブ・`MobileSegments`（カレンダー／試合記録／…）。

## 8. CSS の契約

`app/globals.css` の行頭 `@media` は 9 本のまま。新規ルールは基底（最初の `@media (min-width: 1024px)` より前）。スマホ限定は `.teamapp:has(.mhead)`。PC だけの調整は 2 つ目の PC ブロック末尾 `/* === mobile-redesign PC reset === */`。色はトークンのみ（グループ色はインライン `style` の値だけ。新規 hex を CSS に書かない）。文字 12px 以上、スマホのタップ領域 44px 以上、緑（`--primary`）は主ボタンだけ、PC の操作部品は四角（`--r-md`、丸チェックは例外）。スマホ 390px で横はみ出しゼロ。`.calcell` の PC 側の枠・角丸（`16992` 行付近）は触らない。

## 9. 受け入れ基準

1. スマホ・コーチ：ヘッダー右に「絞り込み」と「＋」。チップの行と「〜の予定と全員の予定を表示中」が無い。月送りの下に「すべての予定」の 1 行。月のマスに枠が無く、週ごとに線で区切られ、今日は青い丸。点はグループ色（全員向け＝ネイビー、試合＝輪）。
2. 「絞り込み」→ シートで「中1」「中3」を外して完了 → 月の点とリストから中1・中3 だけの予定が消え、全員向けは残る。1 行が「● 中2 ● Aチーム ● Bチーム ● GK ＋ 全員向け」になる。「全員向けの予定を含める」を切ると全員向けも消える。ヘッダーの絞り込みアイコンに点が付く。再読み込みしても保持される。
3. 新しいグループを追加すると自動で色が付き、最初から表示側にある。
4. スマホ・選手：ヘッダーに「絞り込み」。シートは「自分の予定だけ」トグル＋種類。「すべて」にすると対象外の予定に「対象外」。
5. PC・コーチ：カレンダーの左に常設のリスト（学年／グループ／種類・すべて選択／解除・全員向けトグル・グループを編集）。チップの行が無い。月送り・月／リスト切替・「＋ 予定を追加」は変更前と同じ位置・見た目（変更前のスクショと差分で確認）。月のマスは枠付きのまま、帯がグループ色、試合の帯は「試 」から始まる。
6. スマホ・リスト表示：先頭に「この月の予定 N 件」と「画像で保存」。押すと 540×(内容)px の PNG（@2x）ができ、その月の予定が全件入っている（件数＝リストの件数）。共有シートが使える端末では共有、使えなければダウンロード。
7. グループ管理シートに色の丸があり、タップして色を変えると月の点・リストの線が変わる。
8. 日別シート（日付タップ）とスマホの「今日からの予定」もシートの絞り込みに従う。
9. `grep -c "^@media" app/globals.css` が 9。`npx tsc --noEmit` が通る。スマホ 390px で横はみ出しなし。

## 10. 検証手段

- 開発サーバー http://localhost:3000（落ちていたら `(nohup npm run dev > /tmp/alfa_dev.log 2>&1 &)`）。`next build` 禁止。
- 起動から保存データの読み込みまで 3〜4 秒（スプラッシュ）→ goto／reload の後は 6 秒待つ。コーチのシード：`scratchpad/tools/p4_verify2/lib.js` の `seedCoach`。選手：`localStorage.alfa_session_v1 = {"role":"player","email":"sora@alfafc.example","name":"佐藤 蒼空","playerId":"p08"}`（`scratchpad/tools/p6_calshots_player.js` 参照）。
- 変更前の基準スクショ：`scratchpad/calres/alfa/`（PC 01〜04、スマホ 11〜14）。
- PNG の検証：puppeteer で `page.on("dialog")` ではなく、`navigator.share` を `undefined` に上書きしてダウンロード経路にし、`page._client().send("Page.setDownloadBehavior", { behavior: "allow", downloadPath })` で保存して PIL で寸法と（テキストの代わりに）行数（グループ色の縦線の本数）を数える。

## 11. 追補（2026-09-28 ②・ユーザー指示。コードとこの節が §3〜§6 より優先）

### 11-1. PC：絞り込みパネルを左端に寄せ、隠せるようにする

- 今は `.cal`（`max-width: 940px`）が中央に置かれ、パネルがカレンダーの左に密着して、左レールとの間に空白ができている。**パネルは本文領域の左端**（`.scroll` の左パディング位置）に置き、カレンダー本体は残りの幅をすべて使う：`.teamapp .cal { max-width: none; grid-template-columns: 220px minmax(0, 1fr); gap: 24px }`、`.calmain { max-width: none; justify-self: stretch; min-width: 0 }`。月グリッドは幅いっぱい（マスが広がる）、リスト表示も同じ幅。
- **隠す／出す**：`.calside` の最上部に「‹ 絞り込みを隠す」（`.calside-hide`、テキストボタン 13px `--accent`、右寄せ）。隠すと `.cal` に `side-hidden` が付き 1 列（`grid-template-columns: minmax(0, 1fr)`）、`.calmain` が全幅になり空白を作らない。出すボタンは `.calnav` の行の左端に「絞り込み」（`.calshow`：`IconFilter`＋文字、四角 `--r-md`、高さ 32px。何か隠していれば右上に点 `.dot`）。`.calnav` は中央寄せのままにするため PC だけ `position: relative` にし、`.calshow` は `position: absolute; left: 0; top: 50%; transform: translateY(-50%)`。
- 開閉の状態は `Inner` の `calSideOpen`（既定 true）。localStorage `soccer_tactics_calside_v1`（"open"／"closed"）に保存する（`lib/storage.ts` に `loadCalSideOpen`／`saveCalSideOpen`）。
- スマホ（シート）には影響しない。月送り・月／リスト切替・「＋ 予定を追加」の DOM と見た目は変えない（`.calshow` は `.calnav` の中に足すが、中央の年月と矢印の位置は動かない）。

### 11-2. スマホ：月のマスを大きくして予定の名前を出す。「今日からの予定」は撤去

- ユーザーの参考画像（iPhone のカレンダー・月表示「詳細」）：週の行が画面の高さを埋め、マスの中に予定の名前が薄い色地のピルで入る。
- `.teamapp:has(.mhead) .calcell { min-height: 100px }`（5 週の月でほぼ画面が埋まる。6 週は縦スクロール）。日付は左上（`text-align: left; padding-left: 4px`）。
- マスの中身は点（`.caldots`）ではなく **ピル**（`.calevs` を使う。`.calev`）：1 件 1 行、**12px** 700、高さ 18px、`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`、角丸 4px、幅いっぱい。**色は薄い色地＋濃い同系色の文字**：`background: color-mix(in srgb, var(--gc) 18%, transparent); color: color-mix(in srgb, var(--gc) 65%, var(--ink))`。`--gc` は JS 側のインライン `style={{ "--gc": groupColorOf(...) }}` で渡す（CSS に hex は書かない）。試合は先頭に「試 」、その他のカテゴリは先頭 1 文字（練習は無し）＝§4-2 と同じ規則。時刻は出さない（幅が無い）。
- 1 マス 3 件まで、4 件目からは 2 件＋「+N」（`.calmore`、12px）。
- **PC・タブレットの帯（`.calev`）も同じ薄い色地＋濃い文字のピルにする**（§11-3 で明るい色（イエロー等）が選べるようになるため、白文字の帯では読めない）。PC は時刻を残す（`時刻 タイトル`）。
- `.caldots`／`.caldot`／`.caldotmore` はマスからは撤去（DOM も出さない）。凡例 `.callegend` の点はそのまま（色＝グループの対応表として残す）。
- スマホの月表示の下の **「今日からの予定」ブロック（`.calagenda`）は撤去**（リスト表示で足りる）。PC は元々出していない。
- 今日の青い丸・週ごとの線区切り・曜日行は §4-1 のまま。タブレット（700〜1023px）の箱型は §4-2 のまま（ピルの見た目だけ変わる）。

### 11-3. 色の選択肢を iPhone のカレンダーと同じにする（グループ・カテゴリ共通）

- 参考画像 3：「カレンダーのカラー」＝レッド／オレンジ／イエロー／グリーン／ブルー／パープル／ブラウン／カスタム… の縦リスト（左に色の丸、選択中の行の右にチェック）。参考画像 4：「カスタム…」は OS の色ピッカー（グリッド／スペクトラム／スライダ）。
- `lib/groups.ts` の `GROUP_PALETTE` と `lib/calendarUtils.ts` の `CATEGORY_PALETTE` を **1 つの `COLOR_CHOICES`**（`lib/colors.ts` ではなく `lib/groups.ts` に置き、calendarUtils からは re-export）に統一する：
  `レッド #ff3b30`／`オレンジ #ff9500`／`イエロー #ffcc00`／`グリーン #34c759`／`ブルー #007aff`／`パープル #af52de`／`ブラウン #a2845e`（iOS の system color）。
- **自動割り当て**（`ensureGroupColors`／`gradeGroupsFor`／`addGroup`／`addGradeGroup`）の順は ブルー→グリーン→パープル→オレンジ→レッド→ブラウン→イエロー（`AUTO_COLOR_ORDER`）。使い切ったら使用回数が最少の色。
- **移行**：保存済みの色が旧 `GROUP_PALETTE` の 8 値（`#15803d #2563eb #7c5cbf #0f766e #d6324b #c2418f #8a5a2b #b7791f`）のときは未設定とみなして自動で付け直す（旧色はもう選択肢に無いため）。それ以外の値（ユーザーがカスタムで選んだ色）は保持する。`lib/sampleTeam.ts` のデモグループも新しい色に書き換える。
- **色を選ぶ部品 `ColorChoiceList`**（`components/TeamHub.tsx` 内。`props: { value: string; onChange: (hex) => void }`）：縦リスト。各行 44px、左に色の丸（14px）＋名前、`value` と一致する行の右にチェック（`--accent`）。最後の行「カスタム…」は丸に現在のカスタム色（`value` が 7 色のどれでもないときはその色でチェック付き。7 色のどれかなら丸は `--mut` の枠だけ）。「カスタム…」を押すと、行の中に隠してある `<input type="color">` を `click()` して OS の色ピッカーを開く（iPhone では参考画像 4 と同じ画面になる。PC は OS のダイアログ）。`onChange`（または `onInput`）で `onChange(hex)`。
- 使う場所：①グループ管理シートの色の丸をタップ → 行の下に `ColorChoiceList`（今の `.grpswatches` を置き換え）。②カテゴリ管理シートの編集行と「新しいカテゴリを追加」（今の `.swatches` を置き換え。新規の既定は ブルー）。組込みカテゴリ（練習＝ネイビー、試合＝オレンジ `#d9731f`）の既定値はそのまま（`BUILTIN_CATEGORIES` は触らない。ユーザーが変えたいときはリストから選べる）。
- `EventCategory.color` の「プリセットパレットの値のみ」という制約はやめる（任意の HEX）。`lib/types.ts` のコメントも直す。
- リストの見た目は PC も同じ（行は操作部品だが「リストの行」なので四角の角丸は付けない。チェックは `--accent`）。

### 11-4. 受け入れ

1. PC 1440：絞り込みパネルが本文領域の左端（左レールのすぐ右）にあり、カレンダーが残りの幅いっぱい。「‹ 絞り込みを隠す」で 1 列になりカレンダーが全幅、`.calnav` 左端の「絞り込み」で戻る。再読み込みしても開閉が保持される。月送り・月／リスト切替の位置（中央）と見た目は変わらない。
2. スマホ 390：月のマスが高さ 100px 以上で、予定名のピル（薄い色地＋濃い文字、12px）が入る。試合は「試 」から始まる。4 件以上は 2 件＋「+N」。月の下に「今日からの予定」が無い。横はみ出しなし。
3. グループ管理の色の丸 → レッド／オレンジ／イエロー／グリーン／ブルー／パープル／ブラウン／カスタム… のリスト。選ぶと月のピル・リストの線・凡例が変わる。「カスタム…」で OS の色ピッカーが開き、任意の色が保持される（再読み込み後も）。
4. カテゴリ管理（編集・新規）も同じリスト。
5. 既存デモの 6 グループは新しい色（ブルー／グリーン／パープル／オレンジ／レッド／ブラウン）になる。
6. `grep -c "^@media" app/globals.css` が 9。`npx tsc --noEmit` が通る。CSS に新規 hex を書かない（色は `--gc` のインライン変数と `color-mix`）。
