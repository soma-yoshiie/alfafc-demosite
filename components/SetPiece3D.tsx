"use client";

// セットプレー3Dビューア本体（R3F/three.js を直接importする重いコンポーネント）。
// SetPieceBoard.tsx から next/dynamic({ssr:false}) 経由でのみ読み込む
// （このファイルを他画面から静的importしないこと＝バンドル分離を保つ）。
//
// Playback3Dフェーズ: 2D側（BoardProvider の rAF 再生ループ）と同じ意味論で、moves+場面(step)を
// 時間補間して3D内で再生する。位置計算はlib/animation.tsのactorPos/absStart/easeByをそのまま
// 再利用し（重複実装しない）、同じmoves・同じtを渡せば2D/3Dの到達位置は関数レベルで一致する。
// 再生の駆動はBoardProviderが管理する共有の再生時計（board.getTime()/isPlaying/startPlay等）に
// 乗る＝2DのAnimationStudioと同じ盤面(screen==="setpiece"時はspState)を指すため、
// タイムライン操作は2D/3Dのどちらから行っても両方に反映される。ただしBoardProvider.onTickは
// AnimationStudioが専有する単一スロットのため（本タスクでBoardProvider.tsxは編集不可）、
// 3D側は自前でCanvas外の軽量rAFポーリングにより board.getTime() の変化を検知し、
// 変化があったときだけ useThree().invalidate() を呼ぶ（frameloop="demand"のまま、
// CameraController/GazeClickPlaneと同じ「動いている間だけinvalidate()し続ける」流儀を
// 再生駆動にも適用している＝静止時は本当に無描画のまま）。
// 選手の走行モーション（進行方向のyaw追従・速度に応じた脚腕の振り→待機ポーズへのブレンド）と
// ボール弾道（ground/driven/lofted）の純粋計算はlib/setPiece3d.tsに集約し、本ファイルは
// それをuseFrame内でObject3D refへ書き込む（Reactの再レンダーを介さない）だけにしている。
//
// 【編集範囲の制約】このタスクで編集可能なファイルは本ファイル・lib/setPiece3d.ts・
// lib/types.ts（moves弾道フィールドのみ）・components/AnimationStudio.tsx（弾道セレクタのみ）・
// app/globals.cssで、components/SetPieceBoard.tsx（3D中のカメラプリセット行
// .sp3dbar=CameraBarを描画している親）は編集できない。そのためカメラプリセットの追加
// （ground/replay）はlib/setPiece3d.tsのCAMERA_PRESET_ORDER/LABELに載せるだけで
// CameraBar側が自動的にボタンを増やす仕組みに乗せ、逆に「3Dバーに標準/軽量トグルを追加」や
// 「3Dバーに再生コントロールを追加」は親コンポーネントの.sp3dbarへ直接は差し込めないため、
// 本ファイル側（.sp3dpitch内）に浮かせるオーバーレイとして実装している
// （QualityToggle＝app/globals.cssの.sp3dquality、PlaybackBar＝同.sp3dplay）。

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls, useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useBoard } from "./BoardProvider";
import { actorColor } from "@/lib/colors";
import { actorPos, animTotal, stepAtTime, stepDur, stepStartTime } from "@/lib/animation";
import type { Actor, Move, Shape, TextShape, ZoneShape } from "@/lib/types";
import { moveKind, moveTrajectory } from "@/lib/types";
import { IconPause, IconPlay } from "./icons";
import {
  AD_BOARD_COLORS,
  APRON_COLOR,
  BOOT_COLOR,
  boardToWorld,
  boardXToWorldX,
  boardYToWorldZ,
  buildMarkingsGeometryData,
  computeCameraPreset,
  actionEventsFor,
  computeActionEvents,
  computeHeaderPose,
  computeIdlePose,
  computeKickPose,
  computeRunPose,
  HEADER_DUR_S,
  HEADER_PRE_S,
  KICK_DUR_S,
  KICK_PRE_S,
  dampAngle,
  findActiveMove,
  type ActionEvent,
  getKitColors,
  type KitVariant,
  getPitchDims,
  lenXToMeters,
  lenYToMeters,
  lerpLimbPose,
  OWN_KIT_JERSEY,
  PLAYER_HEIGHT_M,
  PLAYER_RIG_M,
  RUN_BLEND_SPEED_MPS,
  RUN_CYCLES_PER_METER,
  SKIN_TONES,
  STADIUM_M,
  STAND_BASE_COLOR,
  STAND_SEAT_TONES,
  TELEPORT_GUARD_M,
  TRAIL_SECONDS,
  trajectoryHeightM,
  worldPathLengthM,
  YAW_TURN_RATE_RAD_S,
  type CameraPresetId,
  type PitchDims,
} from "@/lib/setPiece3d";

const REDUCED_MOTION_MQ = "(prefers-reduced-motion: reduce)";

/** OS/ブラウザの「視差効果を減らす」設定を追跡する（TacticsBoard.tsx usePc() と同じ手法） */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_MQ).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(REDUCED_MOTION_MQ);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ============================================================
   品質トグル（標準/軽量）。localStorageに記憶し、影・観客席帯・dprを切り替える。
   ============================================================ */

type Sp3dQuality = "standard" | "light";
const SP3D_QUALITY_KEY = "alfa_sp3d_quality";

/** タッチデバイス（pointer:coarse）または幅<1024pxの端末は「軽量」を既定にする
 * （localStorageに保存済みの明示選択が無いとき限定で使う判定。TeamHub.tsx usePc() 等と
 * 同じ1024pxブレークポイントに合わせている） */
function detectDefaultQuality(): Sp3dQuality {
  if (typeof window === "undefined") return "standard";
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const isNarrow = !window.matchMedia("(min-width: 1024px)").matches;
  return isTouch || isNarrow ? "light" : "standard";
}

function readStoredQuality(): Sp3dQuality {
  if (typeof window === "undefined") return "standard";
  try {
    const raw = window.localStorage.getItem(SP3D_QUALITY_KEY);
    if (raw === "light" || raw === "standard") return raw;
    // 未設定（初回訪問）のときだけデバイス判定で既定を決める。ユーザーが一度でも切り替えれば
    // 以後は明示的な値("light"/"standard")がstorageに残るため、この分岐には二度と入らない
    // （＝ユーザー切替は従来どおり記憶される）
    return detectDefaultQuality();
  } catch {
    return "standard";
  }
}

/** 品質トグルのstate＋localStorage永続化。プライベートブラウズ等でstorageが使えない環境でも
 * 表示切替自体は機能するよう、保存失敗は無視する（機能に支障なし）。 */
function useSp3dQuality(): [Sp3dQuality, (q: Sp3dQuality) => void] {
  const [quality, setQualityState] = useState<Sp3dQuality>(() => readStoredQuality());
  const setQuality = (q: Sp3dQuality) => {
    setQualityState(q);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SP3D_QUALITY_KEY, q);
    } catch {
      /* 無視（保存できなくても表示は切り替わる） */
    }
  };
  return [quality, setQuality];
}

function QualityToggle({
  quality,
  onChange,
}: {
  quality: Sp3dQuality;
  onChange: (q: Sp3dQuality) => void;
}) {
  return (
    <div className="sp3dquality" role="group" aria-label="3D表示品質">
      <button
        type="button"
        className={`sp3dqbtn${quality === "standard" ? " on" : ""}`}
        onClick={() => onChange("standard")}
      >
        標準
      </button>
      <button
        type="button"
        className={`sp3dqbtn${quality === "light" ? " on" : ""}`}
        onClick={() => onChange("light")}
      >
        軽量
      </button>
    </div>
  );
}

/* ============================================================
   共有ジオメトリ・マテリアルキャッシュ（性能予算: 選手間はクローンでなく同一参照を使う）
   モジュールスコープで一度だけ生成し、以後は全選手・全マウントで使い回す（2D/3D切替の
   たびに作り直さない）。色・番号のバリエーションは有限（チーム内の役割色数×表示中の背番号数）
   なのでMapキャッシュのまま無期限に保持してよく、per-mountでの明示的なdispose処理は不要にしている
   （＝生成しっぱなしで増え続けるのはランダムkeyのときだけで、ここはすべて有限keyのキャッシュ）。
   ============================================================ */

/** 単位ボックス/正二十面体/円柱。実寸は各meshのscaleで決める（torso/pelvis/広告板/観客席は
 * UNIT_BOX、頭部/足はUNIT_ICO、四肢はUNIT_CYLを共有する） */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_ICO = new THREE.IcosahedronGeometry(1, 0);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function getCachedMaterial(hex: string): THREE.MeshStandardMaterial {
  let m = materialCache.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.04 });
    materialCache.set(hex, m);
  }
  return m;
}

function hexLuma(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** 背番号テクスチャ（胴体の背面1面だけに割り当てる。番号ごと・チームカラーごとにキャッシュ）。
 * 既存のHtml方式（頭上の小型ラベル）は3D空間から浮いて見え質感を落とすため不採用にし、
 * こちらの「胴テクスチャ」方式を選んだ（フォントはローカルのsans-serif総称のみに依存し、
 * 静的書き出し(output:"export")でもネットワーク取得なしで完結する） */
const numberTextureCache = new Map<string, THREE.CanvasTexture>();
function getNumberTexture(jerseyHex: string, label: string): THREE.CanvasTexture {
  const key = `${jerseyHex}|${label}`;
  const hit = numberTextureCache.get(key);
  if (hit) return hit;
  const w = 96;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = jerseyHex;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hexLuma(jerseyHex) > 0.6 ? "#16212c" : "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 68;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    while (ctx.measureText(label).width > w * 0.84 && size > 24) {
      size -= 4;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(label, w / 2, h / 2 + 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  numberTextureCache.set(key, tex);
  return tex;
}

const numberMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getNumberMaterial(jerseyHex: string, label: string): THREE.MeshStandardMaterial {
  const key = `${jerseyHex}|${label}`;
  let m = numberMaterialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: getNumberTexture(jerseyHex, label),
      roughness: 0.6,
      metalness: 0.04,
    });
    numberMaterialCache.set(key, m);
  }
  return m;
}

/* ============================================================
   ピッチ（地面・マーキング・ゴール）
   ============================================================ */

const GRASS_MARGIN_M = 3;
const STRIPE_COUNT = 11;
/** 芝の平面ジオメトリは8人制/11人制の2種類しかないため、format(pitchWidthM×pitchLengthM)を
 * キーにモジュールスコープでキャッシュし、以後は同じdimsで呼ばれるたび使い回す（旧実装は
 * 8人制寸法固定のモジュール定数1枚だったが、11人制配線のためdims引数から都度取得する形にした。
 * 縞ごとに11枚のplaneを並べていた旧々実装から、縞は下のcanvasテクスチャ側で表現するため
 * 地面自体は1枚・2三角形のまま） */
