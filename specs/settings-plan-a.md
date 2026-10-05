# 設定画面の作り直し（案 A）と料金プランの変更

2026-10-05。正本はこのファイル。調査 PDF（` 分析/ALFA_FOOTBALL_設定画面UI調査_2026-10-05.pdf`）の「案 A」を実装する。

## 0. 依頼（ユーザーの言葉）

- 「案Aで実装して欲しいけどスマホ版の選択肢の隣のアイコンのようなものはいらない」
- 「料金プランは通常選手一人当たり500円、動画保存無制限プラン一人当たり700円にして」

統括の読み：PDF の案 A（グループ化リスト・下層画面・アカウント・散らばった設定を行に・プランは 1 行・PC は左カテゴリ・選手にも設定）をそのまま。ただし行の左のアイコン（線画の「名」「区」「組」…）は置かない（PC も置かない）。プランは 3 段階（スターター／スタンダード／プロ）をやめ、選手 1 人あたりの月額が違う 2 つにする。

## §1 料金プラン（lib/types.ts・BoardProvider・表示箇所）

```ts
export type PlanTier = "standard" | "video";
export interface PlanInfo {
  name: string;        // 「通常」「動画保存無制限」
  perPlayer: number;   // 選手 1 人あたりの月額（円・税別）
  video: string;       // 動画の保存の説明
  lead: string;        // 1 行の説明
}
export const PLAN_ORDER: PlanTier[] = ["standard", "video"];
export const PLAN_INFO: Record<PlanTier, PlanInfo> = {
  standard: { name: "通常", perPlayer: 500, video: "動画の保存：上限あり", lead: "出欠・サッカーノート・チャット・戦術配信など、すべての機能が使えます。" },
  video: { name: "動画保存無制限", perPlayer: 700, video: "動画の保存：無制限", lead: "通常プランの全機能に加えて、動画を本数・期間の上限なく保存できます。" },
};
```

- `migratePlan`：`starter`／`standard`／`free`／`coach` → `standard`、`pro`／`team`／`video` → `video`。不明は `standard`。既定（保存が無いとき）は `standard`。
- 月額の計算：`選手数 × perPlayer`。選手数は名簿の人数（`board.state.players.length`）。表示は「選手 70 人 × 500 円 ＝ 35,000 円／月（税別）」。年払い・トライアルの帯・「人気」バッジ・「校費に対応」などの注記は**全部やめる**。
- 通常プランの「上限あり」の本数・期間は未定なので、画面では「上限あり」とだけ書く（数字を作らない）。
- プラン名を出している場所（PC レール `ConsoleShell.tsx:279`、スマホのホームのヘッダー `MobileHome.tsx:62`）は `PLAN_INFO[plan].name + "プラン"` のままでよい（「通常プラン」「動画保存無制限プラン」になる）。旧 MoreSheet（SheetManager.tsx:1392-1449）は呼び出し元が無い死にコード。`PLAN_INFO` の形が変わってコンパイルが通らなくなる箇所は、MoreSheet ごと削除してよい（`sheet.type === "more"` も同様に外す）。

## §2 設定の構造（スタッフ）

新しい `components/SettingsScreen.tsx`（`ConsoleScreens.tsx` の `SettingsScreen` と `SheetManager.tsx` の `SettingsBody`／`SettingsSheet` は削除し、`AppRoot` は新ファイルから import。`openSheet({type:"settings"})` の型も外す）。中の部品は `components/settings/` に分ける（目安：`SettingsTop.tsx`／`SettingsRows.tsx`（行の部品）／`AccountForm.tsx`／`TeamBasicsForm.tsx`／`StageList.tsx`／`InviteForm.tsx`／`StaffList.tsx`／`NotifPrefsForm.tsx`／`PlanScreen.tsx`／`DataSection.tsx`）。

### 2-1 画面の状態

```ts
type SettingsView =
  | { mode: "top" }                 // スマホ：一覧。PC：左のカテゴリで選んだ区画の行
  | { mode: "account" } | { mode: "teamBasics" } | { mode: "stage" } | { mode: "invite" }
  | { mode: "staff" } | { mode: "notif" } | { mode: "plan" } | { mode: "data" };
```

