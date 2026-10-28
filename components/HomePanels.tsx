"use client";

/**
 * p18 §3: ホームの共通の部品（PC＝HomeMenu.tsx／スマホ＝MobileHome.tsx の両方から使う）。
 * - HomeTimeline：スタッフのホームの「サッカーノート・チャットのタイムライン」（すべて＋学年のタイル）
 * - HomeAnnouncements：最新のお知らせ（スタッフ・選手共通）
 * - HomeGoals：選手のホームの目標（練習の目標・成績の目標・将来の目標）
 * データの集計は homeData.tsx（useHomeTimeline）。クラスは hp-*（app/globals.css の基底）。
 */

import { useMemo, useState, type CSSProperties } from "react";
import { announceSubject, announcedMessages, fmtListDate, messageReadStats, threadLabel } from "@/lib/chat";
import { loadNotifSeen } from "@/lib/storage";
import { unreadStaffComments } from "@/lib/badges";
import { dmThreadKey, gradeLabel } from "@/lib/types";
import type { ChatMessage, PracticeNote } from "@/lib/types";
import { termLabel } from "@/lib/profile";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useProfiles } from "./ProfileProvider";
import { IconChat, NoteKindIcon } from "./icons";
import { fmtEventDate, type HomeTimelineScope } from "./homeData";
import { notifIdentity } from "./NotebookTools";

export type HomeVariant = "pc" | "mobile";

/** スマホの一覧は先頭これだけ。残りは「すべて表示」で出す */
const MOBILE_FIRST = 8;
/** 最新のお知らせの件数 */
const ANN_MAX = 3;

/* ===================== 3-1 タイムライン（スタッフ） ===================== */

export function HomeTimeline({ scopes, variant }: { scopes: HomeTimelineScope[]; variant: HomeVariant }) {
  const board = useBoard();
  const [selKey, setSelKey] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const scope = scopes.find((s) => s.key === selKey) ?? scopes[0];
  const pc = variant === "pc";
  const items = scope.items;
  const shown = pc || showAll ? items : items.slice(0, MOBILE_FIRST);

  const tiles = (
    <>
      {scopes.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`kpitile hp-tile${s.key === scope.key ? " on" : ""}`}
          // 色は左の線だけ。学年は学年の色、「すべて」は色を渡さず --accent（CSS の既定）
          style={s.color ? ({ "--tile-color": s.color } as CSSProperties) : undefined}
          aria-pressed={s.key === scope.key}
          onClick={() => {
            setSelKey(s.key);
            setShowAll(false);
          }}
        >
          <div className="kv">
            <small>未読</small>
            {s.unread}
          </div>
          <div className="kl">{s.label}</div>
          <span className="mdb-kpidelta">{`ノート ${s.unreadNotes} ・ メッセージ ${s.unreadMessages}`}</span>
        </button>
      ))}
    </>
  );

  const list = (
    <>
      <div className="hp-h">
        <span>
          タイムライン<small className="hp-h-sub">{scope.label}</small>
        </span>
        {!pc && !showAll && items.length > MOBILE_FIRST && (
          <button type="button" className="hp-link" onClick={() => setShowAll(true)}>
            すべて見る（{items.length}）›
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="hp-empty">まだ届いていません。</div>
      ) : (
        shown.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`hp-row${it.unread ? " unread" : ""}`}
            onClick={() => {
              if (it.kind === "note" && it.noteId) {
                board.setNoteIntent({ noteId: it.noteId });
                board.setScreen("notebook");
              } else {
                // setScreen がシートを閉じるので、必ず先に呼ぶ（board.openChat の中で同じ順に行う）。
                // グループへの投稿はそのグループのスレッドのその吹き出しへ（レビュー）
                board.openChat({ key: it.threadKey ?? dmThreadKey(it.playerId), messageId: it.messageId });
              }
            }}
          >
            {it.kind === "note" && it.noteKind ? (
              <span className={`hp-ic k-${it.noteKind}`} aria-hidden="true">
                <NoteKindIcon kind={it.noteKind} />
              </span>
            ) : (
              <span className="hp-ic hp-ic-msg" aria-hidden="true">
                <IconChat />
              </span>
            )}
            <span className="hp-row-main">
              <b>
                {it.unread && <span className="hp-dot" aria-label="未読" />}
                {it.name}
              </b>
              <span>{it.text}</span>
            </span>
            <span className="hp-row-time">{fmtListDate(it.ts)}</span>
          </button>
        ))
      )}
    </>
  );

  if (pc) {
    return (
      <div className="kpicard2 mdb-pulse hp-tl">
        <div className="kpiband hp-scopes">{tiles}</div>
        <div className="kpichart hp-tllist">{list}</div>
      </div>
    );
  }
  return (
    <>
      <div className="mh-section mh-kpis hp-scopes">{tiles}</div>
      <div className="mh-section mh-panel hp-tllist">{list}</div>
    </>
  );
}

