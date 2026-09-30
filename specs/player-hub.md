# 名簿の刷新と選手の個人ページ（プロフィール・データベース） — 2026-09-30

ユーザー指示（2026-09-30）：

- 選手の名簿から**ありとあらゆるデータにアクセスできる**ようにしたい。デザインも含め UI を刷新する。
- 「編集する」「キャプテンにする」「削除する」の表示は要らない。右上などに**編集のための小さなボタン**を置き、編集画面を開いたときに現れるようにする。
- 左側の選手一覧も**絞り込み**できるようにする（隠せるようにもする。名簿を開いたときは既定で隠れない）。
- 増やす機能：**身長・体重の推移グラフ**／**体力測定のグラフ**／**テスト結果の記録**／**成績表の作成（成績の目標欄。例：評定平均 3.4）**／**進路希望を詳しく**。参考は「Today」（TASUKERU）だが **UI を真似ない**（機能・項目の参考だけ）。
- ダッシュボード撤去で消えた**スタッフから選手のシーズンレポートを開く入口**を、名簿の選手ページから開けるようにする。
- UI のイメージ：絞り込みから選手を選んで個人のページに入ると、**選手のプロフィールページ自体が巨大なデータベース**のように、その中にもメニューがある。
- **選手側に「プロフィール」メニューを新設**してスタッフ側の UI と対応させる（スマホでは下部タブの**右から 2 番目**）。
- 項目ごとに選手・スタッフのどちらが編集できるかは後で決めるので、**当面どちらも編集できる**状態にする。

調査結果（2026-09-30、Opus 5.5）：`~/.claude/alfa-verify-tools/p13_roster/research/{roster,playerSide,research}.md`。変更前のスクショ：同 `p13_roster/before/`。

## 0. 用語

- **個人ページ（ハブ）**＝`PlayerHub`。1 人の選手の全データを、ページ内メニュー（セクション）で切り替えて見る・編集する部品。スタッフの名簿（PC 右ペイン／スマホの全画面）と、選手側の「プロフィール」画面で**同じ部品**を使う。
- **プロフィール（記録）**＝`PlayerProfile`。新設する別キー `soccer_tactics_profile_v1` に保存する選手ごとの記録（成長・テスト・成績表・進路・基本の補足）。既存の `Player`（`BoardState.players`）は基本情報・体力測定・怪我のまま使う。

## 1. データ（`lib/profile.ts`・`components/ProfileProvider.tsx`）

### 1-1. 置き場と理由

- `PlayerProfile` は **別キー** `soccer_tactics_profile_v1` に `Record<playerId, PlayerProfile>` で保存する（サッカーノートと同じ作法）。理由：`BoardState.players` は共有戦術の取り込み（IMPORT_SHARED）で丸ごと置き換わり、`updatePlayer` は丸ごと差し替えで、300ms デバウンス保存は容量超過を黙って無視する。時系列の記録をそこに足さない。
- 保存は変更のたびに同期で行い、失敗（容量超過）はトーストで知らせる（`saveTeam` の bool 返しと同じ作法）。
- `ProfileProvider`（Context）を `TeamProvider` と同じ階層にマウントし、`useProfiles()` で `{ get(playerId): PlayerProfile, update(playerId, patch), addRecord/updateRecord/removeRecord(...) }` を提供する。存在しない選手 id の記録は読むときに捨てない（名簿から消えた選手の記録は残す。表示しないだけ）。
- 各レコードと `PlayerProfile` に `updatedAt`（ms）と `updatedBy`（"staff:名前"／"player"）を持たせる（編集権限を後で決める材料。画面には各セクションの末尾に小さく「最終更新 M/D 監督」と出す）。

### 1-2. 型（`lib/profile.ts`。既存の `lib/types.ts` は `FitnessTest.standardKey` の追加だけ）

