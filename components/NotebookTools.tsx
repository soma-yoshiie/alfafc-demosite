"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatchNote, NoteKind, NotebookEntry, Player, PracticeNote, SoloNote, TeamGroup } from "@/lib/types";
import { NOTE_KIND_LABEL, SOLO_KIND_LABEL } from "@/lib/types";
import { E, ConditionIcon } from "./Emoji";
import { MultiLine, Sparkline } from "./Charts";
import { loadTeam } from "@/lib/storage";
import { computePlayerKpi, computeTeamSummary } from "@/lib/coaching";
import { playerInGroup, resolveFilterGroup } from "@/lib/groups";
import { addDaysStr, localDateStr, weekStart, weeklyCounts } from "@/lib/dates";
import {
  buildDigest,
  buildEventNotifications,
  type NotifInput,
  type NotifTarget,
} from "@/lib/notifications";
import { useBoard, type KpiMetric } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useGroupFilter } from "./GroupChips";

const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TeamHub.tsx usePc() と同じ手法） */
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

/** 通知ターゲットの安定キー（PCマスター・ディテールの選択中ハイライト判定用） */
/* ===================== 通知 ===================== */
export function NotificationsView({
  seenAt,
  onNavigate,
  selectedKey,
}: {
  seenAt: number;
  onNavigate: (t: NotifTarget, notifId?: string) => void;
  /** PC右ペインで選択中の通知ID（Notification.id）。未指定/nullなら選択表示なし */
  selectedKey?: string | null;
}) {
  const board = useBoard();
  // 選択判定は通知ID単位。target単位だと同じ配信を指す複数行が同時に光ってしまう
  const isSel = (id: string) => selectedKey != null && id === selectedKey;
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
              className={`kpialert ${n.level}${isSel(n.id) ? " sel" : ""}`}
              style={{ width: "100%", textAlign: "left", cursor: n.target ? "pointer" : "default" }}
              onClick={() => n.target && onNavigate(n.target, n.id)}
            >
              {n.text}
            </button>
          ))}
        </div>
      )}

      <div className="notesec-h" style={{ marginTop: 14 }}>最近の動き</div>
      {events.length === 0 ? (
        <div className="empty-msg">
          <b>通知はまだありません</b>
          <br />
          出欠・ノート・配信の更新があるとここに表示されます
        </div>
      ) : (
        events.map((n) => (
          <button
            key={n.id}
            className={`notifrow${n.ts > seenAt ? " unread" : ""}${isSel(n.id) ? " sel" : ""}`}
            onClick={() => n.target && onNavigate(n.target, n.id)}
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
  const team = useTeam();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [playerId, setPlayerId] = useState<string>(initialPlayerId ?? "all");

  const me = board.auth.playerId;
  const kw = q.trim().toLowerCase();

  // groups-phase2 §4: コーチのグループ絞り込み（"notebook"キーを他部品と共有。selfで読み直す）
  const [filterIds] = useGroupFilter("notebook");
  const filterGroup = isCoach ? resolveFilterGroup(filterIds, team.groups) : null;
  // 選手selectの候補: 絞り込み中は対象選手だけ ∪ 現在の選択（選んだ選手が候補から消えない）
  const playerOptions = useMemo(() => {
    if (!filterGroup) return board.state.players;
    return board.state.players.filter((p) => playerInGroup(p, filterGroup) || p.id === playerId);
  }, [board.state.players, filterGroup, playerId]);

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
      <div className="searchwrap">
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
              {playerOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="searchcount">{results.length}件</div>
      {/* review #1回目: 仕様§4は選手selectの候補だけを絞り込み対象にする設計のため、resultsは
          意図的にfilterGroupを見ていない。ただし選手select(全員)のままだと結果に他グループの
          選手が混じる理由が画面から分からないため、絞り込み中だけ一言添える
          （resultsの母集合自体は変えない＝仕様どおり） */}
      {isCoach && filterGroup && playerId === "all" && (
        <div className="fieldhint">
          「{filterGroup.label}」で絞り込み中ですが、結果は選手を指定するまで全員が対象です
        </div>
      )}
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
  onOpenKpi,
  players,
  notebook,
  filterGroup,
}: {
  onOpenPlayer: (playerId: string) => void;
  onReport: (playerId: string) => void;
  onOpenNote: (id: string) => void;
  /** PC: サマリーカードの内訳をペイン表示するコールバック（未指定/モバイルは従来のシート） */
  onOpenKpi?: (metric: KpiMetric) => void;
  /** groups-phase2 §4: 絞り込み中の対象選手一覧（呼び出し側でグループ絞り込み済み。未絞り込みは全選手） */
  players: Player[];
  /** 対象選手のノートだけにしたnotebook（呼び出し側で絞り込み済み） */
  notebook: NotebookEntry[];
  /** 絞り込み中のグループ（nullは「すべて」。AnalyticsPanelの静的チップ・KPI集計の母集合表示に使う） */
  filterGroup: TeamGroup | null;
}) {
  const board = useBoard();
  const team = useTeam(); // groups-phase2 §4: loadTeam()直読みをやめてuseTeam()から
  const [showHeat, setShowHeat] = useState(false);
  // 選手別レポート(kpigrid/kpicard)をPCのみ<table class="ptable">へ切替える(C1)。モバイルは従来のカード描画のまま
  const pc = usePc();

  const { kpis, summary } = useMemo(() => {
    const ks = players.map((p) =>
      computePlayerKpi(p, notebook, board.deliverables, team.team)
    );
    // 警告の多い順 → 名前順
    const sev = (lvl: string) => (lvl === "warn" ? 0 : lvl === "info" ? 1 : 2);
    ks.sort((a, b) => sev(a.alerts[0].level) - sev(b.alerts[0].level));
    return { kpis: ks, summary: computeTeamSummary(ks, notebook) };
  }, [players, notebook, board.deliverables, team.team]);

  const nameOf = (pid: string) => board.state.players.find((p) => p.id === pid)?.name ?? "選手";
  const unseenAll = useMemo(
    () => [...notebook].filter((n) => !n.staffSeenAt).sort((a, b) => b.ts - a.ts),
    [notebook]
  );
  const unseen = unseenAll.slice(0, 5);

  // 集計期間メタ（今週=月曜始まりのカレンダー週）
  const today = localDateStr();
  const monday = weekStart(today);
  const sunday = addDaysStr(monday, 6);

  // 「今週のノート」の前週比デルタ（weekStart 基準のカレンダー週で今週/先週を集計）
  const weekNoteDiff = useMemo(() => {
    const lastMonday = addDaysStr(monday, -7);
    const thisWeek = notebook.filter((n) => n.date >= monday).length;
    const lastWeek = notebook.filter((n) => weekStart(n.date) === lastMonday).length;
    return thisWeek - lastWeek;
  }, [notebook, monday]);

  // 選手別 提出ヒート（直近8週、月曜起点）：選手ID→週ごとの提出有無と8週合計
  const heatByPlayer = useMemo(() => {
    const thisMonday = weekStart(localDateStr());
    const weekMondays = Array.from({ length: 8 }, (_, k) => addDaysStr(thisMonday, -7 * (7 - k)));
    const map = new Map<string, { cells: boolean[]; total: number }>();
    players.forEach((p) => {
      const mine = notebook.filter((n) => n.playerId === p.id);
      const weekSet = new Set(mine.map((n) => weekStart(n.date)));
      map.set(p.id, {
        cells: weekMondays.map((mon) => weekSet.has(mon)),
        total: mine.filter((n) => weekMondays.includes(weekStart(n.date))).length,
      });
    });
    return map;
  }, [notebook, players]);

  // チームの週別提出（直近8週・全選手合算）
  const teamWeeklyChart = useMemo(
    () => weeklyCounts(notebook.map((n) => n.date)),
    [notebook]
  );

  // groups-phase2 §4: AnalyticsPanelの静的チップ「選手 全員」→ 絞り込み中は「選手 中3（23人）」
  const analyticsLabel = filterGroup ? `選手 ${filterGroup.label}（${players.length}人）` : undefined;

  // PCはモーダルを出さず onOpenKpi でペイン表示、モバイル(またはonOpenKpi未指定)は従来のシート
  const openKpi = (metric: KpiMetric) => {
    if (onOpenKpi && pc) {
      onOpenKpi(metric);
    } else {
      board.openSheet({ type: "kpi", kpiMetric: metric });
    }
  };

  return (
    <div className="notetools">
      <h2><E n="chart" /> コーチ・ダッシュボード</h2>
      <div className="dashmeta">今週 {fmt(monday)} – {fmt(sunday)} ・ 週は月曜起点</div>

      {/* PCでは左=スタッツ列 / 右=分析パネル以下の2カラム（モバイルは縦一列） */}
      <div className="dashcols">
      <div className="dashcol side">
      <div className="dashsum">
        <button type="button" className="dashbox" onClick={() => openKpi("attendance")}>
          <div className="dbv">{summary.avgAttendance != null ? summary.avgAttendance + "%" : "—"}</div><div className="dbl">平均出席率</div>
        </button>
        <button type="button" className="dashbox" onClick={() => openKpi("notesWeek")}>
          <div className="dbv">{summary.notesThisWeek}</div>
          <div className="dbl">今週のノート</div>
          <div className={"dbd " + (weekNoteDiff > 0 ? "up" : weekNoteDiff < 0 ? "down" : "flat")}>
            {weekNoteDiff > 0 ? `↗ 先週 +${weekNoteDiff}` : weekNoteDiff < 0 ? `↘ 先週 ${weekNoteDiff}` : "— 先週と同じ"}
          </div>
          <Sparkline values={teamWeeklyChart.map((w) => w.value)} />
        </button>
        <button type="button" className="dashbox" onClick={() => openKpi("uncommented")}>
          <div className="dbv">{summary.uncommentedTotal}</div><div className="dbl">未コメント</div>
        </button>
        <button type="button" className="dashbox" onClick={() => openKpi("solo")}>
          <div className="dbv">{summary.soloActive}</div><div className="dbl">自主練継続</div>
        </button>
      </div>
      </div>

      <div className="dashcol main">
      <AnalyticsPanel mode="coach" notebook={notebook} filterLabel={analyticsLabel} />

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

      {pc ? (
        <table className="ptable">
          <thead>
            <tr>
              <th>選手</th>
              <th className="num">出席率</th>
              <th className="num">ノート</th>
              <th className="num">自主練</th>
              <th className="num">継続</th>
              <th className="num">課題進捗</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr
                key={k.playerId}
                className="ptable-row"
                tabIndex={0}
                onClick={() => onOpenPlayer(k.playerId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenPlayer(k.playerId);
                  }
                }}
              >
                <td>
                  <div className="ptable-main">
                    <span className="ptable-cond">{k.conditionRecent ? <ConditionIcon c={k.conditionRecent} /> : ""}</span>
                    <span className="ptable-nm">{k.name}</span>
                    {k.alerts.length > 0 && (
                      <span className="ptable-alerts">
                        {k.alerts.map((a, i) => (
                          <span key={i} className={`kpialert ${a.level}`}>{a.text}</span>
                        ))}
                      </span>
                    )}
                    <span
                      className="kpireport ptable-report"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onReport(k.playerId); }}
                    >
                      <E n="doc" /> レポート
                    </span>
                  </div>
                </td>
                <td className="num">{k.attendancePct != null ? `${k.attendancePct}%` : "—"}</td>
                <td className="num">{k.noteCount ?? "—"}</td>
                <td className="num">{k.soloCount}</td>
                <td className="num">
                  {k.soloStreak > 0 ? <><E n="fire" /> 週{k.soloStreak}</> : "—"}
                </td>
                <td className="num">{k.assignmentTotal > 0 ? `${k.assignmentDone}/${k.assignmentTotal}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
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
      )}
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
export function AnalyticsPanel({
  mode,
  notebook,
  filterLabel,
}: {
  mode: "player" | "coach";
  /** groups-phase2 §4: コーチのみ・絞り込み済みnotebook（省略時はboard.notebook全件。選手側は常に省略） */
  notebook?: NotebookEntry[];
  /** コーチのみ・静的チップの文言（絞り込み中は「選手 中3（23人）」。省略時は「選手 全員」） */
  filterLabel?: string;
}) {
  const board = useBoard();
  // コーチ側の集計母数。propsで絞り込み済みが渡ればそれを使い、無指定(=選手側)はboard.notebook全件
  const coachNotebook = notebook ?? board.notebook;
  const [weeks, setWeeks] = useState<8 | 12>(8);
  const [tab, setTab] = useState(0);
  // mobile-redesign Phase D-2(critical PC回帰): 見出しの区切りをEN DASH→中黒へ統一した
  // Phase D-1の変更(§8-4 #22)がPCの見た目も変えてしまっていた(共通ルール「PCの見た目を
  // 変えない」に抵触)。中黒はスマホのみに残し、PCは元のEN DASH表記に戻す
  const pc = usePc();

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
    const byKind = (k: NoteKind) => coachNotebook.filter((n) => n.kind === k).map((n) => n.date);
    return {
      practice: seriesFrom("練習", PRACTICE_COLOR, byKind("practice"), weeks),
      match: seriesFrom("試合", MATCH_COLOR, byKind("match"), weeks),
      solo: seriesFrom("自主練", SOLO_COLOR, byKind("solo"), weeks),
    };
  }, [coachNotebook, weeks]);

  // コーチ: 選手別タブ用（期間内件数の上位4選手＋その他）
  const coachByPlayer = useMemo(() => {
    const thisMonday = weekStart(localDateStr());
    const weekMondays = Array.from({ length: weeks }, (_, k) => addDaysStr(thisMonday, -7 * (weeks - 1 - k)));
    const inPeriod = new Set(weekMondays);
    const periodCounts = new Map<string, number>();
    coachNotebook.forEach((n) => {
      if (inPeriod.has(weekStart(n.date))) periodCounts.set(n.playerId, (periodCounts.get(n.playerId) ?? 0) + 1);
    });
    const ranked = [...periodCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top4 = ranked.slice(0, 4);
    const otherIds = new Set(ranked.slice(4).map(([pid]) => pid));

    const series: AnalyticsSeries[] = top4.map(([pid], i) =>
      seriesFrom(
        nameOf(pid),
        PLAYER_COLORS[i],
        coachNotebook.filter((n) => n.playerId === pid).map((n) => n.date),
        weeks
      )
    );
    if (otherIds.size > 0) {
      series.push(
        seriesFrom(
          "その他",
          OTHER_COLOR,
          coachNotebook.filter((n) => otherIds.has(n.playerId)).map((n) => n.date),
          weeks
        )
      );
    }
    return series;
  }, [coachNotebook, board.state.players, weeks]);

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
        {/* mobile-redesign Phase D-1(minor §8-4 #22): 見出しのEN DASHは使わず中黒に統一。
            ただしPCは既存表記(EN DASH)のまま変えない（Phase D-2 critical回帰対応） */}
        {isPlayer
          ? `マイ分析${pc ? " – " : "・"}${board.auth.name}`
          : `チーム分析${pc ? " – " : "・"}${board.state.teamName ?? "U-12"}`}
      </div>
      <div className="apanel-f">
        <button type="button" className="afchip" onClick={() => setWeeks(weeks === 8 ? 12 : 8)}>
          期間 {weeks}週 ▾
        </button>
        {!isPlayer && <span className="afchip static">{filterLabel ?? "選手 全員"}</span>}
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
