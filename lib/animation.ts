import type { Actor, Move, Point, Slot } from "./types";

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

/** ease-in-out */
export function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** アニメーション全体の長さ（秒） */
export function animTotal(moves: Move[]): number {
  let m = 0;
  for (const x of moves) m = Math.max(m, x.start + x.dur);
  return Math.max(0.8, m);
}

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

/** 時刻 t における actor の座標 */
export function actorPos(
  actor: Actor,
  t: number,
  moves: Move[],
  slots: Slot[],
  ball: Point
): Point {
  const base = actor === "ball" ? ball : slots[actor];
  const m = moves.find((x) => x.actor === actor);
  if (!m) return { x: base.x, y: base.y };
  if (t <= m.start) return { x: m.path[0].x, y: m.path[0].y };
  if (t >= m.start + m.dur) {
    const last = m.path[m.path.length - 1];
    return { x: last.x, y: last.y };
  }
  return alongPath(m.path, ease((t - m.start) / m.dur));
}

/** ルートの長さから自然な所要時間を算出 */
export function durFromPath(path: Point[]): number {
  const len = pathLen(path);
  return +Math.max(0.6, Math.min(4, len / 22)).toFixed(2);
}

/** 時間順に並べたときの順番（1始まり） */
export function orderRank(moves: Move[], m: Move): number {
  const ms = [...moves].sort((a, b) => a.start - b.start);
  return ms.indexOf(m) + 1;
}
