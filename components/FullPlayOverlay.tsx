"use client";

import { useBoard } from "./BoardProvider";
import {
  IconPause,
  IconPlay,
  IconRotate,
  IconRoute,
  IconShare,
  IconTrash,
  IconUndo,
} from "./icons";

export default function FullPlayOverlay() {
  const board = useBoard();
  const hasMoves = board.state.moves.length > 0;
  return (
    <div className={`fpover${board.fullplay ? " on" : ""}`}>
      <div className="fptop">
        <div className="fpback" onClick={board.exitFullplay}>
          ‹ 戻る
        </div>
        <div className="fphint">選手・ボールをなぞってルート追加</div>
        <div className="fptag">
          ALFA<b> FOOTBALL</b>
        </div>
      </div>

      <div className="fpctrl">
        <div className="fpgroup">
          <button
            className={`fpbtn fpsmall${board.showPaths ? " act" : ""}`}
            title="ルート表示"
            onClick={() => board.setShowPaths(!board.showPaths)}
          >
            <IconRoute />
          </button>
          <button
            className="fpbtn fpsmall"
            title="最後のルートを削除"
            onClick={() => {
              if (!hasMoves) {
                board.toast("元に戻すルートがありません");
                return;
              }
              board.stopPlay();
              board.undoMove();
              board.toast("最後のルートを削除しました");
            }}
          >
            <IconUndo />
          </button>
          <button
            className="fpbtn fpsmall"
            title="全消去"
            onClick={() => {
              if (!hasMoves) return;
              board.stopPlay();
              board.clearMoves();
              board.toast("全ルートを消去しました");
            }}
          >
            <IconTrash />
          </button>
        </div>

        <div className="fpgroup">
          <button
            className="fpbtn fpsmall"
            title="共有・出力"
            onClick={() => {
              board.exitFullplay();
              board.openSheet({ type: "share" });
            }}
          >
            <IconShare />
          </button>
          <button className="fpbtn fpsmall" title="最初へ" onClick={board.resetPlay}>
            <IconRotate />
          </button>
          <button
            className="fpbtn fplay"
            onClick={() => (board.isPlaying ? board.stopPlay() : board.startPlay())}
          >
            {board.isPlaying ? <IconPause /> : <IconPlay />}
            {board.isPlaying ? "停止" : "再生"}
          </button>
        </div>
      </div>
    </div>
  );
}
