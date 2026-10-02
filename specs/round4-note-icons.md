# サッカーノートの予定別・提出カード・アイコン（2026-10-02・第 4 弾）

統括・設計：Fable 5.1 ／ 実装：Sonnet 5.5 ／ レビュー：Opus 5.5
前提：`specs/round3-notes-league.md`（p16。§8）ほか。共通の約束（`@media` 9 本・基底と PC reset の置き場所・文字 12px 以上・スマホのタップ 44px・dev サーバー操作とビルドの禁止・コミットしない・`E` を新しい見出しに使わない）はそのまま。変えた箇所の注記は「p17 §n」。

## 0. 依頼（ユーザーの言葉）

1. カレンダーで「サッカーノートに反映する」をオンにして予定を追加しても、サッカーノートの予定別に出ない。連携する。
2. スタッフ側のサッカーノートの提出一覧（未読を含む）の、選手 1 人ぶんの枠をもっと薄く。一番下の本文の抜粋（「ポゼッション練習で前を向く回…」「vs a ・ 1フェーズ / プレー8件」など）はいらない。
3. 提出のアイコン（試合＝漢字の「試」、練習＝顔文字、自主練＝漢字の「自」）を、添付 PDF の SVG に変える。
   - 試合＝交差するフラッグ（PDF どおりの青）
   - 練習＝ボール（PDF の練習の候補と同じ緑）
   - 自主練＝選手＋ボール（PDF どおりの黄土色）
4. 戦術ボードと練習メニューのアイコンも変える。
   - 戦術ボード＝ピッチ（色は今までどおり白黒）
   - 練習メニュー＝トレーニングコーン（色は今までどおり白黒）

## 原因（1 について。統括が実画面で確認済み）

予定別は「今日までの予定」だけを並べる作り（`e.date <= today`）。今日・昨日の日付で作った予定は反映をオンにすれば出るが、**明日以降の日付の予定は出ない**。データ（`noteTarget`）は正しく保存されている。

---

## §1 予定別に「これからの予定」を出す（components/NotebookScreen.tsx の NoteList）

- 今の一覧（今日までの予定 30 件）の**上**に、これからの予定の区画を足す。スタッフ・選手とも。
- 対象：`e.date > today` かつ `eventNoteTarget(e, team.categories)`。並びは日付・時刻の昇順（近い順）。スタッフが種類で絞っているときは今の一覧と同じ条件で絞る（試合／練習。自主練のときは 0 件）。データの読み方は今の `events` と同じ（予定別へ切り替えるたびに `loadTeam()` を読み直す）。
- 表示：
  - 見出し `<div className="evgsech">これからの予定</div>`。
  - 近い順に **5 件**。6 件以上あるときは末尾にテキストボタン `button.evgmore`「ほか N 件を表示」。押すと全部出る（もう一度押すと「たたむ」で 5 件に戻る。state は NoteList の中、画面を離れたら戻る）。
  - 行は今の予定の行（`.evgrow`）と同じ並び（日付・種類・予定名）で、クラス `soon` を足す。**開閉しない**（提出はまだ無いので押せない行。`<div className="evgrow soon">`、シェブロンなし）。右側は「提出 N／M」の代わりに `<span className="evgrowcount soon">これから</span>`。
  - これからの予定が 1 件以上あるときだけ、今の一覧の上にも見出し `<div className="evgsech">今日までの予定</div>` を出す（0 件のときは見出しを出さず、今の見た目のまま）。
- 0 件のときの文言（今日までの予定が 0 件）：今の出し分けのまま。ただし、これからの予定があって今日までの予定が無いときに「カレンダーに今日までの予定がありません。」と「サッカーノートに反映する予定がありません…」のどちらを出すかは、今の判定（今日までの予定があるか）のままでよい。
- 基底 CSS：`.noteapp .evgsech`（12px・700・`--mut`・margin 10px 2px 4px）、`.noteapp .evgrow.soon`（`cursor: default`。押せる見た目にしない。予定名は `--ink`、日付と種類は今のまま）、`.noteapp .evgrowcount.soon`（`--mut`・地なし）、`.noteapp .evgmore`（テキストボタン。`--accent`・13px・700・min-height 44px・左寄せ。PC reset で 32px）。

---

## §2 スタッフの提出カードを薄く

