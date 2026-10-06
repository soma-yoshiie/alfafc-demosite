"use client";

import type { MatchRecord } from "@/lib/types";
import type { MatchupPost, MatchupRequest, OpponentTeam } from "@/lib/matchup";
import { fmtPostDate, fmtPostDates, matchCountWith, VENUE_KIND_NOTE_MINE } from "@/lib/matchup";
import { localDateStr } from "@/lib/dates";
import { useMatchups } from "./MatchupProvider";
import { PostFacts } from "./PostDetail";

/**
 * 自分の募集（specs/matchup-demo.md §4-4）。一覧（.mt-card）と詳細（募集の内容＋届いた申し込み＋締め切り）。
 * デモなので、新しい申し込みが自動で届くことはない（シードの 1 件だけ）。
 */

/** 募集に届いた申し込み（相手から）。自分が相手の募集に出したもの（fromTeamId が "me"）は含めない */
function incomingOf(requests: MatchupRequest[], postId: string): MatchupRequest[] {
  return requests.filter((r) => r.postId === postId && r.fromTeamId !== "me");
}

/** 一覧の並び：募集中が先、日にちの近い順 */
export function sortMyPosts(posts: MatchupPost[]): MatchupPost[] {
  return posts
    .filter((p) => p.teamId === "me")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      const fa = [...a.dates].sort()[0] ?? "";
      const fb = [...b.dates].sort()[0] ?? "";
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
}

export function MyPostList({
  posts,
  teams,
  requests,
  selectedId,
  onOpen,
}: {
  posts: MatchupPost[];
  teams: OpponentTeam[];
  requests: MatchupRequest[];
  selectedId: string | null;
  onOpen: (postId: string) => void;
}) {
  if (posts.length === 0) {
    return <div className="empty-msg">まだ募集がありません。「募集する」から相手チームに向けて出せます。</div>;
  }
  return (
    <div className="mt-cards">
      {posts.map((p) => {
        const open = p.status === "open";
        const pending = open ? incomingOf(requests, p.id).filter((r) => r.status === "pending").length : 0;
        const place = p.venue.name ?? VENUE_KIND_NOTE_MINE[p.venue.kind];
        // 締め切った募集の 3 行目：承諾した相手がいれば「{チーム名}と決定」、いなければ何も出さない（状態は 1 行目に出ている）
        const decided = open ? undefined : incomingOf(requests, p.id).find((r) => r.status === "accepted");
        const decidedName = decided ? teams.find((t) => t.id === decided.fromTeamId)?.name : undefined;
        return (
          <button
            key={p.id}
            type="button"
            className={`mt-card${selectedId === p.id ? " sel" : ""}`}
            aria-current={selectedId === p.id ? "true" : undefined}
            onClick={() => onOpen(p.id)}
          >
            <span className="mt-card-h">
              <span className={`mt-state${open ? "" : " off"}`}>{open ? "募集中" : "締め切り"}</span>
              <span className="mt-name">{fmtPostDates(p.dates)}</span>
              <span className="mt-apply">詳細 ›</span>
            </span>
            <span className="mt-meta">
              <span className="mt-place">
                {place}・{p.ageGroup}・{p.format} 人制・{p.minutes} 分 × {p.periods} 本
              </span>
            </span>
            {(open || decidedName) && (
              <span className="mt-tags">
                {pending > 0 ? (
                  <span className="mt-tag hot">申し込み {pending} 件</span>
                ) : (
                  <span className="mt-none">{open ? "まだ申し込みはありません" : `${decidedName}と決定`}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 届いた時刻：今日なら「9:12」、それ以外は「10/3(土)」 */
function fmtReqTime(ts: number, today: string): string {
  const d = new Date(ts);
  const day = localDateStr(d);
  if (day === today) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return fmtPostDate(day);
}

export function MyPostDetail({
  post,
  teams,
  matches,
}: {
  post: MatchupPost;
  teams: OpponentTeam[];
  matches: MatchRecord[];
}) {
  const mt = useMatchups();
  const open = post.status === "open";
  const reqs = incomingOf(mt.requests, post.id);
  const today = localDateStr();

  const onAccept = (r: MatchupRequest) => {
    // 承諾すると相手のスレッドができる。そのままチャットへ移る
    mt.accept(r.id);
    mt.openThread(`opp:${r.fromTeamId}`);
  };
  const onClose = () => {
    if (window.confirm("この募集を締め切りますか？新しい申し込みは受け付けなくなります。")) mt.closePost(post.id);
  };

  return (
    <div className="mt-dv">
      <div className="scroll mt-dv-body nofoot">
        <div className="mt-dhead">
          <div className="mt-dhead-tx">
            <h2 className="mt-dname">{fmtPostDates(post.dates)}</h2>
            <div className="mt-dsub">
              <span className={`mt-state${open ? "" : " off"}`}>{open ? "募集中" : "締め切り"}</span>
            </div>
          </div>
        </div>

        <section className="mt-sec">
          <h3 className="mt-sech">募集の内容</h3>
          <PostFacts post={post} mine />
        </section>

        <section className="mt-sec">
          <h3 className="mt-sech">届いた申し込み</h3>
          {reqs.length === 0 ? (
            <p className="mt-none">まだ申し込みはありません。</p>
          ) : (
            <ul className="mt-reqs">
              {reqs.map((r) => {
                const t = teams.find((x) => x.id === r.fromTeamId);
                if (!t) return null;
                const n = matchCountWith(t.name, matches);
                return (
                  <li key={r.id} className="mt-req">
                    <div className="mt-req-main">
                      <div className="mt-req-h">
                        <span className="mt-req-name">{t.name}</span>
                        <span className="mt-req-ts">{fmtReqTime(r.ts, today)}</span>
                      </div>
                      <div className="mt-tags">
                        <span className="mt-tag">{t.league}</span>
                        <span className="mt-tag">{n === 0 ? "初対戦" : `対戦 ${n} 回`}</span>
                      </div>
                      {r.message && <p className="mt-req-msg">{r.message}</p>}
                    </div>
                    <div className="mt-req-acts">
                      {r.status === "pending" && open && (
                        <>
                          <button type="button" className="st-btn" onClick={() => onAccept(r)}>
                            承諾
                          </button>
                          <button type="button" className="st-btn ghost" onClick={() => mt.decline(r.id)}>
                            辞退
                          </button>
                        </>
                      )}
                      {r.status === "pending" && !open && <span className="mt-req-done">締め切りました</span>}
                      {r.status === "accepted" && (
                        <>
                          <span className="mt-req-done">承諾しました</span>
                          <button type="button" className="st-btn ghost" onClick={() => mt.openThread(r.threadKey ?? `opp:${r.fromTeamId}`)}>
                            チャットで相談する
                          </button>
                        </>
                      )}
                      {r.status === "declined" && <span className="mt-req-done">辞退しました</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {open && (
          <button type="button" className="mt-close" onClick={onClose}>
            募集を締め切る
          </button>
        )}
      </div>
    </div>
  );
}
