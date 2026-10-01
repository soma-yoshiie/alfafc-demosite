// p15 §2: 試合記録の絞り込みの「期間」。MatchesTab と RecSummaryPane で同じ範囲を使う。

import { periodStartDate } from "./attendanceStats";

export type RecPeriod = "all" | "m1" | "m3" | "m6" | "fy" | "lastfy";

export const REC_PERIOD_OPTIONS: { key: RecPeriod; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "m1", label: "直近1か月" },
  { key: "m3", label: "直近3か月" },
  { key: "m6", label: "直近6か月" },
  { key: "fy", label: "今年度" },
  { key: "lastfy", label: "昨年度" },
];

/** 期間の範囲（両端を含む YYYY-MM-DD。null は制限なし）。年度は 4/1〜翌 3/31 */
export function recPeriodRange(period: RecPeriod, todayStr: string): { from: string | null; to: string | null } {
  if (period === "all") return { from: null, to: null };
  if (period === "m1" || period === "m3" || period === "m6") {
    return { from: periodStartDate(period, todayStr), to: null };
  }
  const [y, m] = todayStr.split("-").map(Number);
  if (!y || !m) return { from: null, to: null };
  // 今日が 4 月以降ならその年の 4/1 から、1〜3 月なら前年の 4/1 から（今年度）
  const fyStart = m >= 4 ? y : y - 1;
  const startYear = period === "fy" ? fyStart : fyStart - 1;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export function matchInPeriod(date: string, period: RecPeriod, todayStr: string): boolean {
  if (period === "all") return true;
  const { from, to } = recPeriodRange(period, todayStr);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
