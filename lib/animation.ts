import type { Actor, Move, OppToken, Point, Slot } from "./types";
import { oppIndex } from "./types";

/** ルートの総距離（ピッチ%単位） */
export function pathLen(path: Point[]): number {
  let L = 0;
  for (let k = 1; k < path.length; k++) {
    L += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
  }
  return L;
}

/** 点列を最大30点へ間引く（記録時のノイズ削減） */
export function simplify(pts: Point[]): Point[] {
  if (pts.length <= 30) return pts.slice();
  const out: Point[] = [];
  const step = pts.length / 30;
  for (let k = 0; k < 30; k++) out.push(pts[Math.floor(k * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * ほぼ直線のなぞりを始点・終点の2点へ単純化する。
 * 「次の位置へドラッグ＝直線移動」の意図を汲み、ガタつきを消す。
 */
export function straightenIfLine(pts: Point[], tol = 2.4): Point[] {
  if (pts.length <= 2) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1) return pts;
  for (const p of pts) {
    const d =
      Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > tol) return pts;
  }
  return [{ ...a }, { ...b }];
}

/** ease-in-out */
export function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 動きの緩急。std=なめらか / dash=タメてから一気に加速 / linear=等速 */
export function easeBy(kind: "std" | "dash" | "linear" | undefined, p: number): number {
  if (kind === "linear") return p;
  if (kind === "dash") return p * p * p; // ease-in cubic
  return ease(p);
}

/* ------------------------------------------------------------------ */
/* 場面（ステップ）                                                     */
/* ------------------------------------------------------------------ */

/** 場面数（moves が示す最大 step と明示 stepCount の大きい方・最低1） */
export function stepCountOf(moves: Move[], stepCount?: number): number {
  let n = Math.max(1, stepCount ?? 1);
  for (const m of moves) n = Math.max(n, (m.step ?? 0) + 1);
  return n;
}

/**
 * 場面 s の長さ（その場面の動きの最長 offset+dur。動きなし=0秒）。
 * move.start は前の場面へ食い込ませる負の値を許容するが（ワンツー対応）、
 * d は0初期のため負のoffset+durが最長値を押し下げることはなく、場面の長さ自体は
 * 常に「末尾（最後に終わる動き）」基準のまま負にならない。
 */
export function stepDur(moves: Move[], s: number): number {
  let d = 0;
  for (const m of moves) {
    if ((m.step ?? 0) === s) d = Math.max(d, m.start + m.dur);
  }
  return d;
}

/** 場面 s の開始絶対秒（先行する場面の長さの合計） */
export function stepStartTime(moves: Move[], s: number): number {
  let t = 0;
  for (let i = 0; i < s; i++) t += stepDur(moves, i);
  return t;
}

/** move の開始絶対秒（場面開始 + 場面内オフセット） */
export function absStart(moves: Move[], m: Move): number {
  return stepStartTime(moves, m.step ?? 0) + m.start;
}

/** 絶対秒 t が属する場面番号 */
export function stepAtTime(moves: Move[], t: number, stepCount?: number): number {
  const n = stepCountOf(moves, stepCount);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += stepDur(moves, i);
    if (t < acc) return i;
  }
  return n - 1;
}

/** アニメーション全体の長さ（秒） */
export function animTotal(moves: Move[], stepCount?: number): number {
  const n = stepCountOf(moves, stepCount);
  let t = 0;
  for (let i = 0; i < n; i++) t += stepDur(moves, i);
  return Math.max(0.8, t);
}

/* ------------------------------------------------------------------ */
/* 位置計算                                                             */
/* ------------------------------------------------------------------ */

/** ルート上 p(0-1) の位置 */
export function alongPath(path: Point[], p: number): Point {
  const L = pathLen(path);
  if (L === 0) return { x: path[0].x, y: path[0].y };
  const target = p * L;
  let acc = 0;
  for (let k = 1; k < path.length; k++) {
    const seg = Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
    if (acc + seg >= target) {
      const r = seg ? (target - acc) / seg : 0;
      return {
        x: path[k - 1].x + (path[k].x - path[k - 1].x) * r,
        y: path[k - 1].y + (path[k].y - path[k - 1].y) * r,
      };
    }
    acc += seg;
  }
  return { x: path[path.length - 1].x, y: path[path.length - 1].y };
}

/** ボール保持中の前方オフセット（ピッチ%単位）。reducer（BoardProvider）と共用する共有定数 */
export const BALL_CARRY_OFFSET: Point = { x: 1.2, y: 3 };

/** 座標をピッチ内（2..98）にクランプする */
function clampToPitch(p: Point): Point {
  return { x: Math.max(2, Math.min(98, p.x)), y: Math.max(2, Math.min(98, p.y)) };
}

/** 保持者位置から見たボールの前方座標（クランプ済み） */
export function carryPos(p: Point): Point {
  return clampToPitch({ x: p.x + BALL_CARRY_OFFSET.x, y: p.y + BALL_CARRY_OFFSET.y });
}

/**
 * 時刻 t におけるボールの保持者を解決する。
 * initialHolder（アニメ開始時点＝t=0の保持者）から開始し、ボールの move（絶対時刻順）を走査する。
 * move の開始時刻以降は保持解除（ボールが離れて飛んでいる）、終了時刻以降は
 * to が Actor ならその受け手、"goal" または未定義なら保持なし（こぼれ球）として確定する。
 */
export function holderAt(
  t: number,
  moves: Move[],
  initialHolder: Actor | null | undefined
): Actor | null {
  let holder: Actor | null = initialHolder ?? null;
  const ballMoves = moves
    .filter((m) => m.actor === "ball" && m.path.length >= 1)
    .map((m) => ({ m, s: absStart(moves, m) }))
    .sort((a, b) => a.s - b.s);
  for (const { m, s } of ballMoves) {
    if (t < s) continue; // まだ発生していない move は無視
    holder = t < s + m.dur ? null : m.to && m.to !== "goal" ? m.to : null;
  }
  return holder;
}

/**
 * 時刻 t における actor の座標。
 * 1アクターが場面ごとに複数のルートを持てる（絶対時刻順に連結して評価）。
 * holder はボール専用の追加引数（アニメ開始時点の保持者）。省略時は従来どおり保持なし扱い
 */
export function actorPos(
  actor: Actor,
  t: number,
  moves: Move[],
  slots: Slot[],
  ball: Point,
  opponents?: OppToken[],
  holder?: Actor | null
): Point {
  const base =
    actor === "ball"
      ? ball
      : typeof actor === "number"
        ? slots[actor]
        : opponents?.[oppIndex(actor)];
  const ms = moves
    .filter((x) => x.actor === actor && x.path.length >= 1)
    .map((x) => ({ m: x, s: absStart(moves, x) }))
    .sort((a, b) => a.s - b.s);

  if (actor === "ball") {
    // 1. ボール move の区間内は従来どおりルート優先
    for (const { m, s } of ms) {
      if (t >= s && t < s + m.dur) return alongPath(m.path, easeBy(m.ease, (t - s) / m.dur));
    }
    // 2. 区間外：保持者がいれば保持者位置＋前方オフセットへ追従（1段再帰。holderはballを持てないため無限再帰なし）
    const h = holderAt(t, moves, holder);
    if (h != null) return carryPos(actorPos(h, t, moves, slots, ball, opponents));
    // 3. holderなし：従来ロジック（直近 move 終点 or base の ball 位置）へフォールスルー
  }

  if (ms.length === 0)
    return base ? { x: base.x, y: base.y } : { x: 50, y: 50 };

  let prevEnd: Point | null = null;
  for (let i = 0; i < ms.length; i++) {
    const { m, s } = ms[i];
    if (t <= s) {
      // ルート開始前：直前ルートの終点（最初のルートなら始点）で待機
      const p = prevEnd ?? m.path[0];
      return { x: p.x, y: p.y };
    }
    if (t < s + m.dur) return alongPath(m.path, easeBy(m.ease, (t - s) / m.dur));
    prevEnd = m.path[m.path.length - 1];
  }
  return { x: prevEnd!.x, y: prevEnd!.y };
}

/** ルートの長さから自然な所要時間を算出 */
export function durFromPath(path: Point[]): number {
  const len = pathLen(path);
  return +Math.max(0.6, Math.min(4, len / 22)).toFixed(2);
}

/** 時間順に並べたときの順番（1始まり） */
export function orderRank(moves: Move[], m: Move): number {
  const ms = [...moves].sort((a, b) => absStart(moves, a) - absStart(moves, b));
  return ms.indexOf(m) + 1;
}
