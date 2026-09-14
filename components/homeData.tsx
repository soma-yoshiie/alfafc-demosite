"use client";

/**
 * MatchdayBoard（PCコーチホーム。HomeMenu.tsx）と MobileHome（スマホホーム）で共有する
 * 集計フック・ヘルパー・小コンポーネント（mobile-home-v3 §1 / Phase D-1 C2 major「循環import」対応）。
 *
 * 元々は HomeMenu.tsx に定義され、MobileHome.tsx がそこから逆import する形だったため
 * HomeMenu.tsx ⇄ MobileHome.tsx の循環依存になっていた。ここへ純粋に移動しただけで
 * 計算式・依存配列は一切変更していない（PC/モバイルとも挙動不変）。
 * HomeMenu.tsx と MobileHome.tsx はどちらもこのモジュールから import し、互いには
 * import しない（MobileHome→HomeMenu の逆importは廃止）。
 */

import { useEffect, useMemo, useState } from "react";
import { localDateStr } from "@/lib/dates";
import { attendanceRate } from "@/lib/teamStats";
import { monthlyWinPct, weeklyAttendancePct, weeklyNoteCounts } from "@/lib/homeStats";
import type { TrendPoint } from "@/lib/homeStats";
import { LEAGUE_STANDINGS, leaguePosition } from "@/lib/sampleLeague";
import { NOTE_KIND_LABEL } from "@/lib/types";
import type { EventCategory, MatchRecord, Player, TeamData, TeamEvent } from "@/lib/types";
import type { useBoard } from "./BoardProvider";
import type { useTeam } from "./TeamProvider";

export type BoardCtx = ReturnType<typeof useBoard>;
export type TeamCtx = ReturnType<typeof useTeam>;

export const TOPIC_LABELS = ["得点", "アシスト", "出席", "ノート提出"];
export const TOPIC_UNITS = ["点", "A", "%", "件"];
export const PULSE_METRICS = ["notes", "att", "win", "rank"] as const;
export type PulseMetric = (typeof PULSE_METRICS)[number];
/** リーグ順位タイル用の簡易順位表: 上位5チーム＋自チーム行(6位以下=圏外のときのみ、区切り行つきで追加) */
export const LEAGUE_MINI_ROWS: ((typeof LEAGUE_STANDINGS)[number] | { gap: true })[] = (() => {
  const top5 = LEAGUE_STANDINGS.slice(0, 5);
  const own = LEAGUE_STANDINGS.find((r) => r.own);
  return own && own.rank > 5 ? [...top5, { gap: true } as const, own] : top5;
})();
export const ROW_H = 40; // .mdb-feeditem の行高(px)。JSのtranslateY計算とCSSの高さを一致させる

export function useReducedMotion(): boolean {
  const [rm, setRm] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setRm(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return rm;
}

/** イベント日付「M/D(曜)」表示（HomeMenu/MobileHome共通の日付表示ヘルパー） */
export function fmtEventDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
  return `${m}/${day}(${wd})`;
}

/** タイトルから「vs 」以降を対戦相手名として抽出（単語境界必須）。マッチしなければ null（呼び出し側で非試合と同じ表示にフォールバック） */
export function opponentFromTitle(title: string): string | null {
  const m = title.match(/(?:^|[\s　])vs\.?[\s　]*(.+)$/i);
  return m ? m[1].trim() : null;
}

export function categoryLabel(e: TeamEvent, categories: EventCategory[]): string {
  const id = e.categoryId ?? e.kind;
  return categories.find((c) => c.id === id)?.label ?? (e.kind === "match" ? "試合" : "練習");
}

/** 「きょう/昨日/N日前」の相対表示（カレンダー日単位。タイムゾーン跨ぎはlocalDateStrに委ねる） */
export function relTime(ts: number): string {
  const [ty, tm, td] = localDateStr().split("-").map(Number);
  const [ey, em, ed] = localDateStr(new Date(ts)).split("-").map(Number);
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ey, em - 1, ed)) / 86400000);
  if (diffDays <= 0) return "きょう";
  if (diffDays === 1) return "昨日";
  return `${diffDays}日前`;
}

/** 名前から安定した0〜n-1のインデックスを算出(フィード頭文字アバターの配色に使用。表示のたびに色が変わらないよう名前文字列だけで決定する) */
export function hashIdx(name: string, n: number): number {
  let h = 0;
  // 単純な `h*31+code` は mod 5 だと 31%5===1 に縮退し偏るため、ビット混合で分散させる
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) ^ (h >>> 13);
    h >>>= 0;
  }
  return h % n;
}

