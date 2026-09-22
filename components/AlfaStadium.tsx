"use client";

// Blender製スタジアムGLB(ALFA_Stadium_V5_6_1.glb / 81.7MB・892メッシュ・約146万tris・
// 37マテリアル共有・テクスチャ0・単一ルートALFA_EXPORT_ROOT)を読み込み、品質「高」のときだけ
// components/SetPiece3D.tsx から描画される（specs/setpiece-redesign.md §13。中・軽は
// tris予算と「中では.glbを読み込ませない」方針から従来のprocedural一式を使う。判断は
// SetPiece3D.tsx側の glbStadium = quality === "high" で行い、フォーマットは見ない）。
// 「高」なら8人制でもこのGLBを使う。GLBのピッチは105×68m(11人制)固定のため、8人制では
// pitchMode="app" を渡し、GLBの「ピッチ面の上の物」（ライン・ゴールのポスト/バー/ネット・
// コーナーフラッグ）を非表示にして、アプリ側のPitchLines/Goal×2/CornerFlags（8人制寸法）を
// SetPiece3D.tsx側で重ねて描く。芝(Pitch_Base)と芝の縞はGLBのまま残す＝「フルピッチの中に
// 8人制のラインを引いた」実物どおりの見え方。11人制は pitchMode="glb"（何も隠さない）。
// components/SetPiece3D.tsx からのみimportすること（SetPiece3DStadium.tsx/SetPiece3DEnv.tsxと
// 同じ「3D本体と同じチャンクに留めてバンドル分離を保つ」流儀）。three系importはこのファイルと
// SetPiece3D系のみに限定する制約があるため、lib/setPiece3d.ts（three非依存）へは一切importしない。
//
// 【ルート変換（1箇所のみ）】
//   <group rotation={[0, -Math.PI/2, 0]} position={[0, -0.32, 0]}> に <primitive object={gltf.scene}/>
//   根拠: GLBはX軸が105m長辺（ゴールライン x=±52.5）、Z軸が68m幅（タッチライン z=±34）。
//   アプリ側は既存規約で X軸=ピッチ幅(タッチライン方向)・Z軸=ピッチ長(ゴールライン方向)
//   （lib/setPiece3d.ts の dims.pitchWidthM⇔X, dims.pitchLengthM⇔Z、boardXToWorldX/boardYToWorldZ
//   参照）。rotation.y=-90°はGLBローカル(x,z)をアプリワールド(z,x)へ写す変換
//   （worldX=-localZ, worldZ=localX）で、GLBの幅軸(Z)がアプリのX軸へ、GLBの長さ軸(X)が
//   アプリのZ軸へちょうど一致する＝南タッチラインが放送カメラ側のアプリ-X寄りに来る向き。
//   position.y=-0.32はGLBの芝表面実測(y=0.32)をアプリの地面基準(y=0)へ落とすオフセット。
//   この1つのgroup変換だけで済ませ、子メッシュへ個別の回転・スケールは一切当てない。
//
// 【マテリアル補正（初回ロード後に1回だけ・useEffect内でscene.traverse）】
//   V5.3以降は全マテリアルにPBR定数がベイクされているため色補正は不要。
//   KHR_transmission系の2種（ガラス）だけは透過パスのレンダリングコストが高いため、
//   MeshStandardMaterial(color維持・transparent・roughness/metalness固定)へ差し替える
//   （置換後マテリアルはモジュールスコープでキャッシュし、同じ元マテリアルに対して1つだけ生成する）。
//   他のマテリアルはエクスポートされたままで問題ないため無加工。
//
// 【広告/スクリーンAPI】
//   setStadiumAd(slot, source) で4面の広告サーフェスへ静止画/動画/canvasを適用できる。
//   ロード前の呼び出しはpendingへ積み、ロード完了時に反映する。getStadiumScreen(name)は
//   任意の名前付きスクリーン（スコアボード等）をノード名で取得する将来利用向けAPI。
//   スクリーン用に生成したテクスチャ・マテリアルは「自作分のみ」dispose管理する
//   （GLB自体はテクスチャを持たないため、差し替え前の状態には自作テクスチャが存在しない）。

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

