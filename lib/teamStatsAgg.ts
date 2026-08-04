// PCホーム「チームスタッツ」/選手側「マイスタッツ」の集計。
// シュート/パス/ドリブルの成否判定は NotebookScreen.tsx の playStats と同じ意味論
// （success 未設定＝旧データは成功扱い＝success !== false で成功判定）に揃える。単一ソース化。

import type { MatchNote, MatchRecord, NotebookEntry, Player } from "./types";

/** 割合(%)。分母が0のときは「データ無し」を表す null を返す（0%と区別する） */
function pct(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) : null;
}

export interface TechStats {
  shots: number;
  goals: number;
  /** シュート決定率（goals/shots）。0本のときは null */
  shotPct: number | null;
  pass: number;
  passOk: number;
  /** パス成功率（passOk/pass）。0本のときは null */
  passPct: number | null;
  dribble: number;
  dribbleOk: number;
  /** ドリブル成功率（dribbleOk/dribble）。0本のときは null */
  dribblePct: number | null;
}

/** 試合ノート群(plays/playLines)から技術スタッツを集計する（playStats と同じ判定式） */
function techFromMatchNotes(notes: MatchNote[]): TechStats {
  const plays = notes.flatMap((n) => n.plays ?? []);
  const lines = notes.flatMap((n) => n.playLines ?? []);
  const shots = plays.filter((p) => p.kind === "shot");
  const goals = shots.filter((p) => p.scored === true).length;
  const pass = lines.filter((l) => l.kind === "pass");
  const passOk = pass.filter((l) => l.success !== false).length;
  const dribble = lines.filter((l) => l.kind === "dribble");
  const dribbleOk = dribble.filter((l) => l.success !== false).length;
  return {
    shots: shots.length,
    goals,
    shotPct: pct(goals, shots.length),
    pass: pass.length,
    passOk,
    passPct: pct(passOk, pass.length),
    dribble: dribble.length,
    dribbleOk,
    dribblePct: pct(dribbleOk, dribble.length),
  };
}

/**
 * 試合ノート(kind:"match")のプレー記録を集計する。
 * playerId を指定するとその選手のノートのみ、省略するとチーム全体（全選手の試合ノート合算）。
 */
export function aggregateTech(notebook: NotebookEntry[], playerId?: string): TechStats {
  const notes = notebook.filter(
    (n): n is MatchNote => n.kind === "match" && (playerId == null || n.playerId === playerId)
  );
  return techFromMatchNotes(notes);
}

export interface PlayerTechRow extends TechStats {
  playerId: string;
  name: string;
}

/** 選手ごとの技術スタッツ一覧（名簿の並び順のまま。ソート・0件除外は表示側で行う） */
export function perPlayerTech(notebook: NotebookEntry[], players: Player[]): PlayerTechRow[] {
  return players.map((p) => ({ playerId: p.id, name: p.name, ...aggregateTech(notebook, p.id) }));
}

export interface MatchTechRow {
  date: string;
  title: string;
  shots: number;
  goals: number;
  pass: number;
  passOk: number;
  dribble: number;
  dribbleOk: number;
}

/** 選手1人の、試合ノート単位の技術スタッツ一覧（新しい順） */
export function perMatchTech(notebook: NotebookEntry[], playerId: string): MatchTechRow[] {
  const notes = notebook.filter((n): n is MatchNote => n.kind === "match" && n.playerId === playerId);
  return notes
    .map((n) => {
      const s = techFromMatchNotes([n]);
      return {
        date: n.date,
        title: n.opponent ? `vs ${n.opponent}` : "試合ノート",
        shots: s.shots,
        goals: s.goals,
        pass: s.pass,
        passOk: s.passOk,
        dribble: s.dribble,
        dribbleOk: s.dribbleOk,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface MatchSummaryStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 勝率(%)。試合が0件のときは null */
  winPct: number | null;
  gf: number;
  ga: number;
}

/** 試合記録(MatchRecord)からチーム成績を集計する */
export function matchSummary(matches: MatchRecord[]): MatchSummaryStats {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;
  for (const m of matches) {
    gf += m.ourScore;
    ga += m.theirScore;
    if (m.ourScore > m.theirScore) wins++;
    else if (m.ourScore === m.theirScore) draws++;
    else losses++;
  }
  const played = matches.length;
  return { played, wins, draws, losses, winPct: pct(wins, played), gf, ga };
}
