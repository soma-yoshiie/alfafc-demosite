"use client";

/**
 * コーチングハブ（新設・スマホ専用画面。mobile-redesign §1-3）。
 * 下部タブ「コーチング」の遷移先。戦術ボード／練習メニュー／セットプレーデザイン／
 * ライブラリへの入口をまとめ、直近の保存（戦術・練習・セットプレー）から再開できる。
 * PCのレール（ConsoleShell の .conrail）には出さない（BoardProvider.ScreenName にのみ追加）。
 */

import { useEffect, useMemo, useState } from "react";
import { useBoard } from "./BoardProvider";
import { MenuGroup, MenuRow } from "./MobileRows";
import { MobileHeader } from "./MobileHeader";
import { IconClipboard, IconCone, IconFolder, IconSetPiece } from "./icons";
import { loadDrills } from "@/lib/storage";
import type { SavedDrill, SavedPlay, SavedSetPiece } from "@/lib/types";

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

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type RecentKind = "play" | "drill" | "setpiece";
type RecentItem = {
  id: string;
  kind: RecentKind;
  title: string;
  updatedAt: number;
  onOpen: () => void;
};

const RECENT_KIND_LABEL: Record<RecentKind, string> = {
  play: "戦術",
  drill: "練習",
  setpiece: "セットプレー",
};

export default function CoachingHub() {
  const board = useBoard();
  const pc = usePc();

  // mobile-redesign Phase D-1(C2-minor 観点3): coachingはPCレールに出さないスマホ専用画面
  // (§1-3)だが、表示中にウィンドウをPC幅へ広げると打ち消しCSSも到達経路も持たずそのまま
  // 描画され続けてしまう。PC幅になったらホームへ戻す（render中ではなくeffect内でsetScreen）
  useEffect(() => {
    if (pc) board.setScreen("home");
  }, [pc, board]);

  // 「最近の保存」: ライブラリ(戦術・セットプレー)とローカル保存の練習を統合し、更新順で5件
  // mobile-redesign Phase D-1(C2-minor 観点3): BoardProviderのcontext値が更新されるたびに
  // レンダーごとloadDrills()(localStorage読み+JSON.parse)と結合・sort・sliceが走っていたため
  // useMemoで包む（board.library.plays/setPieces/screenの変化時のみ再計算）
  const recent: RecentItem[] = useMemo(() => {
    const plays: SavedPlay[] = board.library.plays;
    const setPieces: SavedSetPiece[] = board.library.setPieces ?? [];
    const drills: SavedDrill[] = loadDrills();
    return [
      ...plays.map((p) => ({
        id: "play-" + p.id,
        kind: "play" as const,
        title: p.title,
        updatedAt: p.updatedAt,
        onOpen: () => board.loadPlay(p.id),
      })),
      ...setPieces.map((p) => ({
        id: "sp-" + p.id,
        kind: "setpiece" as const,
        title: p.title,
        updatedAt: p.updatedAt,
        onOpen: () => board.loadSetPiece(p.id),
      })),
      ...drills.map((d) => ({
        id: "drill-" + d.id,
        kind: "drill" as const,
        title: d.title || "無題の練習",
        updatedAt: d.updatedAt,
        onOpen: () => {
          board.setDrillIntent({ open: d.id });
          board.setScreen("drill");
        },
      })),
    ]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
    // board.screenを依存に加え、ドリル編集から戻ってきた際にlocalStorageの最新内容へ追随させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.library.plays, board.library.setPieces, board.screen]);

  const recentIcon: Record<RecentKind, React.ReactNode> = {
    play: <IconClipboard />,
    drill: <IconCone />,
    setpiece: <IconSetPiece />,
  };

  return (
    <div className="app chubapp">
      {/* 下部タブ「コーチング」の直下画面のため戻るは出さない（mobile-redesign §1-6） */}
      <MobileHeader title="コーチング" />
      <div className="scroll">
        <MenuGroup>
          <MenuRow
            icon={<IconClipboard />}
            label="戦術ボード"
            desc="スタメンを並べて動きをアニメで確認"
            onClick={() => board.setScreen("board")}
          />
          <MenuRow
            icon={<IconCone />}
            label="練習メニュー"
            desc="コーンを並べて動線を描き、練習図を作る"
            onClick={() => board.setScreen("drill")}
          />
          <MenuRow
            icon={<IconSetPiece />}
            label="セットプレーデザイン"
            desc="CK・FK・スローインの動きを設計して共有する"
            onClick={() => board.setScreen("setpiece")}
          />
          <MenuRow
            icon={<IconFolder />}
            label="ライブラリ"
            desc="保存した戦術・練習・セットプレー"
            onClick={() => board.setScreen("library")}
          />
        </MenuGroup>

        <div className="mrowgroup-h">最近の保存</div>
        {recent.length === 0 ? (
          <div className="empty-msg">
            <b>まだ保存がありません</b>
            <br />
            戦術ボードや練習メニューで作って保存すると、ここに並びます
          </div>
        ) : (
          <MenuGroup>
            {recent.map((r) => (
              <MenuRow
                key={r.id}
                icon={recentIcon[r.kind]}
                label={r.title}
                desc={`${RECENT_KIND_LABEL[r.kind]} ・ ${fmtDateTime(r.updatedAt)}`}
                onClick={r.onOpen}
              />
            ))}
          </MenuGroup>
        )}
      </div>
    </div>
  );
}
