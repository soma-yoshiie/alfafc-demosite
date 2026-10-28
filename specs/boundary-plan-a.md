# 境目の作り直し 案 A（PC の設定・スマホの名簿・スマホのカレンダー）

2026-10-29。ユーザーの指摘「PC 版の設定と、スマホ版の名簿とカレンダーが境目がないように見えて見づらい」に対し、案を PDF（「 分析/ALFA_FOOTBALL_境目と色分けのUI案_2026-10-29.pdf」。生成元 `~/.claude/alfa-verify-tools/bres-report/`、モック `bres-report/mocks/`）にまとめ、ユーザーが **3 画面とも案 A** を選んだ。この文書が実装の正本。

## 0. 共通の方針

- 原因は「面が無い」こと。ページ背景（`--surface` #eef1f5）の上に文字や行が直に置かれ、面（白いカード）・線（1px の罫線）・余白のうち面と線が無い。
- 直し方は **白いカードで面を作る**。カードは `background: var(--surface-lowest)`、`border: 1px solid var(--outline)`、`border-radius: 12px`。線はカードの中の区切りにだけ使う（`--outline`）。カードの外には線を引かない。
- 文言・並び・操作は変えない。変えるのは地・線・余白と、そのために必要な最小限の DOM の包み（div の追加・class の追加）だけ。
- CSS の契約（`specs/ux-fix-2026-10.md` §0・「R3 実装時の判断」）：`app/globals.css` 1 枚。基底は 4 本目の `@media` より前、PC だけの調整は 5 本目の `@media`（mobile-redesign PC reset）の**閉じ括弧の内側の末尾**、スマホだけは `.xxxapp:has(.mhead)`、指の PC は `(pointer: coarse) and (min-width: 1024px)`。`@media` は 9 本のまま。1 本目の PC ブロックは編集しない。色はトークン。文字 12px 以上。スマホのタップ 44px、PC 32〜36px。
- 検証：新規 `~/.claude/alfa-verify-tools/p31_verify.js`。既存の p14〜p21・p23〜p30 は意図した差分だけ期待値を更新する。全画面の撮影の差分（`p14_baseline.js` → `compare.py`）で、3 画面以外が変わっていないことを確かめる。

## 1. PC の設定（スタッフ・選手・保護者）— 案 A「2 枚の面」

対象：`components/SettingsScreen.tsx` の PC 分岐（`.st-pc` ＞ `.st-nav` ＋ `.st-main`）。CSS は PC reset の `.st-pc`／`.st-nav`／`.st-navh`／`.st-navitem`／`.st-main`（約 25676 行〜）。

- `.st-pc`：`grid-template-columns: 220px minmax(0, 760px)`、`gap: 16px`、`padding: 16px 24px 24px`。
- **左の一覧 `.st-nav` を白いパネルに**：カードの値（白・1px `--outline`・角丸 12px）、`padding: 8px`、`align-self: start`。
  - 項目 `.st-navitem`：高さ 36px、`padding: 0 12px`、角丸 `--r-md`、14px。選択中 `.on` は `--accent-tint` の地＋`--accent`・700（今のまま）。hover は `--surface-low`。
  - 区画の見出し `.st-navh`：12px・700・**`--ink`**（灰→黒）、`padding: 14px 12px 6px`、字間 0。2 つ目以降の見出しは上に 1px `--outline` の線（今の `border-top` のまま）＋ `margin-top: 8px`。最初の見出し（`.first`）は線なし。
  - ログアウトの区画（`.st-navgroup:last-child`）は上に 1px の線（今のまま）。
- **右の内容 `.st-main` を白いパネルに**：カードの値、`padding: 0`、`overflow: hidden`。
  - 一番上に **題名の行 `.st-maint`**（新設）：高さ 56px、`padding: 0 20px`、下に 1px `--outline`、題名 17px・700（今開いている項目の名前。`VIEW_TITLE`／カテゴリ名を使う。アカウント一覧のときは「アカウント」、下層のフォームはその項目名）。下層で「‹ 戻る」を出す場合（`.st-back`）は題名の行の左に置き、題名はその右（`.st-back` の `margin` は 0）。
  - 内容は `.st-mainb`（新設）の中に `padding: 20px`。
  - **面を二重にしない**：パネルの中の最上位のカード（アカウントのカード、`.st-form`／`.st-top` のカード、管理シートの外枠など、`.st-main` 直下に出る 1 枚目の枠つきの箱）は枠と角丸を外し、白い面の中の行として見せる。中の 2 枚目以降（行の区切り・表）はそのまま。
