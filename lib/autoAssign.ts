// 戦術ボード「選手を配置」シートの自動配置（groups-phase2 §2-1）。
// 画面から独立した純粋関数にして、割り当てロジックを単体で検証できるようにする。

import { groupOf } from "./formations";
import type { Group, Player, Slot } from "./types";

export interface AssignPair {
  slot: number;
  pid: string;
}

/** 枠の処理順（GK→DF→MF→FW）。同分類内は slots の配列順のまま処理する */
const GROUP_ORDER: Record<Group, number> = { gk: 0, df: 1, mf: 2, fw: 3 };

/**
 * 空いている枠（pid===null）だけを対象に、candidates（呼び出し側で
 * 「選択グループ所属 ∧ 未配置」に絞り込み済み・名簿順）から割り当て案を作る。
 * 枠の処理順は GK→DF→MF→FW（groupOf(slot.role)）、同分類内は slots の配列順。
 * 各枠は ①p.position === slot.role の選手 ②同じ大分類(groupOf)の選手 の順で、
 * candidates の先頭から未使用の選手を1人取る。どちらも居なければその枠は結果に含めない
 * （空きのまま）。1人の選手が複数枠に重複することはない（used で管理）。
 * 実際の反映（dispatch）は呼び出し側（BoardProvider の assignMany）が行う。
 */
export function planAutoAssign(slots: Slot[], candidates: Player[]): AssignPair[] {
  const targets = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.pid == null)
    .sort((a, b) => GROUP_ORDER[groupOf(a.s.role)] - GROUP_ORDER[groupOf(b.s.role)]);

  const used = new Set<string>();
  const result: AssignPair[] = [];
  for (const { s, i } of targets) {
    const exact = candidates.find((p) => !used.has(p.id) && p.position === s.role);
    const pick =
      exact ?? candidates.find((p) => !used.has(p.id) && groupOf(p.position) === groupOf(s.role));
    if (pick) {
      used.add(pick.id);
      result.push({ slot: i, pid: pick.id });
    }
  }
  return result;
}
