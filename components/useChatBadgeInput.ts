"use client";

import { useMemo } from "react";
import type { ChatBadgeInput } from "@/lib/badges";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useMatchups } from "./matchup/MatchupProvider";

/**
 * チャットの数字（lib/badges.ts の chatBadge／messageBadge／announcementBadge）の入力。
 * ChatHome・TeamHub のセグメント・ConsoleShell のレール／下部タブが同じ入力を使う。
 * 見る人はチャット画面と同じく TeamProvider の viewer（スタッフ／選手・保護者）で決める。
 */
export function useChatBadgeInput(): ChatBadgeInput {
  const board = useBoard();
  const team = useTeam();
  const { teams: oppTeams } = useMatchups();
  const isStaff = team.viewer.role === "coach";
  const playerId = isStaff ? null : team.viewer.memberPlayerId ?? board.auth.playerId ?? null;
  const oppKey = oppTeams.map((t) => t.id).join("|");
  return useMemo<ChatBadgeInput>(
    () => ({
      role: isStaff ? "coach" : "player",
      players: board.state.players,
      messages: board.messages,
      reads: board.chatReads,
      announcements: team.team.announcements,
      groups: team.groups,
      playerId,
      oppTeamIds: oppKey ? oppKey.split("|") : [],
    }),
    // oppKey は oppTeams の id 列（配列の参照が毎回変わるため文字列で比較する）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStaff, board.state.players, board.messages, board.chatReads, team.team.announcements, team.groups, playerId, oppKey]
  );
}
