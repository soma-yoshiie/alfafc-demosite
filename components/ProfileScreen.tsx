"use client";

import { useMemo, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import type { ConsoleSubnav } from "./ConsoleShell";
import { MobileHeader } from "./MobileHeader";
import { E } from "./Emoji";
import { IconUser } from "./icons";
import PlayerHub from "./PlayerHub";
import { HUB_SECTIONS, HubEmpty, usePc } from "./hub/common";
import type { HubSection } from "./hub/common";

/**
 * 選手の「プロフィール」画面（player-hub §2-2）。下部タブ（スマホ・右から2番目）とPCレールの
 * 「プロフィール」の遷移先。自分の個人ページ（PlayerHub viewer="player"）を出す。
 * - スマホ：MobileHeader（戻るは出さない。タブ直下の画面）の下に PlayerHub nav="inline"
 *   （ヘッダーカード → 横スクロールのチップ列 → セクション）。
 * - PC：レール直下にセクションのサブナビ（useConsoleSubnav。チーム運営と同じ仕組み）を出し、PlayerHub nav="external"
 *   をそのサブナビで切り替える。
 * ルートは .app.profapp（.scroll の下部タブ分の余白は .profapp 側の CSS で持つ）
 */

/** サブナビのアイコン（セクションの並びは HUB_SECTIONS と同じ） */
const SUBNAV_ICON: Record<HubSection, React.ReactNode> = {
  overview: <IconUser />,
  growth: <E n="chart" />,
  fitness: <E n="run" />,
  exams: <E n="pencil" />,
  grades: <E n="clipboard" />,
  career: <E n="target" />,
  injuries: <E n="bandage" />,
  activity: <E n="calendar" />,
  report: <E n="doc" />,
};

export default function ProfileScreen() {
  const board = useBoard();
  const pc = usePc();
  const [section, setSection] = useState<HubSection>("overview");
  const playerId = board.auth.playerId ?? null;

  // PC：レール直下のサブナビにセクションを登録（PC でなければ登録しない＝null）。onSelect は安定関数（useState のセッター）だけを使う
  const subnav = useMemo<ConsoleSubnav | null>(
    () =>
      pc
        ? {
            anchor: "profile" as const,
            items: HUB_SECTIONS.map((s) => ({
              key: s.key,
              label: s.label,
              icon: SUBNAV_ICON[s.key],
              on: section === s.key,
              onSelect: () => setSection(s.key),
            })),
          }
        : null,
    [pc, section]
  );
  useConsoleSubnav(subnav);

  return (
    <div className="app profapp">
      {pc ? (
        // 左にレール(.conrail)があるため「‹ ホーム」は不要（設定画面と同じ）
        <header>
          <div className="brand">
            <div className="logo">プロフィール</div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {board.state.teamName ?? "マイチーム"}
            </div>
          </div>
          <span className="hdrusr">{board.auth.name}</span>
        </header>
      ) : (
        // 下部タブ「プロフィール」の直下画面のため戻るは出さない。右のヘッダーアクションも無い
        <MobileHeader title="プロフィール" />
      )}
      <div className="scroll">
        {playerId ? (
          <PlayerHub
            playerId={playerId}
            viewer="player"
            nav={pc ? "external" : "inline"}
            section={section}
            onSection={setSection}
          />
        ) : (
          <HubEmpty title="選手としてログインすると表示されます" />
        )}
      </div>
    </div>
  );
}
