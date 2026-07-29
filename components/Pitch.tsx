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
import { topToY } from "@/lib/pitchView";

export default function Pitch() {
  const board = useBoard();
  const filled = board.state.slots.filter((s) => s.pid != null).length;
  const showHint = board.mode === "edit" && filled === 0;
  const half = board.state.pitchView === "half";
  // 選択中のアクターがその場面の保持者のとき、常設の操作ガイドを表示する
  const showHoldGuide =
    board.mode === "anim" &&
    board.selActor != null &&
    (board.selActor === board.holderAtStep(board.activeStep) ||
      board.selActor === board.holderAtStepEnd(board.activeStep));

  // 保持者選択中にゴールゾーンをタップ→シュート生成（移動6px未満のタップのみ判定）
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  const onPitchPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    tapStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPitchPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = tapStart.current;
    tapStart.current = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 6) return;
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
    <div className="pitchwrap">
      <div
        className={`pitch${half ? " halfview" : ""}`}
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
      </div>
    </div>
  );
}
