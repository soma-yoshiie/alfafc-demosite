/**
 * 選手のプロフィール（記録）：成長・テスト・成績表・進路・基本の補足（player-hub §1）。
 * 別キー soccer_tactics_profile_v1 に Record<playerId, PlayerProfile> で保存する（storage.ts の
 * loadProfiles/saveProfiles、components/ProfileProvider.tsx）。既存の Player（BoardState.players）は
 * 基本情報・体力測定・怪我のまま使い、ここには足さない。
 * 計算（BMI・成長速度・評定平均・得点など）は表示のたびにここの純関数で行い、保存しない。
 */

import type { SchoolStage } from "./types";
import { STAGE_GRADES, gradeLabel } from "./types";
import { localDateStr } from "./dates";

/* ===================== 型（player-hub §1-2） ===================== */

export type Sex = "male" | "female";
/** 3学期制／2学期制 */
export type TermSystem = "3" | "2";
export type Subject = "jp" | "soc" | "math" | "sci" | "eng" | "music" | "art" | "pe" | "tech";

/** 9 教科（通知表の並び） */
export const SUBJECTS: Subject[] = ["jp", "soc", "math", "sci", "eng", "music", "art", "pe", "tech"];
export const SUBJECT_LABEL: Record<Subject, string> = {
  jp: "国語",
  soc: "社会",
  math: "数学",
  sci: "理科",
  eng: "英語",
  music: "音楽",
  art: "美術",
  pe: "保健体育",
  tech: "技術家庭",
};
/** 5 教科（定期テストの合計・内申の 5 科） */
export const MAIN5: Subject[] = ["jp", "soc", "math", "sci", "eng"];
/** 3 教科 */
export const MAIN3: Subject[] = ["jp", "math", "eng"];

/** 成長記録 1 回分（身長・体重・座高） */
export interface Measurement {
  id: string;
  /** 測定日 YYYY-MM-DD */
  date: string;
  height?: number | null;
  weight?: number | null;
  sittingHeight?: number | null;
  note?: string;
  updatedAt: number;
  updatedBy: string;
}

/** 体力測定の測定回の区分（学校の新体力テスト／クラブ測定／その他。メモに残すだけで、得点の計算には使わない） */
export type FitnessSessionKind = "school" | "club" | "other";

/**
 * 体力測定の測定回のメモ（測定日ごとに 1 件。player-hub §3-4）。測定値そのものは既存の Player.fitness
 * （FitnessRecord{testId,value,date}。id 無し）のままで、ここには区分だけを持つ。記録の型に置き場が無く、
 * 戦術ボード側の PlayerDetail／FitnessForm（変えない）とも共有する Player には足さないので、
 * 別キーのプロフィールに置く（id は fitnessSessionId(date)＝日付ごとに 1 件）
 */
export interface FitnessSession {
  id: string;
  /** 測定日 YYYY-MM-DD */
  date: string;
  kind: FitnessSessionKind;
  updatedAt: number;
  updatedBy: string;
}

export type ExamKind = "mid" | "final" | "yearend" | "practice" | "mock" | "other";
export type Judgement = "A" | "B" | "C" | "D" | "E";

/** 定期テスト・模試 1 回分 */
export interface ExamRecord {
  id: string;
  name: string;
  kind: ExamKind;
  /** 実施日 YYYY-MM-DD */
  date: string;
  grade: number;
  /** "1"|"2"|"3"|"前期"|"後期" 等の自由文字列 */
  term: string;
  scores: Partial<Record<Subject, { score: number | null; max?: number | null; avg?: number | null }>>;
  /** 学年順位／人数 */
  rank?: number | null;
  rankOf?: number | null;
  /** 偏差値（模試） */
  deviation?: number | null;
  /** 志望校判定（模試） */
  judgement?: Judgement | null;
  /** 5 教科合計の目標 */
  targetTotal5?: number | null;
  /** 振り返り */
  note?: string;
  updatedAt: number;
  updatedBy: string;
}

/** 通知表 1 学期分（評定 1〜5） */
export interface ReportCard {
  id: string;
  grade: number;
  term: string;
  ratings: Partial<Record<Subject, number | null>>;
  absent?: number | null;
  late?: number | null;
  leftEarly?: number | null;
  comment?: string;
  updatedAt: number;
  updatedBy: string;
}