```ts
export type Sex = "male" | "female";
export type TermSystem = "3" | "2";          // 3学期制／2学期制
export type Subject = "jp" | "soc" | "math" | "sci" | "eng" | "music" | "art" | "pe" | "tech";
export const SUBJECTS: Subject[]  // 国語・社会・数学・理科・英語・音楽・美術・保健体育・技術家庭（この順）
export const SUBJECT_LABEL: Record<Subject, string>
export const MAIN5: Subject[] = ["jp","soc","math","sci","eng"]; export const MAIN3 = ["jp","math","eng"]

export interface Measurement { id: string; date: string; height?: number | null; weight?: number | null; sittingHeight?: number | null; note?: string; updatedAt: number; updatedBy: string }
export interface ExamRecord { id: string; name: string; kind: "mid"|"final"|"yearend"|"practice"|"mock"|"other"; date: string; grade: number; term: string /* "1"|"2"|"3"|"前期"|"後期" 等の自由文字列 */;
  scores: Partial<Record<Subject, { score: number | null; max?: number | null; avg?: number | null }>>; rank?: number | null; rankOf?: number | null; deviation?: number | null; judgement?: "A"|"B"|"C"|"D"|"E"|null; targetTotal5?: number | null; note?: string; updatedAt: number; updatedBy: string }
export interface ReportCard { id: string; grade: number; term: string; ratings: Partial<Record<Subject, number | null>> /* 1〜5 */; absent?: number | null; late?: number | null; leftEarly?: number | null; comment?: string; updatedAt: number; updatedBy: string }
export interface GradeGoal { targetAvg?: number | null /* 例 3.4 */; deadlineGrade?: number | null; deadlineTerm?: string; subjectTargets?: Partial<Record<Subject, number | null>>; actions?: string; updatedAt?: number; updatedBy?: string }
export interface Certification { id: string; kind: string /* 英検 等 */; level: string /* 3級 */; date?: string; updatedAt: number; updatedBy: string }
export type SchoolType = "public" | "private" | "national" | "";
export type AdmissionMethod = "general" | "recommend" | "sports" | "single" | "combined" | "undecided";
export type ChoiceStatus = "research" | "planned" | "visited" | "contacted" | "criteria" | "applied" | "passed" | "failed" | "declined";
export interface SchoolChoice { id: string; rank: number; school: string; type: SchoolType; course?: string; method: AdmissionMethod; soccerInfo?: string; criteria?: string; scholarship?: "full"|"partial"|"entrance"|"none"|"unknown"; reason?: string; status: ChoiceStatus; updatedAt: number; updatedBy: string }
export interface CareerActivity { id: string; date: string; kind: "practice"|"selection"|"briefing"|"consult"|"cert"|"other"; school?: string; note?: string; updatedAt: number; updatedBy: string }
export interface Interview { id: string; date: string; participants: ("player"|"parent"|"staff")[]; staff?: string; note: string; updatedAt: number; updatedBy: string }
export interface ActionItem { id: string; text: string; due?: string; owner?: "player"|"parent"|"staff"; done?: boolean; updatedAt: number; updatedBy: string }
export interface Career { direction?: "highschool"|"youth"|"clubyouth"|"other"|""; area?: string; commuteMaxMin?: number | null; dorm?: "ok"|"ng"|"unknown"|""; choices: SchoolChoice[]; activities: CareerActivity[]; interviews: Interview[]; actions: ActionItem[]; wish?: string; parentWish?: string; futureGoal?: string; updatedAt?: number; updatedBy?: string }

export interface PlayerProfile {
  playerId: string;
  birthDate?: string; sex?: Sex; school?: string; termSystem?: TermSystem;
  measurements: Measurement[];      // 成長記録（新しい順に表示。保存順は問わない）
  exams: ExamRecord[];              // 定期テスト・模試
  reportCards: ReportCard[];        // 通知表
  gradeGoal: GradeGoal;             // 成績の目標
  certifications: Certification[];
  fitnessSessions: FitnessSession[];   // 体力測定の測定回の区分（測定日ごとに 1 件。{id:"fs_<date>", date, kind:"school"|"club"|"other", updatedAt, updatedBy}。測定値は Player.fitness）
  career: Career;
  updatedAt: number; updatedBy: string;
  basicUpdatedAt?: number; basicUpdatedBy?: string;   // 基本の補足（生年月日・性別・在籍校・学期制）だけの最終更新。「基本」セクションの「最終更新」に使う（updatedAt は記録の追加・削除でも動く）
}
export function emptyProfile(playerId): PlayerProfile
```

### 1-3. 計算（`lib/profile.ts` に純関数。表示のたびに計算し、保存しない）

- `bmi(height, weight)`（小数 1 桁）。中学生に大人向けの判定語（肥満など）は出さない。参考帯は JFA の目標（FP 19.0〜23.5／GK 20.5〜24.0）を「目安」として薄い帯で描くだけ。
- `growthVelocity(prev, cur)`＝cm/年（間隔 60 日未満は出さない）。年 7cm 以上なら「成長スパートの目安」を小さく添える。
- `ageOnApril1(birthDate, today)`／`ageFromGrade(schoolStage, grade)`（小1=6 … 中1=12・中2=13・中3=14・高1=15…）。生年月日があればそれを優先。
- 全国平均（令和 6 年度 学校保健統計。年齢＝4/1 時点）：男子 12:154.0/45.3、13:161.1/50.5、14:166.1/55.0、15:168.6/59.0、女子 12:152.3/44.4、13:155.0/47.5、14:156.4/49.6、15:157.1/51.1。`nationalAverage(age, sex)`（範囲外は null）。`sex` 未設定は男子で引き、凡例に「（男子の平均）」と書く。
- 通知表：`ratingSum(card, subjects)`、`ratingAverage(card)`＝9 教科合計 ÷ 入力済み教科数…ではなく **9 教科合計 ÷ 9**（未入力は 0 扱いにせず、9 教科そろっていないときは「（n 教科）」と添えて n で割る）。小数第 2 位を四捨五入。`neededSumFor(targetAvg)`＝「小数第 2 位を四捨五入した 合計÷9 が目標以上」になる最小の 9 教科合計（3.4 → 31、3.6 → 32。`ceil(targetAvg×9 − 0.05)` は 3.6〜3.9 で 1 点多くなるので使わない）。
- テスト：`examTotal(exam, MAIN5)`／9 教科合計、平均点との差。
- 体力測定の得点：新体力テスト（12〜19 歳）の項目別得点表（男女）と総合評価（年齢別 A〜E）を `lib/fitnessScore.ts` に定数で持つ（調査報告 §2-1 の表をそのまま。持久走と 20m シャトルランはどちらか一方（両方あればシャトルラン））。`FitnessTest.standardKey?: "grip"|"situp"|"sitreach"|"sidestep"|"endurance"|"shuttle"|"sprint50"|"longjump"|"handball"` を足し、`scoreFor(standardKey, value, sex)`（1〜10）、`totalScore(records, tests, sex)`（80 点満点、8 種目そろわなければ「n 種目」と添える）、`gradeFor(total, age)`（A〜E）。

