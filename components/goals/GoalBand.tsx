"use client";

import React from "react";
import { E } from "../Emoji";
import { IconChevronRight } from "../icons";
import { useGoals } from "../GoalsProvider";
import { addDaysStr, localDateStr, weekStart } from "@/lib/dates";
import { bandGoalFor, fmtWeekRange } from "@/lib/goals";

/**
 * ノートの今週の目標の帯（specs/goals.md §4-2）。練習・試合・自主練の作成フォームのいちばん上と、詳細の上に置く。
 * そのノートの日が入る週の目標を 1 行で見せ、押すと目標の画面（重ね表示）を開く。
 * その週の目標が無いときは、ノートの日が今週で、見ているのが選手本人のときだけ「今週の目標を決める」
 * （押すと週の見直しの画面）。それ以外は何も出さない。
 */
export default function GoalBand({
  playerId,
  date,
  viewer = "player",
}: {
  playerId: string;
  date: string;
  viewer?: "staff" | "player";
}) {
  const goals = useGoals();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const pg = goals.get(playerId);
  const thisMon = weekStart(localDateStr());
  const mon = weekStart(date);
  const g = bandGoalFor(pg, date);

  if (!g) {
    if (mon !== thisMon || viewer === "staff") return null;
    return (
      <button type="button" className="goalband" onClick={() => goals.openGoals(playerId, "review-week")}>
        <span className="goalband-ic">
          <E n="target" />
        </span>
        <span className="goalband-tx">
          <span className="goalband-decide">今週の目標を決める</span>
        </span>
        <IconChevronRight className="goalband-chev" width={20} height={20} aria-hidden="true" />
      </button>
    );
  }

  const label =
    mon === thisMon
      ? "今週の目標"
      : mon === addDaysStr(thisMon, -7)
        ? `先週の目標 ・ ${fmtWeekRange(mon)}`
        : `${fmtWeekRange(mon)} の週の目標`;
  return (
    <button type="button" className="goalband" onClick={() => goals.openGoals(playerId)}>
      <span className="goalband-ic">
        <E n="target" />
      </span>
      <span className="goalband-tx">
        <span className="goalband-lb">{label}</span>
        <span className="goalband-t">{g.text}</span>
      </span>
      <IconChevronRight className="goalband-chev" width={20} height={20} aria-hidden="true" />
    </button>
  );
}
