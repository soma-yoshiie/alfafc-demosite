"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadNotifSeen } from "@/lib/storage";
import { localDateStr } from "@/lib/dates";
import { buildEventNotifications } from "@/lib/notifications";
import { aggregateTech, matchSummary } from "@/lib/teamStatsAgg";
import { attendanceRate } from "@/lib/teamStats";
import { monthlyWinPct, weeklyAttendancePct, weeklyNoteCounts, weeklyShotPct } from "@/lib/homeStats";
import type { TrendPoint } from "@/lib/homeStats";
import { NOTE_KIND_LABEL } from "@/lib/types";
import type { EventCategory, MatchRecord, Player, TeamData, TeamEvent } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import LogoMark from "./Logo";
import {
  IconBook,
  IconCalendarCheck,
  IconChat,
  IconCog,
  IconCone,
  IconFolder,
  IconNote,
} from "./icons";

/* ===================== PC判定（ConsoleScreens.tsx の PC_MQ 前例をそのままコピー） ===================== */
const PC_MQ = "(min-width: 1024px)";
function usePc(): boolean {
  const [pc, setPc] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(PC_MQ).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const onChange = () => setPc(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return pc;
}

function useReducedMotion(): boolean {
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

/** イベント日付「M/D(曜)」表示（HomeMenu内の複数箇所で使う共通ヘルパー） */
function fmtEventDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
  return `${m}/${day}(${wd})`;
}

function Tile({
  icon,
  label,
  desc,
  locked,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  locked?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button className="apptile" onClick={onClick}>
      <span className="appicon">
        {icon}
        {locked && <span className="applock"><E n="lock" /></span>}
        {!!badge && badge > 0 && <span className="appbadge">{badge > 9 ? "9+" : badge}</span>}
      </span>
      <span className="appmeta">
        <span className="applabel">{label}</span>
        {desc && <span className="appdesc">{desc}</span>}
      </span>
    </button>
  );
}

export default function HomeMenu() {
  const board = useBoard();
  const teamCtx = useTeam();
  const coach = board.auth.role === "coach";
  const pc = usePc();
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));
  const today = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const noteUnread = useMemo(() => {
    const identity = coach ? "coach" : "p:" + (board.auth.playerId ?? "");
    const seen = loadNotifSeen()[identity] ?? 0;
    return buildEventNotifications({
      role: board.auth.role,
      playerId: board.auth.playerId,
      notebook: board.notebook,
      deliverables: board.deliverables,
      players: board.state.players,
      team: teamCtx.team,
    }).filter((n) => n.ts > seen).length;
  }, [coach, board.auth.role, board.auth.playerId, board.notebook, board.deliverables, board.state.players, teamCtx.team]);

  // ⑥ スタッフの「今日やること」— 予定・未対応を1枚に集約
  const todayInfo = useMemo(() => {
    const team = teamCtx.team;
    const todayISO = localDateStr();
    const events = team?.events ?? [];
    const todayEvents = events.filter((e) => e.date === todayISO);
    const nextEvent = [...events]
      .filter((e) => e.date >= todayISO)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    const focusEvent = todayEvents[0] ?? nextEvent;
    const pendingAtt = focusEvent
      ? board.state.players.filter((p) => !team?.attendance?.[focusEvent.id]?.[p.id]).length
      : 0;
    const uncommented = board.notebook.filter((n) => !n.staffComment).length;
    const weekAgo = Date.now() - 7 * 86400_000;
    const notesWeek = board.notebook.filter((n) => n.ts >= weekAgo).length;
    return { todayEvents, focusEvent, isToday: todayEvents.length > 0, pendingAtt, uncommented, notesWeek };
  }, [board.notebook, board.state.players, teamCtx.team]);

  // PCホーム「チームスタッツ」/「マイスタッツ」— 試合ノート・試合記録からの集計（PCのみ表示。モバイルはタイルのまま不変）
  const recordSummary = useMemo(
    () => matchSummary(teamCtx.team?.matches ?? []),
    [teamCtx.team]
  );
  const teamTech = useMemo(() => aggregateTech(board.notebook), [board.notebook]);
  const myTech = useMemo(
    () => aggregateTech(board.notebook, board.auth.playerId ?? undefined),
    [board.notebook, board.auth.playerId]
  );
  const pctOrDash = (v: number | null) => (v != null ? `${v}%` : "—");

  // PC×コーチのみ「マッチデー・ボード」へ刷新。モバイル・選手のJSXは以下、一切変更しない
  if (pc && coach) {
    return <MatchdayBoard board={board} team={teamCtx} logout={logout} today={today} />;
  }

  return (
    <div className="app homeapp">
      <div className="homehero">
        <div className="homeherotop">
          <div className="homemark">
            <LogoMark uid="hm" />
          </div>
          <div className="homebrand">
            <div className="logo">
              ALFA<b> FOOTBALL</b>
            </div>
            <div className="hometeam">{board.state.teamName ?? "マイチーム"}</div>
          </div>
          <button className="homeout" onClick={logout}>
            ログアウト
          </button>
        </div>
        <div className="homegreet">
          <div className="homedate">{today}</div>
          <div className="homename">
            こんにちは、{board.auth.name} さん
            <span className="homerole">{coach ? "スタッフ" : "選手・保護者"}</span>
          </div>
        </div>
      </div>

      <div className="scroll">
        {coach ? (
          <div className="hdash">
            <button className="hstat" onClick={() => board.setScreen("notebook")}>
              <span className="hstat-n">{todayInfo.notesWeek}</span>
              <span className="hstat-l">今週のノート</span>
            </button>
            <button className="hstat" onClick={() => board.setScreen("notebook")}>
              <span className="hstat-n">{noteUnread}</span>
              <span className="hstat-l">ノート未読</span>
            </button>
            <button className="hstat" onClick={() => board.openSheet({ type: "library" })}>
              <span className="hstat-n">{board.library.plays.length}</span>
              <span className="hstat-l">保存した戦術</span>
            </button>
            <button className="hstat" onClick={() => board.setScreen("team")}>
              <span className="hstat-n">{board.state.players.length}</span>
              <span className="hstat-l">選手数</span>
            </button>
          </div>
        ) : (
          <div className="hdash">
            <button className="hstat" onClick={() => board.setScreen("team")}>
              <span className="hstat-n ev">
                {todayInfo.focusEvent
                  ? (todayInfo.isToday ? "今日" : fmtEventDate(todayInfo.focusEvent.date)) +
                    "・" +
                    (todayInfo.focusEvent.kind === "match" ? "試合" : "練習")
                  : "予定なし"}
              </span>
              <span className="hstat-l">
                {todayInfo.focusEvent
                  ? todayInfo.focusEvent.title +
                    (todayInfo.focusEvent.time ? " " + todayInfo.focusEvent.time + "〜" : "")
                  : "次の予定"}
              </span>
            </button>
            <button className="hstat" onClick={() => board.setScreen("notebook")}>
              <span className="hstat-n">{noteUnread}</span>
              <span className="hstat-l">ノート未読</span>
            </button>
          </div>
        )}
        {coach && (
          <div className="todaycard">
            <div className="todaycard-h">今日やること</div>
            <button className="todayevent" onClick={() => board.setScreen("team")}>
              <span className="todayevent-ic">
                <IconCalendarCheck />
              </span>
              <span className="todayevent-txt">
                {todayInfo.focusEvent ? (
                  <>
                    <b>
                      {todayInfo.isToday ? "今日" : fmtEventDate(todayInfo.focusEvent.date)}・
                      {todayInfo.focusEvent.kind === "match" ? "試合" : "練習"}
                    </b>
                    <span className="todayevent-sub">
                      {todayInfo.focusEvent.title}
                      {todayInfo.focusEvent.time ? ` ${todayInfo.focusEvent.time}〜` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <b>予定は未登録です</b>
                    <span className="todayevent-sub">タップして練習・試合を追加</span>
                  </>
                )}
              </span>
              <span className="todayevent-chev">›</span>
            </button>
            <div className="todaystats">
              <button className="todaystat" onClick={() => board.setScreen("team")}>
                <span className="todaystat-n">{todayInfo.pendingAtt}</span>
                <span className="todaystat-l">出欠未記録</span>
              </button>
              <button className="todaystat" onClick={() => board.setScreen("notebook")}>
                <span className="todaystat-n">{todayInfo.uncommented}</span>
                <span className="todaystat-l">未コメント</span>
              </button>
              <button className="todaystat" onClick={() => board.setScreen("chat")}>
                <span className="todaystat-n">
                  <IconChat />
                </span>
                <span className="todaystat-l">連絡する</span>
              </button>
            </div>
          </div>
        )}
        {/* PC専用「チームスタッツ」/「マイスタッツ」（モバイルでは基底CSSで非表示・appgridタイルはそのまま） */}
        <div className="hstats">
          <div className="hstats-h">
            <span>{coach ? "チームスタッツ" : "マイスタッツ"}</span>
            <span className="hstats-note">{coach ? "試合記録・試合ノートから集計" : "試合ノートから集計"}</span>
          </div>
          <div className="hdash">
            {coach ? (
              <>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "record" })}>
                  <span className="hstat-n">{pctOrDash(recordSummary.winPct)}</span>
                  <span className="hstat-l">
                    勝率 ・ {recordSummary.wins}勝{recordSummary.draws}分{recordSummary.losses}敗
                  </span>
                </button>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "record" })}>
                  <span className="hstat-n">
                    {recordSummary.played > 0 ? `${recordSummary.gf}-${recordSummary.ga}` : "—"}
                  </span>
                  <span className="hstat-l">得点/失点</span>
                </button>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "shot" })}>
                  <span className="hstat-n">{teamTech.shots}</span>
                  <span className="hstat-l">シュート ・ 決定率{pctOrDash(teamTech.shotPct)}</span>
                </button>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "pass" })}>
                  <span className="hstat-n">{teamTech.pass}</span>
                  <span className="hstat-l">パス ・ 成功率{pctOrDash(teamTech.passPct)}</span>
                </button>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "dribble" })}>
                  <span className="hstat-n">{teamTech.dribble}</span>
                  <span className="hstat-l">ドリブル ・ 成功率{pctOrDash(teamTech.dribblePct)}</span>
                </button>
              </>
            ) : myTech.shots + myTech.pass + myTech.dribble === 0 ? (
              <button className="hstat" onClick={() => board.setScreen("notebook")}>
                <span className="hstat-n">—</span>
                <span className="hstat-l">試合ノートを書くとスタッツが表示されます</span>
              </button>
            ) : (
              <>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "shot" })}>
                  <span className="hstat-n">{myTech.shots}</span>
                  <span className="hstat-l">シュート ・ 決定率{pctOrDash(myTech.shotPct)}</span>
                </button>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "pass" })}>
                  <span className="hstat-n">{myTech.pass}</span>
                  <span className="hstat-l">パス ・ 成功率{pctOrDash(myTech.passPct)}</span>
                </button>
                <button className="hstat" onClick={() => board.openSheet({ type: "stat", statMetric: "dribble" })}>
                  <span className="hstat-n">{myTech.dribble}</span>
                  <span className="hstat-l">ドリブル ・ 成功率{pctOrDash(myTech.dribblePct)}</span>
                </button>
              </>
            )}
          </div>
        </div>
        <div className="appgrid">
          {coach ? (
            <>
              <Tile
                icon={<IconClipboard />}
                label="戦術ボード"
                desc="スタメン作成・戦術アニメーション"
                onClick={() => board.setScreen("board")}
              />
              <Tile
                icon={<IconFolder />}
                label="保存した戦術"
                desc="保存した戦術を一覧・読み込み"
                onClick={() => board.openSheet({ type: "library" })}
              />
              <Tile
                icon={<IconCone />}
                label="練習メニュー"
                desc="コーン配置・動線で練習図を作成"
                onClick={() => board.setScreen("drill")}
              />
              <Tile
                icon={<IconFolder />}
                label="保存した練習"
                desc="保存した練習メニューを一覧"
                onClick={() => {
                  board.setDrillIntent("library");
                  board.setScreen("drill");
                }}
              />
              <Tile
                icon={<IconCalendarCheck />}
                label="チーム運営"
                desc="名簿・出欠・カレンダー・試合記録"
                onClick={() => board.setScreen("team")}
              />
              <Tile
                icon={<IconChat />}
                label="チャット"
                desc="戦術・画像・動画を送受信"
                onClick={() => board.setScreen("chat")}
              />
              <Tile
                icon={<IconNote />}
                label="サッカーノート"
                desc="試合・練習・自主練の振り返り"
                badge={noteUnread}
                onClick={() => board.setScreen("notebook")}
              />
              <Tile
                icon={<IconBook />}
                label="お役立ち記事"
                desc="練習法・コンディション・戦術"
                onClick={() => board.openSheet({ type: "articles" })}
              />
              <Tile
                icon={<IconCog />}
                label="設定"
                desc="チーム名・プラン・公開設定"
                onClick={() => board.openSheet({ type: "settings" })}
              />
            </>
          ) : (
            <>
              <Tile
                icon={<IconCalendarCheck />}
                label="チーム"
                desc="カレンダー・試合記録"
                onClick={() => board.setScreen("team")}
              />
              <Tile
                icon={<IconChat />}
                label="チャット"
                desc="スタッフ・チームとやりとり"
                onClick={() => board.setScreen("chat")}
              />
              <Tile
                icon={<IconNote />}
                label="サッカーノート"
                desc="試合・練習・自主練の振り返り"
                badge={noteUnread}
                onClick={() => board.setScreen("notebook")}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 3h6v3H9z" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M12 3v3M4 13h2M18 13h2" />
    </svg>
  );
}

