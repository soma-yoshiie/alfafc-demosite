# ALFA FOOTBALL（soccer-tactics-app）開発ガイド

このファイルは、このリポジトリで作業する人（と、その人が使う Claude Code）向けの決まりごとです。Claude Code はプロジェクト直下の `CLAUDE.md` を自動で読みます。人が読んでも分かるように書いてあります。

- 公開リポジトリ：`soma-yoshiie/alfafc-demosite`（**PUBLIC**。秘密情報・個人情報を絶対にコミットしない）
- 公開サイト：GitHub Pages が `main` の `docs/` を配信（`docs/` はビルドの成果物。手で触らない）
- 正本（仕様）は `specs/`。迷ったら「新しい仕様（§6 の表で上にあるもの）› この CLAUDE.md › コード › 古い仕様 › README」の順に信じる。README と古い仕様には今の画面と違う記述が残っている（README の「ホームメニュー（アイコングリッド）」「お役立ち記事」「🏠 メニューに戻る」は今は無く、ログイン後は `components/ConsoleShell.tsx` の下部タブ／PC は左レール。`mobile-redesign.md` §8 #23 の「選手 4 タブ」も古く、今は `PLAYER_MTAB` の 5 つ）

---

## 1. これは何のアプリか

少年・中学のサッカーチーム向けの「戦術ボード ＋ チーム運営」の Web アプリ。Next.js 15（App Router）＋ React 19 ＋ TypeScript、スタイルは素の CSS（`app/globals.css` 1 本、約 2.8 万行）。サーバーは無く、**すべて localStorage に保存するローカルのデモ**。

- 2 つの役割：**スタッフ**（監督・コーチ。すべての機能）と **選手・保護者**（出欠・ノート・チャット・プロフィール）
- 2 つの画面幅：**スマホ**（<1024px。下部タブ 5 つ）と **PC**（≥1024px。左レール＋2 ペイン）。同じコンポーネントが幅で分岐する
- デモのチーム「アルファラスFC ジュニアユース」、デモの選手「佐藤 蒼空」（中 2・Aチーム・#10）、監督「岡本」。ログインは、スタッフ＝任意のメール＋パスワードで「契約（新規登録）」、選手＝`sora@alfafc.example`／`team2026`（共通パスワード。設定画面でスタッフが変えられ、未設定時の既定が `team2026`）。README の「起動フロー・アカウント」はこのログインの部分だけ参照する

---

## 2. 共同作業の決まり（ブランチ運用）

二人が同時に触っても壊れないように、**人ごとにブランチを分ける**。

| 誰 | ブランチ | やること |
|---|---|---|
| オーナー | `main` | 統合・公開（`docs/` の再生成と GitHub Pages の更新はオーナーだけ） |
| 共同作業者 | `feature/ui-partner` | ここで作業・コミット・push。区切りごとに **Pull Request** を `main` へ出す |

ブランチの用意：オーナーが `main` から切って origin に置いてある。共同作業者は `git fetch origin && git switch feature/ui-partner` で始め、`git branch --show-current` が `feature/ui-partner` を表示することを確かめる（もし `git branch -a` に `remotes/origin/feature/ui-partner` が無ければ `git switch -c feature/ui-partner origin/main && git push -u origin feature/ui-partner` で自分で作る。別の名前にしない）。

ルール：

