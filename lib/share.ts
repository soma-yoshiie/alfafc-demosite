import type {
  Actor,
  BoardState,
  OppToken,
  PenStroke,
  PitchViewMode,
  Player,
  SetPieceMeta,
  ShareSnapshot,
  Shape,
  Slot,
} from "./types";

/* ---- base64url <-> JSON（Unicode対応） ---- */
function b64encode(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode<T>(str: string): T {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as T;
}

/** 現在のボードから自己完結スナップショットを作る */
export function buildSnapshot(
  state: BoardState,
  title: string | null
): ShareSnapshot {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  return {
    v: 1,
    teamName: state.teamName,
    title,
    formation: state.formation,
    ball: state.ball,
    moves: state.moves,
    holder: state.holder ?? undefined,
    slots: state.slots.map((s) => {
      const p = s.pid ? byId.get(s.pid) : null;
      return {
        role: s.role,
        x: s.x,
        y: s.y,
        p: p ? { name: p.name, number: p.number, position: p.position } : null,
        capt: p && state.captain === p.id ? true : undefined,
      };
    }),
    opponents: state.opponents?.length ? state.opponents : undefined,
    drawings: state.drawings?.length ? state.drawings : undefined,
    shapes: state.shapes?.length ? state.shapes : undefined,
    stepCount: state.stepCount,
    guides: state.guides,
    pitchView: state.pitchView,
    setPiece: state.setPiece,
  };
}

export function encodeSnapshot(snap: ShareSnapshot): string {
  return b64encode(snap);
}

export function decodeSnapshot(str: string): ShareSnapshot | null {
  try {
    const snap = b64decode<ShareSnapshot>(str);
    if (!snap || snap.v !== 1 || !Array.isArray(snap.slots)) return null;
    return snap;
  } catch {
    return null;
  }
}

/** スナップショットを読み込み用のボード断片へ復元（players を生成） */
export function snapshotToBoard(snap: ShareSnapshot): {
  teamName: string | null;
  players: Player[];
  captain: string | null;
  formation: string;
  slots: Slot[];
  ball: ShareSnapshot["ball"];
  moves: ShareSnapshot["moves"];
  holder: Actor | null;
  opponents: OppToken[];
  drawings: PenStroke[];
  shapes: Shape[];
  stepCount: number;
  guides: { lanes?: boolean; zones?: boolean; legend?: boolean };
  pitchView: PitchViewMode;
  setPiece: SetPieceMeta | undefined;
} {
  const players: Player[] = [];
  let captain: string | null = null;
  const slots: Slot[] = snap.slots.map((s, i) => {
    let pid: string | null = null;
    if (s.p) {
      pid = `shared_${i}`;
      players.push({
        id: pid,
        name: s.p.name,
        number: s.p.number,
        position: s.p.position,
      });
      if (s.capt) captain = pid;
    }
    return { role: s.role, x: s.x, y: s.y, pid };
  });
  return {
    teamName: snap.teamName,
    players,
    captain,
    formation: snap.formation,
    slots,
    ball: snap.ball,
    moves: snap.moves,
    holder: snap.holder ?? null,
    opponents: snap.opponents ?? [],
    drawings: snap.drawings ?? [],
    shapes: snap.shapes ?? [],
    stepCount: snap.stepCount ?? 1,
    guides: snap.guides ?? {},
    pitchView: snap.pitchView ?? "full",
    setPiece: snap.setPiece,
  };
}

/** 共有URLを生成（現在のページ＋#p=...） */
export function buildShareUrl(snap: ShareSnapshot): string {
  const enc = encodeSnapshot(snap);
  if (typeof window === "undefined") return "#p=" + enc;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#p=${enc}`;
}

/** LINE送信リンク */
export function buildLineUrl(text: string, url: string): string {
  return (
    "https://line.me/R/msg/text/?" + encodeURIComponent(text + "\n" + url)
  );
}