const grassGeomCache = new Map<string, THREE.PlaneGeometry>();
function getGrassPlaneGeom(dims: PitchDims): THREE.PlaneGeometry {
  const key = `${dims.pitchWidthM}x${dims.pitchLengthM}`;
  let g = grassGeomCache.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(dims.pitchWidthM + GRASS_MARGIN_M * 2, dims.pitchLengthM + GRASS_MARGIN_M * 2);
    grassGeomCache.set(key, g);
  }
  return g;
}

/** 芝の縞＋刈り跡風の微パターンを焼き込んだcanvasテクスチャ。品質ごとに1枚だけ生成しキャッシュする
 * （軽量品質は微パターンを省いた単純な縞のみ＝「縞テクスチャ簡略」） */
const grassTextureCache = new Map<Sp3dQuality, THREE.CanvasTexture>();
function getGrassTexture(quality: Sp3dQuality): THREE.CanvasTexture {
  const hit = grassTextureCache.get(quality);
  if (hit) return hit;
  const w = 256;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const stripeH = h / STRIPE_COUNT;
    for (let i = 0; i < STRIPE_COUNT; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#1f8c4f" : "#15803d";
      ctx.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    if (quality === "standard") {
      // 刈り跡風の微パターン（縞と直交する薄い縦筋を重ねるだけの簡易表現）
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      for (let x = 3; x < w; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  grassTextureCache.set(quality, tex);
  return tex;
}

/** 場外グラウンド(エプロン): ピッチ〜スタンド外側まで途切れなく敷く1枚平面。
 * 旧実装は芝プレーン(ピッチ+3m)の外が何も無く、ピッチと観客席の間に「透明な床」が
 * 見えていた。全構造物の足元をこの1枚(2三角形)で覆う */
const APRON_GEOM = new THREE.PlaneGeometry(320, 320);
function ApronGround() {
  return (
    <mesh
      geometry={APRON_GEOM}
      rotation-x={-Math.PI / 2}
      position={[0, -0.02, 0]}
      material={getCachedMaterial(APRON_COLOR)}
      receiveShadow
    />
  );
}

/** 芝: canvasテクスチャ1枚を貼った1平面（旧実装の縞メッシュ11枚から統合。draw call・
 * 三角形数を大きく削減しつつ縞・刈り跡パターンは維持する）。ジオメトリはdims(8人制/11人制)
 * ごとにキャッシュされたものを使い回す（getGrassPlaneGeom参照） */
function PitchGround({ quality, dims }: { quality: Sp3dQuality; dims: PitchDims }) {
  const tex = getGrassTexture(quality);
  const geom = useMemo(() => getGrassPlaneGeom(dims), [dims]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 }), [tex]);
  return <mesh geometry={geom} rotation-x={-Math.PI / 2} material={mat} receiveShadow />;
}

/** ライン用マテリアル（全formatで共有）。polygonOffsetで芝との深度競合を避け、
 * どの距離・角度からでもラインが消えない（drei Line時代の「ズームで消える」対策の本体） */
let markingMaterialCache: THREE.MeshBasicMaterial | null = null;
function getMarkingMaterial(): THREE.MeshBasicMaterial {
  if (!markingMaterialCache) {
    markingMaterialCache = new THREE.MeshBasicMaterial({
      color: "#fdfdfd",
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
  }
  return markingMaterialCache;
}

/** 外枠・ハーフウェイライン・センターサークル・PA/GA・PKマーク・コーナーアーク。
 * 旧実装のdrei Line(worldUnits)はカメラを近づけると描画が破綻して「ラインが消える」ため、
 * 実ジオメトリの帯を1つのBufferGeometryへマージした1メッシュ(draw call 1)に置き換えた */
const markingsBufferCache = new Map<string, THREE.BufferGeometry>();
function getMarkingsGeometry(dims: PitchDims): THREE.BufferGeometry {
  const key = `${dims.pitchWidthM}x${dims.pitchLengthM}`;
  let g = markingsBufferCache.get(key);
  if (!g) {
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(buildMarkingsGeometryData(dims), 3));
    markingsBufferCache.set(key, g);
  }
  return g;
}

function PitchLines({ dims }: { dims: PitchDims }) {
  const geom = useMemo(() => getMarkingsGeometry(dims), [dims]);
  return <mesh geometry={geom} material={getMarkingMaterial()} position={[0, 0.02, 0]} renderOrder={1} />;
}

/** ゴールネットの網目風alphaMap。1枚だけ生成しキャッシュ（両ゴールで共有） */
let netTextureCache: THREE.CanvasTexture | null = null;
function getNetTexture(): THREE.CanvasTexture {
  if (netTextureCache) return netTextureCache;
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.6;
    const step = s / 6;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const p = i * step;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 2.4);
  netTextureCache = tex;
  return tex;
}
let netMaterialCache: THREE.MeshStandardMaterial | null = null;
function getNetMaterial(): THREE.MeshStandardMaterial {
  if (!netMaterialCache) {
    netMaterialCache = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      alphaMap: getNetTexture(),
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.9,
    });
  }
  return netMaterialCache;
}
/** ピッチ側の面だけを完全透明にするための開口用マテリアル（ゴール1個につき1面だけ使う）。
 * これが無いと箱ジオメトリ全6面に同じネット地が張られ、ピッチ側（ボールが入ってくる面）も
 * 塞がれて「檻」に見えてしまう。 */
let netOpenMaterialCache: THREE.MeshStandardMaterial | null = null;
function getNetOpenMaterial(): THREE.MeshStandardMaterial {
  if (!netOpenMaterialCache) {
    netOpenMaterialCache = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return netOpenMaterialCache;
}
/** ネットBox用の6面ぶんマテリアル配列（BoxGeometryの面グループ順は [+x,-x,+y,-y,+z,-z]）。
 * end=1（敵陣y100側ゴール）はローカル-z面がピッチ向き、end=-1（自陣y0側ゴール）は+z面が
 * ピッチ向きになる（netZがゴールラインより外側＝ end方向へオフセットされているため）。
 * そのピッチ向きの1面だけをgetNetOpenMaterial()にして開口させ、残り5面（背面・左右・天井・床）は
 * 通常のネット地のまま＝「檻」にならず、両ゴールとも開口方向が正しい。 */
const netFaceMaterialsCache = new Map<1 | -1, THREE.Material[]>();
function getNetFaceMaterials(end: 1 | -1): THREE.Material[] {
  let arr = netFaceMaterialsCache.get(end);
  if (!arr) {
    const solid = getNetMaterial();
    const open = getNetOpenMaterial();
    const pzOpen = end === -1;
    const nzOpen = end === 1;
    arr = [solid, solid, solid, solid, pzOpen ? open : solid, nzOpen ? open : solid];
    netFaceMaterialsCache.set(end, arr);
  }
  return arr;
}

/** ゴール（ポスト・クロスバー・網目テクスチャ入りネット）。end=1が敵陣(y100)側、-1が自陣(y0)側。
 * ポスト・クロスバーはUNIT_CYLをscaleして使い回す（性能予算: ジオメトリ共有）。dimsはformat
 * (8人制/11人制)に応じたゴール寸法・ピッチ長を渡す。 */
function Goal({ end, dims }: { end: 1 | -1; dims: PitchDims }) {
  const z = end * (dims.pitchLengthM / 2);
  const halfGoal = dims.goalWidthM / 2;
  const postR = 0.05;
  const netZ = z + end * (dims.goalNetDepthM / 2);
  const postMat = getCachedMaterial("#f4f6fa");
  const netFaceMaterials = useMemo(() => getNetFaceMaterials(end), [end]);
  return (
    <group>
      <mesh
        geometry={UNIT_CYL}
        scale={[postR, dims.goalHeightM, postR]}
        position={[-halfGoal, dims.goalHeightM / 2, z]}
        material={postMat}
        castShadow
      />
      <mesh
        geometry={UNIT_CYL}
        scale={[postR, dims.goalHeightM, postR]}
        position={[halfGoal, dims.goalHeightM / 2, z]}
        material={postMat}
        castShadow
      />
      <mesh
        geometry={UNIT_CYL}
        scale={[postR, dims.goalWidthM, postR]}
        position={[0, dims.goalHeightM, z]}
        rotation-z={Math.PI / 2}
        material={postMat}
        castShadow
      />
      {/* バックステー（クロスバー両端から後方地面へ斜めに降りる支柱）。ゴールに実物どおりの
          奥行きを持たせる（「ゴールが薄すぎる」対策はネット深さdims.goalNetDepthMの拡大とセット） */}
      {([-1, 1] as const).map((sideX) => {
        const backLen = Math.hypot(dims.goalHeightM, dims.goalNetDepthM);
        const tilt = Math.atan2(dims.goalNetDepthM, dims.goalHeightM);
        return (
          <mesh
            key={sideX}
            geometry={UNIT_CYL}
            scale={[postR * 0.8, backLen, postR * 0.8]}
            position={[sideX * halfGoal, dims.goalHeightM / 2, z + end * (dims.goalNetDepthM / 2)]}
            rotation-x={-end * tilt}
            material={postMat}
          />
        );
      })}
      {/* 後方下端のグラウンドバー */}
      <mesh
        geometry={UNIT_CYL}
        scale={[postR * 0.7, dims.goalWidthM, postR * 0.7]}
        position={[0, 0.04, z + end * dims.goalNetDepthM]}
        rotation-z={Math.PI / 2}
        material={postMat}
      />
      {/* ゴールネット（網目風alphaMap入り）。ピッチ側の1面だけ透明にして開口させる（檻に見せない） */}
      <mesh
        geometry={UNIT_BOX}
        scale={[dims.goalWidthM, dims.goalHeightM, dims.goalNetDepthM]}
        position={[0, dims.goalHeightM / 2, netZ]}
        material={netFaceMaterials}
      />
    </group>
  );
}

/* ============================================================
   スタジアム環境（広告板・観客席の帯）。ピッチ外周を低ポリの箱4枚（矩形リング）で囲うだけの
   簡易表現。UNIT_BOXを共有し、実寸は各面のscaleだけで決める。
   ============================================================ */

const adBoardTextureCache: { current: THREE.CanvasTexture | null } = { current: null };
function getAdBoardTexture(): THREE.CanvasTexture {
  if (adBoardTextureCache.current) return adBoardTextureCache.current;
  const w = 128;
  const h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const [c1, c2] = AD_BOARD_COLORS;
    const seg = w / 8;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.fillRect(i * seg, 0, seg, h);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 1);
  adBoardTextureCache.current = tex;
  return tex;
}
let adBoardMaterialCache: THREE.MeshStandardMaterial | null = null;
function getAdBoardMaterial(): THREE.MeshStandardMaterial {
  if (!adBoardMaterialCache) {
    adBoardMaterialCache = new THREE.MeshStandardMaterial({
      map: getAdBoardTexture(),
      roughness: 0.8,
      metalness: 0.05,
    });
  }
  return adBoardMaterialCache;
}

