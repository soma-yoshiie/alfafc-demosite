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
  BallTrajectory,
  BoardState,
  ChatMessage,
  CoachDeliverable,
  Folder,
  HullShape,
  Library,
  LinkShape,
  MenuResponse,
  Move,
  MoveKind,
  NotebookEntry,
  OppToken,
  PenStroke,
  Player,
  PitchViewMode,
  PlanTier,
  PlayLine,
  PlayPoint,
  Point,
  Position,
  SavedDrill,
  SavedPlay,
  SavedSetPiece,
  Session,
  ShareSnapshot,
  Shape,
  ShapePatch,
  Slot,
} from "@/lib/types";
import { groupThreadKey, isOppActor, migratePlan, oppIndex } from "@/lib/types";
import type { UserArticle } from "@/lib/articles";
import { daysAgoStr } from "@/lib/dates";
import { buildSlots, groupOf } from "@/lib/formations";
import type { AssignPair } from "@/lib/autoAssign";
import {
  actorPos,
  animTotal,
  carryPos,
  durFromPath,
  holderAt,
  stepAtTime,
  stepCountOf,
  stepDur,
  stepStartTime,
} from "@/lib/animation";
import { convexHull } from "@/lib/geometry";
import { topToY, yToTop } from "@/lib/pitchView";
import { benchOf, benchSizeOf, clampBenchSize, normalizeSquad, seedBenchIfMissing } from "@/lib/squad";
import {
  loadDeliverables,
  loadLibrary,
  loadMessages,
  loadNotebook,
  loadSetPieceWork,
  loadSettings,
  loadSpBarOpen,
  loadState,
  loadTeamLogo,
  loadUserArticles,
  saveDeliverables,
  saveLibrary,
  saveMessages,
  saveNotebook,
  saveSetPieceWork,
  saveSettings,
  saveSpBarOpen,
  saveState,
  saveTeamLogo,
  saveUserArticles,
} from "@/lib/storage";
import {
  buildSnapshot,
  decodeSnapshot,
  snapshotToBoard,
} from "@/lib/share";
import { SAMPLE_GROUP_A_ID, SAMPLE_PLAYERS, SAMPLE_TEAM_NAME } from "@/lib/sampleTeam";
import { buildSetPieceState, getSetPiecePreset } from "@/lib/setPiecePresets";
import {
  buildSetPieceLayout,
  DEFAULT_SETPIECE_LAYOUT_INPUT,
  type SetPieceLayout,
  type SetPieceLayoutInput,
} from "@/lib/setPieceLayouts";
import { buildDeliveryMove, getDelivery } from "@/lib/setPieceDelivery";

/* ------------------------------------------------------------------ */
/* Reducer                                                            */
/* ------------------------------------------------------------------ */

type Action =
  | { type: "HYDRATE"; state: BoardState }
  | { type: "SET_FORMATION"; key: string }
  | { type: "ASSIGN"; slot: number; pid: string }
  | { type: "REMOVE"; slot: number }
  /** groups-phase2 §2-1: 自動配置の一括反映。空き枠へまとめてASSIGNするのと同じ規則
   * （同じpidが他の枠に居れば先に外す）だが1回のdispatchで済ませる */
  | { type: "ASSIGN_MANY"; pairs: AssignPair[] }
  /** 自動配置結果の「元に戻す」用。各枠のpidがpairsのpidと一致する枠だけnullへ戻す */
  | { type: "UNASSIGN_MANY"; pairs: AssignPair[] }
  /** board-squad-and-pc-polish §2-1: ベンチの枠数を変更する。縮めて溢れた分は
   * normalizeSquad が末尾からメンバー外へ落とす */
  | { type: "SET_BENCH_SIZE"; size: number }
  /** メンバー外の選手をベンチへ入れる（枠が満杯なら何もしない。満員判定はAPI側=benchAdd で行う） */
  | { type: "BENCH_ADD"; pid: string }
  /** ベンチの選手をメンバー外へ出す */
  | { type: "BENCH_REMOVE"; pid: string }
  | { type: "SWAP"; a: number; b: number }
  | { type: "MOVE_SLOT"; slot: number; x: number; y: number; role: Position }
  | { type: "SET_BALL"; x: number; y: number }
  | { type: "SET_HOLDER"; holder: Actor | null }
  | { type: "SET_CAPTAIN"; pid: string | null }
  | { type: "ADD_PLAYER"; player: Player }
  | { type: "UPDATE_PLAYER"; player: Player }
  | { type: "DELETE_PLAYER"; id: string }
  | { type: "SET_TEAM_NAME"; name: string }
  /** playState（戦術ボード）側の名簿変更を第2文書スロット（spState）へ反映する。
   * スロットのpidはそのまま：players配列とteamName/captainのみ差し替える */
  | { type: "SYNC_ROSTER"; players: Player[]; teamName: string | null; captain: string | null }
  | { type: "RESET_POSITIONS" }
  | {
      type: "ADD_MOVE";
      actor: Actor;
      path: Point[];
      step: number;
      /** 未指定は従来どおり0（パス/シュート生成時のみ出し手のルート終了オフセットを渡す） */
      start?: number;
      /** 未指定は従来どおり durFromPath(path) */
      dur?: number;
      /** 未指定は従来どおり defaultKind(actor)（パス/シュート生成時のみ指定） */
      kind?: MoveKind;
      /** ボールmoveの到達先（パス/シュート生成時のみ指定） */
      to?: Actor | "goal";
      /** trueのときはtoをundefinedであっても明示的に上書きする（レビュー指摘(1回目):
       * セットプレーの軌道で狙う場所を誰も居ない所へ動かしたとき、前回のtoを消して
       * 「受け手なし」に戻すために必要。指定なしは従来どおりtoが未指定なら既存値を温存する） */
      toSet?: boolean;
      /** ボールの弾道（セットプレーの軌道生成時のみ指定。setpiece-redesign §4） */
      trajectory?: BallTrajectory;
    }
  | { type: "MERGE_MOVES"; moves: Move[]; step: number }
  | { type: "UPDATE_MOVE"; index: number; patch: Partial<Move> }
  | { type: "DELETE_MOVE"; index: number }
  | { type: "CLEAR_MOVES" }
  | { type: "UNDO_MOVE" }
  | { type: "ADD_STEP" }
  | { type: "DELETE_STEP"; step: number }
  | { type: "ADD_OPPONENT"; x: number; y: number }
  | { type: "MOVE_OPPONENT"; index: number; x: number; y: number }
  | { type: "UPDATE_OPPONENT"; index: number; label: string }
  | { type: "DELETE_OPPONENT"; index: number }
  | { type: "TRANSLATE_ACTOR"; actor: Actor; dx: number; dy: number }
  | { type: "ADD_STROKE"; stroke: PenStroke }
  | { type: "UPDATE_STROKE"; id: string; patch: Partial<Pick<PenStroke, "color" | "width" | "dash">> }
  | { type: "DELETE_STROKE"; id: string }
  | { type: "UNDO_STROKE" }
  | { type: "CLEAR_STROKES"; step: number | null }
  | { type: "ADD_SHAPE"; shape: Shape }
  | { type: "UPDATE_SHAPE"; id: string; patch: ShapePatch }
  | { type: "DELETE_SHAPE"; id: string }
  | { type: "SET_GUIDES"; patch: Partial<{ lanes: boolean; zones: boolean; legend: boolean }> }
  | { type: "SET_PITCH_VIEW"; view: PitchViewMode }
  | {
      type: "LOAD_TACTIC";
      formation: string;
      slots: Slot[];
      ball: Point;
      moves: Move[];
      holder: Actor | null;
      opponents: OppToken[];
      drawings: PenStroke[];
      shapes: Shape[];
      stepCount: number;
      guides: BoardState["guides"];
      pitchView: PitchViewMode;
      /** セットプレー文書の読込時のみ指定。未指定＝既存呼び出しどおり setPiece は undefined になる */
      setPiece?: BoardState["setPiece"];
    }
  | { type: "NEW_TACTIC"; formation: string }
  /** 左右反転（セットプレーデザイン用）。slots/opponents/ball/moves/shapes の x座標を 100-x へ変換する */
  | { type: "FLIP_X" }
  | {
      type: "IMPORT_SHARED";
      teamName: string | null;
      players: Player[];
      captain: string | null;
      formation: string;
      slots: Slot[];
      ball: Point;
      moves: Move[];
      holder: Actor | null;
      opponents: OppToken[];
      drawings: PenStroke[];
      shapes: Shape[];
      stepCount: number;
      guides: BoardState["guides"];
      pitchView: PitchViewMode;
      /** セットプレー文書への共有取込時のみ指定。未指定＝従来どおり setPiece は undefined になる */
      setPiece?: BoardState["setPiece"];
    };

function makeInitial(): BoardState {
  const slots = buildSlots("4-3-3");
  SAMPLE_PLAYERS.slice(0, slots.length).forEach((p, i) => {
    slots[i].pid = p.id;
  });
  // board-squad-and-pc-polish §2-1: 初回シードもスタメン以外を名簿順にbenchSize人ベンチへ
  // 入れる規則を、旧データの補完（seedBenchIfMissing）と共通化する
  return seedBenchIfMissing({
    teamName: SAMPLE_TEAM_NAME,
    formation: "4-3-3",
    slots,
    players: SAMPLE_PLAYERS,
    ball: { x: 50, y: 42 },
    moves: [],
    captain: "p08",
    holder: null,
    opponents: [],
    drawings: [],
    shapes: [],
    stepCount: 1,
    guides: {},
    pitchView: "full",
  });
}

/** 旧データ（opponents/drawings/shapes/step/guides/pitchView なし）を現行形式へ補完 */
function normalizeBoard(state: BoardState): BoardState {
  const moves = (state.moves ?? []).map((m) => ({
    ...m,
    step: m.step ?? 0,
    kind: m.kind ?? (m.actor === "ball" ? ("pass" as const) : ("run" as const)),
  }));
  // 旧データに残る spotlight 図形（Phase1b で削除された種別）は無視する
  const shapes = (state.shapes ?? []).filter(
    (s) => (s as { kind?: string }).kind !== "spotlight"
  );
  // 旧データ（idなし）のストロークにも選択・削除用のIDを補完する
  const drawings = (state.drawings ?? []).map((d) =>
    d.id ? d : { ...d, id: newStrokeId() }
  );
  const next = {
    ...state,
    moves,
    opponents: state.opponents ?? [],
    drawings,
    shapes,
    stepCount: stepCountOf(moves, state.stepCount),
    guides: state.guides ?? {},
    pitchView: state.pitchView ?? "full",
  };
  // board-squad-and-pc-polish §2-1: 旧データ（benchIds未定義）の1度きりの補完はここ1箇所で行う。
  // HYDRATE／LOAD_TACTIC／IMPORT_SHARED いずれもこの関数を通るため、読込経路すべてで
  // ベンチの整合（スタメンとの重複・存在しないid・枠超過）も併せて取る
  return normalizeSquad(seedBenchIfMissing(next));
}

/** 既定の線種（ボール=パス / それ以外=ラン） */
function defaultKind(actor: Actor): MoveKind {
  return actor === "ball" ? "pass" : "run";
}

/** actor（ball以外）の現在のベース座標（slots/opponents）。見つからなければ null */
function actorBasePos(state: BoardState, actor: Actor): Point | null {
  if (actor === "ball") return null;
  if (typeof actor === "number") {
    const s = state.slots[actor];
    return s ? { x: s.x, y: s.y } : null;
  }
  const o = (state.opponents ?? [])[oppIndex(actor)];
  return o ? { x: o.x, y: o.y } : null;
}

/** actor の表示名（パス/シュート生成のtoast用） */
function actorDisplayName(state: BoardState, actor: Actor): string {
  if (actor === "ball") return "ボール";
  if (isOppActor(actor)) {
    const o = (state.opponents ?? [])[oppIndex(actor)];
    return o ? `相手${o.label}` : "相手";
  }
  const s = state.slots[actor];
  const p = s?.pid ? state.players.find((pl) => pl.id === s.pid) : null;
  return p?.name ?? "選手";
}

/** holder が非null なら ball 座標を holder の現在位置＋前方オフセットへ同期する（保持なしは何もしない） */
function syncCarriedBall(state: BoardState): BoardState {
  if (state.holder == null) return state;
  const p = actorBasePos(state, state.holder);
  if (!p) return state;
  return { ...state, ball: carryPos(p) };
}

