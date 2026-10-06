"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MatchupFilter, MatchupPost, MatchupRequest, MatchupStore, OpponentTeam } from "@/lib/matchup";
import {
  fmtPostDate,
  loadMatchupFilter,
  loadMatchupStore,
  normalizeMatchupFilter,
  postPlaceLabel,
  saveMatchupFilter,
  saveMatchupStore,
  TIME_BAND_SHORT,
  upcomingDates,
} from "@/lib/matchup";
import { localDateStr } from "@/lib/dates";
import { saveChatSeg } from "@/lib/storage";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";

/**
 * 練習試合の状態（specs/matchup-demo.md §3）。相手チーム・募集・申し込みはデモのデータ（lib/matchup.ts。
 * ブラウザ内保存）で、サーバーは無い。「相手の了承」はデモとして、申し込みから 4 秒後に自動で起きる
 * （acceptAt を保存しておくので、再読み込みしても戻ったときに処理される）。了承されると相手チームとの
 * 会話 "opp:<teamId>" ができ、相手から 1 通届く（チャットの「メッセージ」で調整する）。
 *
 * マウント位置：ProfileProvider の内側（components/AppFlow.tsx。useBoard／useTeam を使う）。
 * 動くのはスタッフ（board.auth.role === "coach"）だけ。選手・保護者は申し込みの処理も自動承諾もしない。
 */

export interface MatchupCtx {
  teams: OpponentTeam[];
  posts: MatchupPost[];
  requests: MatchupRequest[];
  filter: MatchupFilter;
  setFilter: (f: MatchupFilter) => void;
  /** 自分の募集を出す（トーストは出さない。画面側が「募集を出しました」を出す） */
  addPost: (p: Omit<MatchupPost, "id" | "teamId" | "status" | "createdAt">) => void;
  closePost: (id: string) => void;
  /** 自分 → 相手の募集に申し込む。4 秒後に相手が承諾する（デモ） */
  apply: (postId: string, message: string, date?: string) => void;
  /** 自分の募集に届いた申し込みを承諾する（募集は締め切り、チャットができる） */
  accept: (requestId: string) => void;
  decline: (requestId: string) => void;
  /** その募集への自分の申し込み（無ければ undefined） */
  myRequestFor: (postId: string) => MatchupRequest | undefined;
  /** 自分の募集（開いているもの）に届いた pending */
  pendingIncoming: MatchupRequest[];
  /** 承諾でチャットができたとき、その会話キーを知らせる（画面が詳細を開いていれば移動に使う） */
  lastAccepted: { key: string; teamId: string; at: number } | null;
  /** 相手チームとの会話を開く（チャットの「メッセージ」へ移り、その会話を出す。HomePanels のメッセージの行と同じ順） */
  openThread: (key: string) => void;
}

const Ctx = createContext<MatchupCtx | null>(null);
export function useMatchups(): MatchupCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMatchups must be used within MatchupProvider");
  return v;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** デモの承諾までの待ち時間 */
const DEMO_ACCEPT_MS = 4000;

