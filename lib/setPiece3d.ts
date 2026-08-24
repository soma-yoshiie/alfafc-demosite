// セットプレー3Dビューア用の座標変換・寸法定数・カメラプリセット計算。
// three.js には依存しない純粋な数値計算のみを持つ（SetPiece3D.tsx からのみ使う重い依存を
// このファイルに持ち込まない＝lib/setPiece3d.ts は誰がimportしても軽いままにする）。
// SetPieceBoard.tsx はカメラプリセットの「ラベル一覧」だけをここから読み、
// 3D本体(SetPiece3D.tsx)は next/dynamic で遅延ロードする（バンドル分離のため）。

import type { BoardState, Point } from "./types";

/* ============================================================
   JFA 8人制サッカー ピッチ寸法（メートル）
   x（幅）: 50m / y（縦・ゴール間）: 68m。y=100が敵陣ゴールライン、y=0が自陣ゴールライン
   （lib/pitchView.ts の yToTop/topToY と同じデータ座標の向き）。
   ゴール 5m×2.15m。PA=ポスト内側から12m・奥行12m。GA=ポスト内側から4m・奥行4m。
   PKマーク: ゴールラインから8m。センターサークル半径7m。コーナーアーク半径1m。
   （本タスクの仕様にペナルティアーク「D」の半径指定は無いため描画対象に含めない）
   ============================================================ */
export const PITCH_WIDTH_M = 50;
export const PITCH_LENGTH_M = 68;
export const GOAL_WIDTH_M = 5;
export const GOAL_HEIGHT_M = 2.15;
export const GOAL_NET_DEPTH_M = 1.1;
export const PA_FROM_POST_M = 12;
export const PA_DEPTH_M = 12;
export const GA_FROM_POST_M = 4;
export const GA_DEPTH_M = 4;
/** ペナルティエリア全幅（ポストの内側から12m×左右2 + ゴール幅） */
export const PA_WIDTH_M = GOAL_WIDTH_M + PA_FROM_POST_M * 2;
/** ゴールエリア全幅（ポストの内側から4m×左右2 + ゴール幅） */
export const GA_WIDTH_M = GOAL_WIDTH_M + GA_FROM_POST_M * 2;
export const PK_SPOT_M = 8;
export const CENTER_CIRCLE_R_M = 7;
export const CORNER_ARC_R_M = 1;

/** データ座標(0-100)1%あたりのメートル数 */
export const M_PER_PCT_X = PITCH_WIDTH_M / 100;
export const M_PER_PCT_Y = PITCH_LENGTH_M / 100;

/** ワールドXZ平面上の点（three.js: Y-up。x=幅方向 / z=縦方向） */
export interface WorldPoint2 {
  x: number;
  z: number;
}

/** データ x(0-100, 0=左/100=右) → ワールドx（メートル、中心0） */
export function boardXToWorldX(x: number): number {
  return (x / 100 - 0.5) * PITCH_WIDTH_M;
}
/** データ y(0-100, 0=自陣ゴールライン/100=敵陣ゴールライン) → ワールドz（メートル、中心0。+z側が敵陣） */
export function boardYToWorldZ(y: number): number {
  return (y / 100 - 0.5) * PITCH_LENGTH_M;
}
/** データ座標(Point) → ワールドXZ（まとめて変換） */
export function boardToWorld(p: Point): WorldPoint2 {
  return { x: boardXToWorldX(p.x), z: boardYToWorldZ(p.y) };
}
/** ピッチ%単位の長さ（Shape.w等）→ メートル（x方向の長さ換算） */
export function lenXToMeters(v: number): number {
  return v * M_PER_PCT_X;
}
/** ピッチ%単位の長さ（Shape.h等）→ メートル（y/z方向の長さ換算） */
export function lenYToMeters(v: number): number {
  return v * M_PER_PCT_Y;
}

/* ============================================================
   ピッチ・マーキングの折れ線データ（ワールドXZ、メートル）
   すべて boardXToWorldX/boardYToWorldZ と同じ換算基準で直接メートル計算するため、
   トークン位置（boardToWorld経由）と描画がずれない。
   ============================================================ */

/** 矩形の外周（5点・始点に戻って閉じる）。x0/x1, z0/z1 の大小は問わない */
export function worldRectOutline(x0: number, x1: number, z0: number, z1: number): WorldPoint2[] {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
    { x: x0, z: z0 },
  ];
}

/** 円周（中心cx,cz・半径r）を分割数segmentsの折れ線点列（閉じた輪）で返す */
export function worldCircleOutline(cx: number, cz: number, r: number, segments = 64): WorldPoint2[] {
  const pts: WorldPoint2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
  }
  return pts;
}

