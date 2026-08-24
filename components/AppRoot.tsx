"use client";

import { useBoard } from "./BoardProvider";
import HomeMenu from "./HomeMenu";
import TacticsBoard from "./TacticsBoard";
import SetPieceBoard from "./SetPieceBoard";
import DrillEditor from "./DrillEditor";
import TeamHub from "./TeamHub";
import ChatScreen from "./ChatScreen";
import NotebookScreen from "./NotebookScreen";
import SheetManager from "./SheetManager";
import Toast from "./Toast";
import ConsoleShell from "./ConsoleShell";
import { LibraryScreen, ArticlesScreen, SettingsScreen } from "./ConsoleScreens";

export default function AppRoot() {
  const board = useBoard();
  return (
    <>
      <ConsoleShell>
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
        ) : board.screen === "setpiece" ? (
          <SetPieceBoard />
        ) : board.screen === "library" ? (
          <LibraryScreen />
        ) : board.screen === "articles" ? (
          <ArticlesScreen />
        ) : board.screen === "settings" ? (
          <SettingsScreen />
        ) : (
          <HomeMenu />
        )}
      </ConsoleShell>
      {/* シート・トーストはどの画面でも使えるよう全体に配置 */}
      <SheetManager />
      <Toast />
    </>
  );
}
