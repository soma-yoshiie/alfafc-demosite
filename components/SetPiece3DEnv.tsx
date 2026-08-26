"use client";

// セットプレー3Dの「空/環境」パーツ（空ドーム・低空の雲）。Phase5でcomponents/SetPiece3DStadium.tsx
// （スタジアム建築物本体）から分離した。components/SetPiece3D.tsx からのみimportすること
// （このファイルを他画面から静的importしない＝3D本体と同じチャンクに留め、バンドル分離を保つ）。
// 逆方向（本ファイルがSetPiece3D.tsx/SetPiece3DStadium.tsxをimportする）は循環importになるため
// 行わない＝共有したい純粋な数値定数は lib/setPiece3d.ts へ置く（SkyPreset等はそちらからimport）。
//
// 性能予算: ジオメトリ・マテリアル・テクスチャはすべてモジュールスコープ/Mapキャッシュで共有し、
// 再マウントのたびに作り直さない。空ドーム・雲は「静止」要素のためuseFrameを持たない
// （frameloop="demand"の静止時無描画をそのまま保つ）。

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SkyPreset } from "@/lib/setPiece3d";

/* ============================================================
   空ドーム: canvas 1×256の縦グラデ（天頂→地平線の暖色帯→地平線直下の淡色）を
   大球(半径260、Canvasのfar=300未満に収める)の内面(BackSide)へ貼るだけの簡易表現。
   球は「カメラに常に追従するgroup」(SkyFollow、下記)の子として原点中心に置く。
   ワールド固定(ピッチ中心)ではなく毎フレームcamera.positionへ位置を合わせるため、
   カメラ→ドーム面の距離は常に半径260(<Canvasのfar=300)に保たれる＝カメラがGK目線や
   ゴール裏など原点から離れた視点に動いても、ドームの縁がfarでクリップされて空に
   多角形の穴が開くことがない。地平線が常にカメラの目線高さに見えるのは
   「無限遠にある空」の見え方として物理的にも正しい（現実の空も観測者の高さに応じて
   地平線が動くことはない＝ここでは逆に、ドームを追従させることでその近似を作る）。
   ============================================================ */

const SKY_DOME_RADIUS = 260;
const SKY_DOME_GEOM = new THREE.SphereGeometry(SKY_DOME_RADIUS, 24, 16);

const skyTextureCache = new Map<string, THREE.CanvasTexture>();
function getSkyTexture(preset: SkyPreset): THREE.CanvasTexture {
  const key = `${preset.zenith}|${preset.horizonWarm}|${preset.horizonPale}`;
  const hit = skyTextureCache.get(key);
  if (hit) return hit;
  const w = 1;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // 0=天頂(canvas上端) → 0.5=地平線(canvas中央、ドームの赤道=ワールドy=0)
    // → 1=地平線より下(隠れる側。継ぎ目を作らないためhorizonPaleのまま伸ばす)
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, preset.zenith);
    g.addColorStop(0.27, preset.zenith);
    g.addColorStop(0.46, preset.horizonWarm);
    g.addColorStop(0.5, preset.horizonPale);
    g.addColorStop(1, preset.horizonPale);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  skyTextureCache.set(key, tex);
  return tex;
}

const skyMaterialCache = new Map<string, THREE.MeshBasicMaterial>();
function getSkyMaterial(preset: SkyPreset): THREE.MeshBasicMaterial {
  const key = `${preset.zenith}|${preset.horizonWarm}|${preset.horizonPale}`;
  let m = skyMaterialCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: getSkyTexture(preset),
      side: THREE.BackSide,
      depthWrite: false,
      // スカイドームはfog対象外（仕様どおり）。霧はピッチ・スタンド側にだけ効かせ、
      // 「無限遠の背景」であるドーム自体が霧色でさらに減光されて不自然にならないようにする。
      fog: false,
    });
    skyMaterialCache.set(key, m);
  }
  return m;
}

/** 空ドーム本体。静止要素のためuseFrameは持たない（frameloop="demand"のまま） */
export function SkyDome({ preset }: { preset: SkyPreset }) {
  return <mesh geometry={SKY_DOME_GEOM} material={getSkyMaterial(preset)} renderOrder={-10} />;
}