const standTextureCache: { current: THREE.CanvasTexture | null } = { current: null };
function getStandTexture(): THREE.CanvasTexture {
  if (standTextureCache.current) return standTextureCache.current;
  const w = 192;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = STAND_BASE_COLOR;
    ctx.fillRect(0, 0, w, h);
    // 段差ライン（階段状の座席列）
    ctx.fillStyle = "#2a333d";
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
    // 観客の粒: 座席トーンに加えて時々カラフルな服・白シャツを混ぜ、遠景でも「満員の観客」に見せる
    const crowdPop: string[] = ["#d64545", "#e8b93c", "#f2f2f2", "#4f86d6", "#58b06a"];
    const rand = (x: number, y: number) => {
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let y = 2; y < h; y += 4) {
      for (let x = 1; x < w; x += 3) {
        const r = rand(x, y);
        ctx.fillStyle =
          r > 0.82
            ? crowdPop[Math.floor(r * 100) % crowdPop.length]
            : STAND_SEAT_TONES[(x + y) % STAND_SEAT_TONES.length];
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 2);
  standTextureCache.current = tex;
  return tex;
}
let standMaterialCache: THREE.MeshStandardMaterial | null = null;
function getStandMaterial(): THREE.MeshStandardMaterial {
  if (!standMaterialCache) {
    standMaterialCache = new THREE.MeshStandardMaterial({ map: getStandTexture(), roughness: 0.95 });
  }
  return standMaterialCache;
}

/** ピッチ外周・芝ランのすぐ外にある無地・架空色の広告板（常時表示。軽量品質でもOFFにしない＝
 * 仕様の「軽量: 影OFF・観客席帯OFF・dpr1固定」に広告板は含まれないため） */
function AdBoardRing({ dims }: { dims: PitchDims }) {
  const halfW = dims.pitchWidthM / 2 + GRASS_MARGIN_M + STADIUM_M.adBoardMarginM;
  const halfL = dims.pitchLengthM / 2 + GRASS_MARGIN_M + STADIUM_M.adBoardMarginM;
  const h = STADIUM_M.adBoardHeightM;
  const t = STADIUM_M.adBoardThicknessM;
  const mat = getAdBoardMaterial();
  return (
    <group>
      <mesh geometry={UNIT_BOX} material={mat} position={[0, h / 2, -halfL]} scale={[halfW * 2, h, t]} />
      <mesh geometry={UNIT_BOX} material={mat} position={[0, h / 2, halfL]} scale={[halfW * 2, h, t]} />
      <mesh
        geometry={UNIT_BOX}
        material={mat}
        position={[-halfW, h / 2, 0]}
        rotation-y={Math.PI / 2}
        scale={[halfL * 2, h, t]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={mat}
        position={[halfW, h / 2, 0]}
        rotation-y={Math.PI / 2}
        scale={[halfL * 2, h, t]}
      />
    </group>
  );
}

/** サッカー専用スタジアム風の傾斜スタンド一式（前面の低い壁+後方へ上る傾斜席+背面壁+屋根）。
 * 旧実装の「ピッチ近くの垂直壁」はカメラアングルによって視界を塞いだため、
 * 前面は1.1mの低壁だけにし、席は後方ほど高くなるラケ(約25°)へ変更（地上カメラでも視界が抜ける）。
 * コーナーは開放し、4本の照明塔（サッカー専用スタの記号）を置く。標準品質のみ表示。 */
const CONCRETE_COLOR = "#8b95a1";
const ROOF_COLOR = "#c9d0d8";
const FLOOD_MAST_COLOR = "#3a424c";

function StandSide({ length }: { length: number }) {
  const S = STADIUM_M;
  const a = S.standRakeRad;
  const D = S.standDepthM;
  const topH = S.standFrontWallM + D * Math.sin(a);
  const backZ = -(D * Math.cos(a));
  const standMat = getStandMaterial();
  const concreteMat = getCachedMaterial(CONCRETE_COLOR);
  const roofMat = getCachedMaterial(ROOF_COLOR);
  return (
    <group>
      {/* 前面の低い壁（この高さまでしか視界を遮らない） */}
      <mesh
        geometry={UNIT_BOX}
        material={concreteMat}
        position={[0, S.standFrontWallM / 2, -0.15]}
        scale={[length, S.standFrontWallM, 0.3]}
      />
      {/* 傾斜席スラブ（観客テクスチャ） */}
      <mesh
        geometry={UNIT_BOX}
        material={standMat}
        position={[0, S.standFrontWallM + (D / 2) * Math.sin(a), backZ / 2]}
        rotation-x={a}
        scale={[length, S.standSlabThickM, D]}
      />
      {/* 背面壁 */}
      <mesh
        geometry={UNIT_BOX}
        material={concreteMat}
        position={[0, topH / 2, backZ - 0.2]}
        scale={[length, topH, 0.4]}
      />
      {/* 屋根（後方上空に浮くキャノピー。前端をわずかに下げる実物風の傾き） */}
      <mesh
        geometry={UNIT_BOX}
        material={roofMat}
        position={[0, topH + S.roofClearM, backZ + S.roofDepthM / 2 - 0.6]}
        rotation-x={-0.09}
        scale={[length, S.roofThickM, S.roofDepthM]}
      />
    </group>
  );
}

function Floodlight({ x, z }: { x: number; z: number }) {
  const S = STADIUM_M;
  const mastMat = getCachedMaterial(FLOOD_MAST_COLOR);
  const headMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#eef4ff",
      emissive: new THREE.Color("#dfe9ff"),
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    return m;
  }, []);
  // ピッチ中心(0,0)の方を向ける
  const yaw = Math.atan2(-x, -z);
  return (
    <group position={[x, 0, z]} rotation-y={yaw}>
      <mesh
        geometry={UNIT_CYL}
        material={mastMat}
        position={[0, S.floodMastM / 2, 0]}
        scale={[0.28, S.floodMastM, 0.28]}
      />
      <mesh
        geometry={UNIT_BOX}
        material={headMat}
        position={[0, S.floodMastM + S.floodHeadH / 2 - 0.3, 0.5]}
        rotation-x={0.55}
        scale={[S.floodHeadW, S.floodHeadH, 0.45]}
      />
    </group>
  );
}

function StadiumStands({ dims }: { dims: PitchDims }) {
  const S = STADIUM_M;
  const inner = GRASS_MARGIN_M + S.adBoardMarginM + S.adBoardThicknessM + S.standMarginM;
  const frontX = dims.pitchWidthM / 2 + inner; // 左右サイドスタンドの前面壁位置
  const frontZ = dims.pitchLengthM / 2 + inner; // ゴール裏スタンドの前面壁位置
  const lengthX = dims.pitchWidthM + inner * 1.4;
  const lengthZ = dims.pitchLengthM + inner * 1.4;
  const backOff = S.standDepthM * Math.cos(S.standRakeRad);
  const floodX = frontX + backOff + 4;
  const floodZ = frontZ + backOff + 4;
  return (
    <group>
      {/* ゴール裏(±z)・メイン/バック(±x)の4面。StandSideはローカル-z方向(=席の後方)へ上る形。
          「後方」がワールドでピッチと反対側を向くように各面を回す:
          R_y(θ)でローカル(0,0,-1)は (−sinθ, 0, −cosθ) へ写るため、
          -z面(後方=世界-z)→θ=0 / +z面(後方=世界+z)→θ=π /
          -x面(後方=世界-x)→θ=π/2 / +x面(後方=世界+x)→θ=-π/2。
          （旧実装は4面とも逆で、観客席が外側を向き・ゴール裏の高い縁が
          ピッチ側に来て「ゴール前の壁」に見えていた） */}
      <group position={[0, 0, -frontZ]}>
        <StandSide length={lengthX} />
      </group>
      <group position={[0, 0, frontZ]} rotation-y={Math.PI}>
        <StandSide length={lengthX} />
      </group>
      <group position={[-frontX, 0, 0]} rotation-y={Math.PI / 2}>
        <StandSide length={lengthZ} />
      </group>
      <group position={[frontX, 0, 0]} rotation-y={-Math.PI / 2}>
        <StandSide length={lengthZ} />
      </group>
      <Floodlight x={-floodX} z={-floodZ} />
      <Floodlight x={floodX} z={-floodZ} />
      <Floodlight x={-floodX} z={floodZ} />
      <Floodlight x={floodX} z={floodZ} />
    </group>
  );
}

/* ============================================================
   ゾーン図形・テキスト図形（床面投影）
   ============================================================ */

