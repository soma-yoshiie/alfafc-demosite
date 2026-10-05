"use client";

import { useEffect, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { gradeLabel } from "@/lib/types";
import { loadNotifPrefs } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { SettingsAccountCard, SettingsGroup, SettingsRow } from "./SettingsRows";
import { notifValue } from "./NotifPrefsForm";
import type { SettingsCat, SettingsView } from "./settingsTypes";

/**
 * 設定の一覧（選手・保護者。§5）。チームの区画は出さない。
 * スマホは全区画、PC は左のカテゴリ（cat）で選んだ行だけ。ログアウトは PC では左の列の末尾
 */
export default function PlayerSettingsTop({ cat, go }: { cat?: SettingsCat; go: (v: SettingsView) => void }) {
  const board = useBoard();
  const team = useTeam();
  const [prefsVer, setPrefsVer] = useState(0);
  useEffect(() => {
    const bump = () => setPrefsVer((v) => v + 1);
    window.addEventListener("alfa-notifprefs", bump);
    return () => window.removeEventListener("alfa-notifprefs", bump);
  }, []);
  void prefsVer; // 通知の設定が変わったら再計算する（alfa-notifprefs）

  const me = board.state.players.find((p) => p.id === board.auth.playerId);
  const sub = me && me.grade != null ? `選手・${gradeLabel(team.schoolStage, me.grade)}` : "選手";
  const prefs = loadNotifPrefs();

  const account = (
    <SettingsAccountCard name={board.auth.name} sub={sub} email={board.auth.email} onClick={() => go({ mode: "account" })} />
  );
  const notif = <SettingsRow label="通知" value={notifValue(board.auth.role, prefs)} onClick={() => go({ mode: "notif" })} />;
  const version = <SettingsRow label="バージョン" value={APP_VERSION} />;

  if (cat !== undefined) {
    return (
      <div className="st-top">
        {cat === "account" && <SettingsGroup>{account}</SettingsGroup>}
        {cat === "notif" && <SettingsGroup>{notif}</SettingsGroup>}
        {cat === "about" && <SettingsGroup>{version}</SettingsGroup>}
      </div>
    );
  }

  return (
    <div className="st-top">
      <SettingsGroup>{account}</SettingsGroup>
      <SettingsGroup title="通知">{notif}</SettingsGroup>
      <SettingsGroup>{version}</SettingsGroup>
      <SettingsGroup>
        <SettingsRow label="ログアウト" danger onClick={() => window.dispatchEvent(new Event("alfa-logout"))} />
      </SettingsGroup>
    </div>
  );
}