/**
 * 円弧（中心cx,cz・半径r）を折れ線点列で返す。dirA/dirBは弧の両端が向く方向ベクトル
 * （内向き＝コーナーアークの2辺の方向）。長い方の弧になってしまう組み合わせでも
 * 自動的に短い方（=90°）へ補正して描く。
 */
export function worldArcOutline(
  cx: number,
  cz: number,
  r: number,
  dirA: [number, number],
  dirB: [number, number],
  segments = 12
): WorldPoint2[] {
  const angleA = Math.atan2(dirA[1], dirA[0]);
  const angleB = Math.atan2(dirB[1], dirB[0]);
  const twoPi = Math.PI * 2;
  const fwd = ((angleB - angleA) % twoPi + twoPi) % twoPi;
  const [start, end] = fwd > Math.PI ? [angleB, angleA + twoPi] : [angleA, angleB];
  const total = end - start;
  const pts: WorldPoint2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + (total * i) / segments;
    pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
  }
  return pts;
}

/** ピッチマーキング一式。lines=線（外枠・センターサークル・PA/GA・コーナーアーク等）/ spots=点（センター・PKマーク） */
export interface PitchMarkings {
  lines: WorldPoint2[][];
  spots: WorldPoint2[];
}

/** JFA8人制寸法のピッチマーキングをワールド座標で組み立てる（常にフルピッチ・両ゴール分） */
export function buildPitchMarkings(): PitchMarkings {
  const halfW = PITCH_WIDTH_M / 2;
  const halfL = PITCH_LENGTH_M / 2;
  const lines: WorldPoint2[][] = [];
  const spots: WorldPoint2[] = [{ x: 0, z: 0 }];

  lines.push(worldRectOutline(-halfW, halfW, -halfL, halfL));
  lines.push([
    { x: -halfW, z: 0 },
    { x: halfW, z: 0 },
  ]);
  lines.push(worldCircleOutline(0, 0, CENTER_CIRCLE_R_M));

  for (const end of [-1, 1] as const) {
    const goalZ = end * halfL;
    // ゴールラインからフィールド中心へ向かう符号（PA/GA奥行・PKマークの向き）
    const inward = -end;
    lines.push(worldRectOutline(-PA_WIDTH_M / 2, PA_WIDTH_M / 2, goalZ, goalZ + inward * PA_DEPTH_M));
    lines.push(worldRectOutline(-GA_WIDTH_M / 2, GA_WIDTH_M / 2, goalZ, goalZ + inward * GA_DEPTH_M));
    spots.push({ x: 0, z: goalZ + inward * PK_SPOT_M });
    for (const side of [-1, 1] as const) {
      lines.push(worldArcOutline(side * halfW, goalZ, CORNER_ARC_R_M, [-side, 0], [0, inward]));
    }
  }

  return { lines, spots };
}

/* ============================================================
   カメラプリセット
   ============================================================ */
export type CameraPresetId = "overhead" | "broadcast" | "kicker" | "gk";

export const CAMERA_PRESET_ORDER: CameraPresetId[] = ["overhead", "broadcast", "kicker", "gk"];

export const CAMERA_PRESET_LABEL: Record<CameraPresetId, string> = {
  overhead: "俯瞰45°",
  broadcast: "放送カメラ",
  kicker: "キッカー目線",
  gk: "GK目線",
};

/** カメラの位置・注視点（ワールド座標・メートル・Y-up） */
export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

const EYE_HEIGHT_M = 1.7;
/**
 * kicker: ボールから見て何m後方にカメラを置くか。旧実装(1.7m)だとボールのすぐ後ろに
 * 立つだけで、CKのようにボールがサイドへ寄っている配置ではゴール・味方が画角に
 * 収まりきらなかったため、後方距離を広げて引きを作る。
 */
const KICKER_BACK_M = 4.5;
/** broadcast: SetPiece3D.tsx の Canvas camera={{fov:50,...}} と同じ値。
 * トークン群のバウンディング円がこの画角に収まる距離を逆算する簡易フィットに使う。 */
const BROADCAST_FOV_DEG = 50;
/** broadcast: .sp3dpitch の aspect-ratio(16/10)に合わせた想定横縦比。
 * 実際のcanvas比率はコンテナサイズ依存でこの純粋関数からは分からないため、
 * CSSで規定した基準値を近似として使う。 */
