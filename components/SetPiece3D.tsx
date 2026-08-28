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
// CameraBar側が自動的にボタンを増やす仕組みに乗せ、逆に「3Dバーに品質トグル(高/中/軽)を追加」や
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
import { actorPos, animTotal, simplify, stepAtTime, stepDur, stepStartTime, straightenIfLine } from "@/lib/animation";
import type { Actor, BallTrajectory, Move, Point, Shape, TextShape, ZoneShape } from "@/lib/types";
import { moveKind, moveTrajectory } from "@/lib/types";
import { IconPause, IconPlay } from "./icons";
import {
  ACTIVE_SKY_PRESET,
  anisotropyForQuality,
  APRON_COLOR,
  BLOB_SHADOW_OPACITY_NO_REAL_SHADOW,
  BLOB_SHADOW_OPACITY_WITH_REAL_SHADOW,
  BLOB_SHADOW_RADIUS_M,
  BOOT_COLOR,
  boardToWorld,
  boardXToWorldX,
  boardYToWorldZ,
  buildMarkingsGeometryData,
  computeBlobShadow,
  computeCameraPreset,
  actionEventsFor,
  computeActionEvents,
  computeHeaderPose,
  computeIdlePose,
  computeKickPose,
  computeRunPose,
  GRASS_MARGIN_M,
  HAIR_TONES,
  HEADER_DUR_S,
  HEADER_PRE_S,
  KICK_DUR_S,
  KICK_PRE_S,
  dampAngle,
  findActiveMove,
  type ActionEvent,
  getKitColors,
  type KitColors,
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
  SKY_PRESETS,
  type Sp3dQuality,
  TELEPORT_GUARD_M,
  TRAIL_SECONDS,
  trajectoryHeightM,
  worldPathLengthM,
  YAW_TURN_RATE_RAD_S,
  type CameraPresetId,
  type PitchDims,
} from "@/lib/setPiece3d";
import { SkyFollow } from "./SetPiece3DEnv";
import { getGrassPBR, StadiumBowl } from "./SetPiece3DStadium";
import { AlfaStadium } from "./AlfaStadium";

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
   品質トグル（高/中/軽の3段）。localStorageに記憶し、観客Nearインスタンス・上層スタンド・
   外壁シェル・芝解像度・選手モデル(GLB/プロシージャル)・実シャドウ・dprを切り替える。
   ============================================================ */

const SP3D_QUALITY_KEY = "alfa_sp3d_quality";

/** タッチデバイス（pointer:coarse）または幅<1024pxの端末は「軽量(mobile)」を既定にする
 * （localStorageに保存済みの明示選択が無いとき限定で使う判定。TeamHub.tsx usePc() 等と
 * 同じ1024pxブレークポイントに合わせている）。それ以外（PC相当）は「高(high)」を既定にする。 */
function detectDefaultQuality(): Sp3dQuality {
  if (typeof window === "undefined") return "high";
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const isNarrow = !window.matchMedia("(min-width: 1024px)").matches;
  return isTouch || isNarrow ? "mobile" : "high";
}

function readStoredQuality(): Sp3dQuality {
  if (typeof window === "undefined") return "high";
  try {
    const raw = window.localStorage.getItem(SP3D_QUALITY_KEY);
    if (raw === "high" || raw === "medium" || raw === "mobile") return raw;
    // 旧2段階("standard"/"light")の保存値は新3段階へ移行する（high/mobileへの単純写像。
    // "medium"は新規追加の中間段のため旧値からは絶対に出てこない＝移行漏れの心配は無い）。
    // 移行後にsetQualityが呼ばれれば新値("high"/"medium"/"mobile")で上書き保存されるため、
    // この分岐は「旧値が残っている間だけ」通る一時的なものでよい。
    if (raw === "standard") return "high";
    if (raw === "light") return "mobile";
    // 未設定（初回訪問）のときだけデバイス判定で既定を決める。ユーザーが一度でも切り替えれば
    // 以後は明示的な値がstorageに残るため、この分岐には二度と入らない
    // （＝ユーザー切替は従来どおり記憶される）
    return detectDefaultQuality();
  } catch {
    return "high";
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

const QUALITY_LABEL: Record<Sp3dQuality, string> = { high: "高", medium: "中", mobile: "軽" };

function QualityToggle({
  quality,
  onChange,
}: {
  quality: Sp3dQuality;
  onChange: (q: Sp3dQuality) => void;
}) {
  return (
    <div className="sp3dquality" role="group" aria-label="3D表示品質">
      {(["high", "medium", "mobile"] as const).map((q) => (
        <button
          key={q}
          type="button"
          className={`sp3dqbtn${quality === q ? " on" : ""}`}
          onClick={() => onChange(q)}
        >
          {QUALITY_LABEL[q]}
        </button>
      ))}
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

/** リムライト（縁光）の色・強度・フレネル指数。ジャージ・肌のマテリアルにだけ、空色寄りの
 * 薄い加算フレネルを乗せて輪郭を浮かせる（逆光・横光でもシルエットが締まって見える）。
 * 強度は仕様レンジ(0.10-0.14)内の中央値を採用。全リム材で同一値＝onBeforeCompileの中身も
 * 完全に同じ文字列になるため、customProgramCacheKeyを1種類だけにしてプログラム共有できる。 */
const RIM_LIGHT_COLOR = "#9db8e6";
const RIM_LIGHT_STRENGTH = 0.12;
const RIM_LIGHT_POW = 2.5;
/** ↑を事前にリニアRGBのGLSLリテラルへ変換（uniform化せず定数埋め込みにして余計なuniform管理を
 * 増やさない＝値が全リム材で共通のため定数化して問題ない）。THREE.Colorのhex→linear変換は
 * MeshStandardMaterialのcolorプロパティと同じ変換なので見た目の色味が一致する。 */
const RIM_LIGHT_GLSL_COLOR = (() => {
  const c = new THREE.Color(RIM_LIGHT_COLOR);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
})();

/** ジャージ・肌のマテリアルへ軽いフレネル加算(リムライト)を仕込むonBeforeCompile。
 * vNormal/vViewPosition はMeshStandardMaterialの標準シェーダが既に用意しているvaryingを
 * そのまま使う（getPantsMaterialのonBeforeCompileと同じ「#include直後にコード挿入」方式）。
 * customProgramCacheKeyで通常マテリアル（リム無し）とのシェーダキャッシュ衝突を防ぐ。 */
function applyRimLight(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rimFresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), ${RIM_LIGHT_POW.toFixed(1)});
      outgoingLight += ${RIM_LIGHT_GLSL_COLOR} * rimFresnel * ${RIM_LIGHT_STRENGTH.toFixed(2)};
      #include <opaque_fragment>`
    );
  };
  m.customProgramCacheKey = () => "rimlight";
}

/** 選手の部位別roughness/metalness（仕様値）。GLB差し替え（GLBPlayer）・プロシージャル人型
 * （usePlayerMaterials）・結合ゾーンマテリアル（getPantsMaterialのショーツ/ソックス/肌/シューズ
 * ゾーン分け）の3箇所すべてがここを参照し、質感の基準を1箇所にまとめる。 */
const PART_MATERIAL = {
  jersey: { roughness: 0.82, metalness: 0.04 },
  shorts: { roughness: 0.8, metalness: 0.03 },
  socks: { roughness: 0.85, metalness: 0.03 },
  skin: { roughness: 0.55, metalness: 0.04 },
  boots: { roughness: 0.32, metalness: 0.2 },
} as const;

/** hex×roughness×metalness×rim(リムライト有無)でキャッシュするマテリアル取得。
 * 引数省略時は従来どおり(roughness 0.6/metalness 0.04/リム無し)のキーになるため、
 * 既存の呼び出し（apron・旗竿等）は挙動互換のまま。GLB差し替え・プロシージャル選手の
 * ジャージ/ショーツ/ソックス/肌/シューズは部位別のroughness/metalness・rim有無を指定して呼ぶ。 */