### 1-4. 体力測定（既存の `Player.fitness` を使う）

- 記録の型は今のまま（`FitnessRecord{testId,value,date}`、id 無し）。`TeamProvider` に **一括追加** `addFitnessRecords(playerId, recs: FitnessRecord[])`（1 回の `updatePlayer`）と、**日付＋種目で削除** `removeFitnessRecordBy(playerId, testId, date)` を足す（既存の index 削除は残す）。
- 既定の種目（`lib/sampleTeam.ts` の DEFAULT）を新体力テストの 8 種目に広げる：握力(kg)・上体起こし(回)・長座体前屈(cm)・反復横とび(点)・20mシャトルラン(回)・50m走(秒, lowerIsBetter)・立ち幅とび(cm)・ハンドボール投げ(m)＋既存の 1000m走(秒, lowerIsBetter, standardKey "endurance")。各 `standardKey` を付ける。**既存データ**：`loadTeam` の正規化で、名前一致（「50m走」「立ち幅跳び／立ち幅とび」「反復横跳び／反復横とび」「上体起こし」「1000m走／1500m走／持久走」）で `standardKey` を補い、無い標準種目は `ft_std_<key>` で末尾に足す（マスタが増えるだけ。記録は触らない）。**足すのは 1 回だけ**：`TeamData.fitnessStdSeeded`（`loadTeam` が立てて保存する。初回シードのチームも最初から立てる）が立っていれば二度と足さない（「印の有無」から推定しない。スタッフが標準種目を全部削除してクラブ独自の種目だけ残しても、読み込みのたびに復活させないため）。
- 種目管理シート（既存）はそのまま。種目に「新体力テストの種目」の印（`standardKey` があれば小さなタグ）を出す。

### 1-5. サンプルデータ（`lib/sampleProfiles.ts`）

- p08 佐藤 蒼空・p10 加藤 朝陽・p01 佐藤 蓮 の 3 人に、成長記録 6 点（2025-04 〜 2026-09、4 か月おき）、テスト 4 回（中1 1学期期末〜中2 2学期中間。5 教科の点と学年平均・順位）、通知表 3 学期分（中1 の 1〜3 学期。9 教科）、目標（p08：評定平均 3.4、期限 中3 2学期、行動 1 行）、検定 1 件、進路（方向・エリア・志望校 3 校・活動 2 件・面談 1 件・アクション 2 件）を入れる。値は固定の直書き（乱数なし）。p08 と p10 の `birthDate`（中2 相当）・`sex: "male"` も入れる。
- p08／p10 の `Player.fitness` に、新しい標準種目（握力・長座体前屈・20mシャトルラン・ハンドボール投げ）の 2 時点を足す（`lib/sampleTeam.ts`。既存の 2 日付 2026-05-16／07-25 に合わせる）。**既存ブラウザへの反映**：`ProfileProvider` の初回マウントで、プロフィールの保存が空で、かつ `soccer_tactics_profile_seed_v1` マーカーが無く、名簿に p08 がいる（デモチーム）ときだけサンプルを入れてマーカーを書く。`resetAppData`（デモデータを入れ直す）でプロフィールとマーカーも消す。体力測定のサンプル追加は `DEMO_SEED_VERSION` を "4" に上げる既存の移行の作法で p08／p10 に足す（すでに同じ testId・date があれば足さない）。

## 2. 画面の入口

### 2-1. スタッフ：チーム運営 › 名簿（`components/TeamHub.tsx`）

- **PC**：名簿タブは 3 列 `[絞り込み列 .rosside 220px | 選手一覧 300px | 個人ページ 1fr]`。絞り込み列は「‹ 絞り込みを隠す」で畳め（`.teamapp.rosside-hidden` で `300px | 1fr`）、畳んだときは一覧の上の「絞り込み」ボタン（`.rosfilterbtn`。何か絞っていれば右上に点）で戻す。開閉は localStorage `soccer_tactics_rosside_v1`（既定＝開いている。`loadNbSideOpen` と同じ作法）。3 列化は名簿タブのときだけ（`.teamapp.rosside-open:has(.teammain)`）。試合記録・出欠タブの 2 列は変えない。1600px 以上の `340px` ルールも名簿タブでは `220px 340px 1fr` にする（既存の `@media (min-width:1600px)` ブロックの中に追記。新しい `@media` は作らない）。
- **スマホ**：一覧の上に `.rostop`（「絞り込み」ボタン＋検索欄）。「絞り込み」→ 下からのシート `RosterFilterSheet`（見出し「表示する選手」＋右上「完了」）。行をタップすると**個人ページを全画面**で開く（下のシートではない）：`rosSel` を立て、`RosterTab` の代わりに `PlayerHub` を `MobileHeader`（タイトル＝選手名、`onBack` で一覧へ）付きで描く。他画面からの `setTeamIntent({tab:"ros", playerId})` もこれで**スマホでも開く**ようになる。
- **絞り込みの中身**（PC 列・スマホのシート共通の `RosterFilterPanel`。提出の `NotebookFilterPanel` と同じ行の文法 `.nbfrow`/`.calchk` を **`.teamapp` でも装飾されるよう** CSS を `.rosfrow` 等の名前で用意する）：
  - 学年（単一。「すべて」＋学年グループ）と グループ（カスタム）：既存の `useGroupFilter("roster")` を共有（単一選択のまま）。削除済みグループ id は試合記録側（TeamHub 414〜419 行）と同じ作法で無効化する。
  - ポジション区分：すべて／GK／DF／MF／FW（単一。`groupOf`）。
  - 状態：すべて／怪我中（`injuries` に status が「治療中／復帰調整中」相当のものがある）／キャプテン。
  - state はスタッフのローカル state（`rosPos`、`rosStatus`）。
  - 一覧の上に選択中の要約 1 行 `.rossel`（「すべて」／「中2 ・ FW ・ 怪我中」。学年・グループはその色の点付き）。
