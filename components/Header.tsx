"use client";

import { useEffect, useState } from "react";
import { useBoard } from "./BoardProvider";
import { MobileHeader, MobileHeaderAction, MobileHeaderMore } from "./MobileHeader";
import { IconFilm, IconFolder, IconPlusSquare, IconSave, IconShare } from "./icons";
import { toLayoutKind, type PlacingRequest } from "@/lib/setPieceLayouts";

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

export default function Header({
  onStartPlacing,
}: {
  /** セットプレーデザイン画面でのみSetPieceBoardから渡される。現在の種別がFK/スローインの
   * ときは「新規作成」も位置を選ぶモードへ入る（setpiece-redesign §3-1・§7） */
  onStartPlacing?: (req: PlacingRequest) => void;
} = {}) {
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

  // セットプレーデザインの画面だけ「新規作成」を右上へ出す（戦術ボードの「新規」は
  // 操作列のまま変えない＝setpiece-redesign §7）。いまの種別・攻守・人数を引き継いで
  // 新しい文書を作る（保存中のIDは外す）。ロジックはSetPieceBar側の内部stateに依存させず
  // BoardProviderのAPI(board.state.setPiece/newSetPiece)だけを見る
  const handleNewSetPiece = () => {
    const meta = board.state.setPiece;
    const kind = toLayoutKind(meta?.kind) ?? "ck";
    const side = meta?.side ?? "attack";
    const format = meta?.format ?? 8;
    const dirty =
      board.state.moves.length > 0 ||
      (board.state.drawings?.length ?? 0) > 0 ||
      (board.state.shapes?.length ?? 0) > 0 ||
      board.currentSetPieceId != null ||
      // レビュー指摘(2回目・major): SetPieceBar.isDirty()と同じ判定に揃える。トークンを
      // ドラッグしただけの手入れはmoves/drawings/shapesに現れないため、これが無いと
      // 右上「新規作成」だけ無警告で配置が作り直されてしまっていた
      board.isSetPieceLayoutEdited();
    if (dirty && !window.confirm("配置を作り直します。いまの配置と動きは消えます。よろしいですか？")) return;
    // FK/スローインは位置を選ぶモードに入る（setpiece-redesign §3-1・§7）
    if ((kind === "fk" || kind === "throwin") && onStartPlacing) {
      onStartPlacing({ kind, side, format, action: "new" });
      return;
    }
    board.newSetPiece({ kind, side, format });
  };

  if (!pc) {
    // mobile-redesign §1-6: ブランドロゴ(ALFA FOOTBALL)→画面名に置換。.tag.teamの緑ピルは廃止し、
    // 保存先タイトルがあれば画面名の下に小さく出す。戻り先はnavFromに従いhome/coaching/otherへ
    // （§1-3。選手はセットプレーデザインを「その他」ハブからも開けるため、otherも丸め先に
    // 含める。mobile-redesign-v2 §2）
    return (
      <MobileHeader
        title={isSp ? "セットプレーデザイン" : "戦術ボード"}
        subtitle={title || undefined}
        onBack={() =>
          board.setScreen(board.navFrom === "home" ? "home" : board.navFrom === "other" ? "other" : "coaching")
        }
        actions={
          coach ? (
            // mobile-redesign Phase D-1(C1-critical): §1-6「アイコンボタン最大3つ」に収める。
            // 保存・共有(出力・配信)は単独ボタンのまま残し、頻度の低いアニメ/ライブラリは
            // 「…」オーバーフロー(MobileHeaderMore)へ移す(機能は維持)
            <>
              <MobileHeaderAction label="保存" onClick={isSp ? board.saveCurrentSetPiece : board.saveCurrent}>
                <IconSave />
              </MobileHeaderAction>
              <MobileHeaderAction label="共有・出力" onClick={() => board.openSheet({ type: "share" })}>
                <IconShare />
              </MobileHeaderAction>
              <MobileHeaderMore
                items={[
                  ...(isSp
                    ? [{ label: "新規作成", icon: <IconPlusSquare />, onClick: handleNewSetPiece }]
                    : []),
                  { label: "戦術アニメ", icon: <IconFilm />, onClick: board.openStudio },
                  { label: "ライブラリ", icon: <IconFolder />, onClick: () => board.setScreen("library") },
                ]}
              />
            </>
          ) : undefined
        }
      />
    );
  }

  return (
    <header>
      <div className="brand">
        <div className="logo">{isSp ? "セットプレーデザイン" : "戦術ボード"}</div>
        {coach ? (
          <button
            className={`tag${name ? " team" : ""}`}
            onClick={() => board.setScreen("settings")}
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
        {isSp && (
          <div className="icon" title="新規作成" onClick={handleNewSetPiece}>
            <IconPlusSquare />
          </div>
        )}
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
          title="ライブラリ"
          onClick={() => board.setScreen("library")}
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
        {/* board-squad-and-pc-polish §1: 左にレール(.conrail)があるため「メニューに戻る」(ホーム)アイコンは不要 */}
      </div>
    </header>
  );
}
