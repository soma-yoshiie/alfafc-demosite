# 試合記録の追補（2026-10-01・第 2 弾）

統括・設計：Fable 5.1 ／ 実装：Sonnet 5.5 ／ レビュー：Opus 5.5
前提：`specs/filter-compact-and-match-hub.md`（p14。§7 が正）。共通の約束（`@media` 9 本・基底と PC reset の置き場所・色はトークン・文字 12px 以上・スマホのタップ 44px・dev サーバー操作とビルドの禁止・コミットしない・`E` を新しい見出しに使わない）はそのまま適用する。変えた箇所の注記は「p15 §n」。

## 0. 依頼（ユーザーの言葉）

1. 絞り込みの文字をほんの少しだけ大きく、チェックマークはほんの少し小さく。
2. 試合記録の絞り込みに期間を追加。
3. 大会の登録・管理で、作成済みの大会を編集できるように。
4. 試合の詳細の上の 4 つの枠（スコア・得点者・先発・交代）はいらない。
5. 基本情報の一番下に試合会場を追加（既定でカレンダーの予定の場所が出る）。
6. カレンダーで試合結果を記録したら試合記録に、試合記録で記入したらカレンダーに、両方向で反映する。
7. 試合記録の編集で「戻る」を押したら「保存せずに終了しますか？」と確認する。
8. フォーメーションの選択肢が 8 人制になっている。中学年代は 11 人制だけにする。

---

## §1 絞り込みの文字とチェック（統括が実施済み）

PC の絞り込みの行の文字 13px → 14px（`.rosfrow`／`.noteapp .nbfrow`／`.calside .calfilterpanel-row`／`.calside .calfilterpanel-catchip`）。`.calchk` は 16px → 14px（スマホ・PC 共通）。行の高さは変えない。

---

## §2 試合記録の絞り込みに「期間」

- `lib/matchPeriod.ts`（新規）：

```ts
export type RecPeriod = "all" | "m1" | "m3" | "m6" | "fy" | "lastfy";
export const REC_PERIOD_OPTIONS: { key: RecPeriod; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "m1", label: "直近1か月" },
  { key: "m3", label: "直近3か月" },
  { key: "m6", label: "直近6か月" },
  { key: "fy", label: "今年度" },
  { key: "lastfy", label: "昨年度" },
];
/** 期間の範囲（両端を含む YYYY-MM-DD。null は制限なし）。年度は 4/1〜翌 3/31 */
export function recPeriodRange(period: RecPeriod, todayStr: string): { from: string | null; to: string | null };
export function matchInPeriod(date: string, period: RecPeriod, todayStr: string): boolean;
```

  `m1`／`m3`／`m6` の起点は `lib/attendanceStats.ts` の `periodStartDate` を使う（月末のクランプ込み）。今日は `lib/dates.ts` の `localDateStr()`。
- Inner（TeamHub.tsx）に `recPeriod`（`useState<RecPeriod>("all")`。保存しない。大会フィルタ `cmp` と同じ扱い）。
- `RecFilterPanel`：セクション「期間」を足す（右の四角チェック・単一選択。`.rosf*` のまま）。並びは **大会 →「大会を登録・管理…」→ 期間 → 学年 → グループ →「絞り込みを編集…」**。props に `period`・`onPeriod`。期間は大会・グループが 0 件でも常に出す（`recHasFilter` は常に true になるので、この変数と条件は消してよい）。
- 絞り込みの適用：`MatchesTab` の一覧と集計、`RecSummaryPane` の集計（`allMatches` の時点で掛ける。大会別成績もこの母集合）。
- `recFilterOn` に `recPeriod !== "all"` を足す。`.rossel` の 1 行は「グループ ・ 大会 ・ 期間」の順（期間は `all` 以外のときラベルを出す）。
- 0 件の文言：期間で絞って 0 件のとき（他の条件が無い）「この期間の試合記録はありません。」。条件が重なるときは今の文言のまま。

---

## §3 大会の編集

- `TeamProvider`：`updateCompetition: (c: Competition) => void`（名前は trim。空なら何もしない。toast「大会を保存しました」）。interface・value・依存配列の 3 か所へ。
- 「大会の登録・管理」シート（TeamHub.tsx の `competitions`）：各行の削除の左に編集ボタン（`IconEdit`、`aria-label="大会を編集"`）。押すとその行が入力欄 2 つ（大会名／メモ（期間・会場など。placeholder「例）4〜6月・市内リーグ」））＋「保存」「キャンセル」に変わる。体力測定の種目管理（`fitnessTests` シート）のインライン編集と同じ作りにそろえる（クラスも流用）。同時に編集できるのは 1 行。
- 新規登録にもメモ欄は足さない（今のまま名前だけ。メモは編集で入れる）。
- ゴミ箱は今の `E n="trash"` のまま（変えない）。

