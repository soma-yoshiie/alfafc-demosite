"use client";

// セットプレー3Dの「スタジアム建築物」パーツ（角丸ボウルのスタンド一式・外壁シェル・
// 芝のPBRテクスチャ生成）。空ドーム・雲はPhase5でcomponents/SetPiece3DEnv.tsxへ分離した。
// components/SetPiece3D.tsx からのみimportすること（このファイルを他画面から静的importしない＝
// 3D本体と同じチャンクに留め、バンドル分離を保つ）。逆方向（本ファイルがSetPiece3D.tsxを
// importする）は循環importになるため行わない＝共有したい純粋な数値定数は lib/setPiece3d.ts へ置く
// （GRASS_MARGIN_M・PitchDims・Sp3dQuality等はそちらからimportする）。
//
// 性能予算: ジオメトリ・マテリアル・テクスチャはすべてモジュールスコープ/Mapキャッシュで共有し、
// 再マウントのたびに作り直さない（他の3Dパーツと同じ流儀）。芝のPBRテクスチャは
// pitch format(8人制/11人制)×品質(high/medium)ごとに1回だけ生成しキャッシュする。

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  anisotropyForQuality,
  GRASS_MARGIN_M,
  LED_BG_COLOR,
  LED_TEXT,
  LED_TEXT_COLOR,
  SCOREBOARD_AWAY_COLOR,
  SCOREBOARD_HOME_COLOR,
  STADIUM_CONCOURSE_COLOR,
  STADIUM_CONCRETE_COLOR,
  STADIUM_CROWD_COLORS,
  STADIUM_EXTERIOR_FIN_DARK,
  STADIUM_EXTERIOR_FIN_LIGHT,
  STADIUM_EXTERIOR_GLASS_COLOR,
  STADIUM_FLOODLIGHT_COLOR,
  STADIUM_M,
  STADIUM_ROOF_TOP_COLOR,
  STADIUM_ROOF_UNDER_COLOR,
  STADIUM_SEAT_TONES,
  STADIUM_VOMITORY_GLOW_COLOR,
  type PitchDims,
  type Sp3dQuality,
} from "@/lib/setPiece3d";

/* ============================================================
   芝のPBRテクスチャ生成（high/medium品質のみ。mobile品質は従来の簡易縞テクスチャへ
   フォールバックする＝components/SetPiece3D.tsx の PitchGround 側が quality で分岐し、
   こちらは呼ばない）。baseColorはhigh=1024×1024・medium=512×512、normalMap/roughnessMapは
   その半分の解像度をformat×qualityごとに1回だけ生成しキャッシュする。
   normalMap/roughnessMapともbaseColorと同じ「高さ場」由来のデータ(grassHeightField)・
   「使用感パッチ」由来のデータ(grassWearSpots/wearInfluence)を共有し、見た目とマップの整合を保つ。
   ============================================================ */

/** 芝縞の本数（旧・簡易縞テクスチャのSTRIPE_COUNTと同じ11本に揃える） */
const GRASS_STRIPE_COUNT = 11;

/** 縞の基準2色。輝度差が仕様の「6%程度」に収まるよう調整済み（実測差約5.6%） */
const STRIPE_A: [number, number, number] = [47, 125, 70]; // #2f7d46
const STRIPE_B: [number, number, number] = [39, 107, 59]; // #276b3b
/** 使用感パッチ（薄く混ぜる土色寄りのトーン） */
const WORN_COLOR: [number, number, number] = [138, 111, 66];

/** 0..1 の決定的な擬似乱数（他所のsin-hashと同じ手法。フレーム間・再生成間で安定） */
function seededUnit2(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 芝の「高さ場」（縞＋大きめの色ムラ(低周波)＋微細ノイズを合成した無次元の高さ、およそ-1..1）。
 * baseColorの明度変調とnormalMapの法線変換の両方がこの1関数を共有する（見た目と法線がずれない）。
 * u/vはグラウンドプレーン全体(margin込み)に対する0..1のUV座標。 */
function grassHeightField(u: number, v: number): number {
  const stripe = Math.sin(v * GRASS_STRIPE_COUNT * Math.PI) >= 0 ? 1 : -1;
  const low =
    Math.sin(u * 5.3 + v * 3.1) * 0.5 +
    Math.sin(u * 2.1 - v * 4.7 + 1.7) * 0.35 +
    Math.sin(u * 7.9 + v * 1.3 + 4.2) * 0.25;
  const fine = seededUnit2(u * 583.1, v * 391.7) - 0.5;
  return stripe * 0.55 + low * 0.28 + fine * 0.34;
}

interface WearSpot {
  u: number;
  v: number;
  ru: number;
  rv: number;
  strength: number;
}

/** 使用感パッチの中心・半径・強さ（UV空間、pitch formatに依存）。
 * ゴール前(六yd box付近)×2・PKスポット付近×2・センターサークル×1の計5箇所。 */
function grassWearSpots(dims: PitchDims): WearSpot[] {
  const W = dims.pitchWidthM + GRASS_MARGIN_M * 2;
  const L = dims.pitchLengthM + GRASS_MARGIN_M * 2;
  const halfL = dims.pitchLengthM / 2;
  const toUV = (xM: number, zM: number) => ({ u: (xM + W / 2) / W, v: (zM + L / 2) / L });
  const spots: WearSpot[] = [];
  for (const end of [-1, 1] as const) {
    const goalZ = end * halfL;
    const inward = -end;
    const gf = toUV(0, goalZ + inward * dims.gaDepthM * 0.8);
    spots.push({ u: gf.u, v: gf.v, ru: (dims.gaWidthM * 0.9) / W, rv: (dims.gaDepthM * 1.6) / L, strength: 0.09 });
    const pk = toUV(0, goalZ + inward * dims.pkSpotM);
    spots.push({ u: pk.u, v: pk.v, ru: (dims.pkSpotM * 0.22) / W, rv: (dims.pkSpotM * 0.22) / L, strength: 0.07 });
  }
  const c = toUV(0, 0);
  spots.push({
    u: c.u,
    v: c.v,
    ru: (dims.centerCircleRM * 1.1) / W,
    rv: (dims.centerCircleRM * 1.1) / L,
    strength: 0.06,
  });
  return spots;
}

/** UV点(u,v)における使用感の強さ(0..約0.14)。パッチが重なっても濃くなりすぎないよう上限を持つ */
function wearInfluence(u: number, v: number, spots: WearSpot[]): number {
  let s = 0;
  for (const sp of spots) {
    const du = (u - sp.u) / sp.ru;
    const dv = (v - sp.v) / sp.rv;
    const d2 = du * du + dv * dv;
    const falloff = Math.max(0, 1 - d2);
    s += falloff * falloff * sp.strength;
  }
  return Math.min(0.14, s);
}

function buildGrassBaseColorData(spots: WearSpot[], size: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    const stripeOn = Math.sin(v * GRASS_STRIPE_COUNT * Math.PI) >= 0;
    const base = stripeOn ? STRIPE_A : STRIPE_B;
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const h = grassHeightField(u, v);
      // 明度変調は控えめに（縞そのものの輝度差＋高さ場のごく弱い陰影づけ）
      const shade = 1 + h * 0.06;
      let r = base[0] * shade;
      let g = base[1] * shade;
      let b = base[2] * shade;
      const wear = wearInfluence(u, v, spots);
      if (wear > 0) {
        r += (WORN_COLOR[0] - r) * wear;
        g += (WORN_COLOR[1] - g) * wear;
        b += (WORN_COLOR[2] - b) * wear;
      }
      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return data;
}

function buildGrassNormalData(size: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const step = 1 / size;
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    const vLo = Math.max(0, v - step);
    const vHi = Math.min(1, v + step);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const uLo = Math.max(0, u - step);
      const uHi = Math.min(1, u + step);
      const hL = grassHeightField(uLo, v);
      const hR = grassHeightField(uHi, v);
      const hD = grassHeightField(u, vLo);
      const hU = grassHeightField(u, vHi);
      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;
      const len = Math.hypot(dx, dy, 1);
      const nx = dx / len;
      const ny = dy / len;
      const nz = 1 / len;
      const idx = (y * size + x) * 4;
      data[idx] = (nx * 0.5 + 0.5) * 255;
      data[idx + 1] = (ny * 0.5 + 0.5) * 255;
      data[idx + 2] = (nz * 0.5 + 0.5) * 255;
      data[idx + 3] = 255;
    }
  }
  return data;
}