1. **`main` に直接 push しない**（共同作業者）。作業は自分のブランチで、コミットごとに `git push origin feature/ui-partner`。
2. **force push をしない**（全員）。履歴を書き換えない。`git rebase` も使わない（merge で取り込む）。
3. **PR を出す前に `main` を取り込む**：`git fetch origin && git merge origin/main`。衝突は自分の側で解消し、`npx tsc --noEmit` が通ることを確かめてから push して PR。作業を始める日の最初にも同じことをする。
4. **PR の取り込みはオーナーが「Create a merge commit」で行う**（Squash／Rebase にしない。`feature/ui-partner` を使い続けるので、履歴が分かれると同じ変更が毎回衝突する）。取り込まれたら共同作業者は `git fetch origin && git merge origin/main` で自分のブランチを `main` に追いつかせ、同じブランチで作業を続ける。
5. **`docs/` を触らない。`npm run export` / `npm run build` を自分のブランチで走らせて成果物をコミットしない**（`docs/` は公開用のビルド成果物で、ビルドのたびに `_next/static/<ビルドID>/` のようなハッシュ付きの名前が入れ替わる。二人がそれぞれ再生成すると必ず衝突する。手順 3 の merge で `main` 側の `docs/` の変更が入ってくるのは問題ない）。PR を出す前に `git diff --stat origin/main...HEAD -- docs` を実行し、何も出ないことを確かめる。`out/` は git の管理外。
6. コミットメッセージは**日本語で「何を・なぜ」**（例：「名簿の絞り込みを複数選択に（スタッフの依頼：学年と A/B を同時に見たい）」）。
7. 1 つの PR は 1 つの目的（画面 1 つ・機能 1 つ）。大きい変更は先に `specs/<name>.md` に設計を書いてから実装する（既存の specs を見ると書き方が分かる）。
8. **着手の前に宣言する**：自分のブランチから **Draft PR** を開き（空のコミットでよい）、説明の 1 行目に「触る画面・ファイル」を書く（例：「チーム目次／`components/TeamHub.tsx`・`globals.css` の『チーム目次』区画」）。オーナーも `main` で触る前に同じ画面・ファイルを触っていないか、開いている Draft PR を見る。重なるときは先に宣言した方が取り込まれるまで待つか、相談して分け方を決める。
9. 同じファイルを二人で同時に触りやすいのは `app/globals.css`・`components/ConsoleShell.tsx`・`components/TeamHub.tsx`・`lib/sampleTeam.ts`。これらを触るときは**自分の追加を 1 か所にまとめ、見出しコメントを付ける**（§5 の CSS の約束を参照）。小さく頻繁に PR を出すほど衝突しない。

---

## 3. 開発環境

最初に一度だけ：オーナーから GitHub の collaborator（Write 権限）の招待が届くので承諾する（公開リポジトリだが push できるのは招待された人だけ）。Node.js は 20.9 以上（`node -v` で確認。画像処理の sharp が 20.9 以上を求める。オーナーの手元は v24）。

```bash
git clone git@github.com:soma-yoshiie/alfafc-demosite.git   # SSH 鍵が無ければ https://github.com/soma-yoshiie/alfafc-demosite.git
cd alfafc-demosite
git fetch origin && git switch feature/ui-partner             # 自分の作業ブランチ（§2）
npm ci
npm run dev        # http://localhost:3000（スマホ幅 390×844 と PC 幅 1440 の両方で確認）
npx tsc --noEmit   # コミット前に必ず通す
```

- **dev サーバーが動いている間に `npm run build` / `npm run export` を実行しない**（同じ `.next/` を使うので dev が 500 になる）。ビルドが必要なら dev を止める → ビルド → `rm -rf .next` → dev を起動し直す。
- `npm run export` は `next build` ＋ `scripts/relativize-export.cjs`（GitHub Pages 用に相対パス化）。オーナーだけが `main` で実行する。
- Claude Code のデスクトップアプリなら dev サーバーは `.claude/launch.json` の `soccer-tactics` を `preview_start` で起動する。CLI なら自分の別のターミナルで `npm run dev` を起動しておく。どちらも Claude の Bash で `npm run dev` を走らせっぱなしにさせない。ビルドの前に dev を止めるのも人が行う。
- データは localStorage。おかしくなったら、本人に確認したうえで設定の「データ」の区画（`components/settings/DataSection.tsx`、`resetAppData()`）から初期化するか、本人が DevTools で `soccer_tactics_*` と `alfa-*` の鍵を消す。Claude Code は自分の判断で初期化や鍵の削除（`localStorage.clear()` など）をしない。

---

## 4. コードの地図