---

## §4 試合の詳細の 4 つの枠を外す

- `MatchHub.tsx` の `.phubkpi`（4 マス）を削除する。
- スコアはヘッダーカードに残す：`.phubid` の勝敗バッジ（`.mres`）の下に `<span className="phubno">{our} - {their}</span>`（個人ページの「#9」と同じ位置・同じクラス）。
- 使わなくなった変数・import を消す（tsc の未使用は出ないが、読み手のため）。

---

## §5 試合会場

- `MatchRecord` に `place?: string`（会場名）と `eventId?: string`（紐づくカレンダーの予定。§6）。
- 表示（`MatchHub` の基本情報の一番下＝「フォーメーション」の次）：ラベル「試合会場」。値は `m.place ?? 紐づく予定の place ?? ""`（空なら「—」）。
- フォーム（`type: "match"`）：メモの上に `.formfield`「試合会場」（input、placeholder「例）市民グラウンド」）。初期値は 編集＝`mr.place ?? 紐づく予定の place ?? ""`、予定から開いた新規＝その予定の `place ?? ""`、それ以外の新規＝`""`。保存は `place: 入力.trim() || undefined`。

---

## §6 カレンダーと試合記録の連携

### 6-1 データ

- `MatchRecord.eventId?: string`：紐づく予定の id。予定が削除されて見つからない id は「紐づけなし」と同じに扱う（読むたびに解決。掃除はしない）。
- `TeamEvent.fromMatch?: true`：試合記録から自動で作った予定の印（記録と同期し、記録を消したら一緒に消す）。
- `TeamData.matchEventsLinked?: true`：既存データの紐づけ（下の一括処理）を済ませた印。

### 6-2 純関数 `lib/matchEvents.ts`（新規）

```ts
/** 自動で作る予定の題名。「{大会名|試合} vs {相手}」 */
export function matchEventTitle(m: Pick<MatchRecord, "opponent" | "competitionId" | "competition">, comps: Competition[]): string;
/** 記録に紐づく予定（無ければ undefined） */
export function eventOfMatch(m: MatchRecord, events: TeamEvent[]): TeamEvent | undefined;
/** 予定に紐づく記録（無ければ undefined。複数あれば日付が新しい方） */
export function matchOfEvent(eventId: string, matches: MatchRecord[]): MatchRecord | undefined;
/** 紐づけ先の候補を探す：同じ日・kind==="match"・まだどの記録にも紐づいていない予定。
 *  候補が 1 件ならそれ。複数なら題名に相手名を含むもの（1 件に決まるときだけ）。決まらなければ undefined */
export function findLinkableEvent(m: Pick<MatchRecord, "date" | "opponent">, events: TeamEvent[], matches: MatchRecord[]): TeamEvent | undefined;
/** 記録 1 件をカレンダーへ反映した TeamData と、eventId を確定した記録を返す（どちらも新しいオブジェクト）。
 *  1) m.eventId の予定がある → fromMatch の予定だけ題名・日付・場所・大会・対象を記録に合わせる（手で作った予定は触らない）
 *  2) 無い → findLinkableEvent で見つかればその id を m.eventId に
 *  3) 見つからない → 予定を新しく作る（kind:"match"、allDay:true、fromMatch:true、title=matchEventTitle、date、place、competitionId、groupIds）
 *  matches 配列への記録の出し入れは呼び出し側が行う（この関数は events と記録の eventId だけを扱う） */
export function syncMatchEvent(t: TeamData, m: MatchRecord, newEventId: () => string): { events: TeamEvent[]; match: MatchRecord };
/** 記録を消すとき：紐づく予定が fromMatch ならその予定と出欠(attendance[eventId])も消した TeamData の部分を返す */
export function removeMatchEvent(t: TeamData, m: MatchRecord): { events: TeamEvent[]; attendance: TeamData["attendance"] };
/** 既存データの一括処理（1 回だけ）：紐づく予定の無い記録を、日付の古い順に syncMatchEvent へ通す。matchEventsLinked を立てる */
export function linkAllMatches(t: TeamData, newEventId: () => string): TeamData;
```

### 6-3 `TeamProvider`

