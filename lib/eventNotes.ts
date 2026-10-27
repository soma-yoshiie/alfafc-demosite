// 予定とサッカーノートの紐づけ・提出の数え方。サッカーノートの予定別（NotebookScreen）と
// 予定の詳細（TeamHub）の「提出 N／M」を同じ数にするため、ここに1つだけ置く（ux-fix R2-7）。

import type { NotebookEntry, PracticeNote, TeamEvent } from "./types";

/**
 * ノートがその予定に属するか。
 * (a) eventId を持つ練習ノートは明示紐づけのみで判定する（同日の別予定への二重掲載を防ぐ）
 * (b) それ以外は 日付範囲(date〜endDate) ＋ 種別対応(練習予定→練習ノート/試合予定→試合ノート)
 * 自主練ノートはどの予定にも入れない。
 */
export function noteBelongsToEvent(n: NotebookEntry, ev: TeamEvent): boolean {
  if (n.kind === "practice" && (n as PracticeNote).eventId) return (n as PracticeNote).eventId === ev.id;
  if (n.kind === "solo") return false;
  if (n.kind !== (ev.kind === "match" ? "match" : "practice")) return false;
  return n.date >= ev.date && n.date <= (ev.endDate ?? ev.date);
}

/**
 * 予定ごとの提出の数。targets＝予定の対象選手（呼ぶ側で絞り込み中の学年/グループを掛けてよい）、
 * subs＝その予定に属するノート（noteBelongsToEvent で絞ったもの）。同じ選手が2件出しても1人。
 * submitted は targets のうち提出した人数、missing は未提出の選手
 */
export function eventSubmitStats<P extends { id: string }>(
  targets: P[],
  subs: NotebookEntry[]
): { targetCount: number; submitted: number; missing: P[] } {
  const done = new Set(subs.map((n) => n.playerId));
  const missing = targets.filter((p) => !done.has(p.id));
  return { targetCount: targets.length, submitted: targets.length - missing.length, missing };
}
