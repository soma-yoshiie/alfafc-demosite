"use client";

import { useEffect, useState } from "react";
import { useBoard } from "../BoardProvider";
import { DEFAULT_PLAYER_PASSWORD } from "@/lib/auth";
import type { SettingsFormProps } from "./settingsTypes";

/** 選手・保護者の招待（§3-4）。共通パスワードは保存ボタンで確定（1 文字ごとの保存はしない） */
export default function InviteForm({ pc, onDirty, saveRef, onDone }: SettingsFormProps) {
  const board = useBoard();
  const [pw, setPw] = useState(board.playerPassword);
  const [show, setShow] = useState(false);

  const dirty = pw.trim() !== board.playerPassword;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  function save() {
    board.setPlayerPassword(pw.trim());
    board.toast("共通パスワードを保存しました");
    onDirty(false);
    onDone();
  }
  useEffect(() => {
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  });

  async function copyGuide() {
    const text = `「ALFA FOOTBALL のログイン」\nメール：名簿に登録したメールアドレス\n共通パスワード：${board.playerPassword || DEFAULT_PLAYER_PASSWORD}`;
    try {
      await navigator.clipboard.writeText(text);
      board.toast("コピーしました");
    } catch {
      board.toast("コピーできませんでした");
    }
  }

  return (
    <div className="st-form">
      <p className="st-lead">選手・保護者は、名簿に登録したメールアドレスと、この共通パスワードでログインします。</p>
      <div className="st-field">
        <label htmlFor="st-teampw">共通パスワード</label>
        <div className="st-pwwrap">
          <input
            id="st-teampw"
            className="st-input"
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={`既定：${DEFAULT_PLAYER_PASSWORD}`}
            autoComplete="off"
          />
          <button type="button" className="st-pwtoggle" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? "隠す" : "表示"}
          </button>
        </div>
      </div>
      <button type="button" className="st-btn ghost" onClick={copyGuide} disabled={dirty}>
        ログイン案内をコピー
      </button>
      {dirty && <p className="st-hint">保存してからコピーできます。</p>}
      {pc && (
        <button type="button" className="st-btn" onClick={save}>
          保存
        </button>
      )}
    </div>
  );
}
