# コーチラボ（旧「お役立ち記事」）設計仕様 v1

作成：2026-09-11／設計：fable5／実装：sonnet5／レビュー：opus5
目的：「お役立ち記事」を、指導者が記事を投稿・販売し、読者がフォロー・購入できる仕組みに拡張する（noteの仕組みを参考にしつつ、UIは独自）。本MVPは**端末内デモ（localStorage）**で、決済は疑似（確認ダイアログ→購入記録）。本番の決済・共用サーバーは別フェーズ。

---

## 0. 名前と位置づけ

- 表示名：**コーチラボ**（英字表記なし。ホームのタイル・レール・画面見出し・モバイルのメニューシートすべてこの名前に統一）。サブコピー：「指導者の記事を読む・書く・売る」。
- 内部キー（ScreenName／レール key／SheetType）は互換のため `"articles"` のまま。
- 言葉づかい：投稿者＝**指導者**（noteの「クリエイター」は使わない）、いいね＝**参考になった**（「スキ」は使わない）、購入＝**購入して読む**、有料境界＝**有料ライン**。
- 文言・レイアウトともにnoteの模倣は避ける（後述 §7）。

## 1. 現状（変更前）

- `lib/articles.ts`：`Article`（seed 5本）、`UserArticle`（author名の文字列・draft・attachments）、`mergedArticles()`。
- `BoardProvider`：`userArticles` と add/update/remove。保存キー `soccer_tactics_user_articles_v1`。
- PC：`ConsoleScreens.tsx` の `ArticlesScreen`（閲覧2ペイン／投稿モード＋`ArticleForm`）。
- モバイル：ホームのタイル→`openSheet({type:"articles"})`→`SheetManager.tsx` の `ArticlesBody`/`ArticleBody`。
- CSS：`.artapp .art*` 系（基底＋PCブロック）。

## 2. 変更の全体像

| 領域 | 変更 |
|---|---|
| 名前 | 「お役立ち記事」→「コーチラボ」（全箇所。grepで `お役立ち記事` をゼロにする） |
| 入口 | ホームのタイルは `board.setScreen("articles")` に変更（シートではなく画面へ）。モバイルのメニューシート（SheetManager 1256行付近）の項目も同じく画面へ。SheetManager の `ArticlesBody`/`ArticleBody` は残すが到達経路を無くす（削除はしない） |
| 画面 | 新規 `components/CoachLab/` 配下に実装し、`AppRoot` の `"articles"` 分岐から新画面を描画。旧 `ArticlesScreen`/`OwnArticleList`/`ArticleForm` は ConsoleScreens から削除（`clearArticleFormDraft` の参照も整理） |
| データ | 新規 `lib/coachlab.ts`（型・定数・シード・手数料計算・検索）。`UserArticle` に任意項目を追加（後方互換）。新規保存キー `soccer_tactics_coachlab_v1` |
| 状態 | 新規 `components/CoachLab/CoachLabProvider.tsx`（プロフィール・フォロー・購入・参考になった・閲覧数・振込申請）。記事本体は従来どおり `BoardProvider.userArticles` |
| アイコン | `components/icons.tsx` に `IconLab`（フラスコの線画。既存アイコンと同じ stroke 1.8 / 24px グリッド）を追加し、タイル・レールで使用 |
| CSS | 接頭辞 `.cl-` で新設。基底（モバイル優先）＋ 2つ目の `@media (min-width: 1024px)` ブロック（13404行〜）の末尾にPC用を追加。**新しい @media は作らない** |

## 3. データモデル（`lib/coachlab.ts`）

