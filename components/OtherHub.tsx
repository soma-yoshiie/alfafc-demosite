"use client";

/**
 * 「その他」ハブ（新設・スマホ専用画面。mobile-redesign-v2 §2）。
 * 下部タブ「その他」の遷移先。コーチラボ・設定（選手はコーチラボ・セットプレーデザイン）と
 * アカウント（設定のアカウントへ）とログアウトをまとめる。PCのレール（ConsoleShell の .conrail）には出さない
 * （BoardProvider.ScreenName にのみ追加。PCのDOM・見た目・挙動は変更しない）。
 */

import { useBoard } from "./BoardProvider";
import { MobileHeader } from "./MobileHeader";
import { MenuGroup, MenuRow } from "./MobileRows";
import { IconCog, IconLab, IconMatchup, IconSetPiece } from "./icons";

export default function OtherHub() {
  const board = useBoard();
  const coach = board.auth.role === "coach";
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));

  return (
    <div className="app otherapp">
      {/* 下部タブ「その他」の直下画面のため戻るは出さない（mobile-redesign-v2 §2） */}
      <MobileHeader title="その他" />
      <div className="scroll">
        <MenuGroup>
          {/* matchup-demo §1: スタッフだけ。コーチラボの上 */}
          {coach && (
            <MenuRow
              icon={<IconMatchup />}
              label="練習試合"
              desc="相手チームを探して申し込む"
              onClick={() => board.setScreen("matchup")}
            />
          )}
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
            <>
              {/* settings-plan-a §5: 選手・保護者にも設定（アカウント・通知）。コーチラボの次 */}
              <MenuRow
                icon={<IconCog />}
                label="設定"
                desc="アカウント・通知"
                onClick={() => board.setScreen("settings")}
              />
              <MenuRow
                icon={<IconSetPiece />}
                label="セットプレーデザイン"
                desc="CK・FK・スローインの動きを設計して共有する"
                onClick={() => board.setScreen("setpiece")}
              />
            </>
          )}
        </MenuGroup>

        {/* ux-fix R1-7: ログアウトはホームから外し、ここと設定のアカウントだけに残す。アカウントのカードは設定のアカウントへ */}
        <MenuGroup>
          <MenuRow
            label={board.auth.name || "アカウント"}
            desc={`${coach ? "スタッフ" : "選手・保護者"}・${board.state.teamName ?? "マイチーム"}`}
            onClick={() => {
              board.setSettingsIntent({ mode: "account" });
              board.setScreen("settings");
            }}
          />
        </MenuGroup>
        <MenuGroup>
          <button type="button" className="mrow mrow-danger" onClick={logout}>
            <span className="mrow-label">ログアウト</span>
          </button>
        </MenuGroup>
      </div>
    </div>
  );
}
