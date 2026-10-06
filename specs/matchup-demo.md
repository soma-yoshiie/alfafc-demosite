# 練習試合（相手探し・申し込み・チャットでの調整）のデモ実装

2026-10-06。正本はこのファイル。背景は ` 分析/ALFA_FOOTBALL_練習試合マッチングとプラットフォーム化の提案_2026-10-06.pdf`（機能の形・データの形）。

## 0. 依頼（ユーザーの言葉）

- 「練習試合の探すところの30km以内などの選択肢は絞り込みに隠せるようにして」
- 「出てくる相手の情報は名前、日付、場所、所属リーグ、対戦回数のみ（その他は詳細表示されるように。申し込むを押しても詳細表示に飛ぶようにして。詳細表示の下に申し込むボタンでそれを相手が了承するとチャットに移動するイメージ）」
- 「uiは今までのalfafootballと合わせて、ai感が出ないように。また無機質すぎないようにクオリティ高く実装して」
- 「練習試合申し込みはその他の欄に追加して」

統括の読み：サーバーが無いので、相手チームと募集はデモのデータ（ブラウザ内保存）で動かす。「相手の了承」はデモとして数秒後に自動で起きる。了承されると相手チームとのスレッドがチャットの「メッセージ」にでき、そこで調整する。選手・保護者には見せない（スタッフだけの機能）。

## §1 画面と入口

- `ScreenName` に `"matchup"`（練習試合）。`AppRoot` の switch に追加。`ConsoleShell` の `STAFF_MTAB` の「その他」の `screens` に `"matchup"` を足す。
- 入口（スタッフだけ）：
  - スマホ `OtherHub.tsx`：コーチラボの行の**上**に `MenuRow`「練習試合」（説明「相手チームを探して申し込む」、アイコン `IconMatchup`）。
  - PC レール（`ConsoleShell.tsx`）：「その他」の区画の先頭に「練習試合」（`IconMatchup`）。
  - `IconMatchup`：`components/icons.tsx` に追加。レールのほかのアイコンと同じ 24／線幅 2 の単色の線画。交差する 2 本の旗（`IconNoteMatch` の形を 24 に直したもの。色は `currentColor`）。
- 選手・保護者には入口を出さない。`MatchupScreen` は `board.auth.role !== "coach"` なら `board.setScreen("home")` へ戻す。
- 画面のクローム：
  - PC：`div.app.mtapp` ＋ `<header>`（`.setapp` と同じ白いヘッダー。`.logo`「練習試合」＋チーム名の `.tag.team`）。本文は `.mt-pc`（§4）。
  - スマホ：`MobileHeader title="練習試合" onBack={() => board.setScreen("other")}`。右のアクションは「探す」のとき `IconFilter`（label「絞り込み」）、「自分の募集」のとき `IconPlus`（label「募集する」、primary）。ヘッダー直下にセグメント（`ChatHome.tsx` 140 行付近の「お知らせ｜メッセージ」と同じ部品・クラス。`badgeClass:"chatsegbadge"`）：「探す」｜「自分の募集」（申し込みが届いていれば件数のバッジ）。

## §2 データ（`lib/matchup.ts`）

