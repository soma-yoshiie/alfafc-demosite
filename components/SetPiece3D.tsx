"use client";

// セットプレー3Dビューア本体（R3F/three.js を直接importする重いコンポーネント）。
// SetPieceBoard.tsx から next/dynamic({ssr:false}) 経由でのみ読み込む
// （このファイルを他画面から静的importしないこと＝バンドル分離を保つ）。
// 3D側は閲覧専用（Phase 1: 静止シーン。編集・アニメ再生はPhase 2以降）。

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useBoard } from "./BoardProvider";
import { actorColor } from "@/lib/colors";
import type { Actor, Move, Shape, TextShape, ZoneShape } from "@/lib/types";
import { moveKind } from "@/lib/types";
import {
  boardToWorld,
  boardXToWorldX,
  boardYToWorldZ,
  buildPitchMarkings,
  computeCameraPreset,
  GOAL_HEIGHT_M,
  GOAL_NET_DEPTH_M,
  GOAL_WIDTH_M,
  lenXToMeters,
  lenYToMeters,
  PITCH_LENGTH_M,
  PITCH_WIDTH_M,
  type CameraPresetId,
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
   ピッチ（地面・マーキング・ゴール）
   ============================================================ */

const GRASS_MARGIN_M = 3;
const STRIPE_COUNT = 11;

/** 芝: 2トーンの縞（ストライプはメートル基準の平面を並べるだけ＝テクスチャUVの向き違いによる
 * ズレのリスクを避け、トークン座標と同じ boardXToWorldX/boardYToWorldZ 系だけで組み立てる） */
function PitchGround() {
  const totalLen = PITCH_LENGTH_M + GRASS_MARGIN_M * 2;
  const totalWidth = PITCH_WIDTH_M + GRASS_MARGIN_M * 2;
  const stripeLen = totalLen / STRIPE_COUNT;
  // 寸法は定数のみに依存する不変データなので、boardの再レンダーごとに作り直さない
  const stripes = useMemo(
    () =>
      Array.from({ length: STRIPE_COUNT }, (_, i) => ({
        z: -totalLen / 2 + stripeLen * (i + 0.5),
        color: i % 2 === 0 ? "#1f8c4f" : "#15803d",
      })),
    [totalLen, stripeLen]
  );
  return (
    <group>
      {stripes.map((s, i) => (
        <mesh key={i} position={[0, 0, s.z]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[totalWidth, stripeLen + 0.02]} />
          <meshStandardMaterial color={s.color} roughness={0.96} />
        </mesh>
      ))}
    </group>
  );
}

/** 外枠・ハーフウェイライン・センターサークル・PA/GA・PKマーク・コーナーアーク */
function PitchLines() {
  // 寸法は定数のみに依存する不変データなので、boardの再レンダーごとに作り直さない
  const markings = useMemo(() => buildPitchMarkings(), []);
  return (
    <group>
      {markings.lines.map((pts, i) => (
        <Line
          key={i}
          points={pts.map((p) => [p.x, 0.012, p.z] as [number, number, number])}
          color="#ffffff"
          lineWidth={0.1}
          worldUnits
          transparent
          opacity={0.85}
        />
      ))}
      {markings.spots.map((p, i) => (
        <mesh key={i} position={[p.x, 0.014, p.z]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.09, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** ゴール（ポスト・クロスバー・簡易ネット）。end=1が敵陣(y100)側、-1が自陣(y0)側 */
function Goal({ end }: { end: 1 | -1 }) {
  const z = end * (PITCH_LENGTH_M / 2);
  const halfGoal = GOAL_WIDTH_M / 2;
  const postR = 0.05;
  const netZ = z + end * (GOAL_NET_DEPTH_M / 2);
  const postMat = "#f4f6fa";
  return (
    <group>
      <mesh position={[-halfGoal, GOAL_HEIGHT_M / 2, z]} castShadow>
        <cylinderGeometry args={[postR, postR, GOAL_HEIGHT_M, 10]} />
        <meshStandardMaterial color={postMat} />
      </mesh>
      <mesh position={[halfGoal, GOAL_HEIGHT_M / 2, z]} castShadow>
        <cylinderGeometry args={[postR, postR, GOAL_HEIGHT_M, 10]} />
        <meshStandardMaterial color={postMat} />
      </mesh>
      <mesh position={[0, GOAL_HEIGHT_M, z]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[postR, postR, GOAL_WIDTH_M, 10]} />
        <meshStandardMaterial color={postMat} />
      </mesh>
      {/* 簡易ネット（奥行のある半透明ボックスで代用。Phase1はネット編み目までは再現しない） */}
      <mesh position={[0, GOAL_HEIGHT_M / 2, netZ]}>
        <boxGeometry args={[GOAL_WIDTH_M, GOAL_HEIGHT_M, GOAL_NET_DEPTH_M]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ============================================================
   ゾーン図形・テキスト図形（床面投影）
   ============================================================ */

function ZoneMesh({ shape }: { shape: ZoneShape }) {
  const cx = boardXToWorldX(shape.x);
  const cz = boardYToWorldZ(shape.y);
  const col = shape.color ?? "#ffe27a";
  if (shape.kind === "zoneEllipse") {
    const rx = Math.max(0.05, lenXToMeters(shape.w) / 2);
    const rz = Math.max(0.05, lenYToMeters(shape.h) / 2);
    return (
      <mesh position={[cx, 0.02, cz]} rotation-x={-Math.PI / 2} scale={[rx, rz, 1]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial color={col} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    );
  }
  const w = Math.max(0.1, lenXToMeters(shape.w));
  const h = Math.max(0.1, lenYToMeters(shape.h));
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
function TextShapeLabel({ shape }: { shape: TextShape }) {
  const x = boardXToWorldX(shape.x);
  const z = boardYToWorldZ(shape.y);
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

function ShapesFloor() {
  const shapes = useVisibleShapes();
  return (
    <group>
      {shapes.map((s) => {
        if (s.kind === "zoneEllipse" || s.kind === "zoneRect") return <ZoneMesh key={s.id} shape={s} />;
        if (s.kind === "text") return <TextShapeLabel key={s.id} shape={s} />;
        // Phase1は仕様どおりゾーン/テキストのみ床へ投影する（矢印・連結ライン・囲み枠は対象外）
        return null;
      })}
    </group>
  );
}

/* ============================================================
   動線（moves）: パス=破線 / ラン・ドリブル・シュート=実線
   ============================================================ */

function MoveLine3D({ move, color }: { move: Move; color: string }) {
  if (move.path.length < 2) return null;
  const kind = moveKind(move);
  const dashed = kind === "pass";
  const pts = move.path.map((p) => {
    const w = boardToWorld(p);
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

function MovesFloor() {
  const board = useBoard();
  const moves = board.state.moves.filter((m) => (m.step ?? 0) === board.viewStep);
  return (
    <group>
      {moves.map((m, i) => (
        <MoveLine3D key={i} move={m} color={actorColor(m.actor, board.state.slots)} />
      ))}
    </group>
  );
}

/* ============================================================
   トークン（選手・相手・ボール）
   ============================================================ */

const CAPSULE_HEIGHT_M = 1.4;
const CAPSULE_RADIUS_M = 0.24;
const CAPSULE_CYL_M = Math.max(0.05, CAPSULE_HEIGHT_M - CAPSULE_RADIUS_M * 2);

function TokenCapsule({ x, z, color, label }: { x: number; z: number; color: string; label: string }) {
  return (
    <group>
      <mesh position={[x, CAPSULE_HEIGHT_M / 2, z]} castShadow receiveShadow>
        <capsuleGeometry args={[CAPSULE_RADIUS_M, CAPSULE_CYL_M, 4, 12]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
      <Html position={[x, CAPSULE_HEIGHT_M + 0.34, z]} center pointerEvents="none" zIndexRange={[10, 0]}>
        <div className="sp3d-num">{label}</div>
      </Html>
    </group>
  );
}

function TokensLayer() {
  const board = useBoard();
  const { slots, players, ball } = board.state;
  const opponents = board.state.opponents ?? [];
  return (
    <group>
      {slots.map((s, i) => {
        if (s.pid == null) return null;
        const player = players.find((p) => p.id === s.pid) ?? null;
        return (
          <TokenCapsule
            key={`p${i}`}
            x={boardXToWorldX(s.x)}
            z={boardYToWorldZ(s.y)}
            color={actorColor(i, slots)}
            label={String(player?.number ?? "–")}
          />
        );
      })}
      {opponents.map((o, i) => (
        <TokenCapsule
          key={`o${i}`}
          x={boardXToWorldX(o.x)}
          z={boardYToWorldZ(o.y)}
          color={actorColor(`opp${i}` as Actor, slots)}
          label={o.label}
        />
      ))}
      <mesh position={[boardXToWorldX(ball.x), 0.11, boardYToWorldZ(ball.y)]} castShadow>
        <sphereGeometry args={[0.11, 20, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.45} />
      </mesh>
    </group>
  );
}

/* ============================================================
   カメラ制御（プリセット間をイージング移動。reduced-motionは即時ジャンプ）
   ============================================================ */

function CameraController({
  preset,
  reducedMotion,
  controlsRef,
}: {
  preset: CameraPresetId;
  reducedMotion: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const board = useBoard();
  const { camera } = useThree();
  // 遷移開始時点の最新state("s"を読むためだけ。依存配列には入れず、preset変更時にのみ読む)
  const stateRef = useRef(board.state);
  stateRef.current = board.state;

  const fromPos = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const t = useRef(1);
  const mounted = useRef(false);

  useEffect(() => {
    const pose = computeCameraPreset(preset, stateRef.current);
    const controls = controlsRef.current;
    if (!mounted.current) {
      // 初回マウント：Canvasの初期カメラ位置と揃えるだけなので遷移させない
      mounted.current = true;
      camera.position.set(...pose.position);
      controls?.target.set(...pose.target);
      controls?.update();
      t.current = 1;
      return;
    }
    if (reducedMotion) {
      camera.position.set(...pose.position);
      controls?.target.set(...pose.target);
      controls?.update();
      t.current = 1;
      return;
    }
    fromPos.current.copy(camera.position);
    fromTarget.current.copy(controls?.target ?? fromPos.current);
    toPos.current.set(...pose.position);
    toTarget.current.set(...pose.target);
    t.current = 0;
    // preset切替の瞬間のみ再計算する（board.state の変化そのものには追従させない設計）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, reducedMotion, camera, controlsRef]);

  useFrame((_, delta) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + delta / 0.7);
    const e = 1 - Math.pow(1 - t.current, 3);
    camera.position.lerpVectors(fromPos.current, toPos.current, e);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerpVectors(fromTarget.current, toTarget.current, e);
      controls.update();
    }
  });

  return null;
}

/* ============================================================
   本体
   ============================================================ */

export default function SetPiece3D({ preset }: { preset: CameraPresetId }) {
  const board = useBoard();
  const reducedMotion = usePrefersReducedMotion();
  // 初回マウント時のカメラ位置のみに使う（以後はCameraControllerが管理）
  const [initialPose] = useState(() => computeCameraPreset(preset, board.state));
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <div className="pitchwrap sp3dwrap">
      <div className="pitch sp3dpitch">
        <Canvas
          // three r185で shadows="soft" 文字列指定が非推奨のため、同じ挙動(PCFSoftShadowMap)の
          // 真偽値指定へ変更（@react-three/fiberは shadows={true} も文字列"soft"と同じ
          // gl.shadowMap.type=PCFSoftShadowMapになる。挙動は変わらない）。
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 50, near: 0.1, far: 300, position: initialPose.position }}
        >
          <ambientLight intensity={0.65} />
          <directionalLight
            position={[18, 26, 14]}
            intensity={1.15}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-radius={6}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
            shadow-camera-near={1}
            shadow-camera-far={80}
          />
          <PitchGround />
          <PitchLines />
          <Goal end={1} />
          <Goal end={-1} />
          <ShapesFloor />
          <MovesFloor />
          <TokensLayer />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan
            enableRotate
            enableZoom
            enableDamping
            dampingFactor={0.08}
            // kicker目線はゴール中心を狙うため注視点までの距離が伸びやすい（CKなど）。
            // 従来のminDistance(4)だとその状態から寄りたい時の余地が狭いため緩める。
            minDistance={1.5}
            maxDistance={140}
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
          <CameraController preset={preset} reducedMotion={reducedMotion} controlsRef={controlsRef} />
        </Canvas>
      </div>
    </div>
  );
}
