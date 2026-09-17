"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AttendanceStatus,
  Competition,
  EventCategory,
  FitnessRecord,
  FitnessTest,
  MatchRecord,
  RecurrenceRule,
  SchoolStage,
  TeamData,
  TeamEvent,
  TeamEventKind,
  TeamGroup,
  TeamViewer,
  ViewerRole,
} from "@/lib/types";
import { gradeLabel, STAGE_GRADES } from "@/lib/types";
import {
  loadTeam,
  loadViewer,
  saveTeam,
  saveViewer,
} from "@/lib/storage";
import { addDaysStr, localDateStr } from "@/lib/dates";
import {
  DEFAULT_FITNESS_TESTS,
  SAMPLE_CUSTOM_GROUPS,
  SAMPLE_GROUP_A_ID,
  SAMPLE_PLAYERS,
} from "@/lib/sampleTeam";
import {
  addDays,
  BUILTIN_CATEGORIES,
  diffDays,
  expandRule,
} from "@/lib/calendarUtils";
import { ensureGradeGroups, eventTargetPlayers, gradeGroupsFor, membersOf } from "@/lib/groups";
import { useBoard } from "./BoardProvider";

let seq = 0;
function nid(p: string) {
  seq += 1;
  return `${p}_${Date.now().toString(36)}_${seq}`;
}

/** 学校区分の表示名（setSchoolStageの確認ダイアログ用。設定画面のselectの選択肢と揃える） */
const STAGE_NAME: Record<SchoolStage, string> = {
  elementary: "小学生",
  junior: "中学生",
  high: "高校生",
};

/**
 * デモ用の出欠シード（大半が「出席」・空っぽ状態を避ける。unanswered は未回答のまま残す）。
 * targetIds は出欠エントリを生成する母集団（groups-everywhere §4: グループ対象の予定は
 * 対象外の選手にダミーの出欠が付かないよう、呼び出し側でその予定の対象選手だけに絞って渡す）。
 */
function sampleAttendance(
  targetIds: string[],
  overrides: Record<string, AttendanceStatus>,
  comments: Record<string, string> = {},
  unanswered: string[] = []
): Record<string, { status: AttendanceStatus; comment?: string }> {
  const rec: Record<string, { status: AttendanceStatus; comment?: string }> = {};
  targetIds.forEach((id) => {
    if (unanswered.includes(id)) return;
    rec[id] = { status: overrides[id] ?? "yes", comment: comments[id] };
  });
  return rec;
}