```ts
export interface OpponentTeam {
  id: string;            // "t-midoridai" など
  name: string;          // 「みどり台SC」（試合記録の opponent と同じ表記にする。対戦回数をそこから数える）
  area: string;          // 「横浜市緑区」
  league: string;        // 所属リーグ「市リーグ 1 部」「県 2 部」「地区リーグ」
  ageGroups: string[];   // ["U-13", "U-14"]
  ground: string;        // ホームグラウンド「みどり台第2グラウンド（人工芝）」
  distanceKm: number;    // 目安の距離（市区町村の代表点から）
  cancelCount: number;   // 直前の中止の回数（過去 1 年）
  staff: { name: string; role: string }; // チャットの相手「田中」「監督」
  note?: string;         // チームの一言（詳細だけに出す）
}
export type TimeBand = "am" | "pm" | "all";
export interface MatchupPost {
  id: string;
  teamId: string;        // 募集したチーム。自分のチームは "me"
  dates: string[];       // "YYYY-MM-DD"（複数可。近い順）
  timeBand: TimeBand;    // 午前（9:00〜12:00）／午後（13:00〜17:00）／終日
  venue: { kind: "own" | "either" | "away"; name?: string; fee: "free" | "split" | "ask" };
  ageGroup: string;      // "U-13"
  format: 8 | 11;
  periods: number;       // 本数
  minutes: number;       // 1 本の分
  referee: "mutual" | "host" | "arrange";  // 相互／帯同（主催が出す）／相談
  levelHint: string;     // 「同じくらい」「強め」「ゆるめ」
  note?: string;         // 相手に伝えること
  visibility: "30" | "50" | "all";  // 自分の募集だけが使う（見せる相手：30km／50km／制限なし）
  status: "open" | "closed";
  createdAt: number;
}
export interface MatchupRequest {
  id: string;
  postId: string;
  fromTeamId: string;    // 申し込んだチーム（自分なら "me"）
  message: string;
  status: "pending" | "accepted" | "declined";
  ts: number;
  /** デモ：相手が承諾する予定時刻（自分が申し込んだときだけ。来たら accepted にしてチャットを作る） */
  acceptAt?: number;
  /** 承諾でできたチャットの会話キー "opp:<teamId>" */
  threadKey?: string;
  /** 申し込んだ日 "YYYY-MM-DD"（募集の日にちが 2 つ以上のとき選ぶ。無ければ今日以降で最初の日） */
  date?: string;
}
export interface MatchupFilter {
  distance: 10 | 30 | 50 | 0;     // 0 = 指定なし。既定 30
  ageGroups: string[];            // 空にしない（最後の 1 つを外したら全部に戻す）
  format: 8 | 11 | 0;             // 0 = どちらも
  when: "weekend" | "month" | "next" | "all";  // 今週末／今月／来月／すべて。既定 all
  venueOnly: boolean;             // 相手の会場で開ける募集だけ
}
export interface MatchupStore { v: 1; teams: OpponentTeam[]; posts: MatchupPost[]; requests: MatchupRequest[]; seededAt: number }
```

- 保存：`localStorage` `soccer_tactics_matchup_v1`（`MatchupStore`）。絞り込みは `soccer_tactics_matchupfilter_v1`、PC の絞り込み列の開閉は `soccer_tactics_mtside_v1`（`calside` と同じ作法）。
- `loadMatchupStore()`：無ければ `seedMatchupStore(today)` を作って保存する。保存済みでも、相手の募集（`teamId !== "me"`）の日付がすべて過ぎていたら相手と募集を `seedMatchupStore(today)` で作り直す（自分の募集と申し込みは残し、募集が無くなった申し込みだけ落とす。`seededAt` を更新）。`resetAppData` の対象（接頭辞が `soccer_tactics_` なので自然に消える）。
- `matchCountWith(teamName, matches)`：`team.team.matches` のうち `opponent.trim() === teamName` の件数（**対戦回数はここから数える**。デモの相手の名前は試合記録の相手と同じ表記にする）。
- 絞り込み：`filterPosts(posts, teams, filter, today)`。距離は `distanceKm <= distance`、年代は `ageGroups` に含まれる、人数制、日程（weekend＝今日から次の日曜まで、month＝今月、next＝来月）、会場（`venue.kind !== "away"`）。並びは近い順（距離）→ 日付。
- 過ぎた日付：`upcomingDates(post, today)`（今日以降の日だけ・近い順）を、一覧のカード・詳細の「日にち」・承諾の文の最初の日・並びに使う。相手の募集は今日以降の日が 1 つも無ければ一覧に出さない。
- 日付の表示：`fmtEventDate`（homeData.tsx）と同じ「10/18(土)」。複数は「10/18(土)・10/25(土)」、3 つ以上は「10/18(土) ほか 2 日」。

### 2-1 デモのシード（`seedMatchupStore`）

相手チーム 8 つ（名前は試合記録のデモの相手と同じ表記）。距離・リーグ・年代・グラウンド・中止回数・スタッフは次のとおり。

