"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Career, CareerItemList, PlayerProfile, ProfileRecordList } from "@/lib/profile";
import { emptyProfile } from "@/lib/profile";
import { sampleProfiles } from "@/lib/sampleProfiles";
import { SAMPLE_PLAYERS } from "@/lib/sampleTeam";
import { hasProfileSeedMarker, loadProfiles, loadState, markProfileSeeded, saveProfiles } from "@/lib/storage";
import { useBoard } from "./BoardProvider";

/**
 * 選手のプロフィール（記録）の Context（player-hub §1-1）。保存は別キー soccer_tactics_profile_v1
 * （lib/storage.ts の loadProfiles/saveProfiles）。変更のたびに同期で保存し、失敗（容量超過）は
 * トーストで知らせる（saveTeam の bool 返しと同じ作法）。
 *
 * マウント位置：TeamProvider の内側（components/AppFlow.tsx）。updatedBy（board.auth）・トースト・
 * サンプル投入の判定（名簿）に BoardProvider だけを使うので外側でも動くが、個人ページ側の部品が
 * useTeam() と useProfiles() を同じ階層で使えること、team の設定（学校区分など）を将来参照できることを
 * 優先して内側に置いた。TeamProvider は profile を読まない（名簿から消えた選手の記録は残す）。
 */

/** 更新の自動記録（updatedAt/updatedBy）は Provider が付けるので、呼び出し側は渡さなくてよい（渡しても上書きされる） */
type Stamp = "updatedAt" | "updatedBy";
type Input<T> = Omit<T, Stamp> & Partial<Pick<T, Extract<keyof T, Stamp>>>;

type RecordItem<K extends ProfileRecordList> = PlayerProfile[K][number];
type CareerItem<K extends CareerItemList> = Career[K][number];

/** 基本の補足の項目。patch にこのどれかが入っていれば basicUpdatedAt/By を付ける（player-hub §1-1） */
const BASIC_KEYS = ["birthDate", "sex", "school", "termSystem"] as const;

/** 記録に更新の自動記録（いつ・だれが）を付ける */
function stamp<T extends object>(item: T, by: string): T & { updatedAt: number; updatedBy: string } {
  return { ...item, updatedAt: Date.now(), updatedBy: by };
}

export interface ProfileContextValue {
  /** 保存されている全選手のプロフィール（記録の無い選手は含まれない） */
  profiles: Record<string, PlayerProfile>;
  /** その選手のプロフィール。記録が無ければ空のプロフィールを返す（保存はしない。同じ選手には同じ空を返す） */
  get: (playerId: string) => PlayerProfile;
  /** 基本の補足（生年月日・性別・在籍校・学期制。これらを含むと basicUpdatedAt/By も付く）や gradeGoal など、プロフィール直下の項目を部分更新する */
  update: (playerId: string, patch: Partial<PlayerProfile>) => void;
  /** 成長・テスト・通知表・検定の記録を 1 件保存する（id が同じなら置き換え、無ければ追加） */
  setRecord: <K extends ProfileRecordList>(playerId: string, list: K, item: Input<RecordItem<K>>) => void;
  removeRecord: (playerId: string, list: ProfileRecordList, id: string) => void;
  /** 進路の直下の項目（方向・エリア・本人の希望など）を部分更新する */
  updateCareer: (playerId: string, patch: Partial<Career>) => void;
  /** 進路の志望校・活動・面談・アクションを 1 件保存する（id が同じなら置き換え、無ければ追加） */
  setCareerItem: <K extends CareerItemList>(playerId: string, list: K, item: Input<CareerItem<K>>) => void;
  removeCareerItem: (playerId: string, list: CareerItemList, id: string) => void;
}

