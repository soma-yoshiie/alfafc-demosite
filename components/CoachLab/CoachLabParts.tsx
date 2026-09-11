"use client";

import { useEffect, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import { topLicense, userIdOf } from "@/lib/coachlab";
import type { AuthorProfile, License } from "@/lib/coachlab";
import type { UserArticle } from "@/lib/articles";

/**
 * コーチラボ共通部品（アバター・資格バッジ・フォローボタン・価格タグ）と
 * 表示用の小さなヘルパー。画面コンポーネント(CoachLabExplore等)から使う。
 * 詳細は specs/coachlab.md §5・§7。
 */

/** 名前の頭文字（丸バッジに使う。空文字は"?"にフォールバック） */
function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

/** プロフィール作成時と同じ決定論的な色算出（CoachLabProvider.hueFromNameと同じ式） */
export function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function fmtYen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

/** 価格表示（0 or 未設定は「無料」） */
export function priceLabel(price?: number | null): string {
  return price && price > 0 ? fmtYen(price) : "無料";
}

export function fmtDate(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
}

export function fmtDateShort(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function fmtDateTime(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 経歴の期間表示（"2019" 〜 "2021-04" のような文字列をそのまま繋ぐ。to無し=現在） */
export function fmtCareerPeriod(from: string, to?: string): string {
  return `${from} 〜 ${to && to.trim() ? to : "現在"}`;
}

/** 記事の本文（段落配列）の総文字数 */
export function totalChars(body: string[]): number {
  return body.reduce((sum, p) => sum + p.length, 0);
}

/**
 * 記事の著者プロフィールを解決する。実プロフィールが見つからない場合
 * （投稿はしたがプロフィール未作成、または旧データ）は、記事に保存された
 * author名から最低限の表示用プロフィールを合成する（画面を壊さないためのフォールバック）。
 */
export function resolveAuthorProfile(
  a: Pick<UserArticle, "author" | "authorId" | "ts">,
  profiles: AuthorProfile[],
  meId: string
): AuthorProfile {
  const id = a.authorId ?? meId;
  const found = profiles.find((p) => p.id === id);
  if (found) return found;
  return {
    id,
    name: a.author,
    headline: "",
    bio: "",
    licenses: [],
    career: [],
    hue: hueFromName(a.author || id),
    createdAt: a.ts,
    updatedAt: a.ts,
  };
}

/** ログイン中の利用者IDを求める（画面側での使い回し用の薄いラッパー） */
export function useMeId(): string {
  const board = useBoard();
  return userIdOf(board.auth);
}

const PC_MQ = "(min-width: 1024px)";

/** PC幅(1024px以上)かどうかを追跡する（ConsoleScreens.tsx usePc()と同じ手法） */
export function useIsPc(): boolean {
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

/** 名前の頭文字を丸で表示するアバター */
export function Avatar({
  name,
  hue,
  size = "md",
}: {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={`cl-avatar cl-avatar-${size}`}
      style={{ background: `hsl(${hue} 60% 90%)`, color: `hsl(${hue} 55% 28%)` }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </div>
  );
}

export function LicenseBadge({ license }: { license: License }) {
  return <span className="cl-badge">{license}</span>;
}

/** 資格バッジを最大 max 個まで表示し、残りは「+N」でまとめる */
export function LicenseBadgeRow({ licenses, max = 3 }: { licenses: License[]; max?: number }) {
  if (licenses.length === 0) return null;
  const shown = licenses.slice(0, max);
  const rest = licenses.length - shown.length;
  return (
    <div className="cl-badgerow">
      {shown.map((l) => (
        <LicenseBadge key={l} license={l} />
      ))}
      {rest > 0 && <span className="cl-badge cl-badge-more">+{rest}</span>}
    </div>
  );
}

/** カード等で使う「最上位資格バッジ1つ」 */
export function TopLicenseBadge({ profile }: { profile: AuthorProfile | null | undefined }) {
  if (!profile) return null;
  const lic = topLicense(profile);
  if (!lic) return null;
  return <LicenseBadge license={lic} />;
}

export function PriceTag({ price }: { price?: number | null }) {
  const paid = !!price && price > 0;
  return <span className={`cl-price${paid ? " cl-price-paid" : ""}`}>{priceLabel(price)}</span>;
}

/**
 * フォロー／フォロー中ボタン。自分自身の authorId のときは何も描画しない
 * （指導者ページ側で「プロフィールを編集」に出し分ける）。
 */
export function FollowButton({ authorId, compact }: { authorId: string; compact?: boolean }) {
  const meId = useMeId();
  const cl = useCoachLab();
  if (authorId === meId) return null;
  const following = cl.isFollowing(authorId);
  return (
    <button
      type="button"
      className={`cl-followbtn${following ? " on" : ""}${compact ? " compact" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (following) cl.unfollow(authorId);
        else cl.follow(authorId);
      }}
    >
      {following ? "フォロー中" : "フォローする"}
    </button>
  );
}

/** 指導者のミニ表示行（アバター・名前・最上位バッジ・チーム名）。クリックで指導者ページへ */
export function AuthorMini({
  profile,
  onOpen,
  showTeam = true,
}: {
  profile: AuthorProfile;
  onOpen?: (authorId: string) => void;
  showTeam?: boolean;
}) {
  return (
    <button
      type="button"
      className="cl-authormini"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(profile.id);
      }}
      disabled={!onOpen}
    >
      <Avatar name={profile.name} hue={profile.hue} size="sm" />
      <span className="cl-authormini-tx">
        <span className="cl-authormini-name">{profile.name}</span>
        <span className="cl-authormini-sub">
          <TopLicenseBadge profile={profile} />
          {showTeam && profile.team && <span className="cl-authormini-team">{profile.team}</span>}
        </span>
      </span>
    </button>
  );
}

/** 「戻る／ホーム」の見出し裏に置く控えめな区切り見出し（既存.setsec-hを流用） */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="setsec-h">{children}</div>;
}
