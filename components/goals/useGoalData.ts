"use client";

import { useMemo } from "react";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { useProfiles } from "../ProfileProvider";
import { useGoals } from "../GoalsProvider";
import { localDateStr, weekStart } from "@/lib/dates";
import { ladderRows, weekDays } from "@/lib/goals";

/** 目標の各画面が共有する読み出し（選手・プロフィール・目標・今日・段の並び・今週の 7 日） */
export function useGoalData(playerId: string) {
  const board = useBoard();
  const team = useTeam();
  const profiles = useProfiles();
  const goals = useGoals();
  const today = localDateStr();
  const stage = team.team.schoolStage ?? "elementary";
  const player = board.state.players.find((p) => p.id === playerId);
  const profile = profiles.get(playerId);
  const pg = goals.get(playerId);
  const rows = useMemo(() => ladderRows(pg, profile, player, today, stage), [pg, profile, player, today, stage]);
  const monday = weekStart(today);
  const days = useMemo(() => weekDays(board.notebook, playerId, monday), [board.notebook, playerId, monday]);
  return { board, team, profile, goals, today, stage, player, pg, rows, monday, days };
}
