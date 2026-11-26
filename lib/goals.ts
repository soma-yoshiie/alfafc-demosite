/**
 * 目標（夢から今日までを 6 段でつなぐ。specs/goals.md §1）の型と純粋な関数。
 * - 夢は進路の「将来の目標」（PlayerProfile.career.futureGoal）そのもの。ここには写しを持たない。
 * - 成績の目標（PlayerProfile.gradeGoal）は写さずに読んで出す（ladderRows の gradeLine）。
 * - 週は月曜始まり（lib/dates.ts の weekStart）。日付は端末の時刻（YYYY-MM-DD の文字列）で扱う。
 */

import type { NotebookEntry, Player, SchoolStage } from "./types";
import { addDaysStr, weekStart } from "./dates";
import type { PlayerProfile } from "./profile";
import { gradeTermLabel } from "./profile";

export type GoalLevel = "long" | "mid" | "year" | "month" | "week";
export type GoalStatus = "active" | "done" | "changed";
export type GoalReview = "done" | "half" | "notyet";

export interface Goal {
  id: string;
  level: GoalLevel;
  /** 同じ段の中の並び（今年の 3 つ、足した段の順） */
  order: number;
  text: string;
  /** YYYY-MM-DD */
  due?: string;
  /** 今週＝その週の月曜（YYYY-MM-DD）、今月＝YYYY-MM */
  period?: string;
  /** 今週だけ */
  ifThen?: string;
  /** 続けている・達成した・変えた（変えた物も消さずに残す） */
  status: GoalStatus;
  /** 週・月の見直しの結果（できた・半分・まだ） */
  review?: GoalReview;
  doneAt?: number;
  createdAt: number;
  updatedAt: number;
  /** "player" か "staff:名前"（プロフィールと同じ書き方） */
  updatedBy: string;
}

/** スタッフのひとこと */
export interface GoalNote {
  id: string;
  goalId: string;
  text: string;
  by: string;
  ts: number;
}

export interface PlayerGoals {
  playerId: string;
  /** 大きな目標の段の表示名（無ければ学校区分の既定） */
  longLabel?: string;
  goals: Goal[];
  staffNotes: GoalNote[];
  /** はじめての設定を終えたか */
  setupDone?: boolean;
  /** はじめての設定を「あとで書く」で途中にしたか（続きの入口の名前を「続きを書く」にする。終えたら消す） */
  setupStarted?: boolean;
  /** 目標の画面の見せ方（試作の切り替え。既定 ladder） */
  view?: "ladder" | "stairs";
  updatedAt: number;
}

/** 足せる段（「そのために」）・今年の目標の上限 */
export const MAX_MID = 3;
export const MAX_YEAR = 3;

export const LEVEL_LABEL: Record<GoalLevel, string> = {
  long: "高校",
  mid: "そのために",
  year: "今年",
  month: "今月",
  week: "今週",
};

export function emptyGoals(playerId: string): PlayerGoals {
  return { playerId, goals: [], staffNotes: [], updatedAt: 0 };
}

const LEVELS: GoalLevel[] = ["long", "mid", "year", "month", "week"];