/** GLB配置パス（相対パス。components/SetPiece3D.tsx の MODEL_URL="models/player.glb" と
 * 同じ方式＝GitHub Pagesのサブパス配信・next.config.mjsのoutput:"export"どちらでも解決できる）。 */
const STADIUM_GLB_URL = "models/stadium/ALFA_Stadium_V5_6_1_packed.glb";

// 注意: useGLTF.preload(STADIUM_GLB_URL) はあえて呼ばない。
// 重量級アセット（配信用に圧縮しても11.7MB）を、品質「高」以外（中・軽）のユーザーも含めて
// 全員に無条件でダウンロードさせるべきではないという設計判断による（中・軽は従来の
// procedural一式のままGLBを一切参照しない＝そのユーザーには存在しないファイルのはずなので、
// なおさら先読みすべきではない。§13の受け入れ「中でNetworkに.glbが出ない」もこれに依る）。
// <Suspense>によるオンデマンド読み込みのみに任せる。

/* V5.2で必要だった「baseColor未設定→白化」7マテリアルへの色補正(SOLID_COLOR_FIXUPS)は撤廃。
 * V5.3はエクスポート直前にプロシージャルをPrincipled PBR定数へ変換して出力するようになり、
 * 全37マテリアルにbaseColorFactorが入っていることをGLBのJSONチャンクで実測確認済み
 * （例: ALFA_M_Grass=[0.055,0.34,0.10] 緑）。Blender側の色設計をそのまま使う。 */

/** ガラス系(KHR_transmission)の置換先マテリアルopacity。透過(transmission)パスは
 * ドローコール・ソートコストが高いため、単純な半透明(MeshStandardMaterial+opacity)へ落とす。 */
const GLASS_OPACITY: Record<string, number> = {
  ALFA_M_Glass: 0.38,
  ALFA_M_Glass_Dark: 0.3,
};

/** ガラス置換マテリアルのモジュールキャッシュ（元マテリアル名→生成物を1つだけ保持）。
 * このGLBはページ生存期間中ずっと保持される想定のアセットのため、他の共有マテリアル
 * キャッシュ（components/SetPiece3D.tsxのmaterialCache等）と同じく明示的なdisposeは行わない。 */
const glassReplacementCache = new Map<string, THREE.MeshStandardMaterial>();
function getGlassReplacement(orig: THREE.MeshStandardMaterial, opacity: number): THREE.MeshStandardMaterial {
  const hit = glassReplacementCache.get(orig.name);
  if (hit) return hit;
  const replacement = new THREE.MeshStandardMaterial({
    color: orig.color.clone(),
    transparent: true,
    opacity,
    roughness: 0.15,
    metalness: 0.1,
    // 元マテリアルのside設定を引き継ぐ（GLBのマテリアルはほぼ全てDoubleSide。ここで
    // 落とすとFrontSideになり、ファサードのガラス板が視点によって消える）。
    side: orig.side,
  });
  replacement.name = orig.name;
  glassReplacementCache.set(orig.name, replacement);
  return replacement;
}

/** 1マテリアルぶんの名前ベース補正（現在はガラス置換のみ）。該当しないマテリアルはそのまま返す。 */
function fixupMaterial(mat: THREE.Material): THREE.Material {
  const glassOpacity = GLASS_OPACITY[mat.name];
  if (glassOpacity != null) {
    return getGlassReplacement(mat as THREE.MeshStandardMaterial, glassOpacity);
  }
  return mat;
}

/** 芝面（受影のみ有効にする対象）のノード名。それ以外の全メッシュはcast/receiveShadowとも
 * falseにする（876メッシュぶんの座席等へ無差別に実シャドウを付けないという性能予算のため）。 */
const PITCH_RECEIVE_SHADOW_NAME = "Pitch_Base";

/* ============================================================
   「ピッチ面の上の物」（8人制で非表示にするGLBメッシュ）の判定
   （specs/setpiece-redesign.md §13）
   ============================================================ */

/** 8人制(pitchMode="app")で隠す対象のマテリアル名。ライン＝White、ネット＝GoalNet、
 * フラッグ布＝Stone_Light。ポスト・バー・フラッグ支柱もWhite。配信用GLBはgltfpack -knで
 * ランタイム参照14ノード以外のノード名が落ちているため、ノード名ではなく
 * 「マテリアル名＋ワールド座標の位置」で判定する。Stone_Lightはスタンドの外壁など
 * ピッチ外にも多数（約150）あるが、下の位置条件で除外される。 */
