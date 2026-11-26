"use client";

import React from "react";
import { IconChevronRight } from "../icons";
import { useGoalData } from "./useGoalData";
import type { GoalEditTarget } from "./GoalEditSheet";
import { MAX_MID, MAX_YEAR, gradeGoalParts, midGoals } from "@/lib/goals";
import type { LadderRow } from "@/lib/goals";

/**
 * 一覧（specs/goals.md §2-3）。上の帯の鉛筆で開く。設定のグループ化リストと同じ形の行を 1 枚の白いカードに並べる。
 * 行を押すと直すシート（onEdit）。成績の目標の行は「成績表の目標」と添え、押すと成績表へ（onGrades）。
 */
export default function GoalList({
  playerId,
  onEdit,
  onGrades,
}: {
  playerId: string;
  onEdit: (t: GoalEditTarget) => void;
  onGrades?: () => void;
}) {
  const { rows, profile, stage, player, pg } = useGoalData(playerId);
  const gp = gradeGoalParts(profile, stage, player);
  // 足せる数は、続けている目標で数える（達成した段は数えない）
  const midCount = midGoals(pg).length;
  const yearActive = pg.goals.filter((g) => g.level === "year" && g.status === "active").length;

  const open = (r: LadderRow) => {
    if (r.kind === "dream") return onEdit({ kind: "dream" });
    if (r.goal) return onEdit({ kind: "goal", level: r.goal.level, goal: r.goal });
    return onEdit({ kind: "goal", level: r.kind as "long" | "year" | "month" | "week" });
  };

  // 成績の目標の行：成績表へ移れるとき（プロフィールの区画）だけ押せる。重ね表示では読むだけ（山形も出さない）
  const gradeRow = (key: string, label: string) => {
    if (!gp) return null;
    const inner = (
      <>
        <span className="glist-tx">
          <span className="glist-label">{label}</span>
          <span className="glist-text">{gp.text}</span>
          <span className="glist-label">成績表の目標</span>
        </span>
        {gp.due && <span className="glist-due">{gp.due}</span>}
      </>
    );
    return onGrades ? (
      <button key={key} type="button" className="glist-row" onClick={onGrades}>
        {inner}
        <IconChevronRight className="glist-chev" />
      </button>
    ) : (
      <div key={key} className="glist-row static">
        {inner}
      </div>
    );
  };

  const list: React.ReactNode[] = [];
  let yearGradeDone = false;
  rows
    .filter((r) => r.kind !== "today")
    .forEach((r) => {
      list.push(
        <button key={r.key} type="button" className="glist-row" onClick={() => open(r)}>
          <span className="glist-tx">
            <span className="glist-label">{r.label}</span>
            {r.empty ? (
              <span className="glist-text none">まだ書いていません</span>
            ) : (
              <span className="glist-text">{r.text}</span>
            )}
          </span>
          {r.due && <span className="glist-due">{r.due}</span>}
          <IconChevronRight className="glist-chev" />
        </button>
      );
      if (gp && r.kind === "long" && !gp.inYear) list.push(gradeRow("grade-long", r.label));
      if (gp && gp.inYear && r.kind === "year" && !yearGradeDone) {
        yearGradeDone = true;
        list.push(gradeRow("grade-year", r.label));
      }
    });

  return (
    <div className="glist">
      <div className="glist-card">{list}</div>
      {(yearActive < MAX_YEAR || midCount < MAX_MID) && (
        <div className="glist-adds">
          {yearActive < MAX_YEAR && yearActive > 0 && (
            <button type="button" className="gl-add" onClick={() => onEdit({ kind: "goal", level: "year" })}>
              ＋ 今年の目標を足す
            </button>
          )}
          {midCount < MAX_MID && (
            <button type="button" className="gl-add" onClick={() => onEdit({ kind: "goal", level: "mid" })}>
              ＋ 段を足す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
