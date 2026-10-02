// ホームの「今月のハイライト」が使う週ごとのノート提出件数（components/homeData.tsx）。
// 出席率・勝率の系列は、ホームの指標のグラフを外したとき（round5-home）に削除した。

import { weeklyCounts } from "./dates";
import type { NotebookEntry } from "./types";

export interface TrendPoint {
  label: string;
  /** その週/月の母数(対象件数)が0＝欠測のときは null（0%と区別する） */
  value: number | null;
}

/** 直近n週(既定7・月曜始まり)のノート提出件数(全種別・ノート日付n.dateで週判定。lib/coaching.ts の週集計と同じ基準) */
export function weeklyNoteCounts(notebook: NotebookEntry[], weeks = 7): TrendPoint[] {
  return weeklyCounts(
    notebook.map((n) => n.date),
    weeks
  );
}
