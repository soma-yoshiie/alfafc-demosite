// 出欠タブ・PC右ペイン向けの集計。
// 母数の意味論は lib/teamStats.ts の attendanceRate と厳密に一致させる:
// 「今日まで(e.date<=today)のイベント × 出欠の記録(status)が存在するエントリのみ」を母数にする
// （未来の予定・未記録の予定を欠席扱いにしないのは attendanceRate と同じ理由）。
// 期間フィルタ(AttPeriod)はこれに加えて「イベント開始日が期間の起点日以降」で絞り込む。

import type { Player, TeamData, TeamGroup } from "./types";
import { localDateStr } from "./dates";
import { eventTargetsPlayer, playerInGroup } from "./groups";

export type AttPeriod = "all" | "m1" | "m3" | "m6";

/** 期間の起点日 (YYYY-MM-DD・含む)。"all" は絞り込みなし(null) */
export function periodStartDate(period: AttPeriod, todayStr: string): string | null {
  if (period === "all") return null;
  const monthsBack = period === "m1" ? 1 : period === "m3" ? 3 : 6;
  const [y, m, d] = todayStr.split("-").map(Number);
  if (!y) return null;
  // 月末日(31日等)にnヶ月前の同日が存在しないと月跨ぎロールオーバーで起点がずれるため、
  // その月の末日にクランプする(例: 3/31の1ヶ月前 → 2/28)
  const lastDay = new Date(y, m - monthsBack, 0).getDate();
  return localDateStr(new Date(y, m - 1 - monthsBack, Math.min(d, lastDay)));
}

export interface PlayerAttendanceRow {
  playerId: string;
  yes: number;
  maybe: number;
  no: number;
  recorded: number;
  /** 出席率(%)。recorded=0のときは0 */
  pct: number;
}

/**
 * 選手ごとの出欠集計（期間フィルタ適用・名簿の並び順のまま）。
 * groups-everywhere §4: 分母は「その選手が対象の予定」だけ（対象外の予定はカウントしない）。
 * team.groups（学年＋カスタム。ensureGradeGroups済み）を使って判定する。
 */
export function perPlayerAttendance(
  team: TeamData,
  players: Player[],
  period: AttPeriod
): PlayerAttendanceRow[] {
  const today = localDateStr();
  const start = periodStartDate(period, today);
  const groups = team.groups ?? [];
  return players.map((p) => {
    let yes = 0;
    let maybe = 0;
    let no = 0;
    let recorded = 0;
    team.events.forEach((e) => {
      if (e.date > today) return;
      if (start && e.date < start) return;
      if (!eventTargetsPlayer(e, p, groups)) return;
      const entry = team.attendance[e.id]?.[p.id];
      if (!entry?.status) return;
      recorded++;
      if (entry.status === "yes") yes++;
      else if (entry.status === "maybe") maybe++;
      else no++;
    });
    return { playerId: p.id, yes, maybe, no, recorded, pct: recorded ? Math.round((yes / recorded) * 100) : 0 };
  });
}

export interface MonthlyAttendanceRow {
  /** "YYYY-MM" */
  ym: string;
  /** "M月" */
  label: string;
  /** 記録エントリ数(選手×イベント) */
  recorded: number;
  /** 記録済み予定の件数(1人でも記録があるイベント数)。KPIタイルの単位に合わせる */
  events: number;
  /** 出席率(%)。recorded=0のときは0 */
  pct: number;
}

/**
 * 直近nヶ月(既定6)・月別の出席率（対象選手の合算）。今月を含み古い順に並ぶ。
 * players に1人だけ渡せばその選手個人の月別推移になる（新規の別関数を用意せず流用可能）。
 */
export function monthlyAttendance(
  team: TeamData,
  players: Player[],
  months = 6
): MonthlyAttendanceRow[] {
  const today = localDateStr();
  const [ty, tm] = today.split("-").map(Number);
  const groups = team.groups ?? [];
  const rows: MonthlyAttendanceRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(ty, tm - 1 - i, 1);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    let yes = 0;
    let recorded = 0;
    // その月の「記録済み予定」件数(1人でも記録があるイベント)。
    // recordedは選手×イベントのエントリ数で単位が違うため、KPIタイル(予定件数)のグラフにはこちらを使う
    let events = 0;
    team.events.forEach((e) => {
      if (e.date > today) return;
      if (!e.date.startsWith(ym)) return;
      let evHasEntry = false;
      players.forEach((p) => {
        // groups-everywhere §4: 対象外の選手のエントリはこの予定の集計に含めない
        if (!eventTargetsPlayer(e, p, groups)) return;
        const entry = team.attendance[e.id]?.[p.id];
        if (!entry?.status) return;
        recorded++;
        evHasEntry = true;
        if (entry.status === "yes") yes++;
      });
      if (evHasEntry) events++;
    });
    rows.push({ ym, label: `${m}月`, recorded, events, pct: recorded ? Math.round((yes / recorded) * 100) : 0 });
  }
  return rows;
}

export interface GroupAttendanceRow {
  groupId: string;
  kind: TeamGroup["kind"];
  label: string;
  yes: number;
  recorded: number;
  /** 出席率(%)。recorded=0のときは0 */
  pct: number;
  /** そのグループに所属する選手数（出欠記録の有無に関わらずカウント） */
  playerCount: number;
}

/**
 * グループ別の出席率（期間フィルタ適用。groups-everywhere §4：学年別→グループ別に拡張）。
 * team.groups（学年グループが先、カスタムグループが後）をそのまま順に列挙する。
 * 各グループの母数は「そのグループの選手のうち、その予定が対象の選手」だけ（perPlayerAttendance
 * と同じeventTargetsPlayer判定）に絞る（2年生の出席率が3年生の練習で下がらない）。
 * どのグループにも属さない選手（学年未設定・カスタム未所属）は集計に含まれない
 * （個人別ランキング側には引き続き全員出る）。
 */
export function groupAttendance(
  team: TeamData,
  players: Player[],
  period: AttPeriod
): GroupAttendanceRow[] {
  const today = localDateStr();
  const start = periodStartDate(period, today);
  const groups = team.groups ?? [];
  return groups.map((g) => {
    const members = players.filter((p) => playerInGroup(p, g));
    let yes = 0;
    let recorded = 0;
    team.events.forEach((e) => {
      if (e.date > today) return;
      if (start && e.date < start) return;
      members.forEach((p) => {
        if (!eventTargetsPlayer(e, p, groups)) return;
        const entry = team.attendance[e.id]?.[p.id];
        if (!entry?.status) return;
        recorded++;
        if (entry.status === "yes") yes++;
      });
    });
    return {
      groupId: g.id,
      kind: g.kind,
      label: g.label,
      yes,
      recorded,
      pct: recorded ? Math.round((yes / recorded) * 100) : 0,
      playerCount: members.length,
    };
  });
}
