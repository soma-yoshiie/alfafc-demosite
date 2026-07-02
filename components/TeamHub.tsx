"use client";

import { useState } from "react";
import type React from "react";
import type {
  AttendanceStatus,
  MatchGoal,
  MatchRecord,
  MatchSub,
  Player,
  TeamEvent,
  TeamEventKind,
} from "@/lib/types";
import { INJURY_STATUS_LABEL } from "@/lib/types";
import { groupOf } from "@/lib/formations";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return s;
  const dt = new Date(y, m - 1, d);
  return `${m}/${d}(${WD[dt.getDay()]})`;
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtTimeRange(ev: { time?: string; endTime?: string }): string {
  if (ev.time && ev.endTime) return `${ev.time}〜${ev.endTime}`;
  return ev.time ?? "";
}

const STATUS_LABEL: Record<AttendanceStatus, string> = { yes: "出席", maybe: "未定", no: "欠席" };
const STATUS_MARK: Record<AttendanceStatus, string> = { yes: "○", maybe: "△", no: "×" };

function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <div className={`sheet${open ? " on" : ""}`}>
        <div className="grabzone" onClick={onClose}>
          <div className="grab" />
        </div>
        <div className="sheetBody">{open ? children : null}</div>
      </div>
    </>
  );
}

type Tab = "att" | "cal" | "rec" | "ros";

type SheetState =
  | { type: "event"; event?: TeamEvent; date?: string }
  | { type: "attendance"; eventId: string }
  | { type: "announce" }
  | { type: "day"; date: string }
  | { type: "eventView"; id: string }
  | { type: "match"; record?: MatchRecord }
  | { type: "matchView"; id: string }
  | { type: "competitions" }
  | null;

