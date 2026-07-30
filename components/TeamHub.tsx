"use client";

import { useState } from "react";
import type React from "react";
import type {
  Announcement,
  AttendanceStatus,
  DominantFoot,
  MatchGoal,
  MatchRecord,
  MatchSub,
  Player,
  Position,
  RecurrenceRule,
  TeamEvent,
  TeamEventKind,
} from "@/lib/types";
import { INJURY_STATUS_LABEL } from "@/lib/types";
import { ALL_POSITIONS, groupOf } from "@/lib/formations";
import {
  addDays,
  byStartAsc,
  CATEGORY_PALETTE,
  categoryOf,
  diffDays,
  eventEndDate,
  gmapsDirUrl,
  gmapsEmbedUrl,
  gmapsSearchUrl,
  isMultiDay,
  isOngoing,
  isUpcomingOrOngoing,
  occursOn,
} from "@/lib/calendarUtils";
import { loadLastEventCategory, saveLastEventCategory } from "@/lib/storage";
import { localDateStr } from "@/lib/dates";
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
  // toISOString(UTC基準)だとJSTの0〜9時に「今日」が前日にズレる(lib/dates.ts参照)
  return localDateStr();
}
function fmtTimeRange(ev: { time?: string; endTime?: string }): string {
  if (ev.time && ev.endTime) return `${ev.time}〜${ev.endTime}`;
  return ev.time ?? "";
}
/** 予定カード用の日時表示（単日「7/9(木) 17:00〜19:00」／複数日「7/20(月)〜7/22(水)」／終日は時刻非表示） */
function evWhenText(e: TeamEvent): string {
  if (isMultiDay(e)) return `${fmtDate(e.date)}〜${fmtDate(eventEndDate(e))}`;
  if (e.allDay) return `${fmtDate(e.date)} 終日`;
  return `${fmtDate(e.date)}${fmtTimeRange(e) ? ` ${fmtTimeRange(e)}` : ""}`;
}
function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
/** 予定タイトルから対戦相手名を推定（「練習試合 vs 青空FC」→「青空FC」） */
function opponentFromTitle(title: string): string {
  const m = title.match(/(?:vs\.?|VS|ＶＳ|対)\s*(.+)$/i);
  return m ? m[1].trim() : "";
}
const byDateAsc = (a: TeamEvent, b: TeamEvent) =>
  `${a.date} ${a.time ?? ""}` < `${b.date} ${b.time ?? ""}` ? -1 : 1;
const byDateDesc = (a: TeamEvent, b: TeamEvent) => -byDateAsc(a, b);

/* ---------------- カレンダー拡張ヘルパー ---------------- */
/** 日付文字列(YYYY-MM-DD)の曜日（0=日..6=土）。表示・初期値算出用のローカル計算 */
function wdOf(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return 0;
  return new Date(y, m - 1, d).getDay();
}
/** ymd の nヶ月後（繰り返し終了日の初期値算出専用） */
function addMonthsStr(s: string, months: number): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return s;
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
/** 「M/D」表記（繰り返し説明用） */
function fmtMD(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  return `${m}/${d}`;
}
/** 繰り返しルールの説明文（例: 毎週 火・木 〜9/30） */
function ruleDesc(rule: RecurrenceRule): string {
  const freqLabel = rule.freq === "monthly" ? "毎月" : rule.interval === 2 ? "隔週" : "毎週";
  const wd =
    rule.freq === "weekly" && rule.byWeekday && rule.byWeekday.length > 0
      ? " " + rule.byWeekday.map((i) => WD[i]).join("・")
      : "";
  return `${freqLabel}${wd} 〜${fmtMD(rule.until)}`;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = { yes: "出席", maybe: "未定", no: "欠席" };
const STATUS_MARK: Record<AttendanceStatus, string> = { yes: "○", maybe: "△", no: "×" };

/** 利き足の表示ラベル（未設定は「—」） */
function footLabel(f?: DominantFoot): string {
  if (f === "right") return "右足";
  if (f === "left") return "左足";
  if (f === "both") return "両足";
  return "—";
}

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
        {/* PCダイアログ用の閉じるボタン（モバイルでは基底CSSで非表示） */}
        <button className="sheetx" type="button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
        <div className="sheetBody">{open ? children : null}</div>
      </div>
    </>
  );
}

type Tab = "home" | "att" | "cal" | "rec" | "ros";

type SheetState =
  | { type: "event"; event?: TeamEvent; date?: string }
  | { type: "attendance"; eventId: string }
  | { type: "announce" }
  | { type: "annList" }
  | { type: "day"; date: string }
  | { type: "eventView"; id: string }
  | {
      type: "match";
      record?: MatchRecord;
      /** 試合イベントから引き継ぐ初期値（新規記録用） */
      prefill?: { date?: string; opponent?: string };
    }
  | { type: "matchView"; id: string }
  | { type: "competitions" }
  | { type: "categories" }
  | { type: "playerDetail"; playerId: string }
  | { type: "playerForm"; player?: Player }
  | null;