function getCachedMaterial(
  hex: string,
  roughness = 0.6,
  metalness = 0.04,
  rim = false
): THREE.MeshStandardMaterial {
  const key = `${hex}|${roughness}|${metalness}|${rim ? 1 : 0}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
    if (rim) applyRimLight(m);
    materialCache.set(key, m);
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

/** GLB選手の番号プレート（NUMBER_PLATE_GEOM、薄板メッシュ）専用のテクスチャ。getNumberTexture
 * （プロシージャル選手の胴体ボックス実面に使う・不透明のまま）と描画のベースは同じだが、
 * 近景で見たときの「貼り紙」感を減らすため(a)薄い布目ノイズ、(b)プレート縁の透明フェードを
 * 追加する。フェードはdestination-inで最後に合成するため、プロシージャル側の実面（フェードを
 * 掛けると裏側の空洞が透けて見えてしまう）には適用できず、薄板前提のこちらだけ別関数にしている。 */
const numberPlateTextureCache = new Map<string, THREE.CanvasTexture>();
function getNumberPlateTexture(jerseyHex: string, label: string): THREE.CanvasTexture {
  const key = `${jerseyHex}|${label}`;
  const hit = numberPlateTextureCache.get(key);
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
    // 布目ノイズ：1px単位の微小な明暗ドットを一様に散らす。テクスチャは(jerseyHex,label)キーで
    // 一度だけ生成してキャッシュするため、Math.randomでも再レンダーごとに柄がガタつく心配はない。
    ctx.fillStyle = hexLuma(jerseyHex) > 0.6 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
    for (let i = 0; i < 220; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
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
    // プレート縁を透明フェード：destination-inで中心から縁へアルファを落とす円形グラデを
    // 重ね、輪郭の直線的な「貼り紙」感を消す（縁の透明部分からは胴体本体のジャージ面が透けて見える）。
    ctx.globalCompositeOperation = "destination-in";
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const fade = ctx.createRadialGradient(cx, cy, maxR * 0.55, cx, cy, maxR * 0.98);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  numberPlateTextureCache.set(key, tex);
  return tex;
}

const numberPlateMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getNumberPlateMaterial(jerseyHex: string, label: string): THREE.MeshStandardMaterial {
  const key = `${jerseyHex}|${label}`;
  let m = numberPlateMaterialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: getNumberPlateTexture(jerseyHex, label),
      roughness: 0.7,
      metalness: 0.02,
      transparent: true,
      depthWrite: false,
    });
    numberPlateMaterialCache.set(key, m);
  }
  return m;
}

/* ============================================================
   ブロブ影（接地感）: 放射状グラデ・multiplyブレンドの円板。選手root直下・ボール直下で共通に
   使う。ジオメトリ・テクスチャはモジュールキャッシュを共有し、opacityだけ個体ごとに変わる
   （ヘディングで浮いている間フェードする）ためマテリアル本体だけをメッシュごとに1個生成する。
   MeshBasicMaterialはPBR計算・onBeforeCompileを持たず生成コストがごく小さいため、選手22体+
   ボール分（最大23個）は性能予算上問題にならない（ジオメトリ・テクスチャ自体はクローンしない）。
   ============================================================ */

/** 白中心・アルファ1→縁でアルファ0の放射状グラデ（64px）。RGBは常に白のまま持たせ、実際の
 * 色味・濃さはマテリアル側のcolor(暗色)×opacityで作る＝MultiplyBlending+premultipliedAlphaの
 * 組み合わせで「中心が濃く、縁ほど何も乗算しない（芝の色そのまま）」正しい減光になる。 */
let blobShadowTextureCache: THREE.CanvasTexture | null = null;
function getBlobShadowTexture(): THREE.CanvasTexture {
  if (blobShadowTextureCache) return blobShadowTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.7, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  blobShadowTextureCache = tex;
  return tex;
}

/** 単位半径(r=1)の円板。実半径はmeshのscaleで決める（他のUNIT_*ジオメトリと同じ流儀） */
const BLOB_SHADOW_GEOM = new THREE.CircleGeometry(1, 24);
/** ブロブ影の乗算色（ほぼ黒。明るすぎると接地感が弱く、真っ黒だと不自然に沈むため僅かに青みを残す） */
const BLOB_SHADOW_COLOR = "#0b1016";

/**
 * 接地感の円板1枚。meshRef/matRefを親のPlayerFigure/GLBPlayer/Ball3Dのuseframeへ渡し、
 * 位置・半径・opacityは親側から毎フレーム直接refへ書き込む（このコンポーネント自身は
 * 初回マウント時にマテリアルを1個作るだけで、以後は再レンダーもReact stateも持たない）。
 */
function BlobShadow({
  baseOpacity,
  radiusM = BLOB_SHADOW_RADIUS_M,
  meshRef,
  matRef,
}: {
  baseOpacity: number;
  radiusM?: number;
  meshRef: React.RefObject<THREE.Mesh | null>;
  matRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getBlobShadowTexture(),
        color: BLOB_SHADOW_COLOR,
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.MultiplyBlending,
        depthWrite: false,
        opacity: baseOpacity,
      }),
    [baseOpacity]
  );
  useEffect(() => {
    matRef.current = material;
    return () => {
      material.dispose();
      matRef.current = null;
    };
  }, [material, matRef]);
  return (
    <mesh
      ref={meshRef}
      geometry={BLOB_SHADOW_GEOM}
      material={material}
      rotation-x={-Math.PI / 2}
      scale={[radiusM, radiusM, 1]}
    />
  );
}

/* ============================================================
   ピッチ（地面・マーキング・ゴール）
   ============================================================ */

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

/** 芝の簡易縞を焼き込んだcanvasテクスチャ（mobile品質専用。high/mediumはPBR版
 * getGrassPBR を使うためこちらは呼ばない＝「芝簡易縞」）。qualityはanisotropy決定にのみ使う。 */
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
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropyForQuality(quality);
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
 * ごとにキャッシュされたものを使い回す（getGrassPlaneGeom参照）。
 * high/medium品質は lib/setPiece3d.ts の寸法情報を使って components/SetPiece3DStadium.tsx が
 * 生成するPBRテクスチャ一式(baseColor high=1024/medium=512・normalMap/roughnessMapはその半分)を
 * 使い、mobile品質は従来の簡易縞テクスチャ(getGrassTexture)へフォールバックする。フックは
 * 常に同じ順序で呼ぶ必要があるため、quality分岐はマテリアル生成側(useMemo内)だけで行う。 */
function PitchGround({ quality, dims }: { quality: Sp3dQuality; dims: PitchDims }) {
  const geom = useMemo(() => getGrassPlaneGeom(dims), [dims]);
  const simpleTex = useMemo(() => getGrassTexture(quality), [quality]);
  const pbr = useMemo(
    () => (quality === "high" || quality === "medium" ? getGrassPBR(dims, quality) : null),
    [quality, dims]
  );
  const mat = useMemo(() => {
    if (pbr) {
      return new THREE.MeshStandardMaterial({
        map: pbr.map,
        normalMap: pbr.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughnessMap: pbr.roughnessMap,
        roughness: 1,
      });
    }
    return new THREE.MeshStandardMaterial({ map: simpleTex, roughness: 0.96 });
  }, [pbr, simpleTex]);
  return <mesh geometry={geom} rotation-x={-Math.PI / 2} material={mat} receiveShadow />;
}

/** ライン用マテリアル（全formatで共有）。白すぎを解消した#eef1ec・opacity 0.88にし、
 * MeshStandardMaterial(roughness 0.9)へ変えて周囲の光(hemisphere/directional)に馴染ませる。
 * polygonOffsetで芝との深度競合を避け、どの距離・角度からでもラインが消えない対策は維持する
 * （drei Line時代の「ズームで消える」不具合の再発防止策そのものは変更しない）。 */
let markingMaterialCache: THREE.MeshStandardMaterial | null = null;
function getMarkingMaterial(): THREE.MeshStandardMaterial {
  if (!markingMaterialCache) {
    markingMaterialCache = new THREE.MeshStandardMaterial({
      color: "#eef1ec",
      roughness: 0.9,
      transparent: true,
      opacity: 0.88,
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

/** ゴールネットの網目風alphaMap。1枚だけ生成しキャッシュ（両ゴールで共有）。
 * 128px化し、格子(縦横)に斜め線を重ねて六角風の編み目に見せる（旧64pxの単純格子より密で
 * 「細線」寄りの見た目にする）。 */
let netTextureCache: THREE.CanvasTexture | null = null;
function getNetTexture(): THREE.CanvasTexture {
  if (netTextureCache) return netTextureCache;
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 1.1;
    const step = s / 8;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const p = i * step;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
    }
    ctx.stroke();
    // 斜め線を重ねて六角風の網目に見せる（格子だけより編み目らしい密度になる）
    ctx.beginPath();
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.55;
    const diagStep = s / 6;
    for (let i = -6; i <= 12; i++) {
      const off = i * diagStep;
      ctx.moveTo(off, 0);
      ctx.lineTo(off + s, s);
      ctx.moveTo(off, s);
      ctx.lineTo(off + s, 0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 2.4);
  netTextureCache = tex;
  return tex;
}
/** 背面ネットの「たるみ」表現用ジオメトリ（PlaneGeometryを軽く曲げた1枚）。
 * ローカルy=+0.5(上端)は箱ネットの背面上端にフラットに接続、y=-0.5(下端/垂れ先)へ向かうほど
 * ローカルz(=世界の外側方向。Goal側でscale.zの符号は常に正にし、end=-1側だけrotation-yで
 * 180°回して向きを反転させる＝負スケールによる法線反転を避ける)へ膨らみつつ、
 * 重力でたるむ雰囲気を出すためy方向にも少し余分に垂らす。両ゴールで同じジオメトリを共有する。 */
const NET_SAG_SEGMENTS = 8;
function buildNetSagGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, 1, NET_SAG_SEGMENTS);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = 0.5 - y; // 0(上端/取り付け側) → 1(下端/垂れ先)
    const bulge = t * t;
    pos.setZ(i, bulge);
    pos.setY(i, y - bulge * 0.35);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
const NET_SAG_GEOM = buildNetSagGeometry();
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

/** ポスト・クロスバー用マテリアル（白#f8f9fa・roughness .35・metalness .15）。
 * getCachedMaterial(roughness 0.6/metalness 0.04固定)とは異なる質感が要るため専用キャッシュにする。 */
let postMaterialCache: THREE.MeshStandardMaterial | null = null;
function getPostMaterial(): THREE.MeshStandardMaterial {
  if (!postMaterialCache) {
    postMaterialCache = new THREE.MeshStandardMaterial({ color: "#f8f9fa", roughness: 0.35, metalness: 0.15 });
  }
  return postMaterialCache;
}

/** ゴール（ポスト・クロスバー・網目テクスチャ入りネット）。end=1が敵陣(y100)側、-1が自陣(y0)側。
 * ポスト・クロスバーはUNIT_CYLをscaleして使い回す（性能予算: ジオメトリ共有）。dimsはformat
 * (8人制/11人制)に応じたゴール寸法・ピッチ長を渡す。 */
function Goal({ end, dims }: { end: 1 | -1; dims: PitchDims }) {
  const z = end * (dims.pitchLengthM / 2);
  const halfGoal = dims.goalWidthM / 2;
  const postR = 0.05;
  const netZ = z + end * (dims.goalNetDepthM / 2);
  const postMat = getPostMaterial();
  const netFaceMaterials = useMemo(() => getNetFaceMaterials(end), [end]);
  const sagHeight = dims.goalHeightM * 0.62;
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
      {/* ポスト上端の小球キャップ（丸めた端部の簡易表現） */}
      {([-1, 1] as const).map((sideX) => (
        <mesh
          key={`cap${sideX}`}
          geometry={UNIT_ICO}
          scale={[postR * 1.3, postR * 1.3, postR * 1.3]}
          position={[sideX * halfGoal, dims.goalHeightM, z]}
          material={postMat}
        />
      ))}
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
      {/* 背面ネットの「たるみ」表現：箱ネットの背面上端から後方・下方へ緩やかに膨らむ追加プレーン。
          end=-1側はrotation-y 180°で向きを反転させる（負スケールでの法線反転を避けるため） */}
      <mesh
        geometry={NET_SAG_GEOM}
        material={getNetMaterial()}
        position={[0, dims.goalHeightM - sagHeight / 2, z + end * dims.goalNetDepthM]}
        rotation-y={end === -1 ? Math.PI : 0}
        scale={[dims.goalWidthM * 0.96, sagHeight, dims.goalNetDepthM * 0.9]}
      />
    </group>
  );
}

/** コーナーフラッグ（実物どおり4隅にポール+三角旗）。ポール1.5m・旗は明黄 */
const FLAG_POLE_MAT_KEY = "#f4f6fa";
const FLAG_CLOTH = "#ffd23f";
const FLAG_TRI_GEOM = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 1.5, 0, 0.38, 1.41, 0, 0, 1.3, 0]), 3)
  );
  g.computeVertexNormals();
  return g;
})();
let flagClothMat: THREE.MeshStandardMaterial | null = null;
function getFlagClothMat(): THREE.MeshStandardMaterial {
  if (!flagClothMat) {
    flagClothMat = new THREE.MeshStandardMaterial({ color: FLAG_CLOTH, side: THREE.DoubleSide, roughness: 0.8 });
  }
  return flagClothMat;
}
function CornerFlags({ dims }: { dims: PitchDims }) {
  const halfW = dims.pitchWidthM / 2;
  const halfL = dims.pitchLengthM / 2;
  const poleMat = getCachedMaterial(FLAG_POLE_MAT_KEY);
  const corners: [number, number][] = [
    [-halfW, -halfL],
    [halfW, -halfL],
    [-halfW, halfL],
    [halfW, halfL],
  ];
  return (
    <group>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={Math.atan2(-x, -z)}>
          <mesh
            geometry={UNIT_CYL}
            material={poleMat}
            scale={[0.02, 1.5, 0.02]}
            position={[0, 0.75, 0]}
          />
          <mesh geometry={FLAG_TRI_GEOM} material={getFlagClothMat()} />
        </group>
      ))}
    </group>
  );
}

/* ============================================================
   スタジアム環境（LED看板・角丸長方形ボウルのスタンド一式・外壁シェル）はPhase3で
   components/SetPiece3DStadium.tsx の StadiumBowl へ移設した（旧・壁+斜面+屋根の4枚実装と
   4本の照明塔は廃止）。空ドーム・雲はPhase5でさらに components/SetPiece3DEnv.tsx へ分離した。
   ここでは import した StadiumBowl/SkyFollow を呼ぶだけにする（SkyFollowが
   SkyDome・CloudLayerをカメラ追従groupの子としてまとめて描画する）。
   ============================================================ */

/* ============================================================
   ゾーン図形・テキスト図形（床面投影）
   ============================================================ */

/* ゾーン図形(zoneRect/zoneEllipse)の「塗り」は3Dでは描画しない。
 * 半透明0.22の塗りが夕暮れトーンマッピング下の芝と混ざると泥のような茶褐色の板に見え、
 * 「ゴール前のオリーブ色の長方形」として異物に見えることが実機確認されたため
 * （CKプリセットの「ニア」ゾーン#ff8a65が該当。2Dでは従来どおりオレンジのゾーンとして表示を
 * 継続する＝この抑制は3D表示のみ）。位置の意図はテキストラベル(TextShapeLabel)が引き続き伝える。 */

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
        // ゾーンの塗りは3Dでは非表示（上のコメント参照）。テキストのみ床へ投影する
        if (s.kind === "text") return <TextShapeLabel key={s.id} shape={s} dims={dims} />;
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
  // 3Dドラッグで描いている途中のルート（tempDraw）もライブで床に描く
  const temp = board.tempDrawRef.current;
  return (
    <group>
      {moves.map((m, i) => (
        <MoveLine3D key={i} move={m} color={actorColor(m.actor, board.state.slots)} dims={dims} />
      ))}
      {temp && temp.pts.length > 1 && (
        <Line
          points={temp.pts.map((pt) => {
            const w = boardToWorld(pt, dims);
            return [w.x, 0.018, w.z] as [number, number, number];
          })}
          color="#ffe27a"
          lineWidth={0.06}
          worldUnits
          transparent
          opacity={0.9}
        />
      )}
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
    const jerseyMat = getCachedMaterial(kit.jersey, PART_MATERIAL.jersey.roughness, PART_MATERIAL.jersey.metalness, true);
    const shortsMat = getCachedMaterial(kit.shorts, PART_MATERIAL.shorts.roughness, PART_MATERIAL.shorts.metalness);
    const socksMat = getCachedMaterial(kit.socks, PART_MATERIAL.socks.roughness, PART_MATERIAL.socks.metalness);
    const skinMat = getCachedMaterial(skinTone, PART_MATERIAL.skin.roughness, PART_MATERIAL.skin.metalness, true);
    const bootMat = getCachedMaterial(BOOT_COLOR, PART_MATERIAL.boots.roughness, PART_MATERIAL.boots.metalness);
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
  onDown,
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
  onDown?: (actor: Actor, e: { stopPropagation: () => void }) => void;
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

  // ブロブ影（接地感）：実シャドウが有効なhigh/medium品質は薄め、mobile品質（実シャドウ無し）は
  // 濃いめの基準不透明度にする（quality自体は再生中に変わらないためuseMemo不要、定数として算出）
  const blobBaseOpacity = quality !== "mobile" ? BLOB_SHADOW_OPACITY_WITH_REAL_SHADOW : BLOB_SHADOW_OPACITY_NO_REAL_SHADOW;
  const blobMeshRef = useRef<THREE.Mesh | null>(null);
  const blobMatRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // トレイル（軌跡）：high/medium品質のときだけ選手にも表示する（mobile品質はボールのみ＝
  // Ball3D側で対応）
  const showTrail = quality !== "mobile";
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
    // ブロブ影：root(体)はliftRef.currentぶん浮くが、影自体は接地面(y=0.015)に固定したまま
    // x/zだけ追従させ、半径・不透明度をliftから求める（liftが増えるほど広がって薄くなる＝浮遊感）
    if (blobMeshRef.current) {
      const bs = computeBlobShadow(lift, blobBaseOpacity);
      blobMeshRef.current.position.set(wx, 0.015, wz);
      blobMeshRef.current.scale.set(bs.radiusM, bs.radiusM, 1);
      if (blobMatRef.current) blobMatRef.current.opacity = bs.opacity;
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
      <group
        ref={rootRef}
        position={[x, 0, z]}
        rotation-y={initialYaw}
        onPointerDown={onDown ? (e) => onDown(actor, e) : undefined}
      >
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
      <BlobShadow baseOpacity={blobBaseOpacity} meshRef={blobMeshRef} matRef={blobMatRef} />
      {showTrail && trailPts.length >= 2 && (
        <Line points={trailPts} color={jersey} lineWidth={0.035} worldUnits transparent opacity={0.3} />
      )}
    </>
  );
}

/** サッカーボール風の白地+黒パッチのテクスチャ（1枚生成してキャッシュ）。256×128に高精細化し、
 * 五角形パッチを3段のグリッドへ整列させた古典的なパターンにした上で、球面の丸みをうっすら
 * 感じさせる縦グラデの陰影を薄く重ねる。 */
let ballTextureCache: THREE.CanvasTexture | null = null;
function getBallTexture(): THREE.CanvasTexture {
  if (ballTextureCache) return ballTextureCache;
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f6f7f9";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#20242b";
    // 3段のグリッドに整列させた五角形パッチ（各段でx方向に半ピッチずつオフセット）
    const rows: { y: number; r: number; xs: number[] }[] = [
      { y: h * 0.18, r: h * 0.11, xs: [0.14, 0.38, 0.62, 0.86] },
      { y: h * 0.5, r: h * 0.12, xs: [0.02, 0.26, 0.5, 0.74, 0.98] },
      { y: h * 0.82, r: h * 0.11, xs: [0.14, 0.38, 0.62, 0.86] },
    ];
    for (const row of rows) {
      for (const xf of row.xs) {
        const x = xf * w;
        const y = row.y;
        const r = row.r;
        ctx.beginPath();
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
    // うっすら陰影（球の丸みを軽く感じさせる縦方向グラデ）
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(0,0,0,0.10)");
    shade.addColorStop(0.5, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.16)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
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
 * （仕様「mobile品質はボールのみ」＝ボールはmobile品質でも表示対象）。
 */
function Ball3D({
  dims,
  quality,
  onActorDown,
}: {
  dims: PitchDims;
  quality: Sp3dQuality;
  onActorDown?: (actor: Actor, e: { stopPropagation: () => void }) => void;
}) {
  const board = useBoard();
  const ref = useRef<THREE.Group | null>(null);
  const prevWorld = useRef<{ x: number; y: number; z: number } | null>(null);
  const rollAxis = useRef(new THREE.Vector3(1, 0, 0));
  const trailSamples = useRef<{ x: number; y: number; z: number; t: number }[]>([]);
  const [trailPts, setTrailPts] = useState<[number, number, number][]>([]);
  const trailTick = useRef(0);
  // ブロブ影：ボールは選手のヘディングのような明示的な「lift」概念を持たないため半径固定・
  // 常に基準の不透明度（品質=実シャドウ有無で2値）のまま、x/zだけ毎フレーム追従させる
  const blobBaseOpacity = quality !== "mobile" ? BLOB_SHADOW_OPACITY_WITH_REAL_SHADOW : BLOB_SHADOW_OPACITY_NO_REAL_SHADOW;
  const blobMeshRef = useRef<THREE.Mesh | null>(null);
  const blobMatRef = useRef<THREE.MeshBasicMaterial | null>(null);

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
    // ブロブ影は弾道の高さに関わらず接地面(y=0.015)でボール直下のx/zだけ追従する
    if (blobMeshRef.current) blobMeshRef.current.position.set(wx, 0.015, wz);

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
      <group ref={ref}>
        <mesh castShadow>
          <sphereGeometry args={[0.11, 24, 18]} />
          <meshStandardMaterial map={getBallTexture()} roughness={0.35} />
        </mesh>
        {/* 当たり判定だけ大きい不可視球（盤端のボールでも掴みやすくする） */}
        <mesh
          visible={false}
          onPointerDown={onActorDown ? (e) => onActorDown("ball", e) : undefined}
        >
          <sphereGeometry args={[0.34, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <BlobShadow baseOpacity={blobBaseOpacity} meshRef={blobMeshRef} matRef={blobMatRef} />
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
   high/medium品質のときに使用し、mobile品質・読み込み失敗時は従来のプロシージャル人型へ
   フォールバックする。マテリアル(Shirt/Pants/Details/Skin)をチームキットへ差し替え、
   Idle/Runクリップを速度でクロスフェード、ヘディングはJumpクリップ、キックは
   ボーン(UpperLeg.R等)のポスト・ミキサー上書きで表現する。
   ============================================================ */
const MODEL_URL = "models/player.glb"; // 相対パス＝GitHub Pagesのサブパス配信でも解決できる
/** ボーン取得nullをdev時に1回だけ警告するための既警告名セット（プレイヤー数ぶん重複しないよう
 * モジュールスコープに置く。取得失敗はモデル自体の骨格構成の問題＝全個体で同じ結果になるため
 * 個体ごとに出す必要はない） */
const warnedMissingBones = new Set<string>();
/** 選手モデルの目標身長(m)。ターゲットは小〜大学生と幅広いため標準体格に合わせる
 * （ジュニア特化のスケールはしない。8人制対応はピッチ寸法側で行う） */
const MODEL_TARGET_HEIGHT_M = 1.78;
/** モデルの正面補正。Blender系エクスポートの人型はthree.jsでは背面を向くことが多い */
const MODEL_YAW_OFFSET = Math.PI;

/** Pants(長ズボン1マテリアル)をサッカーキットに見せる4ゾーン材質。
 * スキニング前のバインド空間位置(position属性、モデルはZ軸が身長方向・足元z=0)を
 * 閾値で塗り分ける: 腰〜太もも上=ショーツ / 膝周り=素足 / すね=ソックス / 足首下=シューズ。
 * 閾値はGLBのPantsプリミティブ実測(z 0.0015〜0.0265)から決めた定数。キットごとにキャッシュ。 */
const PANTS_Z = { boots: 0.0035, socks: 0.0105, skin: 0.0175 } as const;
const pantsMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function getPantsMaterial(shortsHex: string, socksHex: string, skinHex: string): THREE.MeshStandardMaterial {
  const key = `${shortsHex}|${socksHex}|${skinHex}`;
  const hit = pantsMaterialCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color: shortsHex,
    roughness: PART_MATERIAL.shorts.roughness,
    metalness: PART_MATERIAL.shorts.metalness,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSocks = { value: new THREE.Color(socksHex) };
    shader.uniforms.uSkin = { value: new THREE.Color(skinHex) };
    shader.uniforms.uBoots = { value: new THREE.Color(BOOT_COLOR) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBindZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBindZ = position.z;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vBindZ;\nuniform vec3 uSocks;\nuniform vec3 uSkin;\nuniform vec3 uBoots;"
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if (vBindZ < ${PANTS_Z.boots}) { diffuseColor.rgb = uBoots; }
        else if (vBindZ < ${PANTS_Z.socks}) { diffuseColor.rgb = uSocks; }
        else if (vBindZ < ${PANTS_Z.skin}) { diffuseColor.rgb = uSkin; }`
      )
      // ショーツ/ソックス/肌/シューズの部位別roughness/metalness（PART_MATERIAL、仕様値）を
      // 同じvBindZ帯でも上書きする（色の塗り分けと同じ閾値・同じ考え方）
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        if (vBindZ < ${PANTS_Z.boots}) { roughnessFactor = ${PART_MATERIAL.boots.roughness.toFixed(2)}; }
        else if (vBindZ < ${PANTS_Z.socks}) { roughnessFactor = ${PART_MATERIAL.socks.roughness.toFixed(2)}; }
        else if (vBindZ < ${PANTS_Z.skin}) { roughnessFactor = ${PART_MATERIAL.skin.roughness.toFixed(2)}; }
        else { roughnessFactor = ${PART_MATERIAL.shorts.roughness.toFixed(2)}; }`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        if (vBindZ < ${PANTS_Z.boots}) { metalnessFactor = ${PART_MATERIAL.boots.metalness.toFixed(2)}; }`
      );
  };
  // onBeforeCompileの分岐キーを変えてシェーダキャッシュ衝突を防ぐ
  m.customProgramCacheKey = () => `pants|${key}`;
  pantsMaterialCache.set(key, m);
  return m;
}