/** roughnessMap: 基準0.85(仕様)。使用感パッチ部分だけラフに(最大roughness≈1.0)持ち上げる */
function buildGrassRoughnessData(spots: WearSpot[], size: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const base = 0.85;
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const wear = wearInfluence(u, v, spots);
      const rough = Math.min(1, base + wear * 0.9);
      const g = Math.round(rough * 255);
      const idx = (y * size + x) * 4;
      data[idx] = g;
      data[idx + 1] = g;
      data[idx + 2] = g;
      data[idx + 3] = 255;
    }
  }
  return data;
}

export interface GrassPBRTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const grassPBRCache = new Map<string, GrassPBRTextures>();

/** quality→baseColor解像度。normalMap/roughnessMapはその半分（品質3段化: 仕様
 * 「芝normal 1024(high)/512(medium)」に合わせる。mobileはこの関数自体を呼ばない）。 */
function grassPBRSizeForQuality(quality: Sp3dQuality): number {
  return quality === "high" ? 1024 : 512;
}

/** high/medium品質の芝PBRテクスチャ一式（format=8|11×quality(high|medium)ごとに1回だけ
 * 生成しキャッシュする）。生成は1画素ずつcanvas APIを呼ぶfillRectループではなく
 * ImageData(Uint8ClampedArray)へ直接書き込む方式にし、1024×1024でも実用的な速度
 * （一度きり・数十〜百数十ms程度）で終わらせる。 */
export function getGrassPBR(dims: PitchDims, quality: Sp3dQuality): GrassPBRTextures {
  const key = `${dims.pitchWidthM}x${dims.pitchLengthM}|${quality}`;
  const hit = grassPBRCache.get(key);
  if (hit) return hit;

  const spots = grassWearSpots(dims);
  const baseSize = grassPBRSizeForQuality(quality);
  const normalSize = baseSize / 2;
  const aniso = anisotropyForQuality(quality);

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = baseSize;
  baseCanvas.height = baseSize;
  const baseCtx = baseCanvas.getContext("2d");
  if (baseCtx) {
    const img = baseCtx.createImageData(baseSize, baseSize);
    img.data.set(buildGrassBaseColorData(spots, baseSize));
    baseCtx.putImageData(img, 0, 0);
  }
  const map = new THREE.CanvasTexture(baseCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso;

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = normalSize;
  normalCanvas.height = normalSize;
  const normalCtx = normalCanvas.getContext("2d");
  if (normalCtx) {
    const img = normalCtx.createImageData(normalSize, normalSize);
    img.data.set(buildGrassNormalData(normalSize));
    normalCtx.putImageData(img, 0, 0);
  }
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = aniso;

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = normalSize;
  roughCanvas.height = normalSize;
  const roughCtx = roughCanvas.getContext("2d");
  if (roughCtx) {
    const img = roughCtx.createImageData(normalSize, normalSize);
    img.data.set(buildGrassRoughnessData(spots, normalSize));
    roughCtx.putImageData(img, 0, 0);
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = aniso;

  const result: GrassPBRTextures = { map, normalMap, roughnessMap };
  grassPBRCache.set(key, result);
  return result;
}

/* ============================================================
   Phase3: スタジアム本体を「角丸長方形プランの連続ボウル」として構築する。
   旧実装（壁+斜面+屋根の4枚パーツ×4面+コーナー照明塔4本、components/SetPiece3D.tsx側）は廃止し、
   角丸長方形の周回パス（直線4辺+コーナー円弧、コーナーはcornerSegs分割）に沿って
   断面（前面壁→下層スタンド→コンコース帯→上層スタンド→背面壁→屋根）を掃引した
   「1層=1ジオメトリ・1draw call」のリングメッシュ群に置き換える。コーナーも同じパスの一部で
   途切れずに座席が続く（コーナー専用の特別処理は無い）。観客・投光器列はInstancedMesh。
   ============================================================ */

/* ---------- 角丸長方形リングパス ---------- */

interface RingPathPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
  /** パス始点からの累積弧長(m)。リング断面ジオメトリのU座標(周長方向のrepeat)に使う */
  s: number;
}

/** 角丸長方形の周回パス（センターライン）。直線4辺+コーナー円弧(cornerSegs分割)。
 * 各コーナーは「開始角度を含み終了角度を含まない」区間として作るため、4隅をそのまま連結
 * するだけで重複点なしの閉ループになる（隣接コーナーの終端=次コーナーの始端が一致する）。
 * 各点の外向き法線(nx,nz)は下のbuildRingWallGeometryが前提とする巻き順（プロファイルが
 * 「中心線に近く低い→外側で高い」の順のとき、掃引面はパスの外向き法線と逆＝ピッチ側を向く）
 * と対で設計している。 */
function buildRoundedRectRingPath(halfX: number, halfZ: number, cornerR: number, cornerSegs: number): RingPathPoint[] {
  const r = Math.max(0.05, Math.min(cornerR, halfX - 0.5, halfZ - 0.5));
  const corners: { cx: number; cz: number; a0: number }[] = [
    { cx: halfX - r, cz: halfZ - r, a0: 0 },
    { cx: -halfX + r, cz: halfZ - r, a0: Math.PI / 2 },
    { cx: -halfX + r, cz: -halfZ + r, a0: Math.PI },
    { cx: halfX - r, cz: -halfZ + r, a0: (Math.PI * 3) / 2 },
  ];
  const raw: { x: number; z: number; nx: number; nz: number }[] = [];
  for (const { cx, cz, a0 } of corners) {
    for (let i = 0; i < cornerSegs; i++) {
      const a = a0 + (Math.PI / 2) * (i / cornerSegs);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      raw.push({ x: cx + nx * r, z: cz + nz * r, nx, nz });
    }
  }
  let s = 0;
  const out: RingPathPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i > 0) {
      const prev = raw[i - 1];
      s += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    out.push({ ...p, s });
  }
  return out;
}

