"use client";

/**
 * スマホホーム（mobile-home-v3。specs/mobile-home-v3.md §2・§3）。
 * 行メニュー（MenuGroup/MenuRow）・「今日やること」・「チームのいま」は廃止し、
 * PCのMatchdayBoard（HomeMenu.tsx）と同じ集計（useMatchdayData。実体は components/homeData.tsx
 * に切り出し、HomeMenu.tsxとこのファイルはどちらもそこから import する＝循環importなし）・
 * 同じ配色実測値でスタッツ中心のホームにする。PCのDOM・見た目は一切変更しない
 * （HomeMenu.tsxのpc分岐は不変）。
 */

import { useState } from "react";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { PLAN_INFO } from "@/lib/types";
import {
  useMatchdayData,
  useHomeTimeline,
  fmtEventDate,
  categoryLabel,
  type BoardCtx,
  type TeamCtx,
} from "./homeData";
import { HomeAnnouncements, HomeGoals, HomeTimeline } from "./HomePanels";
import { IconBell, IconCog } from "./icons";

export default function MobileHome() {
  const board = useBoard();
  const team = useTeam();
  const coach = board.auth.role === "coach";
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));
  const today = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return coach ? (
    <MobileStaffHome board={board} team={team} today={today} logout={logout} />
  ) : (
    <MobilePlayerHome board={board} team={team} today={today} logout={logout} />
  );
}

/** ヘッダー（エンブレム＋クラブ名＋プラン名、右に設定）。既存の.mhome-*クラスをそのまま再利用する */
function MhomeHeader({ board, coach }: { board: BoardCtx; coach: boolean }) {
  return (
    <div className="mhome-header">
      <div className="mhome-club">
        {board.teamLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="mhome-emblem" src={board.teamLogo} alt="" />
        ) : (
          <div className="mhome-emblem empty" aria-hidden="true">
            {(board.state.teamName ?? "マイチーム").trim().charAt(0)}
          </div>
        )}
        <div className="mhome-clubtx">
          <div className="mhome-clubname" title={board.state.teamName ?? "マイチーム"}>
            {board.state.teamName ?? "マイチーム"}
          </div>
          {coach && <div className="mhome-plan">{PLAN_INFO[board.plan].name}プラン</div>}
        </div>
      </div>
      {coach && (
        <button type="button" className="mhome-gear" aria-label="設定" onClick={() => board.setScreen("settings")}>
          <IconCog />
        </button>
      )}
    </div>
  );
}

/** フッター（「ALFA FOOTBALL」＋ログアウト。既存の.mhome-footをそのまま再利用する） */
function MhomeFoot({ logout }: { logout: () => void }) {
  return (
    <div className="mhome-foot">
      <div className="mhome-footlogo">
        ALFA<b> FOOTBALL</b>
      </div>
      <button type="button" className="mhome-logout" onClick={logout}>
        ログアウト
      </button>
    </div>
  );
}

type MatchdayData = ReturnType<typeof useMatchdayData>;

/**
 * ヒーロー（次の予定）。スタッフ・選手の両ホームで共通のPC同等表示（濃紺グラデ・VSカード/
 * カウントダウン・2列メタ・主操作）を1箇所にまとめる（レビューPhase D-1 C1-major/C3-major:
 * 選手ホームだけVSカード/カウントダウンが欠けていたのは、この共通化前に選手側が別実装で
 * nextEventを取り直していたため。以後は両者ともuseMatchdayDataの同じ値を描くので再発しない）。
 * メタ4項目目（出欠）と主操作・空状態の文言だけ呼び出し側で変える。
 */
