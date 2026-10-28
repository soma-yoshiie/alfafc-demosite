// チャットの共通ヘルパー（specs/chat-plan-a.md を home-chat-groups-roster §2 で置き換えたもの）。
// 画面に依存しない純粋関数だけを置く（BoardProvider/TeamProvider/各画面から使う）。
// - §2-4 送信者の名前と役割（staffIdentity）
// - 表示用の日付・時刻、未読数、既読（1 対 1・グループ）
// - home-chat-groups-roster §2: グループのスレッド（grp:all／grp:<id>）、メッセージを「お知らせにする」ときの
//   ヘルパー（お知らせにされたメッセージの一覧・既読と了解の集計・固定）
// - §2-5 送信の共通化（宛先＋添付 → グループのスレッド or 1 対 1）

import type {
  ChatAttachment,
  ChatMessage,
  ChatReads,
  ChatReplyTo,
  Player,
  TeamGroup,
} from "./types";
import { dmThreadKey, groupThreadKey } from "./types";
import { ALL_TARGETS_COLOR, playerInGroup } from "./groups";

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

/* ===== グループのスレッド（home-chat-groups-roster §2-1） ===== */

/** 「全員」のグループのスレッドの groupId 部分（キーは "grp:all"） */
export const ALL_GROUP_ID = "all";
/** 「全員」のスレッドの会話キー */
export const ALL_THREAD_KEY = groupThreadKey(ALL_GROUP_ID);

/** 会話キーがグループのスレッドか（"grp:all"／"grp:<groupId>"） */
export function isGroupKey(key: string): boolean {
  return key.startsWith("grp:");
}

/** グループのスレッド 1 本分の情報（一覧の行・見出しに使う） */
export interface GroupThreadInfo {
  key: string;
  /** "all" か TeamGroup.id */
  id: string;
  label: string;
  /** 色の点（全員はネイビー） */
  color: string;
  /** 全員のとき null */
  group: TeamGroup | null;
}

/** 一覧に並べるグループのスレッド。「全員」を先頭に、team.groups の順 */
export function groupThreads(groups: TeamGroup[]): GroupThreadInfo[] {
  return [
    { key: ALL_THREAD_KEY, id: ALL_GROUP_ID, label: "全員", color: ALL_TARGETS_COLOR, group: null },
    ...groups.map((g) => ({
      key: groupThreadKey(g.id),
      id: g.id,
      label: g.label,
      color: g.color ?? ALL_TARGETS_COLOR,
      group: g,
    })),
  ];
}

/** 会話キーからグループのスレッドの情報を引く（グループが削除済みなら null） */
export function groupThreadInfo(key: string, groups: TeamGroup[]): GroupThreadInfo | null {
  return groupThreads(groups).find((t) => t.key === key) ?? null;
}

/** グループのスレッドのメンバー（選手・保護者）。全員＝名簿全員、それ以外＝そのグループの所属選手 */
export function threadMembers(key: string, players: Player[], groups: TeamGroup[]): Player[] {
  if (key === ALL_THREAD_KEY) return players;
  const info = groupThreadInfo(key, groups);
  return info?.group ? players.filter((p) => playerInGroup(p, info.group!)) : [];
}

/** 選手 me が入っているグループのスレッドのキー（全員＋学年＋カスタム）。me が無ければ全員だけ */
export function playerGroupKeys(me: Player | null | undefined, groups: TeamGroup[]): string[] {
  const keys = [ALL_THREAD_KEY];
  if (me) groups.forEach((g) => playerInGroup(me, g) && keys.push(groupThreadKey(g.id)));
  return keys;
}

/** 誰の目線で未読・一覧を作るか（スタッフ／選手・保護者） */
export type ChatViewAs = { side: "staff" } | { side: "member"; playerId: string; me: Player | null };

/* ===== §2-3 未読・既読（1 対 1 とグループ） ===== */

export type ChatSide = "staff" | "member";

/** メッセージの送信者が選手・保護者側か（"p:<playerId>"） */
export function isMemberFrom(from: string): boolean {
  return from.startsWith("p:");
}

/** メッセージの送信者が練習試合の相手チームのスタッフか（"opp:<teamId>"。matchup-demo §5） */
export function isOppFrom(from: string): boolean {
  return from.startsWith("opp:");
}

/** 会話キーが相手チームとの会話か（"opp:<teamId>"。スタッフだけが見る） */
export function isOppKey(key: string): boolean {
  return key.startsWith("opp:");
}

