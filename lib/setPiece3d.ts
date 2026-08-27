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

/* ============================================================
   3D表示品質（3段階）。components/SetPiece3D.tsx（UIトグル・localStorage永続化）・
   components/SetPiece3DStadium.tsx（StadiumBowl・芝PBR）・components/SetPiece3DEnv.tsx
   の3ファイルすべてがこの型を参照するため、循環importを避けられるthree.js非依存の
   このファイルに置く（SetPiece3DStadium.tsxがSetPiece3D.tsxをimportすることはできない）。
   high=フル(観客Nearインスタンス・上層スタンド・芝PBR1024・GLB選手・dpr上限1.5) /
   medium=Near観客なし(芝PBR512・GLB選手・dpr上限1.25、それ以外はhighと同じ構成) /
   mobile=上層スタンド・手すり・投光器・vomitoryグロー・Near観客・外壁シェルなし
   (芝は簡易縞・プロシージャル選手・dpr1固定)。 */
export type Sp3dQuality = "high" | "medium" | "mobile";

/** テクスチャのanisotropy(異方性フィルタリング)をquality(=dprの段)に連動させる。
 * dpr上限が高いほど斜め視点でのテクスチャのボケが目立つため段階的に強めるが、上限8で
 * GPU負荷の増加を抑える（性能予算：dpr上限1.5と対で決めた値）。 */
export function anisotropyForQuality(quality: Sp3dQuality): number {
  if (quality === "high") return 8;
  if (quality === "medium") return 6;
  return 4;
}

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

/** 芝プレーン・観客席リング等が共有する「ピッチ外周からのマージン」（m）。
 * components/SetPiece3D.tsx と components/SetPiece3DStadium.tsx の双方が使うため、
 * どちらか一方の重複定義にしない（数値のズレを防ぐ）目的でここに置く。 */
export const GRASS_MARGIN_M = 3;

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
  // 短い方の弧: A→B反時計回りがπ以下ならそのまま、π超ならB→A反時計回り(2π-fwd)を描く。
  // start+total*t の形で必ず「開始角＋掃引量」で表す（angleA/angleBを終端に直接使うと、
  // atan2の±π境界をまたぐ組み合わせで270°〜450°の長弧が描かれるバグがあった）。
  const [start, total] = fwd > Math.PI ? [angleB, twoPi - fwd] : [angleA, fwd];
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
  /** プリセットごとの画角(度)。CameraController(SetPiece3D.tsx)がcamera.fovへ遷移補間する */
  fov: number;
}

/** プリセットごとのカメラ画角(度)。overhead/kicker/gk/ground/replayは素直な値、
 * broadcastだけ「望遠」の狭画角にする（実際のCanvasカメラfovと一致させ、下のbroadcast分岐の
 * 距離フィット計算もこの値を使う＝見た目と自動フィットがずれない） */
export const CAMERA_PRESET_FOV: Record<CameraPresetId, number> = {
  overhead: 46,
  broadcast: 30,
  kicker: 38,
  gk: 42,
  ground: 44,
  replay: 40,
};

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
/** broadcast: fovフィット計算(下のbroadcastRequiredHalfAngles)が前提とする画面アスペクト比
 * （横/縦）。実際のCanvasの実アスペクトとは一致しないことがあるが、水平画角を垂直画角
 * （three.jsのPerspectiveCamera.fovは垂直画角）へ換算するための固定値として使う。 */
const BROADCAST_ASSUMED_ASPECT = 1.55;
/** broadcast: fovフィットへ掛ける余白係数（必要画角ちょうどだと選手・ボールが画面端ぎりぎりに
 * なるため、一回り広げてから18〜40度にクランプする） */
const BROADCAST_FOV_MARGIN = 1.12;

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
 * broadcastのfovフィット計算（C-2項）。旧実装は「水平バウンディング円半径 ÷ カメラ→中心の
 * 3D距離」のatanを画面全体の必要半画角として扱っていたが、これは実質「対角方向の半画角」を
 * 「水平半画角」として過大評価するもので、常に上限40度へクランプされ選手が小さく写りすぎて
 * いた。正しくは、各トークン位置をカメラのローカル空間（forward=注視点方向、right/upは
 * world-upから作った正規直交基底）へ個別に投影し、水平方向・垂直方向それぞれで実際に必要な
 * 半画角の最大値を別々に求める。three.jsのPerspectiveCamera.fovは垂直画角のため、水平側の
 * 必要半画角はBROADCAST_ASSUMED_ASPECT(想定アスペクト比)で垂直画角相当へ換算してから
 * 垂直側と比較する。トークンは接地点(y=0)として扱う（選手モデルの身長ぶんの見込み角は
 * BROADCAST_FOV_MARGINの余白で吸収する）。 */