const PITCH_LEVEL_MATERIAL_NAMES = new Set(["ALFA_M_White", "ALFA_M_GoalNet", "ALFA_M_Stone_Light"]);

/** 位置条件（ルートgroupの回転−90°・y−0.32を反映したアプリ側ワールド座標）。
 * |x|≤36: タッチライン(z=±34→アプリのx)＋コーナーフラッグ分の余白。
 * |z|≤56: ゴールライン(x=±52.5→アプリのz)＋ゴール奥行き(ネット後端)の余白。
 * y≤7: ゴール高2.44m・フラッグ1.5m程度を含み、屋根・スタンド・広告面は含まない。 */
const PITCH_LEVEL_MAX_ABS_X_M = 36;
const PITCH_LEVEL_MAX_ABS_Z_M = 56;
const PITCH_LEVEL_MAX_Y_M = 7;

/** 集めた「ピッチ面の上の物」。useGLTFのシーンはページ生存中共有される
 * （AlfaStadiumを再マウントしても同じメッシュ実体）ため、一度集めればモジュールスコープに
 * 保持したまま、マウントのたび・pitchModeが変わるたびにvisibleを代入し直せる。
 * 収集の「一度きり」判定はこの配列の空判定で行う（scene.userData.__alfaProcessedではない）。
 * devのFast Refreshでこのモジュールが再評価されると、この配列だけが空に戻る一方で
 * scene.userData側のフラグ（drei/useGLTFキャッシュの寿命）は残るため、フラグで判定すると
 * 以後visible代入が空配列を回すだけになり、GLBメッシュのvisibleが編集直前の状態で固定される
 * （11人制なのにライン・ゴールが消える／8人制で二重に出る）。配列が空なら集め直す。 */
const pitchLevelMeshes: THREE.Mesh[] = [];

/** objがBALL_ROOT配下かどうか（親をたどる）。ノード名が残っているのは14ノードだけだが、
 * BALL_ROOTはその1つのため名前で判定できる。 */
function isUnderBallRoot(obj: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = obj.parent;
  while (p) {
    if (p.name === "BALL_ROOT") return true;
    p = p.parent;
  }
  return false;
}

/** メッシュの材質名が対象（White/GoalNet/Stone_Light）かどうか。配列マテリアルは
 * いずれか1つでも該当すれば対象とする（実測ではこのGLBの対象メッシュは全て単一マテリアル）。 */
function hasPitchLevelMaterial(mesh: THREE.Mesh): boolean {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => m != null && PITCH_LEVEL_MATERIAL_NAMES.has(m.name));
}

/** ワールド座標のBox3が位置条件に収まるかどうか。呼び出し前にルートgroupの
 * updateMatrixWorld(true)が済んでいること（matrixWorldが未更新だとGLBローカル座標のまま
 * 判定してしまい、X/Zの取り違えで対象を取りこぼす）。 */
function isWithinPitchLevelBounds(mesh: THREE.Mesh): boolean {
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return false;
  return (
    box.min.x >= -PITCH_LEVEL_MAX_ABS_X_M &&
    box.max.x <= PITCH_LEVEL_MAX_ABS_X_M &&
    box.min.z >= -PITCH_LEVEL_MAX_ABS_Z_M &&
    box.max.z <= PITCH_LEVEL_MAX_ABS_Z_M &&
    box.max.y <= PITCH_LEVEL_MAX_Y_M
  );
}

/* ============================================================
   動的スクリーン（広告4面・スコアボード2面）
   ============================================================ */

/** 広告サーフェスの論理スロット名（北/南タッチライン・東/西ゴールライン）。 */
export type StadiumAdSlot = "north" | "south" | "east" | "west";