const ringPathCache = new Map<string, RingPathPoint[]>();
function getRingPath(halfX: number, halfZ: number, cornerR: number, cornerSegs: number): RingPathPoint[] {
  const key = `${halfX}|${halfZ}|${cornerR}|${cornerSegs}`;
  let p = ringPathCache.get(key);
  if (!p) {
    p = buildRoundedRectRingPath(halfX, halfZ, cornerR, cornerSegs);
    ringPathCache.set(key, p);
  }
  return p;
}

/** パス上を弧長ベースで等間隔サンプリングする（法線は隣接2点の線形補間→正規化の簡易近似。
 * コーナーはcornerSegs=8分割のため実用上十分滑らか）。閉ループとして最後尾→先頭も1区間扱う。
 * phaseMは開始オフセット（0だと必ずパス先頭に1点乗る＝並びが揃って見えるのを避けたい時に使う）。 */
interface SampledPoint {
  x: number;
  z: number;
  nx: number;
  nz: number;
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function sampleAlongPath(path: RingPathPoint[], spacingM: number, phaseM = 0): SampledPoint[] {
  const N = path.length;
  if (N < 2 || spacingM <= 0) return [];
  const first = path[0];
  const last = path[N - 1];
  const closingLen = Math.hypot(first.x - last.x, first.z - last.z);
  const total = last.s + closingLen;
  const ext = path.concat([{ ...first, s: total }]);
  const out: SampledPoint[] = [];
  let seg = 0;
  const start = ((phaseM % spacingM) + spacingM) % spacingM;
  for (let s = start; s < total; s += spacingM) {
    while (seg < ext.length - 2 && ext[seg + 1].s <= s) seg++;
    const a = ext[seg];
    const b = ext[seg + 1];
    const span = Math.max(1e-6, b.s - a.s);
    const t = clamp01((s - a.s) / span);
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    let nx = a.nx + (b.nx - a.nx) * t;
    let nz = a.nz + (b.nz - a.nz) * t;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    out.push({ x, z, nx, nz });
  }
  return out;
}

/* ---------- リング断面（プロファイル）を掃引したBufferGeometry ---------- */

interface ProfilePoint {
  /** パス中心線からの外向きオフセット(m) */
  r: number;
  /** 高さ(m) */
  h: number;
  /** テクスチャV座標(0..1) */
  v: number;
}

/** プロファイル(2点以上、「パス中心線に近く低い→外側で高い」の順)をパスに沿って掃引し、
 * indexedなBufferGeometryを1枚だけ作る（1層=1ジオメトリ・1draw call、法線はcomputeVertexNormals
 * まかせ＝コーナーの継ぎ目も含めて滑らかにつながる）。U座標はパスの累積弧長をuTileMで割った値
 * （マテリアル側でRepeatWrappingにすればリング周長に沿ってrepeatする）。
 * 三角形の巻き順は「プロファイルが内側/低い→外側/高いの順のとき、掃引面の法線がパスの外向き
 * 法線と逆＝ピッチ中心側(カメラが常に居る側)を向く」ことを前提に固定してある。屋根のように
 * 「先端(ピッチ寄り・低い)→取付側(外側・高い)」の順で使う場合もこの前提を満たす並びにする
 * （StadiumBowl内の呼び出し側を参照）。
 *
 * 閉ループの継ぎ目: pathは「最後尾→先頭」を結ぶ閉じ区間の弧長を持たない（path[N-1].sが
 * パス全周の終端ではない）。単純に%Nで先頭へ巻き戻すと、最後の1クアッドだけu(=s/uTileM)が
 * 大きい値→0へ逆走し、その区間だけテクスチャが鏡像+極端に圧縮されて見える不具合があった。
 * 対策として、先頭点を「s=total(最終点のs＋閉じ区間の弧長)」として複製し末尾に足した
 * 拡張パス(N+1点)から頂点を生成し、インデックスは%Nを使わずi→i+1でN区間を単純に張る
 * （頂点は接合部で1組重複するが、そのぶんuが最後まで単調増加のまま閉じられる）。
 * さらにuTileMを「周長total ÷ round(total/uTileM)」に丸め、継ぎ目でタイル境界が
 * 半端な位置に来て柄が割れるのも防ぐ（丸め後もリング1周ぶんのタイル数は整数のまま）。
 *
 * 行(プロファイル点)別U座標（E項）: 上記の「total/uTile」はパス中心線(半径0)の弧長を
 * 使っており、これをそのまま全ての行(プロファイルのr、パス中心線からの外向きオフセット)へ
 * 使い回すと、コーナー円弧では外側ほど・内側ほど実際の弧長が中心線と異なる（外側オフセットの
 * 大きい層ほど実弧長が中心線弧長より長い）ため、その層の柄だけコーナーで伸び縮みして見える
 * 不具合があった（実測: 上層スタンドで中心線比136%、外壁で236%）。対策として、行ごとに
 * 実頂点位置（中心線+法線×r）から改めて累積距離を取り、その行専用のtotal/uTileでUを
 * 求める（行間でuの絶対値はズレるが、座席・LED等の柄は縦方向には伸びても横方向の縦継ぎ目は
 * 各層内で閉じるため気にならない。中心線に近い層(LED帯など)は従来とほぼ同じ値になる）。 */
function buildRingWallGeometry(path: RingPathPoint[], profile: ProfilePoint[], uTileM: number): THREE.BufferGeometry {
  const N = path.length;
  const M = profile.length;
  const first = path[0];
  const extPath: RingPathPoint[] = path.concat([first]);
  const R = extPath.length; // N+1（末尾に先頭の複製点を追加）
  const positions = new Float32Array(R * M * 3);
  const uvs = new Float32Array(R * M * 2);
  for (let j = 0; j < M; j++) {
    const pr = profile[j];
    // この行(プロファイル点)の実座標列を先に作り、そこから行専用の累積弧長を取る
    const rowX = new Float32Array(R);
    const rowZ = new Float32Array(R);
    for (let i = 0; i < R; i++) {
      const p = extPath[i];
      rowX[i] = p.x + p.nx * pr.r;
      rowZ[i] = p.z + p.nz * pr.r;
    }
    const rowS = new Float32Array(R);
    for (let i = 1; i < R; i++) {
      rowS[i] = rowS[i - 1] + Math.hypot(rowX[i] - rowX[i - 1], rowZ[i] - rowZ[i - 1]);
    }
    const rowTotal = rowS[R - 1];
    const tileCount = Math.max(1, Math.round(rowTotal / uTileM));
    const rowUTile = rowTotal > 0 ? rowTotal / tileCount : uTileM;
    for (let i = 0; i < R; i++) {
      const idx = i * M + j;
      positions[idx * 3 + 0] = rowX[i];
      positions[idx * 3 + 1] = pr.h;
      positions[idx * 3 + 2] = rowZ[i];
      uvs[idx * 2 + 0] = rowS[i] / rowUTile;
      uvs[idx * 2 + 1] = pr.v;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < N; i++) {
    const iN = i + 1; // 拡張パスのため%N不要（i=N-1のときiN=Nは複製した先頭点）
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j;
      const b = iN * M + j;
      const c = iN * M + j + 1;
      const d = i * M + j + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

const stadiumGeomCache = new Map<string, THREE.BufferGeometry>();
function getStadiumRingGeom(
  key: string,
  path: RingPathPoint[],
  profile: ProfilePoint[],
  uTileM: number
): THREE.BufferGeometry {
  let g = stadiumGeomCache.get(key);
  if (!g) {
    g = buildRingWallGeometry(path, profile, uTileM);
    stadiumGeomCache.set(key, g);
  }
  return g;
}

/* ---------- ボウルの積み上げ段数（r=パス中心線からの外向きオフセット、h=高さ。共に相対値） ---------- */

interface BowlStage {
  r: number;
  h: number;
}
interface BowlStack {
  frontWallTop: BowlStage;
  lowerTop: BowlStage;
  concourseTop: BowlStage;
  upperTop: BowlStage;
  backWallTop: BowlStage;
  roofAttach: BowlStage;
  roofTip: BowlStage;
}

/** ボウルの積み段は「full(コンコース帯・上層スタンドあり＝high/medium共通)」と
 * 「mobile(下層スタンドの上に簡易背面壁を直接立てる＝層数は減るが「下層+屋根」の高さ感は保つ)」
 * の2形状しかない（high/mediumはNear観客の有無だけが違い、積み段の寸法自体は同一）。
 * ジオメトリキャッシュのキーにもこの2値(stackKindForQuality)を使い、high/mediumで同じ
 * ジオメトリを共有する（quality文字列そのものをキーにすると同一形状を2重生成してしまう）。 */
function stackKindForQuality(quality: Sp3dQuality): "full" | "mobile" {
  return quality === "mobile" ? "mobile" : "full";
}

function computeBowlStack(quality: Sp3dQuality): BowlStack {
  const S = STADIUM_M;
  const frontWallTop: BowlStage = { r: 0, h: S.frontWallM };
  const lowerTop: BowlStage = {
    r: S.lowerDepthM * Math.cos(S.lowerRakeRad),
    h: frontWallTop.h + S.lowerDepthM * Math.sin(S.lowerRakeRad),
  };
  if (quality === "mobile") {
    const backWallTop: BowlStage = { r: lowerTop.r, h: lowerTop.h + S.lightBackWallM };
    return {
      frontWallTop,
      lowerTop,
      concourseTop: lowerTop,
      upperTop: lowerTop,
      backWallTop,
      roofAttach: backWallTop,
      roofTip: { r: backWallTop.r - S.roofSpanM, h: backWallTop.h - S.roofDropM },
    };
  }
  const concourseTop: BowlStage = { r: lowerTop.r, h: lowerTop.h + S.concourseHeightM };
  const upperTop: BowlStage = {
    r: concourseTop.r + S.upperDepthM * Math.cos(S.upperRakeRad),
    h: concourseTop.h + S.upperDepthM * Math.sin(S.upperRakeRad),
  };
  const backWallTop: BowlStage = { r: upperTop.r, h: upperTop.h + S.backWallM };
  return {
    frontWallTop,
    lowerTop,
    concourseTop,
    upperTop,
    backWallTop,
    roofAttach: backWallTop,
    roofTip: { r: backWallTop.r - S.roofSpanM, h: backWallTop.h - S.roofDropM },
  };
}

/* ---------- 単位ジオメトリ・シンプルな単色マテリアルのキャッシュ ---------- */

/** SetPiece3D.tsxのUNIT_BOX/getCachedMaterialとは別枠（本ファイルはSetPiece3D.tsxを
 * importできない＝循環import回避のため、必要な最小限をこちらにも持つ）。 */
const UNIT_BOX_LOCAL = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

const solidMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getSolidMaterial(
  hex: string,
  opts?: { side?: THREE.Side; roughness?: number; metalness?: number }
): THREE.MeshStandardMaterial {
  const side = opts?.side ?? THREE.FrontSide;
  const roughness = opts?.roughness ?? 0.75;
  const metalness = opts?.metalness ?? 0.05;
  const key = `${hex}|${side}|${roughness}|${metalness}`;
  let m = solidMaterialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, side, roughness, metalness });
    solidMaterialCache.set(key, m);
  }
  return m;
}

/* ---------- 座席+観客テクスチャ（下層/上層スタンド共有） ---------- */

/** canvas 512×256。V(高さ256px)方向=座席列(前→後)、U(周長方向512px)方向は12m(=vomPitchMと同じ
 * 周期)を1タイルとしてRepeatWrapping＝12mごとに縦通路が現れる。座席は紺2トーンの横帯、
 * 8行ごとに段差影、観客は頭(肌トーン)+肩(服色)の2段ドット（服色分布=紺60/濃紺20/白8/その他12%）。 */
/** 描画内容自体はqualityに依存しないため、canvas(pixel)生成は1回だけ行いキャッシュする。
 * anisotropyだけqualityごとに変えたいため、そこから先のTHREE.CanvasTextureインスタンスは
 * getSeatCrowdTexture側でquality別にMapキャッシュしてGPUへの実アップロード解像度・
 * フィルタ強度を分ける（同じcanvasソースを複数Textureで共有＝再描画コストは払わない）。 */
let seatCrowdCanvasCache: HTMLCanvasElement | null = null;
function getSeatCrowdCanvas(): HTMLCanvasElement {
  if (seatCrowdCanvasCache) return seatCrowdCanvasCache;
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const [tone1, tone2] = STADIUM_SEAT_TONES;
    const rowPx = 10;
    const rows = Math.ceil(h / rowPx);
    for (let ry = 0; ry < rows; ry++) {
      ctx.fillStyle = ry % 2 === 0 ? tone1 : tone2;
      ctx.fillRect(0, ry * rowPx, w, rowPx);
    }
    // 8行(=8*rowPx px)ごとの段差影
    ctx.fillStyle = "rgba(8,12,20,0.42)";
    for (let ry = 0; ry < rows; ry += 8) ctx.fillRect(0, ry * rowPx, w, 2);
    // 縦通路（タイル左端。RepeatWrappingで12mごとに現れる）
    ctx.fillStyle = "rgba(199,204,214,0.5)";
    ctx.fillRect(0, 0, 16, h);
    const rand = (x: number, y: number) => {
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const pickCrowdColor = (rv: number): string => {
      for (const c of STADIUM_CROWD_COLORS) if (rv <= c.upTo) return c.color;
      return STADIUM_CROWD_COLORS[STADIUM_CROWD_COLORS.length - 1].color;
    };
    const stepX = 7;
    const stepY = 9;
    for (let gy = 1; gy * stepY < h; gy++) {
      for (let gx = 1; gx * stepX < w; gx++) {
        const x = gx * stepX + (rand(gx, gy) - 0.5) * 3;
        const y = gy * stepY + (rand(gx + 50, gy + 50) - 0.5) * 3;
        if (x < 18) continue; // 通路帯は空ける
        const skinR = rand(gx * 5.7, gy * 5.7);
        const skin = skinR > 0.66 ? "#8a5a3c" : skinR > 0.33 ? "#c98f65" : "#e0b189";
        ctx.fillStyle = skin;
        ctx.fillRect(x, y, 2, 2);
        ctx.fillStyle = pickCrowdColor(rand(gx * 3.1, gy * 3.1));
        ctx.fillRect(x - 1, y + 2, 4, 2);
      }
    }
  }
  seatCrowdCanvasCache = canvas;
  return canvas;
}
const seatCrowdTextureCache = new Map<Sp3dQuality, THREE.CanvasTexture>();
function getSeatCrowdTexture(quality: Sp3dQuality): THREE.CanvasTexture {
  const hit = seatCrowdTextureCache.get(quality);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(getSeatCrowdCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropyForQuality(quality);
  seatCrowdTextureCache.set(quality, tex);
  return tex;
}
const seatCrowdMaterialCache = new Map<Sp3dQuality, THREE.MeshStandardMaterial>();
function getSeatCrowdMaterial(quality: Sp3dQuality): THREE.MeshStandardMaterial {
  let m = seatCrowdMaterialCache.get(quality);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: getSeatCrowdTexture(quality), roughness: 0.92 });
    seatCrowdMaterialCache.set(quality, m);
  }
  return m;
}

