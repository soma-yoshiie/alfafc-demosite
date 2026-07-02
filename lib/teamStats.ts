import type { TeamData } from "./types";

/** 選手の出席率（yes / 全予定） */
export function attendanceRate(
  team: TeamData | null,
  playerId: string
): { yes: number; total: number; pct: number } {
  if (!team) return { yes: 0, total: 0, pct: 0 };
  const total = team.events.length;
  let yes = 0;
  team.events.forEach((e) => {
    if (team.attendance[e.id]?.[playerId]?.status === "yes") yes++;
  });
  return { yes, total, pct: total ? Math.round((yes / total) * 100) : 0 };
}
