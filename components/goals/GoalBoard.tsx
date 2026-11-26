"use client";

import React, { useRef, useState } from "react";
import { HubEditBtn } from "../hub/common";
import { IconChevronLeft, IconEdit } from "../icons";
import type { GoalScreen } from "../GoalsProvider";
import GoalLadder from "./GoalLadder";
import GoalStairs from "./GoalStairs";
import GoalList from "./GoalList";
import GoalEditSheet from "./GoalEditSheet";
import type { GoalEditTarget } from "./GoalEditSheet";
import WeekReview from "./WeekReview";
import WeekLog from "./WeekLog";
import GoalSetup from "./GoalSetup";
import { useGoalData } from "./useGoalData";
import { staffIdentity } from "@/lib/chat";
import { addDaysStr } from "@/lib/dates";
import { fmtWeekRange, isBlank, setupEntryLabel, setupUnfinished } from "@/lib/goals";
import type { LadderRow } from "@/lib/goals";

/**
 * 目標の画面の中身（specs/goals.md §2）。置き場は 2 つ：プロフィールの区画「目標」（mode="section"。hub/GoalsSection）と、
 * どの画面からでも開ける重ね表示（mode="overlay"。GoalOverlay）。
 *
 * 画面の中の行き先は 5 つ（screen で切り替える。戻るで ladder へ）：
 *   ladder（はしご／階段。最初の画面）・list（一覧）・review（週と月の見直し）・weeklog（今週のノート）・setup（はじめての設定）。
 * 直すシート（GoalEditSheet）は選手だけ。スタッフは読むだけで、はしごの下の入力 1 行からひとことを送る。
 */

export type GoalBoardScreen = "ladder" | "list" | "review" | "weeklog" | "setup";

export interface GoalBoardProps {
  playerId: string;
  viewer: "staff" | "player";
  /** section＝プロフィールの区画（最初の画面には上の帯を出さない）／overlay＝重ね表示（いちばん上の帯になる） */
  mode?: "section" | "overlay";
  /** overlay の戻る（閉じる） */
  onClose?: () => void;
  /** 成績表へ移る（成績の目標の行。プロフィールの区画から渡す） */
  onGrades?: () => void;
  /** 進路の区画へ移る（スタッフの「面談の記録を見る」。プロフィールの区画から渡す） */
  onCareer?: () => void;
  /** 開いたときの最初の行き先（重ね表示から。既定は最初の画面） */
  initialScreen?: GoalScreen;
}