function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "HYDRATE":
      return normalizeBoard(action.state);

    case "SET_FORMATION": {
      const slots = buildSlots(action.key, state.slots);
      // レビュー指摘(1回目): 枠が減って弾き出されたスタメンは、REMOVE/UNASSIGN_MANYと同じ
      // 規則（ベンチに空きがあれば末尾へ、無ければメンバー外）で扱う。buildSlotsは新しい
      // 枠数を超えるslotをそのまま切り捨てるため、その分のpidをここで拾う
      const keptPids = new Set(slots.map((s) => s.pid).filter((x): x is string => !!x));
      const droppedPids = state.slots
        .map((s) => s.pid)
        .filter((pid): pid is string => !!pid && !keptPids.has(pid));
      let benchIds = state.benchIds;
      if (droppedPids.length && benchIds && !state.setPiece) {
        const size = benchSizeOf(state);
        for (const pid of droppedPids) {
          if (benchIds.length >= size) break;
          benchIds = [...benchIds, pid];
        }
      }
      return normalizeSquad({ ...state, formation: action.key, slots, benchIds });
    }

    case "ASSIGN": {
      const slots = state.slots.map((s) => ({ ...s }));
      // 既に他の枠にいる場合は外す
      slots.forEach((s) => {
        if (s.pid === action.pid) s.pid = null;
      });
      // board-squad-and-pc-polish §2-1: 出る選手（枠に元々居た選手）の行き先を、
      // 入る選手がベンチ出身かメンバー外出身かで分ける
      const outgoing = state.slots[action.slot]?.pid ?? null;
      slots[action.slot].pid = action.pid;
      let benchIds = state.benchIds;
      if (benchIds && !state.setPiece) {
        const idx = benchIds.indexOf(action.pid);
        if (idx >= 0) {
          // 入る選手がベンチに居た場合：出る選手はその同じベンチ枠に入る（無ければ空きが増える）
          benchIds = outgoing
            ? benchIds.map((id, i) => (i === idx ? outgoing : id))
            : benchIds.filter((id) => id !== action.pid);
        } else if (outgoing && benchIds.length < benchSizeOf(state)) {
          // メンバー外から入った場合：出る選手はベンチに空きがあれば末尾へ（無ければメンバー外）
          benchIds = [...benchIds, outgoing];
        }
      }
      return normalizeSquad({ ...state, slots, benchIds });
    }

    case "REMOVE": {
      const removedPid = state.slots[action.slot]?.pid ?? null;
      const slots = state.slots.map((s) => ({ ...s }));
      slots[action.slot].pid = null;
      // board-squad-and-pc-polish §2-1: 外した選手はベンチに空きがあれば末尾へ、
      // 無ければ何もしない（=メンバー外に現れる）
      let benchIds = state.benchIds;
      if (removedPid && benchIds && !state.setPiece && benchIds.length < benchSizeOf(state)) {
        benchIds = [...benchIds, removedPid];
      }
      // 外した slot が保持者なら保持解除する
      return normalizeSquad({
        ...state,
        slots,
        benchIds,
        holder: state.holder === action.slot ? null : state.holder,
      });
    }

    case "ASSIGN_MANY": {
      const slots = state.slots.map((s) => ({ ...s }));
      const pids = new Set(action.pairs.map((pr) => pr.pid));
      // ASSIGNと同じ規則（既に他の枠に居れば外す）をpairsぶんまとめて適用してから配置する
      slots.forEach((s) => {
        if (s.pid && pids.has(s.pid)) s.pid = null;
      });
      action.pairs.forEach(({ slot, pid }) => {
        slots[slot].pid = pid;
      });
      // 対象は空き枠だけ（groups-phase2 §2-1）＝出る選手は発生しないため、
      // 枠に入った選手をベンチから外すだけでよい
      const benchIds = state.benchIds?.filter((id) => !pids.has(id));
      return normalizeSquad({ ...state, slots, benchIds });
    }

    case "UNASSIGN_MANY": {
      const slots = state.slots.map((s) => ({ ...s }));
      let holder = state.holder;
      let benchIds = state.benchIds;
      const size = benchSizeOf(state);
      action.pairs.forEach(({ slot, pid }) => {
        // その枠が今もpairsのpidを保持している場合だけ戻す（戻すまでの間に手動で
        // 変更された枠は上書きしない）
        if (slots[slot] && slots[slot].pid === pid) {
          slots[slot].pid = null;
          if (holder === slot) holder = null;
          // REMOVEと同じ規則：ベンチに空きがあれば末尾へ（無ければメンバー外）
          if (benchIds && !state.setPiece && benchIds.length < size) {
            benchIds = [...benchIds, pid];
          }
        }
      });
      return normalizeSquad({ ...state, slots, holder, benchIds });
    }

    case "SWAP": {
      const slots = state.slots.map((s) => ({ ...s }));
      const t = slots[action.a].pid;
      slots[action.a].pid = slots[action.b].pid;
      slots[action.b].pid = t;
      return syncCarriedBall({ ...state, slots });
    }

    case "MOVE_SLOT": {
      const slots = state.slots.map((s) => ({ ...s }));
      slots[action.slot] = {
        ...slots[action.slot],
        x: action.x,
        y: action.y,
        role: action.role,
      };
      return syncCarriedBall({ ...state, slots });
    }

    case "SET_BALL": {
      const ball = { x: action.x, y: action.y };
      // ボールのトークンを動かしたら軌道の始点も追従する（moveのpathの先頭をballに
      // 合わせて2次ベジェを作り直す。狙う場所・軌道・曲がりは維持する＝setpiece-redesign §4）
      const delivery = state.setPiece ? getDelivery(state) : null;
      if (!delivery) return { ...state, ball };
      const idx = state.moves.findIndex((m) => m.actor === "ball" && (m.step ?? 0) === 0);
      if (idx < 0) return { ...state, ball };
      const rebuilt = buildDeliveryMove({
        from: ball,
        target: delivery.target,
        trajectory: delivery.trajectory,
        bend: delivery.bend,
        slots: state.slots,
      });
      const moves = state.moves.map((m, i) => (i === idx ? rebuilt : m));
      return { ...state, ball, moves };
    }

    case "SET_HOLDER":
      return syncCarriedBall({ ...state, holder: action.holder });

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
      // 削除した選手のidはnormalizeSquadが players から消えたことで自動的にbenchIdsからも除く
      return normalizeSquad({
        ...state,
        players: state.players.filter((p) => p.id !== action.id),
        slots,
        captain: state.captain === action.id ? null : state.captain,
      });
    }

    case "SET_TEAM_NAME":
      return { ...state, teamName: action.name || null };

    case "SYNC_ROSTER":
      // playState側の名簿変更をspStateへ反映する経路（setPiece定義済み＝ベンチ概念なし）。
      // normalizeSquadはsetPiece定義済みを素通しするため、通しても安全
      return normalizeSquad({
        ...state,
        players: action.players,
        teamName: action.teamName,
        captain: action.captain,
      });

    case "SET_BENCH_SIZE": {
      if (state.setPiece) return state;
      return normalizeSquad({ ...state, benchSize: clampBenchSize(action.size) });
    }

    case "BENCH_ADD": {
      if (state.setPiece) return state;
      const benchIds = state.benchIds ?? [];
      if (benchIds.includes(action.pid)) return state;
      // レビュー指摘(1回目): 満杯判定はAPI層(benchAdd)のstateRef.current頼みで、同一tick内で
      // 連続dispatchされると2回とも通過してしまう。仕様§2-1どおり reducer 側でも「枠が満杯なら
      // 何もしない」を保証し、素通りでも normalizeSquad の後付けの切り捨てに頼らないようにする
      if (benchIds.length >= benchSizeOf(state)) return state;
      return normalizeSquad({ ...state, benchIds: [...benchIds, action.pid] });
    }

    case "BENCH_REMOVE": {
      if (state.setPiece) return state;
      const benchIds = (state.benchIds ?? []).filter((id) => id !== action.pid);
      return normalizeSquad({ ...state, benchIds });
    }

    case "RESET_POSITIONS":
      return { ...state, slots: buildSlots(state.formation, state.slots) };

    case "ADD_MOVE": {
      // 1アクター1場面につき1ルート：同じ場面の同じアクターは描き直し＝置換
      // start/kind/to は明示指定があるときだけ上書きする（通常のルート描き直しでは既存値を温存）
      const dur = action.dur ?? durFromPath(action.path);
      const idx = state.moves.findIndex(
        (m) => m.actor === action.actor && (m.step ?? 0) === action.step
      );
      let moves: Move[];
      if (idx >= 0) {
        moves = state.moves.map((m, i) =>
          i === idx
            ? {
                ...m,
                path: action.path,
                dur,
                ...(action.start !== undefined ? { start: action.start } : {}),
                ...(action.kind !== undefined ? { kind: action.kind } : {}),
                // toSet指定時はtoがundefinedでも明示的に上書きする（狙う場所を誰も居ない所へ
                // 動かしたら受け手なしに戻す＝レビュー指摘(1回目)。未指定時は従来どおり温存）
                ...(action.toSet || action.to !== undefined ? { to: action.to } : {}),
                ...(action.trajectory !== undefined ? { trajectory: action.trajectory } : {}),
              }
            : m
        );
      } else {
        moves = [
          ...state.moves,
          {
            actor: action.actor,
            path: action.path,
            start: action.start ?? 0,
            dur,
            step: action.step,
            kind: action.kind ?? defaultKind(action.actor),
            to: action.to,
            trajectory: action.trajectory,
          },
        ];
      }
      return {
        ...state,
        moves,
        stepCount: Math.max(state.stepCount ?? 1, action.step + 1),
      };
    }

    case "MERGE_MOVES": {
      // 生成シーンの一括適用：指定場面内の同actorルートは置換、それ以外は温存
      const incoming = new Set(action.moves.map((m) => m.actor));
      const moves = [
        ...state.moves.filter(
          (m) => (m.step ?? 0) !== action.step || !incoming.has(m.actor)
        ),
        ...action.moves.map((m) => ({
          ...m,
          step: action.step,
          kind: m.kind ?? defaultKind(m.actor),
        })),
      ];
      return {
        ...state,
        moves,
        stepCount: Math.max(state.stepCount ?? 1, action.step + 1),
      };
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
      // 場面ごと消えるため、場面限定の描き込み・図形は全場面共通として残す
      return {
        ...state,
        moves: [],
        stepCount: 1,
        drawings: (state.drawings ?? []).map((d) =>
          d.step != null ? { ...d, step: undefined } : d
        ),
        shapes: (state.shapes ?? []).map((sh) =>
          sh.step != null ? { ...sh, step: undefined } : sh
        ),
      };

    case "UNDO_MOVE":
      return { ...state, moves: state.moves.slice(0, -1) };

    case "ADD_STEP":
      return {
        ...state,
        stepCount: stepCountOf(state.moves, state.stepCount) + 1,
      };

    case "DELETE_STEP": {
      // 場面ごと削除：その場面のルート・場面限定の描き込み・図形を消し、後続場面を繰り上げ
      const moves = state.moves
        .filter((m) => (m.step ?? 0) !== action.step)
        .map((m) =>
          (m.step ?? 0) > action.step ? { ...m, step: (m.step ?? 0) - 1 } : m
        );
      const drawings = (state.drawings ?? [])
        .filter((d) => d.step == null || d.step !== action.step)
        .map((d) =>
          d.step != null && d.step > action.step ? { ...d, step: d.step - 1 } : d
        );
      const shapes = (state.shapes ?? [])
        .filter((sh) => sh.step == null || sh.step !== action.step)
        .map((sh) =>
          sh.step != null && sh.step > action.step ? { ...sh, step: sh.step - 1 } : sh
        );
      return {
        ...state,
        moves,
        drawings,
        shapes,
        stepCount: Math.max(1, stepCountOf(state.moves, state.stepCount) - 1),
      };
    }

    case "ADD_OPPONENT": {
      const opponents = [...(state.opponents ?? [])];
      opponents.push({
        x: action.x,
        y: action.y,
        label: String(opponents.length + 1),
      });
      return { ...state, opponents };
    }

    case "MOVE_OPPONENT": {
      const opponents = (state.opponents ?? []).map((o, i) =>
        i === action.index ? { ...o, x: action.x, y: action.y } : o
      );
      return { ...state, opponents };
    }

    case "UPDATE_OPPONENT": {
      const opponents = (state.opponents ?? []).map((o, i) =>
        i === action.index ? { ...o, label: action.label } : o
      );
      return { ...state, opponents };
    }

    case "DELETE_OPPONENT": {
      // moves の opp インデックス参照を詰め替える
      const opponents = (state.opponents ?? []).filter(
        (_, i) => i !== action.index
      );
      const moves = state.moves
        .filter((m) => !(isOppActor(m.actor) && oppIndex(m.actor) === action.index))
        .map((m) => {
          if (isOppActor(m.actor) && oppIndex(m.actor) > action.index) {
            return { ...m, actor: `opp${oppIndex(m.actor) - 1}` as Actor };
          }
          return m;
        });
      // shapes（link/hull）の opp インデックス参照も同じルールで詰め替える。
      // 削除された opp を参照する actor は除去し、それにより人数不足になった図形は消す
      const remapActor = (a: Actor): Actor | null => {
        if (!isOppActor(a)) return a;
        const oi = oppIndex(a);
        if (oi === action.index) return null;
        return oi > action.index ? (`opp${oi - 1}` as Actor) : a;
      };
      const shapes = (state.shapes ?? [])
        .map((sh): Shape | null => {
          if (sh.kind === "link" || sh.kind === "hull") {
            const actors = sh.actors
              .map(remapActor)
              .filter((a): a is Actor => a != null);
            const minCount = sh.kind === "link" ? 2 : 3;
            return actors.length < minCount ? null : { ...sh, actors };
          }
          return sh;
        })
        .filter((sh): sh is Shape => sh != null);
      // holder（保持者）の opp インデックス参照も同じルールで詰め替える
      const holder = state.holder != null ? remapActor(state.holder) : state.holder;
      return { ...state, opponents, moves, shapes, holder };
    }

    case "TRANSLATE_ACTOR": {
      // アニメ編集中の「移動」：ベース位置とその選手の全ルートを平行移動する
      const cl = (v: number) => Math.max(2, Math.min(98, v));
      const shift = (p: Point): Point => ({
        x: cl(p.x + action.dx),
        y: cl(p.y + action.dy),
      });
      const moves = state.moves.map((m) =>
        m.actor === action.actor ? { ...m, path: m.path.map(shift) } : m
      );
      if (action.actor === "ball") {
        // アニメ中のボール単体の移動ツール操作は従来どおり（保持追従の対象外）
        return { ...state, moves, ball: shift(state.ball) };
      }
      if (isOppActor(action.actor)) {
        const idx = oppIndex(action.actor);
        const opponents = (state.opponents ?? []).map((o, i) =>
          i === idx ? { ...o, ...shift(o) } : o
        );
        return syncCarriedBall({ ...state, moves, opponents });
      }
      const slots = state.slots.map((s, i) =>
        i === action.actor ? { ...s, ...shift(s) } : s
      );
      return syncCarriedBall({ ...state, moves, slots });
    }

    case "ADD_STROKE":
      return {
        ...state,
        drawings: [...(state.drawings ?? []), action.stroke],
      };

    case "UPDATE_STROKE":
      return {
        ...state,
        drawings: (state.drawings ?? []).map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d
        ),
      };

    case "DELETE_STROKE":
      return {
        ...state,
        drawings: (state.drawings ?? []).filter((d) => d.id !== action.id),
      };

    case "UNDO_STROKE":
      return { ...state, drawings: (state.drawings ?? []).slice(0, -1) };

    case "CLEAR_STROKES":
      // 見えている描き込みだけ消す：全場面共通＋（アニメ中は）現在の場面のもの。
      // 他の場面に紐づく描き込みは残す。
      return {
        ...state,
        drawings: (state.drawings ?? []).filter(
          (d) => d.step != null && d.step !== action.step
        ),
      };

    case "ADD_SHAPE":
      return {
        ...state,
        shapes: [...(state.shapes ?? []), action.shape],
      };

    case "UPDATE_SHAPE":
      return {
        ...state,
        shapes: (state.shapes ?? []).map((s) =>
          s.id === action.id ? ({ ...s, ...action.patch } as Shape) : s
        ),
      };

    case "DELETE_SHAPE":
      return {
        ...state,
        shapes: (state.shapes ?? []).filter((s) => s.id !== action.id),
      };

    case "SET_GUIDES":
      return { ...state, guides: { ...(state.guides ?? {}), ...action.patch } };

    case "SET_PITCH_VIEW":
      return { ...state, pitchView: action.view };

    case "LOAD_TACTIC":
      return normalizeBoard({
        ...state,
        formation: action.formation,
        slots: action.slots,
        ball: action.ball,
        moves: action.moves,
        holder: action.holder,
        opponents: action.opponents,
        drawings: action.drawings,
        shapes: action.shapes,
        stepCount: action.stepCount,
        guides: action.guides ?? {},
        pitchView: action.pitchView ?? "full",
        setPiece: action.setPiece,
      });

    case "FLIP_X": {
      const flipX = (p: Point): Point => ({ x: 100 - p.x, y: p.y });
      const slots = state.slots.map((s) => ({ ...s, x: 100 - s.x }));
      const opponents = (state.opponents ?? []).map((o) => ({ ...o, x: 100 - o.x }));
      const ball = flipX(state.ball);
      const moves = state.moves.map((m) => ({ ...m, path: m.path.map(flipX) }));
      const shapes = (state.shapes ?? []).map((sh): Shape => {
        if (sh.kind === "zoneEllipse" || sh.kind === "zoneRect" || sh.kind === "text") {
          return { ...sh, x: 100 - sh.x };
        }
        if (sh.kind === "arrow") {
          return { ...sh, p0: flipX(sh.p0), p1: flipX(sh.p1), c: flipX(sh.c) };
        }
        // link/hull: 座標は持たず選手/相手の参照（actors）のみのため反転不要
        return sh;
      });
      const drawings = (state.drawings ?? []).map((d) => ({ ...d, path: d.path.map(flipX) }));
      // FK/スローインの起点(origin)も左右反転する（そのまま残すと、この後の人数・攻守
      // 切替の作り直しで反転前の位置に戻ってしまう＝setpiece-redesign §3）
      const setPiece =
        state.setPiece && state.setPiece.origin
          ? { ...state.setPiece, origin: flipX(state.setPiece.origin) }
          : state.setPiece;
      return { ...state, slots, opponents, ball, moves, shapes, drawings, setPiece };
    }

    case "NEW_TACTIC":
      return {
        ...state,
        formation: action.formation,
        slots: buildSlots(action.formation),
        ball: { x: 50, y: 42 },
        moves: [],
        holder: null,
        opponents: [],
        drawings: [],
        shapes: [],
        stepCount: 1,
        guides: state.guides ?? {},
        pitchView: state.pitchView ?? "full",
      };

    case "IMPORT_SHARED":
      return normalizeBoard({
        ...state,
        teamName: action.teamName,
        players: action.players,
        captain: action.captain,
        formation: action.formation,
        slots: action.slots,
        ball: action.ball,
        moves: action.moves,
        holder: action.holder,
        opponents: action.opponents,
        drawings: action.drawings,
        shapes: action.shapes,
        stepCount: action.stepCount,
        guides: action.guides ?? {},
        pitchView: action.pitchView ?? "full",
        setPiece: action.setPiece,
      });

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
  | "oppMenu"
  | "kpi"
  | "stat"
  /** board-squad-and-pc-polish §2-4: 戦術ボードの現在のメンバーを試合予定へ登録する（スタッフのみ） */
  | "squadToEvent"
  | null;

/** コーチ・ダッシュボードのサマリーカードから選手別内訳を開く際の対象指標 */
export type KpiMetric = "attendance" | "notesWeek" | "uncommented" | "solo";

/** PCホームのチームスタッツカードから内訳を開く際の対象指標 */
export type StatMetric = "record" | "shot" | "pass" | "dribble";

export interface SheetState {
  type: SheetType;
  slot?: number;
  /** oppMenu: 対象の相手トークン index */
  opp?: number;
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
  /** kpi: 表示対象の指標 */
  kpiMetric?: KpiMetric;
  /** stat: 表示対象の指標 */
  statMetric?: StatMetric;
}

/** アプリの画面。レール項目の key と一致させる（ConsoleShell のサブナビ anchor もこの型） */
export type ScreenName =
  | "home"
  | "coaching"
  | "board"
  | "setpiece"
  | "drill"
  | "team"
  | "chat"
  | "notebook"
  | "library"
  | "articles"
  | "settings"
  /** 「その他」ハブ（新設・スマホ専用。mobile-redesign-v2 §2）。PCレールには出さない */
  | "other";

