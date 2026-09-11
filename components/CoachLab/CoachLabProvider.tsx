"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "../BoardProvider";
import { loadCoachLab, saveCoachLab } from "@/lib/storage";
import {
  MIN_PAYOUT,
  SEED_PROFILES,
  allArticles,
  resolveAuthorId,
  splitSale,
  userIdOf,
} from "@/lib/coachlab";
import type { AuthorProfile, CoachLabState, Follow, Like, Payout, Purchase } from "@/lib/coachlab";

/**
 * コーチラボの状態管理（プロフィール・フォロー・購入・参考になった・閲覧数・振込申請）。
 * 記事本体（本文・下書き・公開）は従来どおり BoardProvider.userArticles 側で持つ。
 * 保存は localStorage（lib/storage.ts の loadCoachLab/saveCoachLab）。詳細は specs/coachlab.md §4。
 */

/** 新規プロフィール作成時のアバター色。名前の文字コードから決定論的に算出する（再訪でも変わらない） */
function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** 保存データにシードのプロフィールが無ければ追加する（seed:trueは上書きしない。ユーザーの"me:"は保持） */
function ensureSeedProfiles(state: CoachLabState): CoachLabState {
  const known = new Set(state.profiles.map((p) => p.id));
  const missing = SEED_PROFILES.filter((p) => !known.has(p.id));
  if (missing.length === 0) return state;
  return { ...state, profiles: [...state.profiles, ...missing] };
}

/** upsertMyProfile() に渡す入力（id・作成/更新時刻・シード印・フォロワー基準値・色は自動管理） */
export type MyProfileInput = Omit<
  AuthorProfile,
  "id" | "createdAt" | "updatedAt" | "seed" | "followerBase" | "hue"
>;

export interface Earnings {
  /** 売上合計（購入時の価格の総和） */
  totalSales: number;
  /** 販売数 */
  count: number;
  /** 受取見込み（手数料差引後の合計） */
  expectedPayout: number;
  /** 振込申請済みの合計 */
  paidOut: number;
  /** 振込可能額（受取見込み − 振込済み） */
  payable: number;
}

interface CoachLabContextValue {
  profiles: AuthorProfile[];
  follows: Follow[];
  purchases: Purchase[];
  likes: Like[];
  views: Record<string, number>;
  payouts: Payout[];
  /** ログイン中の利用者自身のプロフィール（未作成なら null） */
  myProfile: AuthorProfile | null;
  upsertMyProfile: (p: MyProfileInput) => void;
  follow: (authorId: string) => void;
  unfollow: (authorId: string) => void;
  isFollowing: (authorId: string) => boolean;
  /** 重複購入不可（既に購入済みなら何もしない） */
  purchase: (articleId: string, price: number) => void;
  hasPurchased: (articleId: string) => boolean;
  /** 自分の購入記録を取り消す（返金）。呼び出し側で24時間以内かどうかを確認すること */
  refundPurchase: (articleId: string) => void;
  toggleLike: (articleId: string) => void;
  hasLiked: (articleId: string) => boolean;
  /** 同一セッションで同じ記事は1回だけ加算する */
  recordView: (articleId: string) => void;
  /** MIN_PAYOUT未満は記録しない */
  requestPayout: (amount: number) => void;
  earningsFor: (authorId: string) => Earnings;
  followerCount: (authorId: string) => number;
  likeCount: (articleId: string) => number;
  purchaseCount: (articleId: string) => number;
}

const Ctx = createContext<CoachLabContextValue | null>(null);

export function useCoachLab(): CoachLabContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCoachLab must be used within CoachLabProvider");
  return v;
}

