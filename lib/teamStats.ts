import type { Player, TeamData } from "./types";
import { localDateStr } from "./dates";
import { eventTargetsPlayer } from "./groups";

/**
 * 選手の出席率。
 * 出欠はスタッフが記録する運用のため、母数は「今日までの予定のうち
 * 出欠が記録されているもの」に限定する（未来の予定や未記録の予定を
 * 欠席扱いにすると、記録を始めた直後に出席率が不当に低く出るため）。
 * groups-everywhere §4: さらに「その選手が対象の予定」だけに絞る（2年生の出席率が
 * 3年生の練習で下がらない）。判定にはPlayer本体（grade/groupIds）が要るため、
 * players（名簿）を渡す。Phase D-1(C1-minor): 以前はplayers省略時に絞り込みが黙って
 * 無効化される既定値`= []`だったため、将来の呼び出しが引数を忘れても型エラーにならず
 * 画面ごとに出席率が食い違う退行が起き得た。既存の全呼び出しは渡しているため、必須化しても
 * 影響は無い
 */
export function attendanceRate(
  team: TeamData | null,
  playerId: string,
  players: Player[]
): { yes: number; total: number; pct: number } {
  if (!team) return { yes: 0, total: 0, pct: 0 };
  const today = localDateStr();
  const player = players.find((p) => p.id === playerId);
  const groups = team.groups ?? [];
  let total = 0;
  let yes = 0;
  team.events.forEach((e) => {
    if (e.date > today) return;
    if (player && !eventTargetsPlayer(e, player, groups)) return;
    const entry = team.attendance[e.id]?.[playerId];
    if (!entry?.status) return;
    total++;
    if (entry.status === "yes") yes++;
  });
  return { yes, total, pct: total ? Math.round((yes / total) * 100) : 0 };
}