/* ===================== 3-2 最新のお知らせ（スタッフ・選手共通） ===================== */

/**
 * home-chat-groups-roster §2-6・§2-7: お知らせにされたメッセージの行の元データ。ホームの「最新のお知らせ」（3 件）と
 * お知らせ一覧のシート（全件）が同じ行を使う。スタッフは全グループ、選手・保護者は自分が入っているグループのもの
 */
function useAnnouncedRows(viewer: "staff" | "player") {
  const board = useBoard();
  const team = useTeam();
  const isStaff = viewer === "staff";
  // 選手側の「自分」は ChatHome（useChatViewer）と同じ取り方
  const memberId = isStaff ? null : team.viewer.memberPlayerId ?? board.auth.playerId ?? null;
  const me = memberId ? board.state.players.find((p) => p.id === memberId) ?? null : null;
  const all = useMemo(
    () =>
      announcedMessages(board.messages, team.groups, isStaff ? { side: "staff" } : { side: "member", playerId: memberId ?? "", me }),
    [board.messages, team.groups, isStaff, memberId, me]
  );
  const toRow = (m: ChatMessage) => {
    const d = new Date(m.announce?.ts ?? m.ts);
    let sub = `${threadLabel(m.to, team.groups)} ・ ${d.getMonth() + 1}/${d.getDate()}`;
    if (isStaff) {
      const st = messageReadStats(m, board.state.players, team.groups, board.chatReads);
      sub += ` ・ 既読 ${st.seen.length}/${st.recipients.length} ・ 了解 ${st.acked.length}`;
    }
    return { m, subject: Array.from(announceSubject(m)).slice(0, 40).join(""), sub };
  };
  return { all, toRow, memberId, isStaff };
}

/** お知らせの 1 行。押すとそのグループのスレッドをその吹き出しまで開く。選手・保護者には未了解のときだけ「了解」 */
function AnnouncementRow({
  m,
  subject,
  sub,
  memberId,
}: {
  m: ChatMessage;
  subject: string;
  sub: string;
  memberId: string | null;
}) {
  const board = useBoard();
  const needAck = !!memberId && m.acks?.[memberId] === undefined;
  return (
    <div className="hp-annitem">
      <button
        type="button"
        className="hp-row"
        data-ann-id={m.id}
        onClick={() => board.openChat({ key: m.to, messageId: m.id })}
      >
        <span className="hp-row-main">
          <b>
            {m.pinned && <span className="hp-tag">固定</span>}
            {subject}
          </b>
          <span>{sub}</span>
        </span>
        <span className="hp-row-time">{fmtListDate(m.announce?.ts ?? m.ts)}</span>
      </button>
      {needAck && (
        <button
          type="button"
          className="annackbtn"
          aria-pressed={false}
          onClick={() => memberId && board.ackMessage(m.id, memberId)}
        >
          了解
        </button>
      )}
    </div>
  );
}

export function HomeAnnouncements({ viewer, variant }: { viewer: "staff" | "player"; variant: HomeVariant }) {
  const board = useBoard();
  const { all, toRow, memberId } = useAnnouncedRows(viewer);
  const rows = all.slice(0, ANN_MAX).map(toRow);

  const body = (
    <>
      <div className="hp-h">
        <span>最新のお知らせ</span>
        {all.length > 0 && (
          <button type="button" className="hp-link" onClick={() => board.openSheet({ type: "annList" })}>
            すべて見る（{all.length}）›
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="hp-empty">お知らせはまだありません。</div>
      ) : (
        rows.map((r) => <AnnouncementRow key={r.m.id} {...r} memberId={memberId} />)
      )}
    </>
  );

  return variant === "pc" ? (
    <div className="mdb-panel hp-ann">{body}</div>
  ) : (
    <div className="mh-section mh-panel hp-ann">{body}</div>
  );
}

/** お知らせ一覧（board シート annList の中身。スマホはシート、PC はダイアログ。home-chat-groups-roster §2-7） */
export function AnnouncementList({ viewer }: { viewer: "staff" | "player" }) {
  const { all, toRow, memberId } = useAnnouncedRows(viewer);
  return (
    <div className="annsheet annlistsheet">
      <h2>お知らせ</h2>
      <div className="annsheetbody hp-ann">
        {all.length === 0 ? (
          <div className="hp-empty">お知らせはまだありません。</div>
        ) : (
          all.map((m) => <AnnouncementRow key={m.id} {...toRow(m)} memberId={memberId} />)
        )}
      </div>
    </div>
  );
}

