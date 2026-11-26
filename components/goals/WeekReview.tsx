"use client";

import React, { useState } from "react";
import { useGoalData } from "./useGoalData";
import { addDaysStr, weekStart } from "@/lib/dates";
import {
  fmtMonthOnly,
  fmtWeekRange,
  monthEnd,
  monthGoalFor,
  monthOf,
  prevMonthGoal,
  prevWeekGoal,
  weekGoalFor,
} from "@/lib/goals";
import type { Goal, GoalReview } from "@/lib/goals";

/**
 * 週と月の見直し（specs/goals.md §2-4）。「今週の目標を決める」「今月の目標を決める」で開く、目標の画面の中の次の画面。
 * 前の週（月）の目標があり、まだ見直していなければ「できた・半分・まだ」を聞き、続ける｜変えるで今週（今月）の目標を決める。
 * 急かす表示・罰・連続の記録は作らない。押さなくても先へ進める。
 */

const REVIEW_OPTS: { v: GoalReview; label: string }[] = [
  { v: "done", label: "できた" },
  { v: "half", label: "半分" },
  { v: "notyet", label: "まだ" },
];

export default function WeekReview({
  playerId,
  which,
  onDone,
}: {
  playerId: string;
  which: "week" | "month";
  /** 「決める」「あとで」の後（目標の画面の最初へ戻る） */
  onDone: () => void;
}) {
  const { board, goals, pg, today } = useGoalData(playerId);
  const week = which === "week";
  const noun = week ? "週" : "月";
  const ym = monthOf(today);
  const mon = weekStart(today);

  const current = week ? weekGoalFor(pg, today) : monthGoalFor(pg, ym);
  const prev = week ? prevWeekGoal(pg, today) : prevMonthGoal(pg, ym);
  // 見直しを聞くのは、開いた時点でまだ見直していない前の目標だけ（押した後もカードは残す）
  const [askId] = useState<string | null>(prev && !prev.review ? prev.id : null);
  const asked: Goal | undefined = askId ? pg.goals.find((g) => g.id === askId) : undefined;

  const [choice, setChoice] = useState<"keep" | "change">("keep");
  const [text, setText] = useState(current?.text ?? prev?.text ?? "");
  const [ifThen, setIfThen] = useState(current?.ifThen ?? (week ? prev?.ifThen ?? "" : ""));
  const monthLine = week ? monthGoalFor(pg, ym) : undefined;

  // 前の週（月）でなければ、期間で出す（数週間あいたとき）
  const prevMonth = addDaysStr(`${ym}-01`, -1).slice(0, 7);
  const askedHead = !asked?.period
    ? `${week ? "先週" : "先月"}の目標`
    : week
      ? asked.period === addDaysStr(mon, -7)
        ? "先週の目標"
        : `${fmtWeekRange(asked.period)} の週の目標`
      : asked.period === prevMonth
        ? "先月の目標"
        : `${fmtMonthOnly(asked.period)}の目標`;

  const review = (v: GoalReview) => {
    if (!asked) return;
    goals.setReview(playerId, asked.id, asked.review === v ? null : v);
  };

  const decide = () => {
    const t = text.trim();
    if (!t) return board.toast(`${week ? "今週" : "今月"}の目標の文を入れてください`);
    const period = week ? mon : ym;
    goals.setGoal(playerId, {
      ...(current ? { id: current.id } : {}),
      level: week ? "week" : "month",
      order: 0,
      text: t,
      due: week ? addDaysStr(mon, 6) : monthEnd(ym),
      period,
      ifThen: week && ifThen.trim() ? ifThen.trim() : undefined,
      status: "active",
    });
    onDone();
  };

  return (
    <div className="greview">
      {asked && (
        <div className="greview-card">
          <div className="greview-h">{askedHead}</div>
          <div className="greview-t">{asked.text}</div>
          <div className="greview-btns" role="radiogroup" aria-label={`${week ? "先週" : "先月"}の目標の見直し`}>
            {REVIEW_OPTS.map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={asked.review === o.v}
                className={asked.review === o.v ? "on" : ""}
                onClick={() => review(o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="greview-hint">押さなくても先へ進めます</div>
        </div>
      )}
      {monthLine && <div className="greview-month">今月：{monthLine.text}</div>}
      <div className="greview-card">
        <div className="greview-h">{week ? "今週" : "今月"}の目標</div>
        {prev && !current && (
          <div className="phubseg" role="radiogroup" aria-label={`今${noun}の目標をどうするか`}>
            {(
              [
                ["keep", "続ける"],
                ["change", "変える"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={choice === v}
                className={choice === v ? "on" : ""}
                onClick={() => {
                  setChoice(v);
                  if (v === "keep" && prev) {
                    setText(prev.text);
                    setIfThen(week ? prev.ifThen ?? "" : "");
                  }
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="st-input greview-input"
          aria-label={`今${noun}の目標`}
          rows={2}
          value={text}
          placeholder="例）受ける前に首を振る"
          onChange={(e) => setText(e.target.value)}
        />
        {week && (
          <>
            <label className="greview-lab" htmlFor="greview-if">
              もし〜なら〜する（任意）
            </label>
            <input
              id="greview-if"
              className="st-input"
              aria-label="もし〜なら〜する"
              value={ifThen}
              onChange={(e) => setIfThen(e.target.value)}
            />
          </>
        )}
      </div>
      <button type="button" className="st-btn" onClick={decide}>
        決める
      </button>
      <button type="button" className="greview-later" onClick={onDone}>
        あとで
      </button>
    </div>
  );
}