function sampleTeam(): TeamData {
  // ノートのカレンダー連動デモに合わせ「今日=練習日」を含める（localDateStr=ローカル日付でUTCズレなし）
  const today = localDateStr();
  // グループ対象のサンプル予定の分母計算用（学年グループの雛形＋カスタムグループ）
  const sampleGroups: TeamGroup[] = [...gradeGroupsFor("junior", []), ...SAMPLE_CUSTOM_GROUPS];
  const allPlayerIds = SAMPLE_PLAYERS.map((p) => p.id);
  const teamAIds = membersOf(SAMPLE_GROUP_A_ID, SAMPLE_PLAYERS, sampleGroups).map((p) => p.id);
  return {
    events: [
      {
        id: "ev_practice_pastA",
        kind: "practice",
        title: "全体練習",
        date: addDaysStr(today, -28),
        time: "17:00",
        endTime: "18:45",
        place: "市民グラウンド",
      },
      {
        id: "ev_practice_pastB",
        kind: "practice",
        title: "全体練習",
        date: addDaysStr(today, -14),
        time: "17:15",
        endTime: "19:00",
        place: "市民グラウンド",
        note: "新戦術の確認",
      },
      {
        id: "ev_practice_today",
        kind: "practice",
        title: "全体練習",
        date: today,
        time: "17:00",
        endTime: "19:00",
        place: "市民グラウンド",
        note: "ビブス忘れずに",
      },
      {
        id: "ev_match_next",
        kind: "match",
        title: "練習試合 vs 青空FC",
        date: addDaysStr(today, 2),
        time: "9:15",
        endTime: "12:00",
        place: "青空G",
        competitionId: "cmp2",
        groupIds: ["grp_a"],
      },
      {
        id: "ev_practice_next",
        kind: "practice",
        title: "全体練習",
        date: addDaysStr(today, 4),
        time: "17:00",
        endTime: "19:00",
        place: "市民グラウンド",
      },
      // groups-everywhere §2: 学年グループ対象の練習（週2回のうち1件ずつ）
      {
        id: "ev_practice_g3",
        kind: "practice",
        title: "中3 練習",
        date: addDaysStr(today, 1),
        time: "17:00",
        endTime: "18:30",
        place: "市民グラウンド",
        groupIds: ["grp_grade_3"],
      },
      {
        id: "ev_practice_g2",
        kind: "practice",
        title: "中2 練習",
        date: addDaysStr(today, 1),
        time: "18:30",
        endTime: "20:00",
        place: "市民グラウンド",
        groupIds: ["grp_grade_2"],
      },
      {
        id: "ev_practice_g1",
        kind: "practice",
        title: "中1 練習",
        date: addDaysStr(today, 3),
        time: "17:00",
        endTime: "18:30",
        place: "市民グラウンド",
        groupIds: ["grp_grade_1"],
      },
      {
        id: "ev_practice_camp",
        kind: "practice",
        categoryId: "cat_camp",
        title: "夏合宿（河口湖）",
        date: addDaysStr(today, 20),
        endDate: addDaysStr(today, 22),
        allDay: true,
        place: "河口湖スポーツセンター",
        address: "山梨県南都留郡富士河口湖町船津6663",
        note: "詳細は後日配布",
      },
      {
        id: "ev_practice_meeting",
        kind: "practice",
        categoryId: "cat_meet",
        title: "保護者会",
        date: addDaysStr(today, 9),
        time: "19:00",
        endTime: "20:00",
        place: "公民館 会議室A",
        // 保護者会は全員対象（groups-everywhere §2）。学年/A・B/GKに限定しない
      },
    ],
    attendance: {
      // 全体練習は全員対象なので全選手ぶんの出欠を生成する
      ev_practice_pastA: sampleAttendance(
        allPlayerIds,
        { p09: "maybe", p14: "maybe", p04: "no", p12: "no" },
        {},
        ["p07"]
      ),
      ev_practice_pastB: sampleAttendance(
        allPlayerIds,
        { p11: "maybe", p06: "no" },
        {},
        ["p02"]
      ),
      ev_practice_today: sampleAttendance(
        allPlayerIds,
        { p13: "maybe", p05: "no" },
        { p05: "怪我のためお休みします" },
        ["p16"]
      ),
      // 練習試合はAチーム対象なので、出欠もAチームのメンバーだけに生成する
      // （groups-everywhere §4: 対象外の選手にダミーの出欠を付けない）
      ev_match_next: sampleAttendance(
        teamAIds,
        { p03: "maybe", p10: "no" },
        { p10: "所用のため参加できません" },
        ["p07", "p09"] // 未回答のまま（催促UIのデモ用）
      ),
      // ev_practice_camp / ev_practice_meeting / ev_practice_g1・g2・g3 は
      // 未回答のまま（未回答デモを兼ねる）
    },
    announcements: [
      {
        id: "a1",
        ts: Date.now() - 3600_000,
        text: "今週末は練習試合です。集合8時45分・忘れ物に注意！",
      },
    ],
    coaches: ["監督 岡本", "スタッフ 藤田"],
    categories: [
      { id: "cat_camp", label: "遠征・合宿", color: "#0f766e" },
      // Phase D-1(C3 minor review・見送り): #7c5cbf(色相259.4°)はv1 §8-1-2の禁止帯
      // (250〜280)に近接し、指摘は正しい。しかしこの色は cat.color としてPC/モバイル
      // 双方でそのままインライン背景に使われる共有データ(カレンダーの月表示ドット・
      // リスト表示のバー・予定詳細ピル等)のため、ここを直すとPCの表示色も変わってしまい
      // (pc_baselineで実測: チーム運営.png の9/22保護者会バーに差分)、「PCの見た目を
      // 変えない」という優先度がより高い制約と衝突する。CSS側だけで打ち消す手段も
      // (特定hex一色だけをフィルタするのは不自然/脆い)無いため、Phase Dの範囲では見送り、
      // 元の色のまま据え置く。是正するならPC側の表示差分を許容する別タスクとして扱う
      { id: "cat_meet", label: "保護者会", color: "#7c5cbf" },
    ],
    // 学年グループ（中1/中2/中3）はTeamProvider初期化時のensureGradeGroupsで自動追加される
    // （groups-everywhere §1）ため、ここではカスタムグループのみ持たせる
    groups: [...SAMPLE_CUSTOM_GROUPS],
    schoolStage: "junior",
    competitions: [
      { id: "cmp1", name: "春季リーグ U-12", note: "4〜6月・市内リーグ" },
      { id: "cmp2", name: "練習試合", note: "" },
    ],
    fitnessTests: DEFAULT_FITNESS_TESTS,
    matches: [
      {
        id: "m1",
        date: addDaysStr(today, -116),
        opponent: "みどり台SC",
        competitionId: "cmp1",
        ourScore: 3,
        theirScore: 1,
        formation: "3-3-1",
        lineup: [
          { pos: "GK", playerId: "p01" },
          { pos: "DF1", playerId: "p02" },
          { pos: "DF2", playerId: "p04" },
          { pos: "DF3", playerId: "p16" },
          { pos: "MF1", playerId: "p06" },
          { pos: "MF2", playerId: "p08" },
          { pos: "MF3", playerId: "p09" },
          { pos: "FW1", playerId: "p10" },
        ],
        periods: 2,
        halfMinutes: 20,
        goals: [
          { playerId: "p10", minute: 12, origin: "open" },
          { playerId: "p09", minute: 27, assistPlayerId: "p08", origin: "counter" },
          { playerId: "p10", minute: 39, origin: "open" },
        ],
        subs: [{ outPlayerId: "p09", inPlayerId: "p15", minute: 33 }],
        conceded: [{ minute: 19, origin: "set" }],
        note: "序盤から主導権を握れた。左右のワイドが起点になった。",
      },
      {
        id: "m2",
        date: addDaysStr(today, -95),
        opponent: "白鷺FC",
        competitionId: "cmp1",
        ourScore: 1,
        theirScore: 2,
        formation: "3-2-2",
        lineup: [
          { pos: "GK", playerId: "p01" },
          { pos: "DF1", playerId: "p02" },
          { pos: "DF2", playerId: "p04" },
          { pos: "DF3", playerId: "p05" },
          { pos: "MF1", playerId: "p06" },
          { pos: "MF2", playerId: "p07" },
          { pos: "FW1", playerId: "p08" },
          { pos: "FW2", playerId: "p11" },
        ],
        periods: 2,
        halfMinutes: 20,
        goals: [{ playerId: "p08", minute: 41, assistPlayerId: "p06", origin: "set" }],
        subs: [{ outPlayerId: "p07", inPlayerId: "p14", minute: 30 }],
        conceded: [
          { minute: 15, origin: "open" },
          { minute: 44, origin: "counter" },
        ],
        note: "後半に運動量が落ち、終盤の失点が響いた。",
      },
      {
        id: "m3",
        date: addDaysStr(today, -67),
        opponent: "東ヶ丘少年団",
        competitionId: "cmp1",
        ourScore: 2,
        theirScore: 0,
        formation: "3-3-1",
        lineup: [
          { pos: "GK", playerId: "p01" },
          { pos: "DF1", playerId: "p02" },
          { pos: "DF2", playerId: "p04" },
          { pos: "DF3", playerId: "p16" },
          { pos: "MF1", playerId: "p06" },
          { pos: "MF2", playerId: "p09" },
          { pos: "MF3", playerId: "p11" },
          { pos: "FW1", playerId: "p10" },
        ],
        periods: 2,
        halfMinutes: 20,
        goals: [
          { playerId: "p11", minute: 8, origin: "open" },
          { playerId: "p10", minute: 35, assistPlayerId: "p09", origin: "counter" },
        ],
        subs: [],
        note: "早い時間の先制が効いた。守備の連携も安定していた。",
      },
      {
        id: "m4",
        date: addDaysStr(today, -53),
        opponent: "コスモスJFC",
        competitionId: "cmp1",
        ourScore: 2,
        theirScore: 2,
        formation: "2-4-1",
        lineup: [
          { pos: "GK", playerId: "p01" },
          { pos: "DF1", playerId: "p02" },
          { pos: "DF2", playerId: "p16" },
          { pos: "MF1", playerId: "p06" },
          { pos: "MF2", playerId: "p07" },
          { pos: "MF3", playerId: "p09" },
          { pos: "MF4", playerId: "p11" },
          { pos: "FW1", playerId: "p08" },
        ],
        periods: 2,
        halfMinutes: 20,
        goals: [
          { playerId: "p09", minute: 15, origin: "open" },
          { playerId: "p06", minute: 44, origin: "set" },
        ],
        subs: [{ outPlayerId: "p11", inPlayerId: "p15", minute: 30 }],
        conceded: [
          { minute: 25, origin: "counter" },
          { minute: 41, origin: "set" },
        ],
        note: "終盤に追いつかれたが、粘って追いつき返した。",
      },
      {
        id: "m5",
        date: addDaysStr(today, -32),
        opponent: "青葉SC",
        competitionId: "cmp2",
        ourScore: 0,
        theirScore: 3,
        goals: [],
        subs: [{ outPlayerId: "p07", inPlayerId: "p14", minute: 25 }],
        note: "相手の運動量に終始押し込まれた。次への課題が見えた試合。",
      },
      {
        id: "m6",
        date: addDaysStr(today, -11),
        opponent: "高砂フットボールクラブ",
        competitionId: "cmp2",
        // groups-phase2 §3-1: サンプル試合のうち1件（練習試合）をAチーム対象にする
        groupIds: [SAMPLE_GROUP_A_ID],
        ourScore: 4,
        theirScore: 2,
        goals: [
          { playerId: "p10", minute: 5 },
          { playerId: "p08", minute: 22, assistPlayerId: "p11" },
          { playerId: "p09", minute: 30 },
          { playerId: "p10", minute: 38 },
        ],
        subs: [{ outPlayerId: "p10", inPlayerId: "p15", minute: 42 }],
        note: "終始主導権を握り、複数得点で快勝。",
      },
    ],
  };
}