- `NoteCard`（NotebookScreen.tsx）：`staffView` のときは本文の抜粋 `<div className="notebody">` を**描かない**（選手側の自分のノート・チームの共有は今のまま）。
- スタッフのカードの寸法（基底＝スマホ。`.noteapp .notecard.staffview`）：
  - 上下の余白を詰める（padding 8px 12px）。タップ領域は `min-height: 52px` で確保。
  - アイコンの枠 `.notecond` は 28px（地の色・枠なし。§3）。
- PC（PC reset。スタッフの一覧の列）：`.coachapp:has(.nbmain) .scroll .notecard.staffview` の上下の余白を 6px に。氏名の行と「種類・日付・タグ」の行の 2 行に収まること（今は 3 行）。
- 目標の高さ：スマホ 約 52〜60px（今は約 72〜98px）、PC 約 52px（今は約 94px）。
- 予定別を開いたときに出るカード（`.evgnotes` の中の同じ `NoteCard`）も同じ扱い。
- ノート検索の結果のカード（NotebookTools.tsx）は今回は変えない（アイコンだけ §3 で替わる）。

---

## §3 ノートの種類のアイコン

### 3-1 アイコン（components/icons.tsx）

PDF の SVG（32×32・線幅 1.8・丸い端）をそのまま使う。`Svg32Note` のような小さな共通部品（`viewBox="0 0 32 32"`、`fill="none"`、`stroke="currentColor"`、`strokeWidth={1.8}`、`strokeLinecap="round"`、`strokeLinejoin="round"`、`aria-hidden`）を作り、次の 3 つを export する。

```tsx
// 試合＝交差するフラッグ
export function IconNoteMatch(p) → <path d="M6 27L21 4L28 9L23 15L17 11M26 27L11 4L4 9L9 15L15 11" />
// 練習＝ボール
export function IconNotePractice(p) → <circle cx="16" cy="16" r="11" />
  <path d="M16 10L21.7 14.1L19.5 20.7L12.5 20.7L10.3 14.1ZM16 10V5M21.7 14.1L26.5 12.7M19.5 20.7L22.5 25M12.5 20.7L9.5 25M10.3 14.1L5.5 12.7" />
// 自主練＝選手＋ボール
export function IconNoteSolo(p) → <circle cx="11" cy="6" r="2.5" />
  <path d="M10 11L15 12L18 16M13 12L11 19L17 22L19 26M11 19L7 26M10 13L6 17" />
  <circle cx="25" cy="25" r="3" />
/** ノートの種類のアイコン */
export function NoteKindIcon({ kind }: { kind: "match" | "practice" | "solo" })
```

### 3-2 使う場所

次の 3 か所の `.notecond` の中身を `NoteKindIcon` に替え、`className` に種類のクラスを足す（`notecond k-match`／`k-practice`／`k-solo`）。体調の顔（`ConditionIcon`）と漢字 1 文字はこの枠には出さない。

- `NoteCard`（NotebookScreen.tsx。スタッフ・選手の一覧）
- ノートの詳細のヘッダー（NotebookScreen.tsx の `.notecond.big`）
- ノート検索の結果のカード（NotebookTools.tsx）

体調の表示：一覧のカードからは外す。**詳細**では、体調がほかの場所に出ていなければ、ヘッダーの日付の並びに小さく残す（`ConditionIcon` を 16px で。`title`／`aria-label` に体調の名前）。既に詳細の本文に体調の項目があるなら足さない。

### 3-3 色と寸法（app/globals.css）

- `:root` にトークンを足す（PDF の色。ユーザーの指定）：
  `--note-match: #365d91;`／`--note-practice: #267b6e;`／`--note-solo: #91702f;`
- 基底：
  - `.noteapp .notecond`：地の色・枠をやめ、28px の枠にアイコン 24px（`svg { width: 24px; height: 24px; }`）。`.notecond.big` は 40px の枠にアイコン 32px。
  - `.noteapp .notecond.k-match { color: var(--note-match); }`／`.k-practice { color: var(--note-practice); }`／`.k-solo { color: var(--note-solo); }`
- PC に `.notecond` の上書き（大きさ・地の色）があれば、同じ見た目になるよう PC reset で合わせる（1 本目の PC ブロックは編集しない）。

---

## §4 戦術ボード・練習メニューのアイコン

`components/icons.tsx`：ナビ用は周りのアイコン（24×24・線幅 2）と線の太さをそろえるため、`viewBox="0 0 32 32"`・`strokeWidth={2.67}` の共通部品（`Svg32`）で描く。色は `currentColor`（今までどおり）。

