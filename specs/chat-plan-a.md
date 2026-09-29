# チャットの作り直し（案 A）— 2026-09-29

出典：` 分析/ALFA_FOOTBALL_チャットUI調査_2026-09-29.pdf` の「ALFA への提案 案 A」。ユーザー指示「案 A で実装してみて」。PDF の進め方 3 段（①一覧とスレッドの表示 ②お知らせの分離 ③引用返信・長押し・保護者の帯・PC の既読パネル）を**全部**入れる。

## 0. 今の作り（変える前）

- 連絡＝`TeamData.announcements`（`Announcement {id, ts, text, playId?, playTitle?, groupIds?}`、`TeamProvider.addAnnouncement/removeAnnouncement`）。表示は `TeamHub.tsx` の `ChatTab`（スマホのチームタブ「チャット」の上部）・`AnnCard`・`annList`／`announce` シート（TeamHub の SheetHost）。
- チャット＝`BoardProvider.messages: ChatMessage[]`（localStorage `soccer_tactics_messages_v1`）。会話キーは `"team"`／`"grp:<groupId>"`／`"p:<playerId>"`。一覧は `ChatScreen.tsx` の `CoachConversations`（チーム全員→グループ→個人 70 人）、スレッドは `ChatThread.tsx`。選手は `PlayerChat` で全員・所属グループ・個別を 1 本に混ぜて表示。
- 送信の入口：`ChatThread`、`SheetManager.tsx` の `SaveBody`（戦術・セットプレーの保存時の送信先）、`DrillEditor.tsx`（練習メニューの送信）。宛先は `SendTarget.tsx`（チーム全員／個人／グループ）→ `targetThreadKeys` で会話キーに変換。
- 画面：`board.screen === "chat"` → `ChatScreen`（PC はレール「チャット」、2 ペイン）。スマホは下部タブ「チーム」→ セグメント「チャット」（`TeamHub` の `ChatTab`）。スマホの会話は board シート `{type:"chat", chatTo}`（`SheetManager.ChatSheet`）で開く。

## 1. 形（案 A）

チャットを **「お知らせ」と「メッセージ」の 2 つ**に分ける。

- **お知らせ**＝スタッフからの一斉連絡（全員／学年／グループ宛て）。カードで流れない。選手・保護者は読む・「了解」を押す・「スタッフに返信」だけ（投稿しない）。
- **メッセージ**＝スタッフと選手（保護者）の 1 対 1 の会話だけ。
- **グループ宛て・チーム全員宛ての「チャット」（会話キー `team`／`grp:*`）は廃止**し、中身はお知らせへ移す（§6 の移行）。以後、どの画面からも `team`／`grp:*` へメッセージを送らない。

## 2. データ

### 2-1. `Announcement`（`lib/types.ts`）に足す（すべて任意・後方互換）

```ts
title?: string;            // 件名。無ければ本文の 1 行目を件名として表示
pinned?: boolean;          // 上部に固定（最大 2 件。3 件目を固定したら一番古い固定を外す）
fromName?: string;         // 送信者の名前（例「岡本」）。無ければ「スタッフ」
fromRole?: string;         // 役割（例「監督」「コーチ」「スタッフ」）
attachments?: ChatAttachment[]; // 戦術・練習メニュー・セットプレー・画像・動画（ChatMessage と同じ型）
seenBy?: string[];         // 開いた選手の playerId（選手と保護者は 1 アカウント＝選手単位）
acks?: string[];           // 「了解」を押した選手の playerId
remindedAt?: number;       // 最後に「未読の人に再通知」した時刻
```

`playId/playTitle` は残す（旧データの表示用）。新規作成では使わず、戦術は `attachments` に入れる。

### 2-2. `ChatMessage` に足す

```ts
fromRole?: string;         // スタッフの役割（選手の発言は無し）
replyTo?: { id: string; source: "message" | "announcement"; fromName: string; text: string }; // 引用返信（text は 60 字まで）
```

### 2-3. 既読（1 対 1 の会話）

`BoardProvider` に `chatReads: Record<string /* p:<playerId> */, { staff?: number; member?: number }>`（localStorage `soccer_tactics_chatreads_v1`、lazy 初期化・保存は messages と同じ作法）と `markChatRead(key: string, side: "staff" | "member")`（`Date.now()` を入れる）を足す。