/** スロット→GLBノード名。GLB実測のノード名をそのまま使う。 */
const AD_SLOT_NODE_NAMES: Record<StadiumAdSlot, string> = {
  north: "AD_TOUCHLINE_NORTH_VIDEO_SURFACE",
  south: "AD_TOUCHLINE_SOUTH_VIDEO_SURFACE",
  east: "AD_GOALLINE_EAST_VIDEO_SURFACE",
  west: "AD_GOALLINE_WEST_VIDEO_SURFACE",
};
const AD_SLOT_NODE_NAME_SET = new Set(Object.values(AD_SLOT_NODE_NAMES));

/** 法線がピッチと逆（外向き）の広告面。GLB実測でsouth/eastの2面は面の表がスタンド側を向いて
 * いるため、ピッチ側からはDoubleSideの「裏面」を見ることになり、テクスチャが鏡文字になる。
 * ロード時にこの2面のUVのuを左右反転(u→1-u)して、ピッチ側から正しく読める向きに直す
 * （表側=スタンド基部の内側に埋まっていて見えない面が代わりに鏡文字になるが実害なし。
 * 静止画・動画どちらのソースでも同じ扱いで正しくなる）。 */
const AD_BACKFACING_NODE_NAMES = new Set([
  "AD_TOUCHLINE_SOUTH_VIDEO_SURFACE",
  "AD_GOALLINE_EAST_VIDEO_SURFACE",
]);

/** スコアボード2面のノード名（将来動的化のための実証。setStadiumAdの対象ではなく
 * getStadiumScreenでの発見のみを想定）。 */
const SCOREBOARD_NODE_NAMES = ["Scoreboard_Screen_1", "Scoreboard_Screen_-1"];

type AdSource = string | HTMLVideoElement | HTMLCanvasElement;

/** ロード完了後に発見された「名前付きスクリーン」ノード（広告4面+スコアボード2面）。
 * ノード名→メッシュの対応はGLBシーンが生存する限り不変のため、モジュールスコープで
 * 一度登録すれば以後ずっと有効（AlfaStadiumの再マウントをまたいでも使える）。
 * pitchLevelMeshesと同じく、登録の有無はこのMapの空判定で見る（Fast Refreshで空に戻ったら
 * 登録し直す。登録し直さないと広告面へのテクスチャ適用が飛び、devで白ポリのまま残る）。 */
const screenRegistry = new Map<string, THREE.Mesh>();

/** 現在そのノードに適用中の「自作」広告テクスチャ/マテリアル（差し替え・アンマウント時に
 * disposeする対象はここに載っているものだけ＝GLB自体はテクスチャを持たないため、
 * ここに無い＝まだ何も自作テクスチャを当てていない状態を意味する）。 */
const activeScreens = new Map<string, { material: THREE.MeshBasicMaterial; texture: THREE.Texture }>();

/** ロード完了前にsetStadiumAdが呼ばれた場合の積み残し（ロード完了時に一度だけ反映し、消費する）。 */
const pendingAds = new Map<StadiumAdSlot, AdSource>();

/** 画像URL/動画/canvasのいずれかからテクスチャを作る。glTFのUV規約(V下向き)とthree.jsの
 * デフォルトUV展開(flipY=true)が食い違うため、ここで作る全テクスチャは常にflipY=falseにする
 * （canvas側は通常どおり上から描画すればよく、特別な反転描画は不要）。colorSpaceは
 * このアプリの他の自作canvasテクスチャ（components/SetPiece3D.tsx getNumberTexture等）と
 * 同じくSRGBColorSpaceに揃え、画面ごとに色味がずれないようにする。 */
