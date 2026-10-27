"use client";

import { useMemo } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import {
  allArticles,
  readingMinutes,
  resolveAuthorId,
  searchArticles,
  searchAuthors,
} from "@/lib/coachlab";
import type { AuthorProfile } from "@/lib/coachlab";
import { ARTICLE_CATEGORIES } from "@/lib/articles";
import type { UserArticle } from "@/lib/articles";
import {
  AuthorMini,
  FollowButton,
  LicenseBadgeRow,
  PriceTag,
  resolveAuthorProfile,
  useMeId,
  Avatar,
} from "./CoachLabParts";
import { ClFilterPanel, clFilterLine } from "./CoachLabFilter";
import type { ClExplore } from "./CoachLabFilter";

/**
 * コーチラボ「探す」画面（記事｜指導者の2軸検索）と「フォロー中」画面。
 * 詳細は specs/coachlab.md §5-1・§5-2。ファイルはCoachLabScreen.tsxの構成に合わせ
 * ここに2つのビューをまとめている（新規ファイルはコーチラボ実装計画の一覧どおり）。
 */

interface OpenHandlers {
  onOpenAuthor: (authorId: string) => void;
  onOpenArticle: (articleId: string) => void;
}

/** 種類（カテゴリ）のチップ行。1 行に収め、はみ出したら横スクロール（cl-scrollchips）。
 * 価格・対象・ハッシュタグ・並び替えは絞り込み（CoachLabFilter）へ移した（ux-fix R2-5） */
function FilterChips<T extends string>({
  value,
  options,
  onChange,
  wrapClassName = "cl-scrollchips",
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  wrapClassName?: string;
}) {
  return (
    <div className={`catbar ${wrapClassName}`}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`catchip${value === o.key ? " on" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ArticleCard({
  a,
  onOpenAuthor,
  onOpenArticle,
}: { a: UserArticle } & OpenHandlers) {
  const cl = useCoachLab();
  const meId = useMeId();
  const profile = resolveAuthorProfile(a, cl.profiles, meId);
  const paid = !!a.price && a.price > 0;
  return (
    <div
      className={`cl-card${paid ? " paid" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenArticle(a.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenArticle(a.id);
        }
      }}
    >
      <span className="cl-cardcat">{a.category}</span>
      <div className="cl-cardtitle">{a.title}</div>
      <div className="cl-cardlead">{a.lead || (a.body[0] ?? "").slice(0, 70)}</div>
      <div className="cl-cardfoot">
        <AuthorMini profile={profile} onOpen={onOpenAuthor} />
        <div className="cl-cardmeta">
          <PriceTag price={a.price} />
          {cl.likeCount(a.id) > 0 && <span>参考になった {cl.likeCount(a.id)}</span>}
          <span>{readingMinutes(a.body)} 分で読める</span>
        </div>
      </div>
    </div>
  );
}

function AuthorCard({
  profile,
  articleCount,
  onOpenAuthor,
}: {
  profile: AuthorProfile;
  articleCount: number;
} & Pick<OpenHandlers, "onOpenAuthor">) {
  const cl = useCoachLab();
  return (
    <div
      className="cl-authorcard"
      onClick={() => onOpenAuthor(profile.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenAuthor(profile.id);
        }
      }}
    >
      <Avatar name={profile.name} hue={profile.hue} size="lg" />
      <div className="cl-authorcard-tx">
        <div className="cl-authorcard-name">{profile.name}</div>
        {(profile.headline || profile.team) && (
          <div className="cl-authorcard-headline">
            {[profile.headline, profile.team].filter(Boolean).join("・")}
          </div>
        )}
        <LicenseBadgeRow licenses={profile.licenses} max={3} />
        <div className="cl-authorcard-stats">
          フォロワー{cl.followerCount(profile.id)} ・ 記事 {articleCount} 件
        </div>
      </div>
      <FollowButton authorId={profile.id} />
    </div>
  );
}

