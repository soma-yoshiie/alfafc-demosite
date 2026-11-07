"use client";

/**
 * コーチングハブ（スマホ専用画面。mobile-redesign §1-3、specs/coaching-hub-s1.md）。
 * 下部タブ「コーチング」の遷移先。「作る」の正方形 3 つ（戦術ボード／練習メニュー／セットプレー）→
 * 最近の保存（戦術・練習・セットプレーの更新順 6 件）→ ライブラリ（種類ごとの件数つき）の 3 段。
 * チームの目次（タイル）と同じ型の目次に見えないよう「作る物」の性格を出す（coaching-hub-s1 §1）。
 * PCのレール（ConsoleShell の .conrail）には出さない（BoardProvider.ScreenName にのみ追加）。
 */

import { useEffect, useMemo, useState } from "react";
import { useBoard } from "./BoardProvider";
import { MenuGroup, MenuRow } from "./MobileRows";
import { MobileHeader } from "./MobileHeader";
import { IconPitch, IconCone, IconFolder, IconSetPiece } from "./icons";
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

/** 「最近の保存」の件数（coaching-hub-s1 §1-4。5 → 6） */
const RECENT_MAX = 6;

export default function CoachingHub() {
  const board = useBoard();
  const pc = usePc();

  // mobile-redesign Phase D-1(C2-minor 観点3): coachingはPCレールに出さないスマホ専用画面
  // (§1-3)だが、表示中にウィンドウをPC幅へ広げると打ち消しCSSも到達経路も持たずそのまま
  // 描画され続けてしまう。PC幅になったらホームへ戻す（render中ではなくeffect内でsetScreen）
  useEffect(() => {
    if (pc) board.setScreen("home");
  }, [pc, board]);

  // 「最近の保存」と「ライブラリ」の件数: ライブラリ(戦術・セットプレー)とローカル保存の練習を
  // 同じ 1 か所で読み、更新順で RECENT_MAX 件と種類ごとの数を出す（数字は 1 か所から計算する）。
  // mobile-redesign Phase D-1(C2-minor 観点3): BoardProviderのcontext値が更新されるたびに
  // レンダーごとloadDrills()(localStorage読み+JSON.parse)と結合・sort・sliceが走っていたため
  // useMemoで包む（board.library.plays/setPieces/screenの変化時のみ再計算）
  const { recent, counts } = useMemo(() => {
    const plays: SavedPlay[] = board.library.plays;
    const setPieces: SavedSetPiece[] = board.library.setPieces ?? [];
    const drills: SavedDrill[] = loadDrills();
    const items: RecentItem[] = [
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
      .slice(0, RECENT_MAX);
    return {
      recent: items,
      counts: { plays: plays.length, drills: drills.length, setPieces: setPieces.length },
    };
    // board.screenを依存に加え、ドリル編集から戻ってきた際にlocalStorageの最新内容へ追随させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.library.plays, board.library.setPieces, board.screen]);

  const total = counts.plays + counts.drills + counts.setPieces;

  const recentIcon: Record<RecentKind, React.ReactNode> = {
    play: <IconPitch />,
    drill: <IconCone />,
    setpiece: <IconSetPiece />,
  };

  // 「作る」の正方形 3 つ（coaching-hub-s1 §1-3）。名前は正方形に入る長さにする
  // （「セットプレーデザイン」は 10 文字で幅に入らないので「セットプレー」。画面名は変えない）
  const make: { screen: "board" | "drill" | "setpiece"; label: string; icon: React.ReactNode }[] = [
    { screen: "board", label: "戦術ボード", icon: <IconPitch /> },
    { screen: "drill", label: "練習メニュー", icon: <IconCone /> },
    { screen: "setpiece", label: "セットプレー", icon: <IconSetPiece /> },
  ];

  return (
    <div className="app chubapp">
      {/* 下部タブ「コーチング」の直下画面のため戻るは出さない（mobile-redesign §1-6） */}
      <MobileHeader title="コーチング" />
      <div className="scroll">
        <div className="mrowgroup-h">作る</div>
        <div className="chub-make">
          {make.map((m) => (
            <button
              key={m.screen}
              type="button"
              className="chub-sq"
              onClick={() => board.setScreen(m.screen)}
            >
              {/* ボタンの中身は span だけ（HubTiles.tsx と同じ作法）。.chub-sq-n の textContent は名前だけに保つ */}
              <span className="chub-sq-ic" aria-hidden="true">
                {m.icon}
              </span>
              <span className="chub-sq-n">{m.label}</span>
            </button>
          ))}
        </div>

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

        {/* ライブラリの行＋種類ごとの件数の帯（coaching-hub-s1 §1-5）。帯は表示だけ。0 件のときは件数も帯も出さない */}
        <div className="mrowgroup">
          <div className="mrowcard">
            <MenuRow
              icon={<IconFolder />}
              label="ライブラリ"
              desc={
                total > 0
                  ? `保存した戦術・練習・セットプレー ${total} 件`
                  : "保存した戦術・練習・セットプレー"
              }
              onClick={() => board.setScreen("library")}
            />
            {total > 0 && (
              <div className="chub-cnt">
                <div className="chub-cnt-c">
                  <span className="chub-cnt-v">{counts.plays}</span>
                  戦術
                </div>
                <div className="chub-cnt-c">
                  <span className="chub-cnt-v">{counts.drills}</span>
                  練習
                </div>
                <div className="chub-cnt-c">
                  <span className="chub-cnt-v">{counts.setPieces}</span>
                  セットプレー
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