interface BoardContextValue {
  state: BoardState;
  // actions
  setFormation: (key: string) => void;
  assignPlayer: (slot: number, pid: string) => void;
  removePlayer: (slot: number) => void;
  /** groups-phase2 §2-1: 自動配置の一括反映（1回のdispatchで複数枠に配置） */
  assignMany: (pairs: AssignPair[]) => void;
  /** 自動配置結果の「元に戻す」。各枠のpidがpairsのpidと一致する枠だけ空きに戻す */
  unassignMany: (pairs: AssignPair[]) => void;
  /** board-squad-and-pc-polish §2-1: ベンチの枠数を変更する（0〜20。縮めて溢れた分はメンバー外へ） */
  setBenchSize: (n: number) => void;
  /** メンバー外の選手をベンチへ入れる。枠が満杯なら何もせずtoastで知らせる */
  benchAdd: (pid: string) => void;
  /** ベンチの選手をメンバー外へ出す */
  benchRemove: (pid: string) => void;
  swapSlots: (a: number, b: number) => void;
  moveSlot: (slot: number, x: number, y: number, role: Position) => void;
  setBall: (x: number, y: number) => void;
  /** ボールの保持者を設定/解除する（reducer側で ball 座標も前方位置へ同期） */
  setHolder: (holder: Actor | null) => void;
  setCaptain: (pid: string | null) => void;
  addPlayer: (p: Omit<Player, "id">) => void;
  /** 選手を追加し、生成したIDを返す */
  createPlayer: (p: Omit<Player, "id">) => string;
  updatePlayer: (p: Player) => void;
  deletePlayer: (id: string) => void;
  setTeamName: (name: string) => void;
  resetPositions: () => void;
  /** 現在の場面へルートを追加（同場面・同アクターは置換） */
  addMove: (actor: Actor, path: Point[]) => void;
  /** 生成シーンなど複数ルートの一括適用（現在の場面へ・同actorは置換） */
  mergeMoves: (moves: Move[]) => void;
  updateMove: (index: number, patch: Partial<Move>) => void;
  deleteMove: (index: number) => void;
  clearMoves: () => void;
  undoMove: () => void;
  // 場面（ステップ）
  activeStep: number;
  setActiveStep: (s: number) => void;
  /** 場面数（moves から導出・最低1） */
  stepCount: number;
  /** 新しい場面を追加して選択 */
  addStep: () => void;
  /** 場面を削除（中のルートごと） */
  removeStep: (s: number) => void;
  /** 指定場面だけ再生 */
  playStep: (s: number) => void;
  // 相手チームトークン
  addOpponent: () => void;
  moveOpponent: (index: number, x: number, y: number) => void;
  updateOpponentLabel: (index: number, label: string) => void;
  deleteOpponent: (index: number) => void;
  // フリーハンドペン
  penMode: boolean;
  setPenMode: (v: boolean) => void;
  /** ペン設定（新しいストロークに適用） */
  penColor: string;
  setPenColor: (c: string) => void;
  penWidth: number;
  setPenWidth: (w: number) => void;
  penDash: boolean;
  setPenDash: (v: boolean) => void;
  /** 新しい描き込みの表示範囲：全場面共通 / 現在の場面のみ（アニメ中のみ有効） */
  penScope: "all" | "step";
  setPenScope: (s: "all" | "step") => void;
  /** 盤面が現在表示している場面（再生・シークに追従。ペンの場面別表示用） */
  viewStep: number;
  addStroke: (path: Point[]) => void;
  /** ストロークの色・太さ・線種を部分更新する */
  updateStroke: (id: string, patch: Partial<Pick<PenStroke, "color" | "width" | "dash">>) => void;
  deleteStroke: (id: string) => void;
  /** 表示中の描き込みのうち最後の1本を取り消す */
  undoStroke: () => void;
  /** 表示中の描き込みを消去（他の場面のものは残す） */
  clearStrokes: () => void;
  /** 選択中のストロークID（選択すると selShape は解除される） */
  selStroke: string | null;
  setSelStroke: (id: string | null) => void;
  // 図形オブジェクト
  /** 図形パレットの開閉 */
  shapesOpen: boolean;
  setShapesOpen: (v: boolean) => void;
  /** 選択中の図形ID（選択すると selStroke は解除される） */
  selShape: string | null;
  setSelShape: (id: string | null) => void;
  /** 新しい図形に適用する色 */
  shapeColor: string;
  setShapeColor: (c: string) => void;
  /** 図形を中央付近に既定サイズで作成し、選択状態にする */
  addShape: (kind: "zoneEllipse" | "zoneRect" | "text" | "arrow") => void;
  updateShape: (id: string, patch: ShapePatch) => void;
  deleteShape: (id: string) => void;
  // 選手追従図形（連結ライン・囲み枠）の「選手タップ待ち」作成フロー
  /** タップ待ち中の図形種別と、これまでにタップされた選手 */
  pendingShape: { kind: "link" | "hull"; actors: Actor[] } | null;
  /** usePointerDrag から同期的に読むための ref */
  pendingShapeRef: React.RefObject<{ kind: "link" | "hull"; actors: Actor[] } | null>;
  startPendingShape: (kind: "link" | "hull") => void;
  /** タップされた選手/ボールを pending に反映 */
  pendingShapeTap: (actor: Actor) => void;
  /** link/hull を人数を満たしていれば作成する（不足時はtoast） */
  confirmPendingShape: () => void;
  cancelPendingShape: () => void;
  /** 図形・ストロークのDOM要素登録。applyPlayheadから直接更新する追従図形（link/hull）や、
   * FormatBar の位置計算（getBoundingClientRect）に使う */
  registerShapeEl: (id: string, el: SVGElement | HTMLElement | null) => void;
  /** registerShapeEl で登録済みのDOM要素を取得する（未登録なら undefined） */
  getShapeEl: (id: string) => SVGElement | HTMLElement | undefined;
  /** 連結ライン・囲み枠（link/hull）の描画点を、選手/相手/ボールの実測ディスク中心へ同期する。
   * レンダー中の getBoundingClientRect 読み取りを避けるため、コミット後（useLayoutEffect）や
   * 再生ループ（applyPlayhead）からのみ呼び出す。st 省略時は stateRef.current を使う */
  syncAttachedShapes: (st?: BoardState) => void;
  // ピッチガイド（5レーン/エリア名/凡例）
  setGuides: (patch: Partial<{ lanes: boolean; zones: boolean; legend: boolean }>) => void;
  // ピッチ表示モード（フル/ハーフ）
  setPitchView: (view: PitchViewMode) => void;
  // ゴースト残像（前の場面の開始位置を薄く表示）。永続化不要のUI状態
  showGhost: boolean;
  setShowGhost: (v: boolean) => void;
  // アニメ中の描き込み（ペン・図形）表示ON/OFF。永続化不要のUI状態（既定ON）
  showDrawings: boolean;
  setShowDrawings: (v: boolean) => void;
  // アニメ編集のツール（ドラッグの意味）
  animTool: "move" | "draw";
  setAnimTool: (t: "move" | "draw") => void;
  /** アニメ編集中の移動（ベース位置＋ルートを平行移動） */
  translateActor: (actor: Actor, dx: number, dy: number) => void;
  // UI mode
  mode: "edit" | "anim";
  selActor: Actor | null;
  setSelActor: (a: Actor | null) => void;
  /** タイムライン・線種編集で選択中のルート（actor+場面で一意） */
  selMove: { actor: Actor; step: number } | null;
  setSelMove: (m: { actor: Actor; step: number } | null) => void;
  /** 場面 s 開始時点のボール保持者（こぼれ球や未保持は null） */
  holderAtStep: (s: number) => Actor | null;
  /** 場面 s 終了時点のボール保持者（場面内のパス後の連鎖判定用） */
  holderAtStepEnd: (s: number) => Actor | null;
  /** 保持者(selActor)から receiver へパスを生成（前提条件は呼び出し側でガード） */
  passTo: (receiver: Actor) => void;
  /** 保持者(selActor)からゴールへシュートを生成（前提条件は呼び出し側でガード） */
  shoot: () => void;
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
  /** クラブエンブレム（dataURL）。未設定は null */
  teamLogo: string | null;
  setTeamLogo: (url: string | null) => boolean;
  playerPassword: string;
  setPlayerPassword: (pw: string) => void;
  matchesPublic: boolean;
  setMatchesPublic: (v: boolean) => void;
  drillIntent: "library" | { open: string } | null;
  setDrillIntent: (v: "library" | { open: string } | null) => void;
  /** チームHub: 他画面からタブ・選手・予定を指定して遷移させる意図（消費後はnullに戻す） */
  teamIntent: { tab: "home" | "att" | "cal" | "rec" | "ros" | "chat"; playerId?: string; eventId?: string } | null;
  setTeamIntent: (
    v: { tab: "home" | "att" | "cal" | "rec" | "ros" | "chat"; playerId?: string; eventId?: string } | null
  ) => void;
  // チャット / メッセージ（戦術・トレーニング・画像・動画の送信）
  messages: ChatMessage[];
  sendMessage: (msg: Omit<ChatMessage, "id" | "ts">) => void;
  removeMessage: (id: string) => void;
  /** 現在のボードを SavedPlay スナップショットにして返す（送信用） */
  snapshotPlay: (title: string) => SavedPlay;
  /** 埋め込みの戦術データを読み込んでボードに表示（ライブラリ非依存） */
  loadPlayData: (play: SavedPlay) => void;
  /** 埋め込みのセットプレーデータを読み込んでセットプレー画面に表示（ライブラリ非依存） */
  loadSetPieceData: (item: SavedSetPiece) => void;
  /** 受信した埋め込みドリル（DrillProvider が読み取って読込） */
  incomingDrill: SavedDrill | null;
  setIncomingDrill: (d: SavedDrill | null) => void;
  /** 埋め込みのトレーニング(ドリル)をドリル画面で開く */
  openDrillData: (drill: SavedDrill) => void;
  // サッカーノート（選手提出）
  notebook: NotebookEntry[];
  addNote: (entry: Omit<NotebookEntry, "id" | "ts">) => void;
  updateNote: (entry: NotebookEntry) => void;
  /** トーストを出さない部分更新（既読・リアクション等の暗黙更新用） */
  patchNote: (id: string, patch: Partial<NotebookEntry>) => void;
  deleteNote: (id: string) => void;
  setNoteComment: (id: string, comment: string, drawing?: { plays: PlayPoint[]; playLines: PlayLine[] }) => void;
  // コーチからの配信物
  deliverables: CoachDeliverable[];
  addDeliverable: (data: Omit<CoachDeliverable, "id" | "ts">) => void;
  updateDeliverable: (d: CoachDeliverable) => void;
  removeDeliverable: (id: string) => void;
  respondDeliverable: (id: string, playerId: string, response: CoachDeliverable["responses"][string]) => void;
  /** groups-everywhere Phase D-1(C1-major): グループ削除／学校区分変更で消える学年グループの
   *  後始末用。全配信のtargetGroupIdsからgroupIdを外す（空になればundefinedに戻す） */
  removeDeliverableTargetGroup: (groupId: string) => void;
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
  discardImport: () => void;
  // セットプレーデザイン（第2文書スロット＝spState。screen==="setpiece"のときstate/dispatchが指す）
  /** 現在読み込み中の保存セットプレーID（未保存なら null） */
  currentSetPieceId: string | null;
  /** 現在読み込み中の保存セットプレーのタイトル（未保存なら null） */
  currentSetPieceTitle: string | null;
  /** 新規タイトルで保存 */
  saveSetPiece: (title: string, folderId: string | null) => boolean;
  /** 読込済みのセットプレーへ上書き保存（未読込なら save シートを開く） */
  saveCurrentSetPiece: () => void;
  loadSetPiece: (id: string) => void;
  deleteSetPiece: (id: string) => void;
  duplicateSetPiece: (id: string) => void;
  renameSetPiece: (id: string, title: string) => void;
  /** 現在のボードを SavedSetPiece スナップショットにして返す（送信用。setPiece未設定なら null） */
  snapshotSetPiece: (title: string) => SavedSetPiece | null;
  /** 種別・攻守・人数（と将来のorigin）から新規セットプレー文書を作成し、setpiece画面へ
   * 遷移する（保存中のIDは外す。lib/setPieceLayouts.ts の buildSetPieceLayout を使う） */
  newSetPiece: (input: SetPieceLayoutInput) => void;
  /** 現在のセットプレー文書へ、別プリセットの初期配置を適用し直す（保存中IDは変えない・旧データ用） */
  applySetPiecePreset: (presetId: string) => void;
  /** 現在のセットプレー文書へ、種別・攻守・人数（と将来のorigin）から作った基本配置を
   * 適用し直す（保存中IDは変えない。適用前の状態は1件だけ覚え、restoreSetPieceSnapshotで戻せる） */
  applySetPieceLayout: (input: SetPieceLayoutInput) => void;
  /** applySetPieceLayout/newSetPiece の直前の状態が残っており「元に戻す」を出せるか */
  canRestoreSetPiece: boolean;
  /** 直前のセットプレー配置（1件だけ）に戻す */
  restoreSetPieceSnapshot: () => void;
  /** 直近に生成した基本配置から、slots/opponents/ballの座標が動かされたか（レビュー指摘(1回目):
   * トークンをドラッグしただけの手入れはmoves/shapes/drawingsに現れないため、isDirty()の
   * 「手が入っている」判定に組み込むための追加チェック。基準が無ければfalse＝従来どおり） */
  isSetPieceLayoutEdited: () => boolean;
  /** セットプレー文書を左右反転する */
  flipSetPieceX: () => void;
  /** ボールの軌道（キック/スローのmove）を作成・更新する。nullで削除する（setpiece-redesign §4） */
  setSetPieceDelivery: (move: Move | null) => void;
  /** 「ボールの軌道」グループの開閉（Pitch側のDeliveryLayer表示可否も兼ねる。§4・§5） */
  spTrajOpen: boolean;
  setSpTrajOpen: (open: boolean) => void;
  // コーチラボ（ユーザー投稿記事）
  userArticles: UserArticle[];
  /** 新規投稿を追加し、生成した記事IDを返す */
  addUserArticle: (a: Omit<UserArticle, "id" | "ts" | "updatedAt">) => string;
  updateUserArticle: (a: UserArticle) => void;
  removeUserArticle: (id: string) => void;
  // 画面（戦術ボード / 練習メニュー）
  screen: ScreenName;
  setScreen: (s: ScreenName) => void;
  /** 直前にいた画面の「戻り先」の丸め値（"home" か "coaching"）。
   * board/setpiece/drill/library 遷移時にのみ更新される。モバイルの
   * エディタ/ライブラリの「‹ 戻る」がホーム起点かコーチング起点かを判定するために使う */
  navFrom: ScreenName;
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

let shapeSeq = 0;
function newShapeId(): string {
  shapeSeq += 1;
  return `shape_${Date.now().toString(36)}_${shapeSeq}`;
}

let strokeSeq = 0;
/** ペンストロークの一意ID（新規作成時・旧データの補完時の両方で使用） */
function newStrokeId(): string {
  strokeSeq += 1;
  return `stroke_${strokeSeq}_${Math.random().toString(36).slice(2, 8)}`;
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
      text: "今週末は練習試合です。集合8時45分・忘れ物に注意！スパイクの手入れも忘れずに。",
    },
    // groups-phase2 §5-5: グループ宛サンプル（初回シード時のみ）
    {
      id: "msg_sample_grp_grade3",
      ts: Date.now() - 3000_000,
      to: groupThreadKey("grp_grade_3"),
      from: "coach",
      fromName: "スタッフ",
      text: "中3は土曜の公式戦に向けて、木曜はセットプレーの確認をします。",
    },
    {
      id: "msg_sample_grp_a",
      ts: Date.now() - 2400_000,
      to: groupThreadKey(SAMPLE_GROUP_A_ID),
      from: "coach",
      fromName: "スタッフ",
      text: "Aチームは金曜の練習試合、9時15分キックオフです。集合は8時30分。",
    },
  ];
}

let noteSeq = 0;
function newNoteId(): string {
  noteSeq += 1;
  return `note_${Date.now().toString(36)}_${noteSeq}`;
}