export function rankTop3(
  map: Record<string, number>,
  players: Player[]
): { playerId: string; name: string; value: number }[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .map(([pid, v]) => ({ playerId: pid, name: players.find((p) => p.id === pid)?.name ?? "—", value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}
export function goalsMap(matches: MatchRecord[]): Record<string, number> {
  const m: Record<string, number> = {};
  matches.forEach((mm) => mm.goals.forEach((g) => { m[g.playerId] = (m[g.playerId] ?? 0) + 1; }));
  return m;
}
export function assistsMap(matches: MatchRecord[]): Record<string, number> {
  const m: Record<string, number> = {};
  matches.forEach((mm) => mm.goals.forEach((g) => {
    if (g.assistPlayerId) m[g.assistPlayerId] = (m[g.assistPlayerId] ?? 0) + 1;
  }));
  return m;
}
export function attendancePctMap(team: TeamData, players: Player[], events: TeamEvent[]): Record<string, number> {
  const m: Record<string, number> = {};
  players.forEach((p) => {
    let yes = 0;
    let total = 0;
    events.forEach((e) => {
      const entry = team.attendance[e.id]?.[p.id];
      if (!entry?.status) return;
      total++;
      if (entry.status === "yes") yes++;
    });
    if (total > 0) m[p.id] = Math.round((yes / total) * 100);
  });
  return m;
}

/** 900ms/easeOutCubicのカウントアップ。10未満は即表示、reduced-motionでも即表示 */
export function useCountUp(target: number, reduceMotion: boolean): number {
  const [val, setVal] = useState<number>(() => (Math.abs(target) < 10 ? target : 0));
  useEffect(() => {
    if (Math.abs(target) < 10 || reduceMotion) {
      setVal(target);
      return;
    }
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduceMotion]);
  return val;
}

/** 60秒interval + visibilitychangeで停止/再開 + アンマウントでclear */
export function useCountdown(targetMs: number | null): { days: number; hours: number; minutes: number; started: boolean } | null {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (targetMs == null) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), 60000);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    // 裏タブでは60秒interval停止に加え、.mdb-hero::before のdriftアニメも.mdb-pausedで一時停止する
    const onVis = () => {
      document.documentElement.classList.toggle("mdb-paused", document.hidden);
      if (document.hidden) stop();
      else start();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.classList.remove("mdb-paused");
    };
  }, [targetMs]);
  if (targetMs == null) return null;
  const diff = Math.max(0, targetMs - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    started: targetMs - now <= 0,
  };
}

/** デルタチップ表示。期間をラベルに明示し、タイル値(現在の意味)との期間差の誤読を防ぐ（例:「先週比 +4」「前月比 -5pt」） */
export function fmtDelta(period: string, diff: number, unit: string): string {
  return `${period} ${diff >= 0 ? "+" : ""}${diff}${unit}`;
}

/** 直近の実測(非null)2期間からのみデルタを算出。実測が2点未満なら算出不能(null) */
export function trendDelta(series: TrendPoint[]): number | null {
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  return vals[vals.length - 1] - vals[vals.length - 2];
}