function broadcastRequiredHalfAngles(
  points: WorldPoint2[],
  cam: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number }
): { hHalf: number; vHalf: number } {
  const fx = target.x - cam.x;
  const fy = target.y - cam.y;
  const fz = target.z - cam.z;
  const flen = Math.hypot(fx, fy, fz) || 1;
  const fwd = { x: fx / flen, y: fy / flen, z: fz / flen };
  // world up(0,1,0)からright/upの正規直交基底を作る（broadcastのカメラ位置関係上、forwardが
  // ほぼ真上/真下を向くことは無く、この外積が退化することは無い）
  const crossX = fwd.y * 0 - fwd.z * 1;
  const crossY = fwd.z * 0 - fwd.x * 0;
  const crossZ = fwd.x * 1 - fwd.y * 0;
  const rlen = Math.hypot(crossX, crossY, crossZ) || 1;
  const right = { x: crossX / rlen, y: crossY / rlen, z: crossZ / rlen };
  const up = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  let hHalf = 0;
  let vHalf = 0;
  for (const p of points) {
    const dx = p.x - cam.x;
    const dy = 0 - cam.y; // トークンは接地点(y=0)として扱う
    const dz = p.z - cam.z;
    const xc = dx * right.x + dy * right.y + dz * right.z;
    const yc = dx * up.x + dy * up.y + dz * up.z;
    const depth = Math.max(1e-3, dx * fwd.x + dy * fwd.y + dz * fwd.z); // カメラ前方向の深度
    hHalf = Math.max(hHalf, Math.abs(Math.atan(xc / depth)));
    vHalf = Math.max(vHalf, Math.abs(Math.atan(yc / depth)));
  }
  return { hHalf, vHalf };
}

/** broadcastRequiredHalfAnglesの水平/垂直半画角から、垂直fov(度)を求める（余白倍率込み・
 * 18〜40度クランプ前の「本当に必要なfov」）。aspect省略時はBROADCAST_ASSUMED_ASPECTを使う。 */
function rawBroadcastFovDeg(
  points: WorldPoint2[],
  cam: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  aspect: number = BROADCAST_ASSUMED_ASPECT
): number {
  const { hHalf, vHalf } = broadcastRequiredHalfAngles(points, cam, target);
  const vFull = vHalf * 2;
  const hFullAsVertical = 2 * Math.atan(Math.tan(hHalf) / aspect);
  const fovRad = Math.max(vFull, hFullAsVertical) * BROADCAST_FOV_MARGIN;
  return fovRad * (180 / Math.PI);
}

/** broadcastのカメラ後退フォールバック（C-2-b項）が、後退後のカメラ|x|をクランプする境界。
 * スタジアムのボウル内周（背面壁の内側面、STADIUM_M各層の水平投影を積み上げて算出）から
 * さらに2m内側を安全マージンとして取る＝これ以上後退させるとスタンド外へ出てしまう限界。
 * 8人制(pitchWidthM=50)で≈50.9m、11人制(pitchWidthM=68)で≈59.9m（Node計算で実測確認）。
 * pitchWidthM以外はフォーマット非依存の定数のみで決まる。 */
function broadcastBowlInnerBoundaryXM(dims: PitchDims): number {
  const bowlHalfX =
    dims.pitchWidthM / 2 + GRASS_MARGIN_M + STADIUM_M.ledMarginM + STADIUM_M.ledThicknessM + STADIUM_M.standMarginM;
  const backWallR =
    STADIUM_M.lowerDepthM * Math.cos(STADIUM_M.lowerRakeRad) + STADIUM_M.upperDepthM * Math.cos(STADIUM_M.upperRakeRad);
  return bowlHalfX + backWallR - 2;
}

/** GLBスタジアム統合時のbroadcastカメラアンカー（components/AlfaStadium.tsxのGLB実測値由来）。
 * GLB内のANCHOR_BROADCASTはGLBローカル座標で(x=-7, y=28, z=86)（GLBはX軸=105m長辺=ゴールライン
 * 方向、Z軸=68m幅=タッチライン方向）。AlfaStadium.tsxのルート変換 rotation=[0,-Math.PI/2,0] は
 * 「アプリworldX = -GLBローカルz」「アプリworldZ = GLBローカルx」に相当する（Y軸-90°回転の
 * 行列そのもの）ため、変換後は worldX=-86, worldZ=-7, worldY≈28（ルートのposition.y=-0.32は
 * 誤差として無視できる）。この対応は、アプリの既存座標規約（dims.pitchWidthM⇔X軸＝タッチライン
 * 方向、dims.pitchLengthM⇔Z軸＝ゴールライン方向）とGLBの軸（幅=Z、長さ=X）が一致することの
 * 確認にもなっている。8人制・プロシージャル時はこの定数を一切参照しない。
 *
 * yはGLBのANCHOR_BROADCAST実測(28m)ではなく40mを使う: 上層スタンドの座席は|x|65.5〜90.9m・
 * y20.6〜39.1mを占め、(x=-86, y=28)は座席ボリュームの内部＝ピッチが座席で完全に遮蔽される
 * （実測で画面の86%が暗色になった）。y=40は座席上端(39.1m)を超えて観客の頭越しにピッチを
 * 見通せる実測確認済みの高さ（屋根はさらに上）。GLB側のANCHOR_BROADCASTが見通しの効く位置へ
 * 修正されたら、この補正は撤廃してGLB実測値へ戻してよい。 */