function sampleNotebook(): NotebookEntry[] {
  const dayAgo = daysAgoStr;
  const ts = (n: number) => Date.now() - n * 86400_000;
  return [
    /* --- 佐藤 蒼空(p08)：練習＋自主練の継続例（間隔は不均等） --- */
    {
      id: "note_practice1",
      playerId: "p08",
      kind: "practice",
      date: dayAgo(0),
      ts: ts(0),
      condition: "good",
      goalPre: "ファーストタッチを前向きに置く",
      achievement: 72,
      insights: ["相手を見る前に首を振る", "受ける前に体の向きを作る"],
      body: "ポゼッション練習で前を向く回数が増えた。",
      isPublic: true,
      menuId: "dlv_menu1",
      staffComment: "首振りのタイミングは合っていた。次はファーストタッチの置き所も安定させよう。",
      staffCommentTs: ts(0),
      staffSeenAt: ts(0),
    },
    {
      id: "note_solo0",
      playerId: "p08",
      kind: "solo",
      date: dayAgo(5),
      ts: ts(5),
      items: [{ kind: "lifting", value: "88回" }],
    },
    {
      id: "note_solo1",
      playerId: "p08",
      kind: "solo",
      date: dayAgo(1),
      ts: ts(1),
      condition: "great",
      items: [
        { kind: "lifting", value: "132回" },
        { kind: "running", value: "2.6km" },
      ],
      body: "リフティング自己ベスト更新。",
    },
    /* --- 試合ノート（クイック記録の例：vs 高砂フットボールクラブ・11日前） --- */
    {
      id: "note_match_p10",
      playerId: "p10",
      kind: "match",
      date: dayAgo(11),
      ts: ts(11),
      condition: "great",
      opponent: "高砂フットボールクラブ",
      bestPlay: "2ゴール。開始5分の先制と終盤のダメ押しが取れた",
      lineups: [{ phase: "1st", ownFormation: "4-3-3", ownPositionIndex: 9, oppFormation: "4-4-2" }],
      plays: [
        { x: 52, y: 88, kind: "shot", phase: "1st", course: { x: 60, y: 20 }, scored: true, shotNote: "抜け出しから流し込んだ" },
        { x: 46, y: 80, kind: "shot", phase: "2nd", course: { x: 35, y: 30 }, scored: false, shotNote: "詰められて枠の外" },
        { x: 55, y: 85, kind: "shot", phase: "2nd", course: { x: 70, y: 22 }, scored: true, shotNote: "こぼれ球を押し込んだ" },
      ],
      body: "前半から主導権。サイドからのクロスに反応できた。",
      staffComment: "終盤の一押しは冷静だった。次は逆足でのフィニッシュも増やしたい。",
      staffCommentTs: ts(10),
      staffSeenAt: ts(11) + 3600_000,
      staffReaction: "nice",
    },
    {
      id: "note_match_p09",
      playerId: "p09",
      kind: "match",
      date: dayAgo(11),
      ts: ts(11),
      condition: "good",
      opponent: "高砂フットボールクラブ",
      bestPlay: "右サイドの持ち込みから得点",
      body: "1対1で仕掛けられた場面が多かった。",
      staffComment: "仕掛けの姿勢はよかった。クロスの精度はどう感じてる？",
      staffCommentTs: ts(10),
      staffSeenAt: ts(11) + 3600_000,
    },
    {
      id: "note_match_p01",
      playerId: "p01",
      kind: "match",
      date: dayAgo(11),
      ts: ts(11),
      condition: "good",
      opponent: "高砂フットボールクラブ",
      bestPlay: "失点直後の切り替えでのセービング",
      body: "後方からのコーチングで最終ラインを押し上げられた。",
    },
    {
      id: "note_match_p07",
      playerId: "p07",
      kind: "match",
      date: dayAgo(11),
      ts: ts(11),
      condition: "normal",
      opponent: "高砂フットボールクラブ",
      bestPlay: "中盤でのボール奪取",
      reflectPlay: "縦パスをもう少し狙いたかった",
      staffComment: "中盤で奪う場面が目立った。奪った直後の前への一歩を、次回意識してみよう。",
      staffCommentTs: ts(10),
      staffSeenAt: ts(11) + 3600_000,
    },
    /* --- 練習ノート（複数選手・提出間隔は不均等） --- */
    {
      id: "note_practice_p02",
      playerId: "p02",
      kind: "practice",
      date: dayAgo(14),
      ts: ts(14),
      condition: "good",
      goalPre: "対人で体を入れる",
      achievement: 83,
      insights: ["半身で待つ", "相手より先にボールに触る"],
      staffComment: "対人の場面で当たり負けしなくなってきた！",
      staffCommentTs: ts(13),
      staffSeenAt: ts(13),
    },
    {
      id: "note_practice_p06",
      playerId: "p06",
      kind: "practice",
      date: dayAgo(14),
      ts: ts(14),
      condition: "great",
      goalPre: "ボランチで前後の顔出し",
      achievement: 77,
      insights: ["受ける前に一度顔を出す"],
      body: "コンパクトな距離感を意識できた。",
    },
    {
      id: "note_practice_p03",
      playerId: "p03",
      kind: "practice",
      date: dayAgo(28),
      ts: ts(28),
      condition: "good",
      goalPre: "ビルドアップの角度を作る",
      achievement: 68,
      insights: ["斜めのサポート"],
      isPublic: true,
      staffComment: "斜めのサポートの立ち位置を意識できていた。次は運ぶドリブルも試そう。",
      staffCommentTs: ts(27),
      staffSeenAt: ts(27),
    },
    /* --- 自主練ノート（複数選手） --- */
    {
      id: "note_solo_p11",
      playerId: "p11",
      kind: "solo",
      date: dayAgo(2),
      ts: ts(2),
      condition: "good",
      items: [
        { kind: "lifting", value: "83回" },
        { kind: "other", value: "利き足以外のシュート 24本" },
      ],
      body: "左足のインステップを練習。",
    },
    {
      id: "note_solo_p04",
      playerId: "p04",
      kind: "solo",
      date: dayAgo(9),
      ts: ts(9),
      items: [{ kind: "running", value: "2.4km" }],
    },
    {
      id: "note_practice_p12",
      playerId: "p12",
      kind: "practice",
      date: dayAgo(0),
      ts: ts(0),
      condition: "normal",
      goalPre: "GKの飛び出し判断",
      achievement: 58,
      insights: ["セットプレーの準備"],
    },
    /* --- 離脱中(p05)のリハビリ記録：怪我中でも前向きに継続 --- */
    {
      id: "note_solo_p05",
      playerId: "p05",
      kind: "solo",
      date: dayAgo(5),
      ts: ts(5),
      condition: "normal",
      items: [
        { kind: "strength", value: "体幹 18分" },
        { kind: "other", value: "リハビリメニュー（足首）" },
      ],
      body: "痛みは軽減。来週フル合流できるよう調整中。",
      staffComment: "無理のない範囲で継続できてる！痛みが出たら早めに教えてね。",
      staffCommentTs: ts(4),
      staffSeenAt: ts(5) + 3600_000,
    },
  ];
}

let deliverSeq = 0;
function newDeliverId(): string {
  deliverSeq += 1;
  return `dlv_${Date.now().toString(36)}_${deliverSeq}`;
}

// "u-" プレフィクスでseed記事("a-")と区別する（lib/articles.ts のコメント参照）
let articleSeq = 0;
function newArticleId(): string {
  articleSeq += 1;
  return `u-${Date.now().toString(36)}_${articleSeq}`;
}

function sampleDeliverables(): CoachDeliverable[] {
  const now = Date.now();
  const h = (n: number) => now - n * 3600_000;

  // 練習メニュー：チーム全員宛・13名が回答（理解度・難易度は選手ごとにばらつく。回答時刻もばらす）
  const menuResp: Record<string, MenuResponse> = {
    p01: { understanding: 5, difficulty: 3, ts: h(2) },
    p02: { understanding: 4, difficulty: 4, ts: h(5) },
    p03: { understanding: 3, difficulty: 3, ts: h(9) },
    p04: { understanding: 5, difficulty: 2, ts: h(13) },
    p05: { understanding: 4, difficulty: 4, ts: h(16) },
    p06: { understanding: 3, difficulty: 4, ts: h(20) },
    p07: { understanding: 5, difficulty: 3, ts: h(24) },
    p08: { understanding: 4, difficulty: 5, ts: h(27) },
    p09: { understanding: 3, difficulty: 2, ts: h(31) },
    p10: { understanding: 5, difficulty: 4, ts: h(35) },
    p11: { understanding: 2, difficulty: 4, ts: h(39) },
    p12: { understanding: 4, difficulty: 3, ts: h(42) },
    p13: { understanding: 3, difficulty: 5, ts: h(46) },
  };

  // 個人課題：対象9名（離脱中のp05は除く）のうち7名が回答（未回答2名・達成状況もばらつく）
  const assignTargets = ["p01", "p02", "p03", "p04", "p06", "p07", "p08", "p09", "p10"];
  const assignResp: Record<string, AssignmentResponse> = {
    p01: { status: "done", ts: h(6) },
    p02: { status: "done", ts: h(9) },
    p03: { status: "partial", ts: h(14) },
    p04: { status: "done", ts: h(18) },
    p06: { status: "none", ts: h(25) },
    p07: { status: "done", ts: h(30) },
    p08: { status: "partial", ts: h(33) },
    // p09 / p10 は未回答のまま（催促UIのデモ用）
  };

  return [
    {
      id: "dlv_menu1",
      kind: "menu",
      ts: h(50),
      title: "3対2のポゼッション",
      category: "ポゼッション",
      desc: "数的優位を作って前進。パスの受け手は常に2つの選択肢を準備する。",
      responses: menuResp,
    },
    {
      id: "dlv_assign1",
      kind: "assignment",
      ts: h(51),
      title: "縦パスを増やす",
      detail: "1試合で前向きの縦パスを5本以上。",
      targetPlayerIds: assignTargets,
      responses: assignResp,
    },
  ];
}

/** SetPieceLayout（lib/setPieceLayouts.ts。座標だけの純データ）から、名簿を割り当てた
 * BoardState を組み立てる。buildSetPieceState（旧プリセット用。lib/setPiecePresets.ts）と
 * 同じ規則（slotsへ選手を巡回割当・moves/shapes/drawingsは空）だが、setPieceメタは
 * SetPieceLayoutInputのkind/side/formatを直接使う（presetIdは持たない＝setpiece-redesign §1）。
 * レビュー指摘(1回目): 引数だけで完結する純粋関数（コンポーネントのstate/propsを閉じ込めない）
 * なので、useCallbackにせずモジュール直下へ出す。こうすることで spState の初期値（useReducerの
 * 遅延初期化）からも呼べる＝初回起動時に旧プリセットck-near-attack（ニア狙いの図形・メモ付き）
 * ではなく図形なしの基本配置を出せる */
function buildSetPieceStateFromLayout(
  layout: SetPieceLayout,
  input: SetPieceLayoutInput,
  basePlayers: Player[],
  teamName: string | null,
  captain: string | null,
  /** 優先して使う選手（戦術ボードのスタメンの pid） */
  preferIds: string[] = []
): BoardState {
  // 統括の最終調整: 以前は名簿の先頭から順に枠へ入れていたため、GK がキッカーで FW がゴールを守る
  // といった配置になっていた。戦術ボードのスタメン（preferIds）を優先し、①ポジション一致 ②同じ
  // 大分類（GK/DF/MF/FW）③残り、の順で GK の枠から埋める。70 人の名簿でも先頭 11 人に偏らない
  const pool: Player[] = [
    ...preferIds.map((id) => basePlayers.find((p) => p.id === id)).filter((p): p is Player => !!p),
    ...basePlayers.filter((p) => !preferIds.includes(p.id)),
  ];
  const used = new Set<string>();
  const pick = (test: (p: Player) => boolean): string | null => {
    const hit = pool.find((p) => !used.has(p.id) && test(p));
    if (!hit) return null;
    used.add(hit.id);
    return hit.id;
  };
  const pids: (string | null)[] = layout.slots.map(() => null);
  const byPriority = layout.slots.map((s, i) => ({ s, i })).sort((a, b) => (a.s.role === "GK" ? 0 : 1) - (b.s.role === "GK" ? 0 : 1));
  for (const { s, i } of byPriority) pids[i] = pick((p) => p.position === s.role);
  for (const { s, i } of byPriority) if (!pids[i]) pids[i] = pick((p) => groupOf(p.position) === groupOf(s.role) && (s.role === "GK") === (p.position === "GK"));
  for (const { s, i } of byPriority) if (!pids[i]) pids[i] = pick((p) => (s.role === "GK") === (p.position === "GK"));
  for (const { i } of byPriority) if (!pids[i]) pids[i] = pick(() => true);
  const slots: Slot[] = layout.slots.map((s, i) => ({ role: s.role, x: s.x, y: s.y, pid: pids[i] }));
  const opponents: OppToken[] = layout.opps.map((o, i) => ({
    x: o.x,
    y: o.y,
    label: String(i + 1),
  }));
  return {
    teamName,
    formation: input.format === 11 ? "4-3-3" : "8人制 3-3-1",
    slots,
    players: basePlayers,
    ball: { ...layout.ball },
    moves: [],
    captain,
    holder: null,
    opponents,
    drawings: [],
    shapes: [],
    stepCount: 1,
    guides: {},
    pitchView: layout.view,
    setPiece: {
      kind: input.kind,
      side: input.side,
      presetId: undefined,
      format: input.format,
      origin: input.origin,
    },
  };
}

/** isSetPieceLayoutEditedが比較に使う、slots/opponents/ballの座標だけの軽い基準
 * （レビュー指摘(1回目)：トークンのドラッグはmoves/shapes/drawingsに現れないため、
 * 生成直後の座標をここに1件だけ覚えておき、後で座標がずれたかどうかを比較する） */
