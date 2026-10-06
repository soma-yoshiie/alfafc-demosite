// 練習試合（相手探し・申し込み・チャットでの調整）のデモ用データ（specs/matchup-demo.md §2）。
// サーバーが無いので、相手チームと募集はブラウザ内（localStorage）に持つ。画面・状態は components/matchup/。

import { addDaysStr, localDateStr } from "./dates";
import type { MatchRecord, SchoolStage } from "./types";

export interface OpponentTeam {
  id: string; // "t-midoridai" など
  /** 試合記録の opponent と同じ表記にする（対戦回数をそこから数える） */
  name: string;
  area: string; // 「横浜市緑区」
  league: string; // 所属リーグ「市リーグ 1 部」「県 2 部」「地区リーグ」
  ageGroups: string[]; // ["U-13", "U-14"]
  ground: string; // ホームグラウンド
  distanceKm: number; // 目安の距離（市区町村の代表点から）
  cancelCount: number; // 直前の中止の回数（過去 1 年）
  staff: { name: string; role: string }; // チャットの相手「田中」「監督」
  note?: string; // チームの一言（詳細だけに出す）
}

export type TimeBand = "am" | "pm" | "all";

export interface MatchupPost {
  id: string;
  teamId: string; // 募集したチーム。自分のチームは "me"
  dates: string[]; // "YYYY-MM-DD"（複数可。近い順）
  timeBand: TimeBand;
  venue: { kind: "own" | "either" | "away"; name?: string; fee: "free" | "split" | "ask" };
  ageGroup: string; // "U-13"
  format: 8 | 11;
  periods: number; // 本数
  minutes: number; // 1 本の分
  referee: "mutual" | "host" | "arrange"; // 相互／帯同（主催が出す）／相談
  levelHint: string; // 「同じくらい」「強め」「ゆるめ」
  note?: string; // 相手に伝えること
  visibility: "30" | "50" | "all"; // 自分の募集だけが使う（見せる相手：30km／50km／制限なし）
  status: "open" | "closed";
  createdAt: number;
}

export interface MatchupRequest {
  id: string;
  postId: string;
  fromTeamId: string; // 申し込んだチーム（自分なら "me"）
  message: string;
  status: "pending" | "accepted" | "declined";
  ts: number;
  /** デモ：相手が承諾する予定時刻（自分が申し込んだときだけ。来たら accepted にしてチャットを作る） */
  acceptAt?: number;
  /** 承諾でできたチャットの会話キー "opp:<teamId>" */
  threadKey?: string;
  /** 申し込んだ日（募集に日にちが 2 つ以上あるとき選ぶ。"YYYY-MM-DD"。無ければ最初の日） */
  date?: string;
}

export interface MatchupFilter {
  distance: 10 | 30 | 50 | 0; // 0 = 指定なし。既定 30
  ageGroups: string[]; // 空は保存しない（最後の 1 つを外したら全部に戻す）
  format: 8 | 11 | 0; // 0 = どちらも
  when: "weekend" | "month" | "next" | "all"; // 今週末／今月／来月／すべて。既定 all
  venueOnly: boolean; // 相手の会場で開ける募集だけ
}

export interface MatchupStore {
  v: 1;
  teams: OpponentTeam[];
  posts: MatchupPost[];
  requests: MatchupRequest[];
  seededAt: number;
}

/* ===================== 保存 ===================== */

const STORE_KEY = "soccer_tactics_matchup_v1";
const FILTER_KEY = "soccer_tactics_matchupfilter_v1";
const SIDE_KEY = "soccer_tactics_mtside_v1";

/** 保存済みの相手・募集・申し込み。無い（または壊れている）ときはデモのデータを作って保存する */
export function loadMatchupStore(today: string = localDateStr()): MatchupStore {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<MatchupStore>;
        if (s && s.v === 1 && Array.isArray(s.teams) && Array.isArray(s.posts) && Array.isArray(s.requests)) {
          const cur = s as MatchupStore;
          // 相手の募集の日付がすべて過ぎていたら（日をまたいで開き直した）、相手と募集を今日から作り直す。
          // 自分の募集と申し込みは残す（募集が無くなった申し込みだけ落とす）
          const theirs = cur.posts.filter((p) => p.teamId !== "me");
          if (theirs.length > 0 && theirs.every((p) => upcomingDates(p, today).length === 0)) {
            const fresh = seedMatchupStore(today);
            const mine = cur.posts.filter((p) => p.teamId === "me");
            const freshTheirs = fresh.posts.filter((p) => p.teamId !== "me");
            const posts = [...freshTheirs, ...mine];
            const next: MatchupStore = {
              v: 1,
              teams: fresh.teams,
              posts,
              requests: cur.requests.filter((r) => posts.some((p) => p.id === r.postId)),
              seededAt: fresh.seededAt,
            };
            saveMatchupStore(next);
            return next;
          }
          return cur;
        }
      }
    } catch {
      /* 壊れていれば作り直す */
    }
  }
  const seeded = seedMatchupStore(today);
  saveMatchupStore(seeded);
  return seeded;
}

