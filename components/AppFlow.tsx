"use client";

import { useEffect, useState } from "react";
import type { Session } from "@/lib/types";
import { clearSession, loadSession, saveSession } from "@/lib/auth";
import { BoardProvider } from "./BoardProvider";
import { TeamProvider } from "./TeamProvider";
import AppRoot from "./AppRoot";
import SplashScreen from "./SplashScreen";
import LoginScreen from "./LoginScreen";
import TodayGate from "./TodayGate";

type Phase = "splash" | "login" | "app";

export default function AppFlow() {
  const [phase, setPhase] = useState<Phase>("splash");
  const [session, setSession] = useState<Session | null>(null);
  // 起動（スプラッシュ）→「今日の予定」→ タップでホーム。ログアウト後の再ログインでも再び出す
  const [todaySeen, setTodaySeen] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (s && s.role) setSession(s);
  }, []);

  useEffect(() => {
    const onLogout = () => {
      clearSession();
      setSession(null);
      setTodaySeen(false);
      setPhase("login");
    };
    window.addEventListener("alfa-logout", onLogout);
    return () => window.removeEventListener("alfa-logout", onLogout);
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
        {!todaySeen && <TodayGate onDone={() => setTodaySeen(true)} />}
        <AppRoot />
      </TeamProvider>
    </BoardProvider>
  );
}