/* ---------- LED看板テクスチャ（自ブランドの架空文言。静止・emissive） ---------- */

const LED_TILE_M = 18;
let ledTextureCache: THREE.CanvasTexture | null = null;
function getLedTexture(): THREE.CanvasTexture {
  if (ledTextureCache) return ledTextureCache;
  const w = 2048;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = LED_BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = LED_TEXT_COLOR;
    ctx.font = "700 40px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const unit = Math.max(40, ctx.measureText(LED_TEXT).width);
    for (let x = 0; x < w + unit; x += unit) ctx.fillText(LED_TEXT, x, h / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  ledTextureCache = tex;
  return tex;
}
let ledMaterialCache: THREE.MeshStandardMaterial | null = null;
function getLedMaterial(): THREE.MeshStandardMaterial {
  if (!ledMaterialCache) {
    const tex = getLedTexture();
    ledMaterialCache = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 1.4,
      roughness: 0.5,
    });
  }
  return ledMaterialCache;
}

/* ---------- vomitoryグロー・投光器列・観客ビルボード用の単色emissiveマテリアル ---------- */

let vomGlowMaterialCache: THREE.MeshStandardMaterial | null = null;
function getVomGlowMaterial(): THREE.MeshStandardMaterial {
  if (!vomGlowMaterialCache) {
    vomGlowMaterialCache = new THREE.MeshStandardMaterial({
      color: "#241d14",
      emissive: new THREE.Color(STADIUM_VOMITORY_GLOW_COLOR),
      emissiveIntensity: 1.1,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }
  return vomGlowMaterialCache;
}
let floodPlateMaterialCache: THREE.MeshStandardMaterial | null = null;
function getFloodPlateMaterial(): THREE.MeshStandardMaterial {
  if (!floodPlateMaterialCache) {
    floodPlateMaterialCache = new THREE.MeshStandardMaterial({
      color: "#1a2230",
      emissive: new THREE.Color(STADIUM_FLOODLIGHT_COLOR),
      emissiveIntensity: 1.6,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
  }
  return floodPlateMaterialCache;
}

/* ---------- 観客ビルボード（頭肩シルエット）テクスチャ ---------- */

let crowdBillTextureCache: THREE.CanvasTexture | null = null;
function getCrowdBillTexture(): THREE.CanvasTexture {
  if (crowdBillTextureCache) return crowdBillTextureCache;
  const w = 32;
  const h = 48;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // 肩(下側、白=instanceColorで着色される部分)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(4, h);
    ctx.quadraticCurveTo(w / 2, h * 0.42, w - 4, h);
    ctx.closePath();
    ctx.fill();
    // 頭(肌トーン固定。instanceColorが乗算されるためやや暗め寄りに振れるが、点景としては許容範囲)
    ctx.fillStyle = "#caa07a";
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.32, w * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  crowdBillTextureCache = tex;
  return tex;
}
let crowdBillMaterialCache: THREE.MeshStandardMaterial | null = null;
function getCrowdBillMaterial(): THREE.MeshStandardMaterial {
  if (!crowdBillMaterialCache) {
    crowdBillMaterialCache = new THREE.MeshStandardMaterial({
      map: getCrowdBillTexture(),
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.85,
    });
  }
  return crowdBillMaterialCache;
}

/* ---------- スコアボードテクスチャ ---------- */

let scoreboardTextureCache: THREE.CanvasTexture | null = null;
function getScoreboardTexture(): THREE.CanvasTexture {
  if (scoreboardTextureCache) return scoreboardTextureCache;
  const w = 256;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = SCOREBOARD_HOME_COLOR;
    ctx.fillRect(6, 10, 34, h - 20);
    ctx.fillStyle = SCOREBOARD_AWAY_COLOR;
    ctx.fillRect(w - 40, 10, 34, h - 20);
    ctx.fillStyle = "#f4f7fb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText("0 - 0", w / 2, h / 2 - 12);
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillStyle = "#9fb0c9";
    ctx.fillText("00:00", w / 2, h / 2 + 22);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  scoreboardTextureCache = tex;
  return tex;
}
let scoreboardMaterialCache: THREE.MeshStandardMaterial | null = null;
function getScoreboardMaterial(): THREE.MeshStandardMaterial {
  if (!scoreboardMaterialCache) {
    const tex = getScoreboardTexture();
    scoreboardMaterialCache = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0.9,
      roughness: 0.6,
    });
  }
  return scoreboardMaterialCache;
}

/* ---------- InstancedMesh群（vomitoryグロー・投光器列・Near観客）。いずれも静止データのため
   useEffectで一度だけmatrix/colorを書き込む（frameloop="demand"の毎フレームコストは無い）。
   raycastは無効化し（ref経由でno-op化）、1200体規模のNear観客がpointermoveのたびに
   ヒットテスト対象へ入って性能予算を圧迫しないようにする。 ---------- */

function VomitoryGlowInstances({ path, stack }: { path: RingPathPoint[]; stack: BowlStack }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const S = STADIUM_M;
  const samples = useMemo(() => sampleAlongPath(path, S.vomPitchM, S.vomPitchM / 2), [path]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.raycast = () => undefined;
    const dummy = new THREE.Object3D();
    const r = stack.lowerTop.r - 0.04;
    const h = stack.lowerTop.h + S.concourseHeightM / 2;
    samples.forEach((p, i) => {
      dummy.position.set(p.x + p.nx * r, h, p.z + p.nz * r);
      dummy.rotation.set(0, Math.atan2(-p.nx, -p.nz), 0);
      dummy.scale.set(S.vomWidthM, S.vomHeightM, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [samples, stack, S.concourseHeightM, S.vomHeightM, S.vomPitchM, S.vomWidthM]);
  return <instancedMesh ref={ref} args={[UNIT_PLANE, getVomGlowMaterial(), Math.max(1, samples.length)]} />;
}

function FloodlightRowInstances({ path, stack }: { path: RingPathPoint[]; stack: BowlStack }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const S = STADIUM_M;
  const samples = useMemo(() => sampleAlongPath(path, S.floodPitchM, S.floodPitchM / 2), [path]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.raycast = () => undefined;
    const dummy = new THREE.Object3D();
    const r = stack.roofTip.r + 0.05;
    const h = stack.roofTip.h - S.roofThickM - 0.04;
    samples.forEach((p, i) => {
      dummy.position.set(p.x + p.nx * r, h, p.z + p.nz * r);
      // 板を水平にして下向き(-Y法線)にする＝屋根内縁からピッチを照らす投光器の簡易表現
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(S.floodPlateWM, S.floodPlateHM, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [samples, stack, S.roofThickM, S.floodPlateWM, S.floodPlateHM]);
  return <instancedMesh ref={ref} args={[UNIT_PLANE, getFloodPlateMaterial(), Math.max(1, samples.length)]} />;
}

/** Near観客インスタンス(high品質限定・~1200体)は、カメラがピッチ中心(ワールド原点)から
 * crowdNearHideDistM(60m)より離れたら自動非表示にする（LOD。頭肩ビルボードは遠景では
 * 判別できず描画コストだけがかかるため）。crowdNearShowDistM(52m)を下回るまでは非表示の
 * ままにするヒステリシスを持たせ、しきい値付近でのカメラ操作によるON/OFF点滅を防ぐ。
 * frameloop="demand"下でもuseFrameはOrbitControls操作・カメラ遷移でinvalidate()された
 * フレームでのみ走るため、静止時に余計な描画コストは発生しない（判定自体もvisible切替のみで
 * 軽い）。 */
function NearCrowdInstances({ path, stack }: { path: RingPathPoint[]; stack: BowlStack }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hiddenRef = useRef(false);
  const S = STADIUM_M;
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const d = camera.position.length(); // ワールド原点(ピッチ中心)からの距離
    if (!hiddenRef.current && d > S.crowdNearHideDistM) {
      hiddenRef.current = true;
      mesh.visible = false;
    } else if (hiddenRef.current && d < S.crowdNearShowDistM) {
      hiddenRef.current = false;
      mesh.visible = true;
    }
  });
  const rakeSin = Math.sin(S.lowerRakeRad);
  const rakeCos = Math.cos(S.lowerRakeRad);
  // 下層スタンドのピッチ側2列ぶん（前列1.0m・2列目2.3m、スロープ沿いの奥行）
  const rowDepths = useMemo(() => [1.0, 2.3], []);
  const perRow = Math.max(1, Math.floor(S.crowdNearCount / rowDepths.length));
  const totalLen = useMemo(() => {
    const N = path.length;
    if (N < 2) return 0;
    const first = path[0];
    const last = path[N - 1];
    return last.s + Math.hypot(first.x - last.x, first.z - last.z);
  }, [path]);
  const spacing = totalLen > 0 ? totalLen / perRow : 1;
  const samplesByRow = useMemo(
    () => rowDepths.map((_, ri) => sampleAlongPath(path, spacing, (spacing / rowDepths.length) * ri)),
    [rowDepths, path, spacing]
  );
  const total = useMemo(() => samplesByRow.reduce((acc, arr) => acc + arr.length, 0), [samplesByRow]);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.raycast = () => undefined;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let idx = 0;
    rowDepths.forEach((depth, ri) => {
      const r = depth * rakeCos;
      const h = stack.frontWallTop.h + depth * rakeSin + S.crowdBillH / 2;
      for (const p of samplesByRow[ri]) {
        dummy.position.set(p.x + p.nx * r, h, p.z + p.nz * r);
        dummy.rotation.set(0, Math.atan2(-p.nx, -p.nz), 0);
        dummy.scale.set(S.crowdBillW, S.crowdBillH, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        const rv = Math.sin((idx + 1) * 12.9898) * 43758.5453;
        const rnd = rv - Math.floor(rv);
        let picked = STADIUM_CROWD_COLORS[STADIUM_CROWD_COLORS.length - 1].color;
        for (const c of STADIUM_CROWD_COLORS) {
          if (rnd <= c.upTo) {
            picked = c.color;
            break;
          }
        }
        col.set(picked);
        mesh.setColorAt(idx, col);
        idx++;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [samplesByRow, stack, rowDepths, rakeCos, rakeSin, S.crowdBillH, S.crowdBillW]);
  return <instancedMesh ref={ref} args={[UNIT_PLANE, getCrowdBillMaterial(), Math.max(1, total)]} />;
}

/* ---------- スコアボード（両ゴール裏、屋根下に1枚ずつ） ---------- */

function Scoreboards({ dims, stack }: { dims: PitchDims; stack: BowlStack }) {
  const S = STADIUM_M;
  const halfZ = dims.pitchLengthM / 2 + GRASS_MARGIN_M + S.ledMarginM + S.ledThicknessM + S.standMarginM;
  const r = Math.max(0, stack.concourseTop.r - 1.2);
  const h = stack.roofAttach.h - 2.6;
  const mat = getScoreboardMaterial();
  const w = 3.2;
  const hgt = 1.2;
  const th = 0.2;
  return (
    <group>
      <mesh geometry={UNIT_BOX_LOCAL} material={mat} position={[0, h, -(halfZ + r)]} scale={[w, hgt, th]} />
      <mesh
        geometry={UNIT_BOX_LOCAL}
        material={mat}
        position={[0, h, halfZ + r]}
        rotation-y={Math.PI}
        scale={[w, hgt, th]}
      />
    </group>
  );
}

/* ---------- 外壁シェル（角丸リング外周の垂直フィン+コンコース階の温白ガラス帯）。
   high/medium品質のみ。俯瞰・全景で「建築物」に見える最低限を、背面壁のさらに外側に立てる
   薄い外殻2枚(フィン1枚+ガラス帯1枚=+2 draw call)で表現する。 ---------- */

/** 垂直フィン柄のcanvasテクスチャ（明暗2トーンの縦帯を繰り返すだけの簡易表現。
 * RepeatWrappingでSTADIUM_M.exteriorFinTileMごとに1周期）。静止・全品質共通の1枚だけ生成する
 * （anisotropyはhigh/medium間で大差が出るほど斜めから見ない部位のため固定値でよい）。 */
let exteriorFinTextureCache: THREE.CanvasTexture | null = null;
function getExteriorFinTexture(): THREE.CanvasTexture {
  if (exteriorFinTextureCache) return exteriorFinTextureCache;
  const w = 64;
  const h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = STADIUM_EXTERIOR_FIN_DARK;
    ctx.fillRect(0, 0, w, h);
    const finW = w / 4;
    for (let i = 0; i < 4; i++) {
      const x = i * finW;
      const g = ctx.createLinearGradient(x, 0, x + finW, 0);
      g.addColorStop(0, STADIUM_EXTERIOR_FIN_LIGHT);
      g.addColorStop(0.55, STADIUM_EXTERIOR_FIN_LIGHT);
      g.addColorStop(1, STADIUM_EXTERIOR_FIN_DARK);
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, finW * 0.82, h);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  exteriorFinTextureCache = tex;
  return tex;
}
let exteriorFinMaterialCache: THREE.MeshStandardMaterial | null = null;
function getExteriorFinMaterial(): THREE.MeshStandardMaterial {
  if (!exteriorFinMaterialCache) {
    exteriorFinMaterialCache = new THREE.MeshStandardMaterial({
      map: getExteriorFinTexture(),
      roughness: 0.75,
      metalness: 0.1,
    });
  }
  return exteriorFinMaterialCache;
}
let exteriorGlassMaterialCache: THREE.MeshStandardMaterial | null = null;
function getExteriorGlassMaterial(): THREE.MeshStandardMaterial {
  if (!exteriorGlassMaterialCache) {
    exteriorGlassMaterialCache = new THREE.MeshStandardMaterial({
      color: "#3a3226",
      emissive: new THREE.Color(STADIUM_EXTERIOR_GLASS_COLOR),
      emissiveIntensity: 0.85,
      roughness: 0.4,
      metalness: 0.1,
    });
  }
  return exteriorGlassMaterialCache;
}

/** 外壁シェル本体。stack.backWallTop(=full stackの背面壁上端)のさらに外側
 * (S.exteriorShellOffsetM)にフィンの垂直壁(高さ0〜backWallTop.h)を1枚、同じ半径・
 * コンコース帯と同じ高さ区間にガラス帯emissiveを1枚重ねる（+2 draw call、mobileでは
 * 呼ばない＝StadiumBowl側でquality分岐）。
 *
 * 巻き順の注意: buildRingWallGeometryは「プロファイルが内側/低い→外側/高いの順のとき、
 * 掃引面の法線がパスの外向き法線と逆＝ピッチ中心側を向く」規約（前面壁・下層スタンド等、
 * カメラが常にボウル内側に居る他レイヤー向け）。フィン・ガラス帯は半径が一定(shellR固定)の
 * 純垂直面のため、他レイヤーと同じ並び([低いh,高いh]の順)で作ると同じ規約に従って
 * ピッチ側(内向き)を向いてしまう＝外壁シェルの本来の用途（俯瞰・広角など外側から見える
 * 建物のシルエット）では裏面カリングで消え、内側から見ても背面壁に遮蔽されて2 draw call
 * 払って何も描画されない。プロファイルの並びを[高いh,低いh]と反転させ、法線を外向き
 * （ピッチと反対側＝建物の外側を向いた観測者から見える向き）にする。フィン柄テクスチャは
 * 縦(V)方向に一様な横縞のみのためV反転による見た目の変化は無く、ガラス帯はmapを持たない
 * 単色emissiveのためV反転自体が無関係（両方とも安全に反転できる）。
 *
 * 屋根との継ぎ目: フィン上端の高さはstack.backWallTop.hをそのまま使っており、これは
 * roofAttach.h（roofTopGeom/roofUnderGeomが屋根を接続する高さ）と同一のBowlStage
 * オブジェクト（computeBowlStack内でroofAttach: backWallTopと定義）を指すため、
 * 常に厳密に一致する＝俯瞰でズームアウトしても屋根縁とフィン上端の間に高さ方向の
 * 隙間は生じない（半径方向はexteriorShellOffsetM分だけ屋根の取付位置より外に出るが、
 * これは意図した「背面壁よりさらに外側の外殻」という設計どおりの差）。 */
function ExteriorShell({
  path,
  fmtKey,
  stack,
}: {
  path: RingPathPoint[];
  fmtKey: string;
  stack: BowlStack;
}) {
  const S = STADIUM_M;
  const shellR = stack.backWallTop.r + S.exteriorShellOffsetM;
  const finGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `exteriorFin|${fmtKey}`,
        path,
        [
          { r: shellR, h: stack.backWallTop.h, v: 0 },
          { r: shellR, h: 0, v: 1 },
        ],
        S.exteriorFinTileM
      ),
    [path, fmtKey, shellR, stack.backWallTop.h, S.exteriorFinTileM]
  );
  const glassGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `exteriorGlass|${fmtKey}`,
        path,
        [
          { r: shellR, h: stack.concourseTop.h, v: 0 },
          { r: shellR, h: stack.lowerTop.h, v: 1 },
        ],
        S.vomPitchM
      ),
    [path, fmtKey, shellR, stack.lowerTop.h, stack.concourseTop.h, S.vomPitchM]
  );
  return (
    <group>
      <mesh geometry={finGeom} material={getExteriorFinMaterial()} />
      <mesh geometry={glassGeom} material={getExteriorGlassMaterial()} />
    </group>
  );
}

/* ---------- StadiumBowl本体 ---------- */

/** スタジアム全体（LED看板+角丸長方形ボウルのスタンド一式+外壁シェル）。
 * components/SetPiece3D.tsx からはこのコンポーネント1つを呼ぶだけでよい。8人制/11人制の
 * プラン差(ボウル内周サイズ)はdims経由で自動的に反映される（相対寸法はSTADIUM_M側で共通）。
 * 品質3段の構成物ON/OFFは以下のとおり（詳細はcomputeBowlStack/stackKindForQualityを参照）:
 *   high  : 全部(LED・前面壁・下層スタンド・屋根・コンコース帯・上層スタンド・背面壁・
 *           手すり・vomitoryグロー・投光器列・Near観客・スコアボード・外壁シェル)
 *   medium: high から Near観客インスタンスのみ除いた構成（芝PBR解像度・dprは呼び出し側で分岐）
 *   mobile: LED・前面壁・下層スタンド・屋根のみ（コンコース帯・上層スタンド・背面壁・手すり・
 *           vomitoryグロー・投光器列・Near観客・スコアボード・外壁シェルなし） */
export function StadiumBowl({ dims, quality }: { dims: PitchDims; quality: Sp3dQuality }) {
  const S = STADIUM_M;
  const fmtKey = `${dims.pitchWidthM}x${dims.pitchLengthM}`;
  const stackKind = stackKindForQuality(quality);

  const bowlHalfX = dims.pitchWidthM / 2 + GRASS_MARGIN_M + S.ledMarginM + S.ledThicknessM + S.standMarginM;
  const bowlHalfZ = dims.pitchLengthM / 2 + GRASS_MARGIN_M + S.ledMarginM + S.ledThicknessM + S.standMarginM;
  const ledHalfX = dims.pitchWidthM / 2 + GRASS_MARGIN_M + S.ledMarginM;
  const ledHalfZ = dims.pitchLengthM / 2 + GRASS_MARGIN_M + S.ledMarginM;

  const bowlPath = useMemo(
    () => getRingPath(bowlHalfX, bowlHalfZ, S.cornerRadiusM, S.cornerSegs),
    [bowlHalfX, bowlHalfZ, S.cornerRadiusM, S.cornerSegs]
  );
  const ledPath = useMemo(
    () => getRingPath(ledHalfX, ledHalfZ, S.ledCornerRadiusM, S.cornerSegs),
    [ledHalfX, ledHalfZ, S.ledCornerRadiusM, S.cornerSegs]
  );
  const stack = useMemo(() => computeBowlStack(quality), [quality]);
  const uTile = S.vomPitchM;

  const frontWallGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `frontWall|${fmtKey}`,
        bowlPath,
        [
          { r: 0, h: 0, v: 0 },
          { r: 0, h: stack.frontWallTop.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stack, uTile]
  );
  const lowerTierGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `lowerTier|${fmtKey}`,
        bowlPath,
        [
          { r: stack.frontWallTop.r, h: stack.frontWallTop.h, v: 0 },
          { r: stack.lowerTop.r, h: stack.lowerTop.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stack, uTile]
  );
  const concourseGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `concourse|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.lowerTop.r, h: stack.lowerTop.h, v: 0 },
          { r: stack.concourseTop.r, h: stack.concourseTop.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile]
  );
  const upperTierGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `upperTier|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.concourseTop.r, h: stack.concourseTop.h, v: 0 },
          { r: stack.upperTop.r, h: stack.upperTop.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile]
  );
  const backWallGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `backWall|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.upperTop.r, h: stack.upperTop.h, v: 0 },
          { r: stack.backWallTop.r, h: stack.backWallTop.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile]
  );
  const roofTopGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `roofTop|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.roofTip.r, h: stack.roofTip.h, v: 0 },
          { r: stack.roofAttach.r, h: stack.roofAttach.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile]
  );
  const roofUnderGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `roofUnder|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.roofTip.r, h: stack.roofTip.h - S.roofThickM, v: 0 },
          { r: stack.roofAttach.r, h: stack.roofAttach.h - S.roofThickM, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile, S.roofThickM]
  );
  const roofEdgeGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `roofEdge|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.roofTip.r, h: stack.roofTip.h - S.roofThickM, v: 0 },
          { r: stack.roofTip.r, h: stack.roofTip.h, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile, S.roofThickM]
  );
  const lowerRailGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `lowerRail|${fmtKey}`,
        bowlPath,
        [
          { r: stack.frontWallTop.r, h: stack.frontWallTop.h + S.railHeightM, v: 0 },
          { r: stack.frontWallTop.r, h: stack.frontWallTop.h + S.railHeightM + S.railThickM, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stack, uTile, S.railHeightM, S.railThickM]
  );
  const upperRailGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `upperRail|${fmtKey}|${stackKind}`,
        bowlPath,
        [
          { r: stack.concourseTop.r, h: stack.concourseTop.h + S.railHeightM, v: 0 },
          { r: stack.concourseTop.r, h: stack.concourseTop.h + S.railHeightM + S.railThickM, v: 1 },
        ],
        uTile
      ),
    [bowlPath, fmtKey, stackKind, stack, uTile, S.railHeightM, S.railThickM]
  );
  const ledGeom = useMemo(
    () =>
      getStadiumRingGeom(
        `led|${fmtKey}`,
        ledPath,
        [
          { r: 0, h: 0, v: 0 },
          { r: 0, h: S.ledHeightM, v: 1 },
        ],
        LED_TILE_M
      ),
    [ledPath, fmtKey, S.ledHeightM]
  );

  const concreteMat = getSolidMaterial(STADIUM_CONCRETE_COLOR);
  const concourseMat = getSolidMaterial(STADIUM_CONCOURSE_COLOR, { roughness: 0.85 });
  const seatMat = getSeatCrowdMaterial(quality);
  const roofTopMat = getSolidMaterial(STADIUM_ROOF_TOP_COLOR, { side: THREE.DoubleSide, roughness: 0.6 });
  const roofUnderMat = getSolidMaterial(STADIUM_ROOF_UNDER_COLOR, { roughness: 0.7 });
  const roofEdgeMat = getSolidMaterial("#f4f6f9", { side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1 });
  const railMat = getSolidMaterial("#eef1f4", { side: THREE.DoubleSide, roughness: 0.3, metalness: 0.35 });
  const ledMat = getLedMaterial();
  const full = quality !== "mobile";

  return (
    <group>
      {/* draw call概算（インスタンス除く。以後の変更で再計測はしていない目安値）:
          mobile: LED1 + 前面壁1 + 下層スタンド1 + 屋根(top/under/edge)3 = 6
          medium: 上記6 + コンコース帯1 + 上層スタンド1 + 背面壁1 + 手すり2(下層/上層)
                  + スコアボード2 + 外壁シェル2(フィン/ガラス帯) = 15
                  (InstancedMesh: vomitoryグロー1 + 投光器列1。Near観客なし)
          high  : medium(15) と同じ静的メッシュ構成
                  (InstancedMesh: vomitoryグロー1 + 投光器列1 + Near観客(~1200体)1 = 3) */}
      <mesh geometry={ledGeom} material={ledMat} />
      <mesh geometry={frontWallGeom} material={concreteMat} />
      <mesh geometry={lowerTierGeom} material={seatMat} />
      <mesh geometry={roofTopGeom} material={roofTopMat} />
      <mesh geometry={roofUnderGeom} material={roofUnderMat} />
      <mesh geometry={roofEdgeGeom} material={roofEdgeMat} />
      {full && (
        <>
          <mesh geometry={concourseGeom} material={concourseMat} />
          <mesh geometry={upperTierGeom} material={seatMat} />
          <mesh geometry={backWallGeom} material={concreteMat} />
          <mesh geometry={lowerRailGeom} material={railMat} />
          <mesh geometry={upperRailGeom} material={railMat} />
          <VomitoryGlowInstances key={`vom|${fmtKey}`} path={bowlPath} stack={stack} />
          <FloodlightRowInstances key={`flood|${fmtKey}`} path={bowlPath} stack={stack} />
          <Scoreboards dims={dims} stack={stack} />
          <ExteriorShell path={bowlPath} fmtKey={fmtKey} stack={stack} />
        </>
      )}
      {quality === "high" && <NearCrowdInstances key={`crowd|${fmtKey}`} path={bowlPath} stack={stack} />}
    </group>
  );
}
