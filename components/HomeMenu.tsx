"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadNotifSeen } from "@/lib/storage";
import { localDateStr } from "@/lib/dates";
import { buildEventNotifications } from "@/lib/notifications";
import { aggregateTech, matchSummary } from "@/lib/teamStatsAgg";
import { useBoard, type StatMetric } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import LogoMark from "./Logo";
import { StatBody } from "./SheetManager";
import MobileHome from "./MobileHome";
import {
  useMatchdayData,
  useReducedMotion,
  useCountUp,
  MdbChart,
  MdbRing,
  fmtDelta,
  fmtEventDate,
  categoryLabel,
  relTime,
  PULSE_METRICS,
  TOPIC_LABELS,
  LEAGUE_MINI_ROWS,
  ROW_H,
  type BoardCtx,
  type TeamCtx,
  type PulseMetric,
} from "./homeData";
import {
  IconCalendarCheck,
  IconChat,
  IconClipboard,
  IconCog,
  IconCone,
  IconFolder,
  IconLab,
  IconNote,
  IconSetPiece,
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
  // PC選手ホーム「マイスタッツ」カードから開いた内訳指標（.hstats直下にインライン展開）
  const [statSel, setStatSel] = useState<StatMetric | null>(null);
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));
  const today = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  // 以下 noteUnread/todayInfo/recordSummary/teamTech/myTech はPC分岐(下のpc判定より前)専用の集計。
  // フック規則上ここに置く必要があり、スマホ/選手モバイル経路でも計算されてしまうが
  // (レビューPhase D-1 C2-minor)、PCの描画結果を変えないことを優先し据え置く。
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
  // PC選手ホーム: マイスタッツのカードは.hstats直下にインライン展開。モバイルは.hstats自体が非表示のため従来のシートのまま
  const openStat = (metric: StatMetric) => {
    if (typeof window !== "undefined" && window.matchMedia(PC_MQ).matches) {
      setStatSel(metric);
    } else {
      board.openSheet({ type: "stat", statMetric: metric });
    }
  };

  // PC×コーチのみ「マッチデー・ボード」へ刷新。モバイル・選手のJSXは以下、一切変更しない
  if (pc && coach) {
    return <MatchdayBoard board={board} team={teamCtx} logout={logout} today={today} />;
  }

  // PC（選手）ホーム：mobile-redesignの対象外（PCのDOM・見た目は変更しない）。
  // 従来のJSXをそのまま維持する（openSheet(library/settings)だけsetScreenへ統一。
  // ここはcoachが常にfalseの経路のため、coach分岐の中身は実行されない＝表示に影響なし）
  if (pc) {
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
            こんにちは、{board.auth.name}さん
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
            <button className="hstat" onClick={() => board.setScreen("library")}>
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
                <button className="hstat" onClick={() => openStat("shot")}>
                  <span className="hstat-n">{myTech.shots}</span>
                  <span className="hstat-l">シュート ・ 決定率{pctOrDash(myTech.shotPct)}</span>
                </button>
                <button className="hstat" onClick={() => openStat("pass")}>
                  <span className="hstat-n">{myTech.pass}</span>
                  <span className="hstat-l">パス ・ 成功率{pctOrDash(myTech.passPct)}</span>
                </button>
                <button className="hstat" onClick={() => openStat("dribble")}>
                  <span className="hstat-n">{myTech.dribble}</span>
                  <span className="hstat-l">ドリブル ・ 成功率{pctOrDash(myTech.dribblePct)}</span>
                </button>
              </>
            )}
          </div>
        </div>
        {!coach && pc && statSel && (
          <div className="mdb-statinline">
            <button
              type="button"
              onClick={() => setStatSel(null)}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                marginBottom: 10,
                color: "var(--mut)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ‹ 閉じる
            </button>
            <StatBody metric={statSel} />
          </div>
        )}
        <div className="appgrid">
          {coach ? (
            <>
              <Tile
                icon={<IconClipboard />}
                label="戦術ボード"
                desc="スタメンを並べて動きをアニメで確認"
                onClick={() => board.setScreen("board")}
              />
              <Tile
                icon={<IconSetPiece />}
                label="セットプレーデザイン"
                desc="CK・FK・スローインの動きを設計して共有する"
                onClick={() => board.setScreen("setpiece")}
              />
              <Tile
                icon={<IconFolder />}
                label="保存した戦術"
                desc="保存した戦術を選んで読み込む"
                onClick={() => board.setScreen("library")}
              />
              <Tile
                icon={<IconCone />}
                label="練習メニュー"
                desc="コーンを並べて動線を描き、練習図を作る"
                onClick={() => board.setScreen("drill")}
              />
              <Tile
                icon={<IconFolder />}
                label="保存した練習"
                desc="保存した練習メニューを一覧で確認する"
                onClick={() => {
                  board.setDrillIntent("library");
                  board.setScreen("drill");
                }}
              />
              <Tile
                icon={<IconCalendarCheck />}
                label="チーム運営"
                desc="名簿や出欠、試合の記録をまとめて管理する"
                onClick={() => board.setScreen("team")}
              />
              <Tile
                icon={<IconChat />}
                label="チャット"
                desc="戦術や写真、動画をチームに送って共有する"
                onClick={() => board.setScreen("chat")}
              />
              <Tile
                icon={<IconNote />}
                label="サッカーノート"
                desc="試合や練習を振り返ってノートに書く"
                badge={noteUnread}
                onClick={() => board.setScreen("notebook")}
              />
              <Tile
                icon={<IconLab />}
                label="コーチラボ"
                desc="指導者の記事を読む・書く・売る"
                onClick={() => board.setScreen("articles")}
              />
              <Tile
                icon={<IconCog />}
                label="設定"
                desc="チーム名やプラン、公開範囲を変更する"
                onClick={() => board.setScreen("settings")}
              />
            </>
          ) : (
            <>
              <Tile
                icon={<IconSetPiece />}
                label="セットプレーデザイン"
                desc="CK・FK・スローインの動きを設計して共有する"
                onClick={() => board.setScreen("setpiece")}
              />
              <Tile
                icon={<IconCalendarCheck />}
                label="チーム"
                desc="予定や試合の結果を確認する"
                onClick={() => board.setScreen("team")}
              />
              <Tile
                icon={<IconChat />}
                label="チャット"
                desc="スタッフやチームとメッセージをやりとりする"
                onClick={() => board.setScreen("chat")}
              />
              <Tile
                icon={<IconNote />}
                label="サッカーノート"
                desc="試合や練習を振り返ってノートに書く"
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

  // ---- ここからモバイル（コーチ・選手共通）。mobile-home-v3: 行メニュー/今日やること/チームのいまを廃し、
  // MatchdayBoardと集計を共有するスタッツ中心のホーム(MobileHome)に一本化する ----
  return <MobileHome />;
}

/* =========================================================================================
 * マッチデー・ボード（PCコーチホーム刷新）
 * PC(min-width:1024px) かつ コーチ のときだけ HomeMenu からレンダリングされる専用ホーム。
 * カウントダウン等のintervalは、このコンポーネントがマウントされている間だけ動く
 * （モバイル/選手経路に切り替わればアンマウントされ、各useEffectのcleanupで自動停止する）。
 * ========================================================================================= */

const AUTOROTATE_KEY = "alfa_home_autorotate";

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
  const {
    nextEvent,
    opponent,
    showVsCard,
    cd,
    unansweredNext,
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
  } = useMatchdayData(board, team);

  // 分の値が変わったらキーを更新してCSSアニメ(opacity 300msフェード)を再生させる
  const [fadeKey, setFadeKey] = useState(0);
  const prevMinRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cd) return;
    const cur = cd.days * 1440 + cd.hours * 60 + cd.minutes;
    if (prevMinRef.current !== null && prevMinRef.current !== cur) setFadeKey((k) => k + 1);
    prevMinRef.current = cur;
  }, [cd]);

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

  // "rank"タイルはグラフ(MdbChart)ではなく簡易順位表(.ptable)を描くため、chartDataはそちらでは未使用
  const chartData = metric === "notes" ? notesSeries : metric === "att" ? attSeries : winSeries;
  const chartMax = metric === "notes" ? undefined : 100;
  const chartTitle =
    metric === "notes"
      ? "週別ノート提出数の推移（直近7週）"
      : metric === "att"
      ? "週別出席率の推移（直近7週・%）"
      : metric === "win"
      ? "月別勝率の推移（直近7ヶ月・%）"
      : "リーグ順位表（上位5チーム）";

  // useCountUpはフック規則上つねに数値を渡す必要があるため null は0にフォールバックし、
  // 表示側は元の値(attPctAvg/winPct)がnullかどうかで「—」と出し分ける
  const notesCountUp = useCountUp(notesThisWeek, reduceMotion);
  const attCountUp = useCountUp(attPctAvg ?? 0, reduceMotion);
  const winCountUp = useCountUp(winPct ?? 0, reduceMotion);

  // トピック(月ローテ)が切り替わるたびにバーを0%から伸長させ直す
  const [topicDrawn, setTopicDrawn] = useState(false);
  useEffect(() => {
    setTopicDrawn(false);
    const raf = requestAnimationFrame(() => setTopicDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [topicMetricIdx, topic.rows.length]);

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

  return (
    <div className="mdb-root">
      <div className="mdb-greetrow">
        <div className="mdb-greetin">
          <div className="mdb-greet">
            <div className="mdb-date">{today}</div>
            <div className="mdb-name">
              こんにちは、{board.auth.name}さん
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
              {/* board-squad-and-pc-polish §3: メンバー登録済みの試合バッジ。
                  レビュー指摘(1回目): 濃紺グラデのヒーローカード内で.evgroups.targeted（薄青地に
                  薄青文字）を使うとコントラスト比が約2.1:1しか無く読めなかった。隣の値と同じ
                  .mdb-metaval（白文字）で出す */}
              {nextEvent.kind === "match" && nextEvent.squad && (
                <div className="mdb-metaitem">
                  <span className="mdb-metalabel">メンバー</span>
                  <span className="mdb-metaval">メンバー発表</span>
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
        <div className={`kpicard2 mdb-pulse mdb-metric-${metric}`} onMouseEnter={() => setPulseHover(true)} onMouseLeave={() => setPulseHover(false)}>
          <div className="kpiband">
            <button type="button" className={`kpitile mdb-tile-notes${metric === "notes" ? " on" : ""}`} onClick={() => setMetricIdx(0)}>
              <div className="kv">{notesCountUp}</div>
              <div className="kl">今週の提出</div>
              {notesDelta != null && (
                <span className={`mdb-kpidelta${notesDelta >= 0 ? " up" : " down"}`}>{fmtDelta("先週比", notesDelta, "件")}</span>
              )}
            </button>
            <button type="button" className={`kpitile mdb-ringtile mdb-tile-att${metric === "att" ? " on" : ""}`} onClick={() => setMetricIdx(1)}>
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
            <button type="button" className={`kpitile mdb-tile-win${metric === "win" ? " on" : ""}`} onClick={() => setMetricIdx(2)}>
              <div className="kv">{winPct != null ? `${winCountUp}%` : "—"}</div>
              <div className="kl">勝率</div>
              {winDelta != null && (
                <span className={`mdb-kpidelta${winDelta >= 0 ? " up" : " down"}`}>{fmtDelta("前月比", winDelta, "pt")}</span>
              )}
            </button>
            <button type="button" className={`kpitile mdb-tile-rank${metric === "rank" ? " on" : ""}`} onClick={() => setMetricIdx(3)}>
              <div className="kv">{leagueRank.rank}位</div>
              <div className="kl">リーグ順位</div>
              <span className="mdb-kpidelta">{leagueRank.size}チーム中</span>
            </button>
          </div>
          <div className="kpichart">
            <div className="sech mdb-charttitle">{chartTitle}</div>
            {metric === "rank" ? (
              <table className="ptable mdb-ranktable">
                <tbody>
                  {LEAGUE_MINI_ROWS.map((r) =>
                    "gap" in r ? (
                      <tr className="mdb-rankgap" key="gap">
                        <td colSpan={3}>…</td>
                      </tr>
                    ) : (
                      <tr key={r.rank} className={r.own ? "own" : undefined}>
                        <td className="num">{r.rank}</td>
                        <td className="col-name">{r.name}</td>
                        <td className="num leaguepts">{r.pts}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            ) : (
              <MdbChart data={chartData} max={chartMax} metricKey={metric} />
            )}
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
                      <span className={`mdb-feedicon mdb-avatar-${it.colorIdx}`} aria-hidden="true">{it.initial}</span>
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
              <span className={`mdb-chip mdb-chip-${c.kind}`} key={i}>
                {c.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