```ts
export type License =
  | "JFA S級" | "JFA A級" | "JFA B級" | "JFA C級" | "JFA D級" | "キッズリーダー"
  | "GKレベル1" | "GKレベル2" | "GKレベル3" | "フィジカルフィットネスC級"
  | "審判1級" | "審判2級" | "審判3級" | "審判4級"
  | "元プロ選手" | "海外指導経験" | "教員免許（保健体育）" | "アスレティックトレーナー";
export const LICENSES: License[]            // 上の順
export const AUTHOR_ROLES = ["監督","コーチ","GKコーチ","アナリスト","トレーナー","スクール代表","部活動顧問","保護者コーチ","その他"] as const;
export const REGIONS: string[]              // 47都道府県
export const ARTICLE_TAGS_SUGGEST = ["U-12","U-15","U-18","8人制","11人制","ビルドアップ","プレッシング","セットプレー","GK","フィジカル","メンタル","保護者対応","チーム運営","部活動"];

export interface CareerItem { from: string; to?: string; org: string; role: string }   // from/to は "2019" や "2021-04" の文字列
export interface AuthorProfile {
  id: string;                 // 自分: "me:<email小文字>"／シード: "s-<slug>"
  name: string; headline: string; bio: string;
  licenses: License[]; role?: string; team?: string; region?: string;
  career: CareerItem[];
  hue: number;                // アバター色（0-359）。名前の頭文字を丸で表示
  createdAt: number; updatedAt: number;
  seed?: boolean; followerBase?: number;   // シードの初期フォロワー数（表示用）
}
export interface Follow   { userId: string; authorId: string; ts: number }
export interface Purchase { userId: string; articleId: string; price: number; ts: number }
export interface Like     { userId: string; articleId: string; ts: number }
export interface Payout   { authorId: string; amount: number; ts: number }
export interface CoachLabState {
  profiles: AuthorProfile[]; follows: Follow[]; purchases: Purchase[]; likes: Like[];
  views: Record<string, number>; payouts: Payout[];
}
```

`lib/articles.ts` の `UserArticle` に任意項目を追加（既存データはそのまま読める）：
```ts
authorId?: string;      // 未設定なら閲覧時に "me:<email>" 相当として扱う（旧データ互換）
tags?: string[];        // 最大5
price?: number;         // 0 or 未設定＝無料。有料は 100〜50,000 円
paidFrom?: number | null; // 有料ラインの位置＝この index 以降の段落が有料（null/未設定＝全文無料）
publishedAt?: number;   // 初回公開時刻
```
シード記事（`ARTICLES`）はそのまま残し、`lib/coachlab.ts` 側の `SEED_ARTICLE_META: Record<articleId, {authorId, tags, price, paidFrom}>` で著者・タグ・価格を付与する。加えて **新規シード記事を5本**（うち有料3本：¥300／¥500／¥1,000）を `lib/coachlab.ts` に `SEED_ARTICLES: UserArticle[]`（id は "s-..."）として追加する。本文は各3〜5段落・オリジナル（実在の記事の転載や要約は不可。サッカー指導の一般論として自然な内容にする）。

利用者ID（`userId`）：`board.auth.role === "coach"` は `"me:<email>"`、選手・保護者は `"p:<playerId>"`。

**手数料モデル（定数）**：note調査（`specs/coachlab-note-research.md`）の示唆に従い、決済手段で手取りが変わる方式は採らず**単一率**にする。`SALE_FEE_RATE = 0.15`（決済手数料込みの販売手数料15%）、`PAYOUT_FEE_YEN = 0`（振込手数料なし）、`MIN_PRICE = 100`、`MAX_PRICE = 50000`、`MIN_PAYOUT = 1000`、預かり期限なし。関数 `splitSale(price)` → `{ fee, creator }`（`fee = Math.round(price × 0.15)`、`creator = price − fee`）。売上は毎月末に自動振込（デモでは「振込を申請する」で記録）。

**追加フィールド（note調査からの採用）**：
- `refundable?: boolean`（既定 true）：購入後24時間以内の返金申請を受け付けるか。記事ページに「返金可／返金不可」を表示。デモでは購入から24時間以内に「返金を申請」を押すと購入記録を取り消しトースト。
- `audience?: "coach" | "parent" | "player"`（任意）：読者の想定（指導者向け／保護者向け／選手向け）。一覧チップで絞り込める。
- 購入実績のある有料記事は**下書きに戻せず削除もできない**（購入者保護）。編集は可能で、購入者には常に最新版が表示される。
- 購入前の開示：有料ライン以降の**残り段落数・残り文字数・添付件数**を数字で示す。
- タグは**複数選択のAND絞り込み**（例：U-12 かつ セットプレー）に対応する。

