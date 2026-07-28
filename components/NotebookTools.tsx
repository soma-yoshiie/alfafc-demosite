"use client";

import { useMemo, useState } from "react";
import type { MatchNote, NoteKind, NotebookEntry, PracticeNote, SoloNote } from "@/lib/types";
import { NOTE_KIND_LABEL, SOLO_KIND_LABEL } from "@/lib/types";
import { E, ConditionIcon } from "./Emoji";
import { MultiLine, Sparkline } from "./Charts";
import { loadTeam } from "@/lib/storage";
import { computePlayerKpi, computeTeamSummary } from "@/lib/coaching";
import { addDaysStr, localDateStr, weekStart, weeklyCounts } from "@/lib/dates";
import {
  buildDigest,
  buildEventNotifications,
  type NotifInput,
  type NotifTarget,
} from "@/lib/notifications";
import { useBoard } from "./BoardProvider";

function fmt(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
  return `${m}/${day}(${wd})`;
}
function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 通知の識別キー（コーチ/選手で別） */
export function notifIdentity(role: string, playerId?: string): string {
  return role === "coach" ? "coach" : "p:" + (playerId ?? "");
}
/** 未読イベント通知の件数 */
export function unreadEventCount(input: NotifInput, seenAt: number): number {
  return buildEventNotifications(input).filter((n) => n.ts > seenAt).length;
}

/* ===================== 通知 ===================== */
export function NotificationsView({
  seenAt,
  onNavigate,
}: {
  seenAt: number;
  onNavigate: (t: NotifTarget) => void;
}) {
  const board = useBoard();
  const input: NotifInput = useMemo(
    () => ({
      role: board.auth.role,
      playerId: board.auth.playerId,
      notebook: board.notebook,
      deliverables: board.deliverables,
      players: board.state.players,
      team: loadTeam(),
    }),
    [board.auth.role, board.auth.playerId, board.notebook, board.deliverables, board.state.players]
  );
  const digest = useMemo(() => buildDigest(input), [input]);
  const events = useMemo(() => buildEventNotifications(input).slice(0, 50), [input]);

  return (
    <div className="notetools">
      <h2><E n="bell" /> 通知</h2>

      {digest.length > 0 && (
        <div className="digestbox">
          <div className="notesec-h">今日のまとめ</div>
          {digest.map((n) => (
            <button
              key={n.id}
              className={`kpialert ${n.level}`}
              style={{ width: "100%", textAlign: "left", cursor: n.target ? "pointer" : "default" }}
              onClick={() => n.target && onNavigate(n.target)}
            >
              {n.text}
            </button>
          ))}
        </div>
      )}

      <div className="notesec-h" style={{ marginTop: 14 }}>最近の動き</div>
      {events.length === 0 ? (
        <div className="empty-msg">通知はまだありません。</div>
      ) : (
        events.map((n) => (
          <button
            key={n.id}
            className={`notifrow${n.ts > seenAt ? " unread" : ""}`}
            onClick={() => n.target && onNavigate(n.target)}
          >
            <span className={`notifdot ${n.level}`} />
            <span className="notiftext">{n.text}</span>
            <span className="notifdate">{fmtTs(n.ts)}</span>
          </button>
        ))
      )}
    </div>
  );
}

/** 検索対象テキストを連結 */
function entryText(n: NotebookEntry): string {
  const parts: (string | undefined)[] = [n.body];
  if (n.kind === "practice") {
    const p = n as PracticeNote;
    parts.push(p.goalPre, ...(p.insights ?? []));
  } else if (n.kind === "match") {
    const m = n as MatchNote;
    parts.push(m.opponent, m.bestPlay, m.reflectPlay, m.reportGood, m.reportImprove, m.reportSummary, m.aiSummary);
  } else {
    const s = n as SoloNote;
    parts.push(...s.items.map((i) => `${SOLO_KIND_LABEL[i.kind]} ${i.value}`));
  }
  return parts.filter(Boolean).join(" ");
}