| 場所 | 中身 |
|---|---|
| `app/page.tsx` → `components/AppRoot.tsx` → `AppFlow.tsx` | 起動（スプラッシュ `SplashScreen.tsx`・`BrandMark.tsx`）→ ログイン `LoginScreen.tsx` → 本体 `ConsoleShell.tsx` |
| `components/ConsoleShell.tsx` | 画面の切り替え・下部タブ（`STAFF_MTAB` / `PLAYER_MTAB`）・PC の左レール。同じタブの再タップは `alfa-tabreselect` イベント |
| `components/BoardProvider.tsx` | 戦術ボードの状態（`useReducer`）。`ScreenName` の型もここ |
| `components/TeamProvider.tsx` | チーム（名簿・予定・出欠・試合記録・グループ・チャット・お知らせ）。`lib/sampleTeam.ts` がデモデータ |
| `components/ProfileProvider.tsx` | 選手の個人ページ（成長・体力・成績・進路・怪我・レポート） |
| `components/DrillProvider.tsx` | 練習メニュー（ドリル図） |
| `components/TeamHub.tsx`・`team/` | 「チーム」タブ（スマホはタイルの目次、PC は 2 ペイン）。カレンダー・試合記録 `MatchHub.tsx`・名簿・チャット `ChatHome.tsx` / `ChatThread.tsx`。管理シートの部品は `team/manage` |
| `components/PlayerHub.tsx`・`hub/` | 選手の個人ページ（基本・成長・体力・テスト・成績表・進路・怪我・活動・レポートの区画。各区画は `hub/*Section.tsx`）。共通部品は `hub/common.tsx`（`HubEditBtn` / `HubMenu`） |
| `components/CoachingHub.tsx`・`OtherHub.tsx` | 「コーチング」「その他」タブの最初の画面（スマホだけ。PC は左レールで、`CoachingHub` は PC 幅ではホームへ戻す）。コーチングは「作る」の正方形 3 つ＋最近の保存＋ライブラリ（`coaching-hub-s1.md`）。CSS は `.chubapp` / `.chub-*` |
| `components/NotebookScreen.tsx`・`NotebookTools.tsx` | サッカーノート（選手が書く／スタッフがコメント） |
| `components/MobileHome.tsx`・`HomePanels.tsx`・`homeData.tsx` | ホーム（スタッフ＝お知らせ→学年別タイムライン、選手＝目標＋お知らせ。集計は `useMatchdayData`） |
| `components/SettingsScreen.tsx`・`settings/` | 設定（グループ化リスト＋下層。管理シートは `team/manage`） |
| `components/CoachLab/`・`lib/coachlab.ts` | コーチラボ（指導者の記事。内部キーは `articles`） |
| `components/matchup/`・`lib/matchup.ts` | 練習試合のマッチング（デモ） |
| `components/MobileHeader.tsx`・`MobileSegments.tsx`・`MobileRows.tsx`・`FilterRow.tsx`・`team/Sheet.tsx`・`SheetManager.tsx` | スマホ共通部品（52px ヘッダー・上部セグメント・行・絞り込み・下から出るシート。画面の中で開くシートは `team/Sheet.tsx` の `Sheet`、戦術ボードの状態 `board.sheet` から開くものは `SheetManager`） |
| `components/icons.tsx` | 線画アイコン 1 セット（24px）。**絵文字は使わない** |
| `lib/storage.ts` | 保存キー（`soccer_tactics_*_v1`。絞り込みだけ `soccer_tactics_calfilter_v2`）、初期化 `resetAppData()`（`soccer_tactics_` と `alfa-` で始まる鍵を消す。ログインの `alfa_coach_account_v1`・`alfa_session_v1` は `lib/auth.ts` にあり、消さない）、移行。鍵の名前・形は変えない |
| `lib/` その他 | 集計（`attendanceStats.ts`・`homeStats.ts`・`badges.ts`）、日付（`dates.ts`・`calendarUtils.ts`）、書き出し（`export*.ts`） |
| `specs/` | 仕様書（設計・受け入れ基準・実装時の判断）。**新しい機能はまずここに書く** |
| `docs/`・`out/` | ビルド成果物。触らない |

---

## 5. UI の決まり（これを破ると「AI で作った感」が出る）

正本は `specs/mobile-redesign.md` §8 の 27 項目。よく効くものを抜粋：

### 色・形
- 有彩色は **青 `--accent` 1 色**。緑は「出席・勝ち・記入済み」など**状態の表示だけ**、赤は破壊操作とエラーだけ。紫・藍（色相 250〜280）・オレンジ・ライムを新しく使わない。
- 背景は 3 段だけ：ページ `--surface`（#eef1f5）／面 `--surface-lowest`（白）／境界 `--outline`（#e3e6ea 1px）。グラデーション・ぼかし・色付きの影は禁止。カードは**影なし＋1px の線**、角丸は 10px（`--r-lg`）か 8px（`--r-md`）のどちらかに画面内で統一。ピルとアバターだけ 999px。
- 文字サイズは **12／14／15／17／20 の 5 段**。12px 未満は使わない（下部タブのラベルも 12）。太さは 400 と 700 だけ。数字は `tabular-nums`。
- 余白は 左右 16／カード内 16／カード間 12／区画間 24。タップ対象は **44px 以上**。横はみ出しは 0。