interface TeamContextValue {
  team: TeamData;
  viewer: TeamViewer;
  setViewer: (role: ViewerRole, memberPlayerId: string | null) => void;
  addEvent: (e: Omit<TeamEvent, "id">) => void;
  updateEvent: (e: TeamEvent) => void;
  removeEvent: (id: string) => void;
  /** イベントカテゴリの実効値（組込み2種 + カスタム） */
  categories: EventCategory[];
  addCategory: (label: string, color: string) => string;
  updateCategory: (c: EventCategory) => void;
  removeCategory: (id: string) => void;
  /** グループ（学年＋カスタム）マスタ。学年グループは常にensureGradeGroups済み */
  groups: TeamGroup[];
  /** 学年グループの範囲・ラベルを決める学校区分。未設定＝"elementary" */
  schoolStage: SchoolStage;
  /** 学校区分を変更する。学年グループをensureGradeGroupsで整え直す（改名は保持・範囲外は削除） */
  setSchoolStage: (stage: SchoolStage) => void;
  /** カスタムグループを追加する（kind:"custom"） */
  addGroup: (label: string) => string;
  updateGroup: (g: TeamGroup) => void;
  /** カスタムグループを削除する（学年グループは削除不可）。全予定の groupIds・全選手の Player.groupIds からもこのIDを外す */
  removeGroup: (id: string) => void;
  /** 繰り返し予定込みの追加。ruleなしは1件（addEventと同じ）。戻り値は追加件数 */
  addEventWithRecurrence: (
    e: Omit<TeamEvent, "id">,
    rule?: RecurrenceRule
  ) => number;
  /** この予定のみ更新（繰り返し回はdetached化） */
  updateEventOnly: (e: TeamEvent) => void;
  /** 繰り返し予定を「以降すべて」更新（過去回・出欠済み回・detached回は保護） */
  updateSeriesFollowing: (
    anchor: TeamEvent,
    patch: Omit<TeamEvent, "id" | "date" | "endDate" | "seriesId" | "detached">,
    rule: RecurrenceRule
  ) => void;
  /** この予定のみ削除 */
  removeEventOnly: (id: string) => void;
  /** 繰り返し予定を「以降すべて」削除（過去回は残す） */
  removeSeriesFollowing: (anchor: TeamEvent) => void;
  setAttendance: (
    eventId: string,
    playerId: string,
    status: AttendanceStatus,
    comment?: string
  ) => void;
  addAnnouncement: (text: string, playId?: string, playTitle?: string, groupIds?: string[]) => void;
  removeAnnouncement: (id: string) => void;
  addCoach: (name: string) => void;
  removeCoach: (name: string) => void;
  addMatch: (m: Omit<MatchRecord, "id">) => void;
  updateMatch: (m: MatchRecord) => void;
  removeMatch: (id: string) => void;
  /** 大会を追加し、生成したIDを返す */
  addCompetition: (name: string, note?: string) => string;
  removeCompetition: (id: string) => void;
  /** 名簿から選手を削除する際に、全イベントの出欠回答からその選手分を除去する */
  removePlayerAnswers: (playerId: string) => void;
  /* ---- 体力測定：種目マスタ（チーム共通） ---- */
  /** 種目を追加し、生成したIDを返す */
  addFitnessTest: (name: string, unit: string, lowerIsBetter?: boolean) => string;
  updateFitnessTest: (test: FitnessTest) => void;
  /**
   * 種目を削除する。既にこの種目の測定記録が1件でも存在する場合は、
   * 記録の参照先を失わないよう削除を拒否してfalseを返す（記録の連鎖削除は行わない設計）。
   * 削除するには先に該当選手の測定記録を removeFitnessRecord で削除しておく必要がある。
   */
  removeFitnessTest: (id: string) => boolean;
  /* ---- 体力測定：選手ごとの記録（Player.fitness） ---- */
  addFitnessRecord: (playerId: string, rec: FitnessRecord) => void;
  /** index は対象選手の fitness 配列内の位置 */
  removeFitnessRecord: (playerId: string, index: number) => void;
  summary: (eventId: string) => {
    yes: number;
    maybe: number;
    no: number;
    none: number;
  };
}

