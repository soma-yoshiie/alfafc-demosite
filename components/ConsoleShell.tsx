"use client";

import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadNotifSeen } from "@/lib/storage";
import { buildEventNotifications } from "@/lib/notifications";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import LogoMark from "./Logo";
import {
  IconBook,
  IconCalendarCheck,
  IconChat,
  IconCog,
  IconCone,
  IconFolder,
  IconNote,
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

function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 3h6v3H9z" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M12 3v3M4 13h2M18 13h2" />
    </svg>
  );
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
        { item: { key: "library", label: "ライブラリ", icon: <IconFolder />, onSelect: () => board.setScreen("library") } },
        { sec: "チーム", item: { key: "notebook", label: "サッカーノート", icon: <IconNote />, badge: noteUnread, onSelect: () => board.setScreen("notebook") } },
        { item: { key: "team", label: "チーム運営", icon: <IconCalendarCheck />, onSelect: () => board.setScreen("team") } },
        { item: { key: "chat", label: "チャット", icon: <IconChat />, onSelect: () => board.setScreen("chat") } },
        { sec: "その他", item: { key: "articles", label: "お役立ち記事", icon: <IconBook />, onSelect: () => board.setScreen("articles") } },
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
          <LogoMark uid="rail" className="rail-mark" />
          <div>
            <div className="logo">
              ALFA<b> FOOTBALL</b>
            </div>
            <div className="conbrand-team">{board.state.teamName ?? "マイチーム"}</div>
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

        <div className="conuser">
          {board.auth.name} ・ {coach ? "管理者" : "選手"}
        </div>
      </nav>
      <div className="conmain">
        <ConsoleShellContext.Provider value={ctxValue}>{children}</ConsoleShellContext.Provider>
      </div>
    </div>
  );
}