/* =========================================================================================
 * マッチデー・ボード（PCコーチホーム刷新）
 * PC(min-width:1024px) かつ コーチ のときだけ HomeMenu からレンダリングされる専用ホーム。
 * カウントダウン等のintervalは、このコンポーネントがマウントされている間だけ動く
 * （モバイル/選手経路に切り替わればアンマウントされ、各useEffectのcleanupで自動停止する）。
 * ========================================================================================= */

type BoardCtx = ReturnType<typeof useBoard>;
type TeamCtx = ReturnType<typeof useTeam>;

const AUTOROTATE_KEY = "alfa_home_autorotate";
const TOPIC_LABELS = ["得点", "アシスト", "出席", "ノート提出"];
const TOPIC_UNITS = ["点", "A", "%", "件"];
const PULSE_METRICS = ["notes", "att", "win", "shot"] as const;
type PulseMetric = (typeof PULSE_METRICS)[number];
const ROW_H = 40; // .mdb-feeditem の行高(px)。JSのtranslateY計算とCSSの高さを一致させる

/** タイトルから「vs 」以降を対戦相手名として抽出（単語境界必須）。マッチしなければ null（呼び出し側で非試合と同じ表示にフォールバック） */
function opponentFromTitle(title: string): string | null {
  const m = title.match(/(?:^|[\s　])vs\.?[\s　]*(.+)$/i);
  return m ? m[1].trim() : null;
}

