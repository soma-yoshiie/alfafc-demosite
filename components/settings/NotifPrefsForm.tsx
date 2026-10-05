"use client";

import { useState } from "react";
import { useBoard } from "../BoardProvider";
import { loadNotifPrefs, saveNotifPrefs } from "@/lib/storage";
import type { NotifPrefs } from "@/lib/storage";
import { SettingsGroup, SettingsToggleRow } from "./SettingsRows";

type Role = "coach" | "player";

/**
 * 効く場所がある設定だけを出す（§3-6）。スタッフ＝ノートの提出（レール・下部タブの数字）と
 * 出欠の未回答（ホームのベル）。選手＝配信・コメント（レール・下部タブの数字）。
 * messages はまだ効く場所（チャットの未読の数字）が無いので出さない
 */
const KEYS: Record<Role, (keyof NotifPrefs)[]> = {
  coach: ["notebook", "attendance"],
  player: ["notebook"],
};
const LABELS: Record<Role, Partial<Record<keyof NotifPrefs, string>>> = {
  coach: { notebook: "ノートの提出", attendance: "出欠の未回答" },
  player: { notebook: "配信・コメント" },
};
const HINT: Record<Role, string> = {
  coach: "レールと下部タブの数字（ノートの提出）と、ホームのベル（出欠の未回答）に効きます。プッシュ通知はまだありません。",
  player: "レールと下部タブの数字に効きます。プッシュ通知はまだありません。",
};

export function notifRole(role: string): Role {
  return role === "coach" ? "coach" : "player";
}

/** 一覧の「通知」の行の値（§2-3）。出している行だけを数える */
export function notifValue(role: string, prefs: NotifPrefs): string {
  const keys = KEYS[notifRole(role)];
  const on = keys.filter((k) => prefs[k]).length;
  if (keys.length === 1) return on === 1 ? "オン" : "オフ";
  if (on === keys.length) return `${keys.length} 件ともオン`;
  if (on === 0) return "すべてオフ";
  return `${on} 件オン`;
}

/** 通知（§3-6）。トグルはその場で保存する（保存ボタン・未保存の確認は無し） */
export default function NotifPrefsForm() {
  const board = useBoard();
  const role = notifRole(board.auth.role);
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadNotifPrefs());

  function toggle(key: keyof NotifPrefs, on: boolean) {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    saveNotifPrefs(next);
  }

  return (
    <div className="st-form">
      <SettingsGroup hint={HINT[role]}>
        {KEYS[role].map((key) => (
          <SettingsToggleRow key={key} label={LABELS[role][key] ?? key} checked={prefs[key]} onChange={(v) => toggle(key, v)} />
        ))}
      </SettingsGroup>
    </div>
  );
}
