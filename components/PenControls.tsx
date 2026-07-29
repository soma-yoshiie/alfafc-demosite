"use client";

// ペンのツールバー（色・太さ・線種・取り消し）。
// 編集モード / アニメスタジオ / 全画面再生で共有する。

import { useBoard } from "./BoardProvider";
import { IconTrash, IconUndo } from "./icons";

const COLORS = [
  { c: "#ffe27a", name: "イエロー" },
  { c: "#ffffff", name: "ホワイト" },
  { c: "#ff5d6c", name: "レッド" },
  { c: "#4fc3f7", name: "ブルー" },
  { c: "#15233c", name: "ネイビー" },
];

const WIDTHS = [
  { w: 0.55, name: "細" },
  { w: 0.9, name: "中" },
  { w: 1.5, name: "太" },
];

export default function PenControls({ onClose }: { onClose?: () => void }) {
  const board = useBoard();
  return (
    <div className="penbar">
      <div className="pengroup">
        {COLORS.map(({ c, name }) => (
          <button
            key={c}
            className={`penswatch${board.penColor === c ? " on" : ""}`}
            style={{ background: c }}
            title={name}
            onClick={() => board.setPenColor(c)}
          />
        ))}
      </div>
      <div className="pengroup">
        {WIDTHS.map(({ w, name }) => (
          <button
            key={w}
            className={`penwidth${board.penWidth === w ? " on" : ""}`}
            title={`太さ：${name}`}
            onClick={() => board.setPenWidth(w)}
          >
            <i style={{ height: `${Math.round(w * 3.4)}px` }} />
          </button>
        ))}
      </div>
      <div className="pengroup">
        <button
          className={`pendash${!board.penDash ? " on" : ""}`}
          title="実線"
          onClick={() => board.setPenDash(false)}
        >
          <i className="solid" />
        </button>
        <button
          className={`pendash${board.penDash ? " on" : ""}`}
          title="点線"
          onClick={() => board.setPenDash(true)}
        >
          <i className="dashed" />
        </button>
      </div>
      {board.mode === "anim" && (
        <div className="pengroup">
          <button
            className={`penscope${board.penScope === "all" ? " on" : ""}`}
            title="どの場面でも表示される描き込み"
            onClick={() => board.setPenScope("all")}
          >
            全場面
          </button>
          <button
            className={`penscope${board.penScope === "step" ? " on" : ""}`}
            title={`場面${board.activeStep + 1}のときだけ表示される描き込み`}
            onClick={() => board.setPenScope("step")}
          >
            この場面
          </button>
        </div>
      )}
      <div className="pengroup right">
        <button className="penact" title="1本戻す" onClick={board.undoStroke}>
          <IconUndo />
        </button>
        <button
          className="penact danger"
          title="描き込みを全消去"
          onClick={board.clearStrokes}
        >
          <IconTrash />
        </button>
        <button
          className="penact close"
          onClick={() => (onClose ? onClose() : board.setPenMode(false))}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