- **一覧**：今の表（PC `.ptable`）と行（スマホ `.prow`）はそのまま使う。学年見出しと並び（学年昇順、同学年は背番号昇順に変える：null は末尾）。PC の一覧末尾の重複した「＋ 新規選手を追加」を外す（ヘッダーの CTA に一本化）。スマホの `.rosviewrow`（選手・保護者の見え方を確認）は残す。
- **右ペイン／全画面**：`PlayerHub playerId={rosSel} viewer="staff"`。`RosPlayerPane`・`PlayerDetailBody`・スマホの `playerDetail` シートは撤去する（`SheetState` の `playerDetail` は残してよいが TeamHub では開かない）。画面幅変化の effect（516〜535 行）は `playerDetail` を扱わなくなるので簡略化。
- **編集**：ハブのヘッダー右上に小さな `IconEdit` ボタン（`aria-label="基本情報を編集"`、PC 32px／スマホ 44px）。押すと既存の `playerForm` シート（PC は右ペインに、スマホは下からのシート）を開く。`playerForm` の末尾に、スタッフのときだけ「キャプテンにする／キャプテンを解除」（`.bigbtn.ghost`）と「この選手を削除」（`.linkdanger`。confirm → `board.deletePlayer` → `team.removePlayerAnswers` → プレビュー解除 → 閉じる。今の 2609〜2624 行の組を移す）を置く。一覧・ハブ本体からは 3 ボタンを消す。
- **シーズンレポート**：ハブのセクション「レポート」に `SeasonReport playerId` をマウントする（§3-9）。

### 2-2. 選手：「プロフィール」画面（新設 `components/ProfileScreen.tsx`）

- `ScreenName` に `"profile"` を足す（`BoardProvider.tsx`）。`AppRoot.tsx` の分岐に `screen==="profile" → <ProfileScreen/>` を足す（書き忘れるとホームが出るので、分岐の網羅を `never` チェックで守る）。
- スマホ下部タブ `PLAYER_MTAB`：ホーム／ノート／チーム／**プロフィール**／その他（右から 2 番目。`target:"profile"`, `screens:["profile"]`）。アイコンは `icons.tsx` に **`IconUser`**（人物 1 人の線画。既存 `IconUsers` と同じ線幅・viewBox）を足す。5 タブになるので `.mtab-item` のラベルは `white-space: nowrap` と `font-size: clamp(11px, 3.1vw, 12px)`（390px では 12px。360px 以下だけ 11px に落ちる。新しい `@media` は作らない）。
- PC レール（選手）：ホーム／サッカーノート／チーム／**プロフィール**／チャット。プロフィール画面はレール直下に**セクションのサブナビ**（`useConsoleSubnav({anchor:"profile", items: セクション})`）を出す（チーム運営と同じ仕組み）。
- 画面：ルート `.app.profapp`。スマホは `MobileHeader title="プロフィール"`（戻る無し。右にヘッダーアクションは無し）→ `PlayerHub playerId={board.auth.playerId} viewer="player" nav="inline"`。PC は `header`（`.brand`「プロフィール」＋`.hdrusr`）→ `PlayerHub ... nav="external"`（サブナビで切替）。`.scroll` の下部タブ分の padding は他画面と同じ作法。
- 選手が自分の基本情報を編集する入口も同じ右上の `IconEdit`。開くのは `PlayerBasicForm`（§3-2）。キャプテン・削除は出さない。

### 2-3. 戦術ボード側からの導線（最小）

- `Bench.tsx` のスマホのタップ（`openSheet({type:"playerDetail"})`）は PC と同じ `setTeamIntent({tab:"ros", playerId})`＋`setScreen("team")` にする（スマホでも個人ページが開くようになったため）。SheetManager の `PlayerDetail`（③）はそのまま残す（他の入口があるため触らない）。

## 3. 個人ページ `PlayerHub`（新設 `components/PlayerHub.tsx`。大きくなるなら `components/hub/*.tsx` に分割）

`PlayerHub({ playerId, viewer: "staff"|"player", nav: "inline"|"external", section?, onSection? })`。`nav="inline"` のときはハブ自身がメニューを持つ（PC＝左の縦メニュー `.phubnav` 160px、スマホ＝ヘッダー下の横スクロールのチップ列 `.phubtabs`、44px）。`nav="external"` のときはメニューを描かず、`section`/`onSection` で親（レールのサブナビ）が切り替える。最後に開いたセクションは state（保存しない）。