/** 成績の目標（実績とは別のレコード。数値＋期限＋行動） */
export interface GradeGoal {
  /** 目標の評定平均（例 3.4） */
  targetAvg?: number | null;
  deadlineGrade?: number | null;
  deadlineTerm?: string;
  subjectTargets?: Partial<Record<Subject, number | null>>;
  /** 目標のための行動 */
  actions?: string;
  updatedAt?: number;
  updatedBy?: string;
}

/** 検定・資格（英検など） */
export interface Certification {
  id: string;
  /** 英検 等 */
  kind: string;
  /** 3級 */
  level: string;
  date?: string;
  updatedAt: number;
  updatedBy: string;
}

export type SchoolType = "public" | "private" | "national" | "";
export type AdmissionMethod = "general" | "recommend" | "sports" | "single" | "combined" | "undecided";
export type ChoiceStatus =
  | "research"
  | "planned"
  | "visited"
  | "contacted"
  | "criteria"
  | "applied"
  | "passed"
  | "failed"
  | "declined";
export type Scholarship = "full" | "partial" | "entrance" | "none" | "unknown";

/** 志望校（第 n 希望） */
export interface SchoolChoice {
  id: string;
  rank: number;
  school: string;
  type: SchoolType;
  course?: string;
  method: AdmissionMethod;
  soccerInfo?: string;
  criteria?: string;
  scholarship?: Scholarship;
  reason?: string;
  status: ChoiceStatus;
  updatedAt: number;
  updatedBy: string;
}

export type ActivityKind = "practice" | "selection" | "briefing" | "consult" | "cert" | "other";
export interface CareerActivity {
  id: string;
  date: string;
  kind: ActivityKind;
  school?: string;
  note?: string;
  updatedAt: number;
  updatedBy: string;
}

export type Participant = "player" | "parent" | "staff";
/** 面談記録 */
export interface Interview {
  id: string;
  date: string;
  participants: Participant[];
  /** 担当者 */
  staff?: string;
  note: string;
  updatedAt: number;
  updatedBy: string;
}

/** 次のアクション（期限と担当つき） */
export interface ActionItem {
  id: string;
  text: string;
  due?: string;
  owner?: Participant;
  done?: boolean;
  updatedAt: number;
  updatedBy: string;
}

export type CareerDirection = "highschool" | "youth" | "clubyouth" | "other" | "";
export type Dorm = "ok" | "ng" | "unknown" | "";

export interface Career {
  direction?: CareerDirection;
  area?: string;
  commuteMaxMin?: number | null;
  dorm?: Dorm;
  choices: SchoolChoice[];
  activities: CareerActivity[];
  interviews: Interview[];
  actions: ActionItem[];
  /** 本人の希望 */
  wish?: string;
  /** 保護者の意向 */
  parentWish?: string;
  /** 将来の目標 */
  futureGoal?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface PlayerProfile {
  playerId: string;
  birthDate?: string;
  sex?: Sex;
  /** 在籍校 */
  school?: string;
  termSystem?: TermSystem;
  /** 成長記録（新しい順に表示。保存順は問わない） */
  measurements: Measurement[];
  /** 定期テスト・模試 */
  exams: ExamRecord[];
  /** 通知表 */
  reportCards: ReportCard[];
  /** 成績の目標 */
  gradeGoal: GradeGoal;
  certifications: Certification[];
  /** 体力測定の測定回の区分（測定日ごとに 1 件。測定値は Player.fitness） */
  fitnessSessions: FitnessSession[];
  career: Career;
  updatedAt: number;
  updatedBy: string;
  /** 基本の補足（生年月日・性別・在籍校・学期制）だけの最終更新（player-hub §1-1）。updatedAt は記録の追加・削除でも動くので、
   *  「基本」セクションの「最終更新」にはこちらを使う（選手がテストを 1 件足しただけで基本の更新者が変わらないように） */
  basicUpdatedAt?: number;
  basicUpdatedBy?: string;
}

/** 更新の記録を持つ（ProfileProvider が自動で付ける）項目のキー */
export type ProfileRecordList = "measurements" | "exams" | "reportCards" | "certifications" | "fitnessSessions";
export type CareerItemList = "choices" | "activities" | "interviews" | "actions";

export function emptyCareer(): Career {
  return { choices: [], activities: [], interviews: [], actions: [] };
}

/** 記録の無い選手の空のプロフィール（updatedAt=0・updatedBy=""＝一度も更新されていない）。保存はしない */
export function emptyProfile(playerId: string): PlayerProfile {
  return {
    playerId,
    measurements: [],
    exams: [],
    reportCards: [],
    gradeGoal: {},
    certifications: [],
    fitnessSessions: [],
    career: emptyCareer(),
    updatedAt: 0,
    updatedBy: "",
  };
}

/**
 * 保存データ 1 人分を現行の形に整える（storage.ts の loadProfiles から）。
 * 配列の欠落・形の壊れを補い、中身の各記録は素通し（id を持たない壊れた要素だけ捨てる）。
 * 存在しない選手 id の記録は捨てない（名簿から消えた選手の記録は残す。表示しないだけ。player-hub §1-1）
 */
export function normalizeProfile(raw: unknown, playerId: string): PlayerProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlayerProfile> & Record<string, unknown>;
  const list = <T extends { id?: unknown }>(v: unknown): T[] =>
    Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === "object" && typeof x.id === "string") : [];
  const obj = <T extends object>(v: unknown, fallback: T): T =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback;
  const c = obj<Partial<Career>>(r.career, {});
  return {
    ...(r as object),
    playerId,
    measurements: list<Measurement>(r.measurements).map((m) => ({ ...m })),
    exams: list<ExamRecord>(r.exams).map((e) => ({ ...e, scores: obj(e.scores, {}) })),
    reportCards: list<ReportCard>(r.reportCards).map((c2) => ({ ...c2, ratings: obj(c2.ratings, {}) })),
    gradeGoal: obj<GradeGoal>(r.gradeGoal, {}),
    certifications: list<Certification>(r.certifications),
    fitnessSessions: list<FitnessSession>(r.fitnessSessions).filter(
      (s) => typeof s.date === "string" && FITNESS_SESSION_KINDS.includes(s.kind)
    ),
    career: {
      ...c,
      choices: list<SchoolChoice>(c.choices),
      activities: list<CareerActivity>(c.activities),
      interviews: list<Interview>(c.interviews).map((i) => ({
        ...i,
        participants: Array.isArray(i.participants) ? i.participants : [],
      })),
      actions: list<ActionItem>(c.actions),
    },
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : "",
  };
}

