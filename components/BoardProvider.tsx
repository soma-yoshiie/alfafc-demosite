"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  Actor,
  AssignmentResponse,
  BoardState,
  ChatMessage,
  CoachDeliverable,
  Folder,
  Library,
  MenuResponse,
  Move,
  NotebookEntry,
  Player,
  PlanTier,
  Point,
  Position,
  QuizResponse,
  SavedDrill,
  SavedPlay,
  Session,
  ShareSnapshot,
  Slot,
} from "@/lib/types";
import { migratePlan } from "@/lib/types";
import { buildSlots } from "@/lib/formations";
import { actorPos, animTotal, durFromPath } from "@/lib/animation";
import {
  loadDeliverables,
  loadLibrary,
  loadMessages,
  loadNotebook,
  loadSettings,
  loadState,
  saveDeliverables,
  saveLibrary,
  saveMessages,
  saveNotebook,
  saveSettings,
  saveState,
} from "@/lib/storage";
import {
  buildSnapshot,
  decodeSnapshot,
  snapshotToBoard,
} from "@/lib/share";
import { SAMPLE_PLAYERS, SAMPLE_TEAM_NAME } from "@/lib/sampleTeam";

/* ------------------------------------------------------------------ */
/* Reducer                                                            */
/* ------------------------------------------------------------------ */

type Action =
  | { type: "HYDRATE"; state: BoardState }
  | { type: "SET_FORMATION"; key: string }
  | { type: "ASSIGN"; slot: number; pid: string }
  | { type: "REMOVE"; slot: number }
  | { type: "SWAP"; a: number; b: number }
  | { type: "MOVE_SLOT"; slot: number; x: number; y: number; role: Position }
  | { type: "SET_BALL"; x: number; y: number }
  | { type: "SET_CAPTAIN"; pid: string | null }
  | { type: "ADD_PLAYER"; player: Player }
  | { type: "UPDATE_PLAYER"; player: Player }
  | { type: "DELETE_PLAYER"; id: string }
  | { type: "SET_TEAM_NAME"; name: string }
  | { type: "RESET_POSITIONS" }
  | { type: "ADD_MOVE"; actor: Actor; path: Point[] }
  | { type: "UPDATE_MOVE"; index: number; patch: Partial<Move> }
  | { type: "DELETE_MOVE"; index: number }
  | { type: "CLEAR_MOVES" }
  | { type: "UNDO_MOVE" }
  | {
      type: "LOAD_TACTIC";
      formation: string;
      slots: Slot[];
      ball: Point;
      moves: Move[];
    }
  | { type: "NEW_TACTIC"; formation: string }
  | {
      type: "IMPORT_SHARED";
      teamName: string | null;
      players: Player[];
      captain: string | null;
      formation: string;
      slots: Slot[];
      ball: Point;
      moves: Move[];
    };

function makeInitial(): BoardState {
  const slots = buildSlots("4-3-3");
  SAMPLE_PLAYERS.slice(0, slots.length).forEach((p, i) => {
    slots[i].pid = p.id;
  });
  return {
    teamName: SAMPLE_TEAM_NAME,
    formation: "4-3-3",
    slots,
    players: SAMPLE_PLAYERS,
    ball: { x: 50, y: 42 },
    moves: [],
    captain: "p08",
  };
}

function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "SET_FORMATION":
      return {
        ...state,
        formation: action.key,
        slots: buildSlots(action.key, state.slots),
      };

    case "ASSIGN": {
      const slots = state.slots.map((s) => ({ ...s }));
      // 既に他の枠にいる場合は外す
      slots.forEach((s) => {
        if (s.pid === action.pid) s.pid = null;
      });
      slots[action.slot].pid = action.pid;
      return { ...state, slots };
    }

    case "REMOVE": {
      const slots = state.slots.map((s) => ({ ...s }));
      slots[action.slot].pid = null;
      return { ...state, slots };
    }

    case "SWAP": {
      const slots = state.slots.map((s) => ({ ...s }));
      const t = slots[action.a].pid;
      slots[action.a].pid = slots[action.b].pid;
      slots[action.b].pid = t;
      return { ...state, slots };
    }

    case "MOVE_SLOT": {
      const slots = state.slots.map((s) => ({ ...s }));
      slots[action.slot] = {
        ...slots[action.slot],
        x: action.x,
        y: action.y,
        role: action.role,
      };
      return { ...state, slots };
    }

    case "SET_BALL":
      return { ...state, ball: { x: action.x, y: action.y } };

    case "SET_CAPTAIN":
      return { ...state, captain: action.pid };

    case "ADD_PLAYER":
      return { ...state, players: [...state.players, action.player] };

    case "UPDATE_PLAYER":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.player.id ? action.player : p
        ),
      };

    case "DELETE_PLAYER": {
      const slots = state.slots.map((s) =>
        s.pid === action.id ? { ...s, pid: null } : s
      );
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.id),
        slots,
        captain: state.captain === action.id ? null : state.captain,
      };
    }

    case "SET_TEAM_NAME":
      return { ...state, teamName: action.name || null };

    case "RESET_POSITIONS":
      return { ...state, slots: buildSlots(state.formation, state.slots) };

    case "ADD_MOVE": {
      const dur = durFromPath(action.path);
      const existing = state.moves.find((m) => m.actor === action.actor);
      let moves: Move[];
      if (existing) {
        moves = state.moves.map((m) =>
          m.actor === action.actor ? { ...m, path: action.path } : m
        );
      } else {
        moves = [
          ...state.moves,
          { actor: action.actor, path: action.path, start: 0, dur },
        ];
      }
      return { ...state, moves };
    }

    case "UPDATE_MOVE": {
      const moves = state.moves.map((m, i) =>
        i === action.index ? { ...m, ...action.patch } : m
      );
      return { ...state, moves };
    }

    case "DELETE_MOVE":
      return {
        ...state,
        moves: state.moves.filter((_, i) => i !== action.index),
      };

    case "CLEAR_MOVES":
      return { ...state, moves: [] };

    case "UNDO_MOVE":
      return { ...state, moves: state.moves.slice(0, -1) };

    case "LOAD_TACTIC":
      return {
        ...state,
        formation: action.formation,
        slots: action.slots,
        ball: action.ball,
        moves: action.moves,
      };

    case "NEW_TACTIC":
      return {
        ...state,
        formation: action.formation,
        slots: buildSlots(action.formation),
        ball: { x: 50, y: 42 },
        moves: [],
      };

    case "IMPORT_SHARED":
      return {
        ...state,
        teamName: action.teamName,
        players: action.players,
        captain: action.captain,
        formation: action.formation,
        slots: action.slots,
        ball: action.ball,
        moves: action.moves,
      };

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                            */
/* ------------------------------------------------------------------ */