function ZoneMesh({ shape, dims }: { shape: ZoneShape; dims: PitchDims }) {
  const cx = boardXToWorldX(shape.x, dims);
  const cz = boardYToWorldZ(shape.y, dims);
  const col = shape.color ?? "#ffe27a";
  if (shape.kind === "zoneEllipse") {
    const rx = Math.max(0.05, lenXToMeters(shape.w, dims) / 2);
    const rz = Math.max(0.05, lenYToMeters(shape.h, dims) / 2);
    return (
      <mesh position={[cx, 0.02, cz]} rotation-x={-Math.PI / 2} scale={[rx, rz, 1]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial color={col} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    );
  }
  const w = Math.max(0.1, lenXToMeters(shape.w, dims));
  const h = Math.max(0.1, lenYToMeters(shape.h, dims));
  return (
    <mesh position={[cx, 0.02, cz]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color={col} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

const TEXT_PX: Record<string, number> = { s: 11, m: 14, l: 18 };

/** テキスト図形の床ビルボード。drei Text(troika)はデフォルトフォントをCDNから取得するため、
 * このアプリの自己完結な静的書き出し（next.config.mjs の output:"export"）方針に合わせ、
 * アプリ既存フォントで描く drei Html を使う（ネットワーク非依存・常にカメラへ正対） */
function TextShapeLabel({ shape, dims }: { shape: TextShape; dims: PitchDims }) {
  const x = boardXToWorldX(shape.x, dims);
  const z = boardYToWorldZ(shape.y, dims);
  const col = shape.color ?? "#ffe27a";
  return (
    <Html position={[x, 0.06, z]} center pointerEvents="none" zIndexRange={[10, 0]}>
      <div className="sp3d-zonetext" style={{ fontSize: TEXT_PX[shape.size ?? "m"], borderColor: col, color: col }}>
        {shape.text}
      </div>
    </Html>
  );
}

function useVisibleShapes(): Shape[] {
  const board = useBoard();
  return (board.state.shapes ?? []).filter((s) => s.step == null || s.step === board.viewStep);
}

function ShapesFloor({ dims }: { dims: PitchDims }) {
  const shapes = useVisibleShapes();
  return (
    <group>
      {shapes.map((s) => {
        if (s.kind === "zoneEllipse" || s.kind === "zoneRect") return <ZoneMesh key={s.id} shape={s} dims={dims} />;
        if (s.kind === "text") return <TextShapeLabel key={s.id} shape={s} dims={dims} />;
        // Phase1は仕様どおりゾーン/テキストのみ床へ投影する（矢印・連結ライン・囲み枠は対象外）
        return null;
      })}
    </group>
  );
}

/* ============================================================
   動線（moves）: パス=破線 / ラン・ドリブル・シュート=実線
   ============================================================ */

function MoveLine3D({ move, color, dims }: { move: Move; color: string; dims: PitchDims }) {
  if (move.path.length < 2) return null;
  const kind = moveKind(move);
  const dashed = kind === "pass";
  const pts = move.path.map((p) => {
    const w = boardToWorld(p, dims);
    return [w.x, 0.016, w.z] as [number, number, number];
  });
  return (
    <Line
      points={pts}
      color={color}
      lineWidth={0.05}
      worldUnits
      dashed={dashed}
      dashSize={dashed ? 1.1 : undefined}
      gapSize={dashed ? 0.7 : undefined}
      transparent
      opacity={0.65}
    />
  );
}

function MovesFloor({ dims }: { dims: PitchDims }) {
  const board = useBoard();
  const moves = board.state.moves.filter((m) => (m.step ?? 0) === board.viewStep);
  return (
    <group>
      {moves.map((m, i) => (
        <MoveLine3D key={i} move={m} color={actorColor(m.actor, board.state.slots)} dims={dims} />
      ))}
    </group>
  );
}

/* ============================================================
   選手アバター（プロシージャル関節人型）
   頭/胴/骨盤/上腕・前腕×2/大腿・下腿×2 + 足×2 の13メッシュ構成。関節はグループ階層で持ち、
   Playback3Dフェーズが回転アニメを付けられる命名（leftArm/rightThigh等）でexportする。
   ジオメトリはUNIT_BOX/UNIT_ICO/UNIT_CYLの3種のみを全選手で共有し、色はマテリアルキャッシュ
   （getCachedMaterial等）だけで差し替える（クローンしない＝性能予算どおり）。
   将来GLBモデルへ差し替える際は、このコンポーネントの返り値（同じ名前の<group>ツリー）を
   ロード済みGLTFシーンへ置き換えるだけで済むよう、命名規約をそのまま踏襲している。

   概算ポリゴン数（1体）: 頭(正二十面体詳細0=20tri) + 胴(箱=12tri) + 骨盤(箱=12tri)
     + 上腕/前腕/大腿/下腿×2ずつ(円柱6角柱・キャップ込み=24tri×8=192tri) + 足×2(正二十面体=20tri×2=40tri)
     = 20+12+12+192+40 = 276tri／13 draw call。仕様の「300ポリ以下」を満たす。
   ============================================================ */

function usePlayerMaterials(jerseyHex: string, variant: KitVariant, skinTone: string, label: string) {
  return useMemo(() => {
    const kit = getKitColors(jerseyHex, variant);
    const isGK = variant === "gk" || variant === "oppgk";
    const jerseyMat = getCachedMaterial(kit.jersey);
    const shortsMat = getCachedMaterial(kit.shorts);
    const socksMat = getCachedMaterial(kit.socks);
    const skinMat = getCachedMaterial(skinTone);
    const bootMat = getCachedMaterial(BOOT_COLOR);
    // GK=長袖（袖も胴と同色）、それ以外=半袖（前腕は肌色）
    const sleeveMat = isGK ? jerseyMat : skinMat;
    const numberMat = getNumberMaterial(kit.jersey, label);
    // 背番号は背面(nz)に加えて胸面(pz)にも出す＝正面からの視点でも番号で見分けられる
    const torsoMaterials: THREE.Material[] = [jerseyMat, jerseyMat, jerseyMat, jerseyMat, numberMat, numberMat];
    return { jerseyMat, shortsMat, socksMat, skinMat, bootMat, sleeveMat, torsoMaterials };
  }, [jerseyHex, variant, skinTone, label]);
}

/**
 * 選手アバター1体。position/yaw(進行方向)/関節角度はReactの再レンダーを介さず、useFrame内で
 * Object3D参照へ直接書き込む（idleポーズ由来のJSX宣言的propsは、まだ一度もuseFrameが
 * 走っていない初回ペイントのためのフォールバックとしてのみ残す）。actor（スロット番号 or
 * opp<index>）を毎フレーム lib/animation.ts の actorPos へ渡し、2D再生と全く同じ位置計算を
 * 共有する（同じmoves・同じtなら2D/3Dの到達位置は一致する）。
 */
function PlayerFigure({
  actor,
  x,
  z,
  jersey,
  variant,
  label,
  seed,
  facing,
  quality,
  dims,
  events,
}: {
  actor: Actor;
  x: number;
  z: number;
  jersey: string;
  variant: KitVariant;
  label: string;
  seed: number;
  facing: 1 | -1;
  quality: Sp3dQuality;
  dims: PitchDims;
  events: ActionEvent[];
}) {
  const board = useBoard();
  const idle = useMemo(() => computeIdlePose(seed), [seed]);
  const skinTone = SKIN_TONES[Math.abs(Math.round(seed)) % 2];
  const { shortsMat, socksMat, skinMat, bootMat, sleeveMat, torsoMaterials } = usePlayerMaterials(
    jersey,
    variant,
    skinTone,
    label
  );
  const R = PLAYER_RIG_M;
  const hipY = R.ankleY + R.shinLen + R.thighLen;
  const initialYaw = facing === -1 ? Math.PI : 0;

  const rootRef = useRef<THREE.Group | null>(null);
  const torsoRef = useRef<THREE.Group | null>(null);
  const leftArmRef = useRef<THREE.Group | null>(null);
  const leftForearmRef = useRef<THREE.Group | null>(null);
  const rightArmRef = useRef<THREE.Group | null>(null);
  const rightForearmRef = useRef<THREE.Group | null>(null);
  const leftThighRef = useRef<THREE.Group | null>(null);
  const leftShinRef = useRef<THREE.Group | null>(null);
  const rightThighRef = useRef<THREE.Group | null>(null);
  const rightShinRef = useRef<THREE.Group | null>(null);

  // 前フレームのワールド位置（速度・進行方向の算出用）、向き(yaw)・走行位相・平滑化した
  // 速度の蓄積値。すべて毎フレームuseFrameが更新するだけの値でReactの再レンダーは起こさない
  const prevWorld = useRef<{ x: number; z: number } | null>(null);
  const yawRef = useRef(initialYaw);
  const phaseRef = useRef(0);
  const speedRef = useRef(0);
  const liftRef = useRef(0);

  // トレイル（軌跡）：標準品質のときだけ選手にも表示する（軽量品質はボールのみ＝Ball3D側で対応）
  const showTrail = quality === "standard";
  const trailSamples = useRef<{ x: number; z: number; t: number }[]>([]);
  const [trailPts, setTrailPts] = useState<[number, number, number][]>([]);
  const trailTick = useRef(0);

  useFrame((state, delta) => {
    const st = board.stateRef.current;
    const t = board.getTime();
    const p = actorPos(actor, t, st.moves, st.slots, st.ball, st.opponents, st.holder);
    const wx = boardXToWorldX(p.x, dims);
    const wz = boardYToWorldZ(p.y, dims);

    let dist = 0;
    let dx = 0;
    let dz = 0;
    if (prevWorld.current) {
      dx = wx - prevWorld.current.x;
      dz = wz - prevWorld.current.z;
      dist = Math.hypot(dx, dz);
    }
    // 場面切替・シークによる瞬間移動は「移動」として扱わない（誤って全力疾走ポーズが一瞬出るのを防ぐ）
    const teleport = dist > TELEPORT_GUARD_M;
    prevWorld.current = { x: wx, z: wz };
    const moving = !teleport && dist > 0.0025;
    const speedNow = !teleport && delta > 0 ? dist / delta : 0;
    speedRef.current += (speedNow - speedRef.current) * Math.min(1, delta * 8);

    if (moving) {
      yawRef.current = dampAngle(yawRef.current, Math.atan2(dx, dz), YAW_TURN_RATE_RAD_S, delta);
      phaseRef.current += dist * RUN_CYCLES_PER_METER * Math.PI * 2;
    }
    if (rootRef.current) {
      rootRef.current.position.set(wx, liftRef.current, wz);
      rootRef.current.rotation.y = yawRef.current;
    }

    // 速度に比例して待機ポーズ→走行ポーズへブレンド（停止中は待機ポーズのまま）
    const blend = Math.min(1, speedRef.current / RUN_BLEND_SPEED_MPS);
    let pose = lerpLimbPose(idle, computeRunPose(phaseRef.current), blend);
    // キック/ヘディングのアクションモーション（該当時間窓ならベースポーズへ重ねる）
    let lift = 0;
    liftRef.current = 0;
    for (const ev of events) {
      if (ev.kind === "kick") {
        const p = (t - (ev.t - KICK_PRE_S)) / KICK_DUR_S;
        if (p > 0 && p < 1) {
          const w = Math.sin(Math.PI * p);
          pose = lerpLimbPose(pose, computeKickPose(p), Math.max(0, w));
          yawRef.current = dampAngle(yawRef.current, ev.faceYaw, YAW_TURN_RATE_RAD_S * 2.5, delta);
          break;
        }
      } else {
        const p = (t - (ev.t - HEADER_PRE_S)) / HEADER_DUR_S;
        if (p > 0 && p < 1) {
          const hp = computeHeaderPose(p);
          const w = Math.sin(Math.PI * p);
          pose = lerpLimbPose(pose, hp.pose, Math.max(0, w));
          lift = hp.lift;
          liftRef.current = lift;
          yawRef.current = dampAngle(yawRef.current, ev.faceYaw, YAW_TURN_RATE_RAD_S * 2.5, delta);
          break;
        }
      }
    }
    if (leftThighRef.current) leftThighRef.current.rotation.z = pose.hipL;
    if (rightThighRef.current) rightThighRef.current.rotation.z = pose.hipR;
    if (leftShinRef.current) leftShinRef.current.rotation.x = pose.kneeL;
    if (rightShinRef.current) rightShinRef.current.rotation.x = pose.kneeR;
    if (leftArmRef.current) leftArmRef.current.rotation.z = pose.shoulderL;
    if (rightArmRef.current) rightArmRef.current.rotation.z = pose.shoulderR;
    if (leftForearmRef.current) leftForearmRef.current.rotation.x = pose.elbowL;
    if (rightForearmRef.current) rightForearmRef.current.rotation.x = pose.elbowR;
    if (torsoRef.current) torsoRef.current.rotation.x = pose.spineLean;

    if (showTrail) {
      const now = state.clock.elapsedTime;
      if (moving) trailSamples.current.push({ x: wx, z: wz, t: now });
      const cutoff = now - TRAIL_SECONDS;
      while (trailSamples.current.length && trailSamples.current[0].t < cutoff) trailSamples.current.shift();
      // トレイルの可視ジオメトリはReact stateで持つため、毎フレームではなく間引いて更新する
      // （1/4間引き＝60fps環境で約15Hz。位置・ポーズ本体は上のように毎フレームrefで動くため
      // 見た目の遅延は軌跡の描き足しのみに限られる）
      trailTick.current++;
      if (trailTick.current % 4 === 0) {
        setTrailPts(trailSamples.current.map((s) => [s.x, 0.02, s.z] as [number, number, number]));
      }
    }
  });

  return (
    <>
      <group ref={rootRef} position={[x, 0, z]} rotation-y={initialYaw}>
      {/* castShadowは胴・大腿・下腿のみに絞る（頭・腕・骨盤・足はOFF）。影を落とす意味が薄い
          末端部位を間引き、shadow mapへの描画コストを下げる（性能予算） */}
      <group name="pelvis" position={[0, hipY, 0]}>
        <mesh
          geometry={UNIT_BOX}
          scale={[R.pelvisW, R.pelvisH, R.pelvisD]}
          position={[0, R.pelvisH / 2, 0]}
          material={shortsMat}
          receiveShadow
        />
        <group ref={torsoRef} name="torso" position={[0, R.pelvisH, 0]} rotation-x={idle.spineLean}>
          <mesh
            geometry={UNIT_BOX}
            scale={[R.torsoW, R.torsoH, R.torsoD]}
            position={[0, R.torsoH / 2, 0]}
            material={torsoMaterials}
            castShadow
            receiveShadow
          />
          <group
            name="head"
            position={[0, R.torsoH + R.neckGap + R.headR, 0]}
            rotation={[idle.headTilt, idle.headYaw, 0]}
          >
            <mesh geometry={UNIT_ICO} scale={[R.headR, R.headR, R.headR]} material={skinMat} />
          </group>
          <group
            ref={leftArmRef}
            name="leftArm"
            position={[R.shoulderHalfW, R.torsoH * 0.92, 0]}
            rotation-z={idle.shoulderL}
          >
            <mesh
              geometry={UNIT_CYL}
              scale={[R.upperArmR, R.upperArmLen, R.upperArmR]}
              position={[0, -R.upperArmLen / 2, 0]}
              material={sleeveMat}
            />
            <group ref={leftForearmRef} name="leftForearm" position={[0, -R.upperArmLen, 0]} rotation-x={idle.elbowL}>
              <mesh
                geometry={UNIT_CYL}
                scale={[R.forearmR, R.forearmLen, R.forearmR]}
                position={[0, -R.forearmLen / 2, 0]}
                material={skinMat}
              />
            </group>
          </group>
          <group
            ref={rightArmRef}
            name="rightArm"
            position={[-R.shoulderHalfW, R.torsoH * 0.92, 0]}
            rotation-z={idle.shoulderR}
          >
            <mesh
              geometry={UNIT_CYL}
              scale={[R.upperArmR, R.upperArmLen, R.upperArmR]}
              position={[0, -R.upperArmLen / 2, 0]}
              material={sleeveMat}
            />
            <group ref={rightForearmRef} name="rightForearm" position={[0, -R.upperArmLen, 0]} rotation-x={idle.elbowR}>
              <mesh
                geometry={UNIT_CYL}
                scale={[R.forearmR, R.forearmLen, R.forearmR]}
                position={[0, -R.forearmLen / 2, 0]}
                material={skinMat}
              />
            </group>
          </group>
        </group>
        <group ref={leftThighRef} name="leftThigh" position={[R.hipHalfW, 0, 0]} rotation-z={idle.hipL}>
          <mesh
            geometry={UNIT_CYL}
            scale={[R.thighR, R.thighLen, R.thighR]}
            position={[0, -R.thighLen / 2, 0]}
            material={skinMat}
            castShadow
            receiveShadow
          />
          <group ref={leftShinRef} name="leftShin" position={[0, -R.thighLen, 0]} rotation-x={idle.kneeL}>
            <mesh
              geometry={UNIT_CYL}
              scale={[R.shinR, R.shinLen, R.shinR]}
              position={[0, -R.shinLen / 2, 0]}
              material={socksMat}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={UNIT_ICO}
              scale={[R.footR, R.footR * 0.7, R.footR * 1.3]}
              position={[0, -R.shinLen - R.footR * 0.35, R.footR * 0.4]}
              material={bootMat}
            />
          </group>
        </group>
        <group ref={rightThighRef} name="rightThigh" position={[-R.hipHalfW, 0, 0]} rotation-z={idle.hipR}>
          <mesh
            geometry={UNIT_CYL}
            scale={[R.thighR, R.thighLen, R.thighR]}
            position={[0, -R.thighLen / 2, 0]}
            material={skinMat}
            castShadow
            receiveShadow
          />
          <group ref={rightShinRef} name="rightShin" position={[0, -R.thighLen, 0]} rotation-x={idle.kneeR}>
            <mesh
              geometry={UNIT_CYL}
              scale={[R.shinR, R.shinLen, R.shinR]}
              position={[0, -R.shinLen / 2, 0]}
              material={socksMat}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={UNIT_ICO}
              scale={[R.footR, R.footR * 0.7, R.footR * 1.3]}
              position={[0, -R.shinLen - R.footR * 0.35, R.footR * 0.4]}
              material={bootMat}
            />
          </group>
        </group>
      </group>
      </group>
      {showTrail && trailPts.length >= 2 && (
        <Line points={trailPts} color={jersey} lineWidth={0.035} worldUnits transparent opacity={0.3} />
      )}
    </>
  );
}

/** サッカーボール風の白地+黒パッチのテクスチャ（1枚生成してキャッシュ） */
let ballTextureCache: THREE.CanvasTexture | null = null;
function getBallTexture(): THREE.CanvasTexture {
  if (ballTextureCache) return ballTextureCache;
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f6f7f9";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#20242b";
    const spots: [number, number, number][] = [
      [14, 18, 7], [46, 12, 6], [78, 20, 7], [110, 14, 6],
      [30, 40, 7], [62, 44, 6], [94, 42, 7], [8, 50, 5], [120, 48, 5],
    ];
    for (const [x, y, r] of spots) {
      ctx.beginPath();
      // 五角形風パッチ
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  ballTextureCache = tex;
  return tex;
}

/**
 * ボール本体。position（弾道の高さ込み）・転がり回転・トレイルをuseFrame内で毎フレーム計算する。
 * 水平位置(x/z)はPlayerFigureと同じくactorPos("ball",...)を再利用して2D再生と一致させ、
 * 高さだけをlib/setPiece3d.tsのtrajectoryHeightM（パス/シュートmoveのtrajectoryフィールドから
 * 決まるground/driven/lofted）で追加する。トレイルは品質に関わらず常に表示する
 * （仕様「軽量時はボールのみ」＝ボールは軽量品質でも表示対象）。
 */
function Ball3D({ dims }: { dims: PitchDims }) {
  const board = useBoard();
  const ref = useRef<THREE.Mesh | null>(null);
  const prevWorld = useRef<{ x: number; y: number; z: number } | null>(null);
  const rollAxis = useRef(new THREE.Vector3(1, 0, 0));
  const trailSamples = useRef<{ x: number; y: number; z: number; t: number }[]>([]);
  const [trailPts, setTrailPts] = useState<[number, number, number][]>([]);
  const trailTick = useRef(0);

  useFrame((state, delta) => {
    const st = board.stateRef.current;
    const t = board.getTime();
    const p = actorPos("ball", t, st.moves, st.slots, st.ball, st.opponents, st.holder);
    const wx = boardXToWorldX(p.x, dims);
    const wz = boardYToWorldZ(p.y, dims);

    const active = findActiveMove("ball", st.moves, t);
    let extraH = 0;
    if (active && (moveKind(active.move) === "pass" || moveKind(active.move) === "shot")) {
      const distM = worldPathLengthM(active.move.path, dims);
      extraH = trajectoryHeightM(moveTrajectory(active.move), active.progress, distM);
    }
    const wy = 0.11 + extraH;

    let dist = 0;
    let dx = 0;
    let dz = 0;
    if (prevWorld.current) {
      dx = wx - prevWorld.current.x;
      dz = wz - prevWorld.current.z;
      dist = Math.hypot(dx, dz);
    }
    const teleport = dist > TELEPORT_GUARD_M;
    prevWorld.current = { x: wx, y: wy, z: wz };
    const moving = !teleport && dist > 0.0015;

    if (ref.current) {
      ref.current.position.set(wx, wy, wz);
      // 転がり回転：ほぼ地面（弾道の高さがごく小さい）を移動している間だけ、進行方向に垂直な
      // 水平軸まわりへ移動距離ぶん回す（簡易表現。空中弾道中は回さない）
      if (moving && extraH < 0.05) {
        rollAxis.current.set(dz, 0, -dx).normalize();
        ref.current.rotateOnWorldAxis(rollAxis.current, dist / 0.11);
      }
    }

    const now = state.clock.elapsedTime;
    if (moving) trailSamples.current.push({ x: wx, y: wy, z: wz, t: now });
    const cutoff = now - TRAIL_SECONDS;
    while (trailSamples.current.length && trailSamples.current[0].t < cutoff) trailSamples.current.shift();
    trailTick.current++;
    if (trailTick.current % 4 === 0) {
      setTrailPts(trailSamples.current.map((s) => [s.x, Math.max(0.02, s.y), s.z] as [number, number, number]));
    }
  });

  return (
    <>
      <mesh ref={ref} castShadow>
        <sphereGeometry args={[0.11, 20, 16]} />
        <meshStandardMaterial map={getBallTexture()} roughness={0.4} />
      </mesh>
      {trailPts.length >= 2 && (
        <Line points={trailPts} color="#ffe27a" lineWidth={0.03} worldUnits transparent opacity={0.4} />
      )}
    </>
  );
}


/** 相手GKの推定: 相手にはrole情報が無いため、どちらかのゴールライン中央(50,0)/(50,100)へ
 * 十分近い(8%以内)相手トークンをGKユニフォーム(oppgk)にする（該当なしなら全員フィールド配色） */
function findOppGkIndex(opponents: { x: number; y: number }[]): number {
  let best = -1;
  let bestD = 8;
  opponents.forEach((o, i) => {
    const d = Math.min(Math.hypot(o.x - 50, o.y - 0), Math.hypot(o.x - 50, o.y - 100));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/* ============================================================
   GLB選手モデル（Quaternius Animated Men Pack "Man"、CC0。public/models/player.glb）。
   標準品質のときに使用し、軽量品質・読み込み失敗時は従来のプロシージャル人型へ
   フォールバックする。マテリアル(Shirt/Pants/Details/Skin)をチームキットへ差し替え、
   Idle/Runクリップを速度でクロスフェード、ヘディングはJumpクリップ、キックは
   ボーン(UpperLeg.R等)のポスト・ミキサー上書きで表現する。
   ============================================================ */
const MODEL_URL = "models/player.glb"; // 相対パス＝GitHub Pagesのサブパス配信でも解決できる
/** モデルの正面補正。Blender系エクスポートの人型はthree.jsでは背面を向くことが多い */
const MODEL_YAW_OFFSET = Math.PI;

function findClip(anims: THREE.AnimationClip[], suffix: string): THREE.AnimationClip | null {
  return anims.find((a) => a.name.endsWith(suffix)) ?? null;
}

const NUMBER_PLATE_GEOM = new THREE.PlaneGeometry(0.26, 0.34);

function GLBPlayer({
  gltf,
  actor,
  x,
  z,
  jersey,
  variant,
  label,
  seed,
  facing,
  dims,
  events,
}: {
  gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] };
  actor: Actor;
  x: number;
  z: number;
  jersey: string;
  variant: KitVariant;
  label: string;
  seed: number;
  facing: 1 | -1;
  dims: PitchDims;
  events: ActionEvent[];
}) {
  const board = useBoard();
  const kit = useMemo(() => getKitColors(jersey, variant), [jersey, variant]);
  const { clone, mixer, actions, bones, scale } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    // スキンメッシュはBox3が骨姿勢を反映せず身長を誤測するため、骨(Head/Foot)の
    // ワールド座標差から実身長を測ってスケールを決める
    clone.updateMatrixWorld(true);
    const headB = clone.getObjectByName("Head_end") ?? clone.getObjectByName("Head");
    const footB = clone.getObjectByName("Foot.L") ?? clone.getObjectByName("Foot.R");
    let h = 1.87; // フォールバック(Quaternius Man の実測既定)
    if (headB && footB) {
      const hp = new THREE.Vector3();
      const fp = new THREE.Vector3();
      headB.getWorldPosition(hp);
      footB.getWorldPosition(fp);
      const measured = hp.y - fp.y + 0.12; // 頭頂までのマージン
      if (measured > 0.5 && Number.isFinite(measured)) h = measured;
    }
    const scale = PLAYER_HEIGHT_M / h;
    const skinHex = SKIN_TONES[Math.abs(Math.round(seed)) % 2];
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as THREE.Mesh).isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // スキンメッシュはバウンディングが骨姿勢とズレて誤カリングされやすい
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const replaced = mats.map((mat) => {
        const name = (mat as THREE.Material).name;
        if (name === "Shirt") return getCachedMaterial(kit.jersey);
        if (name === "Pants") return getCachedMaterial(kit.shorts);
        if (name === "Details") return getCachedMaterial("#e8eaee");
        if (name === "Skin") return getCachedMaterial(skinHex);
        return mat;
      });
      m.material = Array.isArray(m.material) ? replaced : replaced[0];
    });
    const mixer = new THREE.AnimationMixer(clone);
    const idleClip = findClip(gltf.animations, "Man_Idle");
    const runClip = findClip(gltf.animations, "Man_Run");
    const jumpClip = findClip(gltf.animations, "Man_Jump");
    const actions = {
      idle: idleClip ? mixer.clipAction(idleClip) : null,
      run: runClip ? mixer.clipAction(runClip) : null,
      jump: jumpClip ? mixer.clipAction(jumpClip) : null,
    };
    if (actions.idle) {
      actions.idle.play();
      // 個体ごとに位相をずらし、全員が同じ呼吸で揺れる不自然さを避ける
      actions.idle.time = seededOffset(seed) * (idleClip?.duration ?? 1);
    }
    if (actions.run) {
      actions.run.play();
      actions.run.setEffectiveWeight(0);
    }
    if (actions.jump) {
      actions.jump.setLoop(THREE.LoopOnce, 1);
      actions.jump.clampWhenFinished = false;
    }
    const bones = {
      thighR: clone.getObjectByName("UpperLeg.R") ?? null,
      shinR: clone.getObjectByName("LowerLeg.R") ?? null,
      armL: clone.getObjectByName("UpperArm.L") ?? null,
      armR: clone.getObjectByName("UpperArm.R") ?? null,
      abdomen: clone.getObjectByName("Abdomen") ?? null,
    };
    return { clone, mixer, actions, bones, scale };
  }, [gltf, kit, seed]);
  useEffect(() => {
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clone);
    };
  }, [mixer, clone]);

  const rootRef = useRef<THREE.Group | null>(null);
  const prevWorld = useRef<{ x: number; z: number } | null>(null);
  const yawRef = useRef(facing === -1 ? Math.PI : 0);
  const speedRef = useRef(0);
  const lastJumpEv = useRef<number | null>(null);

  useFrame((_, delta) => {
    const st = board.stateRef.current;
    const t = board.getTime();
    const p = actorPos(actor, t, st.moves, st.slots, st.ball, st.opponents, st.holder);
    const wx = boardXToWorldX(p.x, dims);
    const wz = boardYToWorldZ(p.y, dims);
    let dist = 0;
    let dx = 0;
    let dz = 0;
    if (prevWorld.current) {
      dx = wx - prevWorld.current.x;
      dz = wz - prevWorld.current.z;
      dist = Math.hypot(dx, dz);
    }
    const teleport = dist > TELEPORT_GUARD_M;
    prevWorld.current = { x: wx, z: wz };
    const moving = !teleport && dist > 0.0025;
    const speedNow = !teleport && delta > 0 ? dist / delta : 0;
    speedRef.current += (speedNow - speedRef.current) * Math.min(1, delta * 8);
    if (moving) {
      yawRef.current = dampAngle(yawRef.current, Math.atan2(dx, dz), YAW_TURN_RATE_RAD_S, delta);
    }

    // アクション（キック/ヘディング）
    let kicking = false;
    let kickP = 0;
    for (const ev of events) {
      if (ev.kind === "kick") {
        const kp = (t - (ev.t - KICK_PRE_S)) / KICK_DUR_S;
        if (kp > 0 && kp < 1) {
          kicking = true;
          kickP = kp;
          yawRef.current = dampAngle(yawRef.current, ev.faceYaw, YAW_TURN_RATE_RAD_S * 2.5, delta);
          break;
        }
      } else {
        const hp = (t - (ev.t - HEADER_PRE_S)) / HEADER_DUR_S;
        if (hp > 0 && hp < 1) {
          if (actions.jump && lastJumpEv.current !== ev.t) {
            lastJumpEv.current = ev.t;
            actions.jump.reset().play();
          }
          yawRef.current = dampAngle(yawRef.current, ev.faceYaw, YAW_TURN_RATE_RAD_S * 2.5, delta);
          break;
        }
      }
    }

    if (rootRef.current) {
      rootRef.current.position.set(wx, 0, wz);
      rootRef.current.rotation.y = yawRef.current;
    }

    // ロコモーション: Idle⇔Run を速度でクロスフェードし、Runの再生速度も実速度へ追従
    const blend = Math.min(1, speedRef.current / RUN_BLEND_SPEED_MPS);
    actions.run?.setEffectiveWeight(blend);
    actions.idle?.setEffectiveWeight(1 - blend * 0.85);
    if (actions.run) actions.run.timeScale = 0.7 + Math.min(2.2, speedRef.current * 0.28);
    mixer.update(delta);

    // キック: ミキサー適用後にボーンを上書き（クリップが無いため手続き駆動）
    if (kicking) {
      const swing =
        kickP < 0.4 ? -Math.sin((kickP / 0.4) * Math.PI * 0.5) : Math.sin(((kickP - 0.4) / 0.6) * Math.PI);
      const w = Math.sin(Math.PI * kickP);
      if (bones.thighR) bones.thighR.rotation.x += -swing * 1.1 * w;
      if (bones.shinR) bones.shinR.rotation.x += Math.max(0, -swing) * 0.9 * w;
      if (bones.armL) bones.armL.rotation.x += swing * 0.5 * w;
      if (bones.armR) bones.armR.rotation.x += -swing * 0.35 * w;
      if (bones.abdomen) bones.abdomen.rotation.x += 0.14 * w;
    }
  });

  const numberMat = getNumberMaterial(kit.jersey, label);
  return (
    <group ref={rootRef} position={[x, 0, z]} rotation-y={facing === -1 ? Math.PI : 0}>
      <group rotation-y={MODEL_YAW_OFFSET} scale={[scale, scale, scale]}>
        <primitive object={clone} />
      </group>
      {/* 背中とやや小さめの胸の番号プレート（シャツのUVを持たないため薄板で表現） */}
      <mesh geometry={NUMBER_PLATE_GEOM} material={numberMat} position={[0, 1.02, -0.145]} rotation-y={Math.PI} />
      <mesh
        geometry={NUMBER_PLATE_GEOM}
        material={numberMat}
        position={[0, 1.0, 0.145]}
        scale={[0.62, 0.62, 1]}
      />
    </group>
  );
}