/** 測定回のメモの id（測定日ごとに 1 件なので日付から決める） */
export function fitnessSessionId(date: string): string {
  return `fs_${date}`;
}

/** 新しい記録の id（TeamProvider の nid と同じ作法。プレフィックス_時刻_連番） */
let idSeq = 0;
export function newRecordId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

/** updatedBy の文字列（"staff:名前"／"player"）を画面に出す名前へ（"最終更新 M/D 監督" の「監督」の部分） */
export function updatedByLabel(by: string | undefined): string {
  if (!by) return "";
  if (by === "player") return "選手";
  return by.startsWith("staff:") ? by.slice("staff:".length) : by;
}

/* ===================== ラベル（UI が使う日本語） ===================== */

export const SEX_LABEL: Record<Sex, string> = { male: "男子", female: "女子" };
export const TERM_SYSTEM_LABEL: Record<TermSystem, string> = { "3": "3学期制", "2": "2学期制" };
/** 学期の選択肢（学期制に合わせる。term は自由文字列で持つ） */
export const TERM_OPTIONS: Record<TermSystem, string[]> = { "3": ["1", "2", "3"], "2": ["前期", "後期"] };
/** "1" → "1学期"、"前期" はそのまま */
export function termLabel(term: string): string {
  return /^[0-9]+$/.test(term) ? `${term}学期` : term;
}

export const FITNESS_SESSION_KINDS: FitnessSessionKind[] = ["school", "club", "other"];
export const FITNESS_SESSION_LABEL: Record<FitnessSessionKind, string> = {
  school: "学校の新体力テスト",
  club: "クラブ測定",
  other: "その他",
};

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  mid: "中間テスト",
  final: "期末テスト",
  yearend: "学年末テスト",
  practice: "実力テスト",
  mock: "模試",
  other: "その他",
};
export const JUDGEMENTS: Judgement[] = ["A", "B", "C", "D", "E"];