/** false = 保存できなかった（容量超過など。呼び出し側でトーストする） */
export function saveMatchupStore(store: MatchupStore): boolean {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** 絞り込みの条件。無ければ既定（defaultMatchupFilter）。年代は保存後に選択肢が変わっても壊れないよう文字列だけ見る */
export function loadMatchupFilter(stage: SchoolStage): MatchupFilter {
  const def = defaultMatchupFilter(stage);
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return def;
    return normalizeMatchupFilter(JSON.parse(raw) as Partial<MatchupFilter>, stage);
  } catch {
    return def;
  }
}

/** 保存された（または前の区分のままの）条件を今の区分で使える形にする。年代が今の選択肢に 1 つも合わない（空も含む）なら年代だけ既定に戻す */
export function normalizeMatchupFilter(f: Partial<MatchupFilter>, stage: SchoolStage): MatchupFilter {
  const def = defaultMatchupFilter(stage);
  const ages = Array.isArray(f.ageGroups) ? f.ageGroups.filter((a) => typeof a === "string") : null;
  const options = matchupAgeOptions(stage);
  return {
    distance: f.distance === 10 || f.distance === 30 || f.distance === 50 || f.distance === 0 ? f.distance : def.distance,
    ageGroups: ages && ages.some((a) => options.includes(a)) ? ages : def.ageGroups,
    format: f.format === 8 || f.format === 11 || f.format === 0 ? f.format : def.format,
    when: f.when === "weekend" || f.when === "month" || f.when === "next" || f.when === "all" ? f.when : def.when,
    venueOnly: typeof f.venueOnly === "boolean" ? f.venueOnly : def.venueOnly,
  };
}

export function saveMatchupFilter(f: MatchupFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    /* 無視 */
  }
}

/** PC の絞り込み列（.mtside）の開閉。既定は開いている（loadCalSideOpen と同じ作法） */
export function loadMatchupSideOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SIDE_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function saveMatchupSideOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDE_KEY, open ? "open" : "closed");
  } catch {
    /* 無視 */
  }
}

/* ===================== 絞り込み ===================== */

/**
 * 年代の選択肢（学校区分ごと）。中学は受け入れ基準 9 のため U-12 を含める
 * （中学のチームが U-12 の少年団と組むのは普通なので、既定で隠れないように）
 */
export function matchupAgeOptions(stage: SchoolStage): string[] {
  if (stage === "elementary") return ["U-10", "U-11", "U-12"];
  if (stage === "high") return ["U-15", "U-16", "U-17", "U-18"];
  return ["U-12", "U-13", "U-14", "U-15"];
}

/** 募集の日にちのうち今日以降のもの（近い順）。過ぎた日は出さない */
export function upcomingDates(post: MatchupPost, today: string): string[] {
  return post.dates.filter((d) => d >= today).sort();
}

/** 既定：30km 以内・年代は選択肢を全部チェック・人数制どちらも・日程すべて・会場の条件なし */
export function defaultMatchupFilter(stage: SchoolStage): MatchupFilter {
  return { distance: 30, ageGroups: matchupAgeOptions(stage), format: 0, when: "all", venueOnly: false };
}

/** 条件が既定のままか（絞り込みボタンの点・「条件をもどす」の出し分け。年代は並びを無視して比べる） */
export function isDefaultMatchupFilter(f: MatchupFilter, stage: SchoolStage): boolean {
  const d = defaultMatchupFilter(stage);
  const a = [...f.ageGroups].sort().join(",");
  const b = [...d.ageGroups].sort().join(",");
  return f.distance === d.distance && a === b && f.format === d.format && f.when === d.when && f.venueOnly === d.venueOnly;
}