- スマホ：`top` は `MobileHeader title="設定" onBack=…`（今の navFrom の戻り先のまま）＋グループ化リスト。下層は `MobileHeader title={区画名} onBack={→top}` ＋フォーム。保存のある画面は右上に `MobileHeaderAction primary`「保存」。
- PC：今の白いヘッダー（「設定」＋チーム名のピル）はそのまま。本文は左に**カテゴリの列**（§4）、右に内容。右の内容は「選んだカテゴリの行の一覧」で、行を押すと同じ右ペインが下層（フォーム）に替わり、左上に小さな戻り「‹ {カテゴリ名}」が付く。カテゴリを押すと `top` に戻る。
- 変更が未保存のまま戻るときは `window.confirm("変更を保存せずに戻りますか？")`（p15 の未保存の確認と同じ作法）。トグルと学校区分の選択はその場で反映し、確認は出さない（学校区分だけは今までどおり `setSchoolStage` 側の確認が出る）。

### 2-2 行の部品（`SettingsRows.tsx`）

アイコンは置かない（依頼）。

- `<SettingsGroup title?>` … 見出し（12px・`--mut`・左 4px）＋白いカード（`--surface-lowest`・1px `--outline`・`--r-lg`）。カードの下に `hint?`（12px・`--mut`）を置ける。
- `<SettingsRow label value? desc? onClick? danger?>` … `button.st-row`。左に `label`（14px・`--ink`。`desc` があれば下に 12px・`--mut`）、右に `value`（13px・`--mut`・1 行省略・最大 45%）と `›`（`--mut`）。`danger` は中央寄せ・`--danger`・700（ログアウト・デモデータ）。`onClick` が無い行は押せない見た目（`div.st-row.static`、`›` なし）。
- `<SettingsToggleRow label desc? checked onChange>` … 左に label、右にスイッチ（既存の `.pubtoggle` の作りを流用してよいが、ON の色は**青（`--accent`）**。スマホ・PC とも）。
- `<SettingsAccountCard name sub email onClick>` … 丸い頭文字（40px・`--accent-tint`／`--accent`）＋名前（15px・700）＋役割（12px・`--mut`）＋メール（12px・`--mut`）＋`›`。
- 行の高さ：スマホ 48px 以上（タップ 44px）、PC 40px（PC reset）。カードの中の行は 1px の線で区切る（最後の行は線なし）。

### 2-3 一覧（`top`）の区画と行（スタッフ）

| 区画 | 行 | 右の値 | 押すと |
|---|---|---|---|
| （見出しなし） | アカウントのカード | 名前／「監督・管理者」／メール | `account` |
| チーム | チーム名とエンブレム | チーム名 | `teamBasics` |
| | 学校区分 | 小学生／中学生／高校生 | `stage` |
| | 学年・グループ | 学年グループと自作グループの名前を「・」でつなぐ（例「中1・中2・中3・Aチーム・Bチーム・GK」。長ければ省略記号） | チーム運営のグループ管理シート（§6） |
| | 予定の種類 | 「練習・試合 ほか N」（N＝それ以外の種類の数。0 なら「練習・試合」） | 種類の管理シート（§6） |
| | 大会 | 登録数「N 件」（0 なら「未登録」） | 大会の登録・管理シート（§6） |
| | 順位表 | 順位表の名称（無ければ「未登録」） | 順位表の編集シート（§6） |
| | 体力テストの種目 | 「N 種目」 | 種目を管理シート（§6） |
| メンバー | スタッフ | 「N 人」 | `staff` |
| | 選手・保護者の招待 | 共通パスワードが設定済みなら「共通パスワード 設定済み」、空なら「共通パスワード 既定のまま」 | `invite` |
| | 試合記録を選手・保護者に公開 | （トグル。その場で反映・トーストは今のまま） | — |
| 通知 | 通知 | オンの数「3 件ともオン」「2 件オン」「すべてオフ」 | `notif` |
| プラン | プラン | 「通常・選手 70 人」 | `plan` |
| データ | データの書き出し | — | `data`（書き出しとデモデータの入れ直しの画面） |
| | バージョン | 「0.1.0」（`lib/version.ts` の `APP_VERSION`。押せない行） | — |
| （末尾） | ログアウト（danger） | — | `window.dispatchEvent(new Event("alfa-logout"))` |

