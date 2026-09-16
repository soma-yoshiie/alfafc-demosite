# グループ機能の全面展開 仕様（中学年代のデモ名簿・選手の所属・自分の予定・出欠/配信/連絡・名簿/戦術ボード/試合記録/チャット）

作成：2026-09-16／設計：fable5／実装：sonnet5／レビュー：opus5
前提：`specs/calendar-groups.md`（カレンダーのグループ）の続き。UI の約束は `specs/mobile-redesign.md` §2・§8。

## 0. ユーザー指示（原文の要点）

1. デモ版の選手を小学生から **中学1〜3年の各学年 20〜25 人（計 70 人程度）** に変える（まず中学年代から広める）。
2. **選手ごとのグループ所属**。例：2年生の選手はホームで自分の予定だけを見る。ただし 2年生が 3年生の練習に出ることもあるので変更できる（例：ある日の 3年生の練習に行くなら、カレンダー上でその予定を選んで「自分のカスタマイズ済みカレンダー」にできる）。
3. **出欠・通知のグループ対応**。
4. **戦術ボード・名簿など、あらゆる部分で「グループ分け」と「スタッフが作ったカスタマイズグループ分け」** ができるようにする。

## 1. データ

```ts
/** 学校区分（学年の範囲とラベルを決める） */
export type SchoolStage = "elementary" | "junior" | "high"; // 小学1〜6 / 中学1〜3 / 高校1〜3
export const STAGE_GRADES: Record<SchoolStage, number[]> = { elementary: [1,2,3,4,5,6], junior: [1,2,3], high: [1,2,3] };
export const gradeLabel = (stage: SchoolStage, g: number) => (stage === "elementary" ? `小${g}` : stage === "junior" ? `中${g}` : `高${g}`); // 例「中2」

export interface TeamGroup {
  id: string;
  label: string;
  /** "grade"＝学年グループ（所属は Player.grade から自動）／"custom"＝スタッフが作るグループ（所属は Player.groupIds） */
  kind: "grade" | "custom";
  /** kind="grade" のときの学年 */
  grade?: number;
}

export interface TeamData {
  // 既存…
  schoolStage?: SchoolStage;   // 未定義＝"elementary"（旧データ互換）
  groups?: TeamGroup[];        // 既存の groups を拡張（kind 未定義の旧データは "custom" とみなす）
}

export interface Player {
  // 既存…
  /** 所属するカスタムグループ（kind="custom" の id）。学年グループは grade から自動 */
  groupIds?: string[];
}

export interface TeamEvent {
  // 既存… groupIds?: string[]（対象グループ。未定義＝全員）
  /** 対象外の選手が自分で「参加する」にした選手 ID（選手側のカスタマイズ） */
  optInPlayerIds?: string[];
}

export interface Announcement {
  // 既存…
  /** 宛先グループ。未定義＝全員 */
  groupIds?: string[];
}

export interface Deliverable {
  // 既存 targetPlayerIds?: string[]（個人宛）
  /** 宛先グループ（個人宛と併用可）。未定義＝全員 or 個人宛のみ */
  targetGroupIds?: string[];
}
```

ヘルパー（`lib/groups.ts` を新設）：
- `gradeGroupsFor(stage, groups)`：学年グループの一覧（無ければ生成用の雛形）。
- `playerInGroup(p, g)`：`g.kind==="grade"` なら `p.grade === g.grade`、custom なら `p.groupIds?.includes(g.id)`。
- `groupsOfPlayer(p, groups)`、`membersOf(groupId, players, groups)`。
- `eventTargetsPlayer(e, p, groups)`：全員対象 ‖ `e.groupIds` のいずれかに所属 ‖ `e.optInPlayerIds` に含まれる。
- `eventTargetPlayers(e, players, groups)`：対象選手の配列（出欠の分母）。
- `announcementTargetsPlayer(a, p, groups)`、`deliverableTargetsPlayer(d, p, groups)`（既存 `targetPlayerIds` との OR）。
- 学年グループの整合：`TeamProvider` 初期化時と `schoolStage` 変更時に、`STAGE_GRADES[stage]` ぶんの学年グループ（`kind:"grade"`、ラベルは `gradeLabel`）を無ければ追加し、範囲外の学年グループは削除する（`ensureGradeGroups`）。学年グループは改名可・削除不可。

## 2. デモ名簿（中学年代・約 70 人）