| id | name | area | league | ageGroups | ground | km | cancel | staff |
|---|---|---|---|---|---|---|---|---|
| t-midoridai | みどり台SC | 横浜市緑区 | 市リーグ 1 部 | U-13, U-14 | みどり台第2グラウンド（人工芝） | 4 | 0 | 田中・監督 |
| t-higashigaoka | 東ヶ丘少年団 | 横浜市青葉区 | 地区リーグ | U-12 | 東ヶ丘小学校グラウンド | 6 | 0 | 佐々木・代表 |
| t-shirasagi | 白鷺FC | 川崎市宮前区 | 地区リーグ | U-13 | 白鷺公園グラウンド（土） | 9 | 1 | 山口・コーチ |
| t-aoba | 青葉SC | 横浜市都筑区 | 市リーグ 2 部 | U-13, U-14 | 都筑スポーツ広場（人工芝） | 14 | 0 | 鈴木・監督 |
| t-kohoku | 港北ユナイテッド | 横浜市港北区 | 市リーグ 1 部 | U-13 | 港北第3グラウンド | 17 | 0 | 松本・監督 |
| t-takasago | 高砂フットボールクラブ | 町田市 | 県 2 部 | U-13, U-15 | 高砂市民グラウンド（人工芝） | 22 | 0 | 高橋・コーチ |
| t-cosmos | コスモスJFC | 相模原市南区 | 県 1 部 | U-14, U-15 | 相模原ふれあいグラウンド | 31 | 2 | 井上・監督 |
| t-sagamihara | 相模原ヴィクトリー | 相模原市中央区 | 県 3 部 | U-15 | 淵野辺スポーツ広場（土） | 38 | 0 | 岡田・代表 |

募集（相手の分。日付は「今日」から数えた次の土曜を S0 として相対で作る）：

| teamId | dates | timeBand | venue | ageGroup | format | periods×min | referee | levelHint | note |
|---|---|---|---|---|---|---|---|---|---|
| t-midoridai | S0+7 | am | own・free | U-13 | 11 | 3×20 | mutual | 同じくらい | 駐車場 20 台。雨天は前日 18 時に判断します。 |
| t-aoba | S0+14, S0+21 | pm | either・split | U-13 | 11 | 2×25 | mutual | 同じくらい | 会場は相談で決めましょう。 |
| t-kohoku | S0+7 | pm | own・free | U-13 | 11 | 3×20 | host | 強め | 人工芝ではなく土のグラウンドです。 |
| t-takasago | S0+21 | am | own・free | U-13 | 11 | 4×15 | mutual | 強め | 終了後に 15 分の紅白戦も可能です。 |
| t-shirasagi | S0+1（日） | am | own・ask | U-13 | 11 | 2×25 | arrange | ゆるめ | 審判は相談させてください。 |
| t-higashigaoka | S0+14 | am | own・free | U-12 | 8 | 4×15 | host | 同じくらい | 8 人制です。 |
| t-cosmos | S0+28 | pm | away・free | U-14 | 11 | 3×20 | mutual | 強め | そちらの会場でお願いできると助かります。 |
| t-sagamihara | S0+28, S0+35 | all | own・split | U-15 | 11 | 2×30 | mutual | 同じくらい | （なし） |

自分の募集 1 件（`teamId:"me"`）：dates S0+14、am、own・free・name「アルファラス第1グラウンド」、U-13、11、3×20、mutual、同じくらい、visibility "30"、note「駐車場は 15 台まで。」。これに届いた申し込み 1 件：`fromTeamId:"t-kohoku"`、message「11 人制 20 分 3 本で希望です。審判は 1 本こちらで出せます。」、pending、ts＝今日の 9:12。

## §3 状態と動き（`components/matchup/MatchupProvider.tsx`）

`AppFlow.tsx` の `ProfileProvider` の内側に置く（`useBoard`／`useTeam` が要る）。公開する API：