export function CoachLabExplore({
  f,
  pc,
  onOpenFilter,
  onOpenAuthor,
  onOpenArticle,
}: {
  /** 検索・切替・絞り込みの状態（CoachLabScreen が持つ。ヘッダーのボタン・シートと共有） */
  f: ClExplore;
  pc: boolean;
  /** スマホ：絞り込みのシートを開く */
  onOpenFilter: () => void;
} & OpenHandlers) {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();
  const { mode, q, cat, price, audience, tags, sort, license, region, role } = f;

  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);

  const articleResults = useMemo(() => {
    let list = searchArticles(merged, {
      q,
      category: cat,
      tag: tags,
      priceFilter: price,
    });
    if (audience !== "all") list = list.filter((a) => a.audience === audience);
    const sorted = [...list];
    if (sort === "likes") sorted.sort((a, b) => cl.likeCount(b.id) - cl.likeCount(a.id));
    else if (sort === "purchases") sorted.sort((a, b) => cl.purchaseCount(b.id) - cl.purchaseCount(a.id));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, q, cat, tags, price, audience, sort, cl.likes, cl.purchases]);

  const articleCountByAuthor = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of merged) {
      const id = resolveAuthorId(a, meId);
      map[id] = (map[id] ?? 0) + 1;
    }
    return map;
  }, [merged, meId]);

  const authorResults = useMemo(
    () =>
      searchAuthors(cl.profiles, {
        q,
        license: license || undefined,
        region: region || undefined,
        role: role || undefined,
      }),
    [cl.profiles, q, license, region, role]
  );

  // 一覧の上の 1 行：選んだ条件だけ（何も選んでいなければ出さない。練習試合の .mt-filterline と同じ）
  const lineText = clFilterLine(f);
  const count = mode === "articles" ? articleResults.length : authorResults.length;
  const filterLine =
    lineText === "" ? null : pc ? (
      <div className="cl-filterline-wrap">
        <div className="mt-filterline cl-filterline-pc">
          <span className="mt-filterline-tx">
            {lineText}（{count} 件）
          </span>
          <button type="button" className="mt-filterline-act" onClick={f.reset}>
            条件をもどす
          </button>
        </div>
      </div>
    ) : (
      <div className="cl-filterline-wrap">
        <button type="button" className="mt-filterline" onClick={onOpenFilter}>
          <span className="mt-filterline-tx">
            {lineText}（{count} 件）
          </span>
          <span className="mt-filterline-act">変更</span>
        </button>
      </div>
    );

  return (
    <div className={`cl-explore${pc ? " cl-explorepc" : ""}`}>
      {pc && (
        <aside className="clside" aria-label="絞り込み">
          <div className="clside-in">
            <ClFilterPanel f={f} compact />
          </div>
        </aside>
      )}
      <div className="cl-explorebody">
        <div className="controls">
          <input
            className="search"
            value={q}
            onChange={(e) => f.setQ(e.target.value)}
            placeholder="記事・指導者を検索（例：ビルドアップ、S級、〇〇FC）"
          />
        </div>
        <div className="cl-toggle">
          <button type="button" className={mode === "articles" ? "on" : ""} onClick={() => f.setMode("articles")}>
            記事
          </button>
          <button type="button" className={mode === "authors" ? "on" : ""} onClick={() => f.setMode("authors")}>
            指導者
          </button>
        </div>

        {mode === "articles" ? (
          <>
            <FilterChips
              value={cat}
              onChange={f.setCat}
              options={[
                { key: "all", label: "すべて" },
                ...ARTICLE_CATEGORIES.map((c) => ({ key: c as string, label: c })),
              ]}
            />
            {filterLine}
            {articleResults.length === 0 ? (
              <div className="empty-msg">該当する記事がありません。条件を減らすか、指導者で探してみてください。</div>
            ) : (
              <div className="cl-grid">
                {articleResults.map((a) => (
                  <ArticleCard key={a.id} a={a} onOpenAuthor={onOpenAuthor} onOpenArticle={onOpenArticle} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {filterLine}
            {authorResults.length === 0 ? (
              <div className="empty-msg">該当する指導者がいません。条件を減らしてみてください。</div>
            ) : (
              <div className="cl-authorlist">
                {authorResults.map((p) => (
                  <AuthorCard
                    key={p.id}
                    profile={p}
                    articleCount={articleCountByAuthor[p.id] ?? 0}
                    onOpenAuthor={onOpenAuthor}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function CoachLabFollowing({ onOpenAuthor, onOpenArticle }: OpenHandlers) {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();
  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);

  const followingIds = useMemo(
    () => new Set(cl.follows.filter((f) => f.userId === meId).map((f) => f.authorId)),
    [cl.follows, meId]
  );

  const feed = useMemo(
    () => merged.filter((a) => followingIds.has(resolveAuthorId(a, meId))),
    [merged, followingIds, meId]
  );

  if (followingIds.size === 0) {
    const recommended = [...cl.profiles]
      .filter((p) => p.id !== meId)
      .sort((a, b) => cl.followerCount(b.id) - cl.followerCount(a.id))
      .slice(0, 3);
    return (
      <>
        <div className="empty-msg">まだフォローしていません。気になる指導者をフォローすると、新着記事がここに並びます。</div>
        {recommended.length > 0 && (
          <>
            <div className="setsec-h">おすすめの指導者</div>
            <div className="cl-authorlist">
              {recommended.map((p) => (
                <AuthorCard
                  key={p.id}
                  profile={p}
                  articleCount={merged.filter((a) => resolveAuthorId(a, meId) === p.id).length}
                  onOpenAuthor={onOpenAuthor}
                />
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  if (feed.length === 0) {
    return <div className="empty-msg">フォロー中の指導者の新着記事はまだありません。</div>;
  }

  return (
    <div className="cl-grid">
      {feed.map((a) => (
        <ArticleCard key={a.id} a={a} onOpenAuthor={onOpenAuthor} onOpenArticle={onOpenArticle} />
      ))}
    </div>
  );
}