### 部品は増やさず、ある物を使う
- 主ボタン＝`.st-btn`（青）、入力欄＝`.st-input`、切り替え＝`.mseg-item`、区切り見出し＝12px・700・`--mut`、絞り込み＝`components/FilterRow.tsx`、編集＝鉛筆の四角と「…」（`HubEditBtn` / `HubMenu`）、下から出るシート＝`team/Sheet.tsx`（`board.sheet` 経由のものだけ `SheetManager`）。
- 数字のタイルは白地・ラベル 12px 灰・数字は既存の `.stat .v`（22px。上の 5 段の例外は数字タイルだけ）、1 画面 3 つまで（§8-16）。左の色帯は学年・グループの色だけに使う（未読は青い点）。
- 空の状態は「何が無いか＋次の一手」を 1〜2 文（左揃え）＋ボタン 1 つ。破線の箱＋中央アイコンの空の状態を作らない（§8-20）。
- 追加の操作（ヘッダー右の「＋」、ノートの浮きボタン「＋」など）は今の置き場のまま変えない（`hub-tiles.md`・`ux-fix-2026-10.md` の保留 t9）。
- 文言：CTA は操作名（「予定を追加」）。「はじめる」「もっと見る」「✨」「—」を使わない。「コーチ」ではなく「スタッフ」、「お役立ち記事」ではなく「コーチラボ」。
- **まだ決まりではないもの**（§9 の未実装の提案。着手前にオーナーに確認する）：追加の操作を「ヘッダー右の青い＋／区画内の全幅の点線行」の 2 型にそろえる、浮きボタンを「ノートを書く」だけにする、未入力を「—」や「0 試合」で並べず「未登録 N 項目 ＋追加」の 1 行に畳む。

### CSS の約束（`app/globals.css`）
- `@media` は **9 本のまま増やさない**（`grep -c "^@media" app/globals.css` で確認）。
- スマホ用の新しい規則は**基底**（メディアクエリの外）に書く。PC の 2 本の `@media (min-width: 1024px)` ブロック（`grep -n "@media (min-width: 1024px)" app/globals.css` で出る 2 か所）と `@media (min-width: 1600px)` は**触らない**。例外は次の 2 つだけ。
  1. 2 本目の PC ブロック末尾の `/* === mobile-redesign PC reset === */` 区画（`grep -n "mobile-redesign PC reset ===" app/globals.css` で探す）。ここには「基底で足したスマホ用の規則を PC で打ち消す」リセットだけを置く。**書く位置はその `@media` の閉じ括弧の内側**（`@keyframes wdialogin` の直前に直接書くとトップレベルになりスマホにも効く）。
  2. ファイル末尾の `@media (pointer: coarse) and (min-width: 1024px)`。PC で 32px に詰めた操作部品を、指で使う PC（タブレット）だけ 44px に戻す区画。タップ寸法に関する規則だけを足す。
- スマホだけに効かせたい規則は `.teamapp:has(.mhead)` のように「スマホ分岐でしか描画されない要素」を条件にすると PC reset が要らない。
- 自分の追加は 1 か所にまとめ、`/* ===== <仕様名> §n: 何の規則か ===== */` の見出しコメントを付ける（既存の書き方に合わせる）。
- 単一画面のためだけの新しいトークン（`--xxx`）を増やさない。

### 変えないもの
- PC（≥1024px）の DOM・CSS・挙動（スマホの作業で PC が変わっていないことを撮影で確かめる）。PC の見た目や挙動を変えること自体が目的の作業だけは例外。その場合は先にオーナーに確認し、`specs/<name>.md` に「PC の変更」の節（どの画面の・どの規則を・なぜ）を書いてから、PC ブロックの該当規則だけを直す。PC reset 区画には書かず、新しい `@media` も足さない。PR には PC の変更前後のスクリーンショットを付ける。
- 保存キー・集計・状態の内部ロジック（見た目の作業で `lib/` の計算を変えない）。
- ピッチの緑、トークンの色、チャートの色。
- 下部タブ（スタッフ：ホーム／コーチング／ノート／チーム／その他、選手：ホーム／ノート／チーム／プロフィール／その他）、青いクローム、白いカード、ホームの構成、作業画面（戦術ボード・練習メニュー・ノートの記入）の密度。
- デモデータの整合（日付・勝点・出席率が画面で食い違わないこと。数字は 1 か所から計算する）。

