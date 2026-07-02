import type {
  BoardState,
  ChatMessage,
  CoachDeliverable,
  DrillDoc,
  Library,
  NotebookEntry,
  SavedDrill,
  Settings,
  TeamData,
  TeamViewer,
} from "./types";

const KEY = "soccer_tactics_state_v1";
const LIB_KEY = "soccer_tactics_library_v1";
const SETTINGS_KEY = "soccer_tactics_settings_v1";
const DRILLS_KEY = "soccer_tactics_drills_v1";
const DRILL_WORK_KEY = "soccer_tactics_drill_work_v1";
const TEAM_KEY = "soccer_tactics_team_v1";
const VIEWER_KEY = "soccer_tactics_viewer_v1";
const MESSAGES_KEY = "soccer_tactics_messages_v1";
const NOTEBOOK_KEY = "soccer_tactics_notebook_v1";
const DELIVER_KEY = "soccer_tactics_coachdeliver_v1";
const NOTIF_SEEN_KEY = "soccer_tactics_notif_seen_v1";

/** localStorage から状態を復元（SSR/未保存時は null） */
export function loadState(): BoardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as BoardState;
    if (!data || !Array.isArray(data.slots)) return null;
    return data;
  } catch {
    return null;
  }
}

/** localStorage へ状態を保存 */
export function saveState(state: BoardState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 容量超過などは無視 */
  }
}

/* ---- ライブラリ（保存された戦術） ---- */
export function loadLibrary(): Library | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LIB_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Library;
    if (!data || !Array.isArray(data.plays)) return null;
    if (!Array.isArray(data.folders)) data.folders = [];
    return data;
  } catch {
    return null;
  }
}

export function saveLibrary(lib: Library): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch {
    /* 無視 */
  }
}

/* ---- 設定（プラン・現在の戦術） ---- */
export function loadSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Settings;
  } catch {
    return null;
  }
}

export function saveSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 無視 */
  }
}

/* ---- 練習メニュー（ドリル図） ---- */
export function loadDrills(): SavedDrill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRILLS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as SavedDrill[]) : [];
  } catch {
    return [];
  }
}

export function saveDrills(drills: SavedDrill[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRILLS_KEY, JSON.stringify(drills));
  } catch {
    /* 無視 */
  }
}

export function loadDrillWork(): { doc: DrillDoc; currentId: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRILL_WORK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.doc) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveDrillWork(doc: DrillDoc, currentId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRILL_WORK_KEY, JSON.stringify({ doc, currentId }));
  } catch {
    /* 無視 */
  }
}

/* ---- チーム（出欠・連絡） ---- */
export function loadTeam(): TeamData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TEAM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as TeamData;
    if (!data || !Array.isArray(data.events)) return null;
    if (!data.attendance) data.attendance = {};
    if (!Array.isArray(data.announcements)) data.announcements = [];
    if (!Array.isArray(data.coaches)) data.coaches = [];
    if (!Array.isArray(data.matches)) data.matches = [];
    if (!Array.isArray(data.competitions)) data.competitions = [];
    return data;
  } catch {
    return null;
  }
}

export function saveTeam(team: TeamData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEAM_KEY, JSON.stringify(team));
  } catch {
    /* 無視 */
  }
}

/* ---- チャット（戦術・トレーニング・画像・動画の送信） ---- */
export function loadMessages(): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as ChatMessage[]) : null;
  } catch {
    return null;
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    /* 容量超過（画像・動画が大きい等）は無視 */
  }
}

/* ---- 通知の既読タイムスタンプ（identityKeyごと） ---- */
export function loadNotifSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTIF_SEEN_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function saveNotifSeen(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* 無視 */
  }
}

/* ---- サッカーノート（選手の振り返り提出） ---- */
export function loadNotebook(): NotebookEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    // 旧フラット形式（kindなし・goal/body）→ 練習ノートへ移行
    return data.map((e): NotebookEntry => {
      if (e && e.kind) return e as NotebookEntry;
      return {
        id: e.id,
        playerId: e.playerId,
        kind: "practice",
        date: e.date,
        ts: e.ts,
        condition: e.condition,
        body: e.body,
        goalPre: e.goal,
        insights: [],
        staffComment: e.staffComment,
        staffCommentTs: e.staffCommentTs,
      };
    });
  } catch {
    return null;
  }
}

export function saveNotebook(entries: NotebookEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(entries));
  } catch {
    /* 無視 */
  }
}

/* ---- コーチからの配信物（練習メニュー/個人課題/ミーティング/テスト） ---- */
export function loadDeliverables(): CoachDeliverable[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DELIVER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as CoachDeliverable[]) : null;
  } catch {
    return null;
  }
}

export function saveDeliverables(items: CoachDeliverable[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DELIVER_KEY, JSON.stringify(items));
  } catch {
    /* 無視 */
  }
}

export function loadViewer(): TeamViewer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEWER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamViewer;
  } catch {
    return null;
  }
}

export function saveViewer(v: TeamViewer): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWER_KEY, JSON.stringify(v));
  } catch {
    /* 無視 */
  }
}
