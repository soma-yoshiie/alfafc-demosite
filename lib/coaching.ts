// コーチ向けダッシュボードの集計＋ルールベースの自動コメント（AIなし）。
// 「集計（純データ）」と「コメント生成（generatePlayerAlerts）」を分離している。

import type {
  AssignmentDeliver,
  CoachDeliverable,
  NoteCondition,
  NotebookEntry,
  Player,
  SoloNote,
  TeamData,
} from "./types";
import { deliverTargets } from "./types";
import { localDateStr, weekStart, weeklyStreak } from "./dates";
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
  /** 自主練の連続週数 */
  soloStreak: number;
  /** 個人課題 done / total */
  assignmentDone: number;
  assignmentTotal: number;
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
    a.push({ level: "good", text: `自主練が${k.soloStreak}週連続。良い習慣です。` });
  if (k.assignmentTotal > 0 && k.assignmentDone === 0)
    a.push({ level: "info", text: "配布した課題が未達成です。" });
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
    soloStreak: weeklyStreak(solo.map((n) => n.date)),
    assignmentDone,
    assignmentTotal: assignments.length,
    conditionRecent: recent?.condition ?? null,
    injuryActive: !!(player.injuries ?? []).find((x) => x.status !== "ok"),
  };
  return { ...base, alerts: generatePlayerAlerts(base) };
}

/** チーム全体のサマリ */
export function computeTeamSummary(kpis: PlayerKpi[], notebook: NotebookEntry[]): TeamSummary {
  const withAtt = kpis.filter((k) => k.attendancePct != null);
  // 「今週」= 月曜始まりのカレンダー週（前週比デルタと同一定義に揃える）
  const monday = weekStart(localDateStr());
  return {
    players: kpis.length,
    avgAttendance: withAtt.length
      ? Math.round(withAtt.reduce((s, k) => s + (k.attendancePct ?? 0), 0) / withAtt.length)
      : null,
    notesThisWeek: notebook.filter((n) => n.date >= monday).length,
    uncommentedTotal: kpis.reduce((s, k) => s + k.uncommented, 0),
    soloActive: kpis.filter((k) => k.soloStreak > 0).length,
  };
}