- `SAMPLE_TEAM_NAME` → 「アルファラスFC ジュニアユース」。`schoolStage: "junior"`。
- `SAMPLE_PLAYERS` を **70 人**に：中1 23 人・中2 24 人・中3 23 人。既存の `p01`〜`p16` は **ID・名前・番号・メールを維持**（ノート・試合記録・出欠のサンプルが参照している）し、学年だけ中3（p01〜p08）・中2（p09〜p16）に振り直す。`p17`〜`p70` を追加（名前は重複しない日本人名、ポジションは GK 各学年 2 人・DF/MF/FW をバランスよく、身長 150〜175cm・体重 40〜65kg、利き足は右 8：左 2）。メールは p08（佐藤 蒼空、`sora@alfafc.example`＝デモログイン）を維持し、他は各学年 2 人ほどに付ける。
- 背番号は学年をまたいで一意に（1〜70）。
- カスタムグループの初期データ：「Aチーム」（中3 の 12 人＋中2 の 4 人）、「Bチーム」（残りの中3・中2）、「GK」（全 GK）。学年グループ「中1」「中2」「中3」は自動生成。
- サンプル予定の対象：「全体練習」＝全員、週 2 回の「中3 練習」「中2 練習」「中1 練習」（学年グループ対象）を各 1 件以上、「練習試合」＝Aチーム、「保護者会」＝全員。既存の出欠サンプルは対象選手の範囲に収まるよう調整。
- サンプルの試合記録・ノートは p01〜p16 のまま（中2・中3 の選手として成立）。
- ロースター画面（`storage.ts`）の旧データは学年 1〜6（小学）のまま読める。`schoolStage` 未定義＝elementary。

## 3. 選手側：「自分の予定」とカスタマイズ

- 選手・保護者のカレンダー：絞り込みの既定を **「自分の予定」**（`eventTargetsPlayer(e, me)`）にし、「すべて」に切り替え可能（チップ「自分の予定／すべて」＋既存のグループ絞り込みは選手には出さない）。
- 「すべて」で自分の対象外の予定を開くと、予定詳細に **「この予定に参加する」** ボタン（青）。押すと `optInPlayerIds` に自分を追加し、以後「自分の予定」に出る・出欠の対象になる。参加済みなら「参加をやめる」（枠線ボタン）。対象の予定には出さない。
- ホーム（選手）の「次の予定」・カウントダウン・「自分の出欠」は **自分の予定**から取る（`useMatchdayData` に `forPlayerId` を渡して `eventTargetsPlayer` で絞る。コーチは従来どおり全件）。
- 予定詳細の「対象」行に、参加追加の選手がいれば「＋参加：佐藤 蒼空」を添える（スタッフ表示）。

## 4. 出欠・通知のグループ対応

- `TeamProvider.summary(eventId)` の分母を `eventTargetPlayers(e)` に変える（`none` は対象選手のうち未回答）。
- 出欠記録シート／PC の出欠ペイン：一覧は対象選手だけ。末尾に折りたたみ「対象外の選手（n）」を置き、開くと対象外の選手にも記録できる（例外的な参加）。記録した対象外選手は `optInPlayerIds` に追加する。
- `lib/attendanceStats.ts`（`perPlayerAttendance`／`monthlyAttendance`／`gradeAttendance`）と `attendanceRate` の分母を「その選手が対象の予定」だけにする（2年生の出席率が 3年生の練習で下がらない）。シグネチャに `groups` を足す（呼び出し 7 箇所を更新）。
- 出欠サマリー（PC `AttOverviewPane`）の「学年別」を「グループ別」に拡張：学年グループ＋カスタムグループの出席率。
- 配信（`DeliverViews`）：宛先を「全員／グループ（複数選択）／個人」に。保存は `targetGroupIds`＋`targetPlayerIds`。選手側の一覧・通知（`buildEventNotifications` の配信）は `deliverableTargetsPlayer` で絞る。
- 連絡（`announce` シート）：宛先グループ（複数選択、未選択＝全員）。選手側のチャットタブの「連絡」は自分宛だけ表示。カードに宛先バッジ。
- コーチのベル「出欠が未回答」は新しい `summary` を使うので自動でグループ対応。

## 5. スタッフ側：あらゆる画面でのグループ分け

共通部品 `components/GroupChips.tsx`：`GroupChips({ value, onChange, allowAll, multi })`。単一選択（絞り込み）と複数選択（宛先）の両方。学年グループを先、カスタムグループを後に並べ、末尾に「＋ 管理」（グループ管理シートへ）。共通フック `useGroupFilter(key)`：選択を `localStorage`（`soccer_tactics_groupfilter_v1` に画面 key ごと）へ保存。

