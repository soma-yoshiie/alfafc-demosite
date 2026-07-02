// アプリ内通知（フェーズ1：ルールベース・バックエンドなし）。
// イベント通知（実tsあり＝未読バッジ対象）と、状況ダイジェスト（しきい値・常時再計算）を分けている。
// 将来フェーズ2では同じ Notification 型をサーバ側から発行し Web Push / LINE 配信へ拡張可能。

import type {
  CoachDeliverable,
  NotebookEntry,
  Player,
  TeamData,
} from "./types";
import { NOTE_KIND_LABEL, deliverTargets, DELIVER_KIND_LABEL } from "./types";
import { computePlayerKpi } from "./coaching";

export type NotifLevel = "warn" | "info" | "good";
export type NotifTarget =
  | { kind: "note"; id: string }
  | { kind: "deliver"; id: string }
  | { kind: "player"; id: string };

export interface Notification {
  id: string;
  ts: number;
  level: NotifLevel;
  text: string;
  target?: NotifTarget;
}

export interface NotifInput {
  role: "coach" | "player";
  playerId?: string;
  notebook: NotebookEntry[];
  deliverables: CoachDeliverable[];
  players: Player[];
  team: TeamData | null;
}

const nameOf = (players: Player[], pid: string) =>
  players.find((p) => p.id === pid)?.name ?? "選手";

/** 実tsを持つイベント通知（未読判定の対象） */
export function buildEventNotifications(input: NotifInput): Notification[] {
  const { role, playerId, notebook, deliverables, players } = input;
  const list: Notification[] = [];

  if (role === "coach") {
    // 選手のノート提出
    notebook.forEach((n) => {
      list.push({
        id: "note-" + n.id,
        ts: n.ts,
        level: n.staffComment ? "good" : "info",
        text: `${nameOf(players, n.playerId)}さんが${NOTE_KIND_LABEL[n.kind]}ノートを提出${n.staffComment ? "（コメント済）" : ""}`,
        target: { kind: "note", id: n.id },
      });
    });
    // 配信への回答
    deliverables.forEach((d) => {
      Object.entries(d.responses).forEach(([pid, r]) => {
        list.push({
          id: `resp-${d.id}-${pid}`,
          ts: (r as { ts: number }).ts,
          level: "info",
          text: `${nameOf(players, pid)}さんが「${d.title}」に回答`,
          target: { kind: "deliver", id: d.id },
        });
      });
    });
  } else if (playerId) {
    // 自分宛/全員宛の配信
    deliverables.filter((d) => deliverTargets(d, playerId)).forEach((d) => {
      const answered = !!d.responses[playerId];
      list.push({
        id: "dlv-" + d.id,
        ts: d.ts,
        level: answered ? "good" : "warn",
        text: `コーチから${DELIVER_KIND_LABEL[d.kind]}「${d.title}」${answered ? "（回答済み）" : "が届いています"}`,
        target: { kind: "deliver", id: d.id },
      });
    });
    // 自分のノートに付いたコメント
    notebook
      .filter((n) => n.playerId === playerId && n.staffComment && n.staffCommentTs)
      .forEach((n) => {
        list.push({
          id: "cmt-" + n.id,
          ts: n.staffCommentTs!,
          level: "good",
          text: `${NOTE_KIND_LABEL[n.kind]}ノートにコーチのコメントが付きました`,
          target: { kind: "note", id: n.id },
        });
      });
  }

  return list.sort((a, b) => b.ts - a.ts);
}

/** 状況ダイジェスト（しきい値ベース・常時再計算。未読対象外＝「今日のまとめ」） */
export function buildDigest(input: NotifInput): Notification[] {
  const { role, playerId, notebook, deliverables, players, team } = input;
  const out: Notification[] = [];

  if (role === "coach") {
    const kpis = players.map((p) => computePlayerKpi(p, notebook, deliverables, team));
    const uncommented = kpis.reduce((s, k) => s + k.uncommented, 0);
    if (uncommented > 0)
      out.push({ id: "dg-uncommented", ts: Date.now(), level: "info", text: `未コメントのノートが${uncommented}件あります。` });
    // 提出が途絶えた / 出席低下 / 怪我 の選手を抽出
    kpis.forEach((k) => {
      const warn = k.alerts.find((a) => a.level === "warn");
      if (warn)
        out.push({
          id: "dg-" + k.playerId,
          ts: Date.now(),
          level: "warn",
          text: `${k.name}：${warn.text}`,
          target: { kind: "player", id: k.playerId },
        });
    });
    // 未回答の配信
    deliverables.forEach((d) => {
      const targets = players.filter((p) => deliverTargets(d, p.id)).length;
      const answered = Object.keys(d.responses).length;
      if (targets - answered > 0)
        out.push({
          id: "dg-resp-" + d.id,
          ts: Date.now(),
          level: "info",
          text: `「${d.title}」未回答 ${targets - answered}人`,
          target: { kind: "deliver", id: d.id },
        });
    });
  } else if (playerId) {
    const player = players.find((p) => p.id === playerId);
    // 未回答の配信
    deliverables
      .filter((d) => deliverTargets(d, playerId) && !d.responses[playerId])
      .forEach((d) =>
        out.push({
          id: "dg-todo-" + d.id,
          ts: Date.now(),
          level: "warn",
          text: `未回答：${DELIVER_KIND_LABEL[d.kind]}「${d.title}」`,
          target: { kind: "deliver", id: d.id },
        })
      );
    if (player) {
      const k = computePlayerKpi(player, notebook, deliverables, team);
      if (k.soloStreak >= 5)
        out.push({ id: "dg-streak", ts: Date.now(), level: "good", text: `自主練${k.soloStreak}日連続！この調子で続けよう。` });
    }
  }
  return out;
}