function findClip(anims: THREE.AnimationClip[], suffix: string): THREE.AnimationClip | null {
  return anims.find((a) => a.name.endsWith(suffix)) ?? null;
}

/**
 * GLBモデルの共通素体マテリアル一式（Shirt/Pants/Details/TieTexture/Skin/Hair）をチーム
 * キット・肌・髪色へ差し替え、あわせてshadow/frustumCulledのメッシュ設定も行う。ジャージ・肌は
 * getCachedMaterialのroughness/metalness/rim引数（PART_MATERIAL、仕様の部位別質感＋リムライト）で
 * 一括指定する。将来モデルを差し替える際もこの1関数の中身だけ直せば済む構造にする
 * （Playerコンポーネント整理：マテリアル差し替えロジックを1箇所へ分離）。
 */
function applyGlbKitMaterials(clone: THREE.Object3D, kit: KitColors, skinHex: string, hairHex: string): void {
  clone.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as THREE.Mesh).isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false; // スキンメッシュはバウンディングが骨姿勢とズレて誤カリングされやすい
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const replaced = mats.map((mat) => {
      const name = (mat as THREE.Material).name;
      if (name === "Shirt") {
        return getCachedMaterial(kit.jersey, PART_MATERIAL.jersey.roughness, PART_MATERIAL.jersey.metalness, true);
      }
      if (name === "Pants") return getPantsMaterial(kit.shorts, kit.socks, skinHex);
      // Details/Tie は私服の装飾（ベルト・ネクタイ等）のためジャージ色へ塗って消す
      if (name === "Details" || name === "TieTexture") {
        return getCachedMaterial(kit.jersey, PART_MATERIAL.jersey.roughness, PART_MATERIAL.jersey.metalness, true);
      }
      if (name === "Skin") return getCachedMaterial(skinHex, PART_MATERIAL.skin.roughness, PART_MATERIAL.skin.metalness, true);
      if (name === "Hair") return getCachedMaterial(hairHex);
      return mat;
    });
    m.material = Array.isArray(m.material) ? replaced : replaced[0];
  });
}