export const CAREER_DIRECTION_LABEL: Record<Exclude<CareerDirection, "">, string> = {
  highschool: "高校進学",
  youth: "ユース昇格希望",
  clubyouth: "クラブユース",
  other: "その他",
};
export const DORM_LABEL: Record<Exclude<Dorm, "">, string> = { ok: "可", ng: "不可", unknown: "未定" };
export const SCHOOL_TYPE_LABEL: Record<Exclude<SchoolType, "">, string> = {
  public: "公立",
  private: "私立",
  national: "国立",
};
export const ADMISSION_METHOD_LABEL: Record<AdmissionMethod, string> = {
  general: "一般",
  recommend: "推薦",
  sports: "スポーツ推薦",
  single: "単願",
  combined: "併願優遇",
  undecided: "未定",
};
export const SCHOLARSHIP_LABEL: Record<Scholarship, string> = {
  full: "全額免除",
  partial: "一部免除",
  entrance: "入学金のみ",
  none: "なし",
  unknown: "不明",
};
export const CHOICE_STATUS_LABEL: Record<ChoiceStatus, string> = {
  research: "情報収集",
  planned: "練習会予定",
  visited: "練習会参加済",
  contacted: "声かけあり",
  criteria: "推薦基準提示",
  applied: "出願",
  passed: "合格",
  failed: "不合格",
  declined: "辞退",
};
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  practice: "練習会",
  selection: "セレクション",
  briefing: "説明会",
  consult: "個別相談",
  cert: "検定取得",
  other: "その他",
};
export const PARTICIPANT_LABEL: Record<Participant, string> = { player: "本人", parent: "保護者", staff: "スタッフ" };
/** 次のアクションの担当（本人／保護者／スタッフ） */
export const ACTION_OWNER_LABEL = PARTICIPANT_LABEL;

/* ===================== 計算（player-hub §1-3） ===================== */

/** 小数第 2 位を四捨五入して 1 位まで（x.x5 ちょうどの誤差を上へ寄せる） */
function round1(x: number): number {
  return Math.round((x + 1e-9) * 10) / 10;
}

/** "YYYY-MM-DD" → [年, 月, 日]。壊れた文字列は null */
function parseYmd(s: string | undefined | null): [number, number, number] | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? [y, mo, d] : null;
}

/** BMI（小数 1 桁）。中学生に大人向けの判定語は出さない（参考帯は JFA の目標を「目安」として描くだけ） */
export function bmi(height: number | null | undefined, weight: number | null | undefined): number | null {
  if (!height || !weight || height <= 0 || weight <= 0) return null;
  const m = height / 100;
  return round1(weight / (m * m));
}

/** JFA の BMI 目標（U13〜U20）。FP＝フィールドプレーヤー。グラフの「目安」の薄い帯に使う */
export const BMI_TARGET_BAND = { fp: { min: 19.0, max: 23.5 }, gk: { min: 20.5, max: 24.0 } } as const;

/** 成長スパートの目安とする年間の伸び（cm/年。これ以上なら小さく添える） */
export const GROWTH_SPURT_CM_PER_YEAR = 7;
/** 成長速度を出す最小の間隔（日）。これ未満は誤差が大きいので出さない */
export const GROWTH_MIN_DAYS = 60;

/** 2 日付の差（日。b−a）。ローカル日付として数える（toISOString は使わない） */
function daysBetween(a: string, b: string): number | null {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  if (!pa || !pb) return null;
  const ta = new Date(pa[0], pa[1] - 1, pa[2]).getTime();
  const tb = new Date(pb[0], pb[1] - 1, pb[2]).getTime();
  return Math.round((tb - ta) / 86400000);
}

/** 成長速度 cm/年＝(今回−前回の身長) ÷ (間隔の日数÷365)。間隔が 60 日未満・身長が無い・日付が逆のときは null */
export function growthVelocity(
  prev: { date: string; height?: number | null },
  cur: { date: string; height?: number | null }
): number | null {
  if (prev.height == null || cur.height == null) return null;
  const days = daysBetween(prev.date, cur.date);
  if (days == null || days < GROWTH_MIN_DAYS) return null;
  return round1(((cur.height - prev.height) * 365) / days);
}

/**
 * 4 月 1 日時点の満年齢（学校保健統計・新体力テストの「年齢」。年度の 4/1 で数える）。
 * today（既定＝今日）の属する年度（4〜翌3月）の 4/1 時点。生年月日が無い・壊れていれば null
 */
export function ageOnApril1(birthDate: string | undefined | null, today: string = localDateStr()): number | null {
  const b = parseYmd(birthDate);
  const t = parseYmd(today);
  if (!b || !t) return null;
  const fiscalYear = t[1] >= 4 ? t[0] : t[0] - 1;
  // 4/1 に誕生日の人は 4/1 時点でもう 1 つ上（4/2 生まれ以降は未満）
  const hadBirthday = b[1] < 4 || (b[1] === 4 && b[2] <= 1);
  return fiscalYear - b[0] - (hadBirthday ? 0 : 1);
}

