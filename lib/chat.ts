// チャットの作り直し（案A・specs/chat-plan-a.md）の共通ヘルパー。
// 画面に依存しない純粋関数だけを置く（BoardProvider/TeamProvider/各画面から使う）。
// - §2-4 送信者の名前と役割（staffIdentity）
// - §3 表示用の日付・時刻、未読数、既読、お知らせの件名・宛先・既読集計
// - §2-5 送信の共通化（宛先＋添付 → お知らせ or 1 対 1）
// - §6 team／grp メッセージ → お知らせの移行計画（planChatMigration）

import type {
  Announcement,
  ChatAttachment,
  ChatMessage,
  ChatReads,
  ChatReplyTo,
  Player,
  TeamGroup,
} from "./types";
import { dmThreadKey, threadGroupId } from "./types";
import { ALL_TARGETS_COLOR, announcementTargetsPlayer } from "./groups";

/* ===== §2-4 送信者の名前と役割 ===== */

export const STAFF_FALLBACK = "スタッフ";

/**
 * スタッフの送信者表示（お知らせ・1 対 1 の fromName／fromRole を埋める）。
 * TeamData.coaches は「役割 名前」（例「監督 岡本」）。authName を空白区切りのトークンとして
 * 含む項目があればそれを分解（1 語目＝役割、残り＝名前）。無ければ coaches[0]。
 * coaches が空なら { name: authName || "スタッフ", role: "スタッフ" }（chat-plan-a §2-4）
 */
export function staffIdentity(authName: string, coaches: string[]): { name: string; role: string } {
  const list = coaches.map((c) => c.trim()).filter(Boolean);
  const an = (authName ?? "").trim();
  if (list.length === 0) return { name: an || STAFF_FALLBACK, role: STAFF_FALLBACK };
  const tokens = (c: string) => c.split(/\s+/);
  const hit = an
    ? list.find((c) => tokens(c).includes(an) || (/\s/.test(an) && c.includes(an)))
    : undefined;
  const [role, ...rest] = tokens(hit ?? list[0]);
  // 「岡本」のように 1 語だけの項目は役割が分からないので名前として扱う
  return rest.length > 0 ? { name: rest.join(" "), role } : { name: role, role: STAFF_FALLBACK };
}

/* ===== 日付・時刻の表示 ===== */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 同じ暦日（ローカル時刻）か */
export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

const DAY_MS = 86400_000;
/** ts が now の「昨日」か（暦日で判定。24 時間前ではない） */
function isYesterday(ts: number, now: number): boolean {
  return isSameDay(ts, now - DAY_MS);
}

/** 「10:12」 */
export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 一覧・カードの日付（chat-plan-a §3）。今日＝HH:MM／昨日＝「昨日」／それ以外＝「9/28」
 */