const NUMBER_PLATE_GEOM = new THREE.PlaneGeometry(0.26, 0.34);
/** 番号プレートのわずかな傾き（胴に沿わせて「貼り紙」の平坦さを軽減する。ラジアン） */
const NUMBER_PLATE_TILT_RAD = 0.06;

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
  onDown,
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
  onDown?: (actor: Actor, e: { stopPropagation: () => void }) => void;
}) {
  const board = useBoard();
  const kit = useMemo(() => getKitColors(jersey, variant), [jersey, variant]);
  const { clone, mixer, actions, bones, boneBase, scale, footOffset } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    // 身長測定: SkinnedMesh.computeBoundingBox()（three r151+はボーン変形込みで計算）の
    // ローカルboxをmatrixWorldでワールドへ写し、その高さから目標身長へのスケールを決める。
    // （骨2点方式・Box3.setFromObject方式はリグの軸/スケール構成次第で誤測するため廃止）
    // GLBモデルは複数のSkinnedMesh（Shirt/Pants/Skin/Hair等、部位ごとに分かれたメッシュ）で
    // 構成されており、最初に見つかった1つ（多くの場合Shirt=上半身のみ）のboxだけを使うと
    // 実際の全身高さより大幅に低いboxを身長として誤測し、スケールが過大（巨人化）・
    // 足裏オフセットが過小（脚が地中に埋まる）になる。全SkinnedMeshのboxをワールドへ
    // 変換してTHREE.Box3.unionし、必ず全身を覆う合成boxから身長・接地Yを算出する。
    clone.updateMatrixWorld(true);
    let unionBox: THREE.Box3 | null = null;
    clone.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (!sk.isSkinnedMesh) return;
      sk.computeBoundingBox();
      if (!sk.boundingBox) return;
      const wb = new THREE.Box3().copy(sk.boundingBox).applyMatrix4(sk.matrixWorld);
      if (unionBox) unionBox.union(wb);
      else unionBox = wb.clone();
    });
    let h = 1.87; // フォールバック
    let footY = 0;
    if (unionBox) {
      const ub = unionBox as THREE.Box3;
      const mh = ub.max.y - ub.min.y;
      if (Number.isFinite(mh) && mh > 0.8 && mh < 5) {
        h = mh;
        footY = ub.min.y;
      }
    }
    const scale = MODEL_TARGET_HEIGHT_M / h;
    const footOffset = -footY * scale; // 足裏を地面(y=0)へ
    const skinHex = SKIN_TONES[Math.abs(Math.round(seed)) % 2];
    // 髪色は肌トーンと違うseed変換で選び、機械的に相関しないようにする（仕様「seed分散」）
    const hairHex = HAIR_TONES[Math.abs(Math.round(seed * 2.7 + 5)) % 2];
    applyGlbKitMaterials(clone, kit, skinHex, hairHex);
    const mixer = new THREE.AnimationMixer(clone);
    const idleClip = findClip(gltf.animations, "Man_Idle");
    const runClip = findClip(gltf.animations, "Man_Run");
    const jumpClip = findClip(gltf.animations, "Man_Jump");
    const actions = {
      idle: idleClip ? mixer.clipAction(idleClip) : null,
      run: runClip ? mixer.clipAction(runClip) : null,
      jump: jumpClip ? mixer.clipAction(jumpClip) : null,
    };
    // play()呼び出し・Idleの位相ずらしはここでは行わない（下のuseEffectのセットアップ側で
    // cleanup(mixer.stopAllAction())と対称に行う。useMemoはクローン/actions生成のみ）。
    if (actions.jump) {
      actions.jump.setLoop(THREE.LoopOnce, 1);
      actions.jump.clampWhenFinished = false;
    }
    // GLTFLoaderはノード名の"."をサニフィックス除去でサニタイズするため、実名は
    // ドット無し("UpperLegR"等、実測確認済み)。"UpperLeg.R"のようなドット付きでは常にnullになる。
    const bones = {
      thighR: clone.getObjectByName("UpperLegR") ?? null,
      shinR: clone.getObjectByName("LowerLegR") ?? null,
      armL: clone.getObjectByName("UpperArmL") ?? null,
      armR: clone.getObjectByName("UpperArmR") ?? null,
      abdomen: clone.getObjectByName("Abdomen") ?? null,
    };
    if (process.env.NODE_ENV !== "production") {
      for (const [name, b] of Object.entries(bones)) {
        if (!b && !warnedMissingBones.has(name)) {
          warnedMissingBones.add(name);
          // eslint-disable-next-line no-console
          console.warn(`[SetPiece3D] GLBPlayer: ボーン "${name}" がモデル内に見つかりません`);
        }
      }
    }
    // キック/ヘディングで手続き的に触る全ボーンのバインド時rotation.xを保存する。
    // Idle/Runクリップがキーしないボーン（Abdomen等）はmixer.update()で書き戻されないため、
    // ここを基準に「絶対代入」する（積算(+=)だと窓をまたぐたびに角度が蓄積し続けてしまう）。
    const boneBase = {
      thighR: bones.thighR?.rotation.x ?? 0,
      shinR: bones.shinR?.rotation.x ?? 0,
      armL: bones.armL?.rotation.x ?? 0,
      armR: bones.armR?.rotation.x ?? 0,
      abdomen: bones.abdomen?.rotation.x ?? 0,
    };
    return { clone, mixer, actions, bones, boneBase, scale, footOffset };
  }, [gltf, kit, seed]);
  useEffect(() => {
    // 再生開始(play()・Idleの位相ずらし)をセットアップ側で行い、下のcleanup
    // (mixer.stopAllAction())と対称にする。Fast Refresh(dev)で「cleanup→setup」だけが
    // 再実行される場合でも、setup側で必ずplay()し直すため全クリップ(Idle/Run/Jump)が
    // 恒久停止することはない（旧実装はplay()がuseMemo内のみにあり、useMemoが再実行されない
    // 再セットアップだと再生されないままだった＝実測で発生済み）。
    // ※R3Fは内部レコンサイラルートをStrictMode非適用で生成するため、next.configの
    // reactStrictMode:trueはCanvas配下のeffectを二重実行しない（実測: マウント時uncache 0回・
    // play 44回=22体×2クリップ）。この対称化は実質Fast Refresh対策である。
    if (actions.idle) {
      actions.idle.play();
      // 個体ごとに位相をずらし、全員が同じ呼吸で揺れる不自然さを避ける
      actions.idle.time = seededOffset(seed) * (actions.idle.getClip()?.duration ?? 1);
    }
    if (actions.run) {
      actions.run.play();
      actions.run.setEffectiveWeight(0);
    }
    return () => {
      // uncacheRoot(clone)は呼ばない: mixerとcloneは同じuseMemoで一緒に破棄されるため
      // バインディング解放は不要で、Fast Refreshを跨いだページでは_removeInactiveActionの
      // 「_cacheIndex of undefined」例外（→ModelBoundary捕捉でGLB選手が黙って
      // プロシージャルへ降格）の原因になっていた（実測22件）。
      mixer.stopAllAction();
    };
    // clone・seedはmixer/actions(同一useMemo呼び出しで一緒に再生成される)経由の依存で
    // 十分カバーされる（seedが変わればuseMemoが再実行されmixer/actionsの参照も変わるため、
    // このeffectは常に最新のseed/cloneを閉じ込めた状態で再実行される）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer, actions]);

  const rootRef = useRef<THREE.Group | null>(null);
  const prevWorld = useRef<{ x: number; z: number } | null>(null);
  const yawRef = useRef(facing === -1 ? Math.PI : 0);
  const speedRef = useRef(0);
  const lastJumpEv = useRef<number | null>(null);
  // ブロブ影：GLBPlayerはquality!=="mobile"(high/medium)のときにしか描画されない
  // （TokensLayer参照）ため実シャドウは常に有効＝基準不透明度は薄め固定でよい。
  // GLBはルート自体を浮かせず(常にy=0)
  // Jumpクリップ内部でモデルだけを持ち上げる作りのため、ブロブの半径・不透明度は
  // computeHeaderPoseの同じlift値をヘディング窓の間だけ手続き的に再計算して使う。
  const blobMeshRef = useRef<THREE.Mesh | null>(null);
  const blobMatRef = useRef<THREE.MeshBasicMaterial | null>(null);

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
    // ヘディングの浮き上がり高さ（ブロブ影の半径・不透明度の算出用。ジャンプクリップがモデルを
    // 実際に持ち上げる量とは別に、プロシージャル側と同じcomputeHeaderPoseの式で近似する）
    let lift = 0;
    // 現在時刻がいずれかのheader窓の内側にあるか。窓の外に出た（順再生で通過／巻き戻しシークで
    // 手前へ戻った、どちらも該当）ら lastJumpEv をリセットし、次にこの窓へ入り直したときも
    // ジャンプクリップを再生できるようにする（リセットしないと2回目以降ジャンプしなくなるバグ）
    let headerActive = false;
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
          headerActive = true;
          if (actions.jump && lastJumpEv.current !== ev.t) {
            lastJumpEv.current = ev.t;
            actions.jump.reset().play();
          }
          lift = computeHeaderPose(hp).lift;
          yawRef.current = dampAngle(yawRef.current, ev.faceYaw, YAW_TURN_RATE_RAD_S * 2.5, delta);
          break;
        }
      }
    }
    if (!headerActive) lastJumpEv.current = null;

    if (rootRef.current) {
      rootRef.current.position.set(wx, 0, wz);
      rootRef.current.rotation.y = yawRef.current;
    }
    if (blobMeshRef.current) {
      const bs = computeBlobShadow(lift, BLOB_SHADOW_OPACITY_WITH_REAL_SHADOW);
      blobMeshRef.current.position.set(wx, 0.015, wz);
      blobMeshRef.current.scale.set(bs.radiusM, bs.radiusM, 1);
      if (blobMatRef.current) blobMatRef.current.opacity = bs.opacity;
    }

    // ロコモーション: Idle⇔Run を速度でクロスフェードし、Runの再生速度も実速度へ追従
    const blend = Math.min(1, speedRef.current / RUN_BLEND_SPEED_MPS);
    actions.run?.setEffectiveWeight(blend);
    actions.idle?.setEffectiveWeight(1 - blend * 0.85);
    if (actions.run) actions.run.timeScale = 0.7 + Math.min(2.2, speedRef.current * 0.28);
    mixer.update(delta);

    // キック: ミキサー適用後にボーンを上書き（クリップが無いため手続き駆動）。
    // Idle/RunクリップはAbdomen等をキーしないためmixer.update()では書き戻されず、
    // 旧実装の「+=」だと毎フレーム加算され続けて蹴った選手が恒久的に折れ曲がったまま
    // 固まるバグがあった。バインド時rotation.x(boneBase)を基準にした絶対代入へ変更し、
    // 窓の外では明示的にboneBaseへ復元する（脚・腕はIdle/Runがキーするため復元は無害、
    // Abdomenはどのクリップもキーしないためこの復元が無いと直前のキック角のまま残り続ける）。
    if (kicking) {
      const swing =
        kickP < 0.4 ? -Math.sin((kickP / 0.4) * Math.PI * 0.5) : Math.sin(((kickP - 0.4) / 0.6) * Math.PI);
      const w = Math.sin(Math.PI * kickP);
      if (bones.thighR) bones.thighR.rotation.x = boneBase.thighR + -swing * 1.1 * w;
      if (bones.shinR) bones.shinR.rotation.x = boneBase.shinR + Math.max(0, -swing) * 0.9 * w;
      if (bones.armL) bones.armL.rotation.x = boneBase.armL + swing * 0.5 * w;
      if (bones.armR) bones.armR.rotation.x = boneBase.armR + -swing * 0.35 * w;
      if (bones.abdomen) bones.abdomen.rotation.x = boneBase.abdomen + 0.14 * w;
    } else {
      if (bones.thighR) bones.thighR.rotation.x = boneBase.thighR;
      if (bones.shinR) bones.shinR.rotation.x = boneBase.shinR;
      if (bones.armL) bones.armL.rotation.x = boneBase.armL;
      if (bones.armR) bones.armR.rotation.x = boneBase.armR;
      if (bones.abdomen) bones.abdomen.rotation.x = boneBase.abdomen;
    }
  });

  // 番号プレートは布目ノイズ+縁の透明フェードを持つGLB専用テクスチャ（getNumberPlateMaterial）を
  // 使う（プロシージャル選手の胴体実面はgetNumberMaterialのまま＝別関数、詳細は定義側コメント）
  const numberMat = getNumberPlateMaterial(kit.jersey, label);
  return (
    <>
      <group
        ref={rootRef}
        position={[x, 0, z]}
        rotation-y={facing === -1 ? Math.PI : 0}
        onPointerDown={onDown ? (e) => onDown(actor, e) : undefined}
      >
        <group rotation-y={MODEL_YAW_OFFSET} position={[0, footOffset, 0]} scale={[scale, scale, scale]}>
          <primitive object={clone} />
        </group>
        {/* 背中とやや小さめの胸の番号プレート（シャツのUVを持たないため薄板で表現。胴の丸みに
            沿うようわずかに傾け、縁の透明フェードとあわせて「貼り紙」感を軽減する）。
            この2枚は内側の[scale,scale,scale]グループの外（=footOffset/scaleの影響を受けない
            ルートgroup直下）に置かれており、position.yはMODEL_TARGET_HEIGHT_M(=1.78m、
            全GLBの統一目標身長)に対する比率で直接ワールドメートル指定している。全身バウンディング
            box(前述のunion修正後)を使う限りGLBは常にちょうど1.78m(足y=0〜頭y=1.78)に正規化される
            ため、この比率(背0.62・胸0.6)とz奥行き(±0.16m、成人の胴半厚みの目安)は身長測定バグの
            有無に関わらず変わらず正しい値＝バグ修正後の座標再調整は不要（体表に正しく乗ることを
            確認済み）。 */}
        <mesh
          geometry={NUMBER_PLATE_GEOM}
          material={numberMat}
          position={[0, MODEL_TARGET_HEIGHT_M * 0.62, -0.16]}
          rotation={[NUMBER_PLATE_TILT_RAD, Math.PI, 0]}
        />
        <mesh
          geometry={NUMBER_PLATE_GEOM}
          material={numberMat}
          position={[0, MODEL_TARGET_HEIGHT_M * 0.6, 0.16]}
          scale={[0.62, 0.62, 1]}
          rotation-x={-NUMBER_PLATE_TILT_RAD}
        />
      </group>
      <BlobShadow baseOpacity={BLOB_SHADOW_OPACITY_WITH_REAL_SHADOW} meshRef={blobMeshRef} matRef={blobMatRef} />
    </>
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
  onActorDown,
}: {
  quality: Sp3dQuality;
  dims: PitchDims;
  actionMap: Map<string, ActionEvent[]>;
  onActorDown?: (actor: Actor, e: { stopPropagation: () => void }) => void;
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
            onDown={onActorDown}
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
          onDown={onActorDown}
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

/** GLBスタジアム(components/AlfaStadium.tsx)の読み込み失敗時に、既存のprocedural
 * スタジアム一式（StadiumBowl/PitchGround/PitchLines/Goal×2/CornerFlags/ApronGround）へ
 * 落とすエラーバウンダリ。ModelBoundary（GLB選手用）と全く同じパターンだが、GLB失敗を
 * console.errorで報告する点だけ異なる（スタジアムはページの主要な視覚要素のため、
 * 選手モデルよりも失敗を診断しやすくしておきたい）。 */
class GlbStadiumBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error(
      "[SetPiece3D] AlfaStadium(GLBスタジアム)の読み込みに失敗しました。プロシージャルスタジアムへフォールバックします。",
      error
    );
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ProceduralPlayers({
  quality,
  dims,
  actionMap,
  onActorDown,
}: {
  quality: Sp3dQuality;
  dims: PitchDims;
  actionMap: Map<string, ActionEvent[]>;
  onActorDown?: (actor: Actor, e: { stopPropagation: () => void }) => void;
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
            onDown={onActorDown}
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
          onDown={onActorDown}
        />
      ))}
    </group>
  );
}

