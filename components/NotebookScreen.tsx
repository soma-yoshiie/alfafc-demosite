"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
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
  Player,
  Point,
  PracticeMenuDeliver,
  PracticeNote,
  SoloItem,
  SoloKind,
  SoloNote,
  StaffReaction,
  TeamEvent,
  TeamGroup,
} from "@/lib/types";
import {
  MATCH_PHASE_LABEL,
  NOTE_CONDITION_LABEL,
  NOTE_KIND_LABEL,
  PLAY_KIND_LABEL,
  PLAY_LINE_LABEL,
  SOLO_KIND_LABEL,
  STAFF_REACTION_LABEL,
} from "@/lib/types";
import { FORMATION_KEYS, buildSlots } from "@/lib/formations";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E, ConditionIcon, type EmojiName } from "./Emoji";
import { FormationPitch, GoalCourseView, isInGoalFrame, PlayAreaPitch, type PlayTool } from "./MiniPitch";
import { LineChart } from "./Charts";
import { addDaysStr, countByDay, daysAgoStr, localDateStr, longestWeeklyStreak, weekStart, weeklyCounts, weeklyStreak } from "@/lib/dates";
import {
  clearNoteDraft,
  loadNbSideOpen,
  loadNoteDraft,
  loadNotifSeen,
  loadTeam,
  saveNbSideOpen,
  saveNoteDraft,
  saveNotifSeen,
} from "@/lib/storage";
import { attendanceRate } from "@/lib/teamStats";
import { deliverableTargetsPlayer, eventTargetPlayers, playerInGroup, resolveFilterGroup } from "@/lib/groups";
import { buildEventNotifications, type NotifTarget } from "@/lib/notifications";
import { categoryOf, eventNoteTarget } from "@/lib/calendarUtils";
import { staffUnreadNotes } from "@/lib/notebookStats";
import { staffIdentity } from "@/lib/chat";
import { isUnreadStaffComment } from "@/lib/badges";
import { eventSubmitStats, noteBelongsToEvent } from "@/lib/eventNotes";
import { DeliverBlock, DeliverDetail } from "./DeliverViews";
import { AnalyticsPanel, NoteSearch, NotificationsView, notifIdentity } from "./NotebookTools";
import { useGroupFilter } from "./GroupChips";
import { FilterRow, FilterSecHead } from "./FilterRow";
import SeasonReport from "./SeasonReport";
import { useConsoleSubnav } from "./ConsoleShell";
import { MobileHeader, MobileHeaderAction } from "./MobileHeader";
import { MobileSegments } from "./MobileSegments";
import { IconBell, IconFilter, IconShare, NoteKindIcon } from "./icons";

const CONDITIONS: NoteCondition[] = ["great", "good", "normal", "tired", "bad"];
const PLAY_KINDS: PlayKind[] = ["receive", "shot", "miss"];
const PLAY_LINE_KINDS: PlayLineKind[] = ["dribble", "pass"];
const PLAY_PHASES: MatchPhase[] = ["1st", "2nd", "et"];
/** フェーズ未設定は前半として扱う（後方互換） */
const markPhase = (p?: MatchPhase): MatchPhase => p ?? "1st";
/** ピッチ番号未設定は0番目として扱う（後方互換） */
const markCanvas = (c?: number): number => c ?? 0;
/** 対象配列から現フェーズ×現ピッチの最後の1件だけを取り除く */
function popPhaseCanvas<T extends { phase?: MatchPhase; canvas?: number }>(arr: T[], phase: MatchPhase, canvas: number): T[] {
  const idx = arr.map((x) => markPhase(x.phase) === phase && markCanvas(x.canvas) === canvas).lastIndexOf(true);
  return idx === -1 ? arr : arr.filter((_, i) => i !== idx);
}
/** 試合のプレースタッツ。パス/ドリブルの success 未設定(旧データ)は成功として数える */
function playStats(plays: PlayPoint[], lines: PlayLine[]) {
  const shots = plays.filter((p) => p.kind === "shot");
  const goals = shots.filter((p) => p.scored === true).length;
  const pass = lines.filter((l) => l.kind === "pass");
  const passOk = pass.filter((l) => l.success !== false).length;
  const dribble = lines.filter((l) => l.kind === "dribble");
  const dribbleOk = dribble.filter((l) => l.success !== false).length;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  return {
    shots: shots.length,
    goals,
    shotPct: pct(goals, shots.length),
    pass: pass.length,
    passPct: pct(passOk, pass.length),
    dribble: dribble.length,
    dribblePct: pct(dribbleOk, dribble.length),
    receive: plays.filter((p) => p.kind === "receive").length,
    trapMiss: plays.filter((p) => p.kind === "miss").length,
  };
}
/** シュート/パス/ドリブル等のライブスタッツ表示（記入フォーム・詳細画面で共用） */
function PlayStatsRow({ stats }: { stats: ReturnType<typeof playStats> }) {
  return (
    <div className="aistats">
      <div className="aistat">
        <div className="aisv">{stats.shotPct != null ? `${stats.shotPct}%` : `${stats.shots}`}</div>
        <div className="aisl">シュート {stats.goals}G/{stats.shots}本</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.passPct != null ? `${stats.passPct}%` : `${stats.pass}`}</div>
        <div className="aisl">パス {stats.pass}本</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.dribblePct != null ? `${stats.dribblePct}%` : `${stats.dribble}`}</div>
        <div className="aisl">ドリブル {stats.dribble}本</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.receive}</div>
        <div className="aisl">受けた</div>
      </div>
      <div className="aistat">
        <div className="aisv">{stats.trapMiss}</div>
        <div className="aisl">トラップミス</div>
      </div>
    </div>
  );
}
const SOLO_KINDS: SoloKind[] = ["lifting", "running", "strength", "other"];
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const STAFF_REACTIONS: StaffReaction[] = ["ok", "nice", "fire"];
const REACTION_ICON: Record<StaffReaction, EmojiName> = { ok: "check", nice: "star", fire: "fire" };

function todayStr(): string {
  return localDateStr();
}
function fmt(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
  return `${m}/${day}(${wd})`;
}
/** ボトムナビのタブ。report=シーズンレポート(選手)。
 *  notebook-staff-redesign §2: スタッフは notes(提出)と notifs(通知)だけ。home/deliver は選手側の
 *  型として残る（deliver は旧コーチ配信タブ。スタッフでは到達しない） */
type Tab = "home" | "notes" | "deliver" | "notifs" | "report";

/** スタッフの提出一覧の「状態」絞り込み（notebook-staff-redesign §3-2）。
 *  未読=!staffSeenAt／未コメント=既読でコメント無し（カードのタグと同じ定義）／コメント済=!!staffComment
 *  （「未読 N」チップとは別の切替） */
type NoteStatus = "all" | "unread" | "nocomment" | "commented";
const NOTE_STATUS_LABEL: Record<NoteStatus, string> = {
  all: "すべて",
  unread: "未読",
  nocomment: "未コメント",
  commented: "コメント済",
};

/** PCのマスター・ディテール分岐に使うブレークポイント（ChatScreen.tsxのRowクリック分岐と同じ基準） */
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

type View =
  | { mode: "root" }
  | { mode: "form"; kind: NoteKind; edit?: NotebookEntry; menuId?: string }
  | { mode: "detail"; id: string }
  | { mode: "deliverDetail"; id: string }
  | { mode: "search"; playerId?: string }
  | { mode: "report"; playerId: string };

