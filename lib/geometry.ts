import type { Point } from "./types";

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 凸包（ギフト包装法 / Jarvis march）。選手数程度の点数なので単純な実装で十分。
 * 3点未満はそのまま返す。同一座標の重複点は除去する。
 */
export function convexHull(pts: Point[]): Point[] {
  const uniq: Point[] = [];
  for (const p of pts) {
    if (!uniq.some((q) => q.x === p.x && q.y === p.y)) uniq.push(p);
  }
  if (uniq.length < 3) return uniq;

  // 最も左（同xなら最もyが小さい）の点を開始点にする
  let start = uniq[0];
  for (const p of uniq) {
    if (p.x < start.x || (p.x === start.x && p.y < start.y)) start = p;
  }

  const hull: Point[] = [];
  let point = start;
  let guard = 0;
  do {
    hull.push(point);
    let endpoint = uniq[0] === point ? uniq[1] : uniq[0];
    for (const cand of uniq) {
      if (cand === point) continue;
      if (endpoint === point) {
        endpoint = cand;
        continue;
      }
      const cross =
        (endpoint.x - point.x) * (cand.y - point.y) -
        (endpoint.y - point.y) * (cand.x - point.x);
      if (cross < 0 || (cross === 0 && dist(point, cand) > dist(point, endpoint))) {
        endpoint = cand;
      }
    }
    point = endpoint;
    guard++;
  } while (point !== start && guard <= uniq.length + 1);

  return hull;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadPointAt(p0: Point, c: Point, p1: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
  };
}

/**
 * 2次ベジェ曲線（p0, c, p1）の終端を弧長基準で trim 分だけ切り詰める。
 * 曲線を16分割でサンプリングして弧長を推定し、終端から trim 分手前の
 * パラメータ t* を求め、de Casteljau で [0, t*] に分割した左側曲線の
 * 制御点（lerp(p0, c, t*)）と終点（曲線上の点 B(t*)）を返す。
 * 曲線長が trim 以下の場合は切り詰めずそのまま返す（c は元の c、end は p1）。
 */
export function trimQuadEnd(
  p0: Point,
  c: Point,
  p1: Point,
  trim: number
): { c: Point; end: Point } {
  const N = 16;
  const pts: Point[] = [];
  for (let i = 0; i <= N; i++) pts.push(quadPointAt(p0, c, p1, i / N));
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < N; i++) {
    const d = dist(pts[i], pts[i + 1]);
    segLen.push(d);
    total += d;
  }
  if (total <= trim) return { c, end: p1 };

  // 終端側からセグメントを遡り、trim 分に達するセグメントを探す
  let acc = 0;
  let i = N - 1;
  for (; i >= 0; i--) {
    if (acc + segLen[i] >= trim) break;
    acc += segLen[i];
  }
  const segT0 = i / N;
  const segT1 = (i + 1) / N;
  const within = trim - acc;
  const frac = segLen[i] > 0 ? within / segLen[i] : 0;
  const tStar = segT1 - frac * (segT1 - segT0);

  return { c: lerp(p0, c, tStar), end: quadPointAt(p0, c, p1, tStar) };
}
