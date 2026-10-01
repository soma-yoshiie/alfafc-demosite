"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type {
  AttendanceStatus,
  CalFilter,
  Competition,
  EventCategory,
  EventSquad,
  FitnessTest,
  GoalOrigin,
  Group,
  LeagueRow,
  LeagueTable,
  MatchConceded,
  MatchGoal,
  MatchRecord,
  MatchSub,
  Player,
  Position,
  RecurrenceRule,
  TeamEvent,
  TeamEventKind,
  TeamGroup,
} from "@/lib/types";
import { gradeLabel, GOAL_ORIGIN_LABELS, INJURY_STATUS_LABEL, STAGE_GRADES } from "@/lib/types";
import { groupOf } from "@/lib/formations";
import { buildEventSquad } from "@/lib/squad";
import { computeStandings, leaguePositionOf, type Standing } from "@/lib/sampleLeague";
import {
  addDays,
  byStartAsc,
  calEventVisible,
  categoryOf,
  diffDays,
  eventEndDate,
  gmapsDirUrl,
  gmapsEmbedUrl,
  gmapsSearchUrl,
  isAllTargets,
  isMultiDay,
  isOngoing,
  isUpcomingOrOngoing,
  occursOn,
  placeHistory,
  targetLabel,
} from "@/lib/calendarUtils";
import {
  loadCalFilter,
  loadCalSideOpen,
  loadGroupFilter,
  loadLastEventCategory,
  loadRecSideOpen,
  loadRosSideOpen,
  saveCalFilter,
  saveCalSideOpen,
  saveGroupFilter,
  saveLastEventCategory,
  saveRecSideOpen,
  saveRosSideOpen,
} from "@/lib/storage";
import { localDateStr } from "@/lib/dates";
import { matchInPeriod, REC_PERIOD_OPTIONS, type RecPeriod } from "@/lib/matchPeriod";
import { eventOfMatch, isResultOnlyEvent, matchOfEvent } from "@/lib/matchEvents";
import { attendanceRate } from "@/lib/teamStats";
import { aggregateTech, matchSummary, perMatchTech, perPlayerTech } from "@/lib/teamStatsAgg";
import {
  DRIBBLE_PCT_MIN_ATTEMPTS,
  PASS_PCT_MIN_ATTEMPTS,
  rankings,
  SHOT_PCT_MIN_ATTEMPTS,
} from "@/lib/playerStats";
import type { AttPeriod } from "@/lib/attendanceStats";
import { groupAttendance, monthlyAttendance, perPlayerAttendance, periodStartDate } from "@/lib/attendanceStats";
import {
  ALL_TARGETS_COLOR,
  COLOR_CHOICES,
  eventTargetsPlayer,
  groupColorOf,
  matchTargetLabel,
  matchTargetsGroup,
  playerInGroup,
  resolveFilterGroup,
  resolveFilterGroups,
} from "@/lib/groups";
import { renderCalendarListPng } from "@/lib/exportCalendar";
import { downloadDataUrl } from "@/lib/exportImage";
import { LineChart } from "./Charts";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import { IconDownload, IconEdit, IconFilter, IconPlus, IconTrash } from "./icons";
import { GroupChips, useGroupFilter } from "./GroupChips";
import { MobileHeader, MobileHeaderAction } from "./MobileHeader";
import { MobileSegments } from "./MobileSegments";
import ChatHome, { useChatHeaderAction } from "./ChatHome";
import PlayerHub from "./PlayerHub";
import { MatchHub } from "./MatchHub";
import type { MatchHubSection } from "./MatchHub";
import { PlayerBasicForm } from "./hub/PlayerBasicForm";
import type { PlayerFormDraft } from "./hub/PlayerBasicForm";
import type { HubSection } from "./hub/common";
import { LastUpdated } from "./hub/common";

/** PC(マスター・ディテール発火幅)判定のブレークポイント。ChatScreen.tsx / ConsoleScreens.tsx と同じ値 */
const PC_MQ = "(min-width: 1024px)";

/** 新しいカテゴリの色の既定値（calendar-plan-a §11-3「新規の既定はブルー」） */
const DEFAULT_CATEGORY_COLOR = COLOR_CHOICES.find((p) => p.name === "ブルー")!.color;

/**
 * PC幅かどうかを追跡するフック（components/CoachLab/CoachLabParts.tsx useIsPc() と同じ手法）。
 * 左ペインに新規追加する「サマリー行」など、モバイルでは描画してはいけないPC専用DOMの
 * 出し分けに使う（クリック分岐自体は各所で window.matchMedia を直接判定する）。
 */
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

const WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return s;
  const dt = new Date(y, m - 1, d);
  return `${m}/${d}(${WD[dt.getDay()]})`;
}
/** 試合時間の表示（例: 「20分ハーフ」／1本(periods===1)は「40分」）。halfMinutes未設定はnull */
function halfLabel(m: { halfMinutes?: number; periods?: 1 | 2 }): string | null {
  if (!m.halfMinutes) return null;
  return `${m.halfMinutes}分${m.periods === 1 ? "" : "ハーフ"}`;
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
/** board-squad-and-pc-polish §3: メンバー欄のスタメン表示順（GK→DF→MF→FW） */
const SQUAD_ROLE_ORDER: Group[] = ["gk", "df", "mf", "fw"];
function squadRoleOrder(role: string): number {
  const idx = SQUAD_ROLE_ORDER.indexOf(groupOf(role as Position));
  return idx === -1 ? SQUAD_ROLE_ORDER.length : idx;
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

const STATUS_MARK: Record<AttendanceStatus, string> = { yes: "○", maybe: "△", no: "×" };

/**
 * 得点・アシストのランキング集計（試合記録の goals を走査）。
 * MatchesTab(左ペインの統計カード)とRecSummaryPane(右ペインのサマリー)で共有するため
 * ロジックを一本化する（旧: MatchesTab内に閉じていた集計）。上位n件への絞り込みは呼び出し側で行う
 */
function scorerAssisterRanks(matches: MatchRecord[]): {
  scorers: { pid: string; n: number }[];
  assisters: { pid: string; n: number }[];
} {
  const gc: Record<string, number> = {};
  const ac: Record<string, number> = {};
  matches.forEach((m) => {
    m.goals.forEach((g) => {
      gc[g.playerId] = (gc[g.playerId] ?? 0) + 1;
      if (g.assistPlayerId) ac[g.assistPlayerId] = (ac[g.assistPlayerId] ?? 0) + 1;
    });
  });
  const rank = (obj: Record<string, number>) =>
    Object.entries(obj)
      .map(([pid, n]) => ({ pid, n }))
      .sort((a, b) => b.n - a.n);
  return { scorers: rank(gc), assisters: rank(ac) };
}

/** 直近nヶ月(既定6)・月別の試合数/勝率(%)/得点/失点。RecSummaryPaneのKPIタイル×グラフ(kpicard2)専用の集計 */
function matchMonthlyTrend(
  matches: MatchRecord[],
  months = 6
): { label: string; played: number; winPct: number; goals: number; conceded: number }[] {
  const today = todayStr();
  const [ty, tm] = today.split("-").map(Number);
  const rows: { label: string; played: number; winPct: number; goals: number; conceded: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(ty, tm - 1 - i, 1);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const ms = matches.filter((mm) => mm.date.startsWith(ym));
    const wins = ms.filter((mm) => mm.ourScore > mm.theirScore).length;
    const goals = ms.reduce((s, mm) => s + mm.ourScore, 0);
    const conceded = ms.reduce((s, mm) => s + mm.theirScore, 0);
    rows.push({
      label: `${m}月`,
      played: ms.length,
      winPct: ms.length ? Math.round((wins / ms.length) * 100) : 0,
      goals,
      conceded,
    });
  }
  return rows;
}

function Sheet({
  open,
  onClose,
  children,
  pane,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** PC専用: モーダル(scrim/sheet)の代わりに.teammain内の1ペインとして描画する */
  pane?: boolean;
}) {
  if (pane) {
    if (!open) return null;
    return (
      <div className="tmdetail tm-sheetpane">
        <div className="tmback" onClick={onClose}>
          ‹ 戻る
        </div>
        {children}
      </div>
    );
  }
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

// mobile-redesign-v2 §3-1: 「ホーム」タブは廃止（チームを開いたら常にカレンダー）。
// 「att」(出欠)はタブとしては到達不能だが、AttendanceTab自体はPCの都合で残すためTab型にも残す
type Tab = "att" | "cal" | "rec" | "ros" | "chat";

// PC専用コンソールシェルの左レール：タブ帯と同じ項目をサブメニューとしても出すためのアイコン対応
const ICON: Record<Tab, Parameters<typeof E>[0]["n"]> = {
  att: "check",
  cal: "calendar",
  rec: "trophy",
  ros: "users",
  chat: "comment",
};

type SheetState =
  | { type: "event"; event?: TeamEvent; date?: string }
  | { type: "attendance"; eventId: string }
  | { type: "day"; date: string }
  | { type: "eventView"; id: string }
  // カレンダーの絞り込みと色の作り直し（案A §3-2）: スマホヘッダー「絞り込み」から開く
  // 下からのシート。中身はCalFilterPanel（コーチ/選手・保護者共通）
  | { type: "calfilter" }
  | {
      type: "match";
      record?: MatchRecord;
      /** 試合イベントから引き継ぐ初期値（新規記録用）。eventIdはtm-sheetpaneの「戻る」で
          元のeventViewへ復帰するために使う。competitionIdは予定に設定された大会をそのまま初期値へ引き継ぐ */
      prefill?: { date?: string; opponent?: string; eventId?: string; competitionId?: string };
    }
  | { type: "competitions" }
  // Phase D-1(C1-major): 予定フォームからの「＋ 管理」を挟んでも編集中の入力(title/date/
  // evGroupIdsなど)を失わないよう、呼び出し元(from=編集中のev、date=新規時の初期日)を
  // 保持する。sheetKey()で予定フォームと同じキーを返すことでSheetHostの再マウントを防ぎ、
  // paneBack()/モバイルのonCloseで元の予定フォームへ戻す
  | { type: "categories"; from?: TeamEvent; date?: string }
  // groups-everywhere §5: 選手フォームの「グループ」欄「＋ 管理」から開いた場合の戻り先。
  // 予定フォーム経由(from/date)とは別軸のため独立したフィールドにする
  | { type: "groups"; from?: TeamEvent; date?: string; returnToPlayerForm?: Player | null }
  | { type: "playerForm"; player?: Player }
  /** 体力測定の種目管理。個人ページの「種目を管理 ›」から開く（returnTo があれば閉じたとき選手フォームへ戻る） */
  | { type: "fitnessTests"; returnTo?: Player }
  /** p14 §3-3: 順位表の閲覧（スマホ・PCの選手の入口行から。スタッフは「編集する」で league へ） */
  | { type: "leagueView" }
  /** p14 §3-4: 順位表の編集。from:"view" は leagueView から開いた印（閉じたら leagueView へ戻る） */
  | { type: "league"; from?: "view" }
  | null;

/** 試合記録タブ・PC右ペインの選択状態（既定 summary） */
type RecSel = { kind: "summary" } | { kind: "match"; id: string } | { kind: "player"; id: string };
/** 出欠タブ・PC右ペインの選択状態（既定 overview） */
type AttSel = { kind: "overview" } | { kind: "event"; id: string } | { kind: "player"; id: string };

function Inner() {
  const board = useBoard();
  const team = useTeam();
  const players = board.state.players;
  // PC(min-width:1024px)ではシートをモーダルでなく.teammain内のペインとして描画するため、
  // SheetHostの出し分け・.teammainの描画条件で使う
  const pc = usePc();
  // 初期タブ=カレンダー（PC/モバイル共通。mobile-redesign-v2 §3-1: チームを開いたら
  // カレンダーが表示される＝チームの中の「ホーム」は無い）
  const [tab, setTab] = useState<Tab>(() => "cal");
  const [sheet, setSheet] = useState<SheetState>(null);
  // p15 §7: 試合記録フォームに未保存の変更があるか（SheetHost の onMatchDirty が通知する）。
  // フォームを開いたままシートを閉じる・差し替える経路は confirmLeaveMatch を通して「保存せずに終了しますか？」を出す
  const [matchDirty, setMatchDirty] = useState(false);
  const confirmLeaveMatch = () =>
    !(sheet?.type === "match" && matchDirty) || window.confirm("保存せずに終了しますか？");
  // useMemo で作る PC サブナビの onSelect からは、最新の判定を ref 越しに呼ぶ
  const confirmLeaveRef = useRef(confirmLeaveMatch);
  confirmLeaveRef.current = confirmLeaveMatch;
  // カレンダーの表示月・表示モードはタブを跨いで保持する
  const now = new Date();
  const [calYm, setCalYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [calView, setCalView] = useState<"month" | "list">("month");
  // カレンダーの絞り込みと色の作り直し（案A §2）もタブを跨いで保持し、次回起動時も復元する。
  // 旧・単一選択(calGroup)を、コーチの減算型絞り込み(calFilter)に置き換える
  const [calFilter, setCalFilter] = useState<CalFilter>(() => loadCalFilter());
  // 選手・保護者のカレンダー絞り込み（groups-everywhere §3）: 既定「自分の予定」。
  // コーチ向けのcalFilterとは別軸（選手にはグループ絞り込み自体を出さない）。既存のまま保存しない
  const [calMine, setCalMine] = useState(true);
  // Phase D-1(C1-minor)由来: 復元直後は掃除がuseEffect後(=描画1回分遅れ)になるため、
  // 存在しないグループ/種類IDを描画に使う前にここで無効化する派生値を用意する
  // （useEffectのsetCalFilterはlocalStorage掃除用としてそのまま残す）
  const calFilterEff: CalFilter = {
    hiddenGroupIds: calFilter.hiddenGroupIds.filter((id) => team.groups.some((g) => g.id === id)),
    hideAllTargets: calFilter.hideAllTargets,
    hiddenCategoryIds: calFilter.hiddenCategoryIds.filter((id) => team.categories.some((c) => c.id === id)),
  };
  useEffect(() => {
    // 保存済みの非表示グループ・種類に削除済みIDが残っていれば「すべて」側へ戻す
    if (
      calFilter.hiddenGroupIds.length !== calFilterEff.hiddenGroupIds.length ||
      calFilter.hiddenCategoryIds.length !== calFilterEff.hiddenCategoryIds.length
    ) {
      setCalFilter(calFilterEff);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calFilter, team.groups, team.categories]);
  useEffect(() => {
    saveCalFilter(calFilter);
  }, [calFilter]);
  // calendar-plan-a §11-1: PCの絞り込みパネル(.calside)の開閉状態。タブを跨いで保持し
  // （sheetを開いてCalendarTabがアンマウントされても消えないよう）Innerで持つ
  const [calSideOpen, setCalSideOpen] = useState(() => loadCalSideOpen());
  useEffect(() => {
    saveCalSideOpen(calSideOpen);
  }, [calSideOpen]);

  // PC右ペイン(マスター・ディテール)の選択状態。タブを跨いで保持するためInnerで持つ
  const [recSel, setRecSel] = useState<RecSel>({ kind: "summary" });
  const [cmp, setCmp] = useState<string>("all"); // 試合記録の大会フィルタ（左右ペイン共有のためInnerへ）
  // p15 §2: 試合記録の期間の絞り込み（大会 cmp と同じ扱い＝保存しない。左右ペインで共有するため Inner へ）
  const [recPeriod, setRecPeriod] = useState<RecPeriod>("all");
  // Inner保持化でタブを跨いで残るようになったため、選択中の大会が削除されたら「すべて」へ戻す
  // （どのチップもonにならないまま一覧だけ絞られる状態を防ぐ）
  useEffect(() => {
    if (cmp !== "all" && cmp !== "none" && !team.team.competitions.some((c) => c.id === cmp)) {
      setCmp("all");
    }
    // 「その他」該当試合が0件になるとselectに一致optionが無くなり空欄表示になるため「すべて」へ戻す
    if (cmp === "none" && !team.team.matches.some((m) => !m.competitionId)) {
      setCmp("all");
    }
  }, [cmp, team.team.competitions, team.team.matches]);
  // groups-phase2 §3-3: 試合記録のグループ絞り込み（単一選択。大会フィルタと同じくInnerへ持ち上げ、
  // 左右ペイン(MatchesTab/RecSummaryPane)で共有する）。保存済みIDが削除済みなら「すべて」とみなす
  // （calFilterEffと同じ作法）
  const [matchGroupIds, setMatchGroupIds] = useGroupFilter("matches");
  const matchGroupEff = resolveFilterGroup(matchGroupIds, team.groups)?.id ?? null;
  useEffect(() => {
    if (matchGroupIds.length > 0 && !matchGroupEff) setMatchGroupIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchGroupIds, matchGroupEff]);
  const [rosSel, setRosSel] = useState<string | null>(null);
  // player-hub §2-1: 名簿の絞り込み（学年／グループ＝useGroupFilter("roster")の単一選択、ポジション区分、状態）。
  // スマホは選手を選ぶと個人ページを全画面で開いて RosterTab がアンマウントされるため、検索語・絞り込み・
  // 個人ページのセクションも Inner で持つ（PC は一覧と個人ページが並ぶので、選手を替えても同じセクションのまま）
  const [rosQ, setRosQ] = useState("");
  const [rosPos, setRosPos] = useState<RosPos>("all");
  const [rosStatus, setRosStatus] = useState<RosStatus>("all");
  const [rosGroupIds, setRosGroupIds] = useGroupFilter("roster");
  // 保存済みIDが削除済みなら「すべて」とみなす（試合記録の matchGroupEff と同じ作法）
  const rosGroup = resolveFilterGroup(rosGroupIds, team.groups);
  const rosGroupEff = rosGroup?.id ?? null;
  useEffect(() => {
    if (rosGroupIds.length > 0 && !rosGroupEff) setRosGroupIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosGroupIds, rosGroupEff]);
  const [rosSection, setRosSection] = useState<HubSection>("overview");
  // PCの絞り込み列(.rosside)の開閉（既定＝開いている）。スマホの絞り込みシートの開閉は rosFilterSheet
  const [rosSideOpen, setRosSideOpen] = useState(() => loadRosSideOpen());
  useEffect(() => {
    saveRosSideOpen(rosSideOpen);
  }, [rosSideOpen]);
  const [rosFilterSheet, setRosFilterSheet] = useState(false);
  // p14 §2-2: 試合記録の絞り込み（PCの列 .rosside の開閉＝既定で開く／スマホのシートの開閉）。
  // 絞り込みの状態そのもの(cmp / matchGroupIds)は上の試合記録の state を使う
  const [recSideOpen, setRecSideOpen] = useState(() => loadRecSideOpen());
  useEffect(() => {
    saveRecSideOpen(recSideOpen);
  }, [recSideOpen]);
  const [recFilterSheet, setRecFilterSheet] = useState(false);
  // p14 §5-2: 試合の詳細（MatchHub）。スマホとPCの選手・保護者で開いている試合のid（PCのスタッフは右ペインの recSel を使う
  // ので常に null）と、詳細のセクション。一覧⇄詳細のスクロール位置（スマホ）は名簿と同じ作法で recListTop に覚える
  const [recOpen, setRecOpen] = useState<string | null>(null);
  const [recSection, setRecSection] = useState<MatchHubSection>("overview");
  // レビュー nav-1: スマホで試合の詳細（メンバー）から選手の個人ページへ移ったときの戻り先
  const [rosBack, setRosBack] = useState<{ id: string; section: MatchHubSection } | null>(null);
  const recListTop = useRef(0);
  // スマホの一覧⇄個人ページは同じ .scroll を使い回すので、一覧の位置を覚えておく（戻ったとき同じ位置へ）
  const rosScrollRef = useRef<HTMLDivElement>(null);
  const rosListTop = useRef(0);
  const [attSel, setAttSel] = useState<AttSel>({ kind: "overview" });
  const [attPeriod, setAttPeriod] = useState<AttPeriod>("all");

  const isCoach = team.viewer.role === "coach";
  const me = team.viewer.memberPlayerId
    ? players.find((p) => p.id === team.viewer.memberPlayerId) ?? null
    : null;

  // 名簿は表示中のロールに合わせる（選手プレビュー時は隠して見え方を揃える）
  const showRos = isCoach && board.auth.role === "coach";
  // mobile-redesign-v2 §3-1: tabsの生成をpcで分岐する。PCはタブ帯自体が非表示
  // （.teamapp .fbar{display:none}）のため実質不変。ホームタブはHomeTab削除に伴い
  // PC/モバイル両方の配列から外す（出欠はPC専用のサブメニュー入口として残す）。
  // モバイルは新しい配列（カレンダー/試合記録/名簿(スタッフのみ)/チャット）にする。
  // 並び替えは各配列の並びを変えるだけで済む
  let tabs: [Tab, string][];
  if (pc) {
    tabs = [];
    // 出欠はスタッフ専任（選手・選手プレビューには出さない）
    if (isCoach) tabs.push(["att", "出欠"]);
    tabs.push(["cal", "カレンダー"], ["rec", "試合記録"]);
    if (showRos) tabs.push(["ros", "名簿"]);
    // notebook-staff-redesign §1: PC のチーム運営から「お知らせ」を外す（お知らせはチャットの
    // 中にあるため。PC のチャットはレールの「チャット」だけ）。スマホは下部タブ「チーム」→
    // セグメント「チャット」が唯一の入口なので下の else 側は変えない
  } else {
    tabs = [["cal", "カレンダー"], ["rec", "試合記録"]];
    if (showRos) tabs.push(["ros", "名簿"]);
    tabs.push(["chat", "チャット"]);
  }
  const activeTab: Tab = tabs.some(([t]) => t === tab) ? tab : "cal";
  // player-hub §2-1: スマホは名簿で選手を選ぶと個人ページを全画面で開く（rosSel）。チーム運営のヘッダーと
  // セグメントは出さず、ハブ自身のヘッダー（選手名＋戻る）だけにする。PCは絞り込み列(.rosside)を
  // 名簿・試合記録タブのときに左に足す（p14 §2-2。開いているとき。畳んでいる間は一覧の「絞り込み」ボタンで戻す）
  const rosFull = !pc && showRos && activeTab === "ros" && !!rosSel;
  const rosSideOn = pc && showRos && activeTab === "ros" && rosSideOpen;
  // p14 §2-2: 試合記録の絞り込み。選手で非公開(!isCoach && !matchesPublic)のときは絞り込みごと出さない。
  // PC専用の第2ペイン(.teammain)を出す条件・シートをインラインで出す条件は、下の return 内の IIFE から
  // ここへ出した（recSideOn が sheetInline を使うため）
  const recVisible = isCoach || board.matchesPublic;
  // p15 §2: 期間が all 以外でも「絞っている」。期間は常に出るので、p14 の recHasFilter（絞る対象が無いとき列を出さない判定）は無くした
  const recFilterOn = cmp !== "all" || !!matchGroupEff || recPeriod !== "all";
  const hasOther = team.team.matches.some((m) => !m.competitionId);
  const showTeammain = pc && isCoach && (activeTab === "rec" || activeTab === "ros" || activeTab === "att");
  const sheetInTeammain = showTeammain && sheet != null;
  // showTeammain対象外(home/calタブ、または選手ロール)でsheetが開いているときは、
  // .scroll内のタブ本体を出さず、代わりにSheetHost(pane)を.scroll直下に全幅表示する
  const sheetInline = pc && sheet != null && !sheetInTeammain;
  // p14 §5-2: 詳細を開いている間（PCの選手・保護者）は絞り込み列を出さない
  const recSideOn = pc && activeTab === "rec" && recSideOpen && recVisible && !sheetInline && !recOpen;
  // p14 §5-2: スマホは試合の詳細を全画面で開く（名簿の rosFull と同じ。非公開の選手は recOpen を無視して鍵メッセージ）
  const recFull = !pc && activeTab === "rec" && recVisible && !!recOpen;
  // PCの選手・保護者は .scroll の中身を詳細に差し替える。recDetail＝一覧の代わりに詳細を出している（スマホ／PCの選手）
  const recPcOpen = pc && !isCoach && activeTab === "rec" && recVisible && !!recOpen;
  const recDetail = recFull || recPcOpen;
  const recMatch = recOpen ? team.team.matches.find((x) => x.id === recOpen) : undefined;
  const rosPlayer = rosSel ? players.find((p) => p.id === rosSel) : undefined;
  const rosFilterOn = !!rosGroup || rosPos !== "all" || rosStatus !== "all";
  const pickRos = (id: string) => {
    setRosBack(null);
    if (!pc) {
      rosListTop.current = rosScrollRef.current?.scrollTop ?? 0;
      setRosSection("overview");
    }
    setRosSel(id);
  };
  // PC幅になったらスマホの絞り込みシートは閉じる（PCは左の .rosside を使う）
  useEffect(() => {
    if (pc) {
      setRosFilterSheet(false);
      setRosBack(null);
    }
  }, [pc]);
  // p14 §2-2: 試合記録の絞り込みシートも同じ（PCは左の .rosside を使う）
  useEffect(() => {
    if (pc) setRecFilterSheet(false);
  }, [pc]);
  // スマホの一覧⇄個人ページ：個人ページは先頭から、一覧へ戻ったら開く前の位置へ
  useEffect(() => {
    const el = rosScrollRef.current;
    // p14 §5-2: rosScrollRef は試合の詳細(recFull)と共用。他方のタブへ移った拍子の変化では位置を触らない
    if (!rosFull && activeTab !== "ros") return;
    if (el) el.scrollTop = rosFull ? 0 : rosListTop.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosFull]);
  // p14 §5-2: 試合の詳細も同じ。詳細は先頭から、一覧へ戻ったら開く前の位置へ
  // （レビュー tsx-1: PCの選手・保護者の差し替え表示も同じ扱いにするため recFull でなく recDetail を見る）
  useEffect(() => {
    const el = rosScrollRef.current;
    if (!recDetail && activeTab !== "rec") return;
    if (el) el.scrollTop = recDetail ? 0 : recListTop.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recDetail]);
  // p14 §5-2: スマホで開いた詳細のままPC幅になったスタッフは、右ペインの詳細（recSel）へ変換する
  useEffect(() => {
    if (pc && isCoach && recOpen) {
      setRecSel({ kind: "match", id: recOpen });
      setRecOpen(null);
    }
  }, [pc, isCoach, recOpen]);
  // mobile-redesign-v2 §3-3: 右のヘッダーアクション（タブ連動で1つだけ・スタッフのみ）。
  // PCのヘッダーCTA(.teamcta)と同じ対象・同じラベルにする。
  // Phase D-1(C2 major): ログインロール(board.auth.role)だけでなく閲覧ロール(isCoach=
  // team.viewer.role==="coach")も見る。選手プレビュー中はスタッフ操作を出さない
  // chat-plan-a §3-5: チャットタブのアクションは「お知らせ｜メッセージ」の選択に連動する
  // （お知らせ＝「お知らせを送る」／メッセージ＝「新しいメッセージ」。どちらも board シートで開く）
  const chatAction = useChatHeaderAction(isCoach && board.auth.role === "coach");
  const headerAction: { label: string; onClick: () => void } | null =
    !isCoach || board.auth.role !== "coach"
      ? null
      : activeTab === "cal"
        ? { label: "予定を追加", onClick: () => setSheet({ type: "event" }) }
        : activeTab === "rec"
          ? { label: "試合結果を記録", onClick: () => setSheet({ type: "match" }) }
          : activeTab === "ros"
            ? { label: "選手を追加", onClick: () => setSheet({ type: "playerForm" }) }
            : activeTab === "chat"
              ? chatAction
              : null;
  // カレンダーの絞り込みと色の作り直し（案A §3-2）: カレンダータブのときだけスマホヘッダーに
  // 「絞り込み」を出す（コーチ・選手/保護者どちらも。プレビュー中の閲覧ロールisCoachで出し分ける）。
  // コーチは「絞り込み」→「＋予定を追加」の順、選手は「絞り込み」だけになるようheaderActionの前に置く
  const showCalFilterAction = activeTab === "cal";
  // p14 §2-2: 試合記録タブのときも「絞り込み」を出す（recVisible のときだけ。絞り込み→＋の順）
  const showRecFilterAction = activeTab === "rec" && recVisible;
  const calFilterHasHidden = isCoach
    ? calFilterEff.hiddenGroupIds.length > 0 ||
      calFilterEff.hideAllTargets ||
      calFilterEff.hiddenCategoryIds.length > 0
    : calFilterEff.hiddenCategoryIds.length > 0 || calMine;

  // PC専用コンソールシェルの左レール：チーム運営項目の直下にタブ帯と同じ一覧を出す。
  // レールはスクリム(left:208px)の外にあるため、シートを開いたままタブ切替できてしまう。
  // 従来(画面内タブ帯)はスクリム配下で切替不可能だった挙動に合わせ、切替時にシートを閉じる
  // PCサブメニューは「ホーム」「出欠」を出さず、カレンダー/試合記録/名簿/連絡の順で登録する。
  // 出欠タブ自体（AttendanceTab等）は削除せず残すが、PCでの入口はカレンダーの予定詳細
  // 「記録を見る・編集」経由のみに一本化する（タブとしての入口だけを外す）
  // notebook-staff-redesign §1: PC のサブナビは「お知らせ」(chat)を持たない
  const subnavTabs: Tab[] = ["cal", "rec", "ros"];
  const consoleSubnav = useMemo(
    () => ({
      anchor: "team" as const,
      items: subnavTabs
        .filter((t) => tabs.some(([tt]) => tt === t))
        .map((t) => {
          const label = tabs.find(([tt]) => tt === t)![1];
          return {
            key: t,
            label,
            icon: <E n={ICON[t]} />,
            on: activeTab === t,
            onSelect: () => {
              // p15 §7: 試合記録フォームが未保存のまま別のタブへ移るときは確認する
              if (!confirmLeaveRef.current()) return;
              setSheet(null);
              setRecOpen(null);
              setTab(t);
            },
          };
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, isCoach, board.auth.role]
  );
  useConsoleSubnav(consoleSubnav);

  // 保険effect: モバイル経路でシートが開いた状態のままPC幅になった場合、
  // 対応する右ペインの選択stateへ変換してシートを閉じる（ChatScreen.tsx 36-56 の教訓に倣う）。
  // 対応タブを表示中でない場合は変換しない（p14 §5: 試合の詳細はシートでなくなったので recOpen 側の effect で変換）
  useEffect(() => {
    if (!isCoach || typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const sync = () => {
      if (!mql.matches) return;
      if (sheet?.type === "attendance" && activeTab === "att") {
        setAttSel({ kind: "event", id: sheet.eventId });
        setSheet(null);
      }
    };
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, [isCoach, sheet, activeTab]);

  // teamIntent消費: 他画面からの「チームHubのこのタブ・選手を開く」という遷移指示を反映する。
  // コーチが選手プレビュー中(team.viewer.role!=="coach")にros/attを指すintentが来た場合、
  // そのままではタブがコーチ専任のため出ずcalに丸められてしまう。先にスタッフ表示へ戻す。
  // 選手ログイン(board.auth.role!=="coach")でros等が来た場合はtabsに無く自然にcalへ丸まる
  // だけなので、intentを破棄する以上の特別処理はしない(現状維持)
  useEffect(() => {
    const intent = board.teamIntent;
    if (!intent) return;
    // viewer復帰ロジックはros(名簿)のみ残す。att(出欠)はPCでタブの入口が無くなったため対象から外す
    if (board.auth.role === "coach" && team.viewer.role !== "coach" && intent.tab === "ros") {
      team.setViewer("coach", null);
    }
    // home/attのintentはPC・モバイルどちらでもカレンダーへ丸める（mobile-redesign-v2 §3-1）
    const targetTab: Tab = intent.tab === "att" || intent.tab === "home" ? "cal" : intent.tab;
    setTab(targetTab);
    // p14 §5-2: teamIntent で来たときも試合の詳細は閉じる
    setRecOpen(null);
    setRosBack(null);
    // 個人ページはPC・スマホとも開く（スマホは全画面）。他画面から来たときは「基本」から
    if (intent.playerId) {
      setRosSel(intent.playerId);
      setRosSection("overview");
    }
    if (intent.eventId) setSheet({ type: "eventView", id: intent.eventId });
    // p14 §1-1: サッカーノートの「絞り込みを編集…」からグループ管理を開く
    if (intent.openGroups) setSheet({ type: "groups" });
    board.setTeamIntent(null);
  }, [board.teamIntent, board.setTeamIntent, board.auth.role, team.viewer.role, team.setViewer]);

  // player-hub §2-1: 絞り込みの中身（PCの左列 .rosside とスマホのシートで同じ部品）と、個人ページ（PCは右ペイン、
  // スマホは全画面）。編集は右上の小さなボタン → 選手フォーム(playerForm)、「種目を管理 ›」は fitnessTests シート
  const rosFilterPanel = (
    <RosterFilterPanel
      groups={team.groups}
      groupId={rosGroupEff}
      onGroup={(id) => setRosGroupIds(id ? [id] : [])}
      pos={rosPos}
      onPos={setRosPos}
      status={rosStatus}
      onStatus={setRosStatus}
      onManageGroups={() => {
        setRosFilterSheet(false);
        setSheet({ type: "groups" });
      }}
    />
  );
  // p14 §2-2: 試合記録の絞り込みの中身（PCの左列 .rosside とスマホのシートで同じ部品）。
  // 「大会を登録・管理…」「絞り込みを編集…」はスタッフだけ。スマホはシートを閉じてから管理シートを開く
  const recFilterPanel = (
    <RecFilterPanel
      comps={team.team.competitions}
      hasOther={hasOther}
      cmp={cmp}
      onCmp={setCmp}
      period={recPeriod}
      onPeriod={setRecPeriod}
      groups={team.groups}
      groupId={matchGroupEff}
      onGroup={(id) => setMatchGroupIds(id ? [id] : [])}
      onManageCompetitions={
        isCoach
          ? () => {
              // p15 レビュー: 試合記録フォームが未保存なら確認（PC は列を出したままフォームを開ける）
              if (!confirmLeaveMatch()) return;
              setRecFilterSheet(false);
              setSheet({ type: "competitions" });
            }
          : undefined
      }
      onManageGroups={
        isCoach
          ? () => {
              if (!confirmLeaveMatch()) return;
              setRecFilterSheet(false);
              setSheet({ type: "groups" });
            }
          : undefined
      }
    />
  );
  // p14 §2-3 / §5-2: 一覧の行を押したとき。PCのスタッフ＝右ペインの詳細、それ以外＝一覧の位置を覚えて詳細を開く
  // （スマホは全画面 recFull、PCの選手・保護者は .scroll の差し替え）。どちらも「基本」から
  const onOpenMatch = (id: string) => {
    if (pc && isCoach) {
      setRecSel({ kind: "match", id });
    } else {
      recListTop.current = rosScrollRef.current?.scrollTop ?? 0;
      setRecOpen(id);
    }
    setRecSection("overview");
  };
  // p15 §6-5: 予定の詳細の「試合記録を開く」。シートを閉じ、試合記録タブでその試合の詳細を開く
  // （PC のスタッフ＝右ペイン、それ以外＝recOpen。PC のカレンダータブではシートが .scroll 内にインラインで出ている）
  const openMatchFromEvent = (id: string) => {
    setSheet(null);
    setTab("rec");
    onOpenMatch(id);
    // p15 レビュー: onOpenMatch が覚えるのはカレンダーのスクロール位置なので、戻ったときの一覧は先頭から
    recListTop.current = 0;
  };
  // p15 §7: シートを開く・差し替える操作（PC ヘッダーの CTA）。試合記録フォームが未保存なら確認し、
  // 開こうとしているシートが今と同じキー（同じフォームのまま）なら何もしない
  const openSheet = (next: SheetState) => {
    if (sheet?.type === "match" && next && sheetKey(next) === sheetKey(sheet)) return;
    if (!confirmLeaveMatch()) return;
    setSheet(next);
  };
  // p15 §7: PC で試合記録フォームを開いたまま左の一覧の行・「チーム全体のサマリー」を選ぶとき。
  // 確認を通し、OK ならフォームを閉じてから切り替える（閉じないと右ペインがフォームのまま変わらない）
  const leaveMatchForm = () => {
    if (sheet?.type !== "match") return true;
    if (!confirmLeaveMatch()) return false;
    setSheet(null);
    return true;
  };
  const recHubEdit = () => recMatch && setSheet({ type: "match", record: recMatch });
  const rosHub = rosSel ? (
    <PlayerHub
      key={rosSel}
      playerId={rosSel}
      viewer="staff"
      nav="inline"
      section={rosSection}
      onSection={setRosSection}
      onEditBasic={() => rosPlayer && setSheet({ type: "playerForm", player: rosPlayer })}
      onDeleted={() => setRosSel(null)}
      onManageFitnessTests={() => setSheet({ type: "fitnessTests" })}
    />
  ) : null;

  return (
    <div className={`app teamapp${rosSideOn || recSideOn ? " rosside-open" : ""}`}>
      {pc ? (
        <header>
          {/* board-squad-and-pc-polish §1: 左にレール(.conrail)があるため「‹ ホーム」は不要 */}
          <div className="brand">
            <div className="logo">
              {board.auth.role === "coach" ? (
                <>
                  チーム<b>運営</b>
                </>
              ) : (
                "チーム"
              )}
            </div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {board.state.teamName ?? "マイチーム"}
            </div>
          </div>
          {/* 右上CTAはタブ連動(PC専用・.teamctaはモバイル基底でdisplay:none):
              カレンダー=予定を追加 / 試合記録=試合結果を記録 / 名簿=新規選手を追加。
              他タブでは出さない（notebook-staff-redesign §1: PC の「お知らせ」タブ廃止に伴い
              「＋ お知らせを送る」も外した。スマホのチャットのアクションは MobileHeader 側） */}
          {board.auth.role === "coach" && activeTab === "cal" && (
            <button className="teamcta" type="button" onClick={() => openSheet({ type: "event" })}>
              ＋ 予定を追加
            </button>
          )}
          {board.auth.role === "coach" && activeTab === "rec" && (
            <button className="teamcta" type="button" onClick={() => openSheet({ type: "match" })}>
              ＋ 試合結果を記録
            </button>
          )}
          {board.auth.role === "coach" && activeTab === "ros" && (
            <button className="teamcta" type="button" onClick={() => openSheet({ type: "playerForm" })}>
              ＋ 新規選手を追加
            </button>
          )}
        </header>
      ) : rosFull ? (
        <MobileHeader
          title={rosPlayer?.name ?? "選手"}
          onBack={() => {
            setRosSel(null);
            // レビュー nav-1: 試合の詳細（メンバー）から来たときは、その試合の同じセクションへ戻る
            if (rosBack) {
              setTab("rec");
              setRecOpen(rosBack.id);
              setRecSection(rosBack.section);
              setRosBack(null);
            }
          }}
        />
      ) : recFull ? (
        // p14 §5-2: 試合の詳細の全画面。絞り込み・＋のアクションは出さない
        <MobileHeader title={recMatch ? `vs ${recMatch.opponent}` : "試合記録"} onBack={() => setRecOpen(null)} />
      ) : (
        // mobile-redesign-v2 §3-3: タイトルは変更なし。右のアクションはタブ連動で
        // headerAction(スタッフのみ)1つだけだったが、案A §3-2でカレンダータブのときだけ
        // 「絞り込み」を先頭に足す（コーチは絞り込み→＋の順、選手は絞り込みだけ）。
        // 下部タブ「チーム」の直下画面のため戻るは出さない
        <MobileHeader
          title={board.auth.role === "coach" ? "チーム運営" : "チーム"}
          actions={
            (showCalFilterAction || showRecFilterAction || headerAction) && (
              <>
                {showCalFilterAction && (
                  <MobileHeaderAction label="絞り込み" onClick={() => setSheet({ type: "calfilter" })}>
                    <IconFilter />
                    {calFilterHasHidden && <span className="dot" />}
                  </MobileHeaderAction>
                )}
                {showRecFilterAction && (
                  <MobileHeaderAction label="絞り込み" onClick={() => setRecFilterSheet(true)}>
                    <IconFilter />
                    {recFilterOn && <span className="dot" />}
                  </MobileHeaderAction>
                )}
                {headerAction && (
                  <MobileHeaderAction primary label={headerAction.label} onClick={headerAction.onClick}>
                    <IconPlus />
                  </MobileHeaderAction>
                )}
              </>
            )
          }
        />
      )}

      {pc ? (
        // PCのrolebarは変更しない
        board.auth.role === "coach" ? (
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
              {isCoach ? "全員を管理" : `${me?.name ?? "選手"} として閲覧`}
            </span>
          </div>
        ) : (
          <div className="rolebar">
            <span className="rolehint" style={{ textAlign: "left", flex: 1 }}>
              {me?.name ?? "選手"} さんとして閲覧できます
            </span>
          </div>
        )
      ) : (
        // mobile-redesign-v2 §3-3: スマホでは通常時のrolebarは出さない。選手として閲覧中
        // だけセグメントの上に帯を出す（戻すボタンで復帰。名簿タブの「選手・保護者の見え方を
        // 確認」からこの状態に入る）。選手ログイン時の帯（「〇〇さんとして閲覧できます」）は
        // スマホでは出さない
        !isCoach &&
        board.auth.role === "coach" && (
          <div className="mrolebanner">
            <span>{me?.name ?? "選手"}さんとして閲覧中</span>
            <button type="button" onClick={() => team.setViewer("coach", null)}>
              スタッフ表示に戻す
            </button>
          </div>
        )
      )}

      {/* mobile-redesign §1-7: 既存の上部タブ帯を.mseg様式に統一（PCでは従来どおり.fbar自体が非表示） */}
      {!rosFull && !recFull && (
        <MobileSegments
          wrapClassName="fbar"
          ariaLabel="チーム運営の表示切替"
          items={tabs.map(([t, label]) => ({
            key: t,
            label,
            on: activeTab === t,
            onSelect: () => {
              setRecOpen(null);
              setTab(t);
            },
          }))}
        />
      )}

      {/* PC専用の第2ペインを出す(=グリッドが発火する)のは、元来の3ペイン構成である
          コーチのrec/ros/attタブのみ。それ以外(home/calタブ・選手ロール)でsheetを開くと
          グリッドが破綻するため、そちらは.scroll直下の全幅表示(画面切替方式)へ回す */}
      {(() => {
        // showTeammain / sheetInTeammain / sheetInline は p14 §2-2 で Inner の上へ移した（recSideOn が使う）
        return (
          <>
            {/* paddingは基底CSS(.teamapp .scroll)へ移設（PCで上書きできるように） */}
            {/* player-hub §2-1: 名簿タブのPCだけ、一覧(.scroll)の左に絞り込み列を置く（.scroll の外の兄弟。
                PC reset の .teamapp.rosside-open:has(.teammain) が 3 列グリッドにする） */}
            {rosSideOn && (
              <aside className="rosside" aria-label="選手の絞り込み">
                <button type="button" className="rosside-hide" onClick={() => setRosSideOpen(false)}>
                  ‹ 絞り込みを隠す
                </button>
                {rosFilterPanel}
              </aside>
            )}
            {/* p14 §2-2: 試合記録タブのPCも同じ器（.rosside。名簿とは排他）。畳んでいる間は一覧の先頭の「絞り込み」で戻す */}
            {recSideOn && (
              <aside className="rosside" aria-label="試合記録の絞り込み">
                <button type="button" className="rosside-hide" onClick={() => setRecSideOpen(false)}>
                  ‹ 絞り込みを隠す
                </button>
                {recFilterPanel}
              </aside>
            )}
            <div className="scroll" ref={rosScrollRef}>
              {sheetInline ? (
                <SheetHost
                  key={sheetKey(sheet)}
                  pane
                  sheet={sheet}
                  setSheet={setSheet}
                  players={players}
                  isCoach={isCoach}
                  calFilter={calFilterEff}
                  setCalFilter={setCalFilter}
                  calMine={calMine}
                  setCalMine={setCalMine}
                  onPlayerDeleted={() => setRosSel(null)}
                  onOpenMatch={openMatchFromEvent}
                  onMatchDirty={setMatchDirty}
                />
              ) : (
                <>
                  {activeTab === "att" && (
                    <AttendanceTab
                      isCoach={isCoach}
                      setSheet={setSheet}
                      attSel={attSel}
                      setAttSel={setAttSel}
                    />
                  )}
                  {activeTab === "cal" && (
                    <CalendarTab
                      isCoach={isCoach}
                      setSheet={setSheet}
                      ym={calYm}
                      setYm={setCalYm}
                      view={calView}
                      setView={setCalView}
                      calFilter={calFilterEff}
                      setCalFilter={setCalFilter}
                      calMine={calMine}
                      setCalMine={setCalMine}
                      calSideOpen={calSideOpen}
                      setCalSideOpen={setCalSideOpen}
                    />
                  )}
                  {activeTab === "rec" && recFull && (
                    <MatchHub
                      key={recOpen}
                      matchId={recOpen!}
                      players={players}
                      canEdit={isCoach}
                      onEdit={recHubEdit}
                      onDeleted={() => setRecOpen(null)}
                      section={recSection}
                      onSection={setRecSection}
                      onOpenPlayer={(pid) => {
                        // レビュー nav-1: スマホは個人ページの「戻る」でこの試合へ戻れるよう、戻り先を覚えてから名簿へ
                        setRosBack({ id: recOpen!, section: recSection });
                        setRecOpen(null);
                        setTab("ros");
                        setRosSel(pid);
                        setRosSection("overview");
                      }}
                    />
                  )}
                  {/* p14 §5-2: PCの選手・保護者は一覧の代わりに詳細を出す（絞り込み列は recSideOn で外れる） */}
                  {recPcOpen && (
                    <div className="mhubpane">
                      <div className="tmback" onClick={() => setRecOpen(null)}>
                        ‹ 試合記録
                      </div>
                      <MatchHub
                        key={recOpen}
                        matchId={recOpen}
                        players={players}
                        canEdit={false}
                        onEdit={recHubEdit}
                        onDeleted={() => setRecOpen(null)}
                        section={recSection}
                        onSection={setRecSection}
                      />
                    </div>
                  )}
                  {activeTab === "rec" && !recDetail && (
                    <MatchesTab
                      isCoach={isCoach}
                      players={players}
                      recSel={recSel}
                      setRecSel={(s) => {
                        if (leaveMatchForm()) setRecSel(s);
                      }}
                      cmp={cmp}
                      matchGroup={matchGroupEff}
                      period={recPeriod}
                      showFilterBtn={pc && !recSideOn}
                      filterOn={recFilterOn}
                      onFilter={() => (pc ? setRecSideOpen(true) : setRecFilterSheet(true))}
                      onOpenMatch={(id) => {
                        if (leaveMatchForm()) onOpenMatch(id);
                      }}
                      onOpenLeague={() => setSheet({ type: "leagueView" })}
                    />
                  )}
                  {activeTab === "ros" &&
                    showRos &&
                    (rosFull ? (
                      rosHub
                    ) : (
                      <RosterTab
                        players={players}
                        rosSel={rosSel}
                        onPick={pickRos}
                        q={rosQ}
                        setQ={setRosQ}
                        group={rosGroup}
                        pos={rosPos}
                        status={rosStatus}
                        showFilterBtn={!rosSideOn}
                        filterOn={rosFilterOn}
                        onFilter={() => (pc ? setRosSideOpen(true) : setRosFilterSheet(true))}
                      />
                    ))}
                  {/* chat-plan-a §3-5: スマホ＝お知らせ｜メッセージ、PC＝お知らせだけ。詳細・作成・スレッドは board シート */}
                  {activeTab === "chat" && <ChatHome pc={pc} lockSegment={pc ? "ann" : undefined} />}
                </>
              )}
            </div>

            {/* コーチのrec/ros/attタブのみの第2ペイン。sheetが開いていればSheetHostをペイン表示し(sel系ペインより優先)、
                sheetが無いときは従来どおりsel系ペインを出す。
                モバイルでは base の .teammain{display:none}（チャットの.chatmainと同じ流儀）で不可視 */}
            {showTeammain && (
              <div className="teammain">
                {sheetInTeammain ? (
                  <SheetHost
                    key={sheetKey(sheet)}
                    pane
                    sheet={sheet}
                    setSheet={setSheet}
                    players={players}
                    isCoach={isCoach}
                    calFilter={calFilterEff}
                    setCalFilter={setCalFilter}
                    calMine={calMine}
                    setCalMine={setCalMine}
                    onPlayerDeleted={() => setRosSel(null)}
                    onOpenMatch={openMatchFromEvent}
                    onMatchDirty={setMatchDirty}
                  />
                ) : (
                  <>
                    {activeTab === "rec" &&
                      (recSel.kind === "summary" ? (
                        <RecSummaryPane cmp={cmp} matchGroup={matchGroupEff} period={recPeriod} players={players} setRecSel={setRecSel} setSheet={setSheet} />
                      ) : recSel.kind === "match" ? (
                        <RecMatchPane
                          id={recSel.id}
                          players={players}
                          setRecSel={setRecSel}
                          setSheet={setSheet}
                          isCoach={isCoach}
                          section={recSection}
                          onSection={setRecSection}
                        />
                      ) : (
                        <RecPlayerPane id={recSel.id} players={players} setRecSel={setRecSel} />
                      ))}
                    {activeTab === "ros" &&
                      (rosSel ? (
                        rosHub
                      ) : (
                        <div className="empty-msg" style={{ margin: "auto" }}>
                          <b>選手が選択されていません</b>
                          <br />
                          左の一覧から選ぶと詳細が表示されます
                        </div>
                      ))}
                    {activeTab === "att" &&
                      (attSel.kind === "overview" ? (
                        <AttOverviewPane
                          players={players}
                          attPeriod={attPeriod}
                          setAttPeriod={setAttPeriod}
                          setAttSel={setAttSel}
                        />
                      ) : attSel.kind === "event" ? (
                        <AttEventPane id={attSel.id} players={players} setAttSel={setAttSel} />
                      ) : (
                        <AttPlayerPane
                          id={attSel.id}
                          players={players}
                          attPeriod={attPeriod}
                          setAttSel={setAttSel}
                        />
                      ))}
                  </>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* モバイルは従来どおりトップレベルにシートをマウント（PCはペイン化のため.teammain内へ移設済み） */}
      {!pc && (
        <SheetHost
          key={sheetKey(sheet)}
          sheet={sheet}
          setSheet={setSheet}
          players={players}
          isCoach={isCoach}
          calFilter={calFilterEff}
          setCalFilter={setCalFilter}
          calMine={calMine}
          setCalMine={setCalMine}
          onPlayerDeleted={() => setRosSel(null)}
          onOpenMatch={openMatchFromEvent}
          onMatchDirty={setMatchDirty}
        />
      )}
      {/* player-hub §2-1: スマホの名簿の絞り込みシート（PCは左の .rosside を使うのでシートは出さない） */}
      {!pc && showRos && (
        <RosterFilterSheet open={rosFilterSheet} onClose={() => setRosFilterSheet(false)}>
          {rosFilterPanel}
        </RosterFilterSheet>
      )}
      {/* p14 §2-2: スマホの試合記録の絞り込みシート（見出し「表示する試合」。ヘッダーの「絞り込み」から開く） */}
      {!pc && recVisible && (
        <RosterFilterSheet
          title="表示する試合"
          open={recFilterSheet}
          onClose={() => setRecFilterSheet(false)}
        >
          {recFilterPanel}
        </RosterFilterSheet>
      )}
    </div>
  );
}

function sheetKey(s: SheetState): string {
  if (!s) return "none";
  if (s.type === "event") return "event-" + (s.event?.id ?? s.date ?? "new");
  // Phase D-1(C1-major): 選手フォームの「グループ」欄から開いたグループ管理シートは選手フォーム
  // 自体と同じキーを返し、SheetHostの再マウント(=入力全消失)を防ぐ。type==="groups"||"categories"の
  // 分岐より前段で判定する必要がある（そちらは常に"event-"キーを返してしまうため）
  if (s.type === "groups" && s.returnToPlayerForm !== undefined)
    return "pf-" + (s.returnToPlayerForm?.id ?? "new");
  // Phase D-1(C1-major): 予定フォームから開く管理シート(カテゴリ/グループ)は予定フォーム
  // 自体と同じキーを返し、SheetHostの再マウント(=入力全消失)を防ぐ
  if (s.type === "groups" || s.type === "categories")
    return "event-" + (s.from?.id ?? s.date ?? "new");
  if (s.type === "attendance") return "att-" + s.eventId;
  if (s.type === "day") return "day-" + s.date;
  if (s.type === "eventView") return "ev-" + s.id;
  if (s.type === "match")
    return (
      "match-" +
      (s.record?.id ??
        // groups-phase2 §3-2: prefill.eventIdをキーに含める（別の予定から開いたら作り直す）
        (s.prefill ? `pf-${s.prefill.date ?? ""}-${s.prefill.opponent ?? ""}-${s.prefill.eventId ?? ""}` : "new"))
    );
  if (s.type === "playerForm") return "pf-" + (s.player?.id ?? "new");
  return s.type;
}

/* ---------------- 出欠 ---------------- */
function AttendanceTab({
  isCoach,
  setSheet,
  attSel,
  setAttSel,
}: {
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  attSel: AttSel;
  setAttSel: (s: AttSel) => void;
}) {
  const team = useTeam();
  const today = todayStr();
  const pc = usePc();
  const [showPast, setShowPast] = useState(false);
  const upcoming = team.team.events
    .filter((e) => isUpcomingOrOngoing(e, today))
    .sort(byDateAsc);
  const past = team.team.events
    .filter((e) => eventEndDate(e) < today)
    .sort(byDateDesc);
  return (
    <>
      {/* PC専用: 右ペインのサマリー選択行。モバイルでは描画しない(第2ペイン系の新規DOMのため) */}
      {isCoach && pc && (
        <button
          type="button"
          className={`teamsumrow${attSel.kind === "overview" ? " sel" : ""}`}
          onClick={() => setAttSel({ kind: "overview" })}
        >
          出欠サマリー
        </button>
      )}
      {isCoach && (
        <button className="bigbtn" style={{ width: "100%", margin: "12px 0 6px" }} onClick={() => setSheet({ type: "event" })}>
          ＋ 予定を追加
        </button>
      )}
      {upcoming.length === 0 ? (
        <div className="empty-msg">
          <b>今後の予定はありません</b>
          <br />
          予定が追加されるとここに表示されます
        </div>
      ) : (
        <div className="attlist">
          {upcoming.map((ev) => (
            <EventCard key={ev.id} ev={ev} isCoach={isCoach} setSheet={setSheet} attSel={attSel} setAttSel={setAttSel} />
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
                <EventCard key={ev.id} ev={ev} isCoach={isCoach} setSheet={setSheet} attSel={attSel} setAttSel={setAttSel} past />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * p15 §6-5: カレンダーの予定に紐づく試合記録（結果の表示用）。公開の条件はここ 1 か所：
 * スタッフ（isCoach）は常に、選手・保護者は試合記録が公開中（board.matchesPublic）のときだけ。
 * 月表示のピル・リスト／日別の行・予定の詳細は、すべてこの関数を通して結果を出す
 */
function eventResultOf(
  e: TeamEvent,
  matches: MatchRecord[],
  isCoach: boolean,
  matchesPublic: boolean
): MatchRecord | undefined {
  if (e.kind !== "match" || !(isCoach || matchesPublic)) return undefined;
  return matchOfEvent(e.id, matches);
}

/** p15 §6-5: 試合の結果（勝・分・敗とスコア。クラスは .evresult の w / d / l） */
function matchResultOf(m: MatchRecord): { cls: "w" | "d" | "l"; label: string; score: string } {
  const win = m.ourScore > m.theirScore;
  const draw = m.ourScore === m.theirScore;
  return { cls: win ? "w" : draw ? "d" : "l", label: win ? "勝" : draw ? "分" : "敗", score: `${m.ourScore}-${m.theirScore}` };
}

/** 題名の後ろに付ける結果のタグ（リスト表示・日別シート・出欠のカード）。結果が出せない予定は何も出さない */
function EvResultTag({ r }: { r: MatchRecord | undefined }) {
  if (!r) return null;
  const x = matchResultOf(r);
  return (
    <span className={`evresult ${x.cls}`}>
      {x.label} {x.score}
    </span>
  );
}

/**
 * 予定の題名＋結果のタグ（p15 §6-5）。レビュー指摘: タグを省略記号つきの題名の中に入れると、スマホでは題名が
 * 長いだけでタグごと見切れる。結果があるときは題名を flex にして、文字（.evttext）だけを省略し、タグは常に出す
 */
function EvTitle({ cls, title, r }: { cls: "evtitle" | "agtitle"; title: string; r: MatchRecord | undefined }) {
  if (!r) return <span className={cls}>{title}</span>;
  return (
    <span className={`${cls} hasres`}>
      <span className="evttext">{title}</span>
      <EvResultTag r={r} />
    </span>
  );
}

/* 対象バッジ（カレンダーのグループ機能§5）。全員=薄い地、グループ指定=accent地。
   full=true（予定詳細）は省略せず全文表示する */
function EvGroupsBadge({
  ev,
  groups,
  full,
  dot,
  outside,
}: {
  ev: TeamEvent;
  groups: TeamGroup[];
  full?: boolean;
  /** 案A §5: 先頭にグループ色の点(7px)を付ける（リスト行専用。全員向けは点なし） */
  dot?: boolean;
  /** 案A §2/§5: 選手・保護者の「すべて」表示でこの予定が自分を対象にしていないとき、
   *  通常のラベルの代わりに薄い「対象外」を出す（.evgroups.outside） */
  outside?: boolean;
}) {
  if (outside) {
    return <span className={`evgroups outside${full ? " full" : ""}`}>対象外</span>;
  }
  // Phase D-1(C2-minor): グループを1つも作っていないチームでは対象バッジ自体を出さない
  // （絞り込み行と同じ「グループが無ければ出さない」扱いに揃える）
  if (groups.length === 0) return null;
  const label = targetLabel(ev, groups);
  const isAll = label === "全員";
  // Phase D-1(C2-minor): 色分けの判定基準をisAllTargets(groupIdsの有無)ではなく
  // 表示ラベルに揃える。削除済み/存在しないグループIDだけの予定は、ラベルが「全員」なのに
  // accent色になる食い違いを防ぐ
  return (
    <span
      className={`evgroups${isAll ? "" : " targeted"}${full ? " full" : ""}`}
      title={full ? undefined : label}
    >
      {dot && !isAll && <i className="evgdot" style={{ background: groupColorOf(ev, groups) }} />}
      {label}
    </span>
  );
}

/**
 * 試合記録の対象バッジ（groups-phase2 §3-3。EvGroupsBadgeと同じ文法）。
 * 全体（対象グループ未設定・全て削除済み）のときは何も描画しない（カード・詳細どちらも「全体のときは出さない」仕様）。
 */
function MatchGroupsBadge({ m, groups, full }: { m: MatchRecord; groups: TeamGroup[]; full?: boolean }) {
  if (groups.length === 0) return null;
  const label = matchTargetLabel(m, groups);
  if (label === "全体") return null;
  return (
    <span className={`evgroups targeted${full ? " full" : ""}`} title={full ? undefined : label}>
      {label}
    </span>
  );
}

/* 選手の所属カスタムグループのバッジ（groups-everywhere §5。名簿の行に表示。最大2個＋「+n」） */
function PlayerGroupBadges({ p, groups }: { p: Player; groups: TeamGroup[] }) {
  const custom = groups.filter((g) => g.kind === "custom" && playerInGroup(p, g));
  if (custom.length === 0) return null;
  const shown = custom.slice(0, 2);
  const extra = custom.length - shown.length;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {shown.map((g) => (
        <span key={g.id} className="evgroups targeted">
          {g.label}
        </span>
      ))}
      {extra > 0 && <span className="evgroups">+{extra}</span>}
    </span>
  );
}

/* 予定1件のカード（出欠タブ用） */
function EventCard({
  ev,
  isCoach,
  setSheet,
  attSel,
  setAttSel,
  past = false,
}: {
  ev: TeamEvent;
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  attSel?: AttSel;
  setAttSel?: (s: AttSel) => void;
  past?: boolean;
}) {
  const board = useBoard();
  const team = useTeam();
  const s = team.summary(ev.id);
  const cat = categoryOf(ev, team.categories);
  const ongoing = isOngoing(ev, todayStr());
  const selected = attSel?.kind === "event" && attSel.id === ev.id;
  return (
    <div
      className={`evcard${selected ? " sel" : ""}`}
      style={past ? { opacity: 0.72 } : undefined}
      // PC3ペインでは行全体を選択可能にする(行化した見た目=hover/selと挙動を一致させる)。
      // モバイルでは従来どおり.evsummaryだけがシートを開く
      onClick={() => {
        if (isCoach && setAttSel && typeof window !== "undefined" && window.matchMedia(PC_MQ).matches) {
          setAttSel({ kind: "event", id: ev.id });
        }
      }}
    >
      <div className="evhead">
        <span className="evkind" style={{ background: cat.color }}>
          {/* mobile-redesign-v2 §3-4: 種別ピルの塗りをスマホでは--surface-lowへ打ち消す分、
              種別の色はこの8pxの丸(evdot)で示す。PCは変更なし(PC resetでdisplay:none) */}
          <i className="evdot" style={{ background: cat.color }} />
          {cat.label}
        </span>
        {/* p15 §6-5: 紐づく試合記録があれば結果のタグ */}
        <EvTitle cls="evtitle" title={ev.title} r={eventResultOf(ev, team.team.matches, isCoach, board.matchesPublic)} />
        {isCoach && (
          <span className="evacts">
            <button
              aria-label="編集"
              onClick={(e) => {
                e.stopPropagation();
                setSheet({ type: "event", event: ev });
              }}
            >
              <IconEdit />
            </button>
            <button
              aria-label="削除"
              onClick={(e) => {
                e.stopPropagation();
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
      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <EvGroupsBadge ev={ev} groups={team.groups} />
        {/* board-squad-and-pc-polish §3: メンバー登録済みの試合バッジ */}
        {ev.kind === "match" && ev.squad && <span className="evgroups targeted">メンバー発表</span>}
      </div>
      {isCoach && (
        <div
          className="evsummary"
          onClick={() => {
            if (setAttSel && typeof window !== "undefined" && window.matchMedia(PC_MQ).matches) {
              setAttSel({ kind: "event", id: ev.id });
            } else {
              setSheet({ type: "attendance", eventId: ev.id });
            }
          }}
        >
          <span className="att yes">出席 {s.yes}</span>
          <span className="att maybe">未定 {s.maybe}</span>
          <span className="att no">欠席 {s.no}</span>
          <span className="att none">未記録 {s.none}</span>
          <span className="evopen">記録を見る ›</span>
        </div>
      )}
    </div>
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
  calFilter,
  setCalFilter,
  calMine,
  setCalMine,
  calSideOpen,
  setCalSideOpen,
}: {
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  ym: { y: number; m: number };
  setYm: (v: { y: number; m: number }) => void;
  view: "month" | "list";
  setView: (v: "month" | "list") => void;
  /** カレンダーの絞り込み状態（案A §2）。コーチの減算型絞り込み・選手/保護者の種類非表示を共用する */
  calFilter: CalFilter;
  setCalFilter: (v: CalFilter) => void;
  /** 選手・保護者向けの絞り込み: true=自分の予定だけ／false=すべて（groups-everywhere §3） */
  calMine: boolean;
  setCalMine: (v: boolean) => void;
  /** PCの絞り込みパネル(.calside)の開閉（calendar-plan-a §11-1）。スマホには影響しない */
  calSideOpen: boolean;
  setCalSideOpen: (v: boolean) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  // isCoach=false（選手・保護者、またはコーチの選手プレビュー）のときの「自分」
  const me = !isCoach ? board.state.players.find((p) => p.id === team.viewer.memberPlayerId) ?? null : null;
  // 案A §2: 同じ判定(calEventVisible)をCalendarTab・日別シート・画像保存(2段目)の
  // 3か所で共用する（calendar-plan-a §11-2で月表示下の「今日からの予定」は撤去した）
  const passesFilter = (e: TeamEvent) =>
    calEventVisible(e, calFilter, { isCoach, me, groups: team.groups, categories: team.categories, calMine });

  const first = new Date(ym.y, ym.m, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (d: number) =>
    `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // §3: 絞り込み中グループ（コーチ）／自分の予定（選手。groups-everywhere §3）の対象予定
  // (全員対象含む)のみを月表示・リスト表示・凡例へ通す
  const eventsOn = (d: number) =>
    team.team.events.filter((e) => occursOn(e, dateStr(d)) && passesFilter(e)).sort(byStartAsc);
  const today = todayStr();

  const shift = (delta: number) => {
    const nm = ym.m + delta;
    setYm({ y: ym.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 });
  };

  // 当月の予定を日付ごとにまとめる（リスト表示用）
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .map((d) => ({ d, ds: dateStr(d), evs: eventsOn(d) }))
    .filter((x) => x.evs.length > 0);

  // 案A §1 レビュー指摘対応: 凡例はカテゴリ色ではなく、マスの点・帯と同じグループ色
  // (groupColorOf)に揃える。その月に登場する対象グループ／全員向けを重複なく列挙し
  // （最大5個＋「他◯」）、試合が1件でもあれば輪の見本を1つ添える
  const monthGroupLegendMap = new Map<string, { label: string; color: string }>();
  let monthHasMatch = false;
  monthDays.forEach(({ evs }) =>
    evs.forEach((e) => {
      if (e.kind === "match") monthHasMatch = true;
      const resolvedId = isAllTargets(e) ? null : e.groupIds!.find((id) => team.groups.some((g) => g.id === id)) ?? null;
      const g = resolvedId ? team.groups.find((x) => x.id === resolvedId) : undefined;
      const key = g ? g.id : "__all__";
      if (!monthGroupLegendMap.has(key)) {
        monthGroupLegendMap.set(key, { label: g ? g.label : "全員向け", color: g?.color ?? ALL_TARGETS_COLOR });
      }
    })
  );
  const monthGroupLegend = Array.from(monthGroupLegendMap.values());

  // 日付ごとの予定行（リスト表示だけで使う。calendar-plan-a §11-2で撤去した
  // 「今日からの予定」（月表示下）とも以前は共用していたが、今はここだけ）。
  // 案A §5: 色はグループ(groupColorOf)・種類は文字(cat.label)のみで示す
  const renderAgendaRows = (days: typeof monthDays) =>
    days.map(({ d, ds, evs }) => {
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
              const color = groupColorOf(e, team.groups);
              // 選手・保護者の「すべて」表示で、この予定が自分を対象にしていないとき(案A §2)
              const outside = !isCoach && !calMine && !!me && !eventTargetsPlayer(e, me, team.groups);
              return (
                <div
                  key={e.id}
                  className={`agbar ${e.kind}`}
                  style={{ borderLeftColor: color }}
                  onClick={() => setSheet({ type: "eventView", id: e.id })}
                >
                  <span className="agkind">
                    <i
                      className="evdot"
                      style={{ background: color }}
                    />
                    {cat.label}
                  </span>
                  {/* p15 §6-5: 紐づく試合記録があれば結果のタグ */}
                  <EvTitle cls="agtitle" title={e.title} r={eventResultOf(e, team.team.matches, isCoach, board.matchesPublic)} />
                  <EvGroupsBadge ev={e} groups={team.groups} dot outside={outside} />
                  {/* board-squad-and-pc-polish §3: メンバー登録済みの試合バッジ */}
                  {e.kind === "match" && e.squad && <span className="evgroups targeted">メンバー発表</span>}
                  {timeLabel && <span className="agtime">{timeLabel}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    });

  // 案A §3-2/3-3: 月の見出し(.calnav)の直下に出す「選択中の絞り込み」1行（スマホ・PC共通）。
  // 「＋ 管理」チップ・.calfilterの行・.calfilterhintは撤去し、代わりにこの1行だけで状態を示す。
  // レビュー指摘対応: コーチの判定(表示中グループ・全員向け・種類)をcalSel(色付きJSX)と
  // calSelText(画像保存用のプレーンテキスト)それぞれに重複して書いていたため、判定自体を
  // ここ1か所にまとめる（食い違い防止）。あわせて、グループも全員向けも1つも表示していない
  // （＝何も表示されない）ときに空表示や「・練習のみ」のように先頭が「・」で始まる表示に
  // なっていた不具合も、ここで「表示する予定なし」に正規化して直す
  const coachSel = isCoach
    ? (() => {
        const shownGroups = team.groups.filter((g) => !calFilter.hiddenGroupIds.includes(g.id));
        const shownCats = team.categories.filter((c) => !calFilter.hiddenCategoryIds.includes(c.id));
        const catsHiddenLabel =
          calFilter.hiddenCategoryIds.length === 0
            ? null
            : shownCats.length > 0
              ? `${shownCats.map((c) => c.label).join("・")}のみ`
              : "表示する種類なし";
        return {
          allDefault: shownGroups.length === team.groups.length && !calFilter.hideAllTargets && !catsHiddenLabel,
          nothingShown: shownGroups.length === 0 && calFilter.hideAllTargets,
          shownGroups,
          showAllTargets: !calFilter.hideAllTargets,
          catsHiddenLabel,
        };
      })()
    : null;

  const calSel: React.ReactNode = isCoach
    ? coachSel!.allDefault
      ? "すべての予定"
      : coachSel!.nothingShown
        ? "表示する予定なし"
        : (() => {
            const nodes: React.ReactNode[] = coachSel!.shownGroups.map((g) => (
              <span key={g.id} style={{ marginRight: 8 }}>
                <i className="calseldot" style={{ background: g.color }} />
                {g.label}
              </span>
            ));
            if (coachSel!.showAllTargets) nodes.push(<span key="all">＋ 全員向け</span>);
            if (coachSel!.catsHiddenLabel) nodes.push(`・${coachSel!.catsHiddenLabel}`);
            return nodes;
          })()
    : (() => {
        const shownCats = team.categories.filter((c) => !calFilter.hiddenCategoryIds.includes(c.id));
        const base = calMine ? "自分の予定" : "すべての予定";
        if (calFilter.hiddenCategoryIds.length === 0) return base;
        const catsLabel = shownCats.length > 0 ? `${shownCats.map((c) => c.label).join("・")}のみ` : "表示する種類なし";
        return `${base}・${catsLabel}`;
      })();

  // 案A §6: 画像保存(PNG)のヘッダーに使うプレーンテキスト版。coachSelを共用するため、
  // calSel(色付きJSX)と食い違わない
  const calSelText: string = isCoach
    ? coachSel!.allDefault
      ? "すべての予定"
      : coachSel!.nothingShown
        ? "表示する予定なし"
        : (() => {
            const parts = coachSel!.shownGroups.map((g) => g.label);
            if (coachSel!.showAllTargets) parts.push("全員向け");
            return parts.join("・") + (coachSel!.catsHiddenLabel ? `・${coachSel!.catsHiddenLabel}` : "");
          })()
    : (() => {
        const shownCats = team.categories.filter((c) => !calFilter.hiddenCategoryIds.includes(c.id));
        const base = calMine ? "自分の予定" : "すべての予定";
        if (calFilter.hiddenCategoryIds.length === 0) return base;
        const catsLabel = shownCats.length > 0 ? `${shownCats.map((c) => c.label).join("・")}のみ` : "表示する種類なし";
        return `${base}・${catsLabel}`;
      })();

  // 案A §6: スマホのリスト表示「画像で保存」。絞り込み後の全件(monthDays)をそのまま
  // lib/exportCalendar.tsへ渡す（スクロールに関係なく全部＝リスト表示と同じ内容）
  const saveListImage = async () => {
    const totalEvs = monthDays.reduce((s, x) => s + x.evs.length, 0);
    if (totalEvs === 0) {
      board.toast("この月の予定はありません");
      return;
    }
    const days = monthDays.map((day) => ({
      d: day.d,
      wd: new Date(ym.y, ym.m, day.d).getDay(),
      evs: day.evs.map((e) => {
        const cat = categoryOf(e, team.categories);
        const timeLabel = isMultiDay(e)
          ? `${fmtMD(e.date)}〜${fmtMD(eventEndDate(e))}`
          : e.allDay
            ? "終日"
            : fmtTimeRange(e);
        const outside = !isCoach && !calMine && !!me && !eventTargetsPlayer(e, me, team.groups);
        return {
          title: e.title,
          timeLabel,
          categoryLabel: cat.label,
          color: groupColorOf(e, team.groups),
          targetLabel: outside ? "対象外" : targetLabel(e, team.groups),
          isMatch: e.kind === "match",
          outside,
        };
      }),
    }));
    const dataUrl = renderCalendarListPng({
      ym,
      teamName: board.state.teamName,
      days,
      selLabel: calSelText,
    });
    const filename = `予定_${ym.y}-${String(ym.m + 1).padStart(2, "0")}.png`;
    // 案A §6: 共有シートが使えれば共有(iPhoneでは「画像を保存」が出る)。使えなければダウンロード。
    // 共有をキャンセル(AbortError)したときは何もしない
    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
        // 共有に失敗した場合はダウンロードにフォールバックする（下へ続く）
      }
    }
    downloadDataUrl(dataUrl, filename);
    board.toast("画像を保存しました");
  };

  // calendar-plan-a §11-1: .calnav左端の「絞り込み」(.calshow)に出す点。Inner側の
  // calFilterHasHidden(スマホヘッダーの点)と同じ判定をここでも使う（何か隠しているか）
  const calSideHasHidden = isCoach
    ? calFilter.hiddenGroupIds.length > 0 || calFilter.hideAllTargets || calFilter.hiddenCategoryIds.length > 0
    : calFilter.hiddenCategoryIds.length > 0 || calMine;

  const calBody = (
    <>
      <div className="calnav">
        {/* calendar-plan-a §11-1: パネルを隠しているときだけ.calnav左端に「絞り込み」を出す。
            中央の年月・矢印の位置はabsolute配置なので動かない（PCだけ表示。スマホは
            CSS側で.calnavにposition:relativeを付けないため通常フローに残らない） */}
        {pc && !calSideOpen && (
          <button type="button" className="calshow" onClick={() => setCalSideOpen(true)}>
            <IconFilter />
            絞り込み
            {calSideHasHidden && <span className="dot" />}
          </button>
        )}
        <button onClick={() => shift(-1)}>‹</button>
        <b>
          {ym.y}年 {ym.m + 1}月
        </b>
        <button onClick={() => shift(1)}>›</button>
      </div>

      <div className="calsel">{calSel}</div>

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
                  // §4: 予定が1件以上ある日も含め、常に日別シートを開く（予定が無い日は従来どおり）
                  onClick={() => setSheet({ type: "day", date: ds })}
                >
                  <span className={`caldate${i % 7 === 0 ? " sun" : i % 7 === 6 ? " sat" : ""}`}>{d}</span>
                  {/* calendar-plan-a §11-2: スマホも点(.caldots)ではなくピル(.calevs/.calev)を出す。
                      色は--gc(インラインstyle)で渡し、CSS側がcolor-mixで薄地+濃い文字にする。
                      件数(§11-2「1マス3件まで、4件目からは2件＋『+N』」)は旧.caldotsと同じ
                      slice式（4件以上だけ2件に減らす）。ちょうど3件のときだけスマホ(3件とも表示・
                      「+N」なし)とPC/タブレット(2件＋「+1」＝§4-2の従来どおり)で見え方が割れるため、
                      その1パターンだけ.calmore-pconlyでPCだけに出す（4件以上は両方とも同じ「+N」） */}
                  <div className="calevs">
                    {evs.slice(0, evs.length > 3 ? 2 : 3).map((e) => {
                      const cat = categoryOf(e, team.categories);
                      const isStart = e.date === ds;
                      const isEnd = eventEndDate(e) === ds;
                      const corner = isStart && isEnd ? "single" : isStart ? "start" : isEnd ? "end" : "mid";
                      const showTime = (corner === "start" || corner === "single") && !e.allDay && e.time;
                      // 案A §4-2: 種類は文字の先頭1文字で示す（試合は「試 」固定・練習は付けない・
                      // その他カテゴリは先頭1文字）。時刻はPC/タブレットだけ.calev-time(CSS)で出す
                      const prefix = cat.id === "match" ? "試 " : cat.id === "practice" ? "" : `${cat.label.slice(0, 1)} `;
                      // p15 §6-5: 紐づく試合記録があれば、時刻の代わりにスコア（公開の条件は eventResultOf）
                      const rec = eventResultOf(e, team.team.matches, isCoach, board.matchesPublic);
                      return (
                        <span
                          key={e.id}
                          className={`calev ${corner}`}
                          style={{ "--gc": groupColorOf(e, team.groups) } as React.CSSProperties}
                        >
                          {prefix}
                          {rec ? (
                            <span className="calev-score">{matchResultOf(rec).score} </span>
                          ) : (
                            showTime && <span className="calev-time">{e.time} </span>
                          )}
                          {e.title}
                        </span>
                      );
                    })}
                    {evs.length > 3 && <span className="calmore">+{evs.length - 2}</span>}
                    {evs.length === 3 && <span className="calmore calmore-pconly">+1</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {(monthGroupLegend.length > 0 || isCoach) && (
            <div className="callegend">
              {monthGroupLegend.slice(0, 5).map((g) => (
                <span key={g.label}>
                  <i className="caldot" style={{ background: g.color }} /> {g.label}
                </span>
              ))}
              {monthGroupLegend.length > 5 && <span>他{monthGroupLegend.length - 5}</span>}
              {/* レビュー指摘対応（calendar-plan-a §11-2）: マスの点(輪=試合)は撤去し、
                  試合はピル先頭の「試 」で示す方式に変えたため、輪の見本は撤去し
                  文字だけの凡例に置き換える */}
              {monthHasMatch && <span>試＝試合</span>}
              {isCoach && <span className="calhint">日付をタップで予定を追加</span>}
            </div>
          )}
          {/* calendar-plan-a §11-2: スマホの月表示下の「今日からの予定」は撤去した
              （マスにピルで予定名が出るようになり、リスト表示でも足りるため） */}
        </>
      ) : (
        <div className="agenda">
          {/* 案A §6: スマホのリスト表示だけ先頭に「この月の予定 N件」＋「画像で保存」。
              PCは出さない（月送り・月/リスト切替と同じく変更しない対象のため） */}
          {!pc && (
            <div className="callistbar">
              <span>この月の予定 {monthDays.reduce((s, x) => s + x.evs.length, 0)}件</span>
              <button
                type="button"
                className="callistsave"
                onClick={() => {
                  void saveListImage();
                }}
              >
                <IconDownload /> 画像で保存
              </button>
            </div>
          )}
          {monthDays.length === 0 ? (
            <div className="empty-msg">
              <b>この月の予定はありません</b>
              <br />
              月を変更すると他の予定を確認できます
            </div>
          ) : (
            renderAgendaRows(monthDays)
          )}
          {/* mobile-redesign-v2 §3-3: スマホではヘッダー右上の「予定を追加」に一本化し、
              リスト表示末尾の全幅緑ボタンは描画しない（PCは変更しない） */}
          {isCoach && pc && (
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
    </>
  );

  // 案A §3-3・calendar-plan-a §11-1: PCは.calを.calside(絞り込み常設。見出し行なし＝compact)+
  // .calmain(従来の本体)の2列にする。月送り・月/リスト切替・＋予定を追加はcalBody(.calmain)側の
  // 子要素のまま位置・見た目を変えない。スマホは従来どおり.cal直下にcalBodyだけを置く。
  // §11-1: calSideOpen=falseのときは.calに"side-hidden"を足して1列にし、.calmainが全幅になる
  // （.calside自体はCSS側で非表示にする。空白を作らないため）
  return pc ? (
    <div className={`cal${calSideOpen ? "" : " side-hidden"}`}>
      <div className="calside">
        {/* calendar-plan-a §11-1: パネル先頭の「隠す」。押すと.calmainが全幅になり空白を作らない */}
        <button type="button" className="calside-hide" onClick={() => setCalSideOpen(false)}>
          ‹ 絞り込みを隠す
        </button>
        <CalFilterPanel
          filter={calFilter}
          setFilter={setCalFilter}
          isCoach={isCoach}
          me={me}
          calMine={calMine}
          setCalMine={setCalMine}
          groups={team.groups}
          categories={team.categories}
          onManageGroups={() => setSheet({ type: "groups" })}
          compact
        />
      </div>
      <div className="calmain">{calBody}</div>
    </div>
  ) : (
    <div className="cal">{calBody}</div>
  );
}

/**
 * カレンダーの絞り込みと色の作り直し（案A §3-1）: 絞り込みの共通部品。
 * スマホは下からのシート(SheetHostのtype:"calfilter")の中身として、PCはCalendarTabの
 * .calside（常時表示・compact=true）として、同じ中身をどちらからも呼ぶ。
 * コーチは学年/グループ/種類の3セクション＋「全員向けの予定を含める」トグル＋
 * 「絞り込みを編集…」リンク（p14 §1-1 で文言変更）、選手・保護者は「自分の予定だけ」トグル＋種類セクションのみ。
 */
function CalFilterPanel({
  filter,
  setFilter,
  isCoach,
  me,
  calMine,
  setCalMine,
  groups,
  categories,
  onManageGroups,
  compact,
  onClose,
}: {
  filter: CalFilter;
  setFilter: (v: CalFilter) => void;
  isCoach: boolean;
  me: Player | null;
  calMine: boolean;
  setCalMine: (v: boolean) => void;
  groups: TeamGroup[];
  categories: EventCategory[];
  /** 「絞り込みを編集…」リンク。省略時はリンク自体を出さない */
  onManageGroups?: () => void;
  /** true=PCの常設パネル（見出し行・完了ボタンを出さない） */
  compact?: boolean;
  /** スマホのシートを閉じる（見出し行の「完了」用。compact=trueのときは使わない） */
  onClose?: () => void;
}) {
  const toggleGroup = (id: string) => {
    setFilter({
      ...filter,
      hiddenGroupIds: filter.hiddenGroupIds.includes(id)
        ? filter.hiddenGroupIds.filter((x) => x !== id)
        : [...filter.hiddenGroupIds, id],
    });
  };
  const toggleCategory = (id: string) => {
    setFilter({
      ...filter,
      hiddenCategoryIds: filter.hiddenCategoryIds.includes(id)
        ? filter.hiddenCategoryIds.filter((x) => x !== id)
        : [...filter.hiddenCategoryIds, id],
    });
  };

  // グループの1セクション（学年／グループ）。0件なら見出しごと出さない
  const groupSection = (label: string, list: TeamGroup[]) => {
    if (list.length === 0) return null;
    const allShown = list.every((g) => !filter.hiddenGroupIds.includes(g.id));
    return (
      <div className="calfilterpanel-sec" key={label}>
        <div className="calfilterpanel-sech">
          <b>{label}</b>
          <button
            type="button"
            className="calfilterpanel-all"
            onClick={() =>
              setFilter({
                ...filter,
                hiddenGroupIds: allShown
                  ? Array.from(new Set([...filter.hiddenGroupIds, ...list.map((g) => g.id)]))
                  : filter.hiddenGroupIds.filter((id) => !list.some((g) => g.id === id)),
              })
            }
          >
            {allShown ? "すべて解除" : "すべて選択"}
          </button>
        </div>
        {list.map((g) => {
          const on = !filter.hiddenGroupIds.includes(g.id);
          return (
            <div
              key={g.id}
              className="calfilterpanel-row"
              role="button"
              tabIndex={0}
              onClick={() => toggleGroup(g.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleGroup(g.id);
                }
              }}
            >
              <span
                className={`calchk${on ? " on" : ""}`}
                style={{ background: on ? g.color : "transparent", borderColor: on ? "transparent" : g.color }}
              />
              <span>{g.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const allCatsShown = categories.every((c) => !filter.hiddenCategoryIds.includes(c.id));
  const catSection = (
    <div className="calfilterpanel-sec">
      <div className="calfilterpanel-sech">
        <b>種類</b>
        <button
          type="button"
          className="calfilterpanel-all"
          onClick={() =>
            setFilter({ ...filter, hiddenCategoryIds: allCatsShown ? categories.map((c) => c.id) : [] })
          }
        >
          {allCatsShown ? "すべて解除" : "すべて選択"}
        </button>
      </div>
      <div className="grouppick">
        {categories.map((c) => {
          const on = !filter.hiddenCategoryIds.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              className="calfilterpanel-catchip"
              onClick={() => toggleCategory(c.id)}
            >
              <span className={`calchk sq${on ? " on" : ""}`} />
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`calfilterpanel${compact ? " compact" : ""}`}>
      {!compact && (
        <div className="calfilterpanel-head">
          <b>表示する予定</b>
          <button type="button" onClick={onClose}>
            完了
          </button>
        </div>
      )}
      {isCoach ? (
        <>
          {groupSection("学年", groups.filter((g) => g.kind === "grade"))}
          {groupSection("グループ", groups.filter((g) => g.kind === "custom"))}
          {catSection}
          <label className="calfilter-toggle">
            <input
              type="checkbox"
              checked={!filter.hideAllTargets}
              onChange={(e) => setFilter({ ...filter, hideAllTargets: !e.target.checked })}
            />
            <span />
            全員向けの予定を含める
          </label>
          {onManageGroups && (
            // 統括の最終調整: div[role=button]だとEnter/Spaceで動かないため実ボタンにする
            // （見た目は.calfilterpanel-manageのまま。ボタン既定のスタイルはCSS側で外す）
            <button type="button" className="calfilterpanel-manage" onClick={onManageGroups}>
              絞り込みを編集…
            </button>
          )}
        </>
      ) : (
        <>
          <label className="calfilter-toggle">
            <input type="checkbox" checked={calMine} onChange={(e) => setCalMine(e.target.checked)} />
            <span />
            自分の予定だけ
          </label>
          {catSection}
        </>
      )}
    </div>
  );
}

/**
 * 色を選ぶ縦リスト（calendar-plan-a §11-3。iPhoneカレンダーの「カレンダーのカラー」と同じ形）。
 * グループ管理シート（色の丸の下）とカテゴリ管理シート（編集行・新規追加）の両方から使う。
 * 7色（COLOR_CHOICES）を並べ、最後に「カスタム…」＋隠した<input type="color">を置く。
 * ルート要素は"colorchoice"、各行は"colorchoice-row"固定（検証スクリプトがこの名前を見る）。
 */
function ColorChoiceList({
  value,
  onChange,
}: {
  value: string;
  /**
   * レビュー指摘対応（calendar-plan-a §11-3）: プリセット行のタップとカスタムピッカーの
   * 入力を呼び出し側が区別できるよう、第2引数で通知元を渡す。カスタムの<input type="color">は
   * ドラッグ中も逐次onChangeが飛ぶため、呼び出し側はこれを見て「custom」のときだけ
   * リストを開いたままにする（グループ管理シート参照。閉じるとinputがDOMから外れ、
   * ブラウザ側の色ピッカーごと閉じてしまうため） */
  onChange: (hex: string, source: "preset" | "custom") => void;
}) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const isPreset = COLOR_CHOICES.some((c) => c.color === value);
  const openCustomPicker = () => customInputRef.current?.click();
  const rowKeyDown = (e: React.KeyboardEvent, run: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      run();
    }
  };
  return (
    <div className="colorchoice">
      {COLOR_CHOICES.map((c) => (
        <div
          key={c.color}
          className="colorchoice-row"
          role="button"
          tabIndex={0}
          onClick={() => onChange(c.color, "preset")}
          onKeyDown={(e) => rowKeyDown(e, () => onChange(c.color, "preset"))}
        >
          <span className="colorchoice-dot" style={{ background: c.color }} />
          <span className="colorchoice-name">{c.name}</span>
          {value === c.color && <span className="colorchoice-check" />}
        </div>
      ))}
      {/* 「カスタム…」：7色のどれとも一致しないvalueはカスタム色とみなし、その色でチェックを付ける。
          タップで隠しfile input(type=color)をclick()し、OSの色ピッカーを開く */}
      <div
        className="colorchoice-row"
        role="button"
        tabIndex={0}
        onClick={openCustomPicker}
        onKeyDown={(e) => rowKeyDown(e, openCustomPicker)}
      >
        <span
          className={`colorchoice-dot${isPreset ? " colorchoice-dot-empty" : ""}`}
          style={isPreset ? undefined : { background: value }}
        />
        <span className="colorchoice-name">カスタム…</span>
        {!isPreset && <span className="colorchoice-check" />}
        <input
          ref={customInputRef}
          type="color"
          className="colorchoice-input"
          /* レビュー指摘対応（calendar-plan-a §11-3）: プリセット中も常に現在値を渡す。
             以前は"#000000"固定にしていたため、プリセット選択中にカスタムを開くと
             常に黒から始まり、黒そのものも選べなかった */
          value={value}
          onChange={(e) => onChange(e.target.value, "custom")}
          aria-label="カスタムの色を選ぶ"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}

/* ---------------- 試合記録 ---------------- */
function MatchesTab({
  isCoach,
  players,
  recSel,
  setRecSel,
  cmp,
  matchGroup,
  period,
  showFilterBtn,
  filterOn,
  onFilter,
  onOpenMatch,
  onOpenLeague,
}: {
  isCoach: boolean;
  players: Player[];
  recSel?: RecSel;
  setRecSel?: (s: RecSel) => void;
  cmp: string;
  /** groups-phase2 §3-3: 絞り込み中グループ（単一選択。nullは「すべて」） */
  matchGroup: string | null;
  /** p15 §2: 期間の絞り込み（all=制限なし） */
  period: RecPeriod;
  /** p14 §2-3: true=PCで絞り込み列(.rosside)を畳んでいるので、一覧の先頭に「絞り込み」ボタン(.rostop)を出す */
  showFilterBtn: boolean;
  /** 何か絞っているか（「絞り込み」ボタンの点） */
  filterOn: boolean;
  onFilter: () => void;
  /** p14 §2-3: 行を押した（PCスタッフ＝右ペイン、それ以外＝詳細。分岐は Inner 側） */
  onOpenMatch: (id: string) => void;
  /** p14 §3-3: 順位表の入口行（スマホ・PCの選手）を押した（leagueView シートを開く） */
  onOpenLeague: () => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  const comps = team.team.competitions;
  // p14 §3-3: 順位表の入口行の見出しと順位（順位は表と同じ computeStandings から）
  const leagueTitle = team.league.title || "リーグ順位表";
  const leaguePos = leaguePositionOf(computeStandings(team.league, board.state.teamName ?? "マイチーム"));
  const cmpName = (m: MatchRecord): string | null =>
    m.competitionId
      ? comps.find((c) => c.id === m.competitionId)?.name ?? "（削除された大会）"
      : m.competition || null;

  const allMatches = [...team.team.matches].sort((a, b) => (a.date < b.date ? 1 : -1));
  // groups-phase2 §3-3: 選択グループが対象、または対象が全体の記録に絞る（カレンダーと同じ考え方）
  // p15 §2: 期間は大会・グループの絞り込みと重ねて掛ける
  const today = todayStr();
  const matches = allMatches.filter(
    (m) =>
      matchInPeriod(m.date, period, today) &&
      (cmp === "all" ? true : cmp === "none" ? !m.competitionId : m.competitionId === cmp) &&
      matchTargetsGroup(m, matchGroup)
  );
  const filterLabel =
    cmp === "all" ? null : cmp === "none" ? "その他" : comps.find((c) => c.id === cmp)?.name ?? null;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";
  // p14 §2-3: 「選択中」1行の中身（グループが先、大会が後。グループはその色の点付き）
  const selGroup = matchGroup ? team.groups.find((g) => g.id === matchGroup) ?? null : null;
  const selParts: React.ReactNode[] = [];
  if (selGroup) {
    selParts.push(
      <span key="g">
        <i className="rosseldot" style={{ background: selGroup.color ?? "var(--mut)" }} />
        {selGroup.label}
      </span>
    );
  }
  if (filterLabel) selParts.push(filterLabel);
  // p15 §2: 「グループ ・ 大会 ・ 期間」の順（期間は all 以外のときだけ）
  if (period !== "all") selParts.push(REC_PERIOD_OPTIONS.find((o) => o.key === period)?.label ?? "");

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
  const ranks = scorerAssisterRanks(matches);
  const scorers = ranks.scorers.slice(0, 5);
  const assisters = ranks.assisters.slice(0, 5);

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
      {/* PC専用: 右ペインのサマリー選択行。モバイルでは描画しない(第2ペイン系の新規DOMのため) */}
      {isCoach && pc && recSel && setRecSel && (
        <button
          type="button"
          className={`teamsumrow${recSel.kind === "summary" ? " sel" : ""}`}
          onClick={() => setRecSel({ kind: "summary" })}
        >
          チーム全体のサマリー
        </button>
      )}
      {isCoach && (
        // mobile-redesign-v2 §3-4: この注記だけ--mut化するため専用クラスpubnoteを追加
        // （.evnoteは予定のメモ等でも使われる共有クラスのため、そちらは変更しない）
        <div className="evnote pubnote" style={{ margin: "12px 2px 4px" }}>
          {board.matchesPublic
            ? "選手・保護者に公開中（設定で変更できます）"
            : "選手・保護者に非公開（設定で変更できます）"}
        </div>
      )}

      {/* p14 §2-3: 大会の select／チップ列・「大会を登録・管理」・グループのチップ列は絞り込みパネル
          (RecFilterPanel。PCは左の .rosside、スマホはヘッダーの「絞り込み」のシート)へ移した。
          PCで列を畳んでいる間だけ、一覧の先頭の「絞り込み」ボタンで列を開く */}
      {showFilterBtn && (
        <div className="rostop">
          <button type="button" className="rosfilterbtn" onClick={onFilter}>
            <IconFilter />
            絞り込み
            {filterOn && <span className="dot" />}
          </button>
        </div>
      )}
      {/* 選択中の 1 行（名簿の .rossel と同じ文法。グループ→大会の順。未選択は「すべて」） */}
      <div className="rossel">
        {selParts.length === 0
          ? "すべて"
          : selParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " ・ "}
                {part}
              </Fragment>
            ))}
      </div>

      {/* p14 §3-3: 順位表の入口（PCのスタッフは右ペインに表があるので出さない）。押すと leagueView シート */}
      {!(pc && isCoach) && (
        <button type="button" className="phublink lglink" onClick={onOpenLeague}>
          <span>{leagueTitle}</span>
          <span className="lglink-v">
            {leaguePos.rank != null ? `${leaguePos.rank}位 / ${leaguePos.size}チーム` : "未登録"} ›
          </span>
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

      {/* mobile-redesign-v2 §3-3: PC・スマホともヘッダーの「＋ 試合結果を記録」に一本化した
          ため、ページ内の全幅緑ボタンは出さない（PCは元々!pcで非表示だったため変更なし） */}

      {matches.length === 0 ? (
        <div className="empty-msg">
          {/* review #1回目: グループ絞り込みで0件になっても既存文言のままだと「記録が
              無い」と誤読される（記録自体は他に存在する）。大会フィルタは既存のまま
              （組み合わせだと原因が曖昧になるため） */}
          {/* p15 §2: 期間だけで 0 件（他の条件が無い）のときは専用の文言。条件が重なるときは今のまま */}
          {period !== "all" && cmp === "all" && !matchGroup
            ? "この期間の試合記録はありません。"
            : matchGroup && cmp === "all"
              ? "このグループの試合記録はありません。"
              : "まだ試合記録がありません。"}
        </div>
      ) : (
        <div className="reclist">
          {matches.map((m) => {
            const win = m.ourScore > m.theirScore;
            const draw = m.ourScore === m.theirScore;
            const selected = recSel?.kind === "match" && recSel.id === m.id;
            return (
              <div
                key={m.id}
                className={`matchcard${selected ? " sel" : ""}`}
                // p14 §2-3: クリック処理は onOpenMatch に一本化。キーボード(Enter/Space)でも開く
                role="button"
                tabIndex={0}
                onClick={() => onOpenMatch(m.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenMatch(m.id);
                  }
                }}
              >
                <div className={`mres ${win ? "w" : draw ? "d" : "l"}`}>{win ? "勝" : draw ? "分" : "敗"}</div>
                <div className="mmid">
                  <div className="mopp">
                    {/* p14 §4: 相手名だけを 1 行で省略できるよう包む（バッジは後ろのまま） */}
                    <span className="moppname">vs {m.opponent}</span>
                    {/* groups-phase2 §3-3: 対象バッジ（全体のときは出さない） */}
                    <MatchGroupsBadge m={m} groups={team.groups} />
                  </div>
                  <div className="msub">
                    {fmtDate(m.date)}
                    {cmpName(m) ? ` ・ ${cmpName(m)}` : ""}
                    {halfLabel(m) ? ` ・ ${halfLabel(m)}` : ""}
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

/** player-hub §2-1: 名簿の絞り込み（ポジション区分・状態。学年／グループは useGroupFilter("roster")） */
type RosPos = "all" | Group;
type RosStatus = "all" | "injured" | "captain";
const ROS_POS_OPTIONS: { key: RosPos; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "gk", label: "GK" },
  { key: "df", label: "DF" },
  { key: "mf", label: "MF" },
  { key: "fw", label: "FW" },
];
const ROS_STATUS_OPTIONS: { key: RosStatus; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "injured", label: "怪我中" },
  { key: "captain", label: "キャプテン" },
];

/**
 * 試合記録の絞り込みの中身（p14 §2-1）。名簿の RosterFilterPanel と同じ器・同じ .rosf* のクラスで、
 * PCは試合記録タブの左の常設列(.rosside)、スマホは下からのシート(RosterFilterSheet)の中身になる。
 * 大会は右に四角のチェック、学年・グループは左に色の丸チェック（どちらも単一選択）。
 * 「大会を登録・管理…」は大会セクションの直下、「絞り込みを編集…」は一番下（どちらもスタッフだけ）
 */
function RecFilterPanel({
  comps,
  hasOther,
  cmp,
  onCmp,
  period,
  onPeriod,
  groups,
  groupId,
  onGroup,
  onManageCompetitions,
  onManageGroups,
}: {
  comps: Competition[];
  /** 大会に属さない試合があるか（「その他」の行を出す） */
  hasOther: boolean;
  /** 選択中の大会。"all"=すべて／"none"=その他／それ以外は大会ID */
  cmp: string;
  onCmp: (v: string) => void;
  /** p15 §2: 期間（単一選択。右に四角のチェック） */
  period: RecPeriod;
  onPeriod: (v: RecPeriod) => void;
  groups: TeamGroup[];
  /** 選択中の学年／グループのID。null=すべて */
  groupId: string | null;
  onGroup: (id: string | null) => void;
  onManageCompetitions?: () => void;
  onManageGroups?: () => void;
}) {
  const grades = groups.filter((g) => g.kind === "grade");
  const customs = groups.filter((g) => g.kind === "custom");
  // color: undefined=大会の行（右に四角のチェック）／文字列=学年・グループの行（左に色の丸チェック。「すべて」だけ --mut）
  const row = (key: string, label: string, on: boolean, onClick: () => void, color?: string) => (
    <button key={key} type="button" className={`rosfrow${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      {color !== undefined && (
        <span
          className={`calchk${on ? " on" : ""}`}
          style={{ background: on ? color : "transparent", borderColor: on ? "transparent" : color }}
        />
      )}
      <span className="rosfname">{label}</span>
      {color === undefined && <span className={`calchk sq${on ? " on" : ""}`} />}
    </button>
  );
  const sec = (title: string, rows: React.ReactNode) => (
    <div className="rosfsec" key={title}>
      <div className="rosfsec-h">{title}</div>
      <div className="rosfrows">{rows}</div>
    </div>
  );
  const groupRows = (list: TeamGroup[]) =>
    list.map((g) => row(g.id, g.label, groupId === g.id, () => onGroup(g.id), g.color ?? "var(--mut)"));
  const allRow = row("g-all", "すべて", groupId === null, () => onGroup(null), "var(--mut)");
  const hasComps = comps.length > 0 || hasOther;
  return (
    <div className="rosfpanel">
      {hasComps &&
        sec("大会", [
          row("c-all", "すべて", cmp === "all", () => onCmp("all")),
          ...comps.map((c) => row(`c-${c.id}`, c.name, cmp === c.id, () => onCmp(c.id))),
          ...(hasOther ? [row("c-none", "その他", cmp === "none", () => onCmp("none"))] : []),
        ])}
      {/* 大会が 0 件で「その他」も無いときは、スタッフにだけ「大会を登録・管理…」を見出しなしで出す */}
      {onManageCompetitions && (
        <button type="button" className="rosfmanage" onClick={onManageCompetitions}>
          大会を登録・管理…
        </button>
      )}
      {/* p15 §2: 期間は大会・グループが 0 件でも常に出す（大会 →「大会を登録・管理…」→ 期間 → 学年 → グループ） */}
      {sec(
        "期間",
        REC_PERIOD_OPTIONS.map((o) => row(`pr-${o.key}`, o.label, period === o.key, () => onPeriod(o.key)))
      )}
      {grades.length > 0 && sec("学年", [allRow, ...groupRows(grades)])}
      {customs.length > 0 && sec("グループ", [...(grades.length === 0 ? [allRow] : []), ...groupRows(customs)])}
      {/* p14 §1-1: 「絞り込みを編集…」はパネルの一番下 */}
      {onManageGroups && (
        <button type="button" className="rosfmanage" onClick={onManageGroups}>
          絞り込みを編集…
        </button>
      )}
    </div>
  );
}

/**
 * 名簿の絞り込みの中身（player-hub §2-1）。PCは名簿タブの左の常設列(.rosside)、スマホは下からのシート
 * (RosterFilterSheet)の中身として、同じ部品をどちらからも呼ぶ。行の文法は提出の NotebookFilterPanel と同じ
 * （学年・グループは左に色の丸チェック、ポジション・状態は右に四角のチェック。いずれも単一選択）。
 * CSS は .teamapp でも効くよう .rosf* の名前で用意してある
 */
function RosterFilterPanel({
  groups,
  groupId,
  onGroup,
  pos,
  onPos,
  status,
  onStatus,
  onManageGroups,
}: {
  groups: TeamGroup[];
  /** 選択中の学年／グループのID。null=すべて */
  groupId: string | null;
  onGroup: (id: string | null) => void;
  pos: RosPos;
  onPos: (v: RosPos) => void;
  status: RosStatus;
  onStatus: (v: RosStatus) => void;
  /** 「絞り込みを編集…」（グループ管理シートを開く。p14 §1-1 で文言変更・一番下へ移動） */
  onManageGroups?: () => void;
}) {
  const grades = groups.filter((g) => g.kind === "grade");
  const customs = groups.filter((g) => g.kind === "custom");
  // color: undefined=ポジション・状態の行（右に四角のチェック）／文字列=学年・グループの行（左に色の丸チェック。
  // 「すべて」だけ --mut）
  const row = (key: string, label: string, on: boolean, onClick: () => void, color?: string) => (
    <button key={key} type="button" className={`rosfrow${on ? " on" : ""}`} aria-pressed={on} onClick={onClick}>
      {color !== undefined && (
        <span
          className={`calchk${on ? " on" : ""}`}
          style={{ background: on ? color : "transparent", borderColor: on ? "transparent" : color }}
        />
      )}
      <span className="rosfname">{label}</span>
      {color === undefined && <span className={`calchk sq${on ? " on" : ""}`} />}
    </button>
  );
  const sec = (title: string, rows: React.ReactNode) => (
    <div className="rosfsec" key={title}>
      <div className="rosfsec-h">{title}</div>
      <div className="rosfrows">{rows}</div>
    </div>
  );
  const groupRows = (list: TeamGroup[]) =>
    list.map((g) => row(g.id, g.label, groupId === g.id, () => onGroup(g.id), g.color ?? "var(--mut)"));
  const allRow = row("g-all", "すべて", groupId === null, () => onGroup(null), "var(--mut)");
  return (
    <div className="rosfpanel">
      {grades.length > 0 && sec("学年", [allRow, ...groupRows(grades)])}
      {customs.length > 0 && sec("グループ", [...(grades.length === 0 ? [allRow] : []), ...groupRows(customs)])}
      {sec(
        "ポジション",
        ROS_POS_OPTIONS.map((o) => row(`p-${o.key}`, o.label, pos === o.key, () => onPos(o.key)))
      )}
      {sec(
        "状態",
        ROS_STATUS_OPTIONS.map((o) => row(`s-${o.key}`, o.label, status === o.key, () => onStatus(o.key)))
      )}
      {/* p14 §1-1: 「絞り込みを編集…」はパネルの一番下（状態の後） */}
      {onManageGroups && (
        <button type="button" className="rosfmanage" onClick={onManageGroups}>
          絞り込みを編集…
        </button>
      )}
    </div>
  );
}

/** スマホの名簿の絞り込みシート（見出し「表示する選手」＋右上「完了」）。中身は RosterFilterPanel。
 *  p14 §2-2: 試合記録の絞り込み（見出し「表示する試合」・中身は RecFilterPanel）でも共用する */
function RosterFilterSheet({
  open,
  onClose,
  title = "表示する選手",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** p14 §2-2: 試合記録でも共用するため見出しを差し替えられる（既定は名簿の「表示する選手」） */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="rosfsheet">
        <div className="rosfhead">
          <b>{title}</b>
          <button type="button" className="rosfdone" onClick={onClose}>
            完了
          </button>
        </div>
        {children}
      </div>
    </Sheet>
  );
}

function RosterTab({
  players,
  rosSel,
  onPick,
  q,
  setQ,
  group,
  pos,
  status,
  showFilterBtn,
  filterOn,
  onFilter,
}: {
  players: Player[];
  rosSel?: string | null;
  /** 行を選んだ（PC＝右ペインに個人ページ、スマホ＝個人ページを全画面で開く） */
  onPick: (id: string) => void;
  q: string;
  setQ: (v: string) => void;
  /** 絞り込み中の学年／グループ（null=すべて） */
  group: TeamGroup | null;
  pos: RosPos;
  status: RosStatus;
  /** false=PCで絞り込み列(.rosside)が開いているので「絞り込み」ボタンを出さない */
  showFilterBtn: boolean;
  /** 何か絞っているか（「絞り込み」ボタンの点） */
  filterOn: boolean;
  onFilter: () => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  const schoolStage = team.team.schoolStage ?? "elementary";
  const kw = q.trim().toLowerCase();
  const captainId = board.state.captain;
  // 他画面（ベンチのタップなど）から開いたとき、選ばれた行が一覧の画面外なら見える位置へ（見えていれば動かさない）
  useEffect(() => {
    if (pc && rosSel) document.querySelector<HTMLElement>(".roslist .sel")?.scrollIntoView({ block: "nearest" });
  }, [pc, rosSel]);
  const list = players.filter(
    (p) =>
      (!kw || p.name.toLowerCase().includes(kw) || p.position.toLowerCase().includes(kw)) &&
      (!group || playerInGroup(p, group)) &&
      (pos === "all" || groupOf(p.position) === pos) &&
      (status === "all" ||
        (status === "injured" ? (p.injuries ?? []).some((x) => x.status !== "ok") : captainId === p.id))
  );
  // 学年ごとの見出しで区切る（「中3（23）」）。学年未設定は末尾にまとめる。学年昇順、同じ学年は背番号昇順
  // （背番号なしは末尾。同じ背番号は名簿の並びのまま）
  const buckets: { grade: number | null; label: string; players: Player[] }[] = [];
  list.forEach((p) => {
    const key = p.grade ?? null;
    let bucket = buckets.find((b) => b.grade === key);
    if (!bucket) {
      bucket = { grade: key, label: key != null ? gradeLabel(schoolStage, key) : "学年未設定", players: [] };
      buckets.push(bucket);
    }
    bucket.players.push(p);
  });
  buckets.sort((a, b) => {
    if (a.grade == null) return b.grade == null ? 0 : 1;
    if (b.grade == null) return -1;
    return a.grade - b.grade;
  });
  buckets.forEach((b) =>
    b.players.sort((x, y) => (x.number ?? Number.MAX_SAFE_INTEGER) - (y.number ?? Number.MAX_SAFE_INTEGER))
  );
  // 一覧の上の「選択中」1行：絞っている条件だけを「・」でつなぐ（学年／グループはその色の点付き）
  const selParts: React.ReactNode[] = [];
  if (group) {
    selParts.push(
      <span key="g">
        <i className="rosseldot" style={{ background: group.color ?? "var(--mut)" }} />
        {group.label}
      </span>
    );
  }
  if (pos !== "all") selParts.push(ROS_POS_OPTIONS.find((o) => o.key === pos)?.label);
  if (status !== "all") selParts.push(ROS_STATUS_OPTIONS.find((o) => o.key === status)?.label);
  return (
    <>
      <div className="rostop">
        {showFilterBtn && (
          <button type="button" className="rosfilterbtn" onClick={onFilter}>
            <IconFilter />
            絞り込み
            {filterOn && <span className="dot" />}
          </button>
        )}
        <input
          className="search"
          aria-label="選手を検索"
          placeholder="名前・ポジションで検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="rossel">
        {selParts.length === 0
          ? "すべて"
          : selParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " ・ "}
                {part}
              </Fragment>
            ))}
      </div>
      {list.length === 0 ? (
        <div className="empty-msg">
          {players.length === 0 ? (
            <>
              <b>選手がいません</b>
              <br />
              {pc ? "「＋ 新規選手を追加」から追加できます" : "右上の「選手を追加」から追加できます"}
            </>
          ) : (
            <>
              <b>条件に合う選手がいません</b>
              <br />
              絞り込みや検索を変えてください
            </>
          )}
        </div>
      ) : pc ? (
        <div className="roslist">
          <table className="ptable">
            <thead>
              <tr>
                <th className="num">#</th>
                <th className="col-name">氏名</th>
                <th>位置</th>
                <th>学年</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <Fragment key={String(b.grade)}>
                  <tr className="ptable-heading">
                    <td colSpan={5}>
                      {b.label}（{b.players.length}）
                    </td>
                  </tr>
                  {b.players.map((p) => {
                    const inj = (p.injuries ?? []).find((x) => x.status !== "ok");
                    return (
                      <tr
                        key={p.id}
                        className={`ptable-row${rosSel === p.id ? " sel" : ""}`}
                        tabIndex={0}
                        onClick={() => onPick(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onPick(p.id);
                          }
                        }}
                      >
                        <td className="num">{p.number ?? "—"}</td>
                        <td className="ptable-nm col-name">
                          {p.name}
                          {captainId === p.id ? " (C)" : ""}
                          {/* 最終修正: 左ペインが狭く「グループ」列だとバッジが右端で切れるため、氏名の下に置く */}
                          <div className="ptable-sub">
                            <PlayerGroupBadges p={p} groups={team.groups} />
                          </div>
                        </td>
                        <td><span className={`pos ${groupOf(p.position)}`}>{p.position}</span></td>
                        <td>{p.grade ? gradeLabel(schoolStage, p.grade) : "—"}</td>
                        <td>{inj ? <span className={`injbadge ${inj.status}`}>{INJURY_STATUS_LABEL[inj.status]}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="roslist">
        {buckets.map((b) => (
          <div key={String(b.grade)}>
            <div className="sech">
              {b.label}（{b.players.length}）
            </div>
            {b.players.map((p) => {
              const inj = (p.injuries ?? []).find((x) => x.status !== "ok");
              return (
                <div
                  key={p.id}
                  className={`prow${rosSel === p.id ? " sel" : ""}`}
                  onClick={() => onPick(p.id)}
                >
                  <div className={`pos ${groupOf(p.position)}`}>{p.position}</div>
                  <div className="meta">
                    <div className="nm">
                      {p.name}
                      {captainId === p.id ? " (C)" : ""}
                    </div>
                    <div className="sub">
                      背番号 {p.number ?? "—"}
                      {p.grade ? ` ・ ${gradeLabel(schoolStage, p.grade)}` : ""}
                      {inj ? ` ・ ${INJURY_STATUS_LABEL[inj.status]}` : ""}
                    </div>
                    <PlayerGroupBadges p={p} groups={team.groups} />
                  </div>
                  {inj && <span className={`injbadge ${inj.status}`}>{INJURY_STATUS_LABEL[inj.status]}</span>}
                  <div className="num">{p.number ?? "–"}</div>
                </div>
              );
            })}
          </div>
        ))}
        </div>
      )}
      {/* mobile-redesign-v2 §3-3: 通常時は出さないrolebarの代わりに、名簿タブ末尾へ
          「選手・保護者の見え方を確認」を1行置く（既存のselectをそのまま使う） */}
      {!pc && board.auth.role === "coach" && (
        <div className="rosviewrow">
          <span>選手・保護者の見え方を確認</span>
          <select
            aria-label="選手・保護者の見え方を確認"
            value={team.viewer.role === "coach" ? "coach" : team.viewer.memberPlayerId ?? ""}
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
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------
   PC右ペイン共有ボディ（シートとPCペインの両方から使う）
   ---------------------------------------------------------------- */

/**
 * 出欠記録UI本体（○△×とメモ入力）。出欠シート(モバイル)とPC右ペイン(att/event)の
 * 両方から使う共有ボディ。見た目・挙動は元のシート実装のまま
 */
function AttendanceRecordBody({ eventId, players }: { eventId: string; players: Player[] }) {
  const team = useTeam();
  const ev = team.team.events.find((e) => e.id === eventId);
  const att = team.team.attendance[eventId] ?? {};
  const s = team.summary(eventId);
  const [showOut, setShowOut] = useState(false);
  const order: { key: AttendanceStatus | "none"; label: string }[] = [
    { key: "none", label: "未記録" },
    { key: "no", label: "欠席" },
    { key: "maybe", label: "未定" },
    { key: "yes", label: "出席" },
  ];
  // groups-everywhere §4: 一覧は対象選手だけ（対象外は末尾の折りたたみへ）
  const targetPlayers = ev ? players.filter((p) => eventTargetsPlayer(ev, p, team.groups)) : players;
  const nonTargetPlayers = ev ? players.filter((p) => !eventTargetsPlayer(ev, p, team.groups)) : [];
  const groups = order
    .map((g) => ({
      ...g,
      list: targetPlayers.filter((p) => (att[p.id]?.status ?? "none") === g.key),
    }))
    .filter((g) => g.list.length > 0);
  // 記録した対象外選手はoptInPlayerIdsへ追加する（以後「自分の予定」・出欠の対象になる）
  const recordAttendance = (p: Player, status: AttendanceStatus, comment: string | undefined, isOut: boolean) => {
    team.setAttendance(eventId, p.id, status, comment);
    if (isOut && ev && !(ev.optInPlayerIds ?? []).includes(p.id)) {
      team.updateEvent({ ...ev, optInPlayerIds: [...(ev.optInPlayerIds ?? []), p.id] });
    }
  };
  const renderRow = (p: Player, isOut: boolean) => {
    const cur = att[p.id];
    return (
      <div key={p.id} className="attrow">
        <div className="attname">
          {p.name}
          <small>背番号 {p.number ?? "—"}</small>
          {/* 理由・メモ: 選手の回答UI廃止に伴い、スタッフがここで記録する */}
          {cur?.status && (
            <input
              key={`${eventId}_${p.id}`}
              className="attreason"
              placeholder="メモ（遅刻・欠席理由など）"
              defaultValue={cur.comment ?? ""}
              onBlur={(e) => recordAttendance(p, cur.status, e.target.value.trim() || undefined, isOut)}
            />
          )}
        </div>
        <div className="attpick">
          {(["yes", "maybe", "no"] as AttendanceStatus[]).map((st) => (
            <button
              key={st}
              className={`attbtn ${st}${cur?.status === st ? " on" : ""}`}
              onClick={() => recordAttendance(p, st, cur?.comment, isOut)}
            >
              {STATUS_MARK[st]}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return (
    <>
      <h2>出欠の記録</h2>
      {ev && (
        <div className="mvmeta" style={{ textAlign: "left", margin: "0 16px 10px" }}>
          {ev.title} ・ {fmtDate(ev.date)}
        </div>
      )}
      <div className="attsummary">
        <span className="att yes">出席 {s.yes}</span>
        <span className="att maybe">未定 {s.maybe}</span>
        <span className="att no">欠席 {s.no}</span>
        <span className="att none">未記録 {s.none}</span>
      </div>
      {/* Phase D-1(C2-major): 対象外を展開したとき、この.list(flex:1 1 0%)がもう一方の
          .list(旧実装ではflex:1、今はflex:0 0 auto)と高さを奪い合っていた。flex:0 0 autoは
          「縮まない」指定のため、対象外側だけをflex:0 0 autoにすると内容の合計が.sheetBodyの
          高さを超えた分の縮小(flex-shrink)がすべて対象側(唯一の可縮小要素)に掛かってしまい、
          対象一覧が数行どころか十数px相当まで潰れてしまう問題が残っていた。対象外を表示中は
          こちらもflex:0 0 autoにして両方を自然な高さで縦に並べ、外側の.sheetBody
          （overflow-y:autoを既に持つ）のスクロール1本に統一する（折りたたみ時は従来どおり
          flex:1で残り領域いっぱいに表示） */}
      <div className="list" style={showOut ? { flex: "0 0 auto" } : undefined}>
        {targetPlayers.length === 0 ? (
          <div className="empty-msg">対象の選手がいません。</div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className={`attgh ${g.key}`}>
                {g.label} {g.list.length}人
              </div>
              {g.list.map((p) => renderRow(p, false))}
            </div>
          ))
        )}
      </div>
      {nonTargetPlayers.length > 0 && (
        <>
          <button className="dynadd" style={{ margin: "10px 0" }} onClick={() => setShowOut((v) => !v)}>
            {showOut ? "対象外の選手を隠す" : `対象外の選手（${nonTargetPlayers.length}）`}
          </button>
          {showOut && (
            <div className="list" style={{ flex: "0 0 auto" }}>
              {nonTargetPlayers.map((p) => renderRow(p, true))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------
   試合記録タブ・PC右ペイン
   ---------------------------------------------------------------- */

/** p14 §3-4: 編集シートの 1 行（数値は入力中の文字列） */
type LeagueDraftRow = { id: string; name: string; own?: true; win: string; draw: string; loss: string; gf: string; ga: string };
const LEAGUE_NUM_KEYS = ["win", "draw", "loss", "gf", "ga"] as const;
const LEAGUE_NUM_LABEL: Record<(typeof LEAGUE_NUM_KEYS)[number], string> = {
  win: "勝",
  draw: "分",
  loss: "敗",
  gf: "得点",
  ga: "失点",
};
/** 編集の初期行。並びは今の順位順。自チームの行が無いデータ（壊れた・全部消した）は先頭に補う */
function leagueDraftRows(league: LeagueTable, ownName: string): LeagueDraftRow[] {
  const rows: LeagueDraftRow[] = computeStandings(league, ownName).map((r) => ({
    id: r.id,
    name: r.name,
    ...(r.own ? { own: true as const } : {}),
    win: String(r.win),
    draw: String(r.draw),
    loss: String(r.loss),
    gf: String(r.gf),
    ga: String(r.ga),
  }));
  if (!rows.some((r) => r.own)) {
    rows.unshift({
      id: "lg_" + Date.now().toString(36) + "_own",
      name: ownName,
      own: true,
      win: "0",
      draw: "0",
      loss: "0",
      gf: "0",
      ga: "0",
    });
  }
  return rows;
}
/** 空欄＝0、全角数字も受ける。0 以上の整数だけ（それ以外は null） */
function parseLeagueInt(v: string): number | null {
  const t = v.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (t === "") return 0;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** p14 §3: 順位表（順位／チーム／試合／勝／分／敗／得失／勝点）。PCの右ペインとスマホ・選手の leagueView シートで共用 */
function LeagueTableView({ rows }: { rows: Standing[] }) {
  return (
    <div className="leaguewrap">
      <table className="ptable leaguetable">
        <thead>
          <tr>
            <th className="num">順位</th>
            <th className="col-name">チーム</th>
            <th className="num">試合</th>
            <th className="num">勝</th>
            <th className="num">分</th>
            <th className="num">敗</th>
            <th className="num">得失</th>
            <th className="num">勝点</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.own ? "own" : undefined}>
              <td className="num">{r.rank}</td>
              <td className="col-name">{r.name}</td>
              <td className="num">{r.played}</td>
              <td className="num">{r.win}</td>
              <td className="num">{r.draw}</td>
              <td className="num">{r.loss}</td>
              <td className="num">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
              <td className="num leaguepts">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** RecSummaryPaneのkpicard2で切り替える月別推移の指標。既定は勝率 */
type RecKpiMetric = "played" | "winPct" | "goals" | "conceded";
/** RecSummaryPane先頭のセグメント。既定=チーム成績 */
type RecSummaryMode = "team" | "player";

/** summary: 大会フィルタ適用後のチーム成績(順位表+サイド)・個人成績(各種ランキング)を
    先頭の.tsegセグメントで切り替える */
function RecSummaryPane({
  cmp,
  matchGroup,
  period,
  players,
  setRecSel,
  setSheet,
}: {
  cmp: string;
  /** groups-phase2 §3-3: 絞り込み中グループ（単一選択。nullは「すべて」） */
  matchGroup: string | null;
  /** p15 §2: 期間の絞り込み（allMatches の時点で掛ける。大会別成績もこの母集合） */
  period: RecPeriod;
  players: Player[];
  setRecSel: (s: RecSel) => void;
  /** p14 §3-2: 順位表の鉛筆から編集シートを開く */
  setSheet: (s: SheetState) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  // p14 §3: 順位表（計算済み。自チームの行はチーム名へ差し替え）
  const standings = computeStandings(team.league, board.state.teamName ?? "マイチーム");
  const [mode, setMode] = useState<RecSummaryMode>("team");
  const [recMetric, setRecMetric] = useState<RecKpiMetric>("winPct");
  const comps = team.team.competitions;
  // groups-phase2 §3-3: グループ絞り込みを先に適用し、大会別成績(byComp)もこの母集合から計算する
  // p15 §2: 期間もここで掛ける（大会別成績 byComp もこの母集合）
  const today = todayStr();
  const allMatches = team.team.matches.filter(
    (m) => matchTargetsGroup(m, matchGroup) && matchInPeriod(m.date, period, today)
  );
  const matches = allMatches.filter((m) =>
    cmp === "all" ? true : cmp === "none" ? !m.competitionId : m.competitionId === cmp
  );
  const sum = matchSummary(matches);
  const cleanSheets = matches.filter((m) => m.theirScore === 0).length;
  const avgGf = sum.played ? (sum.gf / sum.played).toFixed(1) : "0.0";
  const trend = matchMonthlyTrend(matches);
  const tech = aggregateTech(board.notebook);
  const byComp = [
    ...comps.map((c) => ({ id: c.id, name: c.name, ms: allMatches.filter((m) => m.competitionId === c.id) })),
    ...(allMatches.some((m) => !m.competitionId)
      ? [{ id: "none", name: "その他", ms: allMatches.filter((m) => !m.competitionId) }]
      : []),
  ].filter((g) => g.ms.length > 0);
  const paneTitle =
    cmp === "all" ? "チーム成績" : cmp === "none" ? "その他" : comps.find((c) => c.id === cmp)?.name ?? "サマリー";

  return (
    <div className="tmdetail screenbody recwide">
      <h2>{paneTitle}</h2>
      {/* チーム成績(順位表+サイド) / 個人成績(各種ランキング)の切替。既存の.tseg文法を流用 */}
      <div className="toolseg recmodeseg" role="tablist" aria-label="表示切替">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "team"}
          className={`tseg${mode === "team" ? " on" : ""}`}
          onClick={() => setMode("team")}
        >
          チーム成績
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "player"}
          className={`tseg${mode === "player" ? " on" : ""}`}
          onClick={() => setMode("player")}
        >
          個人成績
        </button>
      </div>

      {mode === "player" ? (
        <RecPlayerRankingsBody players={players} matches={matches} />
      ) : (
        /* 2カラム化: 左(主役・広い)=リーグ順位表 / 右(サイド)=既存サマリーの縦積み。
           リーグ順位表はチームの順位表(p14 §3。未保存は lib/sampleLeague.ts の既定値)。大会フィルタ(cmp)には連動せず常に全体を表示する */
        <div className="recsplit">
          <div className="recleague">
            {/* p14 §3-2: 見出し行＋鉛筆（順位表の編集シートを開く）。0 チームなら表の代わりに案内 */}
            <div className="leaguehead">
              <div className="sech">{team.league.title || "リーグ順位表"}</div>
              <button
                type="button"
                className="phubedit"
                aria-label="順位表を編集"
                title="順位表を編集"
                onClick={() => setSheet({ type: "league" })}
              >
                <IconEdit />
              </button>
            </div>
            <LastUpdated at={team.league.updatedAt} by={team.league.updatedBy} />
            {standings.length === 0 ? (
              <div className="empty-msg">順位表が未登録です。右上の編集から登録できます。</div>
            ) : (
              <LeagueTableView rows={standings} />
            )}
          </div>

          <div className="recside">
            {matches.length === 0 ? (
              <div className="empty-msg">
                {/* p15 §2: 期間だけで 0 件（他の条件が無い）のときは専用の文言。条件が重なるときは今のまま */}
                {period !== "all" && cmp === "all" && !matchGroup
                  ? "この期間の試合記録はありません。"
                  : matchGroup && cmp === "all"
                    ? "このグループの試合記録はありません。"
                    : "まだ試合記録がありません。"}
              </div>
            ) : (
              <>
                {/* KPIタイル×グラフ(GSC型)。タイル1枚が選択中の指標=グラフの系列を兼ねる(既定=勝率) */}
                <div className="kpicard2">
                  <div className="kpiband">
                    <button
                      type="button"
                      className={`kpitile${recMetric === "played" ? " on" : ""}`}
                      onClick={() => setRecMetric("played")}
                    >
                      <div className="kv">{sum.played}</div>
                      <div className="kl">試合数</div>
                    </button>
                    <button
                      type="button"
                      className={`kpitile${recMetric === "winPct" ? " on" : ""}`}
                      onClick={() => setRecMetric("winPct")}
                    >
                      <div className="kv">{sum.winPct ?? 0}%</div>
                      <div className="kl">勝率</div>
                    </button>
                    <button
                      type="button"
                      className={`kpitile${recMetric === "goals" ? " on" : ""}`}
                      onClick={() => setRecMetric("goals")}
                    >
                      <div className="kv">{sum.gf}</div>
                      <div className="kl">得点</div>
                    </button>
                    <button
                      type="button"
                      className={`kpitile${recMetric === "conceded" ? " on" : ""}`}
                      onClick={() => setRecMetric("conceded")}
                    >
                      <div className="kv">{sum.ga}</div>
                      <div className="kl">失点</div>
                    </button>
                  </div>
                  <div className="kpichart">
                    <div className="sech">
                      {recMetric === "played"
                        ? "月別試合数の推移（直近6ヶ月）"
                        : recMetric === "winPct"
                        ? "月別勝率の推移（直近6ヶ月・%）"
                        : recMetric === "goals"
                        ? "月別得点の推移（直近6ヶ月）"
                        : "月別失点の推移（直近6ヶ月）"}
                    </div>
                    <LineChart
                      data={trend.map((t) => ({ label: t.label, value: t[recMetric] }))}
                      max={recMetric === "winPct" ? 100 : undefined}
                      detailed
                    />
                  </div>
                </div>

                <div className="hdash">
                  <div className="hstat"><div className="hstat-n ev">{sum.wins}-{sum.draws}-{sum.losses}</div><div className="hstat-l">勝-分-敗</div></div>
                  <div className="hstat"><div className="hstat-n">{sum.gf - sum.ga}</div><div className="hstat-l">得失点差</div></div>
                  <div className="hstat"><div className="hstat-n">{cleanSheets}</div><div className="hstat-l">クリーンシート</div></div>
                  <div className="hstat"><div className="hstat-n">{avgGf}</div><div className="hstat-l">1試合平均得点</div></div>
                </div>

                <div className="sech">チーム技術</div>
                <div className="evnote">選手が提出した試合ノートの記録から集計しています。</div>
                <div className="hdash">
                  <div className="hstat">
                    <div className="hstat-n">{tech.shotPct ?? "—"}{tech.shotPct != null ? "%" : ""}</div>
                    <div className="hstat-l">シュート決定率（{tech.goals}/{tech.shots}）</div>
                  </div>
                  <div className="hstat">
                    <div className="hstat-n">{tech.passPct ?? "—"}{tech.passPct != null ? "%" : ""}</div>
                    <div className="hstat-l">パス成功率（{tech.passOk}/{tech.pass}）</div>
                  </div>
                  <div className="hstat">
                    <div className="hstat-n">{tech.dribblePct ?? "—"}{tech.dribblePct != null ? "%" : ""}</div>
                    <div className="hstat-l">ドリブル成功率（{tech.dribbleOk}/{tech.dribble}）</div>
                  </div>
                </div>

                {byComp.length > 0 && (
                  <>
                    <div className="sech">大会別成績</div>
                    <div className="list">
                      {byComp.map((g) => {
                        const gs = matchSummary(g.ms);
                        return (
                          <div key={g.id} className="cmprow">
                            <div className="cmpinfo">
                              <div className="cmpnm">{g.name}</div>
                              <div className="cmpsub">
                                {gs.played}試合 ・ {gs.wins}-{gs.draws}-{gs.losses} ・ 得点{gs.gf}-失点{gs.ga}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 個人成績モード: lib/playerStats.rankings の各ランキング(得点/アシスト/シュート決定率/
 * パス成功率/ドリブル成功率/出場数)を.ptable文法の表で並べる。行クリックで名簿の選手詳細へ
 * (board.setTeamIntentによるros導線。Bench.tsx等の既存呼び出しと同じ経路)。
 * 順位表・サイドのKPIは出さない(R1仕様)
 */
function RecPlayerRankingsBody({
  players,
  matches,
}: {
  players: Player[];
  matches: MatchRecord[];
}) {
  const board = useBoard();
  const ranks = rankings(players, matches, board.notebook);
  const techByPlayer = useMemo(
    () => new Map(perPlayerTech(board.notebook, players).map((r) => [r.playerId, r])),
    [board.notebook, players]
  );
  const goToPlayer = (playerId: string) => board.setTeamIntent({ tab: "ros", playerId });

  if (players.length === 0) {
    return <div className="empty-msg">選手がいません。</div>;
  }

  return (
    <>
      <div className="sech">得点</div>
      {ranks.goals.length === 0 ? (
        <div className="empty-msg">記録がありません。</div>
      ) : (
        <table className="ptable">
          <thead>
            <tr>
              <th className="num">順位</th>
              <th className="col-name">選手</th>
              <th className="num">得点</th>
            </tr>
          </thead>
          <tbody>
            {ranks.goals.map((r) => (
              <tr key={r.playerId} onClick={() => goToPlayer(r.playerId)}>
                <td className="num">{r.rank}</td>
                <td className="col-name">{r.name}</td>
                <td className="num">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="sech">アシスト</div>
      {ranks.assists.length === 0 ? (
        <div className="empty-msg">記録がありません。</div>
      ) : (
        <table className="ptable">
          <thead>
            <tr>
              <th className="num">順位</th>
              <th className="col-name">選手</th>
              <th className="num">アシスト</th>
            </tr>
          </thead>
          <tbody>
            {ranks.assists.map((r) => (
              <tr key={r.playerId} onClick={() => goToPlayer(r.playerId)}>
                <td className="num">{r.rank}</td>
                <td className="col-name">{r.name}</td>
                <td className="num">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="sech">シュート決定率</div>
      <div className="evnote">選手が提出した試合ノートの記録から集計しています。</div>
      {ranks.shotPct.length === 0 ? (
        <div className="empty-msg">対象の選手がいません。</div>
      ) : (
        <>
          <table className="ptable">
            <thead>
              <tr>
                <th className="num">順位</th>
                <th className="col-name">選手</th>
                <th className="num">シュート数</th>
                <th className="num">得点</th>
                <th className="num">決定率</th>
              </tr>
            </thead>
            <tbody>
              {ranks.shotPct.map((r) => {
                const t = techByPlayer.get(r.playerId);
                return (
                  <tr key={r.playerId} onClick={() => goToPlayer(r.playerId)}>
                    <td className="num">{r.rank}</td>
                    <td className="col-name">{r.name}</td>
                    <td className="num">{t?.shots ?? 0}</td>
                    <td className="num">{t?.goals ?? 0}</td>
                    <td className="num">{r.value}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="evnote">シュート{SHOT_PCT_MIN_ATTEMPTS}本以上が対象です。</div>
        </>
      )}

      <div className="sech">パス成功率</div>
      {ranks.passPct.length === 0 ? (
        <div className="empty-msg">対象の選手がいません。</div>
      ) : (
        <>
          <table className="ptable">
            <thead>
              <tr>
                <th className="num">順位</th>
                <th className="col-name">選手</th>
                <th className="num">試行</th>
                <th className="num">成功</th>
                <th className="num">成功率</th>
              </tr>
            </thead>
            <tbody>
              {ranks.passPct.map((r) => {
                const t = techByPlayer.get(r.playerId);
                return (
                  <tr key={r.playerId} onClick={() => goToPlayer(r.playerId)}>
                    <td className="num">{r.rank}</td>
                    <td className="col-name">{r.name}</td>
                    <td className="num">{t?.pass ?? 0}</td>
                    <td className="num">{t?.passOk ?? 0}</td>
                    <td className="num">{r.value}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="evnote">パス{PASS_PCT_MIN_ATTEMPTS}本以上が対象です。</div>
        </>
      )}

      <div className="sech">ドリブル成功率</div>
      {ranks.dribblePct.length === 0 ? (
        <div className="empty-msg">対象の選手がいません。</div>
      ) : (
        <>
          <table className="ptable">
            <thead>
              <tr>
                <th className="num">順位</th>
                <th className="col-name">選手</th>
                <th className="num">試行</th>
                <th className="num">成功</th>
                <th className="num">成功率</th>
              </tr>
            </thead>
            <tbody>
              {ranks.dribblePct.map((r) => {
                const t = techByPlayer.get(r.playerId);
                return (
                  <tr key={r.playerId} onClick={() => goToPlayer(r.playerId)}>
                    <td className="num">{r.rank}</td>
                    <td className="col-name">{r.name}</td>
                    <td className="num">{t?.dribble ?? 0}</td>
                    <td className="num">{t?.dribbleOk ?? 0}</td>
                    <td className="num">{r.value}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="evnote">ドリブル{DRIBBLE_PCT_MIN_ATTEMPTS}回以上が対象です。</div>
        </>
      )}

      <div className="sech">出場数</div>
      {!matches.some((m) => (m.lineup ?? []).length > 0) ? (
        <div className="empty-msg">出場記録がありません。</div>
      ) : ranks.apps.length === 0 ? (
        <div className="empty-msg">記録がありません。</div>
      ) : (
        <table className="ptable">
          <thead>
            <tr>
              <th className="num">順位</th>
              <th className="col-name">選手</th>
              <th className="num">出場</th>
            </tr>
          </thead>
          <tbody>
            {ranks.apps.map((r) => (
              <tr key={r.playerId} onClick={() => goToPlayer(r.playerId)}>
                <td className="num">{r.rank}</td>
                <td className="col-name">{r.name}</td>
                <td className="num">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** match: 試合の詳細（MatchHub。p14 §5-2）＋「‹ サマリー」戻りリンク。カードで包まず名簿の個人ページと同じ置き方 */
function RecMatchPane({
  id,
  players,
  setRecSel,
  setSheet,
  isCoach,
  section,
  onSection,
}: {
  id: string;
  players: Player[];
  setRecSel: (s: RecSel) => void;
  setSheet: (s: SheetState) => void;
  isCoach: boolean;
  section: MatchHubSection;
  onSection: (s: MatchHubSection) => void;
}) {
  const team = useTeam();
  const m = team.team.matches.find((x) => x.id === id);
  return (
    <div className="mhubpane">
      <div className="tmback" onClick={() => setRecSel({ kind: "summary" })}>
        ‹ サマリー
      </div>
      <MatchHub
        key={id}
        matchId={id}
        players={players}
        canEdit={isCoach}
        onEdit={() => m && setSheet({ type: "match", record: m })}
        onDeleted={() => setRecSel({ kind: "summary" })}
        section={section}
        onSection={onSection}
      />
    </div>
  );
}

/** player: 選手名ヘッダ＋「‹ サマリー」/ 得点・アシスト内訳 / 技術 / 試合別推移 / 出席率 */
function RecPlayerPane({
  id,
  players,
  setRecSel,
}: {
  id: string;
  players: Player[];
  setRecSel: (s: RecSel) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const p = players.find((x) => x.id === id);

  // 得点・アシストの試合別内訳（goals走査。既存898-923と同じ走査方針を選手個人向けに使う）
  type Row = { matchId: string; date: string; opponent: string; goals: number; assists: number };
  const rowsMap = new Map<string, Row>();
  let totalGoals = 0;
  let totalAssists = 0;
  team.team.matches.forEach((m) => {
    m.goals.forEach((g) => {
      if (g.playerId === id) {
        totalGoals++;
        const row = rowsMap.get(m.id) ?? { matchId: m.id, date: m.date, opponent: m.opponent, goals: 0, assists: 0 };
        row.goals++;
        rowsMap.set(m.id, row);
      }
      if (g.assistPlayerId === id) {
        totalAssists++;
        const row = rowsMap.get(m.id) ?? { matchId: m.id, date: m.date, opponent: m.opponent, goals: 0, assists: 0 };
        row.assists++;
        rowsMap.set(m.id, row);
      }
    });
  });
  const rows = Array.from(rowsMap.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

  const techRow = perPlayerTech(board.notebook, players).find((r) => r.playerId === id);
  // perMatchTechは新しい順のため、時系列グラフ用に古い順へ反転する
  const matchTech = [...perMatchTech(board.notebook, id)].reverse();
  const rate = attendanceRate(team.team, id, players);

  return (
    <div className="tmdetail screenbody">
      <div className="tmback" onClick={() => setRecSel({ kind: "summary" })}>
        ‹ サマリー
      </div>
      {!p ? (
        <div className="empty-msg">この選手は見つかりません。</div>
      ) : (
        <>
          <h2>
            {p.name}
            <span>{p.position}</span>
          </h2>

          <div className="hdash">
            <div className="hstat"><div className="hstat-n">{totalGoals}</div><div className="hstat-l">総得点</div></div>
            <div className="hstat"><div className="hstat-n">{totalAssists}</div><div className="hstat-l">総アシスト</div></div>
            <div className="hstat">
              <div className="hstat-n">{rate.pct}%</div>
              <div className="hstat-l">出席率（{rate.yes}/{rate.total}）</div>
            </div>
          </div>

          <div className="sech">試合別の得点・アシスト</div>
          {rows.length === 0 ? (
            <div className="empty-msg">記録がありません。</div>
          ) : (
            <div className="list">
              {rows.map((r) => (
                <div key={r.matchId} className="cmprow">
                  <div className="cmpinfo">
                    <div className="cmpnm">vs {r.opponent}</div>
                    <div className="cmpsub">{fmtDate(r.date)}</div>
                  </div>
                  <div className="sgoals">
                    {r.goals > 0 ? `${r.goals}点` : ""}
                    {r.goals > 0 && r.assists > 0 ? " ・ " : ""}
                    {r.assists > 0 ? `${r.assists}A` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="sech">技術（試合ノート集計）</div>
          <div className="evnote">選手が提出した試合ノートの記録から集計しています。</div>
          <div className="hdash">
            <div className="hstat">
              <div className="hstat-n">{techRow?.shotPct ?? "—"}{techRow?.shotPct != null ? "%" : ""}</div>
              <div className="hstat-l">決定率（{techRow?.goals ?? 0}/{techRow?.shots ?? 0}）</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">{techRow?.passPct ?? "—"}{techRow?.passPct != null ? "%" : ""}</div>
              <div className="hstat-l">パス成功率（{techRow?.passOk ?? 0}/{techRow?.pass ?? 0}）</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">{techRow?.dribblePct ?? "—"}{techRow?.dribblePct != null ? "%" : ""}</div>
              <div className="hstat-l">ドリブル成功率（{techRow?.dribbleOk ?? 0}/{techRow?.dribble ?? 0}）</div>
            </div>
          </div>

          {matchTech.length >= 2 && (
            <>
              <div className="sech">試合ごとの推移（シュート・ゴール）</div>
              <LineChart
                data={matchTech.map((t) => ({ label: fmtMD(t.date), value: t.shots }))}
                secondary={{ label: "ゴール", values: matchTech.map((t) => t.goals) }}
                primaryLabel="シュート"
                detailed
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 出欠タブ・PC右ペイン ---------------- */

/** AttOverviewPaneのkpicard2で切り替える月別推移の指標。既定は平均出席率 */
type AttKpiMetric = "pct" | "recorded";

/** overview: 期間チップ＋平均出席率・月別推移・学年別・個人別ランキング */
function AttOverviewPane({
  players,
  attPeriod,
  setAttPeriod,
  setAttSel,
}: {
  players: Player[];
  attPeriod: AttPeriod;
  setAttPeriod: (p: AttPeriod) => void;
  setAttSel: (s: AttSel) => void;
}) {
  const team = useTeam();
  const [attMetric, setAttMetric] = useState<AttKpiMetric>("pct");
  const today = todayStr();
  const rows = perPlayerAttendance(team.team, players, attPeriod);
  const totalRecorded = rows.reduce((s, r) => s + r.recorded, 0);
  const totalYes = rows.reduce((s, r) => s + r.yes, 0);
  const avgPct = totalRecorded ? Math.round((totalYes / totalRecorded) * 100) : 0;
  const start = periodStartDate(attPeriod, today);
  const recordedEvents = team.team.events.filter((e) => {
    if (e.date > today) return false;
    if (start && e.date < start) return false;
    return players.some((p) => team.team.attendance[e.id]?.[p.id]?.status);
  }).length;

  const monthly = monthlyAttendance(team.team, players, 6);
  // groups-everywhere §4: 「学年別」→「グループ別」（学年グループ＋カスタムグループ）に拡張。
  // Phase D-1(C1-minor): groupAttendanceは所属0人のグループ(旧データで自動生成される
  // 学年1〜6等)も含めて返すため、そのまま並べると「小1（0人）0%」のような空行が並ぶ。
  // 表示側で除外し、代わりにどのグループにも属さない選手がいる場合だけ末尾に「未所属」行を
  // 足す（旧gradeAttendanceの「学年未設定」行に相当する情報量を保つ）
  const groupRows = groupAttendance(team.team, players, attPeriod).filter((g) => g.playerCount > 0);
  const unassignedPlayers = players.filter((p) => !team.groups.some((g) => playerInGroup(p, g)));
  if (unassignedPlayers.length > 0) {
    const unassignedIds = new Set(unassignedPlayers.map((p) => p.id));
    const unassignedRows = rows.filter((r) => unassignedIds.has(r.playerId));
    const recorded = unassignedRows.reduce((s, r) => s + r.recorded, 0);
    const yes = unassignedRows.reduce((s, r) => s + r.yes, 0);
    groupRows.push({
      groupId: "__unassigned",
      kind: "custom",
      label: "未所属",
      yes,
      recorded,
      pct: recorded ? Math.round((yes / recorded) * 100) : 0,
      playerCount: unassignedPlayers.length,
    });
  }
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";
  const ranking = [...rows].sort((a, b) => b.pct - a.pct || b.recorded - a.recorded);

  const periodChips: { key: AttPeriod; label: string }[] = [
    { key: "all", label: "全期間" },
    { key: "m1", label: "1ヶ月" },
    { key: "m3", label: "3ヶ月" },
    { key: "m6", label: "6ヶ月" },
  ];

  return (
    <div className="tmdetail screenbody">
      <h2>出欠サマリー</h2>
      <div className="cmpbar">
        {periodChips.map((c) => (
          <button
            key={c.key}
            className={`cmpchip${attPeriod === c.key ? " on" : ""}`}
            onClick={() => setAttPeriod(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* KPIタイル×グラフ(GSC型)。タイル1枚が選択中の指標=グラフの系列を兼ねる(既定=平均出席率) */}
      <div className="kpicard2">
        <div className="kpiband">
          <button
            type="button"
            className={`kpitile${attMetric === "pct" ? " on" : ""}`}
            onClick={() => setAttMetric("pct")}
          >
            <div className="kv">{avgPct}%</div>
            <div className="kl">平均出席率</div>
          </button>
          <button
            type="button"
            className={`kpitile${attMetric === "recorded" ? " on" : ""}`}
            onClick={() => setAttMetric("recorded")}
          >
            <div className="kv">{recordedEvents}</div>
            <div className="kl">記録済み予定</div>
          </button>
        </div>
        <div className="kpichart">
          <div className="sech">
            {attMetric === "pct" ? "月別出席率の推移（直近6ヶ月）" : "月別の記録済み予定数（直近6ヶ月）"}
          </div>
          {/* タイル(予定件数)とグラフの単位を揃える: recordedはエントリ数のためeventsを使う */}
          <LineChart
            data={monthly.map((m) => ({ label: m.label, value: attMetric === "pct" ? m.pct : m.events }))}
            max={attMetric === "pct" ? 100 : undefined}
            detailed
          />
        </div>
      </div>

      <div className="sech">グループ別出席率</div>
      {groupRows.length === 0 ? (
        <div className="empty-msg">グループがありません。</div>
      ) : (
        <div className="list">
          {groupRows.map((g) => (
            <div key={g.groupId} className="attbarrow">
              <span className="attbarlabel">
                {g.label}（{g.playerCount}人）
              </span>
              <span className="attbar">
                <i style={{ width: `${g.pct}%` }} />
              </span>
              <span className="attbarpct">{g.pct}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="sech">個人別出席率ランキング</div>
      {ranking.length === 0 ? (
        <div className="empty-msg">選手がいません。</div>
      ) : (
        <div className="list">
          {ranking.map((r) => (
            <div
              key={r.playerId}
              className="attbarrow"
              style={{ cursor: "pointer" }}
              onClick={() => setAttSel({ kind: "player", id: r.playerId })}
            >
              <span className="attbarlabel">{nameOf(r.playerId)}</span>
              <span className="attbar">
                <i style={{ width: `${r.pct}%` }} />
              </span>
              <span className="attbarpct">
                {r.pct}%（{r.recorded}件）
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** event: その予定の出欠記録UI＋「‹ サマリー」 */
function AttEventPane({
  id,
  players,
  setAttSel,
}: {
  id: string;
  players: Player[];
  setAttSel: (s: AttSel) => void;
}) {
  const team = useTeam();
  // 削除済みイベントを選択中の場合に記録UIを出さない(幽霊IDへの書き込み防止)
  const ev = team.team.events.find((e) => e.id === id);
  return (
    <div className="tmdetail screenbody">
      <div className="tmback" onClick={() => setAttSel({ kind: "overview" })}>
        ‹ サマリー
      </div>
      {!ev ? (
        <div className="empty-msg">この予定は削除されました。</div>
      ) : (
        <AttendanceRecordBody eventId={id} players={players} />
      )}
    </div>
  );
}

/** player: 選手名＋「‹ サマリー」/ 出席率 / 月別個人出席率 / 直近の出欠履歴 */
function AttPlayerPane({
  id,
  players,
  attPeriod,
  setAttSel,
}: {
  id: string;
  players: Player[];
  attPeriod: AttPeriod;
  setAttSel: (s: AttSel) => void;
}) {
  const team = useTeam();
  const today = todayStr();
  const p = players.find((x) => x.id === id);
  // サマリーの期間フィルタを引き継ぐ(ランキングの数字と食い違わないように)
  const rateRow = p ? perPlayerAttendance(team.team, [p], attPeriod)[0] : null;
  const periodLabel =
    attPeriod === "all" ? "全期間" : attPeriod === "m1" ? "直近1ヶ月" : attPeriod === "m3" ? "直近3ヶ月" : "直近6ヶ月";
  // monthlyAttendanceにplayersを1人だけ渡すことで個人の月別推移として流用する
  const monthly = p ? monthlyAttendance(team.team, [p], 6) : [];
  const history = [...team.team.events]
    // p15 レビュー: 試合結果を映すためだけの予定（自動で作成・出欠なし）は履歴に出さない
    .filter((e) => e.date <= today && !isResultOnlyEvent(e, team.team.attendance))
    .sort(byDateDesc)
    .slice(0, 10);

  return (
    <div className="tmdetail screenbody">
      <div className="tmback" onClick={() => setAttSel({ kind: "overview" })}>
        ‹ サマリー
      </div>
      {!p ? (
        <div className="empty-msg">この選手は見つかりません。</div>
      ) : (
        <>
          <h2>
            {p.name}
            <span>{p.position}</span>
          </h2>

          <div className="hdash">
            <div className="hstat">
              <div className="hstat-n">{rateRow?.pct ?? 0}%</div>
              <div className="hstat-l">
                出席率（{rateRow?.yes ?? 0}/{rateRow?.recorded ?? 0}・{periodLabel}）
              </div>
            </div>
          </div>

          <div className="sech">月別出席率の推移（直近6ヶ月）</div>
          <LineChart data={monthly.map((m) => ({ label: m.label, value: m.pct }))} max={100} detailed />

          <div className="sech">直近の出欠履歴</div>
          {history.length === 0 ? (
            <div className="empty-msg">記録がありません。</div>
          ) : (
            <div className="list">
              {history.map((e) => {
                const entry = team.team.attendance[e.id]?.[id];
                const label = entry?.status ? STATUS_MARK[entry.status] : "未記録";
                return (
                  <div key={e.id} className="cmprow">
                    <div className="cmpinfo">
                      <div className="cmpnm">{e.title}</div>
                      <div className="cmpsub">
                        {fmtDate(e.date)}
                        {entry?.comment ? ` ・ ${entry.comment}` : ""}
                      </div>
                    </div>
                    <div className="sgoals">{label}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * グループのメンバー一覧（groups-everywhere §5 / groups-editing-and-place-history §4）。
 * カスタムグループ（kind:"custom"）は検索付きのチェックリストでPlayer.groupIdsを一括編集する。
 * 学年グループ（kind:"grade"）は閲覧のみ（所属はPlayer.gradeから自動決定のため編集不可。
 * チェックボックスは出さず、先頭に学年から自動である旨の説明を出す）。
 */
function GroupMembersEditor({
  group,
  players,
  onBack,
}: {
  group: TeamGroup;
  players: Player[];
  onBack: () => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const schoolStage = team.team.schoolStage ?? "junior";
  const isGrade = group.kind === "grade";
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  // レビュー指摘(major): 学年グループは閲覧のみ（チェックが無い）なので、絞り込まずに全員を
  // 出すと所属の手がかりが無くなる。カスタムグループは一括編集のため全員を出すのが正しいまま
  const base = isGrade ? players.filter((p) => playerInGroup(p, group)) : players;
  const list = base.filter((p) => !kw || p.name.toLowerCase().includes(kw));
  // Phase D-1(C2-minor): 70人が学年区切りなし・学年表示なしの一列だと「中3の誰か」を
  // 背番号だけで探すことになるため、行に学年ラベルを足す。選択中の人数も表示する
  const selectedCount = players.filter((p) => playerInGroup(p, group)).length;
  const toggle = (p: Player) => {
    if (isGrade) return; // 閲覧のみ（所属はPlayer.gradeから自動）
    const has = p.groupIds?.includes(group.id) ?? false;
    const next = has
      ? (p.groupIds ?? []).filter((x) => x !== group.id)
      : [...(p.groupIds ?? []), group.id];
    board.updatePlayer({ ...p, groupIds: next.length > 0 ? next : undefined });
  };
  return (
    <>
      <div className="tmback" onClick={onBack}>
        ‹ グループ管理
      </div>
      <h2>{group.label}のメンバー</h2>
      {isGrade && (
        <div style={{ margin: "0 16px 8px", fontSize: "12px", color: "var(--mut)" }}>
          学年グループのメンバーは選手の学年で自動的に決まります。学年は名簿の選手フォームで変更できます。
        </div>
      )}
      <div className="controls">
        <input
          className="search"
          placeholder="名前で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {/* mobile-redesign v1 §8: 12px未満禁止のため.fieldhint(11px)は使わずvar(--fs-body-s)にする */}
      <div style={{ margin: "0 16px 8px", fontSize: "var(--fs-body-s)", color: "var(--mut)" }}>
        {isGrade ? `${selectedCount}人` : `${selectedCount}人を選択中`}
      </div>
      <div className="list">
        {list.length === 0 ? (
          <div className="empty-msg">該当する選手がいません。</div>
        ) : (
          list.map((p) => {
            const checked = playerInGroup(p, group);
            return (
              <label
                key={p.id}
                className="attrow"
                style={{ cursor: isGrade ? "default" : "pointer" }}
              >
                {!isGrade && <input type="checkbox" checked={checked} onChange={() => toggle(p)} />}
                <div className="attname">
                  {p.name}
                  <small>
                    背番号 {p.number ?? "—"}
                    {p.grade != null ? ` ・ ${gradeLabel(schoolStage, p.grade)}` : ""}
                  </small>
                </div>
              </label>
            );
          })
        )}
      </div>
    </>
  );
}

/**
 * 試合結果フォーム専用のスタメン枠定義（8人制・11人制）。pos文字列にGK/DF/MF/FWを明記し、
 * MatchRecord.lineupのposへそのまま保存する。lib/formations.tsのFORMATIONS
 * （ピッチ座標つき・戦術ボード用）とは別に、フォームの選手選択セレクト群だけに使う軽量定義。
 * p15 §8: 選択肢は学校区分で出し分ける（小学＝8人制、中学・高校＝11人制）
 */
const MATCH_FORMATIONS_8: Record<string, string[]> = {
  "3-3-1": ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "FW1"],
  "2-4-1": ["GK", "DF1", "DF2", "MF1", "MF2", "MF3", "MF4", "FW1"],
  "3-2-2": ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "FW1", "FW2"],
  "2-3-2": ["GK", "DF1", "DF2", "MF1", "MF2", "MF3", "FW1", "FW2"],
};
const MATCH_FORMATIONS_11: Record<string, string[]> = {
  "4-4-2": ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "MF4", "FW1", "FW2"],
  "4-3-3": ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "FW1", "FW2", "FW3"],
  "4-2-3-1": ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1"],
  "4-1-4-1": ["GK", "DF1", "DF2", "DF3", "DF4", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1"],
  "3-5-2": ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "MF4", "MF5", "FW1", "FW2"],
  "3-4-3": ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "MF4", "FW1", "FW2", "FW3"],
  "5-3-2": ["GK", "DF1", "DF2", "DF3", "DF4", "DF5", "MF1", "MF2", "MF3", "FW1", "FW2"],
  "5-4-1": ["GK", "DF1", "DF2", "DF3", "DF4", "DF5", "MF1", "MF2", "MF3", "MF4", "FW1"],
};
// 保存済みの記録の解決用（state の初期値・スタメン欄の描画・保存時の lineup は 8・11 人制どちらのキーでも引く）
const MATCH_FORMATION_SLOTS: Record<string, string[]> = { ...MATCH_FORMATIONS_8, ...MATCH_FORMATIONS_11 };

/* ---------------- Sheets ---------------- */
const EMPTY_CALFILTER: CalFilter = { hiddenGroupIds: [], hideAllTargets: false, hiddenCategoryIds: [] };

function SheetHost({
  sheet,
  setSheet,
  players,
  isCoach,
  pane,
  calFilter = EMPTY_CALFILTER,
  setCalFilter,
  calMine = true,
  setCalMine,
  onPlayerDeleted,
  onOpenMatch,
  onMatchDirty,
}: {
  sheet: SheetState;
  setSheet: (s: SheetState) => void;
  players: Player[];
  isCoach: boolean;
  /** PC専用: 配下の全Sheetをモーダルでなく.teammain内の1ペインとして描画する */
  pane?: boolean;
  /** カレンダーの絞り込み状態（案A §2）。日別シートの一覧・絞り込みシート本体に適用する（§3） */
  calFilter?: CalFilter;
  /** 絞り込みシート(type:"calfilter")からの変更を反映する保存付きセッター */
  setCalFilter?: (v: CalFilter) => void;
  /** 選手・保護者向け「自分の予定」絞り込み中か（groups-everywhere §3）。日別シートに適用する */
  calMine?: boolean;
  setCalMine?: (v: boolean) => void;
  /** 選手フォームから選手を削除したとき（名簿の選択を外す） */
  onPlayerDeleted?: () => void;
  /** p15 §6-5: 予定の詳細の「試合記録を開く」。Inner が（シートを閉じて）試合記録タブでその試合の詳細を開く */
  onOpenMatch?: (id: string) => void;
  /** p15 §7: 試合記録フォームに未保存の変更があるか（変化のたびに通知。閉じる・アンマウントで false） */
  onMatchDirty?: (dirty: boolean) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const close = () => setSheet(null);
  // isCoach=falseのときの「自分」（選手・保護者、またはコーチの選手プレビュー）
  const me = !isCoach ? players.find((p) => p.id === team.viewer.memberPlayerId) ?? null : null;
  // 案A §2: CalendarTabと同じcalEventVisibleを日別シートでも共用する
  // （calendar-plan-a §11-2で月表示下の「今日からの予定」は撤去した）
  const dayPassesFilter = (e: TeamEvent) =>
    calEventVisible(e, calFilter, { isCoach, me, groups: team.groups, categories: team.categories, calMine });
  // グループ管理シート内でメンバー一覧を開いているグループID（学年・カスタムどちらも可。
  // groups-editing-and-place-history §4）。sheetがgroups以外に変わったらリセットする
  const [groupMembersId, setGroupMembersId] = useState<string | null>(null);
  // カレンダーの絞り込みと色の作り直し（案A §1）: 色の丸をタップした行の下にパレットを開く。
  // groupMembersIdと同じくsheetがgroups以外に変わったらリセットする
  const [groupColorPickId, setGroupColorPickId] = useState<string | null>(null);
  // レビュー指摘対応（calendar-plan-a §11-3）: 色の選び方がスウォッチ1行(約54px)から
  // 8行・約366pxの縦リスト(ColorChoiceList)に変わったため、下の方のグループで開くと
  // .list(overflow-y:auto)のスクロール範囲外に出てしまう。開いたら見える位置までスクロールする
  const groupSwatchesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (groupColorPickId) groupSwatchesRef.current?.scrollIntoView({ block: "nearest" });
  }, [groupColorPickId]);
  useEffect(() => {
    if (sheet?.type !== "groups") {
      setGroupMembersId(null);
      setGroupColorPickId(null);
    }
  }, [sheet]);
  // tm-sheetpane(PCペイン)の「戻る」用: 最小限の親復帰マップ。
  // categories/groupsは呼び出し元のevent編集シートへ、prefill.eventId付きのmatchは
  // 呼び出し元のeventView(試合結果を記録)へ戻し、それ以外はモーダル同様に閉じる
  const paneBack = () => {
    // groups-everywhere §5: メンバー編集中なら、まずグループ一覧へ戻すだけ（シートは閉じない）
    if (sheet?.type === "groups" && groupMembersId) {
      setGroupMembersId(null);
      return;
    }
    // Phase D-1(C1-major): from/dateを引き継いで元の予定フォームへ戻す(編集中断ではなく復帰)。
    // groups-everywhere §5: 選手フォームの「グループ」欄から開いた場合は選手フォームへ戻す。
    // 名簿など他の入口はfrom/date/returnToPlayerFormのいずれも無いため、単に閉じる
    // （空の予定フォームへ迷い込ませない）
    if (sheet?.type === "categories" || sheet?.type === "groups") {
      if (sheet.type === "groups" && sheet.returnToPlayerForm !== undefined) {
        setSheet({ type: "playerForm", player: sheet.returnToPlayerForm ?? undefined });
      } else if (sheet.from || sheet.date) {
        setSheet({ type: "event", event: sheet.from, date: sheet.date });
      } else {
        setSheet(null);
      }
      return;
    }
    if (sheet?.type === "match" && sheet.prefill?.eventId) {
      setSheet({ type: "eventView", id: sheet.prefill.eventId });
      return;
    }
    // p14 §3-4: 順位表の編集は、閲覧シートから開いたときだけ閲覧へ戻る（PCスタッフはサマリーへ＝null）
    if (sheet?.type === "league" && sheet.from === "view") {
      setSheet({ type: "leagueView" });
      return;
    }
    if (sheet?.type === "fitnessTests") {
      // 個人ページの「種目を管理 ›」から開いた場合は（returnTo無し）閉じて個人ページへ戻る
      setSheet(sheet.returnTo ? { type: "playerForm", player: sheet.returnTo } : null);
      return;
    }
    setSheet(null);
  };

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
  // groups-editing-and-place-history §6: 場所の入力履歴（同じ場所で繰り返し練習することが
  // 多いため、直近の場所名と住所をチップから選べるようにする）。入力中の文字があり、かつ
  // 完全一致するチップが無いときだけ部分一致（大文字小文字を無視）で絞る
  const placeHist = placeHistory(team.team.events);
  const placeTrim = place.trim();
  const placeExact = placeTrim !== "" && placeHist.some((h) => h.place === placeTrim);
  const placeHistShown =
    placeTrim && !placeExact
      ? placeHist.filter((h) => h.place.toLowerCase().includes(placeTrim.toLowerCase()))
      : placeHist;
  const [note, setNote] = useState(ev?.note ?? "");
  // 大会（種別=試合のときのみ表示。""=大会なし/練習試合など）
  const [evCompId, setEvCompId] = useState(ev?.competitionId ?? "");
  // 繰り返し（新規作成時のみ使用）
  const [freqSel, setFreqSel] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [byWeekday, setByWeekday] = useState<number[]>([]);
  const [until, setUntil] = useState(() => addMonthsStr(initDate, 3));
  // 編集時の適用範囲（seriesIdありかつdetachedでない場合のみ表示）
  const [applyScope, setApplyScope] = useState<"only" | "following">("only");
  const editSeries = !!(ev && ev.seriesId && !ev.detached);
  const kind: TeamEventKind = categoryId === "match" ? "match" : "practice";
  // 対象グループ（複数選択。空＝全員対象）
  const [evGroupIds, setEvGroupIds] = useState<string[]>(ev?.groupIds ?? []);

  const onChangeStartDate = (v: string) => {
    const span = diffDays(date, endDate);
    setDate(v);
    const nextEnd = addDays(v, span);
    setEndDate(nextEnd < v ? v : nextEnd);
  };

  // カテゴリ管理
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catEditLabel, setCatEditLabel] = useState("");
  const [catEditColor, setCatEditColor] = useState("");
  // レビュー指摘対応（calendar-plan-a §11-3）: グループ管理と同じ作り（ColorChoiceListが
  // 縦に長い）なので、編集行を開いたときに同じくスクロールして見える位置に寄せる
  const catEditRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (catEditId) catEditRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [catEditId]);

  // グループ管理（カテゴリ管理と同じ構造）
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupEditLabel, setGroupEditLabel] = useState("");

  // match form
  const mr = sheet?.type === "match" ? sheet.record : undefined;
  const mpf = sheet?.type === "match" ? sheet.prefill : undefined;
  const [opponent, setOpponent] = useState(mr?.opponent ?? mpf?.opponent ?? "");
  const [mdate, setMdate] = useState(mr?.date ?? mpf?.date ?? todayStr());
  // 大会: 登録済みから選択（""=未設定、"__new"=新規追加）。新規記録時は予定(eventView)からの
  // prefillに大会が付いていればその大会IDを初期値に引き継ぐ
  const [competitionId, setCompetitionId] = useState(mr?.competitionId ?? mpf?.competitionId ?? "");
  const [newCompName, setNewCompName] = useState("");
  const [ourScore, setOurScore] = useState(mr ? String(mr.ourScore) : "0");
  const [theirScore, setTheirScore] = useState(mr ? String(mr.theirScore) : "0");
  // 試合形式: 前後半(2)/1本(1)。旧データ(periods未設定)は前後半扱い
  const [periods, setPeriods] = useState<1 | 2>(mr?.periods ?? 2);
  const [halfMinutes, setHalfMinutes] = useState(mr?.halfMinutes != null ? String(mr.halfMinutes) : "");
  // フォーメーション（8人制・11人制）。既定は""(未設定)。不明キーは未設定扱い
  const [formation, setFormation] = useState<string>(
    mr?.formation && MATCH_FORMATION_SLOTS[mr.formation] ? mr.formation : ""
  );
  // p15 §8: 選択肢は学校区分で出し分ける（小学＝8人制だけ、中学・高校＝11人制だけ）。
  // 編集中の記録が反対側のフォーメーションを持っているときは、その 1 つだけ残す（選択が消えないように）
  const formationIs8 = team.schoolStage === "elementary";
  const formationKeys = Object.keys(formationIs8 ? MATCH_FORMATIONS_8 : MATCH_FORMATIONS_11);
  // p15 レビュー: 保存済みの記録が持つ反対側のフォーメーションは、別のものを選んだ後も選択肢に残す（選び直せるように）
  for (const k of [mr?.formation, formation]) {
    if (k && MATCH_FORMATION_SLOTS[k] && !formationKeys.includes(k)) formationKeys.push(k);
  }
  // スタメン: ポジション枠(pos文字列)→選手IDのマップ。フォーメーションを切り替えても
  // 同じpos文字列の枠は選択済み選手を保持する（未選択枠は保存時に除外）
  const [lineupMap, setLineupMap] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    (mr?.lineup ?? []).forEach((l) => {
      m[l.pos] = l.playerId;
    });
    return m;
  });
  const [goals, setGoals] = useState<MatchGoal[]>(mr?.goals ?? []);
  const [subs, setSubs] = useState<MatchSub[]>(mr?.subs ?? []);
  const [conceded, setConceded] = useState<MatchConceded[]>(mr?.conceded ?? []);
  const [mnote, setMnote] = useState(mr?.note ?? "");
  // p15 §5: 試合会場。初期値は 編集＝記録の会場（無ければ紐づく予定の場所）／予定から開いた新規＝その予定の場所／それ以外＝空
  const [mplace, setMplace] = useState(() => {
    if (mr) return mr.place ?? eventOfMatch(mr, team.team.events)?.place ?? "";
    return mpf?.eventId ? team.team.events.find((x) => x.id === mpf.eventId)?.place ?? "" : "";
  });
  // スコアの数値解釈はここ1箇所に統一する(追加ボタンのdisabled・ヒント・保存で共用)。
  // type=number でも "1e2"/"2.5"/"-3" が入力できるため、非負整数へ正規化する
  const ourScoreNum = Math.max(0, Math.floor(Number(ourScore) || 0));
  const theirScoreNum = Math.max(0, Math.floor(Number(theirScore) || 0));

  // groups-phase2 §3-2: 対象グループ（複数選択・空＝全体）。初期値：編集＝mr.groupIds、
  // 予定から開いた新規(mpf.eventId)＝その予定のgroupIdsのうち現存するもの、それ以外の新規＝
  // loadGroupFilter("matchForm")（前回の選択。無効IDは除く）
  const [mGroupIds, setMGroupIdsState] = useState<string[]>(() => {
    if (mr) return resolveFilterGroups(mr.groupIds ?? [], team.groups).map((g) => g.id);
    if (mpf?.eventId) {
      const srcEv = team.team.events.find((e) => e.id === mpf.eventId);
      return resolveFilterGroups(srcEv?.groupIds ?? [], team.groups).map((g) => g.id);
    }
    return resolveFilterGroups(loadGroupFilter("matchForm"), team.groups).map((g) => g.id);
  });
  // 変更のたびにsaveGroupFilterへ保存する（編集時は前回の選択を上書きしない）
  const setMGroupIds = (ids: string[]) => {
    setMGroupIdsState(ids);
    if (!mr) saveGroupFilter("matchForm", ids);
  };
  // 「対象外の選手も候補に出す」（既定オフ）
  const [mShowAll, setMShowAll] = useState(false);
  // スタメン: 現在のフォーメーションの枠のみを対象に、未選択(空文字)の枠は除外する
  // (フォーメーション未設定の場合はスタメンUI自体を出さないため保存もしない)。保存と未保存の判定(§7)で共用
  const matchLineup =
    formation && MATCH_FORMATION_SLOTS[formation]
      ? MATCH_FORMATION_SLOTS[formation]
          .map((pos) => ({ pos, playerId: lineupMap[pos] ?? "" }))
          .filter((l) => l.playerId !== "")
      : undefined;
  // p15 §7: 保存データと同じ形のスナップショット。開いた時点の値を 1 回だけ ref に写し（SheetHost は
  // key={sheetKey(sheet)} で再マウントされるので、最初の描画の state が開いた時点の値）、今の値と比べる
  const matchSnap = JSON.stringify({
    date: mdate,
    opponent: opponent.trim(),
    competition: competitionId === "__new" ? `__new:${newCompName.trim()}` : competitionId,
    ourScore: ourScoreNum,
    theirScore: theirScoreNum,
    periods,
    halfMinutes: halfMinutes || "",
    formation,
    lineup: matchLineup ?? [],
    goals,
    subs,
    conceded,
    note: mnote.trim(),
    groupIds: mGroupIds,
    place: mplace.trim(),
  });
  const matchSnapInit = useRef<string | null>(null);
  if (matchSnapInit.current === null && sheet?.type === "match") matchSnapInit.current = matchSnap;
  const matchDirty = sheet?.type === "match" && matchSnapInit.current !== null && matchSnapInit.current !== matchSnap;
  // 保存せずに閉じる経路（背景・つまみ・×・PC の「‹ 戻る」）はこの確認を通す。保存ボタンは通さない
  const matchGuard = () => !matchDirty || window.confirm("保存せずに終了しますか？");
  useEffect(() => {
    onMatchDirty?.(matchDirty);
  }, [matchDirty, onMatchDirty]);
  // アンマウント（フォームを閉じた・別のシートに替わった）ときは未保存なしに戻す
  useEffect(() => () => onMatchDirty?.(false), [onMatchDirty]);
  const mGroups = resolveFilterGroups(mGroupIds, team.groups);
  // 選手選択selectの候補ベース：対象が空、または「対象外も候補に出す」ONなら全選手、
  // それ以外は対象グループのいずれかに所属する選手（OR）
  const mBase =
    mGroups.length === 0 || mShowAll ? players : players.filter((p) => mGroups.some((g) => playerInGroup(p, g)));
  const mBaseIds = new Set(mBase.map((p) => p.id));
  // 各selectの候補：mBaseの末尾に、現在選択中で対象外の選手がいれば追加する
  // （選択済みの値が候補から消えて表示とstateがずれる事故を防ぐ。ラベルは呼び出し側で「・外」を足す。
  // review #1回目: 「（対象外）」は幅の狭いselect(特にスマホの得点者欄)でテキストが隠れて
  // マーカーが見えなくなるため短い接尾辞にした）
  const matchOptionPlayers = (selectedId: string | undefined): Player[] => {
    if (!selectedId || mBaseIds.has(selectedId)) return mBase;
    const extra = players.find((p) => p.id === selectedId);
    return extra ? [...mBase, extra] : mBase;
  };

  // 大会管理
  const [mgrComp, setMgrComp] = useState("");
  // p15 §3: 大会の行のインライン編集（種目管理の testEdit* と同じ作り。同時に編集できるのは 1 行）
  const [compEditId, setCompEditId] = useState<string | null>(null);
  const [compEditName, setCompEditName] = useState("");
  const [compEditNote, setCompEditNote] = useState("");

  // 選手フォーム（player-hub §2-1: 入力欄は個人ページと共有の PlayerBasicForm）。グループ欄の「＋ 管理」で
  // グループ管理シートへ行って戻ると（SheetHost は同じキーのまま）フォームが作り直されるため、入力中の値は
  // この ref に写して復元する。フォームを閉じると SheetHost ごと作り直されて空に戻る
  const pf = sheet?.type === "playerForm" ? sheet.player : undefined;
  const pfKeep = useRef<PlayerFormDraft | null>(null);

  // p14 §3-4: 順位表の編集。数値は文字列で持ち、保存時に検証して数値にする。開くたびに SheetHost が
  // 作り直される（key=league）ので、初期値は開いた時点の順位表（並びは今の順位順）
  const lgOwnName = board.state.teamName ?? "マイチーム";
  // 閲覧シート（leagueView）の表。計算済みの順位表（自チームの行はチーム名へ差し替え）
  const leagueViewRows = computeStandings(team.league, lgOwnName);
  const [lgTitle, setLgTitle] = useState(() => (sheet?.type === "league" ? team.league.title ?? "" : ""));
  const [lgRows, setLgRows] = useState<LeagueDraftRow[]>(() =>
    sheet?.type === "league" ? leagueDraftRows(team.league, lgOwnName) : []
  );
  // 「＋ チームを追加」直後の行（チーム名にフォーカスを移す）
  const [lgFocusId, setLgFocusId] = useState<string | null>(null);
  const lgNameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lgSeq = useRef(0);
  useEffect(() => {
    if (!lgFocusId) return;
    lgNameRefs.current[lgFocusId]?.focus();
    setLgFocusId(null);
  }, [lgFocusId]);
  const lgPatch = (id: string, patch: Partial<LeagueDraftRow>) =>
    setLgRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const saveLeague = () => {
    // 検証: チーム名（自チームの行は対象外）→ 数値（空欄＝0。0 以上の整数だけ）
    if (lgRows.some((r) => !r.own && !r.name.trim())) {
      board.toast("チーム名を入力してください");
      return;
    }
    const rows: LeagueRow[] = [];
    for (const r of lgRows) {
      const nums = LEAGUE_NUM_KEYS.map((k) => parseLeagueInt(r[k]));
      if (nums.some((n) => n == null)) {
        board.toast("数値は 0 以上の整数で入力してください");
        return;
      }
      const [win, draw, loss, gf, ga] = nums as number[];
      rows.push({
        id: r.id,
        name: r.own ? lgOwnName : r.name.trim(),
        win,
        draw,
        loss,
        gf,
        ga,
        ...(r.own ? { own: true as const } : {}),
      });
    }
    team.setLeague({ title: lgTitle.trim() || undefined, rows });
    paneBack();
  };

  // 体力測定：種目管理（カテゴリ管理[2938行目付近]と同じ構造で編集/削除/追加）
  const [newTestName, setNewTestName] = useState("");
  const [newTestUnit, setNewTestUnit] = useState("");
  const [newTestLower, setNewTestLower] = useState(false);
  const [testEditId, setTestEditId] = useState<string | null>(null);
  const [testEditName, setTestEditName] = useState("");
  const [testEditUnit, setTestEditUnit] = useState("");
  const [testEditLower, setTestEditLower] = useState(false);

  // groups-phase2 §3-2: 「＋ 得点者を追加」「＋ 交代を追加」の既定選手はbaseの先頭
  const firstPid = mBase[0]?.id ?? "";

  return (
    <>
      {/* カレンダーの絞り込みと色の作り直し（案A §3-2）: スマホヘッダー「絞り込み」から開く
          下からのシート。setCalFilter/setCalMineが無い(=呼び出し元がPCペイン等で渡していない)
          ときは中身が機能しないため、その場合は開かせない */}
      {setCalFilter && setCalMine && (
        <Sheet open={sheet?.type === "calfilter"} onClose={pane ? paneBack : close} pane={pane}>
          <CalFilterPanel
            filter={calFilter}
            setFilter={setCalFilter}
            isCoach={isCoach}
            me={me}
            calMine={calMine}
            setCalMine={setCalMine}
            groups={team.groups}
            categories={team.categories}
            onManageGroups={() => setSheet({ type: "groups" })}
            onClose={close}
          />
        </Sheet>
      )}
      {/* 予定（イベント）フォーム */}
      <Sheet open={sheet?.type === "event"} onClose={pane ? paneBack : close} pane={pane}>
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
              // Phase D-1(C1-major): 編集中の予定フォームの内容(from/date)を引き継ぎ、
              // 管理シートから戻ったときに入力が消えないようにする
              onClick={() => setSheet({ type: "categories", from: ev, date: evDefaultDate })}
            >
              ＋ 管理
            </button>
          </div>
        </div>
        {/* §2: 対象（グループの複数選択）。「全員」＝選択中のグループを全部外す */}
        <div className="formfield">
          <label>対象</label>
          <div className="grouppick">
            <button
              type="button"
              className={`grouppick-item${evGroupIds.length === 0 ? " on" : ""}`}
              aria-pressed={evGroupIds.length === 0}
              onClick={() => setEvGroupIds([])}
            >
              全員
            </button>
            {team.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`grouppick-item${evGroupIds.includes(g.id) ? " on" : ""}`}
                aria-pressed={evGroupIds.includes(g.id)}
                onClick={() =>
                  setEvGroupIds((cur) =>
                    cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]
                  )
                }
              >
                {g.label}
              </button>
            ))}
            <button
              type="button"
              className="grouppick-item manage"
              aria-label="グループを管理"
              // Phase D-1(C1-major): 編集中の予定フォームの内容(from/date)を引き継ぐ
              onClick={() => setSheet({ type: "groups", from: ev, date: evDefaultDate })}
            >
              ＋ 管理
            </button>
          </div>
        </div>
        <div className="formfield">
          <label>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）通常練習 / 練習試合 vs ○○" />
        </div>
        {kind === "match" && (
          <div className="formfield">
            <label>大会</label>
            <select value={evCompId} onChange={(e) => setEvCompId(e.target.value)}>
              <option value="">大会なし（練習試合など）</option>
              {team.team.competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
        {/* groups-editing-and-place-history §6: 過去に入れた場所の履歴。タップで場所と
            (履歴に住所があれば)住所を一緒に入れる。履歴が無いチームでは行ごと出さない */}
        {placeHistShown.length > 0 && (
          <div className="placehist">
            <span className="placehist-l">最近の場所</span>
            {placeHistShown.map((h) => (
              <button
                key={h.place}
                type="button"
                className={`grouppick-item${h.place === placeTrim ? " on" : ""}`}
                onClick={() => {
                  setPlace(h.place);
                  // レビュー指摘(第2回・minor): 住所が無い履歴を選んでも直前の住所欄が
                  // 残ってしまい、別会場の住所が付いた予定ができてしまっていた。
                  // その場所で設定されていた住所（無ければ空）に必ず揃える
                  setAddress(h.address ?? "");
                }}
              >
                {/* レビュー指摘(minor・第2回): 長い場所名で省略記号(…)が出ずに枠線で
                    文字ごと切れていた。.grouppick-item自身(inline-flex)にはtext-overflow
                    が効かないため、テキストをspanで包みそちらをブロック化して効かせる */}
                <span>{h.place}</span>
              </button>
            ))}
          </div>
        )}
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
              // 大会は種別=試合のときのみ保存（種別を練習へ変更した場合は付け直さずクリアする）
              competitionId: kind === "match" && evCompId ? evCompId : undefined,
              // §2: 選択0件（全員）は groupIds を保存しない
              groupIds: evGroupIds.length > 0 ? [...evGroupIds] : undefined,
              // board-squad-and-pc-polish §3: squadは試合以外常に未定義（lib/types.ts）。
              // 種別を試合から変更したら戦術ボードのメンバーも消し、試合に戻したら
              // 消さずに残す（updateSeriesFollowingはこのsquadを引き継がないので
              // シリーズの他の回には影響しない）
              squad: kind === "match" ? ev?.squad : undefined,
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
      {/* Phase D-1(C1-major): 予定フォームから開いた場合はPC/モバイル共通でpaneBackへ戻す
          (=編集中の予定フォームへ復帰。paneBackはfrom/dateが無いとき安全にnullへ落ちる) */}
      <Sheet open={sheet?.type === "categories"} onClose={paneBack} pane={pane}>
        <h2>カテゴリ管理</h2>
        <div className="list">
          {team.categories.map((c) => (
            <div key={c.id} className="catrow">
              {catEditId === c.id ? (
                <div style={{ flex: 1 }} ref={catEditRowRef}>
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
                  {/* calendar-plan-a §11-3: 色の選択肢をiPhoneカレンダー式の縦リストにする */}
                  <ColorChoiceList value={catEditColor} onChange={setCatEditColor} />
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
                    aria-label="編集"
                    onClick={() => {
                      setCatEditId(c.id);
                      setCatEditLabel(c.label);
                      setCatEditColor(c.color);
                    }}
                  >
                    <IconEdit />
                  </button>
                  {!c.builtin && (
                    <button
                      className="msgdel"
                      aria-label="削除"
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
          {/* calendar-plan-a §11-3: 色の選択肢をiPhoneカレンダー式の縦リストにする */}
          <ColorChoiceList value={newCatColor} onChange={setNewCatColor} />
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
            setNewCatColor(DEFAULT_CATEGORY_COLOR);
          }}
        >
          追加する
        </button>
      </Sheet>

      {/* グループ管理（カレンダーの対象§2 / groups-everywhere §5 / groups-editing-and-place-history §4）。
          カテゴリ管理と同じ構造（色は持たない）。削除時は team.removeGroup 内で全予定の groupIds からも外す。
          §4: 学年グループ（kind:"grade"）も削除・改名できる（削除しても選手のgradeは変えない）。
          メンバー一覧はどちらのkindでも開ける。学年グループは閲覧のみ（所属はgradeから自動）、
          カスタムグループは「メンバー（n人）」から所属選手を一括編集できる */}
      <Sheet open={sheet?.type === "groups"} onClose={paneBack} pane={pane}>
        {groupMembersId ? (
          (() => {
            const g = team.groups.find((x) => x.id === groupMembersId);
            if (!g) return null;
            return (
              <GroupMembersEditor group={g} players={players} onBack={() => setGroupMembersId(null)} />
            );
          })()
        ) : (
          <>
            <h2>グループ管理</h2>
            <div className="list">
              {team.groups.length === 0 && (
                <div className="empty-msg">登録されたグループはありません。</div>
              )}
              {team.groups.map((g) => {
                const isGrade = g.kind === "grade";
                const memberCount = players.filter((p) => playerInGroup(p, g)).length;
                return (
                  <Fragment key={g.id}>
                  <div className="catrow">
                    {groupEditId === g.id ? (
                      <div style={{ flex: 1 }}>
                        <input
                          value={groupEditLabel}
                          onChange={(e) => setGroupEditLabel(e.target.value)}
                          style={{ marginBottom: 8 }}
                          autoFocus
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="bigbtn"
                            style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                            onClick={() => {
                              if (!groupEditLabel.trim()) {
                                board.toast("名前を入力してください");
                                return;
                              }
                              team.updateGroup({ ...g, label: groupEditLabel.trim() });
                              setGroupEditId(null);
                            }}
                          >
                            保存する
                          </button>
                          <button
                            className="bigbtn ghost"
                            style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                            onClick={() => setGroupEditId(null)}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* カレンダーの絞り込みと色の作り直し（案A §1・calendar-plan-a §11-3）:
                            色の丸をタップすると行の下にColorChoiceList(7色＋カスタム)が開く。
                            選ぶとteam.updateGroupで即反映（月の点・リストの線に使われる色。
                            groupColorOf参照） */}
                        <button
                          type="button"
                          className="calgroupdot"
                          aria-label={`「${g.label}」の色を変更`}
                          onClick={() => setGroupColorPickId(groupColorPickId === g.id ? null : g.id)}
                        >
                          <span style={{ background: g.color }} />
                        </button>
                        {/* Phase D-1(C2-minor): サブテキストが非タップで、メンバー編集の入口が
                            右側の人型アイコン(次のbutton)だけだと初見で気づきにくい。
                            仕様§5「『メンバー（n人）』→ 選手のチェックリスト」どおり、
                            サブテキスト自体もタップ可能にする（既存アイコンは残す）。
                            groups-editing-and-place-history §4: 学年グループも同じ入口から
                            メンバー一覧（閲覧のみ）を開けるようにする */}
                        <div
                          className="cmpinfo"
                          style={{ cursor: "pointer" }}
                          onClick={() => setGroupMembersId(g.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setGroupMembersId(g.id);
                            }
                          }}
                        >
                          <div className="cmpnm">{g.label}</div>
                          <div className="cmpsub">
                            {isGrade ? `学年で自動 ・ メンバー ${memberCount}人 ›` : `メンバー ${memberCount}人 ›`}
                          </div>
                        </div>
                        <button
                          className="msgdel"
                          aria-label={isGrade ? "メンバーを表示" : "メンバーを編集"}
                          onClick={() => setGroupMembersId(g.id)}
                        >
                          <E n="users" />
                        </button>
                        <button
                          className="msgdel"
                          aria-label="編集"
                          onClick={() => {
                            setGroupEditId(g.id);
                            setGroupEditLabel(g.label);
                          }}
                        >
                          <IconEdit />
                        </button>
                        <button
                          className="msgdel"
                          aria-label="削除"
                          onClick={() => {
                            const msg = isGrade
                              ? `「${g.label}」を削除しますか？（予定・連絡・試合記録からもこのグループが外れます。選手の学年は変わりません）`
                              : `「${g.label}」を削除しますか？（予定からもこのグループが外れます）`;
                            if (window.confirm(msg)) team.removeGroup(g.id);
                          }}
                        >
                          <E n="trash" />
                        </button>
                      </>
                    )}
                  </div>
                  {groupColorPickId === g.id && (
                    <div className="grpswatches" ref={groupSwatchesRef}>
                      <ColorChoiceList
                        value={g.color ?? ALL_TARGETS_COLOR}
                        onChange={(hex, source) => {
                          team.updateGroup({ ...g, color: hex });
                          // レビュー指摘対応（calendar-plan-a §11-3）: カスタムの色ピッカーは
                          // 入力のたびonChangeが飛ぶため、ここで閉じるとinputがDOMから外れ、
                          // ブラウザの色ピッカーごと閉じて最初の1色しか反映できなかった。
                          // プリセット行を選んだときだけ閉じる
                          if (source === "preset") setGroupColorPickId(null);
                        }}
                      />
                    </div>
                  )}
                  </Fragment>
                );
              })}
            </div>
            {/* groups-editing-and-place-history §4: 学年グループを削除した後に戻すための入口。
                現在の学校区分の学年のうち、学年グループが無いものだけをチップで並べる
                （全部そろっていれば行ごと出さない）。チップは対象欄の「＋管理」と同じ
                .grouppick-item.manageを流用（新規CSSなし） */}
            {(() => {
              const stage = team.schoolStage ?? "junior";
              const missingGrades = STAGE_GRADES[stage].filter(
                (n) => !team.groups.some((x) => x.kind === "grade" && x.grade === n)
              );
              if (missingGrades.length === 0) return null;
              return (
                <div className="formfield">
                  <label>学年グループを追加</label>
                  <div className="grouppick">
                    {missingGrades.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="grouppick-item manage"
                        onClick={() => team.addGradeGroup(n)}
                      >
                        {gradeLabel(stage, n)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="formfield">
              <label>新しいグループを追加</label>
              <input
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
                placeholder="例）Aチーム / Bチーム"
              />
            </div>
            <button
              // Phase D-1(C2-minor): 新設シートがスマホの緑bigbtnを増やさないよう、他の主要CTA
              // (§3-4対応済み箇所)と同じ流儀でモバイルはaccent(青)にする。PC(pane)は不変
              className={`bigbtn${pane ? "" : " accent"}`}
              onClick={() => {
                if (!newGroupLabel.trim()) {
                  board.toast("名前を入力してください");
                  return;
                }
                team.addGroup(newGroupLabel);
                setNewGroupLabel("");
              }}
            >
              追加する
            </button>
          </>
        )}
      </Sheet>

      {/* 体力測定：種目管理（R4b）。カテゴリ管理と同じ構造(一覧+インライン編集+追加フォーム)。
          記録が残っている種目の削除はteam.removeFitnessTest内でガードし、失敗時はboard.toastで案内する */}
      <Sheet open={sheet?.type === "fitnessTests"} onClose={pane ? paneBack : close} pane={pane}>
        <h2>種目を管理</h2>
        <div className="list">
          {(team.team.fitnessTests ?? []).length === 0 && (
            <div className="empty-msg">登録された種目はありません。</div>
          )}
          {(team.team.fitnessTests ?? []).map((t) => (
            <div key={t.id} className="catrow">
              {testEditId === t.id ? (
                <div style={{ flex: 1 }}>
                  <input
                    value={testEditName}
                    onChange={(e) => setTestEditName(e.target.value)}
                    style={{ marginBottom: 8 }}
                    autoFocus
                  />
                  <div className="formgrid">
                    <div className="formfield" style={{ flex: 1, margin: 0 }}>
                      <label>単位</label>
                      <input value={testEditUnit} onChange={(e) => setTestEditUnit(e.target.value)} />
                    </div>
                    <div className="formfield" style={{ flex: 1, margin: 0 }}>
                      <label className="daytoggle">
                        <input
                          type="checkbox"
                          checked={testEditLower}
                          onChange={(e) => setTestEditLower(e.target.checked)}
                        />
                        <span />
                        小さい方が良い
                      </label>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className="bigbtn"
                      style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                      onClick={() => {
                        if (!testEditName.trim() || !testEditUnit.trim()) {
                          board.toast("種目名と単位を入力してください");
                          return;
                        }
                        team.updateFitnessTest({
                          id: t.id,
                          name: testEditName.trim(),
                          unit: testEditUnit.trim(),
                          lowerIsBetter: testEditLower || undefined,
                        });
                        setTestEditId(null);
                      }}
                    >
                      保存する
                    </button>
                    <button
                      className="bigbtn ghost"
                      style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                      onClick={() => setTestEditId(null)}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="cmpinfo">
                    <div className="cmpnm">
                      {t.name}
                      {/* player-hub §1-4: 新体力テストの種目の印（小さなタグ。個人ページの「体力」の種目カードと同じ見た目） */}
                      {t.standardKey && <span className="phubtag">新体力テスト</span>}
                    </div>
                    <div className="cmpsub">
                      単位: {t.unit}
                      {t.lowerIsBetter ? " ・ 小さい方が良い" : ""}
                    </div>
                  </div>
                  <button
                    className="msgdel"
                    aria-label="編集"
                    onClick={() => {
                      setTestEditId(t.id);
                      setTestEditName(t.name);
                      setTestEditUnit(t.unit);
                      setTestEditLower(!!t.lowerIsBetter);
                    }}
                  >
                    <IconEdit />
                  </button>
                  <button
                    className="msgdel"
                    aria-label="削除"
                    onClick={() => {
                      if (window.confirm(`「${t.name}」を削除しますか？`)) team.removeFitnessTest(t.id);
                    }}
                  >
                    <E n="trash" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="formfield">
          <label>新しい種目を追加</label>
          <input
            value={newTestName}
            onChange={(e) => setNewTestName(e.target.value)}
            placeholder="例）50m走 / 立ち幅跳び"
          />
        </div>
        <div className="formgrid">
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>単位</label>
            <input value={newTestUnit} onChange={(e) => setNewTestUnit(e.target.value)} placeholder="例）秒 / cm / 回" />
          </div>
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label className="daytoggle">
              <input type="checkbox" checked={newTestLower} onChange={(e) => setNewTestLower(e.target.checked)} />
              <span />
              小さい方が良い
            </label>
          </div>
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            if (!newTestName.trim() || !newTestUnit.trim()) {
              board.toast("種目名と単位を入力してください");
              return;
            }
            team.addFitnessTest(newTestName, newTestUnit, newTestLower || undefined);
            setNewTestName("");
            setNewTestUnit("");
            setNewTestLower(false);
          }}
        >
          追加する
        </button>
      </Sheet>

      {/* 出欠一覧（スタッフが記録）: 未記録→欠席→未定→出席の順にグルーピング。
          UI本体はAttendanceRecordBody（PC右ペイン att/event と共有） */}
      <Sheet open={sheet?.type === "attendance"} onClose={pane ? paneBack : close} pane={pane}>
        {sheet?.type === "attendance" && (
          <AttendanceRecordBody eventId={sheet.eventId} players={players} />
        )}
      </Sheet>

      {/* 日別（カレンダー） */}
      <Sheet open={sheet?.type === "day"} onClose={pane ? paneBack : close} pane={pane}>
        {sheet?.type === "day" && (
          <>
            <h2>{fmtDate(sheet.date)} の予定</h2>
            <div className="list">
              {team.team.events.filter(
                (e) => occursOn(e, sheet.date) && dayPassesFilter(e)
              ).length === 0 ? (
                <div className="empty-msg">この日に予定はありません。</div>
              ) : (
                team.team.events
                  .filter((e) => occursOn(e, sheet.date) && dayPassesFilter(e))
                  .sort(byStartAsc)
                  .map((e) => {
                    const cat = categoryOf(e, team.categories);
                    const timeLabel = isMultiDay(e)
                      ? `${fmtMD(e.date)}〜${fmtMD(eventEndDate(e))}`
                      : e.allDay
                        ? "終日"
                        : fmtTimeRange(e);
                    const compName =
                      e.kind === "match" && e.competitionId
                        ? team.team.competitions.find((c) => c.id === e.competitionId)?.name ?? "（削除された大会）"
                        : null;
                    return (
                      <div
                        key={e.id}
                        className="evcard"
                        style={{ margin: "0 12px 8px", cursor: "pointer" }}
                        onClick={() => setSheet({ type: "eventView", id: e.id })}
                      >
                        <div className="evhead">
                          <span className="evkind" style={{ background: cat.color }}>
                            <i className="evdot" style={{ background: cat.color }} />
                            {cat.label}
                          </span>
                          {/* p15 §6-5: 紐づく試合記録があれば結果のタグ */}
                          <EvTitle cls="evtitle" title={e.title} r={eventResultOf(e, team.team.matches, isCoach, board.matchesPublic)} />
                          <span className="evopen" style={{ marginLeft: "auto" }}>詳細 ›</span>
                        </div>
                        <div className="evmeta">
                          {[timeLabel, e.place, compName].filter(Boolean).join(" ・ ")}
                        </div>
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <EvGroupsBadge ev={e} groups={team.groups} />
                          {/* board-squad-and-pc-polish §3: メンバー登録済みの試合バッジ */}
                          {e.kind === "match" && e.squad && (
                            <span className="evgroups targeted">メンバー発表</span>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
            {isCoach && (
              // mobile-redesign-v2 §3-4(緑残存の自動走査対応): table未記載だが、日別シートも
              // 緑残存走査の対象(予定詳細と同じ導線)のため、モバイルではghost(--ink)にする。
              // PC(pane)は変更しない
              <button className={`bigbtn${pane ? "" : " ghost"}`} onClick={() => setSheet({ type: "event", date: sheet.date })}>
                ＋ この日に予定を追加
              </button>
            )}
          </>
        )}
      </Sheet>

      {/* 予定の詳細 */}
      <Sheet open={sheet?.type === "eventView"} onClose={pane ? paneBack : close} pane={pane}>
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
            // p15 §6-5: 紐づく試合記録（公開の条件は eventResultOf）。得点者は人ごとの点数（1 点は数字なし）
            const rec = eventResultOf(e, team.team.matches, isCoach, board.matchesPublic);
            const recRes = rec ? matchResultOf(rec) : null;
            const recScorers: string[] = [];
            if (rec) {
              const cnt = new Map<string, number>();
              rec.goals.forEach((g) => cnt.set(g.playerId, (cnt.get(g.playerId) ?? 0) + 1));
              cnt.forEach((n, pid) =>
                recScorers.push(`${players.find((p) => p.id === pid)?.name ?? "選手"}${n > 1 ? ` ${n}` : ""}`)
              );
            }
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
                  {/* Phase D-1(C3 major): 他2箇所(EventCard/リスト表示)と同じclassName="evkind"
                      構成にする。無印styleのままだと.teamapp:has(.mhead)の打ち消しが効かず、
                      このシートだけ種別ピルが色塗り+白文字のまま残ってしまう */}
                  <span className="evkind" style={{ background: cat.color }}>
                    <i className="evdot" style={{ background: cat.color }} />
                    {cat.label}
                  </span>
                </h2>
                <div className="detail">
                  {/* p15 §6-5: 試合結果（紐づく記録があるときだけ。日時・場所の前） */}
                  {rec && recRes && (
                    <div className="dsec">
                      <div className="dsec-h">試合結果</div>
                      <div className="dline">
                        {recRes.label} ・ {rec.ourScore} - {rec.theirScore}
                      </div>
                      {recScorers.length > 0 && <div className="dline">得点：{recScorers.join("、")}</div>}
                      {!isCoach && onOpenMatch && (
                        <button className="bigbtn ghost" onClick={() => onOpenMatch(rec.id)}>
                          試合記録を開く
                        </button>
                      )}
                    </div>
                  )}
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
                    {e.kind === "match" && e.competitionId && (
                      <div className="dline">
                        <E n="trophy" />{" "}
                        {team.team.competitions.find((c) => c.id === e.competitionId)?.name ?? "（削除された大会）"}
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
                    {/* §5: 対象行（全員 / グループ名の「・」連結）。詳細では省略せず全文表示。
                        Phase D-1(C2-minor): グループが1つも無いチームでは行ごと出さない
                        （絞り込み行・バッジ本体と同じ扱い） */}
                    {team.groups.length > 0 && (
                      <div className="dline">
                        <E n="users" /> 対象: <EvGroupsBadge ev={e} groups={team.groups} full />
                        {/* groups-everywhere §3: 対象外から「参加する」した選手をスタッフに表示。
                            Phase D-1(C2-minor): 対象バッジ(EvGroupsBadge full)と同じく、詳細では
                            省略せず全文表示する（evgroups.fullで折り返し・省略解除） */}
                        {isCoach && (e.optInPlayerIds ?? []).length > 0 && (
                          <span className="evgroups full" style={{ marginLeft: 6 }}>
                            ＋参加：
                            {(e.optInPlayerIds ?? [])
                              .map((pid) => players.find((p) => p.id === pid)?.name ?? "選手")
                              .join("、")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* board-squad-and-pc-polish §3: 試合のメンバー（スタメン／ベンチ）。
                      選手・保護者は登録が無ければ欄ごと出さない */}
                  {e.kind === "match" && (isCoach || e.squad) && (
                    <div className="dsec">
                      <div className="dsec-h">
                        <E n="clipboard" /> メンバー
                      </div>
                      {(() => {
                        const squad = e.squad;
                        const registerFromBoard = (existing: EventSquad | undefined) => {
                          if (!board.state.slots.some((s) => s.pid)) {
                            board.toast("戦術ボードにスタメンが1人も配置されていません");
                            return;
                          }
                          team.setEventSquad(e.id, buildEventSquad(board.state));
                          board.toast(existing ? "戦術ボードのメンバーで更新しました" : "戦術ボードのメンバーを登録しました");
                        };
                        if (!squad) {
                          // 上のガード（isCoach || e.squad）により、ここに来るのは常にisCoach
                          return (
                            <>
                              <div className="dsec-e">まだメンバーが登録されていません。</div>
                              {/* レビュー指摘(1回目): .planseote(設定>プランの注記用)を流用すると
                                  11px・PCではtext-align:centerで上の行と揃わなかった。隣の行と
                                  同じ.dsec-e(12px --mut・左揃え)で書く */}
                              <div className="dsec-e" style={{ margin: "0 0 6px" }}>
                                現在の戦術ボードのスタメン・ベンチをこの試合に登録します。
                              </div>
                              <button className="bigbtn ghost" onClick={() => registerFromBoard(undefined)}>
                                戦術ボードのメンバーを登録
                              </button>
                            </>
                          );
                        }
                        const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";
                        const numberOf = (id: string) => players.find((p) => p.id === id)?.number ?? null;
                        const validStarters = squad.starters
                          .filter((s) => players.some((p) => p.id === s.playerId))
                          .slice()
                          .sort((a, b) => squadRoleOrder(a.role) - squadRoleOrder(b.role));
                        const validBench = squad.bench.filter((id) => players.some((p) => p.id === id));
                        const myStart = !isCoach && me ? validStarters.find((s) => s.playerId === me.id) : undefined;
                        const myStatus =
                          !isCoach && me
                            ? myStart
                              ? `あなたはスタメンです（${myStart.role}）`
                              : validBench.includes(me.id)
                                ? "あなたはベンチです"
                                : "あなたは今回メンバー外です"
                            : null;
                        return (
                          <>
                            {myStatus && (
                              <div className="dline" style={{ color: "var(--accent)" }}>
                                {myStatus}
                              </div>
                            )}
                            <div className="dline">{squad.formation}</div>
                            {/* 統括の最終調整: 「・」区切りの1文だと18人分が段落になって読みにくい。
                                GK／DF／MF／FW／ベンチの行に分け、左にラベルの列を置く（選手名は1人分で
                                折り返さない）。選手・保護者が見るときは自分の名前を --accent で強調する */}
                            {validStarters.length === 0 ? (
                              <div className="dline">スタメンがいません。</div>
                            ) : (
                              <div className="sqlist">
                                {(
                                  [
                                    { key: "gk", label: "GK" },
                                    { key: "df", label: "DF" },
                                    { key: "mf", label: "MF" },
                                    { key: "fw", label: "FW" },
                                  ] as const
                                ).map((line) => {
                                  const xs = validStarters.filter(
                                    (s) => groupOf(s.role as Parameters<typeof groupOf>[0]) === line.key
                                  );
                                  if (xs.length === 0) return null;
                                  return (
                                    <div className="sqline" key={line.key}>
                                      <span className="sqline-l">{line.label}</span>
                                      <span className="sqline-v">
                                        {xs.map((s) => (
                                          <span
                                            key={s.playerId}
                                            className={`sqname${!isCoach && me?.id === s.playerId ? " me" : ""}`}
                                          >
                                            {s.role !== line.label && <i className="sqrole">{s.role}</i>}#
                                            {numberOf(s.playerId) ?? "–"} {nameOf(s.playerId)}
                                          </span>
                                        ))}
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="sqline sqbench">
                                  <span className="sqline-l">ベンチ</span>
                                  <span className="sqline-v">
                                    {validBench.length === 0
                                      ? "なし"
                                      : validBench.map((id) => (
                                          <span key={id} className={`sqname${!isCoach && me?.id === id ? " me" : ""}`}>
                                            #{numberOf(id) ?? "–"} {nameOf(id)}
                                          </span>
                                        ))}
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="dline" style={{ fontSize: 12, color: "var(--mut)" }}>
                              更新 {fmtTs(squad.updatedAt)}
                            </div>
                            {isCoach && (
                              <>
                                <button className="bigbtn ghost" onClick={() => registerFromBoard(squad)}>
                                  戦術ボードのメンバーで更新
                                </button>
                                <button
                                  className="bigbtn ghost"
                                  style={{ color: "var(--red)" }}
                                  onClick={() => {
                                    if (window.confirm("メンバーの登録を消しますか？")) {
                                      team.setEventSquad(e.id, null);
                                    }
                                  }}
                                >
                                  メンバーを消す
                                </button>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {isCoach && (
                    <div className="dsec">
                      <div className="dsec-h">出欠状況</div>
                      <div className="dline">
                        出席 {s.yes} ・ 未定 {s.maybe} ・ 欠席 {s.no} ・ 未記録 {s.none}
                      </div>
                      <button
                        className="bigbtn ghost"
                        onClick={() => setSheet({ type: "attendance", eventId: e.id })}
                      >
                        記録を見る・編集
                      </button>
                    </div>
                  )}
                  {/* groups-everywhere §3: 選手・保護者が対象外の予定を開いたときの「参加する」/
                      「参加をやめる」。対象（全員 or 所属グループ）の予定には出さない */}
                  {!isCoach &&
                    me &&
                    (() => {
                      const coreTarget =
                        isAllTargets(e) ||
                        (e.groupIds ?? []).some((gid) => {
                          const g = team.groups.find((x) => x.id === gid);
                          return g ? playerInGroup(me, g) : false;
                        });
                      if (coreTarget) return null;
                      const optedIn = e.optInPlayerIds?.includes(me.id) ?? false;
                      return (
                        <div className="dsec">
                          <button
                            className={optedIn ? "bigbtn ghost" : `bigbtn${pane ? "" : " accent"}`}
                            onClick={() => {
                              const next = optedIn
                                ? (e.optInPlayerIds ?? []).filter((id) => id !== me.id)
                                : [...(e.optInPlayerIds ?? []), me.id];
                              team.updateEvent({
                                ...e,
                                optInPlayerIds: next.length > 0 ? next : undefined,
                              });
                            }}
                          >
                            {optedIn ? "参加をやめる" : "この予定に参加する"}
                          </button>
                        </div>
                      );
                    })()}
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
                        // p15 §6-4: 紐づく記録があるときは「この試合の結果を記録」を出さず、記録を開く（二重作成を防ぐ）
                        // mobile-redesign-v2 §3-4(緑残存の自動走査対応): 緑残存走査の対象
                        // (予定詳細)のため、モバイルでは--accent地の強調にする(PC(pane)は
                        // 変更しない・元の緑bigbtnのまま)。Phase D-1(C2 minor review):
                        // 直下の「編集する」もghostだと主従の差が消えるため、試合の予定は
                        // こちらを唯一の強調にする
                        className={`bigbtn${pane ? "" : " accent"}`}
                        onClick={() => {
                          if (rec) {
                            onOpenMatch?.(rec.id);
                            return;
                          }
                          setSheet({
                            type: "match",
                            prefill: {
                              date: e.date,
                              opponent: opponentFromTitle(e.title),
                              eventId: e.id,
                              competitionId: e.competitionId,
                            },
                          });
                        }}
                      >
                        {rec ? "試合記録を開く" : "この試合の結果を記録"}
                      </button>
                    )}
                    <button
                      // Phase D-1(C2 minor review): モバイルでは主操作を1つだけ強調する。
                      // 試合の予定は上の「この試合の結果を記録」が主役なのでghost、
                      // 非試合の予定はこちらが唯一の操作なのでaccentで強調する
                      className={
                        pane
                          ? `bigbtn${e.kind === "match" ? " ghost" : ""}`
                          : `bigbtn${e.kind === "match" ? " ghost" : " accent"}`
                      }
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
      <Sheet
        open={sheet?.type === "match"}
        onClose={() => {
          if (matchGuard()) (pane ? paneBack : close)();
        }}
        pane={pane}
      >
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
          <label>試合形式</label>
          <div className="calviewtoggle">
            <button type="button" className={periods === 2 ? "on" : ""} onClick={() => setPeriods(2)}>
              前後半
            </button>
            <button type="button" className={periods === 1 ? "on" : ""} onClick={() => setPeriods(1)}>
              1本
            </button>
          </div>
        </div>
        <div className="formfield">
          <label>{periods === 1 ? "試合時間" : "ハーフ時間"}</label>
          <select value={halfMinutes} onChange={(e) => setHalfMinutes(e.target.value)}>
            <option value="">未設定</option>
            {[10, 15, 20, 25, 30, 35, 40, 45].map((n) => (
              <option key={n} value={n}>
                {n}分{periods === 1 ? "" : "ハーフ"}
              </option>
            ))}
          </select>
        </div>
        <div className="formfield">
          <label>スコア（自チーム - 相手）</label>
          <div className="scoreinput">
            <input type="number" min={0} value={ourScore} onChange={(e) => setOurScore(e.target.value)} />
            <span>-</span>
            <input type="number" min={0} value={theirScore} onChange={(e) => setTheirScore(e.target.value)} />
          </div>
        </div>

        {/* groups-phase2 §3-2: 対象（複数選択・未選択＝全体）。onManageは付けない
            （グループ管理シートへ行くとフォームが作り直されて入力が消えるため） */}
        {team.groups.length > 0 && (
          <>
            <div className="formfield">
              <label>対象</label>
              <GroupChips groups={team.groups} value={mGroupIds} onChange={setMGroupIds} multi allowAll allLabel="全体" />
            </div>
            <div className="formfield">
              {/* review #1回目: 既存の.daytoggleはON時に--lime(=--primary)を使うが、
                  緑は主CTAだけの規約(§6)のためこの画面では使わない。§6が挙げる.formcheck
                  （label+checkbox、ON時--accent）を新設してここだけで使う */}
              <label className="formcheck">
                <input type="checkbox" checked={mShowAll} onChange={(e) => setMShowAll(e.target.checked)} />
                対象外の選手も候補に出す
              </label>
            </div>
          </>
        )}

        <div className="formfield">
          <label>フォーメーション（{formationIs8 ? "8" : "11"}人制）</label>
          <select value={formation} onChange={(e) => setFormation(e.target.value)}>
            <option value="">未設定</option>
            {formationKeys.map((k) => (
              <option key={k} value={k}>
                {k}（{MATCH_FORMATIONS_8[k] ? "8" : "11"}人制）
              </option>
            ))}
          </select>
        </div>
        {formation && (
        <div className="formfield">
          <label>スタメン</label>
          <div className="formgrid" style={{ flexWrap: "wrap" }}>
            {MATCH_FORMATION_SLOTS[formation].map((pos) => {
              const selectedElsewhere = new Set(
                MATCH_FORMATION_SLOTS[formation]
                  .filter((p) => p !== pos)
                  .map((p) => lineupMap[p])
                  .filter((v): v is string => !!v)
              );
              return (
              <div key={pos} className="formfield" style={{ flex: "1 1 130px", minWidth: 140, margin: 0 }}>
                <label>{pos}</label>
                <select
                  value={lineupMap[pos] ?? ""}
                  onChange={(e) => setLineupMap((cur) => ({ ...cur, [pos]: e.target.value }))}
                >
                  <option value="">未選択</option>
                  {matchOptionPlayers(lineupMap[pos]).map((p) => (
                    <option key={p.id} value={p.id} disabled={selectedElsewhere.has(p.id)}>
                      {p.name}
                      {mBaseIds.has(p.id) ? "" : "・外"}
                    </option>
                  ))}
                </select>
              </div>
              );
            })}
          </div>
          <div className="fieldhint">未選択の枠は保存されません</div>
        </div>
        )}

        <div className="formfield">
          <label>得点者</label>
          {goals.map((g, i) => (
            <div key={i} className="dynrow">
              <select value={g.playerId} onChange={(e) => setGoals(upd(goals, i, { playerId: e.target.value }))}>
                {matchOptionPlayers(g.playerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {mBaseIds.has(p.id) ? "" : "・外"}
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
                {matchOptionPlayers(g.assistPlayerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    A: {p.name}
                    {mBaseIds.has(p.id) ? "" : "・外"}
                  </option>
                ))}
              </select>
              <select
                className="originsel"
                value={g.origin ?? ""}
                onChange={(e) =>
                  setGoals(upd(goals, i, { origin: e.target.value ? (e.target.value as GoalOrigin) : undefined }))
                }
              >
                <option value="">形態未設定</option>
                {(Object.keys(GOAL_ORIGIN_LABELS) as GoalOrigin[]).map((k) => (
                  <option key={k} value={k}>
                    {GOAL_ORIGIN_LABELS[k]}
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
            disabled={goals.length >= ourScoreNum || !firstPid}
            style={goals.length >= ourScoreNum || !firstPid ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={() => firstPid && setGoals([...goals, { playerId: firstPid }])}
          >
            ＋ 得点者を追加
          </button>
          <div className="fieldhint">
            {/* groups-phase2 review #1回目: メンバー0人のグループが対象だとmBaseが空になり
                firstPidが""になるため、ボタンがdisabledに見えないまま無反応になっていた。
                理由を出してdisabledにする（戦術ボード§2-1の空メッセージと同じ考え方） */}
            {!firstPid
              ? "この対象に選手がいません。「対象外の選手も候補に出す」で選べます"
              : ourScoreNum === 0
              ? "得点を入力すると得点者を追加できます"
              : goals.length >= ourScoreNum
              ? `得点数（${ourScoreNum}）に達しました。増やすにはスコアを変更してください`
              : `得点数（${ourScoreNum}）まで追加できます`}
          </div>
        </div>

        <div className="formfield">
          <label>失点</label>
          {conceded.map((c, i) => (
            <div key={i} className="dynrow">
              <input
                type="number"
                placeholder="分"
                value={c.minute ?? ""}
                onChange={(e) => setConceded(upd(conceded, i, { minute: e.target.value ? +e.target.value : undefined }))}
              />
              <select
                className="originsel"
                value={c.origin ?? ""}
                onChange={(e) =>
                  setConceded(upd(conceded, i, { origin: e.target.value ? (e.target.value as GoalOrigin) : undefined }))
                }
              >
                <option value="">形態未設定</option>
                {(Object.keys(GOAL_ORIGIN_LABELS) as GoalOrigin[]).map((k) => (
                  <option key={k} value={k}>
                    {GOAL_ORIGIN_LABELS[k]}
                  </option>
                ))}
              </select>
              <button className="dynx" onClick={() => setConceded(conceded.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button
            className="dynadd"
            disabled={conceded.length >= theirScoreNum}
            style={conceded.length >= theirScoreNum ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={() => setConceded([...conceded, {}])}
          >
            ＋ 失点を追加
          </button>
          <div className="fieldhint">
            {theirScoreNum === 0
              ? "失点を入力すると失点行を追加できます"
              : conceded.length >= theirScoreNum
              ? `失点数（${theirScoreNum}）に達しました。増やすにはスコアを変更してください`
              : `失点数（${theirScoreNum}）まで追加できます`}
          </div>
        </div>

        <div className="formfield">
          <label>交代（OUT → IN）</label>
          {subs.map((s, i) => (
            <div key={i} className="dynrow">
              <select value={s.outPlayerId} onChange={(e) => setSubs(upd(subs, i, { outPlayerId: e.target.value }))}>
                {matchOptionPlayers(s.outPlayerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    OUT {p.name}
                    {mBaseIds.has(p.id) ? "" : "・外"}
                  </option>
                ))}
              </select>
              <select value={s.inPlayerId} onChange={(e) => setSubs(upd(subs, i, { inPlayerId: e.target.value }))}>
                {matchOptionPlayers(s.inPlayerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    IN {p.name}
                    {mBaseIds.has(p.id) ? "" : "・外"}
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
            disabled={!firstPid}
            style={!firstPid ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={() => firstPid && setSubs([...subs, { outPlayerId: firstPid, inPlayerId: firstPid }])}
          >
            ＋ 交代を追加
          </button>
          {!firstPid && (
            <div className="fieldhint">
              この対象に選手がいません。「対象外の選手も候補に出す」で選べます
            </div>
          )}
        </div>

        {/* p15 §5: 試合会場（メモの上）。空のままなら、紐づく予定の場所が基本情報に出る */}
        <div className="formfield">
          <label>試合会場</label>
          <input value={mplace} onChange={(e) => setMplace(e.target.value)} placeholder="例）市民グラウンド" />
        </div>
        <div className="formfield">
          <label>メモ</label>
          <textarea value={mnote} onChange={(e) => setMnote(e.target.value)} rows={3} placeholder="試合の振り返りなど" />
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            if (!opponent.trim()) {
              board.toast("対戦相手を入力してください");
              return;
            }
            if (goals.length > ourScoreNum) {
              board.toast(
                `得点者（${goals.length}人）が得点数（${ourScoreNum}）を超えています。得点者を × で減らすか、得点数を増やしてください`
              );
              return;
            }
            if (conceded.length > theirScoreNum) {
              board.toast(
                `失点（${conceded.length}件）が失点数（${theirScoreNum}）を超えています。失点を × で減らすか、スコアを変更してください`
              );
              return;
            }
            // スタメン: 未選択の枠は除外して保存（組み立ては上の matchLineup。§7 の未保存判定と共用）
            const lineup = matchLineup;
            if (lineup && lineup.length > 0) {
              const seen = new Set<string>();
              for (const l of lineup) {
                if (seen.has(l.playerId)) {
                  const dupName = players.find((p) => p.id === l.playerId)?.name ?? "選手";
                  board.toast(`${dupName}が複数のポジションに設定されています`);
                  return;
                }
                seen.add(l.playerId);
              }
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
              ourScore: ourScoreNum,
              theirScore: theirScoreNum,
              periods,
              halfMinutes: halfMinutes ? +halfMinutes : undefined,
              formation: formation || undefined,
              lineup,
              goals,
              subs,
              conceded,
              note: mnote.trim() || undefined,
              // groups-phase2 §3-2: 対象グループ（0件＝チーム全体）
              groupIds: mGroupIds.length > 0 ? mGroupIds : undefined,
              // p15 §5: 試合会場（空なら未設定＝紐づく予定の場所を表示）
              place: mplace.trim() || undefined,
              // p15 §6-4: 予定から開いた新規は、その予定に紐づける（編集は ...mr が eventId を保つ）
              ...(!mr && mpf?.eventId ? { eventId: mpf.eventId } : {}),
            };
            if (mr) team.updateMatch({ ...mr, ...data });
            else team.addMatch(data);
            close();
          }}
        >
          {mr ? "保存する" : "記録する"}
        </button>
      </Sheet>

      {/* p14 §3-3: 順位表の閲覧（スマホ・PCの選手の入口行から。表は横スクロール可）。スタッフだけ「編集する」 */}
      <Sheet open={sheet?.type === "leagueView"} onClose={pane ? paneBack : close} pane={pane}>
        <h2>{team.league.title || "リーグ順位表"}</h2>
        {sheet?.type === "leagueView" && (
          <>
            {leagueViewRows.length === 0 ? (
              <div className="empty-msg">順位表が未登録です。</div>
            ) : (
              <LeagueTableView rows={leagueViewRows} />
            )}
            <div className="lgview-upd">
              <LastUpdated at={team.league.updatedAt} by={team.league.updatedBy} />
            </div>
            {isCoach && (
              <button className="bigbtn ghost accent" onClick={() => setSheet({ type: "league", from: "view" })}>
                編集する
              </button>
            )}
          </>
        )}
      </Sheet>

      {/* p14 §3-4: 順位表の編集（名称・チームごとの勝/分/敗/得点/失点）。順位・試合数・勝点は自動計算 */}
      <Sheet open={sheet?.type === "league"} onClose={paneBack} pane={pane}>
        <h2>順位表を編集</h2>
        <div className="formfield">
          <label>名称</label>
          <input
            value={lgTitle}
            onChange={(e) => setLgTitle(e.target.value)}
            placeholder="リーグ順位表（例：春季リーグ U-12）"
          />
        </div>
        <div className="lgedit">
          {lgRows.map((r) => (
            <div key={r.id} className="lgedit-row">
              <div className="lgedit-top">
                {r.own ? (
                  <div className="lgedit-name lgedit-ownname">
                    <b>{lgOwnName}</b>
                    <span className="phubtag lgedit-own">自チーム</span>
                  </div>
                ) : (
                  <div className="formfield lgedit-name">
                    <input
                      ref={(el) => {
                        lgNameRefs.current[r.id] = el;
                      }}
                      value={r.name}
                      onChange={(e) => lgPatch(r.id, { name: e.target.value })}
                      placeholder="チーム名"
                      aria-label="チーム名"
                    />
                  </div>
                )}
                {!r.own && (
                  <button
                    type="button"
                    className="lgedit-del"
                    aria-label="このチームを削除"
                    title="このチームを削除"
                    onClick={() => setLgRows((rows) => rows.filter((x) => x.id !== r.id))}
                  >
                    <IconTrash />
                  </button>
                )}
              </div>
              <div className="lgedit-nums">
                {LEAGUE_NUM_KEYS.map((k) => (
                  <label key={k}>
                    <span>{LEAGUE_NUM_LABEL[k]}</span>
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={r[k]}
                      onChange={(e) => lgPatch(r.id, { [k]: e.target.value })}
                      aria-label={`${r.own ? lgOwnName : r.name || "チーム"} ${LEAGUE_NUM_LABEL[k]}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="formfield">
          <button
            type="button"
            className="dynadd"
            onClick={() => {
              lgSeq.current += 1;
              const id = "lg_" + Date.now().toString(36) + "_" + lgSeq.current;
              setLgRows((rows) => [...rows, { id, name: "", win: "", draw: "", loss: "", gf: "", ga: "" }]);
              setLgFocusId(id);
            }}
          >
            ＋ チームを追加
          </button>
        </div>
        <div className="evnote" style={{ margin: "0 16px 12px" }}>
          順位は 勝点（勝 3・分 1）→ 得失点差 → 得点 の順に自動で並びます。試合数は 勝＋分＋敗 です。
        </div>
        <button className="bigbtn" onClick={saveLeague}>
          保存する
        </button>
      </Sheet>

      {/* 大会の登録・管理 */}
      <Sheet open={sheet?.type === "competitions"} onClose={pane ? paneBack : close} pane={pane}>
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
                  {/* p15 §3: 編集中の行は入力欄 2 つ＋保存／キャンセル（体力測定の種目管理と同じクラス） */}
                  {compEditId === c.id ? (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* 統括調整: 入力欄は .formfield に入れてフォームと同じ見た目にする（素の input のままだった） */}
                      <div className="formfield" style={{ margin: "0 0 8px" }}>
                        <label>大会名</label>
                        <input
                          value={compEditName}
                          onChange={(e) => setCompEditName(e.target.value)}
                          placeholder="大会名"
                          autoFocus
                        />
                      </div>
                      <div className="formfield" style={{ margin: 0 }}>
                        <label>メモ（期間・会場など）</label>
                        <input
                          value={compEditNote}
                          onChange={(e) => setCompEditNote(e.target.value)}
                          placeholder="例）4〜6月・市内リーグ"
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          className="bigbtn"
                          style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                          onClick={() => {
                            if (!compEditName.trim()) {
                              board.toast("大会名を入力してください");
                              return;
                            }
                            team.updateCompetition({ id: c.id, name: compEditName, note: compEditNote });
                            setCompEditId(null);
                          }}
                        >
                          保存する
                        </button>
                        <button
                          className="bigbtn ghost"
                          style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                          onClick={() => setCompEditId(null)}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="cmpinfo">
                        <div className="cmpnm">{c.name}</div>
                        <div className="cmpsub">
                          {n}試合{c.note ? ` ・ ${c.note}` : ""}
                        </div>
                      </div>
                      <button
                        className="msgdel"
                        aria-label="大会を編集"
                        onClick={() => {
                          setCompEditId(c.id);
                          setCompEditName(c.name);
                          setCompEditNote(c.note ?? "");
                        }}
                      >
                        <IconEdit />
                      </button>
                      <button
                        className="msgdel"
                        onClick={() => {
                          if (window.confirm(`「${c.name}」を削除しますか？（試合記録は残ります）`))
                            team.removeCompetition(c.id);
                        }}
                      >
                        <E n="trash" />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Sheet>

      {/* 選手フォーム（新規追加・編集）。入力欄は個人ページと共有の PlayerBasicForm（player-hub §2-1）。
          末尾にスタッフだけ「キャプテンにする／解除」「この選手を削除」（個人ページ・一覧からはボタン列を外した） */}
      <Sheet open={sheet?.type === "playerForm"} onClose={pane ? paneBack : close} pane={pane}>
        <h2>{pf ? "選手を編集" : "選手を追加"}</h2>
        <PlayerBasicForm
          player={pf}
          viewer="staff"
          keep={pfKeep}
          onDone={() => close()}
          onDeleted={onPlayerDeleted}
          onManageGroups={() => setSheet({ type: "groups", returnToPlayerForm: pf ?? null })}
        />
      </Sheet>

    </>
  );
}

function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

export default function TeamHub() {
  return <Inner />;
}
