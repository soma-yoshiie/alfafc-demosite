"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Goal, GoalNote, PlayerGoals } from "@/lib/goals";
import { emptyGoals, newGoalId } from "@/lib/goals";
import { sampleGoals } from "@/lib/sampleGoals";
import { SAMPLE_PLAYERS } from "@/lib/sampleTeam";
import { hasGoalsSeedMarker, loadGoals, loadState, markGoalsSeeded, saveGoals } from "@/lib/storage";
import { useBoard } from "./BoardProvider";
import { useProfiles } from "./ProfileProvider";

/**
 * 選手の目標の Context（specs/goals.md §1・§4）。保存は別キー soccer_tactics_goals_v1
 * （lib/storage.ts の loadGoals/saveGoals）。プロフィール（ProfileProvider）と同じ作法：変更のたびに同期で保存し、
 * 失敗（容量超過）は false を返してトーストで知らせる。state の更新関数の中では保存しない。
 *
 * 夢は進路の将来の目標（career.futureGoal）そのもの。読む・直すは ProfileProvider を通す（dream／setDream）。
 * マウント位置：ProfileProvider の内側（components/AppFlow.tsx）。
 *
 * 目標の画面（GoalBoard）をどこからでも開く状態（overlay／openGoals／closeGoals）もここに持つ。
 * 重ね表示 GoalOverlay は ConsoleShell に 1 つだけ置く。
 */

/** 更新の自動記録（createdAt/updatedAt/updatedBy）は Provider が付けるので、渡さなくてよい */
export type GoalInput = Omit<Goal, "createdAt" | "updatedAt" | "updatedBy" | "id"> & Partial<Pick<Goal, "id">>;

/** 目標の画面の最初の行き先（重ね表示を開くとき） */
export type GoalScreen = "ladder" | "review-week" | "review-month" | "setup";

export interface GoalOverlayState {
  playerId: string;
  screen: GoalScreen;
}

export interface GoalsContextValue {
  /** 保存されている全選手の目標（記録の無い選手は含まれない） */
  goals: Record<string, PlayerGoals>;
  /** その選手の目標。記録が無ければ空を返す（保存はしない。同じ選手には同じ空を返す） */
  get: (playerId: string) => PlayerGoals;
  /** 夢＝進路の将来の目標（ProfileProvider を通す） */
  dream: (playerId: string) => string;
  setDream: (playerId: string, text: string) => void;
  /** 1 人ぶんを関数で更新する（複数の変更を 1 回の保存でまとめたいとき）。成否を返す */
  update: (playerId: string, fn: (cur: PlayerGoals) => PlayerGoals) => boolean;
  /** 目標を 1 件保存する（id が同じなら置き換え、無ければ追加）。成否を返す */
  setGoal: (playerId: string, goal: GoalInput) => boolean;
  /** 目標を消す（付いていたスタッフのひとことも消す） */
  removeGoal: (playerId: string, id: string) => boolean;
  /** 「変える」：今の目標を「変えた」として残し、新しい目標を作る。新しい目標の id を返す（失敗は null） */
  changeGoal: (playerId: string, oldId: string, next: GoalInput) => string | null;
  /** 「達成した」：今の目標を「達成」にする。next があれば次の目標も作る。成否を返す */
  completeGoal: (playerId: string, id: string, next?: GoalInput) => boolean;
  /** 週・月の見直しの結果を付ける（null で外す） */
  setReview: (playerId: string, id: string, review: Goal["review"] | null) => boolean;
  /** スタッフのひとこと（by は「岡本監督」のような名前） */
  addStaffNote: (playerId: string, goalId: string, text: string, by: string) => boolean;
  /** 大きな目標の段の表示名（空で既定に戻す） */
  setLongLabel: (playerId: string, label: string) => boolean;
  /** はじめての設定を終えた印 */
  setSetupDone: (playerId: string, done: boolean) => boolean;
  /** 目標の画面の見せ方（はしご／階段） */
  setView: (playerId: string, view: "ladder" | "stairs") => boolean;