export function fmtListDate(ts: number, now: number = Date.now()): string {
  if (isSameDay(ts, now)) return fmtClock(ts);
  if (isYesterday(ts, now)) return "昨日";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 詳細の日時「9/29 10:12」（「最後の再通知」・お知らせの日時に使う） */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${fmtClock(ts)}`;
}

/**
 * スレッドの日付区切り（chat-plan-a §3-4）。「今日」「昨日」「9月28日（日）」。
 * 今年でなければ年を付ける（「2025年9月28日（日）」）
 */
export function fmtDayDivider(ts: number, now: number = Date.now()): string {
  if (isSameDay(ts, now)) return "今日";
  if (isYesterday(ts, now)) return "昨日";
  const d = new Date(ts);
  const y = d.getFullYear() !== new Date(now).getFullYear() ? `${d.getFullYear()}年` : "";
  return `${y}${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

/* ===== §2-3 1 対 1 の未読・既読 ===== */

export type ChatSide = "staff" | "member";

/** メッセージの送信者が選手・保護者側か（"p:<playerId>"） */
export function isMemberFrom(from: string): boolean {
  return from.startsWith("p:");
}

/** side から見て「相手の発言」か（スタッフ側＝選手の発言、選手側＝スタッフの発言） */
function isCounterpart(m: ChatMessage, side: ChatSide): boolean {
  return side === "staff" ? isMemberFrom(m.from) : m.from === "coach";
}

/**
 * その会話（"p:<playerId>"）の未読数。スタッフ側＝from が選手で ts > reads[key].staff、
 * 選手側＝from が "coach" で ts > reads[key].member（chat-plan-a §2-3）
 */
export function unreadCount(messages: ChatMessage[], reads: ChatReads, key: string, side: ChatSide): number {
  const since = reads[key]?.[side] ?? 0;
  let n = 0;
  for (const m of messages) {
    if (m.to === key && m.ts > since && isCounterpart(m, side)) n++;
  }
  return n;
}

/** その会話で、side から見た相手の発言のうち最新の ts（無ければ 0）。markChatRead の要否判定に使う */
export function latestCounterpartTs(messages: ChatMessage[], key: string, side: ChatSide): number {
  let t = 0;
  for (const m of messages) {
    if (m.to === key && isCounterpart(m, side) && m.ts > t) t = m.ts;
  }
  return t;
}

/**
 * スタッフ側の未読の合計（全 1 対 1）。セグメント「メッセージ」の赤丸に使う。
 * 名簿にいない選手（名簿から消した選手）の会話は数えない。一覧（MessagesView）はその会話の行を出さないため、
 * 数えると赤丸と一覧の未読がずれ、開けない会話なので既読にもできない（chat-plan-a §3-1・§3-3）
 */
export function staffUnreadTotal(messages: ChatMessage[], reads: ChatReads, players: Player[]): number {
  const alive = new Set(players.map((p) => dmThreadKey(p.id)));
  let n = 0;
  for (const m of messages) {
    if (!alive.has(m.to) || !isMemberFrom(m.from)) continue;
    if (m.ts > (reads[m.to]?.staff ?? 0)) n++;
  }
  return n;
}

/** 選手側の未読（スタッフからの発言のうち自分の既読より新しいもの） */
export function memberUnreadTotal(messages: ChatMessage[], reads: ChatReads, playerId: string): number {
  return unreadCount(messages, reads, dmThreadKey(playerId), "member");
}

/**
 * 自分（side）の発言を相手が読んだか。相手側の既読時刻が発言の ts 以上なら true
 * （「既読」の表示に使う。時刻は付けない。chat-plan-a §2-3）
 */
export function isSeenByOther(reads: ChatReads, key: string, mySide: ChatSide, ts: number): boolean {
  const other: ChatSide = mySide === "staff" ? "member" : "staff";
  const t = reads[key]?.[other];
  return t !== undefined && t >= ts;
}

/** スタッフのメッセージ一覧の 1 行分（やり取りのある 1 対 1 だけ） */
export interface DmSummary {
  key: string;
  playerId: string;
  last: ChatMessage;
  unread: number;
}

/**
 * スタッフのメッセージ一覧。やり取りのある 1 対 1 だけを、最新の発言の新しい順に返す
 * （空の会話は出さない。chat-plan-a §3-3）
 */
export function dmSummaries(messages: ChatMessage[], reads: ChatReads): DmSummary[] {
  const map = new Map<string, DmSummary>();
  for (const m of messages) {
    if (!m.to.startsWith("p:")) continue;
    let s = map.get(m.to);
    if (!s) {
      s = { key: m.to, playerId: m.to.slice(2), last: m, unread: 0 };
      map.set(m.to, s);
    }
    if (m.ts >= s.last.ts) s.last = m;
    if (isMemberFrom(m.from) && m.ts > (reads[m.to]?.staff ?? 0)) s.unread++;
  }
  return [...map.values()].sort((a, b) => b.last.ts - a.last.ts);
}

/* ===== 引用返信 ===== */

/** 引用の本文冒頭の最大文字数（chat-plan-a §2-2） */
export const REPLY_QUOTE_MAX = 60;

/** 引用返信の参照を作る。text は改行を空白にして 60 字までに切る */
export function makeReplyTo(
  source: ChatReplyTo["source"],
  id: string,
  fromName: string,
  text: string
): ChatReplyTo {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return { id, source, fromName, text: Array.from(flat).slice(0, REPLY_QUOTE_MAX).join("") };
}

/* ===== お知らせの表示用ヘルパー ===== */

/** 固定できる上限（chat-plan-a §2-1） */
export const MAX_PINNED = 2;

/** 添付 1 件の表示名「戦術「〇〇」」「練習メニュー「〇〇」」「セットプレー「〇〇」」「画像」「動画」 */
export function attachmentLabel(att: ChatAttachment): string {
  const t = att.title?.trim();
  switch (att.kind) {
    case "play":
      return t ? `戦術「${t}」` : "戦術";
    case "drill":
      return t ? `練習メニュー「${t}」` : "練習メニュー";
    case "setpiece":
      return t ? `セットプレー「${t}」` : "セットプレー";
    case "image":
      return "画像";
    default:
      return "動画";
  }
}

/** お知らせの添付の表示名（旧データの playTitle も含める） */
export function announcementAttachmentLabels(a: Announcement): string[] {
  const labels = (a.attachments ?? []).map(attachmentLabel);
  if (a.playTitle && !(a.attachments ?? []).some((x) => x.kind === "play")) labels.push(`戦術「${a.playTitle}」`);
  return labels;
}

/**
 * 件名と本文（chat-plan-a §2-1・§3-2）。件名があれば件名＋本文全文。無ければ本文の 1 行目を件名にし、
 * 本文はその残り（1 行だけなら本文は空＝件名だけ表示）。本文も件名も無ければ添付の名前、それも無ければ「お知らせ」
 */
export function announcementParts(a: Announcement): { subject: string; body: string } {
  const text = (a.text ?? "").trim();
  const title = a.title?.trim();
  if (title) return { subject: title, body: text };
  if (text) {
    const lines = text.split(/\r?\n/);
    return { subject: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
  }
  const labels = announcementAttachmentLabels(a);
  return { subject: labels[0] ?? "お知らせ", body: "" };
}

/** 宛先の表示（全員＝ネイビー、グループ＝最初のグループの色。複数なら「中2・Aチーム」。削除済みは無視） */
export function announcementTarget(
  a: Announcement,
  groups: TeamGroup[]
): { label: string; color: string; all: boolean } {
  const resolved = (a.groupIds ?? [])
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is TeamGroup => !!g);
  if (resolved.length === 0) return { label: "全員", color: ALL_TARGETS_COLOR, all: true };
  return {
    label: resolved.map((g) => g.label).join("・"),
    color: resolved[0].color ?? ALL_TARGETS_COLOR,
    all: false,
  };
}

/** 固定を上、その下に残りを、それぞれ新しい順に並べる（元の配列は変えない） */
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    return pb - pa || b.ts - a.ts;
  });
}