/* ===================== 3-3 目標（選手） ===================== */

type GoalRow = { key: string; label: string; value: string; sub?: string; screen: "notebook" | "profile" };

export function HomeGoals({ playerId, variant }: { playerId: string; variant: HomeVariant }) {
  const board = useBoard();
  const team = useTeam();
  const profiles = useProfiles();
  const profile = profiles.get(playerId);

  const rows = useMemo(() => {
    const out: GoalRow[] = [];
    // 練習の目標：自分の練習ノートのうち「今日の目標」があるもので活動日が最新のもの
    let latest: PracticeNote | null = null;
    for (const n of board.notebook) {
      if (n.kind !== "practice" || n.playerId !== playerId || !n.goalPre?.trim()) continue;
      if (!latest || n.date > latest.date || (n.date === latest.date && n.ts > latest.ts)) latest = n;
    }
    if (latest) {
      out.push({
        key: "practice",
        label: "練習の目標",
        value: latest.goalPre!.trim(),
        sub: `${fmtEventDate(latest.date)}${typeof latest.achievement === "number" ? ` ・ 達成度 ${latest.achievement}%` : ""}`,
        screen: "notebook",
      });
    }
    // 成績の目標（プロフィールの成績表）
    const gg = profile.gradeGoal;
    const actions = gg.actions?.trim();
    if (gg.targetAvg != null || actions) {
      const dl = [
        gg.deadlineGrade != null ? gradeLabel(team.schoolStage, gg.deadlineGrade) : "",
        gg.deadlineTerm ? termLabel(gg.deadlineTerm) : "",
      ].filter(Boolean);
      const dlText = dl.length > 0 ? `（${dl.join("・")}まで）` : "";
      out.push({
        key: "grade",
        label: "成績の目標",
        value: gg.targetAvg != null ? `評定平均 ${gg.targetAvg.toFixed(1)}${dlText}` : (actions as string),
        sub: gg.targetAvg != null ? actions || undefined : undefined,
        screen: "profile",
      });
    }
    // 将来の目標（プロフィールの進路）
    const future = profile.career.futureGoal?.trim();
    if (future) out.push({ key: "future", label: "将来の目標", value: future, screen: "profile" });
    return out;
  }, [board.notebook, playerId, profile, team.schoolStage]);

  const body = (
    <>
      <div className="hp-h">
        <span>目標</span>
      </div>
      {rows.length === 0 ? (
        <div className="hp-empty">
          目標はまだありません。サッカーノートの「今日の目標」や、プロフィールの成績表・進路で設定できます。
        </div>
      ) : (
        <dl className="hp-goallist">
          {rows.map((r) => (
            <div className="hp-goalrow" key={r.key}>
              <dt>{r.label}</dt>
              <dd>
                <button type="button" className="hp-goal" onClick={() => board.setScreen(r.screen)}>
                  {r.value}
                  {r.sub && <small>{r.sub}</small>}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  return variant === "pc" ? (
    <div className="mdb-panel hp-goals">{body}</div>
  ) : (
    <div className="mh-section mh-panel hp-goals">{body}</div>
  );
}

/* ===================== 3-4 コーチからのコメント（選手） ===================== */

/**
 * ux-fix R2-1: 目標の上に出す 1 行。未読のコーチのコメントがあるときだけ。
 * 未読の判定は lib/badges.ts の isUnreadStaffComment（通知の既読時刻より後で、かつ本人が詳細で見ていない）。noteBadge と同じ。
 * 押すと、いちばん新しい未読のノートの詳細（noteIntent → サッカーノート）。
 */
export function HomeCoachComment({ variant }: { variant: HomeVariant }) {
  const board = useBoard();
  const playerId = board.auth.playerId ?? null;
  const unread = unreadStaffComments(board.notebook, playerId, loadNotifSeen()[notifIdentity(board.auth.role, board.auth.playerId)] ?? 0);
  if (unread.length === 0) return null;
  const card = (
    <button
      type="button"
      className="hp-cmt"
      onClick={() => {
        board.setNoteIntent({ noteId: unread[0].id });
        board.setScreen("notebook");
      }}
    >
      <span className="hp-cmt-t">コーチからコメント {unread.length} 件</span>
      <span className="hp-cmt-chev" aria-hidden="true">›</span>
    </button>
  );
  return variant === "pc" ? <div className="hp-cmtwrap">{card}</div> : <div className="mh-section hp-cmtwrap">{card}</div>;
}
