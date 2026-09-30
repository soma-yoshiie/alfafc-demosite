/**
 * デモのプロフィール（player-hub §1-5）。p08 佐藤 蒼空・p10 加藤 朝陽・p01 佐藤 蓮 の 3 人分。
 * 値はすべて固定の直書き（乱数なし）。成長記録 6 点（2025-04 〜 2026-09。約 4 か月おき）・
 * テスト 4 回・通知表 3 学期分・検定 1 件・進路（志望校 3 校・活動 2 件・面談 1 件・アクション 2 件）。
 * p08 だけ成績の目標（評定平均 3.4・期限 中3 2学期）を持つ。学校名・志望校は架空。
 * 最新の成長記録の身長・体重は sampleTeam.ts の Player.height/weight と同じ値（名簿の表示と食い違わない。§3-3）。
 * 投入は ProfileProvider の初回マウントだけ（保存が空・マーカー無し・名簿に p08 がいるとき）。
 * 学年は p08・p01 が中2、p10 が中3（sampleTeam.ts の grade）。通知表・テストの学年は各自の学年に合わせてある
 */

import type {
  ActionItem,
  Career,
  CareerActivity,
  Certification,
  ExamRecord,
  Interview,
  Measurement,
  PlayerProfile,
  ReportCard,
  SchoolChoice,
} from "./profile";
import { MAIN5, SUBJECTS, fitnessSessionId } from "./profile";

/** サンプルを入れた時刻（2026-09-28 10:00 JST）。updatedAt の固定値 */
const AT = 1790557200000;
const STAFF = "staff:岡本";

/** 5 教科の [点, 学年平均] を ExamRecord.scores に（満点は 100） */
function scores5(rows: [number, number][]): ExamRecord["scores"] {
  const out: ExamRecord["scores"] = {};
  MAIN5.forEach((k, i) => {
    out[k] = { score: rows[i][0], max: 100, avg: rows[i][1] };
  });
  return out;
}

/** 9 教科の評定（国語・社会・数学・理科・英語・音楽・美術・保健体育・技術家庭の順）を ReportCard.ratings に */
function ratings9(r: number[]): ReportCard["ratings"] {
  const out: ReportCard["ratings"] = {};
  SUBJECTS.forEach((k, i) => {
    out[k] = r[i];
  });
  return out;
}

/** 成長記録 6 点の日付（3 人共通。最後の 2 点は 63 日あいていて成長速度が出る） */
const MEASURE_DATES = ["2025-04-14", "2025-08-09", "2025-12-06", "2026-04-11", "2026-07-25", "2026-09-26"];

/** [身長, 体重] を 6 点ぶん並べて Measurement[] にする（座高は任意の 2 点だけ） */
function measurements(pid: string, rows: [number, number][], sitting: Record<number, number> = {}): Measurement[] {
  const notes: Record<number, string> = { 3: "学校の健康診断", 4: "クラブの測定" };
  return rows.map(([height, weight], i) => ({
    id: `ms_${pid}_${i + 1}`,
    date: MEASURE_DATES[i],
    height,
    weight,
    sittingHeight: sitting[i] ?? null,
    note: notes[i] ?? "",
    updatedAt: AT,
    updatedBy: i === 4 ? "player" : STAFF,
  }));
}

/** 定期テスト 4 回（中の学年 g1・g1・g2・g2。1 学期期末・2 学期期末・1 学期期末・2 学期中間） */
function exams(
  pid: string,
  g1: number,
  rows: [number, number][][],
  ranks: [number, number][],
  extra: Partial<ExamRecord> = {}
): ExamRecord[] {
  const defs: Pick<ExamRecord, "name" | "kind" | "date" | "grade" | "term">[] = [
    { name: "1学期 期末テスト", kind: "final", date: "2025-07-03", grade: g1, term: "1" },
    { name: "2学期 期末テスト", kind: "final", date: "2025-11-27", grade: g1, term: "2" },
    { name: "1学期 期末テスト", kind: "final", date: "2026-07-02", grade: g1 + 1, term: "1" },
    { name: "2学期 中間テスト", kind: "mid", date: "2026-09-25", grade: g1 + 1, term: "2" },
  ];
  return defs.map((d, i) => ({
    id: `ex_${pid}_${i + 1}`,
    ...d,
    scores: scores5(rows[i]),
    rank: ranks[i][0],
    rankOf: ranks[i][1],
    updatedAt: AT,
    updatedBy: STAFF,
    ...(i === 3 ? extra : {}),
  }));
}