function Inner() {
  const board = useBoard();
  const team = useTeam();
  const players = board.state.players;
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<SheetState>(null);
  // カレンダーの表示月・表示モードはタブを跨いで保持する
  const now = new Date();
  const [calYm, setCalYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [calView, setCalView] = useState<"month" | "list">("month");

  const isCoach = team.viewer.role === "coach";
  const me = team.viewer.memberPlayerId
    ? players.find((p) => p.id === team.viewer.memberPlayerId) ?? null
    : null;

  const tabs: [Tab, string][] = [
    ["home", "ホーム"],
    ["att", "出欠"],
    ["cal", "カレンダー"],
    ["rec", "試合記録"],
  ];
  // 名簿は表示中のロールに合わせる（選手プレビュー時は隠して見え方を揃える）
  if (isCoach && board.auth.role === "coach") tabs.push(["ros", "名簿"]);
  const activeTab: Tab = tabs.some(([t]) => t === tab) ? tab : "home";

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
        {board.auth.role === "coach" && (
          <button className="teamcta" type="button" onClick={() => setSheet({ type: "event" })}>
            ＋ 予定を追加
          </button>
        )}
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
          <div key={t} className={`chip${activeTab === t ? " on" : ""}`} onClick={() => setTab(t)}>
            {label}
          </div>
        ))}
      </div>

      {/* paddingは基底CSS(.teamapp .scroll)へ移設（PCで上書きできるように） */}
      <div className="scroll">
        {activeTab === "home" && (
          <HomeTab isCoach={isCoach} me={me} setSheet={setSheet} setTab={setTab} />
        )}
        {activeTab === "att" && <AttendanceTab isCoach={isCoach} me={me} setSheet={setSheet} />}
        {activeTab === "cal" && (
          <CalendarTab
            isCoach={isCoach}
            setSheet={setSheet}
            ym={calYm}
            setYm={setCalYm}
            view={calView}
            setView={setCalView}
          />
        )}
        {activeTab === "rec" && (
          <MatchesTab isCoach={isCoach} players={players} setSheet={setSheet} />
        )}
        {activeTab === "ros" && isCoach && board.auth.role === "coach" && (
          <RosterTab players={players} setSheet={setSheet} />
        )}
      </div>

      <SheetHost
        key={sheetKey(sheet)}
        sheet={sheet}
        setSheet={setSheet}
        players={players}
        isCoach={isCoach}
        me={me}
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
  if (s.type === "match")
    return (
      "match-" +
      (s.record?.id ??
        (s.prefill ? `pf-${s.prefill.date ?? ""}-${s.prefill.opponent ?? ""}` : "new"))
    );
  if (s.type === "matchView") return "mv-" + s.id;
  if (s.type === "playerDetail") return "pd-" + s.playerId;
  if (s.type === "playerForm") return "pf-" + (s.player?.id ?? "new");
  return s.type;
}

