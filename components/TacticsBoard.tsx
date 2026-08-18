"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useBoard } from "./BoardProvider";
import type { SheetType } from "./BoardProvider";
import Header from "./Header";
import FormationBar from "./FormationBar";
import Pitch from "./Pitch";
import StatBar from "./StatBar";
import Bench from "./Bench";
import AnimationStudio from "./AnimationStudio";
import FullPlayOverlay from "./FullPlayOverlay";
import {
  AssignBody,
  SlotMenuBody,
  OppMenuBody,
  FormationBody,
  SaveBody,
  ShareBody,
} from "./SheetManager";

/** PC(min-width:1024px)判定のブレークポイント。TeamHub.tsx usePc() と同じ値・同じ手法 */
const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TeamHub.tsx usePc() と同じ手法） */
function usePc(): boolean {
  const [pc, setPc] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(PC_MQ).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const onChange = () => setPc(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return pc;
}

/** PCの戦術ボードで中央ダイアログの代わりに右カラム(.boardside)のパネルに出す種別 */
type BoardPanelType = "assign" | "slotMenu" | "oppMenu" | "formation" | "save" | "share";

function isBoardPanelType(t: SheetType): t is BoardPanelType {
  return (
    t === "assign" ||
    t === "slotMenu" ||
    t === "oppMenu" ||
    t === "formation" ||
    t === "save" ||
    t === "share"
  );
}

const BOARD_PANEL_TITLE: Record<BoardPanelType, string> = {
  assign: "選手を配置",
  slotMenu: "枠メニュー",
  oppMenu: "相手トークン",
  formation: "フォーメーション",
  save: "戦術を保存・送信",
  share: "共有・出力",
};

/** .boardside の通常内容(スタジオ等)の代わりに出すパネル。見た目の器のみ差し替え、
 * シートの状態(board.sheet)自体は SheetManager と共通のまま */
function BoardPanelHost({ type }: { type: BoardPanelType }) {
  const board = useBoard();
  const { sheet } = board;
  let body: React.ReactNode = null;
  switch (type) {
    case "assign":
      body = <AssignBody slot={sheet.slot!} />;
      break;
    case "slotMenu":
      body = <SlotMenuBody slot={sheet.slot!} />;
      break;
    case "oppMenu":
      body = <OppMenuBody index={sheet.opp!} />;
      break;
    case "formation":
      body = <FormationBody />;
      break;
    case "save":
      body = <SaveBody />;
      break;
    case "share":
      body = <ShareBody />;
      break;
  }
  return (
    <div className="bpanel">
      <div className="bpanelhead">
        <button type="button" className="bpanelback" onClick={board.closeSheet}>
          ‹ 戻る
        </button>
        <div className="bpaneltitle">{BOARD_PANEL_TITLE[type]}</div>
      </div>
      <div className="bpanelbody">{body}</div>
    </div>
  );
}

/** 共有リンクで届いた戦術の読み込み確認。PCの戦術ボードでは中央ダイアログではなく
 * 画面上部の1行バナーで出す（確定/破棄の処理自体は SheetManager の ImportSheet と同じ
 * board.applyImport / board.closeSheet を流用）。モバイルは従来どおりシートのまま */
function ImportBanner() {
  const board = useBoard();
  const snap = board.pendingImport;
  if (!snap) return null;
  return (
    <div className="bimport">
      <span className="bimporttext">
        共有された戦術が届いています
        {snap.title ? `「${snap.title}」` : ""}
      </span>
      <div className="bimportbtns">
        <button type="button" className="bimportbtn primary" onClick={board.applyImport}>
          読み込む
        </button>
        <button type="button" className="bimportbtn ghost" onClick={board.discardImport}>
          破棄
        </button>
      </div>
    </div>
  );
}

export default function TacticsBoard() {
  const board = useBoard();
  const pc = usePc();
  const sheetType = board.sheet.type;
  const boardPanelType = pc && isBoardPanelType(sheetType) ? sheetType : null;
  const showImportBanner = pc && board.pendingImport != null;
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
      {showImportBanner && <ImportBanner />}
      <Header />
      <FormationBar />
      <div className="scroll">
        <Pitch />
        <div className="boardside">
          {boardPanelType ? (
            <BoardPanelHost type={boardPanelType} />
          ) : (
            <>
              <StatBar />
              <div className="scrollcue">▾ 下にスクロールでベンチ ▾</div>
              <Bench />
              <AnimationStudio />
            </>
          )}
        </div>
      </div>
      <FullPlayOverlay />
    </div>
  );
}