const GLB_BROADCAST_ANCHOR = { x: -86, y: 40, z: -7 } as const;
/** GLBスタジアム時の後退フォールバック用のカメラ|x|境界。GLBの上層スタンド外端は|x|≈114m・
 * ファサード/プラザは±195mまであるため、アンカー(|x|=86)からさらに14m後退できる100mを境界に
 * する（プロシージャル用のbroadcastBowlInnerBoundaryXMはGLB寸法と無関係のため使わない）。 */
const GLB_BROADCAST_BOUNDARY_X_M = 100;

/**
 * カメラプリセットの位置・注視点を算出する（純粋関数。現在の BoardState から一度だけ計算し、
 * 以降のトークン移動などには追従させない＝プリセット選択時にのみ視点を切り替える設計）。
 * dims省略＝8人制（後方互換）。11人制ピッチで計算するときは
 * computeCameraPreset(id, state, getPitchDims(11)) のように渡す（SetPiece3D側が
 * state.setPiece.format から選んで渡すだけにする＝この関数自身はstateのformatを見ない）。
 * - overhead: ピッチ中心の真上・水平距離と高さが等しい45°俯瞰。
 * - broadcast: 実際のテレビ中継と同じ「メインスタンド中腹に固定設置されたカメラ」。
 *   X側は被写体フィット中心と逆サイドへ回り込む「逆アングル方式」（C-1項）で選ぶため、
 *   距離自体は伸縮させないまま常に被写体との間に十分な距離を確保する（片側固定だと
 *   手前側のCK/FKでカメラのすぐ近くに被写体が来てフレーム外に出ていたバグの対策）。
 *   画角(fov)は現在配置されている全トークン（選手・相手・ボール）をカメラ空間へ投影した
 *   実際の必要半画角から求める「ズーム」（C-2項、rawBroadcastFovDeg）。アンカーが常に
 *   ボウル内側（外壁より内）に収まるため、引きすぎてスタジアム外へ出ることがない。実測では
 *   フレーム下端は芝の内側に着弾する＝手前スタンド上空・ボウル内側から見下ろす画になり、
 *   手前スタンド自体が画面に写り込むことはない（カメラがそこに設置されているため）。
 * - kicker: セットプレーの攻撃対象ゴール中心（setPiece.side==="defense"ならy0側ゴール／
 *   それ以外はy100側ゴール。SetPieceBar の boxatk/boxdef 判定と同じ規約）へ向け、
 *   ボールの後方・目線の高さに立って狙う方向を見る。
 * - gk: 守備ゴール（データ座標は常にy0=自陣固定）の1.7m前に立ち、ボールを見る。
 * - ground: ボールに近い側のタッチライン際に立つ目線1.2mの地上カメラ。ボールへ向けて水平に見る。
 * - replay: ボールとピッチ中心の中間を見下ろす高所（スタンド高9mを超える12m）から、ゆっくり
 *   自動オービットするための初期姿勢。半径はピッチ内に収まるようクランプ済み（周回そのものは
 *   SetPiece3D.tsx側が担当。reduced-motion時は静止したこの初期姿勢のまま）。
 * @param aspect broadcastのfovフィットに使う実際の画面アスペクト比(横/縦)。省略時は
 *   BROADCAST_ASSUMED_ASPECT（従来の固定値）。broadcast以外のプリセットは無視する。
 * @param opts.glbStadium true時、broadcastのカメラアンカーをGLB_BROADCAST_ANCHOR
 *   （GLBスタジアム統合時の実測アンカー）へ差し替える。距離が十分遠いため必要fovは通常の
 *   18-40度クランプ内に収まり、fovフィット・後退フォールバックのロジック自体は8人制/
 *   プロシージャル時と完全に共有する（ここで分岐するのはアンカー座標(rx/ry/rz)のみ）。
 *   8人制・プロシージャル時は省略でよい（従来どおりの計算になる）。
 */
