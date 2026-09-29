"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Announcement, ChatAttachment, ChatMessage, ChatReplyTo, Player, SavedPlay } from "@/lib/types";
import { dmThreadKey, gradeLabel } from "@/lib/types";
import { loadChatSeg, saveChatSeg, type ChatSeg } from "@/lib/storage";
import {
  announcementAttachmentLabels,
  announcementParts,
  announcementStats,
  announcementTarget,
  announcementUnreadCount,
  attachmentLabel,
  dmSummaries,
  fmtDateTime,
  fmtListDate,
  makeReplyTo,
  memberUnreadTotal,
  sortAnnouncements,
  staffUnreadTotal,
  visibleAnnouncements,
  STAFF_FALLBACK,
} from "@/lib/chat";
import { announcementTargetsPlayer, groupsOfPlayer, playerInGroup, resolveFilterGroup } from "@/lib/groups";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import { GroupChips, useGroupFilter } from "./GroupChips";
import { MobileSegments } from "./MobileSegments";
import ChatThread, { AttachmentView } from "./ChatThread";

/*
 * チャットの入口（chat-plan-a §3-1〜§3-3）。「お知らせ」と「メッセージ」の 2 つに分ける。
 * - お知らせ＝スタッフからの一斉連絡（カード・了解・スタッフには既読の数）。選手は読む・了解・スタッフに返信だけ
 * - メッセージ＝スタッフと選手・保護者の 1 対 1（スタッフは一覧、選手はスタッフとの会話をそのまま）
 * 詳細・スレッド・作成・選手選びは board シート（annDetail／chat／annCompose／chatNew）で開く。
 * PC の 2 ペイン（ChatScreen）だけ onOpenAnn／onOpenDm を渡して右のペインに出す。
 */

/* ---------------- セグメントの選択（保存＋同期） ---------------- */

/**
 * 「お知らせ｜メッセージ」の選択。localStorage soccer_tactics_chatseg_v1 に保存し、同じキーの部品同士は
 * イベント（alfa-chatseg）で同期する（useGroupFilter と同じ作法。chat-plan-a §3-1）。
 * スマホのヘッダー右アクションもこの値を見て切り替える（§3-5）
 */
export function useChatSeg(): [ChatSeg, (s: ChatSeg) => void] {
  const [seg, setSeg] = useState<ChatSeg>(() => loadChatSeg());
  useEffect(() => {
    setSeg(loadChatSeg());
    const on = () => setSeg(loadChatSeg());
    window.addEventListener("alfa-chatseg", on);
    return () => window.removeEventListener("alfa-chatseg", on);
  }, []);
  return [
    seg,
    (s: ChatSeg) => {
      setSeg(s);
      saveChatSeg(s);
    },
  ];
}

/**
 * スマホのヘッダー右アクション（chat-plan-a §3-5）。スタッフで「お知らせ」なら「お知らせを送る」、
 * 「メッセージ」なら「新しいメッセージ」。選手・保護者（enabled=false）は無し
 */
export function useChatHeaderAction(enabled: boolean): { label: string; onClick: () => void } | null {
  const board = useBoard();
  const [seg] = useChatSeg();
  if (!enabled) return null;
  return seg === "ann"
    ? { label: "お知らせを送る", onClick: () => board.openSheet({ type: "annCompose" }) }
    : { label: "新しいメッセージ", onClick: () => board.openSheet({ type: "chatNew" }) };
}

/** 視点（chat-plan-a §3-1）。スタッフ＝viewer.role が coach。それ以外は選手・保護者（コーチの選手プレビューも含む） */
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

/** 送信者の表示「岡本 監督」（旧データは「スタッフ」） */
function senderLine(a: Announcement): string {
  const name = a.fromName?.trim() || STAFF_FALLBACK;
  return a.fromRole && a.fromRole !== name ? `${name} ${a.fromRole}` : name;
}

function firstChar(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}