export function MatchupProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const team = useTeam();
  const coach = board.auth.role === "coach";
  const stage = team.team.schoolStage ?? "junior";

  // lazy 初期化で保存データを直接読む（AppFlow はスプラッシュ後にだけマウントするので SSR とずれない）
  const [store, setStore] = useState<MatchupStore>(() => loadMatchupStore());
  const [filter, setFilterState] = useState<MatchupFilter>(() => loadMatchupFilter(stage));
  const [lastAccepted, setLastAccepted] = useState<MatchupCtx["lastAccepted"]>(null);

  // 最新の全件。同じ tick に続けて更新しても取りこぼさないよう、更新はこの ref を基準に同期で行う
  const ref = useRef(store);
  const boardRef = useRef(board);
  boardRef.current = board;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  /** 全件を置き換えて保存する（メモリは必ず更新し、保存に失敗したらトーストで知らせる） */
  const commit = useCallback((next: MatchupStore) => {
    ref.current = next;
    setStore(next);
    if (!saveMatchupStore(next)) boardRef.current.toast("保存できませんでした（端末の保存容量がいっぱいです）");
  }, []);

  const setFilter = useCallback((f: MatchupFilter) => {
    setFilterState(f);
    saveMatchupFilter(f);
  }, []);

  // 学校区分を変えたあとに前の年代だけが残ると一覧が空になる。今の区分に合わない年代だけなら既定に戻して保存する
  useEffect(() => {
    const next = normalizeMatchupFilter(filterRef.current, stage);
    if (next.ageGroups.join(",") !== filterRef.current.ageGroups.join(",")) setFilter(next);
  }, [stage, setFilter]);

  /** 承諾の共通処理：申し込みを accepted にして、相手から 1 通を送り、lastAccepted を更新する（トーストは呼び出し側） */
  const settle = useCallback(
    (requestId: string, kind: "demo" | "incoming") => {
      const cur = ref.current;
      const req = cur.requests.find((r) => r.id === requestId);
      if (!req || req.status !== "pending") return null;
      const post = cur.posts.find((p) => p.id === req.postId);
      const opp = cur.teams.find((t) => t.id === (kind === "demo" ? post?.teamId : req.fromTeamId));
      if (!post || !opp) return null;
      const key = `opp:${opp.id}`;
      // 申し込んだ日（無ければ今日以降で最初の日。すべて過ぎていれば募集の最初の日）
      const upcoming = upcomingDates(post, localDateStr());
      const first = req.date && post.dates.includes(req.date) ? req.date : upcoming[0] ?? [...post.dates].sort()[0];
      const text =
        kind === "demo"
          ? post.venue.kind === "either"
            ? `申し込みありがとうございます。${fmtPostDate(first)} ${TIME_BAND_SHORT[post.timeBand]}でお願いします。会場と集合時間、審判の分担はここで相談しましょう。`
            : `申し込みありがとうございます。${fmtPostDate(first)} ${TIME_BAND_SHORT[post.timeBand]}、${
                post.venue.kind === "away" ? "そちらの会場" : postPlaceLabel(post, opp)
              }でお願いします。集合時間や審判の分担はここで相談しましょう。`
          : `承諾ありがとうございます。${fmtPostDate(first)}、よろしくお願いします。集合時間と審判の分担を決めましょう。`;
      commit({
        ...cur,
        requests: cur.requests.map((r) => (r.id === req.id ? { ...r, status: "accepted", threadKey: key, acceptAt: undefined } : r)),
        // 自分の募集に来た申し込みを承諾したら、1 件で埋まる前提で募集を締め切る
        posts: kind === "incoming" ? cur.posts.map((p) => (p.id === post.id ? { ...p, status: "closed" } : p)) : cur.posts,
      });
      boardRef.current.sendMessage(
        { to: key, from: key, fromName: opp.staff.name, fromRole: opp.staff.role, text },
        { toast: false }
      );
      setLastAccepted({ key, teamId: opp.id, at: Date.now() });
      return opp;
    },
    [commit]
  );

  const apply = useCallback(
    (postId: string, message: string, date?: string) => {
      const cur = ref.current;
      const post = cur.posts.find((p) => p.id === postId);
      if (!post || post.teamId === "me") return;
      // 1 つの募集に出せる申し込みは 1 件（申し込み中・承諾済みがあれば何もしない）
      if (cur.requests.some((r) => r.postId === postId && r.fromTeamId === "me" && r.status !== "declined")) return;
      const now = Date.now();
      commit({
        ...cur,
        requests: [
          ...cur.requests,
          {
            id: newId("mr"),
            postId,
            fromTeamId: "me",
            message: message.trim(),
            status: "pending",
            ts: now,
            acceptAt: now + DEMO_ACCEPT_MS,
            date: date && post.dates.includes(date) ? date : undefined,
          },
        ],
      });
      board.toast("申し込みを送りました。相手が承諾するとチャットで相談できます");
    },
    [commit, board]
  );

  const accept = useCallback(
    (requestId: string) => {
      if (settle(requestId, "incoming")) board.toast("承諾しました。チャットで相談できます");
    },
    [settle, board]
  );

  const decline = useCallback(
    (requestId: string) => {
      const cur = ref.current;
      const req = cur.requests.find((r) => r.id === requestId);
      if (!req || req.status !== "pending") return;
      commit({ ...cur, requests: cur.requests.map((r) => (r.id === requestId ? { ...r, status: "declined", acceptAt: undefined } : r)) });
      board.toast("辞退しました");
    },
    [commit, board]
  );

  const addPost = useCallback<MatchupCtx["addPost"]>(
    (p) => {
      const cur = ref.current;
      commit({
        ...cur,
        posts: [...cur.posts, { ...p, id: newId("mp"), teamId: "me", status: "open", createdAt: Date.now() }],
      });
    },
    [commit]
  );

  const closePost = useCallback(
    (id: string) => {
      const cur = ref.current;
      commit({ ...cur, posts: cur.posts.map((p) => (p.id === id && p.teamId === "me" ? { ...p, status: "closed" } : p)) });
    },
    [commit]
  );

  // デモの承諾：1 秒ごとに、時刻が来た自分の申し込みを承諾する（再読み込みしても acceptAt は残っているので戻ったときに処理される）
  useEffect(() => {
    if (!coach) return;
    const tick = () => {
      const now = Date.now();
      const due = ref.current.requests.filter((r) => r.status === "pending" && r.fromTeamId === "me" && r.acceptAt != null && r.acceptAt <= now);
      due.forEach((r) => {
        const opp = settle(r.id, "demo");
        if (opp) boardRef.current.toast(`${opp.name}が申し込みを承諾しました。チャットで相談できます`);
      });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [coach, settle]);

  const openThread = useCallback((key: string) => {
    const b = boardRef.current;
    // setScreen がシートを閉じるので、必ず先に呼ぶ（HomePanels のメッセージの行と同じ順）
    saveChatSeg("msg");
    b.setScreen("chat");
    b.openSheet({ type: "chat", chatTo: key });
  }, []);

  const myRequestFor = useCallback(
    (postId: string) => {
      const mine = store.requests.filter((r) => r.postId === postId && r.fromTeamId === "me");
      // 申し込み中・承諾済みを優先（辞退のあとに出し直した場合は新しいほう）
      return mine.filter((r) => r.status !== "declined").pop() ?? mine.pop();
    },
    [store.requests]
  );

  const pendingIncoming = useMemo(
    () =>
      store.requests.filter(
        (r) =>
          r.status === "pending" &&
          r.fromTeamId !== "me" &&
          store.posts.some((p) => p.id === r.postId && p.teamId === "me" && p.status === "open")
      ),
    [store.requests, store.posts]
  );

  const value = useMemo<MatchupCtx>(
    () => ({
      teams: store.teams,
      posts: store.posts,
      requests: store.requests,
      filter,
      setFilter,
      addPost,
      closePost,
      apply,
      accept,
      decline,
      myRequestFor,
      pendingIncoming,
      lastAccepted,
      openThread,
    }),
    [store, filter, setFilter, addPost, closePost, apply, accept, decline, myRequestFor, pendingIncoming, lastAccepted, openThread]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
