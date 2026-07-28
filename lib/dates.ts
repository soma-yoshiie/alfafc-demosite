// ローカルタイムゾーン基準の日付ユーティリティ。
// toISOString() は UTC 基準のため、JST では 0〜9 時に日付が 1 日ズレる。
// 日付文字列 (YYYY-MM-DD) の生成・加算は必ずこちらを使うこと。

/** Date → YYYY-MM-DD（ローカル時刻基準） */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** n日前の YYYY-MM-DD（ローカル時刻基準） */
export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

/** YYYY-MM-DD に n 日加算（文字列をUTC解釈させないためパースも手動） */
export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDateStr(new Date(y, m - 1, d + n));
}

/** その日付が属する週の月曜日 (YYYY-MM-DD、月曜始まり) */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=日 1=月 ... 6=土
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysStr(date, diff);
}

/**
 * 週単位の連続記録数。今週に記録があれば今週から、無ければ先週から遡って数える
 * （今週まだ書いていなくても先週まで連続していれば途切れ扱いにしないグレース仕様）。
 */
export function weeklyStreak(dates: string[]): number {
  const weeks = new Set(dates.map((d) => weekStart(d)));
  if (weeks.size === 0) return 0;
  let cur = weekStart(localDateStr());
  if (!weeks.has(cur)) {
    cur = addDaysStr(cur, -7);
    if (!weeks.has(cur)) return 0;
  }
  let count = 0;
  while (weeks.has(cur)) {
    count++;
    cur = addDaysStr(cur, -7);
  }
  return count;
}

/** 週集合内での最長連続週数 */
export function longestWeeklyStreak(dates: string[]): number {
  const weeks = [...new Set(dates.map((d) => weekStart(d)))].sort();
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    cur = prev && addDaysStr(prev, 7) === w ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = w;
  }
  return best;
}

/** 日付→件数 */
export function countByDay(dates: string[]): Map<string, number> {
  const m = new Map<string, number>();
  dates.forEach((d) => m.set(d, (m.get(d) ?? 0) + 1));
  return m;
}

/** 直近n週（月曜始まり・今週を含む）の週別件数。ラベルは各週月曜の M/D */
export function weeklyCounts(dates: string[], weeks = 8): { label: string; value: number }[] {
  const thisMonday = weekStart(localDateStr());
  return Array.from({ length: weeks }, (_, k) => {
    const monday = addDaysStr(thisMonday, -7 * (weeks - 1 - k));
    const value = dates.filter((d) => weekStart(d) === monday).length;
    const [, m, day] = monday.split("-").map(Number);
    return { label: `${m}/${day}`, value };
  });
}