/** 旧データ（playId のみ）の戦術も詳細で開けるよう添付に直す */
function detailAttachments(a: Announcement, plays: SavedPlay[]): ChatAttachment[] {
  const list = [...(a.attachments ?? [])];
  if (a.playId && !list.some((x) => x.kind === "play")) {
    const p = plays.find((x) => x.id === a.playId);
    if (p) list.push({ kind: "play", title: p.title, play: p });
  }
  return list;
}

/* ---------------- ChatHome ---------------- */

export interface ChatHomeProps {
  /** PC 幅（カードを小さい版にし、スタッフには作成ボタンを一覧の上に出す） */
  pc?: boolean;
  /** セグメントを固定して見出しを出さない（チーム運営 PC の「お知らせ」） */
  lockSegment?: ChatSeg;
  /** 詳細・スレッドの開き方。省略時は board シート（PC の 2 ペインだけ右のペインへ出す） */
  onOpenAnn?: (annId: string) => void;
  onOpenDm?: (playerId: string) => void;
  selectedAnnId?: string | null;
  selectedDm?: string | null;
}

export default function ChatHome({ pc, lockSegment, onOpenAnn, onOpenDm, selectedAnnId, selectedDm }: ChatHomeProps) {
  const { board, team, isStaff, memberId, me } = useChatViewer();
  const [savedSeg, setSeg] = useChatSeg();
  const seg = lockSegment ?? savedSeg;

  // 未読の赤丸（chat-plan-a §3-1）。スタッフ：メッセージの未読の合計。選手：自分宛ての未読お知らせ／スタッフからの未読
  const annBadge = !isStaff && me ? announcementUnreadCount(team.team.announcements, me, team.groups) : 0;
  const msgBadge = isStaff
    ? staffUnreadTotal(board.messages, board.chatReads, board.state.players)
    : memberId
      ? memberUnreadTotal(board.messages, board.chatReads, memberId)
      : 0;

  return (
    <div className={`chathome${pc ? " pc" : ""}`}>
      {!lockSegment && (
        <div className="chatsegwrap">
          <MobileSegments
            ariaLabel="チャットの表示切替"
            items={[
              { key: "ann", label: "お知らせ", badge: annBadge, badgeClass: "chatsegbadge", on: seg === "ann", onSelect: () => setSeg("ann") },
              { key: "msg", label: "メッセージ", badge: msgBadge, badgeClass: "chatsegbadge", on: seg === "msg", onSelect: () => setSeg("msg") },
            ]}
          />
        </div>
      )}
      {seg === "ann" ? (
        <AnnouncementsView pc={pc} showCompose={!!pc && !lockSegment} selectedId={selectedAnnId} onOpen={onOpenAnn} />
      ) : (
        <MessagesView pc={pc} selectedDm={selectedDm} onOpenDm={onOpenDm} />
      )}
    </div>
  );
}

/* ---------------- お知らせ（一覧） ---------------- */