- 選手・保護者の PC 設定（`directViewOf` で account を直接表示）も同じパネル。
- PC だけの変更。スマホの設定（グループ化リスト）は変えない。

## 2. スマホの名簿 — 案 A「学年ごとの白いカード」

対象：`components/TeamHub.tsx` の名簿タブ（スマホ。`.roslist` の中で学年ごとに `.sech`（「中1（23）」）＋ `.prow.rosmrow` の行を並べている所。約 2853 行〜と 2912 行〜の 2 か所）。CSS は基底の `.prow`（1764 行）と `.teamapp:has(.mhead) .prow.rosmrow`（1815 行）。

- 学年ごとのまとまりを `div.rosgrp` で包み、見出し `.sech` はそのまま（12px・700・`--mut`、`margin: 20px 4px 8px`）、行の集まりを **`div.roscard`**（新設）で包む。
- `.teamapp:has(.mhead) .roscard`：カードの値（白・1px `--outline`・角丸 12px）、`overflow: hidden`、`padding: 0`。
- `.teamapp:has(.mhead) .roscard .prow.rosmrow`：高さ 56px のまま、`padding: 0 16px`、`border-radius: 0`、`position: relative`。押したときの地は `--surface-low`。
- 行の間の線：`.teamapp:has(.mhead) .roscard .prow.rosmrow + .prow.rosmrow::before { content: ""; position: absolute; left: 72px; right: 0; top: 0; height: 1px; background: var(--outline); }`（iOS のグループ化リスト。左 72px＝余白 16 ＋ 札 40 ＋ 間 16）。
- 絞り込みボタン・検索欄・「すべて」の 1 行（`.rossel`）は今のまま。`.rossel` の上の余白は 6px、カード群との間は見出しの `margin-top` 20px で空ける。
- 絞り込み中（学年やグループで絞ったとき）も同じ形（出る学年だけカードになる）。選手・保護者の名簿も同じ。
- PC の名簿（`.ptable`）は変えない。
- 全 106 画面の撮影で横はみ出し 0 を保つ。

## 3. スマホのカレンダー — 案 A「月の面」

対象：`components/TeamHub.tsx` のカレンダー（スマホ。`.calnav` → `.calfilterrow`（§12）→ 月表示 `.calgrid.calhead` ＋ `.calgrid` ＋ `.callegend`、リスト表示 `.agenda`）。CSS は基底 3300〜3420 行と `.teamapp:has(.mhead) .calgrid`／`.calcell`（3725 行〜）。

- 月表示の `.calgrid.calhead` と `.calgrid` を **`div.calcard`**（新設）で包む。`.teamapp:has(.mhead) .calcard`：カードの値（白・1px `--outline`・角丸 12px）、`overflow: hidden`。
  - 曜日の帯 `.teamapp:has(.mhead) .calhead`：`background: var(--surface-low)`、高さ 32px、下に 1px `--outline`（曜日の文字は今のまま。日は赤、土は `--ink`）。
  - マス `.teamapp:has(.mhead) .calcell`：`min-height: 100px` のまま、`border-right: 1px solid var(--outline)`、`border-bottom: 1px solid var(--outline)`、7 列目（`:nth-child(7n)`）は `border-right: 0`、最後の週（最後の 7 つ）は `border-bottom: 0`。`padding: 6px 4px`。
  - 月初・月末の空のマス `.calcell.empty`：`background: var(--surface-low)`（沈める）。
  - 今日 `.calcell.today`：`background: var(--accent-tint)`。日付の青い丸（26px・白文字）は今のまま。
  - 予定のチップ `.calev` は今のまま（§12 の色分けに従う）。
- 凡例 `.callegend` は月のカードの下に **別の白いカード**：`margin-top: 12px`、`padding: 12px 16px`、カードの値。中身（§12 の「色: グループ」・色の点と名前・「日付をタップで予定を追加」）は今のまま、折り返し可（`flex-wrap: wrap`、行間 8px）。
- リスト表示（`.agenda`）：日ごとの行 `.agrow` を白いカードに（カードの値、`padding: 10px 12px`、日と日の間 8px）。行の中身（日付の列・色の帯 `.agbar`・種類ピル・題名・グループピル・時刻）は今のまま。「この月の予定 N 件」「画像で保存」の行は今のまま。凡例のカードはリスト表示でも下に出す。
- `.calnav`（‹ 年月 ›・月表示｜リスト表示）と §12 の `.calfilterrow` は変えない。
- PC・タブレット（700px 以上の `.calcell` の箱）は変えない（別の作業）。

## 4. 受け入れ