/* ============================================================
   低空の雲（静止・canvasスプライト板2〜4枚）。frameloop="demand"のためビルボード追従はせず、
   固定角度の板を複数配置するだけの簡易表現にする（カメラ操作中もuseFrameで毎フレーム
   姿勢更新するコストを払わない＝性能予算どおり静止時は本当に無描画のまま）。
   雲自体は姿勢を変えないが、下のSkyFollowでドームと同じ追従groupの子として置くことで
   「ドーム内側の低空」という相対的な高度感だけは維持する（絶対ワールド座標での
   固定はカメラ追従との両立ができないため諦める＝仕様上許容された近似）。
   ============================================================ */

let cloudTextureCache: THREE.CanvasTexture | null = null;
function getCloudTexture(): THREE.CanvasTexture {
  if (cloudTextureCache) return cloudTextureCache;
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const blobs: [number, number, number][] = [
      [40, 34, 24],
      [70, 30, 22],
      [95, 36, 16],
      [58, 42, 18],
    ];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(0.6, "rgba(255,255,255,0.32)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  cloudTextureCache = tex;
  return tex;
}

const CLOUD_PLANE_GEOM = new THREE.PlaneGeometry(1, 1);
const cloudMaterialCache = new Map<string, THREE.MeshBasicMaterial>();
function getCloudMaterial(tint: string): THREE.MeshBasicMaterial {
  let m = cloudMaterialCache.get(tint);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: getCloudTexture(),
      color: tint,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
      // 雲はドームと違い実際にシーン内(有限距離)へ置くオブジェクトのため、他の構造物と同じく
      // 霧の影響は受けたままにする（地平線付近の雲が霧に溶け込むほうが自然）
    });
    cloudMaterialCache.set(tint, m);
  }
  return m;
}

/** 雲の配置（固定・静止）。ピッチ/スタンドの外側・空ドームの内側に収まる低空の位置に3枚 */
const CLOUD_LAYOUT: { pos: [number, number, number]; rotY: number; scale: [number, number] }[] = [
  { pos: [-125, 26, -75], rotY: 0.5, scale: [72, 26] },
  { pos: [145, 22, 45], rotY: -0.8, scale: [60, 22] },
  { pos: [-60, 30, 160], rotY: 2.4, scale: [82, 30] },
];

export function CloudLayer({ tint }: { tint: string }) {
  const mat = useMemo(() => getCloudMaterial(tint), [tint]);
  return (
    <group>
      {CLOUD_LAYOUT.map((c, i) => (
        <mesh
          key={i}
          geometry={CLOUD_PLANE_GEOM}
          material={mat}
          position={c.pos}
          rotation-y={c.rotY}
          scale={[c.scale[0], c.scale[1], 1]}
        />
      ))}
    </group>
  );
}

/* ============================================================
   SkyFollow: 空ドーム＋雲レイヤーの親グループ。毎レンダーフレーム、groupのワールド位置を
   camera.positionへ丸ごとコピーしてカメラに追従させる。これにより:
   - カメラ→ドーム球面の距離は常にSKY_DOME_RADIUS(260)固定＝Canvasのfar=300を
     どのカメラ位置・角度でも下回り続ける（GK目線・ゴール裏などピッチ中心から離れた
     視点でも、ドームの縁がfar面でクリップされて空に多角形の穴が開くことがない）。
   - 雲もこのgroupの子のため、ドーム内側の低空という相対的な位置関係を保ったまま
     一緒に追従する（絶対ワールド座標に固定された「その場にある雲」ではなくなるが、
     カメラから見た距離・高度感は常にCLOUD_LAYOUT通りに保たれる＝仕様が許容する近似）。
   useFrameはframeloop="demand"下でも実際にレンダーされたフレームでしか呼ばれないため、
   ここで行うのは単純な位置コピーだけ＝静止時に余計な再描画・追従計算が走ることはなく、
   demandモードの「静止時は無描画」という性能特性はそのまま保たれる。
   ============================================================ */
export function SkyFollow({ preset, cloudTint }: { preset: SkyPreset; cloudTint: string }) {
  const followRef = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    followRef.current?.position.copy(camera.position);
  });
  return (
    <group ref={followRef}>
      <SkyDome preset={preset} />
      <CloudLayer tint={cloudTint} />
    </group>
  );
}