/** 0..1の決定的オフセット（GLBPlayerのIdle位相ずらし用） */
function seededOffset(seed: number): number {
  const x = Math.sin(seed * 91.17) * 43758.5453;
  return x - Math.floor(x);
}

function ModelPlayers({
  quality,
  dims,
  actionMap,
}: {
  quality: Sp3dQuality;
  dims: PitchDims;
  actionMap: Map<string, ActionEvent[]>;
}) {
  const board = useBoard();
  const { slots, players } = board.state;
  const opponents = board.state.opponents ?? [];
  const gltf = useGLTF(MODEL_URL) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] };
  const oppGkIndex = findOppGkIndex(opponents);
  void quality;
  return (
    <group>
      {slots.map((s, i) => {
        if (s.pid == null) return null;
        const player = players.find((pp) => pp.id === s.pid) ?? null;
        return (
          <GLBPlayer
            key={`p${i}`}
            gltf={gltf}
            actor={i}
            x={boardXToWorldX(s.x, dims)}
            z={boardYToWorldZ(s.y, dims)}
            jersey={OWN_KIT_JERSEY}
            variant={s.role === "GK" ? "gk" : "own"}
            label={String(player?.number ?? "–")}
            seed={i + 1}
            facing={1}
            dims={dims}
            events={actionEventsFor(actionMap, i)}
          />
        );
      })}
      {opponents.map((o, i) => (
        <GLBPlayer
          key={`o${i}`}
          gltf={gltf}
          actor={`opp${i}` as Actor}
          x={boardXToWorldX(o.x, dims)}
          z={boardYToWorldZ(o.y, dims)}
          jersey={actorColor(`opp${i}` as Actor, slots)}
          variant={i === oppGkIndex ? "oppgk" : "opp"}
          label={o.label}
          seed={1000 + i}
          facing={-1}
          dims={dims}
          events={actionEventsFor(actionMap, `opp${i}` as Actor)}
        />
      ))}
    </group>
  );
}