```ts
interface MatchupCtx {
  teams: OpponentTeam[]; posts: MatchupPost[]; requests: MatchupRequest[];
  filter: MatchupFilter; setFilter(f: MatchupFilter): void;
  addPost(p: Omit<MatchupPost, "id" | "teamId" | "status" | "createdAt">): void;
  closePost(id: string): void;
  apply(postId: string, message: string, date?: string): void;  // 自分 → 相手の募集（date＝日にちが 2 つ以上のときに選んだ日）
  accept(requestId: string): void;                      // 相手 → 自分の募集（承諾）
  decline(requestId: string): void;
  myRequestFor(postId: string): MatchupRequest | undefined;
  pendingIncoming: MatchupRequest[];                    // 自分の募集に届いた pending
  /** 承諾でチャットができたとき、その会話キーを一度だけ知らせる（MatchupScreen が開いていれば移動に使う） */
  lastAccepted: { key: string; teamId: string; at: number } | null;
}
```

- `apply`：`MatchupRequest` を pending で作り、`acceptAt = Date.now() + 4000`（デモ）。トースト「申し込みを送りました。相手が承諾するとチャットで相談できます」。
- デモの承諾：Provider が 1 秒ごとに `acceptAt <= now` の pending を `accepted` にし、§5 のとおりチャットの会話を作る。トースト「{チーム名}が申し込みを承諾しました。チャットで相談できます」。`lastAccepted` を更新。再読み込みしても `acceptAt` は保存されているので、戻ったときに処理される。
- `accept`（自分の募集への申し込みを承諾）：`accepted` にして §5 のチャットを作り、`lastAccepted` を更新。自分の募集は `closed` にする（1 件で埋まる前提）。トースト「承諾しました。チャットで相談できます」。
- `decline`：`declined`。トースト「辞退しました」。
- 学校区分が変わったら（`stage` が依存の `useEffect`）、`loadMatchupFilter` と同じ検査（今の区分の年代に 1 つも合わなければ年代だけ既定に戻す）を通して保存する。
- 1 つの募集に自分が出せる申し込みは 1 件（pending／accepted があれば「申し込み中」「承諾済み」表示）。

## §4 画面（`components/matchup/MatchupScreen.tsx` ほか）

部品は `components/matchup/` に分ける：`MatchupScreen.tsx`（クローム・セグメント・ペイン）、`FindPanel.tsx`（絞り込みの中身）、`PostList.tsx`（相手の募集の一覧）、`PostDetail.tsx`（詳細＋申し込み）、`MyPosts.tsx`（自分の募集の一覧と届いた申し込み）、`PostForm.tsx`（募集する）。`TeamHub.tsx` の `Sheet`（266-300 行目。scrim＋sheet＋grabzone、PC は pane）を `components/team/Sheet.tsx` に移して export し、TeamHub と練習試合の両方から使う（見た目・挙動は変えない）。

### 4-1 絞り込み（「30km 以内」などを隠せるように）

- PC：本文 `.mt-pc` は 3 列のグリッド `184px 360px minmax(0,1fr)`（絞り込み｜一覧｜詳細。サッカーノートのスタッフの提出と同じ寸法）。絞り込み列 `.mtside` はカレンダーの `.calside` と同じ：上に「‹ 絞り込みを隠す」、隠すと列が消えて一覧の上に「絞り込み」のテキストボタン（`.calshow` と同じ見た目）が出る。開閉は `soccer_tactics_mtside_v1` に保存。
- スマホ：絞り込みは一覧に出さず、ヘッダー右の「絞り込み」（`IconFilter`）で下からのシート（`Sheet`）に出す。一覧の上に今の条件を 1 行（`.mt-filterline`。例「30km 以内・U-13・11 人制」。指定なしなら「すべての募集」）。
- 中身（`FindPanel`）は PC とスマホで同じ部品。項目は上から：**距離**（10km／30km／50km／指定なし。ラジオ風の 1 列）、**年代**（チェック。見出しの右の「すべて選択」は全部そろっていないときだけ出す。最後の 1 つを外すと全部にチェックが戻り、空にはならない）、**人数制**（8 人制／11 人制／どちらも）、**日程**（今週末／今月／来月／すべて）、**会場**（トグル「相手の会場で開ける募集だけ」）。見た目は `CalFilterPanel`（`.calfilterpanel-sec`／`.calfilterpanel-sech`／`.calfilterpanel-all`、チェック 16px・行 24px。TeamHub.tsx の `CalFilterPanel` を読んで同じクラスと構造を使う）に合わせる。末尾の「条件をもどす」のテキストボタンは、条件が既定のときは出さない。
- 既定：距離 30km、年代＝学校区分ごとの選択肢（中学＝U-12〜U-15、小学＝U-10〜U-12、高校＝U-15〜U-18。中学は受け入れ基準 9 のため U-12 を含める）を**最初は全部チェック**、人数制どちらも、日程すべて、会場トグル OFF。