| 画面 | 変更 |
|---|---|
| グループ管理シート（既存） | 学年グループは改名のみ。カスタムグループの行に「メンバー（n人）」→ 選手のチェックリスト（検索付き）で所属を一括編集。`Player.groupIds` を更新 |
| 名簿（`RosterTab`） | 上部に `GroupChips`（すべて／学年／カスタム）で絞り込み。一覧は学年ごとの見出しで区切る（「中3（23）」）。行に所属カスタムグループのバッジ（最大 2 個＋「+n」） |
| 選手フォーム | 学年の選択肢を `schoolStage` に合わせる（中学なら 1〜3、表示「中1」）。「グループ」欄（カスタムグループの複数選択チップ） |
| 設定 | 「学校区分」（小学／中学／高校）の選択。変更時に学年グループを `ensureGradeGroups` で整える |
| 戦術ボード「選手を配置」シート（`SheetManager` の選手一覧） | 検索の下に `GroupChips` で絞り込み（既定は前回の選択）。「このグループで自動配置」ボタン：選択グループの選手をポジション優先で空き枠に一括配置（GK→DF→MF→FW の順、足りなければ空きのまま） |
| 試合記録のスタメン選択（`MatchForm` の lineup 選択） | 各ポジションの選手 select を `GroupChips` の選択で絞る（既定「すべて」）。予定に紐づく試合なら予定の対象グループを既定にする |
| サッカーノート（コーチ）提出一覧・ダッシュボード・配信 | 提出一覧の絞り込みチップに `GroupChips` を追加。ダッシュボードの「選手 全員」に学年／グループの選択を追加 |
| チャット | 会話一覧に **グループスレッド**（学年・カスタムの各グループ。スレッドキー `grp:<id>`、参加者＝グループのメンバー＋スタッフ）。選手には所属グループのスレッドだけ表示。既存の「チーム全員」と個人 DM はそのまま |
| チーム運営のヘッダー（スマホ） | 変更なし（絞り込みは各タブ内） |

## 6. 変えないもの

- カレンダーのグループ絞り込み（`specs/calendar-groups.md`）の挙動。全員対象はどのグループでも表示。
- 保存キー。旧データ（groupIds 無し・schoolStage 無し・kind 無し）の互換。
- PC のレイアウト規約（PC ブロックは「PC reset」以外触らない）。

## 7. 実装分割

- **Phase 1（今回）**：§1 データとヘルパー、§2 デモ名簿、§3 選手の自分の予定と参加、§4 出欠・配信・連絡、§5 のうち グループ管理（メンバー編集）・名簿・選手フォーム・設定（学校区分）。
- **Phase 2（次回）**：§5 のうち 戦術ボード・試合記録・サッカーノート・チャットのグループスレッド。

## 8. 受け入れ基準（Phase 1）

1. デモ起動時の名簿が 70 人（中1 23・中2 24・中3 23）、チーム名が「アルファラスFC ジュニアユース」、学年表示が「中1〜中3」。既存のノート・試合記録・出欠サンプルが壊れていない（試合記録の得点者名・ノートの選手名が表示される）。
2. グループ管理に「中1」「中2」「中3」（改名のみ）と「Aチーム」「Bチーム」「GK」があり、メンバー編集で所属を変えられる。名簿の絞り込みと学年見出し、選手フォームのグループ欄が動く。
3. 選手（佐藤 蒼空＝中2）のカレンダー既定「自分の予定」に「全体練習」「中2 練習」「Aチーム」対象の予定が出て、「中3 練習」は出ない。「すべて」で中3 練習を開き「この予定に参加する」を押すと「自分の予定」に出る。ホームの次の予定も自分の予定から選ばれる。
4. 出欠：中3 練習の未回答数は中3（＋参加追加）の人数から数える。出欠記録シートに対象選手だけが並び、「対象外の選手」を開いて記録できる。出席率の分母が対象の予定だけになる。
5. 配信と連絡をグループ宛にすると、そのグループの選手だけに表示・通知される。
6. `npx tsc --noEmit` 成功、`@media` 9本、スマホ全画面ではみ出しゼロ、PC の変更対象外の画面は変更前と一致（動的差分を除く）。

## 9. 検証手段

- 開発サーバー http://localhost:3000（落ちていたら `(nohup npm run dev > /tmp/alfa_dev.log 2>&1 &)`）。`next build` 禁止。
- `scratchpad/tools/mobile_audit.js <outdir>`、`pc_baseline.js <outdir>`＋`compare.py diff pc_base <outdir> <diffdir>`（名簿・出欠・チーム運営・ホームは意図した変更あり）。
- 初回シードを確認するときは `localStorage` の `soccer_tactics_team_v1` と選手の保存キー（`storage.ts` を参照）を消してから読み込む。
- 動作シナリオ（puppeteer で自動化）：①シード後の人数・学年分布 ②グループ管理でメンバー編集 ③選手ログイン（sora@alfafc.example）で自分の予定→すべて→参加する→自分の予定 ④コーチで中3 練習の未回答数が中3 の人数 ⑤配信をAチーム宛にして選手（A 所属／非所属）で表示差 ⑥出席率の分母。