- `addMatch(m)`：`setTeam` の更新関数の中で id を振り、`syncMatchEvent` を通して `events` と記録（`eventId` 確定）を同時に更新する。予定から開いて記録したとき（`m.eventId` あり）は 1) の経路＝その予定に紐づくだけ。
- `updateMatch(m)`：同じく `syncMatchEvent` を通す（古い記録を編集して保存したとき、ここで紐づく）。
- `removeMatch(id)`：`removeMatchEvent` を通す。
- 予定の削除（`removeEvent`／`removeEventOnly`／`removeSeriesFollowing`）は変えない（記録の `eventId` は宙に浮くが、6-1 のとおり紐づけなし扱い）。
- 初期化：`loadTeam() ?? sampleTeam()` の結果が `matchEventsLinked !== true` なら `linkAllMatches` を 1 回通す（`useState` の初期化関数の中。`loadTeam()` 側に入れてもよいが、サンプルにも掛かること）。id は `nid("e")` と同じ作法。
- `lib/storage.ts` の `loadTeam()` の正規化：`eventId`／`place` が文字列でなければ落とす。`fromMatch` は `true` 以外なら落とす。

### 6-4 試合記録フォーム

- 予定から開いた新規（`prefill.eventId`）は保存データに `eventId: prefill.eventId` を入れる。編集は `mr.eventId` を保つ。
- その予定に既に記録があるとき（`matchOfEvent`）は、新規フォームではなく **その記録の編集** を開く（二重に作らない。下の 6-5 のボタン側で出し分ける）。

### 6-5 カレンダー側の表示

- 予定の詳細（`eventView`。`kind === "match"`）で、紐づく記録があるとき：
  - 詳細の先頭寄り（日時・場所の `.dsec` の前）に `.dsec`「試合結果」：`.dline` に「勝 ・ 4 - 2」（勝／分／敗＋スコア）。得点者がいれば次の `.dline` に「得点：加藤 朝陽 2、小林 律」（人ごとの点数。1 点は数字なし）。
  - ボタン：スタッフの「この試合の結果を記録」を「試合記録を開く」に替える（`bigbtn`。押すと試合記録タブでその試合の詳細を開く）。選手・保護者にも、試合記録が公開中（`board.matchesPublic`）なら「試合結果」と「試合記録を開く」を出す。非公開なら結果も出さない。
  - 「試合記録を開く」：`SheetHost` に `onOpenMatch?: (id: string) => void` を足し、Inner から `(id) => { setSheet(null); setTab("rec"); onOpenMatch(id); }` を渡す（PC スタッフ＝右ペイン、それ以外＝recOpen）。
- 紐づく記録が無い試合の予定は今のまま（スタッフに「この試合の結果を記録」）。
- 月表示のピル（`.calev`）：紐づく記録がある試合は、時刻の代わりにスコアを出す（`試 4-2 練習試合 vs …`。`<span className="calev-score">4-2 </span>`。スマホ・PC とも表示、文字は太字）。公開の条件は上と同じ（選手で非公開ならスコアを出さない）。
- リスト表示の行・日別シートの行（`EventCard`／`.agev`）：題名の後ろに結果のタグ `<span className="evresult w|d|l">勝 4-2</span>`。同じ公開の条件。
- 新しい CSS（基底）：`.calev-score { font-weight: 700; }`、`.evresult`（12px・700・`--r-sm`・padding 1px 6px・margin-left 6px・nowrap。地と文字は `.w`＝`--primary-container`／`--primary-dim`、`.d`＝`--surface-container`／`--mut`、`.l`＝`color-mix(in srgb, var(--danger) 12%, transparent)`／`--danger`）。

### 6-6 自動で作った予定の扱い

- 見た目は普通の試合の予定（終日）。編集・削除もできる。削除すると記録側は紐づけなしに戻り、次にその記録を保存したとき作り直される（仕様）。
- 記録の日付・相手・大会・会場・対象を直すと、自動で作った予定（`fromMatch`）にも反映する。手で作った予定は書き換えない。

---

## §7 「保存せずに終了しますか？」

- 対象は試合記録フォーム（新規・編集とも）。フォームを開いた時点の入力（保存データと同じ形のスナップショット）と今の入力が違うとき、次の閉じ方で `window.confirm("保存せずに終了しますか？")` を出す。キャンセルならフォームに留まる。
  - PC のペインの「‹ 戻る」、スマホのシートの背景・つまみ・×。
  - PC で、編集中に左の一覧で別の試合・サマリーを選んだときや、サブナビでタブを替えたとき（シートを閉じる経路。Inner の `setSheet(null)` を直接呼ぶ箇所は、フォームが汚れているかを Inner が知る必要がある）。
