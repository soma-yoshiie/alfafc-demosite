"use client";

import { useEffect, useState } from "react";
import { useBoard } from "./BoardProvider";

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

export default function Header() {
  const board = useBoard();
  const name = board.state.teamName;
  // セットプレー画面ではタイトル/保存先を第2文書スロット(setPieces)側から取る。
  // 戦術ボードの currentPlayTitle 由来ロジックはそのまま(挙動を変えない)
  const isSp = board.screen === "setpiece";
  const spTitle =
    board.library.setPieces?.find((p) => p.id === board.currentSetPieceId)?.title ?? null;
  const title = isSp ? spTitle : board.currentPlayTitle;
  const coach = board.auth.role === "coach";
  // PCでは他画面(ライブラリ/チーム運営等)と同様に画面名をロゴに出す。
  // モバイルは従来どおりブランド名(ALFA FOOTBALL)のまま変更しない
  const pc = usePc();

  return (
    <header>
      <div className="brand">
        <div className="logo">
          {pc ? (isSp ? "セットプレーデザイン" : "戦術ボード") : (<>ALFA<b> FOOTBALL</b></>)}
        </div>
        {coach ? (
          <button
            className={`tag${name ? " team" : ""}`}
            onClick={() => {
              if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                board.setScreen("settings");
              } else {
                board.openSheet({ type: "settings" });
              }
            }}
            title="設定（チーム名・プラン）"
          >
            {title ? `${name ?? "マイチーム"}・${title}` : name ?? "チーム名を設定"}
          </button>
        ) : (
          <div className={`tag${name ? " team" : ""}`}>
            {title ? `${name ?? "マイチーム"}・${title}` : name ?? "マイチーム"}
          </div>
        )}
      </div>
      <div className="hbtn">
        {coach && (
        <>
        <div className="icon" title="保存" onClick={isSp ? board.saveCurrentSetPiece : board.saveCurrent}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
        </div>
        <div className="icon" title="戦術アニメ" onClick={board.openStudio}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
            <path d="m6.2 5.3 3.1 3.9" />
            <path d="m12.4 3.4 3.1 4" />
            <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
        </div>
        <div
          className="icon"
          title="保存した戦術"
          onClick={() => {
            if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
              board.setScreen("library");
            } else {
              board.openSheet({ type: "library" });
            }
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.6l-1.7-2.1a1 1 0 0 0-.8-.4H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z" />
          </svg>
        </div>
        <div className="icon" title="共有・出力" onClick={() => board.openSheet({ type: "share" })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </div>
        </>
        )}
        <div className="icon" title="メニューに戻る" onClick={() => board.setScreen("home")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </div>
      </div>
    </header>
  );
}