1. PC の設定：`.st-nav` と `.st-main` の computed `background-color` が白、`border` が 1px `--outline`、角丸 12px。`.st-main` の先頭に 56px の題名の行があり、文字が今開いている項目名。パネルの中に枠つきのカードが二重に出ない（`.st-main` 直下の 1 枚目の箱の border が 0）。選手の PC でも同じ。
2. スマホの名簿：学年ごとに `.roscard`（白・1px・12px）があり、行の間に 1px の線（左 72px から）。行の高さ 56px、横はみ出し 0。絞り込み中も同じ。
3. スマホのカレンダー：`.calcard`（白・1px・12px）の中に曜日の帯（`--surface-low`）とマス（右と下に 1px の線）、空のマスは `--surface-low`、今日は `--accent-tint`。凡例は別の白いカード。リスト表示の日の行が白いカード。横はみ出し 0。
4. 既存の検証（p14〜p21・p23〜p30）が通る（意図した差分は更新）。全画面の撮影で、3 画面と設定・名簿・カレンダー以外に差分が無い。

## 5. 実装時の判断（2026-10-29）

Sonnet が §1〜§3 を 1 単位で実装し、Opus 3 観点（spec／CSS の契約／動き）でレビュー、残った 5 件（重複を除き 4 件）を統括が直した。検証 `p31_verify.js`（89 項目：PC スタッフ・PC 選手の設定、スマホ名簿の絞り込み前後、スマホのカレンダー 月／リスト（スタッフ・選手）、タブレット 768px。横はみ出し 0）。

- **PC の設定**：CSS は PC reset 末尾（閉じ括弧の内側）に後勝ちで追記し、既存の `.st-pc`／`.st-nav`／`.st-navitem` は書き換えていない。題名の行 `.st-maint`（56px・17px・700。`.screenbody h2` の表示用フォントと字間を打ち消す）と本文 `.st-mainb`（padding 20px）。題名は一覧ならカテゴリ名（`NAV`／`PLAYER_NAV` の label）、下層なら `VIEW_TITLE`、選手のアカウント直接表示は「アカウント」。面を二重にしない処理は `.st-mainb > .st-top/.st-form > .st-group:nth-child(1 of .st-group) > .st-card` と `.st-manage`（レビューで「データ」の `.st-form` は先頭が `p.st-lead` なので `:first-child` では効かなかった）。`.st-card` は `margin: 0 -20px` で区切り線を端まで通し、行の左右 padding を 20px に。ログアウトの区画は上に 1px の線（`.st-nav .st-navgroup:last-child`）。「‹ 戻る」は題名の行の左、margin 0。p19（184→220px、32→36px）・p20（見出し 灰→`--ink`、項目と見出しの左ぞろえ）の期待値を更新。
- **スマホの名簿**：`.sech`＋`.prow.rosmrow` の並びは TeamHub の 1 か所だけ（もう 1 か所は PC の `.ptable`）。`div.rosgrp > .sech + div.roscard`。選手・保護者のスマホには名簿タブが無いので、選手では出ない。`.rossel` は触っていない（見出しの margin-top 20px で間を空ける）。
- **スマホのカレンダー**：`div.calcard` の中に `.calgrid.calhead`（`--surface-low`・32px・下線）と `.calgrid`（マスは右と下に 1px、7 列目は右なし、最後の週は下なし）。マスの padding は spec の 6px 4px ではなく **6px 1px**（390px でマス幅が 50〜52px しかなく、左右 4px だと 2 行折り返しの予定名が 1〜2 字に潰れるため）。空のマスは `--surface-low`、今日は `--accent-tint`。凡例は別の白いカード（スマホのリスト表示でも下に出す。PC には出さない）。**リスト表示は外側のカードを作らない**（レビューで `.agrow` をカードにすると中の `.agdate`／`.agbar` と枠が二重になり、26px 狭くなって「全体練習」が「全体練…」に切れた。モック list.png どおり、日付の箱と帯をそれぞれ白い面・1px `--outline` にし、日と日の間 8px は `.agenda` の gap のまま）。リスト表示では「日付をタップで予定を追加」の案内を出さない（日付が押せないため。月表示だけ）。タブレット（700〜1023px で `.mhead` が出る幅）は 3 本目の `@media (min-width: 700px)` で元の箱型に戻し、変えていない。
- **回帰**：全画面の撮影の差分は 設定・名簿・カレンダー（スマホ）と §12 の差分、ほかは日付の違いだけ。PC の名簿・PC の月は変えていない。
- **直さなかった指摘**：リスト表示にも凡例が出る件（spec どおり）。

