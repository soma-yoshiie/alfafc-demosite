// ボールの軌道（キック/スロー）を扱う純粋関数群（setpiece-redesign §4）。
// 実体は場面0のボールの最初のmove（actor:"ball", step:0）。専用の保存形式は持たない
// （3D再生・アニメのスタジオ・書き出しがそのままmovesを読むだけで使える）。

import type { Actor, BallTrajectory, BoardState, Move, MoveKind, Point, Slot } from "./types";

/** 曲がり5段階。-2=左に大きく/-1=左/0=まっすぐ/1=右/2=右に大きく（進行方向基準） */
export type DeliveryBend = -2 | -1 | 0 | 1 | 2;

export interface Delivery {
  target: Point;
  trajectory: BallTrajectory;
  bend: DeliveryBend;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const M_PER_X = 0.68;
const M_PER_Y = 1.05;
/** メートル空間での距離（lib/setPieceLayouts.tsのdistMと同じ換算率） */
function distM(a: Point, b: Point): number {
  return Math.hypot((a.x - b.x) * M_PER_X, (a.y - b.y) * M_PER_Y);
}

/** 曲がりレベル→横ずれ比率（距離に対する割合）。0=まっすぐ・±1=0.12・±2=0.25 */
function bendRatio(bend: DeliveryBend): number {
  if (bend === 0) return 0;
  return Math.abs(bend) === 2 ? 0.25 : 0.12;
}

const BEZIER_POINTS = 12;

/** 進行方向(from→to)の右手側を正としたデータ空間の単位垂直ベクトル */
function perpOf(from: Point, to: Point): { x: number; y: number; len: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dy / len, y: -dx / len, len };
}

/** 2次ベジェ（p0→p1、制御点c）をn点に均等分割する */
function quadBezierPoints(p0: Point, c: Point, p1: Point, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const mt = 1 - t;
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
    });
  }
  return pts;
}

/** 狙う場所がゴール枠内（y≥99かつx44.5〜55.5）か、半径5以内の最も近い味方の枠を受け手にする。
 * どちらでもなければ未設定（こぼれ球）＝setpiece-redesign §4 */
function resolveTo(target: Point, slots: Slot[]): Actor | "goal" | undefined {
  if (target.y >= 99 && target.x >= 44.5 && target.x <= 55.5) return "goal";
  let best = -1;
  let bestDist = 5;
  slots.forEach((s, i) => {
    if (s.pid == null) return;
    const dist = Math.hypot(s.x - target.x, s.y - target.y);
    if (dist <= bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best >= 0 ? (best as Actor) : undefined;
}

/** 距離と軌道からdur(0.5〜3.0s)を決める（グラウンダー1.0s/30m・ライナー0.8s/30m・
 * 浮き球1.4s/30mを目安。setpiece-redesign §4） */
function deliveryDuration(from: Point, target: Point, trajectory: BallTrajectory): number {
  const m = distM(from, target);
  const per30 = trajectory === "ground" ? 1.0 : trajectory === "driven" ? 0.8 : 1.4;
  return clamp((m / 30) * per30, 0.5, 3.0);
}

/**
 * 場面0のボールの最初のmoveから、現在の「狙う場所・軌道・曲がり」を読む。
 * 無ければnull（「まだ軌道がありません」の判定に使う）。曲がりはmoveに専用フィールドを
 * 持たせず、pathの実際の膨らみ（2次ベジェの厳密な性質）から逆算する。
 */
export function getDelivery(state: BoardState): Delivery | null {
  const m = state.moves.find((mv) => mv.actor === "ball" && (mv.step ?? 0) === 0);
  if (!m || m.path.length < 3) return null;
  const p0 = m.path[0];
  const p1 = m.path[m.path.length - 1];
  return { target: p1, trajectory: m.trajectory ?? "ground", bend: recoverBend(m.path, p0, p1) };
}

/**
 * buildDeliveryMoveが作るpathは厳密な2次ベジェのため、Bezier(t)-Lerp(t) = 2t(1-t)*(C-Mid)
 * が任意のtで成り立つ（Mid=P0とP1の中点）。中間サンプルから(C-Mid)を1回で厳密に復元できる。
 * 手編集などでこの形が崩れていても、単に「まっすぐ寄りの近似値」に丸まるだけで例外は出さない。
 */
function recoverBend(path: Point[], p0: Point, p1: Point): DeliveryBend {
  const n = path.length;
  const mid = Math.floor(n / 2);
  const t = mid / (n - 1);
  if (mid <= 0 || mid >= n - 1 || t <= 0 || t >= 1) return 0;
  const lerp = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
  const factor = 2 * t * (1 - t);
  const off = { x: (path[mid].x - lerp.x) / factor, y: (path[mid].y - lerp.y) / factor };
  const perp = perpOf(p0, p1);
  const signedMag = off.x * perp.x + off.y * perp.y;
  const ratio = signedMag / perp.len;
  if (Math.abs(ratio) < 0.06) return 0;
  if (ratio > 0) return ratio > 0.185 ? 2 : 1;
  return ratio < -0.185 ? -2 : -1;
}

/**
 * 「狙う場所・軌道・曲がり」からボールのmoveを作る（setpiece-redesign §4）。
 * 二次ベジェを12点に分割したpathにし、to（受け手/goal）とdurを自動で決める。
 */
export function buildDeliveryMove(input: {
  from: Point;
  target: Point;
  trajectory: BallTrajectory;
  bend: DeliveryBend;
  slots: Slot[];
}): Move {
  const { from, target, trajectory, bend, slots } = input;
  const mid = { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 };
  const perp = perpOf(from, target);
  const ratio = bendRatio(bend);
  const sign = bend < 0 ? -1 : bend > 0 ? 1 : 0;
  const offset = perp.len * ratio * sign;
  const control = { x: mid.x + perp.x * offset, y: mid.y + perp.y * offset };
  const path = quadBezierPoints(from, control, target, BEZIER_POINTS);

  const to = resolveTo(target, slots);
  const kind: MoveKind = to === "goal" ? "shot" : "pass";
  const dur = deliveryDuration(from, target, trajectory);
  return { actor: "ball", path, start: 0, dur, step: 0, kind, trajectory, to };
}