function MhomeHero({
  board,
  categories,
  nextEvent,
  cd,
  showVsCard,
  opponent,
  teamName,
  metaLabel,
  metaValue,
  ctaLabel,
  onCta,
  emptyLabel,
  emptyCtaLabel,
  onEmptyCta,
}: {
  board: BoardCtx;
  categories: TeamCtx["categories"];
  nextEvent: MatchdayData["nextEvent"];
  cd: MatchdayData["cd"];
  showVsCard: boolean;
  opponent: string | null;
  teamName: string;
  metaLabel: string;
  metaValue: string;
  ctaLabel: string;
  onCta: () => void;
  emptyLabel: string;
  emptyCtaLabel: string;
  onEmptyCta: () => void;
}) {
  if (!nextEvent) {
    return (
      <div className="mh-herothin">
        <span>{emptyLabel}</span>
        <button type="button" className="mh-herothin-cta" onClick={onEmptyCta}>
          {emptyCtaLabel}
        </button>
      </div>
    );
  }
  return (
    <div className="mh-hero">
      <div className="mh-herotop">
        {showVsCard ? (
          <div className="mh-vscard">
            <div className="mh-vsteam">
              {board.teamLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mh-emblem" src={board.teamLogo} alt="" />
              ) : (
                <span className="mh-emblem mh-emblem-fallback" aria-hidden="true">
                  {teamName.trim().charAt(0)}
                </span>
              )}
              <span className="mh-ownname">{teamName}</span>
            </div>
            <span className="mh-vs">VS</span>
            <div className="mh-vsteam mh-vsteam-opp">
              <span className="mh-oppname">{opponent}</span>
            </div>
          </div>
        ) : (
          <div className="mh-eventcard">
            <span className="mh-eventtitle">{nextEvent.title}</span>
            <span className="mh-eventcat">{categoryLabel(nextEvent, categories)}</span>
          </div>
        )}
        {cd && (
          <div className="mh-countdown">
            {cd.started ? "まもなく開始" : `${cd.days}日 ${cd.hours}時間 ${cd.minutes}分`}
          </div>
        )}
      </div>

      <div className="mh-metarow">
        <div className="mh-metaitem">
          <span className="mh-metalabel">会場</span>
          <span className="mh-metaval">{nextEvent.place || "—"}</span>
        </div>
        <div className="mh-metaitem">
          <span className="mh-metalabel">開始</span>
          <span className="mh-metaval">
            {fmtEventDate(nextEvent.date)}
            {nextEvent.time ? ` ${nextEvent.time}〜` : ""}
          </span>
        </div>
        {nextEvent.note && (
          <div className="mh-metaitem">
            <span className="mh-metalabel">メモ</span>
            <span className="mh-metaval">{nextEvent.note.split("\n")[0]}</span>
          </div>
        )}
        {/* board-squad-and-pc-polish §3: メンバー登録済みの試合バッジ。
            レビュー指摘(1回目): 濃紺グラデのヒーローカード内で.evgroups.targeted（薄青地に
            薄青文字）を使うとコントラスト比が約2.1:1しか無く読めなかった。隣の値と同じ
            .mh-metaval（白文字）で出す */}
        {nextEvent.kind === "match" && nextEvent.squad && (
          <div className="mh-metaitem">
            <span className="mh-metalabel">メンバー</span>
            <span className="mh-metaval">メンバー発表</span>
          </div>
        )}
        <div className="mh-metaitem">
          <span className="mh-metalabel">{metaLabel}</span>
          <span className="mh-metaval">{metaValue}</span>
        </div>
      </div>

      <button type="button" className="mh-cta" onClick={onCta}>
        {ctaLabel}
      </button>
    </div>
  );
}

/* ============================== スタッフのホーム（§2） ============================== */

