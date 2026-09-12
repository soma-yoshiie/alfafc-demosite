"use client";

import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadNotifSeen } from "@/lib/storage";
import { buildEventNotifications } from "@/lib/notifications";
import { PLAN_INFO } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import LogoMark from "./Logo";
import {
  IconCalendarCheck,
  IconChat,
  IconClipboard,
  IconCog,
  IconCone,
  IconFolder,
  IconLab,
  IconNote,
  IconSetPiece,
  IconWhistle,
} from "./icons";

/* ===================== サブナビ（画面側からレールへ登録） ===================== */

export type ConsoleSubnavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  on: boolean;
  onSelect: () => void;
};

/** anchor はレール項目の key かつ board.screen の値と一致している必要がある（両方に一致しないと描画されない） */
type ScreenKey = ReturnType<typeof useBoard>["screen"];

export type ConsoleSubnav = { anchor: ScreenKey; items: ConsoleSubnavItem[] };

type ConsoleShellCtxValue = { setSubnav: (sub: ConsoleSubnav | null) => void };

const ConsoleShellContext = createContext<ConsoleShellCtxValue | null>(null);

/**
 * 現在の画面が、指定した anchor（レール項目の key = board.screen 値）の直下に
 * サブメニューを出したいとき呼ぶ。ConsoleShell の Provider が無い場合（テスト等）は no-op。
 * 登録の解除はアンマウント時のみ（更新のたびに null を挟まないので、
 * 非メモ化オブジェクトを渡しても setSubnav 側の同値比較で吸収され、レンダーループしない）。
 * 注意: 同値比較は key/label/badge/on/anchor のみ。onSelect は比較されないため、
 * 安定関数（useState セッター等）か ref 経由で最新を参照する形で渡すこと。
 */
export function useConsoleSubnav(sub: ConsoleSubnav | null): void {
  const ctx = useContext(ConsoleShellContext);
  useEffect(() => {
    if (ctx) ctx.setSubnav(sub);
  }, [ctx, sub]);
  useEffect(() => {
    if (!ctx) return;
    return () => ctx.setSubnav(null);
  }, [ctx]);
}

/* ===================== レール用ローカルアイコン ===================== */

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </svg>
  );
}

/** 下部タブ(.mtab)の「コーチング」がアクティブになる画面（mobile-redesign §1-1） */
const MTAB_COACHING_SCREENS: ReadonlySet<ScreenKey> = new Set([
  "coaching",
  "board",
  "setpiece",
  "drill",
  "library",
]);
/** 下部タブの「ホーム」がアクティブになる画面（コーチラボ・設定もホーム扱い） */
const MTAB_HOME_SCREENS: ReadonlySet<ScreenKey> = new Set(["home", "settings", "articles"]);
/** 選手・保護者用「ホーム」タブ: コーチのような「コーチング」タブが無いため、
 * ホームから到達できるsetpiece(セットプレーデザイン)・board/drill/library(到達経路があれば)
 * も含めて現在地を示す（mobile-redesign Phase D-1(C2-minor 観点1/§8-5-26)：
 * どのタブもアクティブにならない=現在地不明を防ぐ） */
const MTAB_HOME_SCREENS_PLAYER: ReadonlySet<ScreenKey> = new Set([
  ...MTAB_HOME_SCREENS,
  "setpiece",
  "board",
  "drill",
  "library",
]);

/** 同じタブの再タップ時、現在の画面のスクロールコンテナを先頭へ戻す（§8-5-27）。
 * 各画面はそれぞれ .scroll（または .libpane/.libmain 等）を主要な可動域として持つため、
 * body/windowではなくそれらの scrollTop をリセットする */
function scrollActiveScreenToTop(): void {
  if (typeof document === "undefined") return;
  const root = document.querySelector(".conmain") ?? document;
  root.querySelectorAll<HTMLElement>(".scroll, .libpane, .libmain").forEach((el) => {
    el.scrollTop = 0;
  });
  window.scrollTo(0, 0);
}

/* ===================== 本体 ===================== */