/**
 * side から見て「相手の発言」か。
 * 1 対 1：スタッフ側＝選手・相手チームの発言、選手側＝スタッフの発言。
 * グループ：スタッフ側＝選手・保護者の発言、選手側＝自分以外のすべて（スタッフと他の選手・保護者。memberId 必須）
 */
export function isCounterpartMsg(m: ChatMessage, side: ChatSide, key: string, memberId?: string): boolean {
  if (isGroupKey(key)) {
    return side === "staff" ? isMemberFrom(m.from) : m.from !== dmThreadKey(memberId ?? "");
  }
  return side === "staff" ? isMemberFrom(m.from) || isOppFrom(m.from) : m.from === "coach";
}

/** その会話の side の既読時刻。グループの選手側は members[自分]、それ以外は staff／member */
export function readSince(reads: ChatReads, key: string, side: ChatSide, memberId?: string): number {
  if (isGroupKey(key) && side === "member") return memberId ? reads[key]?.members?.[memberId] ?? 0 : 0;
  return reads[key]?.[side] ?? 0;
}

/**
 * その会話（"p:<playerId>"／"grp:…"）の未読数。スタッフ側＝選手の発言で ts > reads[key].staff、
 * 選手側（1 対 1）＝スタッフの発言で ts > reads[key].member、
 * 選手側（グループ）＝自分以外の発言で ts > reads[key].members[自分]（memberId を渡す）
 */
export function unreadCount(
  messages: ChatMessage[],
  reads: ChatReads,
  key: string,
  side: ChatSide,
  memberId?: string
): number {
  const since = readSince(reads, key, side, memberId);
  let n = 0;
  for (const m of messages) {
    if (m.to === key && m.ts > since && isCounterpartMsg(m, side, key, memberId)) n++;
  }
  return n;
}

/** その会話で、side から見た相手の発言のうち最新の ts（無ければ 0）。markChatRead の要否判定に使う */
export function latestCounterpartTs(messages: ChatMessage[], key: string, side: ChatSide, memberId?: string): number {
  let t = 0;
  for (const m of messages) {
    if (m.to === key && isCounterpartMsg(m, side, key, memberId) && m.ts > t) t = m.ts;
  }
  return t;
}

/**
 * スタッフ側の未読の合計（全 1 対 1＋グループ＋相手チームとの会話）。入口の赤丸に使う。
 * 名簿にいない選手（名簿から消した選手）の会話は数えない。一覧はその会話の行を出さないため、
 * 数えると赤丸と一覧の未読がずれ、開けない会話なので既読にもできない（chat-plan-a §3-1・§3-3）。
 * 相手チームの会話（opp:）も同じ理由で、oppTeamIds を渡したときはそこにあるチームだけ数える（省略時は全部）。
 * グループも同じ理由で、groups を渡したときは「全員」と今あるグループのスレッドだけ数える（省略時は全部）
 */
export function staffUnreadTotal(
  messages: ChatMessage[],
  reads: ChatReads,
  players: Player[],
  oppTeamIds?: string[],
  groups?: TeamGroup[]
): number {
  const alive = new Set(players.map((p) => dmThreadKey(p.id)));
  const oppAlive = oppTeamIds ? new Set(oppTeamIds.map((id) => `opp:${id}`)) : null;
  const grpAlive = groups ? new Set(groupThreads(groups).map((t) => t.key)) : null;
  let n = 0;
  for (const m of messages) {
    if (isGroupKey(m.to)) {
      if (grpAlive && !grpAlive.has(m.to)) continue;
      if (isMemberFrom(m.from) && m.ts > (reads[m.to]?.staff ?? 0)) n++;
      continue;
    }
    const opp = isOppKey(m.to) && isOppFrom(m.from) && (!oppAlive || oppAlive.has(m.to));
    if (!opp && (!alive.has(m.to) || !isMemberFrom(m.from))) continue;
    if (m.ts > (reads[m.to]?.staff ?? 0)) n++;
  }
  return n;
}

/**
 * 選手側の未読（スタッフとの 1 対 1 のスタッフの発言＋自分が入っているグループの自分以外の発言のうち、
 * 自分の既読より新しいもの）。me が名簿に見つからないときは「全員」のスレッドだけ数える
 */
export function memberUnreadTotal(
  messages: ChatMessage[],
  reads: ChatReads,
  playerId: string,
  me?: Player | null,
  groups: TeamGroup[] = []
): number {
  const dm = dmThreadKey(playerId);
  const grp = new Set(playerGroupKeys(me, groups));
  let n = 0;
  for (const m of messages) {
    if (m.to === dm) {
      if (m.from === "coach" && m.ts > (reads[dm]?.member ?? 0)) n++;
    } else if (grp.has(m.to)) {
      if (m.from !== dm && m.ts > (reads[m.to]?.members?.[playerId] ?? 0)) n++;
    }
  }
  return n;
}

