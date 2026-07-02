import type { CoachAccount, Session } from "./types";

const COACH_KEY = "alfa_coach_account_v1";
const SESSION_KEY = "alfa_session_v1";

/** 共通パスワード未設定時のデモ用デフォルト */
export const DEFAULT_PLAYER_PASSWORD = "team2026";

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, val: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

export function loadCoachAccount(): CoachAccount | null {
  return read<CoachAccount>(COACH_KEY);
}
export function saveCoachAccount(a: CoachAccount): void {
  write(COACH_KEY, a);
}

export function loadSession(): Session | null {
  return read<Session>(SESSION_KEY);
}
export function saveSession(s: Session): void {
  write(SESSION_KEY, s);
}
export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