export function computeCameraPreset(
  id: CameraPresetId,
  state: BoardState,
  dims: PitchDims = DEFAULT_DIMS,
  aspect?: number,
  opts?: { glbStadium?: boolean }
): CameraPose {
  const ball = state.ball ?? { x: 50, y: 50 };
  const ballW = boardToWorld(ball, dims);

  if (id === "overhead") {
    const d = dims.pitchLengthM * 1.15;
    return { position: [0, d, d], target: [0, 0, 0], fov: CAMERA_PRESET_FOV.overhead };
  }
  if (id === "broadcast") {
    // 実中継方式: カメラ位置はメインスタンド上の固定アンカー（トークン配置やフィット半径に
    // 応じて距離を伸縮させない＝実物の中継カメラが台座から動かないのと同じ）。
    //  - rxMag: ピッチ外周（芝ラン込みGRASS_MARGIN_M）→LED看板の外側(standMarginM)を挟んで、
    //    下層スタンド(lowerDepthM)を55%だけ奥へ踏み込んだ水平位置（原点からの距離）。
    //  - ry: 前面壁(frontWallM)の上端から、rxMagと同じ55%まで下層スタンドの傾斜(lowerRakeRad)を
    //    登った高さ＋観客の頭上に出る3.2m＝「下層スタンド中腹の観客席上空」。
    // rxMag・ryはピッチ寸法(pitchWidthM)にほぼ依存しない（rxMagのみ半分だけ影響）ため、
    // 8人制・11人制どちらでも同じ式で常にボウル内側（下層スタンドの中腹）に収まる。
    //   8人制 (pitchWidthM=50):  rxMag=25+3+2+14*0.55=37.7m, ry=1.1+sin24°*7.7+3.2≈7.43m
    //     外壁(STADIUM_M各層の水平投影合計、backWallTop.r≈21.36m＋bowlHalfX≈31.52m)|x|≈52.9m
    //     → rxMag=37.7mは十分内側。
    //   11人制(pitchWidthM=68):  rxMag=34+3+2+14*0.55=46.7m, ry≈7.43m（pitchWidthM非依存）
    //     外壁|x|≈61.9m(bowlHalfX≈40.52m+backWallTop.r≈21.36m) → rxMag=46.7mは十分内側。
    // どちらの人数制でも rxMag は外壁までまだ 15m 前後の余裕を残す＝スタジアム内に収まる。
    // GLBスタジアム統合時（opts.glbStadium）はrxMag/ryをGLB_BROADCAST_ANCHOR（実測の放送カメラ
    // アンカーをアプリ座標へ変換した固定値）へ差し替える。プロシージャル時の可変式（ピッチ幅・
    // スタンド寸法から逆算する値）はGLBの実スタジアム寸法とは対応しないため使わない。
    const rxMag = opts?.glbStadium
      ? Math.abs(GLB_BROADCAST_ANCHOR.x)
      : dims.pitchWidthM / 2 + GRASS_MARGIN_M + STADIUM_M.standMarginM + STADIUM_M.lowerDepthM * 0.55;
    const ry = opts?.glbStadium
      ? GLB_BROADCAST_ANCHOR.y
      : STADIUM_M.frontWallM + Math.sin(STADIUM_M.lowerRakeRad) * STADIUM_M.lowerDepthM * 0.55 + 3.2;
    const { cx, cz } = boundingCircle(collectTokenWorldPoints(state, dims));
    // 逆アングル方式（C-1項）: アンカーのX側を被写体フィット中心cxと逆サイドに選ぶ。
    // 旧実装は常にX<0側（rx=-rxMag）固定だったため、被写体もたまたまX<0側（cx<=0、カメラと
    // 同じ側＝手前側）に寄るCK/FKでは距離が十分に取れず（ピッチ幅ぶんしか離れられない）、
    // 必要画角が18〜40度の上限を超えてフレーム外に出ていた（下のrawBroadcastFovDegを
    // 精密化しても、そもそも上限40では足りない距離だった）。cx<=0(手前側)ならX>0側へ回り込み、
    // cx>0(奥側。旧実装のX<0固定でも距離は元々十分だった)ならX<0側のまま＝どちらの場合も
    // アンカーは被写体と逆サイドになり、ピッチ幅+スタンド奥行ぶんの距離が常に確保される。
    const rx = (cx <= 0 ? 1 : -1) * rxMag;
    const halfLen = dims.pitchLengthM / 2;
    // カメラz位置＝被写体フィット中心のz。ゴールライン際の被写体でもアンカーがゴール裏へ
    // 回り込みすぎないよう、ハーフウェイからの残り距離を8m残してクランプする。
    // GLBスタジアム統合時は被写体フィット中心へ寄せず、実TVガントリーの固定z位置
    // （GLB_BROADCAST_ANCHOR.z）をそのまま使う。
    const rz = opts?.glbStadium ? GLB_BROADCAST_ANCHOR.z : clamp(cz, -(halfLen - 8), halfLen - 8);
    const target: [number, number, number] = [cx, 0.6, cz];
    const points = collectTokenWorldPoints(state, dims);
    const fitAspect = aspect ?? BROADCAST_ASSUMED_ASPECT;
    // 画角(fov)をズームとして使う（C-2項）: 全トークン位置をカメラ空間へ投影し、実際に必要な
    // 水平/垂直半画角からfovを求める（rawBroadcastFovDeg。旧実装の「水平バウンディング円半径
    // ÷3D距離」のatanは対角方向の半画角を水平半画角として過大評価しており、常に上限40へ
    // クランプされ選手が小さく写りすぎていた）。aspectは実際のCanvasアスペクト比
    // （SetPiece3D.tsx側から渡す。省略時はBROADCAST_ASSUMED_ASPECT）で、水平→垂直画角換算に使う。
    let camX = rx;
    let camY = ry;
    let camZ = rz;
    // 境界律速（後退がボウル内周で頭打ちになった）かどうか。trueのときだけfov上限を40度から
    // 必要値まで開放する（下記）。
    let boundaryLimited = false;
    const rawFovDeg = rawBroadcastFovDeg(points, { x: camX, y: camY, z: camZ }, { x: target[0], y: target[1], z: target[2] }, fitAspect);
    if (rawFovDeg > 40) {
      // C-2-bフォールバック: スマホ縦長など実アスペクトが想定より狭いと、必要fovが上限40を
      // 超えてトークンがフレーム外に出る。target→アンカー方向へカメラを後退させ距離を伸ばし、
      // 必要半画角そのものを縮める（後退倍率=tan(必要fov/2)/tan(40°/2)）。
      // 後退しすぎてスタジアムのボウル外（背面壁より外）へ出ないよう、倍率そのものを
      // 「|camX|がボウル内周（背面壁内側-2m相当。broadcastBowlInnerBoundaryXM参照）に達する
      // 倍率」で頭打ちにしてから x/y/z へ一括適用する。camXだけを事後クランプすると
      // target→カメラの直線から外れて俯角が急変するため、必ず倍率側を制限する。
      let factor = Math.tan((rawFovDeg * Math.PI / 180) / 2) / Math.tan((40 * Math.PI / 180) / 2);
      // 境界はスタジアム実装ごとに異なる: プロシージャルはボウル内周の逆算値、GLBは
      // GLB_BROADCAST_BOUNDARY_X_M（アンカー|x|=86mより外へまだ後退余地がある実寸境界。
      // プロシージャル境界(11人制≈61.9m)を使うとアンカーが最初から境界外→後退量ゼロで
      // 「境界律速」扱いになり、fovだけが黙って66度側へ開くという誤動作になる）。
      const xBoundary = opts?.glbStadium ? GLB_BROADCAST_BOUNDARY_X_M : broadcastBowlInnerBoundaryXM(dims);
      const dx = rx - target[0];
      if (dx !== 0) {
        const fMax = (Math.sign(dx) * xBoundary - target[0]) / dx;
        if (factor > fMax) {
          factor = Math.max(1, fMax);
          boundaryLimited = true;
        }
      }
      camX = target[0] + dx * factor;
      camY = target[1] + (ry - target[1]) * factor;
      camZ = target[2] + (rz - target[2]) * factor;
    }
    // 後退後の実際のカメラ位置で最終fovを求め直す。通常は18〜40度クランプだが、
    // 後退が境界律速で距離を伸ばしきれなかったケースに限り、フレームアウトさせないことを
    // 優先して上限を必要値（最大66度）まで開放する（広角の歪みより選手が写らないことの
    // ほうが致命的）。実UIのCanvasはヘッダー/バー込みでアスペクト比≳0.6となり、
    // 0.6で必要fov≈63のため66で実機の全ケースを収容できる（Node計算で確認）。
    // それ未満の合成的な極端縦長は66度で妥協する。
    const finalRawFov = rawBroadcastFovDeg(
      points,
      { x: camX, y: camY, z: camZ },
      { x: target[0], y: target[1], z: target[2] },
      fitAspect
    );
    const fovDeg = boundaryLimited
      ? clamp(finalRawFov, 18, 66)
      : clamp(finalRawFov, 18, 40);
    return {
      position: [camX, camY, camZ],
      target,
      fov: fovDeg,
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
      fov: CAMERA_PRESET_FOV.kicker,
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
      fov: CAMERA_PRESET_FOV.ground,
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
      fov: CAMERA_PRESET_FOV.replay,
    };
  }
  // gk: 守備ゴール（常にy0=自陣）の1.7m前に立ち、ボールを見る
  const goalZ = boardYToWorldZ(0, dims);
  return {
    position: [0, EYE_HEIGHT_M, goalZ + 1.7],
    target: [ballW.x, 0.3, ballW.z],
    fov: CAMERA_PRESET_FOV.gk,
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
/** 頭髪トーン（黒/焦茶の2色。SKIN_TONESとは異なるseed変換で選ぶため、肌トーンと機械的に
 * 相関しない＝GLB選手モデルのHairマテリアルにのみ使う。プロシージャル人型は頭が肌色の
 * 単一球のみで髪メッシュを持たないため対象外） */
export const HAIR_TONES: [string, string] = ["#1c1712", "#3c2415"];
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
   環境プリセット（空ドーム・光・霧の色/強度セット）。three.jsには依存しない数値・色文字列のみ。
   実際のCanvasTexture生成・Light/Fogのインスタンス化はcomponents/SetPiece3DStadium.tsx・
   components/SetPiece3D.tsx側が行う（このファイルの「three.js非依存」方針を保つ）。
   現時点はduskのみ使用し、時間帯切替UIは無い（ACTIVE_SKY_PRESETを直接参照するだけ）。
   day/nightは将来の切替に備えた構造だけを用意した推定値（仕様上の厳密な色指定は無い）。
   ============================================================ */
export interface SkyPreset {
  /** 空ドームの天頂色（canvasグラデ最上部＝ワールドの真上方向） */
  zenith: string;
  /** 地平線近くの暖色帯（サンセット/夕焼け寄りの帯） */
  horizonWarm: string;
  /** 地平線ライン直下（ドームの赤道＝ワールドy=0付近）の淡い色 */
  horizonPale: string;
  /** 低空に浮かべる雲スプライトの基調色（白地の雲テクスチャへ乗算で合成） */
  cloud: string;
  /** シーンFogの色。ドームのhorizonPaleとは別値（仕様どおり#aebfdaをduskに設定） */
  fogColor: string;
  /** hemisphereLightの空側/地側の色・強度 */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** ambientLightの強度（色は常に白固定） */
  ambientIntensity: number;
  /** 太陽=directionalLightの色・強度・位置（低いほど斜光＝夕方寄りの角度になる） */
  sunColor: string;
  sunIntensity: number;
  sunPosition: [number, number, number];
  /** 反対側から当てる、影を落とさないフィルライト（directionalLight）の色・強度・位置 */
  fillColor: string;
  fillIntensity: number;
  fillPosition: [number, number, number];
}

export type SkyPresetId = "day" | "dusk" | "night";

export const SKY_PRESETS: Record<SkyPresetId, SkyPreset> = {
  day: {
    zenith: "#3d78c9",
    horizonWarm: "#bcdcf5",
    horizonPale: "#eef6ff",
    cloud: "#ffffff",
    fogColor: "#cfe3f5",
    hemiSky: "#cfe3ff",
    hemiGround: "#3f7d4e",
    hemiIntensity: 0.7,
    ambientIntensity: 0.22,
    sunColor: "#fff6e6",
    sunIntensity: 1.3,
    sunPosition: [24, 34, 18],
    fillColor: "#bcd0e8",
    fillIntensity: 0.3,
    fillPosition: [-24, 20, -18],
  },
  dusk: {
    zenith: "#1b2c52",
    horizonWarm: "#e8b47e",
    horizonPale: "#c9d8ee",
    cloud: "#f2d9c0",
    fogColor: "#aebfda",
    hemiSky: "#a9bce0",
    hemiGround: "#33684a",
    hemiIntensity: 0.75,
    ambientIntensity: 0.12,
    // 夕暮れの実試合は「空は夕焼け・ピッチは照明で明るい」が正しい見え方（参考画像準拠）。
    // 影付きメインライトは低角の夕日ではなく高角のスタジアム照明（白色寄り）として設計し、
    // 夕日の暖色は影なしフィル側の低角斜光で補う。低角光をメインにするとピッチへの入射が
    // sin(13.5°)≈0.23まで落ち、実測でピッチ輝度35/255の暗黒画面になっていた。
    sunColor: "#fff0d8",
    sunIntensity: 1.9,
    sunPosition: [26, 42, 14],
    fillColor: "#ffd9a8",
    fillIntensity: 0.45,
    fillPosition: [-34, 12, -16],
  },
  night: {
    zenith: "#050912",
    horizonWarm: "#1c2740",
    horizonPale: "#283a5c",
    cloud: "#2a3550",
    fogColor: "#0d1424",
    hemiSky: "#33456e",
    hemiGround: "#101a14",
    hemiIntensity: 0.32,
    ambientIntensity: 0.05,
    sunColor: "#aebfe6",
    sunIntensity: 0.5,
    sunPosition: [20, 30, 12],
    fillColor: "#3c4d78",
    fillIntensity: 0.22,
    fillPosition: [-20, 16, -12],
  },
};

/** 現在アクティブな環境プリセット。切替UIは無く、常にduskを指す（統括決定：夕暮れ+照明点灯を既定にする） */
export const ACTIVE_SKY_PRESET: SkyPresetId = "dusk";

/* ============================================================
   スタジアム環境（Phase3: 角丸長方形プランの連続ボウル）の寸法・配色。
   実際のジオメトリ（角丸リング断面の押し出し）・InstancedMesh・canvasテクスチャ生成は
   すべてcomponents/SetPiece3DStadium.tsx側が行う（このファイルは数値・色のみを持つ）。
   すべて「ピッチ外周からの基準リング」を中心に、各層のr(外向きオフセットm)・h(高さm)を
   下から順に積み上げる設計。8人制/11人制のプラン差(ボウル内周サイズ)はdims(pitchWidthM/
   pitchLengthM)側で吸収し、ここの相対寸法(壁の高さ・スタンドの奥行/傾斜等)は共通。 */
export const STADIUM_M = {
  /** LED看板: ピッチ外周(芝ラン込み)からの距離・高さ・厚み・コーナー丸め半径 */
  ledMarginM: 1.4,
  ledHeightM: 0.9,
  ledThicknessM: 0.12,
  ledCornerRadiusM: 1.5,
  /** LED看板からスタンド前面壁までの距離 */
  standMarginM: 2.0,
  /** 前面壁（コンクリ・低め=視界を遮らない） */
  frontWallM: 1.1,
  /** 下層スタンド: 奥行(スロープ長)・傾斜角(ラジアン、約24°) */
  lowerDepthM: 14,
  lowerRakeRad: (24 * Math.PI) / 180,
  /** 中間コンコース帯: 高さ（暗色の帯。中に出入口グローを等間隔配置） */
  concourseHeightM: 1.6,
  /** 上層スタンド: 奥行(スロープ長)・傾斜角(ラジアン、約31°) */
  upperDepthM: 10,
  upperRakeRad: (31 * Math.PI) / 180,
  /** 背面壁 */
  backWallM: 2.4,
  /** 軽量品質時: コンコース/上層を省き、下層スタンドの上に直接この高さの壁を立てて
   * 屋根を掛ける（下層+屋根+LEDのみの簡易ボウルでも、屋根の高さ・クリアランス感が
   * 標準品質と大きくズレないようにするための簡易背面壁） */
  lightBackWallM: 3.2,
  /** 片持ち屋根: 内側への張り出し量・厚み・先端の下がり量・先端エッジラインの太さ */
  roofSpanM: 8,
  roofThickM: 0.4,
  roofDropM: 1.0,
  roofEdgeH: 0.12,
  /** ボウル角丸長方形プランのコーナー半径・分割数 */
  cornerRadiusM: 9,
  cornerSegs: 8,
  /** 手すり（各層最前列の細いチューブ状リング） */
  railHeightM: 0.9,
  railThickM: 0.07,
  /** コンコース帯のvomitory(出入口グロー)の配置間隔・サイズ */
  vomPitchM: 12,
  vomWidthM: 1.6,
  vomHeightM: 1.0,
  /** 屋根内縁の投光器列（InstancedMesh）の配置間隔・板サイズ */
  floodPitchM: 6,
  floodPlateWM: 0.55,
  floodPlateHM: 0.3,
  /** Near LOD観客ビルボード（InstancedMesh、下層ピッチ側2列ぶん）の総数・板サイズ */
  crowdNearCount: 1200,
  crowdBillW: 0.55,
  crowdBillH: 0.85,
  /** Near観客インスタンスの自動非表示しきい値（m、カメラ→ワールド原点の距離）。
   * hideを超えたら非表示、showを下回ったら再表示（ヒステリシス。しきい値付近での
   * 毎フレームON/OFF点滅を防ぐ）。high品質のみ描画対象（Near観客自体がhigh限定のため）。 */
  crowdNearHideDistM: 60,
  crowdNearShowDistM: 52,
  /** 外壁シェル（角丸リング外周の垂直フィン+コンコース階の温白ガラス帯）。高/中品質のみ、
   * 背面壁のさらに外側に立てる「建築物に見える最低限」の薄い外殻。フィンはoffsetM分
   * 外側、高さ0〜背面壁上端まで。ガラス帯はコンコース帯と同じ高さ区間・同じ半径に重ねる。 */
  exteriorShellOffsetM: 1.2,
  exteriorFinTileM: 2.4,
} as const;
/** LED看板: 白文字・紺地（自ブランドの架空文言。実在ブランド想起なし） */
export const LED_TEXT = "ALFA FOOTBALL   ◇   TACTICAL STUDIO   ◇   PLAY SMARTER   ◇   ";
export const LED_BG_COLOR = "#0d2f6b";
export const LED_TEXT_COLOR = "#ffffff";
/** コンクリ躯体（前面壁・背面壁）・コンコース帯・屋根上面/下面の配色（架空・中立トーン） */
export const STADIUM_CONCRETE_COLOR = "#9aa3ad";
export const STADIUM_CONCOURSE_COLOR = "#20242b";
export const STADIUM_ROOF_TOP_COLOR = "#dfe4ea";
export const STADIUM_ROOF_UNDER_COLOR = "#3a4149";
export const STADIUM_VOMITORY_GLOW_COLOR = "#f4d9a8";
export const STADIUM_FLOODLIGHT_COLOR = "#eef4ff";
/** 座席の2トーン（紺系）。観客ドット色は下のSTADIUM_CROWD_COLORSへ別途持つ */
export const STADIUM_SEAT_TONES: [string, string] = ["#1e3a6e", "#17305c"];
/** 観客ドットの服色分布（紺60%/濃紺20%/白8%/その他ランダム12%）。配列の並びを
 * 累積比率のテーブルとして使う（他のseeded-hash抽選と同じ「0..1の一様乱数を閾値で区切る」方式）。 */
export const STADIUM_CROWD_COLORS: { color: string; upTo: number }[] = [
  { color: "#1b3a63", upTo: 0.6 }, // 紺 60%
  { color: "#12233f", upTo: 0.8 }, // 濃紺 20% (累積80%)
  { color: "#e9edf2", upTo: 0.88 }, // 白 8% (累積88%)
  { color: "#c0453f", upTo: 0.91 }, // その他(ランダム) 12%のうち内訳を4色均等に割る
  { color: "#d9a441", upTo: 0.94 },
  { color: "#3f8f6b", upTo: 0.97 },
  { color: "#6b4fa0", upTo: 1.0 },
];
/** 外壁シェルの配色（架空・中立トーン）。フィンは中立グレーの明暗2トーン、
 * ガラス帯はコンコース照明が透けて見える想定の温白色をemissiveで軽く光らせる。 */
export const STADIUM_EXTERIOR_FIN_LIGHT = "#aab0b8";
export const STADIUM_EXTERIOR_FIN_DARK = "#7a828c";
export const STADIUM_EXTERIOR_GLASS_COLOR = "#fbe6c0";
/** 味方フィールドプレイヤーの3D固定ユニフォーム色。2Dトークンはポジション別色(GK=金/FW=橙等)だが、
 * 3Dでそのまま使うとFW橙・GK金と味方GK(蛍光黄)が被って見分けづらいため、3Dは
 * 「味方=単一のチームジャージ色」に統一する(クラブカラーの深緑。白ショーツ+白背番号で芝と分離) */
export const OWN_KIT_JERSEY = "#0c6e37";
/** ピッチ外周〜スタンド下まで途切れなく敷く場外グラウンド(エプロン)の色 */
export const APRON_COLOR = "#276b3d";
/** スコアボード（両ゴール裏）: 自陣側/相手側のチームカラー矩形（架空・中立トーン） */
export const SCOREBOARD_HOME_COLOR = OWN_KIT_JERSEY;
export const SCOREBOARD_AWAY_COLOR = "#8a3a3a";

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

/* ============================================================
   ブロブ影（接地感）: 選手・ボールの浮き高さ(lift)から円板の半径・不透明度を求める純粋計算。
   three.js非依存（実際のcanvasテクスチャ・Mesh/Material生成はcomponents/SetPiece3D.tsx側）。
   ============================================================ */

/** ブロブ影の基準半径(m、lift=0=接地のとき)。仕様どおり0.42m */
export const BLOB_SHADOW_RADIUS_M = 0.42;
/** 実シャドウ(directional castShadow)が有効な標準品質のときの基準不透明度（影と役割が
 * 重なるため薄める＝仕様どおり0.22）。軽量品質（実シャドウ無し）は接地感の主役になるため
 * 濃いめの0.4を使う。 */
export const BLOB_SHADOW_OPACITY_WITH_REAL_SHADOW = 0.22;
export const BLOB_SHADOW_OPACITY_NO_REAL_SHADOW = 0.4;

export interface BlobShadowState {
  radiusM: number;
  opacity: number;
}
/**
 * ヘディングのジャンプ中の浮き上がり高さlift(m、computeHeaderPoseの戻り値。接地時0)から
 * ブロブ影の半径・不透明度を求める（liftが増えるほど半径を広げ不透明度を下げる＝浮遊感。
 * lift=0のときは常に radiusM=BLOB_SHADOW_RADIUS_M・opacity=baseOpacityで、既存の接地時の
 * 見た目から変わらない）。
 */
export function computeBlobShadow(lift: number, baseOpacity: number): BlobShadowState {
  const l = Math.max(0, lift);
  return {
    radiusM: BLOB_SHADOW_RADIUS_M * (1 + l * 1.1),
    opacity: baseOpacity * clamp01(1 - l * 0.9),
  };
}
