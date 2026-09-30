"use client";

import React, { useState } from "react";
import type {
  ActionItem,
  CareerActivity,
  ChoiceStatus,
  Interview,
  SchoolChoice,
} from "@/lib/profile";
import {
  ACTIVITY_KIND_LABEL,
  ACTION_OWNER_LABEL,
  ADMISSION_METHOD_LABEL,
  CAREER_DIRECTION_LABEL,
  CHOICE_STATUS_LABEL,
  DORM_LABEL,
  PARTICIPANT_LABEL,
  SCHOOL_TYPE_LABEL,
  SCHOLARSHIP_LABEL,
  newRecordId,
} from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { useProfiles } from "../ProfileProvider";
import {
  HubAdd,
  HubEmpty,
  HubHead,
  HubRowBtn,
  LastUpdated,
  fmtMD,
  fmtYMD,
} from "./common";
import type { HubSectionProps } from "./common";
import { ActionForm, ActivityForm, CareerBasicForm, ChoiceForm, InterviewForm } from "./CareerForms";

/**
 * セクション「進路」（player-hub §3-7）：要約カード（進路の方向・希望エリア・通学時間の上限・寮の可否・本人の希望・
 * 保護者の意向・将来の目標）、志望校（第 1〜第 5 希望。並べ替え・ステータスのタグ・各項目）、活動記録、面談記録、
 * 次のアクション（期限切れは赤の文字＋「期限切れ」のタグ）、中3 の年間の節目の注記。
 * 保存は ProfileProvider の updateCareer／setCareerItem／removeCareerItem（更新者・更新日時は自動）。
 * 選手・スタッフのどちらも編集できる。
 */

/** 志望校の上限（第 5 希望まで） */
const MAX_CHOICES = 5;

/** ステータスのタグの色（合格＝緑の文字、不合格＝赤、進行中＝青、情報収集・辞退＝灰） */
const STATUS_TAG: Record<ChoiceStatus, string> = {
  research: "",
  planned: "st-acc",
  visited: "st-acc",
  contacted: "st-acc",
  criteria: "st-acc",
  applied: "st-acc",
  passed: "st-ok",
  failed: "st-out",
  declined: "",
};

/** 中3 の年間の節目（調査報告 §4。4・6・9・12 月＝進路希望調査、7〜8 月＝練習会、9〜10 月＝推薦連絡、11〜1 月＝出願） */
const MILESTONES: { text: string; label: string; months: number[] }[] = [
  { text: "4・6・9・12月", label: "進路希望調査", months: [4, 6, 9, 12] },
  { text: "7〜8月", label: "練習会", months: [7, 8] },
  { text: "9〜10月", label: "推薦の連絡", months: [9, 10] },
  { text: "11〜1月", label: "出願", months: [11, 12, 1] },
];

type FormState =
  | { k: "basic" }
  | { k: "choice"; edit?: SchoolChoice }
  | { k: "activity"; edit?: CareerActivity }
  | { k: "interview"; edit?: Interview }
  | { k: "action"; edit?: ActionItem };

const byDateDesc = (a: { date: string; updatedAt: number }, b: { date: string; updatedAt: number }) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt;

