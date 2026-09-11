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
import { LibraryScreen, SettingsScreen } from "./ConsoleScreens";
import { CoachLabProvider } from "./CoachLab/CoachLabProvider";
import CoachLabScreen from "./CoachLab/CoachLabScreen";

export default function AppRoot() {
  const board = useBoard();
  return (
    // CoachLabProvider は BoardProvider の内側・ConsoleShell の外側に配置する
    // （画面だけでなくシート等どこからでも useCoachLab() できるように）
    <CoachLabProvider>
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
          <CoachLabScreen />
        ) : board.screen === "settings" ? (
          <SettingsScreen />
        ) : (
          <HomeMenu />
        )}
      </ConsoleShell>
      {/* シート・トーストはどの画面でも使えるよう全体に配置 */}
      <SheetManager />
      <Toast />
    </CoachLabProvider>
  );
}