/**
 * 表示できるお知らせ。スタッフは全件、選手・保護者は自分宛て（announcementTargetsPlayer）だけ。
 * 選手が名簿から見つからないとき（me が null）は絞らない（従来の連絡タブと同じ）
 */
export function visibleAnnouncements(
  list: Announcement[],
  isStaff: boolean,
  me: Player | null,
  groups: TeamGroup[]
): Announcement[] {
  return list.filter((a) => isStaff || !me || announcementTargetsPlayer(a, me, groups));
}

/** 選手 me が未読（seenBy に自分がいない）のお知らせの数。セグメント「お知らせ」の赤丸・通知に使う */
export function announcementUnreadCount(list: Announcement[], me: Player, groups: TeamGroup[]): number {
  return list.filter((a) => announcementTargetsPlayer(a, me, groups) && !a.seenBy?.includes(me.id)).length;
}

/** お知らせの既読・未読・了解の集計（スタッフのカード「既読 52/70」・既読パネル用） */
export interface AnnouncementStats {
  /** 宛先に含まれる選手（名簿の並び順） */
  recipients: Player[];
  seen: Player[];
  unseen: Player[];
  acked: Player[];
}

/**
 * 集計は「今の宛先に含まれる選手」だけを数える（グループから外れた選手の seenBy は分子にも分母にも入れない）。
 * 了解した選手は既読にも含める（了解は必ず開いた後のため）
 */
