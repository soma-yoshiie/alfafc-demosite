import type { Group, Position, Slot } from "./types";

/**
 * フォーメーション定義。各要素は [役割, x, y]。
 * x:0(左)-100(右) / y:0(自陣GK側)-100(敵陣).
 * 参考: football lineup の戦術ボード配置を踏襲。
 */
export const FORMATIONS: Record<string, [Position, number, number][]> = {
  "4-3-3": [["GK", 50, 8], ["RB", 82, 26], ["CB", 63, 22], ["CB", 37, 22], ["LB", 18, 26], ["CM", 68, 52], ["CM", 50, 46], ["CM", 32, 52], ["RW", 80, 78], ["ST", 50, 85], ["LW", 20, 78]],
  "4-4-2": [["GK", 50, 8], ["RB", 82, 26], ["CB", 63, 22], ["CB", 37, 22], ["LB", 18, 26], ["RM", 82, 54], ["CM", 60, 50], ["CM", 40, 50], ["LM", 18, 54], ["ST", 62, 83], ["ST", 38, 83]],
  "4-2-3-1": [["GK", 50, 8], ["RB", 82, 26], ["CB", 63, 22], ["CB", 37, 22], ["LB", 18, 26], ["DM", 62, 44], ["DM", 38, 44], ["RW", 82, 67], ["AM", 50, 63], ["LW", 18, 67], ["ST", 50, 87]],
  "3-5-2": [["GK", 50, 8], ["CB", 72, 22], ["CB", 50, 20], ["CB", 28, 22], ["RWB", 89, 48], ["CM", 64, 52], ["CM", 50, 46], ["CM", 36, 52], ["LWB", 11, 48], ["ST", 62, 83], ["ST", 38, 83]],
  "3-4-3": [["GK", 50, 8], ["CB", 72, 22], ["CB", 50, 20], ["CB", 28, 22], ["RM", 85, 50], ["CM", 60, 48], ["CM", 40, 48], ["LM", 15, 50], ["RW", 78, 81], ["ST", 50, 85], ["LW", 22, 81]],
  "4-1-2-1-2": [["GK", 50, 8], ["RB", 82, 26], ["CB", 63, 22], ["CB", 37, 22], ["LB", 18, 26], ["DM", 50, 42], ["CM", 75, 56], ["CM", 25, 56], ["AM", 50, 68], ["ST", 62, 85], ["ST", 38, 85]],
  "8人制 3-3-1": [["GK", 50, 9], ["RB", 76, 28], ["CB", 50, 24], ["LB", 24, 28], ["RM", 76, 56], ["CM", 50, 52], ["LM", 24, 56], ["ST", 50, 84]],
  "8人制 2-3-2": [["GK", 50, 9], ["CB", 64, 26], ["CB", 36, 26], ["RM", 78, 54], ["CM", 50, 50], ["LM", 22, 54], ["ST", 62, 83], ["ST", 38, 83]],
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);

/** ポジション→大分類 */
const GROUP: Record<Position, Group> = {
  GK: "gk",
  RB: "df", LB: "df", CB: "df", RWB: "df", LWB: "df",
  DM: "mf", CM: "mf", AM: "mf", RM: "mf", LM: "mf",
  RW: "fw", LW: "fw", ST: "fw", CF: "fw",
};

export function groupOf(pos: Position): Group {
  return GROUP[pos] ?? "mf";
}

/** ピッチ座標からポジション名を推定（自由配置時に役割を付け替える） */
export function roleFromXY(x: number, y: number): Position {
  if (y < 15) return "GK";
  if (y < 37) {
    if (x >= 72) return "RB";
    if (x <= 28) return "LB";
    return "CB";
  }
  if (y < 46) {
    if (x >= 80) return "RWB";
    if (x <= 20) return "LWB";
    return "DM";
  }
  if (y < 62) {
    if (x >= 80) return "RM";
    if (x <= 20) return "LM";
    return "CM";
  }
  if (y < 72) {
    if (x >= 78) return "RM";
    if (x <= 22) return "LM";
    return "AM";
  }
  if (x >= 68) return "RW";
  if (x <= 32) return "LW";
  return "ST";
}

/** フォーメーションキーからスロット配列を生成（選手割当は引き継ぎ可能） */
export function buildSlots(formKey: string, prev?: Slot[]): Slot[] {
  const f = FORMATIONS[formKey] ?? FORMATIONS["4-3-3"];
  return f.map((s, i) => ({
    role: s[0],
    x: s[1],
    y: s[2],
    pid: prev && prev[i] ? prev[i].pid : null,
  }));
}

export const ALL_POSITIONS: Position[] = [
  "GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST", "CF",
];
