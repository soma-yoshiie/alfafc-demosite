"use client";

import { useMemo, useState } from "react";
import type { ChatMessage, ChatReads, Player, SchoolStage } from "@/lib/types";
import { dmThreadKey, gradeLabel } from "@/lib/types";
import {
  attachmentLabel,
  dmSummaries,
  fmtListDate,
  groupSummaries,
  messageReadStats,
  oppSummaries,
  type GroupSummary,
} from "@/lib/chat";
import { groupsOfPlayer, playerInGroup, resolveFilterGroup } from "@/lib/groups";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { GroupChips, useGroupFilter } from "./GroupChips";
import { useMatchups } from "./matchup/MatchupProvider";

/*
 * チャットの入口（home-chat-groups-roster §2-1）。「お知らせ｜メッセージ」の切替は廃止し、1 画面にした。
 * 会話の一覧は 3 つの区画：
 *   グループ（全員・学年・カスタム。team.groups の順）／選手・保護者（1 対 1）／相手チーム（スタッフだけ）。
 * 選手・保護者は自分が入っているグループと、スタッフとの 1 対 1 だけ。
 * スレッドは board シート chat（スマホ）か、PC の 2 ペイン（ChatScreen）の右のペイン（onOpen を渡す）に開く。
 * 「お知らせにする」はグループのスレッドの吹き出しのメニューから（ChatThread）。ホームの「最新のお知らせ」に出る。
 */

/**
 * スマホのヘッダー右アクション。スタッフは「新しいメッセージ」（1 対 1 の相手を選ぶ）。
 * 選手・保護者（enabled=false）は無し。グループは作らない（設定の「学年・グループ」で追加・編集する）
 */
export function useChatHeaderAction(enabled: boolean): { label: string; onClick: () => void } | null {
  const board = useBoard();
  if (!enabled) return null;
  return { label: "新しいメッセージ", onClick: () => board.openSheet({ type: "chatNew" }) };
}

/** 視点。スタッフ＝viewer.role が coach。それ以外は選手・保護者（コーチの選手プレビューも含む） */
function useChatViewer() {
  const board = useBoard();
  const team = useTeam();
  const isStaff = team.viewer.role === "coach";
  const memberId = isStaff ? null : team.viewer.memberPlayerId ?? board.auth.playerId ?? null;
  const me = memberId ? board.state.players.find((p) => p.id === memberId) ?? null : null;
  // 既読にするのは選手本人がログインしているときだけ（コーチのプレビューでは選手の既読を付けない）
  const real = !isStaff && board.auth.role === "player";
  return { board, team, isStaff, memberId, me, real };
}