/** GLB読み込み失敗時にプロシージャル人型へ落とすエラーバウンダリ */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ProceduralPlayers({
  quality,
  dims,
  actionMap,
}: {
  quality: Sp3dQuality;
  dims: PitchDims;
  actionMap: Map<string, ActionEvent[]>;
}) {
  const board = useBoard();
  const { slots, players } = board.state;
  const opponents = board.state.opponents ?? [];
  const oppGkIndex = findOppGkIndex(opponents);
  return (
    <group>
      {slots.map((s, i) => {
        if (s.pid == null) return null;
        const player = players.find((p) => p.id === s.pid) ?? null;
        return (
          <PlayerFigure
            key={`p${i}`}
            actor={i}
            x={boardXToWorldX(s.x, dims)}
            z={boardYToWorldZ(s.y, dims)}
            jersey={OWN_KIT_JERSEY}
            variant={s.role === "GK" ? "gk" : "own"}
            label={String(player?.number ?? "–")}
            seed={i + 1}
            facing={1}
            quality={quality}
            dims={dims}
            events={actionEventsFor(actionMap, i)}
          />
        );
      })}
      {opponents.map((o, i) => (
        <PlayerFigure
          key={`o${i}`}
          actor={`opp${i}` as Actor}
          x={boardXToWorldX(o.x, dims)}
          z={boardYToWorldZ(o.y, dims)}
          jersey={actorColor(`opp${i}` as Actor, slots)}
          variant={i === oppGkIndex ? "oppgk" : "opp"}
          label={o.label}
          seed={1000 + i}
          facing={-1}
          quality={quality}
          dims={dims}
          events={actionEventsFor(actionMap, `opp${i}` as Actor)}
        />
      ))}
    </group>
  );
}