export default function NotebookScreen() {
  const board = useBoard();
  const team = useTeam();
  const isCoach = board.auth.role === "coach";
  // notebook-staff-redesign §2: スタッフの初期タブは提出(notes)。ホーム/配信/レポートは選手だけのタブ
  const [tabState, setTab] = useState<Tab>(isCoach ? "notes" : "home");
  const tab: Tab = isCoach && (tabState === "home" || tabState === "deliver" || tabState === "report") ? "notes" : tabState;
  // ux-fix R2-2: 種類の既定は選手もスタッフも「すべて」
  const [noteKind, setNoteKind] = useState<NoteKind | "all">("all");
  // ux-fix R2-2: 選手の「自分のノート｜チームの共有」。共有を選んでいる間は種類を練習に固定する
  const [noteScope, setNoteScope] = useState<"mine" | "team">("mine");
  const listKind: NoteKind | "all" = !isCoach && noteScope === "team" ? "practice" : noteKind;
  // notebook-staff-redesign §3-2: スタッフの絞り込み。種類=noteKind、状態=noteStatus、学年/グループは
  // 下の filterIds。「未読 N」チップ(unreadOnly)は状態とは別の切替で、両方ONならAND
  const [noteStatus, setNoteStatus] = useState<NoteStatus>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  // PCの絞り込み列(.nbside)の開閉はlocalStorageで保持。スマホの絞り込みシートの開閉は filterSheet
  const [nbSideOpen, setNbSideOpen] = useState(() => loadNbSideOpen());
  useEffect(() => {
    saveNbSideOpen(nbSideOpen);
  }, [nbSideOpen]);
  const [filterSheet, setFilterSheet] = useState(false);
  const [view, setView] = useState<View>({ mode: "root" });
  const [sheetOpen, setSheetOpen] = useState(false);
  // PCマスター・ディテール（コーチ×notes/notifsタブ）の右ペイン選択状態。
  // タブごとに1つ。View(mode)は変えず「選んでいるだけ」にすることで、左の一覧(.scroll)は
  // 従来どおり isRoot 判定のまま表示され続ける（=同時にマスター一覧としても機能する）
  const [selNote, setSelNote] = useState<string | null>(null);
  // ux-fix R2-7: 予定の詳細から「予定別でこの予定を開く」指示（NoteList が消費。n は同じ予定を続けて指されても効くよう増やす）
  const [eventFocus, setEventFocus] = useState<{ id: string; n: number } | null>(null);
  // ux-fix R2-7: チャットのスレッドの「ノート」から来たとき、提出一覧をその選手だけに絞る（スタッフ）。null＝絞らない
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);
  const [selNotif, setSelNotif] = useState<{ target: NotifTarget; notifId?: string } | null>(null);
  // groups-phase2 §4: サッカーノート（コーチ）のグループ絞り込み。提出一覧・検索は
  // 各自 useGroupFilter("notebook") で読み直す（notebook-staff-redesign §2: ホームの
  // ダッシュボード・KPI内訳はスタッフのサッカーノートから外れた）
  const [filterIds, setFilterIds] = useGroupFilter("notebook");
  const filterGroup = isCoach ? resolveFilterGroup(filterIds, team.groups) : null;
  // review #1回目: 絞り込み中のグループが削除されても、保存値([grp_a]等)がlocalStorageに
  // 残ったままだとNoteSearch等の他の部品(filterIdsそのものを見る)で絞り込みが読めない状態になる
  // （このファイルの絞り込みパネルは解決済みのfilterGroupを見るので「すべて」に戻って見える）。
  // TeamHub.tsxのcalFilterEff/matchGroupEffと同じ作法で保存値自体も[]に戻す
  useEffect(() => {
    if (isCoach && filterIds.length > 0 && !filterGroup) setFilterIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterIds, filterGroup, isCoach]);
  // PC×コーチのときだけ選択state経路を使う。それ以外(モバイル/選手)は従来のview遷移のまま
  const isPcCoach = () => isCoach && typeof window !== "undefined" && window.matchMedia(PC_MQ).matches;
  // board-squad-and-pc-polish §1: PCは左レールで戻れるため「‹ ホーム」は出さない(モバイルの「‹ メニュー」は現状維持)
  const pc = usePc();

  // p18 §3-1: noteIntent 消費。ホームのタイムラインから「このノートの詳細を開く」と指示されたとき、
  // スタッフの提出の一覧でそのノートを選ぶ（PC＝右ペイン／スマホ＝詳細の表示）。絞り込み（種類・学年・状態・
  // 未読だけ）でそのノートが一覧に出ない状態でも、詳細は選択 state／詳細 view から開くので開ける。
  // 消費したら null に戻す。ノートが見つからない・スタッフ以外のときは何もしない
  useEffect(() => {
    const intent = board.noteIntent;
    if (!intent) return;
    board.setNoteIntent(null);
    // ux-fix R2-7: チャットのスレッドの「ノート」。提出タブの一覧をその選手だけに絞る（一覧にその選手が必ず出るよう、
    // 種類・状態・未読だけ・学年/グループの絞り込みは外す）
    if (intent.playerId && !intent.eventId && !intent.noteId) {
      if (!isCoach) return;
      setTab("notes");
      setSheetOpen(false);
      setFilterSheet(false);
      setSelNotif(null);
      setSelNote(null);
      setView({ mode: "root" });
      setNoteKind("all");
      setNoteStatus("all");
      setUnreadOnly(false);
      setFilterIds([]);
      setPlayerFilter(intent.playerId);
      return;
    }
    // ux-fix R2-7: 予定の詳細の「ノート N／M 提出 ›」。スタッフの提出タブで予定別に切り替えて、その予定の行を開く
    if (intent.eventId) {
      if (!isCoach) return;
      setTab("notes");
      setSheetOpen(false);
      setFilterSheet(false);
      setSelNotif(null);
      setSelNote(null);
      setView({ mode: "root" });
      // 予定は必ず見えるように、種類・状態・未読だけ・学年/グループの絞り込みを外す
      setNoteKind("all");
      setNoteStatus("all");
      setUnreadOnly(false);
      setFilterIds([]);
      setPlayerFilter(null);
      setEventFocus((f) => ({ id: intent.eventId!, n: (f?.n ?? 0) + 1 }));
      return;
    }
    if (!intent.noteId) return;
    const noteId = intent.noteId;
    if (!board.notebook.some((n) => n.id === noteId)) return;
    // ux-fix R2-1: 選手・保護者は自分のノートの詳細をそのまま開く（ホームの「コーチからコメント N 件」から）。
    // 戻るはホーム（ここで開いたタブ）に戻る
    if (!isCoach) {
      if (board.notebook.find((n) => n.id === noteId)?.playerId !== board.auth.playerId) return;
      setSheetOpen(false);
      setView({ mode: "detail", id: noteId });
      return;
    }
    setTab("notes");
    setSheetOpen(false);
    setFilterSheet(false);
    setSelNotif(null);
    if (typeof window !== "undefined" && window.matchMedia(PC_MQ).matches) {
      setView({ mode: "root" });
      setSelNote(noteId);
    } else {
      setSelNote(null);
      setView({ mode: "detail", id: noteId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.noteIntent]);

  // ux-fix R2-7: 今の絞り込み（種類・学年/グループ・状態・未読だけ）の中の未読の提出（新しい順）。
  // 詳細の「次の未読へ（残り N）」と、PC の空のペインの「未読 N 件を開く」が使う
  const unreadQueue = useMemo(() => {
    if (!isCoach) return [] as string[];
    const sc = staffScopedNotes(board.notebook, board.state.players, noteKind, filterGroup).filter(
      (n) => !playerFilter || n.playerId === playerFilter
    );
    const base = staffStatusNotes(sc, noteStatus, selNote);
    return staffUnreadOnlyNotes(base, unreadOnly, selNote)
      .filter((n) => !n.staffSeenAt)
      .map((n) => n.id);
  }, [isCoach, board.notebook, board.state.players, noteKind, filterGroup, noteStatus, unreadOnly, selNote, playerFilter]);
  const nextUnreadFor = (id: string, open: (nid: string) => void) => {
    const rest = unreadQueue.filter((x) => x !== id);
    return { count: rest.length, onOpen: () => rest[0] && open(rest[0]) };
  };

  const identity = notifIdentity(board.auth.role, board.auth.playerId);
  const [seenAt, setSeenAt] = useState<number>(() => loadNotifSeen()[identity] ?? 0);
  // 通知画面で「今回の新着」をハイライトするため、開いた時点の既読時刻を保持
  const [viewSeenAt, setViewSeenAt] = useState<number>(seenAt);
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

  const switchTab = (t: Tab) => {
    if (t === "notifs") {
      const now = Date.now();
      const map = loadNotifSeen();
      map[identity] = now;
      saveNotifSeen(map);
      setViewSeenAt(seenAt);
      setSeenAt(now);
    }
    setTab(t);
    setView({ mode: "root" });
    setSheetOpen(false);
    setFilterSheet(false);
    setSelNote(null);
    setSelNotif(null);
  };

  const navTarget = (t: NotifTarget, notifId?: string) => {
    // chat-plan-a §4: 選手向け「新しいお知らせ」はチャット画面でそのお知らせを開く。
    // setScreen→openSheet の順（直後の openSheet が sheet を確定させる）。PC は ChatScreen が中のペインへ引き継ぐ
    if (t.kind === "announcement") {
      board.setScreen("chat");
      board.openSheet({ type: "annDetail", annId: t.id });
      return;
    }
    // notebook-staff-redesign §2: スタッフは配信の作成・閲覧の入口が無いので、配信の通知は何もしない
    // （既存の配信データは残す。選手側は今のまま配信詳細へ）
    if (isCoach && t.kind === "deliver") return;
    if (isPcCoach()) {
      // notifIdは左一覧のハイライト用。同じtargetを指す通知が複数あっても選んだ行だけを光らせる
      setSelNotif({ target: t, notifId });
      return;
    }
    if (t.kind === "note") setView({ mode: "detail", id: t.id });
    else if (t.kind === "deliver") setView({ mode: "deliverDetail", id: t.id });
    else setView({ mode: "search", playerId: t.id });
  };

  const isRoot = view.mode === "root";
  // notebook-staff-redesign §2: スタッフが通知画面(ルート)にいるか（提出へ戻る導線の出し分け）
  const staffNotifs = isCoach && isRoot && tab === "notifs";
  // notebook-staff-redesign §3-2: PCのスタッフの提出タブは左に絞り込み列(.nbside)を常設（畳める）。
  // 畳んだときはルートに nbside-hidden を付け、PC reset のグリッドを2列へ戻す
  const staffSide = isCoach && pc && isRoot && tab === "notes";
  const showNbSide = staffSide && nbSideOpen;
  // 種類・学年/グループ・状態の絞り込みパネル（スマホのシートとPCの.nbsideで同じ部品を使う）。
  // 絞り込みで一覧から消えたノートを右ペインに残さない（selNote を外す）
  const filterPanel = (
    <NotebookFilterPanel
      kind={noteKind}
      onKind={(k) => {
        setNoteKind(k);
        setSelNote(null);
      }}
      status={noteStatus}
      onStatus={(st) => {
        setNoteStatus(st);
        setSelNote(null);
      }}
      groups={team.groups}
      groupId={filterGroup?.id ?? null}
      onGroup={(id) => {
        setFilterIds(id ? [id] : []);
        setSelNote(null);
      }}
      // p14 §1-1: パネル最下段「絞り込みを編集…」（スタッフだけ）。チームのグループ管理シートを開く
      // （intent → setScreen の順。Bench.tsx の名簿への遷移と同じ作法）
      onManageGroups={
        isCoach
          ? () => {
              setFilterSheet(false);
              board.setTeamIntent({ tab: "ros", openSheet: "groups" });
              board.setScreen("team");
            }
          : undefined
      }
    />
  );
  const startWrite = (k: NoteKind) => {
    setSheetOpen(false);
    setView({ mode: "form", kind: k });
  };

  // 作成シート：今日の予定種別に応じて選択肢の並びとバッジを出し分け
  // p16 §5-4: サッカーノートの対象の予定だけを見る（保護者会など対象外の種類は並びに影響させない）
  const todayEventKinds = new Set(
    (loadTeam()?.events ?? [])
      .filter((e) => e.date === todayStr() && eventNoteTarget(e, team.categories))
      .map((e) => e.kind)
  );
  // ux-fix R2-2: 自分の今日の練習ノート（新しいもの）。あれば作成シートの練習ノートは「今日は記入済み（開く）」
  const todayPractice = isCoach
    ? null
    : board.notebook
        .filter((n) => n.kind === "practice" && n.playerId === board.auth.playerId && n.date === todayStr())
        .sort((a, b) => b.ts - a.ts)[0] ?? null;
  const openToday = (id: string) => {
    setSheetOpen(false);
    setView({ mode: "detail", id });
  };
  const noteKindOrder: NoteKind[] = todayEventKinds.has("match")
    ? ["match", "practice", "solo"]
    : todayEventKinds.has("practice")
      ? ["practice", "match", "solo"]
      : ["match", "practice", "solo"];

  // notebook-staff-redesign §2: スタッフは提出(notes)と通知(notifs)だけ。「提出」のラベルは
  // 画面には出さない（スマホのセグメント行・PCのレールのサブナビはスタッフでは描画しない）
  const navItems: { t: Tab; icon: Parameters<typeof E>[0]["n"]; label: string; badge?: number }[] = isCoach
    ? [
        { t: "notes", icon: "note", label: "提出" },
        { t: "notifs", icon: "bell", label: "通知", badge: unread },
      ]
    : [
        { t: "home", icon: "ball", label: "ホーム" },
        { t: "notes", icon: "note", label: "ノート" },
        { t: "notifs", icon: "bell", label: "通知", badge: unread },
        { t: "report", icon: "doc", label: "レポート" },
      ];

  // PC専用コンソールシェルの左レール：サッカーノート項目の直下にタブ一覧を出す
  // switchTab は毎レンダー再生成されるため、ref経由で常に最新を呼ぶ（memoの鮮度に依存させない）
  const switchTabRef = useRef(switchTab);
  switchTabRef.current = switchTab;
  const consoleSubnav = useMemo(
    () => ({
      anchor: "notebook" as const,
      // 通知はレールのサブナビには出さない(PCはヘッダー右上のベル+未読バッジが導線。
      // モバイルのボトムナビは従来どおり通知タブを持つ)
      // notebook-staff-redesign §2: スタッフはレールのサブナビを持たない（レールの
      // 「サッカーノート」を押すと提出が開く）。フックの呼び出しは変えず items だけ空にする
      items: (isCoach ? [] : navItems.filter((it) => it.t !== "notifs")).map((it) => ({
        key: it.t,
        label: it.label,
        icon: <E n={it.icon} />,
        badge: it.badge,
        on: tab === it.t && isRoot,
        onSelect: () => switchTabRef.current(it.t),
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, isRoot, unread, isCoach]
  );
  useConsoleSubnav(consoleSubnav);

  return (
    <div className={"app noteapp" + (isCoach ? " coachapp" : "") + (staffSide && !nbSideOpen ? " nbside-hidden" : "")}>
      {pc ? (
        <header>
          {/* board-squad-and-pc-polish §1: 左レールがあるためルート(isRoot)の「‹ ホーム」は出さない。
              画面内の戻る(詳細・検索から一覧へ)の「‹ 戻る」は残す。
              notebook-staff-redesign §2: スタッフはレールのサブナビが無いので、通知(ルート)からも
              「‹ 戻る」で提出へ戻す */}
          {(!isRoot || staffNotifs) && (
            <div className="fpback" onClick={() => (isRoot ? switchTab("notes") : setView({ mode: "root" }))}>
              ‹ 戻る
            </div>
          )}
          <div className="brand" style={!isRoot || staffNotifs ? { marginLeft: 4 } : undefined}>
            <div className="logo">
              サッカー<b>ノート</b>
            </div>
          </div>
          {isRoot && (
            <>
              {/* notebook-staff-redesign §2: スタッフの「＋ 配信」は撤去（配信の入口を持たない） */}
              {!isCoach && (
                <button className="hdrcta" onClick={() => setSheetOpen(true)}>
                  ＋ ノートを作成
                </button>
              )}
              {/* 通知ベル(PC専用・モバイルは基底CSSで非表示)。未読があれば赤バッジで件数を出す */}
              <button
                className={"hdrbell" + (tab === "notifs" ? " on" : "")}
                type="button"
                title="通知"
                aria-label={unread > 0 ? `通知（未読${unread}件）` : "通知"}
                onClick={() => switchTab(staffNotifs ? "notes" : "notifs")}
              >
                <E n="bell" />
                {unread > 0 && <span className="hdrbellbadge">{unread > 9 ? "9+" : unread}</span>}
              </button>
            </>
          )}
        </header>
      ) : (
        <>
          {/* mobile-redesign §1-6/§1-7: 共通ヘッダー＋ヘッダー直下セグメント。
              「‹ メニュー」(=アプリホームへ戻る)は下部タブの「ホーム」で代替できるため、
              モバイルの戻るはisRoot=falseの詳細/フォーム画面でのみ出す */}
          {/* notebook-staff-redesign §2: スタッフは下のセグメント行を出さず、通知は右のベルで開く
              （未読数は赤丸の件数バッジ。PCの .hdrbellbadge と同じ出し方）。
              通知画面からの戻るは「‹ 戻る」で提出へ（通知画面ではベルを出さない） */}
          <MobileHeader
            title="サッカーノート"
            onBack={!isRoot ? () => setView({ mode: "root" }) : staffNotifs ? () => switchTab("notes") : undefined}
            actions={
              isCoach &&
              isRoot &&
              tab === "notes" && (
                <MobileHeaderAction
                  label={unread > 0 ? `通知（未読${unread}件）` : "通知"}
                  onClick={() => switchTab("notifs")}
                >
                  <IconBell />
                  {unread > 0 && <span className="mhead-badge">{unread > 9 ? "9+" : unread}</span>}
                </MobileHeaderAction>
              )
            }
          />
          {isRoot && !isCoach && (
            <div className="mseg-wrap">
              <MobileSegments
                ariaLabel="サッカーノートの表示切替"
                items={navItems.map((it) => ({
                  key: it.t,
                  label: it.label,
                  badge: it.badge,
                  on: tab === it.t,
                  onSelect: () => switchTab(it.t),
                }))}
              />
            </div>
          )}
        </>
      )}

      {/* ux-fix R2-2: 選手のノート一覧の上。1 段目＝「自分のノート｜チームの共有」(.mseg)、
          2 段目＝検索＋種類チップの 1 行（チームの共有は種類を練習に固定するのでチップを隠す）。
          スタッフの種類・学年/グループ・状態は絞り込みパネル(スマホ=シート／PC=左の.nbside)へ集約 */}
      {isRoot && tab === "notes" && !isCoach && (
        <div className="nbplbar">
          <div className="mseg-wrap nbplscope">
            <MobileSegments
              ariaLabel="ノートの範囲"
              items={[
                { key: "mine", label: "自分のノート", on: noteScope === "mine", onSelect: () => setNoteScope("mine") },
                { key: "team", label: "チームの共有", on: noteScope === "team", onSelect: () => setNoteScope("team") },
              ]}
            />
          </div>
          <div className="nbplrow">
            <button type="button" className="nbplsearch" onClick={() => setView({ mode: "search" })}>
              <E n="search" /> 検索
            </button>
            {noteScope === "mine" && (
              <div className="fbar nbplchips">
                {(["all", "match", "practice", "solo"] as (NoteKind | "all")[]).map((k) => (
                  <div
                    key={k}
                    className={`chip${noteKind === k ? " on" : ""}`}
                    onClick={() => {
                      setNoteKind(k);
                      setSelNote(null); // 絞り込みで一覧から消えたノートを右ペインに残さない
                    }}
                  >
                    {k === "all" ? "すべて" : NOTE_KIND_LABEL[k]}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* notebook-staff-redesign §3-2: PCの絞り込み列。先頭の「‹ 絞り込みを隠す」で畳み
          （TeamHub の .calside-hide と同じ作法）、畳んだら一覧の「絞り込み」ボタンで戻す */}
      {showNbSide && (
        <aside className="nbside">
          <button type="button" className="nbside-hide" onClick={() => setNbSideOpen(false)}>
            ‹ 絞り込みを隠す
          </button>
          {filterPanel}
        </aside>
      )}

      <div className="scroll">
        {/* notebook-staff-redesign §2: ホームは選手だけ（スタッフのダッシュボード・KPI内訳は撤去） */}
        {isRoot && tab === "home" && !isCoach && (
          <PlayerHome
            seenAt={seenAt}
            onOpenNote={(id) => setView({ mode: "detail", id })}
            onOpenDeliver={(id) => setView({ mode: "deliverDetail", id })}
            onWrite={() => setSheetOpen(true)}
          />
        )}
        {isRoot && tab === "notes" && (
          <NoteList
            kind={listKind}
            scope={noteScope}
            status={noteStatus}
            unreadOnly={unreadOnly}
            onToggleUnread={() => {
              setUnreadOnly((v) => !v);
              setSelNote(null);
            }}
            showFilterBtn={!showNbSide}
            onFilter={() => (pc ? setNbSideOpen(true) : setFilterSheet(true))}
            isCoach={isCoach}
            onWrite={(k) => startWrite(k)}
            onOpen={(id) => (isPcCoach() ? setSelNote(id) : setView({ mode: "detail", id }))}
            onSearch={() => setView({ mode: "search" })}
            selectedId={selNote}
            playerId={playerFilter}
            onClearPlayer={() => {
              setPlayerFilter(null);
              setSelNote(null);
            }}
            eventFocus={eventFocus}
            onEventFocusDone={() => setEventFocus(null)}
            onOpenEvent={(eventId) => {
              board.setTeamIntent({ tab: "cal", eventId });
              board.setScreen("team");
            }}
          />
        )}
        {isRoot && tab === "notifs" && (
          <NotificationsView
            seenAt={viewSeenAt}
            onNavigate={navTarget}
            selectedKey={selNotif?.notifId ?? null}
          />
        )}
        {isRoot && tab === "report" && !isCoach && board.auth.playerId && (
          <>
            <SeasonReport playerId={board.auth.playerId} />
            {/* ux-fix R2-1: ホームから移したマイ分析・コンディション・記録の集計 */}
            <PlayerAnalysis />
          </>
        )}

        {view.mode === "form" && (
          <NoteForm kind={view.kind} edit={view.edit} initialMenuId={view.menuId} onDone={() => setView({ mode: "root" })} />
        )}
        {view.mode === "detail" && (
          <NoteDetail
            id={view.id}
            key={view.id}
            isCoach={isCoach}
            onEdit={(e) => setView({ mode: "form", kind: e.kind, edit: e })}
            onDeleted={() => setView({ mode: "root" })}
            nextUnread={isCoach ? nextUnreadFor(view.id, (nid) => setView({ mode: "detail", id: nid })) : undefined}
          />
        )}
        {view.mode === "deliverDetail" && !isCoach && (
          <DeliverDetail
            id={view.id}
            onBack={() => setView({ mode: "root" })}
            onWritePractice={(menuId) => setView({ mode: "form", kind: "practice", menuId })}
          />
        )}
        {view.mode === "search" && (
          <NoteSearch
            isCoach={isCoach}
            initialPlayerId={view.playerId}
            onOpen={(id) => setView({ mode: "detail", id })}
          />
        )}
        {view.mode === "report" && <SeasonReport playerId={view.playerId} />}
      </div>

      {/* PC専用の第2ペイン(詳細)。コーチ×notes/notifsタブでのみマウントする
          (notebook-staff-redesign §2: 配信タブ・ホームのKPI内訳はスタッフから外れた)。
          view は root のまま進めるため、上の.scroll側の一覧(NoteList/NotificationsView)は
          そのままマスター一覧として表示され続ける(モバイル・選手側は selNote 等が常にnullで従来どおり) */}
      {isCoach && isRoot && (tab === "notes" || tab === "notifs") && (
        <div className="nbmain">
          {tab === "notes" &&
            (selNote ? (
              <NoteDetail
                id={selNote}
                key={selNote}
                isCoach={isCoach}
                onEdit={(e) => setView({ mode: "form", kind: e.kind, edit: e })}
                onDeleted={() => setSelNote(null)}
                nextUnread={nextUnreadFor(selNote, (nid) => setSelNote(nid))}
              />
            ) : (
              <div className="nbempty">
                提出を選ぶと、ここに内容が出ます
                {unreadQueue.length > 0 && (
                  <button type="button" className="st-btn nbopenunread" onClick={() => setSelNote(unreadQueue[0])}>
                    未読 {unreadQueue.length} 件を開く
                  </button>
                )}
              </div>
            ))}
          {tab === "notifs" &&
            (selNotif == null ? (
              <div className="nbempty">
                通知を選ぶと、ここに内容が出ます
              </div>
            ) : selNotif.target.kind === "note" ? (
              <NoteDetail
                id={selNotif.target.id}
                key={`note:${selNotif.target.id}`}
                isCoach={isCoach}
                onEdit={(e) => setView({ mode: "form", kind: e.kind, edit: e })}
                onDeleted={() => setSelNotif(null)}
              />
            ) : selNotif.target.kind === "deliver" ? (
              // notebook-staff-redesign §2: スタッフに配信の閲覧入口は無い（navTarget で弾くため通常は到達しない）
              <div className="nbempty">
                通知を選ぶと、ここに内容が出ます
              </div>
            ) : (
              <NoteSearch
                key={`player:${selNotif.target.id}`}
                isCoach={isCoach}
                initialPlayerId={selNotif.target.id}
                onOpen={(id) => setSelNotif({ target: { kind: "note", id } })}
              />
            ))}
        </div>
      )}

      {!isCoach && isRoot && (tab === "home" || tab === "notes") && (
        <button className="fab" title="ノートを作成" onClick={() => setSheetOpen(true)}>
          ＋
        </button>
      )}

      {/* notebook-staff-redesign §3-2: スマホの絞り込みシート（作成シートと同じ .wsheetback/.wsheet の文法。
          見出し「表示する提出」＋右上「完了」）。PCは左の .nbside を使うのでシートは出さない */}
      {filterSheet && isCoach && !pc && (
        <div className="wsheetback" onClick={() => setFilterSheet(false)}>
          <div className="wsheet nbfsheet" onClick={(e) => e.stopPropagation()}>
            <div className="wsheet-h nbfhead">
              <span>表示する提出</span>
              <button type="button" className="nbfdone" onClick={() => setFilterSheet(false)}>
                完了
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}

      {sheetOpen && (
        <div className="wsheetback" onClick={() => setSheetOpen(false)}>
          <div className="wsheet" onClick={(e) => e.stopPropagation()}>
            <div className="wsheet-h kindsheet-h">どのノートを書く？</div>
            {noteKindOrder.map((k) => (
              <button
                key={k}
                className="wsheetopt"
                // ux-fix R2-2: 今日の練習ノートを書いてあるときは、新しく作らず既存のノートを開く
                onClick={() => (k === "practice" && todayPractice ? openToday(todayPractice.id) : startWrite(k))}
              >
                {/* ux-fix R2-2: 種類のアイコンは一覧・詳細と同じ NoteKindIcon（色は .k-種類） */}
                <span className={`wsheetic k-${k}`} aria-hidden="true">
                  <NoteKindIcon kind={k} />
                </span>
                <span>
                  <b>
                    {NOTE_KIND_LABEL[k]}ノート
                    {k === "match" && todayEventKinds.has("match") && (
                      <span className="daybadge">今日は試合日</span>
                    )}
                    {k === "practice" && todayEventKinds.has("practice") && (
                      <span className="daybadge">今日は練習日</span>
                    )}
                  </b>
                  <small>
                    {k === "match"
                      ? "対戦相手・ベストプレーを記録"
                      : k === "practice"
                        ? todayPractice
                          ? "今日は記入済み（開く）"
                          : "目標の達成度と気づきを記録"
                        : "実施した種目と量を記録"}
                  </small>
                </span>
              </button>
            ))}
            <button className="wsheetcancel" onClick={() => setSheetOpen(false)}>キャンセル</button>
          </div>
        </div>
      )}

    </div>
  );
}

/* ===================== ホーム（選手） ===================== */
/**
 * ux-fix R2-1: 上から 今日の状況 → スタッフからのコメント → コーチから → 今週の数字（1 行）。
 * マイ分析・コンディション・各種の集計はレポートタブ（PlayerAnalysis）へ移した。
 */
function PlayerHome({
  seenAt,
  onOpenNote,
  onOpenDeliver,
  onWrite,
}: {
  /** コメントの既読時刻（loadNotifSeen の自分の値。通知タブを開くと更新される） */
  seenAt: number;
  onOpenNote: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onWrite: () => void;
}) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const today = todayStr();

  const myNotes = useMemo(
    () => board.notebook.filter((n) => n.playerId === me),
    [board.notebook, me]
  );
  const wroteToday = myNotes.some((n) => n.date === today);
  const wStreak = weeklyStreak(myNotes.map((n) => n.date));
  // 「今週」は月曜始まりのカレンダー週で統一（CTA・統計とも同じ定義）
  const thisWeekCount = useMemo(() => {
    const monday = weekStart(today);
    return myNotes.filter((n) => n.date >= monday).length;
  }, [myNotes, today]);
  const weekDots = useMemo(() => {
    const monday = weekStart(today);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysStr(monday, i);
      return { date, count: myNotes.filter((n) => n.date === date).length };
    });
  }, [myNotes, today]);

  // 達成度（直近8週。記録がある週だけの週平均を平均）。「今週の数字」の 1 行に使う
  const achieveAvg8 = useMemo(() => {
    const thisMonday = weekStart(today);
    const weeklyAvgs: number[] = [];
    for (let k = 0; k < 8; k++) {
      const monday = addDaysStr(thisMonday, -7 * (7 - k));
      const vals = myNotes
        .filter((n): n is PracticeNote => n.kind === "practice" && typeof n.achievement === "number" && weekStart(n.date) === monday)
        .map((n) => n.achievement as number);
      if (vals.length) weeklyAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return weeklyAvgs.length ? Math.round(weeklyAvgs.reduce((a, b) => a + b, 0) / weeklyAvgs.length) : null;
  }, [myNotes, today]);

  // スタッフからのコメント：未読（lib/badges の isUnreadStaffComment。通知の既読時刻より後で、本人が詳細で見ていない。noteBadge と同じ判定）をすべて、
  // 足りなければ既読の新しいものを足して 3 件に
  const comments = useMemo(() => {
    const all = myNotes
      .filter((n) => !!n.staffComment)
      .sort((a, b) => (b.staffCommentTs ?? b.ts) - (a.staffCommentTs ?? a.ts));
    const isUnread = (n: NotebookEntry) => isUnreadStaffComment(n, seenAt);
    const unread = all.filter(isUnread);
    const read = all.filter((n) => !isUnread(n));
    return { unreadCount: unread.length, rows: [...unread, ...read].slice(0, Math.max(3, unread.length)), isUnread };
  }, [myNotes, seenAt]);

  // 曜日タップの展開状態（モーダルではなくインラインで開閉する）
  const [openDay, setOpenDay] = useState<string | null>(null);

  const numbers = [`今週 ${thisWeekCount} 件`];
  if (achieveAvg8 != null) numbers.push(`達成度 ${achieveAvg8}%`);
  numbers.push(`連続 ${wStreak} 週`);

  return (
    <div className="notehome">
      <div className="homedate">{fmt(today)}</div>

      <div className="homecta">
        {wroteToday ? (
          <div className="homecta-done"><E n="check" /> 今日のノートは記入済み</div>
        ) : (
          <>
            <div className="homecta-msg">今日のノートはまだ未記入</div>
            <button type="button" className="st-btn homecta-write" onClick={onWrite}>
              今日のノートを書く
            </button>
          </>
        )}
        <div className="weekdots">
          {weekDots.map((w, i) => (
            <button
              key={w.date}
              type="button"
              className={`weekdot${w.count > 0 ? " on" : ""}${w.date === today ? " today" : ""}${openDay === w.date ? " sel" : ""}`}
              onClick={() => setOpenDay(openDay === w.date ? null : w.date)}
            >
              {WEEKDAY_LABELS[i]}
            </button>
          ))}
        </div>

        {openDay && (
          <div className="daypanel">
            <div className="daypanel-h">{fmt(openDay)}</div>
            <div className="notesec-h">予定</div>
            {(loadTeam()?.events ?? []).filter((e) => e.date === openDay).length === 0 ? (
              <div className="evnote">予定はありません。</div>
            ) : (
              (loadTeam()?.events ?? [])
                .filter((e) => e.date === openDay)
                .map((e) => (
                  <div key={e.id} className="dayevent">
                    <span className={`pill ${e.kind === "practice" ? "prac" : "match"}`}>
                      {e.kind === "practice" ? "練習" : "試合"}
                    </span>
                    <span>{e.title}</span>
                    <span className="devt">{[e.time, e.place].filter(Boolean).join(" ")}</span>
                  </div>
                ))
            )}
            <div className="notesec-h" style={{ marginTop: 10 }}>ノート</div>
            {myNotes.filter((n) => n.date === openDay).length === 0 ? (
              <div className="evnote">この日のノートはありません。</div>
            ) : (
              <div className="notecards">
                {myNotes
                  .filter((n) => n.date === openDay)
                  .map((n) => (
                    <NoteCard key={n.id} entry={n} showKind onClick={() => onOpenNote(n.id)} />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {comments.rows.length > 0 && (
        <>
          <div className="homesec-h">
            スタッフからのコメント
            {comments.unreadCount > 0 && <span className="homesec-n">未読 {comments.unreadCount} 件</span>}
          </div>
          <div className="pcmts">
            {comments.rows.map((n) => {
              const unread = comments.isUnread(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`pcmt${unread ? " unread" : ""}`}
                  onClick={() => onOpenNote(n.id)}
                >
                  <span className="pcmt-top">
                    <span className="pcmt-who">
                      {unread && <span className="hp-dot" aria-label="未読" />}
                      {NOTE_KIND_LABEL[n.kind]}ノート ・ {fmt(n.date)}
                    </span>
                    <span className="convchev" aria-hidden="true">›</span>
                  </span>
                  <span className="pcmt-body">{n.staffComment}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <DeliverBlock
        kinds={["menu", "assignment", "meeting", "setpiece"]}
        onOpen={onOpenDeliver}
        onCreate={() => {}}
      />

      <div className="pnum" aria-label="今週の数字">
        {numbers.join(" ・ ")}
      </div>
    </div>
  );
}

/* ===================== 分析（選手のレポートタブの下） ===================== */
/**
 * ux-fix R2-1: ホームから移した「マイ分析」「コンディション（直近10回）」と、記録の集計
 * （週別の記録数・種類別・連続記録・これまでの合計・達成度の推移）。印刷（PDF で保存）には含めない。
 */
function PlayerAnalysis() {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const today = todayStr();

  const myNotes = useMemo(() => board.notebook.filter((n) => n.playerId === me), [board.notebook, me]);
  const dates = useMemo(() => myNotes.map((n) => n.date), [myNotes]);

  const weeklyChart = useMemo(() => weeklyCounts(dates), [dates]);
  const kindCounts = useMemo(() => {
    const c: Record<NoteKind, number> = { match: 0, practice: 0, solo: 0 };
    myNotes.forEach((n) => { c[n.kind]++; });
    return c;
  }, [myNotes]);
  const kindTotal = myNotes.length;

  const wStreak = weeklyStreak(dates);
  const longStreak = longestWeeklyStreak(dates);
  const heatCounts = useMemo(() => countByDay(dates), [dates]);
  const heatWeeks = useMemo(() => {
    const thisWeek = weekStart(today);
    return Array.from({ length: 12 }, (_, i) => addDaysStr(thisWeek, -7 * (11 - i)));
  }, [today]);

  const oldestDate = useMemo(
    () => myNotes.reduce<string | null>((min, n) => (min === null || n.date < min ? n.date : min), null),
    [myNotes]
  );

  const achievementTrend = useMemo(
    () =>
      myNotes
        .filter((n): n is PracticeNote => n.kind === "practice" && typeof n.achievement === "number")
        .sort((a, b) => a.ts - b.ts)
        .slice(-10)
        .map((n) => n.achievement as number),
    [myNotes]
  );

  // 直近8週の起点（月曜）。シュート決定率・達成度週平均に共通
  const windowStart8 = useMemo(() => addDaysStr(weekStart(today), -7 * 7), [today]);
  const shotRate8 = useMemo(() => {
    let shots = 0;
    let goals = 0;
    myNotes
      .filter((n): n is MatchNote => n.kind === "match" && n.date >= windowStart8)
      .forEach((n) =>
        (n.plays ?? []).forEach((p) => {
          if (p.kind !== "shot") return;
          shots++;
          if (p.scored === true) goals++;
        })
      );
    return shots > 0 ? Math.round((goals / shots) * 100) : null;
  }, [myNotes, windowStart8]);
  const achieveAvg8 = useMemo(() => {
    const thisMonday = weekStart(today);
    const weeklyAvgs: number[] = [];
    for (let k = 0; k < 8; k++) {
      const monday = addDaysStr(thisMonday, -7 * (7 - k));
      const vals = achievementTrendAll(myNotes)
        .filter((n) => weekStart(n.date) === monday)
        .map((n) => n.achievement as number);
      if (vals.length) weeklyAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return weeklyAvgs.length ? Math.round(weeklyAvgs.reduce((a, b) => a + b, 0) / weeklyAvgs.length) : null;
  }, [myNotes, today]);

  // コンディション（直近10件の condition 分布）
  const conditionMix = useMemo(() => {
    const recent = myNotes
      .filter((n) => n.condition)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)
      .map((n) => n.condition as NoteCondition);
    const total = recent.length;
    if (total === 0) return { good: 0, normal: 0, bad: 0 };
    const good = recent.filter((c) => c === "great" || c === "good").length;
    const normal = recent.filter((c) => c === "normal").length;
    const bad = recent.filter((c) => c === "tired" || c === "bad").length;
    return {
      good: Math.round((good / total) * 100),
      normal: Math.round((normal / total) * 100),
      bad: Math.round((bad / total) * 100),
    };
  }, [myNotes]);

  // 出席率（データが無ければ行を出さない）
  const attendance = useMemo(
    () => attendanceRate(loadTeam(), me, board.state.players),
    [me, board.notebook, board.state.players]
  );

  const kindBreakdown = (
    <>
      {(["match", "practice", "solo"] as NoteKind[]).map((k) => (
        <div key={k} className={`statrow sr-${k}`}>
          <span className="srl">{NOTE_KIND_LABEL[k]}</span>
          <span className="srb">
            <span style={{ width: kindTotal ? `${(kindCounts[k] / kindTotal) * 100}%` : "0%" }} />
          </span>
          <span className="srv">{kindCounts[k]}</span>
        </div>
      ))}
    </>
  );

  return (
    <div className="notetools noprint plan-analysis">
      <h2>分析</h2>

      <AnalyticsPanel mode="player" />

      <div className="vitals">
        <div className="notesec-h" style={{ margin: "0 0 8px" }}>コンディション（直近10回）</div>
        <div className="vrow">
          <span>調子</span>
          <span className="vbar">
            <i style={{ width: `${conditionMix.good}%`, background: "var(--cat2)" }} />
            <i style={{ width: `${conditionMix.normal}%`, background: "var(--cat3)" }} />
            <i style={{ width: `${conditionMix.bad}%`, background: "var(--danger)" }} />
          </span>
        </div>
        <div className="vrow">
          <span>達成度</span>
          <span className="vbar">
            <i style={{ width: `${achieveAvg8 ?? 0}%`, background: "var(--cat2)" }} />
          </span>
        </div>
        {attendance.total > 0 && (
          <div className="vrow">
            <span>出席</span>
            <span className="vbar">
              <i style={{ width: `${attendance.pct}%`, background: "var(--cat2)" }} />
              <i style={{ width: `${100 - attendance.pct}%`, background: "var(--danger)" }} />
            </span>
          </div>
        )}
        {shotRate8 != null && (
          <div className="evnote" style={{ marginTop: 8 }}>シュート決定率（直近8週）：{shotRate8}%</div>
        )}
      </div>

      <div className="notesec">
        <div className="notesec-h">週別の記録数（8週）</div>
        <LineChart data={weeklyChart} detailed />
        <div className="notesec-h" style={{ marginTop: 14 }}>種類別の内訳</div>
        {kindBreakdown}
      </div>

      <div className="notesec">
        <div className="notesec-h">連続記録</div>
        <div style={{ display: "flex", gap: 28, margin: "2px 0 4px" }}>
          <div className="statbig">
            {wStreak}
            <small>週連続（現在）</small>
          </div>
          <div className="statbig">
            {longStreak}
            <small>週連続（最長）</small>
          </div>
        </div>
        <div className="statheat">
          {heatWeeks.flatMap((wk) =>
            Array.from({ length: 7 }, (_, day) => {
              const date = addDaysStr(wk, day);
              const count = date > today ? 0 : heatCounts.get(date) ?? 0;
              const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
              return <div key={date} className={`shc l${level}`} />;
            })
          )}
        </div>
      </div>

      <div className="notesec">
        <div className="notesec-h">これまでの合計</div>
        <div className="statbig" style={{ marginBottom: 10 }}>
          {myNotes.length}
          <small>冊</small>
        </div>
        {kindBreakdown}
        {oldestDate && <div className="evnote" style={{ marginTop: 6 }}>最初の記録：{fmt(oldestDate)}</div>}
      </div>

      <div className="notesec">
        <div className="notesec-h">達成度の推移</div>
        {achievementTrend.length >= 2 ? (
          <LineChart data={achievementTrend.map((v) => ({ value: v }))} max={100} />
        ) : (
          <div className="evnote">達成度のデータがまだ足りません。</div>
        )}
      </div>
    </div>
  );
}

/** 達成度（0〜100）が入っている練習ノート */
function achievementTrendAll(notes: NotebookEntry[]): PracticeNote[] {
  return notes.filter((n): n is PracticeNote => n.kind === "practice" && typeof n.achievement === "number");
}

/* ===================== 一覧 ===================== */

/** 予定別ビューの「予定に紐づかない提出」グループのキー。TeamEvent.id と衝突しない値にする */
const UNLINKED_KEY = "@unlinked";

/**
 * スタッフの提出一覧の絞り込み（種類・グループ → 状態 → 未読だけ）。一覧（NoteList）と、詳細の
 * 「次の未読へ（残り N）」「未読 N 件を開く」が同じ並びを見るよう、ここに1つだけ置く（ux-fix R2-7）。
 * selectedId は PC で開いて既読になった選択中の提出を、未読の絞り込みの一覧に残すための例外
 */
function staffScopedNotes(
  notebook: NotebookEntry[],
  players: Player[],
  kind: NoteKind | "all",
  group: TeamGroup | null
): NotebookEntry[] {
  let list = kind === "all" ? notebook : notebook.filter((n) => n.kind === kind);
  // 絞り込み中は対象グループ所属の選手のノートだけ（名簿外の選手のノートは「すべて」のときだけ出る）
  if (group) {
    list = list.filter((n) => {
      const p = players.find((pl) => pl.id === n.playerId);
      return !!p && playerInGroup(p, group);
    });
  }
  return [...list].sort((a, b) => b.ts - a.ts);
}

function staffStatusNotes(scoped: NotebookEntry[], status: NoteStatus, selectedId?: string | null): NotebookEntry[] {
  if (status === "all") return scoped;
  if (status === "unread") return scoped.filter((n) => !n.staffSeenAt || n.id === selectedId);
  if (status === "nocomment") return scoped.filter((n) => !!n.staffSeenAt && !n.staffComment);
  return scoped.filter((n) => !!n.staffComment);
}

function staffUnreadOnlyNotes(base: NotebookEntry[], unreadOnly: boolean, selectedId?: string | null): NotebookEntry[] {
  return unreadOnly ? base.filter((n) => !n.staffSeenAt || n.id === selectedId) : base;
}

function NoteList({
  kind,
  scope = "mine",
  status = "all",
  unreadOnly = false,
  onToggleUnread,
  showFilterBtn = true,
  onFilter,
  isCoach,
  onWrite,
  onOpen,
  onSearch,
  selectedId,
  playerId = null,
  onClearPlayer,
  eventFocus = null,
  onEventFocusDone,
  onOpenEvent,
}: {
  kind: NoteKind | "all";
  /** ux-fix R2-2: 選手の「自分のノート｜チームの共有」（切替は親の 1 段目のセグメント）。共有のときは kind が練習に固定されて渡る */
  scope?: "mine" | "team";
  /** notebook-staff-redesign §3-2〜§3-3: スタッフの状態絞り込み・「未読 N」チップ・「絞り込み」ボタン。
   *  選手側の呼び出しは渡さない（従来の .ngbar のまま） */
  status?: NoteStatus;
  unreadOnly?: boolean;
  onToggleUnread?: () => void;
  /** false=PCで絞り込み列(.nbside)が開いているので「絞り込み」ボタンを出さない */
  showFilterBtn?: boolean;
  onFilter?: () => void;
  isCoach: boolean;
  onWrite: (kind: NoteKind) => void;
  onOpen: (id: string) => void;
  onSearch: () => void;
  /** PCマスター・ディテールで選択中のノートID。未指定なら選択表示なし（選手側の呼び出しに影響しない） */
  selectedId?: string | null;
  /** ux-fix R2-7: チャットのスレッドから来たとき、提出をこの選手だけに絞る（スタッフ。解除は onClearPlayer） */
  playerId?: string | null;
  onClearPlayer?: () => void;
  /** ux-fix R2-7: 予定の詳細から来たとき、予定別に切り替えてその予定の行を開く（スタッフ） */
  eventFocus?: { id: string; n: number } | null;
  /** レビュー: 予定の指示を一度使ったら親に知らせて消す（スマホは詳細を開くたびに作り直されるので、残すと戻るたびに予定別へ戻る） */
  onEventFocusDone?: () => void;
  /** ux-fix R2-7: 予定別の行から予定の詳細へ（スタッフ） */
  onOpenEvent?: (eventId: string) => void;
}) {
  const board = useBoard();
  const me = board.auth.playerId;
  // groups-phase2 §4: コーチのグループ絞り込み（"notebook"キーを他部品と共有。selfで読み直す）
  const team = useTeam();
  const [filterIds] = useGroupFilter("notebook");
  const filterGroup = isCoach ? resolveFilterGroup(filterIds, team.groups) : null;

  // 種類・グループ（スタッフ）／自分・チーム共有（選手）で絞った提出。予定別の「提出 N／M」の数え方の元
  const scoped = useMemo(() => {
    if (isCoach) return staffScopedNotes(board.notebook, board.state.players, kind, filterGroup);
    let list = kind === "all" ? board.notebook : board.notebook.filter((n) => n.kind === kind);
    if (kind === "practice" && scope === "team") {
      list = list.filter((n) => (n as PracticeNote).isPublic);
    } else {
      list = list.filter((n) => n.playerId === me);
    }
    return [...list].sort((a, b) => b.ts - a.ts);
  }, [board.notebook, board.state.players, kind, isCoach, scope, me, filterGroup]);

  // notebook-staff-redesign §3-3: スタッフの「状態」（未読／未コメント／コメント済）で絞ったもの。
  // 「未読 N」チップの N は、未読だけ(unreadOnly)を重ねる前のここでの未読数。
  // 未コメント＝既読でコメント無し（カードのタグ「未コメント」と同じ定義。未読はタグが「未読」なので含めない）。
  // 未読の絞り込みでは、PCで開いて既読になった選択中の提出を一覧に残す（押した瞬間にカードが消えて
  // 右の詳細だけ残るのを防ぐ。数える未読数は !staffSeenAt のまま）
  // ux-fix R2-7: チャットのスレッドから来たときの「この選手だけ」。予定別の「提出 N／M」は選手で絞らない（scoped のまま数える）
  const playerScoped = useMemo(
    () => (isCoach && playerId ? scoped.filter((n) => n.playerId === playerId) : scoped),
    [scoped, isCoach, playerId]
  );
  const base = useMemo(
    () => (isCoach ? staffStatusNotes(playerScoped, status, selectedId) : playerScoped),
    [playerScoped, isCoach, status, selectedId]
  );
  const unreadCount = useMemo(() => (isCoach ? staffUnreadNotes(base) : 0), [base, isCoach]);
  // 表示する提出。未読だけ(unreadOnly)は状態とANDで重ねる
  const entries = useMemo(
    () => (isCoach ? staffUnreadOnlyNotes(base, unreadOnly, selectedId) : base),
    [base, isCoach, unreadOnly, selectedId]
  );
  const shownUnread = isCoach ? entries.filter((n) => !n.staffSeenAt).length : 0;
  // 絞り込み中か（「絞り込み」ボタンの点）。未読だけは専用チップが色で示すので含めない
  const staffFilterOn = isCoach && (kind !== "all" || status !== "all" || !!filterGroup || !!playerId);

  const nameOf = (pid: string) => board.state.players.find((p) => p.id === pid)?.name ?? "選手";

  // 自主練の週単位ストリーク（選手のみ）
  const streak = useMemo(() => {
    if (kind !== "solo" || isCoach) return 0;
    return weeklyStreak(board.notebook.filter((n) => n.kind === "solo" && n.playerId === me).map((n) => n.date));
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

  // 一覧の表示切替。既定は従来どおりのフラット一覧（flat）
  const [listView, setListView] = useState<"flat" | "byEvent">("flat");
  // 展開中のグループキー集合（複数同時に開ける）
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // ux-fix R2-7: 予定の詳細からの指示。予定別に切り替えて、その予定の行だけ開いて見える所へ
  // レビュー: 直近 30 件の外の古い予定から来たときも行が出るよう、指示された予定は一覧に必ず含める（この一覧が生きている間）
  const [pinnedEvent, setPinnedEvent] = useState<string | null>(null);
  useEffect(() => {
    if (!eventFocus || !isCoach) return;
    setListView("byEvent");
    setExpanded(new Set([eventFocus.id]));
    setPinnedEvent(eventFocus.id);
    const id = eventFocus.id;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-evid="${id}"]`);
      el?.scrollIntoView({ block: "start" });
      // 一度使ったら消す（スクロールの後。先に消すとこの effect の後始末で timeout が止まる）
      onEventFocusDone?.();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventFocus, isCoach]);
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // 予定はlocalStorage直読み（作成シートの todayEventKinds と同じ作法）。
  // 予定別へ切り替えるたびに読み直すので、他画面での予定編集も反映される
  // p16 レビュー: 対象で絞る前に、今日までの予定が 1 件でもあるか（0 件のときの文言の出し分け用）
  const hasPastEvents = useMemo(() => {
    if (listView !== "byEvent") return false;
    const today = todayStr();
    return (loadTeam()?.events ?? []).some((e) => e.date <= today);
  }, [listView]);
  const events = useMemo(() => {
    if (listView !== "byEvent") return [];
    const today = todayStr();
    const all = (loadTeam()?.events ?? [])
      .filter((e) => e.date <= today)
      // p16 §5-4: サッカーノートの対象の予定だけ。30件に切る前に絞る（対象外の予定で30件が埋まらないように）
      .filter((e) => eventNoteTarget(e, team.categories))
      .sort((a, b) => b.date.localeCompare(a.date));
    const list = all
      // notebook-staff-redesign §3-4: 対象は今日までの予定30件（今のまま）。種類で絞るのは30件を取った後
      // （絞った後の30件にすると、より古い予定まで遡ってしまう）
      .slice(0, 30)
      // スタッフが種類で絞っているときは、その種類の予定だけ並べる（「試合」で絞って練習の予定に
      // 「提出 0／M」を出さない。自主練は予定に紐づかないので予定行は0件）
      .filter((e) => !isCoach || kind === "all" || (kind !== "solo" && (e.kind === "match") === (kind === "match")));
    // レビュー: 予定の詳細から指示された予定が 30 件の外なら足す（その行が無いと何も開かない）
    if (pinnedEvent && !list.some((e) => e.id === pinnedEvent)) {
      const extra = all.find((e) => e.id === pinnedEvent);
      if (extra) return [...list, extra].sort((a, b) => b.date.localeCompare(a.date));
    }
    return list;
  }, [listView, isCoach, kind, team.categories, pinnedEvent]);

  // 未提出チップの並び：学年順（team.groups の学年グループの並び）→背番号順。学年が無い選手は末尾
  const rosterOrder = useMemo(() => {
    if (!isCoach) return [] as Player[];
    const grades = team.groups.filter((g) => g.kind === "grade");
    const rank = (p: Player) => {
      const i = grades.findIndex((g) => playerInGroup(p, g));
      return i < 0 ? grades.length : i;
    };
    return [...board.state.players].sort(
      (a, b) => rank(a) - rank(b) || (a.number ?? 9999) - (b.number ?? 9999) || a.name.localeCompare(b.name, "ja")
    );
  }, [board.state.players, team.groups, isCoach]);

  // グループ分けは絞り込み後の entries に対して行う（カードもバッジの未読数もフィルタ後）。
  // notebook-staff-redesign §3-4/§3-5: スタッフは予定ごとに「提出 N／M」を出す。M＝予定の対象選手
  // （絞り込み中の学年/グループでさらに絞る）、N＝そのうち提出した人数（同じ選手が2件出しても1人）。
  // 提出済みかどうかは事実なので、状態・未読だけの絞り込みは掛けず scoped（種類・グループのみ）で数える
  const grouped = useMemo(() => {
    const used = new Set<string>();
    const list = events.map((ev) => {
      const notes = entries.filter((n) => noteBelongsToEvent(n, ev));
      notes.forEach((n) => used.add(n.id));
      if (!isCoach) return { ev, notes, targetCount: 0, submitted: 0, missing: [] as Player[], hasSub: false };
      const subs = scoped.filter((n) => noteBelongsToEvent(n, ev));
      const targets = eventTargetPlayers(ev, rosterOrder, team.groups).filter(
        (p) => !filterGroup || playerInGroup(p, filterGroup)
      );
      const { targetCount, submitted, missing } = eventSubmitStats(targets, subs);
      return { ev, notes, targetCount, submitted, missing, hasSub: subs.length > 0 };
    });
    return { list, unlinked: entries.filter((n) => !used.has(n.id)) };
  }, [events, entries, scoped, isCoach, rosterOrder, team.groups, filterGroup]);

  // フラット/予定別で同じカード表示（選択ハイライト・開き方の分岐も共通）
  const renderCard = (n: NotebookEntry) => (
    <NoteCard
      key={n.id}
      entry={n}
      who={isCoach || (kind === "practice" && scope === "team") ? nameOf(n.playerId) : undefined}
      showKind={kind === "all"}
      selected={selectedId != null && n.id === selectedId}
      staffView={isCoach}
      onClick={() => onOpen(n.id)}
    />
  );

  const groupRow = (key: string, label: React.ReactNode, right: React.ReactNode, body: React.ReactNode) => {
    const open = expanded.has(key);
    return (
      <Fragment key={key}>
        <button
          type="button"
          className={`evgrow${open ? " on" : ""}`}
          data-evid={key}
          aria-expanded={open}
          onClick={() => toggleGroup(key)}
        >
          {label}
          {right}
          <span className="evgrowchev">›</span>
        </button>
        {open && <div className="evgnotes">{body}</div>}
      </Fragment>
    );
  };

  // 一覧｜予定別の切替（スタッフだけ。.nbtop の右端）
  const viewToggle = (
    <div className="ngbar">
      <button
        type="button"
        className={`ngchip${listView === "flat" ? " on" : ""}`}
        onClick={() => setListView("flat")}
      >
        一覧
      </button>
      <button
        type="button"
        className={`ngchip${listView === "byEvent" ? " on" : ""}`}
        onClick={() => setListView("byEvent")}
      >
        予定別
      </button>
    </div>
  );

  // notebook-staff-redesign §3-1: 検索欄の下に「操作行(.nbtop)／選択中の1行(.nbsel)／件数行(.nbcount)」。
  // 選択中の1行は絞っている条件だけを「・」でつなぐ（学年／グループはその色の点付き）
  const selParts: React.ReactNode[] = [];
  if (isCoach) {
    if (filterGroup) {
      selParts.push(
        <span key="g">
          <i className="nbseldot" style={{ background: filterGroup.color ?? "var(--mut)" }} />
          {filterGroup.label}
        </span>
      );
    }
    if (playerId) selParts.push(nameOf(playerId));
    if (kind !== "all") selParts.push(NOTE_KIND_LABEL[kind]);
    if (status !== "all") selParts.push(NOTE_STATUS_LABEL[status]);
    if (unreadOnly && status !== "unread") selParts.push(NOTE_STATUS_LABEL.unread);
  }
  const staffTop = (
    <>
      <div className="nbtop">
        {showFilterBtn && (
          <button type="button" className="nbfilterbtn" onClick={onFilter}>
            <IconFilter />
            絞り込み
            {staffFilterOn && <span className="dot" />}
          </button>
        )}
        <button
          type="button"
          className={"nbunread" + (unreadOnly ? " on" : "")}
          aria-pressed={unreadOnly}
          onClick={onToggleUnread}
        >
          未読 {unreadCount}
        </button>
        {viewToggle}
      </div>
      {isCoach && playerId && (
        <div className="nbplayerrow">
          <span className="nbplayername">{nameOf(playerId)} の提出だけを表示中</span>
          <button type="button" className="st-btn ghost nbplayerclear" onClick={onClearPlayer}>
            解除
          </button>
        </div>
      )}
      <div className="nbsel">
        {selParts.length === 0
          ? "すべて"
          : selParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " ・ "}
                {part}
              </Fragment>
            ))}
      </div>
      <div className="nbcount">
        提出 {entries.length} 件 ・ 未読 {shownUnread}
      </div>
    </>
  );

  return (
    <>
      {/* ux-fix R2-2: 選手の検索は親の 2 段目（検索＋種類チップ）に移した。スタッフはここ */}
      {isCoach && (
        <button className="searchbar" onClick={onSearch}>
          <E n="search" /> 気づき・目標・相手名などで検索
        </button>
      )}

      {/* 一覧｜予定別はスタッフだけ（.nbtop の右端）。選手は一覧だけ */}
      {isCoach && staffTop}

      {!isCoach && kind === "solo" && streak > 0 && (
        <div className="streakcard"><E n="fire" /> 自主練 {streak}週連続</div>
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

      {listView === "flat" ? (
        entries.length === 0 ? (
          <div className="empty-msg">
            {kind === "practice" && scope === "team" ? (
              "共有されたノートはまだありません。"
            ) : isCoach ? (
              staffFilterOn || unreadOnly ? "条件に合う提出がありません。" : "まだ提出がありません。"
            ) : (
              <>
                まだ{kind === "all" ? "" : NOTE_KIND_LABEL[kind]}ノートがありません。
                <button
                  className="bigbtn"
                  style={{ width: "100%", margin: "12px 0 0" }}
                  onClick={() => onWrite(kind === "all" ? "practice" : kind)}
                >
                  ＋ 最初のノートを作成
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="notecards">{entries.map(renderCard)}</div>
        )
      ) : (
        <>
          {events.length === 0 && (
            <div className="evnote" style={{ margin: "2px 2px 8px" }}>
              {/* notebook-staff-redesign §3-4: スタッフが種類で絞って0件のときは、その旨を出す
                  （カレンダーに予定があるのに「予定がありません」と出さない） */}
              {isCoach && kind === "solo"
                ? "自主練は予定に紐づきません。下の「予定に紐づかない提出」を開いてください。"
                : isCoach && kind !== "all"
                  ? `今日までの直近の予定に${NOTE_KIND_LABEL[kind]}はありません。`
                  : hasPastEvents
                    ? // p16 レビュー: 予定はあるがサッカーノートの対象が 0 件のとき（「予定がありません」と出さない）
                      "サッカーノートに反映する予定がありません。種類の管理や予定のフォームで変えられます。"
                    : "カレンダーに今日までの予定がありません。"}
            </div>
          )}
          {grouped.list.map(({ ev, notes, targetCount, submitted, missing, hasSub }) =>
            groupRow(
              ev.id,
              <>
                <span className="evgrowdate">{fmt(ev.date)}</span>
                {/* 統括調整（p16 §5）: 予定の種類の名前を出す（保護者会・ミーティングなどを反映したとき「練習」と出さない） */}
                <span className={`evgrowkind ${ev.kind}`}>{categoryOf(ev, team.categories).label}</span>
                <span className="evgrowtitle">{ev.title || NOTE_KIND_LABEL[ev.kind]}</span>
              </>,
              isCoach ? (
                // notebook-staff-redesign §3-4: 「提出 N／M」（全員なら「提出 M／M ✓」）＋未読があれば赤い「未読 k」。
                // 対象選手が0人（名簿が空・絞り込み先に該当者なし）のときだけ従来どおり「N件」。
                // .evgrowright に束ね、狭い幅（PCの一覧の列）では予定名の下の2行目へ回す
                <span className="evgrowright">
                  {targetCount === 0 ? (
                    <span className="evgrowcount">{notes.length}件</span>
                  ) : missing.length === 0 ? (
                    <span className="evgrowcount done">
                      提出 {targetCount}／{targetCount} ✓
                    </span>
                  ) : (
                    <span className="evgrowcount">
                      提出 {submitted}／{targetCount}
                    </span>
                  )}
                  <UnreadPill count={notes.filter((n) => !n.staffSeenAt).length} />
                </span>
              ) : (
                <span className="evgrowcount">{notes.length}件</span>
              ),
              <>
                {/* ux-fix R2-7: 予定の詳細へ（スタッフ）。予定の詳細の「ノート N／M 提出 ›」の逆向き */}
                {isCoach && onOpenEvent && (
                  <button type="button" className="st-btn ghost evgopen" onClick={() => onOpenEvent(ev.id)}>
                    予定の詳細 ›
                  </button>
                )}
                {notes.length === 0 ? (
                  <div className="evnote">
                    {isCoach && hasSub ? "条件に合う提出はありません。" : "この予定の提出はありません。"}
                  </div>
                ) : (
                  <div className="notecards">{notes.map(renderCard)}</div>
                )}
                {/* notebook-staff-redesign §3-4: 提出済みのカードの下に未提出の選手（学年順→背番号順）。全員提出なら1行 */}
                {isCoach &&
                  targetCount > 0 &&
                  (missing.length === 0 ? (
                    <div className="evnote">全員提出済み</div>
                  ) : (
                    <>
                      <div className="nbmissing-h">未提出（{missing.length} 人）</div>
                      <div className="nbmissing">
                        {missing.map((p) => (
                          <span key={p.id} className="nbmissingchip">
                            {p.number != null && <b>{p.number}</b>}
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </>
                  ))}
              </>
            )
          )}
          {/* 自主練・予定の日付範囲外の提出は常設グループにまとめる（予定が0件でも出す）。
              予定に紐づかないので対象人数は出さない（「N件」のまま。スタッフは未読だけ添える） */}
          {groupRow(
            UNLINKED_KEY,
            <span className="evgrowtitle">予定に紐づかない提出</span>,
            isCoach ? (
              <span className="evgrowright">
                <span className="evgrowcount">{grouped.unlinked.length}件</span>
                <UnreadPill count={grouped.unlinked.filter((n) => !n.staffSeenAt).length} />
              </span>
            ) : (
              <span className="evgrowcount">{grouped.unlinked.length}件</span>
            ),
            grouped.unlinked.length === 0 ? (
              <div className="evnote">該当する提出はありません。</div>
            ) : (
              <div className="notecards">{grouped.unlinked.map(renderCard)}</div>
            )
          )}
        </>
      )}
    </>
  );
}

/** 予定別の行の右に添える赤い「未読 k」（notebook-staff-redesign §3-4）。0件なら何も出さない */
function UnreadPill({ count }: { count: number }) {
  return count > 0 ? <span className="evgrowunread">未読 {count}</span> : null;
}

/**
 * スタッフの提出一覧の絞り込みパネル（notebook-staff-redesign §3-2）。スマホは下からのシート、
 * PCは左の常設列(.nbside)の中身として、同じ部品を両方から呼ぶ。ux-fix R3-2: 種類・学年・グループ・状態は
 * すべて四角のチェック（FilterRow）。どれも選んでいない＝すべてなので「すべて」の行は置かず、見出しの右の
 * 「すべて解除」で戻す。学年・グループの色はラベルの前の点。値は今のところ 1 つだけ持つので、
 * 選んでいる行をもう一度押すと外れて「すべて」に戻る。学年とグループは同じ値（useGroupFilter("notebook")）を共有する。
 * グループ（kind==="custom"）が0件ならセクションごと出さない。
 */
function NotebookFilterPanel({
  kind,
  onKind,
  status,
  onStatus,
  groups,
  groupId,
  onGroup,
  onManageGroups,
}: {
  kind: NoteKind | "all";
  onKind: (k: NoteKind | "all") => void;
  status: NoteStatus;
  onStatus: (s: NoteStatus) => void;
  groups: TeamGroup[];
  /** 選択中の学年／グループのID。null=すべて */
  groupId: string | null;
  onGroup: (id: string | null) => void;
  /** 「絞り込みを編集…」（p14 §1-1）。省略時はリンク自体を出さない */
  onManageGroups?: () => void;
}) {
  const grades = groups.filter((g) => g.kind === "grade");
  const customs = groups.filter((g) => g.kind === "custom");
  // ux-fix R3-2 レビュー: 種類・学年／グループ・状態は値を 1 つしか持たない（選ぶと入れ替わる）ので丸のラジオ。
  // 複数同時に選べるようにする（配列化）のは別の作業。どれも選んでいない＝すべて、選んでいる行をもう一度押すと外れる
  const row = (key: string, label: string, on: boolean, onClick: () => void, dot?: string) => (
    <FilterRow key={key} rowCls="nbfrow" nameCls="nbfname" on={on} label={label} onClick={onClick} dot={dot} shape="rd" />
  );
  const sec = (title: string, active: boolean, onClear: () => void, rows: React.ReactNode) => (
    <div className="nbfsec" key={title}>
      <FilterSecHead headCls="nbfsec-h" title={title} active={active} onClear={onClear} />
      <div className="nbfrows" role="group" aria-label={title}>
        {rows}
      </div>
    </div>
  );
  const clearGroup = () => onGroup(null);
  const groupRows = (list: TeamGroup[]) =>
    list.map((g) => row(g.id, g.label, groupId === g.id, () => onGroup(groupId === g.id ? null : g.id), g.color ?? "var(--mut)"));
  const inGrades = grades.some((g) => g.id === groupId);
  const inCustoms = customs.some((g) => g.id === groupId);
  return (
    <div className="nbfpanel">
      {sec(
        "種類",
        kind !== "all",
        () => onKind("all"),
        (["match", "practice", "solo"] as NoteKind[]).map((k) =>
          row(`k-${k}`, NOTE_KIND_LABEL[k], kind === k, () => onKind(kind === k ? "all" : k))
        )
      )}
      {grades.length > 0 && sec("学年", inGrades, clearGroup, groupRows(grades))}
      {customs.length > 0 && sec("グループ", inCustoms, clearGroup, groupRows(customs))}
      {sec(
        "状態",
        status !== "all",
        () => onStatus("all"),
        (["unread", "nocomment", "commented"] as NoteStatus[]).map((st) =>
          row(`s-${st}`, NOTE_STATUS_LABEL[st], status === st, () => onStatus(status === st ? "all" : st))
        )
      )}
      {/* p14 §1-1: 一番下に「絞り込みを編集…」（名簿・カレンダーと同じ） */}
      {onManageGroups && (
        <button type="button" className="nbfmanage" onClick={onManageGroups}>
          絞り込みを編集…
        </button>
      )}
    </div>
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

function NoteCard({
  entry,
  who,
  showKind,
  selected,
  staffView,
  onClick,
}: {
  entry: NotebookEntry;
  who?: string;
  showKind?: boolean;
  selected?: boolean;
  /** スタッフの提出一覧のカード（notebook-staff-redesign §3-3）。選手側（自分のノート・チームの共有）は渡さず今のまま */
  staffView?: boolean;
  onClick: () => void;
}) {
  // notebook-staff-redesign §3-3: 未読(=staffSeenAtが無い)のスタッフ画面のカードは左に線・氏名の前に点・氏名は太字。
  // 状態タグは「未読／未コメント／コメント済」の3値（既読でコメント無しを未読と出していた誤りを直す）。
  // 選手側は who の有無を問わず従来のまま（who無し=タグなし、チームの共有=コメント済／未読）
  const unread = !!staffView && !entry.staffSeenAt;
  const iconBox = (
    <div
      className={`notecond k-${entry.kind}`}
      {...(showKind ? {} : { role: "img", "aria-label": `${NOTE_KIND_LABEL[entry.kind]}ノート` })}
    >
      <NoteKindIcon kind={entry.kind} />
    </div>
  );
  // ux-fix R3-5: スタッフの提出一覧の行は「名前（＋共有・反応の小さなアイコン）」と
  // 「種類・日付（固定幅の列）＋状態バッジ 1 つ」の 2 段。未読は左の線と名前の前の点だけ（青いバッジは出さない）。
  // 状態バッジは 未読＞コメント済＞未コメント の 1 つ（未読のときは点が状態を表すので文字のバッジは出さない）
  if (staffView) {
    const shared = entry.kind === "practice" && (entry as PracticeNote).isPublic;
    return (
      <button
        className={`notecard staffview${selected ? " sel" : ""}${unread ? " unread" : ""}`}
        onClick={onClick}
      >
        {iconBox}
        <div className="notemain">
          <div className="svtop">
            {/* 既読の行にも同じ幅の空きを置き、名前の左端を行どうしでそろえる */}
            {unread ? <i className="notedot" role="img" aria-label="未読" /> : <i className="notedot-sp" aria-hidden="true" />}
            {who && <span className="notewho">{who}</span>}
            {shared && (
              <span className="notemini" role="img" aria-label="チームに共有中" title="チームに共有中">
                <IconShare aria-hidden="true" />
              </span>
            )}
            {entry.staffReaction && (
              <span
                className="notemini react"
                role="img"
                aria-label={STAFF_REACTION_LABEL[entry.staffReaction]}
                title={STAFF_REACTION_LABEL[entry.staffReaction]}
              >
                <E n={REACTION_ICON[entry.staffReaction]} />
              </span>
            )}
          </div>
          <div className="svsub">
            {showKind && (
              <span className="dlvtag svkind" style={{ borderColor: "var(--line)", color: "var(--mut)" }}>
                {NOTE_KIND_LABEL[entry.kind]}
              </span>
            )}
            <span className="notedate svdate">{fmt(entry.date)}</span>
            {!unread &&
              (entry.staffComment ? (
                <span className="notetag done">コメント済</span>
              ) : (
                <span className="notetag">未コメント</span>
              ))}
          </div>
        </div>
        <span className="convchev">›</span>
      </button>
    );
  }
  return (
    <button className={`notecard${selected ? " sel" : ""}`} onClick={onClick}>
      {/* p17 §3: 体調の顔・漢字 1 文字をやめ、種類のアイコン（色は .k-種類） */}
      {/* p17 レビュー: 種類の文字タグを出さないカード（showKind なし）では、アイコンの枠に種類の名前を持たせる */}
      {iconBox}
      <div className="notemain">
        <div className="notetop">
          {who && <span className="notewho">{who}</span>}
          {showKind && (
            <span className="dlvtag" style={{ borderColor: "var(--line)", color: "var(--mut)" }}>
              {NOTE_KIND_LABEL[entry.kind]}
            </span>
          )}
          <span className="notedate">{fmt(entry.date)}</span>
          {entry.kind === "practice" && (entry as PracticeNote).isPublic && <span className="notetag share">共有</span>}
          {entry.staffReaction && (
            <span style={{ color: "var(--accent)", fontSize: 14 }}>
              <E n={REACTION_ICON[entry.staffReaction]} />
            </span>
          )}
          {entry.staffComment ? (
            <span className="notetag done">コメント済</span>
          ) : who ? (
            <span className="notetag">未読</span>
          ) : null}
        </div>
        <div className="notebody">{summarize(entry)}</div>
      </div>
      <span className="convchev">›</span>
    </button>
  );
}

/* ===================== 記入フォーム ===================== */

/**
 * フォーム下書きの自動保存（新規作成時のみ。編集時は key=null で無効）。
 * 入力が止まって600ms後に localStorage へ退避し、再訪時に復元バナーを出す。
 */
function useNoteDraft<T>(key: string | null, snapshot: T, hasContent: boolean) {
  const [pending, setPending] = useState<T | null>(() => (key ? loadNoteDraft<T>(key) : null));
  useEffect(() => {
    if (!key || !hasContent) return;
    const t = setTimeout(() => saveNoteDraft(key, snapshot), 600);
    return () => clearTimeout(t);
  }, [key, snapshot, hasContent]);
  return {
    /** 復元可能な下書き（バナー表示用） */
    pending,
    /** 復元した/しないに関わらずバナーを閉じる */
    dismiss: () => setPending(null),
    /** 下書きを破棄してバナーも閉じる */
    discard: () => {
      if (key) clearNoteDraft(key);
      setPending(null);
    },
    /** 提出完了時に呼ぶ（下書き削除） */
    clear: () => {
      if (key) clearNoteDraft(key);
    },
  };
}

function DraftBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="aibox" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0, marginBottom: 12 }}>
      <span style={{ flex: 1 }}>書きかけの下書きがあります</span>
      <button type="button" className="dynadd" style={{ width: "auto", marginTop: 0 }} onClick={onRestore}>
        続きから書く
      </button>
      <button type="button" className="dynadd" style={{ width: "auto", marginTop: 0 }} onClick={onDiscard}>
        破棄
      </button>
    </div>
  );
}

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

function NoteForm({
  kind,
  edit,
  initialMenuId,
  onDone,
}: {
  kind: NoteKind;
  edit?: NotebookEntry;
  /** 配信詳細から「このメニューで練習ノートを書く」で遷移した場合の練習メニューID（match/soloでは無視） */
  initialMenuId?: string;
  onDone: () => void;
}) {
  if (edit?.kind === "match" || (!edit && kind === "match")) {
    return <MatchForm edit={edit as MatchNote | undefined} onDone={onDone} />;
  }
  if (edit?.kind === "solo" || (!edit && kind === "solo")) {
    return <SoloForm edit={edit as SoloNote | undefined} onDone={onDone} />;
  }
  return <PracticeForm edit={edit as PracticeNote | undefined} initialMenuId={initialMenuId} onDone={onDone} />;
}

/* --- 練習ノート（④気づき・⑥目標/達成度・⑪共有） --- */
type PracticeDraft = {
  date: string;
  condition?: NoteCondition;
  goalPre: string;
  achievement: number;
  insights: string[];
  body: string;
  isPublic: boolean;
  menuId?: string;
};

function PracticeForm({ edit, initialMenuId, onDone }: { edit?: PracticeNote; initialMenuId?: string; onDone: () => void }) {
  const board = useBoard();
  const team = useTeam();
  const me = board.auth.playerId ?? "";
  // groups-everywhere §4: グループ宛の配信メニューも候補に含める
  const meP = board.state.players.find((p) => p.id === me);
  // Phase D-1(C1-minor): 以前はloadTeam()を毎レンダー直読みしていたため、(1) TeamProviderの
  // saveTeamはuseEffect(子の初回描画後)なので初回シード直後の最初の描画ではgroupsが[]になり
  // グループ宛の練習メニュー配信を取りこぼす、(2) 返り値が毎回別配列でmenuOptionsのuseMemo
  // 依存にも入っていないためグループ変更が反映されない、という不具合があった。
  // useTeam()のgroups(ensureGradeGroups済みの正本)を使う
  const myGroups = team.groups;
  const targetsMe = useCallback(
    (d: PracticeMenuDeliver) => (meP ? deliverableTargetsPlayer(d, meP, myGroups) : false),
    [meP, myGroups]
  );
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [condition, setCondition] = useState<NoteCondition | undefined>(edit?.condition);
  const [goalPre, setGoalPre] = useState(edit?.goalPre ?? "");
  const [achievement, setAchievement] = useState<number>(edit?.achievement ?? 60);
  const [insights, setInsights] = useState<string[]>(edit?.insights?.length ? edit.insights : [""]);
  const [body, setBody] = useState(edit?.body ?? "");
  const [isPublic, setIsPublic] = useState(edit?.isPublic ?? false);
  const [menuId, setMenuId] = useState<string | undefined>(() => {
    // 編集時は保存値をそのまま採用（未設定なら未設定のまま。勝手に紐付けない）
    if (edit) return edit.menuId;
    if (initialMenuId) return initialMenuId;
    // 新規作成時のみ：自分宛の練習メニュー配信のうち直近14日以内で最新の1件を自動選択する
    const cutoff = daysAgoStr(14);
    const recent = board.deliverables
      .filter((d): d is PracticeMenuDeliver => d.kind === "menu" && targetsMe(d))
      .filter((d) => localDateStr(new Date(d.ts)) >= cutoff)
      .sort((a, b) => b.ts - a.ts);
    return recent[0]?.id;
  });
  // 自動選択が効いている間だけ案内を表示。ユーザーが選び直す/解除すると消える
  const [autoSelected, setAutoSelected] = useState<boolean>(() => !edit && !initialMenuId && menuId !== undefined);

  // コーチが配信した練習メニュー（自分宛て・新しい順に最大5件）から今日の練習を選べる。
  // 選択中のメニューが5件から漏れる場合は先頭に含めて、選択解除が常にできるようにする
  const menuOptions = useMemo(() => {
    const all = board.deliverables
      .filter((d): d is PracticeMenuDeliver => d.kind === "menu" && targetsMe(d))
      .sort((a, b) => b.ts - a.ts);
    const top = all.slice(0, 5);
    if (menuId && !top.some((d) => d.id === menuId)) {
      const sel = all.find((d) => d.id === menuId);
      if (sel) return [sel, ...top.slice(0, 4)];
    }
    return top;
  }, [board.deliverables, me, menuId, targetsMe]);
  // 選択中メニューの内容表示は候補5件に絞らず全配信から探す（古い配信を選び直した場合も表示できるように）
  const selectedMenu = menuId
    ? board.deliverables.find((d): d is PracticeMenuDeliver => d.kind === "menu" && d.id === menuId)
    : undefined;

  const hasContent = !!(goalPre.trim() || body.trim() || insights.some((s) => s.trim()));
  const draft = useNoteDraft<PracticeDraft>(
    edit ? null : `practice:${me}`,
    { date, condition, goalPre, achievement, insights, body, isPublic, menuId },
    hasContent
  );
  const restoreDraft = () => {
    const d = draft.pending;
    if (!d) return;
    setDate(d.date);
    setCondition(d.condition);
    setGoalPre(d.goalPre);
    setAchievement(d.achievement);
    setInsights(d.insights.length ? d.insights : [""]);
    setBody(d.body);
    setIsPublic(d.isPublic);
    setMenuId(d.menuId);
    setAutoSelected(false);
    draft.dismiss();
  };

  // 前回の練習ノートの気づき・目標を「今日の目標」候補として引用
  const prevTheme = useMemo(() => {
    if (edit) return undefined;
    const prev = board.notebook
      .filter((n): n is PracticeNote => n.kind === "practice" && n.playerId === me)
      .sort((a, b) => b.ts - a.ts)[0];
    return prev?.insights?.find((s) => s.trim()) || prev?.goalPre || undefined;
  }, [board.notebook, me, edit]);

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
      menuId,
    };
    if (edit) board.updateNote({ ...edit, ...base });
    else board.addNote(base);
    draft.clear();
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{edit ? "練習ノートを編集" : "練習ノート"}</h2>
      {draft.pending && !hasContent && <DraftBanner onRestore={restoreDraft} onDiscard={draft.discard} />}
      {prevTheme && (
        <div className="aibox" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0, marginBottom: 12 }}>
          <span style={{ flex: 1 }}>前回の気づき：{prevTheme}</span>
          <button type="button" className="dynadd" style={{ width: "auto", marginTop: 0 }} onClick={() => setGoalPre(prevTheme)}>
            目標にセット
          </button>
        </div>
      )}

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
        <div className="formgroup-h">コーチの練習メニュー</div>
        {autoSelected && (
          <div className="evnote" style={{ marginBottom: 8 }}>
            今日のメニューを自動で選択しています（押すと解除できます）
          </div>
        )}
        {menuOptions.length === 0 ? (
          <div className="evnote">配信された練習メニューはまだありません。</div>
        ) : (
          menuOptions.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`menupick${menuId === d.id ? " on" : ""}`}
              onClick={() => {
                setMenuId(menuId === d.id ? undefined : d.id);
                setAutoSelected(false);
              }}
            >
              <span className="dlvtag menu">練習メニュー</span>
              <span>{d.title}</span>
              {menuId === d.id && <span className="mpk-check">✓</span>}
            </button>
          ))
        )}
        {selectedMenu && (
          <>
            <div className="menuview">
              <b>{selectedMenu.title}</b>
              {[selectedMenu.category ? `区分: ${selectedMenu.category}` : null, selectedMenu.desc || null]
                .filter(Boolean)
                .join("\n")}
            </div>
            <div className="evnote" style={{ marginTop: 6 }}>メニューを見ながら振り返りを書けます</div>
          </>
        )}
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
type SoloDraft = { date: string; condition?: NoteCondition; items: SoloItem[]; body: string };

function SoloForm({ edit, onDone }: { edit?: SoloNote; onDone: () => void }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [condition, setCondition] = useState<NoteCondition | undefined>(edit?.condition);
  const [items, setItems] = useState<SoloItem[]>(edit?.items?.length ? edit.items : [{ kind: "lifting", value: "" }]);
  const [body, setBody] = useState(edit?.body ?? "");

  const hasContent = !!(body.trim() || items.some((i) => i.value.trim()));
  const draft = useNoteDraft<SoloDraft>(edit ? null : `solo:${me}`, { date, condition, items, body }, hasContent);
  const restoreDraft = () => {
    const d = draft.pending;
    if (!d) return;
    setDate(d.date);
    setCondition(d.condition);
    setItems(d.items.length ? d.items : [{ kind: "lifting", value: "" }]);
    setBody(d.body);
    draft.dismiss();
  };

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
    draft.clear();
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{edit ? "自主練ノートを編集" : "自主練ノート"}</h2>
      {draft.pending && !hasContent && <DraftBanner onRestore={restoreDraft} onDiscard={draft.discard} />}
      <div className="formfield">
        <label>日付</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <ConditionPicker value={condition} onChange={setCondition} />
      <div className="formfield">
        <label>実施した種目</label>
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

type MatchDraft = {
  date: string;
  opponent: string;
  condition?: NoteCondition;
  bestPlay: string;
  body: string;
  halfMinutes: string;
  fullMatch: boolean;
  playFrom: string;
  playTo: string;
  lineups: MatchPhaseLineup[];
  plays: PlayPoint[];
  playLines: PlayLine[];
  reflectPlay: string;
  videoUrl: string;
  detailed: boolean;
};

/** シュートコース編集シート（ゴール正面図でコース・結果・状況メモを記録） */
function ShotCourseSheet({
  shot,
  onPick,
  onSetScored,
  onSetNote,
  onClose,
  onDelete,
}: {
  shot: PlayPoint;
  onPick: (x: number, y: number) => void;
  onSetScored: (v: boolean) => void;
  onSetNote: (v: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="wsheetback" onClick={onClose}>
      <div className="wsheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsheet-h">シュートコース ・ ゴールのどこに飛んだかをタップ</div>
        <div className="formpitch">
          <GoalCourseView shots={shot.course ? [{ course: shot.course, scored: shot.scored }] : []} onPick={onPick} />
        </div>
        <div className="goalres">
          <button
            type="button"
            className={`goalresbtn${shot.scored === true ? " on goal" : ""}`}
            onClick={() => onSetScored(true)}
          >
            ゴール
          </button>
          <button
            type="button"
            className={`goalresbtn${shot.scored === false ? " on nogoal" : ""}`}
            onClick={() => onSetScored(false)}
          >
            ノーゴール
          </button>
        </div>
        <div className="formfield" style={{ margin: 0 }}>
          <input
            value={shot.shotNote ?? ""}
            onChange={(e) => onSetNote(e.target.value)}
            placeholder="例）トラップして浮いた球をボレー / 右足でカーブシュート"
          />
        </div>
        <button className="bigbtn" style={{ marginTop: 12 }} onClick={onClose}>
          OK
        </button>
        <button type="button" className="linkdanger" onClick={onDelete}>
          このシュートを削除
        </button>
      </div>
    </div>
  );
}

/** シュート位置のモーダル（試合ノートの詳細・閲覧専用）。notebook-staff-redesign §4:
 *  ピッチのシュートの点／一覧の行を押すと、ゴール正面図にそのシュートだけを出して
 *  「ゴールのどこに打ったか」と結果・状況メモを見せる。文法は ShotCourseSheet(.wsheetback/.wsheet)と同じ */
function ShotViewSheet({
  shot,
  onClose,
}: {
  shot: PlayPoint & { num: number };
  onClose: () => void;
}) {
  // コース未記録でも結果(scored)だけ入っていれば結果ラベルは出す。どちらも無ければ出さない
  const hasResult = shot.course != null || shot.scored != null;
  return (
    <div className="wsheetback" onClick={onClose}>
      <div className="wsheet shotsheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsheet-h">
          #{shot.num} シュート ・ {MATCH_PHASE_LABEL[markPhase(shot.phase)]}
        </div>
        {shot.course ? (
          <div className="formpitch">
            <GoalCourseView shots={[{ course: shot.course, scored: shot.scored, label: shot.num }]} />
          </div>
        ) : (
          <div className="evnote">コースは記録されていません</div>
        )}
        {hasResult && (
          <div className={"shotresult" + (shot.scored ? "" : " nogoal")}>
            <span className={"shotmark" + (shot.scored ? "" : " nogoal")} />
            {shot.scored ? "ゴール" : "ノーゴール"}
          </div>
        )}
        {shot.shotNote && <div className="notesec-b">{shot.shotNote}</div>}
        <button type="button" className="wsheetcancel" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

/** パス／ドリブルの結果編集シート（成否・状況メモを記録） */
function LineResultSheet({
  line,
  onSetSuccess,
  onSetNote,
  onClose,
  onDelete,
}: {
  line: PlayLine;
  onSetSuccess: (v: boolean) => void;
  onSetNote: (v: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const label = PLAY_LINE_LABEL[line.kind];
  const success = line.success !== false;
  return (
    <div className="wsheetback" onClick={onClose}>
      <div className="wsheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsheet-h">{label}の結果</div>
        <div className="goalres">
          <button
            type="button"
            className={`goalresbtn${success ? " on goal" : ""}`}
            onClick={() => onSetSuccess(true)}
          >
            成功
          </button>
          <button
            type="button"
            className={`goalresbtn${!success ? " on nogoal" : ""}`}
            onClick={() => onSetSuccess(false)}
          >
            ミス
          </button>
        </div>
        <div className="formfield" style={{ margin: 0 }}>
          <input
            value={line.note ?? ""}
            onChange={(e) => onSetNote(e.target.value)}
            placeholder="例）縦パスがカットされた / 切り返しで抜いた"
          />
        </div>
        <button className="bigbtn" style={{ marginTop: 12 }} onClick={onClose}>
          OK
        </button>
        <button type="button" className="linkdanger" onClick={onDelete}>
          この{label}を削除
        </button>
      </div>
    </div>
  );
}

function MatchForm({ edit, onDone }: { edit?: MatchNote; onDone: () => void }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [opponent, setOpponent] = useState(edit?.opponent ?? "");
  const [condition, setCondition] = useState<NoteCondition | undefined>(edit?.condition);
  // クイック記録（既定）：ベストプレー＋ひとこと
  const [bestPlay, setBestPlay] = useState(edit?.bestPlay ?? "");
  const [body, setBody] = useState(edit?.body ?? "");
  // クイック記録：出場時間
  const [halfMinutes, setHalfMinutes] = useState(edit?.halfMinutes != null ? String(edit.halfMinutes) : "");
  const [fullMatch, setFullMatch] = useState(edit?.fullMatch ?? true);
  const [playFrom, setPlayFrom] = useState(edit?.playFrom != null ? String(edit.playFrom) : "");
  const [playTo, setPlayTo] = useState(edit?.playTo != null ? String(edit.playTo) : "");
  // ここから下は「くわしく記録」（任意の詳細モード）
  const [lineups, setLineups] = useState<MatchPhaseLineup[]>(edit?.lineups ?? []);
  const [plays, setPlays] = useState<PlayPoint[]>(edit?.plays ?? []);
  const [playLines, setPlayLines] = useState<PlayLine[]>(edit?.playLines ?? []);
  const [tool, setTool] = useState<PlayTool>({ mode: "point", kind: "receive" });
  // プレーエリアの記録・表示フェーズ（前半/後半/延長）
  const [playPhase, setPlayPhase] = useState<MatchPhase>("1st");
  // 現フェーズ内で表示・記録中のピッチ番号（複数ピッチ記録用）
  const [activeCanvas, setActiveCanvas] = useState(0);
  // シュートコース編集シートの対象（plays配列のindex。nullなら非表示）
  const [shotEditIndex, setShotEditIndex] = useState<number | null>(null);
  // パス/ドリブル結果編集シートの対象（playLines配列のindex。nullなら非表示）
  const [lineEditIndex, setLineEditIndex] = useState<number | null>(null);
  const [reflectPlay, setReflectPlay] = useState(edit?.reflectPlay ?? "");
  const [videoUrl, setVideoUrl] = useState(edit?.videoUrl ?? "");

  // 編集時に詳細データがあれば最初から詳細モードで開く
  const hasDetail = !!(
    edit &&
    ((edit.lineups?.length ?? 0) > 0 ||
      (edit.plays?.length ?? 0) > 0 ||
      (edit.playLines?.length ?? 0) > 0 ||
      edit.reflectPlay ||
      edit.videoUrl)
  );
  const [detailed, setDetailed] = useState(hasDetail);
  const openDetailed = () => {
    if (lineups.length === 0) setLineups([emptyLineup("1st")]);
    setDetailed(true);
  };

  const hasContent = !!(
    opponent.trim() ||
    bestPlay.trim() ||
    body.trim() ||
    reflectPlay.trim() ||
    halfMinutes.trim() ||
    !fullMatch ||
    plays.length ||
    playLines.length ||
    lineups.some((l) => l.ownPositionIndex != null)
  );
  const draft = useNoteDraft<MatchDraft>(
    edit ? null : `match:${me}`,
    { date, opponent, condition, bestPlay, body, halfMinutes, fullMatch, playFrom, playTo, lineups, plays, playLines, reflectPlay, videoUrl, detailed },
    hasContent
  );
  const restoreDraft = () => {
    const d = draft.pending;
    if (!d) return;
    setDate(d.date);
    setOpponent(d.opponent);
    setCondition(d.condition);
    setBestPlay(d.bestPlay);
    setBody(d.body);
    // 旧スキーマの下書き（出場時間フィールドが無い）でも壊れないようフォールバック
    setHalfMinutes(d.halfMinutes ?? "");
    setFullMatch(d.fullMatch ?? true);
    setPlayFrom(d.playFrom ?? "");
    setPlayTo(d.playTo ?? "");
    setLineups(d.lineups);
    setPlays(d.plays);
    setPlayLines(d.playLines);
    setReflectPlay(d.reflectPlay);
    setVideoUrl(d.videoUrl);
    setDetailed(d.detailed);
    draft.dismiss();
  };

  // 前回の試合ノートの改善点をリマインド表示
  const prevImprove = useMemo(() => {
    if (edit) return undefined;
    const prev = board.notebook
      .filter((n): n is MatchNote => n.kind === "match" && n.playerId === me)
      .sort((a, b) => b.ts - a.ts)[0];
    return prev?.reportImprove || prev?.reflectPlay || undefined;
  }, [board.notebook, me, edit]);

  const phasesPresent = lineups.map((l) => l.phase);
  const addPhase = (p: MatchPhase) => setLineups([...lineups, emptyLineup(p)]);
  const setLineup = (i: number, patch: Partial<MatchPhaseLineup>) =>
    setLineups(lineups.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // 延長は陣形・プレー記録のいずれかに存在する場合のみチップを表示
  const etPresent =
    lineups.some((l) => l.phase === "et") ||
    plays.some((p) => p.phase === "et") ||
    playLines.some((l) => l.phase === "et");
  const playPhases = PLAY_PHASES.filter((p) => p !== "et" || etPresent);
  // 延長のマークを全消去して延長チップが消えたら前半へフォールバック
  useEffect(() => {
    if (playPhase === "et" && !etPresent) setPlayPhase("1st");
  }, [playPhase, etPresent]);
  // フェーズを切り替えたらピッチ選択を1枚目に戻す
  useEffect(() => {
    setActiveCanvas(0);
  }, [playPhase]);
  const phaseMarkCount = (p: MatchPhase) =>
    plays.filter((pt) => markPhase(pt.phase) === p).length + playLines.filter((l) => markPhase(l.phase) === p).length;
  // 現フェーズで使われているピッチ枚数（未使用でも選択中のピッチまでは表示。最低1・最大4枚）
  const canvasMaxUsed = Math.max(
    0,
    ...plays.filter((p) => markPhase(p.phase) === playPhase).map((p) => markCanvas(p.canvas)),
    ...playLines.filter((l) => markPhase(l.phase) === playPhase).map((l) => markCanvas(l.canvas))
  );
  const canvasCount = Math.min(4, Math.max(1, canvasMaxUsed + 1, activeCanvas + 1));
  const scopedPlays = plays.filter((p) => markPhase(p.phase) === playPhase && markCanvas(p.canvas) === activeCanvas);
  const scopedPlayLines = playLines.filter((l) => markPhase(l.phase) === playPhase && markCanvas(l.canvas) === activeCanvas);
  // 現フェーズのシュート点（元のplays配列index付き。編集シートを開くのに使う）
  const phaseShots = plays
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => p.kind === "shot" && markPhase(p.phase) === playPhase);

  // ピッチタップで点を追加。シュートは追加直後にコース編集シートを開く
  const addPoint = (x: number, y: number) => {
    const kind = tool.mode === "point" ? tool.kind : "receive";
    setPlays((prev) => {
      const next = [...prev, { x, y, kind, phase: playPhase, canvas: activeCanvas }];
      if (kind === "shot") setShotEditIndex(next.length - 1);
      return next;
    });
  };

  // なぞって軌道を追加。パス/ドリブルは追加直後に結果編集シートを開く
  const addLine = (path: Point[]) => {
    const kind = tool.mode === "line" ? tool.kind : "dribble";
    setPlayLines((prev) => {
      const next = [...prev, { kind, path, phase: playPhase, canvas: activeCanvas }];
      if (kind === "pass" || kind === "dribble") setLineEditIndex(next.length - 1);
      return next;
    });
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
      halfMinutes: halfMinutes.trim() ? +halfMinutes : undefined,
      fullMatch,
      playFrom: !fullMatch && playFrom.trim() ? +playFrom : undefined,
      playTo: !fullMatch && playTo.trim() ? +playTo : undefined,
      lineups,
      plays: plays.map((p) => ({ ...p, phase: markPhase(p.phase), canvas: markCanvas(p.canvas) })),
      playLines: playLines.map((l) => ({ ...l, phase: markPhase(l.phase), canvas: markCanvas(l.canvas) })),
      bestPlay: bestPlay.trim() || undefined,
      reflectPlay: reflectPlay.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      body: body.trim() || undefined,
    };
    if (edit) board.updateNote({ ...edit, ...base });
    else board.addNote(base);
    draft.clear();
    onDone();
  };

  return (
    <div className="noteform">
      <h2>{edit ? "試合ノートを編集" : "試合ノート"}</h2>
      {draft.pending && !hasContent && <DraftBanner onRestore={restoreDraft} onDiscard={draft.discard} />}
      {prevImprove && (
        <div className="aibox" style={{ marginTop: 0, marginBottom: 12 }}>
          <E n="target" /> 前回の改善点：{prevImprove}
        </div>
      )}

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

      <div className="formgrid">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>◯分ハーフ</label>
          <input type="number" min={0} value={halfMinutes} onChange={(e) => setHalfMinutes(e.target.value)} placeholder="35" />
        </div>
      </div>
      <div className="scopebar">
        <button type="button" className={`scopechip${fullMatch ? " on" : ""}`} onClick={() => setFullMatch(true)}>
          フル出場
        </button>
        <button type="button" className={`scopechip${!fullMatch ? " on" : ""}`} onClick={() => setFullMatch(false)}>
          途中出場
        </button>
      </div>
      {!fullMatch && (
        <div className="formgrid">
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>出場開始（分）</label>
            <input type="number" min={0} value={playFrom} onChange={(e) => setPlayFrom(e.target.value)} placeholder="0" />
          </div>
          <div className="formfield" style={{ flex: 1, margin: 0 }}>
            <label>出場終了（分）</label>
            <input type="number" min={0} value={playTo} onChange={(e) => setPlayTo(e.target.value)} placeholder="35" />
          </div>
        </div>
      )}

      <ConditionPicker value={condition} onChange={setCondition} />
      <div className="formfield">
        <label><E n="star" /> 今日のベストプレー</label>
        <input value={bestPlay} onChange={(e) => setBestPlay(e.target.value)} placeholder="例）右サイドの突破からアシスト" />
      </div>
      <div className="formfield">
        <label>メモ（任意）</label>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="試合の振り返りをひとことで" />
      </div>

      {!detailed ? (
        <button className="detailtoggle" type="button" onClick={openDetailed}>
          ＋ 詳細を記録する（任意）
          <span className="detailtoggle-sub">フォーメーション・プレーエリア・反省</span>
        </button>
      ) : (
        <div className="detailwrap">
          <div className="detailwrap-h">
            <span>詳細記録</span>
            <button className="detailhide" type="button" onClick={() => setDetailed(false)}>簡易表示に戻す</button>
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
          <div className="phasebar">
            {playPhases.map((p) => {
              const cnt = phaseMarkCount(p);
              return (
                <button
                  key={p}
                  type="button"
                  className={`phasechip${playPhase === p ? " on" : ""}`}
                  onClick={() => setPlayPhase(p)}
                >
                  {MATCH_PHASE_LABEL[p]}{cnt > 0 ? ` ${cnt}` : ""}
                </button>
              );
            })}
          </div>
          <div className="canvasbar">
            {Array.from({ length: canvasCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`canvaschip${activeCanvas === i ? " on" : ""}`}
                onClick={() => setActiveCanvas(i)}
              >
                ピッチ{i + 1}
              </button>
            ))}
            {canvasCount < 4 && (
              <button type="button" className="canvaschip add" onClick={() => setActiveCanvas(canvasCount)}>
                ＋ ピッチを追加
              </button>
            )}
          </div>
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
              ? `コートをタップして「${PLAY_KIND_LABEL[tool.kind]}」を記録（${MATCH_PHASE_LABEL[playPhase]}: 点 ${scopedPlays.length} ／ 軌道 ${scopedPlayLines.length}）（ピッチ${activeCanvas + 1}）`
              : `コートをなぞって「${PLAY_LINE_LABEL[tool.kind]}」の軌道を記録（${MATCH_PHASE_LABEL[playPhase]}: 点 ${scopedPlays.length} ／ 軌道 ${scopedPlayLines.length}）（ピッチ${activeCanvas + 1}）`}
          </div>
          <div className="formpitch">
            <PlayAreaPitch
              points={scopedPlays}
              lines={scopedPlayLines}
              tool={tool}
              onAddPoint={addPoint}
              onAddLine={addLine}
            />
          </div>
          {(plays.length > 0 || playLines.length > 0) && (
            <div className="playacts">
              <button
                className="dynadd"
                onClick={() =>
                  tool.mode === "line"
                    ? setPlayLines((p) => popPhaseCanvas(p, playPhase, activeCanvas))
                    : setPlays((p) => popPhaseCanvas(p, playPhase, activeCanvas))
                }
              >
                1つ戻す
              </button>
              <button
                className="dynadd"
                onClick={() => {
                  setPlays((prev) => prev.filter((p) => !(markPhase(p.phase) === playPhase && markCanvas(p.canvas) === activeCanvas)));
                  setPlayLines((prev) => prev.filter((l) => !(markPhase(l.phase) === playPhase && markCanvas(l.canvas) === activeCanvas)));
                }}
              >
                このピッチを消去
              </button>
            </div>
          )}
          {(plays.length > 0 || playLines.length > 0) && <PlayStatsRow stats={playStats(plays, playLines)} />}

          {phaseShots.length > 0 && (
            <div className="shotlist">
              {phaseShots.map(({ p, idx }, i) => (
                <button key={idx} type="button" className="shotrow" onClick={() => setShotEditIndex(idx)}>
                  <span className={`shotmark${p.course ? (p.scored ? "" : " nogoal") : " none"}`} />
                  <span>シュート{i + 1} ・ {p.course ? (p.scored ? "ゴール" : "ノーゴール") : "コース未記録"}</span>
                  {p.shotNote && <small>{p.shotNote.slice(0, 20)}</small>}
                </button>
              ))}
            </div>
          )}

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
        </div>
      )}

      <button className="bigbtn" style={{ marginTop: 14 }} onClick={submit}>
        {edit ? "更新する" : "提出する"}
      </button>

      {shotEditIndex != null && plays[shotEditIndex] && (
        <ShotCourseSheet
          shot={plays[shotEditIndex]}
          onPick={(x, y) => {
            const scored = isInGoalFrame(x, y);
            setPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, course: { x, y }, scored } : p)));
          }}
          onSetScored={(v) => setPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, scored: v } : p)))}
          onSetNote={(v) => setPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, shotNote: v } : p)))}
          onClose={() => setShotEditIndex(null)}
          onDelete={() => {
            setPlays((prev) => prev.filter((_, i) => i !== shotEditIndex));
            setShotEditIndex(null);
          }}
        />
      )}

      {lineEditIndex != null && playLines[lineEditIndex] && (
        <LineResultSheet
          line={playLines[lineEditIndex]}
          onSetSuccess={(v) => setPlayLines((prev) => prev.map((l, i) => (i === lineEditIndex ? { ...l, success: v } : l)))}
          onSetNote={(v) => setPlayLines((prev) => prev.map((l, i) => (i === lineEditIndex ? { ...l, note: v } : l)))}
          onClose={() => setLineEditIndex(null)}
          onDelete={() => {
            setPlayLines((prev) => prev.filter((_, i) => i !== lineEditIndex));
            setLineEditIndex(null);
          }}
        />
      )}
    </div>
  );
}

/** コメントの署名「岡本監督・10/10 02:00」の日時（M/D HH:mm 24 時間。ux-fix R3-5） */
function fmtStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 「送信済み 10/10 18:30」の日時（M/D H:mm 24 時間） */
function fmtSentAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ===================== 詳細 ===================== */
function NoteDetail({
  id,
  isCoach,
  onEdit,
  onDeleted,
  nextUnread,
}: {
  id: string;
  isCoach: boolean;
  onEdit: (e: NotebookEntry) => void;
  onDeleted: () => void;
  /** ux-fix R2-7: スタッフ。今の絞り込みの中の、この提出以外の未読の数と、いちばん新しい未読を開く関数 */
  nextUnread?: { count: number; onOpen: () => void };
}) {
  const board = useBoard();
  const team = useTeam();
  const entry = board.notebook.find((n) => n.id === id);
  const [comment, setComment] = useState(entry?.staffComment ?? "");
  // ux-fix R2-7: この画面で送ったか（送ったら「次の未読へ」を出す）
  const [sentHere, setSentHere] = useState(false);
  // 図付きコメント（コーチ）。折りたたみ・編集中の点/線はローカル state
  const [drawOpen, setDrawOpen] = useState(!!entry?.staffDrawing);
  const [drawTool, setDrawTool] = useState<PlayTool>({ mode: "line", kind: "pass" });
  const [drawPlays, setDrawPlays] = useState<PlayPoint[]>(entry?.staffDrawing?.plays ?? []);
  const [drawLines, setDrawLines] = useState<PlayLine[]>(entry?.staffDrawing?.playLines ?? []);

  // コーチが開いたら自動既読（トーストなしの patchNote・依存はidのみで無限ループ回避）
  useEffect(() => {
    if (isCoach && entry && !entry.staffSeenAt) {
      board.patchNote(entry.id, { staffSeenAt: Date.now() });
    }
    // ux-fix R2-1 レビュー: 選手・保護者が自分のノートの詳細でコメントを見たら、そのノートのコメントは既読
    // （ホームの「コーチからコメント N 件」・ノートのホームの未読・ノートのバッジが、この先で片付く）
    if (!isCoach && entry && entry.playerId === board.auth.playerId && isUnreadStaffComment(entry, 0)) {
      board.patchNote(entry.id, { playerCommentSeenTs: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  if (!entry) return <div className="empty-msg">ノートが見つかりません。</div>;
  const who = board.state.players.find((p) => p.id === entry.playerId)?.name ?? "選手";
  const mine = !isCoach && entry.playerId === board.auth.playerId;

  // ux-fix R2-7: 送った内容から変わるまで「コメントを更新」は押せない（文字と図の両方を見る）
  const savedDrawing = JSON.stringify({ plays: entry.staffDrawing?.plays ?? [], playLines: entry.staffDrawing?.playLines ?? [] });
  const dirty =
    comment.trim() !== (entry.staffComment ?? "") ||
    JSON.stringify({ plays: drawPlays, playLines: drawLines }) !== savedDrawing;
  // ux-fix R3-5: コメントを書いた人（「岡本監督」）。送ったときの本人を覚える。古いコメントは代表のスタッフに寄せる
  const ident = staffIdentity(board.auth.name, team.team.coaches);
  const ownName = `${ident.name}${ident.role}`;
  const sendComment = () => {
    // レビュー: 保存済みの図を消し切って送ったときは空の図を渡して消す（undefined は「既存の図を保持」）
    board.setNoteComment(
      entry.id,
      comment,
      drawPlays.length > 0 || drawLines.length > 0 || entry.staffDrawing ? { plays: drawPlays, playLines: drawLines } : undefined,
      { toast: "送りました", by: ownName }
    );
    // notebook-staff-redesign §5: 送信したら描画エリアを畳む（図は state に残り、保存もされたまま）
    setDrawOpen(false);
    setSentHere(true);
  };
  const sentAt = entry.staffComment && entry.staffCommentTs ? fmtSentAt(entry.staffCommentTs) : "";
  const byline = (() => {
    if (!entry.staffComment || !entry.staffCommentTs) return "";
    const first = staffIdentity("", team.team.coaches);
    return `${entry.staffCommentBy ?? `${first.name}${first.role}`}・${fmtStamp(entry.staffCommentTs)}`;
  })();
  const sharedNote = entry.kind === "practice" && !!(entry as PracticeNote).isPublic;

  return (
    <div className="notedetail">
      <div className="notedhead">
        {/* p17 §3: 詳細ヘッダーも種類のアイコン。体調は日付の並びに小さく残す */}
        <div className={`notecond big k-${entry.kind}`}>
          <NoteKindIcon kind={entry.kind} />
        </div>
        <div>
          <div className="notewho">
            {who}
            {sharedNote && <span className="notetag share notewho-tag">チームに共有中</span>}
          </div>
          <div className="notedate">
            {NOTE_KIND_LABEL[entry.kind]}ノート ・ {fmt(entry.date)}
            {entry.condition && (
              <>
                {" ・ "}
                <span className="notecondmini" title={NOTE_CONDITION_LABEL[entry.condition]} aria-label={`体調 ${NOTE_CONDITION_LABEL[entry.condition]}`}>
                  <ConditionIcon c={entry.condition} />
                </span>
                {NOTE_CONDITION_LABEL[entry.condition]}
              </>
            )}
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
          <div className="reactrow">
            {STAFF_REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`reactbtn${entry.staffReaction === r ? " on" : ""}`}
                aria-pressed={entry.staffReaction === r}
                onClick={() => {
                  // ux-fix R2-7: スタンプは押した時点で送信（もう一度押すと外す）
                  const on = entry.staffReaction !== r;
                  board.patchNote(entry.id, { staffReaction: on ? r : undefined });
                  if (on) {
                    board.toast("送りました");
                    setSentHere(true);
                  }
                }}
              >
                <E n={REACTION_ICON[r]} /> {STAFF_REACTION_LABEL[r]}
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="選手へフィードバックを送る" />
          {sentAt && <div className="cmtsent">送信済み {sentAt}</div>}

          {/* notebook-staff-redesign §5: 畳んだボタンは、図があれば「図を編集（点 N ・ 線 M）」。
              開いたエリアの上に見出し行と「× 閉じる」を出し、押すと畳む（描いた点・線は state に残す） */}
          {!drawOpen ? (
            <button type="button" className="dynadd" onClick={() => setDrawOpen(true)}>
              {drawPlays.length > 0 || drawLines.length > 0
                ? `図を編集（点 ${drawPlays.length} ・ 線 ${drawLines.length}）`
                : "＋ ピッチに描いて伝える"}
            </button>
          ) : (
            <>
              <div className="drawhead">
                <span>ピッチに描いて伝える</span>
                <button type="button" className="drawclose" onClick={() => setDrawOpen(false)}>
                  × 閉じる
                </button>
              </div>
              <div className="detailwrap">
                <div className="playtools">
                  <div className="playtoolrow">
                    {PLAY_KINDS.map((k) => {
                      const on = drawTool.mode === "point" && drawTool.kind === k;
                      return (
                        <button key={k} type="button" className={`playkind ${k}${on ? " on" : ""}`} onClick={() => setDrawTool({ mode: "point", kind: k })}>
                          {PLAY_KIND_LABEL[k]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="playtoolrow">
                    {PLAY_LINE_KINDS.map((k) => {
                      const on = drawTool.mode === "line" && drawTool.kind === k;
                      return (
                        <button key={k} type="button" className={`playline ${k}${on ? " on" : ""}`} onClick={() => setDrawTool({ mode: "line", kind: k })}>
                          {PLAY_LINE_LABEL[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="formpitch">
                  <PlayAreaPitch
                    points={drawPlays}
                    lines={drawLines}
                    tool={drawTool}
                    onAddPoint={(x, y) => setDrawPlays((prev) => [...prev, { x, y, kind: drawTool.mode === "point" ? drawTool.kind : "receive" }])}
                    onAddLine={(path) => setDrawLines((prev) => [...prev, { kind: drawTool.mode === "line" ? drawTool.kind : "pass", path }])}
                  />
                </div>
                {(drawPlays.length > 0 || drawLines.length > 0) && (
                  <div className="playacts">
                    <button
                      className="dynadd"
                      onClick={() => (drawTool.mode === "line" ? setDrawLines((p) => p.slice(0, -1)) : setDrawPlays((p) => p.slice(0, -1)))}
                    >
                      1つ戻す
                    </button>
                    <button className="dynadd" onClick={() => { setDrawPlays([]); setDrawLines([]); }}>
                      全消去
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <button className="bigbtn" style={{ marginTop: 8 }} onClick={sendComment} disabled={!dirty}>
            {entry.staffComment ? "コメントを更新" : "コメントを送る"}
          </button>
          {/* ux-fix R2-7: 送ったら次の未読へ。N は今の絞り込みの中の未読（この提出は含まない） */}
          {sentHere && nextUnread && (
            nextUnread.count > 0 ? (
              <button type="button" className="st-btn ghost cmtnext" onClick={nextUnread.onOpen}>
                次の未読へ（残り {nextUnread.count}）
              </button>
            ) : (
              <div className="cmtsent">未読の提出はありません</div>
            )
          )}
        </div>
      ) : entry.staffComment || entry.staffReaction || entry.staffDrawing ? (
        <div className="notesec staffcmt">
          <div className="notesec-h">スタッフからのコメント</div>
          {entry.staffReaction && (
            <div className="reactpill">
              <E n={REACTION_ICON[entry.staffReaction]} /> コーチから: {STAFF_REACTION_LABEL[entry.staffReaction]}
            </div>
          )}
          {entry.staffComment && <div className="notesec-b">{entry.staffComment}</div>}
          {byline && <div className="cmtby">{byline}</div>}
          {entry.staffDrawing && (
            <>
              <div className="notesec-h" style={{ marginTop: 12 }}>コーチの図</div>
              <div className="formpitch">
                <PlayAreaPitch points={entry.staffDrawing.plays} lines={entry.staffDrawing.playLines} />
              </div>
            </>
          )}
        </div>
      ) : entry.staffSeenAt ? (
        <div className="seenpill"><E n="check" /> コーチが確認しました</div>
      ) : (
        <div className="evnote" style={{ margin: "12px 2px" }}>スタッフのコメントはまだありません。</div>
      )}

      {mine && (
        <div className="notedacts">
          <button className="bigbtn ghost" onClick={() => onEdit(entry)}>編集する</button>
          <button
            className="linkdanger"
            onClick={() => {
              // ux-fix R3-5: 確認してから消す。コーチのコメントがあれば、一緒に消えることを伝える
              const hasStaff = !!(entry.staffComment || entry.staffReaction || entry.staffDrawing);
              const msg = `このノートを削除しますか？${hasStaff ? "コーチのコメントも消えます。" : ""}`;
              if (!window.confirm(msg)) return;
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
  const allPlays = note.plays ?? [];
  const allPlayLines = note.playLines ?? [];
  const stats = playStats(allPlays, allPlayLines);
  // マークが存在するフェーズだけ（前半→後半→延長の順）でセクション分割
  const notePhases = PLAY_PHASES.filter(
    (p) => allPlays.some((pt) => markPhase(pt.phase) === p) || allPlayLines.some((l) => markPhase(l.phase) === p)
  );
  // シュート（plays配列順に1,2,3…を採番。ゴール正面図の打点ラベルと一覧の#Nを揃える）。
  // src は元の点への参照（プレーエリアの点を押したとき、同じ参照で shots を引くため）
  const shots = allPlays.filter((p) => p.kind === "shot").map((p, i) => ({ ...p, num: i + 1, src: p }));
  // notebook-staff-redesign §4: シュートの位置モーダル。開いているシュートの採番（未選択は null）
  const [shotView, setShotView] = useState<number | null>(null);
  const shotSel = shotView != null ? shots.find((s) => s.num === shotView) ?? null : null;
  return (
    <>
      <div className="notesec">
        <div className="notesec-h"><E n="vs" /> {note.opponent || "対戦相手"}</div>
        {(() => {
          if (note.halfMinutes == null && note.fullMatch == null) return null;
          const time = [
            note.halfMinutes != null ? `${note.halfMinutes}分ハーフ` : null,
            note.fullMatch === false
              ? note.playFrom != null && note.playTo != null
                ? `${note.playFrom}分〜${note.playTo}分に出場`
                : "途中出場"
              : "フル出場",
          ]
            .filter(Boolean)
            .join(" ・ ");
          return time ? <div className="notesec-b">{time}</div> : null;
        })()}
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
      {notePhases.map((p) => {
        const phasePts = allPlays.filter((pt) => markPhase(pt.phase) === p);
        const phaseLns = allPlayLines.filter((l) => markPhase(l.phase) === p);
        // そのフェーズでマークがあるピッチ番号ごとにセクションを分ける（旧データはcanvas未設定＝0番扱い）
        const canvases = Array.from(
          new Set([...phasePts.map((pt) => markCanvas(pt.canvas)), ...phaseLns.map((l) => markCanvas(l.canvas))])
        ).sort((a, b) => a - b);
        const multiCanvas = canvases.length > 1;
        return canvases.map((c) => {
          const pts = phasePts.filter((pt) => markCanvas(pt.canvas) === c);
          const lns = phaseLns.filter((l) => markCanvas(l.canvas) === c);
          return (
            <div key={`${p}-${c}`} className="notesec">
              <div className="notesec-h">
                プレーエリア（{MATCH_PHASE_LABEL[p]} ・ 点 {pts.length} ／ 軌道 {lns.length}）{multiCanvas ? `・ピッチ${c + 1}` : ""}
              </div>
              <PlayAreaPitch
                points={pts}
                lines={lns}
                onPointClick={(_, pt) => {
                  const hit = shots.find((s) => s.src === pt);
                  if (hit) setShotView(hit.num);
                }}
                selectedIndex={shotSel ? pts.indexOf(shotSel.src) : null}
              />
            </div>
          );
        });
      })}
      {shots.length > 0 && (
        <div className="notesec">
          <div className="notesec-h">シュート（{shots.length}本 ・ ゴール {stats.goals}）</div>
          <GoalCourseView shots={shots.filter((s) => s.course).map((s) => ({ course: s.course!, scored: s.scored, label: s.num }))} />
          <div className="shotlist">
            {shots.map((s) => (
              <button key={s.num} type="button" className="shotrow" onClick={() => setShotView(s.num)}>
                <span className={`shotmark${s.course ? (s.scored ? "" : " nogoal") : " none"}`} />
                <span>
                  #{s.num} {MATCH_PHASE_LABEL[markPhase(s.phase)]} ・ {s.course ? (s.scored ? "ゴール" : "ノーゴール") : "コース未記録"}
                </span>
                {s.shotNote && <small>{s.shotNote}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      {(allPlays.length > 0 || allPlayLines.length > 0) && (
        <div className="notesec">
          <div className="notesec-h">プレースタッツ（全フェーズ合算）</div>
          <PlayStatsRow stats={stats} />
        </div>
      )}

      {(note.bestPlay || note.reflectPlay || note.videoUrl) && (
        <div className="notesec">
          <div className="notesec-h">ベストプレー・反省</div>
          {note.bestPlay && <div className="notesec-b"><E n="star" /> ベスト：{note.bestPlay}</div>}
          {note.reflectPlay && <div className="notesec-b"><E n="repeat" /> 反省：{note.reflectPlay}</div>}
          {note.videoUrl && (
            <a className="videolink" href={note.videoUrl} target="_blank" rel="noreferrer"><E n="video" /> 動画を見る</a>
          )}
        </div>
      )}

      {shotSel && <ShotViewSheet shot={shotSel} onClose={() => setShotView(null)} />}
    </>
  );
}

function PracticeDetail({ note }: { note: PracticeNote }) {
  const board = useBoard();
  const menu = note.menuId
    ? board.deliverables.find((d): d is PracticeMenuDeliver => d.kind === "menu" && d.id === note.menuId)
    : undefined;
  return (
    <>
      {menu && (
        <div className="notesec">
          <div className="notesec-h">練習メニュー</div>
          <div className="menuview">
            <b>{menu.title}</b>
            {[menu.category ? `区分: ${menu.category}` : null, menu.desc || null].filter(Boolean).join("\n")}
          </div>
        </div>
      )}
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
    </>
  );
}

function SoloDetail({ note }: { note: SoloNote }) {
  return (
    <div className="notesec">
      <div className="notesec-h"><E n="run" /> 実施した種目</div>
      {note.items.map((it, i) => (
        <div key={i} className="notesec-b">・{SOLO_KIND_LABEL[it.kind]}：{it.value}</div>
      ))}
    </div>
  );
}