**読了時間**：本文の総文字数 ÷ 500 字/分（最小1分、切り上げ）。

**検索・絞り込み**（純関数）：`searchArticles(list, {q, category, tag, priceFilter:"all"|"free"|"paid", authorIds?})`（タイトル・リード・本文・タグ・著者名を部分一致、かな/英字は大小無視）／`searchAuthors(profiles, {q, license, region, role})`（名前・肩書・チーム名・資格・地域を部分一致。**資格名（例「S級」）とチーム名で当たること**）。並び替え：新着／参考になった数／購入数。

## 4. 状態管理（`CoachLabProvider`）

- `AppRoot` の `<ConsoleShell>` の外側で `BoardProvider` の内側に配置（`useBoard` を使うため）。読み込みは lazy 初期化（`useState(() => load())`）、保存は `useEffect`（既存の userArticles と同じ流儀。StrictMode二重マウントで消えないこと）。
- 初回ロード時にシードのプロフィールが無ければ追加（`seed:true` は上書きしない。ユーザーが作った `me:` は保持）。
- 提供する値・操作：`profiles, follows, purchases, likes, views, payouts` と `myProfile`（無ければ null）、`upsertMyProfile(p)`, `follow(authorId)/unfollow`, `isFollowing(authorId)`, `purchase(articleId, price)`（重複購入不可）, `hasPurchased(articleId)`, `toggleLike(articleId)`, `hasLiked`, `recordView(articleId)`（同一セッションで同じ記事は1回だけ）, `requestPayout(amount)`, 集計 `earningsFor(authorId)`（売上合計・件数・受取見込み・振込済み・振込可能額）, `followerCount(authorId)`（`followerBase + 実フォロー数`）, `likeCount(articleId)`, `purchaseCount(articleId)`。
- 記事の公開・編集・削除は従来の `board.addUserArticle/updateUserArticle/removeUserArticle`。新規公開時に `authorId = myProfile.id`、`publishedAt` を付与。**有料記事の公開はプロフィールの必須項目（名前・肩書・資格またはチーム名のどちらか）が埋まっているときだけ可**（未設定なら編集画面へ誘導）。
- 自分の記事は購入不要で全文表示。自分の記事には「参考になった」を押せない。

## 5. 画面仕様（`components/CoachLab/`）

共通：画面の外枠は他画面と同じ `.app` ＋ `header`（`fpback`／`brand`／`tag`）。PCはコンソールシェル内、モバイルは単一カラム。**モバイルの他画面は一切変更しない。**

### 5-1. 探す（既定）
- 上部：検索ボックス（プレースホルダ「記事・指導者を検索（例：ビルドアップ、S級、〇〇FC）」）と切替 **[記事 | 指導者]**。
- チップ列（記事）：カテゴリ（すべて／練習法／コンディション／戦術／チーム運営）、価格（すべて／無料／有料）、タグ（候補から）。チップ列（指導者）：資格（プルダウン）、地域、役割。
- 記事一覧：PCは3列カードグリッド、モバイルは縦リスト。カード＝カテゴリチップ／タイトル（2行まで）／リード（2行まで）／下段に著者（頭文字アバター・名前・**最上位の資格バッジ1つ**・チーム名）／右下に価格（「無料」または「¥500」）・参考になった数・読了n分。有料は薄いライム縁取り。
- 指導者一覧（切替時／または上部の「指導者ピックアップ」横スクロール）：カード＝アバター／名前／肩書／資格バッジ（最大3）／チーム・地域／フォロワー数・記事数／**フォローボタン**。
- 空状態：「該当する記事がありません。条件を減らすか、指導者で探してみてください。」

### 5-2. フォロー中
- フォロー中の指導者の記事を新着順。空なら「まだフォローしていません」＋おすすめ指導者3件。