/** 小さな折れ線+面グラフ。pathLength=100で正規化し、stroke-dashoffsetをゆっくり流す(--dur-chart-slow) */
export function MdbChart({ data, max, metricKey }: { data: TrendPoint[]; max?: number; metricKey: string }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [metricKey]);

  const n = data.length;
  if (n < 2) return null;
  const w = 280;
  const h = 90;
  const padX = 8;
  const top = 10;
  const bottom = 18;
  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  const m = max ?? Math.max(1, ...values);
  const xAt = (i: number) => padX + (i * (w - 2 * padX)) / (n - 1);
  const yAt = (v: number) => (h - bottom) - (v / m) * (h - bottom - top);

  // null点(母数0＝欠測の週/月)では線を繋がず、実測が連続する区間ごとにセグメント分割して描く
  const segments: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  data.forEach((d, i) => {
    if (d.value == null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push({ x: xAt(i), y: yAt(d.value) });
    }
  });
  if (cur.length) segments.push(cur);

  let lastPt: { x: number; y: number } | null = null;
  for (let i = n - 1; i >= 0; i--) {
    const v = data[i].value;
    if (v != null) {
      lastPt = { x: xAt(i), y: yAt(v) };
      break;
    }
  }

  return (
    <div className="mdb-chartwrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="mdb-chartsvg">
        {/* 面グラデ(上20%→下0%)。色そのものはCSS側(.mdb-chartsvgのcolor)が選択中タイルの色に
            合わせて変えるため、ここではcurrentColorだけを参照する(色トークンはCSS側に一本化) */}
        <defs>
          <linearGradient id="mdb-chart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {segments.map((seg, si) => {
          if (seg.length < 2) return null;
          const linePath = "M" + seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
          const areaPath = `${linePath} L${seg[seg.length - 1].x.toFixed(1)},${h - bottom} L${seg[0].x.toFixed(1)},${h - bottom} Z`;
          return (
            <g key={si}>
              <path className={`mdb-chartarea${drawn ? " on" : ""}`} d={areaPath} />
              <path className={`mdb-chartline${drawn ? " on" : ""}`} d={linePath} pathLength={100} />
            </g>
          );
        })}
        {lastPt && <circle className="mdb-chartdot" cx={lastPt.x} cy={lastPt.y} r={3} />}
        <text className="mdb-chartlabel" x={xAt(0)} y={h - 4} textAnchor="start">
          {data[0].label}
        </text>
        <text className="mdb-chartlabel" x={xAt(n - 1)} y={h - 4} textAnchor="end">
          {data[n - 1].label}
        </text>
      </svg>
    </div>
  );
}

/** 出席率タイル用の小さなリング（pathLength=100で正規化した円）。pct が null(対象者0=算出不能)ならトラックのみ表示 */
export function MdbRing({ pct }: { pct: number | null }) {
  const p = pct == null ? null : Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 36 36" className="mdb-ring" aria-hidden="true">
      <circle className="mdb-ringtrack" cx="18" cy="18" r="15" pathLength={100} />
      {p != null && (
        <circle
          className="mdb-ringval"
          cx="18"
          cy="18"
          r="15"
          pathLength={100}
          style={{ strokeDasharray: `${p} ${100 - p}` }}
        />
      )}
    </svg>
  );
}

/**
 * 「最新の動き」フィード生成（notebook提出/得点/配布物回答をまとめて新着順に）。
 * MatchdayBoard/MobileHome(スタッフ)は useMatchdayData 経由で、MobileHome(選手・保護者)は
 * ヒーローのVS/カウントダウンも同じ useMatchdayData を使うようになったため(Phase D-1)、
 * 単独の useFeedItems には分離せずここに留める(分離しても呼び出し側の計算量は変わらない)。
 */
function useFeedItems(board: BoardCtx, team: TeamCtx) {
  const players = board.state.players;
  return useMemo(() => {
    const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? "選手";
    const items: { id: string; ts: number; text: string; initial: string; colorIdx: number }[] = [];
    board.notebook.forEach((n) => {
      const name = nameOf(n.playerId);
      items.push({
        id: "note-" + n.id,
        ts: n.ts,
        text: `${name}さんが${NOTE_KIND_LABEL[n.kind]}ノートを提出`,
        initial: name.charAt(0),
        colorIdx: hashIdx(name, 5),
      });
    });
    team.team.matches.forEach((m) => {
      const [y, mo, d] = m.date.split("-").map(Number);
      const ts = y ? new Date(y, mo - 1, d).getTime() : 0;
      m.goals.forEach((g, i) => {
        const name = nameOf(g.playerId);
        items.push({
          id: `goal-${m.id}-${i}`,
          ts,
          text: `${name}さんが得点（vs ${m.opponent}）`,
          initial: name.charAt(0),
          colorIdx: hashIdx(name, 5),
        });
      });
    });
    board.deliverables.forEach((d) => {
      Object.entries(d.responses).forEach(([pid, r]) => {
        const name = nameOf(pid);
        items.push({
          id: `resp-${d.id}-${pid}`,
          ts: (r as { ts: number }).ts,
          text: `${name}さんが「${d.title}」に回答`,
          initial: name.charAt(0),
          colorIdx: hashIdx(name, 5),
        });
      });
    });
    return items.sort((a, b) => b.ts - a.ts).slice(0, 6);
  }, [board.notebook, team.team.matches, board.deliverables, players]);
}

/**
 * MatchdayBoard(PCコーチホーム)とMobileHome(スマホホーム)で共有する集計フック(mobile-home-v3 §1)。
 * MatchdayBoardが従来内部で計算していたuseMemo群(区画1〜4のヒーロー/ベル/KPI/トピック/フィード/
 * ハイライト)をそのまま切り出したもので、計算式・依存配列は変更していない(挙動不変)。
 * MatchdayBoard固有のUI状態(自動切替・カウントアップ演出・フィード自動送り等)はこのフックに含めず、
 * 呼び出し側(MatchdayBoard/MobileHome)がそれぞれ持つ。
 */
