"use client";

import React from "react";
import { IconChevronRight } from "../icons";
import { useGoalData } from "./useGoalData";
import { MAX_MID, midGoals, yearGoals } from "@/lib/goals";
import type { LadderRow } from "@/lib/goals";

/**
 * 階段（試作。specs/goals.md §2-2）。いちばん上に紺の夢のカード、その下に白いカードを下の段ほど 12px ずつ左へずらして並べる
 * （今日がいちばん左、大きな目標がいちばん右。右端はそろえる）。押したときの動き・空の段・見直しははしごと同じ。
 */

export interface GoalStairsProps {
  playerId: string;
  onSelect: (row: LadderRow) => void;
  onAdd: (kind: "dream" | "long" | "mid" | "year" | "month" | "week") => void;
  onReview: (which: "week" | "month") => void;
  onWeekLog: () => void;
}

export default function GoalStairs({ playerId, onSelect, onAdd, onReview, onWeekLog }: GoalStairsProps) {
  const { rows, days, today, pg } = useGoalData(playerId);
  const dream = rows[0];
  const steps = rows.slice(1);
  const todayDay = days.find((d) => d.date === today);
  // 足せる数と「＋ 次の…」の出し方は、はしごと同じ（GoalLadder）
  const midCount = midGoals(pg).length;
  const yearActive = yearGoals(pg).length;
  const lastDoneYear = [...steps].reverse().find((r) => r.kind === "year" && r.done)?.key;
  const nextAfter = (r: LadderRow) =>
    r.done && (r.kind === "long" || r.kind === "month" || (r.kind === "year" && yearActive === 0 && r.key === lastDoneYear));

  // あと N 段：今週の段から夢までの段の数（今日は数えない。今年は 1 段として数える）
  let seenYear = false;
  const remain = steps.filter((r) => {
    if (r.kind === "today") return false;
    if (r.kind === "year") {
      if (seenYear) return false;
      seenYear = true;
    }
    return true;
  }).length;

  const total = steps.length;
  const note = (r: LadderRow) =>
    r.staffNote ? (
      <div className="gl-note">
        {r.staffNote.by} ・ {new Date(r.staffNote.ts).getMonth() + 1}/{new Date(r.staffNote.ts).getDate()}：{r.staffNote.text}
      </div>
    ) : null;

  const dots = (
    <div className="gl-days" aria-label="今週のノート">
      {days.map((d) => (
        <div key={d.date} className={`gl-day${d.written ? " on" : ""}${d.date === today ? " today" : ""}`}>
          <span className="gl-daydot" />
          <span className="gl-daywd">{d.label}</span>
        </div>
      ))}
    </div>
  );

  const stepNode = (r: LadderRow, i: number) => {
    const below = total - 1 - i; // 下にある段の数
    const style = { marginLeft: below * 12 } as React.CSSProperties;
    const link = <div key={r.key + "-l"} className="gs-link" style={{ marginLeft: below * 12 + 8 }} aria-hidden="true" />;
    let card: React.ReactNode;

    if (r.kind === "today") {
      const t = todayDay?.focus;
      const ach = todayDay?.achievement;
      card = (
        <div className="gs-step today" style={style}>
          <div className="gs-meta">
            <span className="gl-label">今日意識したこと</span>
            <span className="gl-due">{r.due}</span>
          </div>
          {t ? (
            <div className="gs-text sm">
              {t}
              {ach != null && <span> ・ 達成度 {ach}%</span>}
            </div>
          ) : (
            <div className="gl-none">今日のノートはまだありません</div>
          )}
        </div>
      );
    } else if (r.kind === "week") {
      card = r.empty ? (
        <div className="gs-step week" style={style}>
          <div className="gs-text">今週の目標はまだ決めていません</div>
          <button type="button" className="st-btn gs-btn" onClick={() => onReview("week")}>
            今週の目標を決める
          </button>
        </div>
      ) : (
        <div className="gs-step week press" style={style}>
          <div
            className="gl-hit"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(r)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(r)}
          >
            <div className="gs-meta">
              <span className="gl-label gs-weeklab">今週</span>
              <span className="gl-due">{r.due}</span>
            </div>
            <div className={`gs-text${r.done ? " withbadge" : ""}`}>
              {r.text}
              {r.done && <span className="gl-badge">達成</span>}
            </div>
            {r.ifThen && <div className="gl-if">もし {r.ifThen}</div>}
            {dots}
            {note(r)}
            <div className="gl-more">
              <button
                type="button"
                className="gl-link"
                onClick={(e) => {
                  e.stopPropagation();
                  onWeekLog();
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                今週のノートを見る <IconChevronRight />
              </button>
            </div>
          </div>
          {r.done && (
            <button type="button" className="gl-add" onClick={() => onAdd("week")}>
              ＋ 次の今週の目標を書く
            </button>
          )}
        </div>
      );
    } else if (r.empty) {
      card = (
        <div className="gs-step empty" style={style}>
          <button
            type="button"
            className="gl-add"
            onClick={() => (r.kind === "month" ? onReview("month") : onAdd(r.kind as "long" | "year"))}
          >
            {r.kind === "month" ? "今月の目標を決める" : `＋ ${r.label}の目標を書く`}
          </button>
          {r.gradeLine && <div className="gs-text">{r.gradeLine}</div>}
        </div>
      );
    } else {
      card = (
        <div className={`gs-step${r.done ? " done" : ""}`} style={style}>
          <button type="button" className="gl-hit" onClick={() => onSelect(r)}>
            <div className="gs-meta">
              <span className="gl-label">{r.label}</span>
              {r.due && <span className="gl-due">{r.due}</span>}
            </div>
            <div className={`gs-text${r.done ? " withbadge" : ""}`}>
              {r.text}
              {r.done && <span className="gl-badge">達成</span>}
            </div>
            {r.done && r.doneLabel && <div className="gl-donelabel">{r.doneLabel}</div>}
            {r.gradeLine && <div className="gs-text">{r.gradeLine}</div>}
            {note(r)}
          </button>
          {nextAfter(r) && (
            <button type="button" className="gl-add" onClick={() => onAdd(r.kind as "long" | "year" | "month")}>
              ＋ 次の{r.label}の目標を書く
            </button>
          )}
        </div>
      );
    }
    return (
      <React.Fragment key={r.key}>
        {link}
        {card}
      </React.Fragment>
    );
  };

  return (
    <div className="gs">
      {dream.empty ? (
        <div className="gs-dream">
          <div className="gl-label">夢</div>
          <button type="button" className="gs-dreamadd" onClick={() => onAdd("dream")}>
            ＋ 夢を書く
          </button>
        </div>
      ) : (
        <button type="button" className="gs-dream" onClick={() => onSelect(dream)}>
          <div className="gl-label">夢</div>
          <div className="gs-dreamt">{dream.text}</div>
          <div className="gs-remain">ここまで あと {remain} 段</div>
        </button>
      )}
      {steps.map(stepNode)}
      {midCount < MAX_MID && (
        <button type="button" className="gl-add gs-addstep" onClick={() => onAdd("mid")}>
          ＋ ここに段を足す
        </button>
      )}
    </div>
  );
}