- 未読数：スタッフ側＝その会話で `from` が選手（`p:<id>`）かつ `ts > chatReads[key].staff` の数。選手側＝`from === "coach"` かつ `ts > chatReads[key].member` の数。
- 既読表示：自分の最後の発言の下に、相手側の既読時刻がその `ts` 以上なら「既読」（時刻は付けない）。

### 2-4. 送信者の名前と役割

`lib/chat.ts`（新規）に `staffIdentity(authName: string, coaches: string[]): { name: string; role: string }`：
`TeamData.coaches` は「役割 名前」の文字列（例「監督 岡本」「スタッフ 藤田」）。`authName` を空白区切りのトークンとして含む項目があればそれを分解（1 語目＝役割、残り＝名前）。無ければ `coaches[0]`。`coaches` が空なら `{ name: authName || "スタッフ", role: "スタッフ" }`。
デモのコーチ（`auth.name`「監督」）は「監督 岡本」になる。スタッフの送信（お知らせ・メッセージ）はすべて `fromName`／`fromRole` をこれで埋める。選手の発言は `fromName` ＝選手名、役割なし。

### 2-5. 送信の共通化

`lib/chat.ts` に、宛先（`SendTarget`）と添付から送る関数を置き、`SaveBody`・`DrillEditor`・お知らせ作成が使う：

- `チーム全員` → お知らせ（`groupIds` 無し）。件名＝「戦術「〇〇」」「練習メニュー「〇〇」」「セットプレー「〇〇」」、本文は空でよい（本文が空のお知らせは件名だけ表示）。
- `グループ` → お知らせ 1 件（`groupIds` に選んだ全グループ。今のようにグループごとに複数件にしない）。
- `個人` → その選手との 1 対 1 に `ChatMessage`。
- 完了の toast は「お知らせを送りました」／「〇〇さんに送りました」。

`TeamProvider.addAnnouncement` は引数をオブジェクト 1 つに変える：`addAnnouncement({ title?, text, groupIds?, attachments?, pinned?, fromName?, fromRole? })`（呼び出し側はすべて直す）。ほかに `updateAnnouncement(id, patch)`、`markAnnouncementsSeen(ids, playerId)`、`toggleAnnouncementAck(id, playerId)`、`remindAnnouncement(id)`、`setAnnouncementPinned(id, pinned)`（最大 2 件の規則をここで守る）。

## 3. 画面

### 3-1. 共通部品 `components/ChatHome.tsx`（新規）

`ChatHome({ pc, lockSegment? })`。上に **セグメント「お知らせ｜メッセージ」**（`MobileSegments` の文法。各項目に未読の数の赤丸 `.chatsegbadge`）。選んだ方は localStorage `soccer_tactics_chatseg_v1`（"ann"／"msg"）に保存し、同じキーの部品同士はイベントで同期（`useGroupFilter` と同じ作法）。スマホのヘッダーの右アクションもこの値を見て切り替える（§3-5）。

**視点**：スタッフ＝`team.viewer.role === "coach"`。選手・保護者＝それ以外（コーチの「選手として閲覧」プレビューも含む。そのときの選手は `team.viewer.memberPlayerId`、ログイン中の選手は `board.auth.playerId`）。

### 3-2. お知らせ（`AnnouncementsView`）

- 並び：固定（`pinned`）を上に（新しい順）、その下に残りを新しい順。選手・保護者には自分宛て（`announcementTargetsPlayer`）だけ。
- **カード**（`.anncard`。固定は左に 3px の `--accent` の線と「固定」ラベル）：1 行目＝宛先ラベル（全員＝ネイビー、グループ＝そのグループの色 `TeamGroup.color`。複数なら「中2・Aチーム」で最初のグループの色）＋「固定」＋右端に日付（今日なら時刻、昨日は「昨日」、それ以外は「9/28」）。2 行目＝件名（太字 15px）。3 行目＝本文 2 行で省略。添付があれば「戦術「〇〇」」などの小さな行。下の行＝左に「了解」ボタン（選手：押すと自分が入る／外れる。押していれば塗り。数字は「了解 41」）、右に（スタッフだけ）「既読 52/70 ›」。選手には既読の数を出さない。送信者「岡本 監督」を日付の左に小さく。
- カードを押すと**詳細**（スマホ＝board シート `annDetail`、PC＝右のペイン）：件名・送信者（名前＋役割バッジ）・日時・宛先・本文全文・添付（`ChatThread` の `AttachmentView` を export して使う）・了解ボタン。
  - 選手：下に「スタッフに返信」（押すと §3-3 の 1 対 1 が開き、入力欄の上にこのお知らせの引用（`replyTo.source="announcement"`）が付いた状態になる）。「お知らせへの返事はスタッフだけに届きます」の注記。
  - スタッフ：「既読 52 ／ 未読 18」のタブ（未読が既定）で名前の一覧（学年ごとの小見出し）。「未読の 18 人に再通知」ボタン（`remindAnnouncement`、toast「未読の 18 人に再通知しました」。`remindedAt` があれば「最後の再通知 9/29 10:12」）。「了解 41」を押すと了解した人の一覧。上部固定の切替、削除（確認あり）。
