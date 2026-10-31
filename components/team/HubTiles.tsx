"use client";

import { useMemo } from "react";
import type { AttendanceStatus, CalColorMode, CalFilter, Player } from "@/lib/types";
import { localDateStr } from "@/lib/dates";
import { chatBadge, hubChatPreview } from "@/lib/badges";
import {
  chatPreviewLine,
  chatSenderName,
  fmtMD,
  gradeSummary,
  injurySummary,
  latestMatch,
  matchResultOf,
  nextMatchEvent,
  weekStrip,
} from "@/lib/hubTiles";
import { messageBodyText } from "@/lib/chat";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { useChatBadgeInput } from "../useChatBadgeInput";
import { fmtEventDate, opponentFromTitle, useMatchdayData } from "../homeData";
import { IconCalendarCheck, IconChat, IconFlag, IconUsers } from "../icons";

/*
 * スマホ「チーム」の目次（specs/hub-tiles.md §1-2〜§1-4）。
 * 下部タブ「チーム」を開いたとき最初に出る、タイル 2 列の画面。TeamHub の activeTab === "menu"（スマホだけ）で描く。
 * タイルは「今の状態」を持つ（次の予定・未回答・最新の試合・人数・最新の未読）。
 *   スタッフ＝全幅 カレンダー（これから 7 日の帯つき）／半幅 試合記録・名簿／全幅 チャット（最新の未読 2 件）
 *   選手・保護者＝全幅 カレンダー（帯つき・自分の出欠）／半幅 試合記録・チャット
 * 集計は lib/hubTiles.ts の純関数。次の予定・未回答は PC／スマホのホームのヒーローと同じ useMatchdayData。
 * ボタンの中なので、中身は span だけで組む（div は入れない）。
 */

export type HubTileTab = "cal" | "rec" | "ros" | "chat";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

const ATT_LABEL: Record<AttendanceStatus, string> = { yes: "出席", no: "欠席", maybe: "未定" };