- 区画の順と見出しは上の表のとおり。ヘルプ・お問い合わせ・利用規約の行は、中身が無いので**置かない**（公開時に足す）。
- 「データ」のカードの下の hint：「書き出したファイルは、このブラウザのデータを別の端末へ移すときに使います。」

## §3 下層の画面（スタッフ）

### 3-1 アカウント（`account`）

- フォーム：名前／メールアドレス／現在のパスワード／新しいパスワード／新しいパスワード（確認）。パスワードの 3 欄は空なら変更しない。`type="password"`。
- 保存：`lib/auth.ts` に `updateCoachAccount(patch: { name?: string; email?: string; password?: string }, currentPassword?: string): { ok: true } | { ok: false; reason: string }` を足す（パスワード変更時は現在のパスワードが一致しないと `reason: "現在のパスワードが違います"`。メールは trim・小文字）。成功したらセッションも更新する：`window.dispatchEvent(new CustomEvent("alfa-session", { detail: session }))` を投げ、`AppFlow.tsx` が受けて `saveSession`＋`setSession`（`BoardProvider` の `auth` が追随する）。
- 保存後はトースト「アカウントを更新しました」で `top` に戻る。

### 3-2 チーム名とエンブレム（`teamBasics`）

- チーム名の入力（保存ボタンで `board.setTeamName`。空なら「マイチーム」になる旨を hint に）。
- エンブレム：今の `emblemrow`（プレビュー・画像を選ぶ・削除）をそのまま。画像の選択と削除は今までどおり即時（トースト）。hint は「ホーム・レール・設定に表示されます。正方形の画像（PNG／JPG／WebP）を推奨します。」（「レール上部」をやめる）。

### 3-3 学校区分（`stage`）

- 3 行の選択リスト（小学生（小1〜小6）／中学生（中1〜中3）／高校生（高1〜高3））。選んだ行は右に `✓`（`--accent`）。押すとその場で `team.setSchoolStage`（既存の確認とトーストはそのまま。キャンセルなら表示も戻る）。
- カードの下の hint：「学年グループの範囲とラベルが変わります。範囲外になる学年は未設定に戻ります。」

### 3-4 選手・保護者の招待（`invite`）

- 説明：「選手・保護者は、名簿に登録したメールアドレスと、この共通パスワードでログインします。」
- 共通パスワードの入力（`type="password"`＋「表示」トグルで平文に）。空のときは placeholder に `既定：team2026`（`DEFAULT_PLAYER_PASSWORD`）。保存ボタンで `board.setPlayerPassword`（1 文字ごとの保存はやめる）。
- 「ログイン案内をコピー」ボタン：`「ALFA FOOTBALL のログイン」\nメール：名簿に登録したメールアドレス\n共通パスワード：{設定値 or 既定}` を `navigator.clipboard.writeText`。トースト「コピーしました」。

### 3-5 スタッフ（`staff`）

- 一覧：`TeamData.coaches`（「役割 名前」の文字列）を行にする。左に名前（14px）、その下に役割（12px・`--mut`）。右に「削除」（`--danger`・テキストボタン。`window.confirm("〇〇を削除しますか？")`）。
- 追加：役割の select（監督／コーチ／スタッフ／代表／その他）＋名前の入力＋「追加」ボタン → `team.addCoach(\`${役割} ${名前}\`)`。空は無視。
- hint：「ここに登録した名前は、お知らせやメッセージの送信者名に使われます。」（`staffIdentity` の仕組みをそのまま言う）。コーチ席の上限は無い（プランで差をつけない）。

### 3-6 通知（`notif`）

`lib/storage.ts`：

```ts
export type NotifPrefs = { notebook: boolean; messages: boolean; attendance: boolean };
export const NOTIFPREFS_KEY = "soccer_tactics_notifprefs_v1";
export function loadNotifPrefs(): NotifPrefs;   // 無ければ全部 true
export function saveNotifPrefs(p: NotifPrefs): void; // 保存して window.dispatchEvent(new Event("alfa-notifprefs"))
```