---

## 6. 仕様書（`specs/`）の歩き方

新しい順に、よく参照するもの：

| 仕様 | 何が決まっているか |
|---|---|
| `coaching-hub-s1.md` | コーチングの最初の画面（スマホ）＝「作る」の正方形 3 つ＋最近の保存 6 件＋ライブラリの行（種類ごとの件数）。分析 PDF「スマホ版の骨組みと雰囲気の UI 案」の骨組み S1。PC は変えない。`mobile-redesign.md` #14 の例外 2 と、実装時の判断は §3・§6 |
| `ui-fix-2026-11-06.md` | UI 修正 5 件：チャットの自分の吹き出しは輪郭だけ、予定を追加（スマホ）は縦スクロールだけ、種類の選択肢に色の点、個人ページのヘッダーは 1 種類（4 マス廃止）、スマホの戦術ボードの道具列は 3 つ＋ヘッダー「…」。直さなかった指摘は §9 |
| `drill-tap-targets.md` | 練習メニュー（スマホ）の押し場所を、見た目を変えずに透明の当たりで 44px へ。届かなかったものと理由は §3 |
| `splash-brand.md` | 起動画面のロゴ（`BrandMark.tsx`、描く順番）。ログイン・PC レールの旧ロゴは未置換 |
| `hub-tiles.md` | スマホ「チーム」＝タイルの目次、個人ページ＝チップ 2 段、選手のノート＝目次＋ベル、同じタブの再タップ |
| `home-chat-groups-roster.md` | お知らせ＝グループのメッセージの印、ホームの並び、名簿の複数選択 |
| `boundary-plan-a.md`・`calendar-plan-a.md` | 境目（カード・パネル）の決まり、カレンダーの絞り込みと色分け |
| `ux-fix-2026-10.md` | UI 総点検の修正 3 ラウンド（部品の統一・空の状態・名前）と実装時の判断 |
| `settings-plan-a.md`・`settings-inline-manage.md` | 設定（グループ化リスト、PC 左カテゴリ、料金プラン） |
| `matchup-demo.md` | 練習試合のマッチング（カードは名前・日付・場所・所属リーグ・対戦回数だけ） |
| `round3-notes-league.md`〜`round5-home.md` | 種類・ノート反映・順位表、提出カード・アイコン、ホームの作り直し |
| `match-records-round2.md`・`filter-compact-and-match-hub.md` | 試合記録（大会・期間・会場・カレンダー連携）、絞り込み列の寸法 |
| `player-hub.md`・`notebook-staff-redesign.md` | 個人ページ、スタッフのノート |
| `setpiece-redesign.md` | セットプレー（種別 3 つ・位置から配置・軌道・PA 拡大） |
| `chat-plan-a.md`・`groups-*.md` | チャットの一覧とスレッド（LINE 型）、お知らせの既読数はスタッフだけ（1 対 1 の「既読」は双方に出る）、グループ機能。※「お知らせ｜メッセージ」のタブは `home-chat-groups-roster.md` §2 で廃止済み（今のお知らせはグループのメッセージに付ける印）。食い違ったら `home-chat-groups-roster.md` を正とする |
| `coachlab.md` | コーチラボ（用語・手数料 15% 固定を変えない） |
| `mobile-redesign.md`（§8 チェックリスト）・`mobile-redesign-v2.md`・`mobile-home-v3.md` | スマホ版の基本設計 |

仕様の末尾にある「実装時の判断」「直さなかった指摘」は、同じ議論を繰り返さないための記録。変えたいときは仕様に追記してから直す。

---

## 7. 検証（コミット前・PR 前）

最低限：

