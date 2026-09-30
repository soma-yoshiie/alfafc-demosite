/**
 * 新体力テスト（文部科学省・12〜19歳）の採点（player-hub §1-3）。
 * 項目別得点表（男女）と総合評価表（年齢別 A〜E）を定数で持ち、記録から得点・合計・評価を
 * 表示のたびに計算する（保存しない）。出典：文部科学省「新体力テスト実施要項」の得点表
 * （調査報告 p13_roster/research/research.md §2-1 の表をそのまま定数化）。
 *
 * 採点の単位は 1 種目 1〜10 点・8 種目で 80 点満点。持久走(endurance)と 20m シャトルラン(shuttle)は
 * どちらか一方を選ぶ決まりで、両方記録があるときはシャトルランを使う。
 * 注意：持久走の表は男子 1500m・女子 1000m。距離の違いは見ないので、クラブ独自の「1000m走」に
 * standardKey "endurance" を付けて男子の記録を当てると実際より高い得点になる。そのため「1000m走」には
 * standardKey を付けず（lib/sampleTeam.ts の既定種目。storage.ts の loadTeam も名前から推定しない・付いていれば外す）、
 * 標準の持久走は別の種目「持久走（男子1500m／女子1000m）」（id ft_std_endurance）に付ける。
 */

import type { FitnessRecord, FitnessStandardKey, FitnessTest } from "./types";
import type { Sex } from "./profile";

/** 9 種目の並び（文部科学省の実施要項の順）。種目マスタの補完（storage.ts）も同じ順で足す */
export const STANDARD_KEYS: FitnessStandardKey[] = [
  "grip",
  "situp",
  "sitreach",
  "sidestep",
  "endurance",
  "shuttle",
  "sprint50",
  "longjump",
  "handball",
];

/** 9 種目の表示名（種目マスタの「新体力テストの種目」タグなどに使う） */
export const STANDARD_LABEL: Record<FitnessStandardKey, string> = {
  grip: "握力",
  situp: "上体起こし",
  sitreach: "長座体前屈",
  sidestep: "反復横とび",
  endurance: "持久走",
  shuttle: "20mシャトルラン",
  sprint50: "50m走",
  longjump: "立ち幅とび",
  handball: "ハンドボール投げ",
};

export function isStandardKey(v: unknown): v is FitnessStandardKey {
  return typeof v === "string" && (STANDARD_KEYS as string[]).includes(v);
}

/** 標準種目をあとから足すときの種目 id（既存の 5 種目は従来の fit_* のまま。sampleTeam.ts 参照） */
export function standardTestId(key: FitnessStandardKey): string {
  return `ft_std_${key}`;
}

/**
 * 種目名から標準種目を推定する（既存チームの種目マスタに印を補うとき。storage.ts の loadTeam）。
 * 「50m走」「立ち幅跳び／立ち幅とび」「反復横跳び／反復横とび」「上体起こし」「1500m走／持久走」。
 * 「1000m走」は含めない（男子 1500m の表で採点してしまうため。クラブ独自の種目のまま）。
 * 「150m走」のような数字続きは 50m 走とみなさない
 */
export function standardKeyForName(name: string): FitnessStandardKey | null {
  const n = name.replace(/\s+/g, "");
  if (/(^|[^0-9])50m/.test(n)) return "sprint50";
  if (/1500m|持久走/.test(n)) return "endurance";
  if (n.includes("立ち幅") || n.includes("立幅")) return "longjump";
  if (n.includes("反復横")) return "sidestep";
  if (n.includes("上体起こし")) return "situp";
  if (n.includes("握力")) return "grip";
  if (n.includes("長座体前屈")) return "sitreach";
  if (n.includes("シャトルラン")) return "shuttle";
  if (n.includes("ハンドボール投げ")) return "handball";
  return null;
}

/* ===== 項目別得点表 =====
 * 10 点 → 2 点の境目を 9 個並べる（1 点は「どれにも届かない」）。
 * 大きいほど良い種目は「その値以上」、小さいほど良い種目（持久走・50m走）は「その値以下」 */
interface Band {
  lowerIsBetter: boolean;
  /** 10 点・9 点 … 2 点の境目（10 点が先頭） */
  edges: number[];
}