**幅が狭いとき**：名簿の 3 列（絞り込み 220｜一覧 300｜個人ページ）は 1024〜1300px 台で個人ページが 250〜500px になり、縦メニュー 160px を置くと本文が潰れる。そこで `PlayerHub` は自分の幅を測り（`ProfileCharts` の `useWidth`。560px 未満で「狭い」、580px 以上で戻る）、狭いときは PC でも縦メニューをやめてチップ列 `.phubtabs` を出し、ルートに `.phub.narrow` を付ける（PC reset で KPI・数値カードを 2 列、種目・テストのカードを 1 列などにする。新しい `@media`・`@container` は使わない）。チップ列は KPI のマスや「シーズンレポートを見る ›」など、チップ以外から切り替えても選択中のチップが見える位置まで横に送る。

### 3-1. ヘッダーカード `.phubhead`（全セクション共通・上部固定ではなく先頭に置く）

- 左：ポジションのバッジ（`.pos.gk/df/mf/fw` 既存）＋背番号。中：氏名（(C) はキャプテン）、学年 ・ 所属グループのバッジ（`PlayerGroupBadges` 既存）・利き足。右上：`IconEdit` の小ボタン（§2-1）。
- 下に 4 マス `.phubkpi`：身長／体重（最新の成長記録。無ければ `Player.height/weight`）、今季 出場・得点（`playerSeasonStats`）、出席率（`perPlayerAttendance`）、ノート提出（件数）。マスを押すと該当セクションへ。

### 3-2. セクション「基本」（`overview`）

- 基本情報の表（背番号・ポジション・利き足・学年・グループ・メール（スタッフだけ）・生年月日・性別・在籍校・学期制）。生年月日〜学期制は `PlayerProfile` 側で、`PlayerBasicForm` で編集する。
- `PlayerBasicForm`（新設。`TeamHub` の `playerForm` の入力欄を部品化して両方から使う。TeamHub の既存シートは中身をこの部品に置き換える）：名前・背番号・ポジション・利き足・学年・グループ（スタッフだけ）・メール（スタッフだけ）・生年月日・性別・在籍校・学期制。保存は `board.updatePlayer({...live, ...})`（**最新の Player を base にする**。TeamHub の `livePf` と同じ）＋`profiles.update`。選手は名前・メール・グループを変えられない（表示だけ。メールを変えるとログインできなくなるため）。
- 役割メモ `Player.roleNote`（戦術ボードのスロットメニューで編集しているもの）を「スタッフのメモ」として表示（スタッフだけ。編集は今のとおりスロットメニュー）。
- 「シーズンレポートを見る ›」の行（§3-9 へ）。

### 3-3. セクション「成長」（`growth`）

- 上：`TrendChart`（§4）で身長の推移（実線）＋全国平均の参照線（破線、凡例「全国平均（中2 男子）」＝現在の学年の年齢）。下に体重の同じグラフ。X 軸は日付（間隔を反映）、Y 軸は値の範囲に合わせて余白を取る（0 始まりにしない）。点は 2 つ以上で描き、1 つなら数値カードだけ。
- 数値カード：最新の身長・体重（前回との差 ▲/▼）、BMI（目安帯のみ）、成長速度 cm/年（60 日以上の間隔があるとき）。
- 一覧 `.phublist`：測定日・身長・体重・（座高）・メモ、行末に「編集」「削除」。「＋ 測定を追加」→ フォーム（日付＝今日、身長・体重は小数 1 桁、座高任意、メモ）。同じ日付の重複は上書き確認。保存で `Player.height/weight` も最新の値に同期する（最新日付の記録の値を `updatePlayer`。名簿の表示と食い違わないように）。

### 3-4. セクション「体力」（`fitness`）

- 上：新体力テストの要約（8 種目そろえば「合計 52 点 ・ 評価 B（13 歳）」、そろわなければ「5 種目 ・ 合計 31 点」）＋ `RadarChart`（8 軸＝項目別得点 1〜10。最新回を塗り、前回を薄い線で重ねる）。標準種目が 1 つも無ければこのブロックは出さない。
- 種目ごとのカード：種目名・最新値（`fmtFitnessValue`）・前回との差（改善＝緑・悪化＝赤。`lowerIsBetter` を見る）・得点（標準種目）・`TrendChart`（`lowerIsBetter` なら Y を反転して「良い方が上」）。値が 2 つ未満なら小さな数値だけ。
- 「＋ 測定を追加」→ フォーム：測定日（今日）、区分（学校の新体力テスト／クラブ測定／その他＝メモに残すだけ。任意。`FitnessRecord` に置き場が無いので `PlayerProfile.fitnessSessions` に測定日ごとに 1 件持ち、測定回 `.phubsession-h` にタグで出す。日付単位の削除で一緒に消す）、種目ごとの入力欄（全種目を縦に並べ、空欄は保存しない）。保存は `addFitnessRecords` で一括。一覧（日付ごとにまとめた測定回 `.phubsession`）から日付単位で削除（`removeFitnessRecordBy` を各種目で）。「種目を管理 ›」（スタッフだけ）は既存の `fitnessTests` シートへ（スタッフの名簿ではシート、選手側では出さない）。

### 3-5. セクション「テスト」（`exams`）

- 上：`TrendChart` で 5 教科合計の推移（点にテスト名）、目標合計（`targetTotal5`）があれば水平の目標線。
- テストごとのカード（新しい順）：名前・種別・日付・学年学期、`SubjectBars`（教科ごとに自分の点／学年平均を並べた横棒。100 点満点基準）、5 教科合計（平均との差）、9 教科合計（実技があれば）、順位／人数、偏差値・判定（模試）、振り返り。行末「編集」「削除」。
- 「＋ テストを追加」→ フォーム：名前、種別、実施日、学年・学期（既定＝選手の学年と、日付から推定した学期）、教科ごとに 点／満点（既定 100）／学年平均、順位・人数、偏差値・判定（種別が模試のときだけ）、目標（5 教科合計）、振り返り。

