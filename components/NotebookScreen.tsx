"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Point,
  PracticeMenuDeliver,
  PracticeNote,
  SoloItem,
  SoloKind,
  SoloNote,
  StaffReaction,
  TeamEvent,
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
import { useBoard, type KpiMetric } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E, ConditionIcon, type EmojiName } from "./Emoji";
import { FormationPitch, GoalCourseView, isInGoalFrame, PlayAreaPitch, type PlayTool } from "./MiniPitch";
import { LineChart, Sparkline } from "./Charts";
import { addDaysStr, countByDay, daysAgoStr, localDateStr, longestWeeklyStreak, weekStart, weeklyCounts, weeklyStreak } from "@/lib/dates";
import {
  clearNoteDraft,
  loadNoteDraft,
  loadNotifSeen,
  loadTeam,
  saveNoteDraft,
  saveNotifSeen,
} from "@/lib/storage";
import { attendanceRate } from "@/lib/teamStats";
import { deliverableTargetsPlayer } from "@/lib/groups";
import { buildEventNotifications, type NotifTarget } from "@/lib/notifications";
import { DeliverBlock, DeliverComposer, DeliverDetail } from "./DeliverViews";
import { AnalyticsPanel, CoachDashboard, NoteSearch, NotificationsView, notifIdentity } from "./NotebookTools";
import { KpiBody } from "./SheetManager";
import SeasonReport from "./SeasonReport";
import { useConsoleSubnav } from "./ConsoleShell";
import { MobileHeader } from "./MobileHeader";
import { MobileSegments } from "./MobileSegments";

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
/** ボトムナビのタブ。deliver=配信(コーチ) / report=シーズンレポート(選手) */
type Tab = "home" | "notes" | "deliver" | "notifs" | "report";

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
  | { mode: "deliverForm"; kind: DeliverKind; edit?: CoachDeliverable }
  | { mode: "deliverDetail"; id: string }
  | { mode: "search"; playerId?: string }
  | { mode: "report"; playerId: string }
  | { mode: "stats"; focus: "week" | "streak" | "total" };