export type SheetType =
  | "assign"
  | "slotMenu"
  | "roster"
  | "playerForm"
  | "playerDetail"
  | "fitness"
  | "injuryEdit"
  | "settings"
  | "formation"
  | "library"
  | "save"
  | "share"
  | "more"
  | "articles"
  | "article"
  | "importShared"
  | "chat"
  | null;

export interface SheetState {
  type: SheetType;
  slot?: number;
  /** playerForm: 編集対象（新規は undefined） */
  player?: Player;
  /** playerForm: 作成後にこの枠へ自動配置する */
  assignSlot?: number;
  /** playerDetail / fitness / injuryEdit: 対象選手ID */
  playerId?: string;
  /** fitness: 編集対象の記録ID（新規は undefined） */
  fitnessId?: string;
  /** injuryEdit: 編集対象の記録ID（新規は undefined） */
  injuryId?: string;
  /** article: 記事ID */
  articleId?: string;
  /** chat: 開く会話キー（"team" または "p:<playerId>"） */
  chatTo?: string;
}

interface BoardContextValue {
  state: BoardState;
  // actions
  setFormation: (key: string) => void;
  assignPlayer: (slot: number, pid: string) => void;
  removePlayer: (slot: number) => void;
  swapSlots: (a: number, b: number) => void;
  moveSlot: (slot: number, x: number, y: number, role: Position) => void;
  setBall: (x: number, y: number) => void;
  setCaptain: (pid: string | null) => void;
  addPlayer: (p: Omit<Player, "id">) => void;
  /** 選手を追加し、生成したIDを返す */
  createPlayer: (p: Omit<Player, "id">) => string;
  updatePlayer: (p: Player) => void;
  deletePlayer: (id: string) => void;
  setTeamName: (name: string) => void;
  resetPositions: () => void;
  addMove: (actor: Actor, path: Point[]) => void;
  updateMove: (index: number, patch: Partial<Move>) => void;
  deleteMove: (index: number) => void;
  clearMoves: () => void;
  undoMove: () => void;
  // UI mode
  mode: "edit" | "anim";
  selActor: Actor | null;
  setSelActor: (a: Actor | null) => void;
  /** 記録中の一時ルート。再描画を避けるため ref + 購読で管理 */
  tempDrawRef: React.RefObject<{ actor: Actor; pts: Point[] } | null>;
  setTempDraw: (d: { actor: Actor; pts: Point[] } | null) => void;
  subscribeTempDraw: (fn: () => void) => () => void;
  openStudio: () => void;
  closeStudio: () => void;
  // refs
  pitchRef: React.RefObject<HTMLDivElement | null>;
  registerToken: (actor: Actor, el: HTMLElement | null) => void;
  getPitchRect: () => DOMRect | null;
  stateRef: React.RefObject<BoardState>;
  // playback
  isPlaying: boolean;
  speed: number;
  setSpeed: (n: number) => void;
  startPlay: () => void;
  stopPlay: () => void;
  resetPlay: () => void;
  seek: (t: number) => void;
  applyPlayhead: (t: number) => void;
  getTime: () => number;
  showPaths: boolean;
  setShowPaths: (v: boolean) => void;
  fullplay: boolean;
  enterFullplay: () => void;
  exitFullplay: () => void;
  onTick: React.RefObject<((t: number, total: number) => void) | null>;
  // sheet & toast
  sheet: SheetState;
  openSheet: (s: SheetState) => void;
  closeSheet: () => void;
  toast: (msg: string) => void;
  toastMsg: string;
  toastOn: boolean;
  // ライブラリ / プラン / 共有
  library: Library;
  plan: PlanTier;
  setPlan: (t: PlanTier) => void;
  playerPassword: string;
  setPlayerPassword: (pw: string) => void;
  matchesPublic: boolean;
  setMatchesPublic: (v: boolean) => void;
  drillIntent: "library" | null;
  setDrillIntent: (v: "library" | null) => void;
  // チャット / メッセージ（戦術・トレーニング・画像・動画の送信）
  messages: ChatMessage[];
  sendMessage: (msg: Omit<ChatMessage, "id" | "ts">) => void;
  removeMessage: (id: string) => void;
  /** 現在のボードを SavedPlay スナップショットにして返す（送信用） */
  snapshotPlay: (title: string) => SavedPlay;
  /** 埋め込みの戦術データを読み込んでボードに表示（ライブラリ非依存） */
  loadPlayData: (play: SavedPlay) => void;
  /** 受信した埋め込みドリル（DrillProvider が読み取って読込） */
  incomingDrill: SavedDrill | null;
  setIncomingDrill: (d: SavedDrill | null) => void;
  /** 埋め込みのトレーニング(ドリル)をドリル画面で開く */
  openDrillData: (drill: SavedDrill) => void;
  // サッカーノート（選手提出）
  notebook: NotebookEntry[];
  addNote: (entry: Omit<NotebookEntry, "id" | "ts">) => void;
  updateNote: (entry: NotebookEntry) => void;
  deleteNote: (id: string) => void;
  setNoteComment: (id: string, comment: string) => void;
  // コーチからの配信物
  deliverables: CoachDeliverable[];
  addDeliverable: (data: Omit<CoachDeliverable, "id" | "ts">) => void;
  updateDeliverable: (d: CoachDeliverable) => void;
  removeDeliverable: (id: string) => void;
  respondDeliverable: (id: string, playerId: string, response: CoachDeliverable["responses"][string]) => void;
  currentPlayId: string | null;
  currentPlayTitle: string | null;
  canSaveNew: boolean;
  savePlay: (title: string, folderId: string | null) => boolean;
  saveCurrent: () => void;
  loadPlay: (id: string) => void;
  deletePlay: (id: string) => void;
  duplicatePlay: (id: string) => void;
  renamePlay: (id: string, title: string) => void;
  movePlayToFolder: (id: string, folderId: string | null) => void;
  newPlay: () => void;
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  buildShareSnapshot: () => ShareSnapshot;
  pendingImport: ShareSnapshot | null;
  applyImport: () => void;
  // 画面（戦術ボード / 練習メニュー）
  screen: "home" | "board" | "drill" | "team" | "chat" | "notebook";
  setScreen: (s: "home" | "board" | "drill" | "team" | "chat" | "notebook") => void;
  /** ログイン中のアカウント */
  auth: Session;
}

