"use client";

import { useBoard } from "./BoardProvider";
import HomeMenu from "./HomeMenu";
import TacticsBoard from "./TacticsBoard";
import DrillEditor from "./DrillEditor";
import TeamHub from "./TeamHub";
import ChatScreen from "./ChatScreen";
import NotebookScreen from "./NotebookScreen";
import SheetManager from "./SheetManager";
import Toast from "./Toast";

export default function AppRoot() {
  const board = useBoard();
  return (
    <>
      {board.screen === "drill" ? (
        <DrillEditor />
      ) : board.screen === "team" ? (
        <TeamHub />
      ) : board.screen === "chat" ? (
        <ChatScreen />
      ) : board.screen === "notebook" ? (
        <NotebookScreen />
      ) : board.screen === "board" ? (
        <TacticsBoard />
      ) : (
        <HomeMenu />
      )}
      {/* シート・トーストはどの画面でも使えるよう全体に配置 */}
      <SheetManager />
      <Toast />
    </>
  );
}