export default function NotebookScreen() {
  const board = useBoard();
  const isCoach = board.auth.role === "coach";
  const [tab, setTab] = useState<Tab>("home");
  const [noteKind, setNoteKind] = useState<NoteKind | "all">(isCoach ? "all" : "practice");
  const [view, setView] = useState<View>({ mode: "root" });
  const [sheetOpen, setSheetOpen] = useState(false);
  // PCマスター・ディテール（コーチ×notes/deliver/notifsタブ）の右ペイン選択状態。
  // タブごとに1つ。View(mode)は変えず「選んでいるだけ」にすることで、左の一覧(.scroll)は
  // 従来どおり isRoot 判定のまま表示され続ける（=同時にマスター一覧としても機能する）
  const [selNote, setSelNote] = useState<string | null>(null);
  const [selDeliver, setSelDeliver] = useState<string | { create: DeliverKind } | null>(null);
  const [selNotif, setSelNotif] = useState<{ target: NotifTarget; notifId?: string } | null>(null);
  // PC: ホームのコーチ・ダッシュボードのサマリーカードから開いた内訳指標（右ペイン表示用）
  const [selKpi, setSelKpi] = useState<KpiMetric | null>(null);
  // PC×コーチのときだけ選択state経路を使う。それ以外(モバイル/選手)は従来のview遷移のまま
  const isPcCoach = () => isCoach && typeof window !== "undefined" && window.matchMedia(PC_MQ).matches;
  // 戻りラベル: 押下先がホームのとき、PCでは「‹ ホーム」に(モバイルの「‹ メニュー」は現状維持)
  const pc = usePc();

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
    setSelNote(null);
    setSelDeliver(null);
    setSelNotif(null);
    setSelKpi(null);
  };

  const navTarget = (t: NotifTarget, notifId?: string) => {
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
  const startWrite = (k: NoteKind) => {
    setSheetOpen(false);
    setView({ mode: "form", kind: k });
  };

  // 作成シート：今日の予定種別に応じて選択肢の並びとバッジを出し分け
  const todayEventKinds = new Set(
    (loadTeam()?.events ?? []).filter((e) => e.date === todayStr()).map((e) => e.kind)
  );
  const noteKindOrder: NoteKind[] = todayEventKinds.has("match")
    ? ["match", "practice", "solo"]
    : todayEventKinds.has("practice")
      ? ["practice", "match", "solo"]
      : ["match", "practice", "solo"];

  const navItems: { t: Tab; icon: Parameters<typeof E>[0]["n"]; label: string; badge?: number }[] = isCoach
    ? [
        { t: "home", icon: "chart", label: "ホーム" },
        { t: "notes", icon: "note", label: "提出" },
        { t: "deliver", icon: "megaphone", label: "配信" },
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
      items: navItems.filter((it) => it.t !== "notifs").map((it) => ({
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
    <div className={"app noteapp" + (isCoach ? " coachapp" : "")}>
      {pc ? (
        <header>
          {(!isRoot || tab === "home") && (
            <div
              className="fpback"
              onClick={() => (isRoot ? board.setScreen("home") : setView({ mode: "root" }))}
            >
              ‹ {isRoot ? "ホーム" : "戻る"}
            </div>
          )}
          <div className="brand" style={{ marginLeft: 4 }}>
            <div className="logo">
              サッカー<b>ノート</b>
            </div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {isCoach ? "提出された振り返り" : `${board.auth.name} さん`}
            </div>
          </div>
          {isRoot && (
            <>
              <button
                className="hdrcta"
                onClick={() => (isCoach ? switchTab("deliver") : setSheetOpen(true))}
              >
                {isCoach ? "＋ 配信" : "＋ ノートを作成"}
              </button>
              {/* 通知ベル(PC専用・モバイルは基底CSSで非表示)。未読があれば赤バッジで件数を出す */}
              <button
                className={"hdrbell" + (tab === "notifs" ? " on" : "")}
                type="button"
                title="通知"
                aria-label={unread > 0 ? `通知（未読${unread}件）` : "通知"}
                onClick={() => switchTab("notifs")}
              >
                <E n="bell" />
                {unread > 0 && <span className="hdrbellbadge">{unread > 9 ? "9+" : unread}</span>}
              </button>
              <span className="hdrusr">
                {board.auth.name}
                {isCoach ? " ・ 管理者" : ""}
              </span>
            </>
          )}
        </header>
      ) : (
        <>
          {/* mobile-redesign §1-6/§1-7: 共通ヘッダー＋ヘッダー直下セグメント。
              「‹ メニュー」(=アプリホームへ戻る)は下部タブの「ホーム」で代替できるため、
              モバイルの戻るはisRoot=falseの詳細/フォーム画面でのみ出す */}
          <MobileHeader
            title="サッカーノート"
            onBack={isRoot ? undefined : () => setView({ mode: "root" })}
          />
          {isRoot && (
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

      {isRoot && tab === "notes" && (
        <div className="fbar">
          {([...(isCoach ? (["all"] as const) : []), "match", "practice", "solo"] as (NoteKind | "all")[]).map((k) => (
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

      <div className="scroll">
        {isRoot && tab === "home" && (
          isCoach ? (
            <>
              <CoachDashboard
                onOpenPlayer={(playerId) => setView({ mode: "search", playerId })}
                onReport={(playerId) => setView({ mode: "report", playerId })}
                onOpenNote={(id) => setView({ mode: "detail", id })}
                onOpenKpi={(metric) => setSelKpi(metric)}
              />
              {/* KPI内訳: .nbmain(コーチ×notes/deliver/notifsの3ペイン専用)は使わず、
                  homeタブの内容としてCoachDashboard直下にインライン展開する */}
              {selKpi && (
                <div className="nb-kpiinline">
                  {/* tmback風(青リンク)の戻りリンク。.tmbackは.teamapp限定スコープのため
                      同じ見た目をインラインstyleで再現する */}
                  <button
                    type="button"
                    onClick={() => setSelKpi(null)}
                    style={{
                      display: "inline-block",
                      background: "none",
                      border: 0,
                      padding: 0,
                      marginBottom: 10,
                      color: "var(--accent)",
                      fontSize: "var(--fs-body-s)",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ‹ 閉じる
                  </button>
                  <KpiBody metric={selKpi} />
                </div>
              )}
            </>
          ) : (
            <PlayerHome
              onOpenNote={(id) => setView({ mode: "detail", id })}
              onOpenDeliver={(id) => setView({ mode: "deliverDetail", id })}
              onOpenStats={(focus) => setView({ mode: "stats", focus })}
            />
          )
        )}
        {isRoot && tab === "notes" && (
          <NoteList
            kind={noteKind}
            isCoach={isCoach}
            onWrite={(k) => startWrite(k)}
            onOpen={(id) => (isPcCoach() ? setSelNote(id) : setView({ mode: "detail", id }))}
            onSearch={() => setView({ mode: "search" })}
            selectedId={selNote}
          />
        )}
        {isRoot && tab === "deliver" && isCoach && (
          <div className="notetools">
            <h2><E n="megaphone" /> 配信</h2>
            <DeliverBlock
              kinds={["menu", "assignment", "meeting", "setpiece"]}
              heading={null}
              onOpen={(id) => {
                if (!isPcCoach()) {
                  setView({ mode: "deliverDetail", id });
                  return;
                }
                // 作成フォームは下書き保存が無い。1クリックで無警告に消さない
                if (
                  selDeliver != null &&
                  typeof selDeliver !== "string" &&
                  !window.confirm("作成中の配信を破棄して、この配信を開きますか？")
                ) {
                  return;
                }
                setSelDeliver(id);
              }}
              onCreate={(k) => (isPcCoach() ? setSelDeliver({ create: k }) : setView({ mode: "deliverForm", kind: k }))}
              selectedId={typeof selDeliver === "string" ? selDeliver : null}
            />
          </div>
        )}
        {isRoot && tab === "notifs" && (
          <NotificationsView
            seenAt={viewSeenAt}
            onNavigate={navTarget}
            selectedKey={selNotif?.notifId ?? null}
          />
        )}
        {isRoot && tab === "report" && !isCoach && board.auth.playerId && (
          <SeasonReport playerId={board.auth.playerId} />
        )}

        {view.mode === "form" && (
          <NoteForm kind={view.kind} edit={view.edit} initialMenuId={view.menuId} onDone={() => setView({ mode: "root" })} />
        )}
        {view.mode === "detail" && (
          <NoteDetail
            id={view.id}
            isCoach={isCoach}
            onEdit={(e) => setView({ mode: "form", kind: e.kind, edit: e })}
            onDeleted={() => setView({ mode: "root" })}
          />
        )}
        {view.mode === "deliverForm" && (
          <DeliverComposer kind={view.kind} edit={view.edit} onDone={() => setView({ mode: "root" })} />
        )}
        {view.mode === "deliverDetail" && (
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
        {view.mode === "stats" && !isCoach && (
          <PlayerStats focus={view.focus} onOpenNote={(id) => setView({ mode: "detail", id })} />
        )}
      </div>

      {/* PC専用の第2ペイン(詳細)。コーチ×notes/deliver/notifsタブでのみマウントする
          (KPI内訳はhomeタブのCoachDashboard直下へインライン展開したためここでは扱わない)。
          view は root のまま進めるため、上の.scroll側の一覧(NoteList/DeliverBlock/NotificationsView)は
          そのままマスター一覧として表示され続ける(モバイル・選手側は selNote 等が常にnullで従来どおり) */}
      {isCoach && isRoot && (tab === "notes" || tab === "deliver" || tab === "notifs") && (
        <div className="nbmain">
          {tab === "notes" &&
            (selNote ? (
              <NoteDetail
                id={selNote}
                key={selNote}
                isCoach={isCoach}
                onEdit={(e) => setView({ mode: "form", kind: e.kind, edit: e })}
                onDeleted={() => setSelNote(null)}
              />
            ) : (
              <div className="nbempty">
                <b>提出を選択してください</b>
                <br />
                左の一覧から開くと内容が表示されます
              </div>
            ))}
          {tab === "deliver" &&
            (selDeliver == null ? (
              <div className="nbempty">
                <b>配信が選択されていません</b>
                <br />
                左の一覧から開くか、＋から新規作成できます
              </div>
            ) : typeof selDeliver === "string" ? (
              <DeliverDetail id={selDeliver} key={selDeliver} onBack={() => setSelDeliver(null)} />
            ) : (
              // keyで種別切替時に必ず作り直す(無いと前の種別で入力したタイトル等が残る)
              <DeliverComposer
                key={`new:${selDeliver.create}`}
                kind={selDeliver.create}
                onDone={() => setSelDeliver(null)}
              />
            ))}
          {tab === "notifs" &&
            (selNotif == null ? (
              <div className="nbempty">
                <b>通知が選択されていません</b>
                <br />
                左の一覧から開くと詳細が表示されます
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
              <DeliverDetail
                id={selNotif.target.id}
                key={`deliver:${selNotif.target.id}`}
                onBack={() => setSelNotif(null)}
              />
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

      {sheetOpen && (
        <div className="wsheetback" onClick={() => setSheetOpen(false)}>
          <div className="wsheet" onClick={(e) => e.stopPropagation()}>
            <div className="wsheet-h">作成するノートを選択</div>
            {noteKindOrder.map((k) => (
              <button key={k} className="wsheetopt" onClick={() => startWrite(k)}>
                <span className="wsheetic">
                  <E n={k === "match" ? "vs" : k === "practice" ? "ball" : "run"} />
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
                        ? "目標の達成度と気づきを記録"
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
function PlayerHome({
  onOpenNote,
  onOpenDeliver,
  onOpenStats,
}: {
  onOpenNote: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onOpenStats: (focus: "week" | "streak" | "total") => void;
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
  // 前週比デルタ用：weekStart(today) の1週前の週に属するノート数
  const lastWeekCount = useMemo(() => {
    const lastMonday = addDaysStr(weekStart(today), -7);
    return myNotes.filter((n) => weekStart(n.date) === lastMonday).length;
  }, [myNotes, today]);
  const weekNoteDiff = thisWeekCount - lastWeekCount;
  const weekDots = useMemo(() => {
    const monday = weekStart(today);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysStr(monday, i);
      return { date, count: myNotes.filter((n) => n.date === date).length };
    });
  }, [myNotes, today]);
  const commented = useMemo(
    () =>
      myNotes
        .filter((n) => n.staffComment)
        .sort((a, b) => (b.staffCommentTs ?? b.ts) - (a.staffCommentTs ?? a.ts))
        .slice(0, 2),
    [myNotes]
  );
  const weeklyChart = useMemo(() => weeklyCounts(myNotes.map((n) => n.date)), [myNotes]);
  const weekSparkline = useMemo(() => weeklyChart.map((w) => w.value), [weeklyChart]);
  const totalSparkline = useMemo(() => {
    let acc = 0;
    return weeklyChart.map((w) => {
      acc += w.value;
      return acc;
    });
  }, [weeklyChart]);

  // 直近8週の起点（月曜）。シュート決定率・達成度週平均・バイタルの集計に共通で使う
  const windowStart8 = useMemo(() => addDaysStr(weekStart(today), -7 * 7), [today]);

  // KPI: シュート決定率（直近8週の ゴール数/シュート数）
  const myMatchNotes = useMemo(
    () => myNotes.filter((n): n is MatchNote => n.kind === "match"),
    [myNotes]
  );
  const shotRate8 = useMemo(() => {
    let shots = 0;
    let goals = 0;
    myMatchNotes
      .filter((n) => n.date >= windowStart8)
      .forEach((n) =>
        (n.plays ?? []).forEach((p) => {
          if (p.kind !== "shot") return;
          shots++;
          if (p.scored === true) goals++;
        })
      );
    return shots > 0 ? Math.round((goals / shots) * 100) : null;
  }, [myMatchNotes, windowStart8]);

  // KPI・バイタル: 達成度（直近8週。記録がある週だけの週平均を平均）
  const practiceAchievements = useMemo(
    () => myNotes.filter((n): n is PracticeNote => n.kind === "practice" && typeof n.achievement === "number"),
    [myNotes]
  );
  const achieveAvg8 = useMemo(() => {
    const thisMonday = weekStart(today);
    const weeklyAvgs: number[] = [];
    for (let k = 0; k < 8; k++) {
      const monday = addDaysStr(thisMonday, -7 * (7 - k));
      const vals = practiceAchievements
        .filter((n) => weekStart(n.date) === monday)
        .map((n) => n.achievement as number);
      if (vals.length) weeklyAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return weeklyAvgs.length ? Math.round(weeklyAvgs.reduce((a, b) => a + b, 0) / weeklyAvgs.length) : null;
  }, [practiceAchievements, today]);

  // バイタル: 調子（直近10件の condition 分布）
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

  // バイタル: 出席率（データが無ければ行を出さない）
  const attendance = useMemo(
    () => attendanceRate(loadTeam(), me, board.state.players),
    [me, board.notebook, board.state.players]
  );

  // 曜日タップの展開状態（モーダルではなくインラインで開閉する）
  const [openDay, setOpenDay] = useState<string | null>(null);

  return (
    <div className="notehome">
      <div className="homedate">{fmt(today)}</div>

      <div className="homecta">
        {wroteToday ? (
          <>
            <div className="homecta-done"><E n="check" /> 今日のノートは記入済み</div>
            {wStreak > 0 && (
              <div className="homecta-streak"><E n="fire" /> {wStreak}週連続で記録中</div>
            )}
          </>
        ) : (
          <>
            <div className="homecta-msg">今日のノートはまだ未記入</div>
            {wStreak > 0 && (
              <div className="homecta-streak"><E n="fire" /> {wStreak}週連続 ・ 今週 {thisWeekCount}件</div>
            )}
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

      <div className="homecol side">
        <div className="dashsum">
          <button type="button" className="dashbox" onClick={() => onOpenStats("week")}>
            <div className="dbv">{thisWeekCount}</div>
            <div className="dbl">今週のノート</div>
            <div className={"dbd " + (weekNoteDiff > 0 ? "up" : weekNoteDiff < 0 ? "down" : "flat")}>
              {/* mobile-redesign Phase D-1(minor §8-4 #22): EM DASHを使わない */}
              {weekNoteDiff > 0 ? `↗ 先週 +${weekNoteDiff}` : weekNoteDiff < 0 ? `↘ 先週 ${weekNoteDiff}` : "先週と同じ"}
            </div>
            <Sparkline values={weekSparkline} />
          </button>
          {/* mobile-redesign Phase D-1(minor §8-3 #16/§8-4 #22): 値が無い(記録が無く「—」表示になる)
              タイルは表示自体を落とす（ダッシュ文字を使わないため） */}
          {shotRate8 != null && (
            <div className="dashbox" style={{ cursor: "default" }}>
              <div className="dbv">{shotRate8}%</div>
              <div className="dbl">シュート決定率</div>
            </div>
          )}
          {achieveAvg8 != null && (
            <div className="dashbox" style={{ cursor: "default" }}>
              <div className="dbv">{achieveAvg8}%</div>
              <div className="dbl">達成度(週平均)</div>
            </div>
          )}
          <button type="button" className="dashbox" onClick={() => onOpenStats("total")}>
            <div className="dbv">{myNotes.length}</div>
            <div className="dbl">これまでの合計</div>
            <Sparkline values={totalSparkline} />
          </button>
        </div>

        <div className="vitals">
          <div className="notesec-h" style={{ margin: "0 0 8px" }}>コンディション（直近10回）</div>
          <div className="vrow">
            <span>調子</span>
            <span className="vbar">
              <i style={{ width: `${conditionMix.good}%`, background: "#10a15c" }} />
              <i style={{ width: `${conditionMix.normal}%`, background: "#f59e0b" }} />
              <i style={{ width: `${conditionMix.bad}%`, background: "#ef4444" }} />
            </span>
          </div>
          <div className="vrow">
            <span>達成度</span>
            <span className="vbar">
              <i style={{ width: `${achieveAvg8 ?? 0}%`, background: "#10a15c" }} />
            </span>
          </div>
          {attendance.total > 0 && (
            <div className="vrow">
              <span>出席</span>
              <span className="vbar">
                <i style={{ width: `${attendance.pct}%`, background: "#10a15c" }} />
                <i style={{ width: `${100 - attendance.pct}%`, background: "#ef4444" }} />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="homecol main">
        <AnalyticsPanel mode="player" />

        {commented.length > 0 && (
          <>
            <div className="homesec-h"><E n="comment" /> スタッフからコメントが届いています</div>
            <div className="notecards">
              {commented.map((n) => (
                <NoteCard key={n.id} entry={n} onClick={() => onOpenNote(n.id)} />
              ))}
            </div>
          </>
        )}

        <DeliverBlock
          kinds={["menu", "assignment", "meeting", "setpiece"]}
          onOpen={onOpenDeliver}
          onCreate={() => {}}
        />
      </div>
    </div>
  );
}

/* ===================== 記録の分析（選手） ===================== */
function PlayerStats({
  focus,
  onOpenNote,
}: {
  focus: "week" | "streak" | "total";
  onOpenNote: (id: string) => void;
}) {
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

  const kindBreakdown = (
    <>
      {(["match", "practice", "solo"] as NoteKind[]).map((k) => (
        <div key={k} className="statrow">
          <span className="srl">{NOTE_KIND_LABEL[k]}</span>
          <span className="srb">
            <span style={{ width: kindTotal ? `${(kindCounts[k] / kindTotal) * 100}%` : "0%" }} />
          </span>
          <span className="srv">{kindCounts[k]}</span>
        </div>
      ))}
    </>
  );

  const sections: { key: "week" | "streak" | "total"; node: React.ReactNode }[] = [
    {
      key: "week",
      node: (
        <div className="notesec" key="week">
          <div className="notesec-h">週別の記録数（8週）</div>
          <LineChart data={weeklyChart} detailed />
          <div className="notesec-h" style={{ marginTop: 14 }}>種類別の内訳</div>
          {kindBreakdown}
        </div>
      ),
    },
    {
      key: "streak",
      node: (
        <div className="notesec" key="streak">
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
      ),
    },
    {
      key: "total",
      node: (
        <div className="notesec" key="total">
          <div className="notesec-h">これまでの合計</div>
          <div className="statbig" style={{ marginBottom: 10 }}>
            {myNotes.length}
            <small>冊</small>
          </div>
          {kindBreakdown}
          {oldestDate && <div className="evnote" style={{ marginTop: 6 }}>最初の記録：{fmt(oldestDate)}</div>}
        </div>
      ),
    },
  ];
  const ordered = [sections.find((s) => s.key === focus)!, ...sections.filter((s) => s.key !== focus)];

  return (
    <div className="notetools">
      <h2>記録の分析</h2>
      {ordered.map((s) => s.node)}
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

/* ===================== 一覧 ===================== */

/** 予定別ビューの「予定に紐づかない提出」グループのキー。TeamEvent.id と衝突しない値にする */
const UNLINKED_KEY = "@unlinked";

/**
 * ノートがその予定に属するか。
 * (a) eventId を持つ練習ノートは明示紐づけのみで判定する（同日の別予定への二重掲載を防ぐ）
 * (b) それ以外は 日付範囲(date〜endDate) ＋ 種別対応(練習予定→練習ノート/試合予定→試合ノート)
 * 自主練ノートはどの予定にも入れない。
 */
function noteBelongsToEvent(n: NotebookEntry, ev: TeamEvent): boolean {
  if (n.kind === "practice" && (n as PracticeNote).eventId) return (n as PracticeNote).eventId === ev.id;
  if (n.kind === "solo") return false;
  if (n.kind !== (ev.kind === "match" ? "match" : "practice")) return false;
  return n.date >= ev.date && n.date <= (ev.endDate ?? ev.date);
}

function NoteList({
  kind,
  isCoach,
  onWrite,
  onOpen,
  onSearch,
  selectedId,
}: {
  kind: NoteKind | "all";
  isCoach: boolean;
  onWrite: (kind: NoteKind) => void;
  onOpen: (id: string) => void;
  onSearch: () => void;
  /** PCマスター・ディテールで選択中のノートID。未指定なら選択表示なし（選手側の呼び出しに影響しない） */
  selectedId?: string | null;
}) {
  const board = useBoard();
  const me = board.auth.playerId;
  // 練習ノートは「自分 / チーム共有」を切替（⑪）
  const [scope, setScope] = useState<"mine" | "team">("mine");

  const entries = useMemo(() => {
    let list = kind === "all" ? board.notebook : board.notebook.filter((n) => n.kind === kind);
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
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // 予定はlocalStorage直読み（作成シートの todayEventKinds と同じ作法）。
  // 予定別へ切り替えるたびに読み直すので、他画面での予定編集も反映される
  const events = useMemo(() => {
    if (listView !== "byEvent") return [];
    const today = todayStr();
    return (loadTeam()?.events ?? [])
      .filter((e) => e.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
  }, [listView]);

  // グループ分けは種別チップ(fbar)で絞り込んだ後の entries に対して行う（バッジ件数もフィルタ後の数）
  const grouped = useMemo(() => {
    const used = new Set<string>();
    const list = events.map((ev) => {
      const notes = entries.filter((n) => noteBelongsToEvent(n, ev));
      notes.forEach((n) => used.add(n.id));
      return { ev, notes };
    });
    return { list, unlinked: entries.filter((n) => !used.has(n.id)) };
  }, [events, entries]);

  // フラット/予定別で同じカード表示（選択ハイライト・開き方の分岐も共通）
  const renderCard = (n: NotebookEntry) => (
    <NoteCard
      key={n.id}
      entry={n}
      who={isCoach || (kind === "practice" && scope === "team") ? nameOf(n.playerId) : undefined}
      showKind={kind === "all"}
      selected={selectedId != null && n.id === selectedId}
      onClick={() => onOpen(n.id)}
    />
  );

  const groupRow = (key: string, label: React.ReactNode, count: number, body: React.ReactNode) => {
    const open = expanded.has(key);
    return (
      <Fragment key={key}>
        <button
          type="button"
          className={`evgrow${open ? " on" : ""}`}
          aria-expanded={open}
          onClick={() => toggleGroup(key)}
        >
          {label}
          <span className="evgrowcount">{count}件</span>
          <span className="evgrowchev">›</span>
        </button>
        {open && <div className="evgnotes">{body}</div>}
      </Fragment>
    );
  };

  return (
    <>
      <button className="searchbar" onClick={onSearch}>
        <E n="search" /> 気づき・目標・相手名などで検索
      </button>

      <div className="ngbar">
        <button
          type="button"
          className={`ngchip${listView === "flat" ? " on" : ""}`}
          onClick={() => setListView("flat")}
        >
          提出一覧
        </button>
        <button
          type="button"
          className={`ngchip${listView === "byEvent" ? " on" : ""}`}
          onClick={() => setListView("byEvent")}
        >
          予定別
        </button>
      </div>

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
              "まだ提出がありません。"
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
              カレンダーに今日までの予定がありません。
            </div>
          )}
          {grouped.list.map(({ ev, notes }) =>
            groupRow(
              ev.id,
              <>
                <span className="evgrowdate">{fmt(ev.date)}</span>
                <span className={`evgrowkind ${ev.kind}`}>{NOTE_KIND_LABEL[ev.kind]}</span>
                <span className="evgrowtitle">{ev.title || NOTE_KIND_LABEL[ev.kind]}</span>
              </>,
              notes.length,
              notes.length === 0 ? (
                <div className="evnote">この予定の提出はありません。</div>
              ) : (
                <div className="notecards">{notes.map(renderCard)}</div>
              )
            )
          )}
          {/* 自主練・予定の日付範囲外の提出は常設グループにまとめる（予定が0件でも出す） */}
          {groupRow(
            UNLINKED_KEY,
            <span className="evgrowtitle">予定に紐づかない提出</span>,
            grouped.unlinked.length,
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
  onClick,
}: {
  entry: NotebookEntry;
  who?: string;
  showKind?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`notecard${selected ? " sel" : ""}`} onClick={onClick}>
      <div className="notecond">{entry.condition ? <ConditionIcon c={entry.condition} /> : NOTE_KIND_LABEL[entry.kind].slice(0, 1)}</div>
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
            <span style={{ color: "var(--primary-dim)", fontSize: 14 }}>
              <E n={REACTION_ICON[entry.staffReaction]} />
            </span>
          )}
          {entry.staffComment ? <span className="notetag done">コメント済</span> : who ? <span className="notetag">未読</span> : null}
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
            今日のメニューを自動で選択しています（タップで解除できます）
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  if (!entry) return <div className="empty-msg">ノートが見つかりません。</div>;
  const who = board.state.players.find((p) => p.id === entry.playerId)?.name ?? "選手";
  const mine = !isCoach && entry.playerId === board.auth.playerId;

  const sendComment = () => {
    board.setNoteComment(
      entry.id,
      comment,
      drawPlays.length > 0 || drawLines.length > 0 ? { plays: drawPlays, playLines: drawLines } : undefined
    );
  };

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
          <div className="reactrow">
            {STAFF_REACTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`reactbtn${entry.staffReaction === r ? " on" : ""}`}
                onClick={() => board.patchNote(entry.id, { staffReaction: entry.staffReaction === r ? undefined : r })}
              >
                <E n={REACTION_ICON[r]} /> {STAFF_REACTION_LABEL[r]}
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="選手へフィードバックを送る" />

          {!drawOpen ? (
            <button type="button" className="dynadd" onClick={() => setDrawOpen(true)}>
              ＋ ピッチに描いて伝える
            </button>
          ) : (
            <div className="detailwrap" style={{ marginTop: 10 }}>
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
          )}

          <button className="bigbtn" style={{ marginTop: 8 }} onClick={sendComment}>
            コメントを送る
          </button>
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
  // シュート（plays配列順に1,2,3…を採番。ゴール正面図の打点ラベルと一覧の#Nを揃える）
  const shots = allPlays.filter((p) => p.kind === "shot").map((p, i) => ({ ...p, num: i + 1 }));
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
              <PlayAreaPitch points={pts} lines={lns} />
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
              <div key={s.num} className="shotrow">
                <span className={`shotmark${s.course ? (s.scored ? "" : " nogoal") : " none"}`} />
                <span>
                  #{s.num} {MATCH_PHASE_LABEL[markPhase(s.phase)]} ・ {s.course ? (s.scored ? "ゴール" : "ノーゴール") : "コース未記録"}
                </span>
                {s.shotNote && <small>{s.shotNote}</small>}
              </div>
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
      {note.isPublic && <div className="notetag share" style={{ display: "inline-block" }}>チームに共有中</div>}
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