/** 一覧の上の 1 行「30km 以内・U-13・11 人制」。何も絞っていなければ「すべての募集」 */
export function matchupFilterLine(f: MatchupFilter, stage: SchoolStage): string {
  const parts: string[] = [];
  if (f.distance !== 0) parts.push(`${f.distance}km 以内`);
  const all = matchupAgeOptions(stage);
  const picked = f.ageGroups.filter((a) => all.includes(a));
  if (picked.length > 0 && picked.length < all.length) parts.push(picked.join("・"));
  if (f.format !== 0) parts.push(`${f.format} 人制`);
  if (f.when !== "all") parts.push(WHEN_LABEL[f.when]);
  if (f.venueOnly) parts.push("相手の会場");
  return parts.length > 0 ? parts.join("・") : "すべての募集";
}

export const WHEN_LABEL: Record<Exclude<MatchupFilter["when"], "all">, string> = {
  weekend: "今週末",
  month: "今月",
  next: "来月",
};

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** 今日から数えた次の土曜（今日が土曜なら 7 日後） */
export function nextSaturday(today: string): string {
  const dow = parseDate(today).getDay();
  return addDaysStr(today, (6 - dow + 7) % 7 || 7);
}

/** 今日以降で最初の日曜（今日が日曜なら今日） */
function nextSunday(today: string): string {
  return addDaysStr(today, (7 - parseDate(today).getDay()) % 7);
}

/**
 * 相手の募集の絞り込みと並び。相手の募集（teamId が "me" でない）・募集中・今日以降の日があるものだけを対象にする。
 * 距離は distanceKm <= distance、年代は ageGroups に含まれる（空＝すべて）、人数制、日程（募集の日のどれかが範囲に入る）、
 * 会場（venue.kind !== "away"）。並びは近い順（距離）→ 日付。
 */
export function filterPosts(
  posts: MatchupPost[],
  teams: OpponentTeam[],
  filter: MatchupFilter,
  today: string
): MatchupPost[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const weekEnd = nextSunday(today);
  const [ty, tm] = today.split("-").map(Number);
  const thisMonth = localDateStr(new Date(ty, tm - 1, 1)).slice(0, 7);
  const nextMonth = localDateStr(new Date(ty, tm, 1)).slice(0, 7);
  const inWhen = (d: string): boolean => {
    if (filter.when === "weekend") return d >= today && d <= weekEnd;
    if (filter.when === "month") return d.startsWith(thisMonth);
    if (filter.when === "next") return d.startsWith(nextMonth);
    return true;
  };
  return posts
    .filter((p) => {
      if (p.teamId === "me" || p.status !== "open") return false;
      const t = byId.get(p.teamId);
      if (!t) return false;
      const upcoming = upcomingDates(p, today);
      if (upcoming.length === 0) return false;
      if (filter.distance !== 0 && t.distanceKm > filter.distance) return false;
      if (filter.ageGroups.length > 0 && !filter.ageGroups.includes(p.ageGroup)) return false;
      if (filter.format !== 0 && p.format !== filter.format) return false;
      if (!upcoming.some(inWhen)) return false;
      if (filter.venueOnly && p.venue.kind === "away") return false;
      return true;
    })
    .sort((a, b) => {
      const da = byId.get(a.teamId)?.distanceKm ?? 0;
      const db = byId.get(b.teamId)?.distanceKm ?? 0;
      if (da !== db) return da - db;
      const fa = upcomingDates(a, today)[0] ?? "";
      const fb = upcomingDates(b, today)[0] ?? "";
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
}

/** 対戦回数。試合記録の相手の名前（前後の空白を除く）が相手チームの名前と同じ試合の数 */
export function matchCountWith(teamName: string, matches: MatchRecord[]): number {
  return matches.filter((m) => m.opponent.trim() === teamName).length;
}

/** 対戦の記録のうち、その相手との最近のもの（新しい順に n 件） */
export function recentMatchesWith(teamName: string, matches: MatchRecord[], n = 2): MatchRecord[] {
  return matches
    .filter((m) => m.opponent.trim() === teamName)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n);
}

/* ===================== 表示 ===================== */

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/** 「10/18(土)」（homeData の fmtEventDate と同じ書式） */
export function fmtPostDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  return `${m}/${day}(${WEEKDAY[new Date(y, m - 1, day).getDay()]})`;
}