export default function GoalBoard({
  playerId,
  viewer,
  mode = "section",
  onClose,
  onGrades,
  onCareer,
  initialScreen,
}: GoalBoardProps) {
  const d = useGoalData(playerId);
  const { board, goals, pg, profile, rows } = d;
  const [screen, setScreen] = useState<GoalBoardScreen>(
    initialScreen === "setup" ? "setup" : initialScreen === "review-week" || initialScreen === "review-month" ? "review" : "ladder"
  );
  const [reviewWhich, setReviewWhich] = useState<"week" | "month">(initialScreen === "review-month" ? "month" : "week");
  const [edit, setEdit] = useState<GoalEditTarget | null>(null);
  const [logMon, setLogMon] = useState(d.monday);
  const [sel, setSel] = useState<string | null>(null);

  const staff = viewer === "staff";
  const overlay = mode === "overlay";
  const first = screen === "ladder";
  const blank = isBlank(pg, profile);
  const view = staff ? "ladder" : pg.view ?? "ladder";

  // 今週のノートで過去の週を開いているときは、その週の名前で出す（帯 GoalBand と同じ書き分け）
  const logTitle =
    logMon === d.monday ? "今週の目標" : logMon === addDaysStr(d.monday, -7) ? "先週の目標" : `${fmtWeekRange(logMon)} の週の目標`;
  const title =
    screen === "review" ? (reviewWhich === "month" ? "今月の目標" : "今週の目標") : screen === "weeklog" ? logTitle : screen === "setup" ? "目標を決める" : "目標";

  // 上の帯：重ね表示は最初の画面から。区画の中は次の画面から（最初の画面は区画の見出しの右に鉛筆）
  const showHead = overlay || !first;
  // はじめての設定の中では、戻るは 1 つ前の歩へ（1 歩目なら目標の画面へ）。GoalSetup が受け手を入れる
  const setupBack = useRef<(() => boolean) | null>(null);
  const back = () => {
    if (screen === "setup" && setupBack.current?.()) return;
    if (first) onClose?.();
    else setScreen("ladder");
  };
  const toLadder = () => setScreen("ladder");

  const addGoal = (kind: "dream" | "long" | "mid" | "year" | "month" | "week") =>
    setEdit(kind === "dream" ? { kind: "dream" } : { kind: "goal", level: kind });
  const selectRow = (r: LadderRow) => {
    if (staff) {
      if (r.goal) setSel(r.key);
      return;
    }
    if (r.kind === "dream") return setEdit({ kind: "dream" });
    if (r.goal) return setEdit({ kind: "goal", level: r.goal.level, goal: r.goal });
    if (r.kind === "month" || r.kind === "week") {
      setReviewWhich(r.kind);
      return setScreen("review");
    }
    addGoal(r.kind as "long" | "year");
  };
  const review = (which: "week" | "month") => {
    setReviewWhich(which);
    setScreen("review");
  };
  const weekLog = () => {
    setLogMon(d.monday);
    setScreen("weeklog");
  };
  const openNote = (id: string) => {
    board.setNoteIntent({ noteId: id });
    board.setScreen("notebook");
    onClose?.();
  };

  const pencil = !staff && first ? <HubEditBtn label="目標を編集" onClick={() => setScreen("list")} /> : null;
  const unfinished = !staff && first && !blank && setupUnfinished(pg, profile);

  return (
    <div className={`gb gb-${mode}`}>
      {showHead && (
        <div className="gb-head">
          <button type="button" className="gb-back" aria-label="戻る" onClick={back}>
            <IconChevronLeft />
          </button>
          <h2 className="gb-title">{title}</h2>
          {!staff && first && (
            <button type="button" className="phubedit inline" aria-label="目標を編集" onClick={() => setScreen("list")}>
              <IconEdit />
            </button>
          )}
        </div>
      )}
      {!showHead && !staff && (
        <div className="phubh">
          <div>
            <h3>目標</h3>
          </div>
          {pencil}
        </div>
      )}
      <div className="gb-body">
        {!staff && first && !blank && (
          <div className="gs-switch" role="group" aria-label="見せ方">
            {(
              [
                ["ladder", "はしご"],
                ["stairs", "階段"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`mseg-item${view === v ? " on" : ""}`}
                aria-pressed={view === v}
                onClick={() => goals.setView(playerId, v)}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        {unfinished && (
          <button type="button" className="gl-add gb-resume" onClick={() => setScreen("setup")}>
            {setupEntryLabel(pg)} ›
          </button>
        )}
        {renderScreen()}
      </div>
      {edit && !staff && <GoalEditSheet playerId={playerId} target={edit} onClose={() => setEdit(null)} />}
    </div>
  );

  function renderScreen() {
    if (screen === "list") return <GoalList playerId={playerId} onEdit={setEdit} onGrades={onGrades} />;
    if (screen === "review") return <WeekReview playerId={playerId} which={reviewWhich} onDone={toLadder} />;
    if (screen === "weeklog")
      return <WeekLog playerId={playerId} monday={logMon} onPickWeek={setLogMon} onOpenNote={openNote} />;
    if (screen === "setup") return <GoalSetup playerId={playerId} onExit={toLadder} backRef={setupBack} />;

    if (staff) {
      return (
        <>
          <GoalLadder playerId={playerId} compact onSelect={selectRow} selectedKey={staffTarget()?.key} onGrades={onGrades} />
          <StaffInput playerId={playerId} target={staffTarget()} onCareer={onCareer} />
        </>
      );
    }
    if (view === "stairs" && !blank)
      return <GoalStairs playerId={playerId} onSelect={selectRow} onAdd={addGoal} onReview={review} onWeekLog={weekLog} />;
    return (
      <GoalLadder
        playerId={playerId}
        onSelect={selectRow}
        onAdd={addGoal}
        onReview={review}
        onSetup={() => setScreen("setup")}
        onWeekLog={weekLog}
        onGrades={onGrades}
      />
    );
  }

  /** スタッフのひとことの送り先の段：選んでいる段（目標のある段）。既定は今週、無ければある中でいちばん下の段 */
  function staffTarget(): LadderRow | undefined {
    const withGoal = rows.filter((r) => r.goal && r.kind !== "dream" && r.kind !== "today");
    return (
      withGoal.find((r) => r.key === sel) ?? withGoal.find((r) => r.kind === "week") ?? withGoal[withGoal.length - 1]
    );
  }
}

/** スタッフのひとこと：入力 1 行と「送る」。選んでいる段の目標に付く。目標が 1 つも無ければ入力は出さない */
function StaffInput({
  playerId,
  target,
  onCareer,
}: {
  playerId: string;
  target: LadderRow | undefined;
  onCareer?: () => void;
}) {
  const { board, team, goals } = useGoalData(playerId);
  const [text, setText] = useState("");
  const send = () => {
    if (!target?.goal || !text.trim()) return;
    const ident = staffIdentity(board.auth.name, team.team.coaches);
    if (goals.addStaffNote(playerId, target.goal.id, text, `${ident.name}${ident.role}`)) {
      setText("");
      board.toast("送りました");
    }
  };
  return (
    <div className="gstaff">
      {target && (
        <div className="gstaff-form">
          <input
            className="st-input"
            aria-label="目標にひとこと"
            value={text}
            placeholder={`${target.kind === "mid" ? "そのため" : target.label}の目標にひとこと`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
          />
          <button type="button" className="st-btn gstaff-send" onClick={send}>
            送る
          </button>
        </div>
      )}
      <p className="gstaff-note">目標を直せるのは本人だけ（将来の目標と成績の目標は、進路・成績表で直せます）</p>
      {onCareer && (
        <button type="button" className="gl-link gstaff-link" onClick={onCareer}>
          面談の記録を見る ›
        </button>
      )}
    </div>
  );
}
