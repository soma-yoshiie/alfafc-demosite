"use client";

import { useMemo, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import {
  AUTHOR_ROLES,
  ARTICLE_TAGS_SUGGEST,
  LICENSES,
  REGIONS,
  allArticles,
  readingMinutes,
  resolveAuthorId,
  searchArticles,
  searchAuthors,
} from "@/lib/coachlab";
import type { AuthorProfile, License } from "@/lib/coachlab";
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

/**
 * コーチラボ「探す」画面（記事｜指導者の2軸検索）と「フォロー中」画面。
 * 詳細は specs/coachlab.md §5-1・§5-2。ファイルはCoachLabScreen.tsxの構成に合わせ
 * ここに2つのビューをまとめている（新規ファイルはコーチラボ実装計画の一覧どおり）。
 */

type ArticleSort = "new" | "likes" | "purchases";
type PriceFilter = "all" | "free" | "paid";

interface OpenHandlers {
  onOpenAuthor: (authorId: string) => void;
  onOpenArticle: (articleId: string) => void;
}

/** カテゴリ・価格・読者絞り込みの汎用チップ行
 * wrapClassName: モバイルでの折り返し方。項目数が多いタグ・対象行は横スクロール
 * (cl-scrollchips)にしてファーストビューを埋めないようにし、カテゴリ・価格は
 * 従来どおり折り返し(cl-wrapchips)のままにする */
function FilterChips<T extends string>({
  value,
  options,
  onChange,
  wrapClassName = "cl-wrapchips",
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

function TagChips({ selected, onToggle }: { selected: string[]; onToggle: (t: string) => void }) {
  return (
    <div className="catbar cl-scrollchips">
      {ARTICLE_TAGS_SUGGEST.map((t) => (
        <button
          key={t}
          type="button"
          className={`catchip${selected.includes(t) ? " on" : ""}`}
          onClick={() => onToggle(t)}
        >
          #{t}
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
          <span>参考{cl.likeCount(a.id)}</span>
          <span>読了{readingMinutes(a.body)}分</span>
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
        <div className="cl-authorcard-headline">{profile.headline}</div>
        <LicenseBadgeRow licenses={profile.licenses} max={3} />
        {(profile.team || profile.region) && (
          <div className="cl-authorcard-team">
            {[profile.team, profile.region].filter(Boolean).join(" ・ ")}
          </div>
        )}
        <div className="cl-authorcard-stats">
          フォロワー{cl.followerCount(profile.id)} ・ 記事{articleCount}本
        </div>
      </div>
      <FollowButton authorId={profile.id} />
    </div>
  );
}

export function CoachLabExplore({ onOpenAuthor, onOpenArticle }: OpenHandlers) {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();
  const [mode, setMode] = useState<"articles" | "authors">("articles");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [audience, setAudience] = useState<"all" | "coach" | "parent" | "player">("all");
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<ArticleSort>("new");
  const [license, setLicense] = useState<License | "">("");
  const [region, setRegion] = useState<string>("");
  const [role, setRole] = useState<string>("");

  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);

  const articleResults = useMemo(() => {
    let list = searchArticles(merged, {
      q,
      category: cat,
      tag: tags,
      priceFilter,
    });
    if (audience !== "all") list = list.filter((a) => a.audience === audience);
    const sorted = [...list];
    if (sort === "likes") sorted.sort((a, b) => cl.likeCount(b.id) - cl.likeCount(a.id));
    else if (sort === "purchases") sorted.sort((a, b) => cl.purchaseCount(b.id) - cl.purchaseCount(a.id));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, q, cat, tags, priceFilter, audience, sort, cl.likes, cl.purchases]);

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

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <>
      <div className="controls">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="記事・指導者を検索（例：ビルドアップ、S級、〇〇FC）"
        />
      </div>
      <div className="cl-toggle">
        <button type="button" className={mode === "articles" ? "on" : ""} onClick={() => setMode("articles")}>
          記事
        </button>
        <button type="button" className={mode === "authors" ? "on" : ""} onClick={() => setMode("authors")}>
          指導者
        </button>
      </div>

      {mode === "articles" ? (
        <>
          <FilterChips
            value={cat}
            onChange={setCat}
            options={[
              { key: "all", label: "すべて" },
              ...ARTICLE_CATEGORIES.map((c) => ({ key: c as string, label: c })),
            ]}
          />
          <FilterChips
            value={priceFilter}
            onChange={setPriceFilter}
            options={[
              { key: "all", label: "価格：すべて" },
              { key: "free", label: "無料" },
              { key: "paid", label: "有料" },
            ]}
          />
          <FilterChips
            value={audience}
            onChange={setAudience}
            wrapClassName="cl-scrollchips"
            options={[
              { key: "all", label: "対象：すべて" },
              { key: "coach", label: "指導者向け" },
              { key: "parent", label: "保護者向け" },
              { key: "player", label: "選手向け" },
            ]}
          />
          <TagChips selected={tags} onToggle={toggleTag} />
          <div className="cl-sortrow">
            <span>並び替え</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as ArticleSort)}>
              <option value="new">新着</option>
              <option value="likes">参考になった数</option>
              <option value="purchases">購入数</option>
            </select>
            <span className="cl-count">{articleResults.length}本</span>
          </div>
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
          <div className="cl-filterrow">
            <select value={license} onChange={(e) => setLicense(e.target.value as License | "")}>
              <option value="">資格：すべて</option>
              {LICENSES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">地域：すべて</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">役割：すべて</option>
              {AUTHOR_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
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
    </>
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