/** 一覧の日付。1〜2 日は「10/18(土)・10/25(土)」、3 日以上は「10/18(土) ほか 2 日」 */
export function fmtPostDates(dates: string[]): string {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return "";
  if (sorted.length <= 2) return sorted.map(fmtPostDate).join("・");
  return `${fmtPostDate(sorted[0])} ほか ${sorted.length - 1} 日`;
}

/** 一覧の「場所」。会場の名前があればそれ、無ければ own＝相手のグラウンド名・either＝会場は相談・away＝こちらの会場 */
export function postPlaceLabel(post: MatchupPost, team: OpponentTeam | undefined): string {
  if (post.venue.name) return post.venue.name;
  if (post.venue.kind === "own") return team?.ground ?? "";
  if (post.venue.kind === "either") return "会場は相談";
  return "こちらの会場";
}

export const TIME_BAND_LABEL: Record<TimeBand, string> = {
  am: "午前（9:00〜12:00）",
  pm: "午後（13:00〜17:00）",
  all: "終日",
};
export const TIME_BAND_SHORT: Record<TimeBand, string> = { am: "午前", pm: "午後", all: "終日" };
export const VENUE_FEE_LABEL: Record<MatchupPost["venue"]["fee"], string> = { free: "無料", split: "会場費を折半", ask: "相談" };
export const REFEREE_LABEL: Record<MatchupPost["referee"], string> = {
  mutual: "相互（各 1 本ずつ）",
  host: "主催が出す",
  arrange: "相談",
};
/** 自分の募集の会場の区分（自分の募集を見ているとき。相手の募集の VENUE_KIND_NOTE と向きが逆） */
export const VENUE_KIND_NOTE_MINE: Record<MatchupPost["venue"]["kind"], string> = {
  own: "自分の会場",
  either: "会場は相談",
  away: "相手の会場",
};
/** 自分の募集の「見せる相手」 */
export const VISIBILITY_LABEL: Record<MatchupPost["visibility"], string> = {
  "30": "30km 以内のチーム",
  "50": "50km 以内のチーム",
  all: "制限なし",
};
/** 相手の募集を見ている側から見た会場の区分 */
export const VENUE_KIND_NOTE: Record<MatchupPost["venue"]["kind"], string> = {
  own: "相手の会場",
  either: "相談して決める",
  away: "こちらの会場",
};

/* ===================== デモのシード（§2-1） ===================== */

function team(
  id: string,
  name: string,
  area: string,
  league: string,
  ageGroups: string[],
  ground: string,
  distanceKm: number,
  cancelCount: number,
  staffName: string,
  staffRole: string,
  note?: string
): OpponentTeam {
  return { id, name, area, league, ageGroups, ground, distanceKm, cancelCount, staff: { name: staffName, role: staffRole }, note };
}

