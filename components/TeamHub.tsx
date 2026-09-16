"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type React from "react";
import type {
  Announcement,
  AttendanceStatus,
  DominantFoot,
  FitnessRecord,
  FitnessTest,
  GoalOrigin,
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
import { ALL_POSITIONS, groupOf } from "@/lib/formations";
import { LEAGUE_STANDINGS } from "@/lib/sampleLeague";
import {
  addDays,
  byStartAsc,
  CATEGORY_PALETTE,
  categoryOf,
  diffDays,
  eventEndDate,
  eventTargetsGroup,
  gmapsDirUrl,
  gmapsEmbedUrl,
  gmapsSearchUrl,
  isAllTargets,
  isMultiDay,
  isOngoing,
  isUpcomingOrOngoing,
  occursOn,
  targetLabel,
} from "@/lib/calendarUtils";
import {
  loadCalGroup,
  loadLastEventCategory,
  saveCalGroup,
  saveLastEventCategory,
} from "@/lib/storage";
import { localDateStr } from "@/lib/dates";
import { attendanceRate } from "@/lib/teamStats";
import { aggregateTech, matchSummary, perMatchTech, perPlayerTech } from "@/lib/teamStatsAgg";
import {
  DRIBBLE_PCT_MIN_ATTEMPTS,
  PASS_PCT_MIN_ATTEMPTS,
  playerSeasonStats,
  rankings,
  SHOT_PCT_MIN_ATTEMPTS,
} from "@/lib/playerStats";
import type { AttPeriod } from "@/lib/attendanceStats";
import { groupAttendance, monthlyAttendance, perPlayerAttendance, periodStartDate } from "@/lib/attendanceStats";
import { announcementTargetsPlayer, eventTargetsPlayer, playerInGroup } from "@/lib/groups";
import { LineChart } from "./Charts";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import { IconEdit, IconPlus } from "./icons";
import { GroupChips, useGroupFilter } from "./GroupChips";
import { fmtFitnessValue } from "@/lib/fitness";
import { MobileHeader, MobileHeaderAction } from "./MobileHeader";
import { MobileSegments } from "./MobileSegments";
import { CoachConversations, PlayerChat } from "./ChatScreen";

/** PC(マスター・ディテール発火幅)判定のブレークポイント。ChatScreen.tsx / ConsoleScreens.tsx と同じ値 */
const PC_MQ = "(min-width: 1024px)";

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

/** 利き足の表示ラベル（未設定は「—」） */
function footLabel(f?: DominantFoot): string {
  if (f === "right") return "右足";
  if (f === "left") return "左足";
  if (f === "both") return "両足";
  return "—";
}

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
  | { type: "announce" }
  | { type: "annList" }
  | { type: "day"; date: string }
  | { type: "eventView"; id: string }
  | {
      type: "match";
      record?: MatchRecord;
      /** 試合イベントから引き継ぐ初期値（新規記録用）。eventIdはtm-sheetpaneの「戻る」で
          元のeventViewへ復帰するために使う。competitionIdは予定に設定された大会をそのまま初期値へ引き継ぐ */
      prefill?: { date?: string; opponent?: string; eventId?: string; competitionId?: string };
    }
  | { type: "matchView"; id: string }
  | { type: "competitions" }
  // Phase D-1(C1-major): 予定フォームからの「＋ 管理」を挟んでも編集中の入力(title/date/
  // evGroupIdsなど)を失わないよう、呼び出し元(from=編集中のev、date=新規時の初期日)を
  // 保持する。sheetKey()で予定フォームと同じキーを返すことでSheetHostの再マウントを防ぎ、
  // paneBack()/モバイルのonCloseで元の予定フォームへ戻す
  | { type: "categories"; from?: TeamEvent; date?: string }
  // groups-everywhere §5: 選手フォームの「グループ」欄「＋ 管理」から開いた場合の戻り先。
  // 予定フォーム経由(from/date)とは別軸のため独立したフィールドにする
  | { type: "groups"; from?: TeamEvent; date?: string; returnToPlayerForm?: Player | null }
  | { type: "playerDetail"; playerId: string }
  | { type: "playerForm"; player?: Player }
  /** 体力測定の種目管理。playerForm(選手編集)から開いた場合、戻り先の選手を保持する */
  | { type: "fitnessTests"; returnTo?: Player }
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
  // カレンダーの表示月・表示モードはタブを跨いで保持する
  const now = new Date();
  const [calYm, setCalYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [calView, setCalView] = useState<"month" | "list">("month");
  // カレンダーの絞り込み（グループ）もタブを跨いで保持し、次回起動時も復元する（§3）
  const [calGroup, setCalGroup] = useState<string | null>(() => loadCalGroup());
  // 選手・保護者のカレンダー絞り込み（groups-everywhere §3）: 既定「自分の予定」。
  // コーチ向けのcalGroupとは別軸（選手にはグループ絞り込み自体を出さない）
  const [calMine, setCalMine] = useState(true);
  // Phase D-1(C1-minor): 復元直後は掃除がuseEffect後(=描画1回分遅れ)になるため、
  // 存在しないグループIDを描画に使う前にここで無効化する派生値を用意する
  // （useEffectのsetCalGroup(null)はlocalStorage掃除用としてそのまま残す）
  const calGroupEff = calGroup && team.groups.some((g) => g.id === calGroup) ? calGroup : null;
  useEffect(() => {
    // 保存済みのグループが削除済みなら「すべて」に戻す
    if (calGroup && !team.groups.some((g) => g.id === calGroup)) setCalGroup(null);
  }, [calGroup, team.groups]);
  useEffect(() => {
    saveCalGroup(calGroup);
  }, [calGroup]);

  // PC右ペイン(マスター・ディテール)の選択状態。タブを跨いで保持するためInnerで持つ
  const [recSel, setRecSel] = useState<RecSel>({ kind: "summary" });
  const [cmp, setCmp] = useState<string>("all"); // 試合記録の大会フィルタ（左右ペイン共有のためInnerへ）
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
  const [rosSel, setRosSel] = useState<string | null>(null);
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
    // Phase D-2(critical): PCレールの「チャット」(ChatScreen.tsx)はメッセージ専用で
    // 連絡(announcement)を一切描画しないため、グループ宛の連絡がPCのどこにも表示・
    // 送信できなかった。チーム運営のサブメニューに「連絡」タブを追加し、下のchat
    // レンダリング分岐(ChatTab)を共用する。メッセージ一覧は既存のPC専用チャット画面と
    // 重複するためpc向けには出さない(ChatTabのpc props参照)
    tabs.push(["chat", "連絡"]);
  } else {
    tabs = [["cal", "カレンダー"], ["rec", "試合記録"]];
    if (showRos) tabs.push(["ros", "名簿"]);
    tabs.push(["chat", "チャット"]);
  }
  const activeTab: Tab = tabs.some(([t]) => t === tab) ? tab : "cal";
  // mobile-redesign-v2 §3-3: 右のヘッダーアクション（タブ連動で1つだけ・スタッフのみ）。
  // PCのヘッダーCTA(.teamcta)と同じ対象・同じラベルにする。
  // Phase D-1(C2 major): ログインロール(board.auth.role)だけでなく閲覧ロール(isCoach=
  // team.viewer.role==="coach")も見る。選手プレビュー中はスタッフ操作を出さない
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
              ? { label: "連絡を送る", onClick: () => setSheet({ type: "announce" }) }
              : null;

  // PC専用コンソールシェルの左レール：チーム運営項目の直下にタブ帯と同じ一覧を出す。
  // レールはスクリム(left:208px)の外にあるため、シートを開いたままタブ切替できてしまう。
  // 従来(画面内タブ帯)はスクリム配下で切替不可能だった挙動に合わせ、切替時にシートを閉じる
  // PCサブメニューは「ホーム」「出欠」を出さず、カレンダー/試合記録/名簿/連絡の順で登録する。
  // 出欠タブ自体（AttendanceTab等）は削除せず残すが、PCでの入口はカレンダーの予定詳細
  // 「記録を見る・編集」経由のみに一本化する（タブとしての入口だけを外す）
  // Phase D-2(critical): 「連絡」をサブメニュー末尾に追加（tabsに無ければfilterで自然に消える）
  const subnavTabs: Tab[] = ["cal", "rec", "ros", "chat"];
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
              setSheet(null);
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
  // 対応タブを表示中でない場合は変換しない（例: homeタブ経由でmatchViewを開いた場合など）
  useEffect(() => {
    if (!isCoach || typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const sync = () => {
      if (!mql.matches) return;
      if (sheet?.type === "matchView" && activeTab === "rec") {
        setRecSel({ kind: "match", id: sheet.id });
        setSheet(null);
      } else if (sheet?.type === "playerDetail" && activeTab === "ros") {
        setRosSel(sheet.playerId);
        setSheet(null);
      } else if (sheet?.type === "attendance" && activeTab === "att") {
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
    if (intent.playerId) setRosSel(intent.playerId);
    if (intent.eventId) setSheet({ type: "eventView", id: intent.eventId });
    board.setTeamIntent(null);
  }, [board.teamIntent, board.setTeamIntent, board.auth.role, team.viewer.role, team.setViewer]);

  return (
    <div className="app teamapp">
      {pc ? (
        <header>
          {/* 戻りラベル: 押下先は常にホームのため、PCでは「‹ ホーム」に */}
          <div className="fpback" onClick={() => board.setScreen("home")}>
            ‹ ホーム
          </div>
          <div className="brand" style={{ marginLeft: 4 }}>
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
              カレンダー=予定を追加 / 試合記録=試合結果を記録 / 名簿=新規選手を追加 /
              連絡=連絡を送る(Phase D-2 critical)。他タブでは出さない */}
          {board.auth.role === "coach" && activeTab === "cal" && (
            <button className="teamcta" type="button" onClick={() => setSheet({ type: "event" })}>
              ＋ 予定を追加
            </button>
          )}
          {board.auth.role === "coach" && activeTab === "rec" && (
            <button className="teamcta" type="button" onClick={() => setSheet({ type: "match" })}>
              ＋ 試合結果を記録
            </button>
          )}
          {board.auth.role === "coach" && activeTab === "ros" && (
            <button className="teamcta" type="button" onClick={() => setSheet({ type: "playerForm" })}>
              ＋ 新規選手を追加
            </button>
          )}
          {board.auth.role === "coach" && activeTab === "chat" && (
            <button className="teamcta" type="button" onClick={() => setSheet({ type: "announce" })}>
              ＋ 連絡を送る
            </button>
          )}
        </header>
      ) : (
        // mobile-redesign-v2 §3-3: タイトルは変更なし。右のアクションはタブ連動で1つだけ
        // （スタッフのみ・headerActionで算出済み）。下部タブ「チーム」の直下画面のため戻るは出さない
        <MobileHeader
          title={board.auth.role === "coach" ? "チーム運営" : "チーム"}
          actions={
            headerAction && (
              <MobileHeaderAction primary label={headerAction.label} onClick={headerAction.onClick}>
                <IconPlus />
              </MobileHeaderAction>
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
      <MobileSegments
        wrapClassName="fbar"
        ariaLabel="チーム運営の表示切替"
        items={tabs.map(([t, label]) => ({
          key: t,
          label,
          on: activeTab === t,
          onSelect: () => setTab(t),
        }))}
      />

      {/* PC専用の第2ペインを出す(=グリッドが発火する)のは、元来の3ペイン構成である
          コーチのrec/ros/attタブのみ。それ以外(home/calタブ・選手ロール)でsheetを開くと
          グリッドが破綻するため、そちらは.scroll直下の全幅表示(画面切替方式)へ回す */}
      {(() => {
        const showTeammain = pc && isCoach && (activeTab === "rec" || activeTab === "ros" || activeTab === "att");
        const sheetInTeammain = showTeammain && sheet != null;
        // showTeammain対象外(home/calタブ、または選手ロール)でsheetが開いているときは、
        // .scroll内のタブ本体を出さず、代わりにSheetHost(pane)を.scroll直下に全幅表示する
        const sheetInline = pc && sheet != null && !sheetInTeammain;
        return (
          <>
            {/* paddingは基底CSS(.teamapp .scroll)へ移設（PCで上書きできるように） */}
            <div className="scroll">
              {sheetInline ? (
                <SheetHost
                  key={sheetKey(sheet)}
                  pane
                  sheet={sheet}
                  setSheet={setSheet}
                  players={players}
                  isCoach={isCoach}
                  calGroup={calGroupEff}
                  calMine={calMine}
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
                      calGroup={calGroupEff}
                      setCalGroup={setCalGroup}
                      calMine={calMine}
                      setCalMine={setCalMine}
                    />
                  )}
                  {activeTab === "rec" && (
                    <MatchesTab
                      isCoach={isCoach}
                      players={players}
                      setSheet={setSheet}
                      recSel={recSel}
                      setRecSel={setRecSel}
                      cmp={cmp}
                      setCmp={setCmp}
                    />
                  )}
                  {activeTab === "ros" && isCoach && board.auth.role === "coach" && (
                    <RosterTab players={players} setSheet={setSheet} rosSel={rosSel} setRosSel={setRosSel} />
                  )}
                  {activeTab === "chat" && <ChatTab isCoach={isCoach} setSheet={setSheet} pc={pc} />}
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
                    calGroup={calGroupEff}
                    calMine={calMine}
                  />
                ) : (
                  <>
                    {activeTab === "rec" &&
                      (recSel.kind === "summary" ? (
                        <RecSummaryPane cmp={cmp} players={players} setRecSel={setRecSel} />
                      ) : recSel.kind === "match" ? (
                        <RecMatchPane id={recSel.id} players={players} setRecSel={setRecSel} setSheet={setSheet} isCoach={isCoach} />
                      ) : (
                        <RecPlayerPane id={recSel.id} players={players} setRecSel={setRecSel} />
                      ))}
                    {activeTab === "ros" &&
                      (rosSel ? (
                        <RosPlayerPane key={rosSel} playerId={rosSel} players={players} isCoach={isCoach} setSheet={setSheet} setRosSel={setRosSel} />
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
          calGroup={calGroupEff}
          calMine={calMine}
        />
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
        (s.prefill ? `pf-${s.prefill.date ?? ""}-${s.prefill.opponent ?? ""}` : "new"))
    );
  if (s.type === "matchView") return "mv-" + s.id;
  if (s.type === "playerDetail") return "pd-" + s.playerId;
  if (s.type === "playerForm") return "pf-" + (s.player?.id ?? "new");
  return s.type;
}

/* ---------------- チャット（チーム運営内。mobile-redesign-v2 §3-2） ---------------- */
function ChatTab({
  isCoach,
  setSheet,
  pc,
}: {
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  /** Phase D-2(critical): PC(チーム運営)から呼ぶときはtrue。PCには別途チャット専用の
   * レール項目(ChatScreen.tsx)があるため、会話一覧はそちらと重複しないよう出さない */
  pc?: boolean;
}) {
  const board = useBoard();
  const team = useTeam();
  // groups-everywhere §4: 選手・保護者のチャットタブの「連絡」は自分宛（全員 or 所属グループ）だけ
  const me = !isCoach
    ? board.state.players.find((p) => p.id === team.viewer.memberPlayerId) ?? null
    : null;
  const anns = team.team.announcements.filter(
    (a) => isCoach || !me || announcementTargetsPlayer(a, me, team.groups)
  );
  // Phase D-2(critical): PCの「連絡」タブはこの一覧そのものが目的の画面なので全件を出し、
  // 「すべて見る ›」(annListシートへの迂回)は挟まない。モバイルは従来どおり2件＋すべて見る
  const shown = pc ? anns : anns.slice(0, 2);

  return (
    <>
      {/* 旧ホームタブの「連絡」をそのまま上部へ移設 */}
      <div className="sech">
        連絡
        {!pc && anns.length > 2 && (
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
        shown.map((a) => <AnnCard key={a.id} a={a} isCoach={isCoach} groups={team.groups} />)
      )}

      {/* ChatScreen.tsx の会話一覧／自分のスレッドをそのままタブ本体として描画する
          （会話をタップすると既存どおり openSheet({type:"chat"}) が開く）。
          Phase D-1(C2 major): isCoachは閲覧ロール(viewer.role)なので、コーチが選手
          プレビュー中(isCoach=false)はPlayerChatが出る。その際board.auth.playerIdは
          コーチアカウントのためnullになり送信が無言で失敗するので、プレビュー対象の
          selectedPlayerIdをそのまま渡す。
          Phase D-2(critical): PCには専用の「チャット」レール項目(ChatScreen.tsx)が別に
          あるため、ここで同じ会話一覧を二重に出すと表示が割れる。PCでは連絡だけに絞る */}
      {/* v2 目視レビュー(major-5): 「連絡」と会話の境界が無かったため見出しを1本入れる */}
      {!pc && (
        <>
          <div className="sech">メッセージ</div>
          {isCoach ? (
            <CoachConversations selected={null} onSelect={() => {}} />
          ) : (
            <div className="teamchatthread">
              <PlayerChat playerId={team.viewer.memberPlayerId} />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** 連絡の宛先ラベル（groups-everywhere §4）。全員なら「全員」、そうでなければグループ名を「・」連結 */
function announcementLabel(a: Announcement, groups: TeamGroup[]): string {
  if (!a.groupIds || a.groupIds.length === 0) return "全員";
  const labels = a.groupIds
    .map((id) => groups.find((g) => g.id === id)?.label)
    .filter((l): l is string => !!l);
  return labels.length > 0 ? labels.join("・") : "全員";
}

/* 連絡1件の表示カード */
function AnnCard({ a, isCoach, groups }: { a: Announcement; isCoach: boolean; groups: TeamGroup[] }) {
  const team = useTeam();
  const label = announcementLabel(a, groups);
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
      {/* groups-everywhere §4: 宛先バッジ（学年グループ・カスタムグループが無ければ出さない） */}
      {groups.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span className={`evgroups${label === "全員" ? "" : " targeted"}`}>{label}</span>
        </div>
      )}
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

/* 対象バッジ（カレンダーのグループ機能§5）。全員=薄い地、グループ指定=accent地。
   full=true（予定詳細）は省略せず全文表示する */
function EvGroupsBadge({
  ev,
  groups,
  full,
}: {
  ev: TeamEvent;
  groups: TeamGroup[];
  full?: boolean;
}) {
  // Phase D-1(C2-minor): グループを1つも作っていないチームでは対象バッジ自体を出さない
  // （絞り込み行と同じ「グループが無ければ出さない」扱いに揃える）
  if (groups.length === 0) return null;
  const label = targetLabel(ev, groups);
  // Phase D-1(C2-minor): 色分けの判定基準をisAllTargets(groupIdsの有無)ではなく
  // 表示ラベルに揃える。削除済み/存在しないグループIDだけの予定は、ラベルが「全員」なのに
  // accent色になる食い違いを防ぐ
  return (
    <span
      className={`evgroups${label === "全員" ? "" : " targeted"}${full ? " full" : ""}`}
      title={full ? undefined : label}
    >
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
        <span className="evtitle">{ev.title}</span>
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
      <div style={{ marginTop: 6 }}>
        <EvGroupsBadge ev={ev} groups={team.groups} />
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
  calGroup,
  setCalGroup,
  calMine,
  setCalMine,
}: {
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  ym: { y: number; m: number };
  setYm: (v: { y: number; m: number }) => void;
  view: "month" | "list";
  setView: (v: "month" | "list") => void;
  /** カレンダーの絞り込み中グループ（コーチ向け）。null=すべて */
  calGroup: string | null;
  setCalGroup: (v: string | null) => void;
  /** 選手・保護者向けの絞り込み: true=自分の予定だけ／false=すべて（groups-everywhere §3） */
  calMine: boolean;
  setCalMine: (v: boolean) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  // isCoach=false（選手・保護者、またはコーチの選手プレビュー）のときの「自分」
  const me = !isCoach ? board.state.players.find((p) => p.id === team.viewer.memberPlayerId) ?? null : null;
  const passesFilter = (e: TeamEvent) =>
    isCoach ? eventTargetsGroup(e, calGroup) : !calMine || !me || eventTargetsPlayer(e, me, team.groups);

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
  const calGroupLabel = calGroup ? team.groups.find((g) => g.id === calGroup)?.label ?? null : null;

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

  // 日付ごとの予定行（リスト表示と、スマホの月表示下の「今日からの予定」で共用）
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
              return (
                <div
                  key={e.id}
                  className={`agbar ${e.kind}`}
                  style={{ borderLeftColor: cat.color }}
                  onClick={() => setSheet({ type: "eventView", id: e.id })}
                >
                  <span className="agkind" style={{ background: cat.color }}>
                    <i className="evdot" style={{ background: cat.color }} />
                    {cat.label}
                  </span>
                  <span className="agtitle">{e.title}</span>
                  <EvGroupsBadge ev={e} groups={team.groups} />
                  {timeLabel && <span className="agtime">{timeLabel}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    });

  return (
    <div className="cal">
      {/* groups-everywhere §3: 選手・保護者には既存のグループ絞り込みは出さず、代わりに
          「自分の予定／すべて」の2択（既定=自分の予定）を出す */}
      {isCoach ? (
        // §3: グループの絞り込み行（.mseg-itemと同じチップ文法）。グループが無ければ出さない
        team.groups.length > 0 && (
          <>
            <MobileSegments
              wrapClassName="calfilter"
              ariaLabel="カレンダーの絞り込み"
              items={[
                { key: "all", label: "すべて", on: calGroup == null, onSelect: () => setCalGroup(null) },
                ...team.groups.map((g) => ({
                  key: g.id,
                  label: g.label,
                  on: calGroup === g.id,
                  onSelect: () => setCalGroup(g.id),
                })),
              ]}
            />
            {calGroupLabel && (
              <div className="calfilterhint">{calGroupLabel}の予定と全員の予定を表示中</div>
            )}
          </>
        )
      ) : (
        me && (
          <MobileSegments
            wrapClassName="calfilter"
            ariaLabel="カレンダーの絞り込み"
            items={[
              { key: "mine", label: "自分の予定", on: calMine, onSelect: () => setCalMine(true) },
              { key: "all", label: "すべて", on: !calMine, onSelect: () => setCalMine(false) },
            ]}
          />
        )
      )}

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
                  // §4: 予定が1件以上ある日も含め、常に日別シートを開く（予定が無い日は従来どおり）
                  onClick={() => setSheet({ type: "day", date: ds })}
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
                    {/* Phase D-1(C1-minor): スマホ390pxのセル幅では点3つ+「+n」が1行に
                        収まらず2行目へ折り返してレイアウトが崩れるため、4件以上のときは
                        点を2つに減らして「+n」と1行で収める（3件以下は従来どおり点3つ） */}
                    {evs.slice(0, evs.length > 3 ? 2 : 3).map((e) => (
                      <span
                        key={e.id}
                        className="caldot"
                        style={{ background: categoryOf(e, team.categories).color }}
                      />
                    ))}
                    {/* §4: 4件以上は点2つ＋「+n」（12px未満は使わない） */}
                    {evs.length > 3 && <span className="caldotmore">+{evs.length - 2}</span>}
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
          {/* v2 目視レビュー(minor-10): 月表示だけでは時刻・場所が読めず下半分が空くため、
              スマホでは月グリッドの下に予定の行（当月なら今日以降、最大5日分）を続ける。PC は変更しない */}
          {!pc &&
            (() => {
              const isThisMonth = today.startsWith(`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`);
              const days = isThisMonth ? monthDays.filter((x) => x.ds >= today) : monthDays;
              return (
                <div className="agenda calagenda">
                  <div className="sech">
                    {isThisMonth ? "今日からの予定" : "この月の予定"}
                    {days.length > 5 && (
                      <span className="seclink" onClick={() => setView("list")}>
                        すべて見る ›
                      </span>
                    )}
                  </div>
                  {days.length === 0 ? (
                    <div className="empty-msg" style={{ padding: "8px 0" }}>
                      {isThisMonth ? "今日以降の予定はありません。" : "この月の予定はありません。"}
                    </div>
                  ) : (
                    renderAgendaRows(days.slice(0, 5))
                  )}
                </div>
              );
            })()}
        </>
      ) : (
        <div className="agenda">
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
    </div>
  );
}

/* ---------------- 試合記録 ---------------- */
function MatchesTab({
  isCoach,
  players,
  setSheet,
  recSel,
  setRecSel,
  cmp,
  setCmp,
}: {
  isCoach: boolean;
  players: Player[];
  setSheet: (s: SheetState) => void;
  recSel?: RecSel;
  setRecSel?: (s: RecSel) => void;
  cmp: string;
  setCmp: (v: string) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  const comps = team.team.competitions;
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

      {/* 大会フィルタ。PCはコンパクトなselect1個、モバイルは従来のチップ列(横スクロール) */}
      {(comps.length > 0 || hasOther) &&
        (pc ? (
          <select className="cmpselect" value={cmp} onChange={(e) => setCmp(e.target.value)}>
            <option value="all">すべて</option>
            {comps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {hasOther && <option value="none">その他</option>}
          </select>
        ) : (
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
        ))}
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

      {/* mobile-redesign-v2 §3-3: PC・スマホともヘッダーの「＋ 試合結果を記録」に一本化した
          ため、ページ内の全幅緑ボタンは出さない（PCは元々!pcで非表示だったため変更なし） */}

      {matches.length === 0 ? (
        <div className="empty-msg">まだ試合記録がありません。</div>
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
                onClick={() => {
                  if (isCoach && setRecSel && typeof window !== "undefined" && window.matchMedia(PC_MQ).matches) {
                    setRecSel({ kind: "match", id: m.id });
                  } else {
                    setSheet({ type: "matchView", id: m.id });
                  }
                }}
              >
                <div className={`mres ${win ? "w" : draw ? "d" : "l"}`}>{win ? "勝" : draw ? "分" : "敗"}</div>
                <div className="mmid">
                  <div className="mopp">vs {m.opponent}</div>
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
function RosterTab({
  players,
  setSheet,
  rosSel,
  setRosSel,
}: {
  players: Player[];
  setSheet: (s: SheetState) => void;
  rosSel?: string | null;
  setRosSel?: (id: string | null) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  const schoolStage = team.team.schoolStage ?? "elementary";
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  // groups-everywhere §5: グループ絞り込み（単一選択・localStorageに保存）
  const [filterIds, setFilterIds] = useGroupFilter("roster");
  const filterGroup = filterIds[0] ? team.groups.find((g) => g.id === filterIds[0]) ?? null : null;
  const list = players.filter(
    (p) =>
      (!kw || p.name.toLowerCase().includes(kw) || p.position.toLowerCase().includes(kw)) &&
      (!filterGroup || playerInGroup(p, filterGroup))
  );
  // 学年ごとの見出しで区切る（「中3（23）」）。学年未設定は末尾にまとめる
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
  const onRowClick = (id: string) => {
    if (setRosSel && typeof window !== "undefined" && window.matchMedia(PC_MQ).matches) {
      setRosSel(id);
    } else {
      setSheet({ type: "playerDetail", playerId: id });
    }
  };
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
      {/* groups-everywhere §5: すべて／学年／カスタムの絞り込み。グループが無ければ出さない */}
      {team.groups.length > 0 && (
        <GroupChips
          groups={team.groups}
          value={filterIds}
          onChange={setFilterIds}
          allowAll
          onManage={() => setSheet({ type: "groups" })}
        />
      )}
      {list.length === 0 ? (
        <div className="empty-msg">
          <b>選手がいません</b>
          <br />
          下のボタンから追加できます
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
                        onClick={() => onRowClick(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(p.id);
                          }
                        }}
                      >
                        <td className="num">{p.number ?? "—"}</td>
                        <td className="ptable-nm col-name">
                          {p.name}
                          {board.state.captain === p.id ? " (C)" : ""}
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
                  onClick={() => onRowClick(p.id)}
                >
                  <div className={`pos ${groupOf(p.position)}`}>{p.position}</div>
                  <div className="meta">
                    <div className="nm">
                      {p.name}
                      {board.state.captain === p.id ? " (C)" : ""}
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
      {/* mobile-redesign-v2 §3-3: 名簿の全幅緑ボタンはスマホでは描画しない
          （スマホはヘッダー右上の「選手を追加」に一本化。PCは変更しない） */}
      {pc && (
        <button
          className="bigbtn"
          style={{ width: "100%", margin: "8px 0 0" }}
          onClick={() => setSheet({ type: "playerForm" })}
        >
          ＋ 新規選手を追加
        </button>
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

/**
 * 試合詳細UI本体。試合詳細シート(モバイル)とPC右ペイン(rec/match)の両方から使う共有ボディ。
 * onEdit/onDelete で「閉じ方」だけ呼び出し側(シート=setSheet(null) / ペイン=summaryへ戻る)に委ねる
 */
function MatchDetailBody({
  m,
  players,
  isCoach,
  onEdit,
  onDelete,
}: {
  m: MatchRecord;
  players: Player[];
  isCoach: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const team = useTeam();
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";
  const win = m.ourScore > m.theirScore;
  const draw = m.ourScore === m.theirScore;
  return (
    <>
      <h2>
        vs {m.opponent}
        {/* v2 目視レビュー(major-3): 一覧の「勝/分/敗」と揃える（英字バッジをやめる） */}
        <span>{win ? "勝" : draw ? "分" : "敗"}</span>
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
        {halfLabel(m) ? <> ・ {halfLabel(m)}</> : ""}
      </div>
      <div className="detail">
        {(m.formation || (m.lineup && m.lineup.length > 0)) && (
          <div className="dsec">
            <div className="dsec-h"><E n="clipboard" /> フォーメーション</div>
            {m.formation && <div className="dline">{m.formation}</div>}
            {m.lineup && m.lineup.length > 0 && (
              <div className="dline">
                {m.lineup.map((l, i) => (
                  <span key={i}>
                    {i > 0 ? " ・ " : ""}
                    {l.pos}: {nameOf(l.playerId)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
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
                {g.origin ? ` ・ ${GOAL_ORIGIN_LABELS[g.origin]}` : ""}
              </div>
            ))
          )}
        </div>
        {m.conceded && m.conceded.length > 0 && (
          <div className="dsec">
            <div className="dsec-h"><E n="ball" /> 失点</div>
            {m.conceded.map((c, i) => (
              <div key={i} className="dline">
                {c.minute != null ? `${c.minute}' ` : ""}
                {c.origin ? GOAL_ORIGIN_LABELS[c.origin] : "形態未記録"}
              </div>
            ))}
          </div>
        )}
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
          {/* v2 目視レビュー(major-2): スマホでは主操作を --accent 地に（PC は ghost のまま。
              .accent の規則は .teamapp:has(.mhead) 配下限定） */}
          <button className="bigbtn ghost accent" onClick={onEdit}>
            編集する
          </button>
          <button
            className="bigbtn ghost"
            style={{ color: "var(--red)" }}
            onClick={() => {
              if (window.confirm("この試合記録を削除しますか？")) {
                team.removeMatch(m.id);
                onDelete();
              }
            }}
          >
            削除する
          </button>
        </>
      )}
    </>
  );
}

/**
 * 選手プロフィールUI本体。選手詳細シート(モバイル)とPC右ペイン(ros/選手選択)の両方から使う共有ボディ
 */
function PlayerDetailBody({
  p,
  isCoach,
  onEdit,
  onDelete,
  hideFitness,
}: {
  p: Player;
  isCoach: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** PC名簿詳細(RosPlayerPane)は体力測定をより詳しいセクション(最新値・前回差・履歴)として
   * 別途描画するため、こちらの簡易一覧は二重表示を避けて非表示にする（モバイルは既定=表示のまま） */
  hideFitness?: boolean;
}) {
  const board = useBoard();
  const team = useTeam();
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
        {!hideFitness && p.fitness && p.fitness.length > 0 && (
          <div className="dsec">
            <div className="dsec-h">体力測定</div>
            {p.fitness.map((f, i) => {
              const test = team.team.fitnessTests?.find((t) => t.id === f.testId);
              return (
                <div key={`${f.testId}-${i}`} className="dline">
                  {test?.name ?? "削除済みの種目"} {f.value}
                  {test?.unit ?? ""}（{fmtDate(f.date)}）
                </div>
              );
            })}
          </div>
        )}
      </div>
      {isCoach && (
        <>
          {/* v2 目視レビュー(major-1/2): スマホの詳細シートの主操作は3シートとも --accent 地に統一
              （.accent は .teamapp:has(.mhead) 配下でだけ効く。PC は従来どおり） */}
          <button className="bigbtn accent" onClick={onEdit}>
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
              if (window.confirm(`${p.name}を名簿から削除しますか？出欠の記録も削除されます`)) {
                board.deletePlayer(p.id);
                team.removePlayerAnswers(p.id);
                if (team.viewer.memberPlayerId === p.id) team.setViewer("coach", null);
                onDelete();
              }
            }}
          >
            削除する
          </button>
        </>
      )}
    </>
  );
}

/* ----------------------------------------------------------------
   試合記録タブ・PC右ペイン
   ---------------------------------------------------------------- */

/** RecSummaryPaneのkpicard2で切り替える月別推移の指標。既定は勝率 */
type RecKpiMetric = "played" | "winPct" | "goals" | "conceded";
/** RecSummaryPane先頭のセグメント。既定=チーム成績 */
type RecSummaryMode = "team" | "player";

/** summary: 大会フィルタ適用後のチーム成績(順位表+サイド)・個人成績(各種ランキング)を
    先頭の.tsegセグメントで切り替える */
function RecSummaryPane({
  cmp,
  players,
  setRecSel,
}: {
  cmp: string;
  players: Player[];
  setRecSel: (s: RecSel) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const [mode, setMode] = useState<RecSummaryMode>("team");
  const [recMetric, setRecMetric] = useState<RecKpiMetric>("winPct");
  const comps = team.team.competitions;
  const allMatches = team.team.matches;
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
           リーグ順位表はデモ用の固定データ(lib/sampleLeague.ts)。大会フィルタ(cmp)には連動せず常に全体を表示する */
        <div className="recsplit">
          <div className="recleague">
            <div className="sech">リーグ順位表</div>
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
                  {LEAGUE_STANDINGS.map((r) => {
                    const diff = r.gf - r.ga;
                    return (
                      <tr key={r.rank} className={r.own ? "own" : undefined}>
                        <td className="num">{r.rank}</td>
                        <td className="col-name">{r.name}</td>
                        <td className="num">{r.played}</td>
                        <td className="num">{r.win}</td>
                        <td className="num">{r.draw}</td>
                        <td className="num">{r.loss}</td>
                        <td className="num">{diff > 0 ? `+${diff}` : diff}</td>
                        <td className="num leaguepts">{r.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="recside">
            {matches.length === 0 ? (
              <div className="empty-msg">まだ試合記録がありません。</div>
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

/** match: 試合詳細＋「‹ サマリー」戻りリンク */
function RecMatchPane({
  id,
  players,
  setRecSel,
  setSheet,
  isCoach,
}: {
  id: string;
  players: Player[];
  setRecSel: (s: RecSel) => void;
  setSheet: (s: SheetState) => void;
  isCoach: boolean;
}) {
  const team = useTeam();
  const m = team.team.matches.find((x) => x.id === id);
  return (
    <div className="tmdetail screenbody">
      <div className="tmback" onClick={() => setRecSel({ kind: "summary" })}>
        ‹ サマリー
      </div>
      {m ? (
        <MatchDetailBody
          m={m}
          players={players}
          isCoach={isCoach}
          onEdit={() => setSheet({ type: "match", record: m })}
          onDelete={() => setRecSel({ kind: "summary" })}
        />
      ) : (
        <div className="empty-msg">この試合記録は削除されました。</div>
      )}
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

/* ---------------- 名簿タブ・PC右ペイン ---------------- */

/**
 * rosSel選択時の右ペイン。PlayerDetailBody(基本情報・怪我履歴)に加え、
 * PC専用の詳細セクション(今季成績/出席/ノート提出/体力測定)を追加する(R3)。
 * PlayerDetailBody自体の簡易な体力測定表示はここでは二重表示になるためhideFitnessで隠し、
 * 代わりに種目ごとの最新値・前回差(意味色)・履歴展開を持つ詳しい表示をこちらで描画する
 */
function RosPlayerPane({
  playerId,
  players,
  isCoach,
  setSheet,
  setRosSel,
}: {
  playerId: string;
  players: Player[];
  isCoach: boolean;
  setSheet: (s: SheetState) => void;
  setRosSel: (id: string | null) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const p = players.find((x) => x.id === playerId);
  const stats = p ? playerSeasonStats(p.id, team.team.matches, board.notebook) : null;
  const attRow = p ? perPlayerAttendance(team.team, [p], "all")[0] : null;
  const myNotes = p ? board.notebook.filter((n) => n.playerId === p.id) : [];
  const lastNote = [...myNotes].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts
  )[0];

  // 体力測定: 種目ごとに記録を新しい順へグルーピングし、最新値・前回差を出す
  const fitnessByTest = new Map<string, FitnessRecord[]>();
  (p?.fitness ?? []).forEach((f) => {
    const list = fitnessByTest.get(f.testId) ?? [];
    list.push(f);
    fitnessByTest.set(f.testId, list);
  });
  fitnessByTest.forEach((list) => list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
  // 種目定義(team.team.fitnessTests)に無いtestId(種目を削除した後も記録は残る)の記録が
  // 無言で欠落しないよう、記録側のtestId集合も行として列挙する。他画面(PlayerDetailBody等)と
  // 同じ「削除済みの種目」ラベルで、単位なし・差分は値のみ(意味色なし)で描画する
  const knownTests = (team.team.fitnessTests ?? []).filter(
    (t) => (fitnessByTest.get(t.id)?.length ?? 0) > 0
  );
  const knownTestIds = new Set(knownTests.map((t) => t.id));
  const orphanTestIds = Array.from(fitnessByTest.keys()).filter((id) => !knownTestIds.has(id));
  const testsWithRecords: { id: string; name: string; unit: string; lowerIsBetter?: boolean }[] = [
    ...knownTests.map((t) => ({ id: t.id, name: t.name, unit: t.unit, lowerIsBetter: t.lowerIsBetter })),
    ...orphanTestIds.map((id) => ({ id, name: "削除済みの種目", unit: "", lowerIsBetter: undefined })),
  ];
  const toggleTest = (id: string) =>
    setExpandedTests((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="tmdetail screenbody">
      {p && stats ? (
        <>
          <PlayerDetailBody
            p={p}
            isCoach={isCoach}
            onEdit={() => setSheet({ type: "playerForm", player: p })}
            onDelete={() => setRosSel(null)}
            hideFitness
          />

          <div className="sech">今季成績</div>
          <div className="hdash">
            <div className="hstat"><div className="hstat-n">{stats.apps}</div><div className="hstat-l">出場</div></div>
            <div className="hstat"><div className="hstat-n">{stats.goals}</div><div className="hstat-l">得点</div></div>
            <div className="hstat"><div className="hstat-n">{stats.assists}</div><div className="hstat-l">アシスト</div></div>
          </div>
          <div className="evnote">選手が提出した試合ノートの記録から集計しています。</div>
          <div className="hdash">
            <div className="hstat">
              <div className="hstat-n">{stats.shotPct ?? "—"}{stats.shotPct != null ? "%" : ""}</div>
              <div className="hstat-l">シュート決定率（{stats.noteGoals}/{stats.shots}）</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">{stats.passPct ?? "—"}{stats.passPct != null ? "%" : ""}</div>
              <div className="hstat-l">パス成功率（試行{stats.passAtt}）</div>
            </div>
            <div className="hstat">
              <div className="hstat-n">{stats.dribblePct ?? "—"}{stats.dribblePct != null ? "%" : ""}</div>
              <div className="hstat-l">ドリブル成功率（試行{stats.dribbleAtt}）</div>
            </div>
          </div>

          <div className="sech">出席</div>
          <div className="hdash">
            <div className="hstat"><div className="hstat-n">{attRow?.pct ?? 0}%</div><div className="hstat-l">出席率</div></div>
            <div className="hstat"><div className="hstat-n">{attRow?.yes ?? 0}</div><div className="hstat-l">出席</div></div>
            <div className="hstat"><div className="hstat-n">{attRow?.no ?? 0}</div><div className="hstat-l">欠席</div></div>
            <div className="hstat"><div className="hstat-n">{attRow?.maybe ?? 0}</div><div className="hstat-l">未定</div></div>
          </div>

          <div className="sech">ノート提出</div>
          <div className="dline">
            提出件数 {myNotes.length}件
            {lastNote ? ` ・ 直近 ${fmtDate(lastNote.date)}` : ""}
          </div>

          <div className="sech">体力測定</div>
          {testsWithRecords.length === 0 ? (
            <div className="empty-msg">記録がありません。</div>
          ) : (
            <div className="list">
              {testsWithRecords.map((t) => {
                const recs = fitnessByTest.get(t.id)!;
                const latest = recs[0];
                const prev = recs[1];
                const diff = prev != null ? Math.round((latest.value - prev.value) * 100) / 100 : null;
                // 意味色: lowerIsBetter(小さい方が良い)を踏まえ、改善=緑・悪化=赤。
                // 削除済みの種目(lowerIsBetter不明)は方向を判定できないため常にnull(色なし・値のみ)
                const improved =
                  diff != null && diff !== 0 && t.lowerIsBetter != null
                    ? (t.lowerIsBetter ? diff < 0 : diff > 0)
                    : null;
                const expanded = expandedTests.has(t.id);
                return (
                  <div
                    key={t.id}
                    className="cmprow"
                    style={{ cursor: "pointer", flexWrap: "wrap" }}
                    onClick={() => toggleTest(t.id)}
                  >
                    <div className="cmpinfo">
                      <div className="cmpnm">{t.name}</div>
                      <div className="cmpsub">{fmtDate(latest.date)}</div>
                    </div>
                    <div className="sgoals">
                      {fmtFitnessValue(latest.value, t.unit)}
                      {diff != null && (
                        <span
                          style={{
                            marginLeft: 6,
                            color:
                              improved === true ? "var(--lime)" : improved === false ? "var(--red)" : "var(--mut)",
                          }}
                        >
                          {diff > 0 ? `+${diff}` : diff}{t.unit}
                        </span>
                      )}
                    </div>
                    {expanded && (
                      <div style={{ width: "100%", marginTop: 6 }}>
                        {recs.map((r, i) => (
                          <div key={i} className="dline">
                            {fmtDate(r.date)} {fmtFitnessValue(r.value, t.unit)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {isCoach && (
            <button className="dynadd" onClick={() => setSheet({ type: "playerForm", player: p })}>
              ＋ 測定記録を追加
            </button>
          )}
        </>
      ) : (
        <div className="empty-msg">この選手は見つかりません。</div>
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
    .filter((e) => e.date <= today)
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
 * カスタムグループのメンバー編集（groups-everywhere §5）。検索付きのチェックリストで
 * Player.groupIdsを一括編集する。学年グループ（kind:"grade"）はここから呼ばれない
 * （所属はPlayer.gradeから自動のため編集不可）。
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
  const schoolStage = team.team.schoolStage ?? "elementary";
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  const list = players.filter((p) => !kw || p.name.toLowerCase().includes(kw));
  // Phase D-1(C2-minor): 70人が学年区切りなし・学年表示なしの一列だと「中3の誰か」を
  // 背番号だけで探すことになるため、行に学年ラベルを足す。選択中の人数も表示する
  const selectedCount = players.filter((p) => p.groupIds?.includes(group.id)).length;
  const toggle = (p: Player) => {
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
        {selectedCount}人を選択中
      </div>
      <div className="list">
        {list.length === 0 ? (
          <div className="empty-msg">該当する選手がいません。</div>
        ) : (
          list.map((p) => {
            const checked = p.groupIds?.includes(group.id) ?? false;
            return (
              <label key={p.id} className="attrow" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(p)} />
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
 * 試合結果フォーム専用のスタメン枠定義（8人制）。pos文字列にGK/DF/MF/FWを明記し、
 * MatchRecord.lineupのposへそのまま保存する。lib/formations.tsのFORMATIONS
 * （ピッチ座標つき・戦術ボード用）とは別に、フォームの選手選択セレクト群だけに使う軽量定義
 */
const MATCH_FORMATION_SLOTS: Record<string, string[]> = {
  "3-3-1": ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "FW1"],
  "2-4-1": ["GK", "DF1", "DF2", "MF1", "MF2", "MF3", "MF4", "FW1"],
  "3-2-2": ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "FW1", "FW2"],
  "2-3-2": ["GK", "DF1", "DF2", "MF1", "MF2", "MF3", "FW1", "FW2"],
};
const MATCH_FORMATION_KEYS = Object.keys(MATCH_FORMATION_SLOTS);

/* ---------------- Sheets ---------------- */
function SheetHost({
  sheet,
  setSheet,
  players,
  isCoach,
  pane,
  calGroup = null,
  calMine = true,
}: {
  sheet: SheetState;
  setSheet: (s: SheetState) => void;
  players: Player[];
  isCoach: boolean;
  /** PC専用: 配下の全Sheetをモーダルでなく.teammain内の1ペインとして描画する */
  pane?: boolean;
  /** カレンダーの絞り込み中グループ（コーチ）。日別シートの一覧に適用する（§3） */
  calGroup?: string | null;
  /** 選手・保護者向け「自分の予定」絞り込み中か（groups-everywhere §3）。日別シートに適用する */
  calMine?: boolean;
}) {
  const board = useBoard();
  const team = useTeam();
  const close = () => setSheet(null);
  // isCoach=falseのときの「自分」（選手・保護者、またはコーチの選手プレビュー）
  const me = !isCoach ? players.find((p) => p.id === team.viewer.memberPlayerId) ?? null : null;
  const dayPassesFilter = (e: TeamEvent) =>
    isCoach ? eventTargetsGroup(e, calGroup) : !calMine || !me || eventTargetsPlayer(e, me, team.groups);
  // グループ管理シート内でメンバー編集中のグループID（custom限定）。sheetがgroups以外に
  // 変わったらリセットする
  const [groupMembersId, setGroupMembersId] = useState<string | null>(null);
  useEffect(() => {
    if (sheet?.type !== "groups") setGroupMembersId(null);
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
    if (sheet?.type === "fitnessTests") {
      setSheet(sheet.returnTo ? { type: "playerForm", player: sheet.returnTo } : { type: "playerForm" });
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
  const [newCatColor, setNewCatColor] = useState(CATEGORY_PALETTE[0].color);
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catEditLabel, setCatEditLabel] = useState("");
  const [catEditColor, setCatEditColor] = useState("");

  // グループ管理（カテゴリ管理と同じ構造。色は持たない）
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupEditLabel, setGroupEditLabel] = useState("");

  // announce（groups-everywhere §4: 宛先グループ。複数選択・未選択＝全員）
  const [text, setText] = useState("");
  const [playId, setPlayId] = useState("");
  const [annGroupIds, setAnnGroupIds] = useState<string[]>([]);

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
  // フォーメーション（8人制）。既定は""(未設定)。不明キーは未設定扱い
  const [formation, setFormation] = useState<string>(
    mr?.formation && MATCH_FORMATION_SLOTS[mr.formation] ? mr.formation : ""
  );
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
  // スコアの数値解釈はここ1箇所に統一する(追加ボタンのdisabled・ヒント・保存で共用)。
  // type=number でも "1e2"/"2.5"/"-3" が入力できるため、非負整数へ正規化する
  const ourScoreNum = Math.max(0, Math.floor(Number(ourScore) || 0));
  const theirScoreNum = Math.max(0, Math.floor(Number(theirScore) || 0));

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
  // 学年（範囲とラベルはschoolStageとSTAGE_GRADES/gradeLabelで決まる。学年グループの
  // 所属判定・名簿表示用。""=未設定）
  const [pfGrade, setPfGrade] = useState(pf?.grade != null ? String(pf.grade) : "");
  // 所属カスタムグループ（groups-everywhere §5。学年グループはgradeから自動のためここには含めない）
  const [pfGroupIds, setPfGroupIds] = useState<string[]>(pf?.groupIds ?? []);

  // 体力測定：記録一覧は保存中のplayers(常に最新)から読む(pfはシート起動時点のスナップショットのため、
  // 追加/削除の直後は反映されない)。新規作成時(pf未定義)はまだ選手idが無いため対象外
  const livePf = pf ? players.find((x) => x.id === pf.id) ?? pf : undefined;
  const [fitTestId, setFitTestId] = useState(team.team.fitnessTests?.[0]?.id ?? "");
  const [fitDate, setFitDate] = useState(todayStr());
  const [fitValue, setFitValue] = useState("");
  const fitTest = (team.team.fitnessTests ?? []).find((t) => t.id === fitTestId);

  // 体力測定：種目管理（カテゴリ管理[2938行目付近]と同じ構造で編集/削除/追加）
  const [newTestName, setNewTestName] = useState("");
  const [newTestUnit, setNewTestUnit] = useState("");
  const [newTestLower, setNewTestLower] = useState(false);
  const [testEditId, setTestEditId] = useState<string | null>(null);
  const [testEditName, setTestEditName] = useState("");
  const [testEditUnit, setTestEditUnit] = useState("");
  const [testEditLower, setTestEditLower] = useState(false);

  const firstPid = players[0]?.id ?? "";

  return (
    <>
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

      {/* グループ管理（カレンダーの対象§2 / groups-everywhere §5）。カテゴリ管理と同じ構造
          （色は持たない）。削除時は team.removeGroup 内で全予定の groupIds からも外す。
          学年グループ（kind:"grade"）は改名のみ・削除不可・メンバー編集不可（所属はgradeから自動）。
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
                  <div key={g.id} className="catrow">
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
                        {/* Phase D-1(C2-minor): サブテキストが非タップで、メンバー編集の入口が
                            右側の人型アイコン(次のbutton)だけだと初見で気づきにくい。
                            仕様§5「『メンバー（n人）』→ 選手のチェックリスト」どおり、
                            サブテキスト自体もタップ可能にする（既存アイコンは残す） */}
                        <div
                          className="cmpinfo"
                          style={isGrade ? undefined : { cursor: "pointer" }}
                          onClick={isGrade ? undefined : () => setGroupMembersId(g.id)}
                          role={isGrade ? undefined : "button"}
                          tabIndex={isGrade ? undefined : 0}
                          onKeyDown={
                            isGrade
                              ? undefined
                              : (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setGroupMembersId(g.id);
                                  }
                                }
                          }
                        >
                          <div className="cmpnm">{g.label}</div>
                          <div className="cmpsub">
                            {isGrade ? "学年グループ（改名のみ）" : `メンバー ${memberCount}人 ›`}
                          </div>
                        </div>
                        {!isGrade && (
                          <button
                            className="msgdel"
                            aria-label="メンバーを編集"
                            onClick={() => setGroupMembersId(g.id)}
                          >
                            <E n="users" />
                          </button>
                        )}
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
                        {!isGrade && (
                          <button
                            className="msgdel"
                            aria-label="削除"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `「${g.label}」を削除しますか？（予定からもこのグループが外れます）`
                                )
                              )
                                team.removeGroup(g.id);
                            }}
                          >
                            <E n="trash" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
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
                    <div className="cmpnm">{t.name}</div>
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

      {/* 連絡フォーム */}
      <Sheet open={sheet?.type === "announce"} onClose={pane ? paneBack : close} pane={pane}>
        <h2>連絡を送る</h2>
        <div className="formfield">
          <label>本文</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="例）明日の練習は雨天中止の場合あり。朝7時に判断します。"
          />
        </div>
        {/* groups-everywhere §4: 宛先グループ（複数選択・未選択＝全員） */}
        {team.groups.length > 0 && (
          <div className="formfield">
            <label>宛先</label>
            <GroupChips
              groups={team.groups}
              value={annGroupIds}
              onChange={setAnnGroupIds}
              allowAll
              onManage={() => setSheet({ type: "groups" })}
            />
          </div>
        )}
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
          // Phase D-1(C2-minor): §4で追加した「宛先」チップ(青)の直下で送信ボタンだけ緑のまま
          // だったため、グループ管理シートの「追加する」と同じ流儀でモバイルはaccent(青)にする。
          // PC(pane)は不変
          className={`bigbtn${pane ? "" : " accent"}`}
          onClick={() => {
            if (!text.trim()) {
              board.toast("本文を入力してください");
              return;
            }
            const pt = playId ? board.library.plays.find((p) => p.id === playId)?.title : undefined;
            team.addAnnouncement(text, playId || undefined, pt, annGroupIds);
            setText("");
            setPlayId("");
            setAnnGroupIds([]);
            close();
          }}
        >
          送信する
        </button>
      </Sheet>

      {/* 連絡の一覧。groups-everywhere §4: 選手・保護者には自分宛（全員 or 所属グループ）だけ表示する */}
      <Sheet open={sheet?.type === "annList"} onClose={pane ? paneBack : close} pane={pane}>
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
          {(() => {
            const anns = team.team.announcements.filter(
              (a) => isCoach || !me || announcementTargetsPlayer(a, me, team.groups)
            );
            return anns.length === 0 ? (
              <div className="empty-msg">連絡はまだありません。</div>
            ) : (
              anns.map((a) => <AnnCard key={a.id} a={a} isCoach={isCoach} groups={team.groups} />)
            );
          })()}
        </div>
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
                          <span className="evtitle">{e.title}</span>
                          <span className="evopen" style={{ marginLeft: "auto" }}>詳細 ›</span>
                        </div>
                        <div className="evmeta">
                          {[timeLabel, e.place, compName].filter(Boolean).join(" ・ ")}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <EvGroupsBadge ev={e} groups={team.groups} />
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
                        // mobile-redesign-v2 §3-4(緑残存の自動走査対応): 緑残存走査の対象
                        // (予定詳細)のため、モバイルでは--accent地の強調にする(PC(pane)は
                        // 変更しない・元の緑bigbtnのまま)。Phase D-1(C2 minor review):
                        // 直下の「編集する」もghostだと主従の差が消えるため、試合の予定は
                        // こちらを唯一の強調にする
                        className={`bigbtn${pane ? "" : " accent"}`}
                        onClick={() =>
                          setSheet({
                            type: "match",
                            prefill: {
                              date: e.date,
                              opponent: opponentFromTitle(e.title),
                              eventId: e.id,
                              competitionId: e.competitionId,
                            },
                          })
                        }
                      >
                        この試合の結果を記録
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
      <Sheet open={sheet?.type === "match"} onClose={pane ? paneBack : close} pane={pane}>
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

        <div className="formfield">
          <label>フォーメーション</label>
          <select value={formation} onChange={(e) => setFormation(e.target.value)}>
            <option value="">未設定</option>
            {MATCH_FORMATION_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}（8人制）
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
              <div key={pos} className="formfield" style={{ flex: "1 1 130px", margin: 0 }}>
                <label>{pos}</label>
                <select
                  value={lineupMap[pos] ?? ""}
                  onChange={(e) => setLineupMap((cur) => ({ ...cur, [pos]: e.target.value }))}
                >
                  <option value="">未選択</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id} disabled={selectedElsewhere.has(p.id)}>
                      {p.name}
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
            disabled={goals.length >= ourScoreNum}
            style={goals.length >= ourScoreNum ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            onClick={() => firstPid && setGoals([...goals, { playerId: firstPid }])}
          >
            ＋ 得点者を追加
          </button>
          <div className="fieldhint">
            {ourScoreNum === 0
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
            // スタメン: 現在のフォーメーションの枠のみを対象に、未選択(空文字)の枠は除外して保存
            // (フォーメーション未設定の場合はスタメンUI自体を出さないため保存もしない)
            const lineup = formation && MATCH_FORMATION_SLOTS[formation]
              ? MATCH_FORMATION_SLOTS[formation]
                  .map((pos) => ({ pos, playerId: lineupMap[pos] ?? "" }))
                  .filter((l) => l.playerId !== "")
              : undefined;
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

      {/* 試合詳細。UI本体はMatchDetailBody（PC右ペイン rec/match と共有） */}
      <Sheet open={sheet?.type === "matchView"} onClose={pane ? paneBack : close} pane={pane}>
        {sheet?.type === "matchView" &&
          (() => {
            const m = team.team.matches.find((x) => x.id === sheet.id);
            if (!m) return null;
            return (
              <MatchDetailBody
                m={m}
                players={players}
                isCoach={isCoach}
                onEdit={() => setSheet({ type: "match", record: m })}
                onDelete={close}
              />
            );
          })()}
      </Sheet>

      {/* 選手プロフィール。UI本体はPlayerDetailBody（PC右ペイン ros/選手選択 と共有） */}
      <Sheet open={sheet?.type === "playerDetail"} onClose={pane ? paneBack : close} pane={pane}>
        {sheet?.type === "playerDetail" &&
          (() => {
            const p = players.find((x) => x.id === sheet.playerId);
            if (!p) return null;
            return (
              <PlayerDetailBody
                p={p}
                isCoach={isCoach}
                onEdit={() => setSheet({ type: "playerForm", player: p })}
                onDelete={close}
              />
            );
          })()}
      </Sheet>

      {/* 選手フォーム（新規追加・編集） */}
      <Sheet open={sheet?.type === "playerForm"} onClose={pane ? paneBack : close} pane={pane}>
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
          <label>学年</label>
          <select value={pfGrade} onChange={(e) => setPfGrade(e.target.value)}>
            <option value="">未設定</option>
            {STAGE_GRADES[team.team.schoolStage ?? "elementary"].map((n) => (
              <option key={n} value={n}>
                {gradeLabel(team.team.schoolStage ?? "elementary", n)}
              </option>
            ))}
          </select>
        </div>
        {/* groups-everywhere §5: 所属カスタムグループ（学年グループはgradeから自動のため出さない） */}
        <div className="formfield">
          <label>グループ</label>
          <GroupChips
            groups={team.groups.filter((g) => g.kind === "custom")}
            value={pfGroupIds}
            onChange={setPfGroupIds}
            multi
            onManage={() => setSheet({ type: "groups", returnToPlayerForm: pf ?? null })}
          />
          {team.groups.filter((g) => g.kind === "custom").length === 0 && (
            <div className="fieldhint">カスタムグループがありません。「＋ 管理」から追加できます。</div>
          )}
        </div>
        <div className="formfield">
          <label>メール（任意）</label>
          <input value={pfEmail} onChange={(e) => setPfEmail(e.target.value)} placeholder="ログイン用メール" />
        </div>

        {/* 体力測定（R4a）: 既存選手の編集時のみ。新規作成時はまだ選手idが無いため、
            保存後に選手詳細(RosPlayerPane)の「＋ 測定記録を追加」から行う */}
        {pf && (
          <div className="formfield">
            <label>体力測定</label>
            {(livePf?.fitness ?? []).length === 0 ? (
              <div className="dsec-e">記録なし</div>
            ) : (
              <div className="list" style={{ marginBottom: 10 }}>
                {(livePf?.fitness ?? []).map((f, i) => {
                  const test = (team.team.fitnessTests ?? []).find((t) => t.id === f.testId);
                  return (
                    <div key={`${f.testId}-${i}`} className="catrow">
                      <div className="cmpinfo">
                        <div className="cmpnm">{test?.name ?? "削除済みの種目"}</div>
                        <div className="cmpsub">
                          {fmtDate(f.date)} ・ {f.value}
                          {test ? test.unit : ""}
                        </div>
                      </div>
                      <button
                        className="msgdel"
                        aria-label="削除"
                        onClick={() => team.removeFitnessRecord(pf.id, i)}
                      >
                        <E n="trash" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {(team.team.fitnessTests ?? []).length === 0 ? (
              <div className="evnote">種目が登録されていません。「種目を管理」から追加してください。</div>
            ) : (
              <>
                <div className="formgrid">
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label>種目</label>
                    <select value={fitTestId} onChange={(e) => setFitTestId(e.target.value)}>
                      {(team.team.fitnessTests ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label>計測日</label>
                    <input type="date" value={fitDate} onChange={(e) => setFitDate(e.target.value)} />
                  </div>
                </div>
                <div className="formgrid">
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label>記録{fitTest ? `（${fitTest.unit}）` : ""}</label>
                    <input
                      value={fitValue}
                      onChange={(e) => setFitValue(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="数値のみ"
                      inputMode="decimal"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="dynadd"
                  onClick={() => {
                    const v = Number(fitValue);
                    if (!fitTestId || fitValue.trim() === "" || Number.isNaN(v)) {
                      board.toast("種目と記録を入力してください");
                      return;
                    }
                    team.addFitnessRecord(pf.id, { testId: fitTestId, value: v, date: fitDate });
                    setFitValue("");
                  }}
                >
                  ＋ 記録を追加
                </button>
              </>
            )}
            <button
              type="button"
              className="seclink"
              style={{ display: "inline-block", marginTop: 8 }}
              onClick={() => setSheet({ type: "fitnessTests", returnTo: pf })}
            >
              種目を管理 ›
            </button>
          </div>
        )}

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
            const grade = pfGrade.trim() === "" ? null : parseInt(pfGrade, 10);
            // Phase D-1(C1-major): pfGroupIdsはフォームを開いた時点のpf.groupIdsを初期値とする
            // 独立したstateのため、「＋管理」からグループ管理シートのメンバー編集で同じ選手の
            // 所属を変えてから戻ると、保存時にその変更が古い値で上書きされてしまう。フォームを
            // 開いた時点(base)・フォーム内でのチップ操作(pfGroupIds)・保存直前の最新値(remote)の
            // 3-wayマージで、フォーム内の追加/削除だけを反映しつつフォーム外での変更を保持する
            const baseGroupIds = pf?.groupIds ?? [];
            const remoteGroupIds = pf ? players.find((x) => x.id === pf.id)?.groupIds ?? [] : [];
            const mergedGroupIds = new Set(remoteGroupIds);
            new Set([...baseGroupIds, ...pfGroupIds]).forEach((id) => {
              const inBase = baseGroupIds.includes(id);
              const inLocal = pfGroupIds.includes(id);
              if (inLocal && !inBase) mergedGroupIds.add(id);
              if (!inLocal && inBase) mergedGroupIds.delete(id);
            });
            const groupIds = mergedGroupIds.size > 0 ? [...mergedGroupIds] : undefined;
            if (pf) {
              // ...pf は選手フォームを開いた時点のスナップショットのため、同フォーム内で
              // team.addFitnessRecord/removeFitnessRecordが保存した最新のfitnessを含まない。
              // livePf(常に最新のplayersから引く)をベースにし、基本情報だけを差分適用する
              board.updatePlayer({
                ...(livePf ?? pf),
                name: nm,
                number,
                position: pfPosition,
                height,
                weight,
                dominantFoot,
                email,
                grade,
                groupIds,
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
                grade,
                groupIds,
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

export default function TeamHub() {
  return <Inner />;
}