function firstChar(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

/* ---------------- ChatHome ---------------- */

export interface ChatHomeProps {
  /** PC 幅（行を PC の密度にする） */
  pc?: boolean;
  /** PC の一覧の上に「＋ 新しいメッセージ」を出す（スタッフ。スマホはヘッダーの右アクション） */
  showCompose?: boolean;
  /** スレッドの開き方。引数は会話キー（"p:<id>"／"grp:…"／"opp:<id>"）。省略時は board シート chat（PC の 2 ペインだけ右のペインへ出す） */
  onOpen?: (key: string) => void;
  /** PC の 2 ペインで開いている会話キー（行の選択表示に使う） */
  selectedKey?: string | null;
}

/** 一覧の最新の発言の 1 行（グループは「岡本：本文」、1 対 1 のスタッフの発言は「あなた：」。添付だけなら添付の名前） */
function previewOf(m: ChatMessage, group: boolean): string {
  const body = m.text?.replace(/\s+/g, " ").trim() || (m.attachments?.[0] ? attachmentLabel(m.attachments[0]) : "");
  if (group) return `${m.fromName?.trim() || (m.from === "coach" ? "スタッフ" : "選手")}：${body}`;
  return m.from === "coach" ? `あなた：${body}` : body;
}

/**
 * スタッフの「選手・保護者」「相手チーム」の会話の行（新しい順）。選手との会話と相手チームとの会話を混ぜる。
 * 名簿から消した選手・一覧に無い相手チームの会話は行にしない（赤丸 staffUnreadTotal も同じ条件で数える）
 */
export function staffConversationRows(
  messages: ChatMessage[],
  reads: ChatReads,
  players: Player[],
  oppTeams: ReturnType<typeof useMatchups>["teams"]
) {
  const dm = dmSummaries(messages, reads)
    .map((s) => ({ s, p: players.find((x) => x.id === s.playerId) ?? null }))
    .filter((r): r is { s: (typeof r)["s"]; p: Player } => !!r.p)
    .map((r) => ({ kind: "dm" as const, key: r.s.key, name: r.p.name, last: r.s.last, unread: r.s.unread, p: r.p }));
  const opp = oppSummaries(messages, reads)
    .map((s) => ({ s, t: oppTeams.find((x) => x.id === s.teamId) ?? null }))
    .filter((r): r is { s: (typeof r)["s"]; t: (typeof oppTeams)[number] } => !!r.t)
    .map((r) => ({ kind: "opp" as const, key: r.s.key, name: r.t.name, last: r.s.last, unread: r.s.unread, t: r.t }));
  return [...dm, ...opp].sort((a, b) => b.last.ts - a.last.ts);
}

export default function ChatHome({ pc, showCompose, onOpen, selectedKey }: ChatHomeProps) {
  const { board, team, isStaff, memberId, me } = useChatViewer();
  const { teams: oppTeams } = useMatchups();
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const players = board.state.players;

  const open = (key: string) => (onOpen ? onOpen(key) : board.openSheet({ type: "chat", chatTo: key }));

  /* ---- グループの区画（スタッフは全グループ、選手・保護者は自分が入っているグループだけ） ---- */
  const groupRows = useMemo(
    () =>
      groupSummaries(
        board.messages,
        board.chatReads,
        team.groups,
        isStaff ? { side: "staff" } : { side: "member", playerId: memberId ?? "", me }
      ),
    [board.messages, board.chatReads, team.groups, isStaff, memberId, me]
  );

  /* ---- 選手・保護者／相手チームの区画（スタッフ） ---- */
  const staffRows = useMemo(
    () => (isStaff ? staffConversationRows(board.messages, board.chatReads, players, oppTeams) : []),
    [isStaff, board.messages, board.chatReads, players, oppTeams]
  );

  const kw = q.trim().toLowerCase();
  const hit = (key: string, name: string, unread: number) => {
    if (unreadOnly && unread <= 0) return false;
    if (!kw) return true;
    if (name.toLowerCase().includes(kw)) return true;
    return board.messages.some((m) => m.to === key && (m.text ?? "").toLowerCase().includes(kw));
  };
  const groups = groupRows.filter((g) => hit(g.key, g.label, g.unread));
  const dmRows = staffRows.filter((r) => r.kind === "dm").filter((r) => hit(r.key, r.name, r.unread));
  const oppRows = staffRows.filter((r) => r.kind === "opp").filter((r) => hit(r.key, r.name, r.unread));
  const filtering = unreadOnly || !!kw;

  if (!isStaff && !memberId) return <div className="empty-msg">選手が選択されていません。</div>;

  const compose = () => board.openSheet({ type: "chatNew" });

  const groupRow = (g: GroupSummary) => {
    const sel = selectedKey === g.key;
    return (
      <button
        key={g.key}
        type="button"
        className={`convrow${sel ? " sel" : ""}`}
        aria-current={sel ? "true" : undefined}
        data-thread={g.key}
        onClick={() => open(g.key)}
      >
        <span className="convdotbox" aria-hidden="true">
          <i className="convdot" style={{ background: g.color }} />
        </span>
        <div className="convmain">
          <div className="convtop">
            <span className="convname">{g.label}</span>
          </div>
          <div className={`convprev${g.unread > 0 ? " unread" : ""}`}>
            {g.last ? previewOf(g.last, true) : "メッセージはまだありません"}
          </div>
        </div>
        <div className="convaside">
          {g.last && <span className="convdate">{fmtListDate(g.last.ts)}</span>}
          {g.unread > 0 && (
            <span className="chatunreadbadge" aria-label={`未読 ${g.unread}件`}>
              {g.unread}
            </span>
          )}
        </div>
      </button>
    );
  };

  /* ---- 選手・保護者：自分が入っているグループと、スタッフとの 1 対 1（見出し「スタッフ」） ---- */
  if (!isStaff) {
    const key = dmThreadKey(memberId as string);
    const last = board.messages.filter((m) => m.to === key).sort((a, b) => b.ts - a.ts)[0];
    const unread = board.messages.filter(
      (m) => m.to === key && m.from === "coach" && m.ts > (board.chatReads[key]?.member ?? 0)
    ).length;
    const sel = selectedKey === key;
    return (
      <div className={`chathome${pc ? " pc" : ""}`}>
        <div className="msglist">
          <section className="chatsec" aria-label="グループ">
            <h3 className="chatsech">グループ</h3>
            <div className="convlist">{groupRows.map(groupRow)}</div>
          </section>
          <section className="chatsec" aria-label="スタッフ">
            <h3 className="chatsech">スタッフ</h3>
            <div className="convlist">
              <button
                type="button"
                className={`convrow${sel ? " sel" : ""}`}
                aria-current={sel ? "true" : undefined}
                data-thread={key}
                onClick={() => open(key)}
              >
                <div className="convavatar">ス</div>
                <div className="convmain">
                  <div className="convtop">
                    <span className="convname">スタッフ</span>
                  </div>
                  <div className={`convprev${unread > 0 ? " unread" : ""}`}>
                    {last ? previewOf(last, false).replace(/^あなた：/, "") : "メッセージはまだありません"}
                  </div>
                </div>
                <div className="convaside">
                  {last && <span className="convdate">{fmtListDate(last.ts)}</span>}
                  {unread > 0 && (
                    <span className="chatunreadbadge" aria-label={`未読 ${unread}件`}>
                      {unread}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ---- スタッフ：グループ／選手・保護者／相手チーム ---- */
  return (
    <div className={`chathome${pc ? " pc" : ""}`}>
      <div className="msglist">
        {showCompose && (
          <button type="button" className="annbtn ghost chatnewbtn" onClick={compose}>
            ＋ 新しいメッセージ
          </button>
        )}
        <input
          type="search"
          className="chatsearch"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前・本文で検索"
          aria-label="メッセージを検索"
        />
        <div className="chatfilterchips" role="group" aria-label="表示の絞り込み">
          <button type="button" className={`chatfilterchip${!unreadOnly ? " on" : ""}`} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            すべて
          </button>
          <button type="button" className={`chatfilterchip${unreadOnly ? " on" : ""}`} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            未読
          </button>
        </div>

        {groups.length > 0 && (
          <section className="chatsec" aria-label="グループ">
            <h3 className="chatsech">グループ</h3>
            <div className="convlist">{groups.map(groupRow)}</div>
          </section>
        )}

        {(dmRows.length > 0 || !filtering) && (
          <section className="chatsec" aria-label="選手・保護者">
            <h3 className="chatsech">選手・保護者</h3>
            {dmRows.length === 0 ? (
              <div className="empty-msg">まだメッセージはありません</div>
            ) : (
              <div className="convlist">
                {dmRows.map((r) => {
                  if (r.kind !== "dm") return null;
                  const sel = selectedKey === r.key;
                  const gl = groupsOfPlayer(r.p, team.groups)
                    .map((g) => g.label)
                    .join("・");
                  return (
                    <button
                      key={r.key}
                      type="button"
                      className={`convrow${sel ? " sel" : ""}`}
                      aria-current={sel ? "true" : undefined}
                      data-thread={r.key}
                      onClick={() => open(r.key)}
                    >
                      <div className="convavatar">{firstChar(r.name)}</div>
                      <div className="convmain">
                        <div className="convtop">
                          <span className="convname">{r.name}</span>
                          {gl && <span className="convcount">{gl}</span>}
                        </div>
                        <div className={`convprev${r.unread > 0 ? " unread" : ""}`}>{previewOf(r.last, false)}</div>
                      </div>
                      <div className="convaside">
                        <span className="convdate">{fmtListDate(r.last.ts)}</span>
                        {r.unread > 0 && (
                          <span className="chatunreadbadge" aria-label={`未読 ${r.unread}件`}>
                            {r.unread}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {oppRows.length > 0 && (
          <section className="chatsec" aria-label="相手チーム">
            <h3 className="chatsech">相手チーム</h3>
            <div className="convlist">
              {oppRows.map((r) => {
                if (r.kind !== "opp") return null;
                const sel = selectedKey === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    className={`convrow${sel ? " sel" : ""}`}
                    aria-current={sel ? "true" : undefined}
                    data-thread={r.key}
                    onClick={() => open(r.key)}
                  >
                    <div className="convavatar">対</div>
                    <div className="convmain">
                      <div className="convtop">
                        <span className="convname">{r.name}</span>
                        <span className="convtag">対戦相手</span>
                      </div>
                      <div className={`convprev${r.unread > 0 ? " unread" : ""}`}>{previewOf(r.last, false)}</div>
                    </div>
                    <div className="convaside">
                      <span className="convdate">{fmtListDate(r.last.ts)}</span>
                      {r.unread > 0 && (
                        <span className="chatunreadbadge" aria-label={`未読 ${r.unread}件`}>
                          {r.unread}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {filtering && groups.length === 0 && dmRows.length === 0 && oppRows.length === 0 && (
          <div className="empty-msg">{unreadOnly && !kw ? "未読のメッセージはありません。" : "該当する会話がありません。"}</div>
        )}
        {/* 一覧の末尾からも書ける（PC の一覧の上のボタン・スマホのヘッダーと同じ入口） */}
        {!filtering && (
          <button type="button" className="st-btn ghost annlistend chatnewbtn" onClick={compose}>
            ＋ 新しいメッセージ
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 学年見出し＋背番号順の選手一覧（既読パネルと「新しいメッセージ」の選手選びで共用） ---------------- */

/**
 * 学年見出し＋背番号順の選手一覧（既読パネルと「新しいメッセージ」の選手選びで共用。ux-fix R3-5）。
 * onPick を渡すと行が button になる（選手選び）。無ければ表示だけ（既読パネル）
 */
export function PlayersByGrade({
  players,
  stage,
  onPick,
}: {
  players: Player[];
  stage: SchoolStage;
  onPick?: (playerId: string) => void;
}) {
  // 学年ごとに束ねる（学年の小さい順。学年が無い選手は末尾）。同じ学年は背番号順（背番号なしは末尾）
  const map = new Map<number | null, Player[]>();
  players.forEach((p) => {
    const g = p.grade ?? null;
    map.set(g, [...(map.get(g) ?? []), p]);
  });
  const groups = [...map.entries()].sort((x, y) => (x[0] ?? 99) - (y[0] ?? 99));
  return (
    <>
      {groups.map(([g, ps]) => (
        <div key={String(g)} className="annreadgroup">
          <div className="annreadhead">{g == null ? "学年未設定" : gradeLabel(stage, g)}</div>
          {[...ps]
            .sort((x, y) => (x.number ?? Number.MAX_SAFE_INTEGER) - (y.number ?? Number.MAX_SAFE_INTEGER))
            .map((p) => {
              const inner = (
                <>
                  <span className="chatavatar sm" aria-hidden="true">
                    {firstChar(p.name)}
                  </span>
                  <span className="annreadname">{p.name}</span>
                  {p.number != null && <span className="annreadno">#{p.number}</span>}
                </>
              );
              return onPick ? (
                <button key={p.id} type="button" className="annreadrow pick" onClick={() => onPick(p.id)}>
                  {inner}
                </button>
              ) : (
                <div key={p.id} className="annreadrow">
                  {inner}
                </div>
              );
            })}
        </div>
      ))}
    </>
  );
}

/* ---------------- 既読・了解を見る（お知らせにされたメッセージ。§2-4） ---------------- */

export type MessageReadTab = "unseen" | "seen" | "acked";

/**
 * スタッフ用の既読パネル。「未読 18｜既読 52｜了解 41」のタブ（未読が既定）で、中身は学年見出し＋背番号順（PlayersByGrade）。
 * 「了解」のタブは未了解を上、了解を下（ux-fix R2-7）。PC はダイアログ、スマホはシート（board シート msgRead）に入れる
 */
export function MessageReadPanel({ messageId, initialTab = "unseen" }: { messageId: string; initialTab?: MessageReadTab }) {
  const { board, team } = useChatViewer();
  const [tab, setTab] = useState<MessageReadTab>(initialTab);
  const m = board.messages.find((x) => x.id === messageId);
  const stats = useMemo(
    () => (m ? messageReadStats(m, board.state.players, team.groups, board.chatReads) : null),
    [m, board.state.players, team.groups, board.chatReads]
  );
  const stage = team.team.schoolStage ?? "junior";

  // 「了解」のタブは 未了解（メンバーのうち了解していない人）を上、了解した人を下に 2 つの区画で出す
  const notAcked = useMemo(() => {
    if (!stats) return [];
    const ackSet = new Set(stats.acked.map((p) => p.id));
    return stats.recipients.filter((p) => !ackSet.has(p.id));
  }, [stats]);

  if (!m || !stats) return <div className="empty-msg">このメッセージは削除されました。</div>;
  const shown = tab === "unseen" ? stats.unseen : tab === "seen" ? stats.seen : stats.acked;
  const renderGrades = (list: Player[]) => <PlayersByGrade players={list} stage={stage} />;

  const tabs: { key: MessageReadTab; label: string; n: number }[] = [
    { key: "unseen", label: "未読", n: stats.unseen.length },
    { key: "seen", label: "既読", n: stats.seen.length },
    { key: "acked", label: "了解", n: stats.acked.length },
  ];

  return (
    <div className="annread">
      {/* 切り替えは role=group＋aria-pressed（.chatfilterchips と同じ作り）。role=tab にすると tabpanel・
          aria-controls・矢印キーでの移動まで必要になり、MobileSegments.tsx のとおり同じ理由で撤去済みの作りに戻ってしまう */}
      <div className="annstabs" role="group" aria-label="既読の状況">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            className={`annstab${tab === t.key ? " on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} {t.n}
          </button>
        ))}
      </div>
      {tab === "acked" ? (
        stats.recipients.length === 0 ? (
          <div className="annreadempty">メンバーがいません</div>
        ) : (
          <>
            {notAcked.length > 0 && (
              <section className="annreadsec" aria-label="未了解">
                <div className="annreadsech">未了解 {notAcked.length} 人</div>
                {renderGrades(notAcked)}
              </section>
            )}
            {stats.acked.length > 0 ? (
              <section className="annreadsec" aria-label="了解">
                <div className="annreadsech">了解 {stats.acked.length} 人</div>
                {renderGrades(stats.acked)}
              </section>
            ) : (
              <div className="annreadempty">まだ了解した人はいません</div>
            )}
          </>
        )
      ) : shown.length === 0 ? (
        <div className="annreadempty">{tab === "unseen" ? "未読の人はいません" : "まだ読んだ人はいません"}</div>
      ) : (
        renderGrades(shown)
      )}
    </div>
  );
}

/* ---------------- 新しいメッセージ（選手選び） ---------------- */

/**
 * 新しいメッセージの相手選び（board シート chatNew の中身。chat-plan-a §3-3）。
 * 検索欄・学年／グループのチップ（単一選択・すべて）・選手の一覧（名前・背番号・学年）。
 * 一覧の途中にあった絞り込み（useGroupFilter("chat")）はここへ移した
 */
export function NewMessagePicker({ onPick }: { onPick: (playerId: string) => void }) {
  const { board, team } = useChatViewer();
  const [q, setQ] = useState("");
  const [filterIds, setFilterIds] = useGroupFilter("chat");
  const filterGroup = resolveFilterGroup(filterIds, team.groups);
  const stage = team.team.schoolStage ?? "junior";
  const kw = q.trim().toLowerCase();
  const list = board.state.players
    .filter((p) => !filterGroup || playerInGroup(p, filterGroup))
    .filter((p) => !kw || p.name.toLowerCase().includes(kw) || String(p.number ?? "") === kw.replace(/^#/, ""));

  return (
    <div className="chatnew">
      <input
        type="search"
        className="chatsearch"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="選手の名前・背番号で検索"
        aria-label="選手を検索"
      />
      {team.groups.length > 0 && (
        <div className="chatnewchips">
          <GroupChips groups={team.groups} value={filterIds} onChange={setFilterIds} allowAll />
        </div>
      )}
      {list.length === 0 ? (
        <div className="empty-msg">該当する選手がいません。</div>
      ) : (
        <PlayersByGrade players={list} stage={stage} onPick={onPick} />
      )}
    </div>
  );
}