- 選手がお知らせの画面を開いたら、表示された自分宛てのお知らせを `markAnnouncementsSeen` で既読にする（一覧を開いた時点でよい）。
- 空のとき「お知らせはまだありません。」。スタッフには作成ボタン。
- **作成**（board シート `annCompose`。PC は同じ中身を右のペインかシートで）：件名（任意）・本文・宛先（`GroupChips` の複数選択、未選択＝全員）・「戦術を添付」（今の保存戦術の select）・「上部に固定する」チェック・送信。送信者は §2-4。

### 3-3. メッセージ（`MessagesView`）

- **スタッフ**：上に検索欄（名前・本文）と「すべて｜未読」の切替（`.chatfilterchips`）。**やり取りのある 1 対 1 だけ**を最新の発言の新しい順で並べる（空の 70 行は出さない）。行（`.convrow` を流用）＝アバター（頭文字）・名前・学年／グループ（小さく「中2・Aチーム」）・最新の発言（スタッフの発言なら「あなた：」、選手なら本文のみ）・時刻（今日＝時刻、昨日、M/D）・未読の数の赤丸。一覧の最後に「＋ 新しいメッセージ」。1 件も無ければ「まだメッセージはありません」＋同じボタン。
- **新しいメッセージ**（board シート `chatNew`。PC は同じ中身をシートで）：検索欄、学年／グループのチップ（`GroupChips` 単一選択・すべて）、選手の一覧（名前・背番号・学年）。1 人を押すとその 1 対 1 が開く（スマホは既存の `chat` シート、PC は右ペイン）。今の一覧の途中にある絞り込みチップはここへ移す（`useGroupFilter("chat")` をここで使う）。
- **選手・保護者**：一覧は出さず、スタッフとの 1 対 1（`p:<自分>`）をそのままこの場所に表示する（見出し「スタッフ」）。

### 3-4. 1 対 1 のスレッド（`ChatThread` を 1 対 1 専用に作り直す）

- 上部に「このやりとりは保護者も見られます」の帯（`.chatguard`、`--surface` 地・12px・`--mut`）。スタッフ側・選手側の両方に出す。
- 自分＝右・`--accent` 地の白文字、相手＝左・`--surface`（灰）地。相手の発言は、連続（同じ送信者・5 分以内・同じ日）の最初の 1 通だけ上に名前（スタッフなら「岡本」＋役割バッジ `.chatrole`「監督」、選手なら選手名）と左にアバター（頭文字の丸）。2 通目以降は名前・アバターを省き左の余白だけ揃える。
- 日付が変わるところに中央の区切り（「今日」「昨日」「9月28日（日）」、`.chatday`）。時刻は各吹き出しの外側の下に小さく（連続の最後の 1 通だけでよい）。
- 開いた時点の未読（相手の発言で自分の既読時刻より新しいもの）の手前に「ここから未読」の線（`.chatunreadline`）。表示中は `markChatRead` を呼び続ける（新着が来たら更新）。
- 自分の最後の発言の下に「既読」（§2-3）。
- 引用返信：吹き出しの上に元の送信者名と本文の冒頭（1 行・省略）を左に縦線付きで（`.chatquote`）。押すと元の発言へスクロール（お知らせの引用なら詳細を開く）。
- **長押し**（スマホ 500ms。PC は右クリック、または吹き出しにマウスを乗せたとき出る「…」）でメニュー（`.chatmenu`）：返信／コピー／削除（自分の発言。スタッフは相手の発言も削除できる＝今と同じ）。返信を選ぶと入力欄の上に引用のバー（×で取り消し）。
- 入力欄（`+` の添付・送信）は今の作りを残す。日時・宛先バッジ・削除ボタンを吹き出しの中に並べるのはやめる。
- 送信：スタッフ→`to=p:<id>`、`from="coach"`、`fromName/fromRole`＝§2-4。選手→`to=p:<自分>`、`from=p:<自分>`、`fromName`＝選手名。

