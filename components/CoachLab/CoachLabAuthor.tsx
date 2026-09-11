"use client";

import { useMemo, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import { allArticles, resolveAuthorId } from "@/lib/coachlab";
import { Avatar, FollowButton, LicenseBadgeRow, fmtCareerPeriod, useMeId } from "./CoachLabParts";
import { ArticleCard } from "./CoachLabExplore";

/**
 * 指導者ページ（プロフィール・経歴・自己紹介・記事一覧）。詳細は specs/coachlab.md §5-3。
 */
export default function CoachLabAuthor({
  authorId,
  onOpenArticle,
  onOpenAuthor,
  onGoProfile,
}: {
  authorId: string;
  onOpenArticle: (articleId: string) => void;
  onOpenAuthor: (authorId: string) => void;
  onGoProfile: () => void;
}) {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();
  const [tab, setTab] = useState<"articles" | "career" | "bio">("articles");

  const profile = cl.profiles.find((p) => p.id === authorId);
  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);
  const articles = useMemo(
    () => merged.filter((a) => resolveAuthorId(a, meId) === authorId),
    [merged, authorId, meId]
  );
  const totalLikes = articles.reduce((sum, a) => sum + cl.likeCount(a.id), 0);
  const isMe = authorId === meId;

  if (!profile) {
    // 記事は投稿済みだがプロフィール未作成の自分自身のケース（表示は記事のauthor名から
    // 合成しているため、指導者ページとしては未作成として案内する）
    if (isMe) {
      return (
        <div className="empty-msg">
          まだプロフィールを作成していません。
          <br />
          <button type="button" className="bigbtn" style={{ margin: "14px auto 0", maxWidth: 260 }} onClick={onGoProfile}>
            プロフィールを作成する
          </button>
        </div>
      );
    }
    return <div className="empty-msg">指導者情報が見つかりませんでした。</div>;
  }

  const career = [...profile.career].sort((a, b) => {
    const bKey = b.to && b.to.trim() ? b.to : "9999";
    const aKey = a.to && a.to.trim() ? a.to : "9999";
    if (aKey !== bKey) return aKey < bKey ? 1 : -1;
    return a.from < b.from ? 1 : -1;
  });

  return (
    <>
      <div className="cl-authorhead">
        <Avatar name={profile.name} hue={profile.hue} size="lg" />
        <div className="cl-authorhead-tx">
          <div className="cl-authorhead-name">{profile.name}</div>
          <div className="cl-authorhead-headline">{profile.headline}</div>
          <div className="cl-authorhead-meta">
            {[profile.role, profile.team, profile.region].filter(Boolean).join(" ・ ")}
          </div>
          <LicenseBadgeRow licenses={profile.licenses} max={99} />
          {(profile.licenses.length > 0 || profile.career.length > 0) && (
            <div className="cl-authorhead-note">資格・経歴は本人の申告に基づきます</div>
          )}
          <div className="cl-authorhead-stats">
            <span>フォロワー {cl.followerCount(profile.id)}</span>
            <span>記事 {articles.length}本</span>
            <span>参考になった {totalLikes}</span>
          </div>
        </div>
        {isMe ? (
          <button type="button" className="bigbtn ghost cl-authorhead-editbtn" onClick={onGoProfile}>
            プロフィールを編集
          </button>
        ) : (
          <FollowButton authorId={profile.id} />
        )}
      </div>

      <div className="cl-toggle cl-authortabs">
        <button type="button" className={tab === "articles" ? "on" : ""} onClick={() => setTab("articles")}>
          記事
        </button>
        <button type="button" className={tab === "career" ? "on" : ""} onClick={() => setTab("career")}>
          経歴
        </button>
        <button type="button" className={tab === "bio" ? "on" : ""} onClick={() => setTab("bio")}>
          自己紹介
        </button>
      </div>

      {tab === "articles" &&
        (articles.length === 0 ? (
          <div className="empty-msg">まだ記事がありません。</div>
        ) : (
          <div className="cl-grid">
            {articles.map((a) => (
              <ArticleCard key={a.id} a={a} onOpenAuthor={onOpenAuthor} onOpenArticle={onOpenArticle} />
            ))}
          </div>
        ))}

      {tab === "career" &&
        (career.length === 0 ? (
          <div className="empty-msg">経歴はまだ登録されていません。</div>
        ) : (
          <div className="cl-timeline">
            {career.map((c, i) => (
              <div key={i} className="cl-timeline-row">
                <div className="cl-timeline-dot" aria-hidden="true" />
                <div className="cl-timeline-body">
                  <div className="cl-timeline-period">{fmtCareerPeriod(c.from, c.to)}</div>
                  <div className="cl-timeline-org">{c.org}</div>
                  <div className="cl-timeline-role">{c.role}</div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === "bio" && (
        <div className="cl-bio">
          {profile.bio.trim() ? profile.bio : <span className="empty-msg" style={{ padding: 0 }}>自己紹介はまだ登録されていません。</span>}
        </div>
      )}
    </>
  );
}