### 4-2 一覧（`PostList`）：出す情報は 5 つだけ

カード `button.mt-card`（全体が押せる。`.evcard`／`.recrow` と同じ白いカード・1px `--outline`・`--r-lg`・スマホ 12px／PC 10px の余白）：

- 1 行目：**チーム名**（15px・700）… 右端に小さく「申し込む ›」（`.mt-apply`。`--accent`・12px・700。押しても詳細へ。独立したボタンにはしない＝カードと同じ onClick）。申し込み中／承諾済みのときは「詳細 ›」
- 2 行目：**日付**（今日以降の日だけ。「10/18(土)」。複数は「・」で。3 つ以上は「ほか N 日」）・**場所**（`venue.name` か、own なら相手のグラウンド名、either なら「会場は相談」、away なら「こちらの会場」）。12px・`--mut`。
- 3 行目：**所属リーグ**（`.mt-tag`。12px・1px `--outline`・`--r-sm`）・**対戦回数**（`.mt-tag`。「対戦 N 回」。0 なら「初対戦」）。
- これ以外（距離・年代・人数制・本数・審判・費用・中止の回数・一言）は一覧に**出さない**。
- 申し込み済みは 1 行目の左に小さな点つきのラベル「申し込み中」／「承諾済み」（`.mt-state`。`--accent`）。
- 0 件：`.empty-msg`「条件に合う募集はありません。絞り込みをゆるめるか、自分の募集を出してみてください。」
- 並び：近い順。一覧の上（スマホは `.mt-filterline` の下、PC は列の上）に「N 件・近い順」（12px・`--mut`）。

### 4-3 詳細（`PostDetail`）

- PC：右の列（`.mt-detail`）。何も選んでいないときは `.empty-msg`「募集を選ぶと詳しい内容が出ます。」。スマホ：全画面（`MobileHeader title={チーム名} onBack`＝一覧へ）。
- 上：チーム名（18px・700）、その下に `area`・`league`・年代（12px・`--mut`）。対戦回数と中止の回数は `.mt-tag` で「対戦 N 回」「直前の中止 N 回」（0 なら「直前の中止なし」）。
- 「募集の内容」（`.mt-sec`。見出し 12px・`--mut`・700）：`dl.mt-kv`（行＝`dt` 12px・`--mut` ／ `dd` 14px。`.phubkv-row` と同じ 1px の罫で区切る）。行：日にち／時間帯（午前（9:00〜12:00）など）／会場（名前＋「相手の会場」「相談して決める」「こちらの会場」。自分の募集は向きが逆で「自分の会場」「会場は相談」「相手の会場」）／費用（無料／会場費を折半／相談）／年代／人数制／本数と時間（「20 分 × 3 本」）／審判（相互（各 1 本ずつ）／主催が出す／相談）／レベルの目安／相手に伝えること（あれば）。
- 「チーム」：`dl.mt-kv`：活動地域／所属リーグ／年代／ホームグラウンド／距離の目安（「約 14km」）／最近の対戦（試合記録から最新 2 件「9/21 勝 2-1」。無ければ行を出さない）／チームの一言（`note`）。
- 下（`.mt-detail-foot`。スマホは画面の下に固定、PC は内容の末尾）：
  - 未申し込み：今日以降の日にちが 2 つ以上あるときは先頭に日にちの選択（`hub/common` の `Seg`＝`.phubseg`。ラベル「申し込む日にち」。既定は最初の日。選んだ日を `apply` の `date` に渡す）。続けて `textarea`「相手への一言（任意）」（1 行の placeholder「例）11 人制 20 分 3 本で希望です」）＋ `button.st-btn`「申し込む」。押すと `apply` → ボタンが「申し込み中」の表示（`.mt-pending`：点＋「申し込み中。相手が承諾するとチャットで相談できます」）に替わる。
  - 承諾済み：`.mt-accepted`「承諾されました」＋ `button.st-btn`「チャットで相談する」→ §5 の会話を開く。
  - 自分の募集は詳細に出さない（自分の募集は §4-4）。

