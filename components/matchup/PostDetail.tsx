"use client";

import { useId, useState } from "react";
import type { MatchRecord } from "@/lib/types";
import type { MatchupPost, OpponentTeam } from "@/lib/matchup";
import {
  fmtPostDate,
  matchCountWith,
  recentMatchesWith,
  REFEREE_LABEL,
  TIME_BAND_LABEL,
  upcomingDates,
  VENUE_FEE_LABEL,
  VENUE_KIND_NOTE,
  VENUE_KIND_NOTE_MINE,
  VISIBILITY_LABEL,
} from "@/lib/matchup";
import { localDateStr } from "@/lib/dates";
import { Seg } from "../hub/common";
import { useMatchups } from "./MatchupProvider";

/**
 * 相手の募集の詳細と申し込み（specs/matchup-demo.md §4-3）。PC は右の列、スマホは全画面（MobileHeader は画面側）。
 * 上：チーム（名前・地域・リーグ・年代・対戦回数・直前の中止）／「募集の内容」「チーム」の表／下：申し込み。
 * 申し込み → 「申し込み中」→（デモ：4 秒後に相手が承諾）→ 「承諾されました」＋「チャットで相談する」。
 * スマホは下の欄を画面の下に固定（本文だけがスクロール）、PC は内容の末尾に続ける。
 */

/** 表の 1 行（.phubkv-row と同じ 1px の罫） */
export function KvRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-kv-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * 「募集の内容」の表。相手の募集も自分の募集も同じ（mine=自分の募集：会場の向きが逆になり、「見せる相手」が出る）。
 * 日にち・時間帯・会場・費用・年代・人数制・本数と時間・審判・レベルの目安・相手に伝えること
 */
export function PostFacts({ post, team, mine }: { post: MatchupPost; team?: OpponentTeam; mine?: boolean }) {
  // 相手の募集は今日以降の日だけ（自分の募集は締め切り後も見返すので全部。今日以降が無いときも全部）
  const upcoming = upcomingDates(post, localDateStr());
  const dates = !mine && upcoming.length > 0 ? upcoming : [...post.dates].sort();
  const name = post.venue.name ?? (!mine && post.venue.kind === "own" ? team?.ground : undefined);
  const kind = (mine ? VENUE_KIND_NOTE_MINE : VENUE_KIND_NOTE)[post.venue.kind];
  return (
    <dl className="mt-kv">
      <KvRow label="日にち">
        {dates.map((d) => (
          <span key={d} className="mt-line">
            {fmtPostDate(d)}
          </span>
        ))}
      </KvRow>
      <KvRow label="時間帯">{TIME_BAND_LABEL[post.timeBand]}</KvRow>
      <KvRow label="会場">
        {name ? (
          <>
            {name}
            <span className="mt-sub">{kind}</span>
          </>
        ) : (
          kind
        )}
      </KvRow>
      <KvRow label="費用">{VENUE_FEE_LABEL[post.venue.fee]}</KvRow>
      <KvRow label="年代">{post.ageGroup}</KvRow>
      <KvRow label="人数制">{post.format} 人制</KvRow>
      <KvRow label="本数と時間">
        {post.minutes} 分 × {post.periods} 本
      </KvRow>
      <KvRow label="審判">{REFEREE_LABEL[post.referee]}</KvRow>
      <KvRow label="レベルの目安">{post.levelHint}</KvRow>
      {mine && <KvRow label="見せる相手">{VISIBILITY_LABEL[post.visibility]}</KvRow>}
      {post.note && <KvRow label="相手に伝えること">{post.note}</KvRow>}
    </dl>
  );
}

/** 「9/21 勝 2-1」（試合記録の 1 件。勝・分・敗は予定の結果タグと同じ言い方） */
function matchLine(m: MatchRecord): string {
  const [, mo, d] = m.date.split("-").map(Number);
  const r = m.ourScore > m.theirScore ? "勝" : m.ourScore === m.theirScore ? "分" : "敗";
  return `${mo}/${d} ${r} ${m.ourScore}-${m.theirScore}`;
}

