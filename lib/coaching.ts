// コーチ向けダッシュボードの集計＋ルールベースの自動コメント（フェーズ1：AIなし）。
// 将来は lib/ai.ts の AiClient 同様、コメント生成だけを Claude 実装へ差し替えられるよう
// 「集計（純データ）」と「コメント生成（generatePlayerAlerts）」を分離している。

import type {
  AssignmentDeliver,
  CoachDeliverable,
  NoteCondition,
  NotebookEntry,
  Player,
  QuizDeliver,
  SoloNote,
  TeamData,
} from "./types";
import { deliverTargets } from "./types";
import { attendanceRate } from "./teamStats";

export type AlertLevel = "warn" | "info" | "good";
export interface PlayerAlert {
  level: AlertLevel;
  text: string;
}

export interface PlayerKpi {
  playerId: string;
  name: string;
  /** 出席率 %（予定が無ければ null） */
  attendancePct: number | null;
  attendance: { yes: number; total: number };
  noteCount: number;
  /** 最終ノート提出からの経過日数（未提出は null） */
  lastNoteDays: number | null;
  /** 未コメントのノート数 */
  uncommented: number;
  soloCount: number;
  soloStreak: number;
  /** 個人課題 done / total */
  assignmentDone: number;
  assignmentTotal: number;
  /** 理解度テスト平均正答率 %（未回答は null） */
  quizAvgPct: number | null;
  /** 直近のコンディション */
  conditionRecent: NoteCondition | null;
  injuryActive: boolean;
  alerts: PlayerAlert[];
}

export interface TeamSummary {
  players: number;
  avgAttendance: number | null;
  notesThisWeek: number;
  uncommentedTotal: number;
  soloActive: number; // ストリーク継続中の人数
}

const DAY = 86400_000;
function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / DAY);
}
function streakOf(dates: string[]): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const d = new Date();
  if (!set.has(key(d))) {
    d.setDate(d.getDate() - 1);
    if (!set.has(key(d))) return 0;
  }
  let n = 0;
  while (set.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** ルールベースの自動コメント生成（★将来 Claude 実装に差し替え可能な単一関数） */
export function generatePlayerAlerts(k: Omit<PlayerKpi, "alerts">): PlayerAlert[] {
  const a: PlayerAlert[] = [];
  if (k.injuryActive) a.push({ level: "warn", text: "怪我の離脱・復帰途上です。状態を確認しましょう。" });
  if (k.lastNoteDays != null && k.lastNoteDays >= 14)
    a.push({ level: "warn", text: `ノート提出が${k.lastNoteDays}日途絶えています。声かけを。` });
  else if (k.noteCount === 0)
    a.push({ level: "info", text: "まだノートの提出がありません。" });
  if (k.attendancePct != null && k.attendance.total >= 3 && k.attendancePct < 60)
    a.push({ level: "warn", text: `出席率が${k.attendancePct}%に低下しています。` });
  if (k.uncommented > 0)
    a.push({ level: "info", text: `未コメントのノートが${k.uncommented}件あります。` });
  if (k.soloStreak >= 5)
    a.push({ level: "good", text: `自主練が${k.soloStreak}日連続。良い習慣です。` });
  if (k.assignmentTotal > 0 && k.assignmentDone === 0)
    a.push({ level: "info", text: "配布した課題が未達成です。" });
  if (k.quizAvgPct != null && k.quizAvgPct < 50)
    a.push({ level: "warn", text: `理解度テストの正答率が${k.quizAvgPct}%。再共有を推奨。` });
  if (k.conditionRecent === "bad" || k.conditionRecent === "tired")
    a.push({ level: "info", text: "直近のコンディションが低めです。負荷に注意。" });
  if (a.length === 0) a.push({ level: "good", text: "特に問題なし。順調です。" });
  return a;
}

/** 1選手分のKPIを算出 */
export function computePlayerKpi(
  player: Player,
  notebook: NotebookEntry[],
  deliverables: CoachDeliverable[],
  team: TeamData | null
): PlayerKpi {
  const mine = notebook.filter((n) => n.playerId === player.id);
  const att = attendanceRate(team, player.id);
  const solo = mine.filter((n): n is SoloNote => n.kind === "solo");
  const lastTs = mine.reduce((m, n) => Math.max(m, n.ts), 0);

  // 個人課題
  const assignments = deliverables.filter(
    (d): d is AssignmentDeliver => d.kind === "assignment" && deliverTargets(d, player.id)
  );
  const assignmentDone = assignments.filter((d) => d.responses[player.id]?.status === "done").length;

  // 理解度テスト平均
  const quizzes = deliverables.filter(
    (d): d is QuizDeliver => d.kind === "quiz" && deliverTargets(d, player.id) && !!d.responses[player.id]
  );
  let quizAvgPct: number | null = null;
  if (quizzes.length) {
    const rates = quizzes.map((q) => {
      const r = q.responses[player.id];
      const correct = q.questions.reduce((n, qq, i) => n + (r.answers[i] === qq.correct ? 1 : 0), 0);
      return q.questions.length ? correct / q.questions.length : 0;
    });
    quizAvgPct = Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100);
  }

  const recent = [...mine].sort((a, b) => b.ts - a.ts).find((n) => n.condition);

  const base: Omit<PlayerKpi, "alerts"> = {
    playerId: player.id,
    name: player.name,
    attendancePct: att.total ? att.pct : null,
    attendance: { yes: att.yes, total: att.total },
    noteCount: mine.length,
    lastNoteDays: lastTs ? daysSince(lastTs) : null,
    uncommented: mine.filter((n) => !n.staffComment).length,
    soloCount: solo.length,
    soloStreak: streakOf(solo.map((n) => n.date)),
    assignmentDone,
    assignmentTotal: assignments.length,
    quizAvgPct,
    conditionRecent: recent?.condition ?? null,
    injuryActive: !!(player.injuries ?? []).find((x) => x.status !== "ok"),
  };
  return { ...base, alerts: generatePlayerAlerts(base) };
}

/** チーム全体のサマリ */
export function computeTeamSummary(kpis: PlayerKpi[], notebook: NotebookEntry[]): TeamSummary {
  const withAtt = kpis.filter((k) => k.attendancePct != null);
  const weekAgo = Date.now() - 7 * DAY;
  return {
    players: kpis.length,
    avgAttendance: withAtt.length
      ? Math.round(withAtt.reduce((s, k) => s + (k.attendancePct ?? 0), 0) / withAtt.length)
      : null,
    notesThisWeek: notebook.filter((n) => n.ts >= weekAgo).length,
    uncommentedTotal: kpis.reduce((s, k) => s + k.uncommented, 0),
    soloActive: kpis.filter((k) => k.soloStreak > 0).length,
  };
}