function snippet(n: NotebookEntry): string {
  const t = entryText(n).trim();
  return t || "（本文なし）";
}

/* ===================== 横断検索 ===================== */
export function NoteSearch({
  isCoach,
  initialPlayerId,
  onOpen,
}: {
  isCoach: boolean;
  initialPlayerId?: string;
  onOpen: (id: string) => void;
}) {
  const board = useBoard();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [playerId, setPlayerId] = useState<string>(initialPlayerId ?? "all");

  const me = board.auth.playerId;
  const kw = q.trim().toLowerCase();

  const results = useMemo(() => {
    let list = board.notebook;
    if (!isCoach) list = list.filter((n) => n.playerId === me);
    else if (playerId !== "all") list = list.filter((n) => n.playerId === playerId);
    if (kind !== "all") list = list.filter((n) => n.kind === kind);
    if (kw) list = list.filter((n) => entryText(n).toLowerCase().includes(kw));
    return [...list].sort((a, b) => b.ts - a.ts);
  }, [board.notebook, isCoach, me, playerId, kind, kw]);

  const nameOf = (pid: string) => board.state.players.find((p) => p.id === pid)?.name ?? "選手";

  return (
    <div className="notetools">
      <h2><E n="search" /> ノートを検索</h2>
      <div className="formfield">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="気づき・目標・メモ・相手名などで検索"
          autoFocus
        />
      </div>
      <div className="cmpbar" style={{ paddingTop: 0 }}>
        {(["all", "match", "practice", "solo"] as const).map((k) => (
          <button key={k} className={`cmpchip${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
            {k === "all" ? "すべて" : NOTE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {isCoach && (
        <div className="formfield">
          <label>選手で絞り込み</label>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="all">全員</option>
            {board.state.players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="searchcount">{results.length}件</div>
      {results.length === 0 ? (
        <div className="empty-msg">該当するノートがありません。</div>
      ) : (
        <div className="notecards">
          {results.map((n) => (
            <button key={n.id} className="notecard" onClick={() => onOpen(n.id)}>
              <div className="notecond">{n.condition ? <ConditionIcon c={n.condition} /> : NOTE_KIND_LABEL[n.kind].slice(0, 1)}</div>
              <div className="notemain">
                <div className="notetop">
                  {isCoach && <span className="notewho">{nameOf(n.playerId)}</span>}
                  <span className="dlvtag" style={{ borderColor: "var(--line)", color: "var(--mut)" }}>{NOTE_KIND_LABEL[n.kind]}</span>
                  <span className="notedate">{fmt(n.date)}</span>
                </div>
                <div className="notebody">{snippet(n)}</div>
              </div>
              <span className="convchev">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== コーチ・ダッシュボード ===================== */
export function CoachDashboard({
  onOpenPlayer,
  onReport,
  onOpenNote,
}: {
  onOpenPlayer: (playerId: string) => void;
  onReport: (playerId: string) => void;
  onOpenNote: (id: string) => void;
}) {
  const board = useBoard();
  const [showHeat, setShowHeat] = useState(false);

  const { kpis, summary } = useMemo(() => {
    const team = loadTeam();
    const ks = board.state.players.map((p) =>
      computePlayerKpi(p, board.notebook, board.deliverables, team)
    );
    // 警告の多い順 → 名前順
    const sev = (lvl: string) => (lvl === "warn" ? 0 : lvl === "info" ? 1 : 2);
    ks.sort((a, b) => sev(a.alerts[0].level) - sev(b.alerts[0].level));
    return { kpis: ks, summary: computeTeamSummary(ks, board.notebook) };
  }, [board.notebook, board.deliverables, board.state.players]);

  const nameOf = (pid: string) => board.state.players.find((p) => p.id === pid)?.name ?? "選手";
  const unseenAll = useMemo(
    () => [...board.notebook].filter((n) => !n.staffSeenAt).sort((a, b) => b.ts - a.ts),
    [board.notebook]
  );
  const unseen = unseenAll.slice(0, 5);

  // 集計期間メタ（今週=月曜始まりのカレンダー週）
  const today = localDateStr();
  const monday = weekStart(today);
  const sunday = addDaysStr(monday, 6);

  // 「今週のノート」の前週比デルタ（weekStart 基準のカレンダー週で今週/先週を集計）
  const weekNoteDiff = useMemo(() => {
    const lastMonday = addDaysStr(monday, -7);
    const thisWeek = board.notebook.filter((n) => n.date >= monday).length;
    const lastWeek = board.notebook.filter((n) => weekStart(n.date) === lastMonday).length;
    return thisWeek - lastWeek;
  }, [board.notebook, monday]);

  // 選手別 提出ヒート（直近8週、月曜起点）：選手ID→週ごとの提出有無と8週合計
  const heatByPlayer = useMemo(() => {
    const thisMonday = weekStart(localDateStr());
    const weekMondays = Array.from({ length: 8 }, (_, k) => addDaysStr(thisMonday, -7 * (7 - k)));
    const map = new Map<string, { cells: boolean[]; total: number }>();
    board.state.players.forEach((p) => {
      const mine = board.notebook.filter((n) => n.playerId === p.id);
      const weekSet = new Set(mine.map((n) => weekStart(n.date)));
      map.set(p.id, {
        cells: weekMondays.map((mon) => weekSet.has(mon)),
        total: mine.filter((n) => weekMondays.includes(weekStart(n.date))).length,
      });
    });
    return map;
  }, [board.notebook, board.state.players]);

  // チームの週別提出（直近8週・全選手合算）
  const teamWeeklyChart = useMemo(
    () => weeklyCounts(board.notebook.map((n) => n.date)),
    [board.notebook]
  );

  return (
    <div className="notetools">
      <h2><E n="chart" /> コーチ・ダッシュボード</h2>
      <div className="dashmeta">今週 {fmt(monday)} – {fmt(sunday)} ・ 週は月曜起点</div>

      {/* PCでは左=スタッツ列 / 右=分析パネル以下の2カラム（モバイルは縦一列） */}
      <div className="dashcols">
      <div className="dashcol side">
      <div className="dashsum">
        <div className="dashbox"><div className="dbv">{summary.avgAttendance != null ? summary.avgAttendance + "%" : "—"}</div><div className="dbl">平均出席率</div></div>
        <div className="dashbox">
          <div className="dbv">{summary.notesThisWeek}</div>
          <div className="dbl">今週のノート</div>
          <div className={"dbd " + (weekNoteDiff > 0 ? "up" : weekNoteDiff < 0 ? "down" : "flat")}>
            {weekNoteDiff > 0 ? `↗ 先週 +${weekNoteDiff}` : weekNoteDiff < 0 ? `↘ 先週 ${weekNoteDiff}` : "— 先週と同じ"}
          </div>
          <Sparkline values={teamWeeklyChart.map((w) => w.value)} />
        </div>
        <div className="dashbox"><div className="dbv">{summary.uncommentedTotal}</div><div className="dbl">未コメント</div></div>
        <div className="dashbox"><div className="dbv">{summary.soloActive}</div><div className="dbl">自主練継続</div></div>
      </div>
      </div>

      <div className="dashcol main">
      <AnalyticsPanel mode="coach" />

      <button className="heattoggle" onClick={() => setShowHeat(!showHeat)}>
        {showHeat ? "選手別の提出ヒートを隠す ▴" : "詳細分析: 選手別の提出ヒートを表示 ▾"}
      </button>

      {showHeat && (
        <div className="heatcard">
          <div className="notesec-h">選手別 提出ヒート（8週）</div>
          <table className="heattbl">
            <thead>
              <tr>
                <th>選手</th>
                {Array.from({ length: 8 }, (_, i) => (
                  <th key={i}>{`W${i + 1}`}</th>
                ))}
                <th>計</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => {
                const h = heatByPlayer.get(k.playerId);
                return (
                  <tr key={k.playerId}>
                    <td>{k.name}</td>
                    {(h?.cells ?? Array(8).fill(false)).map((on, i) => (
                      <td key={i}>
                        <span className={`hdot${on ? " on" : ""}`}>{on ? "●" : "—"}</span>
                      </td>
                    ))}
                    <td>{h?.total ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unseen.length > 0 && (
        <>
          <div className="notesec-h" style={{ marginTop: 14 }}>未確認の提出 ({unseenAll.length})</div>
          {unseen.map((n) => (
            <button key={n.id} className="notifrow" onClick={() => onOpenNote(n.id)}>
              <span className="notiftext">{nameOf(n.playerId)} ・ {NOTE_KIND_LABEL[n.kind]}</span>
              <span className="notifdate">{fmt(n.date)}</span>
              <span className="convchev">›</span>
            </button>
          ))}
        </>
      )}

      <div className="kpigrid">
      {kpis.map((k) => (
        <button key={k.playerId} className="kpicard" onClick={() => onOpenPlayer(k.playerId)}>
          <div className="kpihd">
            <span className="kpiname">{k.name}</span>
            <span className="kpicond">{k.conditionRecent ? <ConditionIcon c={k.conditionRecent} /> : ""}</span>
            <span
              className="kpireport"
              style={{ marginLeft: "auto" }}
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onReport(k.playerId); }}
            >
              <E n="doc" /> レポート
            </span>
          </div>
          <div className="kpistats">
            <span>出席 {k.attendancePct != null ? k.attendancePct + "%" : "—"}</span>
            <span>ノート {k.noteCount}</span>
            <span>自主練 {k.soloCount}{k.soloStreak > 0 && <> (<E n="fire" /> 週{k.soloStreak})</>}</span>
            {k.assignmentTotal > 0 && <span>課題 {k.assignmentDone}/{k.assignmentTotal}</span>}
          </div>
          <div className="kpialerts">
            {k.alerts.map((a, i) => (
              <span key={i} className={`kpialert ${a.level}`}>{a.text}</span>
            ))}
          </div>
        </button>
      ))}
      </div>
      </div>
      </div>
    </div>
  );
}

/* ===================== 分析パネル（案D） ===================== */
// カテゴリカラー（SVG属性に直書きするため CSS var は使わず定数で管理）
const PRACTICE_COLOR = "#10a15c";
const MATCH_COLOR = "#3b82f6";
const SOLO_COLOR = "#f59e0b";
const PLAYER_COLORS = ["#3b82f6", "#10a15c", "#ec4899", "#8b5cf6"];
const OTHER_COLOR = "#f59e0b";

const PLAYER_TABS = ["すべて", "試合", "練習", "自主練"] as const;
const COACH_TABS = ["選手別", "種別"] as const;

type AnalyticsSeries = { label: string; color: string; values: number[]; total: number };

/** dates→週別バケット(weeklyCounts)から MultiLine 用の系列を組み立てる */
function seriesFrom(label: string, color: string, dates: string[], weeks: number): AnalyticsSeries {
  const w = weeklyCounts(dates, weeks);
  return { label, color, values: w.map((x) => x.value), total: w.reduce((s, x) => s + x.value, 0) };
}

/** マイ分析 / チーム分析の共通パネル部品（案D: フィルタ→タブ→サマリー列→多系列チャート） */
export function AnalyticsPanel({ mode }: { mode: "player" | "coach" }) {
  const board = useBoard();
  const [weeks, setWeeks] = useState<8 | 12>(8);
  const [tab, setTab] = useState(0);

  const isPlayer = mode === "player";
  const nameOf = (pid: string) => board.state.players.find((p) => p.id === pid)?.name ?? "選手";

  // X軸ラベルは weeks・今日のみに依存するため、系列に関わらず共通
  const labels = useMemo(() => weeklyCounts([], weeks).map((w) => w.label), [weeks]);

  // 選手: 自分のノートを種別ごとに週集計
  const playerSeries = useMemo(() => {
    const me = board.auth.playerId;
    const mine = board.notebook.filter((n) => n.playerId === me);
    const byKind = (k: NoteKind) => mine.filter((n) => n.kind === k).map((n) => n.date);
    return {
      practice: seriesFrom("練習", PRACTICE_COLOR, byKind("practice"), weeks),
      match: seriesFrom("試合", MATCH_COLOR, byKind("match"), weeks),
      solo: seriesFrom("自主練", SOLO_COLOR, byKind("solo"), weeks),
    };
  }, [board.notebook, board.auth.playerId, weeks]);

  // コーチ: 種別タブ用（全ノートを種別ごとに週集計）
  const coachByKind = useMemo(() => {
    const byKind = (k: NoteKind) => board.notebook.filter((n) => n.kind === k).map((n) => n.date);
    return {
      practice: seriesFrom("練習", PRACTICE_COLOR, byKind("practice"), weeks),
      match: seriesFrom("試合", MATCH_COLOR, byKind("match"), weeks),
      solo: seriesFrom("自主練", SOLO_COLOR, byKind("solo"), weeks),
    };
  }, [board.notebook, weeks]);

  // コーチ: 選手別タブ用（期間内件数の上位4選手＋その他）
  const coachByPlayer = useMemo(() => {
    const thisMonday = weekStart(localDateStr());
    const weekMondays = Array.from({ length: weeks }, (_, k) => addDaysStr(thisMonday, -7 * (weeks - 1 - k)));
    const inPeriod = new Set(weekMondays);
    const periodCounts = new Map<string, number>();
    board.notebook.forEach((n) => {
      if (inPeriod.has(weekStart(n.date))) periodCounts.set(n.playerId, (periodCounts.get(n.playerId) ?? 0) + 1);
    });
    const ranked = [...periodCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top4 = ranked.slice(0, 4);
    const otherIds = new Set(ranked.slice(4).map(([pid]) => pid));

    const series: AnalyticsSeries[] = top4.map(([pid], i) =>
      seriesFrom(
        nameOf(pid),
        PLAYER_COLORS[i],
        board.notebook.filter((n) => n.playerId === pid).map((n) => n.date),
        weeks
      )
    );
    if (otherIds.size > 0) {
      series.push(
        seriesFrom(
          "その他",
          OTHER_COLOR,
          board.notebook.filter((n) => otherIds.has(n.playerId)).map((n) => n.date),
          weeks
        )
      );
    }
    return series;
  }, [board.notebook, board.state.players, weeks]);

  const tabs = isPlayer ? PLAYER_TABS : COACH_TABS;
  const current: AnalyticsSeries[] = isPlayer
    ? tab === 1
      ? [playerSeries.match]
      : tab === 2
      ? [playerSeries.practice]
      : tab === 3
      ? [playerSeries.solo]
      : [playerSeries.practice, playerSeries.match, playerSeries.solo]
    : tab === 1
    ? [coachByKind.practice, coachByKind.match, coachByKind.solo]
    : coachByPlayer;

  const total = current.reduce((s, x) => s + x.total, 0);

  return (
    <div className="apanel">
      <div className="apanel-h">
        {isPlayer ? `マイ分析 — ${board.auth.name}` : `チーム分析 — ${board.state.teamName ?? "U-12"}`}
      </div>
      <div className="apanel-f">
        <button type="button" className="afchip" onClick={() => setWeeks(weeks === 8 ? 12 : 8)}>
          期間 {weeks}週 ▾
        </button>
        {!isPlayer && <span className="afchip static">選手 全員</span>}
      </div>
      <div className="apanel-tabs">
        {tabs.map((t, i) => (
          <button key={t} type="button" className={tab === i ? "on" : ""} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>
      <div className="apanel-sum">
        <div className="cell">
          <div className="k">合計</div>
          <div className="n">{total}</div>
        </div>
        {current.map((s) => (
          <div className="cell" key={s.label}>
            <div className="k">
              <i style={{ background: s.color }} />
              {s.label}
            </div>
            <div className="n">{s.total}</div>
          </div>
        ))}
      </div>
      <MultiLine series={current} labels={labels} />
    </div>
  );
}
