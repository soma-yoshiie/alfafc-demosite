// カレンダー機能拡張のヘルパー集約（パレット・カテゴリ・日付・繰り返し展開・地図URL）

import type { EventCategory, RecurrenceRule, TeamEvent } from "./types";

/** プリセットパレット（これ以外の色は使わせない） */
export const CATEGORY_PALETTE: { color: string; name: string }[] = [
  { color: "#15233c", name: "ネイビー" },
  { color: "#d9731f", name: "オレンジ" },
  { color: "#15803d", name: "グリーン" },
  { color: "#d6324b", name: "レッド" },
  { color: "#7c5cbf", name: "パープル" },
  { color: "#0f766e", name: "ティール" },
  { color: "#2563eb", name: "ブルー" },
  { color: "#8a5a2b", name: "ブラウン" },
  { color: "#c2418f", name: "ピンク" },
  { color: "#586074", name: "グレー" },
];

export const BUILTIN_CATEGORIES: EventCategory[] = [
  { id: "practice", label: "練習", color: "#15233c", builtin: true },
  { id: "match", label: "試合", color: "#d9731f", builtin: true },
];
// ※ practice=ネイビー・match=オレンジは既存CSS（--blue/--match）と一致させること

export const eventEndDate = (e: TeamEvent) => e.endDate ?? e.date;
export const isMultiDay = (e: TeamEvent) => eventEndDate(e) > e.date;
export const eventStartKey = (e: TeamEvent) =>
  `${e.date} ${e.allDay ? "" : e.time ?? ""}`; // 終日が同日先頭に来る
export const occursOn = (e: TeamEvent, ymd: string) =>
  ymd >= e.date && ymd <= eventEndDate(e);
export const isUpcomingOrOngoing = (e: TeamEvent, today: string) =>
  eventEndDate(e) >= today;
export const isOngoing = (e: TeamEvent, today: string) =>
  e.date <= today && today <= eventEndDate(e);
export const byStartAsc = (a: TeamEvent, b: TeamEvent) =>
  eventStartKey(a) < eventStartKey(b) ? -1 : 1;

export function categoryOf(e: TeamEvent, cats: EventCategory[]): EventCategory {
  const id = e.categoryId ?? e.kind;
  return (
    cats.find((c) => c.id === id) ??
    BUILTIN_CATEGORIES.find((c) => c.id === e.kind) ??
    BUILTIN_CATEGORIES[0]
  );
}

/* ===== 日付ユーティリティ（Dateのタイムゾーン事故を避けるため文字列⇔数値変換を自前で） ===== */

/** YYYY-MM-DD を {y,m,d}（mは1-12）に分解 */
function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  return { y, m, d };
}

/** {y,m,d} を YYYY-MM-DD に整形（mは1-12） */
function formatYmd(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** YYYY-MM-DD の日数を加算（負数可）。UTC正午基準で計算しDST等の影響を避ける */
export function addDays(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const ms = Date.UTC(y, m - 1, d, 12, 0, 0) + days * 86400000;
  const dt = new Date(ms);
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** b - a の日数 */
export function diffDays(a: string, b: string): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  const msa = Date.UTC(pa.y, pa.m - 1, pa.d, 12, 0, 0);
  const msb = Date.UTC(pb.y, pb.m - 1, pb.d, 12, 0, 0);
  return Math.round((msb - msa) / 86400000);
}

/** YYYY-MM-DD の曜日（0=日..6=土）。UTC正午基準で計算 */
function weekdayOf(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** その月の末日（存在する最大の日） */
function lastDayOfMonth(y: number, m: number): number {
  // m: 1-12。次月の0日目 = 当月末日
  return new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate();
}

/** 繰り返し展開: 開始日(anchor)から until まで、該当日の配列を返す。 */
export const MAX_OCCURRENCES = 200;
export function expandRule(rule: RecurrenceRule, anchor: string): string[] {
  const out: string[] = [];
  const { until, freq, interval } = rule;

  if (freq === "weekly") {
    const weekdays =
      rule.byWeekday && rule.byWeekday.length > 0
        ? [...rule.byWeekday].sort((a, b) => a - b)
        : [weekdayOf(anchor)];
    // anchor週の日曜を起点に interval週ごとに weekdays を列挙
    const anchorDow = weekdayOf(anchor);
    const weekStart = addDays(anchor, -anchorDow); // anchor週の日曜
    let weekOffset = 0;
    outer: for (;;) {
      const curWeekStart = addDays(weekStart, weekOffset * 7 * interval);
      for (const wd of weekdays) {
        const day = addDays(curWeekStart, wd);
        if (day < anchor) continue; // anchorより前は含めない
        if (day > until) break outer;
        out.push(day);
        if (out.length >= MAX_OCCURRENCES) break outer;
      }
      weekOffset += 1;
      // 安全弁: until超えの週まで際限なく回らないよう、curWeekStartがuntilを大きく超えたら停止
      if (curWeekStart > until) break;
    }
  } else {
    // monthly: anchor の「日」を毎月（intervalは常に1として扱う）。存在しない月はスキップ
    const { y, m, d } = parseYmd(anchor);
    let cy = y;
    let cm = m;
    for (let i = 0; i < MAX_OCCURRENCES * 4 && out.length < MAX_OCCURRENCES; i++) {
      const last = lastDayOfMonth(cy, cm);
      if (d <= last) {
        const day = formatYmd(cy, cm, d);
        if (day >= anchor && day <= until) {
          out.push(day);
        } else if (day > until) {
          break;
        }
      } else {
        // 存在しない日（例: 31日→2月）はスキップし、untilを超えたかは翌月以降で判定
        const skipCheck = formatYmd(cy, cm, last);
        if (skipCheck > until) break;
      }
      cm += 1;
      if (cm > 12) {
        cm = 1;
        cy += 1;
      }
    }
  }

  return out.slice(0, MAX_OCCURRENCES);
}

/* ===== 地図URL ===== */
export const gmapsSearchUrl = (q: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const gmapsDirUrl = (q: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
export const appleMapsUrl = (q: string) =>
  `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
export const gmapsEmbedUrl = (q: string) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