### 3-5. スマホの置き場所

- `TeamHub` のセグメント「チャット」＝ `<ChatHome />`（今の「連絡」セクション・`AnnCard`・`annList`／`announce` シートは撤去）。スマホのヘッダーの右アクションは、スタッフで「お知らせ」なら「お知らせを送る」（`annCompose`）、「メッセージ」なら「新しいメッセージ」（`chatNew`）。選手は無し。
- `ChatScreen`（`board.screen === "chat"`）のスマホ表示も `<ChatHome />`。
- 1 対 1 は既存の board シート `chat`（`SheetManager.ChatSheet`）。見出しは選手名、副題に「中2・Aチーム」（選手側は「スタッフ」）。`chatTo` が `team`／`grp:*` で来たら（旧いリンク等）お知らせを開く。

### 3-6. PC（`usePc()`）

- `ChatScreen` を 2〜3 列にする：左 320px＝セグメント＋一覧（お知らせのカードは小さい版 `.anncard.mini`：宛先・件名・既読）、中＝詳細（お知らせ）または 1 対 1 のスレッド。本文・吹き出しの行幅は 680px まで（中の列の中で左寄せ、余白は空けてよい）。**スタッフがお知らせを開いたときだけ**右に 280px の既読パネル（既読／未読のタブ・名前一覧・再通知）。
- 選手の PC も同じ枠（左＝セグメント＋お知らせ一覧、メッセージ選択時は中にスタッフとの 1 対 1）。
- `TeamHub` の PC のサブナビ「連絡」は「お知らせ」に名前を変え、中身は `<ChatHome pc lockSegment="ann" />`（お知らせだけ）。
- PC の操作部品は四角（`--r-md`）。

## 4. 通知

`lib/notifications.ts` の選手向けイベント通知に「新しいお知らせ：〇〇（件名）」を足す（未読＝自分宛てで `seenBy` に自分がいないもの）。スタッフ向けは足さない。

## 5. 変えないもの

- 選手どうしのチャットは作らない。選手はお知らせに投稿しない（返事は了解とスタッフへの 1 対 1）。
- 添付（戦術・練習メニュー・セットプレー・画像・動画）の見た目と「開く」動作（`AttachmentView`）。
- `SendTarget` の選択肢（送信しない／チーム全員／個人／グループ）。中身の送り先だけ §2-5 に変える。
- 他画面の `useGroupFilter` キー。ノート・名簿・戦術ボード・カレンダー。

## 6. 移行とデモ

- 起動時に一度だけ（localStorage マーカー `soccer_tactics_chatmig_v1`＝"1"）：`messages` のうち `to` が `team` または `grp:*` のものをお知らせへ移す（`id`＝`ann_from_<msgid>`、`ts`・本文・添付をそのまま、`groupIds`＝`grp:*` ならその id、`fromName` は元の値、`title` は無し）。ただし**同じ宛先で、本文が同じか一方が他方の先頭と一致し、時刻の差が 24 時間以内のお知らせが既にあれば移さない**（今のデモの「今週末は練習試合です…」の二重を 1 件にする）。移した（またはスキップした）メッセージは `messages` から消す。削除済みグループ宛ては捨てる。messages と team の両方の読み込みが済んでから行う（BoardProvider と TeamProvider の読み込み完了後。TeamProvider 側の effect で `board.messages` を読んで行うのが自然）。
- デモの初期データ（新規シード）：
  - お知らせ 3 件：①全員・固定「今週末は練習試合です」（本文「集合 8:45・スパイクの手入れも忘れずに。」、送信者 岡本 監督、`seenBy` 52 人・`acks` 41 人）②中3「木曜はセットプレーの確認」（藤田 スタッフ、`seenBy` 中3 の 20 人・`acks` 15）③Aチーム「金曜 9:15 キックオフ」（岡本 監督、`seenBy` 15・`acks` 12）。`seenBy`／`acks` は対象の選手から決め打ちで選ぶ（佐藤 蒼空 p08 は①を既読・了解済み、③は未読にする＝選手デモで未読が見える）。
  - メッセージ（1 対 1）：佐藤 蒼空（p08）「明日の集合は何時ですか？」（選手→スタッフ、スタッフ未読）＋それへの返信（岡本 監督「8:45 に市民グラウンドです。」、`replyTo` 付き、選手側は既読済み）、中村 大翔「ノート出しました」（スタッフ未読）、ほか 1 人とのやり取り 1 往復（既読済み）。`chatReads` もそれに合わせて初期化。
  - 既存の `sampleMessages()` の `team`／`grp:*` 宛ては削除（移行と同じ内容をお知らせ側に置く）。