function categoryLabel(e: TeamEvent, categories: EventCategory[]): string {
  const id = e.categoryId ?? e.kind;
  return categories.find((c) => c.id === id)?.label ?? (e.kind === "match" ? "試合" : "練習");
}

function resultOf(m: MatchRecord): "w" | "d" | "l" {
  return m.ourScore > m.theirScore ? "w" : m.ourScore === m.theirScore ? "d" : "l";
}

/** 「きょう/昨日/N日前」の相対表示（カレンダー日単位。タイムゾーン跨ぎはlocalDateStrに委ねる） */
function relTime(ts: number): string {
  const [ty, tm, td] = localDateStr().split("-").map(Number);
  const [ey, em, ed] = localDateStr(new Date(ts)).split("-").map(Number);
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ey, em - 1, ed)) / 86400000);
  if (diffDays <= 0) return "きょう";
  if (diffDays === 1) return "昨日";
  return `${diffDays}日前`;
}

function rankTop3(
  map: Record<string, number>,
  players: Player[]
): { playerId: string; name: string; value: number }[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .map(([pid, v]) => ({ playerId: pid, name: players.find((p) => p.id === pid)?.name ?? "—", value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}
function goalsMap(matches: MatchRecord[]): Record<string, number> {
  const m: Record<string, number> = {};
  matches.forEach((mm) => mm.goals.forEach((g) => { m[g.playerId] = (m[g.playerId] ?? 0) + 1; }));
  return m;
}
function assistsMap(matches: MatchRecord[]): Record<string, number> {
  const m: Record<string, number> = {};
  matches.forEach((mm) => mm.goals.forEach((g) => {
    if (g.assistPlayerId) m[g.assistPlayerId] = (m[g.assistPlayerId] ?? 0) + 1;
  }));
  return m;
}
function attendancePctMap(team: TeamData, players: Player[], events: TeamEvent[]): Record<string, number> {
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
function useCountUp(target: number, reduceMotion: boolean): number {
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
function useCountdown(targetMs: number | null): { days: number; hours: number; minutes: number; started: boolean } | null {
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
function fmtDelta(period: string, diff: number, unit: string): string {
  return `${period} ${diff >= 0 ? "+" : ""}${diff}${unit}`;
}

/** 直近の実測(非null)2期間からのみデルタを算出。実測が2点未満なら算出不能(null) */
function trendDelta(series: TrendPoint[]): number | null {
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  return vals[vals.length - 1] - vals[vals.length - 2];
}

/** 小さな折れ線+面グラフ。pathLength=100で正規化し、stroke-dashoffsetをゆっくり流す(--dur-chart-slow) */
function MdbChart({ data, max, metricKey }: { data: TrendPoint[]; max?: number; metricKey: string }) {
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
function MdbRing({ pct }: { pct: number | null }) {
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

function MatchdayBoard({
  board,
  team,
  logout,
  today,
}: {
  board: BoardCtx;
  team: TeamCtx;
  logout: () => void;
  today: string;
}) {
  const reduceMotion = useReducedMotion();
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

  // 分の値が変わったらキーを更新してCSSアニメ(opacity 300msフェード)を再生させる
  const [fadeKey, setFadeKey] = useState(0);
  const prevMinRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cd) return;
    const cur = cd.days * 1440 + cd.hours * 60 + cd.minutes;
    if (prevMinRef.current !== null && prevMinRef.current !== cur) setFadeKey((k) => k + 1);
    prevMinRef.current = cur;
  }, [cd]);

  const unansweredNext = nextEvent ? team.summary(nextEvent.id).none : 0;

  const last5 = useMemo(
    () =>
      [...team.team.matches]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 5)
        .reverse(),
    [team.team.matches]
  );
  const scorerCount = useMemo(() => {
    const s = new Set<string>();
    last5.forEach((m) => m.goals.forEach((g) => s.add(g.playerId)));
    return s.size;
  }, [last5]);

  /* ---------------- 区画2: 右上ベル(対応が必要なこと) ---------------- */
  const uncommented = board.notebook.filter((n) => !n.staffComment).length;
  const bellBadge = unansweredNext + uncommented;
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBellOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [bellOpen]);

  const bellRows = useMemo(() => {
    const rows: { id: string; badge: number; title: string; reason: string; onClick: () => void }[] = [];
    if (nextEvent && unansweredNext > 0) {
      rows.push({
        id: "att",
        badge: unansweredNext,
        title: "出欠が未回答",
        reason: `${nextEvent.kind === "match" ? "試合" : "練習"}「${nextEvent.title}」、出欠が未回答 ・ ${unansweredNext}名`,
        onClick: () => board.setScreen("team"),
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
  const shotSeries = useMemo(() => weeklyShotPct(board.notebook, 7), [board.notebook]);

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

  const rec = useMemo(() => matchSummary(team.team.matches), [team.team.matches]);
  const winPct = rec.winPct;
  const winDelta = trendDelta(winSeries);

  const teamTechAll = useMemo(() => aggregateTech(board.notebook), [board.notebook]);
  const shotPct = teamTechAll.shotPct;
  const shotDelta = trendDelta(shotSeries);

  const [metricIdx, setMetricIdx] = useState(0);
  const metric: PulseMetric = PULSE_METRICS[metricIdx];
  const [autorotate, setAutorotateState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem(AUTOROTATE_KEY);
      if (stored != null) return stored === "1";
    } catch {
      /* localStorage不可時は既定値のまま */
    }
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const setAutorotate = (v: boolean) => {
    setAutorotateState(v);
    try {
      window.localStorage.setItem(AUTOROTATE_KEY, v ? "1" : "0");
    } catch {
      /* 保存できなくても動作は継続 */
    }
  };
  const [pulseHover, setPulseHover] = useState(false);
  useEffect(() => {
    // feed側の自動送りeffectと同形: reduced-motionでは自動切替を起動しない
    if (reduceMotion) return;
    if (!autorotate || pulseHover) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setMetricIdx((i) => (i + 1) % PULSE_METRICS.length);
    }, 8000);
    return () => clearInterval(id);
  }, [autorotate, pulseHover, reduceMotion]);

  const chartData = metric === "notes" ? notesSeries : metric === "att" ? attSeries : metric === "win" ? winSeries : shotSeries;
  const chartMax = metric === "notes" ? undefined : 100;
  const chartTitle =
    metric === "notes"
      ? "週別ノート提出数の推移（直近7週）"
      : metric === "att"
      ? "週別出席率の推移（直近7週・%）"
      : metric === "win"
      ? "月別勝率の推移（直近7ヶ月・%）"
      : "週別シュート決定率の推移（直近7週・%）";

  // useCountUpはフック規則上つねに数値を渡す必要があるため null は0にフォールバックし、
  // 表示側は元の値(attPctAvg/winPct/shotPct)がnullかどうかで「—」と出し分ける
  const notesCountUp = useCountUp(notesThisWeek, reduceMotion);
  const attCountUp = useCountUp(attPctAvg ?? 0, reduceMotion);
  const winCountUp = useCountUp(winPct ?? 0, reduceMotion);
  const shotCountUp = useCountUp(shotPct ?? 0, reduceMotion);

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
  const nextTopicLabel = TOPIC_LABELS[(topicMetricIdx + 1) % 4];

  // トピック(月ローテ)が切り替わるたびにバーを0%から伸長させ直す
  const [topicDrawn, setTopicDrawn] = useState(false);
  useEffect(() => {
    setTopicDrawn(false);
    const raf = requestAnimationFrame(() => setTopicDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [topicMetricIdx, topic.rows.length]);

  /* ---------------- 区画4右: 最新の動き ---------------- */
  const feedItems = useMemo(() => {
    const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? "選手";
    const items: { id: string; ts: number; text: string; initial: string }[] = [];
    board.notebook.forEach((n) => {
      const name = nameOf(n.playerId);
      items.push({
        id: "note-" + n.id,
        ts: n.ts,
        text: `${name}さんが${NOTE_KIND_LABEL[n.kind]}ノートを提出`,
        initial: name.charAt(0),
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
        });
      });
    });
    return items.sort((a, b) => b.ts - a.ts).slice(0, 6);
  }, [board.notebook, team.team.matches, board.deliverables, players]);

  const [feedHover, setFeedHover] = useState(false);
  const [feedOffset, setFeedOffset] = useState(0);
  const [feedInstant, setFeedInstant] = useState(false);
  const feedCount = feedItems.length;
  useEffect(() => {
    if (feedCount <= 4 || feedHover || reduceMotion) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      setFeedOffset((o) => o + 1);
    }, 4500);
    return () => clearInterval(id);
  }, [feedCount, feedHover, reduceMotion]);
  useEffect(() => {
    if (feedOffset === 0 || feedOffset < feedCount) return;
    const t = setTimeout(() => {
      setFeedInstant(true);
      setFeedOffset(0);
      requestAnimationFrame(() => requestAnimationFrame(() => setFeedInstant(false)));
    }, 360);
    return () => clearTimeout(t);
  }, [feedOffset, feedCount]);
  const feedDisplay = reduceMotion || feedCount <= 4 ? feedItems.slice(0, 4) : [...feedItems, ...feedItems.slice(0, 4)];

  /* ---------------- 区画4下: 今月のハイライト ---------------- */
  const highlightChips = useMemo(() => {
    const chips: string[] = [];
    const fullAttendanceCount =
      players.length > 0
        ? monthEvents.filter((e) => team.summary(e.id).yes === players.length).length
        : 0;
    if (fullAttendanceCount > 0) chips.push(`全員出席 ${fullAttendanceCount}回`);

    const weekMax = Math.max(0, ...notesSeries.map((p) => p.value ?? 0));
    if (notesThisWeek > 0 && notesThisWeek >= weekMax) chips.push("ノート提出 週間最高");

    const firstGoalDate: Record<string, string> = {};
    [...team.team.matches]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((mm) => mm.goals.forEach((g) => {
        if (!firstGoalDate[g.playerId]) firstGoalDate[g.playerId] = mm.date;
      }));
    const firstGoalCount = Object.values(firstGoalDate).filter((d) => d.startsWith(ym)).length;
    if (firstGoalCount > 0) chips.push(`初得点 ${firstGoalCount}人`);

    return chips;
  }, [monthEvents, team, players, notesSeries, notesThisWeek, ym]);

  const teamName = board.state.teamName ?? "マイチーム";

  return (
    <div className="mdb-root">
      <div className="mdb-greetrow">
        <div className="mdb-greetin">
          <div className="mdb-greet">
            <div className="mdb-date">{today}</div>
            <div className="mdb-name">
              こんにちは、{board.auth.name} さん
              <span className="mdb-role">スタッフ</span>
            </div>
          </div>
          <div className="mdb-greetactions">
            <div className="mdb-bellwrap" ref={bellRef}>
              <button
                type="button"
                className="mdb-bell"
                onClick={() => setBellOpen((o) => !o)}
                aria-label={bellBadge > 0 ? `対応が必要なこと（${bellBadge}件）` : "対応が必要なこと"}
              >
                <E n="bell" />
                {bellBadge > 0 && <span className="mdb-bellcount">{bellBadge > 9 ? "9+" : bellBadge}</span>}
              </button>
              {bellOpen && (
                <div className="mdb-bellpanel" role="menu">
                  {bellRows.length === 0 ? (
                    <div className="mdb-bellempty">対応が必要なことはありません</div>
                  ) : (
                    bellRows.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="mdb-bellrow"
                        onClick={() => {
                          r.onClick();
                          setBellOpen(false);
                        }}
                      >
                        <span className="mdb-bellbadge">{r.badge > 9 ? "9+" : r.badge}</span>
                        <span className="mdb-bellbody">
                          <span className="mdb-belltitle">{r.title}</span>
                          <span className="mdb-bellreason">{r.reason}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button className="homeout" onClick={logout}>
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="scroll mdb-scroll">
        {/* 区画1: ヒーロー */}
        {!nextEvent ? (
          <div className="mdb-herothin">
            <span>次の予定はまだありません</span>
            <button type="button" className="mdb-herothin-cta" onClick={() => board.setScreen("team")}>
              予定を追加 ›
            </button>
          </div>
        ) : (
          <div className="mdb-hero">
            <div className="mdb-herobody">
              {showVsCard ? (
                <div className="mdb-vscard">
                  <div className="mdb-side mdb-side-own">
                    {board.teamLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="mdb-emblem" src={board.teamLogo} alt="" />
                    ) : (
                      <span className="mdb-emblem mdb-emblem-fallback" aria-hidden="true">
                        {teamName.trim().charAt(0)}
                      </span>
                    )}
                    <span className="mdb-ownname">{teamName}</span>
                  </div>
                  <span className="mdb-vs">VS</span>
                  <div className="mdb-side mdb-side-opp">
                    <span className="mdb-oppname">{opponent}</span>
                  </div>
                </div>
              ) : (
                <div className="mdb-eventcard">
                  <span className="mdb-eventtitle">{nextEvent.title}</span>
                  <span className="mdb-eventcat">{categoryLabel(nextEvent, team.categories)}</span>
                </div>
              )}

              <div className="mdb-countdownwrap">
                {cd && (
                  <div className="mdb-countdown" key={fadeKey}>
                    {cd.started ? "まもなく開始" : `${cd.days}日 ${cd.hours}時間 ${cd.minutes}分`}
                  </div>
                )}
              </div>

              {last5.length > 0 && (
                <div className="mdb-pillsrow">
                  <div className="mdb-pills">
                    {last5.map((m, i) => {
                      const r = resultOf(m);
                      const resultChar = r === "w" ? "勝" : r === "d" ? "分" : "敗";
                      const resultWord = r === "w" ? "勝ち" : r === "d" ? "分け" : "負け";
                      const [, mo, d] = m.date.split("-").map(Number);
                      return (
                        <span
                          key={m.id}
                          className={`mdb-pill ${r}${i === last5.length - 1 ? " cur" : ""}`}
                          style={{ animationDelay: `${i * 70}ms` }}
                          title={`${m.date} vs ${m.opponent} ${m.ourScore}-${m.theirScore}`}
                          aria-label={`${mo}/${d} vs ${m.opponent} ${m.ourScore}-${m.theirScore} ${resultWord}`}
                        >
                          {resultChar}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mdb-pillcaption">直近5戦で得点{scorerCount}人</div>
                </div>
              )}
            </div>

            <div className="mdb-metarow">
              <div className="mdb-metaitem">
                <span className="mdb-metalabel">会場</span>
                <span className="mdb-metaval">{nextEvent.place || "—"}</span>
              </div>
              <div className="mdb-metaitem">
                <span className="mdb-metalabel">開始</span>
                <span className="mdb-metaval">
                  {fmtEventDate(nextEvent.date)}
                  {nextEvent.time ? ` ${nextEvent.time}〜` : ""}
                </span>
              </div>
              {nextEvent.note && (
                <div className="mdb-metaitem">
                  <span className="mdb-metalabel">メモ</span>
                  <span className="mdb-metaval">{nextEvent.note.split("\n")[0]}</span>
                </div>
              )}
              <div className="mdb-metaitem mdb-metaitem-att">
                <span className="mdb-metalabel">出欠</span>
                <span className="mdb-metaval">未回答 {unansweredNext}名</span>
                <button type="button" className="mdb-cta" onClick={() => board.setScreen("team")}>
                  出欠を確認
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 区画3: チームパルス */}
        <div className="kpicard2 mdb-pulse" onMouseEnter={() => setPulseHover(true)} onMouseLeave={() => setPulseHover(false)}>
          <div className="kpiband">
            <button type="button" className={`kpitile${metric === "notes" ? " on" : ""}`} onClick={() => setMetricIdx(0)}>
              <div className="kv">{notesCountUp}</div>
              <div className="kl">今週の提出</div>
              {notesDelta != null && (
                <span className={`mdb-kpidelta${notesDelta >= 0 ? " up" : " down"}`}>{fmtDelta("先週比", notesDelta, "件")}</span>
              )}
            </button>
            <button type="button" className={`kpitile mdb-ringtile${metric === "att" ? " on" : ""}`} onClick={() => setMetricIdx(1)}>
              <div className="mdb-ringrow">
                <MdbRing pct={attPctAvg} />
                <div>
                  <div className="kv">{attPctAvg != null ? `${attCountUp}%` : "—"}</div>
                  <div className="kl">出席率</div>
                </div>
              </div>
              {attDelta != null && (
                <span className={`mdb-kpidelta${attDelta >= 0 ? " up" : " down"}`}>{fmtDelta("先週比", attDelta, "pt")}</span>
              )}
            </button>
            <button type="button" className={`kpitile${metric === "win" ? " on" : ""}`} onClick={() => setMetricIdx(2)}>
              <div className="kv">{winPct != null ? `${winCountUp}%` : "—"}</div>
              <div className="kl">勝率</div>
              {winDelta != null && (
                <span className={`mdb-kpidelta${winDelta >= 0 ? " up" : " down"}`}>{fmtDelta("前月比", winDelta, "pt")}</span>
              )}
            </button>
            <button type="button" className={`kpitile${metric === "shot" ? " on" : ""}`} onClick={() => setMetricIdx(3)}>
              <div className="kv">{shotPct != null ? `${shotCountUp}%` : "—"}</div>
              <div className="kl">シュート決定率</div>
              {shotDelta != null && (
                <span className={`mdb-kpidelta${shotDelta >= 0 ? " up" : " down"}`}>{fmtDelta("先週比", shotDelta, "pt")}</span>
              )}
            </button>
          </div>
          <div className="kpichart">
            <div className="sech mdb-charttitle">{chartTitle}</div>
            <MdbChart data={chartData} max={chartMax} metricKey={metric} />
          </div>
          <label className="mdb-autorow">
            <input type="checkbox" checked={autorotate} onChange={(e) => setAutorotate(e.target.checked)} />
            自動で切り替える
          </label>
        </div>

        {/* 区画4: 今月のトピック × 最新の動き */}
        <div className="mdb-cols">
          <div className="mdb-panel mdb-topic">
            <div className="mdb-panel-head">
              <span className="mdb-panel-h">今月のトピック</span>
              <span className="mdb-panel-sub">{TOPIC_LABELS[topicMetricIdx]}ランキング</span>
            </div>
            {topic.rows.length === 0 ? (
              <div className="mdb-topicempty">まだデータがありません</div>
            ) : (
              <div className="mdb-topicrows">
                {topic.rows.map((r, i) => (
                  <div className="mdb-topicrow" key={r.playerId}>
                    <span className="mdb-topicrank">{i + 1}</span>
                    <span className="mdb-topicname">{r.name}</span>
                    <span className="mdb-topicbartrack">
                      <span
                        className="mdb-topicbar"
                        style={{ width: topicDrawn && topicMax > 0 ? `${Math.round((r.value / topicMax) * 100)}%` : "0%" }}
                      />
                    </span>
                    <span className="mdb-topicval">
                      {r.value}
                      {topicUnit}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {topic.fallback && <div className="mdb-topicfallback">全期間</div>}
            <div className="mdb-topicnext">来月は{nextTopicLabel}が主役</div>
          </div>

          <div className="mdb-panel mdb-feed">
            <div className="mdb-panel-head">
              <span className="mdb-panel-h">最新の動き</span>
            </div>
            <div className="mdb-feedlist" onMouseEnter={() => setFeedHover(true)} onMouseLeave={() => setFeedHover(false)}>
              {feedItems.length === 0 ? (
                <div className="mdb-feedempty">まだ動きがありません</div>
              ) : (
                <div
                  className="mdb-feedtrack"
                  style={{
                    transform: `translateY(-${feedOffset * ROW_H}px)`,
                    transition: feedInstant ? "none" : "transform 340ms var(--ease-standard)",
                  }}
                >
                  {feedDisplay.map((it, i) => (
                    <div className="mdb-feeditem" key={`${it.id}-${i}`}>
                      <span className="mdb-feedicon" aria-hidden="true">{it.initial}</span>
                      <span className="mdb-feedtext">{it.text}</span>
                      <span className="mdb-feedtime">{relTime(it.ts)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {highlightChips.length > 0 && (
          <div className="mdb-highlights">
            {highlightChips.map((c, i) => (
              <span className="mdb-chip" key={i}>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
