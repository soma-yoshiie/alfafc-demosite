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
  MatchRecord,
  RecurrenceRule,
  TeamData,
  TeamEvent,
  TeamEventKind,
  TeamViewer,
  ViewerRole,
} from "@/lib/types";
import {
  loadTeam,
  loadViewer,
  saveTeam,
  saveViewer,
} from "@/lib/storage";
import { addDaysStr, localDateStr } from "@/lib/dates";
import { SAMPLE_PLAYERS } from "@/lib/sampleTeam";
import {
  addDays,
  BUILTIN_CATEGORIES,
  diffDays,
  expandRule,
} from "@/lib/calendarUtils";
import { useBoard } from "./BoardProvider";

let seq = 0;
function nid(p: string) {
  seq += 1;
  return `${p}_${Date.now().toString(36)}_${seq}`;
}

/** デモ用の出欠シード（大半が「出席」・空っぽ状態を避ける。unanswered は未回答のまま残す） */
function sampleAttendance(
  overrides: Record<string, AttendanceStatus>,
  comments: Record<string, string> = {},
  unanswered: string[] = []
): Record<string, { status: AttendanceStatus; comment?: string }> {
  const rec: Record<string, { status: AttendanceStatus; comment?: string }> = {};
  SAMPLE_PLAYERS.forEach((p) => {
    if (unanswered.includes(p.id)) return;
    rec[p.id] = { status: overrides[p.id] ?? "yes", comment: comments[p.id] };
  });
  return rec;
}

function sampleTeam(): TeamData {
  // ノートのカレンダー連動デモに合わせ「今日=練習日」を含める（localDateStr=ローカル日付でUTCズレなし）
  const today = localDateStr();
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
      },
    ],
    attendance: {
      ev_practice_pastA: sampleAttendance(
        { p09: "maybe", p14: "maybe", p04: "no", p12: "no" },
        {},
        ["p07"]
      ),
      ev_practice_pastB: sampleAttendance(
        { p11: "maybe", p06: "no" },
        {},
        ["p02"]
      ),
      ev_practice_today: sampleAttendance(
        { p13: "maybe", p05: "no" },
        { p05: "怪我のためお休みします" },
        ["p16"]
      ),
      ev_match_next: sampleAttendance(
        { p03: "maybe", p10: "no" },
        { p10: "所用のため参加できません" },
        ["p07", "p09"] // 未回答のまま（催促UIのデモ用）
      ),
      // ev_practice_camp / ev_practice_meeting は未回答のまま（未回答デモを兼ねる）
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
      { id: "cat_meet", label: "保護者会", color: "#7c5cbf" },
    ],
    competitions: [
      { id: "cmp1", name: "春季リーグ U-12", note: "4〜6月・市内リーグ" },
      { id: "cmp2", name: "練習試合", note: "" },
    ],
    matches: [
      {
        id: "m1",
        date: addDaysStr(today, -116),
        opponent: "みどり台SC",
        competitionId: "cmp1",
        ourScore: 3,
        theirScore: 1,
        goals: [
          { playerId: "p10", minute: 12 },
          { playerId: "p09", minute: 27, assistPlayerId: "p08" },
          { playerId: "p10", minute: 39 },
        ],
        subs: [{ outPlayerId: "p09", inPlayerId: "p15", minute: 33 }],
        note: "序盤から主導権を握れた。左右のワイドが起点になった。",
      },
      {
        id: "m2",
        date: addDaysStr(today, -95),
        opponent: "白鷺FC",
        competitionId: "cmp1",
        ourScore: 1,
        theirScore: 2,
        goals: [{ playerId: "p08", minute: 41, assistPlayerId: "p06" }],
        subs: [{ outPlayerId: "p07", inPlayerId: "p14", minute: 30 }],
        note: "後半に運動量が落ち、終盤の失点が響いた。",
      },
      {
        id: "m3",
        date: addDaysStr(today, -67),
        opponent: "東ヶ丘少年団",
        competitionId: "cmp1",
        ourScore: 2,
        theirScore: 0,
        goals: [
          { playerId: "p11", minute: 8 },
          { playerId: "p10", minute: 35, assistPlayerId: "p09" },
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
        goals: [
          { playerId: "p09", minute: 15 },
          { playerId: "p06", minute: 44 },
        ],
        subs: [{ outPlayerId: "p11", inPlayerId: "p15", minute: 30 }],
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
  addAnnouncement: (text: string, playId?: string, playTitle?: string) => void;
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
  // lazy初期化で保存データを直接読む（mount後のsetStateによる競合・上書きを防ぐ）
  const [team, setTeam] = useState<TeamData>(() => loadTeam() ?? sampleTeam());
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
    (text: string, playId?: string, playTitle?: string) => {
      const msg = text.trim();
      if (!msg) return;
      setTeam((t) => ({
        ...t,
        announcements: [
          { id: nid("a"), ts: Date.now(), text: msg, playId, playTitle },
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

  const summary = useCallback(
    (eventId: string) => {
      const att = team.attendance[eventId] ?? {};
      const total = board.state.players.length;
      let yes = 0,
        maybe = 0,
        no = 0;
      Object.values(att).forEach((e) => {
        if (e.status === "yes") yes++;
        else if (e.status === "maybe") maybe++;
        else no++;
      });
      return { yes, maybe, no, none: Math.max(0, total - yes - maybe - no) };
    },
    [team.attendance, board.state.players.length]
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
      summary,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
