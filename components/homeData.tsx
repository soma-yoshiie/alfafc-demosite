"use client";

/**
 * MatchdayBoard（PCコーチホーム。HomeMenu.tsx）と MobileHome（スマホホーム）で共有する
 * 集計フック・ヘルパー・小コンポーネント（mobile-home-v3 §1 / Phase D-1 C2 major「循環import」対応）。
 *
 * 元々は HomeMenu.tsx に定義され、MobileHome.tsx がそこから逆import する形だったため
 * HomeMenu.tsx ⇄ MobileHome.tsx の循環依存になっていた。ここへ純粋に移動しただけで
 * 計算式・依存配列は一切変更していない（PC/モバイルとも挙動不変）。
 * HomeMenu.tsx と MobileHome.tsx はどちらもこのモジュールから import し、互いには
 * import しない（MobileHome→HomeMenu の逆importは廃止）。
 */

import { useEffect, useMemo, useState } from "react";
import { localDateStr } from "@/lib/dates";
import { weeklyNoteCounts } from "@/lib/homeStats";
import { NOTE_KIND_LABEL } from "@/lib/types";
import type { EventCategory, NoteKind, TeamEvent } from "@/lib/types";
import { eventTargetsPlayer, playerInGroup } from "@/lib/groups";
import { attachmentLabel, isMemberFrom } from "@/lib/chat";
import { linkedEventIds } from "@/lib/matchEvents";
import { loadNotifPrefs } from "@/lib/storage";
import type { useBoard } from "./BoardProvider";
import type { useTeam } from "./TeamProvider";

export type BoardCtx = ReturnType<typeof useBoard>;
export type TeamCtx = ReturnType<typeof useTeam>;

/** イベント日付「M/D(曜)」表示（HomeMenu/MobileHome共通の日付表示ヘルパー） */
export function fmtEventDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y) return d;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
  return `${m}/${day}(${wd})`;
}

/** タイトルから「vs 」以降を対戦相手名として抽出（単語境界必須）。マッチしなければ null（呼び出し側で非試合と同じ表示にフォールバック） */
export function opponentFromTitle(title: string): string | null {
  const m = title.match(/(?:^|[\s　])vs\.?[\s　]*(.+)$/i);
  return m ? m[1].trim() : null;
}

export function categoryLabel(e: TeamEvent, categories: EventCategory[]): string {
  const id = e.categoryId ?? e.kind;
  return categories.find((c) => c.id === id)?.label ?? (e.kind === "match" ? "試合" : "練習");
}

/** 60秒interval + visibilitychangeで停止/再開 + アンマウントでclear */
export function useCountdown(targetMs: number | null): { days: number; hours: number; minutes: number; started: boolean } | null {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (targetMs == null) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), 60000);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    // 裏タブでは60秒interval停止に加え、.mdb-hero::before のdriftアニメも.mdb-pausedで一時停止する
    const onVis = () => {
      document.documentElement.classList.toggle("mdb-paused", document.hidden);
      if (document.hidden) stop();
      else start();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.classList.remove("mdb-paused");
    };
  }, [targetMs]);
  if (targetMs == null) return null;
  const diff = Math.max(0, targetMs - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    started: targetMs - now <= 0,
  };
}

/**
 * PC のホーム（HomeMenu.tsx）とスマホのホーム（MobileHome.tsx）で共有する集計フック。
 * 次の予定（ヒーロー）・ベル・ハイライトだけを返す（round5-home §3。タイル・トピック・
 * 最新の動きの集計は削除した。タイムラインは useHomeTimeline）。
 *
 * forPlayerId: 選手のホームから渡すと「次の予定」を自分の予定（eventTargetsPlayer）だけから
 * 選ぶ（groups-everywhere §3）。未指定（コーチのホーム）は従来どおり全件から選ぶ。
 */