/** 学年から見た 4 月 1 日時点の年齢（小1=6 … 中1=12・中2=13・中3=14・高1=15…）。学年が無い・範囲外は null */
export function ageFromGrade(schoolStage: SchoolStage, grade: number | null | undefined): number | null {
  if (grade == null || !STAGE_GRADES[schoolStage].includes(grade)) return null;
  const base: Record<SchoolStage, number> = { elementary: 5, junior: 11, high: 14 };
  return base[schoolStage] + grade;
}

/** 全国平均（令和 6 年度 学校保健統計。年齢は 4/1 時点） */
const NATIONAL_AVG: Record<Sex, Record<number, { height: number; weight: number }>> = {
  male: {
    12: { height: 154.0, weight: 45.3 },
    13: { height: 161.1, weight: 50.5 },
    14: { height: 166.1, weight: 55.0 },
    15: { height: 168.6, weight: 59.0 },
  },
  female: {
    12: { height: 152.3, weight: 44.4 },
    13: { height: 155.0, weight: 47.5 },
    14: { height: 156.4, weight: 49.6 },
    15: { height: 157.1, weight: 51.1 },
  },
};

/** 同年齢の全国平均。範囲外（12〜15 歳以外）・年齢不明は null。sex 未設定は男子で引く（凡例に「（男子の平均）」と添える） */
export function nationalAverage(
  age: number | null | undefined,
  sex?: Sex
): { height: number; weight: number } | null {
  if (age == null) return null;
  return NATIONAL_AVG[sex ?? "male"][age] ?? null;
}

/** 通知表の評定の合計（入力済みの教科だけ足す。subjects 既定＝9 教科） */
export function ratingSum(card: Pick<ReportCard, "ratings">, subjects: Subject[] = SUBJECTS): number {
  return subjects.reduce((s, k) => {
    const v = card.ratings[k];
    return s + (typeof v === "number" ? v : 0);
  }, 0);
}

/** 評定を入力済みの教科数（subjects 既定＝9 教科） */
export function ratingCount(card: Pick<ReportCard, "ratings">, subjects: Subject[] = SUBJECTS): number {
  return subjects.filter((k) => typeof card.ratings[k] === "number").length;
}

export interface RatingAverage {
  /** 評定平均（小数第 2 位を四捨五入した値） */
  avg: number;
  /** 9 教科の合計（入力済みの教科だけ） */
  sum: number;
  /** 入力済みの教科数 */
  n: number;
  /** 9 教科そろっている（そろっていなければ「（n 教科）」と添える） */
  complete: boolean;
}

/**
 * 評定平均＝9 教科合計 ÷ 9。未入力は 0 扱いにせず、9 教科そろっていないときは入力済みの n で割る
 * （complete=false。画面は「（n 教科）」と添える）。1 教科も無ければ null。小数第 2 位を四捨五入
 */
export function ratingAverage(card: Pick<ReportCard, "ratings">): RatingAverage | null {
  const n = ratingCount(card);
  if (n === 0) return null;
  const sum = ratingSum(card);
  return { avg: round1(sum / n), sum, n, complete: n === SUBJECTS.length };
}

/**
 * 目標の評定平均に届く 9 教科合計の下限＝「round1(合計 ÷ 9) ≥ 目標」を満たす最小の合計（player-hub §1-3）。
 * 評定平均の定義（合計 ÷ 9 の小数第 2 位を四捨五入）に合わせて合計を探す
 * （3.4 → 31：31÷9＝3.44→3.4、30÷9＝3.33→3.3／3.6 → 32：32÷9＝3.56→3.6。ceil(目標×9−0.05) だと 3.6〜3.9 で 1 点多くなる）
 */
export function neededSumFor(targetAvg: number): number {
  for (let s = 0; s <= SUBJECTS.length * 5; s++) if (round1(s / SUBJECTS.length) >= targetAvg - 1e-9) return s;
  return Math.ceil(targetAvg * SUBJECTS.length);
}

export interface ExamTotal {
  /** 入力済みの教科の点の合計 */
  total: number;
  /** 入力済みの教科数 */
  n: number;
  /** 入力済みの教科の満点の合計（満点の既定は 100） */
  max: number;
  /** 学年平均の合計（点と平均が両方ある教科だけ）。無ければ null */
  avgTotal: number | null;
  /** 平均との差＝同じ教科どうしで (点の合計 − 平均の合計)。平均が無ければ null */
  diff: number | null;
  /** subjects がすべて入力済み */
  complete: boolean;
}