- 実装：`SheetHost` の中で `matchDirty` を計算し、`matchGuard = () => !matchDirty || window.confirm(...)` を作る。`<Sheet open={sheet?.type === "match"}>` の `onClose` は `() => { if (matchGuard()) (pane ? paneBack : close)(); }`。Inner へは `onMatchDirty?: (dirty: boolean) => void` で汚れを通知し（`useEffect`）、Inner 側のシートを閉じる経路（サブナビの切り替え、`.teamsumrow`、一覧の行、ヘッダーの「＋」）は `sheet?.type === "match" && dirty` のとき同じ確認を通す共通関数 `confirmLeaveMatch()` を使う。
- 保存ボタンは確認なしで閉じる。新規で何も入力していないとき（スナップショットと同じ）は確認を出さない。

---

## §8 フォーメーションの人数

- `MATCH_FORMATION_SLOTS` を 8 人制と 11 人制に分ける（TeamHub.tsx）：

```ts
const MATCH_FORMATIONS_8: Record<string, string[]> = { …今の 4 つ… };
const MATCH_FORMATIONS_11: Record<string, string[]> = {
  "4-4-2":   ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "MF4", "FW1", "FW2"],
  "4-3-3":   ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "FW1", "FW2", "FW3"],
  "4-2-3-1": ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1"],
  "4-1-4-1": ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1"],
  "3-5-2":   ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1", "FW2"],
  "3-4-3":   ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "MF4", "FW1", "FW2", "FW3"],
  "5-3-2":   ["GK", "DF1", "DF2", "DF3", "DF4", "DF5", "MF1", "MF2", "MF3", "FW1", "FW2"],
  "5-4-1":   ["GK", "DF1", "DF2", "DF3", "DF4", "DF5", "MF1", "MF2", "MF3", "MF4", "FW1"],
};
const MATCH_FORMATION_SLOTS = { ...MATCH_FORMATIONS_8, ...MATCH_FORMATIONS_11 };  // 保存済みの記録の解決用
```

- 選択肢：`team.schoolStage === "elementary"` なら 8 人制だけ、`junior`／`high` なら 11 人制だけ。編集中の記録が反対側のフォーメーションを持っているときは、その 1 つだけ選択肢に残す（消えないように）。
- ラベルは「フォーメーション（8人制）」／「フォーメーション（11人制）」を出し分ける（選択肢の末尾にも同じ表記）。コメントの「8人制」も直す。

---

## §9 受け入れ基準

1. `npx tsc --noEmit` が通る。`grep -c "^@media" app/globals.css` が 9。
2. 試合記録の絞り込みに「期間」があり、選ぶと一覧と PC のサマリーが絞られ、`.rossel` に出る。
3. 大会の名前とメモを編集でき、絞り込み・一覧・詳細の大会名が変わる。
4. 試合の詳細に 4 つの枠が無く、ヘッダーのバッジの下にスコアが出る。基本情報の一番下が「試合会場」。
5. カレンダーの試合の予定から結果を記録 → 試合記録に出る／予定の詳細に「試合結果」と「試合記録を開く」／月表示のピルにスコア。同じ予定から二重に記録を作れない。
6. 試合記録で新規に記録 → その日のカレンダーに試合の予定が出る（同じ日に未紐づけの試合の予定が 1 件あればそれに紐づき、予定は増えない）。記録を消すと、自動で作った予定も消える。
7. 既存の記録（デモの 6 件）がカレンダーの各日付に出ている（1 回だけの一括処理）。再読み込みで増えない。
8. 試合記録フォームで何か変えて「戻る」→ 確認が出る。キャンセルで留まり、OK で閉じる。何も変えていなければ出ない。保存では出ない。
9. 中学（既定のデモ）のフォームのフォーメーションが 11 人制だけ。学校区分を小学にすると 8 人制だけ。

---

## §10 実装時の判断（2026-10-01。以後はここが正）

実画面の確認（受け入れ 45 項目・レビュー修正 11 項目・前回分 81 項目、ほかの画面は差分なし）と、Opus 5.5 のレビュー（4 観点。指摘 25 件のうち反証を通過した 18 件＝重複を除いて 10 件）を受けて、統括が次のとおり決めた。

**現状の確認で分かったこと**

- カレンダーの「この試合の結果を記録」で作った記録は、変更前から試合記録の一覧に入っていた。ただし予定側には結果が出ず、紐づけも無く、同じ予定から何度でも記録を作れた。今回は両方向の紐づけとして作り直した。