  /** 重ね表示（GoalOverlay）で開いている目標の画面。閉じていれば null */
  overlay: GoalOverlayState | null;
  openGoals: (playerId: string, screen?: GoalScreen) => void;
  closeGoals: () => void;
}

const Ctx = createContext<GoalsContextValue | null>(null);
export function useGoals(): GoalsContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGoals must be used within GoalsProvider");
  return v;
}

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const profiles = useProfiles();
  const [goals, setGoals] = useState<Record<string, PlayerGoals>>(() => loadGoals());
  // 最新の全件。同じ tick に続けて更新しても前の更新を取りこぼさないよう、更新はこの ref を基準に同期で行う
  const ref = useRef(goals);
  const [overlay, setOverlay] = useState<GoalOverlayState | null>(null);

  const auth = board.auth;
  const byRef = useRef("");
  byRef.current = auth.role === "coach" ? "staff:" + auth.name : "player";
  const toastRef = useRef(board.toast);
  toastRef.current = board.toast;
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  /** 全件を置き換えて保存する（メモリは必ず更新し、保存に失敗したらトーストで知らせて false） */
  const commit = useCallback((next: Record<string, PlayerGoals>): boolean => {
    ref.current = next;
    setGoals(next);
    const ok = saveGoals(next);
    if (!ok) toastRef.current("保存できませんでした（端末の保存容量がいっぱいです）");
    return ok;
  }, []);

  const base = useCallback((playerId: string): PlayerGoals => ref.current[playerId] ?? emptyGoals(playerId), []);

  const update = useCallback(
    (playerId: string, fn: (cur: PlayerGoals) => PlayerGoals): boolean => {
      const next = { ...fn(base(playerId)), playerId, updatedAt: Date.now() };
      return commit({ ...ref.current, [playerId]: next });
    },
    [base, commit]
  );

  /** 入力に更新の自動記録を付けて Goal にする（既存の id なら createdAt を引き継ぐ） */
  const stampGoal = useCallback((cur: PlayerGoals, g: GoalInput): Goal => {
    const now = Date.now();
    const id = g.id ?? newGoalId();
    const old = cur.goals.find((x) => x.id === id);
    return { ...g, id, createdAt: old?.createdAt ?? now, updatedAt: now, updatedBy: byRef.current };
  }, []);

  const upsert = (list: Goal[], g: Goal): Goal[] =>
    list.some((x) => x.id === g.id) ? list.map((x) => (x.id === g.id ? g : x)) : [...list, g];

  const setGoal = useCallback(
    (playerId: string, goal: GoalInput) =>
      update(playerId, (cur) => ({ ...cur, goals: upsert(cur.goals, stampGoal(cur, goal)) })),
    [update, stampGoal]
  );

  const removeGoal = useCallback(
    (playerId: string, id: string) =>
      update(playerId, (cur) => ({
        ...cur,
        goals: cur.goals.filter((g) => g.id !== id),
        staffNotes: cur.staffNotes.filter((n) => n.goalId !== id),
      })),
    [update]
  );

  const changeGoal = useCallback(
    (playerId: string, oldId: string, next: GoalInput): string | null => {
      const id = next.id ?? newGoalId();
      const ok = update(playerId, (cur) => {
        const now = Date.now();
        const goals = cur.goals.map((g) =>
          g.id === oldId ? { ...g, status: "changed" as const, updatedAt: now, updatedBy: byRef.current } : g
        );
        return { ...cur, goals: upsert(goals, stampGoal(cur, { ...next, id })) };
      });
      return ok ? id : null;
    },
    [update, stampGoal]
  );

  const completeGoal = useCallback(
    (playerId: string, id: string, next?: GoalInput) =>
      update(playerId, (cur) => {
        const now = Date.now();
        let goals = cur.goals.map((g) =>
          g.id === id ? { ...g, status: "done" as const, doneAt: now, updatedAt: now, updatedBy: byRef.current } : g
        );
        if (next) goals = upsert(goals, stampGoal(cur, next));
        return { ...cur, goals };
      }),
    [update, stampGoal]
  );

  const setReview = useCallback(
    (playerId: string, id: string, review: Goal["review"] | null) =>
      update(playerId, (cur) => ({
        ...cur,
        goals: cur.goals.map((g) =>
          g.id === id ? { ...g, review: review ?? undefined, updatedAt: Date.now(), updatedBy: byRef.current } : g
        ),
      })),
    [update]
  );

  const addStaffNote = useCallback(
    (playerId: string, goalId: string, text: string, by: string) => {
      const t = text.trim();
      if (!t) return false;
      const note: GoalNote = { id: "gn_" + newGoalId().slice(5), goalId, text: t, by, ts: Date.now() };
      return update(playerId, (cur) => ({ ...cur, staffNotes: [...cur.staffNotes, note] }));
    },
    [update]
  );

  const setLongLabel = useCallback(
    (playerId: string, label: string) => update(playerId, (cur) => ({ ...cur, longLabel: label.trim() || undefined })),
    [update]
  );
  const setSetupDone = useCallback(
    (playerId: string, done: boolean) =>
      // 終えたら「途中」の印（setupStarted）も消す
      update(playerId, (cur) => ({ ...cur, setupDone: done || undefined, setupStarted: done ? undefined : cur.setupStarted })),
    [update]
  );
  const setView = useCallback(
    (playerId: string, view: "ladder" | "stairs") => update(playerId, (cur) => ({ ...cur, view })),
    [update]
  );

  const setDream = useCallback((playerId: string, text: string) => {
    profilesRef.current.updateCareer(playerId, { futureGoal: text.trim() });
  }, []);
  const dream = useCallback(
    (playerId: string) => (profiles.get(playerId).career.futureGoal ?? "").trim(),
    [profiles]
  );

  // 初回マウントのデモ投入（goals §1-2）。保存が空で、投入済みマーカーが無く、名簿に p08 がいるときだけ、
  // 佐藤 蒼空の目標を 1 回入れてマーカーを書く。名簿は保存済みを読む（ProfileProvider と同じ理由）。
  // StrictMode で effect が 2 回走っても 2 回目は保存が空でない
  useEffect(() => {
    if (Object.keys(ref.current).length > 0 || hasGoalsSeedMarker()) return;
    const roster = loadState()?.players ?? SAMPLE_PLAYERS;
    if (!roster.some((p) => p.id === "p08")) return;
    commit(sampleGoals());
    markGoalsSeeded();
  }, [commit]);

  const get = useCallback((playerId: string): PlayerGoals => goals[playerId] ?? emptyFor(playerId), [goals]);

  const openGoals = useCallback((playerId: string, screen: GoalScreen = "ladder") => setOverlay({ playerId, screen }), []);
  const closeGoals = useCallback(() => setOverlay(null), []);

  const value = useMemo<GoalsContextValue>(
    () => ({
      goals,
      get,
      dream,
      setDream,
      update,
      setGoal,
      removeGoal,
      changeGoal,
      completeGoal,
      setReview,
      addStaffNote,
      setLongLabel,
      setSetupDone,
      setView,
      overlay,
      openGoals,
      closeGoals,
    }),
    [
      goals, get, dream, setDream, update, setGoal, removeGoal, changeGoal, completeGoal, setReview,
      addStaffNote, setLongLabel, setSetupDone, setView, overlay, openGoals, closeGoals,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 記録の無い選手の空の目標を選手ごとに 1 つだけ作る（get の戻り値の identity を安定させる） */
const EMPTY_CACHE = new Map<string, PlayerGoals>();
function emptyFor(playerId: string): PlayerGoals {
  let e = EMPTY_CACHE.get(playerId);
  if (!e) {
    e = emptyGoals(playerId);
    EMPTY_CACHE.set(playerId, e);
  }
  return e;
}