/** 日付は「今日」から数えた次の土曜を S0 として相対で作る。自分の募集 1 件とそこに届いた申し込み 1 件も入れる */
export function seedMatchupStore(today: string): MatchupStore {
  const s0 = nextSaturday(today);
  const at = (n: number) => addDaysStr(s0, n);
  const now = Date.now();
  const [ty, tm, td] = today.split("-").map(Number);
  const morning = new Date(ty, tm - 1, td, 9, 12).getTime();

  const teams: OpponentTeam[] = [
    team("t-midoridai", "みどり台SC", "横浜市緑区", "市リーグ 1 部", ["U-13", "U-14"], "みどり台第2グラウンド（人工芝）", 4, 0, "田中", "監督", "毎週土曜の午前に活動しています。保護者の見学も歓迎です。"),
    team("t-higashigaoka", "東ヶ丘少年団", "横浜市青葉区", "地区リーグ", ["U-12"], "東ヶ丘小学校グラウンド", 6, 0, "佐々木", "代表", "6 年生中心の少年団です。8 人制で組めると助かります。"),
    team("t-shirasagi", "白鷺FC", "川崎市宮前区", "地区リーグ", ["U-13"], "白鷺公園グラウンド（土）", 9, 1, "山口", "コーチ", "のびのびプレーさせる方針のクラブです。"),
    team("t-aoba", "青葉SC", "横浜市都筑区", "市リーグ 2 部", ["U-13", "U-14"], "都筑スポーツ広場（人工芝）", 14, 0, "鈴木", "監督", "平日は夜に練習しています。連絡は早めに返します。"),
    team("t-kohoku", "港北ユナイテッド", "横浜市港北区", "市リーグ 1 部", ["U-13"], "港北第3グラウンド", 17, 0, "松本", "監督", "ビルドアップを重視しています。"),
    team("t-takasago", "高砂フットボールクラブ", "町田市", "県 2 部", ["U-13", "U-15"], "高砂市民グラウンド（人工芝）", 22, 0, "高橋", "コーチ", "試合後の振り返りを選手同士でしています。"),
    team("t-cosmos", "コスモスJFC", "相模原市南区", "県 1 部", ["U-14", "U-15"], "相模原ふれあいグラウンド", 31, 2, "井上", "監督", "県大会の常連で、強度の高い試合になります。"),
    team("t-sagamihara", "相模原ヴィクトリー", "相模原市中央区", "県 3 部", ["U-15"], "淵野辺スポーツ広場（土）", 38, 0, "岡田", "代表"),
  ];

  const post = (
    teamId: string,
    dates: string[],
    timeBand: TimeBand,
    venue: MatchupPost["venue"],
    ageGroup: string,
    format: 8 | 11,
    periods: number,
    minutes: number,
    referee: MatchupPost["referee"],
    levelHint: string,
    note: string | undefined,
    ago: number
  ): MatchupPost => ({
    id: `mp-${teamId.replace(/^t-/, "")}`,
    teamId,
    dates,
    timeBand,
    venue,
    ageGroup,
    format,
    periods,
    minutes,
    referee,
    levelHint,
    note,
    visibility: "all",
    status: "open",
    createdAt: now - ago * 3600_000,
  });

  const posts: MatchupPost[] = [
    post("t-midoridai", [at(7)], "am", { kind: "own", fee: "free" }, "U-13", 11, 3, 20, "mutual", "同じくらい", "駐車場 20 台。雨天は前日 18 時に判断します。", 30),
    post("t-aoba", [at(14), at(21)], "pm", { kind: "either", fee: "split" }, "U-13", 11, 2, 25, "mutual", "同じくらい", "会場は相談で決めましょう。", 52),
    post("t-kohoku", [at(7)], "pm", { kind: "own", fee: "free" }, "U-13", 11, 3, 20, "host", "強め", "人工芝ではなく土のグラウンドです。", 76),
    post("t-takasago", [at(21)], "am", { kind: "own", fee: "free" }, "U-13", 11, 4, 15, "mutual", "強め", "終了後に 15 分の紅白戦も可能です。", 100),
    post("t-shirasagi", [at(1)], "am", { kind: "own", fee: "ask" }, "U-13", 11, 2, 25, "arrange", "ゆるめ", "審判は相談させてください。", 20),
    post("t-higashigaoka", [at(14)], "am", { kind: "own", fee: "free" }, "U-12", 8, 4, 15, "host", "同じくらい", "8 人制です。", 120),
    post("t-cosmos", [at(28)], "pm", { kind: "away", fee: "free" }, "U-14", 11, 3, 20, "mutual", "強め", "そちらの会場でお願いできると助かります。", 140),
    post("t-sagamihara", [at(28), at(35)], "all", { kind: "own", fee: "split" }, "U-15", 11, 2, 30, "mutual", "同じくらい", undefined, 160),
  ];

  const mine: MatchupPost = {
    id: "mp-me-1",
    teamId: "me",
    dates: [at(14)],
    timeBand: "am",
    venue: { kind: "own", name: "アルファラス第1グラウンド", fee: "free" },
    ageGroup: "U-13",
    format: 11,
    periods: 3,
    minutes: 20,
    referee: "mutual",
    levelHint: "同じくらい",
    note: "駐車場は 15 台まで。",
    visibility: "30",
    status: "open",
    createdAt: now - 48 * 3600_000,
  };

  const requests: MatchupRequest[] = [
    {
      id: "mr-kohoku-1",
      postId: mine.id,
      fromTeamId: "t-kohoku",
      message: "11 人制 20 分 3 本で希望です。審判は 1 本こちらで出せます。",
      status: "pending",
      ts: morning,
    },
  ];

  return { v: 1, teams, posts: [...posts, mine], requests, seededAt: now };
}