/**
 * 自分（side）の発言を相手が読んだか。相手側の既読時刻が発言の ts 以上なら true
 * （1 対 1 の「既読」の表示に使う。時刻は付けない。chat-plan-a §2-3。グループの吹き出しには出さない）
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

/** グループのスレッドの一覧 1 行分（発言が無くても行は出す） */
export interface GroupSummary extends GroupThreadInfo {
  last: ChatMessage | null;
  unread: number;
}

/**
 * 一覧の「グループ」の区画。「全員」を先頭に team.groups の順（並びは最新順にしない）。
 * スタッフは全グループ、選手・保護者は自分が入っているグループだけ。
 * 未読は unreadCount と同じ数え方（一覧・レール・下部タブで一致させる）
 */
export function groupSummaries(
  messages: ChatMessage[],
  reads: ChatReads,
  groups: TeamGroup[],
  view: ChatViewAs
): GroupSummary[] {
  const visible = view.side === "staff" ? null : new Set(playerGroupKeys(view.me, groups));
  const memberId = view.side === "member" ? view.playerId : undefined;
  return groupThreads(groups)
    .filter((t) => !visible || visible.has(t.key))
    .map((t) => {
      let last: ChatMessage | null = null;
      for (const m of messages) if (m.to === t.key && (!last || m.ts >= last.ts)) last = m;
      return { ...t, last, unread: unreadCount(messages, reads, t.key, view.side, memberId) };
    });
}

/** 相手チームとの会話の 1 行分（matchup-demo §5。DmSummary と同じ形で、選手の代わりにチームの id を持つ） */
export interface OppSummary {
  key: string;
  teamId: string;
  last: ChatMessage;
  unread: number;
}

/**
 * 相手チームとの会話（"opp:<teamId>"）を、dmSummaries と同じ形で最新の発言の新しい順に返す。
 * 未読は相手チームの発言のうち、スタッフの既読時刻より新しいもの
 */
