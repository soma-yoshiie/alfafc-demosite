"use client";

import React from "react";
import GoalBoard from "../goals/GoalBoard";
import type { HubSectionProps } from "./common";

/**
 * セクション「目標」（specs/goals.md §5）：GoalBoard を置くだけ。選手は自分の目標（はしご。上の鉛筆で一覧）、
 * スタッフは名簿の個人ページで、白いカードの詰めたはしご（読むだけ）。
 */
export default function GoalsSection({ p, viewer, go }: HubSectionProps) {
  return (
    <section className="phubsec" aria-label="目標">
      <GoalBoard playerId={p.id} viewer={viewer} mode="section" onGrades={() => go("grades")} onCareer={() => go("career")} />
    </section>
  );
}