### 5-3. 指導者ページ
- ヘッダーカード：アバター（大）／名前／肩書／役割・チーム・地域／資格バッジ一覧（自己申告の注記「資格・経歴は本人の申告に基づきます」を小さく）／フォロワー数・記事数・参考になった合計／**フォロー／フォロー中**ボタン（自分自身のページには「プロフィールを編集」）。
- タブ：**記事**（一覧）／**経歴**（縦のタイムライン：期間・所属・役割。上が新しい）／**自己紹介**（bio）。

### 5-4. 記事ページ
- 上：カテゴリ・タグ・公開日・読了時間。タイトル。著者カード（アバター・名前・肩書・最上位バッジ・フォローボタン。クリックで指導者ページ）。
- 本文：段落。**有料ライン**以降は非表示にし、境界に「ここから先は有料です」ボックス：残り段落数・残り文字数・添付件数・価格・返金可否ラベル・「購入して読む ¥500」ボタン・注意書き「デモのため実際の決済は行われません。」購入後は全文＋「購入済み」表示と、返金可の記事なら購入から24時間以内に限り「返金を申請」リンク。無料記事・自分の記事・購入済みは全文。
- 添付（戦術・練習・セットプレー）は従来どおり（有料ラインより後ろの添付は購入前は件数のみ表示）。
- 下：「参考になった」（トグル・件数）、「この指導者の他の記事」（最大3）、「問題を報告」（toast「報告を受け付けました」）。
- PCは本文幅を最大720pxにし、右に著者カードと購入ボックスを固定表示。モバイルは縦積み。

### 5-5. 書く（コーチのみ）
- 左：自分の記事一覧（下書き／公開中）＋「＋ 新しい記事を書く」。右：エディタ（既存 `ArticleForm` を移植・拡張）。
- 項目：タイトル／カテゴリ／読者の想定（指導者向け・保護者向け・選手向け、任意）／リード（任意）／本文（段落は空行区切り）／タグ（最大5、候補チップ＋自由入力）／添付（既存）／**価格**（無料・¥300・¥500・¥1,000・¥2,000・自由入力 100〜50,000）／**有料ライン**（「全文無料」または「第n段落から有料」をプルダウン。本文の段落数に追随。プレビューに「無料で読める：冒頭n段落、有料部分：n段落・約n字」）／**返金**（購入後24時間以内の返金申請を受け付ける：既定ON）／掲載名の欄は廃止し、代わりに「投稿者：〇〇（プロフィールを編集）」を表示。
- 操作：下書き保存／公開（確認文「コーチラボの読者に公開します。有料記事は購入者が出た後は下書きに戻せず削除もできません（編集は可能です）。」）／保存／削除。購入実績のある記事は「下書きに戻す」「削除」を無効化し理由を表示。未保存ガードは既存の仕組みを維持。
- 有料設定時にプロフィール未完成なら、公開ボタン押下で「有料記事の公開にはプロフィール（名前・肩書・資格またはチーム名）が必要です」を表示し、プロフィール編集へ。

### 5-6. 収益（コーチのみ）
- KPIタイル：売上合計／受取見込み（手数料差引後）／販売数／参考になった合計／フォロワー数。
- 記事別テーブル：タイトル・価格・閲覧・購入数・売上・参考になった。
- 手数料の説明カード：「販売手数料は15%（決済手数料込み）。例：¥1,000の記事が1本売れると受取は¥850。振込手数料はかかりません。売上は毎月末に自動で振り込まれます（1,000円未満は翌月に繰り越し）」。
- 振込：振込可能額（受取見込み − 振込済み）、「振込を申請する」（¥1,000未満は不可）。デモでは申請記録を残しトースト。

### 5-7. プロフィール（コーチのみ）
- 名前／肩書（例「中学クラブ監督・JFA A級」）／役割／チーム名／地域／資格（複数選択チップ）／自己紹介（〜400字）／経歴（行の追加・削除：期間・所属・役割）。保存で `upsertMyProfile`。

