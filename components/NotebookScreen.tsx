"use client";

import { useMemo, useState } from "react";
import type {
  CoachDeliverable,
  DeliverKind,
  MatchNote,
  MatchPhase,
  MatchPhaseLineup,
  NoteCondition,
  NoteKind,
  NotebookEntry,
  PlayKind,
  PlayLine,
  PlayLineKind,
  PlayPoint,
  PracticeNote,
  SoloItem,
  SoloKind,
  SoloNote,
} from "@/lib/types";
import {
  MATCH_PHASE_LABEL,
  NOTE_CONDITION_LABEL,
  NOTE_KIND_LABEL,
  PLAY_KIND_LABEL,
  PLAY_LINE_LABEL,
  SOLO_KIND_LABEL,
} from "@/lib/types";
import { FORMATION_KEYS, buildSlots } from "@/lib/formations";
import { aiClient, analyzePlayAreaLocal } from "@/lib/ai";
import { useBoard } from "./BoardProvider";
import { E, ConditionIcon } from "./Emoji";
import { FormationPitch, PlayAreaPitch, type PlayTool } from "./MiniPitch";
import { loadNotifSeen, loadTeam, saveNotifSeen } from "@/lib/storage";
import { buildEventNotifications, type NotifTarget } from "@/lib/notifications";
import { DeliverBlock, DeliverComposer, DeliverDetail } from "./DeliverViews";
import { CoachDashboard, NoteSearch, NotificationsView, notifIdentity } from "./NotebookTools";
import SeasonReport from "./SeasonReport";

