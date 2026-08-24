"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useBoard } from "./BoardProvider";
import type { SheetType } from "./BoardProvider";
import Header from "./Header";
import SetPieceBar from "./SetPieceBar";
import Pitch from "./Pitch";
import AnimationStudio from "./AnimationStudio";
import FullPlayOverlay from "./FullPlayOverlay";
import { SaveBody, ShareBody } from "./SheetManager";

/** PC(min-width:1024px)判定のブレークポイント。TacticsBoard.tsx usePc() と同じ値・同じ手法 */
const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TacticsBoard.tsx usePc() と同じ手法） */
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

/**
 * PCのセットプレー画面で中央ダイアログの代わりに右カラム(.boardside)のパネルに出す種別。
 * TacticsBoard.tsx の BoardPanelType と同形だが、セットプレーでは選手配置・枠メニュー・
 * フォーメーション変更は不要なため save/share のみに絞る
 * （SheetManager.tsx の SETPIECE_PANEL_TYPES と対応させること）。
 */
type SpPanelType = "save" | "share";

function isSpPanelType(t: SheetType): t is SpPanelType {
  return t === "save" || t === "share";
}

const SP_PANEL_TITLE: Record<SpPanelType, string> = {
  save: "セットプレーを保存・送信",
  share: "共有・出力",
};

/** .boardside の通常内容(アニメStudio)の代わりに出すパネル。中身はモバイルのシートと共通の
 * SheetManager.tsx の *Body をそのまま使う（TacticsBoard.tsx の BoardPanelHost と同じ考え方） */
function SpPanelHost({ type }: { type: SpPanelType }) {
  const board = useBoard();
  const body: React.ReactNode = type === "save" ? <SaveBody /> : <ShareBody />;
  return (
    <div className="bpanel">
      <div className="bpanelhead">
        <button type="button" className="bpanelback" onClick={board.closeSheet}>
          ‹ 戻る
        </button>
        <div className="bpaneltitle">{SP_PANEL_TITLE[type]}</div>
      </div>
      <div className="bpanelbody">{body}</div>
    </div>
  );
}

/** 共有リンクで届いたセットプレーの読み込み確認。TacticsBoard.tsx の ImportBanner と同じ
 * .bimport 文法（画面上部の1行バナー）をそのまま踏襲する。setPiece メタが無いスナップショット
 * （＝通常の戦術の共有）はここでは扱わない（TacticsBoard側のバナーが対象）*/
function ImportBanner() {
  const board = useBoard();
  const snap = board.pendingImport;
  if (!snap || !snap.setPiece) return null;
  return (
    <div className="bimport">
      <span className="bimporttext">
        共有されたセットプレーが届いています
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

export default function SetPieceBoard() {
  const board = useBoard();
  const pc = usePc();
  const sheetType = board.sheet.type;
  const spPanelType = pc && isSpPanelType(sheetType) ? sheetType : null;
  const showImportBanner = pc && board.pendingImport?.setPiece != null;
  const cls = [
    "app",
    "spapp",
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
      <SetPieceBar />
      <div className="scroll">
        <Pitch />
        <div className="boardside">
          {spPanelType ? <SpPanelHost type={spPanelType} /> : <AnimationStudio />}
        </div>
      </div>
      <FullPlayOverlay />
    </div>
  );
}