function MobileStaffHome({
  board,
  team,
  today,
  logout,
}: {
  board: BoardCtx;
  team: TeamCtx;
  today: string;
  logout: () => void;
}) {
  const d = useMatchdayData(board, team);
  const [bellOpen, setBellOpen] = useState(false);
  // p18 §4: スタッフのホームのタイムライン（ノートの提出・届いたメッセージ。すべて＋学年）
  const timeline = useHomeTimeline(board, team);

  return (
    <div className="app homeapp mhome-root">
      <MhomeHeader board={board} coach />

      <div className="scroll">
        <div className="mh-greetrow">
          <div className="homegreet mhome-greet">
            <div className="homedate">{today}</div>
            <div className="homename">
              こんにちは、{board.auth.name}さん
              <span className="homerole">スタッフ</span>
            </div>
          </div>
          <button
            type="button"
            className="mh-bell"
            onClick={() => setBellOpen((o) => !o)}
            aria-label={d.bellBadge > 0 ? `対応が必要なこと（${d.bellBadge}件）` : "対応が必要なこと"}
            aria-expanded={bellOpen}
            aria-controls="mh-bellrows"
          >
            <IconBell />
            {d.bellBadge > 0 && <span className="mh-bellcount">{d.bellBadge > 9 ? "9+" : d.bellBadge}</span>}
          </button>
        </div>

        {bellOpen && (
          <div className="mh-bellrows" id="mh-bellrows">
            {d.bellRows.length === 0 ? (
              <div className="mdb-bellempty">対応が必要なことはありません</div>
            ) : (
              d.bellRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="mdb-bellrow"
                  onClick={() => {
                    r.onClick();
                    setBellOpen(false);
                  }}
                >
                  <span className="mdb-bellbadge">{r.badge > 9 ? "9+" : r.badge}</span>
                  <span className="mdb-bellbody">
                    <span className="mdb-belltitle">{r.title}</span>
                    <span className="mdb-bellreason">{r.reason}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="mh-section">
          <MhomeHero
            board={board}
            categories={team.categories}
            nextEvent={d.nextEvent}
            cd={d.cd}
            showVsCard={d.showVsCard}
            opponent={d.opponent}
            teamName={d.teamName}
            metaLabel="出欠"
            metaValue={`未回答 ${d.unansweredNext}名`}
            ctaLabel="出欠を確認"
            onCta={() => {
              board.setTeamIntent({ tab: "cal", eventId: d.nextEvent!.id });
              board.setScreen("team");
            }}
            emptyLabel="次の予定はまだありません"
            emptyCtaLabel="予定を追加 ›"
            onEmptyCta={() => board.setScreen("team")}
          />
        </div>

        {/* p18 §4: 指標 2×2・グラフ・今月のトピック・最新の動きをやめ、ノートとチャットのタイムライン＋最新のお知らせにした */}
        <HomeTimeline scopes={timeline} variant="mobile" />

        <HomeAnnouncements viewer="staff" variant="mobile" />

        {d.highlightChips.length > 0 && (
          <div className="mh-section mdb-highlights">
            {d.highlightChips.map((c, i) => (
              <span className={`mdb-chip mdb-chip-${c.kind}`} key={i}>
                {c.text}
              </span>
            ))}
          </div>
        )}

        <div className="mh-section">
          <MhomeFoot logout={logout} />
        </div>
      </div>
    </div>
  );
}

/* ============================== 選手・保護者のホーム（§3） ============================== */

function MobilePlayerHome({
  board,
  team,
  today,
  logout,
}: {
  board: BoardCtx;
  team: TeamCtx;
  today: string;
  logout: () => void;
}) {
  const me = board.auth.playerId ?? "";

  // ヒーロー（次の予定）: スタッフと同じ useMatchdayData を使う(Phase D-1 C1-major/
  // C3-major修正。以前は選手ホーム独自にnextEventを取り直していたため、次の予定が試合でも
  // VSカード・カウントダウンが出ない不整合があった)。
  // groups-everywhere §3: forPlayerId(=me)を渡し、「次の予定」を自分の予定だけから選ぶ
  const d = useMatchdayData(board, team, me);
  const myAttendance = d.nextEvent ? team.team.attendance[d.nextEvent.id]?.[me]?.status : undefined;
  const attLabel =
    myAttendance === "yes" ? "出席" : myAttendance === "no" ? "欠席" : myAttendance === "maybe" ? "未定" : "未回答";

  return (
    <div className="app homeapp mhome-root">
      <MhomeHeader board={board} coach={false} />

      <div className="scroll">
        <div className="homegreet mhome-greet">
          <div className="homedate">{today}</div>
          <div className="homename">
            こんにちは、{board.auth.name}さん
            <span className="homerole">選手・保護者</span>
          </div>
        </div>

        <div className="mh-section">
          <MhomeHero
            board={board}
            categories={team.categories}
            nextEvent={d.nextEvent}
            cd={d.cd}
            showVsCard={d.showVsCard}
            opponent={d.opponent}
            teamName={d.teamName}
            metaLabel="自分の出欠"
            metaValue={attLabel}
            ctaLabel="出欠を回答する"
            onCta={() => {
              board.setTeamIntent({ tab: "cal", eventId: d.nextEvent!.id });
              board.setScreen("team");
            }}
            emptyLabel="次の予定はまだありません"
            emptyCtaLabel="チームのカレンダーを見る ›"
            onEmptyCta={() => board.setScreen("team")}
          />
        </div>

        {/* p18 §5: 4 つの数値の枠・直近の試合・最新の動きをやめ、目標と最新のお知らせにした */}
        <HomeGoals playerId={me} variant="mobile" />

        <HomeAnnouncements viewer="player" variant="mobile" />

        <div className="mh-section">
          <MhomeFoot logout={logout} />
        </div>
      </div>
    </div>
  );
}