export function CoachLabProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const meId = userIdOf(board.auth);

  // lazy初期化で保存データを直接読む（mount後のload→save競合を防ぐ。
  // BoardProvider.userArticles等と同方針。StrictModeの二重マウントでも消えない）
  const [state, setState] = useState<CoachLabState>(() => ensureSeedProfiles(loadCoachLab()));
  useEffect(() => {
    saveCoachLab(state);
  }, [state]);

  // 同一セッションで既に閲覧数を加算した記事ID（リロードで初期化される＝ここでの「セッション」の境界）
  const viewedThisSession = useRef<Set<string>>(new Set());

  const myProfile = useMemo(
    () => state.profiles.find((p) => p.id === meId) ?? null,
    [state.profiles, meId]
  );

  const upsertMyProfile = useCallback(
    (p: MyProfileInput) => {
      setState((s) => {
        const now = Date.now();
        const existing = s.profiles.find((x) => x.id === meId);
        const next: AuthorProfile = existing
          ? { ...existing, ...p, updatedAt: now }
          : { ...p, id: meId, hue: hueFromName(p.name || meId), createdAt: now, updatedAt: now };
        return {
          ...s,
          profiles: existing ? s.profiles.map((x) => (x.id === meId ? next : x)) : [...s.profiles, next],
        };
      });
    },
    [meId]
  );

  const follow = useCallback(
    (authorId: string) => {
      if (authorId === meId) return;
      setState((s) =>
        s.follows.some((f) => f.userId === meId && f.authorId === authorId)
          ? s
          : { ...s, follows: [...s.follows, { userId: meId, authorId, ts: Date.now() }] }
      );
    },
    [meId]
  );
  const unfollow = useCallback(
    (authorId: string) => {
      setState((s) => ({
        ...s,
        follows: s.follows.filter((f) => !(f.userId === meId && f.authorId === authorId)),
      }));
    },
    [meId]
  );
  const isFollowing = useCallback(
    (authorId: string) => state.follows.some((f) => f.userId === meId && f.authorId === authorId),
    [state.follows, meId]
  );

  const purchase = useCallback(
    (articleId: string, price: number) => {
      setState((s) =>
        s.purchases.some((p) => p.userId === meId && p.articleId === articleId)
          ? s
          : { ...s, purchases: [...s.purchases, { userId: meId, articleId, price, ts: Date.now() }] }
      );
    },
    [meId]
  );
  const hasPurchased = useCallback(
    (articleId: string) => state.purchases.some((p) => p.userId === meId && p.articleId === articleId),
    [state.purchases, meId]
  );
  const refundPurchase = useCallback(
    (articleId: string) => {
      setState((s) => ({
        ...s,
        purchases: s.purchases.filter((p) => !(p.userId === meId && p.articleId === articleId)),
      }));
    },
    [meId]
  );

  const toggleLike = useCallback(
    (articleId: string) => {
      setState((s) => {
        const exists = s.likes.some((l) => l.userId === meId && l.articleId === articleId);
        return exists
          ? { ...s, likes: s.likes.filter((l) => !(l.userId === meId && l.articleId === articleId)) }
          : { ...s, likes: [...s.likes, { userId: meId, articleId, ts: Date.now() }] };
      });
    },
    [meId]
  );
  const hasLiked = useCallback(
    (articleId: string) => state.likes.some((l) => l.userId === meId && l.articleId === articleId),
    [state.likes, meId]
  );

  const recordView = useCallback((articleId: string) => {
    if (viewedThisSession.current.has(articleId)) return;
    viewedThisSession.current.add(articleId);
    setState((s) => ({ ...s, views: { ...s.views, [articleId]: (s.views[articleId] ?? 0) + 1 } }));
  }, []);

  const requestPayout = useCallback(
    (amount: number) => {
      if (amount < MIN_PAYOUT) return;
      setState((s) => ({ ...s, payouts: [...s.payouts, { authorId: meId, amount, ts: Date.now() }] }));
    },
    [meId]
  );

  const earningsFor = useCallback(
    (authorId: string): Earnings => {
      const merged = allArticles(board.userArticles);
      const myArticleIds = new Set(
        merged.filter((a) => resolveAuthorId(a, meId) === authorId).map((a) => a.id)
      );
      const mine = state.purchases.filter((p) => myArticleIds.has(p.articleId));
      const totalSales = mine.reduce((sum, p) => sum + p.price, 0);
      const expectedPayout = mine.reduce((sum, p) => sum + splitSale(p.price).creator, 0);
      const paidOut = state.payouts
        .filter((p) => p.authorId === authorId)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        totalSales,
        count: mine.length,
        expectedPayout,
        paidOut,
        payable: Math.max(0, expectedPayout - paidOut),
      };
    },
    [board.userArticles, state.purchases, state.payouts, meId]
  );

  const followerCount = useCallback(
    (authorId: string) => {
      const profile = state.profiles.find((p) => p.id === authorId);
      const base = profile?.followerBase ?? 0;
      const real = state.follows.filter((f) => f.authorId === authorId).length;
      return base + real;
    },
    [state.profiles, state.follows]
  );
  const likeCount = useCallback(
    (articleId: string) => state.likes.filter((l) => l.articleId === articleId).length,
    [state.likes]
  );
  const purchaseCount = useCallback(
    (articleId: string) => state.purchases.filter((p) => p.articleId === articleId).length,
    [state.purchases]
  );

  const value: CoachLabContextValue = {
    profiles: state.profiles,
    follows: state.follows,
    purchases: state.purchases,
    likes: state.likes,
    views: state.views,
    payouts: state.payouts,
    myProfile,
    upsertMyProfile,
    follow,
    unfollow,
    isFollowing,
    purchase,
    hasPurchased,
    refundPurchase,
    toggleLike,
    hasLiked,
    recordView,
    requestPayout,
    earningsFor,
    followerCount,
    likeCount,
    purchaseCount,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
