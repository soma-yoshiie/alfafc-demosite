import { SAMPLE_TEAM_NAME } from "./sampleTeam";
import type { LeagueRow, LeagueTable } from "./types";

/**
 * デモ用のリーグ順位表の既定値（13チーム総当たり想定）。
 * 自チーム（own:true の行。表示名は呼び出し側でチーム名へ差し替える。ここの name は SAMPLE_TEAM_NAME）は3位。
 * 既存の試合記録シード(TeamProvider.sampleTeam)に登場する対戦相手名
 * (みどり台SC/白鷺FC/東ヶ丘少年団/コスモスJFC/青葉SC/高砂フットボールクラブ)を含み、
 * 残りは架空の少年団・FC名で埋めている。
 *
 * p14 §3: 保存する値は 勝・分・敗・得点・失点 だけ。試合数・勝点・得失差・順位は computeStandings で計算する
 * （勝点 = 勝×3 + 分、並びは 勝点 → 得失点差 → 得点 の降順、同じなら入力順）。
 *
 * 整合性(検算済み。計算結果が従来の固定順位表と一致する):
 * - 各行: 試合数 = 勝 + 分 + 敗 (= 12。13チーム総当たり=1チームあたり12試合)
 * - リーグ全体: Σ勝 = Σ敗 = 57（引き分け以外の全78試合の勝敗が過不足なく対応）
 *              Σ分 = 42（=引き分け21試合 × 2チーム分）
 *              Σ試合数 = 13*12 = 156 = Σ勝 + Σ分 + Σ敗 (57+42+57)
 *              Σ得点 = Σ失点 = 276（総当たりでは全試合の得点=失点の総量が一致する）
 * - 12位(野末少年団)と13位(六甲ジュニアFC)は勝点8で並ぶが、得失点差 -16 と -19 で今の順のままになる
 * - 得失点(得点-失点)は順位が下がるにつれて概ね悪化するよう設定（現実的な傾向）
 */
const row = (
  n: number,
  name: string,
  win: number,
  draw: number,
  loss: number,
  gf: number,
  ga: number,
  own?: true
): LeagueRow => ({ id: `lg${String(n).padStart(2, "0")}`, name, win, draw, loss, gf, ga, ...(own ? { own } : {}) });

export const DEFAULT_LEAGUE: LeagueTable = {
  rows: [
    row(1, "青葉SC", 8, 3, 1, 37, 12),
    row(2, "白鷺FC", 7, 3, 2, 32, 15),
    row(3, SAMPLE_TEAM_NAME, 6, 4, 2, 29, 16, true),
    row(4, "コスモスJFC", 6, 3, 3, 26, 18),
    row(5, "松風JFC", 5, 4, 3, 23, 19),
    row(6, "高砂フットボールクラブ", 5, 3, 4, 21, 21),
    row(7, "湾岸イーグルスFC", 4, 4, 4, 20, 20),
    row(8, "さくら台SC", 4, 3, 5, 18, 22),
    row(9, "東ヶ丘少年団", 3, 4, 5, 17, 23),
    row(10, "みどり台SC", 3, 3, 6, 15, 25),
    row(11, "北原フットボールクラブ", 2, 4, 6, 14, 26),
    row(12, "野末少年団", 2, 2, 8, 13, 29),
    row(13, "六甲ジュニアFC", 2, 2, 8, 11, 30),
  ],
};

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