const CONDITIONS: NoteCondition[] = ["great", "good", "normal", "tired", "bad"];
const PLAY_KINDS: PlayKind[] = ["receive", "shot", "miss"];
const PLAY_LINE_KINDS: PlayLineKind[] = ["dribble", "pass", "shot"];
const SOLO_KINDS: SoloKind[] = ["lifting", "running", "strength", "other"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmt(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
  return `${m}/${day}(${wd})`;
}
/** 連続記録日数（最新の記録日から遡って連続している日数） */
function streakOf(dates: string[]): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  const key = (dt: Date) => dt.toISOString().slice(0, 10);
  const d = new Date();
  if (!set.has(key(d))) {
    d.setDate(d.getDate() - 1);
    if (!set.has(key(d))) return 0;
  }
  let count = 0;
  while (set.has(key(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

type View =
  | { mode: "list" }
  | { mode: "form"; edit?: NotebookEntry }
  | { mode: "detail"; id: string }
  | { mode: "deliverForm"; kind: DeliverKind; edit?: CoachDeliverable }
  | { mode: "deliverDetail"; id: string }
  | { mode: "search"; playerId?: string }
  | { mode: "dashboard" }
  | { mode: "notifs" }
  | { mode: "report"; playerId: string };

export default function NotebookScreen() {
  const board = useBoard();
  const isCoach = board.auth.role === "coach";
  const [tab, setTab] = useState<NoteKind>("practice");
  const [view, setView] = useState<View>({ mode: "list" });

  const identity = notifIdentity(board.auth.role, board.auth.playerId);
  const [seenAt, setSeenAt] = useState<number>(() => loadNotifSeen()[identity] ?? 0);
  const unread = useMemo(() => {
    const evts = buildEventNotifications({
      role: board.auth.role,
      playerId: board.auth.playerId,
      notebook: board.notebook,
      deliverables: board.deliverables,
      players: board.state.players,
      team: loadTeam(),
    });
    return evts.filter((n) => n.ts > seenAt).length;
  }, [board.auth.role, board.auth.playerId, board.notebook, board.deliverables, board.state.players, seenAt]);

  const openNotifs = () => {
    const now = Date.now();
    const map = loadNotifSeen();
    map[identity] = now;
    saveNotifSeen(map);
    setSeenAt(now);
    setView({ mode: "notifs" });
  };

  const navTarget = (t: NotifTarget) => {
    if (t.kind === "note") setView({ mode: "detail", id: t.id });
    else if (t.kind === "deliver") setView({ mode: "deliverDetail", id: t.id });
    else setView({ mode: "search", playerId: t.id });
  };

  return (
    <div className="app noteapp">
      <header>
        <div
          className="fpback"
          onClick={() => (view.mode === "list" ? board.setScreen("home") : setView({ mode: "list" }))}
        >
          ‹ {view.mode === "list" ? "メニュー" : "ノート一覧"}
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">
            サッカー<b>ノート</b>
          </div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {isCoach ? "提出された振り返り" : `${board.auth.name} さん`}
          </div>
        </div>
        {view.mode === "list" && (
          <div className="notetoolbtns">
            <button className="notetoolbtn" onClick={openNotifs} title="通知">
              <E n="bell" />
              {unread > 0 && <span className="notifbadge">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {isCoach && (
              <button className="notetoolbtn" onClick={() => setView({ mode: "dashboard" })} title="ダッシュボード">
                <E n="chart" />
              </button>
            )}
            {!isCoach && board.auth.playerId && (
              <button
                className="notetoolbtn"
                onClick={() => setView({ mode: "report", playerId: board.auth.playerId! })}
                title="シーズンレポート"
              >
                <E n="doc" />
              </button>
            )}
            <button className="notetoolbtn" onClick={() => setView({ mode: "search" })} title="検索">
              <E n="search" />
            </button>
          </div>
        )}
      </header>

      {view.mode === "list" && (
        <div className="fbar">
          {(["match", "practice", "solo"] as NoteKind[]).map((k) => (
            <div key={k} className={`chip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
              {NOTE_KIND_LABEL[k]}
            </div>
          ))}
        </div>
      )}

      <div className="scroll" style={{ padding: "4px 14px calc(env(safe-area-inset-bottom) + 24px)" }}>
        {view.mode === "list" && (
          <NoteList
            kind={tab}
            isCoach={isCoach}
            onWrite={() => setView({ mode: "form" })}
            onOpen={(id) => setView({ mode: "detail", id })}
            onOpenDeliver={(id) => setView({ mode: "deliverDetail", id })}
            onCreateDeliver={(k) => setView({ mode: "deliverForm", kind: k })}
          />
        )}
        {view.mode === "form" && (
          <NoteForm kind={tab} edit={view.edit} onDone={() => setView({ mode: "list" })} />
        )}
        {view.mode === "detail" && (
          <NoteDetail
            id={view.id}
            isCoach={isCoach}
            onEdit={(e) => setView({ mode: "form", edit: e })}
            onDeleted={() => setView({ mode: "list" })}
          />
        )}
        {view.mode === "deliverForm" && (
          <DeliverComposer kind={view.kind} edit={view.edit} onDone={() => setView({ mode: "list" })} />
        )}
        {view.mode === "deliverDetail" && (
          <DeliverDetail id={view.id} onBack={() => setView({ mode: "list" })} />
        )}
        {view.mode === "search" && (
          <NoteSearch
            isCoach={isCoach}
            initialPlayerId={view.playerId}
            onOpen={(id) => setView({ mode: "detail", id })}
          />
        )}
        {view.mode === "dashboard" && (
          <CoachDashboard
            onOpenPlayer={(playerId) => setView({ mode: "search", playerId })}
            onReport={(playerId) => setView({ mode: "report", playerId })}
          />
        )}
        {view.mode === "notifs" && <NotificationsView seenAt={seenAt} onNavigate={navTarget} />}
        {view.mode === "report" && <SeasonReport playerId={view.playerId} />}
      </div>
    </div>
  );
}

/* ===================== 一覧 ===================== */
function NoteList({
  kind,
  isCoach,
  onWrite,
  onOpen,
  onOpenDeliver,
  onCreateDeliver,
}: {
  kind: NoteKind;
  isCoach: boolean;
  onWrite: () => void;
  onOpen: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onCreateDeliver: (kind: DeliverKind) => void;
}) {
  const board = useBoard();
  const me = board.auth.playerId;
  // 練習ノートは「自分 / チーム共有」を切替（⑪）
  const [scope, setScope] = useState<"mine" | "team">("mine");

  const entries = useMemo(() => {
    let list = board.notebook.filter((n) => n.kind === kind);
    if (isCoach) {
      // コーチは全員分
    } else if (kind === "practice" && scope === "team") {
      list = list.filter((n) => (n as PracticeNote).isPublic);
    } else {
      list = list.filter((n) => n.playerId === me);
    }
    return [...list].sort((a, b) => b.ts - a.ts);
  }, [board.notebook, kind, isCoach, scope, me]);

  const nameOf = (pid: string) => board.state.players.find((p) => p.id === pid)?.name ?? "選手";

  // 自主練のストリーク（選手のみ）
  const streak = useMemo(() => {
    if (kind !== "solo" || isCoach) return 0;
    return streakOf(board.notebook.filter((n) => n.kind === "solo" && n.playerId === me).map((n) => n.date));
  }, [board.notebook, kind, isCoach, me]);

  // 試合の出場ポジション集計（選手のみ）①将来表示の先取り
  const posSummary = useMemo(() => {
    if (kind !== "match" || isCoach) return [];
    const counts: Record<string, number> = {};
    board.notebook
      .filter((n): n is MatchNote => n.kind === "match" && n.playerId === me)
      .forEach((n) => {
        const roles = new Set<string>();
        (n.lineups ?? []).forEach((lu) => {
          if (lu.ownPositionIndex != null) {
            const role = buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role;
            if (role) roles.add(role);
          }
        });
        roles.forEach((r) => (counts[r] = (counts[r] ?? 0) + 1));
      });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [board.notebook, kind, isCoach, me]);

  return (
    <>
      {kind === "practice" && (
        <DeliverBlock kinds={["menu", "assignment", "quiz"]} onOpen={onOpenDeliver} onCreate={onCreateDeliver} />
      )}
      {kind === "match" && (
        <DeliverBlock kinds={["meeting"]} onOpen={onOpenDeliver} onCreate={onCreateDeliver} />
      )}

      {!isCoach && kind === "practice" && (
        <div className="scopebar">
          <button className={`scopechip${scope === "mine" ? " on" : ""}`} onClick={() => setScope("mine")}>
            自分のノート
          </button>
          <button className={`scopechip${scope === "team" ? " on" : ""}`} onClick={() => setScope("team")}>
            チームの共有
          </button>
        </div>
      )}

      {!isCoach && kind === "solo" && streak > 0 && (
        <div className="streakcard"><E n="fire" /> 連続記録 {streak}日</div>
      )}

      {!isCoach && kind === "match" && posSummary.length > 0 && (
        <div className="possummary">
          <div className="ps-h">今シーズンの出場ポジション</div>
          <div className="ps-row">
            {posSummary.map(([role, n]) => (
              <span key={role} className="ps-chip">
                {role} <b>{n}</b>試合
              </span>
            ))}
          </div>
        </div>
      )}

      {!isCoach && !(kind === "practice" && scope === "team") && (
        <button className="bigbtn" style={{ width: "100%", margin: "10px 0 8px" }} onClick={onWrite}>
          ＋ {NOTE_KIND_LABEL[kind]}ノートを書く
        </button>
      )}

      {entries.length === 0 ? (
        <div className="empty-msg">
          {kind === "practice" && scope === "team"
            ? "共有されたノートはまだありません。"
            : `まだ${NOTE_KIND_LABEL[kind]}ノートがありません。`}
        </div>
      ) : (
        <div className="notecards">
          {entries.map((n) => (
            <NoteCard
              key={n.id}
              entry={n}
              who={isCoach || (kind === "practice" && scope === "team") ? nameOf(n.playerId) : undefined}
              onClick={() => onOpen(n.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function summarize(n: NotebookEntry): string {
  if (n.kind === "match") {
    const m = n as MatchNote;
    const head = `vs ${m.opponent || "—"}`;
    const detail = m.bestPlay?.trim() || m.body?.trim();
    if (detail) return `${head} ・ ${detail}`;
    const meta = [
      (m.lineups?.length ?? 0) > 0 ? `${m.lineups!.length}フェーズ` : null,
      (m.plays?.length ?? 0) > 0 ? `プレー${m.plays!.length}件` : null,
    ].filter(Boolean);
    return meta.length ? `${head} ・ ${meta.join(" / ")}` : head;
  }
  if (n.kind === "solo") return (n as SoloNote).items.map((i) => `${SOLO_KIND_LABEL[i.kind]} ${i.value}`).join(" ・ ") || "自主練";
  const p = n as PracticeNote;
  return p.body || p.goalPre || (p.insights?.[0] ?? "練習ノート");
}

function NoteCard({ entry, who, onClick }: { entry: NotebookEntry; who?: string; onClick: () => void }) {
  return (
    <button className="notecard" onClick={onClick}>
      <div className="notecond">{entry.condition ? <ConditionIcon c={entry.condition} /> : NOTE_KIND_LABEL[entry.kind].slice(0, 1)}</div>
      <div className="notemain">
        <div className="notetop">
          {who && <span className="notewho">{who}</span>}
          <span className="notedate">{fmt(entry.date)}</span>
          {entry.kind === "practice" && (entry as PracticeNote).isPublic && <span className="notetag share">共有</span>}
          {entry.staffComment ? <span className="notetag done">コメント済</span> : who ? <span className="notetag">未読</span> : null}
        </div>
        <div className="notebody">{summarize(entry)}</div>
      </div>
      <span className="convchev">›</span>
    </button>
  );
}

/* ===================== 記入フォーム ===================== */
function ConditionPicker({ value, onChange }: { value: NoteCondition | undefined; onChange: (c: NoteCondition) => void }) {
  return (
    <div className="formfield">
      <label>コンディション</label>
      <div className="condrow">
        {CONDITIONS.map((c) => (
          <button key={c} type="button" className={`condbtn${value === c ? " on" : ""}`} onClick={() => onChange(c)}>
            <span><ConditionIcon c={c} /></span>
            {NOTE_CONDITION_LABEL[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

function NoteForm({ kind, edit, onDone }: { kind: NoteKind; edit?: NotebookEntry; onDone: () => void }) {
  if (edit?.kind === "match" || (!edit && kind === "match")) {
    return <MatchForm edit={edit as MatchNote | undefined} onDone={onDone} />;
  }
  if (edit?.kind === "solo" || (!edit && kind === "solo")) {
    return <SoloForm edit={edit as SoloNote | undefined} onDone={onDone} />;
  }
  return <PracticeForm edit={edit as PracticeNote | undefined} onDone={onDone} />;
}

/* --- 練習ノート（④気づき・⑥目標/達成度・⑪共有） --- */
function PracticeForm({ edit, onDone }: { edit?: PracticeNote; onDone: () => void }) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [condition, setCondition] = useState<NoteCondition | undefined>(edit?.condition);
  const [goalPre, setGoalPre] = useState(edit?.goalPre ?? "");
  const [achievement, setAchievement] = useState<number>(edit?.achievement ?? 60);
  const [insights, setInsights] = useState<string[]>(edit?.insights?.length ? edit.insights : [""]);
  const [body, setBody] = useState(edit?.body ?? "");
  const [isPublic, setIsPublic] = useState(edit?.isPublic ?? false);

  const submit = () => {
    const ins = insights.map((s) => s.trim()).filter(Boolean);
    if (!goalPre.trim() && !body.trim() && ins.length === 0) {
      board.toast("目標か振り返りを入力してください");
      return;
    }
    const base = {
      playerId: board.auth.playerId ?? "",
      kind: "practice" as const,
      date,
      condition,
      goalPre: goalPre.trim() || undefined,
      achievement,
      insights: ins,
      body: body.trim() || undefined,
      isPublic,
    };
    if (edit) board.updateNote({ ...edit, ...base });
    else board.addNote(base);
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{edit ? "練習ノートを編集" : "練習ノート"}</h2>

      <div className="formgroup">
        <div className="formgroup-h">基本</div>
        <div className="formgrid">
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>日付</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <ConditionPicker value={condition} onChange={setCondition} />
      </div>

      <div className="formgroup">
        <div className="formgroup-h">今日の目標と達成度</div>
        <div className="formfield">
          <label>今日の目標（練習前）</label>
          <input value={goalPre} onChange={(e) => setGoalPre(e.target.value)} placeholder="例）声を出す / 逆足を使う" />
        </div>
        <div className="formfield" style={{ marginBottom: 0 }}>
          <label>達成度：{achievement}%</label>
          <input type="range" min={0} max={100} step={10} value={achievement} onChange={(e) => setAchievement(+e.target.value)} />
        </div>
      </div>

      <div className="formgroup">
        <div className="formgroup-h">振り返り</div>
        <div className="formfield">
          <label>気づき（できるようになったこと・課題）</label>
          {insights.map((v, i) => (
            <div key={i} className="dynrow">
              <input
                value={v}
                onChange={(e) => setInsights(insights.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="例）相手を見る前に首を振る"
              />
              <button className="dynx" onClick={() => setInsights(insights.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button className="dynadd" onClick={() => setInsights([...insights, ""])}>
            ＋ 気づきを追加
          </button>
        </div>
        <div className="formfield" style={{ marginBottom: 0 }}>
          <label>自由メモ</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="練習全体の振り返り" />
        </div>
      </div>

      <div className="formgroup">
        <div className="formgroup-h">共有</div>
        <label className="sharetoggle" style={{ margin: 0 }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>チームに共有する（他の選手も見られます）</span>
        </label>
      </div>

      <button className="bigbtn" onClick={submit}>
        {edit ? "更新する" : "提出する"}
      </button>
    </div>
  );
}

/* --- 自主練ノート（⑩種目＋ストリーク） --- */
function SoloForm({ edit, onDone }: { edit?: SoloNote; onDone: () => void }) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [condition, setCondition] = useState<NoteCondition | undefined>(edit?.condition);
  const [items, setItems] = useState<SoloItem[]>(edit?.items?.length ? edit.items : [{ kind: "lifting", value: "" }]);
  const [body, setBody] = useState(edit?.body ?? "");

  const submit = () => {
    const its = items.filter((i) => i.value.trim());
    if (its.length === 0) {
      board.toast("種目と内容を入力してください");
      return;
    }
    const base = {
      playerId: board.auth.playerId ?? "",
      kind: "solo" as const,
      date,
      condition,
      items: its,
      body: body.trim() || undefined,
    };
    if (edit) board.updateNote({ ...edit, ...base });
    else board.addNote(base);
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{edit ? "自主練ノートを編集" : "自主練ノート"}</h2>
      <div className="formfield">
        <label>日付</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <ConditionPicker value={condition} onChange={setCondition} />
      <div className="formfield">
        <label>やったこと</label>
        {items.map((it, i) => (
          <div key={i} className="dynrow">
            <select value={it.kind} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, kind: e.target.value as SoloKind } : x)))}>
              {SOLO_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SOLO_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              value={it.value}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              placeholder="例）100回 / 5km / 30分"
            />
            <button className="dynx" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button className="dynadd" onClick={() => setItems([...items, { kind: "lifting", value: "" }])}>
          ＋ 種目を追加
        </button>
      </div>
      <div className="formfield">
        <label>メモ</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="自己ベストや気づきなど" />
      </div>
      <button className="bigbtn" onClick={submit}>
        {edit ? "更新する" : "記録する"}
      </button>
    </div>
  );
}

/* --- 試合ノート（①陣形・②プレーエリア＋AI） --- */
function emptyLineup(phase: MatchPhase): MatchPhaseLineup {
  return { phase, ownFormation: "4-3-3", ownPositionIndex: null, oppFormation: "4-4-2" };
}

function MatchForm({ edit, onDone }: { edit?: MatchNote; onDone: () => void }) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [opponent, setOpponent] = useState(edit?.opponent ?? "");
  const [condition, setCondition] = useState<NoteCondition | undefined>(edit?.condition);
  // クイック記録（既定）：ベストプレー＋ひとこと
  const [bestPlay, setBestPlay] = useState(edit?.bestPlay ?? "");
  const [body, setBody] = useState(edit?.body ?? "");
  // ここから下は「くわしく記録」（任意の詳細モード）
  const [lineups, setLineups] = useState<MatchPhaseLineup[]>(edit?.lineups ?? []);
  const [plays, setPlays] = useState<PlayPoint[]>(edit?.plays ?? []);
  const [playLines, setPlayLines] = useState<PlayLine[]>(edit?.playLines ?? []);
  const [tool, setTool] = useState<PlayTool>({ mode: "point", kind: "receive" });
  const [aiText, setAiText] = useState(edit?.aiSummary ?? "");
  const [aiBusy, setAiBusy] = useState(false);
  const [reflectPlay, setReflectPlay] = useState(edit?.reflectPlay ?? "");
  const [videoUrl, setVideoUrl] = useState(edit?.videoUrl ?? "");
  const [minutes, setMinutes] = useState(edit?.minutes != null ? String(edit.minutes) : "");
  const [reportGood, setReportGood] = useState(edit?.reportGood ?? "");
  const [reportImprove, setReportImprove] = useState(edit?.reportImprove ?? "");
  const [reportText, setReportText] = useState(edit?.reportSummary ?? "");
  const [reportBusy, setReportBusy] = useState(false);

  // 編集時に詳細データがあれば最初から詳細モードで開く
  const hasDetail = !!(
    edit &&
    ((edit.lineups?.length ?? 0) > 0 ||
      (edit.plays?.length ?? 0) > 0 ||
      (edit.playLines?.length ?? 0) > 0 ||
      edit.reflectPlay ||
      edit.videoUrl ||
      edit.minutes != null ||
      edit.reportGood ||
      edit.reportImprove ||
      edit.reportSummary)
  );
  const [detailed, setDetailed] = useState(hasDetail);
  const openDetailed = () => {
    if (lineups.length === 0) setLineups([emptyLineup("1st")]);
    setDetailed(true);
  };

  const phasesPresent = lineups.map((l) => l.phase);
  const addPhase = (p: MatchPhase) => setLineups([...lineups, emptyLineup(p)]);
  const setLineup = (i: number, patch: Partial<MatchPhaseLineup>) =>
    setLineups(lineups.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const runAi = async () => {
    setAiBusy(true);
    const res = await aiClient.analyzePlayArea(plays);
    setAiText(res.summary);
    setAiBusy(false);
  };

  // 出場ポジション（陣形から推定）
  const reportPosition = (() => {
    const lu = lineups.find((l) => l.ownPositionIndex != null);
    return lu && lu.ownPositionIndex != null ? buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role : undefined;
  })();
  const runReport = async () => {
    setReportBusy(true);
    const res = await aiClient.summarizeMatchReport({
      minutes: minutes ? +minutes : undefined,
      position: reportPosition,
      good: reportGood,
      improve: reportImprove,
      zoneSummary: plays.length ? analyzePlayAreaLocal(plays).summary : undefined,
    });
    setReportText(res.summary);
    setReportBusy(false);
  };

  const submit = () => {
    if (!opponent.trim()) {
      board.toast("対戦相手を入力してください");
      return;
    }
    const base = {
      playerId: board.auth.playerId ?? "",
      kind: "match" as const,
      date,
      opponent: opponent.trim(),
      condition,
      lineups,
      plays,
      playLines,
      aiSummary: aiText || (plays.length ? analyzePlayAreaLocal(plays).summary : undefined),
      bestPlay: bestPlay.trim() || undefined,
      reflectPlay: reflectPlay.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      minutes: minutes ? +minutes : undefined,
      reportGood: reportGood.trim() || undefined,
      reportImprove: reportImprove.trim() || undefined,
      reportSummary: reportText || undefined,
      body: body.trim() || undefined,
    };
    if (edit) board.updateNote({ ...edit, ...base });
    else board.addNote(base);
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{edit ? "試合ノートを編集" : "試合ノート"}</h2>

      {/* ===== 30秒クイック記録（既定） ===== */}
      <div className="formgrid">
        <div className="formfield" style={{ flex: 2, margin: 0 }}>
          <label>対戦相手</label>
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="例）青空FC" />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>日付</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <ConditionPicker value={condition} onChange={setCondition} />
      <div className="formfield">
        <label><E n="star" /> 今日のベストプレー</label>
        <input value={bestPlay} onChange={(e) => setBestPlay(e.target.value)} placeholder="例）右サイドの突破からアシスト" />
      </div>
      <div className="formfield">
        <label>ひとことメモ（任意）</label>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="試合の振り返りをひとことで" />
      </div>

      {!detailed ? (
        <button className="detailtoggle" type="button" onClick={openDetailed}>
          ＋ くわしく記録する（任意）
          <span className="detailtoggle-sub">フォーメーション・プレーエリア・AIレポート</span>
        </button>
      ) : (
        <div className="detailwrap">
          <div className="detailwrap-h">
            <span>くわしく記録</span>
            <button className="detailhide" type="button" onClick={() => setDetailed(false)}>かんたん表示に戻す</button>
          </div>

          {/* フォーメーション・ポジション記録 */}
          <div className="notesec-h">スタメン・フォーメーション</div>
          {lineups.map((lu, i) => {
            const role =
              lu.ownPositionIndex != null ? buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role : null;
            return (
              <div key={i} className="phasecard">
                <div className="phasehd">
                  <span>{MATCH_PHASE_LABEL[lu.phase]}</span>
                  {lineups.length > 1 && (
                    <button className="dynx" onClick={() => setLineups(lineups.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  )}
                </div>
                <div className="formgrid">
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label>自チーム</label>
                    <select value={lu.ownFormation} onChange={(e) => setLineup(i, { ownFormation: e.target.value, ownPositionIndex: null })}>
                      {FORMATION_KEYS.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label>相手</label>
                    <select value={lu.oppFormation} onChange={(e) => setLineup(i, { oppFormation: e.target.value })}>
                      {FORMATION_KEYS.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="phasehint">自分のポジションをタップ{role ? `：${role}` : ""}</div>
                <div className="formpitch">
                  <FormationPitch
                    ownFormation={lu.ownFormation}
                    ownPositionIndex={lu.ownPositionIndex}
                    onPickPosition={(idx) => setLineup(i, { ownPositionIndex: idx })}
                    oppFormation={lu.oppFormation}
                  />
                </div>
              </div>
            );
          })}
          <div className="phaseadd">
            {(["2nd", "et"] as MatchPhase[]).map(
              (p) =>
                !phasesPresent.includes(p) && (
                  <button key={p} className="dynadd" style={{ width: "auto", flex: 1 }} onClick={() => addPhase(p)}>
                    ＋ {MATCH_PHASE_LABEL[p]}を追加
                  </button>
                )
            )}
          </div>

          {/* プレーエリア記録 */}
          <div className="notesec-h" style={{ marginTop: 14 }}>自分のプレーエリア</div>
          <div className="playtools">
            <div className="playtoolrow">
              {PLAY_KINDS.map((k) => {
                const on = tool.mode === "point" && tool.kind === k;
                return (
                  <button key={k} type="button" className={`playkind ${k}${on ? " on" : ""}`} onClick={() => setTool({ mode: "point", kind: k })}>
                    {PLAY_KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
            <div className="playtoolrow">
              {PLAY_LINE_KINDS.map((k) => {
                const on = tool.mode === "line" && tool.kind === k;
                return (
                  <button key={k} type="button" className={`playline ${k}${on ? " on" : ""}`} onClick={() => setTool({ mode: "line", kind: k })}>
                    {PLAY_LINE_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="phasehint">
            {tool.mode === "point"
              ? `コートをタップして「${PLAY_KIND_LABEL[tool.kind]}」を記録（点 ${plays.length} ／ 軌道 ${playLines.length}）`
              : `コートをなぞって「${PLAY_LINE_LABEL[tool.kind]}」の軌道を記録（点 ${plays.length} ／ 軌道 ${playLines.length}）`}
          </div>
          <div className="formpitch">
            <PlayAreaPitch
              points={plays}
              lines={playLines}
              tool={tool}
              onAddPoint={(x, y) => setPlays((prev) => [...prev, { x, y, kind: tool.mode === "point" ? tool.kind : "receive" }])}
              onAddLine={(path) => setPlayLines((prev) => [...prev, { kind: tool.mode === "line" ? tool.kind : "dribble", path }])}
            />
          </div>
          {(plays.length > 0 || playLines.length > 0) && (
            <div className="playacts">
              <button
                className="dynadd"
                onClick={() =>
                  tool.mode === "line"
                    ? setPlayLines((p) => p.slice(0, -1))
                    : setPlays((p) => p.slice(0, -1))
                }
              >
                1つ戻す
              </button>
              <button className="dynadd" onClick={() => { setPlays([]); setPlayLines([]); }}>全消去</button>
              <button className="dynadd ai" onClick={runAi} disabled={aiBusy}>
                {aiBusy ? "分析中…" : <><E n="robot" /> AI分析</>}
              </button>
            </div>
          )}
          {aiText && <div className="aibox">{aiText}</div>}

          {/* 反省・動画 */}
          <div className="notesec-h" style={{ marginTop: 14 }}>反省・動画</div>
          <div className="formfield">
            <label>今日の反省プレー</label>
            <input value={reflectPlay} onChange={(e) => setReflectPlay(e.target.value)} placeholder="例）中盤でのパスミス" />
          </div>
          <div className="formfield">
            <label>動画URL（任意）</label>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." />
          </div>

          {/* AI試合レポート */}
          <div className="notesec-h" style={{ marginTop: 14 }}>AI試合レポート</div>
          <div className="formgrid">
            <div className="formfield" style={{ flex: 1, margin: 0 }}>
              <label>出場時間（分）</label>
              <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="60" />
            </div>
            <div className="formfield" style={{ flex: 1, margin: 0 }}>
              <label>ポジション</label>
              <input value={reportPosition ?? ""} readOnly placeholder="陣形から自動" />
            </div>
          </div>
          <div className="formfield">
            <label>良かったこと</label>
            <input value={reportGood} onChange={(e) => setReportGood(e.target.value)} placeholder="例）後方からのビルドアップ" />
          </div>
          <div className="formfield">
            <label>改善したいこと</label>
            <input value={reportImprove} onChange={(e) => setReportImprove(e.target.value)} placeholder="例）守備時のポジショニング" />
          </div>
          <button className="dynadd ai" style={{ width: "100%" }} onClick={runReport} disabled={reportBusy}>
            {reportBusy ? "作成中…" : <><E n="robot" /> AIレポートを作成</>}
          </button>
          {reportText && <div className="aibox" style={{ marginTop: 8 }}>{reportText}</div>}
        </div>
      )}

      <button className="bigbtn" style={{ marginTop: 14 }} onClick={submit}>
        {edit ? "更新する" : "提出する"}
      </button>
    </div>
  );
}

/* ===================== 詳細 ===================== */
function NoteDetail({
  id,
  isCoach,
  onEdit,
  onDeleted,
}: {
  id: string;
  isCoach: boolean;
  onEdit: (e: NotebookEntry) => void;
  onDeleted: () => void;
}) {
  const board = useBoard();
  const entry = board.notebook.find((n) => n.id === id);
  const [comment, setComment] = useState(entry?.staffComment ?? "");
  if (!entry) return <div className="empty-msg">ノートが見つかりません。</div>;
  const who = board.state.players.find((p) => p.id === entry.playerId)?.name ?? "選手";
  const mine = !isCoach && entry.playerId === board.auth.playerId;

  return (
    <div className="notedetail">
      <div className="notedhead">
        <div className="notecond big">{entry.condition ? <ConditionIcon c={entry.condition} /> : NOTE_KIND_LABEL[entry.kind].slice(0, 1)}</div>
        <div>
          <div className="notewho">{who}</div>
          <div className="notedate">
            {NOTE_KIND_LABEL[entry.kind]}ノート ・ {fmt(entry.date)}
            {entry.condition ? ` ・ ${NOTE_CONDITION_LABEL[entry.condition]}` : ""}
          </div>
        </div>
      </div>

      {entry.kind === "match" && <MatchDetail note={entry} />}
      {entry.kind === "practice" && <PracticeDetail note={entry} />}
      {entry.kind === "solo" && <SoloDetail note={entry} />}

      {entry.body && (
        <div className="notesec">
          <div className="notesec-h"><E n="note" /> メモ</div>
          <div className="notesec-b">{entry.body}</div>
        </div>
      )}

      {/* スタッフコメント */}
      {isCoach ? (
        <div className="notesec">
          <div className="notesec-h">スタッフからのコメント</div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="選手へフィードバックを送る" />
          <button className="bigbtn" style={{ marginTop: 8 }} onClick={() => board.setNoteComment(entry.id, comment)}>
            コメントを送る
          </button>
        </div>
      ) : entry.staffComment ? (
        <div className="notesec staffcmt">
          <div className="notesec-h">スタッフからのコメント</div>
          <div className="notesec-b">{entry.staffComment}</div>
        </div>
      ) : (
        <div className="evnote" style={{ margin: "12px 2px" }}>スタッフのコメント待ちです。</div>
      )}

      {mine && (
        <div className="notedacts">
          <button className="bigbtn ghost" onClick={() => onEdit(entry)}>編集する</button>
          <button
            className="linkdanger"
            onClick={() => {
              board.deleteNote(entry.id);
              onDeleted();
            }}
          >
            削除する
          </button>
        </div>
      )}
    </div>
  );
}

function MatchDetail({ note }: { note: MatchNote }) {
  const analysis = note.plays?.length ? analyzePlayAreaLocal(note.plays) : null;
  return (
    <>
      <div className="notesec">
        <div className="notesec-h"><E n="vs" /> {note.opponent || "対戦相手"}</div>
      </div>
      {(note.lineups ?? []).map((lu, i) => {
        const role = lu.ownPositionIndex != null ? buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role : null;
        return (
          <div key={i} className="notesec">
            <div className="notesec-h">
              {MATCH_PHASE_LABEL[lu.phase]} ・ 自{lu.ownFormation} / 相手{lu.oppFormation}
              {role ? ` ・ ${role}` : ""}
            </div>
            <FormationPitch ownFormation={lu.ownFormation} ownPositionIndex={lu.ownPositionIndex} oppFormation={lu.oppFormation} />
          </div>
        );
      })}
      {((note.plays?.length ?? 0) > 0 || (note.playLines?.length ?? 0) > 0) && (
        <div className="notesec">
          <div className="notesec-h">プレーエリア（点 {note.plays?.length ?? 0} ／ 軌道 {note.playLines?.length ?? 0}）</div>
          <PlayAreaPitch points={note.plays ?? []} lines={note.playLines ?? []} />
          {analysis && (
            <>
              <div className="aistats">
                {analysis.stats.map((s) => (
                  <div key={s.label} className="aistat">
                    <div className="aisv">{s.value}</div>
                    <div className="aisl">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="aibox"><E n="robot" /> {note.aiSummary || analysis.summary}</div>
            </>
          )}
        </div>
      )}

      {(note.bestPlay || note.reflectPlay || note.videoUrl) && (
        <div className="notesec">
          <div className="notesec-h">⑧ ベストプレー・反省</div>
          {note.bestPlay && <div className="notesec-b"><E n="star" /> ベスト：{note.bestPlay}</div>}
          {note.reflectPlay && <div className="notesec-b"><E n="repeat" /> 反省：{note.reflectPlay}</div>}
          {note.videoUrl && (
            <a className="videolink" href={note.videoUrl} target="_blank" rel="noreferrer"><E n="video" /> 動画を見る</a>
          )}
        </div>
      )}

      {(note.reportSummary || note.reportGood || note.reportImprove || note.minutes != null) && (
        <div className="notesec">
          <div className="notesec-h">⑫ AI試合レポート</div>
          {(note.minutes != null || note.reportGood || note.reportImprove) && (
            <div className="notesec-b">
              {note.minutes != null ? `出場 ${note.minutes}分` : ""}
              {note.reportGood ? ` ・ 良かった：${note.reportGood}` : ""}
              {note.reportImprove ? ` ・ 改善：${note.reportImprove}` : ""}
            </div>
          )}
          {note.reportSummary && <div className="aibox" style={{ marginTop: 6 }}><E n="robot" /> {note.reportSummary}</div>}
        </div>
      )}
    </>
  );
}

function PracticeDetail({ note }: { note: PracticeNote }) {
  return (
    <>
      {note.goalPre && (
        <div className="notesec">
          <div className="notesec-h"><E n="target" /> 今日の目標</div>
          <div className="notesec-b">{note.goalPre}</div>
        </div>
      )}
      {typeof note.achievement === "number" && (
        <div className="notesec">
          <div className="notesec-h">達成度：{note.achievement}%</div>
          <div className="achbar">
            <span style={{ width: note.achievement + "%" }} />
          </div>
        </div>
      )}
      {note.insights && note.insights.length > 0 && (
        <div className="notesec">
          <div className="notesec-h"><E n="bulb" /> 気づき</div>
          {note.insights.map((s, i) => (
            <div key={i} className="notesec-b">・{s}</div>
          ))}
        </div>
      )}
      {note.isPublic && <div className="notetag share" style={{ display: "inline-block" }}>チームに共有中</div>}
    </>
  );
}

function SoloDetail({ note }: { note: SoloNote }) {
  return (
    <div className="notesec">
      <div className="notesec-h"><E n="run" /> やったこと</div>
      {note.items.map((it, i) => (
        <div key={i} className="notesec-b">・{SOLO_KIND_LABEL[it.kind]}：{it.value}</div>
      ))}
    </div>
  );
}
