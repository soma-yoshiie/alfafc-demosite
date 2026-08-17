// PCコーチホーム「マッチデー・ボード」区画3(チームパルス)専用の週次/月次シリーズ集計。
// 既存集計(lib/dates.weeklyCounts / lib/teamStats.attendanceRate / TeamHub.matchMonthlyTrend / teamStatsAgg.aggregateTech)
// と同じ意味論を保ちながら、HomeMenu が直接使える純関数として提供する（TeamHub側の内部実装は変更しない）。

import { addDaysStr, localDateStr, weekStart, weeklyCounts } from "./dates";
import type { MatchRecord, NotebookEntry, MatchNote, Player, TeamData } from "./types";

export interface TrendPoint {
  label: string;
  /** その週/月の母数(対象件数)が0＝欠測のときは null（0%と区別する） */
  value: number | null;
}

/** 直近n週(既定7・月曜始まり)のノート提出件数(全種別・ノート日付n.dateで週判定。lib/coaching.ts の週集計と同じ基準) */
export function weeklyNoteCounts(notebook: NotebookEntry[], weeks = 7): TrendPoint[] {
  return weeklyCounts(
    notebook.map((n) => n.date),
    weeks
  );
}

/**
 * 直近n週(既定7・月曜始まり)の平均出席率(%)。
 * 週内の予定のうち出欠が記録されているものだけを母数にする
 * （lib/teamStats.attendanceRate と同じ「未来日・未記録は母数に含めない」意味論を週単位に適用）。
 * 母数(記録件数)が0の週は欠測として null を返す。
 */
export function weeklyAttendancePct(
  team: TeamData | null,
  players: Player[],
  weeks = 7
): TrendPoint[] {
  const today = localDateStr();
  const thisMonday = weekStart(today);
  return Array.from({ length: weeks }, (_, k) => {
    const monday = addDaysStr(thisMonday, -7 * (weeks - 1 - k));
    const sunday = addDaysStr(monday, 6);
    const [, m, d] = monday.split("-").map(Number);
    const label = `${m}/${d}`;
    let yes = 0;
    let total = 0;
    if (team) {
      team.events.forEach((e) => {
        if (e.date < monday || e.date > sunday || e.date > today) return;
        players.forEach((p) => {
          const entry = team.attendance[e.id]?.[p.id];
          if (!entry?.status) return;
          total++;
          if (entry.status === "yes") yes++;
        });
      });
    }
    return { label, value: total ? Math.round((yes / total) * 100) : null };
  });
}

/**
 * 直近nヶ月(既定7)・月別勝率(%)。ラベルは「M月」（TeamHub.matchMonthlyTrend の winPct と同じ意味論）
 * 試合が0件の月は欠測として null を返す。
 */
export function monthlyWinPct(matches: MatchRecord[], months = 7): TrendPoint[] {
  const today = localDateStr();
  const [ty, tm] = today.split("-").map(Number);
  const rows: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(ty, tm - 1 - i, 1);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const ms = matches.filter((mm) => mm.date.startsWith(ym));
    const wins = ms.filter((mm) => mm.ourScore > mm.theirScore).length;
    rows.push({ label: `${m}月`, value: ms.length ? Math.round((wins / ms.length) * 100) : null });
  }
  return rows;
}

/**
 * 直近n週(既定7・月曜始まり)のシュート決定率(%)。
 * 試合ノート(kind:"match")の plays(kind:"shot")をノート日付(n.date)基準で週集計する
 * （teamStatsAgg.aggregateTech と同じ成否判定＝scored===trueを決定扱い）。
 * シュート0本の週は欠測として null を返す。
 */
export function weeklyShotPct(notebook: NotebookEntry[], weeks = 7): TrendPoint[] {
  const thisMonday = weekStart(localDateStr());
  const notes = notebook.filter((n): n is MatchNote => n.kind === "match");
  return Array.from({ length: weeks }, (_, k) => {
    const monday = addDaysStr(thisMonday, -7 * (weeks - 1 - k));
    const sunday = addDaysStr(monday, 6);
    const [, m, d] = monday.split("-").map(Number);
    const weekNotes = notes.filter((n) => n.date >= monday && n.date <= sunday);
    const shots = weekNotes.flatMap((n) => n.plays ?? []).filter((p) => p.kind === "shot");
    const goals = shots.filter((p) => p.scored === true).length;
    return { label: `${m}/${d}`, value: shots.length ? Math.round((goals / shots.length) * 100) : null };
  });
}