### 4-4 自分の募集（`MyPosts`）と募集する（`PostForm`）

- 一覧：カード（`.mt-card`）に 1 行目「募集中」／「締め切り」のラベル＋日付、2 行目 会場・年代・人数制・本数、3 行目 「申し込み N 件」（pending の数。0 なら「まだ申し込みはありません」）。締め切りの募集は、承諾した相手がいれば「{チーム名}と決定」、いなければ 3 行目を出さない。押すと詳細（PC 右の列／スマホ全画面）：募集の内容（§4-3 と同じ `dl.mt-kv`）＋「届いた申し込み」の一覧（チーム名・所属リーグ・対戦回数・一言・時刻。各行の右に `st-btn`「承諾」と `st-btn ghost`「辞退」。承諾済みの行はボタンの左に「承諾しました」（`.mt-req-done`）と「チャットで相談する」）＋「募集を締め切る」（テキストボタン・`--danger`・confirm）。
- 「＋ 募集する」：PC は右の列にフォーム、スマホは下からの `Sheet`。項目（上から）：日にち（`input type="date"`。「＋ 日にちを足す」で最大 3 つ）／時間帯（午前・午後・終日の `.toolseg`）／会場（自分の会場・会場は相談・相手の会場 の 3 択の `.phubseg`。自分の会場なら会場名の入力。placeholder「例）アルファラス第1グラウンド」）／費用（無料・会場費を折半・相談）／年代（学校区分に合う U-xx の select）／人数制（8・11）／本数と 1 本の分（number 2 つ。既定 3 と 20）／審判（相互・主催が出す・相談）／レベルの目安（同じくらい・強め・ゆるめ）／見せる相手（30km 以内・50km 以内・制限なし）／相手に伝えること（textarea）。末尾 `st-btn`「募集を出す」。必須は日にち 1 つ以上と年代。保存後はトースト「募集を出しました」で自分の募集の一覧へ。
- デモなので、自分の募集に新しい申し込みが自動で届くことはない（シードの 1 件だけ）。

### 4-5 見た目の約束（「AI 感」を出さない）

- 既存の部品と寸法を使う：ヘッダー（`.setapp` と同じ）、セグメント（`.mseg`）、カード（`.evcard` の白・1px・`--r-lg`）、絞り込み（`.calside`／`.calfilterpanel-*`）、行（`.phubkv-row` の罫）、ボタン（`.st-btn`／`.st-btn.ghost`）、タグ（12px・1px `--outline`・`--r-sm`）、空のとき（`.empty-msg`）。
- 色はトークンだけ。アクセントは青（`--accent`）だけ。緑・グラデーション・影・大きなアイコン・絵文字・「！」・装飾の帯・「おすすめ」「AI」などの文言は使わない。
- 文字：本文 14px、補足 12px、見出し 15〜18px。全角と半角の間に半角スペース（既存と同じ）。ラベルは短い名詞、説明は 1 行。
- 空のとき・申し込み後・承諾後の文言は上のとおり。トーストは既存の `board.toast`。
- CSS は `mt-*`。基底（`hp-*`／`st-*` の後ろ）＋ PC reset（`@keyframes wdialogin` の直前）＋ `(pointer: coarse)` の 44px 復元。@media は 9 本のまま。1 本目の PC ブロックは編集しない。

## §5 チャットとのつながり

- 会話キー `"opp:<teamId>"`（相手チームのスタッフとの会話。スタッフだけが見る）。送信者：自分＝`"coach"`、相手＝`"opp:<teamId>"`（`fromName`＝相手のスタッフ名、`fromRole`＝役割）。
- `lib/chat.ts`：
  - `isOppFrom(from)`／`isOppKey(key)`（`opp:` 判定）。`isCounterpart` は staff 側で `isMemberFrom(from) || isOppFrom(from)`。
  - `oppSummaries(messages, reads)`：`opp:` の会話を `dmSummaries` と同じ形（`key, teamId, last, unread`）で返す。
  - `staffUnreadTotal` に `opp:` の未読も足す。