export function useMatchdayData(board: BoardCtx, team: TeamCtx) {
  const todayISO = localDateStr();
  const players = board.state.players;

  /* ---------------- 区画1: ヒーロー(次の予定/試合) ---------------- */
  const nextEvent = useMemo<TeamEvent | null>(() => {
    const list = [...team.team.events]
      .filter((e) => e.date >= todayISO)
      .sort((a, b) => (`${a.date} ${a.time ?? ""}` < `${b.date} ${b.time ?? ""}` ? -1 : 1));
    return list[0] ?? null;
  }, [team.team.events, todayISO]);

  const isMatch = nextEvent?.kind === "match";
  // タイトルから対戦相手を抽出できた試合予定だけを対戦カード表示にする。抽出できなければ非試合と同じ「タイトル+カテゴリ」表示にフォールバック
  const opponent = useMemo(
    () => (nextEvent && isMatch ? opponentFromTitle(nextEvent.title) : null),
    [nextEvent, isMatch]
  );
  const showVsCard = isMatch && opponent != null;

  const targetMs = useMemo(() => {
    if (!nextEvent) return null;
    const [y, m, d] = nextEvent.date.split("-").map(Number);
    if (nextEvent.time) {
      const [hh, mm] = nextEvent.time.split(":").map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
    }
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }, [nextEvent]);
  const cd = useCountdown(targetMs);

  const unansweredNext = nextEvent ? team.summary(nextEvent.id).none : 0;

  /* ---------------- 区画2: 右上ベル(対応が必要なこと) ---------------- */
  const uncommented = board.notebook.filter((n) => !n.staffComment).length;
  const bellBadge = unansweredNext + uncommented;

  const bellRows = useMemo(() => {
    const rows: { id: string; badge: number; title: string; reason: string; onClick: () => void }[] = [];
    if (nextEvent && unansweredNext > 0) {
      rows.push({
        id: "att",
        badge: unansweredNext,
        title: "出欠が未回答",
        reason: `${nextEvent.kind === "match" ? "試合" : "練習"}「${nextEvent.title}」、出欠が未回答 ・ ${unansweredNext}名`,
        onClick: () => {
          board.setTeamIntent({ tab: "cal", eventId: nextEvent.id });
          board.setScreen("team");
        },
      });
    }
    if (uncommented > 0) {
      rows.push({
        id: "note",
        badge: uncommented,
        title: "未コメントのノート",
        reason: `未コメントのノートが${uncommented}件あります`,
        onClick: () => board.setScreen("notebook"),
      });
    }
    return rows;
  }, [nextEvent, unansweredNext, uncommented, board]);

  /* ---------------- 区画3: チームパルス(KPIタイル×グラフ) ---------------- */
  const notesSeries = useMemo(() => weeklyNoteCounts(board.notebook, 7), [board.notebook]);
  const attSeries = useMemo(() => weeklyAttendancePct(team.team, players, 7), [team.team, players]);
  const winSeries = useMemo(() => monthlyWinPct(team.team.matches, 7), [team.team.matches]);

  const notesThisWeek = notesSeries.at(-1)?.value ?? 0;
  const notesDelta = trendDelta(notesSeries);

  // 出席率タイルの値: 既存の意味論(lib/coaching.ts の avgAttendance)に合わせ、
  // attendanceRate(team,p.id).total>0 の選手だけで平均する。対象者が0人なら null(「—」表示)
  const attPctAvg = useMemo(() => {
    const rates = players.map((p) => attendanceRate(team.team, p.id)).filter((r) => r.total > 0);
    if (rates.length === 0) return null;
    return Math.round(rates.reduce((s, r) => s + r.pct, 0) / rates.length);
  }, [players, team.team]);
  const attDelta = trendDelta(attSeries);

  // 勝率タイルの値: winDelta(「前月比」)と期間の意味論を揃えるため、
  // 全期間集計(matchSummary)ではなく winSeries の最新の計測月(=直近の非null値)を使う。
  // 計測月が1件もない(=全月null)場合は null のまま(「—」表示)。
  const winPct = useMemo(() => {
    const vals = winSeries.map((p) => p.value).filter((v): v is number => v != null);
    return vals.length ? vals[vals.length - 1] : null;
  }, [winSeries]);
  const winDelta = trendDelta(winSeries);

  // リーグ順位タイルの値: lib/sampleLeague.ts の固定順位表(デモ用)から自チームの順位/参加チーム数を取得。
  // 期間推移の概念がないためデルタ(先週比等)は算出しない
  const leagueRank = leaguePosition();

  /* ---------------- 区画4左: 今月のトピック ---------------- */
  const ym = todayISO.slice(0, 7);
  const monthMatches = useMemo(() => team.team.matches.filter((m) => m.date.startsWith(ym)), [team.team.matches, ym]);
  const monthEvents = useMemo(
    () => team.team.events.filter((e) => e.date.startsWith(ym) && e.date <= todayISO),
    [team.team.events, ym, todayISO]
  );
  const monthNotes = useMemo(
    () => board.notebook.filter((n) => localDateStr(new Date(n.ts)).startsWith(ym)),
    [board.notebook, ym]
  );
  const topicMetricIdx = new Date().getMonth() % 4;
  const topic = useMemo(() => {
    const monthBuilders: (() => Record<string, number>)[] = [
      () => goalsMap(monthMatches),
      () => assistsMap(monthMatches),
      () => attendancePctMap(team.team, players, monthEvents),
      () => (() => {
        const m: Record<string, number> = {};
        monthNotes.forEach((n) => { m[n.playerId] = (m[n.playerId] ?? 0) + 1; });
        return m;
      })(),
    ];
    const allBuilders: (() => Record<string, number>)[] = [
      () => goalsMap(team.team.matches),
      () => assistsMap(team.team.matches),
      () => attendancePctMap(team.team, players, team.team.events.filter((e) => e.date <= todayISO)),
      () => (() => {
        const m: Record<string, number> = {};
        board.notebook.forEach((n) => { m[n.playerId] = (m[n.playerId] ?? 0) + 1; });
        return m;
      })(),
    ];
    let rows = rankTop3(monthBuilders[topicMetricIdx](), players);
    let fallback = false;
    if (rows.length === 0) {
      rows = rankTop3(allBuilders[topicMetricIdx](), players);
      fallback = true;
    }
    return { rows, fallback };
  }, [topicMetricIdx, monthMatches, monthEvents, monthNotes, team.team, players, board.notebook, todayISO]);
  const topicMax = topic.rows[0]?.value ?? 0;
  const topicUnit = TOPIC_UNITS[topicMetricIdx];

  /* ---------------- 区画4右: 最新の動き ---------------- */
  const feedItems = useFeedItems(board, team);

  /* ---------------- 区画4下: 今月のハイライト ---------------- */
  const highlightChips = useMemo(() => {
    const chips: { text: string; kind: "att" | "notes" | "goal" }[] = [];
    const fullAttendanceCount =
      players.length > 0
        ? monthEvents.filter((e) => team.summary(e.id).yes === players.length).length
        : 0;
    if (fullAttendanceCount > 0) chips.push({ text: `全員出席 ${fullAttendanceCount}回`, kind: "att" });

    const weekMax = Math.max(0, ...notesSeries.map((p) => p.value ?? 0));
    if (notesThisWeek > 0 && notesThisWeek >= weekMax) chips.push({ text: "ノート提出 週間最高", kind: "notes" });

    const firstGoalDate: Record<string, string> = {};
    [...team.team.matches]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((mm) => mm.goals.forEach((g) => {
        if (!firstGoalDate[g.playerId]) firstGoalDate[g.playerId] = mm.date;
      }));
    const firstGoalCount = Object.values(firstGoalDate).filter((d) => d.startsWith(ym)).length;
    if (firstGoalCount > 0) chips.push({ text: `初得点 ${firstGoalCount}人`, kind: "goal" });

    return chips;
  }, [monthEvents, team, players, notesSeries, notesThisWeek, ym]);

  const teamName = board.state.teamName ?? "マイチーム";

  return {
    players,
    nextEvent,
    isMatch,
    opponent,
    showVsCard,
    targetMs,
    cd,
    unansweredNext,
    uncommented,
    bellBadge,
    bellRows,
    notesSeries,
    attSeries,
    winSeries,
    notesThisWeek,
    notesDelta,
    attPctAvg,
    attDelta,
    winPct,
    winDelta,
    leagueRank,
    topicMetricIdx,
    topic,
    topicMax,
    topicUnit,
    feedItems,
    highlightChips,
    teamName,
  };
}
