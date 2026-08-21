// 選手個人の通算成績（試合記録 + サッカーノートから算出）。
// シュート/パス/ドリブルの成否判定は lib/teamStatsAgg.ts の aggregateTech に単一ソース化されている
// （NotebookScreen.tsx の playStats と同じ意味論）ため、ここでは重複実装せずそれを再利用する。

import type { MatchRecord, NotebookEntry, Player } from "./types";
import { aggregateTech } from "./teamStatsAgg";

/** ランキング算出時に成功率を対象とする最低試行数（これ未満の選手はそのランキングから除外） */
export const SHOT_PCT_MIN_ATTEMPTS = 3;
export const PASS_PCT_MIN_ATTEMPTS = 10;
export const DRIBBLE_PCT_MIN_ATTEMPTS = 5;

export interface PlayerSeasonStats {
  /** 出場数（lineupに選手が含まれる試合の件数） */
  apps: number;
  goals: number;
  assists: number;
  /** ノート由来の得点（aggregateTechのgoals相当）。shots/shotPctと同じソース(試合ノート)のため、
   * シュート決定率の内訳表示はgoals(試合記録)ではなくこちらを分子に使う（分母とソースを揃える） */
  noteGoals: number;
  shots: number;
  /** シュート決定率(%)。0本のときは null */
  shotPct: number | null;
  passAtt: number;
  /** パス成功率(%)。0本のときは null */
  passPct: number | null;
  dribbleAtt: number;
  /** ドリブル成功率(%)。0本のときは null */
  dribblePct: number | null;
}

/** 選手1人の、試合記録(matches)＋サッカーノート(notebook)からの通算成績 */
export function playerSeasonStats(
  playerId: string,
  matches: MatchRecord[],
  notebook: NotebookEntry[]
): PlayerSeasonStats {
  let apps = 0;
  let goals = 0;
  let assists = 0;
  for (const m of matches) {
    if ((m.lineup ?? []).some((l) => l.playerId === playerId)) apps++;
    for (const g of m.goals) {
      if (g.playerId === playerId) goals++;
      if (g.assistPlayerId === playerId) assists++;
    }
  }
  const tech = aggregateTech(notebook, playerId);
  return {
    apps,
    goals,
    assists,
    noteGoals: tech.goals,
    shots: tech.shots,
    shotPct: tech.shotPct,
    passAtt: tech.pass,
    passPct: tech.passPct,
    dribbleAtt: tech.dribble,
    dribblePct: tech.dribblePct,
  };
}

/** ランキング1件（同値の選手は同順位。次点は人数分スキップする標準的な競技順位方式） */
export interface RankingEntry {
  rank: number;
  playerId: string;
  name: string;
  value: number;
}

export interface PlayerRankings {
  goals: RankingEntry[];
  assists: RankingEntry[];
  /** シュート決定率。シュート SHOT_PCT_MIN_ATTEMPTS 本以上の選手のみ対象 */
  shotPct: RankingEntry[];
  /** パス成功率。パス試行 PASS_PCT_MIN_ATTEMPTS 本以上の選手のみ対象 */
  passPct: RankingEntry[];
  /** ドリブル成功率。ドリブル試行 DRIBBLE_PCT_MIN_ATTEMPTS 本以上の選手のみ対象 */
  dribblePct: RankingEntry[];
  apps: RankingEntry[];
}

interface Row {
  playerId: string;
  name: string;
  stats: PlayerSeasonStats;
}

/** 降順ソート＋同値同順位（1,1,3,4...の標準的な競技順位方式）でランキング配列を作る */
function rankBy(rows: Row[], value: (r: Row) => number): RankingEntry[] {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const out: RankingEntry[] = [];
  let prevValue: number | null = null;
  let prevRank = 0;
  sorted.forEach((r, i) => {
    const v = value(r);
    const rank = prevValue !== null && v === prevValue ? prevRank : i + 1;
    out.push({ rank, playerId: r.playerId, name: r.name, value: v });
    prevValue = v;
    prevRank = rank;
  });
  return out;
}

/** 全選手のランキング一式を算出する（得点/アシスト/シュート決定率/パス成功率/ドリブル成功率/出場数） */
export function rankings(
  players: Player[],
  matches: MatchRecord[],
  notebook: NotebookEntry[]
): PlayerRankings {
  const rows: Row[] = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    stats: playerSeasonStats(p.id, matches, notebook),
  }));

  // 0値の選手はどのランキングにも並べない（「未記録」を「最下位」として見せないため）
  return {
    goals: rankBy(
      rows.filter((r) => r.stats.goals > 0),
      (r) => r.stats.goals
    ),
    assists: rankBy(
      rows.filter((r) => r.stats.assists > 0),
      (r) => r.stats.assists
    ),
    shotPct: rankBy(
      rows.filter((r) => r.stats.shots >= SHOT_PCT_MIN_ATTEMPTS && (r.stats.shotPct ?? 0) > 0),
      (r) => r.stats.shotPct ?? 0
    ),
    passPct: rankBy(
      rows.filter((r) => r.stats.passAtt >= PASS_PCT_MIN_ATTEMPTS && (r.stats.passPct ?? 0) > 0),
      (r) => r.stats.passPct ?? 0
    ),
    dribblePct: rankBy(
      rows.filter((r) => r.stats.dribbleAtt >= DRIBBLE_PCT_MIN_ATTEMPTS && (r.stats.dribblePct ?? 0) > 0),
      (r) => r.stats.dribblePct ?? 0
    ),
    apps: rankBy(
      rows.filter((r) => r.stats.apps > 0),
      (r) => r.stats.apps
    ),
  };
}