const HIGH = (edges: number[]): Band => ({ lowerIsBetter: false, edges });
const LOW = (edges: number[]): Band => ({ lowerIsBetter: true, edges });

const TABLE: Record<Sex, Record<FitnessStandardKey, Band>> = {
  male: {
    grip: HIGH([56, 51, 47, 43, 38, 33, 28, 23, 18]),
    situp: HIGH([35, 33, 30, 27, 25, 22, 19, 16, 13]),
    sitreach: HIGH([64, 58, 53, 49, 44, 39, 33, 28, 21]),
    sidestep: HIGH([63, 60, 56, 53, 49, 45, 41, 37, 30]),
    // 男子は 1500m（秒）：4'59" 以下 = 10 点 … 9'20" 以下 = 2 点
    endurance: LOW([299, 316, 333, 355, 382, 410, 450, 499, 560]),
    shuttle: HIGH([125, 113, 102, 90, 76, 63, 51, 37, 26]),
    sprint50: LOW([6.6, 6.8, 7.0, 7.2, 7.5, 7.9, 8.4, 9.0, 9.7]),
    longjump: HIGH([265, 254, 242, 230, 218, 203, 188, 170, 150]),
    handball: HIGH([37, 34, 31, 28, 25, 22, 19, 16, 13]),
  },
  female: {
    grip: HIGH([36, 33, 30, 28, 25, 23, 20, 17, 14]),
    situp: HIGH([29, 26, 23, 20, 18, 15, 13, 11, 8]),
    sitreach: HIGH([63, 58, 54, 50, 45, 40, 35, 30, 23]),
    sidestep: HIGH([53, 50, 48, 45, 42, 39, 36, 32, 27]),
    // 女子は 1000m（秒）：3'49" 以下 = 10 点 … 6'57" 以下 = 2 点
    endurance: LOW([229, 242, 259, 277, 296, 318, 342, 374, 417]),
    shuttle: HIGH([88, 76, 64, 54, 44, 35, 27, 21, 15]),
    sprint50: LOW([7.7, 8.0, 8.3, 8.6, 8.9, 9.3, 9.8, 10.3, 11.2]),
    longjump: HIGH([210, 200, 190, 179, 168, 157, 145, 132, 118]),
    handball: HIGH([23, 20, 18, 16, 14, 12, 11, 10, 8]),
  },
};

/**
 * 1 種目の得点（1〜10）。sex 未設定は男子の表で引く（全国平均と同じ扱い。player-hub §1-3）。
 * 数値でない記録・0 以下の走タイムは採点できないので null
 */
export function scoreFor(standardKey: FitnessStandardKey, value: number, sex: Sex = "male"): number | null {
  if (!Number.isFinite(value)) return null;
  const band = TABLE[sex][standardKey];
  if (band.lowerIsBetter && value <= 0) return null;
  for (let i = 0; i < band.edges.length; i++) {
    if (band.lowerIsBetter ? value <= band.edges[i] : value >= band.edges[i]) return 10 - i;
  }
  return 1;
}

/* ===== 合計（8 種目・80 点満点） ===== */

/** 採点する 8 種目。持久走とシャトルランは 1 つの「持久力」にまとめる（レーダーの 8 軸もこの順） */
export type FitnessItemKey = "grip" | "situp" | "sitreach" | "sidestep" | "stamina" | "sprint50" | "longjump" | "handball";

export const FITNESS_ITEMS: { key: FitnessItemKey; label: string }[] = [
  { key: "grip", label: "握力" },
  { key: "situp", label: "上体起こし" },
  { key: "sitreach", label: "長座体前屈" },
  { key: "sidestep", label: "反復横とび" },
  { key: "stamina", label: "持久力" },
  { key: "sprint50", label: "50m走" },
  { key: "longjump", label: "立ち幅とび" },
  { key: "handball", label: "ハンドボール投げ" },
];

export interface ItemScore {
  item: FitnessItemKey;
  label: string;
  /** 採点に使った標準種目（stamina は endurance か shuttle） */
  standardKey: FitnessStandardKey;
  testId: string;
  value: number;
  date: string;
  /** 1〜10 */
  score: number;
}