const Ctx = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBoard must be used within BoardProvider");
  return v;
}

let pidSeq = 0;
function newPid(): string {
  pidSeq += 1;
  return `p_${Date.now().toString(36)}_${pidSeq}`;
}

let msgSeq = 0;
function newMsgId(): string {
  msgSeq += 1;
  return `msg_${Date.now().toString(36)}_${msgSeq}`;
}

function sampleMessages(): ChatMessage[] {
  return [
    {
      id: "msg_sample1",
      ts: Date.now() - 3600_000,
      to: "team",
      from: "coach",
      fromName: "スタッフ",
      text: "今週末は練習試合です。集合10時・忘れ物に注意！スパイクの手入れも忘れずに。",
    },
  ];
}

let noteSeq = 0;
function newNoteId(): string {
  noteSeq += 1;
  return `note_${Date.now().toString(36)}_${noteSeq}`;
}

function sampleNotebook(): NotebookEntry[] {
  const dayAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const ts = (n: number) => Date.now() - n * 86400_000;
  return [
    /* --- 中村 蒼空(p08)：練習＋自主練の継続例 --- */
    {
      id: "note_practice1",
      playerId: "p08",
      kind: "practice",
      date: dayAgo(1),
      ts: ts(1),
      condition: "good",
      goalPre: "ファーストタッチを前向きに置く",
      achievement: 70,
      insights: ["相手を見る前に首を振る", "受ける前に体の向きを作る"],
      body: "ポゼッション練習で前を向く回数が増えた。",
      isPublic: true,
      staffComment: "good！ 首振りの意識が見えていたよ。",
      staffCommentTs: ts(1) + 3600_000,
    },
    {
      id: "note_solo1",
      playerId: "p08",
      kind: "solo",
      date: dayAgo(0),
      ts: ts(0),
      condition: "great",
      items: [
        { kind: "lifting", value: "120回" },
        { kind: "running", value: "3km" },
      ],
      body: "リフティング自己ベスト更新。",
    },
    {
      id: "note_solo0",
      playerId: "p08",
      kind: "solo",
      date: dayAgo(1),
      ts: ts(1),
      items: [{ kind: "lifting", value: "100回" }],
    },
    /* --- 試合ノート（クイック記録の例：vs みどり台SC・5日前） --- */
    {
      id: "note_match_p10",
      playerId: "p10",
      kind: "match",
      date: dayAgo(5),
      ts: ts(5),
      condition: "great",
      opponent: "みどり台SC",
      bestPlay: "2ゴール。裏抜けのタイミングが合った",
      minutes: 60,
      lineups: [{ phase: "1st", ownFormation: "4-3-3", ownPositionIndex: 9, oppFormation: "4-4-2" }],
      plays: [
        { x: 52, y: 84, kind: "shot" },
        { x: 46, y: 78, kind: "shot" },
        { x: 60, y: 66, kind: "receive" },
      ],
      body: "前半から主導権。サイドからのクロスに反応できた。",
      staffComment: "抜け出しが鋭かった！ 決定力◎。次は左足のシュートも増やそう。",
      staffCommentTs: ts(4),
    },
    {
      id: "note_match_p09",
      playerId: "p09",
      kind: "match",
      date: dayAgo(5),
      ts: ts(5),
      condition: "good",
      opponent: "みどり台SC",
      bestPlay: "右サイド突破からのアシスト",
      body: "1対1で仕掛けられた場面が多かった。",
      staffComment: "仕掛けの姿勢が良い。クロスの精度をもう一段上げよう。",
      staffCommentTs: ts(4),
    },
    {
      id: "note_match_p01",
      playerId: "p01",
      kind: "match",
      date: dayAgo(5),
      ts: ts(5),
      condition: "good",
      opponent: "みどり台SC",
      bestPlay: "1対1のセービング",
      body: "コーチングで最終ラインを押し上げられた。",
    },
    {
      id: "note_match_p07",
      playerId: "p07",
      kind: "match",
      date: dayAgo(5),
      ts: ts(5),
      condition: "normal",
      opponent: "みどり台SC",
      bestPlay: "中盤でのボール奪取",
      reflectPlay: "縦パスをもう少し狙いたかった",
      staffComment: "守備の読みが良かった。ボールを奪った後の“最初の一歩”を前へ。",
      staffCommentTs: ts(4),
    },
    /* --- 練習ノート（複数選手） --- */
    {
      id: "note_practice_p02",
      playerId: "p02",
      kind: "practice",
      date: dayAgo(2),
      ts: ts(2),
      condition: "good",
      goalPre: "対人で体を入れる",
      achievement: 80,
      insights: ["半身で待つ", "相手より先にボールに触る"],
      staffComment: "対人での粘りが出てきた。良い変化！",
      staffCommentTs: ts(2) + 3600_000,
    },
    {
      id: "note_practice_p06",
      playerId: "p06",
      kind: "practice",
      date: dayAgo(2),
      ts: ts(2),
      condition: "great",
      goalPre: "ボランチで前後の顔出し",
      achievement: 75,
      insights: ["受ける前に一度顔を出す"],
      body: "コンパクトな距離感を意識できた。",
    },
    {
      id: "note_practice_p03",
      playerId: "p03",
      kind: "practice",
      date: dayAgo(3),
      ts: ts(3),
      condition: "good",
      goalPre: "ビルドアップの角度を作る",
      achievement: 65,
      insights: ["斜めのサポート"],
      isPublic: true,
      staffComment: "立ち位置が良くなった。次は運ぶドリブルも。",
      staffCommentTs: ts(3) + 3600_000,
    },
    /* --- 自主練ノート（複数選手） --- */
    {
      id: "note_solo_p11",
      playerId: "p11",
      kind: "solo",
      date: dayAgo(0),
      ts: ts(0),
      condition: "good",
      items: [
        { kind: "lifting", value: "80回" },
        { kind: "other", value: "利き足以外のシュート 30本" },
      ],
      body: "左足のインステップを練習。",
    },
    {
      id: "note_solo_p04",
      playerId: "p04",
      kind: "solo",
      date: dayAgo(1),
      ts: ts(1),
      items: [{ kind: "running", value: "2km" }],
    },
    {
      id: "note_practice_p12",
      playerId: "p12",
      kind: "practice",
      date: dayAgo(1),
      ts: ts(1),
      condition: "normal",
      goalPre: "GKの飛び出し判断",
      achievement: 60,
      insights: ["セットプレーの準備"],
    },
    /* --- 離脱中(p05)のリハビリ記録：怪我中でも前向きに継続 --- */
    {
      id: "note_solo_p05",
      playerId: "p05",
      kind: "solo",
      date: dayAgo(2),
      ts: ts(2),
      condition: "normal",
      items: [
        { kind: "strength", value: "体幹 15分" },
        { kind: "other", value: "リハビリメニュー（足首）" },
      ],
      body: "痛みは軽減。来週フル合流できるよう調整中。",
      staffComment: "無理せず段階的に。復帰を待ってるよ！",
      staffCommentTs: ts(1),
    },
  ];
}