export function oppSummaries(messages: ChatMessage[], reads: ChatReads): OppSummary[] {
  const map = new Map<string, OppSummary>();
  for (const m of messages) {
    if (!isOppKey(m.to)) continue;
    let s = map.get(m.to);
    if (!s) {
      s = { key: m.to, teamId: m.to.slice(4), last: m, unread: 0 };
      map.set(m.to, s);
    }
    if (m.ts >= s.last.ts) s.last = m;
    if (isOppFrom(m.from) && m.ts > (reads[m.to]?.staff ?? 0)) s.unread++;
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

/* ===== お知らせにされたメッセージ（home-chat-groups-roster §2-4・§2-6） ===== */

/** 固定できる上限（最大 2 件。3 件目を固定したら一番古い固定を外す） */
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

/** お知らせとしての見出し（本文の 1 行目。本文が無ければ添付の名前、それも無ければ「お知らせ」） */
export function announceSubject(m: ChatMessage): string {
  const text = (m.text ?? "").trim();
  if (text) return text.split(/\r?\n/)[0].trim();
  const a = m.attachments?.[0];
  return a ? attachmentLabel(a) : "お知らせ";
}

/** その会話のグループ名（ホームの 2 行目「グループ名 ・ M/D」に使う）。グループが無ければ空 */
export function threadLabel(key: string, groups: TeamGroup[]): string {
  return groupThreadInfo(key, groups)?.label ?? "";
}

/**
 * お知らせにされたメッセージ（announce あり）の一覧。固定を先に、その中は announce.ts の新しい順。
 * 見せる範囲：スタッフ＝今あるグループのスレッドすべて、選手・保護者＝自分が入っているグループのもの。
 * 削除したグループのスレッドのメッセージは出さない
 */
export function announcedMessages(messages: ChatMessage[], groups: TeamGroup[], view: ChatViewAs): ChatMessage[] {
  const keys = new Set(
    view.side === "staff" ? groupThreads(groups).map((t) => t.key) : playerGroupKeys(view.me, groups)
  );
  return messages
    .filter((m) => !!m.announce && keys.has(m.to))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.announce!.ts - a.announce!.ts);
}

/**
 * id を固定／解除した結果のメッセージ配列。固定は最大 MAX_PINNED 件で、超えたら（今固定したものを除く）
 * 一番古い固定（announce.ts の古い順）を外す
 */
export function applyMessagePinned(list: ChatMessage[], id: string, pinned: boolean): ChatMessage[] {
  const next = list.map((m) => (m.id === id ? { ...m, pinned: pinned ? true : undefined } : m));
  if (!pinned) return next;
  const pins = next.filter((m) => m.pinned);
  if (pins.length <= MAX_PINNED) return next;
  const evict = pins
    .filter((m) => m.id !== id)
    .sort((a, b) => (a.announce?.ts ?? a.ts) - (b.announce?.ts ?? b.ts))
    .slice(0, pins.length - MAX_PINNED)
    .map((m) => m.id);
  return next.map((m) => (evict.includes(m.id) ? { ...m, pinned: undefined } : m));
}

/** お知らせにされたメッセージの既読・未読・了解の集計（スタッフの「既読 N/M ・ 了解 K」・既読パネル用） */
export interface MessageReadStats {
  /** そのスレッドのメンバー（選手・保護者。名簿の並び順。発言者本人は除く） */
  recipients: Player[];
  seen: Player[];
  unseen: Player[];
  acked: Player[];
}

/**
 * N＝メンバーのうち reads[key].members[id] >= m.ts の人数、M＝メンバー数、K＝acks の人数。
 * 了解した人は読んだはずなので既読にも含める（ホームから開かずに了解しても既読の数がずれない）。
 * 集計は今のメンバーだけを数える（グループから外れた選手の既読・了解は分子にも分母にも入れない）
 */
export function messageReadStats(
  m: ChatMessage,
  players: Player[],
  groups: TeamGroup[],
  reads: ChatReads
): MessageReadStats {
  const members = reads[m.to]?.members ?? {};
  const recipients = threadMembers(m.to, players, groups).filter((p) => m.from !== dmThreadKey(p.id));
  const acks = m.acks ?? {};
  const isAcked = (id: string) => acks[id] !== undefined;
  const isSeen = (id: string) => isAcked(id) || (members[id] ?? 0) >= m.ts;
  return {
    recipients,
    seen: recipients.filter((p) => isSeen(p.id)),
    unseen: recipients.filter((p) => !isSeen(p.id)),
    acked: recipients.filter((p) => isAcked(p.id)),
  };
}

/* ===== §2-5 送信の共通化 ===== */

/** SendTarget.tsx の SendTarget と同じ形（lib から components を参照しないための構造的な型） */
export interface SendTargetLike {
  mode: "none" | "team" | "player" | "group";
  playerId?: string;
  groupIds?: string[];
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
  team: { coaches: string[] };
  groups?: TeamGroup[];
}

/** 宛先が送れる状態でなければ理由（toast 用）、送れるなら null。「送信しない」は null（送らないだけ） */
export function sendTargetError(t: SendTargetLike): string | null {
  if (t.mode === "group" && (!t.groupIds || t.groupIds.length === 0)) return "グループを選んでください";
  if (t.mode === "player" && !t.playerId) return "送り先の選手を選んでください";
  return null;
}

/**
 * 宛先（SendTarget）と添付から送る（chat-plan-a §2-5 を home-chat-groups-roster §2-2 で置き換え）。
 * - チーム全員 → 「全員」のグループのスレッド（grp:all）に添付つきのメッセージ。本文は空
 * - グループ → 選んだグループそれぞれのスレッド（grp:<id>）に 1 通ずつ
 * - 個人 → その選手との 1 対 1 に ChatMessage
 * 送信者（fromName／fromRole）は staffIdentity で埋める。完了の toast は
 * 「全員に送りました」「〇〇に送りました」「〇〇さんに送りました」。
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
  const base = { from: "coach", fromName: who.name, fromRole: who.role, attachments: [attachment] };
  if (target.mode === "player") {
    const pid = target.playerId as string;
    const name = board.state.players.find((p) => p.id === pid)?.name ?? "選手";
    board.sendMessage({ to: dmThreadKey(pid), ...base }, { toast: `${name}さんに送りました` });
    return true;
  }
  const keys = target.mode === "group" ? (target.groupIds ?? []).map((id) => groupThreadKey(id)) : [ALL_THREAD_KEY];
  keys.forEach((to) => board.sendMessage({ to, ...base }, { toast: false }));
  const labels = keys.map((k) => groupThreadInfo(k, team.groups ?? [])?.label ?? "全員");
  board.toast(
    target.mode === "team" ? "全員に送りました" : labels.length === 1 ? `${labels[0]}に送りました` : `${labels.length}つのグループに送りました`
  );
  return true;
}