/** 保存から読んだ値の形の壊れを補う（配列が無ければ空。捨てずに残す） */
export function normalizeGoals(raw: unknown, playerId: string): PlayerGoals {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const num = (v: unknown, d: number): number => (typeof v === "number" && isFinite(v) ? v : d);
  const goals = (Array.isArray(r.goals) ? r.goals : []).filter(
    (g): g is Goal =>
      !!g && typeof g === "object" && typeof (g as Goal).id === "string" && LEVELS.includes((g as Goal).level)
  );
  const staffNotes = (Array.isArray(r.staffNotes) ? r.staffNotes : []).filter(
    (n): n is GoalNote =>
      !!n &&
      typeof n === "object" &&
      typeof (n as GoalNote).id === "string" &&
      typeof (n as GoalNote).text === "string" &&
      typeof (n as GoalNote).goalId === "string"
  );
  return {
    playerId,
    longLabel: typeof r.longLabel === "string" && r.longLabel ? r.longLabel : undefined,
    goals: goals.map((g) => ({
      ...g,
      text: typeof g.text === "string" ? g.text : "",
      order: num(g.order, 0),
      due: str(g.due),
      period: str(g.period),
      ifThen: str(g.ifThen),
      review: g.review === "done" || g.review === "half" || g.review === "notyet" ? g.review : undefined,
      doneAt: typeof g.doneAt === "number" ? g.doneAt : undefined,
      createdAt: num(g.createdAt, 0),
      updatedAt: num(g.updatedAt, 0),
      updatedBy: str(g.updatedBy) ?? "player",
      status: g.status === "done" || g.status === "changed" ? g.status : "active",
    })),
    staffNotes: staffNotes.map((n) => ({ ...n, by: str(n.by) ?? "", ts: num(n.ts, 0) })),
    setupDone: r.setupDone === true ? true : undefined,
    setupStarted: r.setupStarted === true ? true : undefined,
    view: r.view === "stairs" ? "stairs" : r.view === "ladder" ? "ladder" : undefined,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
  };
}

export function newGoalId(): string {
  return "goal_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

/* ===================== 日付 ===================== */

/** その日が入る年度の終わり（3/31）。1〜3 月はその年の 3/31、4 月以降は翌年の 3/31 */
export function schoolYearEnd(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return `${m <= 3 ? y : y + 1}-03-31`;
}

/**
 * 大きな目標の期限の既定（年と月）：今の学校を卒業する年の 3 月。
 * 中2 の 11 月なら、今の年度の終わり（翌年 3 月）の 1 年後。学年が分からないときは今の年度の終わりの 1 年後
 */
export function defaultLongDue(today: string, stage: SchoolStage, grade: number | null | undefined): [number, number] {
  const endY = Number(schoolYearEnd(today).slice(0, 4));
  const last = stage === "elementary" ? 6 : 3;
  const left = typeof grade === "number" && grade >= 1 && grade <= last ? last - grade : 1;
  return [endY + left, 3];
}

/** YYYY-MM-DD → YYYY-MM */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** その月の末日（YYYY-MM-DD） */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WD[new Date(y, m - 1, d).getDay()];
}

