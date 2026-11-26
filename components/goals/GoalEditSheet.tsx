"use client";

import React, { useState } from "react";
import { Field, HubSheet, Seg, SheetDelete, SheetSave } from "../hub/common";
import { useGoalData } from "./useGoalData";
import { addDaysStr, weekStart } from "@/lib/dates";
import {
  LEVEL_LABEL,
  MAX_MID,
  MAX_YEAR,
  defaultLongDue,
  fmtMonthOnly,
  fmtWeekRange,
  longLabelOf,
  midGoals,
  monthEnd,
  monthOf,
  schoolYearEnd,
  yearGoals,
} from "@/lib/goals";
import type { Goal, GoalLevel } from "@/lib/goals";
import type { GoalInput } from "../GoalsProvider";

/**
 * 直すシート（specs/goals.md §2-3）。今のプロフィールの編集と同じ HubSheet。上から：目標（文）→ 期限 →
 * 3 つの選択（今ある目標のときだけ）→「保存」。夢は進路の将来の目標を直す。
 */

export type GoalEditTarget = { kind: "dream" } | { kind: "goal"; level: GoalLevel; goal?: Goal };

type Mode = "keep" | "change" | "done";

const BAD_END = /優勝|勝つ|合格|選ばれる/;

function dueParts(due: string | undefined, fallbackY: number, fallbackM: number): [number, number] {
  const m = /^(\d{4})-(\d{2})/.exec(due ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [fallbackY, fallbackM];
}

export default function GoalEditSheet({
  playerId,
  target,
  onClose,
}: {
  playerId: string;
  target: GoalEditTarget;
  onClose: () => void;
}) {
  const { board, goals, profile, pg, stage, today, player } = useGoalData(playerId);
  const isDream = target.kind === "dream";
  const level: GoalLevel = target.kind === "goal" ? target.level : "long";
  const goal = target.kind === "goal" ? target.goal : undefined;
  const existing = !!goal;

  const curDream = (profile.career.futureGoal ?? "").trim();
  const [text, setText] = useState(isDream ? curDream : goal?.text ?? "");
  const [nextText, setNextText] = useState("");
  const [ifThen, setIfThen] = useState(goal?.ifThen ?? "");
  const [mode, setMode] = useState<Mode>("keep");
  const [label, setLabel] = useState(longLabelOf(pg, stage));

  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  // 期限の既定：大きな目標＝今の学校を卒業する年の 3 月、今年＝今の年度の終わり、足した段＝1 年後の同じ月
  const [fbY, fbM] =
    level === "long"
      ? defaultLongDue(today, stage, player?.grade)
      : level === "year"
        ? [Number(schoolYearEnd(today).slice(0, 4)), 3]
        : [ty + 1, tm];
  const [dueY0, dueM0] = dueParts(goal?.due, fbY, fbM);
  const [dueY, setDueY] = useState(dueY0);
  const [dueM, setDueM] = useState(dueM0);

  const period =
    goal?.period ?? (level === "week" ? weekStart(today) : level === "month" ? monthOf(today) : undefined);
  const periodic = level === "week" || level === "month";
  const dueStr = periodic
    ? level === "week"
      ? addDaysStr(period!, 6)
      : monthEnd(period!)
    : `${dueY}-${String(dueM).padStart(2, "0")}-${String(new Date(dueY, dueM, 0).getDate()).padStart(2, "0")}`;

  const years: number[] = [];
  for (let y = ty - 1; y <= ty + 12; y++) years.push(y);
  if (!years.includes(dueY)) years.push(dueY);
  years.sort((a, b) => a - b);

  const baseLabel = isDream
    ? "夢"
    : level === "long"
      ? longLabelOf(pg, stage)
      : level === "mid"
        ? "そのため"
        : LEVEL_LABEL[level];
  const title = isDream ? "夢" : `${baseLabel}の目標`;

  const orderForNew = (): number => {
    if (level === "mid") return Math.max(-1, ...midGoals(pg).map((g) => g.order)) + 1;
    if (level === "year") return Math.max(-1, ...yearGoals(pg).map((g) => g.order)) + 1;
    return 0;
  };

  // fresh＝「達成した」の次の目標。前の目標の「もし〜なら」は引き継がない（欄を出していないので、見えないまま付くのを避ける）
  const build = (t: string, withId?: string, fresh = false): GoalInput => ({
    ...(withId ? { id: withId } : {}),
    level,
    order: goal?.order ?? orderForNew(),
    text: t,
    due: dueStr,
    period,
    ifThen: level === "week" && !fresh && ifThen.trim() ? ifThen.trim() : undefined,
    // 達成した目標を何も変えずに保存しても、続けている目標に戻さない（新しい目標は常に続けている）
    status: withId && goal ? goal.status : "active",
  });

  const warn = (m: string) => board.toast(m);

  const save = () => {
    const t = text.trim();
    if (isDream) {
      if (!t) return warn("夢の文を入れてください");
      goals.setDream(playerId, t);
      return onClose();
    }
    // 段の名前は、目標の保存が通るときだけ一緒に保存する（文が空で止まったときに名前だけ変わらないように）
    const saveLabel = () => {
      if (level === "long" && label.trim() !== longLabelOf(pg, stage)) goals.setLongLabel(playerId, label);
    };
    if (!goal) {
      if (!t) return warn("目標の文を入れてください");
      if (level === "year" && yearGoals(pg).length >= MAX_YEAR) return warn("今年の目標は 3 つまでです");
      if (level === "mid" && midGoals(pg).length >= MAX_MID) return warn("段は 3 つまで足せます");
      saveLabel();
      goals.setGoal(playerId, build(t));
      return onClose();
    }
    if (mode === "done") {
      const n = nextText.trim();
      saveLabel();
      goals.completeGoal(playerId, goal.id, n ? build(n, undefined, true) : undefined);
      return onClose();
    }
    if (!t) return warn("目標の文を入れてください");
    saveLabel();
    if (mode === "change") goals.changeGoal(playerId, goal.id, build(t));
    else goals.setGoal(playerId, { ...goal, ...build(t, goal.id) });
    onClose();
  };

  const canDelete =
    !!goal && (level === "mid" || (level === "year" && yearGoals(pg).findIndex((g) => g.id === goal.id) > 0));
  const del = () => {
    if (goal && window.confirm("この目標を消しますか？（元に戻せません）")) {
      goals.removeGoal(playerId, goal.id);
      onClose();
    }
  };

  const showSeg = existing && !isDream && goal!.status === "active";
  const doneMode = showSeg && mode === "done";
  const bad = periodic && BAD_END.test(text);

  return (
    <HubSheet title={title} onClose={onClose}>
      {level === "long" && !isDream && (
        <Field label="段の名前">
          <input aria-label="段の名前" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="高校" />
        </Field>
      )}
      {isDream ? (
        <Field label="夢" hint="進路の『将来の目標』と同じものです">
          <textarea aria-label="夢" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      ) : doneMode ? (
        <Field label="次の目標（任意）">
          <input aria-label="次の目標" value={nextText} onChange={(e) => setNextText(e.target.value)} />
        </Field>
      ) : (
        <Field label="目標" hint={bad ? "そのために今週やることは？" : undefined}>
          <input
            aria-label="目標"
            value={text}
            placeholder={periodic ? "例）受ける前に首を振る" : undefined}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      )}
      {!isDream &&
        (periodic ? (
          <Field label="期限">
            <input
              aria-label="期限"
              readOnly
              value={level === "week" ? fmtWeekRange(period!) : fmtMonthOnly(period!)}
            />
          </Field>
        ) : (
          <div className="formrow">
            <Field label="期限（年）">
              <select aria-label="期限の年" value={dueY} onChange={(e) => setDueY(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y} 年
                  </option>
                ))}
              </select>
            </Field>
            <Field label="期限（月）">
              <select aria-label="期限の月" value={dueM} onChange={(e) => setDueM(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} 月
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ))}
      {!isDream && level === "week" && !doneMode && (
        <Field label="もし〜なら〜する（任意）">
          <input aria-label="もし〜なら〜する" value={ifThen} onChange={(e) => setIfThen(e.target.value)} />
        </Field>
      )}
      {showSeg && (
        <div className="formfield">
          <Seg<Mode>
            ariaLabel="この目標をどうするか"
            value={mode}
            onChange={(v) => v && setMode(v)}
            options={[
              { value: "keep", label: "続ける" },
              { value: "change", label: "変える" },
              { value: "done", label: "達成した" },
            ]}
          />
        </div>
      )}
      <SheetSave onClick={save} />
      {canDelete && <SheetDelete onClick={del} label="この目標を消す" />}
    </HubSheet>
  );
}