- `ChatHome.tsx` の `MessagesView`（スタッフ）：`dmSummaries` と `oppSummaries` を最新の発言順に混ぜて並べる。相手チームの行は `.convavatar` に「対」、`.convname` の右に小さなタグ「対戦相手」（`.convtag`。12px・1px `--outline`）、名前は `OpponentTeam.name`（`useMatchups().teams` から）、プレビューは同じ。押すと `openDm` と同じ経路（PC は `onOpenDm(key)`、スマホは `board.openSheet({type:"chat", chatTo:key})`）。検索は名前と本文。「新しいメッセージ」の選手の一覧には相手チームを出さない。
- `ChatScreen.tsx`（PC）：`PaneMemory.dmPid` は選手 id か会話キー（`opp:` で始まる）のどちらも入る。`opp:` のときは中のペインの見出しをチーム名＋「対戦相手」にし、`ChatThread to={key}` を出す。
- `ChatThread.tsx`：`key` が `opp:` のときは、上の帯を「相手チームのスタッフとのやり取りです。選手・保護者には見えません」（`.chatguard`）にし、`counterpart` は `OpponentTeam.staff`（名前・役割）にする。`send()` の `startsWith("p:")` の制限を `p:` か `opp:` に広げる。既読（`markChatRead(key,"staff")`）はそのまま。
- `SheetManager.tsx` の `ChatSheet`：`to` が `opp:` のときは `title`＝チーム名、`subtitle`＝「対戦相手・{league}」。
- 承諾でできる会話（`MatchupProvider`）：
  - 自分が申し込んで相手が承諾：相手から 1 通「申し込みありがとうございます。{M/D(曜)} {時間帯}、{会場}でお願いします。集合時間や審判の分担はここで相談しましょう。」（日は申し込みで選んだ日。無ければ今日以降で最初の日。会場が相談（`either`）のときは「申し込みありがとうございます。{M/D(曜)} {時間帯}でお願いします。会場と集合時間、審判の分担はここで相談しましょう。」）（`board.sendMessage({ to:"opp:<id>", from:"opp:<id>", fromName, fromRole, text }, { toast:false })`）。
  - 自分の募集に来た申し込みを承諾：相手から 1 通「承諾ありがとうございます。{M/D(曜)}、よろしくお願いします。集合時間と審判の分担を決めましょう。」
  - 会話を開く：`saveChatSeg("msg")` → PC は `board.setScreen("chat")` ＋ ChatScreen が `lastPane.dmPid = key` になるよう `board.openSheet({type:"chat", chatTo:key})`（PC の ChatSheet は閉じてペインに出す既存の作法があればそれに従う）。スマホは `board.setScreen("chat"); board.openSheet({type:"chat", chatTo:key})`（HomePanels のメッセージの行と同じ順）。
  - 「チャットに移動」：`MatchupScreen` がその募集の詳細を開いているときに `lastAccepted` が来たら、上の経路で会話を開く。開いていなければトーストだけ。
- 選手・保護者：`opp:` の会話は一覧に出ない（`MessagesView` の選手側は自分の 1 対 1 だけ）。ホームのタイムライン（`useHomeTimeline`）には `opp:` のメッセージを**入れない**（`isMemberFrom` だけを使っているので自然に入らないことを確かめる）。

