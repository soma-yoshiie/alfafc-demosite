// セットプレー3Dビューア用の座標変換・寸法定数・カメラプリセット計算。
// three.js には依存しない純粋な数値計算のみを持つ（SetPiece3D.tsx からのみ使う重い依存を
// このファイルに持ち込まない＝lib/setPiece3d.ts は誰がimportしても軽いままにする）。
// SetPieceBoard.tsx はカメラプリセットの「ラベル一覧」だけをここから読み、
// 3D本体(SetPiece3D.tsx)は next/dynamic で遅延ロードする（バンドル分離のため）。

import type { Actor, BallTrajectory, BoardState, Move, Point } from "./types";
import { moveKind, moveTrajectory } from "./types";
import { absStart, actorPos, easeBy } from "./animation";

/* ============================================================
   ピッチ寸法（メートル）。8人制(JFA)/11人制の2セットを持ち、format→寸法セットの
   関数(getPitchDims)で切り替える。x（幅）/y（縦・ゴール間、y=100が敵陣ゴールライン・
   y=0が自陣ゴールライン。lib/pitchView.ts の yToTop/topToY と同じデータ座標の向き）。
   8人制: 幅50m×縦68m。ゴール5m×2.15m。PA=ポスト内側から12m・奥行12m。
   GA=ポスト内側から4m・奥行4m。PKマーク8m。センターサークル半径7m。コーナーアーク半径1m。
   11人制: 幅68m×縦105m。ゴール7.32m×2.44m。PA=16.5m(全幅40.32)。GA=5.5m(全幅18.32)。
   PKマーク11m。センターサークル半径9.15m。コーナーアーク半径1m。
   （本タスクの仕様にペナルティアーク「D」の半径指定は無いため描画対象に含めない）
   ============================================================ */

/** 何人制のピッチか */
export type PitchFormat = 8 | 11;

/** 1フォーマットぶんのピッチ寸法一式（メートル） */
export interface PitchDims {
  pitchWidthM: number;
  pitchLengthM: number;
  goalWidthM: number;
  goalHeightM: number;
  goalNetDepthM: number;
  paFromPostM: number;
  paDepthM: number;
  gaFromPostM: number;
  gaDepthM: number;
  /** ペナルティエリア全幅（ポストの内側からpaFromPostM×左右2 + ゴール幅） */
  paWidthM: number;
  /** ゴールエリア全幅（ポストの内側からgaFromPostM×左右2 + ゴール幅） */
  gaWidthM: number;
  pkSpotM: number;
  centerCircleRM: number;
  cornerArcRM: number;
}

function makeDims(
  base: Omit<PitchDims, "paWidthM" | "gaWidthM">
): PitchDims {
  return {
    ...base,
    paWidthM: base.goalWidthM + base.paFromPostM * 2,
    gaWidthM: base.goalWidthM + base.gaFromPostM * 2,
  };
}

const PITCH_DIMS_BY_FORMAT: Record<PitchFormat, PitchDims> = {
  8: makeDims({
    pitchWidthM: 50,
    pitchLengthM: 68,
    goalWidthM: 5,
    goalHeightM: 2.15,
    goalNetDepthM: 1.7,
    paFromPostM: 12,
    paDepthM: 12,
    gaFromPostM: 4,
    gaDepthM: 4,
    pkSpotM: 8,
    centerCircleRM: 7,
    cornerArcRM: 1,
  }),
  11: makeDims({
    pitchWidthM: 68,
    pitchLengthM: 105,
    goalWidthM: 7.32,
    goalHeightM: 2.44,
    goalNetDepthM: 2.0,
    paFromPostM: 16.5,
    paDepthM: 16.5,
    gaFromPostM: 5.5,
    gaDepthM: 5.5,
    pkSpotM: 11,
    centerCircleRM: 9.15,
    cornerArcRM: 1,
  }),
};

/** format(8|11、既定8)→寸法セット。SetPiece3D側はここからdimsを取り、以降は選ぶだけにする */
export function getPitchDims(format: PitchFormat = 8): PitchDims {
  return PITCH_DIMS_BY_FORMAT[format];
}

/** 8人制の寸法（既定値。以下の後方互換エイリアス群のベース） */
const DEFAULT_DIMS = PITCH_DIMS_BY_FORMAT[8];

/**
 * 後方互換の8人制定数エイリアス。既存コード（components/SetPiece3D.tsx 等）が
 * 直接importして使っているため値・意味とも変更しない。新規コードは getPitchDims(format)
 * を使うこと。
 */
export const PITCH_WIDTH_M = DEFAULT_DIMS.pitchWidthM;
export const PITCH_LENGTH_M = DEFAULT_DIMS.pitchLengthM;
export const GOAL_WIDTH_M = DEFAULT_DIMS.goalWidthM;
export const GOAL_HEIGHT_M = DEFAULT_DIMS.goalHeightM;
export const GOAL_NET_DEPTH_M = DEFAULT_DIMS.goalNetDepthM;
export const PA_FROM_POST_M = DEFAULT_DIMS.paFromPostM;
export const PA_DEPTH_M = DEFAULT_DIMS.paDepthM;
export const GA_FROM_POST_M = DEFAULT_DIMS.gaFromPostM;
export const GA_DEPTH_M = DEFAULT_DIMS.gaDepthM;
export const PA_WIDTH_M = DEFAULT_DIMS.paWidthM;
export const GA_WIDTH_M = DEFAULT_DIMS.gaWidthM;
export const PK_SPOT_M = DEFAULT_DIMS.pkSpotM;
export const CENTER_CIRCLE_R_M = DEFAULT_DIMS.centerCircleRM;
export const CORNER_ARC_R_M = DEFAULT_DIMS.cornerArcRM;

