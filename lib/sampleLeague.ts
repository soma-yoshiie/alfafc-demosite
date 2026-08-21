import { SAMPLE_TEAM_NAME } from "./sampleTeam";

/**
 * デモ用のリーグ順位表（13チーム総当たり想定）。
 * 自チーム（表示名はsampleTeam.SAMPLE_TEAM_NAME・own:trueで判定）は3位。既存の試合記録シード(TeamProvider.sampleTeam)に
 * 登場する対戦相手名(みどり台SC/白鷺FC/東ヶ丘少年団/コスモスJFC/青葉SC/高砂フットボールクラブ)を含み、
 * 残りは架空の少年団・FC名で埋めている。
 *
 * 整合性(検算済み):
 * - 各行: played = win + draw + loss (= 12。13チーム総当たり=1チームあたり12試合)
 * - 各行: pts = win*3 + draw*1
 * - リーグ全体: Σwin = Σloss = 57（引き分け以外の全78試合の勝敗が過不足なく対応）
 *              Σdraw = 42（=引き分け21試合 × 2チーム分）
 *              Σplayed = 13*12 = 156 = Σwin + Σdraw + Σloss (57+42+57)
 *              Σgf = Σga = 276（総当たりでは全試合の得点=失点の総量が一致する）
 * - 得失点(gf-ga)は順位が下がるにつれて概ね悪化するよう設定（現実的な傾向）
 */
export interface LeagueRow {
  rank: number;
  name: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  pts: number;
  /** 自チームの行であることを示すフラグ（表示のハイライト判定・leaguePosition()で使用） */
  own?: true;
}

export const LEAGUE_STANDINGS: LeagueRow[] = [
  { rank: 1, name: "青葉SC", played: 12, win: 8, draw: 3, loss: 1, gf: 37, ga: 12, pts: 27 },
  { rank: 2, name: "白鷺FC", played: 12, win: 7, draw: 3, loss: 2, gf: 32, ga: 15, pts: 24 },
  { rank: 3, name: SAMPLE_TEAM_NAME, played: 12, win: 6, draw: 4, loss: 2, gf: 29, ga: 16, pts: 22, own: true },
  { rank: 4, name: "コスモスJFC", played: 12, win: 6, draw: 3, loss: 3, gf: 26, ga: 18, pts: 21 },
  { rank: 5, name: "松風JFC", played: 12, win: 5, draw: 4, loss: 3, gf: 23, ga: 19, pts: 19 },
  { rank: 6, name: "高砂フットボールクラブ", played: 12, win: 5, draw: 3, loss: 4, gf: 21, ga: 21, pts: 18 },
  { rank: 7, name: "湾岸イーグルスFC", played: 12, win: 4, draw: 4, loss: 4, gf: 20, ga: 20, pts: 16 },
  { rank: 8, name: "さくら台SC", played: 12, win: 4, draw: 3, loss: 5, gf: 18, ga: 22, pts: 15 },
  { rank: 9, name: "東ヶ丘少年団", played: 12, win: 3, draw: 4, loss: 5, gf: 17, ga: 23, pts: 13 },
  { rank: 10, name: "みどり台SC", played: 12, win: 3, draw: 3, loss: 6, gf: 15, ga: 25, pts: 12 },
  { rank: 11, name: "北原フットボールクラブ", played: 12, win: 2, draw: 4, loss: 6, gf: 14, ga: 26, pts: 10 },
  { rank: 12, name: "野末少年団", played: 12, win: 2, draw: 2, loss: 8, gf: 13, ga: 29, pts: 8 },
  { rank: 13, name: "六甲ジュニアFC", played: 12, win: 2, draw: 2, loss: 8, gf: 11, ga: 30, pts: 8 },
];

/** 自チームの順位（見つからない場合は最下位扱い） */
export function leaguePosition(): { rank: number; size: number } {
  const own = LEAGUE_STANDINGS.find((r) => r.own);
  return { rank: own?.rank ?? LEAGUE_STANDINGS.length, size: LEAGUE_STANDINGS.length };
}