const Ctx = createContext<ProfileContextValue | null>(null);
export function useProfiles(): ProfileContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfiles must be used within ProfileProvider");
  return v;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  // lazy 初期化で保存データを直接読む（TeamProvider と同じ。AppFlow はスプラッシュ後にだけマウントするので SSR とずれない）
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>(() => loadProfiles());
  // 最新の全件。同じ tick に続けて更新しても前の更新を取りこぼさないよう、更新はこの ref を基準に同期で行う
  const ref = useRef(profiles);

  // updatedBy と toast は最新を ref で読む（更新関数の identity を安定させる）
  const auth = board.auth;
  const byRef = useRef("");
  byRef.current = auth.role === "coach" ? "staff:" + auth.name : "player";
  const toastRef = useRef(board.toast);
  toastRef.current = board.toast;

  /** 全件を置き換えて保存する（メモリは必ず更新し、保存に失敗したらトーストで知らせる） */
  const commit = useCallback((next: Record<string, PlayerProfile>) => {
    ref.current = next;
    setProfiles(next);
    if (!saveProfiles(next)) {
      toastRef.current("保存できませんでした（端末の保存容量がいっぱいです）");
    }
  }, []);

  /** その選手の現在のプロフィール（無ければ空。保存しない） */
  const base = useCallback((playerId: string): PlayerProfile => ref.current[playerId] ?? emptyProfile(playerId), []);

  /** 選手 1 人ぶんを差し替える。プロフィール自身の updatedAt/updatedBy も更新する */
  const put = useCallback(
    (next: PlayerProfile) => {
      commit({ ...ref.current, [next.playerId]: { ...next, updatedAt: Date.now(), updatedBy: byRef.current } });
    },
    [commit]
  );

  const update = useCallback(
    (playerId: string, patch: Partial<PlayerProfile>) => {
      const cur = base(playerId);
      const next: PlayerProfile = { ...cur, ...patch, playerId };
      // gradeGoal・career も更新の記録を付ける（プロフィール直下の項目を丸ごと差し替える呼び方でも）
      if (patch.gradeGoal) next.gradeGoal = stamp(patch.gradeGoal, byRef.current);
      if (patch.career) next.career = stamp(patch.career, byRef.current);
      // 基本の補足だけの更新の記録（put が付けるプロフィール全体の updatedAt は、どの記録の更新でも動く）
      if (BASIC_KEYS.some((k) => k in patch)) {
        next.basicUpdatedAt = Date.now();
        next.basicUpdatedBy = byRef.current;
      }
      put(next);
    },
    [base, put]
  );

  const setRecord = useCallback(
    <K extends ProfileRecordList>(playerId: string, list: K, item: Input<RecordItem<K>>) => {
      const cur = base(playerId);
      const rec = stamp(item, byRef.current) as unknown as RecordItem<K> & { id: string };
      const arr = cur[list] as unknown as { id: string }[];
      const nextArr = arr.some((x) => x.id === rec.id)
        ? arr.map((x) => (x.id === rec.id ? rec : x))
        : [...arr, rec];
      put({ ...cur, [list]: nextArr } as PlayerProfile);
    },
    [base, put]
  );

  const removeRecord = useCallback(
    (playerId: string, list: ProfileRecordList, id: string) => {
      const cur = ref.current[playerId];
      if (!cur) return;
      const arr = cur[list] as unknown as { id: string }[];
      if (!arr.some((x) => x.id === id)) return;
      put({ ...cur, [list]: arr.filter((x) => x.id !== id) } as PlayerProfile);
    },
    [put]
  );

  const updateCareer = useCallback(
    (playerId: string, patch: Partial<Career>) => {
      const cur = base(playerId);
      put({ ...cur, career: stamp({ ...cur.career, ...patch }, byRef.current) });
    },
    [base, put]
  );

  const setCareerItem = useCallback(
    <K extends CareerItemList>(playerId: string, list: K, item: Input<CareerItem<K>>) => {
      const cur = base(playerId);
      const rec = stamp(item, byRef.current) as unknown as CareerItem<K> & { id: string };
      const arr = cur.career[list] as unknown as { id: string }[];
      const nextArr = arr.some((x) => x.id === rec.id)
        ? arr.map((x) => (x.id === rec.id ? rec : x))
        : [...arr, rec];
      put({ ...cur, career: stamp({ ...cur.career, [list]: nextArr }, byRef.current) });
    },
    [base, put]
  );

  const removeCareerItem = useCallback(
    (playerId: string, list: CareerItemList, id: string) => {
      const cur = ref.current[playerId];
      if (!cur) return;
      const arr = cur.career[list] as unknown as { id: string }[];
      if (!arr.some((x) => x.id === id)) return;
      put({ ...cur, career: stamp({ ...cur.career, [list]: arr.filter((x) => x.id !== id) }, byRef.current) });
    },
    [put]
  );

  // 初回マウントのサンプル投入（player-hub §1-5）。プロフィールの保存が空で、サンプル投入済みマーカーが無く、
  // 名簿に p08 がいる（デモチーム）ときだけ、名簿にいる 3 人分のサンプルを入れてマーカーを書く。
  // 名簿は board.state ではなく保存済みの名簿を読む：BoardProvider の復元(HYDRATE)は mount 後の effect で、
  // 子のこの effect のほうが先に走るため、board.state は最初は初期のサンプル名簿（常に p08 がいる）のままになる。
  // 保存が無い初回起動はそのサンプル名簿に p08 がいる。StrictMode で effect が 2 回走っても 2 回目は保存が空でない
  useEffect(() => {
    if (Object.keys(ref.current).length > 0 || hasProfileSeedMarker()) return;
    const roster = loadState()?.players ?? SAMPLE_PLAYERS;
    if (!roster.some((p) => p.id === "p08")) return;
    const seed = sampleProfiles();
    const next: Record<string, PlayerProfile> = {};
    roster.forEach((p) => {
      if (seed[p.id]) next[p.id] = seed[p.id];
    });
    commit(next);
    markProfileSeeded();
  }, [commit]);

  const get = useCallback(
    (playerId: string): PlayerProfile => profiles[playerId] ?? emptyFor(playerId),
    [profiles]
  );

  const value = useMemo<ProfileContextValue>(
    () => ({ profiles, get, update, setRecord, removeRecord, updateCareer, setCareerItem, removeCareerItem }),
    [profiles, get, update, setRecord, removeRecord, updateCareer, setCareerItem, removeCareerItem]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 記録の無い選手の空のプロフィールを選手ごとに 1 つだけ作る（get の戻り値の identity を安定させ、依存配列で無駄に再計算させない） */
const EMPTY_CACHE = new Map<string, PlayerProfile>();
function emptyFor(playerId: string): PlayerProfile {
  let e = EMPTY_CACHE.get(playerId);
  if (!e) {
    e = emptyProfile(playerId);
    EMPTY_CACHE.set(playerId, e);
  }
  return e;
}