- 画面：3 つのトグル（その場で保存）。スタッフの文言：「ノートの提出」「メッセージ」「出欠の未回答」。選手の文言：「配信・コメント」「お知らせ・メッセージ」「出欠の回答のお願い」。カードの下の hint：「アプリ内の印（レール・下部タブの数字、ホームのベル）に効きます。プッシュ通知はまだありません。」
- 効かせる場所（これ以外は変えない）：
  1. レール・下部タブの「サッカーノート」の数字（`ConsoleShell.tsx` の `noteUnread`）：`notebook` が false なら 0。
  2. スタッフのホームのベル（`homeData.tsx` の `bellRows`／`bellBadge`）：行の種類で絞る。未回答の出欠の行は `attendance`、ノート（未コメント）の行は `notebook`。`bellRows` の各行に種類（`kind: "attendance" | "notebook" | "other"`）が無ければ足す。
  3. ホームのタイムラインの未読の数は**変えない**（通知ではなく一覧）。
- `alfa-notifprefs` イベントで再計算する（`alfa-notifseen` と同じ作法）。

### 3-7 プラン（`plan`）

- 上：現在のプランのカード（プラン名・「選手 70 人 × 500 円 ＝ 35,000 円／月（税別）」）。
- 2 枚のプランカード（通常／動画保存無制限）：名前・「1 人 500 円／月」・lead・video の行。利用中は「利用中」の文字、ほかは「このプランに変更」ボタン（`st-btn`。押すと `window.confirm("〇〇プランに変更しますか？（デモのため課金はありません）")` → `board.setPlan` → トースト「〇〇プランに変更しました」）。
- 下の注記（12px・`--mut`）：「月額は名簿の選手数で決まります。金額は税別です。」「これはデモのプラン切替で、実際の課金は行われません。」
- 月払い／年払い・トライアルの帯・「人気」バッジは出さない。

### 3-8 データ（`data`）

- 「データを書き出す」ボタン：`localStorage` の `soccer_tactics_` で始まるキーを `{ exportedAt, version: APP_VERSION, data: { [key]: value(JSON をパースした値) } }` にして `alfa-football-backup-YYYYMMDD.json` としてダウンロード（`Blob`＋`a[download]`）。`alfa_coach_account_v1`／`alfa_session_v1` は**含めない**。トースト「書き出しました」。
- 「デモデータを入れ直す」（danger の行。文言は「保存データを消してデモに戻す」）：今の `window.confirm` の文言と `resetAppData()`＋reload をそのまま。hint「このブラウザのデータを消して、最新のデモ（中学 1〜3 年・70 人）を入れ直します。ログイン情報は残ります。」

## §4 PC（1440px）

- 本文：`.st-pc { display: grid; grid-template-columns: 184px minmax(0, 760px); gap: 24px }`（絞り込み列と同じ 184px。右は最大 760px、左寄せ）。今の `.setapp .setwrap`（860px の 1 枚のカード。globals.css:18042-18049）は PC reset で `max-width: none; background: none; border: 0; padding: 0` に打ち消す（1 本目の PC ブロックは編集しない）。
- 左のカテゴリの列 `.st-nav`：区画見出し（12px・`--mut`）＋項目（`button.st-navitem`。14px・高さ 32px・角丸 `--r-md`。選択中は `--accent-tint` の地と `--accent` の文字・700）。項目：**アカウント**／（チーム）**チームの基本**・学年・グループ・予定の種類・大会・順位表・体力テストの種目／（メンバー）**スタッフ**・選手・保護者の招待・公開範囲／（その他）通知・プラン・データ。
  - 「チームの基本」= チーム名とエンブレム＋学校区分の行（押すとそれぞれの下層）。「公開範囲」= 試合記録のトグル行。「学年・グループ」などシートを開く項目は、押すとすぐチーム運営のシートへ移る（§6）。
- 右 `.st-main`：`top` のときは選んだカテゴリの行のカード。下層のときはフォーム（左上に「‹ {カテゴリ名}」のテキストボタン、フォーム、下に「保存」）。PC の操作は四角（`--r-md`）・高さ 32px。
- PC のヘッダー下の「チーム名のピル」はそのまま。ログアウトは PC では左のカテゴリ列の末尾に `button.st-navitem.danger`「ログアウト」として置く（ホームのログアウトも残す）。

## §5 選手・保護者

