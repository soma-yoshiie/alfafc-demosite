"use client";

import type { MatchRecord } from "@/lib/types";
import type { MatchupPost, MatchupRequest, OpponentTeam } from "@/lib/matchup";
import { fmtPostDates, matchCountWith, postPlaceLabel, upcomingDates } from "@/lib/matchup";

/**
 * 相手の募集の一覧（specs/matchup-demo.md §4-2）。カードに出す情報は 5 つだけ：
 * チーム名・日付・場所・所属リーグ・対戦回数（距離・年代・人数制・本数・審判・費用・中止の回数・一言は詳細だけ）。
 * 全体が 1 つのボタン。右端の「申し込む ›」も独立したボタンにはせず、押すとカードと同じく詳細を開く。
 */

export function PostList({
  posts,
  teams,
  matches,
  selectedId,
  onOpen,
  myRequestFor,
  today,
  lead,
}: {
  posts: MatchupPost[];
  teams: OpponentTeam[];
  matches: MatchRecord[];
  selectedId: string | null;
  onOpen: (postId: string) => void;
  myRequestFor: (postId: string) => MatchupRequest | undefined;
  /** 今日（"YYYY-MM-DD"）。過ぎた日付はカードに出さない */
  today: string;
  /** 件数の行の左に置くもの（PC で絞り込み列を隠しているときの「絞り込み」ボタン） */
  lead?: React.ReactNode;
}) {
  return (
    <div className="mt-listwrap">
      <div className="mt-listbar">
        {lead}
        <span className="mt-count">{posts.length} 件・近い順</span>
      </div>
      {posts.length === 0 ? (
        <div className="empty-msg">条件に合う募集はありません。絞り込みをゆるめるか、自分の募集を出してみてください。</div>
      ) : (
        <div className="mt-cards">
          {posts.map((p) => {
            const t = teams.find((x) => x.id === p.teamId);
            if (!t) return null;
            const n = matchCountWith(t.name, matches);
            const req = myRequestFor(p.id);
            const state = req?.status === "pending" ? "申し込み中" : req?.status === "accepted" ? "承諾済み" : null;
            return (
              <button
                key={p.id}
                type="button"
                className={`mt-card${selectedId === p.id ? " sel" : ""}`}
                aria-current={selectedId === p.id ? "true" : undefined}
                onClick={() => onOpen(p.id)}
              >
                <span className="mt-card-h">
                  {state && <span className="mt-state">{state}</span>}
                  <span className="mt-name">{t.name}</span>
                  <span className="mt-apply">{state ? "詳細 ›" : "申し込む ›"}</span>
                </span>
                <span className="mt-meta">
                  <span className="mt-date">{fmtPostDates(upcomingDates(p, today))}</span>
                  <span className="mt-sep" aria-hidden="true" />
                  <span className="mt-place">{postPlaceLabel(p, t)}</span>
                </span>
                <span className="mt-tags">
                  <span className="mt-tag">{t.league}</span>
                  <span className="mt-tag">{n === 0 ? "初対戦" : `対戦 ${n} 回`}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
