"use client";

import { useMemo } from "react";
import { loadNotifSeen } from "@/lib/storage";
import { buildEventNotifications } from "@/lib/notifications";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
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

function Tile({
  icon,
  label,
  desc,
  tone,
  locked,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  tone: string;
  locked?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button className="apptile" onClick={onClick}>
      <span className="appicon" style={{ ["--tone" as string]: tone }}>
        {icon}
        {locked && <span className="applock"><E n="lock" /></span>}
        {!!badge && badge > 0 && <span className="appbadge">{badge > 9 ? "9+" : badge}</span>}
      </span>
      <span className="appmeta">
        <span className="applabel">{label}</span>
        {desc && <span className="appdesc">{desc}</span>}
      </span>
    </button>
  );
}

export default function HomeMenu() {
  const board = useBoard();
  const teamCtx = useTeam();
  const coach = board.auth.role === "coach";
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));
  const today = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

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
  }, [coach, board.auth.role, board.auth.playerId, board.notebook, board.deliverables, board.state.players, teamCtx.team]);

  // ⑥ スタッフの「今日やること」— 予定・未対応を1枚に集約
  const todayInfo = useMemo(() => {
    const team = teamCtx.team;
    const todayISO = new Date().toISOString().slice(0, 10);
    const events = team?.events ?? [];
    const todayEvents = events.filter((e) => e.date === todayISO);
    const nextEvent = [...events]
      .filter((e) => e.date >= todayISO)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    const focusEvent = todayEvents[0] ?? nextEvent;
    const pendingAtt = focusEvent
      ? board.state.players.filter((p) => !team?.attendance?.[focusEvent.id]?.[p.id]).length
      : 0;
    const uncommented = board.notebook.filter((n) => !n.staffComment).length;
    const weekAgo = Date.now() - 7 * 86400_000;
    const notesWeek = board.notebook.filter((n) => n.ts >= weekAgo).length;
    return { todayEvents, focusEvent, isToday: todayEvents.length > 0, pendingAtt, uncommented, notesWeek };
  }, [board.notebook, board.state.players, teamCtx.team]);

  const fmtEventDate = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    if (!y) return d;
    const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, day).getDay()];
    return `${m}/${day}(${wd})`;
  };

  return (
    <div className="app homeapp">
      <div className="homehero">
        <div className="homeherotop">
          <div className="homemark">
            <LogoMark uid="hm" />
          </div>
          <div className="homebrand">
            <div className="logo">
              ALFA<b> FOOTBALL</b>
            </div>
            <div className="hometeam">{board.state.teamName ?? "マイチーム"}</div>
          </div>
          <button className="homeout" onClick={logout}>
            ログアウト
          </button>
        </div>
        <div className="homegreet">
          <div className="homedate">{today}</div>
          <div className="homename">
            こんにちは、{board.auth.name} さん
            <span className="homerole">{coach ? "スタッフ" : "選手・保護者"}</span>
          </div>
        </div>
      </div>

      <div className="scroll" style={{ padding: "8px 16px calc(env(safe-area-inset-bottom) + 28px)" }}>
        {coach && (
          <div className="todaycard">
            <div className="todaycard-h">今日やること</div>
            <button className="todayevent" onClick={() => board.setScreen("team")}>
              <span className="todayevent-ic">
                <IconCalendarCheck />
              </span>
              <span className="todayevent-txt">
                {todayInfo.focusEvent ? (
                  <>
                    <b>
                      {todayInfo.isToday ? "今日" : fmtEventDate(todayInfo.focusEvent.date)}・
                      {todayInfo.focusEvent.kind === "match" ? "試合" : "練習"}
                    </b>
                    <span className="todayevent-sub">
                      {todayInfo.focusEvent.title}
                      {todayInfo.focusEvent.time ? ` ${todayInfo.focusEvent.time}〜` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <b>予定は未登録です</b>
                    <span className="todayevent-sub">タップして練習・試合を追加</span>
                  </>
                )}
              </span>
              <span className="todayevent-chev">›</span>
            </button>
            <div className="todaystats">
              <button className="todaystat" onClick={() => board.setScreen("team")}>
                <span className="todaystat-n">{todayInfo.pendingAtt}</span>
                <span className="todaystat-l">出欠未回答</span>
              </button>
              <button className="todaystat" onClick={() => board.setScreen("notebook")}>
                <span className="todaystat-n">{todayInfo.uncommented}</span>
                <span className="todaystat-l">未コメント</span>
              </button>
              <button className="todaystat" onClick={() => board.setScreen("chat")}>
                <span className="todaystat-n">
                  <IconChat />
                </span>
                <span className="todaystat-l">連絡する</span>
              </button>
            </div>
          </div>
        )}
        <div className="appgrid">
          {coach ? (
            <>
              <Tile
                icon={<IconClipboard />}
                label="戦術ボード"
                desc="スタメン作成・戦術アニメーション"
                tone="#caff3a"
                onClick={() => board.setScreen("board")}
              />
              <Tile
                icon={<IconFolder />}
                label="保存した戦術"
                desc="保存した戦術を一覧・読み込み"
                tone="#caff3a"
                onClick={() => board.openSheet({ type: "library" })}
              />
              <Tile
                icon={<IconCone />}
                label="練習メニュー"
                desc="コーン配置・動線で練習図を作成"
                tone="#caff3a"
                onClick={() => board.setScreen("drill")}
              />
              <Tile
                icon={<IconFolder />}
                label="保存した練習"
                desc="保存した練習メニューを一覧"
                tone="#caff3a"
                onClick={() => {
                  board.setDrillIntent("library");
                  board.setScreen("drill");
                }}
              />
              <Tile
                icon={<IconCalendarCheck />}
                label="チーム運営"
                desc="名簿・出欠・カレンダー・試合記録"
                tone="#caff3a"
                onClick={() => board.setScreen("team")}
              />
              <Tile
                icon={<IconChat />}
                label="チャット"
                desc="戦術・画像・動画を送受信"
                tone="#caff3a"
                onClick={() => board.setScreen("chat")}
              />
              <Tile
                icon={<IconNote />}
                label="サッカーノート"
                desc="試合・練習・自主練の振り返り"
                tone="#caff3a"
                badge={noteUnread}
                onClick={() => board.setScreen("notebook")}
              />
              <Tile
                icon={<IconBook />}
                label="お役立ち記事"
                desc="練習法・コンディション・戦術"
                tone="#caff3a"
                onClick={() => board.openSheet({ type: "articles" })}
              />
              <Tile
                icon={<IconCog />}
                label="設定"
                desc="チーム名・プラン・公開設定"
                tone="#caff3a"
                onClick={() => board.openSheet({ type: "settings" })}
              />
            </>
          ) : (
            <>
              <Tile
                icon={<IconCalendarCheck />}
                label="チーム"
                desc="出欠・カレンダー・試合記録"
                tone="#caff3a"
                onClick={() => board.setScreen("team")}
              />
              <Tile
                icon={<IconChat />}
                label="チャット"
                desc="スタッフ・チームとやりとり"
                tone="#caff3a"
                onClick={() => board.setScreen("chat")}
              />
              <Tile
                icon={<IconNote />}
                label="サッカーノート"
                desc="試合・練習・自主練の振り返り"
                tone="#caff3a"
                badge={noteUnread}
                onClick={() => board.setScreen("notebook")}
              />
            </>
          )}
        </div>
      </div>
    </div>
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