interface SpLayoutSnapshot {
  ball: Point;
  slots: { x: number; y: number }[];
  opponents: { x: number; y: number }[];
}
function snapshotSpLayout(state: {
  ball: Point;
  slots: { x: number; y: number }[];
  opponents?: { x: number; y: number }[];
}): SpLayoutSnapshot {
  return {
    ball: { ...state.ball },
    slots: state.slots.map((s) => ({ x: s.x, y: s.y })),
    opponents: (state.opponents ?? []).map((o) => ({ x: o.x, y: o.y })),
  };
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
  // ---- 画面（文書スロット切替の基準になるため最初に宣言する） ----
  const [screen, setScreenState] = useState<ScreenName>("home");
  // setpiece画面のときだけ、盤面レイヤーが読む state/dispatch/stateRef の指す先を
  // セットプレー用の第2文書スロット（spState）へ切り替える。盤面レイヤーはすべて
  // useBoard() 直結・props無しのため、この切替だけで無改造のまま別文書を描画できる
  const sp = screen === "setpiece";
  // 直前の screen を setScreen のクロージャから参照するための ref（stateRef と同じ手法）
  const screenRef = useRef<ScreenName>(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  // モバイルの「‹ 戻る」の戻り先（home起点かcoaching起点か）。既定はhome
  const [navFrom, setNavFromState] = useState<ScreenName>("home");

  // ---- 文書スロット：戦術ボード用(playState) / セットプレーデザイン用(spState) ----
  const [playState, playDispatch] = useReducer(reducer, undefined, makeInitial);
  const [spState, spDispatch] = useReducer(
    reducer,
    undefined,
    () =>
      // レビュー指摘(1回目): 初回（保存データなし）の既定文書は旧プリセットck-near-attack
      // （ニア狙いのゾーン・「ニア」「キッカー」の図形とメモ付き）ではなく、CK・攻撃・8人制の
      // 図形なしの基本配置にする（ユーザー指示「ニア狙いはいらない」・setpiece-redesign §1）
      loadSetPieceWork()?.state ??
      buildSetPieceStateFromLayout(
        buildSetPieceLayout(DEFAULT_SETPIECE_LAYOUT_INPUT),
        DEFAULT_SETPIECE_LAYOUT_INPUT,
        playState.players,
        playState.teamName,
        playState.captain,
        playState.slots.map((s) => s.pid).filter((id): id is string => !!id)
      )
  );
  const [currentSetPieceId, setCurrentSetPieceId] = useState<string | null>(
    () => loadSetPieceWork()?.currentId ?? null
  );
  /** 「元に戻す」用に、基本配置を作り直す直前のBoardStateを1件だけ覚える
   * （setpiece-redesign §1）。セットプレー文書(spState)専用で、戦術ボード(playState)には
   * 影響しない。別の文書を開いた／新規作成したら破棄する */
  const [spSnapshot, setSpSnapshot] = useState<BoardState | null>(null);
  /** 直近に生成した基本配置のslots/opponents/ball座標（レビュー指摘(1回目)：isDirty()が
   * moves/drawings/shapesしか見ておらず、トークンをドラッグしただけの手入れを確認なしで
   * 作り直してしまうため、比較用の基準として持つ。保存データを引き継いだとき（編集履歴が
   * 不明）はnull＝isSetPieceLayoutEditedはfalseを返す＝従来どおりの判定のみになる）。
   * レビュー指摘(2回目・major): 以前は「作業中データ(loadSetPieceWork)があれば常にnull」
   * だったため、保存データがある状態（＝2回目以降の起動すべて）ではリロード直後から
   * ドラッグの手入れを検知できなかった。作業中データと一緒に基準も永続化し（下のuseEffect・
   * lib/storage.tsのSpLayoutBaseline）、保存されていればそれを使う。保存データはあるが
   * 基準が無い（このレビュー以前に保存された古いデータ）ときだけ、従来どおりnullのまま
   * （編集履歴不明＝isSetPieceLayoutEditedはfalseを返す）にする */
  const [spLayoutBaseline, setSpLayoutBaseline] = useState<SpLayoutSnapshot | null>(() => {
    const saved = loadSetPieceWork();
    if (saved) return saved.layoutBaseline ?? null;
    const layout = buildSetPieceLayout(DEFAULT_SETPIECE_LAYOUT_INPUT);
    return snapshotSpLayout({ ball: layout.ball, slots: layout.slots, opponents: layout.opps });
  });
  /** 「ボールの軌道」グループの開閉（setpiece-redesign §4・§5）。SetPieceBar（操作列の
   * 開閉・要約表示）とPitch/DeliveryLayer（軌道の線・ハンドルの表示可否）の両方から
   * 参照するため、他の3グループ（種類/表示/描く・動かす。SetPieceBar内のローカルstate）
   * とは別にここに持つ。保存先(localStorage)はSetPieceBar側と同じキーのtrajフィールドを共有する */
  const [spTrajOpen, setSpTrajOpenState] = useState<boolean>(() => !!loadSpBarOpen().traj);
  const setSpTrajOpen = useCallback((open: boolean) => {
    setSpTrajOpenState(open);
    saveSpBarOpen({ ...loadSpBarOpen(), traj: open });
  }, []);

  const state = sp ? spState : playState;
  // dispatch自体は「常に同じ関数」として安定させ、実体の切替はref経由で行う。
  // こうすることで、既存の useCallback（依存配列に dispatch を含まない49箇所）が
  // screen切替をまたいでも常に「今アクティブな文書」へ正しくdispatchできる
  const activeDispatchRef = useRef<React.Dispatch<Action>>(sp ? spDispatch : playDispatch);
  activeDispatchRef.current = sp ? spDispatch : playDispatch;
  const dispatch = useCallback((action: Action) => activeDispatchRef.current(action), []);

  // 最新stateをアニメーションループから読むためのミラー
  const stateRef = useRef<BoardState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // 最新playStateを読むためのミラー（newSetPiece等がsetpiece画面以外からでも
  // 現行チーム名簿を参照できるようにする）
  const playStateRef = useRef<BoardState>(playState);
  useEffect(() => {
    playStateRef.current = playState;
  }, [playState]);

  // ---- 名簿同期：playState（戦術ボード）側の名簿変更をセットプレー文書(spState)へ反映する。
  // スロットのpid/配置はそのまま、players配列とteamName/captainだけを同期する
  // （buildSetPieceStateはドキュメント新規作成時にしかplayStateを読まないため、
  // 作成後の名簿編集を追随させるにはこの同期が別途必要）
  useEffect(() => {
    spDispatch({
      type: "SYNC_ROSTER",
      players: playState.players,
      teamName: playState.teamName,
      captain: playState.captain,
    });
  }, [playState.players, playState.teamName, playState.captain, spDispatch]);

  // ---- mount: localStorage 復元 / 変更時保存（戦術ボード＝playState） ----
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
    // 毎キーストロークでの書き込みを避けるため300msデバウンス。次の変更でタイマーをクリアする
    const timer = setTimeout(() => {
      saveState(playState);
    }, 300);
    return () => clearTimeout(timer);
  }, [playState]);

  // ---- セットプレー文書の永続化（デバウンス保存。lazy初期化済みのため起動時hydrateは不要） ----
  // レビュー指摘(2回目・major): spLayoutBaselineも一緒に保存する（このコメント上のuseState参照）
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSetPieceWork(spState, currentSetPieceId, spLayoutBaseline);
    }, 300);
    return () => clearTimeout(timer);
  }, [spState, currentSetPieceId, spLayoutBaseline]);

  // ---- UI state ----
  const [mode, setMode] = useState<"edit" | "anim">("edit");
  const [selActor, setSelActor] = useState<Actor | null>(null);
  // イベントハンドラ（usePointerDrag等）から最新値を読むためのミラー
  const selActorRef = useRef<Actor | null>(null);
  useEffect(() => {
    selActorRef.current = selActor;
  }, [selActor]);
  const [selMove, setSelMove] = useState<{ actor: Actor; step: number } | null>(null);
  const [activeStep, setActiveStepState] = useState(0);
  const activeStepRef = useRef(0);
  useEffect(() => {
    activeStepRef.current = activeStep;
  }, [activeStep]);
  const [penMode, setPenMode] = useState(false);
  const [penColor, setPenColor] = useState("#ffe27a");
  const [penWidth, setPenWidth] = useState(0.9);
  const [penDash, setPenDash] = useState(false);
  const penRef = useRef({ color: "#ffe27a", width: 0.9, dash: false });
  useEffect(() => {
    penRef.current = { color: penColor, width: penWidth, dash: penDash };
  }, [penColor, penWidth, penDash]);
  const [penScope, setPenScope] = useState<"all" | "step">("all");
  // 図形オブジェクト
  const [selShape, setSelShapeState] = useState<string | null>(null);
  // 選択中のペンストローク（selShape とは常に排他：どちらかを選ぶと他方は自動で解除される）
  const [selStroke, setSelStrokeState] = useState<string | null>(null);
  const setSelShape = useCallback((id: string | null) => {
    setSelShapeState(id);
    if (id != null) setSelStrokeState(null);
  }, []);
  const setSelStroke = useCallback((id: string | null) => {
    setSelStrokeState(id);
    if (id != null) setSelShapeState(null);
  }, []);
  const [shapeColor, setShapeColor] = useState("#ffe27a");
  // 選手追従図形の「選手タップ待ち」フロー。usePointerDragから同期的に読むためref併用
  const [pendingShape, setPendingShapeState] = useState<{
    kind: "link" | "hull";
    actors: Actor[];
  } | null>(null);
  const pendingShapeRef = useRef<{ kind: "link" | "hull"; actors: Actor[] } | null>(
    null
  );
  const setPendingShape = useCallback(
    (p: { kind: "link" | "hull"; actors: Actor[] } | null) => {
      pendingShapeRef.current = p;
      setPendingShapeState(p);
    },
    []
  );
  const [shapesOpen, setShapesOpenState] = useState(false);
  // パレットを閉じたら選択・選手タップ待ち（pendingShape）も解除する
  const setShapesOpen = useCallback(
    (v: boolean) => {
      setShapesOpenState(v);
      if (!v) {
        setSelShapeState(null);
        setPendingShape(null);
      }
    },
    [setPendingShape]
  );
  // 図形（zone/arrow/text/link/hull）・ストロークのDOM要素。
  // applyPlayheadからの追従図形（link/hull）の直接位置更新や、FormatBar の位置計算に使う
  const shapeEls = useRef<Map<string, SVGElement | HTMLElement>>(new Map());
  const registerShapeEl = useCallback((id: string, el: SVGElement | HTMLElement | null) => {
    if (el) shapeEls.current.set(id, el);
    else shapeEls.current.delete(id);
  }, []);
  const getShapeEl = useCallback(
    (id: string) => shapeEls.current.get(id),
    []
  );
  const [animTool, setAnimTool] = useState<"move" | "draw">("draw");
  // 盤面が表示中の場面（再生・シークに追従）。ペンの場面別表示に使う
  const [viewStep, setViewStepState] = useState(0);
  const viewStepRef = useRef(0);
  const setViewStep = useCallback((s: number) => {
    if (viewStepRef.current === s) return;
    viewStepRef.current = s;
    setViewStepState(s);
  }, []);
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
  // ゴースト残像の表示ON/OFF（永続化不要のUI状態。既定ON）
  const [showGhost, setShowGhost] = useState(true);
  // アニメ中の描き込み（ペン・図形）表示ON/OFF（永続化不要のUI状態。既定ON）
  const [showDrawings, setShowDrawings] = useState(true);
  const [fullplay, setFullplay] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ type: null });
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- library / plan / share ----
  // lazy初期化で保存データを直接読む（mount後の load→save 競合を防ぐ。messages/notebook と同方針）。
  // 空配列で初期化して effect で hydrate すると、保存effectが先に走って
  // 保存済みライブラリを空で上書きし、StrictModeの二重マウントで消失が確定する
  const [library, setLibrary] = useState<Library>(
    () => loadLibrary() ?? { plays: [], folders: [], setPieces: [] }
  );
  // lazy初期化。effectでのhydrateだと初回ペイントが常に"starter"になり
  // レールのプラン表示がちらつくため、保存済み設定を直接読む
  const [plan, setPlanState] = useState<PlanTier>(() => {
    const st = loadSettings();
    return st ? migratePlan(st.plan as string) : "starter";
  });
  // lazy初期化で保存データを直接読む（mount後のload→save競合を防ぐ。messages/notebook等と同方針。
  // effectでhydrateすると保存済みデータを空(null)で上書きしてしまう事故になる）
  const [teamLogo, setTeamLogoState] = useState<string | null>(() => loadTeamLogo());
  const [currentPlayId, setCurrentPlayId] = useState<string | null>(null);
  const [playerPassword, setPlayerPasswordState] = useState("");
  const [matchesPublic, setMatchesPublicState] = useState(true);
  const [drillIntent, setDrillIntent] = useState<"library" | { open: string } | null>(null);
  const [teamIntent, setTeamIntent] = useState<
    { tab: "home" | "att" | "cal" | "rec" | "ros" | "chat"; playerId?: string; eventId?: string } | null
  >(null);
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
  // コーチからの配信物（練習メニュー/個人課題/ミーティング）
  const [deliverables, setDeliverables] = useState<CoachDeliverable[]>(
    () => loadDeliverables() ?? sampleDeliverables()
  );
  useEffect(() => {
    saveDeliverables(deliverables);
  }, [deliverables]);
  // コーチラボ（ユーザー投稿記事）。lazy初期化で保存データを直接読む
  // （mount後のload→save競合を防ぐ。messages/notebook等と同方針。
  //   空配列初期化+後追いloadだとStrictModeの二重マウントで保存済み投稿が消える）
  const [userArticles, setUserArticles] = useState<UserArticle[]>(() => loadUserArticles());
  useEffect(() => {
    saveUserArticles(userArticles);
  }, [userArticles]);
  const [pendingImport, setPendingImport] = useState<ShareSnapshot | null>(null);
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
    // library は lazy 初期化済み（ここで再読込すると二重setになる）
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
  }, []);
  useEffect(() => {
    saveLibrary(library);
  }, [library]);
  // 共有リンクで来たら確認シートを開く。PCの戦術ボードでは中央ダイアログではなく
  // 画面上部のバナー(TacticsBoard/SetPieceBoardのImportBanner)で出すため、シートは開かず
  // 盤面へ遷移する。スナップショットにsetPieceメタが載っている（＝セットプレー文書からの
  // 共有）場合はセットプレー画面へ遷移し、以後の取込先(applyImport)もそちらへ向く
  useEffect(() => {
    if (!pendingImport) return;
    const pc = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    if (pc) {
      setScreen(pendingImport.setPiece ? "setpiece" : "board");
    } else {
      setSheet({ type: "importShared" });
    }
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
  /** 選手/相手/ボールの「ディスク実測中心」をピッチ%座標で返す（要素未登録なら null）。
   * pr（ピッチ矩形）を引数で受け取ることで、複数アクターをまとめて処理する際に
   * getPitchRect の呼び出しを1回にまとめられる（syncAttachedShapes 専用の内部ヘルパー。
   * レンダー中には呼ばない） */
  const discCenterFromRect = useCallback(
    (actor: Actor, pr: DOMRect, pitchView: PitchViewMode | undefined): Point | null => {
      const wrap = tokenEls.current.get(actor);
      if (!wrap) return null;
      const discEl = wrap.querySelector<HTMLElement>(actor === "ball" ? ".b" : ".disc");
      if (!discEl) return null;
      const r = discEl.getBoundingClientRect();
      const xPct = ((r.left + r.width / 2 - pr.left) / pr.width) * 100;
      const topPct = ((r.top + r.height / 2 - pr.top) / pr.height) * 100;
      return { x: xPct, y: topToY(topPct, pitchView) };
    },
    []
  );

  /** 連結ライン・囲み枠（link/hull）の描画点を、選手/相手/ボールの実測ディスク中心へ同期する。
   * read→write の二相：先に pitch rect と必要な全ディスク位置を読み取り（phase1）、
   * その後にまとめて DOM へ書き込む（phase2）。読み書きを交互に行うレイアウト再計算を避けるため。
   * st 省略時は stateRef.current を使う。呼び出しはコミット後（useLayoutEffect）や
   * 再生ループ（applyPlayhead）からのみ行い、レンダー中には呼ばない */
  const syncAttachedShapes = useCallback(
    (st?: BoardState) => {
      const s = st ?? stateRef.current;
      const attached = (s.shapes ?? []).filter(
        (sh): sh is LinkShape | HullShape => sh.kind === "link" || sh.kind === "hull"
      );
      if (attached.length === 0) return;
      const pr = getPitchRect();
      const t = play.current.t;
      const step = stepAtTime(s.moves, t, s.stepCount);
      const posFor = (a: Actor): Point =>
        (pr && pr.width > 0 && pr.height > 0 ? discCenterFromRect(a, pr, s.pitchView) : null) ??
        actorPos(a, t, s.moves, s.slots, s.ball, s.opponents, s.holder);

      // phase 1: read（ディスク実測位置の取得。getBoundingClientRect 呼び出しはここまで）
      const prepared = attached
        .filter((sh) => sh.step == null || sh.step === step)
        .map((sh) => {
          if (sh.kind === "link") {
            const points = sh.actors
              .map((a) => posFor(a))
              .map((p) => `${p.x.toFixed(1)},${yToTop(p.y, s.pitchView).toFixed(1)}`)
              .join(" ");
            return { id: sh.id, kind: "link" as const, points, badge: null };
          }
          // hull: 凸包ポリゴン＋人数バッジ（重心）
          const screenPts = sh.actors.map((a) => {
            const p = posFor(a);
            return { x: p.x, y: yToTop(p.y, s.pitchView) };
          });
          const hull = convexHull(screenPts);
          const points = hull.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const badge =
            hull.length > 0
              ? {
                  cx: hull.reduce((sum, p) => sum + p.x, 0) / hull.length,
                  cy: hull.reduce((sum, p) => sum + p.y, 0) / hull.length,
                }
              : null;
          return { id: sh.id, kind: "hull" as const, points, badge };
        });

      // phase 2: write（まとめてDOMへ反映）
      prepared.forEach((p) => {
        if (!p.points) return;
        const el = shapeEls.current.get(p.id);
        if (el) el.setAttribute("points", p.points);
        if (p.kind === "hull" && p.badge) {
          const badgeEl = shapeEls.current.get(p.id + "_badge");
          if (badgeEl) {
            (badgeEl as HTMLElement).style.left = p.badge.cx + "%";
            (badgeEl as HTMLElement).style.top = p.badge.cy + "%";
          }
        }
      });
    },
    [getPitchRect, discCenterFromRect]
  );

  // ---- playback ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const play = useRef({ t: 0, last: 0, raf: 0, playing: false, speed: 1 });
  const onTick = useRef<((t: number, total: number) => void) | null>(null);
  useEffect(() => {
    play.current.speed = speed;
  }, [speed]);

  const applyPlayhead = useCallback(
    (t: number) => {
      const st = stateRef.current;
      const els = tokenEls.current;
      const place = (actor: Actor) => {
        const el = els.get(actor);
        if (!el) return;
        const q = actorPos(actor, t, st.moves, st.slots, st.ball, st.opponents, st.holder);
        el.style.left = q.x + "%";
        el.style.top = yToTop(q.y, st.pitchView) + "%";
      };
      st.slots.forEach((_, i) => place(i));
      (st.opponents ?? []).forEach((_, i) => place(`opp${i}`));
      place("ball");
      // 場面別の描き込み表示を再生位置に追従させる
      const step = stepAtTime(st.moves, t, st.stepCount);
      setViewStep(step);

      // 選手追従図形（連結ライン・囲み枠）を再生位置に合わせて更新。
      // トークンの style を全て更新し終えた後に呼ぶため、ディスクの実測位置が使える。
      syncAttachedShapes(st);
    },
    [setViewStep, syncAttachedShapes]
  );

  const stopPlay = useCallback(() => {
    play.current.playing = false;
    cancelAnimationFrame(play.current.raf);
    setIsPlaying(false);
  }, []);

  // 場面再生時の終了時刻（nullなら最後まで）
  const playUntil = useRef<number | null>(null);

  const tick = useCallback(
    (ts: number) => {
      const p = play.current;
      if (!p.playing) return;
      if (!p.last) p.last = ts;
      const dt = ((ts - p.last) / 1000) * p.speed;
      p.last = ts;
      p.t += dt;
      const T = animTotal(stateRef.current.moves, stateRef.current.stepCount);
      const end = Math.min(T, playUntil.current ?? T);
      if (p.t >= end) {
        p.t = end;
        applyPlayhead(end);
        onTick.current?.(end, T);
        playUntil.current = null;
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
      showToast("先にルートを描画してください");
      return;
    }
    playUntil.current = null;
    const T = animTotal(stateRef.current.moves, stateRef.current.stepCount);
    if (play.current.t >= T) play.current.t = 0;
    play.current.playing = true;
    play.current.last = 0;
    setIsPlaying(true);
    play.current.raf = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /** 指定場面だけを再生（動きが無ければ場面の頭出しのみ） */
  const playStep = useCallback(
    (s: number) => {
      const st = stateRef.current;
      const t0 = stepStartTime(st.moves, s);
      const d = stepDur(st.moves, s);
      stopPlay();
      play.current.t = t0;
      applyPlayhead(t0);
      setViewStep(s);
      onTick.current?.(t0, animTotal(st.moves, st.stepCount));
      if (d <= 0) return;
      playUntil.current = t0 + d;
      play.current.playing = true;
      play.current.last = 0;
      setIsPlaying(true);
      play.current.raf = requestAnimationFrame(tick);
    },
    [stopPlay, applyPlayhead, tick, setViewStep]
  );

  const resetPlay = useCallback(() => {
    stopPlay();
    play.current.t = 0;
    applyPlayhead(0);
    onTick.current?.(0, animTotal(stateRef.current.moves, stateRef.current.stepCount));
  }, [stopPlay, applyPlayhead]);

  const seek = useCallback(
    (t: number) => {
      stopPlay();
      play.current.t = t;
      applyPlayhead(t);
      onTick.current?.(t, animTotal(stateRef.current.moves, stateRef.current.stepCount));
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

  // ---- Keynote風の選択キーボード操作（Delete/Backspace/Esc）。document keydownは1箇所に集約する ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 入力中（テキストボックス等にフォーカス）は誤発火を避けるため無視する
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selShape != null) {
          e.preventDefault();
          const id = selShape;
          dispatch({ type: "DELETE_SHAPE", id });
          setSelShapeState((cur) => (cur === id ? null : cur));
          showToast("削除しました");
          return;
        }
        if (selStroke != null) {
          e.preventDefault();
          const id = selStroke;
          dispatch({ type: "DELETE_STROKE", id });
          setSelStrokeState((cur) => (cur === id ? null : cur));
          showToast("削除しました");
          return;
        }
        if (mode === "anim" && selMove != null) {
          const idx = stateRef.current.moves.findIndex(
            (m) => m.actor === selMove.actor && (m.step ?? 0) === selMove.step
          );
          if (idx >= 0) {
            e.preventDefault();
            dispatch({ type: "DELETE_MOVE", index: idx });
            setSelActor(null);
            setSelMove(null);
            showToast("削除しました");
          }
        }
        return;
      }

      if (e.key === "Escape") {
        setSelShapeState(null);
        setSelStrokeState(null);
        setPendingShape(null);
        setSelMove(null);
        setSelActor(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selShape, selStroke, selMove, mode, showToast, setPendingShape]);

  // ---- R2: ボール所有モデル（保持者判定・パス/シュート生成） ----
  /** 場面 s 開始時点のボール保持者（holderAt の薄いラッパー） */
  const holderAtStep = useCallback((s: number): Actor | null => {
    const st = stateRef.current;
    return holderAt(stepStartTime(st.moves, s), st.moves, st.holder);
  }, []);

  /** 場面 s 終了時点のボール保持者（場面内のパスで保持者が変わった後の連鎖判定用） */
  const holderAtStepEnd = useCallback((s: number): Actor | null => {
    const st = stateRef.current;
    return holderAt(
      stepStartTime(st.moves, s) + stepDur(st.moves, s) + 0.001,
      st.moves,
      st.holder
    );
  }, []);

  /** パス/シュートの生成先場面を確保する。現在の場面に既にボールmoveがあれば
   * （同actor同stepの置換で消えるのを防ぐため）新しい場面を追加して切り替える（addStep相当）。
   * 戻り値は生成先の場面番号と、新場面を作ったかどうか */
  const ensureBallStep = useCallback((): { step: number; created: boolean } => {
    const st = stateRef.current;
    const cur = activeStepRef.current;
    const hasBallMove = st.moves.some(
      (m) => m.actor === "ball" && (m.step ?? 0) === cur
    );
    if (!hasBallMove) return { step: cur, created: false };
    const next = stepCountOf(st.moves, st.stepCount);
    dispatch({ type: "ADD_STEP" });
    setActiveStepState(next);
    setSelMove(null);
    // 新しい場面の頭＝全アニメの末尾へ（addStepと同じ挙動）
    seek(animTotal(st.moves, st.stepCount));
    setViewStep(next);
    return { step: next, created: true };
  }, [seek, setViewStep]);

  /** 保持者から receiver へのパスを生成する（前提条件は呼び出し側でガード済み） */
  const passTo = useCallback(
    (receiver: Actor) => {
      const st = stateRef.current;
      // 出し手は「その場面の保持者」から特定する（selActorに依存しない＝タップ操作でもボールのドラッグ＆ドロップでも同じ結果になる）
      const curStep = activeStepRef.current;
      const passer = holderAtStep(curStep) ?? holderAtStepEnd(curStep);
      if (passer == null) return;
      // 生成先の場面（現在の場面にボールmoveが既にあれば新場面を作って連鎖）
      const { step, created } = ensureBallStep();
      const t0 = stepStartTime(st.moves, step);
      // 出し手の生成先場面のルート終了オフセット（なければ0＝その場から出す。
      // 新場面にはルートが無いため endOff=0・位置は前場面終了時点になる）
      const passerMove = st.moves.find(
        (m) => m.actor === passer && (m.step ?? 0) === step
      );
      const endOff = passerMove ? passerMove.start + passerMove.dur : 0;
      const fromPos = actorPos(passer, t0 + endOff, st.moves, st.slots, st.ball, st.opponents, st.holder);
      // 受け手の生成先場面のルートがあればその終点（走り込みの先）、なければ現在位置
      const receiverMove = st.moves.find(
        (m) => m.actor === receiver && (m.step ?? 0) === step
      );
      const toPos = receiverMove
        ? { ...receiverMove.path[receiverMove.path.length - 1] }
        : actorPos(receiver, t0, st.moves, st.slots, st.ball, st.opponents, st.holder);
      const path = [fromPos, toPos];
      dispatch({
        type: "ADD_MOVE",
        actor: "ball",
        path,
        step,
        start: endOff,
        dur: Math.max(0.4, durFromPath(path) * 0.5),
        kind: "pass",
        to: receiver,
      });
      setSelActor(receiver);
      setSelMove(null);
      showToast(
        created
          ? `${actorDisplayName(st, receiver)}へパス（場面${step + 1}に追加）`
          : `${actorDisplayName(st, receiver)}へパス`
      );
      setTimeout(() => playStep(step), 60);
    },
    [ensureBallStep, showToast, playStep, holderAtStep, holderAtStepEnd]
  );

  /** 保持者(selActor)からゴールへのシュートを生成する（前提条件は呼び出し側でガード済み） */
  const shoot = useCallback(() => {
    const st = stateRef.current;
    const passer = selActorRef.current;
    if (passer == null) return;
    // 生成先の場面（現在の場面にボールmoveが既にあれば新場面を作って連鎖）
    const { step, created } = ensureBallStep();
    const t0 = stepStartTime(st.moves, step);
    const passerMove = st.moves.find(
      (m) => m.actor === passer && (m.step ?? 0) === step
    );
    const endOff = passerMove ? passerMove.start + passerMove.dur : 0;
    const fromPos = actorPos(passer, t0 + endOff, st.moves, st.slots, st.ball, st.opponents, st.holder);
    const target = { x: 50, y: 97 };
    const path = [fromPos, target];
    dispatch({
      type: "ADD_MOVE",
      actor: "ball",
      path,
      step,
      start: endOff,
      dur: Math.max(0.3, durFromPath(path) * 0.35),
      kind: "shot",
      to: "goal",
    });
    setSelActor(null);
    showToast(created ? `シュート！（場面${step + 1}に追加）` : "シュート！");
    setTimeout(() => playStep(step), 60);
  }, [ensureBallStep, showToast, playStep]);

  // ---- 場面（ステップ） ----
  /** 場面を選択し、その頭出し位置へ盤面を合わせる */
  const setActiveStep = useCallback(
    (s: number) => {
      setActiveStepState(s);
      setSelMove(null);
      const st = stateRef.current;
      seek(stepStartTime(st.moves, s));
      // 空の場面など境界時刻では時刻からの逆算が曖昧なため明示的に合わせる
      setViewStep(s);
    },
    [seek, setViewStep]
  );

  const addStep = useCallback(() => {
    const st = stateRef.current;
    const next = stepCountOf(st.moves, st.stepCount);
    dispatch({ type: "ADD_STEP" });
    setActiveStepState(next);
    setSelMove(null);
    // 新しい場面の頭＝全アニメの末尾へ
    seek(animTotal(st.moves, st.stepCount));
    setViewStep(next);
  }, [seek, setViewStep]);

  const removeStep = useCallback(
    (s: number) => {
      dispatch({ type: "DELETE_STEP", step: s });
      setSelMove(null);
      setSelActor(null);
      const st = stateRef.current;
      const next = Math.max(0, Math.min(s, stepCountOf(st.moves, st.stepCount) - 2));
      setActiveStepState(next);
      // dispatch反映前のmovesでは正確に頭出しできないため、次フレームで合わせる
      setTimeout(() => {
        seek(stepStartTime(stateRef.current.moves, next));
        setViewStep(next);
      }, 0);
    },
    [seek, setViewStep]
  );

  // ---- studio open/close ----
  const openStudio = useCallback(() => {
    setShowPaths(true);
    setSelActor(null);
    setSelMove(null);
    setPenMode(false);
    // 図形パレット・選手タップ待ちを引き継がないよう明示的に閉じる
    setShapesOpen(false);
    setActiveStepState(0);
    setViewStep(0);
    play.current.t = 0;
    setMode("anim");
  }, [setViewStep, setShapesOpen]);
  const closeStudio = useCallback(() => {
    stopPlay();
    play.current.t = 0;
    playUntil.current = null;
    // 再生・シークで動かしたトークンを配置位置へ戻す
    // （インラインstyleはReactの再描画では巻き戻らないため明示的にリセット）
    const st = stateRef.current;
    tokenEls.current.forEach((el, actor) => {
      const p =
        actor === "ball"
          ? st.ball
          : typeof actor === "number"
            ? st.slots[actor]
            : (st.opponents ?? [])[oppIndex(actor)];
      if (!p) return;
      el.style.left = p.x + "%";
      el.style.top = yToTop(p.y, st.pitchView) + "%";
    });
    setFullplay(false);
    setSelActor(null);
    setSelMove(null);
    // 図形パレット・選手タップ待ちを編集モードへ引き継がないよう明示的に閉じる
    setShapesOpen(false);
    setTempDraw(null);
    setActiveStepState(0);
    setViewStep(0);
    setMode("edit");
  }, [stopPlay, setTempDraw, setViewStep, setShapesOpen]);

  // ---- sheet ----
  const openSheet = useCallback((s: SheetState) => setSheet(s), []);
  const closeSheet = useCallback(() => setSheet({ type: null }), []);
  // 画面遷移時は必ずグローバルシートを閉じる（遷移先の画面でPCモーダルとして
  // 残留・復活するのを防ぐ）。setScreen→openSheetの順で呼ぶ既存フローは、
  // 直後のopenSheetが最終的なsheet値を上書きするため影響しない
  const setScreen = useCallback((s: ScreenName) => {
    // board/drill/library へ入るときだけ navFrom を更新する（直前画面がhomeならhome、
    // それ以外（coaching含む）はcoachingへ丸める。詳細な履歴は持たず単純化）
    if (s === "board" || s === "drill" || s === "library") {
      setNavFromState(screenRef.current === "home" ? "home" : "coaching");
    } else if (s === "setpiece") {
      // 選手は「その他」ハブ（OtherHub）からも入れるため、その場合は other へ丸める
      // （mobile-redesign-v2 §2）。コーチはOtherHubからsetpieceへ入らないため
      // 実質home/coachingの2値のまま
      setNavFromState(
        screenRef.current === "home" ? "home" : screenRef.current === "other" ? "other" : "coaching"
      );
    } else if (s === "articles" || s === "settings") {
      // コーチラボ・設定はホームの行／その他ハブの行のどちらからも開けるため、
      // その2値だけ丸める（mobile-redesign-v2 §2）
      setNavFromState(screenRef.current === "home" ? "home" : "other");
    }
    setSheet({ type: null });
    setScreenState(s);
  }, []);

  // ---- library / plan / share actions ----
  const cloneTactic = useCallback(() => {
    const s = stateRef.current;
    return {
      formation: s.formation,
      slots: s.slots.map((x) => ({ ...x })),
      ball: { ...s.ball },
      moves: s.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
      holder: s.holder ?? null,
      opponents: (s.opponents ?? []).map((o) => ({ ...o })),
      drawings: (s.drawings ?? []).map((d) => ({
        ...d,
        path: d.path.map((p) => ({ ...p })),
      })),
      shapes: (s.shapes ?? []).map((sh) =>
        sh.kind === "arrow"
          ? { ...sh, p0: { ...sh.p0 }, p1: { ...sh.p1 }, c: { ...sh.c } }
          : sh.kind === "link" || sh.kind === "hull"
            ? { ...sh, actors: [...sh.actors] }
            : { ...sh }
      ),
      stepCount: stepCountOf(s.moves, s.stepCount),
      guides: { ...(s.guides ?? {}) },
      pitchView: s.pitchView ?? "full",
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
        holder: play.holder ?? null,
        opponents: (play.opponents ?? []).map((o) => ({ ...o })),
        drawings: (play.drawings ?? []).map((d) => ({ ...d, path: d.path.map((p) => ({ ...p })) })),
        shapes: (play.shapes ?? []).map((sh) =>
          sh.kind === "arrow"
            ? { ...sh, p0: { ...sh.p0 }, p1: { ...sh.p1 }, c: { ...sh.c } }
            : sh.kind === "link" || sh.kind === "hull"
              ? { ...sh, actors: [...sh.actors] }
              : { ...sh }
        ),
        stepCount: play.stepCount ?? 1,
        guides: { ...(play.guides ?? {}) },
        pitchView: play.pitchView ?? "full",
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
        holder: play.holder ?? null,
        opponents: (play.opponents ?? []).map((o) => ({ ...o })),
        drawings: (play.drawings ?? []).map((d) => ({ ...d, path: d.path.map((p) => ({ ...p })) })),
        shapes: (play.shapes ?? []).map((sh) =>
          sh.kind === "arrow"
            ? { ...sh, p0: { ...sh.p0 }, p1: { ...sh.p1 }, c: { ...sh.c } }
            : sh.kind === "link" || sh.kind === "hull"
              ? { ...sh, actors: [...sh.actors] }
              : { ...sh }
        ),
        stepCount: play.stepCount ?? 1,
        guides: { ...(play.guides ?? {}) },
        pitchView: play.pitchView ?? "full",
      });
      setCurrentPlayId(null);
      setSheet({ type: null });
      setScreen("board");
      showToast(`「${play.title}」を表示しました`);
    },
    [stopPlay, showToast]
  );

  /** 埋め込みのセットプレーデータ（チャット添付・記事添付など）を第2文書スロットへ読み込んで表示する。
   * loadPlayData と同じ「直接方式」だが、常に spDispatch を使いセットプレー画面へ遷移する */
  const loadSetPieceData = useCallback(
    (item: SavedSetPiece) => {
      stopPlay();
      setMode("edit");
      setSelActor(null);
      // SavedSetPiece は名簿(players)を含まない（チーム側で共有）ため、pid は現行の名簿を
      // 前提に解決する。チャット/記事添付など別コンテキストで作られた文書は、現行名簿に
      // 存在しないpidを参照しうるため、割当解除してtoastで1回だけ知らせる
      const knownIds = new Set(playStateRef.current.players.map((p) => p.id));
      let droppedAny = false;
      const slots = item.slots.map((s) => {
        if (s.pid != null && !knownIds.has(s.pid)) {
          droppedAny = true;
          return { ...s, pid: null };
        }
        return { ...s };
      });
      spDispatch({
        type: "LOAD_TACTIC",
        formation: item.formation,
        slots,
        ball: { ...item.ball },
        moves: item.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
        holder: item.holder ?? null,
        opponents: (item.opponents ?? []).map((o) => ({ ...o })),
        drawings: (item.drawings ?? []).map((d) => ({ ...d, path: d.path.map((p) => ({ ...p })) })),
        shapes: (item.shapes ?? []).map((sh) =>
          sh.kind === "arrow"
            ? { ...sh, p0: { ...sh.p0 }, p1: { ...sh.p1 }, c: { ...sh.c } }
            : sh.kind === "link" || sh.kind === "hull"
              ? { ...sh, actors: [...sh.actors] }
              : { ...sh }
        ),
        stepCount: item.stepCount ?? 1,
        guides: { ...(item.guides ?? {}) },
        pitchView: item.pitchView ?? "full",
        setPiece: item.setPiece,
      });
      setCurrentSetPieceId(null);
      setSheet({ type: null });
      setScreen("setpiece");
      showToast(droppedAny ? "一部の選手を割当解除しました" : `「${item.title}」を表示しました`);
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
  const patchNote = useCallback((id: string, patch: Partial<NotebookEntry>) => {
    setNotebook((list) =>
      list.map((n) => (n.id === id ? ({ ...n, ...patch } as NotebookEntry) : n))
    );
  }, []);
  const deleteNote = useCallback((id: string) => {
    setNotebook((list) => list.filter((n) => n.id !== id));
  }, []);
  const setNoteComment = useCallback(
    (id: string, comment: string, drawing?: { plays: PlayPoint[]; playLines: PlayLine[] }) => {
      setNotebook((list) =>
        list.map((n) =>
          n.id === id
            ? {
                ...n,
                staffComment: comment.trim() || undefined,
                staffCommentTs: Date.now(),
                // drawing省略時は既存の図を保持（黙って消さない）
                ...(drawing !== undefined ? { staffDrawing: drawing } : {}),
              }
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
  // groups-everywhere Phase D-1(C1-major): removeGroup/setSchoolStageの後始末用
  const removeDeliverableTargetGroup = useCallback((groupId: string) => {
    setDeliverables((list) =>
      list.map((d) => {
        if (!d.targetGroupIds?.includes(groupId)) return d;
        const rest = d.targetGroupIds.filter((x) => x !== groupId);
        return { ...d, targetGroupIds: rest.length > 0 ? rest : undefined } as CoachDeliverable;
      })
    );
  }, []);

  // ---- コーチラボ（ユーザー投稿記事） ----
  const addUserArticle = useCallback(
    (a: Omit<UserArticle, "id" | "ts" | "updatedAt">): string => {
      const id = newArticleId();
      const now = Date.now();
      const full: UserArticle = { ...a, id, ts: now, updatedAt: now };
      setUserArticles((list) => [full, ...list]);
      return id;
    },
    []
  );
  const updateUserArticle = useCallback((a: UserArticle) => {
    setUserArticles((list) =>
      list.map((x) => (x.id === a.id ? { ...a, updatedAt: Date.now() } : x))
    );
  }, []);
  const removeUserArticle = useCallback((id: string) => {
    setUserArticles((list) => list.filter((x) => x.id !== id));
  }, []);

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
    setSelMove(null);
    setActiveStepState(0);
    setPenMode(false);
    dispatch({ type: "NEW_TACTIC", formation: stateRef.current.formation });
    setCurrentPlayId(null);
    persistSettings({ currentPlayId: null });
    setSheet({ type: null });
    // 盤面を新規化したら必ず盤面へ移動する。ライブラリ画面/シートから呼ぶと
    // 「押しても何も起きないのに編集内容だけ消える」行き止まりになるため
    setScreen("board");
    showToast("新しい戦術を作成しました");
  }, [stopPlay, showToast, persistSettings]);

  // ---- セットプレーデザイン（第2文書スロット＝spState。保存先はライブラリのsetPieces） ----
  const saveSetPiece = useCallback(
    (title: string, folderId: string | null): boolean => {
      const meta = stateRef.current.setPiece;
      if (!meta) return false;
      const item: SavedSetPiece = {
        id: newPid(),
        title: title.trim() || "無題のセットプレー",
        folderId,
        ...cloneTactic(),
        updatedAt: Date.now(),
        setPiece: meta,
      };
      setLibrary((lib) => ({ ...lib, setPieces: [item, ...(lib.setPieces ?? [])] }));
      setCurrentSetPieceId(item.id);
      showToast(`「${item.title}」を保存しました`);
      return true;
    },
    [cloneTactic, showToast]
  );

  const saveCurrentSetPiece = useCallback(() => {
    if (!currentSetPieceId) {
      setSheet({ type: "save" });
      return;
    }
    const meta = stateRef.current.setPiece;
    if (!meta) return;
    const t = cloneTactic();
    setLibrary((lib) => ({
      ...lib,
      setPieces: (lib.setPieces ?? []).map((p) =>
        p.id === currentSetPieceId ? { ...p, ...t, updatedAt: Date.now(), setPiece: meta } : p
      ),
    }));
    showToast("上書き保存しました");
  }, [currentSetPieceId, cloneTactic, showToast]);

  const loadSetPiece = useCallback(
    (id: string) => {
      const item = stateLibRef.current.setPieces?.find((p) => p.id === id);
      if (!item) return;
      stopPlay();
      setMode("edit");
      setSelActor(null);
      setSelMove(null);
      // SavedSetPiece は名簿(players)を含まない（チーム側で共有）ため、pid は現行の名簿を
      // 前提に解決する。以前の名簿状態で保存された文書は、現行名簿に存在しないpidを
      // 参照しうるため、割当解除してtoastで1回だけ知らせる
      const knownIds = new Set(playStateRef.current.players.map((p) => p.id));
      let droppedAny = false;
      const slots = item.slots.map((s) => {
        if (s.pid != null && !knownIds.has(s.pid)) {
          droppedAny = true;
          return { ...s, pid: null };
        }
        return { ...s };
      });
      spDispatch({
        type: "LOAD_TACTIC",
        formation: item.formation,
        slots,
        ball: { ...item.ball },
        moves: item.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
        holder: item.holder ?? null,
        opponents: (item.opponents ?? []).map((o) => ({ ...o })),
        drawings: (item.drawings ?? []).map((d) => ({ ...d, path: d.path.map((p) => ({ ...p })) })),
        shapes: (item.shapes ?? []).map((sh) =>
          sh.kind === "arrow"
            ? { ...sh, p0: { ...sh.p0 }, p1: { ...sh.p1 }, c: { ...sh.c } }
            : sh.kind === "link" || sh.kind === "hull"
              ? { ...sh, actors: [...sh.actors] }
              : { ...sh }
        ),
        stepCount: item.stepCount ?? 1,
        guides: { ...(item.guides ?? {}) },
        pitchView: item.pitchView ?? "full",
        setPiece: item.setPiece,
      });
      setCurrentSetPieceId(id);
      setSpSnapshot(null);
      // レビュー指摘(2回目・major): 別文書を開いたら基準も破棄する（前の文書の基準が
      // 残ったままだと、isSetPieceLayoutEdited()が新しい文書の座標をおかしな基準と比較して
      // しまう。この文書自体はcurrentSetPieceId!=nullでisDirty()が既にtrueを返すため
      // 実害は無いが、setSpSnapshot(null)と同じ理由で揃えておく） */
      setSpLayoutBaseline(null);
      setSheet({ type: null });
      setScreen("setpiece");
      showToast(droppedAny ? "一部の選手を割当解除しました" : `「${item.title}」を読み込みました`);
    },
    [stopPlay, showToast]
  );

  const deleteSetPiece = useCallback(
    (id: string) => {
      setLibrary((lib) => ({
        ...lib,
        setPieces: (lib.setPieces ?? []).filter((p) => p.id !== id),
      }));
      setCurrentSetPieceId((cur) => (cur === id ? null : cur));
      showToast("削除しました");
    },
    [showToast]
  );

  const duplicateSetPiece = useCallback(
    (id: string) => {
      const src = stateLibRef.current.setPieces?.find((p) => p.id === id);
      if (!src) return;
      const copy: SavedSetPiece = {
        ...src,
        id: newPid(),
        title: src.title + "（コピー）",
        slots: src.slots.map((s) => ({ ...s })),
        ball: { ...src.ball },
        moves: src.moves.map((m) => ({ ...m, path: m.path.map((p) => ({ ...p })) })),
        updatedAt: Date.now(),
      };
      setLibrary((lib) => ({ ...lib, setPieces: [copy, ...(lib.setPieces ?? [])] }));
      showToast("複製しました");
    },
    [showToast]
  );

  const renameSetPiece = useCallback((id: string, title: string) => {
    setLibrary((lib) => ({
      ...lib,
      setPieces: (lib.setPieces ?? []).map((p) =>
        p.id === id ? { ...p, title: title.trim() || p.title } : p
      ),
    }));
  }, []);

  /** 現在のセットプレー文書を SavedSetPiece スナップショットにして返す（保存せずに送信する用途）。
   * setPiece メタが無い（＝セットプレー文書を開いていない）ときは null */
  const snapshotSetPiece = useCallback(
    (title: string): SavedSetPiece | null => {
      const meta = stateRef.current.setPiece;
      if (!meta) return null;
      return {
        id: newPid(),
        title: title.trim() || "無題のセットプレー",
        folderId: null,
        ...cloneTactic(),
        updatedAt: Date.now(),
        setPiece: meta,
      };
    },
    [cloneTactic]
  );

  /** 種別・攻守・人数（と将来のorigin）で新規セットプレー文書を作り、setpiece画面へ遷移する
   * （保存中のIDは外す）。applySetPieceLayoutと同じ入力形（SetPieceLayoutInput）で呼べる
   * ようにし、旧プリセットidベースのAPIから置き換えた（唯一の呼び出し元だった操作列の
   * 「新規作成」は右上へ移った＝setpiece-redesign §7） */
  const newSetPiece = useCallback(
    (input: SetPieceLayoutInput) => {
      const layout = buildSetPieceLayout(input);
      // レビュー指摘(1回目): 種別チップ経由(applySetPieceLayout)は直前の盤面へ「元に戻す」で
      // 戻せるのに、新規作成だけスナップショットを捨てていて非対称だった。別文書を開く
      // （loadSetPiece/applyImport）ときだけ破棄し、新規作成は直前の盤面を1件だけ覚える
      setSpSnapshot(stateRef.current);
      stopPlay();
      setMode("edit");
      setSelActor(null);
      setSelMove(null);
      setActiveStepState(0);
      setPenMode(false);
      spDispatch({
        type: "HYDRATE",
        state: buildSetPieceStateFromLayout(
          layout,
          input,
          playStateRef.current.players,
          playStateRef.current.teamName,
          playStateRef.current.captain,
          playStateRef.current.slots.map((s) => s.pid).filter((id): id is string => !!id)
        ),
      });
      setSpLayoutBaseline(snapshotSpLayout({ ball: layout.ball, slots: layout.slots, opponents: layout.opps }));
      setCurrentSetPieceId(null);
      setSheet({ type: null });
      // 新規化したら必ずセットプレー画面へ移動する（newPlayと同じ配慮）
      setScreen("setpiece");
      showToast("新しいセットプレーを作成しました");
    },
    [stopPlay, showToast, buildSetPieceStateFromLayout]
  );

  /** 現在のセットプレー文書へ、別プリセットの初期配置を適用し直す（保存中IDは変えない＝上書き保存で反映）。
   * 旧データ（ゴールキック・PK・旧CK/FK/スローインプリセット）用に残す。新規の種別・攻守・人数の
   * チップ操作は applySetPieceLayout を使う */
  const applySetPiecePreset = useCallback(
    (presetId: string) => {
      const preset = getSetPiecePreset(presetId);
      if (!preset) return;
      stopPlay();
      setSelActor(null);
      setSelMove(null);
      const nextState = buildSetPieceState(
        preset,
        playStateRef.current.players,
        playStateRef.current.teamName,
        playStateRef.current.captain
      );
      spDispatch({ type: "HYDRATE", state: nextState });
      setSpLayoutBaseline(snapshotSpLayout(nextState));
      showToast(`「${preset.label}」を適用しました`);
    },
    [stopPlay, showToast]
  );

  /** 現在のセットプレー文書へ、種別・攻守・人数（と将来のorigin）から作った基本配置を
   * 適用し直す（保存中IDは変えない＝上書き保存で反映。setpiece-redesign §1）。
   * 適用前の状態を1件だけ覚え、restoreSetPieceSnapshotで盤面そのものを戻せるようにする */
  const applySetPieceLayout = useCallback(
    (input: SetPieceLayoutInput) => {
      const layout = buildSetPieceLayout(input);
      setSpSnapshot(stateRef.current);
      stopPlay();
      setSelActor(null);
      setSelMove(null);
      spDispatch({
        type: "HYDRATE",
        state: buildSetPieceStateFromLayout(
          layout,
          input,
          playStateRef.current.players,
          playStateRef.current.teamName,
          playStateRef.current.captain,
          playStateRef.current.slots.map((s) => s.pid).filter((id): id is string => !!id)
        ),
      });
      setSpLayoutBaseline(snapshotSpLayout({ ball: layout.ball, slots: layout.slots, opponents: layout.opps }));
      showToast("基本配置を適用しました");
    },
    [stopPlay, showToast, buildSetPieceStateFromLayout]
  );

  /** applySetPieceLayout/newSetPiece が直前に覚えたBoardStateへ戻す（プリセットidの
   * 再適用ではなく盤面そのものを戻す＝setpiece-redesign §1）。1件だけなので戻したら消費する */
  const restoreSetPieceSnapshot = useCallback(() => {
    if (!spSnapshot) return;
    spDispatch({ type: "HYDRATE", state: spSnapshot });
    setSpLayoutBaseline(snapshotSpLayout(spSnapshot));
    setSpSnapshot(null);
    showToast("直前の配置に戻しました");
  }, [spSnapshot, showToast]);

  /** isDirty()（SetPieceBar.tsx）が使う追加チェック：直近に生成した基本配置から
   * slots/opponents/ballの座標が動かされたか（レビュー指摘(1回目)）。基準が無ければfalse */
  const isSetPieceLayoutEdited = useCallback((): boolean => {
    const baseline = spLayoutBaseline;
    if (!baseline) return false;
    const s = stateRef.current;
    const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
    if (!eq(s.ball.x, baseline.ball.x) || !eq(s.ball.y, baseline.ball.y)) return true;
    if (s.slots.length !== baseline.slots.length) return true;
    if (s.slots.some((sl, i) => !eq(sl.x, baseline.slots[i].x) || !eq(sl.y, baseline.slots[i].y))) return true;
    const opps = s.opponents ?? [];
    if (opps.length !== baseline.opponents.length) return true;
    if (opps.some((o, i) => !eq(o.x, baseline.opponents[i].x) || !eq(o.y, baseline.opponents[i].y))) return true;
    return false;
  }, [spLayoutBaseline]);

  const flipSetPieceX = useCallback(() => {
    spDispatch({ type: "FLIP_X" });
  }, []);

  /** ボールの軌道（キック/スローのmove）を作成・更新・削除する（setpiece-redesign §4）。
   * 実体は場面0のボールの最初のmove。moveがnullなら削除する。既存のADD_MOVE/DELETE_MOVE
   * をそのまま再利用し、専用の保存形式は持たない。呼び出しはセットプレー画面からのみの
   * 想定なのでspDispatch（spStateへ直接）を使う（flipSetPieceXと同じ流儀） */
  const setSetPieceDelivery = useCallback((move: Move | null) => {
    if (move == null) {
      const idx = stateRef.current.moves.findIndex(
        (m) => m.actor === "ball" && (m.step ?? 0) === 0
      );
      if (idx >= 0) spDispatch({ type: "DELETE_MOVE", index: idx });
      return;
    }
    spDispatch({
      type: "ADD_MOVE",
      actor: "ball",
      path: move.path,
      step: 0,
      start: move.start,
      dur: move.dur,
      kind: move.kind,
      to: move.to,
      // レビュー指摘(1回目): buildDeliveryMoveが返すtoは「未設定(undefined)」も正しい結果
      // （狙う場所の近くに味方が居ない＝こぼれ球）なので、ADD_MOVEの「to未指定なら温存」規則に
      // 巻き込まれないようtoSetで明示的に上書きする（さもないと前回の受け手が残り続ける）
      toSet: true,
      trajectory: move.trajectory,
    });
  }, []);

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
      ...lib,
      folders: lib.folders.filter((f) => f.id !== id),
      plays: lib.plays.map((p) =>
        p.folderId === id ? { ...p, folderId: null } : p
      ),
      // setPieces も同じフォルダを参照しうるため、他フィールドと同様に付け替える
      // （...lib を使わず個別列挙のみだと setPieces が欠落・消失してしまうため明示的に処理する）
      setPieces: (lib.setPieces ?? []).map((p) =>
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

  // 保存はeffectではなく明示保存（persistSettingsと同じ思想。effect保存はStrictModeの
  // 初期値競合で保存済みデータを上書きしうるため避ける）
  /** 保存できたら true。容量超過で保存できないことがあるため呼び出し側で通知する */
  const setTeamLogo = useCallback((url: string | null) => {
    setTeamLogoState(url);
    return saveTeamLogo(url);
  }, []);

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
    const title = sp
      ? stateLibRef.current.setPieces?.find((p) => p.id === currentSetPieceId)?.title ?? null
      : stateLibRef.current.plays.find((p) => p.id === currentPlayId)?.title ?? null;
    return buildSnapshot(stateRef.current, title);
  }, [sp, currentPlayId, currentSetPieceId]);

  const applyImport = useCallback(() => {
    if (!pendingImport) return;
    const b = snapshotToBoard(pendingImport);
    stopPlay();
    setMode("edit");
    setSelActor(null);
    const toSetPiece = !!pendingImport.setPiece;
    const importAction = {
      type: "IMPORT_SHARED" as const,
      teamName: b.teamName,
      players: b.players,
      captain: b.captain,
      formation: b.formation,
      slots: b.slots,
      ball: b.ball,
      moves: b.moves,
      holder: b.holder,
      opponents: b.opponents,
      drawings: b.drawings,
      shapes: b.shapes,
      stepCount: b.stepCount,
      guides: b.guides,
      pitchView: b.pitchView,
      setPiece: b.setPiece,
    };
    // セットプレー文書への取込は、現在の画面に関わらず必ずセットプレー用の第2文書スロット
    // (spState)へ向ける。画面切替(setScreen)経由の汎用dispatchはレンダーを跨ぐまで
    // 反映されない（同一イベント内では旧画面のまま）ため、loadSetPiece等と同じくここでも
    // spDispatch を直接呼ぶ
    if (toSetPiece) {
      spDispatch(importAction);
      setCurrentSetPieceId(null);
      setSpSnapshot(null);
      // レビュー指摘(2回目・major): loadSetPieceと同じ理由で基準も破棄する
      setSpLayoutBaseline(null);
      setScreen("setpiece");
    } else {
      dispatch(importAction);
      setCurrentPlayId(null);
      persistSettings({ currentPlayId: null });
    }
    setPendingImport(null);
    if (typeof window !== "undefined")
      history.replaceState(null, "", window.location.pathname);
    setSheet({ type: null });
    showToast(toSetPiece ? "共有されたセットプレーを読み込みました" : "共有された戦術を読み込みました");
  }, [pendingImport, stopPlay, showToast, persistSettings]);

  // 共有リンク読み込みの破棄。pendingImportを消してURLの#p=…も除去し、
  // 開いている確認シート/バナーも閉じる（TacticsBoardの「破棄」・SheetManagerの
  // ImportSheetの「キャンセル」の双方から共通で呼ぶ）
  const discardImport = useCallback(() => {
    setPendingImport(null);
    if (typeof window !== "undefined")
      history.replaceState(null, "", window.location.pathname);
    setSheet({ type: null });
  }, []);

  // ---- action wrappers ----
  const value = useMemo<BoardContextValue>(
    () => ({
      state,
      setFormation: (key) => dispatch({ type: "SET_FORMATION", key }),
      assignPlayer: (slot, pid) => dispatch({ type: "ASSIGN", slot, pid }),
      removePlayer: (slot) => dispatch({ type: "REMOVE", slot }),
      assignMany: (pairs) => dispatch({ type: "ASSIGN_MANY", pairs }),
      unassignMany: (pairs) => dispatch({ type: "UNASSIGN_MANY", pairs }),
      setBenchSize: (n) => dispatch({ type: "SET_BENCH_SIZE", size: n }),
      benchAdd: (pid) => {
        // 満杯判定はここ（API層）で行い、UI側は結果のtoastを見るだけでよくする
        const st = stateRef.current;
        const size = benchSizeOf(st);
        if (benchOf(st).length >= size) {
          showToast(`ベンチが満員です（${size}/${size}）。枠を増やすか、誰かを外してください`);
          return;
        }
        dispatch({ type: "BENCH_ADD", pid });
      },
      benchRemove: (pid) => dispatch({ type: "BENCH_REMOVE", pid }),
      swapSlots: (a, b) => dispatch({ type: "SWAP", a, b }),
      moveSlot: (slot, x, y, role) =>
        dispatch({ type: "MOVE_SLOT", slot, x, y, role }),
      setBall: (x, y) => dispatch({ type: "SET_BALL", x, y }),
      setHolder: (holder) => dispatch({ type: "SET_HOLDER", holder }),
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
      addMove: (actor, path) =>
        dispatch({ type: "ADD_MOVE", actor, path, step: activeStepRef.current }),
      mergeMoves: (ms) =>
        dispatch({ type: "MERGE_MOVES", moves: ms, step: activeStepRef.current }),
      updateMove: (index, patch) =>
        dispatch({ type: "UPDATE_MOVE", index, patch }),
      deleteMove: (index) => dispatch({ type: "DELETE_MOVE", index }),
      clearMoves: () => {
        setActiveStepState(0);
        setSelMove(null);
        dispatch({ type: "CLEAR_MOVES" });
      },
      undoMove: () => dispatch({ type: "UNDO_MOVE" }),
      activeStep,
      setActiveStep,
      stepCount: stepCountOf(state.moves, state.stepCount),
      addStep,
      removeStep,
      playStep,
      addOpponent: () => {
        const n = (stateRef.current.opponents ?? []).length;
        // PA拡大(paatk/padef。setpiece-redesign §6)は可視y範囲がboxatk/boxdefより狭い
        // （約y70-100/0-30）ため、従来のy=58基準のままだと枠外（見えず触れない位置）に
        // 追加されてしまう＝レビュー指摘(1回目)。PA拡大のときだけ可視範囲に収める
        // （boxatk/boxdef/fullは従来どおり）
        const view = stateRef.current.pitchView;
        const y =
          view === "paatk"
            ? Math.min(96, 72 + Math.floor(n / 5) * 6)
            : view === "padef"
            ? Math.max(4, 28 - Math.floor(n / 5) * 6)
            : 58 + Math.floor(n / 5) * 8;
        // 中央付近に少しずつずらして置く
        dispatch({
          type: "ADD_OPPONENT",
          x: 50 + ((n % 5) - 2) * 8,
          y,
        });
      },
      moveOpponent: (index, x, y) =>
        dispatch({ type: "MOVE_OPPONENT", index, x, y }),
      updateOpponentLabel: (index, label) =>
        dispatch({ type: "UPDATE_OPPONENT", index, label }),
      deleteOpponent: (index) => {
        dispatch({ type: "DELETE_OPPONENT", index });
        // 相手削除で図形が存在しない選手を指す可能性があるため選択中の図形も解除する
        setSelShape(null);
        // 削除対象・後続の opp インデックスを指していた選択状態を解除／詰め替える
        setSelActor((cur) => {
          if (cur == null || !isOppActor(cur)) return cur;
          const oi = oppIndex(cur);
          if (oi === index) return null;
          return oi > index ? (`opp${oi - 1}` as Actor) : cur;
        });
        setSelMove((cur) => {
          if (cur == null || !isOppActor(cur.actor)) return cur;
          const oi = oppIndex(cur.actor);
          if (oi === index) return null;
          return oi > index ? { ...cur, actor: `opp${oi - 1}` as Actor } : cur;
        });
      },
      penMode,
      setPenMode,
      penColor,
      setPenColor,
      penWidth,
      setPenWidth,
      penDash,
      setPenDash,
      penScope,
      setPenScope,
      viewStep,
      addStroke: (path) =>
        dispatch({
          type: "ADD_STROKE",
          stroke: {
            id: newStrokeId(),
            path,
            color: penRef.current.color,
            width: penRef.current.width,
            dash: penRef.current.dash || undefined,
            // 「この場面のみ」設定時（アニメ中）は現在の場面に紐づける
            step:
              mode === "anim" && penScope === "step"
                ? activeStepRef.current
                : undefined,
          },
        }),
      updateStroke: (id, patch) => dispatch({ type: "UPDATE_STROKE", id, patch }),
      deleteStroke: (id) => {
        dispatch({ type: "DELETE_STROKE", id });
        setSelStrokeState((cur) => (cur === id ? null : cur));
      },
      undoStroke: () => {
        // 表示中のストロークのうち最後の1本を取り消す
        const ds = stateRef.current.drawings ?? [];
        const visible = (d: PenStroke) =>
          mode === "edit"
            ? d.step == null
            : d.step == null || d.step === activeStepRef.current;
        for (let i = ds.length - 1; i >= 0; i--) {
          if (visible(ds[i]) && ds[i].id) {
            dispatch({ type: "DELETE_STROKE", id: ds[i].id as string });
            return;
          }
        }
      },
      clearStrokes: () =>
        dispatch({
          type: "CLEAR_STROKES",
          step: mode === "anim" ? activeStepRef.current : null,
        }),
      selStroke,
      setSelStroke,
      shapesOpen,
      setShapesOpen,
      selShape,
      setSelShape,
      shapeColor,
      setShapeColor,
      addShape: (kind) => {
        const id = newShapeId();
        let shape: Shape;
        if (kind === "zoneEllipse" || kind === "zoneRect") {
          shape = { id, kind, x: 50, y: 50, w: 24, h: 16, color: shapeColor };
        } else if (kind === "arrow") {
          shape = {
            id,
            kind,
            p0: { x: 40, y: 45 },
            p1: { x: 60, y: 60 },
            c: { x: 50, y: 56 },
            color: shapeColor,
          };
        } else {
          // 引数型を縮小したため、ここに到達するのは kind === "text" のみ
          shape = { id, kind: "text", x: 50, y: 50, text: "テキスト", color: shapeColor };
        }
        dispatch({ type: "ADD_SHAPE", shape });
        setSelShape(id);
      },
      updateShape: (id, patch) => dispatch({ type: "UPDATE_SHAPE", id, patch }),
      deleteShape: (id) => {
        dispatch({ type: "DELETE_SHAPE", id });
        setSelShapeState((cur) => (cur === id ? null : cur));
      },
      pendingShape,
      pendingShapeRef,
      startPendingShape: (kind) => {
        setSelShape(null);
        setPendingShape({ kind, actors: [] });
        showToast("選手をタップして選択してください");
      },
      pendingShapeTap: (actor) => {
        const p = pendingShapeRef.current;
        if (!p) return;
        if (p.actors.includes(actor)) return; // 重複タップは無視
        setPendingShape({ ...p, actors: [...p.actors, actor] });
      },
      confirmPendingShape: () => {
        const p = pendingShapeRef.current;
        if (!p) return;
        const minCount = p.kind === "link" ? 2 : 3;
        if (p.actors.length < minCount) {
          showToast(`選手をあと${minCount - p.actors.length}人タップしてください`);
          return;
        }
        const id = newShapeId();
        const shape: Shape =
          p.kind === "link"
            ? { id, kind: "link", actors: p.actors, color: shapeColor }
            : { id, kind: "hull", actors: p.actors, color: shapeColor };
        dispatch({ type: "ADD_SHAPE", shape });
        setSelShape(id);
        setPendingShape(null);
      },
      cancelPendingShape: () => setPendingShape(null),
      registerShapeEl,
      getShapeEl,
      syncAttachedShapes,
      setGuides: (patch) => dispatch({ type: "SET_GUIDES", patch }),
      setPitchView: (view) => dispatch({ type: "SET_PITCH_VIEW", view }),
      showGhost,
      setShowGhost,
      showDrawings,
      setShowDrawings,
      animTool,
      setAnimTool,
      translateActor: (actor, dx, dy) => {
        dispatch({ type: "TRANSLATE_ACTOR", actor, dx, dy });
        // ルートが平行移動した後の表示位置を現在の再生ヘッドに合わせ直す
        setTimeout(() => applyPlayhead(play.current.t), 50);
      },
      mode,
      selActor,
      setSelActor,
      selMove,
      setSelMove,
      holderAtStep,
      holderAtStepEnd,
      passTo,
      shoot,
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
      teamLogo,
      setTeamLogo,
      playerPassword,
      setPlayerPassword,
      matchesPublic,
      setMatchesPublic,
      drillIntent,
      setDrillIntent,
      teamIntent,
      setTeamIntent,
      messages,
      sendMessage,
      removeMessage,
      snapshotPlay,
      loadPlayData,
      loadSetPieceData,
      incomingDrill,
      setIncomingDrill,
      openDrillData,
      notebook,
      addNote,
      updateNote,
      patchNote,
      deleteNote,
      setNoteComment,
      deliverables,
      addDeliverable,
      updateDeliverable,
      removeDeliverable,
      respondDeliverable,
      removeDeliverableTargetGroup,
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
      discardImport,
      currentSetPieceId,
      currentSetPieceTitle:
        library.setPieces?.find((p) => p.id === currentSetPieceId)?.title ?? null,
      saveSetPiece,
      saveCurrentSetPiece,
      loadSetPiece,
      deleteSetPiece,
      duplicateSetPiece,
      renameSetPiece,
      snapshotSetPiece,
      newSetPiece,
      applySetPiecePreset,
      applySetPieceLayout,
      canRestoreSetPiece: spSnapshot != null,
      restoreSetPieceSnapshot,
      isSetPieceLayoutEdited,
      flipSetPieceX,
      setSetPieceDelivery,
      spTrajOpen,
      setSpTrajOpen,
      userArticles,
      addUserArticle,
      updateUserArticle,
      removeUserArticle,
      screen,
      setScreen,
      navFrom,
      auth: session,
    }),
    [
      state,
      mode,
      selActor,
      selMove,
      holderAtStep,
      holderAtStepEnd,
      passTo,
      shoot,
      activeStep,
      setActiveStep,
      addStep,
      removeStep,
      playStep,
      penMode,
      penColor,
      penWidth,
      penDash,
      penScope,
      viewStep,
      shapesOpen,
      setShapesOpen,
      selShape,
      selStroke,
      shapeColor,
      pendingShape,
      registerShapeEl,
      getShapeEl,
      syncAttachedShapes,
      animTool,
      isPlaying,
      speed,
      showPaths,
      showGhost,
      showDrawings,
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
      teamLogo,
      setTeamLogo,
      playerPassword,
      setPlayerPassword,
      matchesPublic,
      setMatchesPublic,
      drillIntent,
      setDrillIntent,
      teamIntent,
      setTeamIntent,
      messages,
      sendMessage,
      removeMessage,
      snapshotPlay,
      loadPlayData,
      loadSetPieceData,
      incomingDrill,
      openDrillData,
      notebook,
      addNote,
      updateNote,
      patchNote,
      deleteNote,
      setNoteComment,
      deliverables,
      addDeliverable,
      updateDeliverable,
      removeDeliverable,
      respondDeliverable,
      removeDeliverableTargetGroup,
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
      discardImport,
      currentSetPieceId,
      saveSetPiece,
      saveCurrentSetPiece,
      loadSetPiece,
      deleteSetPiece,
      duplicateSetPiece,
      renameSetPiece,
      snapshotSetPiece,
      newSetPiece,
      applySetPiecePreset,
      applySetPieceLayout,
      spSnapshot,
      restoreSetPieceSnapshot,
      isSetPieceLayoutEdited,
      flipSetPieceX,
      setSetPieceDelivery,
      spTrajOpen,
      setSpTrajOpen,
      userArticles,
      addUserArticle,
      updateUserArticle,
      removeUserArticle,
      screen,
      navFrom,
      session,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