/** 通知表 3 学期分（学年 g。1〜3 学期） */
function reportCards(
  pid: string,
  g: number,
  rows: number[][],
  attend: [number, number, number][],
  comments: string[]
): ReportCard[] {
  return rows.map((r, i) => ({
    id: `rc_${pid}_${i + 1}`,
    grade: g,
    term: String(i + 1),
    ratings: ratings9(r),
    absent: attend[i][0],
    late: attend[i][1],
    leftEarly: attend[i][2],
    comment: comments[i],
    updatedAt: AT,
    updatedBy: STAFF,
  }));
}

const choice = (
  pid: string,
  n: number,
  c: Omit<SchoolChoice, "id" | "rank" | "updatedAt" | "updatedBy">
): SchoolChoice => ({ id: `ch_${pid}_${n}`, rank: n, ...c, updatedAt: AT, updatedBy: STAFF });
const activity = (pid: string, n: number, a: Omit<CareerActivity, "id" | "updatedAt" | "updatedBy">): CareerActivity => ({
  id: `ca_${pid}_${n}`,
  ...a,
  updatedAt: AT,
  updatedBy: STAFF,
});
const interview = (pid: string, n: number, i: Omit<Interview, "id" | "updatedAt" | "updatedBy">): Interview => ({
  id: `iv_${pid}_${n}`,
  ...i,
  updatedAt: AT,
  updatedBy: STAFF,
});
const action = (pid: string, n: number, a: Omit<ActionItem, "id" | "updatedAt" | "updatedBy">): ActionItem => ({
  id: `ac_${pid}_${n}`,
  ...a,
  updatedAt: AT,
  updatedBy: STAFF,
});
const cert = (pid: string, c: Omit<Certification, "id" | "updatedAt" | "updatedBy">): Certification => ({
  id: `ce_${pid}_1`,
  ...c,
  updatedAt: AT,
  updatedBy: STAFF,
});