/* ---------------- ホーム ---------------- */
function HomeTab({
  isCoach,
  me,
  setSheet,
  setTab,
}: {
  isCoach: boolean;
  me: Player | null;
  setSheet: (s: SheetState) => void;
  setTab: (t: Tab) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const today = todayStr();
  const upcoming = team.team.events
    .filter((e) => isUpcomingOrOngoing(e, today))
    .sort(byDateAsc);
  const next = upcoming[0];
  const nextCat = next ? categoryOf(next, team.categories) : null;
  const unanswered = me
    ? upcoming.filter((e) => !team.team.attendance[e.id]?.[me.id])
    : [];
  const anns = team.team.announcements;
  const matches = [...team.team.matches].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = matches[0];
  let w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0;
  matches.forEach((m) => {
    gf += m.ourScore;
    ga += m.theirScore;
    if (m.ourScore > m.theirScore) w++;
    else if (m.ourScore === m.theirScore) d++;
    else l++;
  });
  const showMatches = isCoach || board.matchesPublic;
  const s = next ? team.summary(next.id) : null;

  return (
    // 試合非表示時はサイド列を作らず1カラム（空の360px列を残さない）
    <div className={`hometab${showMatches ? "" : " solo"}`}>
      <div className="httop">
        {!isCoach && unanswered.length > 0 && (
          <div className="alertcard" onClick={() => setTab("att")}>
            <E n="bell" /> 出欠が未回答の予定が {unanswered.length} 件あります
            <span className="seclink">回答する ›</span>
          </div>
        )}

        {isCoach && (
          <div className="quickrow">
            <button className="bigbtn" onClick={() => setSheet({ type: "event" })}>
              ＋ 予定を追加
            </button>
            <button className="bigbtn ghost" onClick={() => setSheet({ type: "match" })}>
              ＋ 試合結果を記録
            </button>
          </div>
        )}
      </div>

      <div className="htmain">
      <div className="sech">次の予定</div>
      {!next ? (
        <div className="empty-msg" style={{ padding: "14px 0" }}>
          今後の予定はありません。
        </div>
      ) : (
        <div className="evcard">
          <div className="evhead">
            <span className="evkind" style={{ background: nextCat?.color }}>
              {nextCat?.label}
            </span>
            <span className="evtitle">{next.title}</span>
            <span className="evopen" onClick={() => setSheet({ type: "eventView", id: next.id })}>
              詳細 ›
            </span>
          </div>
          <div className="homewhen">
            {evWhenText(next)}
            {isOngoing(next, today) && <span className="ongoing">開催中</span>}
          </div>
          {next.place && (
            <div className="evmeta">
              <E n="pin" /> {next.place}
            </div>
          )}
          {next.note && <div className="evnote">{next.note}</div>}
          {isCoach && s ? (
            <div className="evsummary" onClick={() => setSheet({ type: "attendance", eventId: next.id })}>
              <span className="att yes">出席 {s.yes}</span>
              <span className="att maybe">未定 {s.maybe}</span>
              <span className="att no">欠席 {s.no}</span>
              <span className="att none">未回答 {s.none}</span>
              <span className="evopen">回答を見る ›</span>
            </div>
          ) : (
            me && <MemberAttRow eventId={next.id} playerId={me.id} />
          )}
        </div>
      )}
      {upcoming.length > 1 && (
        <div className="seclink" style={{ textAlign: "right" }} onClick={() => setTab("att")}>
          ほか {upcoming.length - 1} 件の予定を見る ›
        </div>
      )}

      <div className="sech">
        連絡
        {anns.length > 2 && (
          <span className="seclink" onClick={() => setSheet({ type: "annList" })}>
            すべて見る ›
          </span>
        )}
      </div>
      {isCoach && (
        <button className="dynadd" style={{ marginBottom: 8 }} onClick={() => setSheet({ type: "announce" })}>
          ＋ 連絡を送る
        </button>
      )}
      {anns.length === 0 ? (
        <div className="empty-msg" style={{ padding: "8px 0" }}>
          連絡はまだありません。
        </div>
      ) : (
        anns.slice(0, 2).map((a) => <AnnCard key={a.id} a={a} isCoach={isCoach} />)
      )}
      </div>

      {showMatches && (
      <div className="htside">
        <>
          <div className="sech">
            試合
            <span className="seclink" onClick={() => setTab("rec")}>
              試合記録へ ›
            </span>
          </div>
          {matches.length === 0 ? (
            <div className="empty-msg" style={{ padding: "8px 0" }}>
              まだ試合記録がありません。
            </div>
          ) : (
            <>
              <div className="statrow" style={{ marginBottom: 8 }}>
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
              {latest &&
                (() => {
                  const win = latest.ourScore > latest.theirScore;
                  const draw = latest.ourScore === latest.theirScore;
                  return (
                    <div
                      className="matchcard"
                      onClick={() => setSheet({ type: "matchView", id: latest.id })}
                    >
                      <div className={`mres ${win ? "w" : draw ? "d" : "l"}`}>
                        {win ? "勝" : draw ? "分" : "敗"}
                      </div>
                      <div className="mmid">
                        <div className="mopp">vs {latest.opponent}</div>
                        <div className="msub">{fmtDate(latest.date)}</div>
                      </div>
                      <div className="mscore">
                        {latest.ourScore}
                        <span>-</span>
                        {latest.theirScore}
                      </div>
                    </div>
                  );
                })()}
            </>
          )}
        </>
      </div>
      )}
    </div>
  );
}

/* 連絡1件の表示カード */
function AnnCard({ a, isCoach }: { a: Announcement; isCoach: boolean }) {
  const team = useTeam();
  return (
    <div className="msgcard">
      <div className="msgtop">
        <span className="msgfrom">スタッフ</span>
        <span className="msgdate">{fmtTs(a.ts)}</span>
        {isCoach && (
          <button
            className="msgdel"
            onClick={() => {
              if (window.confirm("この連絡を削除しますか？")) team.removeAnnouncement(a.id);
            }}
          >
            <E n="trash" />
          </button>
        )}
      </div>
      <div className="msgtext">{a.text}</div>
      {a.playTitle && (
        <div className="evnote">
          <E n="clipboard" /> 添付戦術: {a.playTitle}
        </div>
      )}
    </div>
  );
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
  const today = todayStr();
  const [showPast, setShowPast] = useState(false);
  const upcoming = team.team.events
    .filter((e) => isUpcomingOrOngoing(e, today))
    .sort(byDateAsc);
  const past = team.team.events
    .filter((e) => eventEndDate(e) < today)
    .sort(byDateDesc);
  return (
    <>
      {isCoach && (
        <button className="bigbtn" style={{ width: "100%", margin: "12px 0 6px" }} onClick={() => setSheet({ type: "event" })}>
          ＋ 予定を追加
        </button>
      )}
      {upcoming.length === 0 ? (
        <div className="empty-msg">今後の予定はありません。</div>
      ) : (
        <div className="attlist">
          {upcoming.map((ev) => (
            <EventCard key={ev.id} ev={ev} isCoach={isCoach} me={me} setSheet={setSheet} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <>
          <button
            className="dynadd"
            style={{ margin: "14px 0 10px" }}
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? "過去の予定を隠す" : `過去の予定を表示（${past.length}件）`}
          </button>
          {showPast && (
            <div className="attlist">
              {past.map((ev) => (
                <EventCard key={ev.id} ev={ev} isCoach={isCoach} me={me} setSheet={setSheet} past />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* 予定1件のカード（出欠タブ用） */
function EventCard({
  ev,
  isCoach,
  me,
  setSheet,
  past = false,
}: {
  ev: TeamEvent;
  isCoach: boolean;
  me: Player | null;
  setSheet: (s: SheetState) => void;
  past?: boolean;
}) {
  const team = useTeam();
  const s = team.summary(ev.id);
  const mine = me ? team.team.attendance[ev.id]?.[me.id] : undefined;
  const cat = categoryOf(ev, team.categories);
  const ongoing = isOngoing(ev, todayStr());
  return (
    <div className="evcard" style={past ? { opacity: 0.72 } : undefined}>
      <div className="evhead">
        <span className="evkind" style={{ background: cat.color }}>
          {cat.label}
        </span>
        <span className="evtitle">{ev.title}</span>
        {!isCoach && !past && !mine && <span className="needans">未回答</span>}
        {isCoach && (
          <span className="evacts">
            <button onClick={() => setSheet({ type: "event", event: ev })}>✎</button>
            <button
              onClick={() => {
                if (ev.seriesId) {
                  setSheet({ type: "eventView", id: ev.id });
                  return;
                }
                if (window.confirm(`「${ev.title}」を削除しますか？`)) team.removeEventOnly(ev.id);
              }}
            >
              <E n="trash" />
            </button>
          </span>
        )}
      </div>
      <div className="evmeta">
        {evWhenText(ev)}
        {ongoing && <span className="ongoing">開催中</span>}
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
      ) : past ? (
        me && (
          <div className="evmeta" style={{ marginTop: 8 }}>
            あなたの回答: {mine ? `${STATUS_MARK[mine.status]} ${STATUS_LABEL[mine.status]}` : "未回答"}
            {mine?.comment ? `（${mine.comment}）` : ""}
          </div>
        )
      ) : (
        me && <MemberAttRow eventId={ev.id} playerId={me.id} />
      )}
    </div>
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
      {!cur?.status && reason.trim() !== "" && (
        <div className="atthint">○△×のどれかを選ぶと、理由と一緒に保存されます</div>
      )}
    </>
  );
}

/* ---------------- カレンダー ---------------- */
function CalendarTab({
  isCoach,
  setSheet,
  ym,
  setYm,
  view,
  setView,
}: {
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  ym: { y: number; m: number };
  setYm: (v: { y: number; m: number }) => void;
  view: "month" | "list";
  setView: (v: "month" | "list") => void;
}) {
  const team = useTeam();

  const first = new Date(ym.y, ym.m, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (d: number) =>
    `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const eventsOn = (d: number) =>
    team.team.events.filter((e) => occursOn(e, dateStr(d))).sort(byStartAsc);
  const today = todayStr();

  const shift = (delta: number) => {
    const nm = ym.m + delta;
    setYm({ y: ym.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 });
  };

  // 当月の予定を日付ごとにまとめる（リスト表示用）
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .map((d) => ({ d, ds: dateStr(d), evs: eventsOn(d) }))
    .filter((x) => x.evs.length > 0);

  // その月に登場するカテゴリ（凡例用・最大5個＋「他◯」）
  const monthCatMap = new Map<string, ReturnType<typeof categoryOf>>();
  monthDays.forEach(({ evs }) =>
    evs.forEach((e) => {
      const c = categoryOf(e, team.categories);
      if (!monthCatMap.has(c.id)) monthCatMap.set(c.id, c);
    })
  );
  const monthCats = Array.from(monthCatMap.values());

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
                  onClick={() =>
                    // 予定が1件だけの日は日別シートを飛ばして直接詳細へ
                    evs.length === 1
                      ? setSheet({ type: "eventView", id: evs[0].id })
                      : setSheet({ type: "day", date: ds })
                  }
                >
                  <span className={`caldate${i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : ""}`}>{d}</span>
                  <div className="calevs">
                    {evs.slice(0, 2).map((e) => {
                      const cat = categoryOf(e, team.categories);
                      const isStart = e.date === ds;
                      const isEnd = eventEndDate(e) === ds;
                      const corner = isStart && isEnd ? "single" : isStart ? "start" : isEnd ? "end" : "mid";
                      const showTime = (corner === "start" || corner === "single") && !e.allDay && e.time;
                      return (
                        <span
                          key={e.id}
                          className={`calev ${corner}`}
                          style={{ background: cat.color }}
                        >
                          {showTime ? `${e.time} ${e.title}` : e.title}
                        </span>
                      );
                    })}
                    {evs.length > 2 && <span className="calmore">＋{evs.length - 2}件</span>}
                  </div>
                  <div className="caldots">
                    {evs.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="caldot"
                        style={{ background: categoryOf(e, team.categories).color }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {(monthCats.length > 0 || isCoach) && (
            <div className="callegend">
              {monthCats.slice(0, 5).map((c) => (
                <span key={c.id}>
                  <i className="caldot" style={{ background: c.color }} /> {c.label}
                </span>
              ))}
              {monthCats.length > 5 && <span>他{monthCats.length - 5}</span>}
              {isCoach && <span className="calhint">日付をタップで予定を追加</span>}
            </div>
          )}
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
                    {evs.map((e) => {
                      const timeLabel = isMultiDay(e)
                        ? `${fmtMD(e.date)}〜${fmtMD(eventEndDate(e))}`
                        : e.allDay
                          ? "終日"
                          : fmtTimeRange(e);
                      const cat = categoryOf(e, team.categories);
                      return (
                        <div
                          key={e.id}
                          className={`agbar ${e.kind}`}
                          style={{ borderLeftColor: cat.color }}
                          onClick={() => setSheet({ type: "eventView", id: e.id })}
                        >
                          <span className="agkind" style={{ background: cat.color }}>{cat.label}</span>
                          <span className="agtitle">{e.title}</span>
                          {timeLabel && <span className="agtime">{timeLabel}</span>}
                        </div>
                      );
                    })}
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
        <div className="reclist">
          {matches.map((m) => {
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
          })}
        </div>
      )}
    </>
  );
}

/* ---------------- 名簿（チーム運営内） ---------------- */
function RosterTab({
  players,
  setSheet,
}: {
  players: Player[];
  setSheet: (s: SheetState) => void;
}) {
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
        <div className="roslist">
        {list.map((p) => {
          const inj = (p.injuries ?? []).find((x) => x.status !== "ok");
          return (
            <div
              key={p.id}
              className="prow"
              onClick={() => setSheet({ type: "playerDetail", playerId: p.id })}
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
        })}
        </div>
      )}
      <button
        className="bigbtn"
        style={{ width: "100%", margin: "8px 0 0" }}
        onClick={() => setSheet({ type: "playerForm" })}
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
  me,
}: {
  sheet: SheetState;
  setSheet: (s: SheetState) => void;
  players: Player[];
  isCoach: boolean;
  me: Player | null;
}) {
  const board = useBoard();
  const team = useTeam();
  const close = () => setSheet(null);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";

  // event form
  const ev = sheet?.type === "event" ? sheet.event : undefined;
  const evDefaultDate = sheet?.type === "event" ? sheet.date : undefined;
  const initDate = ev?.date ?? evDefaultDate ?? todayStr();
  const [categoryId, setCategoryId] = useState<string>(
    ev ? ev.categoryId ?? ev.kind : loadLastEventCategory() ?? "practice"
  );
  const [title, setTitle] = useState(ev?.title ?? "");
  const [allDay, setAllDay] = useState(ev?.allDay ?? false);
  const [date, setDate] = useState(initDate);
  const [endDate, setEndDate] = useState(ev ? eventEndDate(ev) : initDate);
  const [time, setTime] = useState(ev?.time ?? "");
  const [endTime, setEndTime] = useState(ev?.endTime ?? "");
  const [place, setPlace] = useState(ev?.place ?? "");
  const [address, setAddress] = useState(ev?.address ?? "");
  const [note, setNote] = useState(ev?.note ?? "");
  // 繰り返し（新規作成時のみ使用）
  const [freqSel, setFreqSel] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [byWeekday, setByWeekday] = useState<number[]>([]);
  const [until, setUntil] = useState(() => addMonthsStr(initDate, 3));
  // 編集時の適用範囲（seriesIdありかつdetachedでない場合のみ表示）
  const [applyScope, setApplyScope] = useState<"only" | "following">("only");
  const editSeries = !!(ev && ev.seriesId && !ev.detached);
  const kind: TeamEventKind = categoryId === "match" ? "match" : "practice";

  const onChangeStartDate = (v: string) => {
    const span = diffDays(date, endDate);
    setDate(v);
    const nextEnd = addDays(v, span);
    setEndDate(nextEnd < v ? v : nextEnd);
  };

  // カテゴリ管理
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState(CATEGORY_PALETTE[0].color);
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catEditLabel, setCatEditLabel] = useState("");
  const [catEditColor, setCatEditColor] = useState("");

  // announce
  const [text, setText] = useState("");
  const [playId, setPlayId] = useState("");

  // match form
  const mr = sheet?.type === "match" ? sheet.record : undefined;
  const mpf = sheet?.type === "match" ? sheet.prefill : undefined;
  const [opponent, setOpponent] = useState(mr?.opponent ?? mpf?.opponent ?? "");
  const [mdate, setMdate] = useState(mr?.date ?? mpf?.date ?? todayStr());
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

  // 選手フォーム
  const pf = sheet?.type === "playerForm" ? sheet.player : undefined;
  const [pfName, setPfName] = useState(pf?.name ?? "");
  const [pfNumber, setPfNumber] = useState(pf?.number != null ? String(pf.number) : "");
  const [pfPosition, setPfPosition] = useState<Position>(pf?.position ?? ALL_POSITIONS[0]);
  const [pfHeight, setPfHeight] = useState(pf?.height != null ? String(pf.height) : "");
  const [pfWeight, setPfWeight] = useState(pf?.weight != null ? String(pf.weight) : "");
  const [pfFoot, setPfFoot] = useState<"" | DominantFoot>(pf?.dominantFoot ?? "");
  const [pfEmail, setPfEmail] = useState(pf?.email ?? "");

  const firstPid = players[0]?.id ?? "";

  return (
    <>
      {/* 予定（イベント）フォーム */}
      <Sheet open={sheet?.type === "event"} onClose={close}>
        <h2>{ev ? "予定を編集" : "予定を追加"}</h2>
        <div className="formfield">
          <label>カテゴリ</label>
          <div className="catpick">
            {team.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`evcatchip${categoryId === c.id ? " on" : ""}`}
                style={categoryId === c.id ? { borderColor: c.color, color: c.color } : undefined}
                onClick={() => setCategoryId(c.id)}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: c.color,
                    flex: "0 0 auto",
                    display: "inline-block",
                  }}
                />
                {c.label}
              </button>
            ))}
            <button
              type="button"
              className="evcatchip catmanage"
              onClick={() => setSheet({ type: "categories" })}
            >
              ＋ 管理
            </button>
          </div>
        </div>
        <div className="formfield">
          <label>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）通常練習 / 練習試合 vs ○○" />
        </div>
        <div className="formfield">
          <label className="daytoggle">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span />
            終日
          </label>
        </div>
        <div className="formgrid">
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>開始日</label>
            <input type="date" value={date} onChange={(e) => onChangeStartDate(e.target.value)} />
          </div>
          {!allDay && (
            <div className="formfield" style={{ flex: 1, margin: 0 }}>
              <label>開始時刻</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          )}
        </div>
        <div className="formgrid">
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>終了日</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value < date ? date : e.target.value)}
            />
          </div>
          {!allDay && (
            <div className="formfield" style={{ flex: 1, margin: 0 }}>
              <label>終了時刻</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          )}
        </div>
        {!ev && (
          <div className="formfield">
            <label>繰り返し</label>
            <select
              value={freqSel}
              onChange={(e) => {
                const v = e.target.value as typeof freqSel;
                setFreqSel(v);
                if ((v === "weekly" || v === "biweekly") && byWeekday.length === 0) {
                  setByWeekday([wdOf(date)]);
                }
              }}
            >
              <option value="none">繰り返しなし</option>
              <option value="weekly">毎週</option>
              <option value="biweekly">隔週</option>
              <option value="monthly">毎月（同じ日）</option>
            </select>
          </div>
        )}
        {!ev && (freqSel === "weekly" || freqSel === "biweekly") && (
          <div className="formfield">
            <label>曜日</label>
            <div className="wdpick">
              {WD.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  className={`wdchip${byWeekday.includes(i) ? " on" : ""}`}
                  onClick={() =>
                    setByWeekday((cur) =>
                      cur.includes(i)
                        ? cur.length === 1
                          ? cur
                          : cur.filter((x) => x !== i)
                        : [...cur, i].sort((a, b) => a - b)
                    )
                  }
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}
        {!ev && freqSel !== "none" && (
          <div className="formfield">
            <label>繰り返し終了日</label>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        )}
        <div className="formfield">
          <label>場所</label>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="例）市営グラウンド" />
        </div>
        <div className="formfield">
          <label>住所</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="地図表示用（任意）" />
        </div>
        <div className="formfield">
          <label>メモ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="持ち物・集合など" />
        </div>
        {editSeries && (
          <div className="formfield">
            <label>適用範囲</label>
            <div className="calviewtoggle">
              <button
                type="button"
                className={applyScope === "only" ? "on" : ""}
                onClick={() => setApplyScope("only")}
              >
                この予定のみ
              </button>
              <button
                type="button"
                className={applyScope === "following" ? "on" : ""}
                onClick={() => setApplyScope("following")}
              >
                以降すべて
              </button>
            </div>
          </div>
        )}
        <button
          className="bigbtn"
          onClick={() => {
            if (!title.trim()) {
              board.toast("タイトルを入力してください");
              return;
            }
            // 組込みカテゴリ（練習/試合）は categoryId を保存せず kind のフォールバックに任せる
            const catForSave =
              categoryId === "practice" || categoryId === "match" ? undefined : categoryId;
            const finalEndDate = endDate && endDate !== date ? endDate : undefined;
            const finalAllDay = allDay || undefined;
            const data = {
              kind,
              categoryId: catForSave,
              title: title.trim(),
              date,
              endDate: finalEndDate,
              allDay: finalAllDay,
              time: allDay ? undefined : time || undefined,
              endTime: allDay ? undefined : endTime || undefined,
              place: place.trim() || undefined,
              address: address.trim() || undefined,
              note: note.trim() || undefined,
            };
            saveLastEventCategory(categoryId);
            if (!ev) {
              let rule: RecurrenceRule | undefined;
              if (freqSel === "monthly") {
                rule = { freq: "monthly", interval: 1, until };
              } else if (freqSel === "weekly" || freqSel === "biweekly") {
                rule = {
                  freq: "weekly",
                  interval: freqSel === "biweekly" ? 2 : 1,
                  byWeekday: byWeekday.length > 0 ? byWeekday : [wdOf(date)],
                  until,
                };
              }
              team.addEventWithRecurrence(data, rule);
            } else if (editSeries && applyScope === "following") {
              const series = team.team.series?.find((s) => s.id === ev.seriesId);
              if (series) team.updateSeriesFollowing(ev, data, series.rule);
              else team.updateEventOnly({ ...ev, ...data });
            } else {
              team.updateEventOnly({ ...ev, ...data });
            }
            close();
          }}
        >
          {ev ? "保存する" : "追加する"}
        </button>
      </Sheet>

      {/* カテゴリ管理 */}
      <Sheet open={sheet?.type === "categories"} onClose={close}>
        <h2>カテゴリ管理</h2>
        <div className="list">
          {team.categories.map((c) => (
            <div key={c.id} className="catrow">
              {catEditId === c.id ? (
                <div style={{ flex: 1 }}>
                  {c.builtin ? (
                    <div className="cmpnm" style={{ marginBottom: 8 }}>
                      {c.label}
                    </div>
                  ) : (
                    <input
                      value={catEditLabel}
                      onChange={(e) => setCatEditLabel(e.target.value)}
                      style={{ marginBottom: 8 }}
                      autoFocus
                    />
                  )}
                  <div className="swatches">
                    {CATEGORY_PALETTE.map((p) => (
                      <button
                        key={p.color}
                        type="button"
                        className={`swatch${catEditColor === p.color ? " on" : ""}`}
                        style={{ background: p.color }}
                        aria-label={p.name}
                        onClick={() => setCatEditColor(p.color)}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className="bigbtn"
                      style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                      onClick={() => {
                        if (!c.builtin && !catEditLabel.trim()) {
                          board.toast("名前を入力してください");
                          return;
                        }
                        team.updateCategory({
                          id: c.id,
                          label: c.builtin ? c.label : catEditLabel.trim(),
                          color: catEditColor,
                        });
                        setCatEditId(null);
                      }}
                    >
                      保存する
                    </button>
                    <button
                      className="bigbtn ghost"
                      style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                      onClick={() => setCatEditId(null)}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: c.color,
                      flex: "0 0 auto",
                      display: "inline-block",
                    }}
                  />
                  <div className="cmpinfo">
                    <div className="cmpnm">{c.label}</div>
                    {c.builtin && <div className="cmpsub">名前固定</div>}
                  </div>
                  <button
                    className="msgdel"
                    onClick={() => {
                      setCatEditId(c.id);
                      setCatEditLabel(c.label);
                      setCatEditColor(c.color);
                    }}
                  >
                    ✎
                  </button>
                  {!c.builtin && (
                    <button
                      className="msgdel"
                      onClick={() => {
                        if (
                          window.confirm(
                            `「${c.label}」を削除しますか？（予定は残ります。カテゴリなしになります）`
                          )
                        )
                          team.removeCategory(c.id);
                      }}
                    >
                      <E n="trash" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="formfield">
          <label>新しいカテゴリを追加</label>
          <input
            value={newCatLabel}
            onChange={(e) => setNewCatLabel(e.target.value)}
            placeholder="例）遠征・合宿 / 保護者会"
          />
          <div className="swatches">
            {CATEGORY_PALETTE.map((p) => (
              <button
                key={p.color}
                type="button"
                className={`swatch${newCatColor === p.color ? " on" : ""}`}
                style={{ background: p.color }}
                aria-label={p.name}
                onClick={() => setNewCatColor(p.color)}
              />
            ))}
          </div>
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            if (!newCatLabel.trim()) {
              board.toast("名前を入力してください");
              return;
            }
            team.addCategory(newCatLabel, newCatColor);
            setNewCatLabel("");
            setNewCatColor(CATEGORY_PALETTE[0].color);
          }}
        >
          追加する
        </button>
      </Sheet>

      {/* 出欠一覧（スタッフ）: 未回答→欠席→未定→出席の順にグルーピング */}
      <Sheet open={sheet?.type === "attendance"} onClose={close}>
        {sheet?.type === "attendance" &&
          (() => {
            const ev = team.team.events.find((e) => e.id === sheet.eventId);
            const att = team.team.attendance[sheet.eventId] ?? {};
            const s = team.summary(sheet.eventId);
            const order: { key: AttendanceStatus | "none"; label: string }[] = [
              { key: "none", label: "未回答" },
              { key: "no", label: "欠席" },
              { key: "maybe", label: "未定" },
              { key: "yes", label: "出席" },
            ];
            const groups = order
              .map((g) => ({
                ...g,
                list: players.filter((p) => (att[p.id]?.status ?? "none") === g.key),
              }))
              .filter((g) => g.list.length > 0);
            const noAns = players.filter((p) => !att[p.id]);
            const copyNoAns = async () => {
              const txt = `【出欠回答のお願い】${ev ? `${ev.title}（${fmtDate(ev.date)}）` : ""}\n未回答: ${noAns
                .map((p) => p.name)
                .join("、")}`;
              let ok = false;
              try {
                await navigator.clipboard.writeText(txt);
                ok = true;
              } catch {
                // clipboard API が使えない環境向けフォールバック
                const ta = document.createElement("textarea");
                ta.value = txt;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                try {
                  ok = document.execCommand("copy");
                } catch {
                  ok = false;
                }
                ta.remove();
              }
              board.toast(ok ? "未回答者リストをコピーしました" : "コピーできませんでした");
            };
            return (
              <>
                <h2>出欠の回答</h2>
                {ev && (
                  <div className="mvmeta" style={{ textAlign: "left", margin: "0 16px 10px" }}>
                    {ev.title} ・ {fmtDate(ev.date)}
                  </div>
                )}
                <div className="attsummary">
                  <span className="att yes">出席 {s.yes}</span>
                  <span className="att maybe">未定 {s.maybe}</span>
                  <span className="att no">欠席 {s.no}</span>
                  <span className="att none">未回答 {s.none}</span>
                </div>
                {noAns.length > 0 && (
                  <button className="bigbtn ghost" style={{ margin: "0 16px 4px" }} onClick={copyNoAns}>
                    未回答 {noAns.length}人の名前をコピー（催促用）
                  </button>
                )}
                <div className="list">
                  {players.length === 0 ? (
                    <div className="empty-msg">選手がいません。</div>
                  ) : (
                    groups.map((g) => (
                      <div key={g.key}>
                        <div className={`attgh ${g.key}`}>
                          {g.label} {g.list.length}人
                        </div>
                        {g.list.map((p) => {
                          const cur = att[p.id];
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
                        })}
                      </div>
                    ))
                  )}
                </div>
              </>
            );
          })()}
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

      {/* 連絡の一覧 */}
      <Sheet open={sheet?.type === "annList"} onClose={close}>
        <h2>連絡</h2>
        {isCoach && (
          <button
            className="dynadd"
            style={{ width: "calc(100% - 32px)", margin: "0 16px 8px" }}
            onClick={() => setSheet({ type: "announce" })}
          >
            ＋ 連絡を送る
          </button>
        )}
        <div className="list">
          {team.team.announcements.length === 0 ? (
            <div className="empty-msg">連絡はまだありません。</div>
          ) : (
            team.team.announcements.map((a) => <AnnCard key={a.id} a={a} isCoach={isCoach} />)
          )}
        </div>
      </Sheet>

      {/* 日別（カレンダー） */}
      <Sheet open={sheet?.type === "day"} onClose={close}>
        {sheet?.type === "day" && (
          <>
            <h2>{fmtDate(sheet.date)} の予定</h2>
            <div className="list">
              {team.team.events.filter((e) => occursOn(e, sheet.date)).length === 0 ? (
                <div className="empty-msg">この日に予定はありません。</div>
              ) : (
                team.team.events
                  .filter((e) => occursOn(e, sheet.date))
                  .sort(byStartAsc)
                  .map((e) => {
                    const cat = categoryOf(e, team.categories);
                    const timeLabel = isMultiDay(e)
                      ? `${fmtMD(e.date)}〜${fmtMD(eventEndDate(e))}`
                      : e.allDay
                        ? "終日"
                        : fmtTimeRange(e);
                    return (
                      <div
                        key={e.id}
                        className="evcard"
                        style={{ margin: "0 12px 8px", cursor: "pointer" }}
                        onClick={() => setSheet({ type: "eventView", id: e.id })}
                      >
                        <div className="evhead">
                          <span className="evkind" style={{ background: cat.color }}>{cat.label}</span>
                          <span className="evtitle">{e.title}</span>
                          <span className="evopen" style={{ marginLeft: "auto" }}>詳細 ›</span>
                        </div>
                        <div className="evmeta">
                          {timeLabel ? `${timeLabel} ` : ""}
                          {e.place ?? ""}
                        </div>
                      </div>
                    );
                  })
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
            const cat = categoryOf(e, team.categories);
            const multiDay = isMultiDay(e);
            const ongoing = isOngoing(e, todayStr());
            const series = e.seriesId ? team.team.series?.find((x) => x.id === e.seriesId) : undefined;
            const mapQuery = e.address || e.place || "";
            let whenText: string;
            if (multiDay) {
              whenText = `${fmtDate(e.date)}〜${fmtDate(eventEndDate(e))}`;
            } else if (e.allDay) {
              whenText = `${fmtDate(e.date)} 終日`;
            } else {
              whenText = `${fmtDate(e.date)}${fmtTimeRange(e) ? ` ${fmtTimeRange(e)}` : ""}`;
            }
            return (
              <>
                <h2>
                  {e.title}
                  <span style={{ background: cat.color, color: "#ffffff" }}>{cat.label}</span>
                </h2>
                <div className="detail">
                  <div className="dsec">
                    <div className="dline">
                      <E n="calendar" /> {whenText}
                      {ongoing && <span className="ongoing">開催中</span>}
                    </div>
                    {series && (
                      <div className="dline" style={{ fontSize: 12, color: "var(--mut)" }}>
                        <E n="repeat" /> 繰り返し予定（{ruleDesc(series.rule)}）
                      </div>
                    )}
                    {e.place && (
                      <div className="dline">
                        <E n="pin" /> {e.place}
                      </div>
                    )}
                    {e.address && (
                      <div className="dline" style={{ fontSize: 12, color: "var(--mut)" }}>
                        {e.address}
                      </div>
                    )}
                    {e.note && (
                      <div className="dline">
                        <E n="note" /> {e.note}
                      </div>
                    )}
                  </div>
                  {!isCoach && me && (
                    <div className="dsec">
                      <div className="dsec-h">あなたの出欠</div>
                      <MemberAttRow eventId={e.id} playerId={me.id} />
                    </div>
                  )}
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
                {mapQuery && (
                  <div className="mapframe">
                    <iframe
                      src={gmapsEmbedUrl(mapQuery)}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      style={{ border: 0, width: "100%", height: 220, borderRadius: 12 }}
                    />
                  </div>
                )}
                {mapQuery && (
                  <div className="maplinks">
                    <a href={gmapsSearchUrl(mapQuery)} target="_blank" rel="noopener noreferrer">
                      地図で開く
                    </a>
                    <a href={gmapsDirUrl(mapQuery)} target="_blank" rel="noopener noreferrer">
                      経路案内
                    </a>
                  </div>
                )}
                {isCoach && (
                  <>
                    {e.kind === "match" && (
                      <button
                        className="bigbtn"
                        onClick={() =>
                          setSheet({
                            type: "match",
                            prefill: { date: e.date, opponent: opponentFromTitle(e.title) },
                          })
                        }
                      >
                        この試合の結果を記録
                      </button>
                    )}
                    <button
                      className={`bigbtn${e.kind === "match" ? " ghost" : ""}`}
                      onClick={() => setSheet({ type: "event", event: e })}
                    >
                      編集する
                    </button>
                    {e.seriesId ? (
                      <>
                        <button
                          className="bigbtn ghost"
                          style={{ color: "var(--red)" }}
                          onClick={() => {
                            if (window.confirm(`「${e.title}」を削除しますか？（この回のみ）`)) {
                              team.removeEventOnly(e.id);
                              close();
                            }
                          }}
                        >
                          この予定のみ削除
                        </button>
                        <button
                          className="bigbtn ghost"
                          style={{ color: "var(--red)" }}
                          onClick={() => {
                            if (
                              window.confirm(`「${e.title}」以降の繰り返し予定をすべて削除しますか？`)
                            ) {
                              team.removeSeriesFollowing(e);
                              close();
                            }
                          }}
                        >
                          以降すべて削除
                        </button>
                      </>
                    ) : (
                      <button
                        className="bigbtn ghost"
                        style={{ color: "var(--red)" }}
                        onClick={() => {
                          if (window.confirm(`「${e.title}」を削除しますか？`)) {
                            team.removeEventOnly(e.id);
                            close();
                          }
                        }}
                      >
                        削除する
                      </button>
                    )}
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

      {/* 選手プロフィール */}
      <Sheet open={sheet?.type === "playerDetail"} onClose={close}>
        {sheet?.type === "playerDetail" &&
          (() => {
            const p = players.find((x) => x.id === sheet.playerId);
            if (!p) return null;
            const isCaptain = board.state.captain === p.id;
            return (
              <>
                <h2>
                  {p.name}
                  <span>{p.position}</span>
                </h2>
                <div className="detail">
                  <div className="dsec">
                    <div className="dsec-h">基本情報</div>
                    <div className="dline">背番号 {p.number ?? "—"}</div>
                    <div className="dline">ポジション {p.position}</div>
                    <div className="dline">利き足 {footLabel(p.dominantFoot)}</div>
                    {p.height != null && <div className="dline">身長 {p.height}cm</div>}
                    {p.weight != null && <div className="dline">体重 {p.weight}kg</div>}
                    {p.email && <div className="dline">{p.email}</div>}
                    {isCaptain && <div className="dline">キャプテン (C)</div>}
                  </div>
                  {p.injuries && p.injuries.length > 0 && (
                    <div className="dsec">
                      <div className="dsec-h">怪我の記録</div>
                      {p.injuries.map((inj) => (
                        <div key={inj.id} className="dline">
                          {fmtDate(inj.date)} {inj.area} {INJURY_STATUS_LABEL[inj.status]}
                        </div>
                      ))}
                    </div>
                  )}
                  {p.fitness && p.fitness.length > 0 && (
                    <div className="dsec">
                      <div className="dsec-h">体力測定</div>
                      {p.fitness.map((f) => (
                        <div key={f.id} className="dline">
                          {f.name} {f.value}（{fmtDate(f.date)}）
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {isCoach && (
                  <>
                    <button className="bigbtn" onClick={() => setSheet({ type: "playerForm", player: p })}>
                      編集する
                    </button>
                    <button
                      className="bigbtn ghost"
                      onClick={() => {
                        board.setCaptain(isCaptain ? null : p.id);
                      }}
                    >
                      {isCaptain ? "キャプテンを解除" : "キャプテンにする"}
                    </button>
                    <button
                      className="bigbtn ghost"
                      style={{ color: "var(--red)" }}
                      onClick={() => {
                        if (window.confirm(`${p.name}を名簿から削除しますか？出欠の回答も削除されます`)) {
                          board.deletePlayer(p.id);
                          team.removePlayerAnswers(p.id);
                          if (team.viewer.memberPlayerId === p.id) team.setViewer("coach", null);
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

      {/* 選手フォーム（新規追加・編集） */}
      <Sheet open={sheet?.type === "playerForm"} onClose={close}>
        <h2>{pf ? "選手を編集" : "選手を追加"}</h2>
        <div className="formfield">
          <label>名前</label>
          <input value={pfName} onChange={(e) => setPfName(e.target.value)} placeholder="例）山田 太郎" />
        </div>
        <div className="formrow">
          <div className="formfield">
            <label>背番号</label>
            <input
              type="number"
              value={pfNumber}
              onChange={(e) => setPfNumber(e.target.value)}
              placeholder="未設定可"
            />
          </div>
          <div className="formfield">
            <label>ポジション</label>
            <select value={pfPosition} onChange={(e) => setPfPosition(e.target.value as Position)}>
              {ALL_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="formrow">
          <div className="formfield">
            <label>身長（cm）</label>
            <input
              type="number"
              value={pfHeight}
              onChange={(e) => setPfHeight(e.target.value)}
              placeholder="未設定可"
            />
          </div>
          <div className="formfield">
            <label>体重（kg）</label>
            <input
              type="number"
              value={pfWeight}
              onChange={(e) => setPfWeight(e.target.value)}
              placeholder="未設定可"
            />
          </div>
        </div>
        <div className="formfield">
          <label>利き足</label>
          <select value={pfFoot} onChange={(e) => setPfFoot(e.target.value as "" | DominantFoot)}>
            <option value="">未設定</option>
            <option value="right">右足</option>
            <option value="left">左足</option>
            <option value="both">両足</option>
          </select>
        </div>
        <div className="formfield">
          <label>メール（任意）</label>
          <input value={pfEmail} onChange={(e) => setPfEmail(e.target.value)} placeholder="ログイン用メール" />
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            const nm = pfName.trim();
            if (!nm) {
              board.toast("名前を入力してください");
              return;
            }
            const number = pfNumber.trim() === "" ? null : parseInt(pfNumber, 10);
            const height = pfHeight.trim() === "" ? undefined : parseFloat(pfHeight);
            const weight = pfWeight.trim() === "" ? undefined : parseFloat(pfWeight);
            const dominantFoot = pfFoot === "" ? undefined : pfFoot;
            const email = pfEmail.trim() || undefined;
            if (pf) {
              board.updatePlayer({
                ...pf,
                name: nm,
                number,
                position: pfPosition,
                height,
                weight,
                dominantFoot,
                email,
              });
            } else {
              board.addPlayer({
                name: nm,
                number,
                position: pfPosition,
                height,
                weight,
                dominantFoot,
                email,
              });
            }
            close();
          }}
        >
          保存する
        </button>
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