export function useMatchdayData(board: BoardCtx, team: TeamCtx, forPlayerId?: string | null) {
  const todayISO = localDateStr();
  const players = board.state.players;
  const mePlayer = forPlayerId ? players.find((p) => p.id === forPlayerId) ?? null : null;

  /* ---------------- 区画1: ヒーロー(次の予定/試合) ---------------- */
  const nextEvent = useMemo<TeamEvent | null>(() => {
    // p15 レビュー F5: 試合記録が紐づいた予定（＝結果が出ている試合）は「次の予定」にしない
    // （当日に記録を付けると、終わった試合がヒーローと出欠の催促に出てしまうため）
    const done = linkedEventIds(team.team.matches);
    const list = [...team.team.events]
      .filter((e) => e.date >= todayISO && !done.has(e.id))
      .filter((e) => !mePlayer || eventTargetsPlayer(e, mePlayer, team.groups))
      .sort((a, b) => (`${a.date} ${a.time ?? ""}` < `${b.date} ${b.time ?? ""}` ? -1 : 1));
    return list[0] ?? null;
  }, [team.team.events, team.team.matches, todayISO, mePlayer, team.groups]);

  const isMatch = nextEvent?.kind === "match";
  // タイトルから対戦相手を抽出できた試合予定だけを対戦カード表示にする。抽出できなければ非試合と同じ「タイトル+カテゴリ」表示にフォールバック
  const opponent = useMemo(
    () => (nextEvent && isMatch ? opponentFromTitle(nextEvent.title) : null),
    [nextEvent, isMatch]
  );
  const showVsCard = isMatch && opponent != null;

  const targetMs = useMemo(() => {
    if (!nextEvent) return null;
    const [y, m, d] = nextEvent.date.split("-").map(Number);
    if (nextEvent.time) {
      const [hh, mm] = nextEvent.time.split(":").map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
    }
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }, [nextEvent]);
  const cd = useCountdown(targetMs);

  const unansweredNext = nextEvent ? team.summary(nextEvent.id).none : 0;

  /* ---------------- 区画2: 右上ベル(対応が必要なこと) ---------------- */
  const uncommented = board.notebook.filter((n) => !n.staffComment).length;

  // 通知の設定（設定 §3-6）。localStorage 直書きなので alfa-notifprefs を購読して再計算する
  const [prefsVer, setPrefsVer] = useState(0);
  useEffect(() => {
    const bump = () => setPrefsVer((v) => v + 1);
    window.addEventListener("alfa-notifprefs", bump);
    return () => window.removeEventListener("alfa-notifprefs", bump);
  }, []);

  const bellRows = useMemo(() => {
    const prefs = loadNotifPrefs();
    const rows: {
      id: string;
      /** 通知の設定で絞る種類。other は常に出す */
      kind: "attendance" | "notebook" | "other";
      badge: number;
      title: string;
      reason: string;
      onClick: () => void;
    }[] = [];
    if (nextEvent && unansweredNext > 0) {
      rows.push({
        id: "att",
        kind: "attendance",
        badge: unansweredNext,
        title: "出欠が未回答",
        reason: `${nextEvent.kind === "match" ? "試合" : "練習"}「${nextEvent.title}」、出欠が未回答 ・ ${unansweredNext}名`,
        onClick: () => {
          board.setTeamIntent({ tab: "cal", eventId: nextEvent.id });
          board.setScreen("team");
        },
      });
    }
    if (uncommented > 0) {
      rows.push({
        id: "note",
        kind: "notebook",
        badge: uncommented,
        title: "未コメントのノート",
        reason: `未コメントのノートが${uncommented}件あります`,
        onClick: () => board.setScreen("notebook"),
      });
    }
    return rows.filter((r) => r.kind === "other" || prefs[r.kind]);
  }, [nextEvent, unansweredNext, uncommented, board, prefsVer]);
  const bellBadge = bellRows.reduce((sum, r) => sum + r.badge, 0);

  /* ---------------- 区画3: ハイライト用の週のノート数・今月の集計 ----------------
     p18 §4・§5: 指標タイル・グラフ・今月のトピック・最新の動きをホームから外したので、
     それ専用だった集計（出席率・勝率・順位・トピック・フィード）は削除した */
  const notesSeries = useMemo(() => weeklyNoteCounts(board.notebook, 7), [board.notebook]);
  const notesThisWeek = notesSeries.at(-1)?.value ?? 0;

  const ym = todayISO.slice(0, 7);
  const monthEvents = useMemo(
    () => team.team.events.filter((e) => e.date.startsWith(ym) && e.date <= todayISO),
    [team.team.events, ym, todayISO]
  );

  /* ---------------- 区画4下: 今月のハイライト ---------------- */
  const highlightChips = useMemo(() => {
    const chips: { text: string; kind: "att" | "notes" | "goal" }[] = [];
    const fullAttendanceCount =
      players.length > 0
        ? monthEvents.filter((e) => team.summary(e.id).yes === players.length).length
        : 0;
    if (fullAttendanceCount > 0) chips.push({ text: `全員出席 ${fullAttendanceCount}回`, kind: "att" });

    const weekMax = Math.max(0, ...notesSeries.map((p) => p.value ?? 0));
    if (notesThisWeek > 0 && notesThisWeek >= weekMax) chips.push({ text: "ノート提出 週間最高", kind: "notes" });

    const firstGoalDate: Record<string, string> = {};
    [...team.team.matches]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((mm) => mm.goals.forEach((g) => {
        if (!firstGoalDate[g.playerId]) firstGoalDate[g.playerId] = mm.date;
      }));
    const firstGoalCount = Object.values(firstGoalDate).filter((d) => d.startsWith(ym)).length;
    if (firstGoalCount > 0) chips.push({ text: `初得点 ${firstGoalCount}人`, kind: "goal" });

    return chips;
  }, [monthEvents, team, players, notesSeries, notesThisWeek, ym]);

  const teamName = board.state.teamName ?? "マイチーム";

  return {
    nextEvent,
    opponent,
    showVsCard,
    cd,
    unansweredNext,
    bellBadge,
    bellRows,
    highlightChips,
    teamName,
  };
}