## §6 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. スタッフ：スマホの「その他」に「練習試合」の行、PC レールの「その他」に「練習試合」。選手には出ない。
3. 探す：PC は左 184px の絞り込み列（隠せる）、一覧（360px）、右に詳細。スマホは一覧の上に条件の 1 行、ヘッダー右の「絞り込み」で下からシート。
4. 一覧のカードに出るのは チーム名・日付・場所・所属リーグ・対戦回数 だけ（距離や本数は出ない）。「申し込む ›」を押しても詳細が開く。
5. 対戦回数は試合記録から数える（みどり台SC・青葉SC・高砂フットボールクラブ・白鷺FC・東ヶ丘少年団・コスモスJFC は 1 回以上、港北ユナイテッド・相模原ヴィクトリーは「初対戦」）。
6. 詳細に募集の内容（日にち・時間帯・会場・費用・年代・人数制・本数と時間・審判・レベルの目安・伝えること）とチーム（活動地域・所属リーグ・年代・グラウンド・距離・最近の対戦・一言）が出て、下に「申し込む」。押すと「申し込み中」になり、4 秒後にトーストと「承諾されました」＋「チャットで相談する」。詳細を開いたままならチャットへ移動し、相手チームのスレッド（相手からの 1 通）が開く。
7. チャットの「メッセージ」に相手チームの行（「対」のアバター・「対戦相手」のタグ）が出て、未読の数字に数えられる。スレッドの帯は「相手チームのスタッフとのやり取りです。選手・保護者には見えません」。こちらから送れる。選手の画面には出ない。
8. 自分の募集：シードの 1 件に「申し込み 1 件」。詳細で「承諾」するとチャットへ移動して相手の 1 通がある。「募集する」で新しい募集を出せる（日にち・年代が無いと出せない）。
9. 絞り込み：距離を 10km にすると みどり台SC・東ヶ丘少年団・白鷺FC だけ。人数制を 11 にすると東ヶ丘少年団が消える。条件は再読み込みしても残る。
10. 横はみ出しなし（390／1440）。ほかの画面に差分が無い（その他の行、レール、チャットの一覧に相手チームの行が増える分を除く）。

---

## §7 実装時の判断（2026-10-06。以後はここが正）

実装は Sonnet 5.5（WP1 データと器／WP2 詳細・申し込み・自分の募集／WP3 チャット連携／WP4 仕上げ）、レビューは Opus 5.5（仕様・正しさ・CSS・UI と文言の 4 観点。指摘 32 件に反証し 28 件が残存、major 0）。統括が採否を決めて次のとおりにした。

- **採用して直したもの**：過ぎた日付を出さない（`upcomingDates`）／相手の募集がすべて過去になったらシードを作り直す（自分の募集と申し込みは残す）／学校区分を変えたら年代の条件を検査し直す／年代の選択肢は中学 U-12〜U-15（受け入れ基準 9 のため U-12 を含める）・小学 U-10〜U-12・高校 U-15〜U-18／年代は空にできない（最後の 1 つを外すと全部に戻る）／既定の条件では「条件をもどす」を出さない／日にちが 2 つ以上の募集は申し込み欄で日を選ぶ（`MatchupRequest.date`）／会場が「どちらでも」の承諾文は「{日付} {時間帯}でお願いします。会場と集合時間、審判の分担はここで相談しましょう。」／PC の詳細の見出しからアバターを外す／自分の募集の会場の言い方を「自分の会場／会場は相談／相手の会場」に統一、締め切りカードは「{チーム名}と決定」、承諾した行に「承諾しました」／placeholder「例）…」・距離「約 14km」／CSS：coarse の詳細度、選択カードは `--accent-tint`＋`--accent-tint-strong`、「絞り込み」700、「初対戦」のタグは他と同じ見た目、`.mt-kv-row` は足りないときだけ折り返す（PC の dt は 100px）。
- **実装のまま正本を直したもの**：申し込み済みのカードは「詳細 ›」／最近の対戦は「9/21 勝 2-1」／フォームの 3 択は `.phubseg`／`openThread` は空の口でなく最初から実装。
- **見送り**：チャットへ移ったあと練習試合へ戻る道（チャットの戻るは一覧。その他タブから戻れる）／本数の欄の名前の揺れ（フォーム「本数と 1 本の時間」・詳細「本数と時間」は役割が違うので残す）。
- **デモの前提**：相手の承諾は申し込みの 4 秒後に自動（`acceptAt`）。相手チーム・募集はブラウザ内のシード。対戦回数は試合記録の相手名から数える。承諾でできるチャットは `opp:<teamId>` の会話で、スタッフだけが見る。
- **検証**：`~/.claude/alfa-verify-tools/p21_verify.js`（42 項目）。