/** 「2028 年 3 月」 */
export function fmtYM(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}
/** 「11 月」 */
export function fmtMonthOnly(ym: string): string {
  return `${Number(ym.split("-")[1])} 月`;
}
/** 「11/23〜11/29」（月曜から日曜） */
export function fmtWeekRange(monday: string): string {
  const s = monday.split("-").map(Number);
  const e = addDaysStr(monday, 6).split("-").map(Number);
  return `${s[1]}/${s[2]}〜${e[1]}/${e[2]}`;
}
/** 「11/26（木）」 */
export function fmtDayWd(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${weekdayOf(date)}）`;
}

/* ===================== 選び出し（どれも status:"active" の物） ===================== */

const byOrder = (a: Goal, b: Goal) => a.order - b.order || a.createdAt - b.createdAt;
const active = (pg: PlayerGoals, level: GoalLevel) =>
  pg.goals.filter((g) => g.level === level && g.status === "active");

export function weekGoalFor(pg: PlayerGoals, date: string): Goal | undefined {
  const mon = weekStart(date);
  return active(pg, "week").find((g) => g.period === mon);
}
/** その日が入る週の目標（続けている物と、達成した物。「変えた」は除く。ノートの帯と goalId 用） */
export function bandGoalFor(pg: PlayerGoals, date: string): Goal | undefined {
  const mon = weekStart(date);
  const w = pg.goals.filter((g) => g.level === "week" && g.period === mon && g.status !== "changed");
  return w.find((g) => g.status === "active") ?? w.find((g) => g.status === "done");
}
export function monthGoalFor(pg: PlayerGoals, ym: string): Goal | undefined {
  return active(pg, "month").find((g) => g.period === ym);
}
export function longGoal(pg: PlayerGoals): Goal | undefined {
  return active(pg, "long").sort(byOrder)[0];
}
export function midGoals(pg: PlayerGoals): Goal[] {
  return active(pg, "mid").sort(byOrder);
}
/** 画面に出す足した段：続けている物に、3 つまでに収まるぶんの達成した物を足す（今年の段と同じ補い） */
export function midShown(pg: PlayerGoals): Goal[] {
  const a = midGoals(pg);
  const d = pg.goals
    .filter((g) => g.level === "mid" && g.status === "done")
    .sort((x, y) => (y.doneAt ?? 0) - (x.doneAt ?? 0))
    .slice(0, Math.max(0, MAX_MID - a.length))
    .sort(byOrder);
  return [...a, ...d].sort(byOrder);
}
export function yearGoals(pg: PlayerGoals): Goal[] {
  return active(pg, "year").sort(byOrder);
}

/** その週より前でいちばん新しい週の目標（「変えた」は除く。見直しの対象） */
export function prevWeekGoal(pg: PlayerGoals, date: string): Goal | undefined {
  const mon = weekStart(date);
  return pg.goals
    .filter((g) => g.level === "week" && g.status !== "changed" && g.period && g.period < mon)
    .sort((a, b) => (a.period! < b.period! ? 1 : a.period! > b.period! ? -1 : b.updatedAt - a.updatedAt))[0];
}
/** その月より前でいちばん新しい月の目標 */
export function prevMonthGoal(pg: PlayerGoals, ym: string): Goal | undefined {
  return pg.goals
    .filter((g) => g.level === "month" && g.status !== "changed" && g.period && g.period < ym)
    .sort((a, b) => (a.period! < b.period! ? 1 : a.period! > b.period! ? -1 : b.updatedAt - a.updatedAt))[0];
}

/** 今週の目標が無い（見直しを出す） */
export function needsWeekReview(pg: PlayerGoals, today: string): boolean {
  return !weekGoalFor(pg, today);
}
export function needsMonthReview(pg: PlayerGoals, today: string): boolean {
  return !monthGoalFor(pg, monthOf(today));
}

/** 大きな目標の段の既定の表示名（学校区分から） */
export function defaultLongLabel(stage: SchoolStage): string {
  return stage === "elementary" ? "中学" : stage === "junior" ? "高校" : "卒業後";
}
export function longLabelOf(pg: PlayerGoals, stage: SchoolStage): string {
  return pg.longLabel || defaultLongLabel(stage);
}

/* ===================== ノートとのつなぎ ===================== */

/** そのノートの「今日意識したこと」（練習は goalPre、試合・自主練は focus） */
export function noteFocus(n: NotebookEntry): string {
  const t = n.kind === "practice" ? n.goalPre : n.focus;
  return (t ?? "").trim();
}

export interface WeekDay {
  date: string;
  /** 月〜日 */
  label: string;
  /** その日のその選手のノート（提出済みの物） */
  notes: NotebookEntry[];
  /** ノートを書いた日 */
  written: boolean;
  /** その日の今日意識したこと（最初に入っている物。無ければ空） */
  focus: string;
  /** 練習ノートの達成度（無ければ undefined） */
  achievement?: number;
}

/** 月曜から日曜の 7 日ぶん：その日のノート・今日意識したこと・達成度 */
export function weekDays(notes: NotebookEntry[], playerId: string, monday: string): WeekDay[] {
  const mine = notes.filter((n) => n.playerId === playerId);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDaysStr(monday, i);
    const dn = mine.filter((n) => n.date === date).sort((a, b) => a.ts - b.ts);
    const focus = dn.map(noteFocus).find((t) => t) ?? "";
    const ach = dn.find((n) => n.kind === "practice" && typeof n.achievement === "number");
    return {
      date,
      label: WD[(i + 1) % 7],
      notes: dn,
      written: dn.length > 0,
      focus,
      achievement: ach && ach.kind === "practice" ? ach.achievement : undefined,
    };
  });
}

/* ===================== 画面の段の並び ===================== */

export type LadderKind = "dream" | "long" | "mid" | "year" | "month" | "week" | "today";

export interface LadderRow {
  key: string;
  kind: LadderKind;
  /** ラベル（「夢」「高校」「そのために」「今年」「今月」「今週」「今日」） */
  label: string;
  /** 文（空の段は空） */
  text: string;
  /** 期限の表示（「2028 年 3 月」「11 月」「11/23〜11/29」「11/26（木）」。無ければ空） */
  due: string;
  /** この段の目標（夢・今日には無い） */
  goal?: Goal;
  /** 空の段（「＋ 高校の目標を書く」の行になる） */
  empty: boolean;
  /** 達成した目標の段 */
  done: boolean;
  /** 達成の日（「11/20 に達成」） */
  doneLabel?: string;
  /** 成績の目標の 1 行（成績表の目標。押すと成績表へ） */
  gradeLine?: string;
  /** 今週の「もし〜なら」 */
  ifThen?: string;
  /** その段（目標）に付いたスタッフのひとこと（最新の 1 件） */
  staffNote?: GoalNote;
}

function gradeGoalLine(profile: PlayerProfile, stage: SchoolStage): string {
  const gg = profile.gradeGoal;
  if (gg.targetAvg == null) return "";
  const avg = `評定平均 ${gg.targetAvg.toFixed(1)}`;
  if (gg.deadlineGrade != null) return `${avg}（${gradeTermLabel(stage, gg.deadlineGrade, gg.deadlineTerm)}まで）`;
  return `${avg}（成績表の目標）`;
}

/** 成績の目標の分け方（一覧用）：文「評定平均 3.4」・期限「中3 2学期まで」・今の学年の「今年」に置くか */
export function gradeGoalParts(
  profile: PlayerProfile,
  stage: SchoolStage,
  player: Player | undefined
): { text: string; due: string; inYear: boolean } | null {
  const gg = profile.gradeGoal;
  if (gg.targetAvg == null) return null;
  return {
    text: `評定平均 ${gg.targetAvg.toFixed(1)}`,
    due: gg.deadlineGrade != null ? `${gradeTermLabel(stage, gg.deadlineGrade, gg.deadlineTerm)}まで` : "",
    inYear: player?.grade != null && gg.deadlineGrade === player.grade,
  };
}

/**
 * 画面に出す段の並び：夢 → 大きな目標 → 足した段 → 今年 → 今月 → 今週 → 今日。
 * 空の段も 1 行として返す（夢・大きな目標・今年・今月・今週。足した段は無ければ出さない）。
 * 今日の段の文は呼ぶ側が weekDays から入れる（ノートを持たないため。text は空で返す）
 */
export function ladderRows(
  pg: PlayerGoals,
  profile: PlayerProfile,
  player: Player | undefined,
  today: string,
  stage: SchoolStage = "junior"
): LadderRow[] {
  const rows: LadderRow[] = [];
  const noteFor = (g?: Goal) =>
    g ? [...pg.staffNotes].filter((n) => n.goalId === g.id).sort((a, b) => b.ts - a.ts)[0] : undefined;
  const doneLabel = (g: Goal) => {
    if (g.status !== "done" || !g.doneAt) return undefined;
    const d = new Date(g.doneAt);
    return `${d.getMonth() + 1}/${d.getDate()} に達成`;
  };
  const mk = (kind: LadderKind, g: Goal | undefined, due: string, extra: Partial<LadderRow> = {}): LadderRow => ({
    key: g ? g.id : kind,
    kind,
    label: kind === "long" ? longLabelOf(pg, stage) : LEVEL_LABEL[kind as GoalLevel] ?? "",
    text: g?.text ?? "",
    due: g ? due : "",
    goal: g,
    empty: !g,
    done: g?.status === "done",
    doneLabel: g ? doneLabel(g) : undefined,
    staffNote: noteFor(g),
    ...extra,
  });

  // 成績の目標：期限の学年が今の学年なら「今年」、それより先（または期限なし）なら大きな目標の段
  const gradeLine = gradeGoalLine(profile, stage);
  const gradeInYear =
    gradeLine !== "" && player?.grade != null && profile.gradeGoal.deadlineGrade === player.grade;

  // 夢（進路の将来の目標）
  const dream = (profile.career.futureGoal ?? "").trim();
  rows.push({ key: "dream", kind: "dream", label: "夢", text: dream, due: "", empty: !dream, done: false });

  // 大きな目標（active が無ければ、達成した最新の物）
  const lg = longGoal(pg) ?? latestDone(pg, "long");
  rows.push(
    mk("long", lg, lg?.due ? fmtYM(lg.due) : "", {
      gradeLine: gradeLine && !gradeInYear ? gradeLine : undefined,
    })
  );

  // 足した段
  for (const g of midShown(pg)) rows.push(mk("mid", g, g.due ? fmtYM(g.due) : ""));

  // 今年：active と、達成した物（3 つまでに収まるぶん）
  const ya = yearGoals(pg);
  const yd = pg.goals
    .filter((g) => g.level === "year" && g.status === "done")
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    .slice(0, Math.max(0, MAX_YEAR - ya.length));
  const ys = [...ya, ...yd];
  if (ys.length === 0) {
    rows.push(mk("year", undefined, "", { gradeLine: gradeInYear ? gradeLine : undefined }));
  } else {
    ys.forEach((g, i) =>
      rows.push(mk("year", g, g.due ? fmtYM(g.due) : "", { gradeLine: gradeInYear && i === 0 ? gradeLine : undefined }))
    );
  }

  // 今月・今週（その期間の active。無ければ、その期間に達成した物）
  const ym = monthOf(today);
  const mg = monthGoalFor(pg, ym) ?? pg.goals.find((g) => g.level === "month" && g.status === "done" && g.period === ym);
  rows.push(mk("month", mg, fmtMonthOnly(ym)));
  const mon = weekStart(today);
  const wg = weekGoalFor(pg, today) ?? pg.goals.find((g) => g.level === "week" && g.status === "done" && g.period === mon);
  rows.push(mk("week", wg, fmtWeekRange(mon), { ifThen: wg?.ifThen }));

  // 今日
  rows.push({ key: "today", kind: "today", label: "今日", text: "", due: fmtDayWd(today), empty: false, done: false });
  return rows;
}

function latestDone(pg: PlayerGoals, level: GoalLevel): Goal | undefined {
  return pg.goals
    .filter((g) => g.level === level && g.status === "done")
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))[0];
}

/** はじめての設定がまだ終わっていないか（終えておらず、今週の目標をまだ 1 つも書いていない。何か書いてあるとき） */
export function setupUnfinished(pg: PlayerGoals, profile: PlayerProfile): boolean {
  if (pg.setupDone) return false;
  if (pg.goals.some((g) => g.level === "week")) return false;
  return !!(profile.career.futureGoal ?? "").trim() || pg.goals.length > 0;
}
/**
 * 設定の入口の名前：途中まで書いた（「あとで書く」を押した・目標を 1 つでも保存した）なら「続きを書く」、
 * 進路の夢があるだけで設定を始めていなければ「目標を決める」（判断 18・27）
 */
export function setupEntryLabel(pg: PlayerGoals): string {
  return pg.setupStarted || pg.goals.length > 0 ? "続きを書く" : "目標を決める";
}

/** 何も無いか（夢が無く、「変えた」以外の目標も 1 つも無い。「目標はまだありません」。判断 13） */
export function isBlank(pg: PlayerGoals, profile: PlayerProfile): boolean {
  const dream = (profile.career.futureGoal ?? "").trim();
  return !dream && !pg.goals.some((g) => g.status !== "changed");
}