```tsx
// 戦術ボード＝ピッチ（新規）
export function IconPitch(p) → <rect x="5" y="3" width="22" height="26" rx="1.5" />
  <path d="M5 16H27M11 3V8H21V3M11 29V24H21V29" />
  <circle cx="16" cy="16" r="4" />
// 練習メニュー＝トレーニングコーン（既存の IconCone の中身を差し替える。PDF の形のまま、枠の中央へ 3 だけ右に寄せた）
export function IconCone(p) → <path d="M14 5L24 24L8 24ZM11.7 17H20.3M11 13H18.2M6 27H26" />
```

- 戦術ボードの入口で `IconClipboard` を使っている所を `IconPitch` に替える：`ConsoleShell.tsx`（レールの「戦術ボード」）、`CoachingHub.tsx`（戦術ボードの入口。`play` のアイコンと戦術ボードのカード）、`HomeMenu.tsx`（戦術ボードの入口）。ほかに「戦術ボードへ行く」意味で `IconClipboard` を使っている所があれば同じく替える（grep で確かめる。クリップボード本来の意味＝メモ・貼り付けなどで使っている所は替えない）。
- 練習メニューは `IconCone` の中身を替えるだけで全部の入口が替わる（`ConsoleShell.tsx`・`CoachingHub.tsx`・`HomeMenu.tsx`・`SheetManager.tsx`）。
- 使わなくなった import は消す。

---

## §5 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. 明日以降の日付で、反映をオンにした予定を追加 → サッカーノートの予定別の「これからの予定」に出る。反映しない予定は出ない。6 件以上は「ほか N 件を表示」。
3. スタッフの提出一覧のカードに本文の抜粋が無く、スマホ 60px 以下・PC 56px 以下。選手側のカードは今のまま抜粋あり。
4. 提出カードのアイコンが、試合＝フラッグ（青）、練習＝ボール（緑）、自主練＝選手＋ボール（黄土色）。漢字・顔文字が無い。
5. レールの戦術ボードがピッチ、練習メニューがコーン（白黒）。コーチングの入口・ホームの入口も同じ。
6. ほかの画面に差分が無い（アイコンを替えた入口を除く）。

---

## §6 実装時の判断（2026-10-02。以後はここが正）

実画面の確認（受け入れ 24 項目、前回までの 163 項目、ほかの画面はレール・入口のアイコン以外に差分なし）と、Opus 5.5 のレビュー（2 観点。確定 6 件＝重複を除いて 4 件）を受けて、統括が次のとおり決めた。

- **これからの予定の行**：PC の一覧の列でも「これから」は 1 行目の右に置く（2 行目へ回すルールは、行が折り返さず予定名が幅 0 に潰れたので外した）。0 件の文言は「今日までの予定」の見出しの下に置く。「ほか N 件を表示」は PC 32px（タッチの PC 幅は 44px）。
- **スタッフのカードの高さ**：PC は 2 行で 55px（上下 4px・行間 0・間 6px）。スマホは 1 行で 52px。タグが 2 つ以上あって折り返す行だけ PC 77px／スマホ 68px。
- **体調の顔**：一覧のカードからは外した。詳細のヘッダーの日付の並びに、顔（16px）と体調の名前を残した。
- **種類の読み上げ**：種類の文字タグを出さないカード（選手側など）では、アイコンの枠に `role="img"` と「◯◯ノート」のラベルを付けた。
- **アイコンの線の太さ**：ノートの種類は PDF どおり 1.8／32。ナビ（戦術ボード・練習メニュー）は周りのアイコン（2／24）とそろえて 2.67／32。コーンは PDF の形のまま、枠の中央へ 3 だけ右に寄せた。
- **置き換えの範囲**：`IconClipboard` を使っていた 5 か所はすべて戦術ボードの入口だったので、全部 `IconPitch` に替えた（レール・ホームのタイル・コーチングの入口と最近の保存）。`IconCone` は中身を差し替えたので、練習メニューの全部の入口が替わる。`IconClipboard` の関数は残してある（未使用）。
- **色**：`--note-match: #365d91`／`--note-practice: #267b6e`／`--note-solo: #91702f`（PDF の色。`:root`）。
- **今日の同じ種類の予定が複数あるとき**：予定に紐づけずに書いたノートは、その日の同じ種別の予定すべてに数えられる（以前からの作り。今回は変えていない）。

**検証**：`~/.claude/alfa-verify-tools/p17_verify.js`（24 項目）。PDF からのアイコンの取り出しは PyMuPDF（`page.get_drawings()`。倍率 2.1875＝線幅 3.9375÷1.8）で行い、結果は `~/.claude/alfa-verify-tools/p17/icons.json`。