let deliverSeq = 0;
function newDeliverId(): string {
  deliverSeq += 1;
  return `dlv_${Date.now().toString(36)}_${deliverSeq}`;
}

function sampleDeliverables(): CoachDeliverable[] {
  const ids = SAMPLE_PLAYERS.map((p) => p.id);
  const now = Date.now();

  // 練習メニュー：チーム全員宛・13名が回答（理解度は高め）
  const menuResp: Record<string, MenuResponse> = {};
  ids.slice(0, 13).forEach((id, i) => {
    menuResp[id] = { understanding: 4 + (i % 2), difficulty: 3 + (i % 2), ts: now - 6000_000 };
  });

  // 個人課題：対象8名（離脱中のp05は除く）を指定し、全員が「実践できた」
  const assignTargets = ids.filter((id) => id !== "p05").slice(0, 8);
  const assignResp: Record<string, AssignmentResponse> = {};
  assignTargets.forEach((id) => {
    assignResp[id] = { status: "done", ts: now - 6500_000 };
  });

  // 理解度テスト：チーム全員宛・12名が回答（全員正解）
  const quizResp: Record<string, QuizResponse> = {};
  ids.slice(0, 12).forEach((id) => {
    quizResp[id] = { answers: [0], ts: now - 7000_000 };
  });

  return [
    {
      id: "dlv_menu1",
      kind: "menu",
      ts: now - 7200_000,
      title: "3対2のポゼッション",
      category: "ポゼッション",
      desc: "数的優位を作って前進。パスの受け手は常に2つの選択肢を準備する。",
      responses: menuResp,
    },
    {
      id: "dlv_assign1",
      kind: "assignment",
      ts: now - 8200_000,
      title: "縦パスを増やす",
      detail: "1試合で前向きの縦パスを5本以上。",
      targetPlayerIds: assignTargets,
      responses: assignResp,
    },
    {
      id: "dlv_quiz1",
      kind: "quiz",
      ts: now - 9200_000,
      title: "ポジション理解度テスト",
      questions: [
        {
          q: "右SBがボール保持時、左WGはどこに立つ？",
          options: ["逆サイドで幅を取る", "中央に絞る", "右SBの近くに寄る"],
          correct: 0,
        },
      ],
      responses: quizResp,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Provider                                                           */
/* ------------------------------------------------------------------ */

export function BoardProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitial);

  // 最新stateをアニメーションループから読むためのミラー
  const stateRef = useRef<BoardState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ---- mount: localStorage 復元 / 変更時保存 ----
  const hydrated = useRef(false);
  useEffect(() => {
    const saved = loadState();
    if (saved && saved.slots && saved.slots.length) {
      dispatch({ type: "HYDRATE", state: saved });
    }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    saveState(state);
  }, [state]);

  // ---- UI state ----
  const [mode, setMode] = useState<"edit" | "anim">("edit");
  const [screen, setScreen] = useState<"home" | "board" | "drill" | "team" | "chat" | "notebook">("home");
  const [selActor, setSelActor] = useState<Actor | null>(null);
  const tempDrawRef = useRef<{ actor: Actor; pts: Point[] } | null>(null);
  const tempSubs = useRef<Set<() => void>>(new Set());
  const setTempDraw = useCallback(
    (d: { actor: Actor; pts: Point[] } | null) => {
      tempDrawRef.current = d;
      tempSubs.current.forEach((fn) => fn());
    },
    []
  );
  const subscribeTempDraw = useCallback((fn: () => void) => {
    tempSubs.current.add(fn);
    return () => {
      tempSubs.current.delete(fn);
    };
  }, []);
  const [showPaths, setShowPaths] = useState(true);
  const [fullplay, setFullplay] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ type: null });
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- library / plan / share ----
  const [library, setLibrary] = useState<Library>({ plays: [], folders: [] });
  const [plan, setPlanState] = useState<PlanTier>("starter");
  const [currentPlayId, setCurrentPlayId] = useState<string | null>(null);
  const [playerPassword, setPlayerPasswordState] = useState("");
  const [matchesPublic, setMatchesPublicState] = useState(true);
  const [drillIntent, setDrillIntent] = useState<"library" | null>(null);
  // チャット（戦術・トレーニング・画像・動画の送信）。送信元が全画面共通のため Board に保持。
  // lazy初期化で保存データを直接読む（mount後のload→saveの競合・上書きを防ぐ。TeamProviderと同方針）
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => loadMessages() ?? sampleMessages()
  );
  const [incomingDrill, setIncomingDrill] = useState<SavedDrill | null>(null);
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);
  // サッカーノート（選手提出）。全画面共通のため Board に保持
  const [notebook, setNotebook] = useState<NotebookEntry[]>(
    () => loadNotebook() ?? sampleNotebook()
  );
  useEffect(() => {
    saveNotebook(notebook);
  }, [notebook]);
  // コーチからの配信物（練習メニュー/個人課題/ミーティング/テスト）
  const [deliverables, setDeliverables] = useState<CoachDeliverable[]>(
    () => loadDeliverables() ?? sampleDeliverables()
  );
  useEffect(() => {
    saveDeliverables(deliverables);
  }, [deliverables]);
  const [pendingImport, setPendingImport] = useState<ShareSnapshot | null>(null);
  const libHydrated = useRef(false);
  // 最新のライブラリ／プラン／現在の戦術をコールバックから参照するためのミラー
  const stateLibRef = useRef<Library>(library);
  useEffect(() => {
    stateLibRef.current = library;
  }, [library]);
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const currentPlayIdRef = useRef(currentPlayId);
  useEffect(() => {
    currentPlayIdRef.current = currentPlayId;
  }, [currentPlayId]);
  const playerPwRef = useRef(playerPassword);
  useEffect(() => {
    playerPwRef.current = playerPassword;
  }, [playerPassword]);
  const matchesPublicRef = useRef(matchesPublic);
  useEffect(() => {
    matchesPublicRef.current = matchesPublic;
  }, [matchesPublic]);
  // 設定は明示的に保存（effectでの保存はStrictModeで初期値が競合するため）
  const persistSettings = useCallback(
    (next: {
      plan?: PlanTier;
      currentPlayId?: string | null;
      playerPassword?: string;
      matchesPublic?: boolean;
    }) => {
      saveSettings({
        plan: next.plan ?? planRef.current,
        currentPlayId:
          next.currentPlayId !== undefined
            ? next.currentPlayId
            : currentPlayIdRef.current,
        playerPassword:
          next.playerPassword !== undefined
            ? next.playerPassword
            : playerPwRef.current,
        matchesPublic:
          next.matchesPublic !== undefined
            ? next.matchesPublic
            : matchesPublicRef.current,
      });
    },
    []
  );

  useEffect(() => {
    const lib = loadLibrary();
    if (lib) setLibrary(lib);
    const st = loadSettings();
    if (st) {
      setPlanState(migratePlan(st.plan as string));
      setCurrentPlayId(st.currentPlayId ?? null);
      if (st.playerPassword) setPlayerPasswordState(st.playerPassword);
      if (typeof st.matchesPublic === "boolean") setMatchesPublicState(st.matchesPublic);
    }
    if (typeof window !== "undefined" && window.location.hash.startsWith("#p=")) {
      const snap = decodeSnapshot(window.location.hash.slice(3));
      if (snap) setPendingImport(snap);
    }
    libHydrated.current = true;
  }, []);
  useEffect(() => {
    if (libHydrated.current) saveLibrary(library);
  }, [library]);
  // 共有リンクで来たら確認シートを開く
  useEffect(() => {
    if (pendingImport) setSheet({ type: "importShared" });
  }, [pendingImport]);

  // ---- refs ----
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const tokenEls = useRef<Map<Actor, HTMLElement>>(new Map());
  const getPitchRect = useCallback(
    () => pitchRef.current?.getBoundingClientRect() ?? null,
    []
  );
  const registerToken = useCallback((actor: Actor, el: HTMLElement | null) => {
    if (el) tokenEls.current.set(actor, el);
    else tokenEls.current.delete(actor);
  }, []);

  // ---- playback ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const play = useRef({ t: 0, last: 0, raf: 0, playing: false, speed: 1 });
  const onTick = useRef<((t: number, total: number) => void) | null>(null);
  useEffect(() => {
    play.current.speed = speed;
  }, [speed]);

  const applyPlayhead = useCallback((t: number) => {
    const st = stateRef.current;
    const els = tokenEls.current;
    st.slots.forEach((_, i) => {
      const el = els.get(i);
      if (!el) return;
      const q = actorPos(i, t, st.moves, st.slots, st.ball);
      el.style.left = q.x + "%";
      el.style.top = 100 - q.y + "%";
    });
    const ballEl = els.get("ball");
    if (ballEl) {
      const q = actorPos("ball", t, st.moves, st.slots, st.ball);
      ballEl.style.left = q.x + "%";
      ballEl.style.top = 100 - q.y + "%";
    }
  }, []);

  const stopPlay = useCallback(() => {
    play.current.playing = false;
    cancelAnimationFrame(play.current.raf);
    setIsPlaying(false);
  }, []);

  const tick = useCallback(
    (ts: number) => {
      const p = play.current;
      if (!p.playing) return;
      if (!p.last) p.last = ts;
      const dt = ((ts - p.last) / 1000) * p.speed;
      p.last = ts;
      p.t += dt;
      const T = animTotal(stateRef.current.moves);
      if (p.t >= T) {
        p.t = T;
        applyPlayhead(T);
        onTick.current?.(T, T);
        stopPlay();
        return;
      }
      applyPlayhead(p.t);
      onTick.current?.(p.t, T);
      p.raf = requestAnimationFrame(tick);
    },
    [applyPlayhead, stopPlay]
  );

  const startPlay = useCallback(() => {
    if (!stateRef.current.moves.length) {
      showToast("まずピッチ上でルートをなぞってください");
      return;
    }
    const T = animTotal(stateRef.current.moves);
    if (play.current.t >= T) play.current.t = 0;
    play.current.playing = true;
    play.current.last = 0;
    setIsPlaying(true);
    play.current.raf = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const resetPlay = useCallback(() => {
    stopPlay();
    play.current.t = 0;
    applyPlayhead(0);
    onTick.current?.(0, animTotal(stateRef.current.moves));
  }, [stopPlay, applyPlayhead]);

  const seek = useCallback(
    (t: number) => {
      stopPlay();
      play.current.t = t;
      applyPlayhead(t);
      onTick.current?.(t, animTotal(stateRef.current.moves));
    },
    [stopPlay, applyPlayhead]
  );

  const enterFullplay = useCallback(() => {
    stopPlay();
    play.current.t = 0;
    applyPlayhead(0);
    setFullplay(true);
  }, [stopPlay, applyPlayhead]);

  const exitFullplay = useCallback(() => {
    stopPlay();
    setFullplay(false);
  }, [stopPlay]);

  // ---- toast ----
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 1800);
  }, []);

  // ---- studio open/close ----
  const openStudio = useCallback(() => {
    setShowPaths(true);
    setSelActor(null);
    play.current.t = 0;
    setMode("anim");
  }, []);
  const closeStudio = useCallback(() => {
    stopPlay();
    setFullplay(false);
    setSelActor(null);
    setTempDraw(null);
    setMode("edit");
  }, [stopPlay]);

  // ---- sheet ----
  const openSheet = useCallback((s: SheetState) => setSheet(s), []);
  const closeSheet = useCallback(() => setSheet({ type: null }), []);

  // ---- library / plan / share actions ----
  const cloneTactic = useCallback(() => {
    const s = stateRef.current;
    return {
      formation: s.formation,
      slots: s.slots.map((x) => ({ ...x })),
      ball: { ...s.ball },
      moves: s.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
    };
  }, []);

  const savePlay = useCallback(
    (title: string, folderId: string | null): boolean => {
      // 全プランで保存無制限・フォルダ利用可
      const play: SavedPlay = {
        id: newPid(),
        title: title.trim() || "無題の戦術",
        folderId,
        ...cloneTactic(),
        updatedAt: Date.now(),
      };
      setLibrary((lib) => ({ ...lib, plays: [play, ...lib.plays] }));
      setCurrentPlayId(play.id);
      persistSettings({ currentPlayId: play.id });
      showToast(`「${play.title}」を保存しました`);
      return true;
    },
    [cloneTactic, showToast, persistSettings]
  );

  const saveCurrent = useCallback(() => {
    if (!currentPlayId) {
      setSheet({ type: "save" });
      return;
    }
    const t = cloneTactic();
    setLibrary((lib) => ({
      ...lib,
      plays: lib.plays.map((p) =>
        p.id === currentPlayId ? { ...p, ...t, updatedAt: Date.now() } : p
      ),
    }));
    showToast("上書き保存しました");
  }, [currentPlayId, cloneTactic, showToast]);

  const loadPlay = useCallback(
    (id: string) => {
      const play = stateLibRef.current.plays.find((p) => p.id === id);
      if (!play) return;
      stopPlay();
      setMode("edit");
      setSelActor(null);
      dispatch({
        type: "LOAD_TACTIC",
        formation: play.formation,
        slots: play.slots.map((s) => ({ ...s })),
        ball: { ...play.ball },
        moves: play.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
      });
      setCurrentPlayId(id);
      persistSettings({ currentPlayId: id });
      setSheet({ type: null });
      setScreen("board");
      showToast(`「${play.title}」を読み込みました`);
    },
    [stopPlay, showToast, persistSettings]
  );

  // ---- チャット / メッセージ ----
  const snapshotPlay = useCallback(
    (title: string): SavedPlay => ({
      id: newPid(),
      title: title.trim() || "無題の戦術",
      folderId: null,
      ...cloneTactic(),
      updatedAt: Date.now(),
    }),
    [cloneTactic]
  );

  const sendMessage = useCallback(
    (msg: Omit<ChatMessage, "id" | "ts">) => {
      setMessages((list) => [
        ...list,
        { ...msg, id: newMsgId(), ts: Date.now() },
      ]);
      showToast("送信しました");
    },
    [showToast]
  );

  const removeMessage = useCallback((id: string) => {
    setMessages((list) => list.filter((m) => m.id !== id));
  }, []);

  const loadPlayData = useCallback(
    (play: SavedPlay) => {
      stopPlay();
      setMode("edit");
      setSelActor(null);
      dispatch({
        type: "LOAD_TACTIC",
        formation: play.formation,
        slots: play.slots.map((s) => ({ ...s })),
        ball: { ...play.ball },
        moves: play.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
      });
      setCurrentPlayId(null);
      setSheet({ type: null });
      setScreen("board");
      showToast(`「${play.title}」を表示しました`);
    },
    [stopPlay, showToast]
  );

  const openDrillData = useCallback(
    (drill: SavedDrill) => {
      setIncomingDrill(drill);
      setSheet({ type: null });
      setScreen("drill");
    },
    []
  );

  // ---- サッカーノート ----
  const addNote = useCallback(
    (entry: Omit<NotebookEntry, "id" | "ts">) => {
      const full = { ...entry, id: newNoteId(), ts: Date.now() } as NotebookEntry;
      setNotebook((list) => [full, ...list]);
      showToast("ノートを提出しました");
    },
    [showToast]
  );
  const updateNote = useCallback(
    (entry: NotebookEntry) => {
      setNotebook((list) => list.map((n) => (n.id === entry.id ? entry : n)));
      showToast("ノートを更新しました");
    },
    [showToast]
  );
  const deleteNote = useCallback((id: string) => {
    setNotebook((list) => list.filter((n) => n.id !== id));
  }, []);
  const setNoteComment = useCallback(
    (id: string, comment: string) => {
      setNotebook((list) =>
        list.map((n) =>
          n.id === id
            ? { ...n, staffComment: comment.trim() || undefined, staffCommentTs: Date.now() }
            : n
        )
      );
      showToast("コメントを送りました");
    },
    [showToast]
  );

  // ---- コーチからの配信物 ----
  const addDeliverable = useCallback(
    (data: Omit<CoachDeliverable, "id" | "ts">) => {
      const full = { ...data, id: newDeliverId(), ts: Date.now() } as CoachDeliverable;
      setDeliverables((list) => [full, ...list]);
      showToast("配信しました");
    },
    [showToast]
  );
  const updateDeliverable = useCallback((d: CoachDeliverable) => {
    setDeliverables((list) => list.map((x) => (x.id === d.id ? d : x)));
  }, []);
  const removeDeliverable = useCallback(
    (id: string) => {
      setDeliverables((list) => list.filter((x) => x.id !== id));
      showToast("削除しました");
    },
    [showToast]
  );
  const respondDeliverable = useCallback(
    (id: string, playerId: string, response: CoachDeliverable["responses"][string]) => {
      setDeliverables((list) =>
        list.map((d) =>
          d.id === id
            ? ({ ...d, responses: { ...d.responses, [playerId]: response } } as CoachDeliverable)
            : d
        )
      );
      showToast("回答を送信しました");
    },
    [showToast]
  );

  const deletePlay = useCallback(
    (id: string) => {
      setLibrary((lib) => ({
        ...lib,
        plays: lib.plays.filter((p) => p.id !== id),
      }));
      setCurrentPlayId((cur) => {
        const next = cur === id ? null : cur;
        persistSettings({ currentPlayId: next });
        return next;
      });
      showToast("削除しました");
    },
    [showToast, persistSettings]
  );

  const duplicatePlay = useCallback(
    (id: string) => {
      const src = stateLibRef.current.plays.find((p) => p.id === id);
      if (!src) return;
      const copy: SavedPlay = {
        ...src,
        id: newPid(),
        title: src.title + "（コピー）",
        slots: src.slots.map((s) => ({ ...s })),
        ball: { ...src.ball },
        moves: src.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
        updatedAt: Date.now(),
      };
      setLibrary((lib) => ({ ...lib, plays: [copy, ...lib.plays] }));
      showToast("複製しました");
    },
    [showToast]
  );

  const renamePlay = useCallback((id: string, title: string) => {
    setLibrary((lib) => ({
      ...lib,
      plays: lib.plays.map((p) =>
        p.id === id ? { ...p, title: title.trim() || p.title } : p
      ),
    }));
  }, []);

  const movePlayToFolder = useCallback(
    (id: string, folderId: string | null) => {
      setLibrary((lib) => ({
        ...lib,
        plays: lib.plays.map((p) => (p.id === id ? { ...p, folderId } : p)),
      }));
    },
    []
  );

  const newPlay = useCallback(() => {
    stopPlay();
    setMode("edit");
    setSelActor(null);
    dispatch({ type: "NEW_TACTIC", formation: stateRef.current.formation });
    setCurrentPlayId(null);
    persistSettings({ currentPlayId: null });
    setSheet({ type: null });
    showToast("新しい戦術を作成しました");
  }, [stopPlay, showToast, persistSettings]);

  const createFolder = useCallback(
    (name: string) => {
      const nm = name.trim();
      if (!nm) return;
      const folder: Folder = { id: newPid(), name: nm };
      setLibrary((lib) => ({ ...lib, folders: [...lib.folders, folder] }));
      showToast(`フォルダ「${nm}」を作成しました`);
    },
    [showToast]
  );

  const deleteFolder = useCallback((id: string) => {
    setLibrary((lib) => ({
      folders: lib.folders.filter((f) => f.id !== id),
      plays: lib.plays.map((p) =>
        p.folderId === id ? { ...p, folderId: null } : p
      ),
    }));
  }, []);

  const setPlan = useCallback(
    (t: PlanTier) => {
      setPlanState(t);
      persistSettings({ plan: t });
    },
    [persistSettings]
  );

  const setPlayerPassword = useCallback(
    (pw: string) => {
      setPlayerPasswordState(pw);
      persistSettings({ playerPassword: pw });
    },
    [persistSettings]
  );

  const setMatchesPublic = useCallback(
    (v: boolean) => {
      setMatchesPublicState(v);
      persistSettings({ matchesPublic: v });
      showToast(v ? "試合記録を選手に公開しました" : "試合記録を非公開にしました");
    },
    [persistSettings, showToast]
  );

  const buildShareSnapshot = useCallback((): ShareSnapshot => {
    const title =
      stateLibRef.current.plays.find((p) => p.id === currentPlayId)?.title ?? null;
    return buildSnapshot(stateRef.current, title);
  }, [currentPlayId]);

  const applyImport = useCallback(() => {
    if (!pendingImport) return;
    const b = snapshotToBoard(pendingImport);
    stopPlay();
    setMode("edit");
    setSelActor(null);
    dispatch({
      type: "IMPORT_SHARED",
      teamName: b.teamName,
      players: b.players,
      captain: b.captain,
      formation: b.formation,
      slots: b.slots,
      ball: b.ball,
      moves: b.moves,
    });
    setCurrentPlayId(null);
    persistSettings({ currentPlayId: null });
    setPendingImport(null);
    if (typeof window !== "undefined")
      history.replaceState(null, "", window.location.pathname);
    setSheet({ type: null });
    showToast("共有された戦術を読み込みました");
  }, [pendingImport, stopPlay, showToast, persistSettings]);

  // ---- action wrappers ----
  const value = useMemo<BoardContextValue>(
    () => ({
      state,
      setFormation: (key) => dispatch({ type: "SET_FORMATION", key }),
      assignPlayer: (slot, pid) => dispatch({ type: "ASSIGN", slot, pid }),
      removePlayer: (slot) => dispatch({ type: "REMOVE", slot }),
      swapSlots: (a, b) => dispatch({ type: "SWAP", a, b }),
      moveSlot: (slot, x, y, role) =>
        dispatch({ type: "MOVE_SLOT", slot, x, y, role }),
      setBall: (x, y) => dispatch({ type: "SET_BALL", x, y }),
      setCaptain: (pid) => dispatch({ type: "SET_CAPTAIN", pid }),
      addPlayer: (p) =>
        dispatch({ type: "ADD_PLAYER", player: { ...p, id: newPid() } }),
      createPlayer: (p) => {
        const id = newPid();
        dispatch({ type: "ADD_PLAYER", player: { ...p, id } });
        return id;
      },
      updatePlayer: (p) => dispatch({ type: "UPDATE_PLAYER", player: p }),
      deletePlayer: (id) => dispatch({ type: "DELETE_PLAYER", id }),
      setTeamName: (name) => dispatch({ type: "SET_TEAM_NAME", name }),
      resetPositions: () => dispatch({ type: "RESET_POSITIONS" }),
      addMove: (actor, path) => dispatch({ type: "ADD_MOVE", actor, path }),
      updateMove: (index, patch) =>
        dispatch({ type: "UPDATE_MOVE", index, patch }),
      deleteMove: (index) => dispatch({ type: "DELETE_MOVE", index }),
      clearMoves: () => dispatch({ type: "CLEAR_MOVES" }),
      undoMove: () => dispatch({ type: "UNDO_MOVE" }),
      mode,
      selActor,
      setSelActor,
      tempDrawRef,
      setTempDraw,
      subscribeTempDraw,
      openStudio,
      closeStudio,
      pitchRef,
      registerToken,
      getPitchRect,
      stateRef,
      isPlaying,
      speed,
      setSpeed,
      startPlay,
      stopPlay,
      resetPlay,
      seek,
      applyPlayhead,
      getTime: () => play.current.t,
      showPaths,
      setShowPaths,
      fullplay,
      enterFullplay,
      exitFullplay,
      onTick,
      sheet,
      openSheet,
      closeSheet,
      toast: showToast,
      toastMsg,
      toastOn,
      library,
      plan,
      setPlan,
      playerPassword,
      setPlayerPassword,
      matchesPublic,
      setMatchesPublic,
      drillIntent,
      setDrillIntent,
      messages,
      sendMessage,
      removeMessage,
      snapshotPlay,
      loadPlayData,
      incomingDrill,
      setIncomingDrill,
      openDrillData,
      notebook,
      addNote,
      updateNote,
      deleteNote,
      setNoteComment,
      deliverables,
      addDeliverable,
      updateDeliverable,
      removeDeliverable,
      respondDeliverable,
      currentPlayId,
      currentPlayTitle:
        library.plays.find((p) => p.id === currentPlayId)?.title ?? null,
      canSaveNew: true,
      savePlay,
      saveCurrent,
      loadPlay,
      deletePlay,
      duplicatePlay,
      renamePlay,
      movePlayToFolder,
      newPlay,
      createFolder,
      deleteFolder,
      buildShareSnapshot,
      pendingImport,
      applyImport,
      screen,
      setScreen,
      auth: session,
    }),
    [
      state,
      mode,
      selActor,
      isPlaying,
      speed,
      showPaths,
      fullplay,
      sheet,
      toastMsg,
      toastOn,
      openStudio,
      closeStudio,
      registerToken,
      getPitchRect,
      startPlay,
      stopPlay,
      resetPlay,
      seek,
      applyPlayhead,
      enterFullplay,
      exitFullplay,
      openSheet,
      closeSheet,
      showToast,
      library,
      plan,
      setPlan,
      playerPassword,
      setPlayerPassword,
      matchesPublic,
      setMatchesPublic,
      drillIntent,
      setDrillIntent,
      messages,
      sendMessage,
      removeMessage,
      snapshotPlay,
      loadPlayData,
      incomingDrill,
      openDrillData,
      notebook,
      addNote,
      updateNote,
      deleteNote,
      setNoteComment,
      deliverables,
      addDeliverable,
      updateDeliverable,
      removeDeliverable,
      respondDeliverable,
      currentPlayId,
      savePlay,
      saveCurrent,
      loadPlay,
      deletePlay,
      duplicatePlay,
      renamePlay,
      movePlayToFolder,
      newPlay,
      createFolder,
      deleteFolder,
      buildShareSnapshot,
      pendingImport,
      applyImport,
      screen,
      session,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
