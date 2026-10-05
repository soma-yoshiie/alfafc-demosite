"use client";

import { useBoard } from "../BoardProvider";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

/** アカウント（選手・保護者。§5）。表示だけ。パスワードはチームの共通パスワードなのでスタッフに依頼する */
export default function PlayerAccountView() {
  const board = useBoard();
  return (
    <div className="st-form">
      <SettingsGroup hint="パスワード：チームの共通パスワードです。変更はスタッフに依頼してください。">
        <SettingsRow label="名前" value={board.auth.name} />
        <SettingsRow label="メールアドレス" value={board.auth.email} />
      </SettingsGroup>
    </div>
  );
}
