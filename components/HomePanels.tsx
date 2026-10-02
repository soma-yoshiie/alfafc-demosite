"use client";

/**
 * p18 §3: ホームの共通の部品（PC＝HomeMenu.tsx／スマホ＝MobileHome.tsx の両方から使う）。
 * - HomeTimeline：スタッフのホームの「サッカーノート・チャットのタイムライン」（すべて＋学年のタイル）
 * - HomeAnnouncements：最新のお知らせ（スタッフ・選手共通）
 * - HomeGoals：選手のホームの目標（練習の目標・成績の目標・将来の目標）
 * データの集計は homeData.tsx（useHomeTimeline）。クラスは hp-*（app/globals.css の基底）。
 */

import { useMemo, useState } from "react";
import { announcementParts, announcementStats, announcementTarget, fmtListDate, sortAnnouncements, visibleAnnouncements } from "@/lib/chat";
import { saveChatSeg } from "@/lib/storage";
import { dmThreadKey, gradeLabel } from "@/lib/types";
import type { PracticeNote } from "@/lib/types";
import { termLabel } from "@/lib/profile";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useProfiles } from "./ProfileProvider";
import { IconChat, NoteKindIcon } from "./icons";
import { fmtEventDate, type HomeTimelineScope } from "./homeData";

export type HomeVariant = "pc" | "mobile";

/** タイルの色クラス（今の 4 つの枠の色を順に繰り返す） */
const TILE_COLORS = ["mdb-tile-notes", "mdb-tile-att", "mdb-tile-win", "mdb-tile-rank"] as const;
/** スマホの一覧は先頭これだけ。残りは「すべて表示」で出す */
const MOBILE_FIRST = 8;
/** 最新のお知らせの件数 */
const ANN_MAX = 5;

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
      {scopes.map((s, i) => (
        <button
          key={s.key}
          type="button"
          className={`kpitile ${TILE_COLORS[i % TILE_COLORS.length]}${s.key === scope.key ? " on" : ""}`}
          aria-pressed={s.key === scope.key}
          onClick={() => {
            setSelKey(s.key);
            setShowAll(false);
          }}
        >
          <div className="kv">{s.unread}</div>
          <div className="kl">{s.label}</div>
          <span className="mdb-kpidelta">
            {s.unread === 0 ? "未読なし" : `ノート ${s.unreadNotes} ・ メッセージ ${s.unreadMessages}`}
          </span>
        </button>
      ))}
    </>
  );

  const list = (
    <>
      <div className="hp-h">
        <span>タイムライン</span>
        <small>{scope.label}</small>
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
                // setScreen がシートを閉じるので、必ず先に呼ぶ（NotebookScreen の既存の遷移と同じ順）
                saveChatSeg("msg");
                board.setScreen("chat");
                board.openSheet({ type: "chat", chatTo: dmThreadKey(it.playerId) });
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
      {!pc && !showAll && items.length > MOBILE_FIRST && (
        <button type="button" className="hp-more" onClick={() => setShowAll(true)}>
          すべて表示（{items.length} 件）
        </button>
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

export function HomeAnnouncements({ viewer, variant }: { viewer: "staff" | "player"; variant: HomeVariant }) {
  const board = useBoard();
  const team = useTeam();
  const isStaff = viewer === "staff";
  // 選手側の「自分」は ChatHome（useChatViewer）と同じ取り方
  const memberId = isStaff ? null : team.viewer.memberPlayerId ?? board.auth.playerId ?? null;
  const me = memberId ? board.state.players.find((p) => p.id === memberId) ?? null : null;

  const rows = useMemo(
    () =>
      sortAnnouncements(visibleAnnouncements(team.team.announcements, isStaff, me, team.groups))
        .slice(0, ANN_MAX)
        .map((a) => {
          const target = announcementTarget(a, team.groups).label;
          let sub = target;
          if (isStaff) {
            const st = announcementStats(a, board.state.players, team.groups);
            sub = `${target}・既読 ${st.seen.length}/${st.recipients.length}`;
          }
          return { a, subject: announcementParts(a).subject, sub, unread: !isStaff && !!me && !a.seenBy?.includes(me.id) };
        }),
    [team.team.announcements, team.groups, isStaff, me, board.state.players]
  );

  const body = (
    <>
      <div className="hp-h">
        <span>最新のお知らせ</span>
        <button
          type="button"
          className="hp-link"
          onClick={() => {
            // 「お知らせ｜メッセージ」の選択（soccer_tactics_chatseg_v1）が「メッセージ」のままだと
            // メッセージ一覧が開くので、先に「お知らせ」へ切り替えてから移る
            saveChatSeg("ann");
            board.setScreen("chat");
          }}
        >
          すべて見る ›
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="hp-empty">お知らせはまだありません。</div>
      ) : (
        rows.map(({ a, subject, sub, unread }) => (
          <button
            key={a.id}
            type="button"
            className={`hp-row${unread ? " unread" : ""}`}
            onClick={() => {
              // スマホは詳細のシートを閉じたときにチャット画面の「お知らせ」側へ戻るよう、選択を先に切り替える
              saveChatSeg("ann");
              board.setScreen("chat");
              board.openSheet({ type: "annDetail", annId: a.id });
            }}
          >
            <span className="hp-row-main">
              <b>
                {unread && <span className="hp-dot" aria-label="未読" />}
                {a.pinned && <span className="hp-tag">固定</span>}
                {subject}
              </b>
              <span>{sub}</span>
            </span>
            <span className="hp-row-time">{fmtListDate(a.ts)}</span>
          </button>
        ))
      )}
    </>
  );

  return variant === "pc" ? (
    <div className="mdb-panel hp-ann">{body}</div>
  ) : (
    <div className="mh-section mh-panel hp-ann">{body}</div>
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
