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
  MatchRecord,
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
import { SAMPLE_PLAYERS } from "@/lib/sampleTeam";
import { useBoard } from "./BoardProvider";

let seq = 0;
function nid(p: string) {
  seq += 1;
  return `${p}_${Date.now().toString(36)}_${seq}`;
}

function ymd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** デモ用の出欠シード（大半が「出席」・空っぽ状態を避ける） */
function sampleAttendance(
  overrides: Record<string, AttendanceStatus>,
  comments: Record<string, string> = {}
): Record<string, { status: AttendanceStatus; comment?: string }> {
  const rec: Record<string, { status: AttendanceStatus; comment?: string }> = {};
  SAMPLE_PLAYERS.forEach((p) => {
    rec[p.id] = { status: overrides[p.id] ?? "yes", comment: comments[p.id] };
  });
  return rec;
}

function sampleTeam(): TeamData {
  return {
    events: [
      {
        id: "e1",
        kind: "practice",
        title: "通常練習",
        date: ymd(2),
        time: "17:00",
        endTime: "19:00",
        place: "市営グラウンド",
        note: "ビブス忘れずに",
      },
      {
        id: "e2",
        kind: "match",
        title: "練習試合 vs 青空FC",
        date: ymd(6),
        time: "10:00",
        endTime: "12:30",
        place: "中央公園グラウンド",
      },
    ],
    attendance: {
      e1: sampleAttendance(
        { p05: "no", p13: "maybe" },
        { p05: "怪我のためお休みします" }
      ),
      e2: sampleAttendance(
        { p05: "maybe", p16: "no" },
        { p16: "習い事と重なり遅れて参加します" }
      ),
    },
    announcements: [
      {
        id: "a1",
        ts: Date.now() - 3600_000,
        text: "今週末は練習試合です。集合10時・忘れ物に注意！",
      },
    ],
    coaches: ["監督 田中", "スタッフ 鈴木"],
    competitions: [
      { id: "cmp1", name: "春季リーグ U-12", note: "4〜6月・市内リーグ" },
      { id: "cmp2", name: "練習試合", note: "" },
    ],
    matches: [
      {
        id: "m1",
        date: ymd(-5),
        opponent: "みどり台SC",
        competitionId: "cmp2",
        competition: "練習試合",
        ourScore: 3,
        theirScore: 1,
        goals: [
          { playerId: "p10", minute: 12 },
          { playerId: "p09", minute: 34, assistPlayerId: "p08" },
          { playerId: "p10", minute: 70 },
        ],
        subs: [{ outPlayerId: "p09", inPlayerId: "p15", minute: 60 }],
        note: "前半から主導権を握れた。サイドの突破が機能。",
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
      summary,
    }),
    [
      team,
      viewer,
      setViewer,
      addEvent,
      updateEvent,
      removeEvent,
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
      summary,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
