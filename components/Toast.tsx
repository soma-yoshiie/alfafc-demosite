"use client";

import { useBoard } from "./BoardProvider";

export default function Toast() {
  const board = useBoard();
  return <div className={`toast${board.toastOn ? " on" : ""}`}>{board.toastMsg}</div>;
}