function AnnouncementsView({
  pc,
  showCompose,
  selectedId,
  onOpen,
}: {
  pc?: boolean;
  showCompose?: boolean;
  selectedId?: string | null;
  onOpen?: (annId: string) => void;
}) {
  const { board, team, isStaff, memberId, me, real } = useChatViewer();
  const list = useMemo(
    () => sortAnnouncements(visibleAnnouncements(team.team.announcements, isStaff, me, team.groups)),
    [team.team.announcements, isStaff, me, team.groups]
  );
  const idsKey = list.map((a) => a.id).join(",");

  // 開いた時点で未読だったもの（カードに「新着」の点を出す。開いた直後に既読になるため、最初の描画で控えておく）
  const freshRef = useRef<Set<string> | null>(null);
  if (freshRef.current === null) {
    freshRef.current = new Set(
      !isStaff && memberId ? list.filter((a) => !a.seenBy?.includes(memberId)).map((a) => a.id) : []
    );
  }

  // 選手がお知らせの画面を開いたら、表示された自分宛てのお知らせを既読にする（chat-plan-a §3-2）。
  // 既に既読なら markAnnouncementsSeen は state を変えないので、何度呼んでもループしない
  useEffect(() => {
    if (real && memberId && idsKey) team.markAnnouncementsSeen(idsKey.split(","), memberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, memberId, idsKey]);

  const open = (id: string) => (onOpen ? onOpen(id) : board.openSheet({ type: "annDetail", annId: id }));
  const compose = () => board.openSheet({ type: "annCompose" });

  return (
    <div className="annlist">
      {isStaff && showCompose && (
        <button type="button" className="annbtn ghost" onClick={compose}>
          ＋ お知らせを送る
        </button>
      )}
      {list.length === 0 ? (
        <div className="empty-msg">
          お知らせはまだありません。
          {isStaff && !showCompose && (
            <div style={{ marginTop: 14 }}>
              <button type="button" className="annbtn" onClick={compose}>
                ＋ お知らせを送る
              </button>
            </div>
          )}
        </div>
      ) : (
        list.map((a) => (
          <AnnCard
            key={a.id}
            a={a}
            mini={pc && !!onOpen}
            selected={selectedId === a.id}
            fresh={freshRef.current!.has(a.id)}
            onOpen={() => open(a.id)}
          />
        ))
      )}
    </div>
  );
}

/** 宛先ラベルの色つきチップ（全員＝ネイビー、グループ＝そのグループの色。色はインライン style で渡す） */
function TargetChip({ a }: { a: Announcement }) {
  const team = useTeam();
  const t = announcementTarget(a, team.groups);
  return (
    <span className="anntarget" style={{ "--tc": t.color } as CSSProperties}>
      {t.label}
    </span>
  );
}

/** お知らせ 1 件のカード（chat-plan-a §3-2）。mini は PC の左ペイン用の小さい版 */
function AnnCard({
  a,
  mini,
  selected,
  fresh,
  onOpen,
}: {
  a: Announcement;
  mini?: boolean;
  selected?: boolean;
  fresh?: boolean;
  onOpen: () => void;
}) {
  const { board, team, isStaff, memberId } = useChatViewer();
  const { subject, body } = announcementParts(a);
  const labels = announcementAttachmentLabels(a);
  const stats = useMemo(
    () => announcementStats(a, board.state.players, team.groups),
    [a, board.state.players, team.groups]
  );
  const acked = !!memberId && !!a.acks?.includes(memberId);

  // 一覧の「既読の数」「了解 N」の行。スタッフには数だけ（押せない）なので、カードを開く button の中に含める
  const staffFoot = (
    <div className="annfoot">
      <span className="annacklabel">了解 {stats.acked.length}</span>
      <span className="annseen">{`既読 ${stats.seen.length}/${stats.recipients.length}`} ›</span>
    </div>
  );

  // 詳細を開く button（宛先・件名・日付を含む部分）と、選手の「了解」button は兄弟にする。
  // カード全体を role=button にして中に「了解」button を入れると入れ子の操作部品になり（nested-interactive）、
  // カードの名前に「了解 41」まで入って押すと了解が切り替わるように読まれる（chat-plan-a §3-2）。
  // 開く操作は外枠の div（役割なし）の onClick 1 か所に置く：button の Enter/Space は click として外枠へ届くので
  // キーボードでも開き、余白（了解の行のまわり）を押しても従来どおり開く。了解は伝えない（stopPropagation）
  return (
    <div
      className={`anncard${a.pinned ? " pinned" : ""}${mini ? " mini" : ""}${selected ? " sel" : ""}`}
      onClick={onOpen}
    >
      <button type="button" className="anncardmain" aria-current={selected ? "true" : undefined}>
        <div className="annrow1">
          <TargetChip a={a} />
          {a.pinned && <span className="annpin">固定</span>}
          {fresh && <span className="annnew" role="img" aria-label="新着" />}
          <span className="annfrom">{senderLine(a)}</span>
          <span className="anndate">{fmtListDate(a.ts)}</span>
        </div>
        <div className="annsubject">{subject}</div>
        {!mini && body && <div className="annbody">{body}</div>}
        {!mini && labels.length > 0 && (
          <div className="annatt">
            <E n="clipboard" /> <span>{labels.join("・")}</span>
          </div>
        )}
        {/* 既読の数はスタッフだけ。選手・保護者には出さない */}
        {isStaff && staffFoot}
      </button>
      {!isStaff && (
        <div className="annfoot">
          <button
            type="button"
            className={`annackbtn${acked ? " on" : ""}`}
            aria-pressed={acked}
            disabled={!memberId}
            onClick={(e) => {
              e.stopPropagation();
              if (memberId) team.toggleAnnouncementAck(a.id, memberId);
            }}
          >
            了解 {stats.acked.length}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- お知らせ（詳細） ---------------- */

/**
 * お知らせの詳細（スマホ＝board シート annDetail の中身、PC＝右のペイン）。
 * 件名・送信者（名前＋役割バッジ）・日時・宛先・本文全文・添付・了解。
 * 選手：「スタッフに返信」（1 対 1 を引用付きで開く）。スタッフ：既読／未読、再通知、固定、削除
 */
export function AnnouncementDetail({
  annId,
  readPanel = true,
  onClose,
  onReply,
}: {
  annId: string;
  /**
   * スタッフの既読パネルを詳細の下に含めるか。PC の 3 列（ChatScreen）は右の列に出すので false
   * （chat-plan-a §3-6。スマホのシート・チーム運営の PC ダイアログは既定の true で下に続ける）
   */
  readPanel?: boolean;
  /** 削除したあとに閉じる */
  onClose?: () => void;
  /** 「スタッフに返信」の開き方。省略時は board シート chat（引用付き） */
  onReply?: (replyTo: ChatReplyTo) => void;
}) {
  const { board, team, isStaff, memberId, me, real } = useChatViewer();
  const a = team.team.announcements.find((x) => x.id === annId);
  // 宛先外は中身を出さない（了解も押させない）。名簿から選手が見つからないときは絞らない（visibleAnnouncements と同じ）
  const targeted = !!a && (isStaff || !me || announcementTargetsPlayer(a, me, team.groups));

  // 詳細を開いた時点で既読にする（chat-plan-a §3-2・§8-6）。既読にしているのが一覧（AnnouncementsView）の
  // effect だけだと、通知から詳細だけを開く経路（スマホでセグメントが「メッセージ」のまま annDetail シートが開く）で
  // 一覧がマウントされず既読が付かない。詳細側でも付ければ、通知・シート・PC のペイン・引用からの移動のどれでも付く。
  // 選手本人（real）だけ。既読済みなら needSeen が false になるのでループしない
  const needSeen = real && !!memberId && !!a && targeted && !a.seenBy?.includes(memberId);
  useEffect(() => {
    if (needSeen && memberId) team.markAnnouncementsSeen([annId], memberId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needSeen, memberId, annId]);

  if (!a) return <div className="empty-msg">このお知らせは削除されました。</div>;
  if (!targeted) return <div className="empty-msg">このお知らせは表示できません。</div>;

  const { subject, body } = announcementParts(a);
  const plays = board.library.plays;
  const atts = detailAttachments(a, plays);
  const acked = !!memberId && !!a.acks?.includes(memberId);
  const ackCount = announcementStats(a, board.state.players, team.groups).acked.length;
  const name = a.fromName?.trim() || STAFF_FALLBACK;

  const reply = () => {
    if (!memberId) return;
    const q = makeReplyTo("announcement", a.id, name, body ? `${subject} ${body}` : subject);
    if (onReply) onReply(q);
    else board.openSheet({ type: "chat", chatTo: dmThreadKey(memberId), replyTo: q });
  };

  return (
    <div className="anndetail">
      <div className="anndhead">
        <div className="anndtags">
          <TargetChip a={a} />
          {a.pinned && <span className="annpin">固定</span>}
        </div>
        <div className="anndtitle">{subject}</div>
        <div className="anndfrom">
          <span className="chatavatar sm" aria-hidden="true">
            {firstChar(name)}
          </span>
          <span className="anndname">{name}</span>
          {a.fromRole && a.fromRole !== name && <span className="chatrole">{a.fromRole}</span>}
          <span className="anndtime">{fmtDateTime(a.ts)}</span>
        </div>
      </div>
      {body && <div className="anndbody">{body}</div>}
      {atts.length > 0 && (
        <div className="anndatts">
          {atts.map((att, i) => (
            <AttachmentView key={i} att={att} />
          ))}
        </div>
      )}

      {!isStaff && (
        <div className="anndactions">
          <button
            type="button"
            className={`annackbtn big${acked ? " on" : ""}`}
            aria-pressed={acked}
            disabled={!memberId}
            onClick={() => memberId && team.toggleAnnouncementAck(a.id, memberId)}
          >
            了解 {ackCount}
          </button>
          <button type="button" className="annbtn" disabled={!memberId} onClick={reply}>
            スタッフに返信
          </button>
          <div className="anndnote">お知らせへの返事はスタッフだけに届きます</div>
        </div>
      )}

      {isStaff && (
        <>
          {readPanel && <AnnReadPanel a={a} />}
          <div className="anndactions row">
            <button
              type="button"
              className="annbtn ghost"
              onClick={() => team.setAnnouncementPinned(a.id, !a.pinned)}
            >
              {a.pinned ? "固定を外す" : "上部に固定する"}
            </button>
            <button
              type="button"
              className="annbtn ghost danger"
              onClick={() => {
                if (window.confirm("このお知らせを削除しますか？")) {
                  team.removeAnnouncement(a.id);
                  onClose?.();
                }
              }}
            >
              削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * スタッフ用の既読パネル（chat-plan-a §3-2）。「未読 18｜既読 52｜了解 41」のタブ（未読が既定）で
 * 学年ごとの小見出し付きの名前一覧、「未読の N 人に再通知」と最後の再通知の時刻。PC の右の既読パネルでも使う
 */
export function AnnReadPanel({ a }: { a: Announcement }) {
  const { board, team } = useChatViewer();
  const [tab, setTab] = useState<"unseen" | "seen" | "acked">("unseen");
  const stats = announcementStats(a, board.state.players, team.groups);
  const stage = team.team.schoolStage ?? "junior";
  const shown = tab === "unseen" ? stats.unseen : tab === "seen" ? stats.seen : stats.acked;

  // 学年ごとに束ねる（学年の小さい順。学年が無い選手は末尾）
  const byGrade = useMemo(() => {
    const map = new Map<number | null, Player[]>();
    shown.forEach((p) => {
      const g = p.grade ?? null;
      map.set(g, [...(map.get(g) ?? []), p]);
    });
    return [...map.entries()].sort((x, y) => (x[0] ?? 99) - (y[0] ?? 99));
  }, [shown]);

  const tabs: { key: "unseen" | "seen" | "acked"; label: string; n: number }[] = [
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
      {stats.unseen.length > 0 && (
        <button type="button" className="annbtn" onClick={() => team.remindAnnouncement(a.id)}>
          {`未読の${stats.unseen.length}人に再通知`}
        </button>
      )}
      {a.remindedAt && <div className="annremind">最後の再通知 {fmtDateTime(a.remindedAt)}</div>}
      {shown.length === 0 ? (
        <div className="annreadempty">
          {tab === "unseen" ? "未読の人はいません" : tab === "seen" ? "まだ読んだ人はいません" : "まだ了解した人はいません"}
        </div>
      ) : (
        byGrade.map(([g, ps]) => (
          <div key={String(g)} className="annreadgroup">
            <div className="annreadhead">{g == null ? "学年未設定" : gradeLabel(stage, g)}</div>
            {ps.map((p) => (
              <div key={p.id} className="annreadrow">
                <span className="chatavatar sm" aria-hidden="true">
                  {firstChar(p.name)}
                </span>
                <span className="annreadname">{p.name}</span>
                {p.number != null && <span className="annreadno">#{p.number}</span>}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------- お知らせ（作成） ---------------- */

/**
 * お知らせの作成（board シート annCompose の中身。chat-plan-a §3-2）。
 * 件名（任意）・本文・宛先（複数選択、未選択＝全員）・戦術を添付・上部に固定する。送信者は addAnnouncement が埋める
 */
export function AnnouncementCompose({ onDone }: { onDone: () => void }) {
  const { board, team } = useChatViewer();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [playId, setPlayId] = useState("");
  const [pinned, setPinned] = useState(false);

  const submit = () => {
    const play = playId ? board.library.plays.find((p) => p.id === playId) : undefined;
    if (!title.trim() && !text.trim() && !play) {
      board.toast("本文を入力してください");
      return;
    }
    team.addAnnouncement({
      title,
      text,
      groupIds,
      attachments: play ? [{ kind: "play", title: play.title, play }] : undefined,
      pinned,
    });
    onDone();
  };

  return (
    <div className="anncompose">
      <div className="formfield">
        <label>件名（任意）</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例）今週末は練習試合です"
          maxLength={60}
        />
      </div>
      <div className="formfield">
        <label>本文</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="例）明日の練習は雨天中止の場合あり。朝7時に判断します。"
        />
      </div>
      {team.groups.length > 0 && (
        <div className="formfield">
          <label>宛先（選ばなければ全員）</label>
          <GroupChips groups={team.groups} value={groupIds} onChange={setGroupIds} allowAll allLabel="全員" multi />
        </div>
      )}
      {board.library.plays.length > 0 && (
        <div className="formfield">
          <label>戦術を添付（任意・選手が閲覧できます）</label>
          <select value={playId} onChange={(e) => setPlayId(e.target.value)}>
            <option value="">添付しない</option>
            {board.library.plays.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="annpincheck">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <span>上部に固定する</span>
      </label>
      <div className="annpinhint">固定は最大 2 件です。3 件目を固定すると、いちばん古い固定が外れます。</div>
      <button type="button" className="annbtn wide" onClick={submit}>
        送信する
      </button>
    </div>
  );
}

/* ---------------- メッセージ（一覧） ---------------- */

/** 一覧の最新の発言の 1 行（スタッフの発言なら「あなた：」、選手は本文のみ。添付だけなら添付の名前） */
function previewOf(m: ChatMessage): string {
  const body = m.text?.replace(/\s+/g, " ").trim() || (m.attachments?.[0] ? attachmentLabel(m.attachments[0]) : "");
  return m.from === "coach" ? `あなた：${body}` : body;
}

function MessagesView({
  pc,
  selectedDm,
  onOpenDm,
}: {
  pc?: boolean;
  selectedDm?: string | null;
  onOpenDm?: (playerId: string) => void;
}) {
  const { board, team, isStaff, memberId } = useChatViewer();
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const players = board.state.players;

  const openDm = (pid: string) =>
    onOpenDm ? onOpenDm(pid) : board.openSheet({ type: "chat", chatTo: dmThreadKey(pid) });

  // 名簿から消した選手の会話は行にしない（赤丸 staffUnreadTotal も同じ条件で数える）
  const allRows = useMemo(() => {
    if (!isStaff) return [];
    return dmSummaries(board.messages, board.chatReads)
      .map((s) => ({ s, p: players.find((x) => x.id === s.playerId) ?? null }))
      .filter((r): r is { s: (typeof r)["s"]; p: Player } => !!r.p);
  }, [isStaff, board.messages, board.chatReads, players]);
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return allRows
      .filter((r) => !unreadOnly || r.s.unread > 0)
      .filter((r) => {
        if (!kw) return true;
        if (r.p.name.toLowerCase().includes(kw)) return true;
        return board.messages.some((m) => m.to === r.s.key && (m.text ?? "").toLowerCase().includes(kw));
      });
  }, [allRows, board.messages, q, unreadOnly]);

  /* ---- 選手・保護者：スタッフとの 1 対 1 をそのまま出す（見出し「スタッフ」） ---- */
  if (!isStaff) {
    if (!memberId) return <div className="empty-msg">選手が選択されていません。</div>;
    const key = dmThreadKey(memberId);
    if (pc && onOpenDm) {
      // PC の 2 ペイン：左には「スタッフ」の 1 行だけ出し、スレッドは中のペインに開く
      const last = board.messages.filter((m) => m.to === key).sort((a, b) => b.ts - a.ts)[0];
      const unread = memberUnreadTotal(board.messages, board.chatReads, memberId);
      return (
        <div className="convlist">
          <button
            type="button"
            className={`convrow${selectedDm === memberId ? " sel" : ""}`}
            aria-current={selectedDm === memberId ? "true" : undefined}
            onClick={() => onOpenDm(memberId)}
          >
            <div className="convavatar">ス</div>
            <div className="convmain">
              <div className="convtop">
                <span className="convname">スタッフ</span>
              </div>
              <div className="convprev">{last ? previewOf(last).replace(/^あなた：/, "") : "メッセージはまだありません"}</div>
            </div>
            <div className="convaside">
              {last && <span className="convdate">{fmtListDate(last.ts)}</span>}
              {unread > 0 && <span className="chatunreadbadge">{unread}</span>}
            </div>
          </button>
        </div>
      );
    }
    return (
      <div className="chatmember">
        <div className="chatmemhead">スタッフ</div>
        <div className="chatmemthread">
          <ChatThread to={key} as={{ role: "member", playerId: memberId }} />
        </div>
      </div>
    );
  }

  /* ---- スタッフ：やり取りのある 1 対 1 だけ（新しい順） ---- */
  const newBtn = (
    <button type="button" className="annbtn ghost chatnewbtn" onClick={() => board.openSheet({ type: "chatNew" })}>
      ＋ 新しいメッセージ
    </button>
  );
  const hasAny = allRows.length > 0;

  return (
    <div className="msglist">
      {hasAny && (
        <>
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
        </>
      )}
      {!hasAny ? (
        <div className="empty-msg">
          まだメッセージはありません
          <div style={{ marginTop: 14 }}>{newBtn}</div>
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <div className="empty-msg">{unreadOnly && !q.trim() ? "未読のメッセージはありません。" : "該当する会話がありません。"}</div>
          ) : (
            <div className="convlist">
              {rows.map(({ s, p }) => {
                const sel = selectedDm === p.id;
                const gl = groupsOfPlayer(p, team.groups)
                  .map((g) => g.label)
                  .join("・");
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`convrow${sel ? " sel" : ""}`}
                    aria-current={sel ? "true" : undefined}
                    onClick={() => openDm(p.id)}
                  >
                    <div className="convavatar">{firstChar(p.name)}</div>
                    <div className="convmain">
                      <div className="convtop">
                        <span className="convname">{p.name}</span>
                        {gl && <span className="convcount">{gl}</span>}
                      </div>
                      <div className={`convprev${s.unread > 0 ? " unread" : ""}`}>{previewOf(s.last)}</div>
                    </div>
                    <div className="convaside">
                      <span className="convdate">{fmtListDate(s.last.ts)}</span>
                      {s.unread > 0 && (
                        <span className="chatunreadbadge" aria-label={`未読 ${s.unread}件`}>
                          {s.unread}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {newBtn}
        </>
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
        <div className="convlist">
          {list.map((p) => (
            <button key={p.id} type="button" className="convrow" onClick={() => onPick(p.id)}>
              <div className="convavatar">{firstChar(p.name)}</div>
              <div className="convmain">
                <div className="convtop">
                  <span className="convname">{p.name}</span>
                  {p.number != null && <span className="convcount">#{p.number}</span>}
                </div>
                <div className="convprev">{p.grade != null ? gradeLabel(stage, p.grade) : "学年未設定"}</div>
              </div>
              <span className="convchev">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
