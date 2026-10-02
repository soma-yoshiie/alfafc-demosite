"use client";

import { useEffect, useRef, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import MobileHome from "./MobileHome";
import {
  useMatchdayData,
  useHomeTimeline,
  fmtEventDate,
  categoryLabel,
  type BoardCtx,
  type TeamCtx,
} from "./homeData";
import { HomeAnnouncements, HomeGoals, HomeTimeline } from "./HomePanels";

/* ===================== PC判定（ConsoleScreens.tsx の PC_MQ 前例をそのままコピー） ===================== */
const PC_MQ = "(min-width: 1024px)";
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

export default function HomeMenu() {
  const board = useBoard();
  const teamCtx = useTeam();
  const coach = board.auth.role === "coach";
  const pc = usePc();
  const logout = () => window.dispatchEvent(new Event("alfa-logout"));
  const today = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  // PC×コーチのみ「マッチデー・ボード」へ刷新。モバイル・選手のJSXは以下、一切変更しない
  if (pc && coach) {
    return <MatchdayBoard board={board} team={teamCtx} logout={logout} today={today} />;
  }

  // p18 §5: PC（選手）ホームもスタッフと同じ .mdb-root の器で作り直した（旧 .app.homeapp の JSX は廃止）。
  // フックは PlayerPcHome の中で呼ぶ（HomeMenu のフックの数と順序を一定に保つため）
  if (pc) {
    return <PlayerPcHome board={board} team={teamCtx} logout={logout} today={today} />;
  }

  // ---- ここからモバイル（コーチ・選手共通）。mobile-home-v3: 行メニュー/今日やること/チームのいまを廃し、
  // MatchdayBoardと集計を共有するスタッツ中心のホーム(MobileHome)に一本化する ----
  return <MobileHome />;
}

/* =========================================================================================
 * マッチデー・ボード（PCコーチホーム刷新）
 * PC(min-width:1024px) かつ コーチ のときだけ HomeMenu からレンダリングされる専用ホーム。
 * カウントダウン等のintervalは、このコンポーネントがマウントされている間だけ動く
 * （モバイル/選手経路に切り替わればアンマウントされ、各useEffectのcleanupで自動停止する）。
 * ========================================================================================= */

function MatchdayBoard({
  board,
  team,
  logout,
  today,
}: {
  board: BoardCtx;
  team: TeamCtx;
  logout: () => void;
  today: string;
}) {
  const {
    nextEvent,
    opponent,
    showVsCard,
    cd,
    unansweredNext,
    bellBadge,
    bellRows,
    highlightChips,
    teamName,
  } = useMatchdayData(board, team);
  // p18 §4: スタッフのホームのタイムライン（ノートの提出・届いたメッセージ。すべて＋学年）
  const timeline = useHomeTimeline(board, team);

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bellOpen) return;
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBellOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [bellOpen]);

  return (
    <div className="mdb-root">
      <div className="mdb-greetrow">
        <div className="mdb-greetin">
          <div className="mdb-greet">
            <div className="mdb-date">{today}</div>
            <div className="mdb-name">
              こんにちは、{board.auth.name}さん
              <span className="mdb-role">スタッフ</span>
            </div>
          </div>
          <div className="mdb-greetactions">
            <div className="mdb-bellwrap" ref={bellRef}>
              <button
                type="button"
                className="mdb-bell"
                onClick={() => setBellOpen((o) => !o)}
                aria-label={bellBadge > 0 ? `対応が必要なこと（${bellBadge}件）` : "対応が必要なこと"}
              >
                <E n="bell" />
                {bellBadge > 0 && <span className="mdb-bellcount">{bellBadge > 9 ? "9+" : bellBadge}</span>}
              </button>
              {bellOpen && (
                <div className="mdb-bellpanel" role="menu">
                  {bellRows.length === 0 ? (
                    <div className="mdb-bellempty">対応が必要なことはありません</div>
                  ) : (
                    bellRows.map((r) => (
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
            </div>
            <button className="homeout" onClick={logout}>
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="scroll mdb-scroll">
        {/* 区画1: ヒーロー（p18 §5: 選手の PC ホームと共通の MdbHero） */}
        <MdbHero
          board={board}
          categories={team.categories}
          nextEvent={nextEvent}
          cd={cd}
          showVsCard={showVsCard}
          opponent={opponent}
          teamName={teamName}
          metaLabel="出欠"
          metaValue={`未回答 ${unansweredNext}名`}
          ctaLabel="出欠を確認"
          onCta={() => board.setScreen("team")}
          emptyLabel="次の予定はまだありません"
          emptyCtaLabel="予定を追加 ›"
          onEmptyCta={() => board.setScreen("team")}
        />

        {/* p18 §4: 指標タイル・グラフ・今月のトピック・最新の動きをやめ、サッカーノートとチャットのタイムライン＋最新のお知らせにした */}
        <HomeTimeline scopes={timeline} variant="pc" />

        <HomeAnnouncements viewer="staff" variant="pc" />

        {highlightChips.length > 0 && (
          <div className="mdb-highlights">
            {highlightChips.map((c, i) => (
              <span className={`mdb-chip mdb-chip-${c.kind}`} key={i}>
                {c.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================================
 * p18 §5: ヒーロー（次の予定）。スタッフの MatchdayBoard と選手の PlayerPcHome の共通部品。
 * スタッフの JSX（クラス名・構造・文言）をそのまま切り出したもの。出欠の欄（metaLabel/metaValue）・
 * 主操作・予定が無いときの文言だけ呼び出し側で変える（スマホの MhomeHero と同じ作り）。
 * カウントダウンの更新（fadeKey）もここに持つ。
 * ========================================================================================= */

type MatchdayData = ReturnType<typeof useMatchdayData>;

function MdbHero({
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
  // 分の値が変わったらキーを更新してCSSアニメ(opacity 300msフェード)を再生させる
  const [fadeKey, setFadeKey] = useState(0);
  const prevMinRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cd) return;
    const cur = cd.days * 1440 + cd.hours * 60 + cd.minutes;
    if (prevMinRef.current !== null && prevMinRef.current !== cur) setFadeKey((k) => k + 1);
    prevMinRef.current = cur;
  }, [cd]);

  if (!nextEvent) {
    return (
      <div className="mdb-herothin">
        <span>{emptyLabel}</span>
        <button type="button" className="mdb-herothin-cta" onClick={onEmptyCta}>
          {emptyCtaLabel}
        </button>
      </div>
    );
  }
  return (
    <div className="mdb-hero">
      <div className="mdb-herobody">
        {showVsCard ? (
          <div className="mdb-vscard">
            <div className="mdb-side mdb-side-own">
              {board.teamLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mdb-emblem" src={board.teamLogo} alt="" />
              ) : (
                <span className="mdb-emblem mdb-emblem-fallback" aria-hidden="true">
                  {teamName.trim().charAt(0)}
                </span>
              )}
              <span className="mdb-ownname">{teamName}</span>
            </div>
            <span className="mdb-vs">VS</span>
            <div className="mdb-side mdb-side-opp">
              <span className="mdb-oppname">{opponent}</span>
            </div>
          </div>
        ) : (
          <div className="mdb-eventcard">
            <span className="mdb-eventtitle">{nextEvent.title}</span>
            <span className="mdb-eventcat">{categoryLabel(nextEvent, categories)}</span>
          </div>
        )}

        <div className="mdb-countdownwrap">
          {cd && (
            <div className="mdb-countdown" key={fadeKey}>
              {cd.started ? "まもなく開始" : `${cd.days}日 ${cd.hours}時間 ${cd.minutes}分`}
            </div>
          )}
        </div>
      </div>

      <div className="mdb-metarow">
        <div className="mdb-metaitem">
          <span className="mdb-metalabel">会場</span>
          <span className="mdb-metaval">{nextEvent.place || "—"}</span>
        </div>
        <div className="mdb-metaitem">
          <span className="mdb-metalabel">開始</span>
          <span className="mdb-metaval">
            {fmtEventDate(nextEvent.date)}
            {nextEvent.time ? ` ${nextEvent.time}〜` : ""}
          </span>
        </div>
        {nextEvent.note && (
          <div className="mdb-metaitem">
            <span className="mdb-metalabel">メモ</span>
            <span className="mdb-metaval">{nextEvent.note.split("\n")[0]}</span>
          </div>
        )}
        {/* board-squad-and-pc-polish §3: メンバー登録済みの試合バッジ。
            レビュー指摘(1回目): 濃紺グラデのヒーローカード内で.evgroups.targeted（薄青地に
            薄青文字）を使うとコントラスト比が約2.1:1しか無く読めなかった。隣の値と同じ
            .mdb-metaval（白文字）で出す */}
        {nextEvent.kind === "match" && nextEvent.squad && (
          <div className="mdb-metaitem">
            <span className="mdb-metalabel">メンバー</span>
            <span className="mdb-metaval">メンバー発表</span>
          </div>
        )}
        <div className="mdb-metaitem mdb-metaitem-att">
          <span className="mdb-metalabel">{metaLabel}</span>
          <span className="mdb-metaval">{metaValue}</span>
          <button type="button" className="mdb-cta" onClick={onCta}>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================================
 * p18 §5: 選手・保護者のPCホーム。スタッフのマッチデー・ボードと同じ .mdb-root の器
 * （あいさつ → ヒーロー → 目標｜最新のお知らせの2列）。ベルは出さない（ログアウトだけ）。
 * HomeMenu のフックの数・順序を変えないよう、フックはこの中で呼ぶ。
 * ========================================================================================= */

function PlayerPcHome({
  board,
  team,
  logout,
  today,
}: {
  board: BoardCtx;
  team: TeamCtx;
  logout: () => void;
  today: string;
}) {
  const me = board.auth.playerId ?? "";
  // groups-everywhere §3: forPlayerId(=me)を渡し、「次の予定」を自分の予定だけから選ぶ
  const d = useMatchdayData(board, team, me);
  const myAttendance = d.nextEvent ? team.team.attendance[d.nextEvent.id]?.[me]?.status : undefined;
  const attLabel =
    myAttendance === "yes" ? "出席" : myAttendance === "no" ? "欠席" : myAttendance === "maybe" ? "未定" : "未回答";

  return (
    <div className="mdb-root">
      <div className="mdb-greetrow">
        <div className="mdb-greetin">
          <div className="mdb-greet">
            <div className="mdb-date">{today}</div>
            <div className="mdb-name">
              こんにちは、{board.auth.name}さん
              <span className="mdb-role">選手・保護者</span>
            </div>
          </div>
          <div className="mdb-greetactions">
            <button className="homeout" onClick={logout}>
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="scroll mdb-scroll">
        <MdbHero
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

        <div className="mdb-cols">
          <HomeGoals playerId={me} variant="pc" />
          <HomeAnnouncements viewer="player" variant="pc" />
        </div>
      </div>
    </div>
  );
}
