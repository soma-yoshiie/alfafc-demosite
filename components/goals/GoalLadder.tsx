"use client";

import React, { useMemo } from "react";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { useProfiles } from "../ProfileProvider";
import { useGoals } from "../GoalsProvider";
import { IconCheck, IconChevronRight } from "../icons";
import { localDateStr, weekStart } from "@/lib/dates";
import { MAX_MID, isBlank, ladderRows, midGoals, weekDays, yearGoals } from "@/lib/goals";
import type { LadderRow } from "@/lib/goals";

/**
 * はしご（目標の画面の最初の画面。specs/goals.md §2-1）。夢 → 大きな目標 → 足した段 → 今年 → 今月 → 今週 → 今日を、
 * 左の縦線と丸でつなぐ。表示だけを受け持ち、押したときの動きは props のコールバックで親（GoalBoard）に返す：
 * onSelect（段の行。今日の段は押せない）・onAdd（空の段の「＋」と「＋ ここに段を足す」）・onReview（今週・今月の「決める」）・
 * onSetup（何も無いときの「目標を決める」）・onWeekLog（「今週のノートを見る」）・onGrades（成績の目標の行）。
 * 渡されなければその操作は出さない（スタッフの表示は何も渡さない＝読むだけ）。
 * compact＝スタッフの名簿の個人ページ用の詰めた形（青い枠のカード・「＋」・切り替えは出さない）。
 * compact でも onSelect を渡すと段が押せ、selectedKey の段の丸が青の輪になる（スタッフのひとことの送り先）。
 */

export interface GoalLadderProps {
  playerId: string;
  compact?: boolean;
  onSelect?: (row: LadderRow) => void;
  /** 選んでいる段の key（LadderRow.key） */
  selectedKey?: string | null;
  /** 空の段・達成した段の次の「＋」。kind は段の種類、"mid" は「ここに段を足す」 */
  onAdd?: (kind: "dream" | "long" | "mid" | "year" | "month" | "week") => void;
  onReview?: (which: "week" | "month") => void;
  onSetup?: () => void;
  onWeekLog?: () => void;
  onGrades?: () => void;
}