- 入口：スマホの「その他」に行「設定」（コーチラボの次。説明「アカウント・通知」）、PC のレールの末尾に「設定」（`IconCog`。`ConsoleShell.tsx` の選手の entries に追加）。下部タブの `screens` には既に `settings` がある。
- 一覧：アカウントのカード（名前／「選手・中2」など学年・グループ／メール）→ `account`（選手版：名前・メール・「パスワード：チームの共通パスワードです。変更はスタッフに依頼してください。」の表示だけ。編集は無し）／通知 → `notif`（§3-6 の選手の文言）／バージョン／ログアウト。チームの区画は出さない。
- `SettingsScreen` は `board.auth.role` で出し分ける（今は role の guard が無い）。

## §6 散らばった設定を行から開く（teamIntent）

- `BoardProvider` の `teamIntent` に `openSheet?: "groups" | "categories" | "competitions" | "league" | "fitnessTests"` を足す。`openGroups` は `openSheet: "groups"` に置き換え（`NotebookScreen.tsx` の 2 か所も直す）。
- `TeamHub.tsx` の intent 消費：`openSheet` があれば `setSheet({ type })`（`league` は `{ type: "league" }`、`fitnessTests` は `{ type: "fitnessTests" }`）。tab は設定側が渡す：groups→`ros`、categories→`cal`、competitions→`rec`、league→`rec`、fitnessTests→`ros`。
- 設定の行から：`board.setTeamIntent({ tab, openSheet }); board.setScreen("team")`。シートを閉じたあとはチーム運営に留まる（設定へ自動では戻らない。各画面の「絞り込みを編集…」「＋ 管理」の入口は残す）。

## §7 CSS（app/globals.css）

- 新しいクラスは `st-*`。基底（`hp-*` の後ろ）に書き、PC だけの調整は PC reset（`@keyframes wdialogin` の直前）、`(pointer: coarse)` で 44px に戻す。`@media` は 9 本のまま。色はトークンだけ。
- トグルの ON は設定の中では青：基底に `.setapp .pubtoggle input:checked ~ .switch { background: rgba(44,111,214,0.4) }`／`::after { background: var(--accent) }`。
- `.st-btn`（主ボタン：`--accent` 地・白・14px・700・角丸 `--r-md`・高さ スマホ 44px／PC 32px）、`.st-btn.ghost`（枠線・`--accent` 文字）、`.st-btn.danger`（`--danger` 文字・枠線）。`.bigbtn` は設定では使わない。
- `.setapp` のスマホ：`.st-top`／`.st-form` は左右 16px、下 `calc(env(safe-area-inset-bottom) + 40px)`。
- 旧クラス（`.plancard`／`.billtoggle`／`.trialbanner`／`.planlede`／`.planseote`／`.pcscale` など）の CSS は 1 本目の PC ブロックにもあるので**消さない**（使わないだけ）。

## §8 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. スタッフ：PC（1440）で左に 184px のカテゴリ列・右に行のカード。スマホ（390）で見出し付きのグループ化リスト（アカウントのカード → チーム → メンバー → 通知 → プラン → データ → ログアウト）。行の左にアイコンが無い。行の右に今の値が出る（チーム名・学校区分・学年・グループ・スタッフ N 人・共通パスワード・通知・プラン）。
3. 下層：アカウント（名前・メール・パスワードの変更。現在のパスワードが違うと保存できない。保存後にレール下端の名前が変わる）／チーム名とエンブレム／学校区分（選択リスト・✓）／招待（表示トグル・コピー）／スタッフ（追加・削除）／通知（3 トグル）／プラン（2 枚・月額の計算）／データ（書き出し・デモに戻す）。
4. 学年・グループ／予定の種類／大会／順位表／体力テストの種目の行を押すと、チーム運営の該当シートが開く。
5. プラン：通常 500 円／人、動画保存無制限 700 円／人。70 人で 35,000 円／49,000 円。レールとスマホのヘッダーのプラン名が「通常プラン」。旧データ（starter／pro）の移行。
6. 選手：その他タブと PC レールに「設定」。中身はアカウント（表示だけ）／通知／バージョン／ログアウト。チームの区画は無い。
7. 通知のトグルを切るとレール・下部タブの数字とホームのベルの該当行が消え、戻すと復活する。
8. スマホのトグルと主ボタンが青。横はみ出しなし（390／1440）。ほかの画面に差分が無い（レール・ヘッダーのプラン名、その他タブの行の説明、選手のレール末尾の「設定」を除く）。

