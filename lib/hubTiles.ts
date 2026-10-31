// スマホ「チーム」の目次（タイル）の集計（specs/hub-tiles.md §1）。
// React に依存しない純関数だけを置く。画面は components/team/HubTiles.tsx。

import type {
  CalColorMode,
  CalFilter,
  ChatMessage,
  EventCategory,
  MatchRecord,
  Player,
  SchoolStage,
  TeamEvent,
  TeamGroup,
} from "./types";
import { gradeLabel } from "./types";
import { addDays, byStartAsc, calEventVisible, eventColorOf, eventPhase, occursOn } from "./calendarUtils";
import { linkedEventIds } from "./matchEvents";
import { messageBodyText } from "./chat";

/** 試合の結果（勝・分・敗とスコア。クラスは .evresult の w / d / l）。TeamHub の予定カード・出欠のカードと同じ判定 */
export function matchResultOf(m: MatchRecord): { cls: "w" | "d" | "l"; label: string; score: string } {
  const win = m.ourScore > m.theirScore;
  const draw = m.ourScore === m.theirScore;
  return { cls: win ? "w" : draw ? "d" : "l", label: win ? "勝" : draw ? "分" : "敗", score: `${m.ourScore}-${m.theirScore}` };
}

/** 「YYYY-MM-DD」→「M/D」 */
export function fmtMD(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return m && d ? `${m}/${d}` : ymd;
}

/** 最新の試合＝date の新しい順の先頭。同じ日付は配列の後ろを新しいとみなす（hub-tiles §1-3-2）。無ければ null */
export function latestMatch(matches: MatchRecord[]): MatchRecord | null {
  let best: MatchRecord | null = null;
  for (const m of matches) {
    if (!best || m.date >= best.date) best = m;
  }
  return best;
}

/**
 * 次の試合＝カレンダーの試合の予定（kind==="match"、date が今日以降、試合記録に紐づいていない、終わっていない）の最初。
 * 「次の予定」（useMatchdayData）と同じく、結果が出ている試合・終わった予定は除く（hub-tiles §1-3-2）
 */
export function nextMatchEvent(events: TeamEvent[], matches: MatchRecord[], today: string, now: Date): TeamEvent | null {
  const done = linkedEventIds(matches);
  const list = events
    .filter((e) => e.kind === "match" && e.date >= today && !done.has(e.id) && eventPhase(e, now) !== "after")
    .sort(byStartAsc);
  return list[0] ?? null;
}

/**
 * 名簿のタイルの学年の内訳（hub-tiles §1-3-3）。学年の種類が 3 つ以下なら「中1 23／中2 24／中3 23」、
 * 4 つ以上は「N 学年」。学年未設定の選手は含めない。学年が 1 つも無ければ空
 */
export function gradeSummary(players: Player[], stage: SchoolStage): string {
  const counts = new Map<number, number>();
  players.forEach((p) => {
    if (p.grade != null) counts.set(p.grade, (counts.get(p.grade) ?? 0) + 1);
  });
  if (counts.size === 0) return "";
  if (counts.size > 3) return `${counts.size} 学年`;
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([g, n]) => `${gradeLabel(stage, g)} ${n}`)
    .join("／");
}

/**
 * 怪我の状態ごとの人数（hub-tiles §1-3-3）。1 人は重いほうで 1 回：injuries に status "out" があれば離脱中、
 * 無くて "recovering" があれば復帰途上（"ok"＝完治は数えない）
 */
export function injurySummary(players: Player[]): { out: number; recovering: number } {
  let out = 0;
  let recovering = 0;
  players.forEach((p) => {
    const inj = p.injuries ?? [];
    if (inj.some((x) => x.status === "out")) out++;
    else if (inj.some((x) => x.status === "recovering")) recovering++;
  });
  return { out, recovering };
}

/** 「これから 7 日」の帯の 1 日分 */
export interface WeekDay {
  ymd: string;
  /** 曜日（0=日..6=土） */
  wd: number;
  /** 日 */
  day: number;
  isToday: boolean;
  /** 予定の点の色（1 日に最大 3 個。予定の無い日は空） */
  colors: string[];
}

/** 帯の点の上限（1 日あたり） */
export const WEEK_DOTS_MAX = 3;

/**
 * 「これから 7 日」の帯（hub-tiles §1-2・§1-3-1）。today から 7 日。各日の予定はカレンダー本体と同じ絞り込み
 * （calEventVisible）に従い、byStartAsc の先頭 3 件の色（eventColorOf）を点にする
 */
export function weekStrip(
  today: string,
  events: TeamEvent[],
  ctx: {
    filter: CalFilter;
    isCoach: boolean;
    me: Player | null;
    groups: TeamGroup[];
    categories: EventCategory[];
    calMine: boolean;
    colorMode: CalColorMode;
  }
): WeekDay[] {
  const visible = events.filter((e) =>
    calEventVisible(e, ctx.filter, {
      isCoach: ctx.isCoach,
      me: ctx.me,
      groups: ctx.groups,
      categories: ctx.categories,
      calMine: ctx.calMine,
    })
  );
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const ymd = addDays(today, i);
    const [y, m, d] = ymd.split("-").map(Number);
    const colors = visible
      .filter((e) => occursOn(e, ymd))
      .sort(byStartAsc)
      .slice(0, WEEK_DOTS_MAX)
      .map((e) => eventColorOf(e, ctx.groups, ctx.categories, ctx.colorMode));
    out.push({ ymd, wd: new Date(y, m - 1, d).getDay(), day: d, isToday: i === 0, colors });
  }
  return out;
}

/** チャットのタイルの送り主。fromName があればそれ、無ければスタッフ（coach）／名簿の名前／「選手」（hub-tiles §1-3-4） */
export function chatSenderName(m: ChatMessage, players: Player[]): string {
  const named = m.fromName?.trim();
  if (named) return named;
  if (m.from === "coach") return "スタッフ";
  return (m.from.startsWith("p:") ? players.find((p) => p.id === m.from.slice(2))?.name : undefined) ?? "選手";
}

/** チャットのタイルの 1 行「送り主：本文」（本文は ChatHome の previewOf と同じ整形） */
export function chatPreviewLine(m: ChatMessage, players: Player[]): string {
  return `${chatSenderName(m, players)}：${messageBodyText(m)}`;
}