1. `npx tsc --noEmit` が通る。
2. 触った画面を **390×844（スマホ）と 1440×1000（PC）** で開き、横はみ出し・文字の切れ・重なりが無い。PC は触っていないつもりでも必ず見る。
3. `grep -c "^@media" app/globals.css` が 9。
4. スタッフと選手の**両方**のアカウントで確認（片方にしか出ない画面が多い）。
5. 仕様 §8 の 27 項目のうち関係するものを「済／該当なし」で自己点検（PR の説明に書く）。

自動化するなら puppeteer で「全画面の撮影＋`document.documentElement.scrollWidth === window.innerWidth` の検査＋PC の変更前後の画像差分」の 3 点セット。スクリプトはリポジトリの外（各自の作業用フォルダ）に置き、リポジトリにコミットしない。

変更前後の見比べを手でやるなら：`git worktree add ../alfa-main origin/main` で `main` を別フォルダに置き、そこで `npm ci` してから `npx next dev -p 3001` で起動する。触った画面を 3001（変更前）と 3000（変更後）で、390×844 と 1440×1000 の両方で撮って見比べる。横はみ出しは DevTools のコンソールで `document.documentElement.scrollWidth === window.innerWidth` が true になることを確かめる。終わったら `git worktree remove ../alfa-main`。

PR の説明に書くこと：目的／触った画面（スマホ・PC のスクリーンショット）／仕様のどこに基づくか／自己点検の結果／直さなかったこと。

---

## 8. Claude Code で作業するときの型

- 大きい依頼は「`specs/` に設計 → 実装 → レビュー（別の目で） → 直す → コミット」。設計と実装を分けると手戻りが少ない。
- 実装のエージェントに **dev サーバーの起動・停止とビルドをさせない**。同じファイル（`globals.css`・`TeamHub.tsx`）を触る実装は並列にせず直列にする。
- レビューは「スクリーンショットを見て §8 の項目番号で指摘する」「コード差分で PC の不変・CSS の約束を確認する」の 2 本立て。指摘は反証してから直す（指摘の鵜呑みで壊すことがある）。
- 報告は日本語で「結論 → 何を変えたか → 検証 → 直さなかったこと」。

---

## 9. いまの状態（2026-11-07 時点）

- `main` は安定。GitHub Pages は `main` の `docs/`。
- スマホ版の骨組みは **S1（コーチングの性格づけ）で止める**（オーナー決定 2026-11-07。`specs/coaching-hub-s1.md`、実装済み）。雰囲気（色・書体）は今の青のまま、設定の「外観」は作らない。分析 PDF「スマホ版の骨組みと雰囲気の UI 案」（2026-11-07）の S2〜S6・V2〜V7 は案だけで未実装。練習メニューの PDF（2026-11-06）の「案 D コーチング目次のタイル化」は取り下げ（S1 に置き換え）。
- スマホ版 UI の分析（空きスペース・部品の揺れ・ブランドの不一致）の**提案 A〜G は未実装**。要点：チーム目次の下に「今週の予定／最新のお知らせ」、その他＋設定を 1 画面に、未入力を畳む、部品の統一、ログインを新ロゴに、選手ホームに「今日のノート」「了解がまだ」。広告や協賛の枠は仕様に無いので足さない（検討中）。着手するときはオーナーに順番を確認する（§2 の Draft PR で宣言する）。
- 保留中：起動直後の「今日の予定」画面（ブランチ `feature/today-gate`、タグ `shelf/today-gate-v1`）。勝手に取り込まない。
- 既知の不具合：デモデータの日付・勝点の食い違い（11 月に「夏合宿」など）。
- 練習メニュー（スマホ）の押し場所は 44px に広げたが、見た目の密度を変えないと届かないものが残る（`specs/drill-tap-targets.md` §3。パレットの行の間を 7px→8px にするかはオーナーの判断待ち）。

---

## 10. やってはいけないこと（まとめ）

- `main` への直接 push、force push、`docs/`・`out/` の変更、`.env` や鍵・個人情報のコミット。
- PC の `@media (min-width: 1024px)` ブロックの編集、`@media` の追加、新しい有彩色・グラデーション・絵文字・16px 超の角丸。
- 保存キーの変更・削除、集計ロジックの変更（見た目の作業で）。
- 仕様に無い機能を勝手に足す／仕様で「保留」「直さない」とされたことを独断で直す。
- dev サーバーが動いている最中のビルド。
