"use client";

import React, { useEffect, useState } from "react";
import { useGoalData } from "./useGoalData";
import {
  MAX_MID,
  defaultLongDue,
  longGoal,
  longLabelOf,
  midGoals,
  monthEnd,
  monthGoalFor,
  monthOf,
  newGoalId,
  schoolYearEnd,
  weekGoalFor,
  yearGoals,
} from "@/lib/goals";
import { addDaysStr, weekStart } from "@/lib/dates";

/**
 * はじめての設定（specs/goals.md §3）。目標の画面の中の 4 歩の手順。1 と 4 は必須、2 と 3 は「飛ばす」で先へ進める。
 * どの歩にも「あとで書く」：そこまでを保存して閉じる（目標の画面に「続きを書く」が出る）。4 を終えたら setupDone を立てる。
 * 夢は進路の将来の目標（最初から入っていればそれが入る）。
 */

const DREAM_EX = ["プロサッカー選手になる", "日本代表でプレーする", "海外のクラブでプレーする"];
const LONG_EX = ["強い高校に合格する", "県トレセンに選ばれる", "J クラブのユースに入る"];

interface MidDraft {
  id?: string;
  text: string;
  y: number;
  m: number;
}

function ymOf(due: string | undefined, fy: number, fm: number): [number, number] {
  const m = /^(\d{4})-(\d{2})/.exec(due ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [fy, fm];
}

function DueSelect({ y, m, onChange }: { y: number; m: number; onChange: (y: number, m: number) => void }) {
  const ty = new Date().getFullYear();
  const years: number[] = [];
  for (let v = ty; v <= ty + 12; v++) years.push(v);
  if (!years.includes(y)) years.push(y);
  years.sort((a, b) => a - b);
  return (
    <div className="gsetup-due">
      <select className="st-input" aria-label="期限の年" value={y} onChange={(e) => onChange(Number(e.target.value), m)}>
        {years.map((v) => (
          <option key={v} value={v}>
            {v} 年
          </option>
        ))}
      </select>
      <select className="st-input" aria-label="期限の月" value={m} onChange={(e) => onChange(y, Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => (
          <option key={v} value={v}>
            {v} 月
          </option>
        ))}
      </select>
    </div>
  );
}

export default function GoalSetup({
  playerId,
  onExit,
  backRef,
}: {
  playerId: string;
  onExit: () => void;
  /** 上の帯の「戻る」の受け手（GoalBoard が呼ぶ）。1 つ前の歩へ戻れたら true、1 歩目なら false（＝画面を出る） */
  backRef?: React.MutableRefObject<(() => boolean) | null>;
}) {
  const { board, goals, profile, pg, stage, today, player } = useGoalData(playerId);
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const ym = monthOf(today);
  const mon = weekStart(today);

  const lg = longGoal(pg);
  const [dream, setDreamT] = useState((profile.career.futureGoal ?? "").trim());
  const [longText, setLongText] = useState(lg?.text ?? "");
  // 期限の既定：今の学校を卒業する年の 3 月（中2 の 11 月なら 2 年後の 3 月。図 gf1_break.png）
  const [dy, dm] = defaultLongDue(today, stage, player?.grade);
  const [ly0, lm0] = ymOf(lg?.due, dy, dm);
  const [ly, setLy] = useState(ly0);
  const [lm, setLm] = useState(lm0);
  const [mids, setMids] = useState<MidDraft[]>(() =>
    midGoals(pg).map((g) => {
      const [y, m] = ymOf(g.due, ty + 1, tm);
      return { id: g.id, text: g.text, y, m };
    })
  );
  const yg = yearGoals(pg)[0];
  const [yearText, setYearText] = useState(yg?.text ?? "");
  const mg = monthGoalFor(pg, ym);
  const [monthText, setMonthText] = useState(mg?.text ?? "");
  const wg = weekGoalFor(pg, today);
  const [weekText, setWeekText] = useState(wg?.text ?? "");
  const [ifThen, setIfThen] = useState(wg?.ifThen ?? "");

  // 途中から再開するときの歩：まだ書いていない最初の歩（飛ばした歩は、また聞く）
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    if (!(profile.career.futureGoal ?? "").trim()) return 1;
    if (!lg) return 2;
    if (!yg && !mg) return 3;
    return 4;
  });

  // 戻る：1 つ前の歩へ（書きかけの欄はそのまま残る。保存は「次へ」「あとで書く」のとき）
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (step <= 1) return false;
      setStep((step - 1) as 1 | 2 | 3);
      return true;
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, step]);

  const dueOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  /** その歩の入力を保存する（空の欄は保存しない） */
  const save = (s: number, finish = false) => {
    if (s === 1) {
      if (dream.trim()) goals.setDream(playerId, dream.trim());
    } else if (s === 2) {
      if (longText.trim())
        goals.setGoal(playerId, { id: lg?.id, level: "long", order: 0, text: longText.trim(), due: dueOf(ly, lm), status: "active" });
      mids.forEach((d, i) => {
        if (d.text.trim())
          goals.setGoal(playerId, { id: d.id, level: "mid", order: i, text: d.text.trim(), due: dueOf(d.y, d.m), status: "active" });
      });
    } else if (s === 3) {
      if (yearText.trim())
        goals.setGoal(playerId, { id: yg?.id, level: "year", order: 0, text: yearText.trim(), due: schoolYearEnd(today), status: "active" });
      if (monthText.trim())
        goals.setGoal(playerId, { id: mg?.id, level: "month", order: 0, text: monthText.trim(), period: ym, due: monthEnd(ym), status: "active" });
    } else if (s === 4) {
      if (weekText.trim()) {
        goals.setGoal(playerId, {
          id: wg?.id,
          level: "week",
          order: 0,
          text: weekText.trim(),
          period: mon,
          due: addDaysStr(mon, 6),
          ifThen: ifThen.trim() || undefined,
          status: "active",
        });
        if (finish) goals.setSetupDone(playerId, true);
      }
    }
  };

  const later = () => {
    save(step);
    // 途中にした印（目標の画面の入口が「続きを書く」になる。夢だけ書いて止めたときも）
    goals.update(playerId, (cur) => (cur.setupDone ? cur : { ...cur, setupStarted: true }));
    onExit();
  };
  const next = () => {
    if (step === 1 && !dream.trim()) return board.toast("夢の文を入れてください");
    if (step === 4) {
      if (!weekText.trim()) return board.toast("今週の目標の文を入れてください");
      save(4, true);
      return onExit();
    }
    save(step);
    setStep((step + 1) as 2 | 3 | 4);
  };
  const skip = () => setStep((step + 1) as 3 | 4);

  const label = longLabelOf(pg, stage);
  const sofar: { label: string; text: string }[] = [];
  if (step >= 2 && dream.trim()) sofar.push({ label: "夢", text: dream.trim() });
  if (step >= 3) {
    if (longText.trim()) sofar.push({ label, text: longText.trim() });
    mids.filter((d) => d.text.trim()).forEach((d) => sofar.push({ label: "そのために", text: d.text.trim() }));
  }
  if (step >= 4) {
    if (yearText.trim()) sofar.push({ label: "今年", text: yearText.trim() });
    if (monthText.trim()) sofar.push({ label: "今月", text: monthText.trim() });
  }

  const examples = (items: string[], onPick: (t: string) => void) => (
    <>
      <div className="gsetup-exh">例（押すと入ります）</div>
      {items.map((t) => (
        <button key={t} type="button" className="gsetup-ex" onClick={() => onPick(t)}>
          {t}
        </button>
      ))}
    </>
  );

  const setMid = (i: number, patch: Partial<MidDraft>) => setMids(mids.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <div className="gsetup">
      <div className="gsetup-prog" aria-label={`${step} / 4`}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`gsetup-dot${n < step ? " done" : n === step ? " now" : ""}`} />
        ))}
        <span className="gsetup-n">{step} / 4</span>
      </div>

      {sofar.length > 0 && (
        <>
          <div className={`gsetup-sofar${sofar.length === 1 ? " one" : ""}`}>
            {sofar.map((r, i) => (
              <div key={i} className="gsetup-srow">
                <span className="gsetup-slab">{r.label}</span>
                <span className="gsetup-stx">{r.text}</span>
              </div>
            ))}
          </div>
          <div className="gsetup-link" aria-hidden="true" />
        </>
      )}

      {step === 1 && (
        <>
          <h3 className="gsetup-q">いちばん大きな夢は？</h3>
          <p className="gsetup-sub">期限は要りません。大きく書いてください</p>
          <textarea
            className="st-input gsetup-area"
            aria-label="夢"
            rows={3}
            value={dream}
            onChange={(e) => setDreamT(e.target.value)}
          />
          {examples(DREAM_EX, setDreamT)}
        </>
      )}

      {step === 2 && (
        <>
          <h3 className="gsetup-q">そのために、いつまでに何を？</h3>
          <textarea
            className="st-input gsetup-area"
            aria-label={`${label}の目標`}
            rows={2}
            value={longText}
            onChange={(e) => setLongText(e.target.value)}
          />
          <div className="gsetup-lab">期限</div>
          <DueSelect y={ly} m={lm} onChange={(y, m) => (setLy(y), setLm(m))} />
          {examples(LONG_EX, setLongText)}
          {mids.map((d, i) => (
            <div key={i} className="gsetup-mid">
              <div className="gsetup-lab">そのために</div>
              <textarea
                className="st-input gsetup-area"
                aria-label={`そのために ${i + 1}`}
                rows={2}
                value={d.text}
                onChange={(e) => setMid(i, { text: e.target.value })}
              />
              <div className="gsetup-lab">期限</div>
              <DueSelect y={d.y} m={d.m} onChange={(y, m) => setMid(i, { y, m })} />
            </div>
          ))}
          {mids.length < MAX_MID && (
            <button
              type="button"
              className="gsetup-addstep"
              // id は足した時点で決める（同じ歩を 2 回保存しても、同じ段が 2 つできないように）
              onClick={() => setMids([...mids, { id: newGoalId(), text: "", y: ty + 1, m: tm }])}
            >
              ＋ さらにそのために（段を足す）
            </button>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <h3 className="gsetup-q">今年と今月にやることは？</h3>
          <div className="gsetup-lab">今年のうちに（任意）</div>
          <input
            className="st-input"
            aria-label="今年のうちに"
            value={yearText}
            onChange={(e) => setYearText(e.target.value)}
          />
          <div className="gsetup-lab">今月やること</div>
          <p className="gsetup-sub tight">〜する、の形で書く</p>
          <textarea
            className="st-input gsetup-area"
            aria-label="今月やること"
            rows={2}
            value={monthText}
            placeholder="例）受ける前に首を振る"
            onChange={(e) => setMonthText(e.target.value)}
          />
        </>
      )}

      {step === 4 && (
        <>
          <h3 className="gsetup-q">今週やることは？</h3>
          <p className="gsetup-sub">〜する、の形で書く</p>
          <textarea
            className="st-input gsetup-area"
            aria-label="今週やること"
            rows={2}
            value={weekText}
            placeholder="例）受ける前に首を振る"
            onChange={(e) => setWeekText(e.target.value)}
          />
          <div className="gsetup-lab">もし〜なら〜する（任意）</div>
          <input
            className="st-input"
            aria-label="もし〜なら〜する"
            value={ifThen}
            onChange={(e) => setIfThen(e.target.value)}
          />
        </>
      )}

      <div className="gsetup-btns">
        <button type="button" className="st-btn" onClick={next}>
          {step === 4 ? "決める" : "次へ"}
        </button>
        {(step === 2 || step === 3) && (
          <button type="button" className="st-btn ghost" onClick={skip}>
            飛ばす
          </button>
        )}
        <button type="button" className="greview-later" onClick={later}>
          あとで書く
        </button>
      </div>
    </div>
  );
}