export function announcementStats(a: Announcement, players: Player[], groups: TeamGroup[]): AnnouncementStats {
  const recipients = players.filter((p) => announcementTargetsPlayer(a, p, groups));
  const acks = new Set(a.acks ?? []);
  const seenSet = new Set([...(a.seenBy ?? []), ...acks]);
  return {
    recipients,
    seen: recipients.filter((p) => seenSet.has(p.id)),
    unseen: recipients.filter((p) => !seenSet.has(p.id)),
    acked: recipients.filter((p) => acks.has(p.id)),
  };
}

/**
 * id を固定／解除した結果のお知らせ配列。固定は最大 MAX_PINNED 件で、超えたら（今固定したものを除く）
 * 一番古い固定を外す（chat-plan-a §2-1）。addAnnouncement の pinned:true も同じ規則で通す
 */
export function applyPinned(list: Announcement[], id: string, pinned: boolean): Announcement[] {
  const next = list.map((a) => (a.id === id ? { ...a, pinned: pinned ? true : undefined } : a));
  if (!pinned) return next;
  const pins = next.filter((a) => a.pinned);
  if (pins.length <= MAX_PINNED) return next;
  const evict = pins
    .filter((a) => a.id !== id)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, pins.length - MAX_PINNED)
    .map((a) => a.id);
  return next.map((a) => (evict.includes(a.id) ? { ...a, pinned: undefined } : a));
}

/* ===== §2-5 送信の共通化 ===== */

/** SendTarget.tsx の SendTarget と同じ形（lib から components を参照しないための構造的な型） */
export interface SendTargetLike {
  mode: "none" | "team" | "player" | "group";
  playerId?: string;
  groupIds?: string[];
}

/** お知らせを作るときの入力（TeamProvider.addAnnouncement の引数） */
export interface NewAnnouncementInput {
  title?: string;
  text: string;
  groupIds?: string[];
  attachments?: ChatAttachment[];
  pinned?: boolean;
  fromName?: string;
  fromRole?: string;
}

/** BoardProvider のうち送信に使う部分（useBoard() の値をそのまま渡せる） */
export interface ChatBoardApi {
  sendMessage: (msg: Omit<ChatMessage, "id" | "ts">, opts?: { toast?: string | false }) => void;
  toast: (msg: string) => void;
  auth: { name: string };
  state: { players: Player[] };
}

/** TeamProvider のうち送信に使う部分（useTeam() の値をそのまま渡せる） */
export interface ChatTeamApi {
  addAnnouncement: (a: NewAnnouncementInput) => void;
  team: { coaches: string[] };
}

/** 宛先が送れる状態でなければ理由（toast 用）、送れるなら null。「送信しない」は null（送らないだけ） */
export function sendTargetError(t: SendTargetLike): string | null {
  if (t.mode === "group" && (!t.groupIds || t.groupIds.length === 0)) return "グループを選んでください";
  if (t.mode === "player" && !t.playerId) return "送り先の選手を選んでください";
  return null;
}

/** 送る添付の件名「戦術「〇〇」」…（チーム全員・グループ宛てのお知らせの件名になる） */
export function attachmentSubject(att: ChatAttachment): string {
  return attachmentLabel(att);
}

/**
 * 宛先（SendTarget）と添付から送る（chat-plan-a §2-5）。
 * - チーム全員 → お知らせ（groupIds 無し）。件名＝添付の名前、本文は空
 * - グループ → お知らせ 1 件（groupIds に選んだ全グループ。グループごとに複数件にしない）
 * - 個人 → その選手との 1 対 1 に ChatMessage
 * 送信者（fromName／fromRole）は staffIdentity で埋める。完了の toast は
 * 「お知らせを送りました」（addAnnouncement 内）／「〇〇さんに送りました」。
 * 送らなかったとき（送信しない・宛先未確定）は false（呼び出し側で先に sendTargetError を見て toast する）
 */
