/**
 * デモの目標（goals §1-2）。佐藤 蒼空（p08）だけ。日付は今日から計算する（今週の月曜・先週の月曜・今月・今の年度の終わり）。
 * 夢は進路の将来の目標（sampleProfiles の p08）をそのまま出すので、ここには持たない。
 * 投入は GoalsProvider の初回マウントだけ（保存が空・マーカー無し・名簿に p08 がいるとき）
 */

import type { Goal, PlayerGoals } from "./goals";
import { monthEnd, monthOf, schoolYearEnd } from "./goals";
import { addDaysStr, localDateStr, weekStart } from "./dates";

export function sampleGoals(): Record<string, PlayerGoals> {
  const today = localDateStr();
  const now = Date.now();
  const mon = weekStart(today);
  const prevMon = addDaysStr(mon, -7);
  const ym = monthOf(today);
  const mk = (g: Partial<Goal> & Pick<Goal, "id" | "level" | "text">): Goal => ({
    order: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
    updatedBy: "player",
    ...g,
  });
  const goals: Goal[] = [
    mk({ id: "goal_p08_long", level: "long", text: "サッカーの強い高校に合格する", due: "2028-03-31" }),
    mk({ id: "goal_p08_year", level: "year", text: "A チームで全試合に先発する", due: schoolYearEnd(today) }),
    mk({ id: "goal_p08_month", level: "month", text: "ファーストタッチを前向きに置く", period: ym, due: monthEnd(ym) }),
    mk({
      id: "goal_p08_week",
      level: "week",
      text: "受ける前に 2 回、首を振る",
      period: mon,
      due: addDaysStr(mon, 6),
      ifThen: "味方にボールが入ったら、首を振る",
    }),
    mk({
      id: "goal_p08_week_prev",
      level: "week",
      text: "逆足でトラップする",
      period: prevMon,
      due: addDaysStr(prevMon, 6),
      review: "half",
    }),
  ];
  return { p08: { playerId: "p08", goals, staffNotes: [], setupDone: true, updatedAt: now } };
}