function TokensLayer({ quality, dims }: { quality: Sp3dQuality; dims: PitchDims }) {
  const board = useBoard();
  const { slots } = board.state;
  const opponents = board.state.opponents ?? [];
  const moves = board.state.moves;
  const ball = board.state.ball;
  const holder = board.state.holder;
  // キック/ヘディングのイベント表。moves/配置が変わったときだけ再計算する
  const actionMap = useMemo(
    () => computeActionEvents(moves, slots, ball, opponents, holder, dims),
    [moves, slots, ball, opponents, holder, dims]
  );
  const proc = <ProceduralPlayers quality={quality} dims={dims} actionMap={actionMap} />;
  return (
    <group>
      {quality === "standard" ? (
        // 標準=GLBモデル（読み込み中・失敗時はプロシージャル人型で表示を継続）
        <ModelBoundary fallback={proc}>
          <Suspense fallback={proc}>
            <ModelPlayers quality={quality} dims={dims} actionMap={actionMap} />
          </Suspense>
        </ModelBoundary>
      ) : (
        proc
      )}
      <Ball3D dims={dims} />
    </group>
  );
}

/* ============================================================
   ダブルクリックで注視点を移動する透明な地面プレーン。カメラ位置自体は動かさず、
   OrbitControlsのtargetだけをイージングで移動する（reduced-motionは即時ジャンプ）。
   ============================================================ */

const CLICK_PLANE_GEOM = new THREE.PlaneGeometry(400, 400);
const CLICK_PLANE_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function GazeClickPlane({
  controlsRef,
  reducedMotion,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  reducedMotion: boolean;
}) {
  const { invalidate } = useThree();
  const from = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const t = useRef(1);

  useFrame((_, delta) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + delta / 0.45);
    const e = 1 - Math.pow(1 - t.current, 3);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerpVectors(from.current, to.current, e);
      controls.update();
    }
    invalidate();
  });

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const controls = controlsRef.current;
    if (!controls) return;
    from.current.copy(controls.target);
    to.current.set(e.point.x, Math.max(0.3, e.point.y + 0.3), e.point.z);
    if (reducedMotion) {
      controls.target.copy(to.current);
      controls.update();
      t.current = 1;
    } else {
      t.current = 0;
    }
    invalidate();
  };

  return (
    <mesh
      geometry={CLICK_PLANE_GEOM}
      material={CLICK_PLANE_MAT}
      position={[0, 0.001, 0]}
      rotation-x={-Math.PI / 2}
      onDoubleClick={handleDoubleClick}
    />
  );
}

/* ============================================================
   カメラ制御（プリセット間をイージング移動。reduced-motionは即時ジャンプ）。
   replayプリセットは遷移完了後、reduced-motionでない間だけ注視点を中心にゆっくり自動オービットする
   （reduced-motionでは仕様どおり無効＝この分岐に入らず開始姿勢のまま静止する）。
   frameloop="demand"下では毎フレームinvalidate()を呼び続けない限り再描画が止まるため、
   遷移中・オービット中は明示的にinvalidate()する（Playback3Dが再生時にも同じ考え方で
   invalidate()を呼び続ける想定＝「静止時demand、動いている間だけ連続描画」の共通パターン）。
   ============================================================ */

function CameraController({
  preset,
  reducedMotion,
  controlsRef,
  dims,
}: {
  preset: CameraPresetId;
  reducedMotion: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  dims: PitchDims;
}) {
  const board = useBoard();
  const { camera, invalidate } = useThree();
  // 遷移開始時点の最新state("s"を読むためだけ。依存配列には入れず、preset変更時にのみ読む)
  const stateRef = useRef(board.state);
  stateRef.current = board.state;

  const fromPos = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const t = useRef(1);
  const mounted = useRef(false);

  // replay用: 注視点からの水平距離・高さ・現在角度（プリセット切替のたびに再計算し、
  // 以後はuseFrameが角度だけ進める）
  const replayRadius = useRef(0);
  const replayHeight = useRef(0);
  const replayAngle = useRef(0);

  useEffect(() => {
    const pose = computeCameraPreset(preset, stateRef.current, dims);
    const controls = controlsRef.current;
    const dx = pose.position[0] - pose.target[0];
    const dz = pose.position[2] - pose.target[2];
    replayRadius.current = Math.hypot(dx, dz);
    replayHeight.current = pose.position[1] - pose.target[1];
    replayAngle.current = Math.atan2(dz, dx);
    if (!mounted.current) {
      // 初回マウント：Canvasの初期カメラ位置と揃えるだけなので遷移させない
      mounted.current = true;
      camera.position.set(...pose.position);
      controls?.target.set(...pose.target);
      controls?.update();
      t.current = 1;
      invalidate();
      return;
    }
    if (reducedMotion) {
      camera.position.set(...pose.position);
      controls?.target.set(...pose.target);
      controls?.update();
      t.current = 1;
      invalidate();
      return;
    }
    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls?.target ?? fromPos.current);
    toPos.current.set(...pose.position);
    toTarget.current.set(...pose.target);
    t.current = 0;
    invalidate();
    // preset切替の瞬間・dims(format)切替の瞬間のみ再計算する（board.state の他の変化には
    // 追従させない設計。dimsはformatが変わらない限り同一オブジェクト参照のまま＝
    // getPitchDimsが固定テーブルを返すため、通常のboard.state更新では再発火しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, reducedMotion, camera, controlsRef, invalidate, dims]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (t.current < 1) {
      t.current = Math.min(1, t.current + delta / 0.7);
      const e = 1 - Math.pow(1 - t.current, 3);
      camera.position.lerpVectors(fromPos.current, toPos.current, e);
      if (controls) {
        controls.target.lerpVectors(fromTarget.current, toTarget.current, e);
        controls.update();
      }
      invalidate();
      return;
    }
    if (preset === "replay" && !reducedMotion && controls) {
      replayAngle.current += delta * 0.12;
      const cx = controls.target.x;
      const cy = controls.target.y;
      const cz = controls.target.z;
      camera.position.set(
        cx + replayRadius.current * Math.cos(replayAngle.current),
        cy + replayHeight.current,
        cz + replayRadius.current * Math.sin(replayAngle.current)
      );
      controls.update();
      invalidate();
    }
  });

  return null;
}

/* ============================================================
   再生駆動（Playback3D）: Canvas外の軽量rAFポーリングで board.getTime() の変化を検知し、
   変化があったときだけ useThree().invalidate() を呼ぶための橋渡し。frameloop="demand"のまま
   （Canvasのprop自体は変更しない）、CameraController/GazeClickPlaneと同じ「動いている間だけ
   invalidate()し続ける」流儀を再生駆動にも適用する＝再生中は毎フレームtが変わるので実質
   連続描画になり、停止中（tが変化しない間）は本当に無描画のまま（性能予算どおり）。
   BoardProvider.onTickは2DのAnimationStudioが専有する単一スロットのため
   （本タスクでBoardProvider.tsxは編集不可）使わず、getTime()の値そのものをポーリングする。
   ============================================================ */
function ThreeBridge({ invalidateRef }: { invalidateRef: React.RefObject<(() => void) | null> }) {
  const { invalidate } = useThree();
  useEffect(() => {
    invalidateRef.current = invalidate;
    return () => {
      invalidateRef.current = null;
    };
  }, [invalidate, invalidateRef]);
  return null;
}

/* ============================================================
   3Dバーの再生コントロール（再生/停止・場面送り）。CameraBar(.sp3dbar)と同じく
   components/SetPieceBoard.tsx（このタスクでは編集不可）が親を描画しているため直接は
   差し込めず、QualityToggleと同じ「.sp3dpitch内に浮かせるオーバーレイ」として実装する。
   board（screen==="setpiece"のときspStateを指す共有の盤面）のactiveStep/isPlaying/
   playStep等をそのまま使うため、2DのAnimationStudioと状態を共有する
   （どちらから操作しても両方の表示に反映される）。
   reduced-motion時は「コマ送り」動作：連続再生の代わりに場面の最終状態へ即時ジャンプする
   （2Dの再生ボタン自体はBoardProvider.tsx側の実装のため対象外。ここは自前の3Dローカル
   ボタンにのみ適用する）。
   ============================================================ */