### 5-8. コンソールのサブナビ（PCレール）
- コーチ：探す／フォロー中／書く／収益／プロフィール。選手・保護者：探す／フォロー中。`useConsoleSubnav` の anchor は `"articles"`。

### 5-9. 入口の権限
- 選手・保護者のホーム（3タイル）は変更しない。ただしレール（選手用）にコーチラボは出さない（現状どおり）。選手が読む導線は本MVPでは不要（将来）。

## 6. シードデータ（`lib/coachlab.ts`）

指導者6名（全員架空。実在の人物・チーム名を使わない）：
1. ALFA編集部（headline「ALFA FOOTBALL運営」／資格なし／既存seed記事のうち2本）
2. 中学クラブ監督（東京・JFA A級・元大学サッカー部／経歴3件／有料記事あり）
3. スクール代表（神奈川・元プロ選手・JFA B級／有料記事あり）
4. 高校部活動顧問（千葉・教員免許・JFA C級／無料記事）
5. GKコーチ（大阪・GKレベル2・JFA C級／有料記事）
6. トレーナー（愛知・アスレティックトレーナー／コンディション記事）
各 `followerBase` は 30〜420 のばらつき。既存 seed 5本＋新規5本を上記に振り分け（有料3本）。フォロー・購入・参考になったの初期値は空（ユーザー操作で増える）。

## 7. デザイン指針（noteと差別化）

- 色・部品はアプリ既存のコンソールトーン（白いレール、ネイビー文字、ライムのアクセント、角丸カード、細い罫線）を使う。noteの緑・セリフ見出し・「スキ」ハート・左本文＋右サイドバーの記事一覧構成は使わない。
- 一覧は**資格バッジと所属を前面に出したカード**（指導者の信用が見える設計）。検索の切替は「記事｜指導者」の2軸。
- 有料ラインは本文中の境界ボックス（グラデーションのぼかしで「続きが隠れている」表現はしない。残り段落数・添付数を数字で示す）。
- 絵文字アイコンは使わない（`icons.tsx` のSVG）。
- 文字サイズ・余白は既存の `.libapp/.artapp` の PC/モバイル基準に合わせる。

## 8. 実装の分割（Workflow）

- **Phase A（データ・状態・入口）**：`lib/coachlab.ts`、`lib/articles.ts` の型拡張、`lib/storage.ts` の load/save、`CoachLabProvider`、`icons.tsx` の `IconLab`、名称変更（HomeMenu タイル／ConsoleShell レール／SheetManager のメニュー項目と一覧タイトル文字列のみ）、`AppRoot` の分岐を新画面へ（仮の空画面でも可）。`npx tsc --noEmit` と `npm run build` を通す。
- **Phase B（画面・CSS）**：§5 の全画面と `.cl-*` CSS。旧 `ArticlesScreen`/`OwnArticleList`/`ArticleForm` を ConsoleScreens から削除。`tsc`/`build` を通し、ブラウザで PC(1440) とモバイル(390) を確認。
- **Phase C（レビュー・修正）**：opus5 がコードと画面をレビュー（仕様適合・後方互換・CSSブロック規約・noteとの類似・アクセシビリティ）。指摘を反映。

## 9. 受け入れ基準

1. `grep -rn "お役立ち記事" components lib app` が0件（コメントも含めて置換）。
2. 旧データ（`soccer_tactics_user_articles_v1` に authorId 無しの投稿）が読める・編集できる。
3. 有料記事を購入前は有料ライン以降が非表示、購入後は全文。リロード後も購入・フォロー・参考になったが保持される。
4. 「S級」「〇〇FC」（シードのチーム名）で指導者検索が当たる。
5. 収益画面の数値が purchases から正しく集計され、手数料内訳が `splitSale` と一致する。
6. `npx tsc --noEmit`・`npm run build` が通る。`python3` で globals.css の波括弧対応と `@media` の個数（変更前と同じ）を確認。
7. SheetManager.tsx の変更は「文言」と「メニュー項目の遷移先」に限る。
8. モバイルの他画面（ホーム・戦術ボード・ノート・チーム運営・チャット）のDOM・CSSに変化がない。