/** データ座標(0-100)1%あたりのメートル数（8人制基準の後方互換エイリアス） */
export const M_PER_PCT_X = PITCH_WIDTH_M / 100;
export const M_PER_PCT_Y = PITCH_LENGTH_M / 100;

/** ワールドXZ平面上の点（three.js: Y-up。x=幅方向 / z=縦方向） */
export interface WorldPoint2 {
  x: number;
  z: number;
}

/** データ x(0-100, 0=左/100=右) → ワールドx（メートル、中心0）。dims省略＝8人制（後方互換） */
export function boardXToWorldX(x: number, dims: PitchDims = DEFAULT_DIMS): number {
  return (x / 100 - 0.5) * dims.pitchWidthM;
}
/** データ y(0-100, 0=自陣ゴールライン/100=敵陣ゴールライン) → ワールドz（メートル、中心0。
 * +z側が敵陣）。dims省略＝8人制（後方互換） */
export function boardYToWorldZ(y: number, dims: PitchDims = DEFAULT_DIMS): number {
  return (y / 100 - 0.5) * dims.pitchLengthM;
}
/** データ座標(Point) → ワールドXZ（まとめて変換）。dims省略＝8人制（後方互換） */
export function boardToWorld(p: Point, dims: PitchDims = DEFAULT_DIMS): WorldPoint2 {
  return { x: boardXToWorldX(p.x, dims), z: boardYToWorldZ(p.y, dims) };
}
/** ピッチ%単位の長さ（Shape.w等）→ メートル（x方向の長さ換算）。dims省略＝8人制（後方互換） */
export function lenXToMeters(v: number, dims: PitchDims = DEFAULT_DIMS): number {
  return (v * dims.pitchWidthM) / 100;
}
/** ピッチ%単位の長さ（Shape.h等）→ メートル（y/z方向の長さ換算）。dims省略＝8人制（後方互換） */
export function lenYToMeters(v: number, dims: PitchDims = DEFAULT_DIMS): number {
  return (v * dims.pitchLengthM) / 100;
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

/**
 * ピッチマーキングをワールド座標で組み立てる（常にフルピッチ・両ゴール分）。
 * dims省略＝8人制（後方互換）。11人制で描くときは buildPitchMarkings(getPitchDims(11)) を渡す。
 */
export function buildPitchMarkings(dims: PitchDims = DEFAULT_DIMS): PitchMarkings {
  const halfW = dims.pitchWidthM / 2;
  const halfL = dims.pitchLengthM / 2;
  const lines: WorldPoint2[][] = [];
  const spots: WorldPoint2[] = [{ x: 0, z: 0 }];

  lines.push(worldRectOutline(-halfW, halfW, -halfL, halfL));
  lines.push([
    { x: -halfW, z: 0 },
    { x: halfW, z: 0 },
  ]);
  lines.push(worldCircleOutline(0, 0, dims.centerCircleRM));

  for (const end of [-1, 1] as const) {
    const goalZ = end * halfL;
    // ゴールラインからフィールド中心へ向かう符号（PA/GA奥行・PKマークの向き）
    const inward = -end;
    lines.push(worldRectOutline(-dims.paWidthM / 2, dims.paWidthM / 2, goalZ, goalZ + inward * dims.paDepthM));
    lines.push(worldRectOutline(-dims.gaWidthM / 2, dims.gaWidthM / 2, goalZ, goalZ + inward * dims.gaDepthM));
    spots.push({ x: 0, z: goalZ + inward * dims.pkSpotM });
    for (const side of [-1, 1] as const) {
      lines.push(worldArcOutline(side * halfW, goalZ, dims.cornerArcRM, [-side, 0], [0, inward]));
    }
  }

  return { lines, spots };
}

/* ============================================================
   カメラプリセット
   ============================================================ */
export type CameraPresetId = "overhead" | "broadcast" | "kicker" | "gk" | "ground" | "replay";

export const CAMERA_PRESET_ORDER: CameraPresetId[] = [
  "overhead",
  "broadcast",
  "kicker",
  "gk",
  "ground",
  "replay",
];

export const CAMERA_PRESET_LABEL: Record<CameraPresetId, string> = {
  overhead: "俯瞰45°",
  broadcast: "放送カメラ",
  kicker: "キッカー目線",
  gk: "GK目線",
  ground: "地上カメラ",
  replay: "リプレイ",
};

/** ラインの帯幅（m）。実物の12cm線に合わせる */
const MARKING_LINE_W_M = 0.12;
/** PKマーク等スポットの一辺（m） */
const MARKING_SPOT_M = 0.22;

/**
 * ピッチマーキングを「地面に貼る1枚のメッシュ」用の三角形頂点配列(XZ平面・y=0)へ展開する。
 * 旧実装のdrei Line(worldUnits)はカメラを近づけた際の描画が不安定で「ズームするとラインが
 * 消える」不具合があったため、実ジオメトリの帯(各セグメント=四角形2三角形)に置き換える。
 * 全セグメントを1つの配列へマージする＝draw call 1回。formatごとにキャッシュする。
 */
const markingsGeomCache = new Map<string, Float32Array>();
export function buildMarkingsGeometryData(dims: PitchDims = DEFAULT_DIMS): Float32Array {
  const key = `${dims.pitchWidthM}x${dims.pitchLengthM}`;
  const hit = markingsGeomCache.get(key);
  if (hit) return hit;
  const { lines, spots } = buildPitchMarkings(dims);
  const out: number[] = [];
  const half = MARKING_LINE_W_M / 2;
  const pushQuad = (
    ax: number, az: number, bx: number, bz: number,
    cx: number, cz: number, dx: number, dz: number
  ) => {
    // (a,b,c) + (a,c,d)。y=0はメッシュ側のposition/polygonOffsetで浮かせる
    out.push(ax, 0, az, bx, 0, bz, cx, 0, cz, ax, 0, az, cx, 0, cz, dx, 0, dz);
  };
  for (const poly of lines) {
    for (let i = 0; i < poly.length - 1; i++) {
      const p = poly[i];
      const q = poly[i + 1];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      pushQuad(p.x + nx, p.z + nz, p.x - nx, p.z - nz, q.x - nx, q.z - nz, q.x + nx, q.z + nz);
    }
  }
  const s = MARKING_SPOT_M / 2;
  for (const p of spots) {
    pushQuad(p.x - s, p.z - s, p.x + s, p.z - s, p.x + s, p.z + s, p.x - s, p.z + s);
  }
  const arr = new Float32Array(out);
  markingsGeomCache.set(key, arr);
  return arr;
}

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
/** ground: タッチライン外側からの離れ（m）。ライン際すれすれの臨場感を優先し浅めに取る */
const GROUND_CAM_OFFSET_M = 1.0;
/** ground: 目線の高さ（m、仕様どおり1.2m） */
const GROUND_EYE_HEIGHT_M = 1.2;
/** replay: 注視点からの初期水平距離・高さ（m）。実際の周回はSetPiece3D.tsx側のuseFrameが
 * reduced-motionでない場合のみ角度を進める（ここでは開始姿勢だけを返す）。
 * 高さはスタンド高(STADIUM_M.standHeightM=9m)を超える12mに設定し、オービット中にスタンドの
 * シルエットが視界へ回り込んで塞がれないようにする。距離は基準値(15m)を、周回中心から
 * タッチライン/ゴールラインまでの残り距離でクランプし（下のcomputeCameraPreset内）、
 * ピッチ外（広告板・スタンド側）へ出ないようにする。 */
const REPLAY_ORBIT_DIST_M = 15;
const REPLAY_ORBIT_HEIGHT_M = 12;
/** replay: 周回半径・注視点高さの下限（m）。ごく小さいピッチや端寄りの中心でも軌道が潰れないようにする */
const REPLAY_ORBIT_MIN_RADIUS_M = 2;
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
function collectTokenWorldPoints(state: BoardState, dims: PitchDims): WorldPoint2[] {
  const pts: WorldPoint2[] = [];
  const ball = state.ball ?? { x: 50, y: 50 };
  pts.push(boardToWorld(ball, dims));
  for (const s of state.slots) {
    if (s.pid != null) pts.push(boardToWorld(s, dims));
  }
  for (const o of state.opponents ?? []) {
    pts.push(boardToWorld(o, dims));
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
 * dims省略＝8人制（後方互換）。11人制ピッチで計算するときは
 * computeCameraPreset(id, state, getPitchDims(11)) のように渡す（SetPiece3D側が
 * state.setPiece.format から選んで渡すだけにする＝この関数自身はstateのformatを見ない）。
 * - overhead: ピッチ中心の真上・水平距離と高さが等しい45°俯瞰。
 * - broadcast: タッチライン外側の高所からピッチ中央方向を見る固定アングル。距離は
 *   現在配置されている全トークン（選手・相手・ボール）のバウンディング円から逆算し、
 *   誰も画角の外にこぼれないよう簡易フィットする。
 * - kicker: セットプレーの攻撃対象ゴール中心（setPiece.side==="defense"ならy0側ゴール／
 *   それ以外はy100側ゴール。SetPieceBar の boxatk/boxdef 判定と同じ規約）へ向け、
 *   ボールの後方・目線の高さに立って狙う方向を見る。
 * - gk: 守備ゴール（データ座標は常にy0=自陣固定）の1.7m前に立ち、ボールを見る。
 * - ground: ボールに近い側のタッチライン際に立つ目線1.2mの地上カメラ。ボールへ向けて水平に見る。
 * - replay: ボールとピッチ中心の中間を見下ろす高所（スタンド高9mを超える12m）から、ゆっくり
 *   自動オービットするための初期姿勢。半径はピッチ内に収まるようクランプ済み（周回そのものは
 *   SetPiece3D.tsx側が担当。reduced-motion時は静止したこの初期姿勢のまま）。
 */
export function computeCameraPreset(
  id: CameraPresetId,
  state: BoardState,
  dims: PitchDims = DEFAULT_DIMS
): CameraPose {
  const ball = state.ball ?? { x: 50, y: 50 };
  const ballW = boardToWorld(ball, dims);

  if (id === "overhead") {
    const d = dims.pitchLengthM * 1.15;
    return { position: [0, d, d], target: [0, 0, 0] };
  }
  if (id === "broadcast") {
    // 元のアングル（タッチライン外側・水平-X寄り、仰角約20°）は保ったまま、
    // トークン群のバウンディング円がCanvasのfov(50°)に収まる距離まで距離だけ拡縮する
    // （簡易フィット。全員が画角の外に出ないことを優先し、距離は片方向にのみ伸ばす）。
    const { cx, cz, r } = boundingCircle(collectTokenWorldPoints(state, dims));
    const fitR = r + BROADCAST_MARGIN_M;
    const halfVFov = (BROADCAST_FOV_DEG / 2) * (Math.PI / 180);
    const halfHFov = Math.atan(Math.tan(halfVFov) * BROADCAST_ASPECT);
    const limitHalfFov = Math.min(halfVFov, halfHFov);
    const dist = clamp(fitR / Math.sin(limitHalfFov), dims.pitchLengthM * 0.5, 130);
    const dirX = -(dims.pitchWidthM / 2 + 18);
    const dirY = 16 - 0.6;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    return {
      position: [cx + (dirX / dirLen) * dist, 0.6 + (dirY / dirLen) * dist, cz],
      target: [cx, 0.6, cz],
    };
  }
  if (id === "kicker") {
    const attackGoalY = state.setPiece?.side === "defense" ? 0 : 100;
    const goalZ = boardYToWorldZ(attackGoalY, dims);
    const dir = Math.sign(goalZ - ballW.z) || (attackGoalY >= 50 ? 1 : -1);
    return {
      position: [ballW.x, EYE_HEIGHT_M, ballW.z - dir * KICKER_BACK_M],
      // 注視点はゴール中心(x=0)固定。旧実装はballW.xのままだったため、CKのように
      // ボールがサイドへ寄っていると視線がゴール中心からズレていた。
      target: [0, 1.2, goalZ],
    };
  }
  if (id === "ground") {
    // タッチライン際、ボールに近い側に立つ簡易ピッチサイドカメラ（目線1.2m）。
    // 他プリセットと同じく、プリセット選択時に一度だけ計算する（ボールの以後の移動には追従しない）。
    const side = ballW.x >= 0 ? 1 : -1;
    const x = side * (dims.pitchWidthM / 2 + GROUND_CAM_OFFSET_M);
    return {
      position: [x, GROUND_EYE_HEIGHT_M, ballW.z],
      target: [ballW.x, 0.5, ballW.z],
    };
  }
  if (id === "replay") {
    const angle0 = Math.PI / 5;
    // 周回中心はボール単独ではなくボールとピッチ中心(0,0)の中間に寄せる（ボールがゴール際・
    // タッチライン際にあるときも中心が外へ寄りすぎず、半径のクランプと合わせてピッチ内に収まる）
    const cx = ballW.x / 2;
    const cz = ballW.z / 2;
    // 半径は基準値(REPLAY_ORBIT_DIST_M)を、中心からタッチライン/ゴールラインまでの残り距離で
    // クランプする（ピッチ外の広告板・スタンド側へカメラが出ないようにする）
    const maxRadiusX = Math.max(REPLAY_ORBIT_MIN_RADIUS_M, dims.pitchWidthM / 2 - Math.abs(cx));
    const maxRadiusZ = Math.max(REPLAY_ORBIT_MIN_RADIUS_M, dims.pitchLengthM / 2 - Math.abs(cz));
    const radius = clamp(REPLAY_ORBIT_DIST_M, REPLAY_ORBIT_MIN_RADIUS_M, Math.min(maxRadiusX, maxRadiusZ));
    return {
      position: [cx + radius * Math.cos(angle0), REPLAY_ORBIT_HEIGHT_M, cz + radius * Math.sin(angle0)],
      target: [cx, 1.0, cz],
    };
  }
  // gk: 守備ゴール（常にy0=自陣）の1.7m前に立ち、ボールを見る
  const goalZ = boardYToWorldZ(0, dims);
  return {
    position: [0, EYE_HEIGHT_M, goalZ + 1.7],
    target: [ballW.x, 0.3, ballW.z],
  };
}

/* ============================================================
   選手アバター: 色ユーティリティ・寸法・待機ポーズ角度
   three.js には依存しない純粋な計算のみ（16進色の合成・関節角度の算出）。実際の
   ジオメトリ/マテリアル生成とHTMLCanvasテクスチャ描画は components/SetPiece3D.tsx 側で行う
   （このファイルの「three.js非依存」方針を保つ）。
   ============================================================ */

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 2色をtで線形補間したhexを返す（t=0→a、t=1→b）。ユニフォーム配色の導出にのみ使う小道具 */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** ユニフォーム3配色（胴・袖=チームカラーそのもの、ショーツ・ソックス=チームカラーを
 * 紺寄りに落とした同系トーン＝実際のキットでよくある「ジャージ1色＋ショーツ/ソックス共色」の
 * 定番配色）。配色ロジックはこの1関数に閉じ、PlayerFigureはここから3色を受け取るだけにする。 */
export interface KitColors {
  jersey: string;
  shorts: string;
  socks: string;
}
const KIT_SHADE_BASE = "#16212c";
/** キットの種別。own=味方フィールド / opp=相手フィールド / gk=味方GK / oppgk=相手GK。
 * 「味方・相手・GKの区別がつきづらい」対策として、色相を大きく離した固定配色にする:
 *   味方   = チームカラーのジャージ＋白ショーツ（FA式: 濃色=攻撃側の慣習にも合う）
 *   相手   = 白ジャージ＋濃紺ショーツ（審判・味方と混ざらない明度差）
 *   味方GK = 蛍光イエロー上下
 *   相手GK = 蛍光オレンジ上下
 */
export type KitVariant = "own" | "opp" | "gk" | "oppgk";
export function getKitColors(jerseyHex: string, variant: KitVariant = "own"): KitColors {
  switch (variant) {
    case "gk":
      return { jersey: "#ffd23f", shorts: "#20242b", socks: "#ffd23f" };
    case "oppgk":
      return { jersey: "#ff7a1a", shorts: "#20242b", socks: "#ff7a1a" };
    case "opp":
      return { jersey: "#f4f6f8", shorts: "#1c2733", socks: "#f4f6f8" };
    default: {
      const shade = mixHex(jerseyHex, KIT_SHADE_BASE, 0.62);
      return { jersey: jerseyHex, shorts: "#eef1f5", socks: shade };
    }
  }
}

/** 肌トーン（2色を選手ごとの決定的な擬似乱数で振り分け、単調さを避ける） */
export const SKIN_TONES: [string, string] = ["#e3b18c", "#c98f66"];
/** シューズ色（全選手共通の濃色） */
export const BOOT_COLOR = "#20242b";

/** 0..1 の決定的な擬似乱数（GLSL定番のsin-fractハッシュ）。同じseedなら常に同じ値を返すため、
 * 待機ポーズが再レンダーのたびにガタつかない（Math.randomは使わない＝フレーム間で安定）。 */
function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
/** -0.5..0.5 の決定的な擬似乱数 */
function seededSigned(seed: number): number {
  return seededUnit(seed) - 0.5;
}

/**
 * 待機ポーズの関節角度一式（ラジアン）。軸足側と遊脚側で角度の向き・大きさを変えることで
 * 「左右非対称の自然な立ち姿」にする。PlayerFigure（SetPiece3D.tsx）の各関節groupの
 * rotationへそのまま渡す想定＝キー名はPlayback3Dフェーズが再生アニメを付ける関節名
 * （leftArm/rightThigh等）と対応させてある。
 */
export interface IdlePose {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
  headTilt: number;
  headYaw: number;
  spineLean: number;
}
export function computeIdlePose(seed: number): IdlePose {
  const j = (i: number) => seededSigned(seed * 7.31 + i) * 0.06;
  const weightRight = seededUnit(seed * 3.1) > 0.5;
  return {
    hipL: (weightRight ? -0.07 : 0.03) + j(1),
    hipR: (weightRight ? 0.03 : -0.07) + j(2),
    kneeL: (weightRight ? 0.03 : 0.14) + Math.abs(j(3)),
    kneeR: (weightRight ? 0.14 : 0.03) + Math.abs(j(4)),
    shoulderL: 0.14 + j(5),
    shoulderR: -0.14 + j(6),
    elbowL: 0.22 + Math.abs(j(7)),
    elbowR: 0.26 + Math.abs(j(8)),
    headTilt: j(9),
    headYaw: j(10) * 1.4,
    spineLean: j(11) * 0.4,
  };
}

/**
 * 選手アバターの寸法一式（m）。ジュニア想定で全高≈1.55m。各セグメント長はY方向に
 * 積み上げるとPLAYER_HEIGHT_Mに一致する（ankle→knee→hip→waist→shoulder→head頂点）。
 * components/SetPiece3D.tsx はこの数値だけを見て関節groupのpositionを決め、ジオメトリ自体は
 * （three.js非依存を保つため）ここでは作らない。
 */
export const PLAYER_RIG_M = {
  ankleY: 0.09,
  shinLen: 0.34,
  thighLen: 0.34,
  pelvisH: 0.14,
  pelvisW: 0.22,
  pelvisD: 0.15,
  torsoH: 0.4,
  torsoW: 0.3,
  torsoD: 0.17,
  headR: 0.11,
  neckGap: 0.02,
  shoulderHalfW: 0.17,
  hipHalfW: 0.1,
  upperArmLen: 0.28,
  upperArmR: 0.045,
  forearmLen: 0.25,
  forearmR: 0.037,
  thighR: 0.062,
  shinR: 0.046,
  footR: 0.058,
} as const;
/** 全高（頭頂まで）。仕様「身長~1.55m」の検算用に算出値として残す */
export const PLAYER_HEIGHT_M =
  PLAYER_RIG_M.ankleY +
  PLAYER_RIG_M.shinLen +
  PLAYER_RIG_M.thighLen +
  PLAYER_RIG_M.pelvisH +
  PLAYER_RIG_M.torsoH +
  PLAYER_RIG_M.neckGap +
  PLAYER_RIG_M.headR * 2;

/* ============================================================
   スタジアム環境（観客席の帯・広告板）の寸法・配色。ジオメトリ自体はSetPiece3D.tsx側で作る
   （UNIT_BOXをscaleして使う＝ここは数値のみ）。
   ============================================================ */
export const STADIUM_M = {
  /** ピッチ外周(芝ラン込み)から広告板までの距離 */
  adBoardMarginM: 2.2,
  adBoardHeightM: 0.9,
  adBoardThicknessM: 0.15,
  /** 広告板からスタンド（前面壁）までの距離。「壁が近すぎてカメラが隠れる」対策で
   * 旧3.5mから離し、さらにスタンド自体を垂直壁でなく後方へ上る傾斜段(ラケ)にする */
  standMarginM: 5.5,
  /** 旧・垂直壁時代の高さ（リプレイカメラの高度判定の互換用に残置） */
  standHeightM: 9,
  standThicknessM: 1.2,
  /** サッカー専用スタジアム風の傾斜スタンド一式 */
  standFrontWallM: 1.1, // ピッチ側の低い前面壁（この高さまでしか視界を遮らない）
  standDepthM: 13, // 傾斜席の奥行き
  standRakeRad: 0.44, // 傾斜角(約25°)。後方ほど高くなる
  standSlabThickM: 0.5, // 傾斜スラブの厚み
  roofDepthM: 6.5, // 屋根の奥行き（スタンド後方の上に浮く）
  roofClearM: 2.6, // スタンド最上段から屋根下端までのクリアランス
  roofThickM: 0.35,
  /** コーナー照明塔（サッカー専用スタらしさの記号）。柱高さ・灯体サイズ */
  floodMastM: 17,
  floodHeadW: 3.2,
  floodHeadH: 2.0,
} as const;
/** 広告板の縞2色（無地・架空色。実在ブランドを想起させない中立トーンにする） */
export const AD_BOARD_COLORS: [string, string] = ["#0b3d66", "#e8543c"];
/** 観客席の帯のベース色・粒（座席）色（架空の中立トーン） */
export const STAND_BASE_COLOR = "#333f4b";
/** 味方フィールドプレイヤーの3D固定ユニフォーム色。2Dトークンはポジション別色(GK=金/FW=橙等)だが、
 * 3Dでそのまま使うとFW橙・GK金と味方GK(蛍光黄)が被って見分けづらいため、3Dは
 * 「味方=単一のチームジャージ色」に統一する(クラブカラーの深緑。白ショーツ+白背番号で芝と分離) */
export const OWN_KIT_JERSEY = "#0c6e37";
/** ピッチ外周〜スタンド下まで途切れなく敷く場外グラウンド(エプロン)の色 */
export const APRON_COLOR = "#276b3d";
export const STAND_SEAT_TONES: [string, string, string, string] = ["#465360", "#57677a", "#3a4551", "#5c6b78"];

/* ============================================================
   Playback3D: 再生同期・走行モーション・ボール弾道のユーティリティ。
   three.js には依存しない純粋な計算のみ（実際のObject3D refへの適用はcomponents/SetPiece3D.tsx側で
   行う）。位置そのものの計算はlib/animation.tsのactorPos/absStart/easeByをそのまま再利用し
   重複実装しない（同じmoves・同じtを渡せば2D再生と3D再生の到達位置は関数レベルで一致する）。
   ============================================================ */

/** 時刻tにおけるactorの「現在アクティブなmove」。lib/animation.ts の actorPos 内部と同じ
 * filter→絶対開始時刻でsort→区間走査の判定を共有し、位置だけでなく「どのmoveの何%地点か
 * (progress。move.easeを適用済み＝alongPathへ渡す値と同じ)」を追加で返す
 * （ボール弾道の高さ計算・弾道種別の判定に使う。actorPosは位置しか返さないため必要）。
 * 区間外（待機中・move間の隙間・保持者に追従中）はnull。 */
export interface ActiveMoveInfo {
  move: Move;
  /** move の絶対開始秒 */
  start: number;
  /** 区間内の進捗（0-1、move.easeを適用済み） */
  progress: number;
}
export function findActiveMove(actor: Actor, moves: Move[], t: number): ActiveMoveInfo | null {
  const ms = moves
    .filter((m) => m.actor === actor && m.path.length >= 1)
    .map((m) => ({ m, s: absStart(moves, m) }))
    .sort((a, b) => a.s - b.s);
  for (const { m, s } of ms) {
    if (t >= s && t < s + m.dur) {
      return { move: m, start: s, progress: easeBy(m.ease, (t - s) / m.dur) };
    }
  }
  return null;
}

/** ルート（ピッチ%座標の点列）のワールド長(m)。lib/animation.ts の pathLen は x/y(%) を
 * 等価な距離として扱う簡易長さのため、x/y でメートル換算比が異なるピッチ寸法（dims）を
 * 考慮したい弾道計算ではこちらを使う（boardToWorldで実座標へ写してから合算）。dims省略＝8人制 */
export function worldPathLengthM(path: Point[], dims: PitchDims = DEFAULT_DIMS): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) {
    const a = boardToWorld(path[i - 1], dims);
    const b = boardToWorld(path[i], dims);
    L += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return L;
}

/** 弾道ごとの最高点(m)。ground=0（転がり） / driven=距離によらずおよそ1.5m固定 /
 * lofted=距離に比例し最大4mでクランプ（近距離のロブでもうっすら弧が見えるよう最低1mは確保） */
export function trajectoryApexM(trajectory: BallTrajectory, distanceM: number): number {
  if (trajectory === "ground") return 0;
  if (trajectory === "driven") return 1.5;
  return Math.min(4, 1 + distanceM * 0.12);
}

/** 弾道の進捗progress（0-1、findActiveMoveのeaseBy適用後の値）における追加の高さ(m)。
 * 対称放物線（progress=0.5で最高点、0/1で地面）。ground・進捗0/1付近では常に0に近い */
export function trajectoryHeightM(trajectory: BallTrajectory, progress: number, distanceM: number): number {
  const apex = trajectoryApexM(trajectory, distanceM);
  if (apex <= 0) return 0;
  const p = clamp01(progress);
  return apex * 4 * p * (1 - p);
}

/**
 * 走行時の関節角度（脚・腕の振り、位相は左右逆のsin波）。IdlePose と同じキー名のうち
 * 動かす関節のみを持つサブセット（PlayerFigureはidleとこのRunPoseをlerpLimbPoseで
 * ブレンドし、脚・腕・脊柱の関節へ適用する。頭は対象外＝待機ポーズのまま）。
 * phase は呼び出し側（SetPiece3D.tsx）が移動距離×RUN_CYCLES_PER_METER で進める
 * （時間ベースでなく距離ベース＝速く動くほど自然に足の回転も速くなる）。
 */
export interface LimbPose {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
  spineLean: number;
}
export function computeRunPose(phase: number): LimbPose {
  const legSwing = 0.62;
  const armSwing = 0.5;
  const kneeLift = 0.55;
  return {
    hipL: Math.sin(phase) * legSwing,
    hipR: Math.sin(phase + Math.PI) * legSwing,
    kneeL: Math.max(0, -Math.sin(phase)) * kneeLift + 0.08,
    kneeR: Math.max(0, -Math.sin(phase + Math.PI)) * kneeLift + 0.08,
    shoulderL: Math.sin(phase + Math.PI) * armSwing,
    shoulderR: Math.sin(phase) * armSwing,
    elbowL: 0.4 + Math.max(0, -Math.sin(phase + Math.PI)) * 0.35,
    elbowR: 0.4 + Math.max(0, -Math.sin(phase)) * 0.35,
    spineLean: 0.08,
  };
}
/** 待機ポーズ(a)と走行ポーズ(b)をkで線形補間する（k=0→a、k=1→b）。IdlePoseはLimbPoseの
 * 上位互換（同名キーを全て含む）なのでaにはそのままidleポーズを渡せる */
export function lerpLimbPose(a: LimbPose, b: LimbPose, k: number): LimbPose {
  const t = clamp01(k);
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    hipL: m(a.hipL, b.hipL),
    hipR: m(a.hipR, b.hipR),
    kneeL: m(a.kneeL, b.kneeL),
    kneeR: m(a.kneeR, b.kneeR),
    shoulderL: m(a.shoulderL, b.shoulderL),
    shoulderR: m(a.shoulderR, b.shoulderR),
    elbowL: m(a.elbowL, b.elbowL),
    elbowR: m(a.elbowR, b.elbowR),
    spineLean: m(a.spineLean, b.spineLean),
  };
}

/** 角度を -π..π へ正規化 */
export function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
/** 角度 current→target へ、最大 turnRate(rad/s) で最短方向に近づける（1フレーム分=delta秒）。
 * 選手の進行方向(yaw)の滑らかな追従に使う純関数（three.jsのMathUtils.dampを使わないのは
 * このファイルのthree.js非依存方針を保つため） */
export function dampAngle(current: number, target: number, turnRate: number, delta: number): number {
  const diff = normalizeAngle(target - current);
  const maxStep = Math.max(0, turnRate) * Math.max(0, delta);
  if (diff > maxStep) return current + maxStep;
  if (diff < -maxStep) return current - maxStep;
  return current + diff;
}

/** 走行ブレンド：この速度(m/s)で待機ポーズ→走行ポーズの補間が完了する（それ以上は頭打ち） */
export const RUN_BLEND_SPEED_MPS = 3.0;
/** 走行位相：1m進むごとに歩行サイクル（sin波1周）が何周するか */
export const RUN_CYCLES_PER_METER = 0.9;
/** 進行方向(yaw)の最大旋回速度(rad/s) */
export const YAW_TURN_RATE_RAD_S = 12;
/** トレイル（軌跡）の保持時間(秒) */
export const TRAIL_SECONDS = 1.5;
/** 1フレームでこれ以上ワールド座標が飛んだら「瞬間移動」（場面切替・シーク）とみなし、
 * 速度・向き・走行位相の計算を1回だけリセットする（誤って全力疾走ポーズが一瞬出るのを防ぐ） */
export const TELEPORT_GUARD_M = 2.5;

/* ============================================================
   アクションモーション（キック・ヘディング）。ボールのパス/シュートmoveの開始・着地に
   最も近い選手へ「蹴る」「跳んで合わせる」動作を割り当てる純計算。three.js非依存。
   実際の関節適用はSetPiece3D.tsxのPlayerFigureがuseFrame内で行う。
   ============================================================ */

export interface ActionEvent {
  /** アクションの基準時刻（キック=ボールmove開始、ヘディング=ボールmove終了） */
  t: number;
  kind: "kick" | "header";
  /** アクション中に向くべきyaw（ワールド、Y-up。キック=蹴る方向 / ヘディング=ボールが来た方向） */
  faceYaw: number;
}

/** キック動作: 基準時刻の何秒前から始まり、合計何秒続くか */
export const KICK_PRE_S = 0.22;
export const KICK_DUR_S = 0.55;
export const HEADER_PRE_S = 0.35;
export const HEADER_DUR_S = 0.75;
/** 蹴る/合わせる選手の探索半径（盤面%単位） */
const ACTION_NEAR_PCT = 8;

function actorKeyOf(actor: Actor): string {
  return typeof actor === "number" ? `s${actor}` : String(actor);
}

/**
 * moves からアクションイベント表（actorキー→イベント一覧）を作る。
 * ボールの pass/shot move ごとに:
 *  - 開始点へ最も近い選手（開始0.05秒前の位置で判定）→ kick
 *  - lofted(ふんわり)の終点へ最も近い選手 → header（跳んで合わせる）
 * moves/配置が変わったときだけ呼び直す想定（TokensLayer の useMemo）。
 */
export function computeActionEvents(
  moves: Move[],
  slots: BoardState["slots"],
  ball: BoardState["ball"],
  opponents: BoardState["opponents"],
  holder: BoardState["holder"],
  dims: PitchDims = DEFAULT_DIMS
): Map<string, ActionEvent[]> {
  const out = new Map<string, ActionEvent[]>();
  const push = (key: string, ev: ActionEvent) => {
    const arr = out.get(key);
    if (arr) arr.push(ev);
    else out.set(key, [ev]);
  };
  const opps = opponents ?? [];
  const actors: Actor[] = [
    ...slots.map((_, i) => i as Actor),
    ...opps.map((_, i) => `opp${i}` as Actor),
  ];
  const nearestTo = (pt: Point, t: number): Actor | null => {
    let best: Actor | null = null;
    let bestD = ACTION_NEAR_PCT;
    for (const a of actors) {
      const p = actorPos(a, t, moves, slots, ball, opps, holder);
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  };
  const yawBetween = (from: Point, to: Point): number => {
    const a = boardToWorld(from, dims);
    const b = boardToWorld(to, dims);
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  for (const m of moves) {
    if (m.actor !== "ball" || m.path.length < 2) continue;
    const kind = moveKind(m);
    if (kind !== "pass" && kind !== "shot") continue;
    const t0 = absStart(moves, m);
    const tEnd = t0 + m.dur;
    const start = m.path[0];
    const second = m.path[Math.min(1, m.path.length - 1)];
    const end = m.path[m.path.length - 1];
    const kicker = nearestTo(start, Math.max(0, t0 - 0.05));
    if (kicker != null) {
      push(actorKeyOf(kicker), { t: t0, kind: "kick", faceYaw: yawBetween(start, second) });
    }
    if (moveTrajectory(m) === "lofted") {
      const receiver = nearestTo(end, tEnd + 0.05);
      if (receiver != null && receiver !== kicker) {
        push(actorKeyOf(receiver), { t: tEnd, kind: "header", faceYaw: yawBetween(end, start) });
      }
    }
  }
  return out;
}

/** actor用のイベント取り出しキー（PlayerFigureから使う） */
export function actionEventsFor(map: Map<string, ActionEvent[]>, actor: Actor): ActionEvent[] {
  return map.get(actorKeyOf(actor)) ?? [];
}

/** キックモーション（右足インステップ）。phase 0=バックスイング開始→約0.4=インパクト→1=フォロー */
export function computeKickPose(phase: number): LimbPose {
  const p = clamp01(phase);
  // バックスイング(-)→インパクト(+)→フォロースルー
  const swing = p < 0.4 ? -Math.sin((p / 0.4) * Math.PI * 0.5) : Math.sin(((p - 0.4) / 0.6) * Math.PI);
  return {
    hipL: -0.18,
    hipR: swing * 1.15,
    kneeL: 0.22,
    kneeR: Math.max(0, -swing) * 0.9 + 0.1,
    shoulderL: swing * 0.55,
    shoulderR: -swing * 0.4,
    elbowL: 0.35,
    elbowR: 0.45,
    spineLean: 0.16 + Math.max(0, swing) * 0.08,
  };
}

/** ヘディング（跳んで合わせる）。phase 0=踏み込み→0.5=最高点(のけぞり→当てる)→1=着地 */
export function computeHeaderPose(phase: number): { pose: LimbPose; lift: number } {
  const p = clamp01(phase);
  const jump = Math.sin(p * Math.PI); // 0→1→0
  const snap = p < 0.5 ? -(p / 0.5) : (p - 0.5) / 0.5; // のけぞり(-)→振り抜き(+)
  return {
    pose: {
      hipL: -0.5 * jump,
      hipR: -0.5 * jump,
      kneeL: 0.9 * jump,
      kneeR: 0.9 * jump,
      shoulderL: 1.9 * jump,
      shoulderR: -1.9 * jump,
      elbowL: 0.5,
      elbowR: 0.5,
      spineLean: -0.22 * jump + snap * 0.3 * jump,
    },
    lift: 0.42 * jump,
  };
}
