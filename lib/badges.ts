// 入口（ノート・チャット）の未読の数字。「その入口の先で片付く数」に揃える（specs/ux-fix-2026-10.md R1-4）。
// ConsoleShell（PC レール・スマホ下部タブ）／TeamHub のセグメント／ChatHome が同じ関数を使う。

import type { Announcement, ChatMessage, ChatReads, CoachDeliverable, NotebookEntry, Player, TeamGroup } from "./types";
import { DELIVER_KIND_LABEL } from "./types";
import type { NotifPrefs } from "./storage";
import { announcementUnreadCount, memberUnreadTotal, staffUnreadTotal } from "./chat";
import { deliverableVisibleToPlayer } from "./groups";
import { staffUnreadNotes } from "./notebookStats";

export interface NoteBadgeInput {
  role: "coach" | "player";
  notebook: NotebookEntry[];
  /** 配信（選手側の「未回答の配信」に使う。省略時は数えない） */
  deliverables?: CoachDeliverable[];
  /** 名簿（選手の宛先判定に使う） */
  players: Player[];
  groups?: TeamGroup[];
  notifPrefs: Pick<NotifPrefs, "notebook">;
  /** 選手・保護者の id（スタッフは null） */
  playerId: string | null;
  /** loadNotifSeen() の自分の値（選手のコメント既読） */
  seen: number;
}

/**
 * ノートの入口の数字。
 * スタッフ＝staffSeenAt の無い提出。選手・保護者＝未読のコーチのコメント＋未回答の配信（お知らせ・回答済みの配信は数えない）。
 * 通知の設定でノートを切っていれば 0。
 */
export function noteBadge(input: NoteBadgeInput): number {
  if (!input.notifPrefs.notebook) return 0;
  if (input.role === "coach") return staffUnreadNotes(input.notebook);
  const pid = input.playerId;
  if (!pid) return 0;
  const comments = input.notebook.filter(
    (n) => n.playerId === pid && !!n.staffComment && !!n.staffCommentTs && n.staffCommentTs > input.seen
  ).length;
  const me = input.players.find((p) => p.id === pid) ?? null;
  const unanswered = (input.deliverables ?? []).filter(
    (d) => deliverableVisibleToPlayer(d, me ?? undefined, input.groups ?? []) && d.kind in DELIVER_KIND_LABEL && !d.responses[pid]
  ).length;
  return comments + unanswered;
}

export interface ChatBadgeInput {
  role: "coach" | "player";
  players: Player[];
  messages: ChatMessage[];
  reads: ChatReads;
  announcements: Announcement[];
  groups: TeamGroup[];
  /** 選手・保護者の id（スタッフは null） */
  playerId: string | null;
  /** スタッフの未読に数える相手チームの id（省略時は全部） */
  oppTeamIds?: string[];
}

/** セグメント「メッセージ」の数字。スタッフ＝選手・保護者と相手チームの未読、選手・保護者＝スタッフからの未読 */
export function messageBadge(input: ChatBadgeInput): number {
  if (input.role === "coach") {
    return staffUnreadTotal(input.messages, input.reads, input.players, input.oppTeamIds);
  }
  return input.playerId ? memberUnreadTotal(input.messages, input.reads, input.playerId) : 0;
}

/** セグメント「お知らせ」の数字。選手・保護者の未読のお知らせ（スタッフには出さない） */
export function announcementBadge(input: ChatBadgeInput): number {
  if (input.role === "coach" || !input.playerId) return 0;
  const me = input.players.find((p) => p.id === input.playerId);
  return me ? announcementUnreadCount(input.announcements ?? [], me, input.groups ?? []) : 0;
}

/**
 * チャットの入口（PC レール・スマホ下部タブ「チーム」・チーム運営のセグメント「チャット」）の数字。
 * スタッフ＝メッセージの未読（お知らせは含めない）。選手・保護者＝未読のお知らせ＋スタッフからの未読メッセージ。
 */
export function chatBadge(input: ChatBadgeInput): number {
  return messageBadge(input) + announcementBadge(input);
}