---

## §9 実装時の判断（2026-10-05。以後はここが正）

実装は Sonnet 5.5（WP1〜3）、レビューは Opus 5.5（仕様・正しさ・CSS・文言の 4 観点。指摘 26 件に 1 件ずつ反証し 24 件が残存、うち major 1 件）。統括が採否を決めて次のとおりにした。

- **メールを変えたときのコーチラボ**（major）：コーチラボの利用者 ID は `me:<メール>` なので、メールを変えると自分の記事・購入・フォローが他人扱いになる。`updateCoachAccount` でメールが変わったときは `soccer_tactics_coachlab_v1` と `soccer_tactics_user_articles_v1` の中の ID を新しいメールに書き換える（`lib/auth.ts` の `migrateCoachLabUserId`）。
- **通知の行は効くものだけ**：`messages` を読む場所（チャットの未読の数字）が無く、選手にはホームのベルも無い。効かないトグルを置かないことにし、スタッフは「ノートの提出」「出欠の未回答」の 2 つ、選手は「配信・コメント」の 1 つにした。hint も役割で出し分ける。一覧の「通知」の値は出している行だけを数える（スタッフ「2 件ともオン／1 件オン／すべてオフ」、選手「オン／オフ」）。`NotifPrefs.messages` は型と保存に残し、チャットの未読の数字を作るときに行を足す。
- **PC の 1 行だけのカテゴリ**：スタッフ／選手・保護者の招待／通知／プラン／データは、左の列を押した時点で右に下層を出す（行を 1 回余計に押させない。戻りも出さない）。保存後もその下層を出し続ける。
- **スタッフの一覧と本人**：ログイン名に当たる項目に「あなた」を添え、削除の確認で「送信者名が別のスタッフになる」と伝える。アカウントで名前を変えたときは、その項目の名前も一緒に書き換える（`staffIdentity` が本人を見失わないように）。同じスタッフの追加はトーストで知らせて入力を残す。
- **データの書き出し**：`soccer_tactics_settings_v1` の `playerPassword`（平文）は外す。説明は「スタッフのログイン情報と選手の共通パスワードは含まれません」。読み込みの機能は無いので hint は「バックアップとしてファイルに保存します」にし、一覧の行は「データ」（説明「書き出し・デモデータの入れ直し」）にした。
- **招待**：未保存の共通パスワードがあるときは「ログイン案内をコピー」を押せなくし、「保存してからコピーできます」と添える。
- **アカウント**：新しいパスワードを入れて現在のパスワードが空なら「現在のパスワードを入力してください」。
- **順位表の値**：チーム運営の表示（未保存でもデモの既定値を出す）に合わせ、行が 0 件なら「未登録」、あれば名称（空なら「リーグ順位表」）。§2-3 の表より実装を正とする。学年・グループと体力テストの種目は 0 件なら「未登録」。
- **トグル**：`.pubtoggle` ではなく専用の `.st-toggle`／`.st-switch`（ON の地は `color-mix(in srgb, var(--accent) 40%, transparent)`、つまみは `--accent`）。§7 の `.setapp .pubtoggle` の記述はこれに置き換える。
- **選手の PC の左の列**：アカウント／通知／バージョン＋ログアウト。
- **小さい直し**：金額は `toLocaleString("ja-JP")`、`migratePlan` はプロトタイプのキーを引かない、下層へ移るときに左の列のカテゴリも合わせる、PC の戻り `.st-back` は 32px、エンブレムの見出しは「エンブレム」。
- **見送った指摘**：その他タブのスタッフ用の行の説明（仕様の文言どおりなので変えない）、選手の左の列の項目（仕様に無かったので上のとおり決めた）。
- **やめたもの**：年払い・トライアルの帯・「人気」バッジ・注記 4 行・旧 MoreSheet（死にコード）・`SettingsBody`／`SettingsSheet`。通常プランの動画の上限（本数・期間）は未定のまま「上限あり」とだけ表示している。
- **検証**：`~/.claude/alfa-verify-tools/p19_verify.js`（54 項目）。