## 7. CSS の契約

`app/globals.css` の行頭 `@media` は 9 本のまま（`grep -c "^@media" app/globals.css`）。新規ルールは基底（最初の `@media (min-width: 1024px)` より前）、スマホ限定は `.app:has(.mhead)`／`body:has(.mhead)`、PC だけの調整は 2 つ目の PC ブロック末尾の `/* === mobile-redesign PC reset === */` セクション。色はトークンのみ（グループ色はインライン style）。新規 hex を CSS に書かない。文字 12px 以上、スマホのタップ領域 44px 以上、緑（`--primary`）は主ボタンだけ（お知らせの送信・メッセージの送信は `--accent`）。スマホ 390px で横はみ出しゼロ。既存の `.chatrow/.chatbubble/.convrow` の PC ルールと衝突しないよう、新しい見た目は新しいクラスで作るか、置き換えた古いルールを撤去する。

## 8. 受け入れ基準

1. スマホ・スタッフ：チーム→チャットの上に「お知らせ｜メッセージ」。お知らせにカード 3 件（固定が上）、各カードに「了解 N」「既読 N/M ›」。「連絡」セクション・`annList` は無い。ヘッダー右は「お知らせを送る」／「新しいメッセージ」に切り替わる。
2. お知らせを作成（件名・本文・宛先 中2・固定）→ 一覧の上に出る。固定 3 件目で一番古い固定が外れる。
3. カード詳細（スタッフ）：既読／未読のタブと名前一覧、「未読の N 人に再通知」で toast と「最後の再通知」。削除できる。
4. メッセージ（スタッフ）：やり取りのある会話だけが新しい順、未読の赤丸、検索と「未読」で絞れる。「＋ 新しいメッセージ」→ 学年チップ・検索 → 選手を選ぶと 1 対 1 が開く。70 人の空行は無い。
5. 1 対 1：保護者の帯、日付の区切り、名前＋役割バッジ（連続はまとめ）、「ここから未読」、自分の最後の発言の「既読」、長押し（PC は右クリック）→ 返信 → 引用付きで送信できる。
6. 選手（p08）：お知らせに自分宛てだけ（全員・中2・Aチーム。中3 宛ては出ない）、了解を押せる、既読の数は出ない、入力欄は無い。「スタッフに返信」→ メッセージに引用付きで開く。メッセージはスタッフとの 1 対 1 がそのまま出る。お知らせを開くと、スタッフ側の既読の数が 1 増える。
7. PC・スタッフ：チャット画面が 左（一覧）｜中（詳細・スレッド）｜右（既読パネル、お知らせのときだけ）。チーム運営のサブナビ「お知らせ」も同じお知らせを出す。
8. 戦術の保存で送信先「チーム全員」「グループ（中1＋GK）」→ お知らせ 1 件（添付付き）。「個人」→ その選手との 1 対 1。練習メニューも同じ。
9. 既存データの移行：`team`／`grp:*` のメッセージがお知らせになり、デモの二重が 1 件になる。再読み込みしても二重に移らない。
10. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。スマホ 390px・PC 1440px で横はみ出しなし。pageerror 0。

## 9. 検証手段

- 開発サーバー http://localhost:3000（落ちていたら `(nohup npm run dev > /tmp/alfa_dev.log 2>&1 &)`）。`next build` 禁止。
- puppeteer ヘルパー：scratchpad の `tools/lib.js`（`~/.claude/alfa-verify-tools/lib_full.js` の写し。`launch(VP_PC|VP_M)`／`seedCoach`／`seedPlayer`（p08 佐藤 蒼空）／`HIDE`／`sleep`）。起動後 6 秒待つ。チャットへは PC＝レールの「チャット」、スマホ＝下部タブ「チーム」→ セグメント「チャット」。
- 受け入れ検証スクリプト：scratchpad の `tools/p11_chat_verify.js`（統括が用意）。変更前の基準スクショ：`chatres/alfa/`。
