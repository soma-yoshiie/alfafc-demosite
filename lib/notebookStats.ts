// サッカーノートの数え方（スタッフの未読）。一覧の「未読 N」とタブ・レールの数字が同じ定義になるよう、ここに1つだけ置く。

import type { NotebookEntry } from "./types";

/** スタッフがまだ開いていない提出（staffSeenAt が無いもの）の数 */
export function staffUnreadNotes(notebook: NotebookEntry[]): number {
  let n = 0;
  for (const e of notebook) if (!e.staffSeenAt) n++;
  return n;
}