function Inner() {
  const board = useBoard();
  const team = useTeam();
  const players = board.state.players;
  const [tab, setTab] = useState<Tab>("att");
  const [sheet, setSheet] = useState<SheetState>(null);

  const isCoach = team.viewer.role === "coach";
  const me = team.viewer.memberPlayerId
    ? players.find((p) => p.id === team.viewer.memberPlayerId) ?? null
    : null;

  const tabs: [Tab, string][] = [
    ["att", "出欠"],
    ["cal", "カレンダー"],
    ["rec", "試合記録"],
  ];
  if (board.auth.role === "coach") tabs.push(["ros", "名簿"]);

  return (
    <div className="app teamapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ メニュー
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">
            チーム<b>運営</b>
          </div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {board.state.teamName ?? "マイチーム"}
          </div>
        </div>
      </header>

      {board.auth.role === "coach" ? (
        <div className="rolebar">
          <span>表示</span>
          <select
            value={isCoach ? "coach" : team.viewer.memberPlayerId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "coach") team.setViewer("coach", null);
              else team.setViewer("member", v);
            }}
          >
            <option value="coach">スタッフ（管理）</option>
            <optgroup label="選手・保護者として">
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="rolehint">
            {isCoach ? "全員を管理" : `${me?.name ?? "選手"} として閲覧・回答`}
          </span>
        </div>
      ) : (
        <div className="rolebar">
          <span className="rolehint" style={{ textAlign: "left", flex: 1 }}>
            {me?.name ?? "選手"} さんとして閲覧・出欠回答ができます
          </span>
        </div>
      )}

      <div className="fbar">
        {tabs.map(([t, label]) => (
          <div key={t} className={`chip${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
            {label}
          </div>
        ))}
      </div>

      <div className="scroll" style={{ padding: "0 14px calc(env(safe-area-inset-bottom) + 24px)" }}>
        {tab === "att" && <AttendanceTab isCoach={isCoach} me={me} setSheet={setSheet} />}
        {tab === "cal" && <CalendarTab isCoach={isCoach} setSheet={setSheet} />}
        {tab === "rec" && (
          <MatchesTab isCoach={isCoach} players={players} setSheet={setSheet} />
        )}
        {tab === "ros" && board.auth.role === "coach" && <RosterTab players={players} />}
      </div>

      <SheetHost
        key={sheetKey(sheet)}
        sheet={sheet}
        setSheet={setSheet}
        players={players}
        isCoach={isCoach}
      />
    </div>
  );
}

function sheetKey(s: SheetState): string {
  if (!s) return "none";
  if (s.type === "event") return "event-" + (s.event?.id ?? s.date ?? "new");
  if (s.type === "attendance") return "att-" + s.eventId;
  if (s.type === "day") return "day-" + s.date;
  if (s.type === "eventView") return "ev-" + s.id;
  if (s.type === "match") return "match-" + (s.record?.id ?? "new");
  if (s.type === "matchView") return "mv-" + s.id;
  return s.type;
}

/* ---------------- 出欠 ---------------- */
function AttendanceTab({
  isCoach,
  me,
  setSheet,
}: {
  isCoach: boolean;
  me: Player | null;
  setSheet: (s: SheetState) => void;
}) {
  const team = useTeam();
  const events = [...team.team.events].sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <>
      {isCoach && (
        <button className="bigbtn" style={{ width: "100%", margin: "12px 0 6px" }} onClick={() => setSheet({ type: "event" })}>
          ＋ 予定を追加
        </button>
      )}
      {events.length === 0 ? (
        <div className="empty-msg">予定がありません。</div>
      ) : (
        events.map((ev) => {
          const s = team.summary(ev.id);
          const mine = me ? team.team.attendance[ev.id]?.[me.id] : undefined;
          return (
            <div key={ev.id} className="evcard">
              <div className="evhead">
                <span className={`evkind ${ev.kind}`}>{ev.kind === "match" ? "試合" : "練習"}</span>
                <span className="evtitle">{ev.title}</span>
                {isCoach && (
                  <span className="evacts">
                    <button onClick={() => setSheet({ type: "event", event: ev })}>✎</button>
                    <button
                      onClick={() => {
                        if (window.confirm(`「${ev.title}」を削除しますか？`)) team.removeEvent(ev.id);
                      }}
                    >
                      <E n="trash" />
                    </button>
                  </span>
                )}
              </div>
              <div className="evmeta">
                {fmtDate(ev.date)}
                {fmtTimeRange(ev) ? ` ${fmtTimeRange(ev)}` : ""}
                {ev.place ? ` ・ ${ev.place}` : ""}
              </div>
              {ev.note && <div className="evnote">{ev.note}</div>}
              {isCoach ? (
                <div className="evsummary" onClick={() => setSheet({ type: "attendance", eventId: ev.id })}>
                  <span className="att yes">出席 {s.yes}</span>
                  <span className="att maybe">未定 {s.maybe}</span>
                  <span className="att no">欠席 {s.no}</span>
                  <span className="att none">未回答 {s.none}</span>
                  <span className="evopen">回答を見る ›</span>
                </div>
              ) : (
                me && <MemberAttRow eventId={ev.id} playerId={me.id} />
              )}
            </div>
          );
        })
      )}
    </>
  );
}

/* 選手の出欠回答（○△× ＋ 理由）。集計結果は表示しない */
function MemberAttRow({ eventId, playerId }: { eventId: string; playerId: string }) {
  const team = useTeam();
  const cur = team.team.attendance[eventId]?.[playerId];
  const [reason, setReason] = useState(cur?.comment ?? "");
  return (
    <>
      <div className="attpick">
        {(["yes", "maybe", "no"] as AttendanceStatus[]).map((st) => (
          <button
            key={st}
            className={`attbtn ${st}${cur?.status === st ? " on" : ""}`}
            onClick={() => team.setAttendance(eventId, playerId, st, reason || undefined)}
          >
            {STATUS_MARK[st]} {STATUS_LABEL[st]}
          </button>
        ))}
      </div>
      <input
        className="attreason"
        placeholder="理由・コメント（任意・例: 通院のため遅刻）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onBlur={() => {
          if (cur?.status) team.setAttendance(eventId, playerId, cur.status, reason || undefined);
        }}
      />
    </>
  );
}

/* ---------------- カレンダー ---------------- */
function CalendarTab({
  isCoach,
  setSheet,
}: {
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
}) {
  const team = useTeam();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [view, setView] = useState<"month" | "list">("month");

  const first = new Date(ym.y, ym.m, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (d: number) =>
    `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const eventsOn = (d: number) => team.team.events.filter((e) => e.date === dateStr(d));
  const today = todayStr();

  const shift = (delta: number) => {
    const nm = ym.m + delta;
    setYm({ y: ym.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 });
  };

  // 当月の予定を日付ごとにまとめる（リスト表示用）
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .map((d) => ({ d, ds: dateStr(d), evs: eventsOn(d) }))
    .filter((x) => x.evs.length > 0);

  return (
    <div className="cal">
      <div className="calnav">
        <button onClick={() => shift(-1)}>‹</button>
        <b>
          {ym.y}年 {ym.m + 1}月
        </b>
        <button onClick={() => shift(1)}>›</button>
      </div>

      <div className="calviewtoggle">
        <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>
          月表示
        </button>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
          リスト表示
        </button>
      </div>

      {view === "month" ? (
        <>
          <div className="calgrid calhead">
            {WD.map((w, i) => (
              <div key={w} className={`calwd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>
                {w}
              </div>
            ))}
          </div>
          <div className="calgrid">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} className="calcell empty" />;
              const evs = eventsOn(d);
              const ds = dateStr(d);
              return (
                <div
                  key={i}
                  className={`calcell${ds === today ? " today" : ""}`}
                  onClick={() => setSheet({ type: "day", date: ds })}
                >
                  <span className={`caldate${i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : ""}`}>{d}</span>
                  <div className="caldots">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id} className={`caldot ${e.kind}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="callegend">
            <span>
              <i className="caldot practice" /> 練習
            </span>
            <span>
              <i className="caldot match" /> 試合
            </span>
            {isCoach && <span className="calhint">日付をタップで予定を追加</span>}
          </div>
        </>
      ) : (
        <div className="agenda">
          {monthDays.length === 0 ? (
            <div className="empty-msg">この月の予定はありません。</div>
          ) : (
            monthDays.map(({ d, ds, evs }) => {
              const wd = new Date(ym.y, ym.m, d).getDay();
              return (
                <div key={ds} className={`agrow${ds === today ? " today" : ""}`}>
                  <div className={`agdate${wd === 0 ? " sun" : wd === 6 ? " sat" : ""}`}>
                    <b>{d}</b>
                    <span>{WD[wd]}</span>
                  </div>
                  <div className="agevents">
                    {evs.map((e) => (
                      <div
                        key={e.id}
                        className={`agbar ${e.kind}`}
                        onClick={() => setSheet({ type: "eventView", id: e.id })}
                      >
                        <span className="agkind">{e.kind === "match" ? "試合" : "練習"}</span>
                        <span className="agtitle">{e.title}</span>
                        {fmtTimeRange(e) && <span className="agtime">{fmtTimeRange(e)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {isCoach && (
            <button
              className="bigbtn"
              style={{ width: "100%", margin: "10px 0 0" }}
              onClick={() => setSheet({ type: "event" })}
            >
              ＋ 予定を追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- 試合記録 ---------------- */
function MatchesTab({
  isCoach,
  players,
  setSheet,
}: {
  isCoach: boolean;
  players: Player[];
  setSheet: (s: SheetState) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const comps = team.team.competitions;
  const [cmp, setCmp] = useState<string>("all"); // "all" | 大会ID | "none"
  const cmpName = (m: MatchRecord): string | null =>
    m.competitionId
      ? comps.find((c) => c.id === m.competitionId)?.name ?? "（削除された大会）"
      : m.competition || null;

  const allMatches = [...team.team.matches].sort((a, b) => (a.date < b.date ? 1 : -1));
  const hasOther = allMatches.some((m) => !m.competitionId);
  const matches = allMatches.filter((m) =>
    cmp === "all" ? true : cmp === "none" ? !m.competitionId : m.competitionId === cmp
  );
  const filterLabel =
    cmp === "all" ? null : cmp === "none" ? "その他" : comps.find((c) => c.id === cmp)?.name ?? null;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";

  let w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0;
  const gc: Record<string, number> = {};
  const ac: Record<string, number> = {};
  matches.forEach((m) => {
    gf += m.ourScore;
    ga += m.theirScore;
    if (m.ourScore > m.theirScore) w++;
    else if (m.ourScore === m.theirScore) d++;
    else l++;
    m.goals.forEach((g) => {
      gc[g.playerId] = (gc[g.playerId] ?? 0) + 1;
      if (g.assistPlayerId) ac[g.assistPlayerId] = (ac[g.assistPlayerId] ?? 0) + 1;
    });
  });
  const rank = (obj: Record<string, number>) =>
    Object.entries(obj)
      .map(([pid, n]) => ({ pid, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  const scorers = rank(gc);
  const assisters = rank(ac);

  // 選手ビューで非公開なら閲覧不可
  if (!isCoach && !board.matchesPublic) {
    return (
      <div className="empty-msg" style={{ paddingTop: 60 }}>
<E n="lock" /> 試合記録はスタッフが非公開に設定しています。
      </div>
    );
  }

  return (
    <>
      {isCoach && (
        <div className="evnote" style={{ margin: "12px 2px 4px" }}>
          {board.matchesPublic
            ? "選手・保護者に公開中（設定で変更できます）"
            : "選手・保護者に非公開（設定で変更できます）"}
        </div>
      )}

      {/* 大会フィルタ */}
      {(comps.length > 0 || hasOther) && (
        <div className="cmpbar">
          <button className={`cmpchip${cmp === "all" ? " on" : ""}`} onClick={() => setCmp("all")}>
            すべて
          </button>
          {comps.map((c) => (
            <button
              key={c.id}
              className={`cmpchip${cmp === c.id ? " on" : ""}`}
              onClick={() => setCmp(c.id)}
            >
              {c.name}
            </button>
          ))}
          {hasOther && (
            <button className={`cmpchip${cmp === "none" ? " on" : ""}`} onClick={() => setCmp("none")}>
              その他
            </button>
          )}
        </div>
      )}
      {isCoach && (
        <button className="cmpmanage" onClick={() => setSheet({ type: "competitions" })}>
          ＋ 大会を登録・管理
        </button>
      )}

      {matches.length > 0 && (
        <div className="statcard">
          {filterLabel && <div className="stattitle"><E n="trophy" /> {filterLabel}</div>}
          <div className="statrow">
            <div className="statbox">
              <div className="sk">試合</div>
              <div className="sv">{matches.length}</div>
            </div>
            <div className="statbox">
              <div className="sk">勝-分-敗</div>
              <div className="sv">
                {w}-{d}-{l}
              </div>
            </div>
            <div className="statbox">
              <div className="sk">得点-失点</div>
              <div className="sv">
                {gf}-{ga}
              </div>
            </div>
          </div>
          {scorers.length > 0 && (
            <div className="scorers">
              <div className="sk">得点ランキング</div>
              {scorers.map((s, i) => (
                <div key={s.pid} className="scorerrow">
                  <span className="rank">{i + 1}</span>
                  <span className="snm">{nameOf(s.pid)}</span>
                  <span className="sgoals">{s.n}点</span>
                </div>
              ))}
            </div>
          )}
          {assisters.length > 0 && (
            <div className="scorers">
              <div className="sk">アシストランキング</div>
              {assisters.map((s, i) => (
                <div key={s.pid} className="scorerrow">
                  <span className="rank">{i + 1}</span>
                  <span className="snm">{nameOf(s.pid)}</span>
                  <span className="sgoals" style={{ color: "var(--blue)" }}>{s.n}A</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isCoach && (
        <button className="bigbtn" style={{ width: "100%", margin: "10px 0 6px" }} onClick={() => setSheet({ type: "match" })}>
          ＋ 試合結果を記録
        </button>
      )}

      {matches.length === 0 ? (
        <div className="empty-msg">まだ試合記録がありません。</div>
      ) : (
        matches.map((m) => {
          const win = m.ourScore > m.theirScore;
          const draw = m.ourScore === m.theirScore;
          return (
            <div key={m.id} className="matchcard" onClick={() => setSheet({ type: "matchView", id: m.id })}>
              <div className={`mres ${win ? "w" : draw ? "d" : "l"}`}>{win ? "勝" : draw ? "分" : "敗"}</div>
              <div className="mmid">
                <div className="mopp">vs {m.opponent}</div>
                <div className="msub">
                  {fmtDate(m.date)}
                  {cmpName(m) ? ` ・ ${cmpName(m)}` : ""}
                </div>
              </div>
              <div className="mscore">
                {m.ourScore}
                <span>-</span>
                {m.theirScore}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

/* ---------------- 名簿（チーム運営内） ---------------- */
function RosterTab({ players }: { players: Player[] }) {
  const board = useBoard();
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const list = players.filter(
    (p) => !kw || p.name.toLowerCase().includes(kw) || p.position.toLowerCase().includes(kw)
  );
  return (
    <>
      <div className="controls" style={{ padding: "12px 0 8px" }}>
        <input
          className="search"
          placeholder="名前・ポジションで検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {list.length === 0 ? (
        <div className="empty-msg">選手がいません。下のボタンから追加してください。</div>
      ) : (
        list.map((p) => {
          const inj = (p.injuries ?? []).find((x) => x.status !== "ok");
          return (
            <div
              key={p.id}
              className="prow"
              onClick={() => board.openSheet({ type: "playerDetail", playerId: p.id })}
            >
              <div className={`pos ${groupOf(p.position)}`}>{p.position}</div>
              <div className="meta">
                <div className="nm">
                  {p.name}
                  {board.state.captain === p.id ? " (C)" : ""}
                </div>
                <div className="sub">
                  背番号 {p.number ?? "—"}
                  {inj ? ` ・ ${INJURY_STATUS_LABEL[inj.status]}` : ""}
                </div>
              </div>
              {inj && <span className={`injbadge ${inj.status}`}>{INJURY_STATUS_LABEL[inj.status]}</span>}
              <div className="num">{p.number ?? "–"}</div>
            </div>
          );
        })
      )}
      <button
        className="bigbtn"
        style={{ width: "100%", margin: "8px 0 0" }}
        onClick={() => board.openSheet({ type: "playerForm" })}
      >
        ＋ 新規選手を追加
      </button>
    </>
  );
}

/* ---------------- Sheets ---------------- */
function SheetHost({
  sheet,
  setSheet,
  players,
  isCoach,
}: {
  sheet: SheetState;
  setSheet: (s: SheetState) => void;
  players: Player[];
  isCoach: boolean;
}) {
  const board = useBoard();
  const team = useTeam();
  const close = () => setSheet(null);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";

  // event form
  const ev = sheet?.type === "event" ? sheet.event : undefined;
  const evDefaultDate = sheet?.type === "event" ? sheet.date : undefined;
  const [kind, setKind] = useState<TeamEventKind>(ev?.kind ?? "practice");
  const [title, setTitle] = useState(ev?.title ?? "");
  const [date, setDate] = useState(ev?.date ?? evDefaultDate ?? todayStr());
  const [time, setTime] = useState(ev?.time ?? "");
  const [endTime, setEndTime] = useState(ev?.endTime ?? "");
  const [place, setPlace] = useState(ev?.place ?? "");
  const [note, setNote] = useState(ev?.note ?? "");

  // announce
  const [text, setText] = useState("");
  const [playId, setPlayId] = useState("");

  // match form
  const mr = sheet?.type === "match" ? sheet.record : undefined;
  const [opponent, setOpponent] = useState(mr?.opponent ?? "");
  const [mdate, setMdate] = useState(mr?.date ?? todayStr());
  // 大会: 登録済みから選択（""=未設定、"__new"=新規追加）
  const [competitionId, setCompetitionId] = useState(mr?.competitionId ?? "");
  const [newCompName, setNewCompName] = useState("");
  const [ourScore, setOurScore] = useState(mr ? String(mr.ourScore) : "0");
  const [theirScore, setTheirScore] = useState(mr ? String(mr.theirScore) : "0");
  const [goals, setGoals] = useState<MatchGoal[]>(mr?.goals ?? []);
  const [subs, setSubs] = useState<MatchSub[]>(mr?.subs ?? []);
  const [mnote, setMnote] = useState(mr?.note ?? "");

  // 大会管理
  const [mgrComp, setMgrComp] = useState("");

  const firstPid = players[0]?.id ?? "";

  return (
    <>
      {/* 予定（イベント）フォーム */}
      <Sheet open={sheet?.type === "event"} onClose={close}>
        <h2>{ev ? "予定を編集" : "予定を追加"}</h2>
        <div className="formfield">
          <label>種別</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as TeamEventKind)}>
            <option value="practice">練習</option>
            <option value="match">試合</option>
          </select>
        </div>
        <div className="formfield">
          <label>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）通常練習 / 練習試合 vs ○○" />
        </div>
        <div className="formfield">
          <label>日付</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="formgrid">
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>開始時刻</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>終了時刻</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="formfield">
          <label>場所</label>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="例）市営グラウンド" />
        </div>
        <div className="formfield">
          <label>メモ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="持ち物・集合など" />
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            if (!title.trim()) {
              board.toast("タイトルを入力してください");
              return;
            }
            const data = { kind, title: title.trim(), date, time, endTime, place, note };
            if (ev) team.updateEvent({ ...ev, ...data });
            else team.addEvent(data);
            close();
          }}
        >
          {ev ? "保存する" : "追加する"}
        </button>
      </Sheet>

      {/* 出欠一覧（スタッフ） */}
      <Sheet open={sheet?.type === "attendance"} onClose={close}>
        {sheet?.type === "attendance" && (
          <>
            <h2>出欠の回答</h2>
            <div className="list">
              {players.length === 0 ? (
                <div className="empty-msg">選手がいません。</div>
              ) : (
                players.map((p) => {
                  const cur = team.team.attendance[sheet.eventId]?.[p.id];
                  return (
                    <div key={p.id} className="attrow">
                      <div className="attname">
                        {p.name}
                        <small>背番号 {p.number ?? "—"}</small>
                        {cur?.comment && <small className="attreasonshow">「{cur.comment}」</small>}
                      </div>
                      <div className="attpick">
                        {(["yes", "maybe", "no"] as AttendanceStatus[]).map((st) => (
                          <button
                            key={st}
                            className={`attbtn ${st}${cur?.status === st ? " on" : ""}`}
                            onClick={() => team.setAttendance(sheet.eventId, p.id, st, cur?.comment)}
                          >
                            {STATUS_MARK[st]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </Sheet>

      {/* 連絡フォーム */}
      <Sheet open={sheet?.type === "announce"} onClose={close}>
        <h2>連絡を送る</h2>
        <div className="formfield">
          <label>本文</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="例）明日の練習は雨天中止の場合あり。朝7時に判断します。"
            style={textareaStyle}
          />
        </div>
        {board.library.plays.length > 0 && (
          <div className="formfield">
            <label>戦術を添付（任意・選手が閲覧できます）</label>
            <select value={playId} onChange={(e) => setPlayId(e.target.value)}>
              <option value="">添付しない</option>
              {board.library.plays.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          className="bigbtn"
          onClick={() => {
            if (!text.trim()) {
              board.toast("本文を入力してください");
              return;
            }
            const pt = playId ? board.library.plays.find((p) => p.id === playId)?.title : undefined;
            team.addAnnouncement(text, playId || undefined, pt);
            setText("");
            setPlayId("");
            close();
          }}
        >
          送信する
        </button>
      </Sheet>

      {/* 日別（カレンダー） */}
      <Sheet open={sheet?.type === "day"} onClose={close}>
        {sheet?.type === "day" && (
          <>
            <h2>{fmtDate(sheet.date)} の予定</h2>
            <div className="list">
              {team.team.events.filter((e) => e.date === sheet.date).length === 0 ? (
                <div className="empty-msg">この日に予定はありません。</div>
              ) : (
                team.team.events
                  .filter((e) => e.date === sheet.date)
                  .map((e) => (
                    <div
                      key={e.id}
                      className="evcard"
                      style={{ margin: "0 12px 8px", cursor: "pointer" }}
                      onClick={() => setSheet({ type: "eventView", id: e.id })}
                    >
                      <div className="evhead">
                        <span className={`evkind ${e.kind}`}>{e.kind === "match" ? "試合" : "練習"}</span>
                        <span className="evtitle">{e.title}</span>
                        <span className="evopen" style={{ marginLeft: "auto" }}>詳細 ›</span>
                      </div>
                      <div className="evmeta">
                        {fmtTimeRange(e) ? `${fmtTimeRange(e)} ` : ""}
                        {e.place ?? ""}
                      </div>
                    </div>
                  ))
              )}
            </div>
            {isCoach && (
              <button className="bigbtn" onClick={() => setSheet({ type: "event", date: sheet.date })}>
                ＋ この日に予定を追加
              </button>
            )}
          </>
        )}
      </Sheet>

      {/* 予定の詳細 */}
      <Sheet open={sheet?.type === "eventView"} onClose={close}>
        {sheet?.type === "eventView" &&
          (() => {
            const e = team.team.events.find((x) => x.id === sheet.id);
            if (!e) return null;
            const s = team.summary(e.id);
            return (
              <>
                <h2>
                  {e.title} <span>{e.kind === "match" ? "試合" : "練習"}</span>
                </h2>
                <div className="detail">
                  <div className="dsec">
                    <div className="dline">
                      <E n="calendar" /> {fmtDate(e.date)}
                      {fmtTimeRange(e) ? ` ${fmtTimeRange(e)}` : ""}
                    </div>
                    {e.place && <div className="dline"><E n="pin" /> {e.place}</div>}
                    {e.note && <div className="dline"><E n="note" /> {e.note}</div>}
                  </div>
                  {isCoach && (
                    <div className="dsec">
                      <div className="dsec-h">出欠状況</div>
                      <div className="dline">
                        出席 {s.yes} ・ 未定 {s.maybe} ・ 欠席 {s.no} ・ 未回答 {s.none}
                      </div>
                      <button
                        className="bigbtn ghost"
                        onClick={() => setSheet({ type: "attendance", eventId: e.id })}
                      >
                        回答を見る・編集
                      </button>
                    </div>
                  )}
                </div>
                {isCoach && (
                  <>
                    <button className="bigbtn" onClick={() => setSheet({ type: "event", event: e })}>
                      編集する
                    </button>
                    <button
                      className="bigbtn ghost"
                      style={{ color: "var(--red)" }}
                      onClick={() => {
                        if (window.confirm(`「${e.title}」を削除しますか？`)) {
                          team.removeEvent(e.id);
                          close();
                        }
                      }}
                    >
                      削除する
                    </button>
                  </>
                )}
              </>
            );
          })()}
      </Sheet>

      {/* 試合記録フォーム */}
      <Sheet open={sheet?.type === "match"} onClose={close}>
        <h2>{mr ? "試合記録を編集" : "試合結果を記録"}</h2>
        <div className="formgrid">
          <div className="formfield" style={{ flex: 2, margin: 0 }}>
            <label>対戦相手</label>
            <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="例）青空FC" />
          </div>
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>日付</label>
            <input type="date" value={mdate} onChange={(e) => setMdate(e.target.value)} />
          </div>
        </div>
        <div className="formfield">
          <label>大会（任意）</label>
          <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
            <option value="">未設定 / 単発</option>
            {team.team.competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">＋ 新しい大会を登録…</option>
          </select>
          {competitionId === "__new" && (
            <input
              style={{ marginTop: 8 }}
              value={newCompName}
              onChange={(e) => setNewCompName(e.target.value)}
              placeholder="新しい大会名（例）夏季カップ U-12"
              autoFocus
            />
          )}
        </div>
        <div className="formfield">
          <label>スコア（自チーム - 相手）</label>
          <div className="scoreinput">
            <input type="number" min={0} value={ourScore} onChange={(e) => setOurScore(e.target.value)} />
            <span>-</span>
            <input type="number" min={0} value={theirScore} onChange={(e) => setTheirScore(e.target.value)} />
          </div>
        </div>

        <div className="formfield">
          <label>得点者</label>
          {goals.map((g, i) => (
            <div key={i} className="dynrow">
              <select value={g.playerId} onChange={(e) => setGoals(upd(goals, i, { playerId: e.target.value }))}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="分"
                value={g.minute ?? ""}
                onChange={(e) => setGoals(upd(goals, i, { minute: e.target.value ? +e.target.value : undefined }))}
              />
              <select value={g.assistPlayerId ?? ""} onChange={(e) => setGoals(upd(goals, i, { assistPlayerId: e.target.value || undefined }))}>
                <option value="">アシスト無</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    A: {p.name}
                  </option>
                ))}
              </select>
              <button className="dynx" onClick={() => setGoals(goals.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button
            className="dynadd"
            onClick={() => firstPid && setGoals([...goals, { playerId: firstPid }])}
          >
            ＋ 得点者を追加
          </button>
        </div>

        <div className="formfield">
          <label>交代（OUT → IN）</label>
          {subs.map((s, i) => (
            <div key={i} className="dynrow">
              <select value={s.outPlayerId} onChange={(e) => setSubs(upd(subs, i, { outPlayerId: e.target.value }))}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    OUT {p.name}
                  </option>
                ))}
              </select>
              <select value={s.inPlayerId} onChange={(e) => setSubs(upd(subs, i, { inPlayerId: e.target.value }))}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    IN {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="分"
                value={s.minute ?? ""}
                onChange={(e) => setSubs(upd(subs, i, { minute: e.target.value ? +e.target.value : undefined }))}
              />
              <button className="dynx" onClick={() => setSubs(subs.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button
            className="dynadd"
            onClick={() => firstPid && setSubs([...subs, { outPlayerId: firstPid, inPlayerId: firstPid }])}
          >
            ＋ 交代を追加
          </button>
        </div>

        <div className="formfield">
          <label>メモ</label>
          <textarea value={mnote} onChange={(e) => setMnote(e.target.value)} rows={3} style={textareaStyle} placeholder="試合の振り返りなど" />
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            if (!opponent.trim()) {
              board.toast("対戦相手を入力してください");
              return;
            }
            // 大会: 新規入力があれば登録してそのIDを使う
            let cid: string | undefined =
              competitionId && competitionId !== "__new" ? competitionId : undefined;
            if (competitionId === "__new" && newCompName.trim()) {
              cid = team.addCompetition(newCompName);
            }
            const data = {
              date: mdate,
              opponent: opponent.trim(),
              competitionId: cid,
              ourScore: +ourScore || 0,
              theirScore: +theirScore || 0,
              goals,
              subs,
              note: mnote.trim() || undefined,
            };
            if (mr) team.updateMatch({ ...mr, ...data });
            else team.addMatch(data);
            close();
          }}
        >
          {mr ? "保存する" : "記録する"}
        </button>
      </Sheet>

      {/* 大会の登録・管理 */}
      <Sheet open={sheet?.type === "competitions"} onClose={close}>
        <h2>大会の登録・管理</h2>
        <div className="formfield">
          <label>新しい大会を登録</label>
          <div className="dynrow">
            <input
              value={mgrComp}
              onChange={(e) => setMgrComp(e.target.value)}
              placeholder="例）秋季リーグ U-12 / 〇〇カップ"
            />
            <button
              className="dynadd"
              style={{ width: "auto", flex: "0 0 auto", padding: "0 14px" }}
              onClick={() => {
                if (!mgrComp.trim()) return;
                team.addCompetition(mgrComp);
                setMgrComp("");
              }}
            >
              登録
            </button>
          </div>
        </div>
        <div className="list">
          {team.team.competitions.length === 0 ? (
            <div className="empty-msg">登録された大会はありません。</div>
          ) : (
            team.team.competitions.map((c) => {
              const n = team.team.matches.filter((m) => m.competitionId === c.id).length;
              return (
                <div key={c.id} className="cmprow">
                  <div className="cmpinfo">
                    <div className="cmpnm">{c.name}</div>
                    <div className="cmpsub">
                      {n}試合{c.note ? ` ・ ${c.note}` : ""}
                    </div>
                  </div>
                  <button
                    className="msgdel"
                    onClick={() => {
                      if (window.confirm(`「${c.name}」を削除しますか？（試合記録は残ります）`))
                        team.removeCompetition(c.id);
                    }}
                  >
                    <E n="trash" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </Sheet>

      {/* 試合詳細 */}
      <Sheet open={sheet?.type === "matchView"} onClose={close}>
        {sheet?.type === "matchView" &&
          (() => {
            const m = team.team.matches.find((x) => x.id === sheet.id);
            if (!m) return null;
            const win = m.ourScore > m.theirScore;
            const draw = m.ourScore === m.theirScore;
            return (
              <>
                <h2>
                  vs {m.opponent}
                  <span>{win ? "WIN" : draw ? "DRAW" : "LOSE"}</span>
                </h2>
                <div className="mvscore">
                  {m.ourScore} <small>-</small> {m.theirScore}
                </div>
                <div className="mvmeta">
                  {fmtDate(m.date)}
                  {(() => {
                    const cn = m.competitionId
                      ? team.team.competitions.find((c) => c.id === m.competitionId)?.name
                      : m.competition;
                    return cn ? <> ・ <E n="trophy" /> {cn}</> : "";
                  })()}
                </div>
                <div className="detail">
                  <div className="dsec">
                    <div className="dsec-h"><E n="ball" /> 得点者</div>
                    {m.goals.length === 0 ? (
                      <div className="dsec-e">記録なし</div>
                    ) : (
                      m.goals.map((g, i) => (
                        <div key={i} className="dline">
                          {g.minute != null ? `${g.minute}' ` : ""}
                          {nameOf(g.playerId)}
                          {g.assistPlayerId ? `（A: ${nameOf(g.assistPlayerId)}）` : ""}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="dsec">
                    <div className="dsec-h"><E n="refresh" /> 交代</div>
                    {m.subs.length === 0 ? (
                      <div className="dsec-e">記録なし</div>
                    ) : (
                      m.subs.map((s, i) => (
                        <div key={i} className="dline">
                          {s.minute != null ? `${s.minute}' ` : ""}
                          {nameOf(s.outPlayerId)} → {nameOf(s.inPlayerId)}
                        </div>
                      ))
                    )}
                  </div>
                  {m.note && (
                    <div className="dsec">
                      <div className="dsec-h"><E n="note" /> メモ</div>
                      <div className="dline">{m.note}</div>
                    </div>
                  )}
                </div>
                {isCoach && (
                  <>
                    <button className="bigbtn ghost" onClick={() => setSheet({ type: "match", record: m })}>
                      編集する
                    </button>
                    <button
                      className="bigbtn ghost"
                      style={{ color: "var(--red)" }}
                      onClick={() => {
                        if (window.confirm("この試合記録を削除しますか？")) {
                          team.removeMatch(m.id);
                          close();
                        }
                      }}
                    >
                      削除する
                    </button>
                  </>
                )}
              </>
            );
          })()}
      </Sheet>

    </>
  );
}

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  padding: "12px 13px",
  color: "var(--ink)",
  fontSize: 15,
  fontFamily: "Manrope, sans-serif",
  resize: "vertical",
};

export default function TeamHub() {
  return <Inner />;
}