export function PostDetail({
  post,
  team,
  matches,
  pc,
}: {
  post: MatchupPost;
  team: OpponentTeam;
  matches: MatchRecord[];
  pc: boolean;
}) {
  const mt = useMatchups();
  const [msg, setMsg] = useState("");
  const msgId = useId();
  const dates = upcomingDates(post, localDateStr());
  const [date, setDate] = useState<string | null>(null);
  const pickedDate = date && dates.includes(date) ? date : dates[0];
  const mine = mt.myRequestFor(post.id);
  // 辞退された申し込みは「なし」に戻す（出し直せる）
  const req = mine && mine.status !== "declined" ? mine : undefined;
  const n = matchCountWith(team.name, matches);
  const recent = recentMatchesWith(team.name, matches);

  return (
    <div className="mt-dv">
      <div className="scroll mt-dv-body">
        <div className="mt-dhead">
          <div className="mt-dhead-tx">
            {pc && <h2 className="mt-dname">{team.name}</h2>}
            <div className="mt-dsub">
              {team.area}・{team.league}・{team.ageGroups.join("・")}
            </div>
          </div>
        </div>
        <div className="mt-tags mt-dtags">
          <span className="mt-tag">{n === 0 ? "初対戦" : `対戦 ${n} 回`}</span>
          <span className="mt-tag">{team.cancelCount === 0 ? "直前の中止なし" : `直前の中止 ${team.cancelCount} 回`}</span>
        </div>

        <section className="mt-sec">
          <h3 className="mt-sech">募集の内容</h3>
          <PostFacts post={post} team={team} />
        </section>

        <section className="mt-sec">
          <h3 className="mt-sech">チーム</h3>
          <dl className="mt-kv">
            <KvRow label="活動地域">{team.area}</KvRow>
            <KvRow label="所属リーグ">{team.league}</KvRow>
            <KvRow label="年代">{team.ageGroups.join("・")}</KvRow>
            <KvRow label="ホームグラウンド">{team.ground}</KvRow>
            <KvRow label="距離の目安">約 {team.distanceKm}km</KvRow>
            {recent.length > 0 && (
              <KvRow label="最近の対戦">
                {recent.map((m) => (
                  <span key={m.id} className="mt-line">
                    {matchLine(m)}
                  </span>
                ))}
              </KvRow>
            )}
            {team.note && <KvRow label="チームの一言">{team.note}</KvRow>}
          </dl>
        </section>
      </div>

      <div className="mt-detail-foot">
        {!req && (
          <>
            {dates.length >= 2 && (
              <>
                <div className="mt-foot-label">申し込む日にち</div>
                <Seg
                  options={dates.map((d) => ({ value: d, label: fmtPostDate(d) }))}
                  value={pickedDate}
                  onChange={(v) => v && setDate(v)}
                  ariaLabel="申し込む日にち"
                />
              </>
            )}
            <label className="mt-foot-label" htmlFor={msgId}>
              相手への一言（任意）
            </label>
            <textarea
              id={msgId}
              className="st-input mt-msg"
              rows={2}
              maxLength={200}
              placeholder="例）11 人制 20 分 3 本で希望です"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
            <button type="button" className="st-btn" onClick={() => mt.apply(post.id, msg, dates.length >= 2 ? pickedDate : undefined)}>
              申し込む
            </button>
          </>
        )}
        {req?.status === "pending" && (
          <>
            <div className="mt-pending" role="status">
              <span>申し込み中。相手が承諾するとチャットで相談できます</span>
            </div>
            {req.message && <p className="mt-foot-note">送った一言：{req.message}</p>}
          </>
        )}
        {req?.status === "accepted" && (
          <>
            <div className="mt-accepted" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12.5l2.7 2.7L16 9.8" />
              </svg>
              承諾されました
            </div>
            <button type="button" className="st-btn" onClick={() => mt.openThread(req.threadKey ?? `opp:${team.id}`)}>
              チャットで相談する
            </button>
          </>
        )}
      </div>
    </div>
  );
}