const BROADCAST_ASPECT = 16 / 10;
/** broadcast: トークンの半径・番号ラベル分の余白（m） */
const BROADCAST_MARGIN_M = 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 現在配置されている全トークン（選手・相手・ボール）のワールドXZ座標一覧。
 * broadcastカメラの簡易フィット計算にのみ使う（描画自体は別途TokensLayer側が行う）。 */
function collectTokenWorldPoints(state: BoardState): WorldPoint2[] {
  const pts: WorldPoint2[] = [];
  const ball = state.ball ?? { x: 50, y: 50 };
  pts.push(boardToWorld(ball));
  for (const s of state.slots) {
    if (s.pid != null) pts.push(boardToWorld(s));
  }
  for (const o of state.opponents ?? []) {
    pts.push(boardToWorld(o));
  }
  return pts;
}

/** 点群を包含する円（中心・半径）。トークンが1点しか無ければ半径0を返す */
function boundingCircle(pts: WorldPoint2[]): { cx: number; cz: number; r: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  let r = 0;
  for (const p of pts) {
    r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
  }
  return { cx, cz, r };
}

/**
 * カメラプリセットの位置・注視点を算出する（純粋関数。現在の BoardState から一度だけ計算し、
 * 以降のトークン移動などには追従させない＝プリセット選択時にのみ視点を切り替える設計）。
 * - overhead: ピッチ中心の真上・水平距離と高さが等しい45°俯瞰。
 * - broadcast: タッチライン外側の高所からピッチ中央方向を見る固定アングル。距離は
 *   現在配置されている全トークン（選手・相手・ボール）のバウンディング円から逆算し、
 *   誰も画角の外にこぼれないよう簡易フィットする。
 * - kicker: セットプレーの攻撃対象ゴール中心（setPiece.side==="defense"ならy0側ゴール／
 *   それ以外はy100側ゴール。SetPieceBar の boxatk/boxdef 判定と同じ規約）へ向け、
 *   ボールの後方・目線の高さに立って狙う方向を見る。
 * - gk: 守備ゴール（データ座標は常にy0=自陣固定）の1.7m前に立ち、ボールを見る。
 */
export function computeCameraPreset(id: CameraPresetId, state: BoardState): CameraPose {
  const ball = state.ball ?? { x: 50, y: 50 };
  const ballW = boardToWorld(ball);

  if (id === "overhead") {
    const d = PITCH_LENGTH_M * 1.15;
    return { position: [0, d, d], target: [0, 0, 0] };
  }
  if (id === "broadcast") {
    // 元のアングル（タッチライン外側・水平-X寄り、仰角約20°）は保ったまま、
    // トークン群のバウンディング円がCanvasのfov(50°)に収まる距離まで距離だけ拡縮する
    // （簡易フィット。全員が画角の外に出ないことを優先し、距離は片方向にのみ伸ばす）。
    const { cx, cz, r } = boundingCircle(collectTokenWorldPoints(state));
    const fitR = r + BROADCAST_MARGIN_M;
    const halfVFov = (BROADCAST_FOV_DEG / 2) * (Math.PI / 180);
    const halfHFov = Math.atan(Math.tan(halfVFov) * BROADCAST_ASPECT);
    const limitHalfFov = Math.min(halfVFov, halfHFov);
    const dist = clamp(fitR / Math.sin(limitHalfFov), PITCH_LENGTH_M * 0.5, 130);
    const dirX = -(PITCH_WIDTH_M / 2 + 18);
    const dirY = 16 - 0.6;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    return {
      position: [cx + (dirX / dirLen) * dist, 0.6 + (dirY / dirLen) * dist, cz],
      target: [cx, 0.6, cz],
    };
  }
  if (id === "kicker") {
    const attackGoalY = state.setPiece?.side === "defense" ? 0 : 100;
    const goalZ = boardYToWorldZ(attackGoalY);
    const dir = Math.sign(goalZ - ballW.z) || (attackGoalY >= 50 ? 1 : -1);
    return {
      position: [ballW.x, EYE_HEIGHT_M, ballW.z - dir * KICKER_BACK_M],
      // 注視点はゴール中心(x=0)固定。旧実装はballW.xのままだったため、CKのように
      // ボールがサイドへ寄っていると視線がゴール中心からズレていた。
      target: [0, 1.2, goalZ],
    };
  }
  // gk: 守備ゴール（常にy0=自陣）の1.7m前に立ち、ボールを見る
  const goalZ = boardYToWorldZ(0);
  return {
    position: [0, EYE_HEIGHT_M, goalZ + 1.7],
    target: [ballW.x, 0.3, ballW.z],
  };
}