function p08(): PlayerProfile {
  const career: Career = {
    direction: "highschool",
    area: "市内と、隣の市まで",
    commuteMaxMin: 45,
    dorm: "unknown",
    choices: [
      choice("p08", 1, {
        school: "県立 青葉ヶ丘高校",
        type: "public",
        course: "普通科",
        method: "general",
        soccerInfo: "県リーグ1部。平日4日練習。人工芝のグラウンド。",
        criteria: "内申 32/45 前後（昨年度の目安）",
        scholarship: "none",
        reason: "家から近く、練習見学で部の雰囲気がよかった。",
        status: "visited",
      }),
      choice("p08", 2, {
        school: "私立 桜台学園高校",
        type: "private",
        course: "普通科（文理）",
        method: "sports",
        soccerInfo: "県リーグ2部。寮あり。",
        criteria: "評定に1がないこと・9教科 27 以上",
        scholarship: "partial",
        reason: "スポーツ推薦で特待の可能性がある。",
        status: "research",
      }),
      choice("p08", 3, {
        school: "私立 蒼海高校",
        type: "private",
        course: "情報科",
        method: "combined",
        soccerInfo: "地域リーグ。通学は約 60 分。",
        criteria: "5教科 17 以上（併願優遇）",
        scholarship: "entrance",
        reason: "併願の安全校として。",
        status: "research",
      }),
    ],
    activities: [
      activity("p08", 1, {
        date: "2026-08-08",
        kind: "practice",
        school: "県立 青葉ヶ丘高校",
        note: "夏の練習会に参加。右サイドで出場。守備の切り替えを褒められた。",
      }),
      activity("p08", 2, {
        date: "2026-09-06",
        kind: "briefing",
        school: "私立 桜台学園高校",
        note: "学校説明会に保護者と参加。特待の条件を聞いた。",
      }),
    ],
    interviews: [
      interview("p08", 1, {
        date: "2026-09-14",
        participants: ["player", "parent", "staff"],
        staff: "岡本",
        note: "まずは高校でもサッカーを続けたい。学業の目標（評定平均 3.4）との両立を相談。夏の練習会の感想を共有した。",
      }),
    ],
    actions: [
      action("p08", 1, { text: "英検の申込み（準2級）", due: "2026-09-15", owner: "player", done: false }),
      action("p08", 2, { text: "青葉ヶ丘高校の秋の練習会に申し込む", due: "2026-10-31", owner: "parent", done: false }),
    ],
    wish: "高校でもサッカーを続けて、全国大会に出たい。",
    parentWish: "学費の面で公立を第一に考えている。通学は自転車で通える範囲が希望。",
    futureGoal: "プロを目指しつつ、大学でも続けられる学力をつける。",
    updatedAt: AT,
    updatedBy: STAFF,
  };
  return {
    playerId: "p08",
    birthDate: "2012-11-03",
    sex: "male",
    school: "市立 みどり中学校",
    termSystem: "3",
    basicUpdatedAt: AT,
    basicUpdatedBy: STAFF,
    measurements: measurements(
      "p08",
      [[141.8, 34.6], [145.0, 36.4], [147.6, 38.3], [149.5, 40.7], [150.4, 42.1], [151.0, 43.0]],
      { 0: 75.2, 3: 80.1 }
    ),
    exams: exams(
      "p08",
      1,
      [
        [[62, 64.3], [57, 58.9], [48, 57.2], [55, 59.1], [60, 61.8]],
        [[64, 63.0], [61, 60.2], [52, 56.4], [58, 58.7], [63, 60.9]],
        [[66, 62.5], [63, 59.8], [55, 54.9], [60, 57.3], [67, 60.2]],
        [[68, 63.1], [64, 61.0], [61, 55.6], [62, 58.4], [70, 62.9]],
      ],
      [[121, 186], [104, 186], [88, 184], [72, 184]],
      { targetTotal5: 330, note: "数学の計算ミスを減らす。見直しの時間を5分残す。" }
    ),
    // 1 学期 27（評定平均 3.0）→ 2 学期 28 → 3 学期 29（3.2）。目標 3.4 は 9 教科合計 31 なので「あと 2」
    reportCards: reportCards(
      "p08",
      1,
      [
        [3, 2, 2, 3, 3, 3, 4, 4, 3],
        [3, 3, 2, 3, 3, 3, 4, 4, 3],
        [3, 3, 3, 3, 3, 3, 4, 4, 3],
      ],
      [[1, 0, 0], [0, 1, 0], [2, 0, 1]],
      [
        "学習の習慣が少しずつ身についてきました。",
        "提出物を出せる回数が増えました。数学の復習を続けましょう。",
        "授業への参加が積極的になりました。",
      ]
    ),
    gradeGoal: {
      targetAvg: 3.4,
      deadlineGrade: 3,
      deadlineTerm: "2",
      subjectTargets: { math: 4, eng: 4 },
      actions: "数学と英語の提出物を毎週、締切の前に出す。間違えた問題は翌日にやり直す。",
      updatedAt: AT,
      updatedBy: "player",
    },
    // 体力測定の 2 回（Player.fitness の 2026-05-16／07-25。学校の新体力テストとクラブ測定）
    fitnessSessions: [
      { id: fitnessSessionId("2026-05-16"), date: "2026-05-16", kind: "school", updatedAt: AT, updatedBy: STAFF },
      { id: fitnessSessionId("2026-07-25"), date: "2026-07-25", kind: "club", updatedAt: AT, updatedBy: STAFF },
    ],
    certifications: [cert("p08", { kind: "英検", level: "3級", date: "2026-01-25" })],
    career,
    updatedAt: AT,
    updatedBy: STAFF,
  };
}