### 3-6. セクション「成績表」（`grades`）

- 上：目標カード `.phubgoal`：「目標 評定平均 3.4（9 教科合計 31 以上）・ 期限 中3 2学期」、現在値との差「あと 2」、行動（自由記述）。「目標を編集」で `gradeGoal` のフォーム（目標評定平均（小数 1 桁）、期限（学年・学期）、教科別の目標評定（任意）、行動）。
- `TrendChart`：評定平均の推移（学期ごと。X はカテゴリ軸「中1 1学期…」）＋目標線。
- 通知表の表 `.phubtable`：行＝9 教科、列＝学期（新しい 4 学期分。横スクロール）。各セルに評定、前の学期からの差を ▲/▼ で。行末に教科別の目標評定（あれば）と差。下に 9 科・5 科・3 科の合計と評定平均、欠席／遅刻／早退。
- 「＋ 学期を追加」→ フォーム：学年・学期（学期制に合わせた選択肢：3 学期制＝1・2・3 学期／2 学期制＝前期・後期）、9 教科の評定（1〜5 のセグメント）、欠席・遅刻・早退、所見。既存の学期は列見出しを押して編集・削除。
- 検定 `.phubcerts`：種類・級・取得日の一覧と「＋ 検定を追加」。

### 3-7. セクション「進路」（`career`）

- 要約カード：進路の方向（高校進学／ユース昇格希望／クラブユース／その他）、希望エリア、通学時間の上限、寮の可否、本人の希望、保護者の意向、将来の目標。「編集」で 1 つのフォーム。
- 志望校 `.phubchoices`：第 1〜第 5 希望を順に（学校名・公立/私立/国立・学科コース・受験方法・特待・ステータスのタグ・サッカー部情報・基準の目安・志望理由）。「＋ 志望校を追加」「編集」「削除」「上へ／下へ」。
- 活動記録（日付・種別・学校・メモ。新しい順）と「＋ 活動を追加」。
- 面談記録（面談日・参加者チップ・担当・内容。新しい順）と「＋ 面談を追加」。
- 次のアクション（内容・期限・担当・済み）。期限が過ぎて未完了は `--danger` の文字。「＋ アクションを追加」。
- 中3 の年間の節目（4・6・9・12 月＝進路希望調査、7〜8 月＝練習会、9〜10 月＝推薦連絡、11〜1 月＝出願）を薄い注記 1 行で出す（学年が中3 のときだけ）。

### 3-8. セクション「怪我」（`injuries`）と「活動」（`activity`）

- 怪我：既存 `Player.injuries` の一覧（日付・部位・状態・メモ）と「＋ 怪我を追加」「編集」「削除」。フォームは `SheetManager` の `InjuryForm` と同じ項目（`board.updatePlayer` で保存。日付の初期値は `localDateStr`）。
- 活動：今季成績のタイル（`RosPlayerPane` 3293〜3313 行の `.hdash/.hstat` を移す。スマホでも見えるよう `.phub` 用の CSS を用意）、出席（出席率・出席・欠席・未定、月別出席率の `LineChart`（`AttPlayerPane` 流用）と直近 10 件の出欠履歴）、ノート提出（件数・直近 5 件の日付と種別。押すとスタッフはサッカーノートの詳細へ（`board.setScreen("notebook")`＋既存の遷移があれば）、選手は自分のノートへ）。

### 3-9. セクション「レポート」（`report`）

- `SeasonReport playerId` をそのままマウントする。CSS が `.noteapp` 配下にしか無いので、ハブの中では `<div className="noteapp phub-report">` で包む（`.noteapp` 単独に高さやグリッドの指定が無いことを確認し、あれば `.phub-report` で打ち消す）。印刷・画像保存は今のまま。

### 3-10. 共通の編集フォームの文法

- スマホ：下からのシート（`.wsheetback/.wsheet` の文法。`.teamapp`／`.profapp` でも装飾されるよう `.phubsheet` として CSS を用意）。PC：ハブの内容の上に重ねる同じシート（幅 560px、中央）。見出し＋右上「キャンセル」、末尾に `.bigbtn`「保存」（緑は主ボタンのここだけ）。
- 数値は `inputMode="decimal"|"numeric"` の text 入力＋正規表現（`SheetManager` の作法）。日付は `input[type=date]`、初期値は `localDateStr()`（`toISOString` 禁止）。
- 削除は `window.confirm`。
- 各セクション末尾に「最終更新 M/D(曜) 監督」（`updatedAt`/`updatedBy`）。`updatedBy` は `board.auth.role==="coach" ? "staff:"+board.auth.name : "player"`。

## 4. グラフ（新設 `components/ProfileCharts.tsx`。依存なしの SVG）