export function sendAttachmentToTarget({
  target,
  attachment,
  board,
  team,
}: {
  target: SendTargetLike;
  attachment: ChatAttachment;
  board: ChatBoardApi;
  team: ChatTeamApi;
}): boolean {
  if (target.mode === "none" || sendTargetError(target)) return false;
  const who = staffIdentity(board.auth.name, team.team.coaches);
  if (target.mode === "player") {
    const pid = target.playerId as string;
    const name = board.state.players.find((p) => p.id === pid)?.name ?? "選手";
    board.sendMessage(
      {
        to: dmThreadKey(pid),
        from: "coach",
        fromName: who.name,
        fromRole: who.role,
        attachments: [attachment],
      },
      { toast: `${name}さんに送りました` }
    );
    return true;
  }
  team.addAnnouncement({
    title: attachmentSubject(attachment),
    text: "",
    groupIds: target.mode === "group" ? target.groupIds : undefined,
    attachments: [attachment],
    fromName: who.name,
    fromRole: who.role,
  });
  return true;
}

/* ===== §6 team／grp メッセージ → お知らせの移行 ===== */

const MIGRATE_DEDUP_MS = 24 * 3600_000;

/** 添付の内容が同じかを見る簡易な署名（本文が空のもの同士の重複判定用） */
function attachmentSig(atts?: ChatAttachment[]): string {
  return (atts ?? []).map((a) => `${a.kind}:${a.title ?? ""}`).join("|");
}

/** 本文が同じか、一方が他方の先頭と一致するか（片方でも空なら、両方空で添付の署名が同じときだけ同じ） */
function sameContent(
  aText: string,
  aAtts: ChatAttachment[] | undefined,
  bText: string,
  bAtts: ChatAttachment[] | undefined
): boolean {
  const a = aText.trim();
  const b = bText.trim();
  if (!a || !b) {
    if (a || b) return false;
    const sig = attachmentSig(aAtts);
    return sig !== "" && sig === attachmentSig(bAtts);
  }
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * 旧形式のメッセージのうち to が "team"／"grp:*" のものをお知らせへ移す計画を立てる（chat-plan-a §6）。
 * - 移す：id＝ann_from_<msgid>、ts・本文・添付をそのまま、groupIds＝grp:* ならその id、fromName は元の値、title 無し
 * - 移さない：同じ宛先で、本文が同じか一方が他方の先頭と一致し、時刻の差が 24 時間以内のお知らせが既にある
 *   （デモの「今週末は練習試合です…」の二重を 1 件にする）／削除済みグループ宛て（捨てる）
 * removeIds には、移した・スキップした・捨てたメッセージの id をすべて入れる（呼び出し側が messages から消す）。
 * 同じ宛先の判定：team＝groupIds が無い／空、grp:X＝groupIds に X を含む（より広い宛先で送済みなら重複）
 */
export function planChatMigration(
  messages: ChatMessage[],
  announcements: Announcement[],
  groups: TeamGroup[]
): { add: Announcement[]; removeIds: string[] } {
  const add: Announcement[] = [];
  const removeIds: string[] = [];
  for (const m of messages) {
    const isTeam = m.to === "team";
    const gid = threadGroupId(m.to);
    if (!isTeam && gid === null) continue; // 1 対 1 は対象外
    removeIds.push(m.id);
    if (gid !== null && !groups.some((g) => g.id === gid)) continue; // 削除済みグループ宛ては捨てる
    const dup = announcements.some(
      (a) =>
        (gid === null ? !a.groupIds || a.groupIds.length === 0 : !!a.groupIds?.includes(gid)) &&
        Math.abs(a.ts - m.ts) <= MIGRATE_DEDUP_MS &&
        sameContent(a.text ?? "", a.attachments, m.text ?? "", m.attachments)
    );
    if (dup) continue;
    add.push({
      id: `ann_from_${m.id}`,
      ts: m.ts,
      text: m.text ?? "",
      groupIds: gid !== null ? [gid] : undefined,
      fromName: m.fromName,
      fromRole: m.fromRole,
      attachments: m.attachments && m.attachments.length > 0 ? m.attachments : undefined,
    });
  }
  return { add, removeIds };
}