function TokensLayer({
  quality,
  dims,
  onActorDown,
}: {
  quality: Sp3dQuality;
  dims: PitchDims;
  onActorDown?: (actor: Actor, e: { stopPropagation: () => void }) => void;
}) {
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
  const proc = (
    <ProceduralPlayers quality={quality} dims={dims} actionMap={actionMap} onActorDown={onActorDown} />
  );
  return (
    <group>
      {quality !== "mobile" ? (
        // high/medium=GLBモデル（読み込み中・失敗時はプロシージャル人型で表示を継続）
        <ModelBoundary fallback={proc}>
          <Suspense fallback={proc}>
            <ModelPlayers quality={quality} dims={dims} actionMap={actionMap} onActorDown={onActorDown} />
          </Suspense>
        </ModelBoundary>
      ) : (
        proc
      )}
      <Ball3D dims={dims} quality={quality} onActorDown={onActorDown} />
    </group>
  );
}

/* ============================================================
   ダブルクリックで注視点を移動する透明な地面プレーン。カメラ位置自体は動かさず、
   OrbitControlsのtargetだけをイージングで移動する（reduced-motionは即時ジャンプ）。
   ============================================================ */

const CLICK_PLANE_GEOM = new THREE.PlaneGeometry(400, 400);
const CLICK_PLANE_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/** 3D直接操作の共有状態。SetPiece3D本体が生成し、選手/ボール/地面プレーンで共有する */
export interface Drag3DState {
  actor: Actor;
  mode: "move" | "route";
  pts: Point[];
}