function textureFromSource(source: AdSource): THREE.Texture {
  let tex: THREE.Texture;
  if (typeof source === "string") {
    tex = new THREE.TextureLoader().load(source);
  } else if (source instanceof HTMLVideoElement) {
    tex = new THREE.VideoTexture(source);
  } else {
    tex = new THREE.CanvasTexture(source);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  return tex;
}

/** LED/ビデオパネル向けのマテリアル。スクリーン発光を表現するためtoneMapped=falseにする
 * （ACESFilmicトーンマッピングの影響を受けさせず、canvas/video側の色をそのまま出す）。 */
function buildAdMaterial(source: AdSource): { material: THREE.MeshBasicMaterial; texture: THREE.Texture } {
  const texture = textureFromSource(source);
  // side: 広告面の法線はGLB実測で2面(south/east)がピッチと逆向きのため、FrontSide(既定)だと
  // 背面カリングでピッチ側から真っ黒になる。GLBの他マテリアルと同じくDoubleSideにする
  // （表裏どちらから見ても表示され、裏面から見ても鏡像にはならないことを実機確認済み）。
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
  return { material, texture };
}

/** ノード名を指定してスクリーンへテクスチャを適用する内部ヘルパー。登録済みでなければ何もしない
 * （setStadiumAdはpendingへ積むところまでを担当し、実際の適用はロード完了時のトラバース後に行う）。
 * 直前に自作テクスチャが当たっていればここでdisposeする（「旧テクスチャは自作分のみdispose」＝
 * activeScreensに載っているものは常に自作なので、この関数が唯一の適用経路である限り常に成立する）。 */
function applyAdToNode(nodeName: string, source: AdSource): void {
  const mesh = screenRegistry.get(nodeName);
  if (!mesh) return;
  const prev = activeScreens.get(nodeName);
  const { material, texture } = buildAdMaterial(source);
  mesh.material = material;
  activeScreens.set(nodeName, { material, texture });
  if (prev) {
    prev.material.dispose();
    prev.texture.dispose();
  }
}

/**
 * 広告サーフェスへ静止画/動画/canvasを適用する（モジュールexport）。
 * ロード未完了（screenRegistryに未登録）のときはpendingへ積み、AlfaStadiumのロード完了処理が
 * 一度だけ消費して適用する。ロード済みなら即座に反映する。
 */
export function setStadiumAd(slot: StadiumAdSlot, source: AdSource): void {
  const nodeName = AD_SLOT_NODE_NAMES[slot];
  if (screenRegistry.has(nodeName)) {
    applyAdToNode(nodeName, source);
  } else {
    pendingAds.set(slot, source);
  }
}

/** 名前付きスクリーン（広告4面・スコアボード2面）をノード名で取得する（将来のスコアボード
 * 動的化等に利用）。未ロード・該当ノードなしの場合はnull。 */
export function getStadiumScreen(name: string): THREE.Mesh | null {
  return screenRegistry.get(name) ?? null;
}

/* ============================================================
   プレースホルダー広告/スコアボード（AlfaStadium内に自前実装。既存のLED看板
   （lib/setPiece3d.ts の LED_TEXT等、components/SetPiece3DStadium.tsx専用）とは
   独立した文言・生成関数にする＝procedural側との依存を作らない）。
   ============================================================ */

const AD_PLACEHOLDER_TEXT = "ALFA FOOTBALL  ◇  TACTICAL STUDIO  ◇  PLAY SMARTER";

/** 広告面プレースホルダー: 紺地に白文字（2048×64相当の横長パネル）。 */
function makeAdPlaceholderCanvas(): HTMLCanvasElement {
  const w = 2048;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0d2f6b";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 40px system-ui, sans-serif";
    ctx.fillText(AD_PLACEHOLDER_TEXT, w / 2, h / 2 + 2);
  }
  return canvas;
}

/** スコアボードプレースホルダー: スコア「0-0」+時計「00:00」+ALFA FOOTBALLロゴ風文字
 * （将来の動的化＝試合中の実スコア/時計連動を見据えた実証用の静的表示）。
 * V5.2ではキューブ十字UVのボックス+座席に埋もれた位置のため保留していたが、V5.3で
 * 「単一クアッド(4頂点)・全面0..1 UV・屋根縁の可視位置(z=±92.5、y38.2〜42.3)」へ
 * 修正されたことをGLB実測で確認し、広告4面と同じ経路(applyAdToNode)で有効化した。 */
function makeScoreboardPlaceholderCanvas(): HTMLCanvasElement {
  const w = 512;
  const h = 288;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0a1a33";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillText("ALFA FOOTBALL", w / 2, 54);
    ctx.font = "800 84px system-ui, sans-serif";
    ctx.fillText("0 - 0", w / 2, h / 2 + 20);
    ctx.fillStyle = "#ffe27a";
    ctx.font = "700 38px system-ui, sans-serif";
    ctx.fillText("00:00", w / 2, h - 40);
  }
  return canvas;
}