**自動で作った予定（`fromMatch`）の扱い（レビューで見つかった副作用への対応）**

- 出欠が 1 件も入っていない自動の予定は「試合結果をカレンダーに映すためだけの予定」（`isResultOnlyEvent`）として、**シーズンレポートの出席率の分母、個人ページ「活動」の出欠履歴、出欠タブの個人の履歴に数えない**。入れないと、過去の試合を記録するたびに全員の出席率が下がる（デモで 100% → 33〜38%）。スタッフが後から出欠を入れた予定は普通に数える。
- 記録が紐づいた予定（`linkedEventIds`。自動・手動とも）は、**ホームの「次の予定」・出欠の催促・「今日やること」・戦術ボードのメンバー登録の候補から外す**（当日に記録を付けると、終わった試合がヒーローに出ていた）。
- 大会の名前の変更・削除のとき、自動の予定の題名（「大会名 vs 相手」）と大会を合わせ直す（`retitleMatchEvents`）。
- 繰り返し予定の「以降すべて」の編集で、記録が紐づいた回は作り直さない（id が変わると紐づけが外れ、二重に記録できた）。

**紐づけの規則（設計書 §6-2 からの変更）**

- 同じ日の候補が 1 件でも、題名に「vs 別の相手」と書いてある予定には紐づけない（`titleAllowsOpponent`。題名に相手が無い予定は候補に残す）。
- 手で作った予定に紐づいた記録の日付を、その予定の期間の外へ直したら紐づけを外し、新しい日付で探し直す（別の日の予定に結果が出続けないように）。

**表示**

- 結果のタグ（`.evresult`）は、題名を flex にして文字（`.evttext`）だけを省略し、タグは常に見せる（題名の中に入れるとスマホで見切れた）。部品は `EvTitle`。
- 期間のラベルは「直近1か月」など空白なし。フォーメーションは「（11人制）」で、ラベルと選択肢の表記をそろえた。保存済みの記録が持つ反対側の人数のフォーメーションは、別のものを選んだ後も選択肢に残す。
- 大会の編集欄は `.formfield`（大会名／メモ（期間・会場など））に入れた。
- 予定から「試合記録を開く」で開いた詳細から戻ったとき、一覧は先頭から。

**「保存せずに終了しますか？」の範囲**

- 通す：PC の「‹ 戻る」、スマホの背景・つまみ・×、PC のサブナビのタブ切り替え、ヘッダーの CTA、左の一覧の行と「チーム全体のサマリー」（フォームを閉じてから切り替える）、絞り込み列の「大会を登録・管理…」「絞り込みを編集…」。
- 通さない（今回の対象外）：左のレールで別の画面（ホーム・サッカーノートなど）へ移る、ブラウザの再読み込み・タブを閉じる。ほかのフォーム（予定・選手など）と同じ扱いのまま。

**採用しなかった指摘（反証されたもの）**

- 試合会場を空にして保存しても、紐づく予定の場所が表示に出る（設計どおり。記録側の値が無ければ予定の場所を使う）。
- 複数日の予定の中日・最終日のピルにもスコアが出る（題名と同じ扱い）。
- カレンダーの画像保存に結果タグが出ない（対象外）。
- 記録の削除で自動の予定と出欠も消える旨を確認文に書いていない（設計どおり。既存の予定の削除と同じ文面）。

**残した課題**

- 既存の記録の一括紐づけは 1 回だけ（`matchEventsLinked`）。その後に手で作った予定とは、記録を保存し直したときに紐づく。
- 自動の予定を手で削除すると、次にその記録を保存したとき作り直される。
- 期間は固定の 6 択（任意の開始日〜終了日の指定は無い）。年度は 4/1 始まり固定。
- レールでの画面移動・再読み込みでは未保存の確認が出ない。

**部品と状態の所在**

- `lib/matchEvents.ts`（紐づけの純関数）、`lib/matchPeriod.ts`（期間）、`TeamProvider` の `addMatch`／`updateMatch`／`removeMatch`／`updateCompetition`、TeamHub.tsx の `eventResultOf`・`EvTitle`・`EvResultTag`・`openMatchFromEvent`・`confirmLeaveMatch`・`MATCH_FORMATIONS_8`／`_11`。
- 検証：`~/.claude/alfa-verify-tools/p15_verify.js`（45 項目）、`p15_review_verify.js`（11 項目）、`p14_verify.js`（81 項目。チェック 14px・4 マス撤去に合わせて更新済み）。
