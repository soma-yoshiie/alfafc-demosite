import { localDateStr } from "./dates";
import { SAMPLE_LEAGUE_COMPETITION_ID, SAMPLE_LEAGUE_NAME, sampleMatches } from "./sampleMatches";
import { SAMPLE_TEAM_NAME } from "./sampleTeam";
import type { LeagueResult, LeagueRow, LeagueTable, MatchRecord } from "./types";

/*
 * デモ用のリーグ順位表（13 チーム。4 節まで終わった途中の表）。
 * demo-data-consistency §2: 以前は 勝・分・敗・得点・失点 を手で書いた表（自チーム 12 試合 6 勝 4 分 2 敗・勝点 22）で、
 * 試合記録のリーグ戦（4 試合 2 勝 1 分 1 敗）と食い違っていた。今は「試合結果から作る」（p16 §6）の形にし、
 * - 自チームの結果 … 試合記録（lib/sampleMatches.ts）のリーグ戦から、順位表の編集の「試合記録から取り込む」と同じ形で作る
 * - ほかのチームどうしの結果 … 下の LEAGUE_ROUNDS（節ごと。各節は自チームの試合と同じ日）
 * - 勝・分・敗・得点・失点 … rowsFromResults で数える（手で書かない）。試合数・勝点・得失差・順位は computeStandings
 * 自チームの行（own:true。表示名は呼び出し側でチーム名へ差し替える）は 3 位になる。
 * 対戦相手名は試合記録の opponent と同じ表記にする（取り込みは前後の空白を除いた完全一致）。
 */
const LEAGUE_TEAMS: { id: string; name: string; own?: true }[] = [
  { id: "lg01", name: "青葉SC" },
  { id: "lg02", name: "白鷺FC" },
  { id: "lg03", name: SAMPLE_TEAM_NAME, own: true },
  { id: "lg04", name: "コスモスJFC" },
  { id: "lg05", name: "松風JFC" },
  { id: "lg06", name: "高砂フットボールクラブ" },
  { id: "lg07", name: "湾岸イーグルスFC" },
  { id: "lg08", name: "さくら台SC" },
  { id: "lg09", name: "東ヶ丘少年団" },
  { id: "lg10", name: "みどり台SC" },
  { id: "lg11", name: "北原フットボールクラブ" },
  { id: "lg12", name: "野末少年団" },
  { id: "lg13", name: "六甲ジュニアFC" },
];

/**
 * 自チーム以外の結果（[A, B, A の点, B の点]）。1 節 5 試合＋自チームの 1 試合＝6 試合で、13 チームなので毎節 1 チームが休み
 * （1 節＝六甲ジュニアFC・2 節＝みどり台SC・3 節＝北原フットボールクラブ・4 節＝野末少年団）。同じ組み合わせは 2 度出てこない。
 * 自チームの相手は 1 節＝みどり台SC・2 節＝白鷺FC・3 節＝東ヶ丘少年団・4 節＝コスモスJFC（試合記録 m1〜m4 の順）
 */
const LEAGUE_ROUNDS: [string, string, number, number][][] = [
  [
    ["lg01", "lg05", 3, 0],
    ["lg02", "lg11", 2, 0],
    ["lg04", "lg07", 2, 1],
    ["lg06", "lg09", 2, 1],
    ["lg08", "lg12", 2, 0],
  ],
  [
    ["lg01", "lg06", 2, 1],
    ["lg04", "lg13", 1, 0],
    ["lg05", "lg08", 2, 1],
    ["lg07", "lg11", 1, 1],
    ["lg09", "lg12", 1, 1],
  ],
  [
    ["lg01", "lg13", 4, 0],
    ["lg02", "lg08", 1, 1],
    ["lg04", "lg06", 0, 1],
    ["lg05", "lg10", 1, 2],
    ["lg07", "lg12", 0, 0],
  ],
  [
    ["lg01", "lg11", 3, 1],
    ["lg02", "lg10", 3, 1],
    ["lg05", "lg13", 2, 1],
    ["lg06", "lg07", 0, 1],
    ["lg08", "lg09", 1, 2],
  ],
];

/**
 * 試合記録からデモの順位表を作る（mode:"results"）。自チームの結果は matches のうちリーグ戦（SAMPLE_LEAGUE_COMPETITION_ID）を
 * 日付の古い順に 1 節・2 節…とし、相手名がチーム一覧に無い記録は入れない（「試合記録から取り込む」と同じ）。
 * ほかのチームどうしの結果の日付は、同じ節の自チームの試合の日付（その節の記録が無ければ日付なし）
 */
