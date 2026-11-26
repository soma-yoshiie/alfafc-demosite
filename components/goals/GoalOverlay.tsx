"use client";

import React, { useEffect, useRef } from "react";
import { useBoard } from "../BoardProvider";
import { useGoals } from "../GoalsProvider";
import { usePc } from "../hub/common";
import GoalBoard from "./GoalBoard";

/**
 * どこからでも開く目標の画面（specs/goals.md §4）。ConsoleShell の中に 1 つだけ置く。
 * スマホ＝下部タブの上までの全面（下部タブは見えたまま・今のタブが青のまま）、PC＝中央のパネル（幅 520px・暗幕つき）。
 * 上の帯（題名「目標」と戻る）は GoalBoard（mode="overlay"）が持つ。
 * ほかのタブ・画面へ移ったら閉じる。下のノートのフォームは外さずにそのまま残す（この部品は兄弟として重ねるだけ）。
 */
export default function GoalOverlay() {
  const { overlay } = useGoals();
  if (!overlay) return null;
  return <GoalOverlayInner key={`${overlay.playerId}:${overlay.screen}`} />;
}

function GoalOverlayInner() {
  const board = useBoard();
  const goals = useGoals();
  const pc = usePc();
  const o = goals.overlay!;
  const openedOn = useRef(board.screen);
  const { closeGoals } = goals;
  const panelRef = useRef<HTMLDivElement>(null);

  // 開いたら、パネルへフォーカスを移す（背後の要素に残さない。パネル自体は輪郭を出さない）
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // ほかの画面へ移ったら閉じる
  useEffect(() => {
    if (board.screen !== openedOn.current) closeGoals();
  }, [board.screen, closeGoals]);
  // Esc でも閉じる（同じタブの再タップは ConsoleShell が閉じるだけにする。下の画面は動かさない）
  useEffect(() => {
    // 直すシートが開いているときの Esc は、シートだけを閉じる
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".phubsheet") && closeGoals();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeGoals]);

  return (
    <div className={`goalov ${pc ? "pc" : "m"}`} onClick={() => pc && closeGoals()}>
      <div
        ref={panelRef}
        className="goalov-panel"
        role="dialog"
        aria-modal="true"
        aria-label="目標"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <GoalBoard
          playerId={o.playerId}
          viewer={board.auth.role === "coach" ? "staff" : "player"}
          mode="overlay"
          initialScreen={o.screen}
          onClose={closeGoals}
        />
      </div>
    </div>
  );
}
