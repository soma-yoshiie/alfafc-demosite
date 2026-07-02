import type { DrillItemKind, DrillLineKind, Point } from "./types";
import { alongPath, pathLen } from "./animation";

/** ルートを等間隔にリサンプル */
export function resample(path: Point[], step: number): Point[] {
  if (path.length < 2) return path.slice();
  const L = pathLen(path);
  const n = Math.max(2, Math.ceil(L / step));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) out.push(alongPath(path, k / n));
  return out;
}

/** ドリブル用の波線の点列を生成（端は振幅0にテーパー） */
export function wavy(path: Point[], amp: number, wavelen: number): Point[] {
  const L = pathLen(path);
  if (L < 0.5) return path.slice();
  const n = Math.max(4, Math.round(L / 1.2));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const d = t * L;
    const p = alongPath(path, t);
    const p2 = alongPath(path, Math.min(1, t + 1 / n));
    const p0 = alongPath(path, Math.max(0, t - 1 / n));
    const tx = p2.x - p0.x;
    const ty = p2.y - p0.y;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    const taper = Math.sin(Math.PI * t);
    const off = amp * Math.sin((d / wavelen) * Math.PI * 2) * taper;
    out.push({ x: p.x + nx * off, y: p.y + ny * off });
  }
  return out;
}

/** 動線の色 */
export const LINE_COLORS: Record<DrillLineKind, string> = {
  run: "#eafff0",
  pass: "#caff3a",
  dribble: "#4fc3f7",
  line: "#9fb0a6",
};

export const LINE_LABEL: Record<DrillLineKind, string> = {
  run: "ラン（実線）",
  pass: "パス（破線）",
  dribble: "ドリブル（波線）",
  line: "ライン（直線）",
};

export const ITEM_LABEL: Record<DrillItemKind, string> = {
  cone: "コーン",
  player: "選手",
  oppo: "相手",
  ball: "ボール",
  goal: "ゴール",
  marker: "マーカー",
};