/* ===================== p18 §3-1: スタッフのホームのタイムライン ===================== */

export type HomeTimelineItem = {
  id: string; // "note-<id>" | "msg-<id>"
  kind: "note" | "message";
  ts: number;
  playerId: string;
  name: string;
  /** 一覧に出す 1 行。ノート＝「練習ノートを提出」、メッセージ＝本文の先頭（改行は空白に。添付だけなら添付の名前） */
  text: string;
  /** ノート＝staffSeenAt が無い／メッセージ＝ts > (chatReads[m.to]?.staff ?? 0) */
  unread: boolean;
  noteKind?: NoteKind;
  noteId?: string;
};
export type HomeTimelineScope = {
  key: string;
  label: string;
  items: HomeTimelineItem[];
  unread: number;
  unreadNotes: number;
  unreadMessages: number;
};

/** scope ごとの最大件数（未読の件数は切る前の全件で数える） */
const HOME_TIMELINE_MAX = 30;

/**
 * スタッフのホームのタイムライン。scope は「すべて」＋学年グループ（team.groups の kind==="grade" の並び順）。
 * 材料は board.notebook（提出時刻 ts）と、選手・保護者から届いたメッセージ（isMemberFrom）。名簿に居ない選手の分は入れない。
 */
export function useHomeTimeline(board: BoardCtx, team: TeamCtx): HomeTimelineScope[] {
  const players = board.state.players;
  return useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p] as const));
    const all: HomeTimelineItem[] = [];
    board.notebook.forEach((n) => {
      const pl = byId.get(n.playerId);
      if (!pl) return;
      all.push({
        id: "note-" + n.id,
        kind: "note",
        ts: n.ts,
        playerId: pl.id,
        name: pl.name,
        text: `${NOTE_KIND_LABEL[n.kind]}ノートを提出`,
        unread: !n.staffSeenAt,
        noteKind: n.kind,
        noteId: n.id,
      });
    });
    board.messages.forEach((m) => {
      if (!isMemberFrom(m.from)) return;
      const pl = byId.get(m.from.slice(2));
      if (!pl) return;
      const body = m.text?.replace(/\s+/g, " ").trim() || (m.attachments?.[0] ? attachmentLabel(m.attachments[0]) : "");
      all.push({
        id: "msg-" + m.id,
        kind: "message",
        ts: m.ts,
        playerId: pl.id,
        name: pl.name,
        text: body,
        unread: m.ts > (board.chatReads[m.to]?.staff ?? 0),
      });
    });
    all.sort((a, b) => b.ts - a.ts);
    const scopeOf = (key: string, label: string, list: HomeTimelineItem[]): HomeTimelineScope => {
      const unreadNotes = list.filter((i) => i.kind === "note" && i.unread).length;
      const unreadMessages = list.filter((i) => i.kind === "message" && i.unread).length;
      return {
        key,
        label,
        items: list.slice(0, HOME_TIMELINE_MAX),
        unread: unreadNotes + unreadMessages,
        unreadNotes,
        unreadMessages,
      };
    };
    const scopes: HomeTimelineScope[] = [scopeOf("all", "すべて", all)];
    team.groups
      .filter((g) => g.kind === "grade")
      .forEach((g) => {
        scopes.push(
          scopeOf(
            g.id,
            g.label,
            all.filter((i) => {
              const pl = byId.get(i.playerId);
              return !!pl && playerInGroup(pl, g);
            })
          )
        );
      });
    return scopes;
  }, [board.notebook, board.messages, board.chatReads, players, team.groups]);
}