function PlaybackBar({
  reducedMotion,
  follow,
  onToggleFollow,
}: {
  reducedMotion: boolean;
  follow: boolean;
  onToggleFollow: () => void;
}) {
  const board = useBoard();
  const moves = board.state.moves;
  const steps = board.stepCount;
  const step = board.activeStep;
  const total = animTotal(moves, steps);

  // スクラブ位置・時刻表示は毎フレーム変わるためReact stateにせず、rAFでDOMへ直接書く
  // （このバーは3D表示中のみマウント＝ポーリングも3D中のみ。値が変わらない間は書き込まない）
  const scrubRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      const t = board.getTime();
      if (t !== last) {
        last = t;
        if (scrubRef.current) scrubRef.current.value = String(t);
        if (timeRef.current) timeRef.current.textContent = `${t.toFixed(1)}s / ${total.toFixed(1)}s`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const jumpToStepEnd = (s: number) => {
    const t0 = stepStartTime(moves, s);
    const d = stepDur(moves, s);
    board.setActiveStep(s);
    board.seek(t0 + d);
  };
  // FC26のリプレイ同様「全体をそのまま再生/一時停止」を主ボタンにする
  // （場面単位の頭出しは‹ ›が担う）。reduced-motionはコマ送り＝最終状態へ即時ジャンプ
  const playAll = () => {
    if (board.isPlaying) {
      board.stopPlay();
      return;
    }
    if (reducedMotion) {
      jumpToStepEnd(steps - 1);
      return;
    }
    board.startPlay();
  };
  const goStep = (dir: 1 | -1) => {
    const next = Math.min(steps - 1, Math.max(0, step + dir));
    if (next === step) return;
    board.stopPlay();
    if (reducedMotion) {
      jumpToStepEnd(next);
    } else {
      board.setActiveStep(next);
      board.seek(stepStartTime(moves, next));
    }
  };
  const onScrub = (v: number) => {
    board.seek(v);
    board.setActiveStep(stepAtTime(moves, v, steps));
  };

  const SPEEDS: [number, string][] = [
    [0.25, "0.25x"],
    [0.5, "0.5x"],
    [1, "1x"],
  ];

  return (
    <div className="sp3dplay" role="group" aria-label="3D再生コントロール">
      <button
        type="button"
        className="sp3dpbtn"
        disabled={step <= 0}
        title="前の場面"
        onClick={() => goStep(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className={`sp3dpbtn main${board.isPlaying ? " on" : ""}`}
        title={board.isPlaying ? "一時停止" : "最初から通しで再生"}
        onClick={playAll}
      >
        {board.isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button
        type="button"
        className="sp3dpbtn"
        disabled={step >= steps - 1}
        title="次の場面"
        onClick={() => goStep(1)}
      >
        ›
      </button>
      <input
        ref={scrubRef}
        className="sp3dscrub"
        type="range"
        min={0}
        max={Math.max(0.01, total)}
        step={0.02}
        defaultValue={0}
        aria-label="再生位置"
        onInput={(e) => onScrub(parseFloat((e.target as HTMLInputElement).value))}
      />
      <span className="sp3dtime" ref={timeRef}>
        0.0s / {total.toFixed(1)}s
      </span>
      <span className="sp3dspeed" role="group" aria-label="再生速度">
        {SPEEDS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`sp3dpbtn spd${board.speed === v ? " on" : ""}`}
            title={`再生速度 ${label}`}
            onClick={() => board.setSpeed(v)}
          >
            {label}
          </button>
        ))}
      </span>
      <button
        type="button"
        className={`sp3dpbtn follow${follow ? " on" : ""}`}
        title="カメラがボールを追いかける（FC26のリプレイ追従風）"
        onClick={onToggleFollow}
      >
        ボール追従
      </button>
      <span className="sp3dpstep">
        場面{step + 1}/{steps}
      </span>
    </div>
  );
}

/** ボール追従カメラ（FC26リプレイの追従モード風）。注視点をボールへ滑らかに寄せ、
 * カメラ位置も同じ差分だけ平行移動して「見ている角度・距離」を保ったまま追いかける。
 * OrbitControlsはそのまま使えるため、追従中でもドラッグで角度・ズームを変えられる。 */
function FollowBallController({
  on,
  controlsRef,
  dims,
}: {
  on: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  dims: PitchDims;
}) {
  const board = useBoard();
  const { camera, invalidate } = useThree();
  useFrame((_, delta) => {
    if (!on) return;
    const controls = controlsRef.current;
    if (!controls) return;
    const st = board.stateRef.current;
    const t = board.getTime();
    const p = actorPos("ball", t, st.moves, st.slots, st.ball, st.opponents, st.holder);
    const wx = boardXToWorldX(p.x, dims);
    const wz = boardYToWorldZ(p.y, dims);
    const k = Math.min(1, delta * 6);
    const dx = (wx - controls.target.x) * k;
    const dz = (wz - controls.target.z) * k;
    if (Math.abs(wx - controls.target.x) < 0.005 && Math.abs(wz - controls.target.z) < 0.005) return;
    controls.target.x += dx;
    controls.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    controls.update();
    invalidate();
  });
  return null;
}

/* ============================================================
   本体
   ============================================================ */

export default function SetPiece3D({ preset }: { preset: CameraPresetId }) {
  const board = useBoard();
  const reducedMotion = usePrefersReducedMotion();
  const [quality, setQuality] = useSp3dQuality();
  // ボール追従カメラ(FC26リプレイ風)のON/OFF。PlaybackBar(トグルUI)とCanvas内の
  // FollowBallControllerで共有する
  const [follow, setFollow] = useState(false);
  // 何人制シナリオかに応じたピッチ寸法一式。getPitchDimsは固定テーブル参照を返すため
  // （format 8|11の2値しか無い）、format不変の間はレンダーをまたいで同一オブジェクト参照になる
  // ＝下流のuseMemo([dims])はformat切替時だけ再計算される。
  const dims = getPitchDims(board.state.setPiece?.format ?? 8);
  // 初回マウント時のカメラ位置のみに使う（以後はCameraControllerが管理）
  const [initialPose] = useState(() => computeCameraPreset(preset, board.state, dims));
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // 再生駆動：Canvas外の軽量rAFで board.getTime() をポーリングし、変化した瞬間だけ
  // invalidate()する（ThreeBridge参照）。tを読むだけで比較のみ・GPU描画は伴わないため
  // 静止中（tが変化しない間）のコストは実質ゼロ。マウント中のboardクロージャを使い続けても
  // getTime()は常に最新のplay.current.t（stateRefと同様のref経由）を返すため安全
  // （BoardProviderのapplyPlayhead/tick等と同じ「stateRef.current」方式）。
  const invalidateRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let raf = 0;
    let lastT = -1;
    const poll = () => {
      const t = board.getTime();
      if (t !== lastT) {
        lastT = t;
        invalidateRef.current?.();
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pitchwrap sp3dwrap">
      <div className="pitch sp3dpitch">
        <Canvas
          // three r185で shadows="soft" 文字列指定が非推奨のため、同じ挙動(PCFSoftShadowMap)の
          // 真偽値指定へ変更（@react-three/fiberは shadows={true} も文字列"soft"と同じ
          // gl.shadowMap.type=PCFSoftShadowMapになる。挙動は変わらない）。軽量品質は影自体を切る。
          shadows={quality === "standard"}
          dpr={quality === "light" ? 1 : [1, 1.5]}
          // 静止時は再描画しない（性能予算）。カメラ操作(OrbitControls)は変更イベントのたびに
          // 自前でinvalidate()するため引き続き滑らかに動く。プリセット遷移・ダブルクリック注視点
          // 移動・replayオービットはCameraController/GazeClickPlaneが動いている間だけ
          // invalidate()し続ける。
          frameloop="demand"
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          camera={{ fov: 50, near: 0.1, far: 300, position: initialPose.position }}
        >
          {/* デイゲーム風: 空(淡青)/地面(芝の照り返し)の半球ライト＋暖色寄りの平行光（太陽光） */}
          <hemisphereLight args={["#cfe3ff", "#3f7d4e", 0.75]} />
          <ambientLight intensity={0.18} color="#ffffff" />
          <directionalLight
            position={[18, 26, 14]}
            intensity={1.2}
            color="#fff3df"
            castShadow={quality === "standard"}
            shadow-mapSize={[1024, 1024]}
            shadow-radius={5}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
            shadow-camera-near={1}
            shadow-camera-far={80}
          />
          <ApronGround />
          <PitchGround quality={quality} dims={dims} />
          <PitchLines dims={dims} />
          <Goal end={1} dims={dims} />
          <Goal end={-1} dims={dims} />
          <AdBoardRing dims={dims} />
          {quality === "standard" && <StadiumStands dims={dims} />}
          <ShapesFloor dims={dims} />
          <MovesFloor dims={dims} />
          <TokensLayer quality={quality} dims={dims} />
          <GazeClickPlane controlsRef={controlsRef} reducedMotion={reducedMotion} />
          <FollowBallController on={follow} controlsRef={controlsRef} dims={dims} />
          <ThreeBridge invalidateRef={invalidateRef} />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan
            enableRotate
            enableZoom
            enableDamping
            dampingFactor={0.08}
            // 「あらゆる角度」: ほぼ真上(5°)からほぼ地表すれすれまで、距離2〜120mまで許容する
            minDistance={2}
            maxDistance={120}
            minPolarAngle={Math.PI / 36}
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
          <CameraController preset={preset} reducedMotion={reducedMotion} controlsRef={controlsRef} dims={dims} />
        </Canvas>
        <QualityToggle quality={quality} onChange={setQuality} />
        <PlaybackBar reducedMotion={reducedMotion} follow={follow} onToggleFollow={() => setFollow((v) => !v)} />
      </div>
    </div>
  );
}

/* ============================================================
   draw call・三角形数（11人制フルピッチ・自チーム11+相手11想定。ブラウザのWebGL統計での実測値）
   - 標準品質: draw call 836 / tri 14,630
   - 軽量品質: draw call 429 / tri 7,766（影OFF・観客席帯OFF・dpr1固定に加え、選手のcastShadow
     を胴・大腿・下腿のみに絞ったことでshadow pass側のdraw callも軽量側にとどまらず標準側でも
     削減されている）
   dpr上限1.5（軽量は1固定）・平行光1枚（shadowMapSize 1024）・frameloop="demand"
   （静止時は再描画自体しない）と合わせ、PC60fps/中位スマホ30fps以上の性能予算に収まる設計とした。
   ============================================================ */