export default function GoalLadder({
  playerId,
  compact = false,
  onSelect,
  selectedKey,
  onAdd,
  onReview,
  onSetup,
  onWeekLog,
  onGrades,
}: GoalLadderProps) {
  const board = useBoard();
  const team = useTeam();
  const profiles = useProfiles();
  const goals = useGoals();
  const today = localDateStr();
  const stage = team.team.schoolStage ?? "elementary";
  const player = board.state.players.find((p) => p.id === playerId);
  const profile = profiles.get(playerId);
  const pg = goals.get(playerId);

  const rows = useMemo(() => ladderRows(pg, profile, player, today, stage), [pg, profile, player, today, stage]);
  const days = useMemo(
    () => weekDays(board.notebook, playerId, weekStart(today)),
    [board.notebook, playerId, today]
  );
  const todayDay = days.find((d) => d.date === today);

  const blank = isBlank(pg, profile);
  const pick = compact && !!onSelect;
  if (blank) {
    return (
      <div className={`gl-empty${compact ? " compact" : ""}`}>
        {/* スタッフ（compact）は読むだけなので「決められます」は出さない */}
        <p>{compact ? "目標はまだありません。" : "目標はまだありません。夢から今週までの目標を決められます。"}</p>
        {onSetup && (
          <button type="button" className="st-btn" onClick={onSetup}>
            目標を決める
          </button>
        )}
      </div>
    );
  }

  // 足せる数は、続けている目標で数える（達成した段は数えない。判断 15・25）
  const midCount = midGoals(pg).length;
  const yearActive = yearGoals(pg).length;
  const firstYear = rows.findIndex((r) => r.kind === "year");
  // 「＋ 次の…の目標を書く」は、その段に続けている目標が 1 つも無いときだけ出す。
  // 足した段は「＋ ここに段を足す」から足すので出さない（今年は、続けている目標があれば一覧の「＋ 今年の目標を足す」から）
  const lastDoneYear = [...rows].reverse().find((r) => r.kind === "year" && r.done)?.key;
  const nextAfter = (r: LadderRow) =>
    r.done && (r.kind === "long" || r.kind === "month" || (r.kind === "year" && yearActive === 0 && r.key === lastDoneYear));

  const addLabel = (r: LadderRow): string => {
    if (r.kind === "dream") return "＋ 夢を書く";
    if (r.kind === "long") return `＋ ${r.label}の目標を書く`;
    return `＋ ${r.label}の目標を書く`;
  };

  const meta = (r: LadderRow) =>
    compact ? (
      <div className="gl-label">{r.due ? `${r.label} ・ ${r.due}` : r.label}</div>
    ) : (
      <div className="gl-meta">
        <span className="gl-label">{r.label}</span>
        {r.due && <span className="gl-due">{r.due}</span>}
      </div>
    );

  const noteLine = (r: LadderRow) =>
    r.staffNote ? (
      <div className="gl-note">
        {r.staffNote.by} ・ {new Date(r.staffNote.ts).getMonth() + 1}/{new Date(r.staffNote.ts).getDate()}：{r.staffNote.text}
      </div>
    ) : null;

  const weekDots = (
    <div className="gl-days" aria-label="今週のノート">
      {days.map((d) => (
        <div key={d.date} className={`gl-day${d.written ? " on" : ""}${d.date === today ? " today" : ""}`}>
          <span className="gl-daydot" />
          <span className="gl-daywd">{d.label}</span>
        </div>
      ))}
    </div>
  );

  const renderRow = (r: LadderRow, i: number) => {
    const sel = selectedKey != null && selectedKey === r.key;
    // 送り先を選ぶとき（スタッフ）は、目標のある段だけが押せる（夢・空の段は送り先にならない）
    const pressable =
      !!onSelect && r.kind !== "today" && !(pick && !r.goal) && !(r.empty && r.kind !== "dream" && !onAdd);
    const dotCls = `gl-dot${(r.kind === "week" && !pick) || sel ? " now" : ""}${r.kind === "today" ? " today" : ""}${
      r.done ? " done" : ""
    }`;
    const cls = `gl-row k-${r.kind}${r.done ? " done" : ""}${r.empty ? " empty" : ""}`;
    const dot = (
      <span className={dotCls} aria-hidden="true">
        {r.done && <IconCheck />}
      </span>
    );

    // 今日
    if (r.kind === "today") {
      const t = todayDay?.focus;
      return (
        <div key={r.key} className={cls}>
          {dot}
          <div className="gl-body">
            {meta(r)}
            {t ? (
              <div className="gl-text">{t}</div>
            ) : (
              <div className="gl-none">今日のノートはまだありません</div>
            )}
          </div>
        </div>
      );
    }

    // 今週：青い枠のカード（compact は枠なし）
    if (r.kind === "week") {
      if (r.empty) {
        return (
          <div key={r.key} className={cls}>
            {dot}
            <div className="gl-body">
              {compact ? (
                <>
                  {meta(r)}
                  <div className="gl-none">今週の目標はまだ決めていません</div>
                </>
              ) : (
                <div className="gl-week">
                  <div className="gl-wtext">今週の目標はまだ決めていません</div>
                  {onReview && (
                    <button type="button" className="st-btn" onClick={() => onReview("week")}>
                      今週の目標を決める
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }
      const showFocus = !!todayDay?.focus;
      const ach = todayDay?.achievement;
      const inner = (
        <>
          {meta(r)}
          <div className={`gl-text gl-wtext${r.done ? " withbadge" : ""}`}>
            {r.text}
            {r.done && <span className="gl-badge">達成</span>}
          </div>
          {r.ifThen && <div className="gl-if">もし {r.ifThen}</div>}
          {weekDots}
          {!compact && showFocus && (
            <div className="gl-focus">
              <div className="gl-label">今日意識したこと</div>
              <div className="gl-focus-t">
                {todayDay!.focus}
                {ach != null && <span> ・ 達成度 {ach}%</span>}
              </div>
            </div>
          )}
          {noteLine(r)}
          {!compact && onWeekLog && (
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
          )}
        </>
      );
      return (
        <div key={r.key} className={cls}>
          {dot}
          <div className="gl-body">
            {compact ? (
              pressable ? (
                <button type="button" className="gl-hit" onClick={() => onSelect!(r)}>
                  {inner}
                </button>
              ) : (
                inner
              )
            ) : (
              <div className={`gl-week${pressable ? " press" : ""}`}>
                {pressable ? (
                  <div
                    className="gl-hit"
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect!(r)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect!(r)}
                  >
                    {inner}
                  </div>
                ) : (
                  inner
                )}
              </div>
            )}
            {r.done && onAdd && (
              <button type="button" className="gl-add" onClick={() => onAdd("week")}>
                ＋ 次の今週の目標を書く
              </button>
            )}
          </div>
        </div>
      );
    }

    // 空の段
    if (r.empty) {
      const rowNode = (() => {
        // 今月の見直し：「今月の目標を決める」
        if (r.kind === "month" && onReview) {
          return (
            <button type="button" className="gl-add" onClick={() => onReview("month")}>
              今月の目標を決める
            </button>
          );
        }
        if (onAdd) {
          return (
            <button type="button" className="gl-add" onClick={() => onAdd(r.kind as "dream" | "long" | "year" | "month")}>
              {addLabel(r)}
            </button>
          );
        }
        return (
          <>
            {meta(r)}
            <div className="gl-none">まだ書いていません</div>
          </>
        );
      })();
      const gradeBtn =
        r.gradeLine && !compact ? (
          onGrades ? (
            <button type="button" className="gl-text gl-grade gl-gradebtn" onClick={onGrades}>
              {r.gradeLine}
            </button>
          ) : (
            <div className="gl-text gl-grade">{r.gradeLine}</div>
          )
        ) : null;
      return (
        <React.Fragment key={r.key}>
          {r.kind === "year" && onAdd && midCount < MAX_MID && addStepRow()}
          <div className={cls}>
            {dot}
            <div className="gl-body">
              {rowNode}
              {gradeBtn}
            </div>
          </div>
        </React.Fragment>
      );
    }

    // 文のある段（夢・大きな目標・足した段・今年・今月）
    const body = (
      <>
        {meta(r)}
        <div className={`gl-text${r.kind === "dream" ? " dream" : ""}${r.done ? " withbadge" : ""}`}>
          {r.text}
          {r.done && <span className="gl-badge">達成</span>}
        </div>
        {r.done && r.doneLabel && <div className="gl-donelabel">{r.doneLabel}</div>}
        {r.gradeLine && !(onGrades && !compact) && <div className="gl-text gl-grade">{r.gradeLine}</div>}
        {noteLine(r)}
      </>
    );
    return (
      <React.Fragment key={r.key}>
        {r.kind === "year" && i === firstYear && onAdd && midCount < MAX_MID && addStepRow()}
        <div className={cls}>
          {dot}
          <div className="gl-body">
            {pressable ? (
              <button type="button" className="gl-hit" onClick={() => onSelect!(r)}>
                {body}
              </button>
            ) : (
              body
            )}
            {r.gradeLine && onGrades && !compact && (
              <button type="button" className="gl-text gl-grade gl-gradebtn" onClick={onGrades}>
                {r.gradeLine}
              </button>
            )}
            {nextAfter(r) && onAdd && (
              <button type="button" className="gl-add" onClick={() => onAdd(r.kind as "long" | "year" | "month")}>
                ＋ 次の{r.label}の目標を書く
              </button>
            )}
          </div>
        </div>
      </React.Fragment>
    );
  };

  // 大きな目標と今年の間の「＋ ここに段を足す」
  function addStepRow() {
    return (
      <div key="addstep" className="gl-row k-addstep">
        <span className="gl-dot ghost" aria-hidden="true" />
        <div className="gl-body">
          <button type="button" className="gl-add" onClick={() => onAdd!("mid")}>
            ＋ ここに段を足す
          </button>
        </div>
      </div>
    );
  }

  return <div className={`gl${compact ? " compact" : ""}${pick ? " pick" : ""}`}>{rows.map(renderRow)}</div>;
}
