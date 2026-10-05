"use client";

import { useEffect, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { updateCoachAccount } from "@/lib/auth";
import { findOwnCoach } from "./StaffList";
import type { SettingsFormProps } from "./settingsTypes";

/**
 * アカウント（スタッフ。§3-1）。名前・メール・パスワード。パスワードの 3 欄は空なら変更しない。
 * 保存すると lib/auth が "alfa-session" を投げ、AppFlow がセッションを差し替える（レール下端の名前が変わる）
 */
export default function AccountForm({ pc, onDirty, saveRef, onDone }: SettingsFormProps) {
  const board = useBoard();
  const team = useTeam();
  const [name, setName] = useState(board.auth.name);
  const [email, setEmail] = useState(board.auth.email);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState("");

  const dirty =
    name.trim() !== board.auth.name ||
    email.trim().toLowerCase() !== board.auth.email ||
    curPw !== "" ||
    newPw !== "" ||
    newPw2 !== "";
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  function save() {
    setErr("");
    if (newPw !== newPw2) {
      setErr("新しいパスワードが一致しません");
      return;
    }
    if (!newPw && curPw) {
      setErr("新しいパスワードを入力してください");
      return;
    }
    if (newPw && !curPw) {
      setErr("現在のパスワードを入力してください");
      return;
    }
    const r = updateCoachAccount({ name, email, ...(newPw ? { password: newPw } : {}) }, curPw);
    if (!r.ok) {
      setErr(r.reason);
      return;
    }
    // 名前を変えたら、スタッフの一覧（TeamData.coaches）の自分の項目も追随させる。
    // 追随しないと staffIdentity が本人を見つけられず、送信者名が別のスタッフになる
    const newName = name.trim();
    if (newName !== board.auth.name) {
      const own = findOwnCoach(board.auth.name, team.team.coaches);
      if (own) {
        const [role] = own.trim().split(/\s+/);
        const hasRole = own.trim().split(/\s+/).length > 1;
        team.removeCoach(own);
        team.addCoach(hasRole ? `${role} ${newName}` : newName);
      }
    }
    board.toast("アカウントを更新しました");
    onDirty(false);
    onDone();
  }
  useEffect(() => {
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  });

  return (
    <div className="st-form">
      <div className="st-field">
        <label htmlFor="st-accname">名前</label>
        <input id="st-accname" className="st-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="st-field">
        <label htmlFor="st-accmail">メールアドレス</label>
        <input
          id="st-accmail"
          className="st-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="st-field">
        <label htmlFor="st-curpw">現在のパスワード</label>
        <input
          id="st-curpw"
          className="st-input"
          type="password"
          value={curPw}
          onChange={(e) => setCurPw(e.target.value)}
          autoComplete="current-password"
        />
        <p className="st-hint">パスワードを変えるときだけ入力します。</p>
      </div>
      <div className="st-field">
        <label htmlFor="st-newpw">新しいパスワード</label>
        <input
          id="st-newpw"
          className="st-input"
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="st-field">
        <label htmlFor="st-newpw2">新しいパスワード（確認）</label>
        <input
          id="st-newpw2"
          className="st-input"
          type="password"
          value={newPw2}
          onChange={(e) => setNewPw2(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {err && (
        <p className="st-err" role="alert">
          {err}
        </p>
      )}
      {pc && (
        <button type="button" className="st-btn" onClick={save}>
          保存
        </button>
      )}
    </div>
  );
}