function p10(): PlayerProfile {
  const career: Career = {
    direction: "highschool",
    area: "県内ならどこでも（寮も可）",
    commuteMaxMin: 60,
    dorm: "ok",
    choices: [
      choice("p10", 1, {
        school: "私立 桜台学園高校",
        type: "private",
        course: "普通科（文理）",
        method: "sports",
        soccerInfo: "県リーグ2部。寮あり。",
        criteria: "9教科 30 以上・欠席が少ないこと",
        scholarship: "full",
        reason: "スポーツ特待の話が出ている。寮で生活して力を伸ばしたい。",
        status: "contacted",
      }),
      choice("p10", 2, {
        school: "県立 青葉ヶ丘高校",
        type: "public",
        course: "普通科",
        method: "recommend",
        soccerInfo: "県リーグ1部。",
        criteria: "内申 34/45 前後（昨年度の目安）",
        scholarship: "none",
        reason: "地元で力をつけたい。",
        status: "planned",
      }),
      choice("p10", 3, {
        school: "私立 湖畔学院高校",
        type: "private",
        course: "普通科",
        method: "combined",
        soccerInfo: "地域リーグ。",
        criteria: "5教科 18 以上（併願優遇）",
        scholarship: "entrance",
        reason: "併願先として。",
        status: "research",
      }),
    ],
    activities: [
      activity("p10", 1, {
        date: "2026-07-27",
        kind: "selection",
        school: "私立 桜台学園高校",
        note: "セレクションに参加。ボランチで試合形式。結果は翌週に連絡。",
      }),
      activity("p10", 2, {
        date: "2026-08-20",
        kind: "practice",
        school: "県立 青葉ヶ丘高校",
        note: "練習会に参加。",
      }),
    ],
    interviews: [
      interview("p10", 1, {
        date: "2026-09-01",
        participants: ["player", "parent", "staff"],
        staff: "岡本",
        note: "三者面談。第1志望は桜台学園（スポーツ推薦）。内申の基準に届く見込み。12月の出願に向けて中学校の先生にも確認する。",
      }),
    ],
    actions: [
      action("p10", 1, { text: "桜台学園の推薦基準を中学校の先生に確認する", due: "2026-09-20", owner: "parent", done: false }),
      action("p10", 2, { text: "出願書類の準備（調査書の依頼）", due: "2026-11-15", owner: "parent", done: false }),
    ],
    wish: "桜台学園でレギュラーを取って、プロのユースに挑戦したい。",
    parentWish: "寮費が心配なので、特待の内容を確認したい。",
    futureGoal: "大学を経由してでもプロを目指す。",
    updatedAt: AT,
    updatedBy: STAFF,
  };
  return {
    playerId: "p10",
    birthDate: "2011-08-19",
    sex: "male",
    school: "市立 みどり中学校",
    termSystem: "3",
    basicUpdatedAt: AT,
    basicUpdatedBy: STAFF,
    measurements: measurements(
      "p10",
      [[145.2, 37.5], [148.0, 39.8], [150.1, 42.0], [151.6, 44.6], [152.4, 46.0], [153.0, 47.0]],
      { 0: 77.0, 3: 81.3 }
    ),
    // 中2（2025）から中3（2026）へ。通知表は中2 の 3 学期分
    exams: exams(
      "p10",
      2,
      [
        [[58, 62.1], [61, 60.3], [66, 55.8], [63, 58.0], [57, 61.4]],
        [[60, 61.7], [65, 61.2], [70, 56.0], [66, 57.9], [59, 60.8]],
        [[62, 63.0], [66, 60.5], [72, 56.4], [68, 58.2], [61, 61.0]],
        [[64, 62.4], [68, 61.3], [74, 57.0], [69, 58.6], [65, 61.7]],
      ],
      [[76, 190], [63, 190], [58, 188], [51, 188]]
    ),
    reportCards: reportCards(
      "p10",
      2,
      [
        [3, 3, 4, 3, 3, 3, 3, 4, 3],
        [3, 4, 4, 3, 3, 3, 3, 4, 3],
        [3, 4, 4, 4, 3, 3, 3, 5, 3],
      ],
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      ["数学で安定した力を発揮しています。", "社会の記述問題に粘り強く取り組みました。", "実技の授業で意欲的でした。"]
    ),
    gradeGoal: {},
    // 体力測定の 2 回（Player.fitness の 2026-05-16／07-25。学校の新体力テストとクラブ測定）
    fitnessSessions: [
      { id: fitnessSessionId("2026-05-16"), date: "2026-05-16", kind: "school", updatedAt: AT, updatedBy: STAFF },
      { id: fitnessSessionId("2026-07-25"), date: "2026-07-25", kind: "club", updatedAt: AT, updatedBy: STAFF },
    ],
    certifications: [cert("p10", { kind: "漢検", level: "3級", date: "2026-02-08" })],
    career,
    updatedAt: AT,
    updatedBy: STAFF,
  };
}

