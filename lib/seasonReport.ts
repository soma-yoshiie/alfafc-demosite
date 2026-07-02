// シーズンレポート：期間で選手のノート/出欠/配信回答を集計し、
// ルールベースで総括文を生成する（フェーズ1：AIなし）。画像(PNG)出力も含む。

import type {
  CoachDeliverable,
  MatchNote,
  NotebookEntry,
  Player,
  PracticeNote,
  SoloNote,
  TeamData,
} from "./types";
import { deliverTargets } from "./types";
import { buildSlots } from "./formations";

export interface SeasonRange {
  from: string; // YYYY-MM-DD
  to: string;
}

export interface SeasonReportData {
  playerName: string;
  number: number | null;
  teamName: string;
  range: SeasonRange;
  matches: number;
  positions: [string, number][];
  attendancePct: number | null;
  attendance: { yes: number; total: number };
  noteCounts: { match: number; practice: number; solo: number; total: number };
  soloCount: number;
  soloBestStreak: number;
  assignmentDone: number;
  assignmentTotal: number;
  quizAvgPct: number | null;
  insights: string[];
  bestPlays: string[];
  staffComments: string[];
  summary: string;
}

const inRange = (date: string, r: SeasonRange) => date >= r.from && date <= r.to;
const tsDate = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** 連続日数の最長（与えられた日付集合の中で） */
function longestStreak(dates: string[]): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev) {
      const a = new Date(prev);
      a.setDate(a.getDate() + 1);
      cur = a.toISOString().slice(0, 10) === d ? cur + 1 : 1;
    } else cur = 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function buildSeasonReport(
  player: Player,
  notebook: NotebookEntry[],
  deliverables: CoachDeliverable[],
  team: TeamData | null,
  range: SeasonRange,
  teamName: string
): SeasonReportData {
  const mine = notebook.filter((n) => n.playerId === player.id && inRange(n.date, range));
  const matchNotes = mine.filter((n): n is MatchNote => n.kind === "match");
  const practiceNotes = mine.filter((n): n is PracticeNote => n.kind === "practice");
  const soloNotes = mine.filter((n): n is SoloNote => n.kind === "solo");

  // 出場ポジション
  const posCounts: Record<string, number> = {};
  matchNotes.forEach((n) => {
    const roles = new Set<string>();
    (n.lineups ?? []).forEach((lu) => {
      if (lu.ownPositionIndex != null) {
        const role = buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role;
        if (role) roles.add(role);
      }
    });
    roles.forEach((r) => (posCounts[r] = (posCounts[r] ?? 0) + 1));
  });
  const positions = Object.entries(posCounts).sort((a, b) => b[1] - a[1]);

  // 出席（期間内の予定）
  let yes = 0;
  let total = 0;
  if (team) {
    team.events.filter((e) => inRange(e.date, range)).forEach((e) => {
      total++;
      if (team.attendance[e.id]?.[player.id]?.status === "yes") yes++;
    });
  }

  // 個人課題・テスト（期間内の回答）
  const assignments = deliverables.filter(
    (d): d is Extract<CoachDeliverable, { kind: "assignment" }> =>
      d.kind === "assignment" && deliverTargets(d, player.id)
  );
  const assignmentDone = assignments.filter((d) => {
    const r = d.responses[player.id];
    return r && r.status === "done" && inRange(tsDate(r.ts), range);
  }).length;

  const quizzes = deliverables.filter(
    (d): d is Extract<CoachDeliverable, { kind: "quiz" }> =>
      d.kind === "quiz" && deliverTargets(d, player.id) && !!d.responses[player.id] && inRange(tsDate(d.responses[player.id].ts), range)
  );
  let quizAvgPct: number | null = null;
  if (quizzes.length) {
    const rates = quizzes.map((q) => {
      const r = q.responses[player.id];
      const c = q.questions.reduce((n, qq, i) => n + (r.answers[i] === qq.correct ? 1 : 0), 0);
      return q.questions.length ? c / q.questions.length : 0;
    });
    quizAvgPct = Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100);
  }

  const insights = practiceNotes
    .flatMap((n) => n.insights ?? [])
    .filter(Boolean)
    .slice(-6)
    .reverse();
  const bestPlays = matchNotes.map((n) => n.bestPlay).filter((s): s is string => !!s).slice(0, 6);
  const staffComments = [...mine]
    .filter((n) => n.staffComment)
    .sort((a, b) => b.ts - a.ts)
    .map((n) => n.staffComment!)
    .slice(0, 4);

  const data: Omit<SeasonReportData, "summary"> = {
    playerName: player.name,
    number: player.number,
    teamName,
    range,
    matches: matchNotes.length,
    positions,
    attendancePct: total ? Math.round((yes / total) * 100) : null,
    attendance: { yes, total },
    noteCounts: {
      match: matchNotes.length,
      practice: practiceNotes.length,
      solo: soloNotes.length,
      total: mine.length,
    },
    soloCount: soloNotes.length,
    soloBestStreak: longestStreak(soloNotes.map((n) => n.date)),
    assignmentDone,
    assignmentTotal: assignments.length,
    quizAvgPct,
    insights,
    bestPlays,
    staffComments,
  };
  return { ...data, summary: generateSeasonSummary(data) };
}