/** テストの合計（5 教科なら examTotal(exam, MAIN5)、9 教科なら SUBJECTS）と、学年平均との差 */
export function examTotal(exam: Pick<ExamRecord, "scores">, subjects: Subject[]): ExamTotal {
  let total = 0;
  let n = 0;
  let max = 0;
  let pairedScore = 0;
  let pairedAvg = 0;
  let pairs = 0;
  for (const k of subjects) {
    const s = exam.scores[k];
    if (!s || typeof s.score !== "number") continue;
    total += s.score;
    n += 1;
    max += typeof s.max === "number" ? s.max : 100;
    if (typeof s.avg === "number") {
      pairedScore += s.score;
      pairedAvg += s.avg;
      pairs += 1;
    }
  }
  return {
    total,
    n,
    max,
    avgTotal: pairs > 0 ? Math.round(pairedAvg * 10) / 10 : null,
    diff: pairs > 0 ? Math.round((pairedScore - pairedAvg) * 10) / 10 : null,
    complete: n === subjects.length,
  };
}

/* ===================== 学期・通知表・目標の計算（player-hub §3-5〜3-7） ===================== */

/** 学期の並び順（"1"〜"3" は数値、前期=1・後期=2。不明は末尾）。通知表の時系列・表の列の並びに使う */
export function termIndex(term: string | undefined | null): number {
  if (!term) return 99;
  if (/^[0-9]+$/.test(term)) return Number(term);
  if (term === "前期") return 1;
  if (term === "後期") return 2;
  return 99;
}

/** 通知表の時系列の比較（学年 → 学期。古いものが先） */
export function compareCards(a: Pick<ReportCard, "grade" | "term">, b: Pick<ReportCard, "grade" | "term">): number {
  return a.grade - b.grade || termIndex(a.term) - termIndex(b.term);
}

/** テストの並び（新しい順。同じ日付は更新が新しい方を先に） */
export function compareExamsDesc(a: Pick<ExamRecord, "date" | "updatedAt">, b: Pick<ExamRecord, "date" | "updatedAt">): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt;
}

/** 「中1 1学期」（学年のラベル＋学期）。学期が無ければ学年だけ */
export function gradeTermLabel(stage: SchoolStage, grade: number, term?: string | null): string {
  const g = gradeLabel(stage, grade);
  return term ? `${g} ${termLabel(term)}` : g;
}

/**
 * 日付から推定した学期（テスト・通知表のフォームの既定）。
 * 3 学期制＝4〜8 月が 1 学期・9〜12 月が 2 学期・1〜3 月が 3 学期／2 学期制＝4〜9 月が前期・10〜3 月が後期
 */
export function estimateTerm(date: string, system: TermSystem = "3"): string {
  const d = parseYmd(date);
  const m = d ? d[1] : 4;
  if (system === "2") return m >= 4 && m <= 9 ? "前期" : "後期";
  return m >= 4 && m <= 8 ? "1" : m >= 9 && m <= 12 ? "2" : "3";
}

/** 評定の合計。subjects がすべて入力済みのときだけ（そろっていなければ null。途中の合計を並べて「下がった」と見せないため） */
export function ratingSumIfComplete(card: Pick<ReportCard, "ratings">, subjects: Subject[]): number | null {
  return ratingCount(card, subjects) === subjects.length ? ratingSum(card, subjects) : null;
}

export interface GoalProgress {
  /** 目標の評定平均に届く 9 教科合計の下限（3.4 → 31） */
  needed: number;
  /** 現在の 9 教科合計（入力済みの教科だけ） */
  sum: number;
  /** 入力済みの教科数 */
  n: number;
  /** 9 教科そろっている */
  complete: boolean;
  /** あと何点（そろっていて未達のとき。達成済みは 0。教科が足りなければ null） */
  gap: number | null;
  /** 9 教科そろっていて合計が下限以上 */
  reached: boolean;
}

/** 成績の目標に対する現在地（目標 3.4 → 合計 31、あと n）。card は現在の（最新の）通知表 */
export function goalProgress(card: Pick<ReportCard, "ratings">, targetAvg: number): GoalProgress {
  const needed = neededSumFor(targetAvg);
  const sum = ratingSum(card);
  const n = ratingCount(card);
  const complete = n === SUBJECTS.length;
  return { needed, sum, n, complete, gap: complete ? Math.max(0, needed - sum) : null, reached: complete && sum >= needed };
}