- `TrendChart({ series: { label, points: {x: string /*date or category*/, y: number}[], color? }[], reference?: { label, value } /* 水平線 */, target?: { label, value }, invert?: boolean, unit?: string, xKind: "date"|"category", height?: number })`
  - Y は系列の min〜max に 10% の余白（reference/target も含める）。`invert` なら小さい値が上。
  - X は `date` なら日付の間隔を反映（`Date.parse`）、`category` なら等間隔。ラベルは端と中間の数点。
  - 点にホバー／タップで値と日付のツールチップ（`title` で可）。最新の点は塗り、値ラベルを出す。
  - 色はトークン（`--accent`、`--primary-dim`、`--mut`、`--danger`）だけ。線幅 2、点 r=3.5。
  - 点が 1 つ以下なら描かない（親が数値カードにする）。
- `SubjectBars({ rows: { label, value, max?: number, avg?: number | null, target?: number | null }[] })`：横棒（自分＝`--accent`、平均＝`--mut` の細い線、目標＝小さな三角）。
- `RadarChart({ axes: string[], series: { label, values: number[] /*0〜10*/, fill?: boolean }[] })`：8 軸の多角形、目盛り 5・10。
- CSS は基底に `.phub .tchart` 等のスコープで置く（`.noteapp .chart-line` に依存しない）。

## 5. CSS の契約

`app/globals.css` の行頭 `@media` は 9 本のまま（新しいブロックを作らない。既存の `@media (min-width:1600px)`／`(pointer: coarse)` の中への追記は可）。新規ルールは基底（最初の `@media (min-width: 1024px)` の前。`.phub*`／`.ros*`／`.profapp`／`.tchart` の塊としてまとめる）、スマホ限定は `body:has(.mhead)` 等、PC だけの調整は 2 つ目の PC ブロック末尾の `/* === mobile-redesign PC reset === */` に追記（既存の 1 つ目の PC ブロックの `.teamapp:has(.teammain)` グリッド定義（14788〜）は触らず、PC reset 側で名簿タブだけ上書き）。色はトークンのみ・新規 hex なし（グループ色はインライン）。文字 12px 以上（下部タブのラベルの `clamp(11px, 3.1vw, 12px)` だけ例外として認める）。スマホのタップ 44px。緑（`--primary`）は主ボタンだけ。PC の操作部品は四角（`--r-md`）。スマホ 390px で横はみ出しゼロ（表とチップ列は横スクロールのコンテナに入れる）。

## 6. 変えないもの

- 戦術ボード側の `PlayerDetail`／`PlayerForm`／`FitnessForm`／`InjuryForm`（SheetManager）。
- 出欠・カレンダー・試合記録・チャット・サッカーノート。`useGroupFilter("roster")` のキーと単一選択の意味。
- `Player` の既存フィールドの意味（`height/weight` は最新値として残す）。
- 種目管理シート（印を足すだけ）。

## 7. 受け入れ基準

1. PC の名簿：左に絞り込み列（既定で開く）、真ん中に一覧、右に個人ページ。「‹ 絞り込みを隠す」で 2 列になり、再読み込み後も保持、「絞り込み」ボタンで戻る。学年／グループ／ポジション区分／状態で絞れ、要約 1 行に反映。試合記録タブは 2 列のまま。
2. スマホの名簿：「絞り込み」でシート。行をタップすると個人ページが全画面で開き、「‹ 戻る」で一覧へ。
3. 個人ページに「編集する／キャプテンにする／削除する」のボタン列が無い。右上の小さな編集ボタンで基本情報のフォームが開き、その末尾にスタッフだけ「キャプテンにする」「この選手を削除」がある。
4. 個人ページのメニュー（基本／成長／体力／テスト／成績表／進路／怪我／活動／レポート）が、PC は左の縦メニュー、スマホは横スクロールのチップ列で切り替わる。
5. 成長：身長・体重の折れ線（日付軸・全国平均の破線）、最新値と差、BMI、成長速度。測定の追加・編集・削除ができ、最新値が名簿の身長・体重に反映される。
6. 体力：種目ごとの折れ線（50m走は良い方が上）、前回との差、新体力テストの得点・合計・評価とレーダー。測定回の一括追加と日付単位の削除。
7. テスト：テストの追加・編集・削除、教科別の棒（自分／平均）、5 教科合計の推移と目標線。
8. 成績表：学期の追加・編集・削除、9 教科の表（差の ▲/▼）、合計（9/5/3）と評定平均、目標（評定平均 3.4 → 合計 31、あと n）、評定平均の推移と目標線、検定の一覧。
9. 進路：方向・条件・本人／保護者の意向、志望校 1〜5（並べ替え・ステータス）、活動・面談・アクション（期限切れの強調）。
10. 怪我の追加・編集・削除。活動（今季成績・出席・ノート提出）がスマホでも見える。レポートのセクションで `SeasonReport` が表示され、印刷・画像保存が動く。
11. 選手：スマホ下部タブが ホーム／ノート／チーム／プロフィール／その他 で、プロフィールに自分の個人ページが出る（キャプテン・削除・メール・グループの編集は無い）。PC はレールに「プロフィール」があり、直下のサブナビでセクションが切り替わる。5 タブが 390px で折り返さない。
12. 戦術ボードのベンチをスマホでタップすると、チーム運営の名簿でその選手の個人ページが開く（スタッフ）。
13. 記録が空の選手（サンプル以外）でも各セクションが「まだ記録がありません」＋追加ボタンで崩れない。
14. 名簿の絞り込み列を開いたままの PC 1024・1180・1280・1440px でも、個人ページの本文が潰れない（ハブの幅が 560px 未満なら横のチップ列・KPI は 2 列）。横はみ出し・1 文字ずつの縦折り返しなし。
15. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。スマホ 390px・PC 1440px で横はみ出しなし。pageerror 0。既存のカレンダー／試合記録／チャット／サッカーノートのスクショが変更前と同じ（名簿以外の回帰なし）。

