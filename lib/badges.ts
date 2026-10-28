// 入口（ノート・チャット）の未読の数字。「その入口の先で片付く数」に揃える（specs/ux-fix-2026-10.md R1-4）。
// ConsoleShell（PC レール・スマホ下部タブ）／TeamHub のセグメント／ChatHome が同じ関数を使う。

import type { ChatMessage, ChatReads, CoachDeliverable, NotebookEntry, Player, TeamGroup } from "./types";
import { DELIVER_KIND_LABEL } from "./types";
import type { NotifPrefs } from "./storage";
import { memberUnreadTotal, staffUnreadTotal } from "./chat";
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
 * 選手・保護者の「未読のコーチのコメント」（本人のノートで、コメントがあり、見た時刻より後のもの）。
 * noteBadge の数え方と、ホームの「コーチからコメント N 件」が同じになるよう 1 か所に置く。
 * 新しい順。
 */
export function unreadStaffComments(notebook: NotebookEntry[], playerId: string | null, seen: number): NotebookEntry[] {
  if (!playerId) return [];
  return notebook
    .filter((n) => n.playerId === playerId && isUnreadStaffComment(n, seen))
    .sort((a, b) => (b.staffCommentTs ?? b.ts) - (a.staffCommentTs ?? a.ts));
}

/**
 * そのノートのコーチのコメントが未読か。コメントがあり、通知の既読時刻（seen）より後で、
 * かつ本人が詳細で見た時刻（playerCommentSeenTs）より後のもの。
 */
export function isUnreadStaffComment(n: NotebookEntry, seen: number): boolean {
  if (!n.staffComment || !n.staffCommentTs) return false;
  if (n.staffCommentTs <= seen) return false;
  return !(n.playerCommentSeenTs && n.playerCommentSeenTs >= n.staffCommentTs);
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
  const comments = unreadStaffComments(input.notebook, pid, input.seen).length;
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
  groups: TeamGroup[];
  /** 選手・保護者の id（スタッフは null） */
  playerId: string | null;
  /** スタッフの未読に数える相手チームの id（省略時は全部） */
  oppTeamIds?: string[];
}

/**
 * チャットの入口（PC レール・スマホ下部タブ「チーム」・チーム運営のセグメント「チャット」・チャット画面）の数字。
 * home-chat-groups-roster §2-2：お知らせのタブは廃止したので、1 対 1 の未読＋グループの未読（＋スタッフは相手チーム）に揃える。
 * スタッフ＝選手・保護者と相手チームと各グループの未読。選手・保護者＝スタッフからの 1 対 1＋自分が入っているグループの未読
 */
export function chatBadge(input: ChatBadgeInput): number {
  if (input.role === "coach") {
    return staffUnreadTotal(input.messages, input.reads, input.players, input.oppTeamIds, input.groups);
  }
  if (!input.playerId) return 0;
  const me = input.players.find((p) => p.id === input.playerId) ?? null;
  return memberUnreadTotal(input.messages, input.reads, input.playerId, me, input.groups);
}
