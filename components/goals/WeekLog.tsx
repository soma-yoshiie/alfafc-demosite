"use client";

import React, { useMemo } from "react";
import { IconChevronRight } from "../icons";
import { useGoalData } from "./useGoalData";
import { NOTE_KIND_LABEL } from "@/lib/types";
import { addDaysStr } from "@/lib/dates";
import { fmtDayWd, fmtWeekRange, monthGoalFor, monthOf, weekDays } from "@/lib/goals";
import type { Goal } from "@/lib/goals";
import type { FreeNote, NotebookEntry } from "@/lib/types";

/**
 * 今週のノート（specs/goals.md §2-5）。目標の画面の中の次の画面。上に今月へのつながり・その週の目標・7 つの丸、
 * 「今日意識したこと」の日ごとの行（ノートのある日だけ。押すとそのノートの詳細へ）、「スタッフから」、「先週まで ›」。
 */

const REVIEW_LABEL = { done: "できた", half: "半分", notyet: "まだ" } as const;

export default function WeekLog({
  playerId,
  monday,
  onPickWeek,
  onOpenNote,
}: {
  playerId: string;
  /** 見ている週の月曜 */
  monday: string;
  onPickWeek: (monday: string) => void;
  onOpenNote: (noteId: string) => void;
}) {
  const { board, pg, today, monday: thisMonday } = useGoalData(playerId);
  const days = useMemo(() => weekDays(board.notebook, playerId, monday), [board.notebook, playerId, monday]);

  // その週の目標：続けている・達成した物を優先（「変えた」は除く）
  const weekGoal: Goal | undefined = useMemo(() => {
    const list = pg.goals.filter((g) => g.level === "week" && g.period === monday && g.status !== "changed");
    return list.find((g) => g.status === "active") ?? list[0];
  }, [pg.goals, monday]);

  const ym = monday === thisMonday ? monthOf(today) : monthOf(addDaysStr(monday, 3));
  const monthGoal = monthGoalFor(pg, ym) ?? pg.goals.find((g) => g.level === "month" && g.status === "done" && g.period === ym);

  const past = useMemo(
    () =>
      pg.goals
        .filter((g) => g.level === "week" && g.status !== "changed" && g.period && g.period < thisMonday && g.period !== monday)
        .sort((a, b) => (a.period! < b.period! ? 1 : a.period! > b.period! ? -1 : 0)),
    [pg.goals, thisMonday, monday]
  );

  const notes = (weekGoal ? pg.staffNotes.filter((n) => n.goalId === weekGoal.id) : []).sort((a, b) => a.ts - b.ts);
  // note-free §4: 自由ノートには「今日意識したこと」の欄が無いので、この一覧には出さない
  const rows = days.flatMap((d) => d.notes.filter((n): n is Exclude<NotebookEntry, FreeNote> => n.kind !== "free").map((n) => ({ d, n })));
  const hasFree = days.some((d) => d.notes.some((n) => n.kind === "free"));
  const focusCount = (m: string) => weekDays(board.notebook, playerId, m).filter((d) => d.focus).length;

  return (
    <div className="gweek">
      {monthGoal && <div className="gweek-month">今月：{monthGoal.text}</div>}
      <div className="gweek-card">
        {weekGoal ? (
          <>
            <div className="gweek-goal">{weekGoal.text}</div>
            <div className="gweek-due">期限 {fmtWeekRange(monday)}</div>
            {weekGoal.ifThen && (
              <div className="gweek-if">
                もし〜なら <b>{weekGoal.ifThen}</b>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="gweek-goal none">この週の目標はありません</div>
            <div className="gweek-due">{fmtWeekRange(monday)}</div>
          </>
        )}
        <div className="gl-days gweek-days" aria-label="この週のノート">
          {days.map((d) => (
            <div key={d.date} className={`gl-day${d.written ? " on" : ""}${d.date === today ? " today" : ""}`}>
              <span className="gl-daydot" />
              <span className="gl-daywd">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 className="gweek-h">今日意識したこと</h3>
      {rows.length === 0 ? (
        <div className="gweek-none">
          {hasFree ? "練習・試合・自主練のノートはまだありません" : "この週のノートはまだありません"}
        </div>
      ) : (
        <div className="gweek-list">
          {rows.map(({ d, n }) => {
            const focus = (n.kind === "practice" ? n.goalPre : n.focus)?.trim();
            const ach = n.kind === "practice" && typeof n.achievement === "number" ? n.achievement : undefined;
            return (
              <button key={n.id} type="button" className="gweek-row" onClick={() => onOpenNote(n.id)}>
                <span className="gweek-rowtx">
                  <span className="gweek-rowh">
                    {fmtDayWd(d.date)}
                    {NOTE_KIND_LABEL[n.kind].replace(/ノート$/, "")}
                  </span>
                  {focus ? (
                    <span className="gweek-rowt">{focus}</span>
                  ) : (
                    <span className="gweek-rowt none">（意識したことの記入なし）</span>
                  )}
                </span>
                {ach != null && <span className="gweek-ach">{ach}%</span>}
              </button>
            );
          })}
        </div>
      )}

      {notes.length > 0 && (
        <>
          <h3 className="gweek-h">スタッフから</h3>
          {notes.map((n) => (
            <div key={n.id} className="gweek-staff">
              <div className="gweek-stafft">{n.text}</div>
              <div className="gweek-staffby">{n.by}</div>
            </div>
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <h3 className="gweek-h">先週まで</h3>
          <div className="gweek-list">
            {past.slice(0, 12).map((g) => (
              <button key={g.id} type="button" className="gweek-row" onClick={() => onPickWeek(g.period!)}>
                <span className="gweek-rowtx">
                  <span className="gweek-rowh">{fmtWeekRange(g.period!)}</span>
                  <span className="gweek-rowt">{g.text}</span>
                  <span className="gweek-rowh">
                    {g.review ? `${REVIEW_LABEL[g.review]} ・ ` : ""}今日意識したこと {focusCount(g.period!)} 件
                  </span>
                </span>
                <IconChevronRight className="glist-chev" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
