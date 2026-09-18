// 戦術ボードのスタメン／ベンチ／メンバー外（board-squad-and-pc-polish §2-1）のヘルパー集約。
// スタメンはslots[].pid、ベンチはBoardState.benchIds、メンバー外はどちらでもない選手、という
// 3つの排他的な集合として扱う。benchIds/メンバー外は互いに素（差集合）なので、枠数の増減や
// ベンチ操作はbenchIdsだけを付け替えれば良く、メンバー外側の付け替えは不要（outsideOfが
// 自動的に導出する）。セットプレー用の第2文書（BoardState.setPiece定義済み）はベンチの概念を
// 持たないため、ここの関数はすべてsetPiece定義済みのstateを素通し（無変更）で返す。

import type { BoardState, EventSquad, Player } from "./types";

/** ベンチの既定枠数（BoardState.benchSize が未定義のときに使う） */
export const DEFAULT_BENCH_SIZE = 7;
const BENCH_SIZE_MIN = 0;
const BENCH_SIZE_MAX = 20;

/** ベンチ枠数を0〜20へ丸める */
export function clampBenchSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BENCH_SIZE;
  return Math.max(BENCH_SIZE_MIN, Math.min(BENCH_SIZE_MAX, Math.round(n)));
}

/** state.benchSize の実効値（未定義・範囲外は既定値へ丸める） */
export function benchSizeOf(state: BoardState): number {
  const n = state.benchSize;
  return typeof n === "number" ? clampBenchSize(n) : DEFAULT_BENCH_SIZE;
}

/** スタメン（slotsに入っている）選手idの集合 */
function starterIdsOf(state: BoardState): Set<string> {
  return new Set(state.slots.map((s) => s.pid).filter((x): x is string => !!x));
}

/** ベンチ入りの選手（benchIdsの並び順＝表示順。存在しない選手idは除く） */
export function benchOf(state: BoardState): Player[] {
  const ids = state.benchIds ?? [];
  return ids
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
}

/** メンバー外の選手（スタメンでもベンチでもない。名簿の並び順） */
export function outsideOf(state: BoardState): Player[] {
  const starters = starterIdsOf(state);
  const bench = new Set(state.benchIds ?? []);
  return state.players.filter((p) => !starters.has(p.id) && !bench.has(p.id));
}

/**
 * benchIds の整合を取る：スタメンと重なる id・存在しない選手 id・重複 id を除き、
 * 枠数（benchSize）を超えるぶんは末尾から切り捨てる。切り捨てられた選手は
 * benchIds/メンバー外が排他集合であることによりそのまま outsideOf 側に現れるため、
 * ここでは benchIds だけを直せばよい。reducer の各アクション（スタメン・ベンチ・名簿の
 * 増減が起こりうるもの）の最後に通す。中身に変化が無ければ同じ state 参照を返す。
 */
export function normalizeSquad(state: BoardState): BoardState {
  if (state.setPiece) return state;
  const raw = state.benchIds;
  if (!raw) return state;
  const starters = starterIdsOf(state);
  const validIds = new Set(state.players.map((p) => p.id));
  const size = benchSizeOf(state);
  const seen = new Set<string>();
  const benchIds: string[] = [];
  for (const id of raw) {
    if (!validIds.has(id) || starters.has(id) || seen.has(id)) continue;
    seen.add(id);
    if (benchIds.length < size) benchIds.push(id);
  }
  if (benchIds.length === raw.length && benchIds.every((id, i) => id === raw[i])) {
    return state;
  }
  return { ...state, benchIds };
}

/**
 * 旧データ（benchIds未定義）・初回シード（makeInitial）共通の1度きりの補完：
 * スタメン以外の選手を名簿順に先頭からbenchSize人ベンチへ入れる。
 * すでにbenchIdsがあるstate（空配列を含む）には何もしない。
 */
export function seedBenchIfMissing(state: BoardState): BoardState {
  if (state.setPiece) return state;
  if (state.benchIds) return state;
  const starters = starterIdsOf(state);
  const size = benchSizeOf(state);
  const benchIds = state.players
    .filter((p) => !starters.has(p.id))
    .slice(0, size)
    .map((p) => p.id);
  return { ...state, benchIds, benchSize: state.benchSize ?? DEFAULT_BENCH_SIZE };
}

/**
 * 試合予定に登録する EventSquad を、現在の戦術ボードの状態から組み立てる
 * (board-squad-and-pc-polish §2-4/§3)。starters は slots の順（空き枠は入れない。
 * 表示側での GK→DF→MF→FW 整列は呼び出し側＝lib/formations.ts の groupOf に任せる）、
 * bench は benchOf と同じ並び（存在しない選手idは含まれない）
 */
export function buildEventSquad(state: BoardState): EventSquad {
  return {
    formation: state.formation,
    starters: state.slots
      .filter((s) => s.pid != null)
      .map((s) => ({ role: s.role, playerId: s.pid as string })),
    bench: benchOf(state).map((p) => p.id),
    updatedAt: Date.now(),
  };
}