/* ============================================================
   スタジアム境界（Box3）の要約（カメラUXオーバーホール用）。
   ロード完了処理の中で、ルートgroup（rotation/position適用後）から一度だけ
   new THREE.Box3().setFromObject() を計算し、three非依存の数値の組だけを
   components/SetPiece3D.tsx へ公開する（three系型を跨いで渡さない＝呼び出し側は
   このファイルをimportできる、という既存の非対称importの向きをそのまま使う）。
   GLBはページ生存中ずっと同じ実寸のため、一度計算したら以後は再計算しない
   （品質切替でAlfaStadiumが再マウントされても、stadiumBoundsSummaryは
   モジュールスコープに残ったまま＝subscribeStadiumBoundsは即座にその値を返せる）。
   ============================================================ */
export interface StadiumBoundsSummary {
  centerX: number;
  centerY: number;
  centerZ: number;
  /** 中心からの最大水平距離（m）。bboxのXZ方向の半対角＝「外観フィット距離」計算の入力。 */
  radiusH: number;
  /** 全高（m、bboxのY方向サイズ） */
  height: number;
  /** 最高点のワールドY座標（m） */
  maxY: number;
}

let stadiumBoundsSummary: StadiumBoundsSummary | null = null;
const stadiumBoundsListeners = new Set<(b: StadiumBoundsSummary) => void>();

/** 現在判明しているスタジアム境界の要約（GLB未ロードならnull）。 */
export function getStadiumBoundsSummary(): StadiumBoundsSummary | null {
  return stadiumBoundsSummary;
}

/** 境界が判明した時に1回通知するコールバックを登録する。登録時点で既に判明していれば
 * （品質切替でAlfaStadiumが再マウントされた後の再購読等）即座に1回呼ぶ。戻り値は解除関数。 */
export function subscribeStadiumBounds(cb: (b: StadiumBoundsSummary) => void): () => void {
  if (stadiumBoundsSummary) cb(stadiumBoundsSummary);
  stadiumBoundsListeners.add(cb);
  return () => {
    stadiumBoundsListeners.delete(cb);
  };
}

/** ルートgroup（rotation適用後）のワールドBox3から要約を1回だけ計算して公開する
 * （2回目以降の呼び出しは無視＝GLBは静的アセットのため再計算不要）。 */
function computeAndPublishStadiumBounds(root: THREE.Object3D): void {
  if (stadiumBoundsSummary) return;
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const summary: StadiumBoundsSummary = {
    centerX: center.x,
    centerY: center.y,
    centerZ: center.z,
    radiusH: Math.hypot(size.x / 2, size.z / 2),
    height: size.y,
    maxY: box.max.y,
  };
  stadiumBoundsSummary = summary;
  stadiumBoundsListeners.forEach((cb) => cb(summary));
}

/* ============================================================
   本体
   ============================================================ */

/** 8人制でGLBの「ピッチ面の上の物」を隠すかどうか（specs/setpiece-redesign.md §13）。
 * "glb"＝11人制（GLBのライン・ゴール・フラッグをそのまま見せる）、
 * "app"＝8人制（GLB側を隠し、SetPiece3D.tsxがアプリ側のPitchLines/Goal×2/CornerFlagsを重ねる）。 */
export type StadiumPitchMode = "glb" | "app";