function worldToBoardPct(x: number, z: number, dims: PitchDims): Point {
  const bx = Math.min(99.5, Math.max(0.5, (x / dims.pitchWidthM + 0.5) * 100));
  const by = Math.min(99.5, Math.max(0.5, (z / dims.pitchLengthM + 0.5) * 100));
  return { x: bx, y: by };
}

/** ドラッグ・キック調整・ダブルクリック注視の受け皿になる透明な地面プレーン */
function InteractionPlane({
  controlsRef,
  reducedMotion,
  dims,
  dragRef,
  kickEdit,
  onKickTarget,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  reducedMotion: boolean;
  dims: PitchDims;
  dragRef: React.RefObject<Drag3DState | null>;
  kickEdit: boolean;
  onKickTarget: (p: Point) => void;
}) {
  const board = useBoard();
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
    if (dragRef.current || kickEdit) return;
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

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!kickEdit) return;
    e.stopPropagation();
    onKickTarget(worldToBoardPct(e.point.x, e.point.z, dims));
    invalidate();
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const bp = worldToBoardPct(e.point.x, e.point.z, dims);
    if (d.mode === "route") {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(bp.x - last.x, bp.y - last.y) > 2.2) {
        d.pts.push(bp);
        board.setTempDraw({ actor: d.actor, pts: d.pts.slice() });
      }
    } else {
      // 配置移動: 2Dドラッグと同じAPIでライブ反映
      if (d.actor === "ball") {
        board.setBall(bp.x, bp.y);
      } else if (typeof d.actor === "number") {
        const role = board.stateRef.current.slots[d.actor]?.role ?? "CM";
        board.moveSlot(d.actor, bp.x, bp.y, role);
      } else {
        const idx = parseInt(String(d.actor).replace("opp", ""), 10);
        if (Number.isFinite(idx)) board.moveOpponent(idx, bp.x, bp.y);
      }
    }
    invalidate();
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "route") {
      const path = straightenIfLine(simplify(d.pts));
      if (path.length >= 2) board.addMove(d.actor, path);
      board.setTempDraw(null);
    }
    dragRef.current = null;
    const controls = controlsRef.current;
    if (controls) controls.enabled = true;
    invalidate();
  };

  return (
    <mesh
      geometry={CLICK_PLANE_GEOM}
      material={CLICK_PLANE_MAT}
      position={[0, 0.001, 0]}
      rotation-x={-Math.PI / 2}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
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
  glbStadium,
}: {
  preset: CameraPresetId;
  reducedMotion: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  dims: PitchDims;
  glbStadium: boolean;
}) {
  const board = useBoard();
  const { camera, invalidate, size } = useThree();
  // 遷移開始時点の最新state("s"を読むためだけ。依存配列には入れず、preset変更時にのみ読む)
  const stateRef = useRef(board.state);
  stateRef.current = board.state;
  // 実際のCanvas実寸（px）。broadcastのfovフィットに使う実アスペクト比の元。sizeは
  // useThree()のstore経由でリサイズのたびに新しい値になるが、下の遷移用useEffectの
  // 依存配列には入れない（プリセット切替時にのみ再計算したいため）のでrefで最新値を保持する。
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const fromPos = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  // プリセットごとのFOV遷移（three.jsのCamera型はPerspective/Orthographicの合併型のため、
  // このCanvasは常にPerspectiveCameraで構成している前提でキャストする）
  const fromFov = useRef(50);
  const toFov = useRef(50);
  const t = useRef(1);
  const mounted = useRef(false);

  // replay用: 注視点からの水平距離・高さ・現在角度（プリセット切替のたびに再計算し、
  // 以後はuseFrameが角度だけ進める）
  const replayRadius = useRef(0);
  const replayHeight = useRef(0);
  const replayAngle = useRef(0);

  useEffect(() => {
    // 実アスペクト比（Canvas実寸から）。broadcast以外は無視されるため、他プリセットの
    // 遷移には影響しない。高さ0（マウント直後でResizeObserverが未発火等）はundefined扱いにし
    // computeCameraPreset側のデフォルト(BROADCAST_ASSUMED_ASPECT)へフォールバックさせる。
    const aspect = sizeRef.current.height > 0 ? sizeRef.current.width / sizeRef.current.height : undefined;
    const pose = computeCameraPreset(preset, stateRef.current, dims, aspect, { glbStadium });
    const controls = controlsRef.current;
    const dx = pose.position[0] - pose.target[0];
    const dz = pose.position[2] - pose.target[2];
    replayRadius.current = Math.hypot(dx, dz);
    replayHeight.current = pose.position[1] - pose.target[1];
    replayAngle.current = Math.atan2(dz, dx);
    const pcam = camera as THREE.PerspectiveCamera;
    if (!mounted.current) {
      // 初回マウント：Canvasの初期カメラ位置・画角と揃えるだけなので遷移させない
      mounted.current = true;
      camera.position.set(...pose.position);
      controls?.target.set(...pose.target);
      controls?.update();
      pcam.fov = pose.fov;
      pcam.updateProjectionMatrix();
      t.current = 1;
      invalidate();
      return;
    }
    if (reducedMotion) {
      camera.position.set(...pose.position);
      controls?.target.set(...pose.target);
      controls?.update();
      pcam.fov = pose.fov;
      pcam.updateProjectionMatrix();
      t.current = 1;
      invalidate();
      return;
    }
    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls?.target ?? fromPos.current);
    toPos.current.set(...pose.position);
    toTarget.current.set(...pose.target);
    fromFov.current = pcam.fov;
    toFov.current = pose.fov;
    t.current = 0;
    invalidate();
    // preset切替の瞬間・dims(format)切替の瞬間のみ再計算する（board.state の他の変化には
    // 追従させない設計。dimsはformatが変わらない限り同一オブジェクト参照のまま＝
    // getPitchDimsが固定テーブルを返すため、通常のboard.state更新では再発火しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, reducedMotion, camera, controlsRef, invalidate, dims, glbStadium]);

  // camera.farの切替反映。<Canvas camera={{far:...}}>はCanvas生成時にしか適用されない
  // （R3Fは既存カメラのユーザー設定を上書きしない）ため、3Dを開いたまま品質を切り替えて
  // glbStadiumが変化したケースでは、ここで明示的にfarを代入して反映する
  // （GLBスタジアムは±195mまであるためfar=450、プロシージャルは従来どおり300）。
  useEffect(() => {
    const pcam = camera as THREE.PerspectiveCamera;
    const far = glbStadium ? 450 : 300;
    if (pcam.far !== far) {
      pcam.far = far;
      pcam.updateProjectionMatrix();
      invalidate();
    }
  }, [glbStadium, camera, invalidate]);

  // Canvas実寸が変化した時（スマホ回転・ウィンドウリサイズ等）、broadcastプリセット中なら
  // 実アスペクト比でfov/位置を再フィットする（他プリセットはaspectを使わないため対象外）。
  // 初回マウント時はこの直前の遷移用useEffectが同じ内容を既に反映済みのため、初回の
  // 発火はスキップして二重適用を避ける。遷移(t)は使わず即時スナップ（リサイズは連続動作の
  // 途中ではないため、イージングさせる必要が無い）。
  const sizeInitialized = useRef(false);
  useEffect(() => {
    if (!sizeInitialized.current) {
      sizeInitialized.current = true;
      return;
    }
    if (preset !== "broadcast") return;
    const aspect = size.height > 0 ? size.width / size.height : undefined;
    const pose = computeCameraPreset("broadcast", stateRef.current, dims, aspect, { glbStadium });
    const controls = controlsRef.current;
    const pcam = camera as THREE.PerspectiveCamera;
    camera.position.set(...pose.position);
    controls?.target.set(...pose.target);
    controls?.update();
    pcam.fov = pose.fov;
    pcam.updateProjectionMatrix();
    t.current = 1;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, preset, dims, camera, controlsRef, invalidate, glbStadium]);

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
      const pcam = camera as THREE.PerspectiveCamera;
      pcam.fov = fromFov.current + (toFov.current - fromFov.current) * e;
      pcam.updateProjectionMatrix();
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

/** キック調整: 始点→終点を「巻き」量で曲げた2次ベジェのサンプル列(9点)にする。
 * bendは-60..60(%)で、経路長に比例した横オフセットに写す(正=進行方向右へ膨らむ) */
function makeBentPath(start: Point, end: Point, bend: number): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = (bend / 100) * len * 0.6;
  const mx = (start.x + end.x) / 2 + nx * off;
  const my = (start.y + end.y) / 2 + ny * off;
  const pts: Point[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push({ x: a * start.x + b * mx + c * end.x, y: a * start.y + b * my + c * end.y });
  }
  return pts;
}

/** 既存パスから「巻き」量を逆算(中間点の符号付き横オフセット→bend%換算) */
function estimateBend(path: Point[]): number {
  if (path.length < 3) return 0;
  const s0 = path[0];
  const e0 = path[path.length - 1];
  const m = path[Math.floor(path.length / 2)];
  const dx = e0.x - s0.x;
  const dy = e0.y - s0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const off = (m.x - (s0.x + e0.x) / 2) * nx + (m.y - (s0.y + e0.y) / 2) * ny;
  return Math.max(-60, Math.min(60, Math.round((off / (len * 0.6)) * 100)));
}

/** キック調整中の着地点マーカー(地面のリング) */
function KickTargetMarker({ path, dims }: { path: Point[]; dims: PitchDims }) {
  const end = path[path.length - 1];
  const x = boardXToWorldX(end.x, dims);
  const z = boardYToWorldZ(end.y, dims);
  return (
    <mesh position={[x, 0.03, z]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.45, 0.62, 32]} />
      <meshBasicMaterial color="#ffd23f" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
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
/* ============================================================
   初回フレームゲート（F項）: Canvas自体はマウント直後から.sp3dpitchの背景(CSSグラデ)の上に
   乗るが、シーングラフの構築・テクスチャ生成が終わり実際に最初の1フレームがGPUへ描画される
   までは（frameloop="demand"下でも通常マウント直後に1回invalidateされ描画される）
   数秒〜十数秒その背景だけが見え続け「壊れている」ように見える。useFrameは実際に描画される
   フレームでのみ呼ばれるため、その最初の1回をここで検知して親へ伝え、オーバーレイ（下の
   SetPiece3D本体、.sp3dboot）を消させる。 */
function FirstFrameGate({ onFirstFrame }: { onFirstFrame: () => void }) {
  const firedRef = useRef(false);
  useFrame(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstFrame();
  });
  return null;
}

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
    // setActiveStepは内部で「その場面の先頭時刻」へseekし直すため、先にseek(v)してしまうと
    // 直後のsetActiveStepがそのseekを上書きし、シークバーをどこへドラッグしても常に場面の
    // 先頭へ戻ってしまう（＝スクラブが実質動かない）不具合があった。setActiveStepを先に
    // 呼んでその場面内へ切り替えたうえで、board.seek(v)を最後に呼んで実際の位置を確定させる。
    board.setActiveStep(stepAtTime(moves, v, steps));
    board.seek(v);
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

export default function SetPiece3D({ preset, onPreset }: { preset: CameraPresetId; onPreset?: (id: CameraPresetId) => void }) {
  const board = useBoard();
  const reducedMotion = usePrefersReducedMotion();
  const [quality, setQuality] = useSp3dQuality();
  // ボール追従カメラ(FC26リプレイ風)のON/OFF。PlaybackBar(トグルUI)とCanvas内の
  // FollowBallControllerで共有する
  const [follow, setFollow] = useState(false);
  // 3D直接操作(ドラッグ移動/ルート描き)の共有状態
  const dragRef = useRef<Drag3DState | null>(null);
  // キック調整(TPS)モード
  const [kickEdit, setKickEdit] = useState(false);
  const [kickBend, setKickBend] = useState(0);
  // 初回フレーム描画までの「準備中」オーバーレイ（F項）。FirstFrameGateがCanvas内の
  // 最初のuseFrameでtrueにする＝以後は再レンダーされない（不要な再計算を避ける）
  const [booted, setBooted] = useState(false);
  const isCoach = board.auth.role === "coach";

  // 現在の場面のボールmove(パス/シュート)のindex。キック調整の編集対象
  const ballMoveIdx = board.state.moves.findIndex(
    (m) =>
      m.actor === "ball" &&
      (m.step ?? 0) === board.activeStep &&
      (moveKind(m) === "pass" || moveKind(m) === "shot")
  );
  const ballMove = ballMoveIdx >= 0 ? board.state.moves[ballMoveIdx] : null;

  const applyKickPath = (end: Point, bend: number) => {
    if (ballMoveIdx < 0) return;
    const start = board.state.moves[ballMoveIdx].path[0];
    board.updateMove(ballMoveIdx, { path: makeBentPath(start, end, bend) });
  };
  const onKickTarget = (p: Point) => {
    if (ballMoveIdx < 0) {
      // ボールmoveがまだ無ければ、現在のボール位置→クリック地点のパスを新規作成
      const start = { x: board.state.ball.x, y: board.state.ball.y };
      board.addMove("ball", makeBentPath(start, p, kickBend));
      return;
    }
    applyKickPath(p, kickBend);
  };
  const onKickBend = (b: number) => {
    setKickBend(b);
    if (ballMoveIdx >= 0) {
      const path = board.state.moves[ballMoveIdx].path;
      applyKickPath(path[path.length - 1], b);
    }
  };
  const onKickTrajectory = (tr: BallTrajectory) => {
    if (ballMoveIdx >= 0) board.updateMove(ballMoveIdx, { trajectory: tr });
  };
  const toggleKickEdit = () => {
    const next = !kickEdit;
    setKickEdit(next);
    if (next) {
      // キッカーTPS視点へ。既存moveがあれば曲がりの初期値を推定
      onPreset?.("kicker");
      if (ballMove) setKickBend(estimateBend(ballMove.path));
    }
  };

  const beginActorDrag = (actor: Actor, e: { stopPropagation: () => void }) => {
    if (!isCoach || kickEdit || board.isPlaying) return;
    e.stopPropagation();
    const st = board.stateRef.current;
    const p0 = actorPos(actor, board.getTime(), st.moves, st.slots, st.ball, st.opponents, st.holder);
    const route = board.mode === "anim" && board.animTool === "draw";
    dragRef.current = { actor, mode: route ? "route" : "move", pts: [{ x: p0.x, y: p0.y }] };
    if (controlsRef.current) controlsRef.current.enabled = false;
  };
  // 何人制シナリオかに応じたピッチ寸法一式。getPitchDimsは固定テーブル参照を返すため
  // （format 8|11の2値しか無い）、format不変の間はレンダーをまたいで同一オブジェクト参照になる
  // ＝下流のuseMemo([dims])はformat切替時だけ再計算される。
  const format = board.state.setPiece?.format ?? 8;
  const dims = getPitchDims(format);
  // GLBスタジアム(components/AlfaStadium.tsx)を使うかどうか。11人制かつ高/中品質のときだけ true。
  // - 8人制は不使用: GLBのピッチ実測は105×68m(11人制)固定のため、8人制(50×68m)の寸法とは
  //   一致しない。8人制は従来どおりprocedural一式（フォーマットに応じて寸法を作り直せる）を使う。
  // - 軽(mobile)品質は不使用: GLBは1,460,240trisと軽品質のtris予算を大きく超えるため、
  //   軽量端末向けにはprocedural一式(軽量ジオメトリ)を使い続ける。
  const glbStadium = format === 11 && quality !== "mobile";
  // 環境（空・光・霧）プリセット。現時点は切替UIが無くduskのみを使う（構造だけ用意）
  const sky = SKY_PRESETS[ACTIVE_SKY_PRESET];
  // 初回マウント時のカメラ位置・画角のみに使う（以後はCameraControllerが管理）
  const [initialPose] = useState(() => computeCameraPreset(preset, board.state, dims, undefined, { glbStadium }));
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

  // procedural スタジアム一式（StadiumBowl/PitchGround/PitchLines/Goal×2/CornerFlags/
  // ApronGround）。glbStadium=falseの通常描画と、glbStadium=true時のGlbStadiumBoundary/
  // Suspenseのfallback（ロード中・失敗時に見せる画）の両方から参照するため変数化して重複を避ける。
  const proceduralStadium = (
    <>
      <ApronGround />
      <PitchGround quality={quality} dims={dims} />
      <PitchLines dims={dims} />
      <Goal end={1} dims={dims} />
      <Goal end={-1} dims={dims} />
      <CornerFlags dims={dims} />
      <StadiumBowl dims={dims} quality={quality} />
    </>
  );

  return (
    <div className="pitchwrap sp3dwrap">
      <div className="pitch sp3dpitch">
        <Canvas
          // three r185で shadows="soft" 文字列指定が非推奨のため、同じ挙動(PCFSoftShadowMap)の
          // 真偽値指定へ変更（@react-three/fiberは shadows={true} も文字列"soft"と同じ
          // gl.shadowMap.type=PCFSoftShadowMapになる。挙動は変わらない）。mobile品質は影自体を切る。
          shadows={quality !== "mobile"}
          // dpr上限: high=1.5 / medium=1.25 / mobile=1固定（性能予算どおり上限1.5を超えない）
          dpr={quality === "high" ? [1, 1.5] : quality === "medium" ? [1, 1.25] : 1}
          // 静止時は再描画しない（性能予算）。カメラ操作(OrbitControls)は変更イベントのたびに
          // 自前でinvalidate()するため引き続き滑らかに動く。プリセット遷移・ダブルクリック注視点
          // 移動・replayオービットはCameraController/GazeClickPlaneが動いている間だけ
          // invalidate()し続ける。
          frameloop="demand"
          gl={{
            antialias: true,
            alpha: true,
            // 3Dシーンのスクリーンショット取得(canvas.toDataURL)用。描画バッファを保持する
            preserveDrawingBuffer: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          // GLBスタジアムは全体bbox±195×±168・高さ55.5まであり、procedural一式の想定範囲
          // （far=300で足りていた）を超えて見える箇所があるため、glbStadium時だけfar/fogを
          // 300→450・(90,300)→(110,420)へ広げる（procedural・8人制時は従来どおり）。
          camera={{ fov: initialPose.fov, near: 0.1, far: glbStadium ? 450 : 300, position: initialPose.position }}
        >
          {/* 夕暮れ+照明点灯(DUSK)。色/強度はlib/setPiece3d.tsのSKY_PRESETS[ACTIVE_SKY_PRESET]に
              集約し、ここでは参照するだけ（day/nightへの切替は将来、この参照先を変えるだけで済む）。
              ambientは0.05以下・hemisphere/directionalの太陽・反対側からの影なしフィルの4灯構成。
              影を落とすのは太陽(directional)1灯のみ（フィルはcastShadow無し＝性能予算どおり）。 */}
          <hemisphereLight args={[sky.hemiSky, sky.hemiGround, sky.hemiIntensity]} />
          <ambientLight intensity={sky.ambientIntensity} color="#ffffff" />
          <directionalLight
            position={sky.sunPosition}
            intensity={sky.sunIntensity}
            color={sky.sunColor}
            castShadow={quality !== "mobile"}
            shadow-mapSize={[1024, 1024]}
            shadow-radius={5}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
            shadow-camera-near={1}
            shadow-camera-far={80}
          />
          <directionalLight position={sky.fillPosition} intensity={sky.fillIntensity} color={sky.fillColor} />
          {/* 地平線色のFog(near90/far300、glbStadium時はnear110/far420)。スカイドーム自体は
              material.fog=falseで対象外にする（SkyDome側で設定済み）。低空の雲は霧の影響を
              受けたままにし、地平線付近で自然に溶け込ませる */}
          <fog attach="fog" args={glbStadium ? [sky.fogColor, 110, 420] : [sky.fogColor, 90, 300]} />
          <SkyFollow preset={sky} cloudTint={sky.cloud} />
          {glbStadium ? (
            // 11人制・高/中品質: Blender製GLBスタジアムを描画する。procedural一式
            // （StadiumBowl/PitchGround/PitchLines/Goal×2/CornerFlags/ApronGround）は
            // レンダーしない（二重ピッチ/二重ゴールを避けるため）が、コード自体は残し、
            // ロード中(Suspense)・失敗時(GlbStadiumBoundary)のフォールバックとして使う。
            <GlbStadiumBoundary fallback={proceduralStadium}>
              <Suspense fallback={proceduralStadium}>
                <AlfaStadium />
              </Suspense>
            </GlbStadiumBoundary>
          ) : (
            // 8人制、または軽(mobile)品質: 従来どおりprocedural一式をそのまま描画する。
            proceduralStadium
          )}
          <ShapesFloor dims={dims} />
          <MovesFloor dims={dims} />
          <TokensLayer quality={quality} dims={dims} onActorDown={beginActorDrag} />
          <InteractionPlane
            controlsRef={controlsRef}
            reducedMotion={reducedMotion}
            dims={dims}
            dragRef={dragRef}
            kickEdit={kickEdit && isCoach}
            onKickTarget={onKickTarget}
          />
          {kickEdit && ballMove && <KickTargetMarker path={ballMove.path} dims={dims} />}
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
          <CameraController
            preset={preset}
            reducedMotion={reducedMotion}
            controlsRef={controlsRef}
            dims={dims}
            glbStadium={glbStadium}
          />
          {!booted && <FirstFrameGate onFirstFrame={() => setBooted(true)} />}
        </Canvas>
        {!booted && (
          <div className="sp3dboot" aria-hidden="true">
            <div className="sp3dboot-ring" />
            <div className="sp3dboot-brand">ALFA FOOTBALL</div>
            <div className="sp3dboot-title">3D STADIUM</div>
            <div className="sp3dboot-bar" />
            <div className="sp3dboot-sub">スタジアムを準備しています…</div>
          </div>
        )}
        <QualityToggle quality={quality} onChange={setQuality} />
        {isCoach && (
          <div className="sp3dkick" role="group" aria-label="キック調整">
            <button type="button" className={`sp3dqbtn${kickEdit ? " on" : ""}`} onClick={toggleKickEdit}>
              キック調整
            </button>
            {kickEdit && (
              <>
                <span className="sp3dkick-hint">ピッチをクリック=着地点</span>
                <label className="sp3dkick-bend">
                  巻き
                  <input
                    type="range"
                    min={-60}
                    max={60}
                    step={2}
                    value={kickBend}
                    onChange={(e) => onKickBend(parseInt(e.target.value, 10))}
                  />
                </label>
                {(["ground", "driven", "lofted"] as BallTrajectory[]).map((tr) => (
                  <button
                    key={tr}
                    type="button"
                    className={`sp3dqbtn${(ballMove ? moveTrajectory(ballMove) : "ground") === tr ? " on" : ""}`}
                    onClick={() => onKickTrajectory(tr)}
                  >
                    {tr === "ground" ? "グラウンダー" : tr === "driven" ? "ライナー" : "ふんわり"}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        <PlaybackBar reducedMotion={reducedMotion} follow={follow} onToggleFollow={() => setFollow((v) => !v)} />
      </div>
    </div>
  );
}

/* ============================================================
   draw call・三角形数（11人制フルピッチ・自チーム11+相手11想定。ブラウザのWebGL統計での実測値。
   下記は品質2段階(標準/軽量)時点・環境(空/芝PBR/ゴール改修)を追加する前の参考値で、
   3段階化(Phase5)後は再計測していない）
   - 旧「標準」相当（≒現high品質からNear観客LOD・外壁シェルを除いた素の値）: draw call 836 / tri 14,630
   - 旧「軽量」相当（≒現mobile品質）: draw call 429 / tri 7,766（影OFF・観客席帯OFF・dpr1固定に加え、
     選手のcastShadowを胴・大腿・下腿のみに絞ったことでshadow pass側のdraw callも軽量側にとどまらず
     標準側でも削減されている）
   Phase5で追加したmedium品質はhigh相当からNear観客InstancedMesh(1 draw call、ただし~1200体ぶんの
   頂点・fragment処理を丸ごと省く)だけを除いた構成のため、draw call数はhighとほぼ同数のまま
   GPU負荷（fill rate・頂点処理）だけを下げる設計。外壁シェル(フィン+ガラス帯、high/mediumのみ)は
   固定+2 draw call。空ドーム・雲・ネットのたるみ・ポスト上端キャップは、品質に関わらず常時
   +10 draw call程度（sky dome 1・cloud 3・net sag 2・post cap 4）の固定増分に収まる設計
   （選手22体分のような人数依存の増加はしない）。芝PBR(high/medium品質のみ、high=1024²/
   medium=512²のcanvasテクスチャ。normalMap/roughnessMapはその半分)はジオメトリ・draw call自体は
   従来の芝プレーン1枚のまま増えない。
   dpr上限 high=1.5/medium=1.25/mobile=1固定・実シャドウ(平行光1枚・shadowMapSize 1024以下)は
   high/mediumのみ・frameloop="demand"（静止時は再描画自体しない）と合わせ、PC60fps/中位スマホ
   30fps以上の性能予算に収まる設計とした。
   ============================================================ */
