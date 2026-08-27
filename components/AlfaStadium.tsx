"use client";

// Blender製スタジアムGLB(ALFA_Stadium_V5_5.glb / 81.7MB・892メッシュ・約146万tris・
// 37マテリアル共有・テクスチャ0・単一ルートALFA_EXPORT_ROOT)を読み込み、11人制・高/中品質の
// ときだけ components/SetPiece3D.tsx から描画される（8人制はピッチ寸法がGLBの105×68mと
// 一致しない・軽品質はtris予算超過のため、どちらも従来のprocedural一式を使い続ける。
// 判断はSetPiece3D.tsx側の glbStadium 変数で行う）。
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

import { useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/** GLB配置パス（相対パス。components/SetPiece3D.tsx の MODEL_URL="models/player.glb" と
 * 同じ方式＝GitHub Pagesのサブパス配信・next.config.mjsのoutput:"export"どちらでも解決できる）。 */
const STADIUM_GLB_URL = "models/stadium/ALFA_Stadium_V5_5.glb";

// 注意: useGLTF.preload(STADIUM_GLB_URL) はあえて呼ばない。
// 81.7MBという重量級アセットを、11人制以外（8人制・軽品質）のユーザーも含めて全員に
// 無条件でダウンロードさせるべきではないという設計判断による（8人制・軽品質は
// 従来のprocedural一式のままGLBを一切参照しない＝そのユーザーには存在しないファイルの
// はずなので、なおさら先読みすべきではない）。<Suspense>によるオンデマンド読み込みのみに任せる。

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
 * 一度登録すれば以後ずっと有効（AlfaStadiumの再マウントをまたいでも使える）。 */
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
   本体
   ============================================================ */

export function AlfaStadium() {
  const gltf = useGLTF(STADIUM_GLB_URL) as unknown as { scene: THREE.Group };

  useEffect(() => {
    const scene = gltf.scene;

    // (a)(b)(c): マテリアル補正・シャドウ設定・スクリーン発見は、このGLBシーンに対して
    // 一度だけ行う（scene.userDataへ処理済みフラグを立てて判定する＝drei/useGLTFの
    // ロード結果キャッシュにより、AlfaStadiumが再マウントされても同じsceneインスタンスが
    // 返るため、フラグはページ生存中ずっと有効）。以後、毎フレームのtraverseは行わない。
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
        if (AD_SLOT_NODE_NAME_SET.has(obj.name) || SCOREBOARD_NODE_NAMES.includes(obj.name)) {
          screenRegistry.set(obj.name, mesh);
          // 外向き2面のUV左右反転（AD_BACKFACING_NODE_NAMES参照）。この2メッシュの
          // ジオメトリは他と共有されていない（876メッシュが各自のジオメトリを持つGLB）ため、
          // その場で属性を書き換えてよい。
          if (AD_BACKFACING_NODE_NAMES.has(obj.name)) {
            const uv = mesh.geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
            if (uv) {
              for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
              uv.needsUpdate = true;
            }
          }
        }
      });
    }

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

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __setStadiumAd?: typeof setStadiumAd };
    w.__setStadiumAd = setStadiumAd;
    return () => {
      delete w.__setStadiumAd;
    };
  }, []);

  return (
    <group rotation={[0, -Math.PI / 2, 0]} position={[0, -0.32, 0]}>
      <primitive object={gltf.scene} />
    </group>
  );
}