export function AlfaStadium({ pitchMode }: { pitchMode: StadiumPitchMode }) {
  const gltf = useGLTF(STADIUM_GLB_URL) as unknown as { scene: THREE.Group };
  // frameloop="demand"のため、visibleを書き換えた後は明示的にinvalidate()して再描画させる。
  const invalidate = useThree((s) => s.invalidate);
  // rotation/position適用後のルートgroup参照（境界計算はこのrefに対して行う。
  // gltf.scene自身に対して行うと、祖先のrotationがまだ反映されていないタイミングで
  // 呼ばれた場合に不正確になりうるため、祖先を持たないこのルート自体を対象にする）。
  const rootRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const scene = gltf.scene;

    // (a)(b): マテリアル補正・シャドウ設定・広告面のUV反転・GLB同梱ボールの非表示は、
    // 「シーンを書き換える」処理なのでこのGLBシーンに対して一度だけ行う（scene.userDataへ
    // 処理済みフラグを立てて判定する＝drei/useGLTFのロード結果キャッシュにより、AlfaStadiumが
    // 再マウントされても同じsceneインスタンスが返るため、フラグはページ生存中ずっと有効）。
    // 以後、毎フレームのtraverseは行わない。
    // (c)(d)の「モジュールスコープの登録簿」（screenRegistry・pitchLevelMeshes）はこのブロックに
    // 入れない: フラグはシーン側（useGLTFキャッシュ）の寿命、登録簿はこのモジュールの寿命で、
    // devのFast Refreshでこのファイルが再評価されると登録簿だけが空に戻る。フラグで一度きりに
    // すると以後二度と集め直されず、visible代入が空回りしてGLBのライン・ゴールが編集直前の状態で
    // 固定される（§13の判定そのものが無効になる）ため、登録簿は自分自身の空判定で集め直す。
    if (!scene.userData.__alfaProcessed) {
      scene.userData.__alfaProcessed = true;
      // V5.3同梱のマッチボール(BALL_ROOT: ピッチ中央・直径0.22m)は非表示にする。
      // ボールの見た目・位置・アニメはアプリ側のBall3D(SetPiece3D.tsx)が唯一の正であり、
      // GLB側のボールを出すと「ボールが2つ」になるため（仕様の"only one visible football"）。
      // 将来Ball3Dの見た目をこのモデルへ差し替える場合はここからcloneして使う。
      const glbBall = scene.getObjectByName("BALL_ROOT");
      if (glbBall) glbBall.visible = false;
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = obj.name === PITCH_RECEIVE_SHADOW_NAME;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(fixupMaterial);
        } else if (mesh.material) {
          mesh.material = fixupMaterial(mesh.material);
        }
        // 外向き2面のUV左右反転（AD_BACKFACING_NODE_NAMES参照）。この2メッシュの
        // ジオメトリは他と共有されていない（876メッシュが各自のジオメトリを持つGLB）ため、
        // その場で属性を書き換えてよい（書き換えは一度きり＝このブロック内でだけ行う）。
        if (AD_BACKFACING_NODE_NAMES.has(obj.name)) {
          const uv = mesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
          if (uv) {
            for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
            uv.needsUpdate = true;
          }
        }
      });
    }

    // (c)(d): スクリーン発見・「ピッチ面の上の物」収集。どちらもシーンを書き換えない読み取りだけ
    // なので、登録簿が空のとき（初回マウント、またはFast Refreshで空に戻った後の再マウント）に
    // 集め直してよい。通常は初回の1回だけ走る（2回目以降のマウントは両方とも埋まっている）。
    if (pitchLevelMeshes.length === 0 || screenRegistry.size === 0) {
      // (d)の位置判定はアプリ側ワールド座標（ルートgroupの回転−90°・y−0.32を反映した座標）で
      // 行うため、Box3を取る前にルートgroupから下のmatrixWorldを確定させる。ルートgroupは
      // このuseEffectが走る時点で既にコミット済み（refはレイアウト段階でアタッチされる）。
      // まだ一度も描画されていない初回マウントではmatrixWorldが未計算のため、これを省くと
      // GLBローカル座標(長辺=X)のまま判定してX/Zの閾値を取り違える。
      rootRef.current?.updateMatrixWorld(true);
      pitchLevelMeshes.length = 0;
      screenRegistry.clear();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const isScreen = AD_SLOT_NODE_NAME_SET.has(obj.name) || SCOREBOARD_NODE_NAMES.includes(obj.name);
        if (isScreen) {
          screenRegistry.set(obj.name, mesh);
          return;
        }
        // (d) 8人制で隠す「ピッチ面の上の物」の収集。芝(Pitch_Base)・GLB同梱ボール(BALL_ROOT配下)・
        // 広告面/スコアボードは名前で除外し、残りを材質名＋ワールド位置で判定する
        // （判定基準の詳細はPITCH_LEVEL_*定数のコメント参照）。visibleの代入はここでは行わず、
        // 下のpitchMode用useEffectがマウントのたびに明示的に代入する。
        if (
          obj.name !== PITCH_RECEIVE_SHADOW_NAME &&
          !isUnderBallRoot(obj) &&
          hasPitchLevelMaterial(mesh) &&
          isWithinPitchLevelBounds(mesh)
        ) {
          pitchLevelMeshes.push(mesh);
        }
      });
      // 開発時のみ、集めた「ピッチ面の上の物」の数を出す（V5.6.1の実測: White 35
      // ＝ライン・スポット25＋ポスト4・バー2・フラッグ支柱4、GoalNet 174、Stone_Light 4＝フラッグ布、
      // 合計213。specs/setpiece-redesign.md §13の目安と同じ値。GLB更新で材質名や配置が変わって
      // 取りこぼした場合に、この数の変化で気付けるようにする。Fast Refresh後の再収集でも出る）。
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info(`[AlfaStadium] pitch-level meshes: ${pitchLevelMeshes.length}`);
      }
    }

    // スタジアム境界（Box3）の要約を1回だけ計算して公開する（カメラUXオーバーホール:
    // 動的maxDistance/far/fog算出・「全景」プリセットのフィット計算の入力）。ルートgroupは
    // このuseEffectが走る時点で既にコミット済み（refはレイアウト段階でアタッチされ、
    // passiveエフェクトより先に確定する）ため、マウント直後の1回で十分正確に計算できる。
    if (rootRef.current) computeAndPublishStadiumBounds(rootRef.current);

    // 広告4面+スコアボード2面へテクスチャを適用する（この部分はマウントのたびに実行する。
    // 直前のアンマウントで自作テクスチャをdispose済みのため、再適用しないと画面が白ポリのまま
    // 残ってしまう＝上のtraverseガードとは別に「毎回やり直してよい・やり直す必要がある」処理）。
    const touchedNodeNames: string[] = [];
    for (const slot of Object.keys(AD_SLOT_NODE_NAMES) as StadiumAdSlot[]) {
      const nodeName = AD_SLOT_NODE_NAMES[slot];
      if (!screenRegistry.has(nodeName)) continue;
      const pending = pendingAds.get(slot);
      if (pending !== undefined) pendingAds.delete(slot);
      applyAdToNode(nodeName, pending ?? makeAdPlaceholderCanvas());
      touchedNodeNames.push(nodeName);
    }
    for (const nodeName of SCOREBOARD_NODE_NAMES) {
      if (!screenRegistry.has(nodeName)) continue;
      applyAdToNode(nodeName, makeScoreboardPlaceholderCanvas());
      touchedNodeNames.push(nodeName);
    }

    return () => {
      // アンマウント時に全dispose（このマウントで適用した自作テクスチャ/マテリアルのみ）。
      // screenRegistry自体はクリアしない（ノード名→メッシュの対応は不変のため再マウント時に
      // 使い回せる）。
      for (const nodeName of touchedNodeNames) {
        const entry = activeScreens.get(nodeName);
        if (entry) {
          entry.material.dispose();
          entry.texture.dispose();
          activeScreens.delete(nodeName);
        }
      }
    };
  }, [gltf]);

  // 「ピッチ面の上の物」の表示/非表示（specs/setpiece-redesign.md §13）。
  // マウントのたび・pitchModeが変わるたびに、集めた全メッシュへvisibleを「明示的に代入」する。
  // useGLTFのシーンはページ生存中共有されるため、「変化時だけ」書くと 8人制(app)で隠した状態が
  // 次の11人制(glb)マウントにそのまま残る（例: 8人制の3D→2Dで11人制へ→3D）。毎回代入すれば
  // どの順で切り替えても直前の状態に依存しない。上のuseEffect（初回traverseで収集）より後に
  // 宣言しているため、初回マウントでも収集→代入の順で走る。
  useEffect(() => {
    const visible = pitchMode === "glb";
    for (const mesh of pitchLevelMeshes) mesh.visible = visible;
    // frameloop="demand": visibleの書き換えだけでは再描画されないため明示的に要求する。
    invalidate();
  }, [gltf, pitchMode, invalidate]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __setStadiumAd?: typeof setStadiumAd };
    w.__setStadiumAd = setStadiumAd;
    return () => {
      delete w.__setStadiumAd;
    };
  }, []);

  return (
    <group ref={rootRef} rotation={[0, -Math.PI / 2, 0]} position={[0, -0.32, 0]}>
      <primitive object={gltf.scene} />
    </group>
  );
}
