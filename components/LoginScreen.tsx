"use client";

import { useState } from "react";
import type { Session } from "@/lib/types";
import { DEFAULT_PLAYER_PASSWORD, loadCoachAccount, saveCoachAccount } from "@/lib/auth";
import { loadSettings, loadState } from "@/lib/storage";
import LogoMark from "./Logo";
import { IconEye, IconEyeOff } from "./icons";

/** 表示トグル付きパスワード入力 */
function PasswordInput({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwwrap">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      />
      <button
        type="button"
        className="pweye"
        title={show ? "パスワードを隠す" : "パスワードを表示"}
        aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

export default function LoginScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [tab, setTab] = useState<"coach" | "player">("coach");
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const coachSubmit = () => {
    setErr("");
    const mail = email.trim().toLowerCase();
    if (!mail || !pw) {
      setErr("メールアドレスとパスワードを入力してください");
      return;
    }
    const acc = loadCoachAccount();
    if (signup || !acc) {
      // 契約（新規登録）。デモのため即時作成
      const a = { name: name.trim() || "スタッフ", email: mail, password: pw };
      saveCoachAccount(a);
      onLogin({ role: "coach", email: mail, name: a.name });
      return;
    }
    if (acc.email !== mail || acc.password !== pw) {
      setErr("メールアドレスまたはパスワードが違います");
      return;
    }
    onLogin({ role: "coach", email: mail, name: acc.name });
  };

  const playerSubmit = () => {
    setErr("");
    const mail = email.trim().toLowerCase();
    if (!mail || !pw) {
      setErr("メールアドレスと共通パスワードを入力してください");
      return;
    }
    const players = loadState()?.players ?? [];
    const p = players.find((x) => (x.email ?? "").toLowerCase() === mail);
    const teamPw = loadSettings()?.playerPassword || DEFAULT_PLAYER_PASSWORD;
    if (!p) {
      setErr("登録されていないメールアドレスです（スタッフに確認してください）");
      return;
    }
    if (pw !== teamPw) {
      setErr("共通パスワードが違います");
      return;
    }
    onLogin({ role: "player", email: mail, name: p.name, playerId: p.id });
  };

  return (
    <div className="login">
      <div className="login-head">
        <div className="login-mark">
          <LogoMark uid="lg" />
        </div>
        <div className="login-logo">
          ALFA<b> FOOTBALL</b>
        </div>
        <div className="login-tag">ログインして続ける</div>
      </div>

      <div className="login-card">
        <div className="logintabs">
          <button
            className={tab === "coach" ? "on" : ""}
            onClick={() => {
              setTab("coach");
              setErr("");
            }}
          >
            スタッフ
          </button>
          <button
            className={tab === "player" ? "on" : ""}
            onClick={() => {
              setTab("player");
              setErr("");
            }}
          >
            選手・保護者
          </button>
        </div>

        {tab === "coach" ? (
          <>
            {signup && (
              <div className="formfield" style={{ margin: "0 0 12px" }}>
                <label>スタッフ名</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例）田中 監督" />
              </div>
            )}
            <div className="formfield" style={{ margin: "0 0 12px" }}>
              <label>メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@example.com"
                autoComplete="username"
              />
            </div>
            <div className="formfield" style={{ margin: "0 0 14px" }}>
              <label>パスワード</label>
              <PasswordInput value={pw} onChange={setPw} placeholder="••••••••" onEnter={coachSubmit} />
            </div>
            {err && <div className="login-err">{err}</div>}
            <button className="bigbtn" style={{ width: "100%", margin: 0 }} onClick={coachSubmit}>
              {signup ? "契約して登録する" : "ログイン"}
            </button>
            <button className="login-switch" onClick={() => { setSignup(!signup); setErr(""); }}>
              {signup ? "すでにアカウントをお持ちの方はこちら" : "新規契約（スタッフ登録）はこちら"}
            </button>
          </>
        ) : (
          <>
            <div className="formfield" style={{ margin: "0 0 12px" }}>
              <label>メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="あなたのメールアドレス"
                autoComplete="username"
              />
            </div>
            <div className="formfield" style={{ margin: "0 0 14px" }}>
              <label>共通パスワード（スタッフから共有）</label>
              <PasswordInput value={pw} onChange={setPw} placeholder="チーム共通のパスワード" onEnter={playerSubmit} />
            </div>
            {err && <div className="login-err">{err}</div>}
            <button className="bigbtn" style={{ width: "100%", margin: 0 }} onClick={playerSubmit}>
              ログイン
            </button>
          </>
        )}
      </div>

      <div className="login-note">
        ※ デモ版です。スタッフは任意のメール／パスワードで契約できます。
        <br />
        選手デモ：<b>sora@alfafc.example</b> ／ 共通パスワード <b>{DEFAULT_PLAYER_PASSWORD}</b>
      </div>
    </div>
  );
}