## 8. 検証手段

- 開発サーバー http://localhost:3000（`next build` 禁止。落ちていたら `.claude/launch.json` の `soccer-tactics` を preview_start で起動）。puppeteer ヘルパー `~/.claude/alfa-verify-tools/lib.js`（`launch(VP_PC|VP_M)`／`seedCoach`／`seedPlayer`（p08）／`HIDE`／`sleep`）。起動後 6 秒待つ。スクリプトはすべて `~/.claude/alfa-verify-tools/` に置く。
- 変更前のスクショ：`~/.claude/alfa-verify-tools/p13_roster/before/`。
- 受け入れ検証スクリプト：`~/.claude/alfa-verify-tools/p13_hub_verify.js`（統括が用意）。

## 9. 実装時の判断（2026-09-30、実装＝sonnet 4 段／レビュー＝Opus 5.5 ×3／反証 2 票／修正＋追補）

仕様の文面から外れた・補った点。以後はこちらが正。

- **データ**：`PlayerProfile` は別キー `soccer_tactics_profile_v1`（`ProfileProvider` は `AppFlow` で `TeamProvider` の内側）。`update()` は `gradeGoal`／`career` を丸ごと差し替えるので部分更新は `updateCareer`。基本の補足（生年月日・性別・在籍校・学期制）の最終更新は `basicUpdatedAt/By` で別持ち。体力の「区分」（学校の新体力テスト／クラブ測定／その他）は `PlayerProfile.fitnessSessions`（測定日ごと 1 件）に持ち、測定値は今までどおり `Player.fitness`。
- **体力測定の種目**：既定は既存 5 種目＋新体力テストの標準種目（`ft_std_*`）。「1000m走」はクラブ独自種目のまま（`standardKey` なし。男子 1500m の表で採点しない）、標準の持久走は「持久走（男子1500m／女子1000m）」`ft_std_endurance`。標準種目の補完は `TeamData.fitnessStdSeeded` で 1 回だけ（種目管理で消しても復活しない）。`updateFitnessTest` は既存の `standardKey` を引き継ぐ。持久力の採点は 20m シャトルランがあればそちら。握力は左右平均の四捨五入をしていない（1 値入力）。
- **TeamProvider**：`addFitnessRecords`（一括。同じ testId+date は置換）、`removeFitnessRecordBy`、`removeFitnessSession(playerId, date)`（日付単位の削除を 1 回の `updatePlayer` で）。
- **成績**：`neededSumFor(target)`＝`round1(合計÷9) ≥ 目標` を満たす最小の合計（3.4→31、3.6→32）。推移グラフは 9 教科／5 教科がそろった学期・テストだけ描き、表とカードには「（n 教科）」を添える。テストの推移には学年平均の系列を重ねる。
- **サンプル**：p08（中2 相当）・p10（中3 相当。学年に合わせた）・p01（生年月日なし。学年から年齢を引く経路の確認用）。最新の成長記録は名簿の身長・体重と同じ値。標準種目の測定サンプルは `DEMO_SEED_VERSION` "4" で p08／p10 に追加。
- **基本情報フォーム**：身長・体重の欄は無い（最新の成長記録が `Player.height/weight` に同期される）。新規追加でも生年月日・性別・在籍校・学期制のどれかがあればプロフィールを作る。「＋ 管理」（グループ）を往復しても入力は `keep` で残す。
- **PC の狭い幅**：絞り込み列を開いたまま 1024〜1279px だと右ペインが狭いので、`PlayerHub` は自分の幅が 560px 未満なら縦メニューをやめてチップ列にし（`.phub.narrow`）、KPI・数値カードを 2 列にする。絞り込み列を狭い幅で既定で畳む案は不採用（ユーザー指示「既定で隠れない」を優先）。
- **名簿の一覧**：スマホは個人ページから戻ると一覧のスクロール位置を復元。PC は他画面から開いた行が画面外なら見える位置へ。`SheetState.playerDetail` は参照が無くなったので型ごと削除。
- **ベンチのタップ**：スタッフは名簿の個人ページへ（PC・スマホ）。選手ログインは自分ならプロフィール画面、他人なら従来の選手詳細シート。指を離した後の click を 1 回だけ握りつぶす（スマホで遷移先に click が落ちる ghost click 対策）。
- **CSS**：`.phubsheetback` の scrim は既存 `.wsheetback` と同じ `rgba(21,35,60,0.4)`（新規 hex ではない）。ハブ内の `SeasonReport` は `.noteapp.phub-report` で包み、11px 未満の既存ラベルだけ 12px に上げる。表の行クラスは既存 `.att` と衝突するため `t-att`。
- **不採用の指摘**：選手が自分の学年を変えられる（両者編集可の方針どおり）、ヘッダーカードのバッジの色差、グラフの小数桁の不揃い、`.prow .sub` 11px（既存）。
- 受け入れ検証：`~/.claude/alfa-verify-tools/p13_hub_verify.js`（80/81。残る 1 件はスマホのベンチが盤面の下にあり、スクリプトがスクロール前に探していたもの。追補の `p13_followup_verify.js` で遷移は確認済み）。
