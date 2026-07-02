"use client";

import { useMemo, useState } from "react";
import type { MatchNote, NoteKind, NotebookEntry, PracticeNote, SoloNote } from "@/lib/types";
import { NOTE_KIND_LABEL, SOLO_KIND_LABEL } from "@/lib/types";
import { E, ConditionIcon } from "./Emoji";
import { loadTeam } from "@/lib/storage";
import { computePlayerKpi, computeTeamSummary } from "@/lib/coaching";
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
}: {
  onOpenPlayer: (playerId: string) => void;
  onReport: (playerId: string) => void;
}) {
  const board = useBoard();

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

  return (
    <div className="notetools">
      <h2><E n="chart" /> コーチ・ダッシュボード</h2>

      <div className="dashsum">
        <div className="dashbox"><div className="dbv">{summary.avgAttendance != null ? summary.avgAttendance + "%" : "—"}</div><div className="dbl">平均出席率</div></div>
        <div className="dashbox"><div className="dbv">{summary.notesThisWeek}</div><div className="dbl">今週のノート</div></div>
        <div className="dashbox"><div className="dbv">{summary.uncommentedTotal}</div><div className="dbl">未コメント</div></div>
        <div className="dashbox"><div className="dbv">{summary.soloActive}</div><div className="dbl">自主練継続</div></div>
      </div>

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
            <span>自主練 {k.soloCount}{k.soloStreak > 0 && <> (<E n="fire" />{k.soloStreak})</>}</span>
            {k.assignmentTotal > 0 && <span>課題 {k.assignmentDone}/{k.assignmentTotal}</span>}
            {k.quizAvgPct != null && <span>テスト {k.quizAvgPct}%</span>}
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
  );
}
