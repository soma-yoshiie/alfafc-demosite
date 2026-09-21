"use client";

import { useRef } from "react";
import { useBoard } from "./BoardProvider";
import PlayerToken from "./PlayerToken";
import OppToken from "./OppToken";
import Ball from "./Ball";
import PathLayer from "./PathLayer";
import PenLayer from "./PenLayer";
import FormatBar from "./FormatBar";
import ShapesLayer from "./ShapesLayer";
import GuideLayer from "./GuideLayer";
import GhostLayer from "./GhostLayer";
import DeliveryLayer from "./DeliveryLayer";
import { topToY } from "@/lib/pitchView";
import type { Point } from "@/lib/types";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface PitchProps {
  /** セットプレーの「位置を選ぶモード」（setpiece-redesign §3-1）。SetPieceBoardからのみ
   * 渡される。戦術ボード(TacticsBoard)は渡さない＝常にnullで従来どおり */
  placingKind?: "fk" | "throwin" | null;
  /** 位置を選ぶモード中にピッチをタップしたときの通知（データ座標） */
  onPlaceOrigin?: (p: Point) => void;
  /** 位置を選ぶモードの「やめる」 */
  onCancelPlacing?: () => void;
}

export default function Pitch({ placingKind = null, onPlaceOrigin, onCancelPlacing }: PitchProps = {}) {
  const board = useBoard();
  const filled = board.state.slots.filter((s) => s.pid != null).length;
  const showHint = board.mode === "edit" && filled === 0 && !placingKind;
  const half = board.state.pitchView === "half";
  // PA拡大（setpiece-redesign §6）：paatk/padefのときだけ描画層(.pitchzoom)をCSSで
  // scaleし、外枠(.pitch)のoverflow:hiddenで切り抜く。原点はゴール側の辺の中央
  // （paatk=上辺/padef=下辺）。yの変換式自体はboxatk/boxdefと同じ（lib/pitchView.ts）。
  const paSide =
    board.state.pitchView === "paatk" ? "atk" : board.state.pitchView === "padef" ? "def" : null;
  // レビュー指摘(2回目・minor): ゴール前/PA拡大のアスペクト比・マーキングの出し分けが
  // SetPieceBar側の状態marker(:has(.spbar-presets.spview-*))頼みだと、SetPieceBarを描画しない
  // 選手（isCoach===falseでnullを返す）には一切効かない。Pitch.tsx（役割に関係なく必ず描画
  // される）側にも同じ情報のクラスを持たせ、CSS側がどちらからでも検知できるようにする
  // （boxatk/paatk→ゴールを狙う側=atk、boxdef/padef→守る側=def。fullはnull）
  const boxSide =
    board.state.pitchView === "boxatk" || board.state.pitchView === "paatk"
      ? "atk"
      : board.state.pitchView === "boxdef" || board.state.pitchView === "padef"
      ? "def"
      : null;
  // 「ボールの軌道」グループが開いている間だけ、軌道の線・ハンドルを出す
  // （編集モードのみ。setpiece-redesign §4）
  const showDelivery = board.mode === "edit" && board.spTrajOpen && board.state.setPiece != null;
  // 選択中のアクターがその場面の保持者のとき、常設の操作ガイドを表示する
  const showHoldGuide =
    board.mode === "anim" &&
    board.selActor != null &&
    (board.selActor === board.holderAtStep(board.activeStep) ||
      board.selActor === board.holderAtStepEnd(board.activeStep));

  // 保持者選択中にゴールゾーンをタップ→シュート生成（移動6px未満のタップのみ判定）
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  // レビュー指摘(1回目・critical): .spplacingbar（位置を選ぶモードの案内の帯・「やめる」）は
  // .pitchzoomの子要素のため、そのボタンのpointerdown/pointerupが親までバブリングしていた。
  // pointerupはReactのclickより先に発火するため、「やめる」を押すとキャンセルより先に
  // onPlaceOrigin（配置生成）が実行され、ボタンの位置にキック位置が置かれて配置が
  // 作り直されてしまっていた。帯の内側で起きたポインタ操作はピッチのタップとして扱わない
  const isInPlacingBar = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && target.closest(".spplacingbar") != null;
  const onPitchPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInPlacingBar(e.target)) return;
    tapStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPitchPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInPlacingBar(e.target)) return;
    const start = tapStart.current;
    tapStart.current = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 6) return;
    // 位置を選ぶモード中：タップ位置をデータ座標へ変換して通知する（既存の「空き地タップ」の
    // 変換＝getPitchRect + topToY をそのまま使う。setpiece-redesign §3-1）
    if (placingKind) {
      const rect = board.getPitchRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const topPct = ((e.clientY - rect.top) / rect.height) * 100;
      const y = clamp(topToY(topPct, board.state.pitchView), 0, 100);
      onPlaceOrigin?.({ x: xPct, y });
      return;
    }
    if (board.mode !== "anim" || board.penMode) return;
    // 場面開始時点の保持者に加え、場面終了時点の保持者（場面内のパスを受けた選手）も許可
    if (board.selActor == null) return;
    if (
      board.selActor !== board.holderAtStep(board.activeStep) &&
      board.selActor !== board.holderAtStepEnd(board.activeStep)
    )
      return;
    const rect = board.getPitchRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const topPct = ((e.clientY - rect.top) / rect.height) * 100;
    const y = topToY(topPct, board.state.pitchView);
    if (y > 90 && xPct > 35 && xPct < 65) {
      board.shoot();
    }
  };

  return (
    // mobile-redesign Phase D-1(C1-critical §3/§7-5): 縁ぎりぎりのトークン(GKラベル・
    // コーナー配置の丸)が.pitchのoverflow:hiddenで欠けて見える問題を、クリップ位置を
    // 外側の.pitch2dwrapへ逃がして解消する(pitch2d/pitch2dwrapは3Dビュー(.sp3dwrap)とは
    // 別クラスなので3D側の見た目には影響しない)。.pitch自体の矩形(getPitchRect()が
    // 参照)は変えないため、ドラッグ・配置ロジックは無改造
    <div className="pitchwrap pitch2dwrap">
      <div
        className={`pitch pitch2d${half ? " halfview" : ""}${paSide ? " pazoom" : ""}${
          boxSide ? ` pitch-box-${boxSide}` : ""
        }`}
      >
        {/* PA拡大(paSide)のときだけこの層をCSSでscaleする（setpiece-redesign §6）。
            board.pitchRef/getPitchRect()はこの層のgetBoundingClientRectを返すため、
            usePointerDrag・PenLayer・ShapesLayer・DeliveryLayer等の座標変換は
            拡大中も無改造のまま正しく動く（scale後の実測矩形を基準にする式のため） */}
        <div
          className={`pitchzoom${paSide ? ` pazoom-${paSide}` : ""}`}
          ref={board.pitchRef}
          onPointerDown={onPitchPointerDown}
          onPointerUp={onPitchPointerUp}
        >
          <div className="markings">
            <div className="mk center-line" />
            <div className="mk center-circle" />
            <div className="mk spot" />
            <div className="mk box-top" />
            <div className="mk box-top-s" />
            <div className="mk box-bot" />
            <div className="mk box-bot-s" />
            {/* ハーフコート表示時：ハーフウェイライン・センターサークルが下端から覗く形 */}
            <div className="mk half-center-line" />
            <div className="mk half-center-circle" />
          </div>

          <GuideLayer />
          <ShapesLayer />
          <PathLayer />
          <GhostLayer />

          {board.state.slots.map((_, i) => (
            <PlayerToken key={i} index={i} />
          ))}
          {(board.state.opponents ?? []).map((_, i) => (
            <OppToken key={i} index={i} />
          ))}
          <Ball />
          {showDelivery && <DeliveryLayer />}

          <PenLayer />
          <FormatBar />

          {showHoldGuide && (
            <div className="holdguide">
              味方をタップ＝パス ／ ゴールをタップ＝シュート ／ ボールを味方へドラッグでもパス
            </div>
          )}

          {showHint && (
            <div className="hint">
              空きの ◯ をタップして選手を配置
              <br />
              配置後はドラッグで微調整・重ねると入れ替え
            </div>
          )}

          {placingKind && (
            <div className="spplacingbar">
              <span className="spplacingbar-text">
                {placingKind === "fk"
                  ? "キックの位置をタップしてください"
                  : "スローインの位置（サイドライン）をタップしてください"}
              </span>
              <button type="button" className="fmini" onClick={onCancelPlacing}>
                やめる
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