/** タイル 1 枚。名前の行（アイコン＋名前＋数字）・状態（行は項目ごとに固定）・›。押せる範囲はタイル全体 */
function Tile({
  size,
  icon,
  name,
  badge,
  onClick,
  children,
  extra,
}: {
  size: "half" | "full";
  icon: React.ReactNode;
  name: string;
  badge?: number;
  onClick: () => void;
  /** 状態の行（.hubtile-ln を並べる） */
  children: React.ReactNode;
  /** 状態の下に積むもの（カレンダーの「これから 7 日」の帯） */
  extra?: React.ReactNode;
}) {
  return (
    <button type="button" className={`hubtile ${size}`} onClick={onClick}>
      <span className="hubtile-h">
        <span className="hubtile-ic" aria-hidden="true">
          {icon}
        </span>
        {/* 名前の textContent は名前だけに保つ（数字は兄弟要素。MenuRow の .mrow-label と同じ作法） */}
        <span className="hubtile-n">{name}</span>
        {!!badge && badge > 0 && (
          <span className="mrow-badge" aria-hidden="true">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="hubtile-st">{children}</span>
      {extra}
      <span className="hubtile-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** 状態の 1 行（高さ 19px 固定・1 行・はみ出しは省略）。中身が無い行も高さは保つ */
function Ln({ children }: { children?: React.ReactNode }) {
  return <span className="hubtile-ln">{children != null && children !== "" && <span className="ell">{children}</span>}</span>;
}

export function HubTiles({
  isCoach,
  me,
  showRos,
  calFilter,
  calMine,
  calColorMode,
  onOpen,
}: {
  isCoach: boolean;
  /** 表示中の選手・保護者（スタッフ表示のときは null） */
  me: Player | null;
  /** 名簿のタイルを出すか（スタッフ表示のときだけ） */
  showRos: boolean;
  /** カレンダー本体と同じ絞り込み（TeamHub の calFilterEff） */
  calFilter: CalFilter;
  calMine: boolean;
  calColorMode: CalColorMode;
  onOpen: (tab: HubTileTab) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const players = board.state.players;
  // 次の予定・未回答はホームのヒーローと同じ集計（試合記録に紐づいた予定・終わった予定を除く）。選手は自分の予定だけ
  const md = useMatchdayData(board, team, isCoach ? undefined : me?.id ?? null);
  const today = localDateStr();
  const now = new Date();
  const ev = md.nextEvent;
  const matches = team.team.matches;
  const recVisible = isCoach || board.matchesPublic;

  /* ---- カレンダー ---- */
  const calWhen = ev
    ? `次は ${[fmtEventDate(ev.date), ev.allDay ? "" : ev.time, ev.title].filter(Boolean).join(" ")}`
    : "次の予定はまだありません";
  let calSecond: React.ReactNode = null;
  if (ev) {
    if (isCoach) {
      calSecond =
        md.unansweredNext > 0 ? (
          <>
            未回答 <b className="hubtile-acc">{md.unansweredNext}名</b>
          </>
        ) : (
          "未回答 0名"
        );
    } else {
      const st = me ? team.team.attendance[ev.id]?.[me.id]?.status : undefined;
      calSecond = (
        <>
          出欠 {st ? <span className="hubtile-ink">{ATT_LABEL[st]}</span> : <b className="hubtile-acc">未回答</b>}
        </>
      );
    }
  }
  const days = weekStrip(today, team.team.events, {
    filter: calFilter,
    isCoach,
    me,
    groups: team.groups,
    categories: team.categories,
    calMine,
    colorMode: calColorMode,
  });

  /* ---- 試合記録 ---- */
  const last = recVisible ? latestMatch(matches) : null;
  const lastRes = last ? matchResultOf(last) : null;
  const nextMatch = isCoach ? nextMatchEvent(team.team.events, matches, today, now) : null;

  /* ---- 名簿 ---- */
  const stage = team.team.schoolStage ?? "elementary";
  const inj = injurySummary(players);
  const injParts = [inj.out > 0 ? `離脱中 ${inj.out}` : "", inj.recovering > 0 ? `復帰途上 ${inj.recovering}` : ""].filter(Boolean);

  /* ---- チャット ---- */
  const chatInput = useChatBadgeInput();
  const chatUnread = chatBadge(chatInput);
  const chatMsgs = useMemo(() => hubChatPreview(chatInput, isCoach ? 2 : 1), [chatInput, isCoach]);

  const calTile = (
    <Tile
      size="full"
      icon={<IconCalendarCheck />}
      name="カレンダー"
      onClick={() => onOpen("cal")}
      extra={
        <span className="hubwk">
          <span className="hubwk-lab">これから 7 日</span>
          <span className="hubwk-days">
            {days.map((d) => (
              <span key={d.ymd} className="hubwk-d">
                <span className={`hubwk-w${d.wd === 0 ? " sun" : ""}`}>{WD[d.wd]}</span>
                <span className={`hubwk-n${d.isToday ? " today" : ""}`}>{d.day}</span>
                <span className="hubwk-dots">
                  {d.colors.map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
              </span>
            ))}
          </span>
        </span>
      }
    >
      <Ln>{calWhen}</Ln>
      <Ln>{calSecond}</Ln>
    </Tile>
  );

  const recTile = (
    <Tile size="half" icon={<IconFlag />} name="試合記録" onClick={() => onOpen("rec")}>
      {!recVisible ? (
        <Ln>公開されていません</Ln>
      ) : last && lastRes ? (
        <span className="hubtile-ln">
          <span className={`evresult ${lastRes.cls}`}>
            {lastRes.label} {lastRes.score}
          </span>
          <span className="keep">{fmtMD(last.date)} vs{" "}</span>
          <span className="ell">{last.opponent}</span>
        </span>
      ) : (
        <Ln>まだ試合がありません</Ln>
      )}
      {isCoach && (
        <Ln>{nextMatch ? `次 ${fmtEventDate(nextMatch.date)} vs ${opponentFromTitle(nextMatch.title) ?? nextMatch.title}` : ""}</Ln>
      )}
      {!isCoach && <Ln />}
    </Tile>
  );

  const rosTile = (
    <Tile size="half" icon={<IconUsers />} name="名簿" onClick={() => onOpen("ros")}>
      <Ln>{`${players.length} 人`}</Ln>
      <Ln>{gradeSummary(players, stage)}</Ln>
      <Ln>{injParts.length > 0 ? injParts.join(" ・ ") : "怪我 なし"}</Ln>
    </Tile>
  );

  // スタッフ＝全幅で最新の未読 2 件を「送り主：本文」で 2 行／選手・保護者＝半幅で送り主と本文の 2 行
  const emptyChat = chatMsgs.length === 0;
  const chatTile = isCoach ? (
    <Tile size="full" icon={<IconChat />} name="チャット" badge={chatUnread} onClick={() => onOpen("chat")}>
      {emptyChat ? (
        <>
          <Ln>メッセージはまだありません</Ln>
          <Ln />
        </>
      ) : (
        <>
          <Ln>{chatPreviewLine(chatMsgs[0], players)}</Ln>
          <Ln>{chatMsgs[1] ? chatPreviewLine(chatMsgs[1], players) : ""}</Ln>
        </>
      )}
    </Tile>
  ) : (
    <Tile size="half" icon={<IconChat />} name="チャット" badge={chatUnread} onClick={() => onOpen("chat")}>
      {emptyChat ? (
        <>
          <Ln>メッセージはまだありません</Ln>
          <Ln />
        </>
      ) : (
        <>
          <Ln>{chatSenderName(chatMsgs[0], players)}</Ln>
          <Ln>{messageBodyText(chatMsgs[0])}</Ln>
        </>
      )}
    </Tile>
  );

  return (
    <div className="hubtiles-wrap">
      <div className="hubtiles">
        {calTile}
        {recTile}
        {showRos ? rosTile : null}
        {chatTile}
      </div>
    </div>
  );
}
