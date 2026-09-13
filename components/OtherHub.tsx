"use client";

/**
 * 「その他」ハブ（新設・スマホ専用画面。mobile-redesign-v2 §2）。
 * 下部タブ「その他」の遷移先。コーチラボ・設定（選手はコーチラボ・セットプレーデザイン）と
 * ログアウトへの入口をまとめる。PCのレール（ConsoleShell の .conrail）には出さない
 * （BoardProvider.ScreenName にのみ追加。PCのDOM・見た目・挙動は変更しない）。
 */

import { useBoard } from "./BoardProvider";
import { MobileHeader } from "./MobileHeader";
import { MenuGroup, MenuRow } from "./MobileRows";
import { IconCog, IconLab, IconSetPiece } from "./icons";

export default function OtherHub() {
  const board = useBoard();
  const coach = board.auth.role === "coach";
  // ホーム末尾の mhome-logout と同じ処理を共有する
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));

  return (
    <div className="app otherapp">
      {/* 下部タブ「その他」の直下画面のため戻るは出さない（mobile-redesign-v2 §2） */}
      <MobileHeader title="その他" />
      <div className="scroll">
        <MenuGroup>
          <MenuRow
            icon={<IconLab />}
            label="コーチラボ"
            desc="指導者の記事を読む・書く・売る"
            onClick={() => board.setScreen("articles")}
          />
          {coach ? (
            <MenuRow
              icon={<IconCog />}
              label="設定"
              desc="チーム名やプラン、公開範囲を変更する"
              onClick={() => board.setScreen("settings")}
            />
          ) : (
            <MenuRow
              icon={<IconSetPiece />}
              label="セットプレーデザイン"
              desc="CK・FK・スローインの動きを設計して共有する"
              onClick={() => board.setScreen("setpiece")}
            />
          )}
        </MenuGroup>

        <div className="mhome-foot">
          <button type="button" className="mhome-logout" onClick={logout}>
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