export function sampleLeague(matches: MatchRecord[]): LeagueTable {
  const own = LEAGUE_TEAMS.find((t) => t.own);
  const ownLeague = matches
    .filter((m) => m.competitionId === SAMPLE_LEAGUE_COMPETITION_ID)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const results: LeagueResult[] = [];
  ownLeague.forEach((m) => {
    const opp = LEAGUE_TEAMS.find((t) => !t.own && t.name === m.opponent.trim());
    if (!own || !opp) return;
    results.push({ id: `lgr_${m.id}`, aId: own.id, bId: opp.id, aScore: m.ourScore, bScore: m.theirScore, date: m.date, matchId: m.id });
  });
  LEAGUE_ROUNDS.forEach((round, ri) => {
    const date = ownLeague[ri]?.date;
    round.forEach(([aId, bId, aScore, bScore], i) => {
      results.push({ id: `lgr_r${ri + 1}_${i + 1}`, aId, bId, aScore, bScore, ...(date ? { date } : {}) });
    });
  });
  const base: LeagueRow[] = LEAGUE_TEAMS.map((t) => ({
    id: t.id,
    name: t.name,
    win: 0,
    draw: 0,
    loss: 0,
    gf: 0,
    ga: 0,
    ...(t.own ? { own: true as const } : {}),
  }));
  return { title: SAMPLE_LEAGUE_NAME, rows: rowsFromResults(base, results), mode: "results", results };
}

/**
 * 順位表を一度も保存していないチーム（team.league が未定義＝この変更より前のシードのブラウザ）に出すデモの既定値。
 * 新しいシードは sampleTeam が sampleLeague(試合記録) を保存するので、ここは通らない。
 * 見出しは付けない（「リーグ順位表」のまま）：前のシードのブラウザでは大会名が旧名のまま残っているので、
 * 新しい大会名を見出しに出すと食い違う。数字は同じ試合記録（m1〜m4 のスコアは変えていない）から数えるので合う
 */
export function defaultLeague(): LeagueTable {
  return { ...sampleLeague(sampleMatches(localDateStr())), title: undefined };
}

/** 順位つきの 1 行（rank・played・pts・diff は計算した値） */
export interface Standing extends LeagueRow {
  rank: number;
  played: number;
  pts: number;
  diff: number;
}

/**
 * 順位表を計算する。played = 勝+分+敗、pts = 勝×3+分、diff = 得点-失点。
 * 並びは 勝点 → 得失点差 → 得点 の降順（同じなら入力順）。own の行は name を ownName に差し替える
 */
export function computeStandings(table: LeagueTable, ownName: string): Standing[] {
  const base = table.rows.map((r) => ({
    ...r,
    name: r.own ? ownName : r.name,
    played: r.win + r.draw + r.loss,
    pts: r.win * 3 + r.draw,
    diff: r.gf - r.ga,
  }));
  const sorted = base
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.pts - a.r.pts || b.r.diff - a.r.diff || b.r.gf - a.r.gf || a.i - b.i)
    .map((x) => x.r);
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * p16 §6: 試合結果から勝・分・敗・得点・失点を数え直した行を返す（id・name・own はそのまま）。
 * 存在しないチーム id を指す結果（どちらか一方でも）は無視する
 */
export function rowsFromResults(rows: LeagueRow[], results: LeagueResult[]): LeagueRow[] {
  const acc = new Map<string, LeagueRow>(rows.map((r) => [r.id, { ...r, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 }]));
  for (const m of results) {
    const a = acc.get(m.aId);
    const b = acc.get(m.bId);
    if (!a || !b) continue;
    a.gf += m.aScore;
    a.ga += m.bScore;
    b.gf += m.bScore;
    b.ga += m.aScore;
    if (m.aScore > m.bScore) {
      a.win += 1;
      b.loss += 1;
    } else if (m.aScore < m.bScore) {
      b.win += 1;
      a.loss += 1;
    } else {
      a.draw += 1;
      b.draw += 1;
    }
  }
  return rows.map((r) => acc.get(r.id) as LeagueRow);
}

/** 自チームの順位と参加チーム数（自チームの行が無ければ rank は null） */
export function leaguePositionOf(st: Standing[]): { rank: number | null; size: number } {
  const own = st.find((r) => r.own);
  return { rank: own ? own.rank : null, size: st.length };
}

/** 簡易順位表: 上位5チーム＋自チーム行(6位以下=圏外のときのみ、区切り行つきで追加) */
export function leagueMiniRows(st: Standing[]): (Standing | { gap: true })[] {
  const top5 = st.slice(0, 5);
  const own = st.find((r) => r.own);
  return own && own.rank > 5 ? [...top5, { gap: true } as const, own] : top5;
}
