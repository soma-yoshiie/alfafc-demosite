"use client";

import { useEffect, useState } from "react";
import type { Session } from "@/lib/types";
import { clearSession, loadSession, saveSession } from "@/lib/auth";
import { BoardProvider } from "./BoardProvider";
import { TeamProvider } from "./TeamProvider";
import { ProfileProvider } from "./ProfileProvider";
import AppRoot from "./AppRoot";
import SplashScreen from "./SplashScreen";
import LoginScreen from "./LoginScreen";

type Phase = "splash" | "login" | "app";

export default function AppFlow() {
  const [phase, setPhase] = useState<Phase>("splash");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (s && s.role) setSession(s);
  }, []);

  useEffect(() => {
    const onLogout = () => {
      clearSession();
      setSession(null);
      setPhase("login");
    };
    window.addEventListener("alfa-logout", onLogout);
    return () => window.removeEventListener("alfa-logout", onLogout);
  }, []);

  // settings-plan-a §3-1: 設定のアカウント更新で名前・メールが変わったら、セッションを保存して差し替える
  useEffect(() => {
    const onSession = (e: Event) => {
      const next = (e as CustomEvent<Session>).detail;
      if (!next || !next.role) return;
      saveSession(next);
      setSession(next);
    };
    window.addEventListener("alfa-session", onSession);
    return () => window.removeEventListener("alfa-session", onSession);
  }, []);

  if (phase === "splash") {
    return <SplashScreen onDone={() => setPhase(session ? "app" : "login")} />;
  }

  if (phase === "login" || !session) {
    return (
      <LoginScreen
        onLogin={(s) => {
          saveSession(s);
          setSession(s);
          setPhase("app");
        }}
      />
    );
  }

  return (
    <BoardProvider session={session}>
      <TeamProvider>
        {/* player-hub §1-1: 選手のプロフィール（記録）。BoardProvider の内側（board.auth・toast を使う）・TeamProvider の内側 */}
        <ProfileProvider>
          <AppRoot />
        </ProfileProvider>
      </TeamProvider>
    </BoardProvider>
  );
}
