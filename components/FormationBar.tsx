"use client";

import { useBoard } from "./BoardProvider";
import PenControls from "./PenControls";
import ShapesBar from "./ShapesBar";
import {
  IconFilm,
  IconGhost,
  IconHalfPitch,
  IconPen,
  IconPlusSquare,
  IconRotate,
  IconRoute,
  IconShapes,
} from "./icons";

export default function FormationBar() {
  const board = useBoard();
  // 編集系コントロールはスタッフのみ（選手は共有戦術の閲覧のみ）
  if (board.auth.role !== "coach") return null;
  const oppCount = (board.state.opponents ?? []).length;
  const isAnim = board.mode === "anim";

  // ペン・図形・ハーフは編集/アニメ両モードで共通のボタン
  const penBtn = (
    <button
      className={`fmini pen${board.penMode ? " on" : ""}`}
      title="ペンでピッチに描き込む"
      onClick={() => board.setPenMode(!board.penMode)}
    >
      <IconPen />
      <span>ペン</span>
    </button>
  );
  const shapesBtn = (
    <button
      className={`fmini shapes${board.shapesOpen ? " on" : ""}`}
      title="図形をピッチに配置"
      onClick={() => board.setShapesOpen(!board.shapesOpen)}
    >
      <IconShapes />
      <span>図形</span>
    </button>
  );
  const halfBtn = (
    <button
      className={`fmini half${board.state.pitchView === "half" ? " on" : ""}`}
      title="敵陣ハーフを拡大表示"
      onClick={() => {
        const next = board.state.pitchView === "half" ? "full" : "half";
        board.setPitchView(next);
        board.toast(next === "half" ? "ハーフコート表示" : "フルコート表示");
      }}
    >
      <IconHalfPitch />
      <span>ハーフ</span>
    </button>
  );

  return (
    <>
      <div className="fbar">
        {isAnim ? (
          <>
            {penBtn}
            {shapesBtn}
            {halfBtn}
            <button
              className={`fmini${board.showPaths ? " on" : ""}`}
              title="ルート矢印の表示/非表示"
              onClick={() => board.setShowPaths(!board.showPaths)}
            >
              <IconRoute />
              <span>ルート表示</span>
            </button>
            <button
              className={`fmini${board.showDrawings ? " on" : ""}`}
              title="ペン・図形の描き込みの表示/非表示"
              onClick={() => {
                const next = !board.showDrawings;
                board.setShowDrawings(next);
                if (!next) {
                  // 非表示にした描き込みが選択状態のまま残らないようにする
                  board.setSelShape(null);
                  board.setSelStroke(null);
                }
              }}
            >
              <IconShapes />
              <span>描き込み</span>
            </button>
            <button
              className={`fmini${board.showGhost ? " on" : ""}`}
              title="残像（前の場面の開始位置）の表示/非表示"
              onClick={() => board.setShowGhost(!board.showGhost)}
            >
              <IconGhost />
              <span>残像</span>
            </button>
          </>
        ) : (
          <>
            <button
              className="formbtn"
              onClick={() => board.openSheet({ type: "formation" })}
            >
              <span className="fb-label">フォーメーション変更</span>
              <span className="fb-cur">{board.state.formation}</span>
              <span className="fb-caret">▾</span>
            </button>
            <button
              className="fmini"
              title="新しい戦術を作成"
              onClick={board.newPlay}
            >
              <IconPlusSquare />
              <span>新規</span>
            </button>
            <button
              className="fmini"
              title="フォーメーション位置を整列"
              onClick={() => {
                board.resetPositions();
                board.toast("フォーメーション位置を整列しました");
              }}
            >
              <IconRotate />
              <span>整列</span>
            </button>
            <button
              className="fmini opp"
              title="相手チームのトークンを配置"
              onClick={() => {
                board.addOpponent();
                if (oppCount === 0)
                  board.toast("相手トークンを配置しました（ドラッグで移動・タップで編集）");
              }}
            >
              <span className="oppdot" />
              <span>＋相手</span>
            </button>
            {penBtn}
            {shapesBtn}
            {halfBtn}
            <button
              className="fmini"
              title="アニメーションを作成"
              onClick={board.openStudio}
            >
              <IconFilm />
              <span>アニメ</span>
            </button>
          </>
        )}
      </div>
      {board.penMode && (
        <div className="fbarpen">
          <PenControls />
        </div>
      )}
      {board.shapesOpen && (
        <div className="fbarshapes">
          <ShapesBar />
        </div>
      )}
    </>
  );
}
