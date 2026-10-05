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

/**
 * アカウントの更新（settings-plan-a §3-1）。メールは trim・小文字。パスワードを変えるときは
 * 現在のパスワードが保存済みと一致しないと失敗する。成功したらセッションも更新して "alfa-session" を投げる
 * （AppFlow が受けて saveSession＋setSession し、BoardProvider の auth が追随する）。
 */
/**
 * コーチラボの利用者 ID は "me:<email小文字>"（lib/coachlab.ts の userIdOf）なので、メールを変えると
 * 自分の記事・購入・フォロー・プロフィールが他人扱いになる。保存値の中の ID を新しいメールに書き換える
 * （値は JSON 文字列なので、引用符つきの ID をそのまま置換する）
 */
function migrateCoachLabUserId(oldEmail: string, newEmail: string): void {
  if (typeof window === "undefined") return;
  const from = JSON.stringify(`me:${oldEmail.toLowerCase()}`);
  const to = JSON.stringify(`me:${newEmail.toLowerCase()}`);
  for (const key of ["soccer_tactics_coachlab_v1", "soccer_tactics_user_articles_v1"]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw && raw.includes(from)) window.localStorage.setItem(key, raw.split(from).join(to));
    } catch {
      /* ignore */
    }
  }
}

export function updateCoachAccount(
  patch: { name?: string; email?: string; password?: string },
  currentPassword?: string
): { ok: true } | { ok: false; reason: string } {
  const acc = loadCoachAccount();
  if (!acc) return { ok: false, reason: "アカウントが見つかりません" };
  const name = patch.name !== undefined ? patch.name.trim() : acc.name;
  const email = patch.email !== undefined ? patch.email.trim().toLowerCase() : acc.email;
  if (!name) return { ok: false, reason: "名前を入力してください" };
  if (!email) return { ok: false, reason: "メールアドレスを入力してください" };
  let password = acc.password;
  if (patch.password) {
    if (currentPassword !== acc.password) return { ok: false, reason: "現在のパスワードが違います" };
    password = patch.password;
  }
  saveCoachAccount({ ...acc, name, email, password });
  if (email !== acc.email) migrateCoachLabUserId(acc.email, email);
  const cur = loadSession();
  if (cur && cur.role === "coach") {
    const next: Session = { ...cur, name, email };
    saveSession(next);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("alfa-session", { detail: next }));
  }
  return { ok: true };
}