export default function CareerSection({ p, profile, viewer, stage }: HubSectionProps) {
  const profiles = useProfiles();
  const career = profile.career;
  const today = localDateStr();
  const month = Number(today.slice(5, 7));
  const [form, setForm] = useState<FormState | null>(null);

  const choices = [...career.choices].sort((a, b) => a.rank - b.rank);
  const activities = [...career.activities].sort(byDateDesc);
  const interviews = [...career.interviews].sort(byDateDesc);
  // アクション：未完了を先に、期限の近い順（期限なしは末尾）。済みは下
  const actions = [...career.actions].sort(
    (a, b) => Number(!!a.done) - Number(!!b.done) || (a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99")
  );
  const overdue = (a: ActionItem) => !a.done && !!a.due && a.due < today;
  const openCount = career.actions.filter((a) => !a.done).length;
  const overdueCount = career.actions.filter(overdue).length;

  const hasBasics = !!(
    career.direction ||
    career.area ||
    career.commuteMaxMin != null ||
    career.dorm ||
    career.wish ||
    career.parentWish ||
    career.futureGoal
  );
  const isThirdYear = stage === "junior" && p.grade === 3;

  /** 志望校の並びを保存する（第 1〜n 希望を並び順で振り直す） */
  const saveOrder = (list: SchoolChoice[]) =>
    profiles.updateCareer(p.id, { choices: list.map((c, i) => ({ ...c, rank: i + 1 })) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= choices.length) return;
    const next = [...choices];
    [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };
  const removeChoice = (c: SchoolChoice) => {
    if (!window.confirm(`志望校「${c.school}」を削除しますか？`)) return;
    saveOrder(choices.filter((x) => x.id !== c.id));
  };
  const removeActivity = (a: CareerActivity) => {
    if (!window.confirm(`${fmtYMD(a.date)} の活動（${ACTIVITY_KIND_LABEL[a.kind]}）を削除しますか？`)) return;
    profiles.removeCareerItem(p.id, "activities", a.id);
  };
  const removeInterview = (iv: Interview) => {
    if (!window.confirm(`${fmtYMD(iv.date)} の面談の記録を削除しますか？`)) return;
    profiles.removeCareerItem(p.id, "interviews", iv.id);
  };
  const removeAction = (a: ActionItem) => {
    if (!window.confirm(`アクション「${a.text}」を削除しますか？`)) return;
    profiles.removeCareerItem(p.id, "actions", a.id);
  };

  const kvRows: { k: string; v: React.ReactNode }[] = [
    { k: "進路の方向", v: career.direction ? CAREER_DIRECTION_LABEL[career.direction] : "" },
    { k: "希望エリア", v: career.area ?? "" },
    { k: "通学時間の上限", v: career.commuteMaxMin != null ? `${career.commuteMaxMin} 分` : "" },
    { k: "寮", v: career.dorm ? DORM_LABEL[career.dorm] : "" },
    { k: "本人の希望", v: career.wish ? <span className="phubmemo">{career.wish}</span> : "" },
    { k: "保護者の意向", v: career.parentWish ? <span className="phubmemo">{career.parentWish}</span> : "" },
    { k: "将来の目標", v: career.futureGoal ? <span className="phubmemo">{career.futureGoal}</span> : "" },
  ];

  return (
    <section className="phubsec" aria-label="進路">
      <HubHead
        title="進路の希望"
        action={
          <HubRowBtn label="進路の希望を編集" onClick={() => setForm({ k: "basic" })}>
            編集
          </HubRowBtn>
        }
      />
      {hasBasics ? (
        <dl className="phubkv">
          {kvRows.map((r) => (
            <div className="phubkv-row" key={r.k}>
              <dt>{r.k}</dt>
              <dd>{r.v === "" ? <span className="phubkv-empty">—</span> : r.v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <HubEmpty
          compact
          hint="進路の方向・希望エリア・通学時間・寮の可否と、本人の希望・保護者の意向を記録します。"
          action={<HubAdd onClick={() => setForm({ k: "basic" })}>進路の希望を入力</HubAdd>}
        />
      )}
      {isThirdYear && (
        <div className="phubnote phubmile">
          中3の主な節目：
          {MILESTONES.map((m, i) => (
            <React.Fragment key={m.label}>
              {i > 0 && " ／ "}
              <span className={m.months.includes(month) ? "now" : ""}>
                {m.text} {m.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* 志望校（第 1〜第 5 希望） */}
      <HubHead title="志望校" sub={`第${MAX_CHOICES}希望まで`} />
      {choices.length < MAX_CHOICES ? (
        <HubAdd onClick={() => setForm({ k: "choice" })}>志望校を追加</HubAdd>
      ) : (
        <div className="phubnote">志望校は第{MAX_CHOICES}希望まで登録できます。</div>
      )}
      {choices.length === 0 ? (
        <HubEmpty compact hint="気になる学校を、第1希望から順に登録します。受験方法・特待・ステータスも残せます。" />
      ) : (
        <div className="phubchoices">
          {choices.map((c, i) => {
            const details: { k: string; v?: string }[] = [
              { k: "学科・コース", v: c.course },
              { k: "サッカー部", v: c.soccerInfo },
              { k: "基準の目安", v: c.criteria },
              { k: "志望理由", v: c.reason },
            ];
            return (
              <article className="phubchoice" key={c.id} aria-label={`第${i + 1}希望 ${c.school}`}>
                <div className="phubchoice-h">
                  <span className="phubrank">第{i + 1}希望</span>
                  <b className="phubchoice-name">{c.school}</b>
                </div>
                <div className="phubchoice-tags">
                  {c.type && <span className="phubtag">{SCHOOL_TYPE_LABEL[c.type]}</span>}
                  <span className="phubtag">{ADMISSION_METHOD_LABEL[c.method]}</span>
                  {c.scholarship && c.scholarship !== "unknown" && c.scholarship !== "none" && (
                    <span className="phubtag">特待 {SCHOLARSHIP_LABEL[c.scholarship]}</span>
                  )}
                  <span className={`phubtag ${STATUS_TAG[c.status]}`}>{CHOICE_STATUS_LABEL[c.status]}</span>
                </div>
                {details.some((d) => d.v) && (
                  <dl className="phubchoice-dl">
                    {details
                      .filter((d) => d.v)
                      .map((d) => (
                        <div key={d.k}>
                          <dt>{d.k}</dt>
                          <dd>{d.v}</dd>
                        </div>
                      ))}
                  </dl>
                )}
                <div className="phubchoice-act">
                  <HubRowBtn disabled={i === 0} label={`${c.school} を上へ`} onClick={() => move(i, -1)}>
                    上へ
                  </HubRowBtn>
                  <HubRowBtn disabled={i === choices.length - 1} label={`${c.school} を下へ`} onClick={() => move(i, 1)}>
                    下へ
                  </HubRowBtn>
                  <HubRowBtn label={`${c.school} を編集`} onClick={() => setForm({ k: "choice", edit: c })}>
                    編集
                  </HubRowBtn>
                  <HubRowBtn danger label={`${c.school} を削除`} onClick={() => removeChoice(c)}>
                    削除
                  </HubRowBtn>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 活動記録 */}
      <HubHead title="活動記録" sub="練習会・説明会など" />
      <HubAdd onClick={() => setForm({ k: "activity" })}>活動を追加</HubAdd>
      {activities.length === 0 ? (
        <HubEmpty compact hint="練習会・セレクション・説明会などに参加したら記録します。" />
      ) : (
        <div className="phublist">
          {activities.map((a) => (
            <div className="phubrow stack" key={a.id}>
              <div className="phubrow-main">
                <b>
                  {fmtYMD(a.date)}
                  <span className="phubtag">{ACTIVITY_KIND_LABEL[a.kind]}</span>
                </b>
                {a.school && <span>{a.school}</span>}
                {a.note && <span className="phubpre phubsoft">{a.note}</span>}
              </div>
              <div className="phubrow-act">
                <HubRowBtn label={`${fmtYMD(a.date)} の活動を編集`} onClick={() => setForm({ k: "activity", edit: a })}>
                  編集
                </HubRowBtn>
                <HubRowBtn danger label={`${fmtYMD(a.date)} の活動を削除`} onClick={() => removeActivity(a)}>
                  削除
                </HubRowBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 面談記録 */}
      <HubHead title="面談記録" sub="新しい順" />
      <HubAdd onClick={() => setForm({ k: "interview" })}>面談を追加</HubAdd>
      {interviews.length === 0 ? (
        <HubEmpty compact hint="三者面談や個別の相談の内容を記録します。" />
      ) : (
        <div className="phublist">
          {interviews.map((iv) => (
            <div className="phubrow stack" key={iv.id}>
              <div className="phubrow-main">
                <b>
                  {fmtYMD(iv.date)}
                  {iv.participants.map((pt) => (
                    <span className="phubtag" key={pt}>
                      {PARTICIPANT_LABEL[pt]}
                    </span>
                  ))}
                </b>
                <span className="phubpre">{iv.note}</span>
                {iv.staff && <small>担当 {iv.staff}</small>}
              </div>
              <div className="phubrow-act">
                <HubRowBtn label={`${fmtYMD(iv.date)} の面談を編集`} onClick={() => setForm({ k: "interview", edit: iv })}>
                  編集
                </HubRowBtn>
                <HubRowBtn danger label={`${fmtYMD(iv.date)} の面談を削除`} onClick={() => removeInterview(iv)}>
                  削除
                </HubRowBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 次のアクション（期限切れは強調） */}
      <HubHead
        title="次のアクション"
        sub={career.actions.length > 0 ? `未完了 ${openCount} 件${overdueCount > 0 ? ` ・ 期限切れ ${overdueCount} 件` : ""}` : undefined}
      />
      <HubAdd onClick={() => setForm({ k: "action" })}>アクションを追加</HubAdd>
      {actions.length === 0 ? (
        <HubEmpty compact hint="次にやること（申込み・書類・確認など）を、期限と担当つきで記録します。" />
      ) : (
        <div className="phublist">
          {actions.map((a) => {
            const late = overdue(a);
            return (
              <div className={`phubrow phubaction${late ? " overdue" : ""}${a.done ? " done" : ""}`} key={a.id}>
                <button
                  type="button"
                  className="phubchk"
                  role="checkbox"
                  aria-checked={!!a.done}
                  aria-label={`${a.text}（${a.done ? "済み。押すと未完了に戻す" : "押すと済みにする"}）`}
                  onClick={() => profiles.setCareerItem(p.id, "actions", { ...a, done: !a.done })}
                >
                  <span className="box" aria-hidden="true">
                    {a.done ? "✓" : ""}
                  </span>
                </button>
                <div className="phubrow-main">
                  <span>{a.text}</span>
                  {(a.due || a.owner || late) && (
                    <small className="phubmeta">
                      {a.due && <span>期限 {fmtMD(a.due)}</span>}
                      {late && <span className="phubtag st-out">期限切れ</span>}
                      {a.owner && <span>担当 {ACTION_OWNER_LABEL[a.owner]}</span>}
                    </small>
                  )}
                </div>
                <div className="phubrow-act">
                  <HubRowBtn label={`${a.text} を編集`} onClick={() => setForm({ k: "action", edit: a })}>
                    編集
                  </HubRowBtn>
                  <HubRowBtn danger label={`${a.text} を削除`} onClick={() => removeAction(a)}>
                    削除
                  </HubRowBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <LastUpdated at={career.updatedAt} by={career.updatedBy} />

      {form?.k === "basic" && (
        <CareerBasicForm
          career={career}
          onClose={() => setForm(null)}
          onSave={(patch) => {
            profiles.updateCareer(p.id, patch);
            setForm(null);
          }}
        />
      )}
      {form?.k === "choice" && (
        <ChoiceForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            profiles.setCareerItem(p.id, "choices", {
              ...rec,
              id: form.edit?.id ?? newRecordId("ch"),
              rank: form.edit?.rank ?? choices.length + 1,
            });
            setForm(null);
          }}
        />
      )}
      {form?.k === "activity" && (
        <ActivityForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            profiles.setCareerItem(p.id, "activities", { ...rec, id: form.edit?.id ?? newRecordId("ca") });
            setForm(null);
          }}
        />
      )}
      {form?.k === "interview" && (
        <InterviewForm
          edit={form.edit}
          viewer={viewer}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            profiles.setCareerItem(p.id, "interviews", { ...rec, id: form.edit?.id ?? newRecordId("iv") });
            setForm(null);
          }}
        />
      )}
      {form?.k === "action" && (
        <ActionForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            profiles.setCareerItem(p.id, "actions", {
              ...rec,
              id: form.edit?.id ?? newRecordId("ac"),
              done: form.edit?.done ?? false,
            });
            setForm(null);
          }}
        />
      )}
    </section>
  );
}