export default function ConsoleShell({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const teamCtx = useTeam();
  const coach = board.auth.role === "coach";

  const [subnav, setSubnavState] = useState<ConsoleSubnav | null>(null);
  const lastSubnavRef = useRef<ConsoleSubnav | null>(null);
  const ctxValue = useRef<ConsoleShellCtxValue>({
    // 同値の再登録では setState しない（登録側の依存設計に依らず再レンダーループを防ぐ）
    setSubnav: (sub) => {
      const prev = lastSubnavRef.current;
      const same =
        prev === sub ||
        (!!prev &&
          !!sub &&
          prev.anchor === sub.anchor &&
          prev.items.length === sub.items.length &&
          prev.items.every(
            (p, i) =>
              p.key === sub.items[i].key &&
              p.label === sub.items[i].label &&
              p.badge === sub.items[i].badge &&
              p.on === sub.items[i].on
          ));
      if (same) return;
      lastSubnavRef.current = sub;
      setSubnavState(sub);
    },
  }).current;

  // 通知の既読はlocalStorage書き込みのみで状態が変わらないため、
  // saveNotifSeen が発火するイベントを購読してバッジを再計算する
  const [seenVer, setSeenVer] = useState(0);
  useEffect(() => {
    const bump = () => setSeenVer((v) => v + 1);
    window.addEventListener("alfa-notifseen", bump);
    return () => window.removeEventListener("alfa-notifseen", bump);
  }, []);

  const noteUnread = useMemo(() => {
    const identity = coach ? "coach" : "p:" + (board.auth.playerId ?? "");
    const seen = loadNotifSeen()[identity] ?? 0;
    return buildEventNotifications({
      role: board.auth.role,
      playerId: board.auth.playerId,
      notebook: board.notebook,
      deliverables: board.deliverables,
      players: board.state.players,
      team: teamCtx.team,
    }).filter((n) => n.ts > seen).length;
  }, [coach, board.auth.role, board.auth.playerId, board.notebook, board.deliverables, board.state.players, teamCtx.team, seenVer]);

  // 下部タブ(.mtab)。項目数はスタッフ5・選手/保護者4（mobile-redesign §1-1）。
  // チャット未読は既存の未読計算が無いため出さない
  type MtabItem = {
    key: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    on: boolean;
    onSelect: () => void;
  };
  const mtabItems: MtabItem[] = coach
    ? [
        {
          key: "home",
          label: "ホーム",
          icon: <IconHome />,
          on: MTAB_HOME_SCREENS.has(board.screen),
          onSelect: () => board.setScreen("home"),
        },
        {
          key: "coaching",
          label: "コーチング",
          icon: <IconWhistle />,
          on: MTAB_COACHING_SCREENS.has(board.screen),
          onSelect: () => board.setScreen("coaching"),
        },
        {
          key: "notebook",
          label: "ノート",
          icon: <IconNote />,
          badge: noteUnread,
          on: board.screen === "notebook",
          onSelect: () => board.setScreen("notebook"),
        },
        {
          key: "team",
          label: "チーム",
          icon: <IconCalendarCheck />,
          on: board.screen === "team",
          onSelect: () => board.setScreen("team"),
        },
        {
          key: "chat",
          label: "チャット",
          icon: <IconChat />,
          on: board.screen === "chat",
          onSelect: () => board.setScreen("chat"),
        },
      ]
    : [
        {
          key: "home",
          label: "ホーム",
          icon: <IconHome />,
          on: MTAB_HOME_SCREENS_PLAYER.has(board.screen),
          onSelect: () => board.setScreen("home"),
        },
        {
          key: "notebook",
          label: "ノート",
          icon: <IconNote />,
          badge: noteUnread,
          on: board.screen === "notebook",
          onSelect: () => board.setScreen("notebook"),
        },
        {
          key: "team",
          label: "チーム",
          icon: <IconCalendarCheck />,
          on: board.screen === "team",
          onSelect: () => board.setScreen("team"),
        },
        {
          key: "chat",
          label: "チャット",
          icon: <IconChat />,
          on: board.screen === "chat",
          onSelect: () => board.setScreen("chat"),
        },
      ];

  type Item = {
    key: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    onSelect: () => void;
  };
  type Entry = { sec?: string; item: Item };

  const entries: Entry[] = coach
    ? [
        { item: { key: "home", label: "ホーム", icon: <IconHome />, onSelect: () => board.setScreen("home") } },
        { sec: "コーチング", item: { key: "board", label: "戦術ボード", icon: <IconClipboard />, onSelect: () => board.setScreen("board") } },
        { item: { key: "drill", label: "練習メニュー", icon: <IconCone />, onSelect: () => board.setScreen("drill") } },
        { item: { key: "setpiece", label: "セットプレーデザイン", icon: <IconSetPiece />, onSelect: () => board.setScreen("setpiece") } },
        { item: { key: "library", label: "ライブラリ", icon: <IconFolder />, onSelect: () => board.setScreen("library") } },
        { sec: "チーム", item: { key: "notebook", label: "サッカーノート", icon: <IconNote />, badge: noteUnread, onSelect: () => board.setScreen("notebook") } },
        { item: { key: "team", label: "チーム運営", icon: <IconCalendarCheck />, onSelect: () => board.setScreen("team") } },
        { item: { key: "chat", label: "チャット", icon: <IconChat />, onSelect: () => board.setScreen("chat") } },
        { sec: "その他", item: { key: "articles", label: "コーチラボ", icon: <IconLab />, onSelect: () => board.setScreen("articles") } },
        { item: { key: "settings", label: "設定", icon: <IconCog />, onSelect: () => board.setScreen("settings") } },
      ]
    : [
        { item: { key: "home", label: "ホーム", icon: <IconHome />, onSelect: () => board.setScreen("home") } },
        { item: { key: "notebook", label: "サッカーノート", icon: <IconNote />, badge: noteUnread, onSelect: () => board.setScreen("notebook") } },
        // ラベルはHomeMenuの選手向けタイルと揃える
        { item: { key: "team", label: "チーム", icon: <IconCalendarCheck />, onSelect: () => board.setScreen("team") } },
        { item: { key: "chat", label: "チャット", icon: <IconChat />, onSelect: () => board.setScreen("chat") } },
      ];

  return (
    // 全画面再生(fullplay)中はレールを畳み、ビューポート基準のオーバーレイとズレないようにする
    <div className={`conshell${board.fullplay ? " fp" : ""}`}>
      <nav className="conrail" aria-label="メインナビゲーション">
        <div className="conbrand">
          {board.teamLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="conemblem" src={board.teamLogo} alt="" />
          ) : (
            // 未設定時は製品マークではなくクラブ名の頭文字（下部のALFA FOOTBALLと重複させない）
            <div className="conemblem empty" aria-hidden="true">
              {(board.state.teamName ?? "マイチーム").trim().charAt(0)}
            </div>
          )}
          <div className="conbrandtx">
            <div className="conclub" title={board.state.teamName ?? "マイチーム"}>
              {board.state.teamName ?? "マイチーム"}
            </div>
            {coach && <div className="conbrand-team">{PLAN_INFO[board.plan].name}プラン</div>}
          </div>
        </div>

        {entries.map((e) => (
          <Fragment key={e.item.key}>
            {e.sec && <div className="connavsec">{e.sec}</div>}
            <button
              type="button"
              className={`conrail-item${board.screen === e.item.key ? " on" : ""}`}
              aria-current={board.screen === e.item.key ? "page" : undefined}
              onClick={e.item.onSelect}
            >
              {e.item.icon}
              <span>{e.item.label}</span>
              {!!e.item.badge && e.item.badge > 0 && (
                <span className="conrail-badge">{e.item.badge > 9 ? "9+" : e.item.badge}</span>
              )}
            </button>
            {subnav && subnav.anchor === e.item.key && board.screen === subnav.anchor && (
              <div className="conrail-sub">
                {subnav.items.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    className={`conrail-item sub${it.on ? " on" : ""}`}
                    aria-current={it.on ? "page" : undefined}
                    onClick={it.onSelect}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                    {!!it.badge && it.badge > 0 && (
                      <span className="conrail-badge">{it.badge > 9 ? "9+" : it.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Fragment>
        ))}

        <div className="conproduct">
          <span aria-hidden="true">
            <LogoMark uid="railprod" className="rail-mark" />
          </span>
          <div className="logo">ALFA<b> FOOTBALL</b></div>
        </div>

        <div className="conuser">
          {board.auth.name} ・ {coach ? "管理者" : "選手"}
        </div>
      </nav>
      <div className="conmain">
        <ConsoleShellContext.Provider value={ctxValue}>{children}</ConsoleShellContext.Provider>
      </div>
      {/* 下部タブ（スマホ常設）。PCでは打ち消しリセット(.mtab{display:none})で隠す。
          全画面再生(FullPlayOverlay/.fp)中は隠す（mobile-redesign §1-1） */}
      {!board.fullplay && (
        <nav className="mtab" aria-label="主要メニュー">
          {mtabItems.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`mtab-item${it.on ? " on" : ""}`}
              aria-current={it.on ? "page" : undefined}
              aria-label={it.badge ? `${it.label} 未読${it.badge}件` : it.label}
              onClick={() => {
                // 「コーチング」「ホーム」はboard/setpiece等の下位画面も含めて
                // アクティブ表示になるため、再タップ判定は遷移先そのもの(=キー)と
                // board.screen の厳密一致で行う（下位画面からタブを押したときは
                // その集約画面へ遷移させ、既にその画面にいるときだけ先頭へ戻す）
                if (board.screen === it.key) {
                  scrollActiveScreenToTop();
                  return;
                }
                it.onSelect();
              }}
            >
              {it.icon}
              <span>{it.label}</span>
              {!!it.badge && it.badge > 0 && (
                <span className="mtab-badge" aria-hidden="true">{it.badge > 9 ? "9+" : it.badge}</span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