const Ctx = createContext<TeamContextValue | null>(null);
export function useTeam(): TeamContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTeam must be used within TeamProvider");
  return v;
}

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const isPlayerAccount = board.auth.role === "player";
  // lazy初期化で保存データを直接読む（mount後のsetStateによる競合・上書きを防ぐ）。
  // 初期化時にensureGradeGroupsで学年グループ（中1/中2/…）を整える（groups-everywhere §1）
  const [team, setTeam] = useState<TeamData>(() => {
    const t = loadTeam() ?? sampleTeam();
    const stage: SchoolStage = t.schoolStage ?? "elementary";
    return { ...t, schoolStage: stage, groups: ensureGradeGroups(stage, t.groups ?? []) };
  });
  const [viewer, setViewerState] = useState<TeamViewer>(() =>
    isPlayerAccount
      ? { role: "member", memberPlayerId: board.auth.playerId ?? null }
      : loadViewer() ?? { role: "coach", memberPlayerId: null }
  );

  useEffect(() => {
    saveTeam(team);
  }, [team]);
  useEffect(() => {
    if (!isPlayerAccount) saveViewer(viewer);
  }, [viewer, isPlayerAccount]);

  const setViewer = useCallback(
    (role: ViewerRole, memberPlayerId: string | null) =>
      setViewerState({ role, memberPlayerId }),
    []
  );

  const addEvent = useCallback(
    (e: Omit<TeamEvent, "id">) => {
      setTeam((t) => ({ ...t, events: [...t.events, { ...e, id: nid("e") }] }));
      board.toast("予定を追加しました");
    },
    [board]
  );
  const updateEvent = useCallback((e: TeamEvent) => {
    setTeam((t) => ({
      ...t,
      events: t.events.map((x) => (x.id === e.id ? e : x)),
    }));
  }, []);
  const removeEvent = useCallback(
    (id: string) => {
      setTeam((t) => {
        const att = { ...t.attendance };
        delete att[id];
        return {
          ...t,
          events: t.events.filter((x) => x.id !== id),
          attendance: att,
        };
      });
      board.toast("予定を削除しました");
    },
    [board]
  );

  /** イベントカテゴリの実効値（組込みへ色上書きをマージ＋カスタム結合） */
  const categories = useMemo<EventCategory[]>(() => {
    const stored = team.categories ?? [];
    const builtins = BUILTIN_CATEGORIES.map((b) => {
      const ov = stored.find((c) => c.id === b.id);
      return ov ? { ...b, color: ov.color } : b;
    });
    const customs = stored.filter((c) => !BUILTIN_CATEGORIES.some((b) => b.id === c.id));
    return [...builtins, ...customs];
  }, [team.categories]);

  const addCategory = useCallback(
    (label: string, color: string) => {
      const nm = label.trim();
      const id = nid("cat");
      if (nm) {
        const c: EventCategory = { id, label: nm, color };
        setTeam((t) => ({ ...t, categories: [...(t.categories ?? []), c] }));
        board.toast(`カテゴリ「${nm}」を追加しました`);
      }
      return id;
    },
    [board]
  );
  const updateCategory = useCallback((c: EventCategory) => {
    const builtin = BUILTIN_CATEGORIES.find((b) => b.id === c.id);
    setTeam((t) => {
      const stored = t.categories ?? [];
      if (builtin) {
        const exists = stored.some((x) => x.id === c.id);
        const entry: EventCategory = { id: builtin.id, label: builtin.label, color: c.color };
        return {
          ...t,
          categories: exists
            ? stored.map((x) => (x.id === c.id ? entry : x))
            : [...stored, entry],
        };
      }
      return {
        ...t,
        categories: stored.map((x) => (x.id === c.id ? c : x)),
      };
    });
  }, []);
  const removeCategory = useCallback((id: string) => {
    setTeam((t) => ({
      ...t,
      categories: (t.categories ?? []).filter((c) => c.id !== id),
      events: t.events.map((e) =>
        e.categoryId === id ? { ...e, categoryId: undefined } : e
      ),
    }));
  }, []);

  /** グループ（学年＋カスタム）マスタ */
  const groups = useMemo<TeamGroup[]>(() => team.groups ?? [], [team.groups]);
  const schoolStage: SchoolStage = team.schoolStage ?? "elementary";

  /**
   * 学校区分を変更する。学年グループをensureGradeGroupsで整え直す（改名は保持・範囲外は削除）。
   * Phase D-1(C1-major): 削除される学年グループを対象にしていた予定・連絡・配信の
   * groupIds/targetGroupIdsを残したままだと、解決できないIDとして「全員」表示のまま
   * 対象選手0人になってしまうため、removeGroupと同様に後始末する。また範囲外になった
   * 学年の選手はgradeをクリアする（「中5」等の存在しないラベル表示・学年別集計からの
   * 欠落を防ぐ）。
   * groups-everywhere Phase 2: この学年クリアは全選手一括で元に戻せないため、対象選手が
   * いるときは人数と名前（現在の学年つき）を示して確認し、キャンセルなら区分ごと変更しない
   * （このアプリの破壊的操作の作法）。適用後はトーストで人数を知らせる
   */
  const setSchoolStage = useCallback(
    (stage: SchoolStage) => {
      const allowed = STAGE_GRADES[stage];
      const affected = board.state.players.filter(
        (p) => p.grade != null && !allowed.includes(p.grade)
      );
      if (affected.length > 0) {
        const names = affected
          .slice(0, 3)
          .map((p) => `${p.name}（${p.grade != null ? gradeLabel(schoolStage, p.grade) : ""}）`)
          .join("、");
        const more = affected.length > 3 ? ` ほか${affected.length - 3}人` : "";
        const ok = window.confirm(
          `学校区分を「${STAGE_NAME[stage]}」に変更すると、学年が範囲外になる${affected.length}人` +
            `（${names}${more}）の学年が未設定になります。` +
            `この操作は元に戻せません（学年はあとから選手ごとに設定し直せます）。\n変更しますか？`
        );
        if (!ok) return;
      }
      const prevGroups = team.groups ?? [];
      const nextGroups = ensureGradeGroups(stage, prevGroups);
      const removedIds = prevGroups
        .filter((g) => g.kind === "grade" && !nextGroups.some((x) => x.id === g.id))
        .map((g) => g.id);
      setTeam((t) => ({
        ...t,
        schoolStage: stage,
        groups: nextGroups,
        events:
          removedIds.length === 0
            ? t.events
            : t.events.map((e) => {
                if (!e.groupIds || !e.groupIds.some((id) => removedIds.includes(id))) return e;
                const rest = e.groupIds.filter((id) => !removedIds.includes(id));
                return { ...e, groupIds: rest.length > 0 ? rest : undefined };
              }),
        announcements:
          removedIds.length === 0
            ? t.announcements
            : t.announcements.map((a) => {
                if (!a.groupIds || !a.groupIds.some((id) => removedIds.includes(id))) return a;
                const rest = a.groupIds.filter((id) => !removedIds.includes(id));
                return { ...a, groupIds: rest.length > 0 ? rest : undefined };
              }),
        // groups-phase2 §3-1: 試合記録のgroupIdsも同様に後始末する
        matches:
          removedIds.length === 0
            ? t.matches
            : t.matches.map((m) => {
                if (!m.groupIds || !m.groupIds.some((id) => removedIds.includes(id))) return m;
                const rest = m.groupIds.filter((id) => !removedIds.includes(id));
                return { ...m, groupIds: rest.length > 0 ? rest : undefined };
              }),
      }));
      removedIds.forEach((id) => board.removeDeliverableTargetGroup(id));
      affected.forEach((p) => board.updatePlayer({ ...p, grade: null }));
      if (affected.length > 0) board.toast(`${affected.length}人の学年を未設定にしました`);
    },
    [team.groups, schoolStage, board]
  );

  const addGroup = useCallback(
    (label: string) => {
      // Phase D-1(C1-minor): 空ラベル時にidを先に発行して戻り値にしていたため、
      // 呼び出し元が戻り値を信用すると「存在しないグループのID」を受け取ってしまっていた。
      // 未作成のときは空文字を返し、戻り値が常に実在するIDになるようにする
      const nm = label.trim();
      if (!nm) return "";
      const id = nid("grp");
      const g: TeamGroup = { id, label: nm, kind: "custom" };
      setTeam((t) => ({ ...t, groups: [...(t.groups ?? []), g] }));
      board.toast(`グループ「${nm}」を追加しました`);
      return id;
    },
    [board]
  );
  const updateGroup = useCallback((g: TeamGroup) => {
    setTeam((t) => ({
      ...t,
      groups: (t.groups ?? []).map((x) => (x.id === g.id ? g : x)),
    }));
  }, []);
  /**
   * カスタムグループを削除する（学年グループは削除不可）。全予定のgroupIds・全選手の
   * Player.groupIdsからもこのIDを外す。Phase D-1(C1-major): 連絡(announcements)のgroupIdsと
   * 配信(deliverables)のtargetGroupIdsは放置されていたため、そのグループ宛の過去の連絡・配信が
   * 「解決できないID」問題と合わさって選手側から一斉に消える不具合があった。あわせて掃除する
   */
  const removeGroup = useCallback(
    (id: string) => {
      const target = (team.groups ?? []).find((g) => g.id === id);
      if (!target || target.kind !== "custom") return;
      setTeam((t) => ({
        ...t,
        groups: (t.groups ?? []).filter((g) => g.id !== id),
        events: t.events.map((e) => {
          if (!e.groupIds || !e.groupIds.includes(id)) return e;
          const rest = e.groupIds.filter((x) => x !== id);
          return { ...e, groupIds: rest.length > 0 ? rest : undefined };
        }),
        announcements: t.announcements.map((a) => {
          if (!a.groupIds || !a.groupIds.includes(id)) return a;
          const rest = a.groupIds.filter((x) => x !== id);
          return { ...a, groupIds: rest.length > 0 ? rest : undefined };
        }),
        // groups-phase2 §3-1: 試合記録のgroupIdsも同様に後始末する
        matches: t.matches.map((m) => {
          if (!m.groupIds || !m.groupIds.includes(id)) return m;
          const rest = m.groupIds.filter((x) => x !== id);
          return { ...m, groupIds: rest.length > 0 ? rest : undefined };
        }),
      }));
      // Player.groupIdsと配信(deliverables)のtargetGroupIdsはBoardStateが保持するため、
      // BoardProvider経由で除去する
      board.state.players.forEach((p) => {
        if (p.groupIds?.includes(id)) {
          board.updatePlayer({ ...p, groupIds: p.groupIds.filter((x) => x !== id) });
        }
      });
      board.removeDeliverableTargetGroup(id);
    },
    [board, team.groups]
  );

  const addEventWithRecurrence = useCallback(
    (e: Omit<TeamEvent, "id">, rule?: RecurrenceRule): number => {
      if (!rule) {
        addEvent(e);
        return 1;
      }
      const seriesId = nid("srs");
      const dates = expandRule(rule, e.date);
      const span = e.endDate ? diffDays(e.date, e.endDate) : 0;
      const newEvents: TeamEvent[] = dates.map((d) => ({
        ...e,
        date: d,
        endDate: e.endDate ? addDays(d, span) : undefined,
        id: nid("e"),
        seriesId,
      }));
      setTeam((t) => ({
        ...t,
        events: [...t.events, ...newEvents],
        series: [...(t.series ?? []), { id: seriesId, rule, createdAt: Date.now() }],
      }));
      board.toast(`${newEvents.length}件の予定を追加しました`);
      return newEvents.length;
    },
    [addEvent, board]
  );

  const updateEventOnly = useCallback((e: TeamEvent) => {
    const toSave: TeamEvent = e.seriesId ? { ...e, detached: true } : e;
    setTeam((t) => ({
      ...t,
      events: t.events.map((x) => (x.id === toSave.id ? toSave : x)),
    }));
  }, []);

  const updateSeriesFollowing = useCallback(
    (
      anchor: TeamEvent,
      patch: Omit<TeamEvent, "id" | "date" | "endDate" | "seriesId" | "detached">,
      rule: RecurrenceRule
    ) => {
      const seriesId = anchor.seriesId;
      if (!seriesId) return;
      // Omit<>は型上の除去のみで実行時には何も除去しないため、
      // 呼び出し元由来の id/date/endDate/seriesId/detached を実行時に取り除く
      const {
        id: _pid,
        date: _pdate,
        endDate: _pend,
        seriesId: _psid,
        detached: _pdet,
        ...cleanPatch
      } = patch as TeamEvent;
      setTeam((t) => {
        const series = (t.series ?? []).map((s) =>
          s.id === seriesId ? { ...s, rule } : s
        );

        // detached回は一切触らない（個別編集済みの意図を保護）。
        // 出欠回答ありの回は削除せずその場でpatchを適用（内容変更を反映）。
        // クリーンな回（detachedでも出欠済みでもない）だけを削除し、再生成対象にする。
        const attendance = { ...t.attendance };
        const keepDates = new Set<string>();
        const events = t.events.flatMap((x) => {
          if (x.seriesId !== seriesId || x.date < anchor.date) return [x];
          const hasAttendance = Object.keys(attendance[x.id] ?? {}).length > 0;
          if (x.detached) {
            keepDates.add(x.date);
            return [x];
          }
          if (hasAttendance) {
            keepDates.add(x.date);
            return [{ ...x, ...cleanPatch }];
          }
          delete attendance[x.id];
          return [];
        });

        const span = anchor.endDate ? diffDays(anchor.date, anchor.endDate) : 0;
        const dates = expandRule(rule, anchor.date).filter((d) => !keepDates.has(d));
        const newEvents: TeamEvent[] = dates.map((d) => ({
          ...cleanPatch,
          date: d,
          endDate: anchor.endDate ? addDays(d, span) : undefined,
          id: nid("e"),
          seriesId,
        }));

        return {
          ...t,
          series,
          events: [...events, ...newEvents],
          attendance,
        };
      });
    },
    []
  );

  const removeEventOnly = useCallback(
    (id: string) => {
      setTeam((t) => {
        const att = { ...t.attendance };
        delete att[id];
        return {
          ...t,
          events: t.events.filter((x) => x.id !== id),
          attendance: att,
        };
      });
      board.toast("予定を削除しました");
    },
    [board]
  );

  const removeSeriesFollowing = useCallback(
    (anchor: TeamEvent) => {
      const seriesId = anchor.seriesId;
      if (!seriesId) return;
      setTeam((t) => {
        const attendance = { ...t.attendance };
        const events = t.events.filter((x) => {
          if (x.seriesId !== seriesId || x.date < anchor.date) return true;
          delete attendance[x.id];
          return false;
        });
        const series = (t.series ?? []).map((s) =>
          s.id === seriesId
            ? { ...s, rule: { ...s.rule, until: addDays(anchor.date, -1) } }
            : s
        );
        return { ...t, events, attendance, series };
      });
      board.toast("以降の予定を削除しました");
    },
    [board]
  );

  const setAttendance = useCallback(
    (
      eventId: string,
      playerId: string,
      status: AttendanceStatus,
      comment?: string
    ) => {
      setTeam((t) => {
        const forEvent = { ...(t.attendance[eventId] ?? {}) };
        forEvent[playerId] = { status, comment };
        return {
          ...t,
          attendance: { ...t.attendance, [eventId]: forEvent },
        };
      });
    },
    []
  );

  const addAnnouncement = useCallback(
    (text: string, playId?: string, playTitle?: string, groupIds?: string[]) => {
      const msg = text.trim();
      if (!msg) return;
      setTeam((t) => ({
        ...t,
        announcements: [
          {
            id: nid("a"),
            ts: Date.now(),
            text: msg,
            playId,
            playTitle,
            groupIds: groupIds && groupIds.length > 0 ? [...groupIds] : undefined,
          },
          ...t.announcements,
        ],
      }));
      board.toast("連絡を送信しました");
    },
    [board]
  );
  const removeAnnouncement = useCallback((id: string) => {
    setTeam((t) => ({
      ...t,
      announcements: t.announcements.filter((a) => a.id !== id),
    }));
  }, []);

  const addCoach = useCallback((name: string) => {
    const nm = name.trim();
    if (!nm) return;
    setTeam((t) =>
      t.coaches.includes(nm) ? t : { ...t, coaches: [...t.coaches, nm] }
    );
  }, []);
  const removeCoach = useCallback((name: string) => {
    setTeam((t) => ({ ...t, coaches: t.coaches.filter((c) => c !== name) }));
  }, []);

  const addMatch = useCallback(
    (m: Omit<MatchRecord, "id">) => {
      setTeam((t) => ({ ...t, matches: [{ ...m, id: nid("m") }, ...t.matches] }));
      board.toast("試合結果を記録しました");
    },
    [board]
  );
  const updateMatch = useCallback((m: MatchRecord) => {
    setTeam((t) => ({
      ...t,
      matches: t.matches.map((x) => (x.id === m.id ? m : x)),
    }));
  }, []);
  const removeMatch = useCallback(
    (id: string) => {
      setTeam((t) => ({ ...t, matches: t.matches.filter((x) => x.id !== id) }));
      board.toast("試合記録を削除しました");
    },
    [board]
  );

  const addCompetition = useCallback(
    (name: string, note?: string) => {
      const nm = name.trim();
      const id = nid("cmp");
      if (nm) {
        const c: Competition = { id, name: nm, note: note?.trim() || undefined };
        setTeam((t) => ({ ...t, competitions: [...t.competitions, c] }));
        board.toast(`大会「${nm}」を登録しました`);
      }
      return id;
    },
    [board]
  );
  const removeCompetition = useCallback((id: string) => {
    setTeam((t) => ({
      ...t,
      competitions: t.competitions.filter((c) => c.id !== id),
      // 紐づく試合は大会未設定に戻す（記録は残す）
      matches: t.matches.map((m) =>
        m.competitionId === id ? { ...m, competitionId: undefined } : m
      ),
    }));
  }, []);

  const removePlayerAnswers = useCallback((playerId: string) => {
    setTeam((t) => {
      const attendance: TeamData["attendance"] = {};
      for (const [evId, rec] of Object.entries(t.attendance)) {
        const { [playerId]: _drop, ...rest } = rec;
        attendance[evId] = rest;
      }
      return { ...t, attendance };
    });
  }, []);

  /* ---- 体力測定：種目マスタ（チーム共通） ---- */
  const addFitnessTest = useCallback(
    (name: string, unit: string, lowerIsBetter?: boolean): string => {
      const nm = name.trim();
      const id = nid("fit");
      if (nm) {
        const test: FitnessTest = { id, name: nm, unit: unit.trim(), lowerIsBetter };
        setTeam((t) => ({ ...t, fitnessTests: [...(t.fitnessTests ?? []), test] }));
        board.toast(`種目「${nm}」を追加しました`);
      }
      return id;
    },
    [board]
  );
  const updateFitnessTest = useCallback((test: FitnessTest) => {
    setTeam((t) => ({
      ...t,
      fitnessTests: (t.fitnessTests ?? []).map((x) => (x.id === test.id ? test : x)),
    }));
  }, []);
  const removeFitnessTest = useCallback(
    (id: string): boolean => {
      // この種目を参照する測定記録が選手側(board.state.players)に1件でも残っていれば削除を拒否する
      const inUse = board.state.players.some((p) =>
        (p.fitness ?? []).some((f) => f.testId === id)
      );
      if (inUse) {
        board.toast("この種目の測定記録が残っているため削除できません");
        return false;
      }
      setTeam((t) => ({
        ...t,
        fitnessTests: (t.fitnessTests ?? []).filter((x) => x.id !== id),
      }));
      return true;
    },
    [board]
  );

  /* ---- 体力測定：選手ごとの記録（Player.fitnessはBoardStateが保持するためboard.updatePlayer経由） ---- */
  const addFitnessRecord = useCallback(
    (playerId: string, rec: FitnessRecord) => {
      const p = board.state.players.find((x) => x.id === playerId);
      if (!p) return;
      board.updatePlayer({ ...p, fitness: [rec, ...(p.fitness ?? [])] });
    },
    [board]
  );
  const removeFitnessRecord = useCallback(
    (playerId: string, index: number) => {
      const p = board.state.players.find((x) => x.id === playerId);
      if (!p) return;
      const list = p.fitness ?? [];
      if (index < 0 || index >= list.length) return;
      board.updatePlayer({ ...p, fitness: list.filter((_, i) => i !== index) });
    },
    [board]
  );

  // groups-everywhere §4: 分母を「その予定の対象選手」に。Phase D-1(C1-major):
  // 内訳(yes/maybe/no)は従来どおりObject.values(att)を全件走査していたため、対象外選手の
  // 出欠記録まで混ざりyes+maybe+no>totalになり得た（noneがMath.maxで0に潰れ「未回答」の
  // 催促が機能しなくなる）。内訳も対象選手の集合だけを数えるように揃える
  const summary = useCallback(
    (eventId: string) => {
      const att = team.attendance[eventId] ?? {};
      const event = team.events.find((e) => e.id === eventId);
      const targets = event ? eventTargetPlayers(event, board.state.players, groups) : board.state.players;
      const total = targets.length;
      let yes = 0,
        maybe = 0,
        no = 0;
      targets.forEach((p) => {
        const st = att[p.id]?.status;
        if (st === "yes") yes++;
        else if (st === "maybe") maybe++;
        else if (st === "no") no++;
      });
      return { yes, maybe, no, none: Math.max(0, total - yes - maybe - no) };
    },
    [team.attendance, team.events, board.state.players, groups]
  );

  const value = useMemo<TeamContextValue>(
    () => ({
      team,
      viewer,
      setViewer,
      addEvent,
      updateEvent,
      removeEvent,
      categories,
      addCategory,
      updateCategory,
      removeCategory,
      groups,
      schoolStage,
      setSchoolStage,
      addGroup,
      updateGroup,
      removeGroup,
      addEventWithRecurrence,
      updateEventOnly,
      updateSeriesFollowing,
      removeEventOnly,
      removeSeriesFollowing,
      setAttendance,
      addAnnouncement,
      removeAnnouncement,
      addCoach,
      removeCoach,
      addMatch,
      updateMatch,
      removeMatch,
      addCompetition,
      removeCompetition,
      removePlayerAnswers,
      addFitnessTest,
      updateFitnessTest,
      removeFitnessTest,
      addFitnessRecord,
      removeFitnessRecord,
      summary,
    }),
    [
      team,
      viewer,
      setViewer,
      addEvent,
      updateEvent,
      removeEvent,
      categories,
      addCategory,
      updateCategory,
      removeCategory,
      groups,
      schoolStage,
      setSchoolStage,
      addGroup,
      updateGroup,
      removeGroup,
      addEventWithRecurrence,
      updateEventOnly,
      updateSeriesFollowing,
      removeEventOnly,
      removeSeriesFollowing,
      setAttendance,
      addAnnouncement,
      removeAnnouncement,
      addCoach,
      removeCoach,
      addMatch,
      updateMatch,
      removeMatch,
      addCompetition,
      removeCompetition,
      removePlayerAnswers,
      addFitnessTest,
      updateFitnessTest,
      removeFitnessTest,
      addFitnessRecord,
      removeFitnessRecord,
      summary,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