function p01(): PlayerProfile {
  const career: Career = {
    direction: "highschool",
    area: "市内・近隣の市",
    commuteMaxMin: 60,
    dorm: "ng",
    choices: [
      choice("p01", 1, {
        school: "私立 蒼海高校",
        type: "private",
        course: "情報科",
        method: "recommend",
        soccerInfo: "地域リーグ。GK のコーチがいる。",
        criteria: "9教科 32 以上",
        scholarship: "partial",
        reason: "GK を専門に教えてもらえる。",
        status: "planned",
      }),
      choice("p01", 2, {
        school: "県立 青葉ヶ丘高校",
        type: "public",
        course: "普通科",
        method: "general",
        soccerInfo: "県リーグ1部。",
        criteria: "内申 34/45 前後（昨年度の目安）",
        scholarship: "none",
        reason: "学力を生かして公立で続けたい。",
        status: "research",
      }),
      choice("p01", 3, {
        school: "私立 桜台学園高校",
        type: "private",
        course: "普通科（文理）",
        method: "sports",
        soccerInfo: "県リーグ2部。寮あり。",
        criteria: "評定に1がないこと",
        scholarship: "unknown",
        reason: "",
        status: "research",
      }),
    ],
    activities: [
      activity("p01", 1, {
        date: "2026-08-10",
        kind: "practice",
        school: "私立 蒼海高校",
        note: "GK のグループ練習に参加。キックの精度を課題にもらった。",
      }),
      activity("p01", 2, {
        date: "2026-09-12",
        kind: "consult",
        school: "県立 青葉ヶ丘高校",
        note: "個別相談で入試の流れを確認した。",
      }),
    ],
    interviews: [
      interview("p01", 1, {
        date: "2026-09-18",
        participants: ["player", "staff"],
        staff: "藤田",
        note: "GK を続けられる環境を優先したい。学校見学の日程を調整する。",
      }),
    ],
    actions: [
      action("p01", 1, { text: "蒼海高校の入試要項を確認する", due: "2026-09-25", owner: "player", done: true }),
      action("p01", 2, { text: "青葉ヶ丘高校の見学日を決める", due: "2026-10-12", owner: "parent", done: false }),
    ],
    wish: "GK をやれる高校で、レギュラーを取りたい。",
    parentWish: "通学が1時間以内なら私立でもよい。",
    futureGoal: "GK として上のカテゴリーでプレーする。",
    updatedAt: AT,
    updatedBy: STAFF,
  };
  return {
    playerId: "p01",
    // 生年月日は入れない（学年から年齢を引く経路の確認用）
    sex: "male",
    school: "市立 あおぞら中学校",
    termSystem: "3",
    basicUpdatedAt: AT,
    basicUpdatedBy: STAFF,
    measurements: measurements("p01", [[140.5, 35.1], [143.6, 37.0], [146.4, 39.4], [148.9, 41.6], [150.2, 43.2], [151.0, 44.0]]),
    exams: exams(
      "p01",
      1,
      [
        [[70, 64.3], [66, 58.9], [72, 57.2], [68, 59.1], [71, 61.8]],
        [[72, 63.0], [68, 60.2], [75, 56.4], [70, 58.7], [74, 60.9]],
        [[71, 62.5], [70, 59.8], [78, 54.9], [72, 57.3], [76, 60.2]],
        [[74, 63.1], [71, 61.0], [80, 55.6], [73, 58.4], [79, 62.9]],
      ],
      [[39, 186], [33, 186], [27, 184], [22, 184]]
    ),
    reportCards: reportCards(
      "p01",
      1,
      [
        [4, 3, 4, 4, 4, 4, 4, 4, 4],
        [4, 4, 4, 4, 4, 4, 4, 5, 4],
        [4, 4, 5, 4, 4, 4, 4, 5, 4],
      ],
      [[0, 0, 0], [0, 0, 0], [1, 0, 0]],
      ["落ち着いて授業に取り組めています。", "発言が増え、理解を深めています。", "数学で特に力を伸ばしました。"]
    ),
    gradeGoal: {},
    fitnessSessions: [],
    certifications: [cert("p01", { kind: "数検", level: "4級", date: "2025-12-14" })],
    career,
    updatedAt: AT,
    updatedBy: STAFF,
  };
}

/** サンプルを入れる選手の id（名簿にいる選手の分だけ ProfileProvider が入れる） */
export const SAMPLE_PROFILE_IDS = ["p08", "p10", "p01"];

/** 3 人分のサンプル（呼ぶたびに新しいオブジェクトを返す。固定値なので結果は毎回同じ） */
export function sampleProfiles(): Record<string, PlayerProfile> {
  return { p08: p08(), p10: p10(), p01: p01() };
}
