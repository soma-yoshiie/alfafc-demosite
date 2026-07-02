"use client";

import { useBoard } from "./BoardProvider";
import Header from "./Header";
import FormationBar from "./FormationBar";
import Pitch from "./Pitch";
import StatBar from "./StatBar";
import Bench from "./Bench";
import AnimationStudio from "./AnimationStudio";
import FullPlayOverlay from "./FullPlayOverlay";

export default function TacticsBoard() {
  const board = useBoard();
  const cls = [
    "app",
    "boardapp",
    board.mode === "anim" ? "anim" : "",
    board.fullplay ? "fullplay" : "",
    board.mode === "anim" && !board.showPaths ? "nopaths" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <Header />
      <FormationBar />
      <div className="scroll">
        <Pitch />
        <div className="boardside">
          <StatBar />
          <div className="scrollcue">▾ 下にスクロールでベンチ ▾</div>
          <Bench />
          <AnimationStudio />
        </div>
      </div>
      <FullPlayOverlay />
    </div>
  );
}
