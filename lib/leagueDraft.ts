import type { LeagueResult, LeagueTable } from "@/lib/types";
import { computeStandings } from "@/lib/sampleLeague";

/*
 * 順位表の編集の下書き（TeamHub の管理シートと設定の下層の LeagueEdit が共用）。
 * TeamHub.tsx から移しただけで中身は変えていない。
 */

/** p14 §3-4: 編集シートの 1 行（数値は入力中の文字列） */
export type LeagueDraftRow = { id: string; name: string; own?: true; win: string; draw: string; loss: string; gf: string; ga: string };
export const LEAGUE_NUM_KEYS = ["win", "draw", "loss", "gf", "ga"] as const;
export const LEAGUE_NUM_LABEL: Record<(typeof LEAGUE_NUM_KEYS)[number], string> = {
  win: "勝",
  draw: "分",
  loss: "敗",
  gf: "得点",
  ga: "失点",
};
/** 編集の初期行。並びは今の順位順。自チームの行が無いデータ（壊れた・全部消した）は先頭に補う */
export function leagueDraftRows(league: LeagueTable, ownName: string): LeagueDraftRow[] {
  const rows: LeagueDraftRow[] = computeStandings(league, ownName).map((r) => ({
    id: r.id,
    name: r.name,
    ...(r.own ? { own: true as const } : {}),
    win: String(r.win),
    draw: String(r.draw),
    loss: String(r.loss),
    gf: String(r.gf),
    ga: String(r.ga),
  }));
  if (!rows.some((r) => r.own)) {
    rows.unshift({
      id: "lg_" + Date.now().toString(36) + "_own",
      name: ownName,
      own: true,
      win: "0",
      draw: "0",
      loss: "0",
      gf: "0",
      ga: "0",
    });
  }
  return rows;
}
/** p16 §6-2: 編集シートの試合結果 1 行（スコアは入力中の文字列。保存時に検証して数値にする） */
export type LeagueResultDraft = { id: string; aId: string; bId: string; aScore: string; bScore: string; date: string; matchId?: string };
/** p16 §6-2: 結果の下書きを数え直し用の結果にする（チーム未選択・同じチームどうしは除く。スコアが不正なら 0 として数える） */
export function leagueDraftResultsLoose(results: LeagueResultDraft[]): LeagueResult[] {
  return results
    .filter((m) => m.aId && m.bId && m.aId !== m.bId)
    .map((m) => ({
      id: m.id,
      aId: m.aId,
      bId: m.bId,
      aScore: parseLeagueInt(m.aScore) ?? 0,
      bScore: parseLeagueInt(m.bScore) ?? 0,
    }));
}
/** 空欄＝0、全角数字も受ける。0 以上の整数だけ（それ以外は null） */
export function parseLeagueInt(v: string): number | null {
  const t = v.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (t === "") return 0;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
