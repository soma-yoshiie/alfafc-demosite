"use client";

import { useBoard, type ScreenName } from "./BoardProvider";
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
import CoachingHub from "./CoachingHub";
import OtherHub from "./OtherHub";
import { CoachLabProvider } from "./CoachLab/CoachLabProvider";
import CoachLabScreen from "./CoachLab/CoachLabScreen";
import ProfileScreen from "./ProfileScreen";

/**
 * 画面名 → 画面。switch にして末尾で never チェックする（player-hub §2-2）：ScreenName に画面を足して
 * ここに書き忘れると型エラーになる（以前の三項演算子の連鎖は、書き忘れると黙ってホームが出た）
 */
function renderScreen(screen: ScreenName): React.ReactNode {
  switch (screen) {
    case "home":
      return <HomeMenu />;
    case "coaching":
      return <CoachingHub />;
    case "other":
      return <OtherHub />;
    case "drill":
      return <DrillEditor />;
    case "team":
      return <TeamHub />;
    case "chat":
      return <ChatScreen />;
    case "notebook":
      return <NotebookScreen />;
    case "board":
      return <TacticsBoard />;
    case "setpiece":
      return <SetPieceBoard />;
    case "library":
      return <LibraryScreen />;
    case "articles":
      return <CoachLabScreen />;
    case "settings":
      return <SettingsScreen />;
    case "profile":
      return <ProfileScreen />;
    default: {
      const unreachable: never = screen;
      void unreachable;
      return <HomeMenu />;
    }
  }
}

export default function AppRoot() {
  const board = useBoard();
  return (
    // CoachLabProvider は BoardProvider の内側・ConsoleShell の外側に配置する
    // （画面だけでなくシート等どこからでも useCoachLab() できるように）
    <CoachLabProvider>
      <ConsoleShell>
        {renderScreen(board.screen)}
      </ConsoleShell>
      {/* シート・トーストはどの画面でも使えるよう全体に配置 */}
      <SheetManager />
      <Toast />
    </CoachLabProvider>
  );
}
