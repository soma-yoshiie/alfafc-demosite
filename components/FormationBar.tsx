"use client";

import { useBoard } from "./BoardProvider";
import { IconPlusSquare, IconRotate } from "./icons";

export default function FormationBar() {
  const board = useBoard();
  // 編集系コントロールはスタッフのみ（選手は共有戦術の閲覧のみ）
  if (board.auth.role !== "coach") return null;
  return (
    <div className="fbar">
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
    </div>
  );
}