/** ルールベースの総括文（★将来 Claude 実装に差し替え可能な単一関数） */
export function generateSeasonSummary(d: Omit<SeasonReportData, "summary">): string {
  const s: string[] = [];
  if (d.matches > 0) {
    const pos = d.positions[0] ? `（主に${d.positions[0][0]}）` : "";
    s.push(`この期間で${d.matches}試合に出場しました${pos}。`);
  }
  if (d.attendancePct != null) s.push(`出席率は${d.attendancePct}%。`);
  if (d.noteCounts.total > 0) s.push(`ノートを${d.noteCounts.total}件提出し、振り返りを継続できています。`);
  if (d.soloCount > 0) s.push(`自主練は${d.soloCount}回（最長${d.soloBestStreak}日連続）。`);
  if (d.assignmentTotal > 0) s.push(`個人課題は${d.assignmentDone}/${d.assignmentTotal}件を達成。`);
  if (d.quizAvgPct != null) s.push(`理解度テスト平均は${d.quizAvgPct}%。`);
  if (d.insights[0]) s.push(`代表的な気づき：「${d.insights[0]}」。`);
  if (s.length === 0) s.push("この期間の記録はまだ少なめです。まずはノート提出から始めましょう。");
  else s.push("次のシーズンも継続して取り組んでいきましょう。");
  return s.join(" ");
}

/* ---------- 共有用1枚画像（PNG dataURL） ---------- */
export function renderSeasonImage(d: SeasonReportData): string {
  const W = 750;
  const H = 1040;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#0a0e0c";
  ctx.fillRect(0, 0, W, H);
  // ブランド
  ctx.font = "700 28px sans-serif";
  ctx.fillStyle = "#eafff0";
  ctx.fillText("ALFA", 28, 52);
  const w = ctx.measureText("ALFA").width;
  ctx.fillStyle = "#caff3a";
  ctx.fillText(" FOOTBALL", 28 + w, 52);
  ctx.fillStyle = "#7d9389";
  ctx.font = "600 14px sans-serif";
  ctx.fillText("シーズンレポート", 28, 74);
  ctx.textAlign = "right";
  ctx.fillText(`${d.range.from} 〜 ${d.range.to}`, W - 28, 74);
  ctx.textAlign = "left";

  // 選手名
  ctx.fillStyle = "#eafff0";
  ctx.font = "800 40px sans-serif";
  ctx.fillText(d.playerName, 28, 140);
  ctx.fillStyle = "#9ec92a";
  ctx.font = "600 16px sans-serif";
  ctx.fillText(`${d.teamName}${d.number != null ? ` ・ #${d.number}` : ""}`, 28, 166);

  // 統計グリッド
  const stats: [string, string][] = [
    ["試合数", `${d.matches}`],
    ["出席率", d.attendancePct != null ? `${d.attendancePct}%` : "—"],
    ["ノート", `${d.noteCounts.total}`],
    ["自主練", `${d.soloCount}`],
    ["課題達成", d.assignmentTotal ? `${d.assignmentDone}/${d.assignmentTotal}` : "—"],
    ["テスト", d.quizAvgPct != null ? `${d.quizAvgPct}%` : "—"],
  ];
  const gx = 28;
  const gy = 200;
  const bw = (W - 56 - 20) / 3;
  const bh = 78;
  stats.forEach((st, i) => {
    const x = gx + (i % 3) * (bw + 10);
    const y = gy + Math.floor(i / 3) * (bh + 10);
    ctx.fillStyle = "#171f1b";
    roundRect(ctx, x, y, bw, bh, 12);
    ctx.fill();
    ctx.fillStyle = "#caff3a";
    ctx.font = "800 26px sans-serif";
    ctx.fillText(st[1], x + 14, y + 38);
    ctx.fillStyle = "#7d9389";
    ctx.font = "600 12px sans-serif";
    ctx.fillText(st[0], x + 14, y + 60);
  });

  let y = gy + 2 * (bh + 10) + 24;
  // 出場ポジション
  if (d.positions.length) {
    ctx.fillStyle = "#9ec92a";
    ctx.font = "700 14px sans-serif";
    ctx.fillText("出場ポジション", 28, y);
    y += 24;
    ctx.fillStyle = "#eafff0";
    ctx.font = "600 15px sans-serif";
    ctx.fillText(d.positions.map(([r, n]) => `${r} ${n}試合`).join("　"), 28, y);
    y += 30;
  }

  // 総括
  ctx.fillStyle = "#9ec92a";
  ctx.font = "700 14px sans-serif";
  ctx.fillText("総括", 28, y);
  y += 24;
  ctx.fillStyle = "#eafff0";
  ctx.font = "400 15px sans-serif";
  y = wrapText(ctx, d.summary, 28, y, W - 56, 24);

  // 気づき
  if (d.insights.length) {
    y += 14;
    ctx.fillStyle = "#9ec92a";
    ctx.font = "700 14px sans-serif";
    ctx.fillText("気づき", 28, y);
    y += 22;
    ctx.fillStyle = "#eafff0";
    ctx.font = "400 14px sans-serif";
    d.insights.slice(0, 4).forEach((t) => {
      y = wrapText(ctx, "・" + t, 28, y, W - 56, 22);
    });
  }

  ctx.fillStyle = "#7d9389";
  ctx.font = "600 12px sans-serif";
  ctx.fillText("ALFA FOOTBALL", 28, H - 24);

  return canvas.toDataURL("image/png");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  const chars = [...text];
  let line = "";
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = ch;
    } else line = test;
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  return y;
}