export interface FitnessTotal {
  /** 記録のある種目の得点の合計 */
  total: number;
  /** 記録のある種目の数（最大 8） */
  n: number;
  /** 8 種目そろっている（そろえば 80 点満点の合計と総合評価が成り立つ） */
  complete: boolean;
  /** 記録のある種目（FITNESS_ITEMS の順） */
  items: ItemScore[];
}

/**
 * 記録から新体力テストの合計を出す。種目ごとにいちばん新しい記録を採点する
 * （asOf＝YYYY-MM-DD を渡すと、その日までの記録だけで数える＝「前回の時点」の合計に使える）。
 * 標準種目の印（FitnessTest.standardKey）が付いた種目だけが対象。
 * 持久走とシャトルランは両方あればシャトルラン。8 種目そろわなければ complete=false（呼び出し側が「n 種目」と添える）
 */
export function totalScore(
  records: FitnessRecord[] | undefined,
  tests: FitnessTest[],
  sex: Sex = "male",
  asOf?: string
): FitnessTotal {
  const keyOf = new Map<string, FitnessStandardKey>();
  tests.forEach((t) => {
    if (isStandardKey(t.standardKey)) keyOf.set(t.id, t.standardKey);
  });

  // 種目ごとの最新記録。同じ日付は先に出てきた方を残す（addFitnessRecord は先頭へ足すので新しい入力が先）
  const latest = new Map<FitnessStandardKey, FitnessRecord>();
  for (const r of records ?? []) {
    const k = keyOf.get(r.testId);
    if (!k) continue;
    if (asOf && r.date > asOf) continue;
    const cur = latest.get(k);
    if (!cur || r.date > cur.date) latest.set(k, r);
  }

  const items: ItemScore[] = [];
  for (const { key, label } of FITNESS_ITEMS) {
    const std: FitnessStandardKey = key === "stamina" ? (latest.has("shuttle") ? "shuttle" : "endurance") : key;
    const rec = latest.get(std);
    if (!rec) continue;
    const score = scoreFor(std, rec.value, sex);
    if (score == null) continue;
    items.push({ item: key, label, standardKey: std, testId: rec.testId, value: rec.value, date: rec.date, score });
  }
  return {
    total: items.reduce((s, x) => s + x.score, 0),
    n: items.length,
    complete: items.length === FITNESS_ITEMS.length,
    items,
  };
}

/** 標準種目の記録がある測定日（新しい順）。レーダーの「最新回」「前回」を選ぶのに使う */
export function standardSessionDates(records: FitnessRecord[] | undefined, tests: FitnessTest[]): string[] {
  const ids = new Set(tests.filter((t) => isStandardKey(t.standardKey)).map((t) => t.id));
  const dates = new Set<string>();
  (records ?? []).forEach((r) => {
    if (ids.has(r.testId) && r.date) dates.add(r.date);
  });
  return [...dates].sort().reverse();
}

/* ===== 総合評価（合計点 × 年齢 → A〜E） ===== */

export type FitnessGrade = "A" | "B" | "C" | "D" | "E";

/** 年齢（4月1日時点）ごとの A・B・C・D の下限（これ未満は E）。17 歳の列は 17〜19 歳 */
const GRADE_EDGES: Record<number, [number, number, number, number]> = {
  12: [51, 41, 32, 22],
  13: [57, 47, 37, 27],
  14: [60, 51, 41, 31],
  15: [61, 52, 41, 31],
  16: [63, 53, 42, 31],
  17: [65, 54, 43, 31],
};

/** 総合評価。年齢は 4 月 1 日時点の満年齢（12〜19 歳。範囲外・不明は null。男女共通の表） */
export function gradeFor(total: number, age: number | null | undefined): FitnessGrade | null {
  if (age == null || !Number.isFinite(age) || age < 12 || age > 19) return null;
  const edges = GRADE_EDGES[Math.min(Math.floor(age), 17)];
  const letters: FitnessGrade[] = ["A", "B", "C", "D"];
  for (let i = 0; i < edges.length; i++) {
    if (total >= edges[i]) return letters[i];
  }
  return "E";
}
