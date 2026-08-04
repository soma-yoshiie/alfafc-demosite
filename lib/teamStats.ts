import type { TeamData } from "./types";
import { localDateStr } from "./dates";

/**
 * 選手の出席率。
 * 出欠はスタッフが記録する運用のため、母数は「今日までの予定のうち
 * 出欠が記録されているもの」に限定する（未来の予定や未記録の予定を
 * 欠席扱いにすると、記録を始めた直後に出席率が不当に低く出るため）。
 */
export function attendanceRate(
  team: TeamData | null,
  playerId: string
): { yes: number; total: number; pct: number } {
  if (!team) return { yes: 0, total: 0, pct: 0 };
  const today = localDateStr();
  let total = 0;
  let yes = 0;
  team.events.forEach((e) => {
    if (e.date > today) return;
    const entry = team.attendance[e.id]?.[playerId];
    if (!entry?.status) return;
    total++;
    if (entry.status === "yes") yes++;
  });
  return { yes, total, pct: total ? Math.round((yes / total) * 100) : 0 };
}
