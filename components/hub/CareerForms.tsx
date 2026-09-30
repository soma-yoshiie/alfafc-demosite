"use client";

import React, { useState } from "react";
import type {
  ActionItem,
  ActivityKind,
  AdmissionMethod,
  CareerActivity,
  CareerDirection,
  ChoiceStatus,
  Dorm,
  Interview,
  Participant,
  SchoolChoice,
  SchoolType,
  Scholarship,
} from "@/lib/profile";
import {
  ACTIVITY_KIND_LABEL,
  ADMISSION_METHOD_LABEL,
  CAREER_DIRECTION_LABEL,
  CHOICE_STATUS_LABEL,
  DORM_LABEL,
  PARTICIPANT_LABEL,
  SCHOOL_TYPE_LABEL,
  SCHOLARSHIP_LABEL,
} from "@/lib/profile";
import type { Career } from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { Field, HubSheet, MultiSeg, NumField, Seg, SheetSave, numStr, parseNum } from "./common";
import type { HubViewer } from "./common";

/**
 * 進路（player-hub §3-7）の編集フォーム。セクション本体は CareerSection.tsx。
 * 1 つの志望校・活動・面談・アクションごとに HubSheet で開き、末尾の「保存」（SheetSave）で確定する。
 * 選手・スタッフのどちらも編集できる（viewer は面談の担当・参加者の既定にだけ使う）。
 */

/** 選択肢の一覧をオブジェクトのラベル表から作る */
function optionsOf<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k] }));
}

/** 進路の要約カードの編集（方向・エリア・通学時間・寮・本人の希望・保護者の意向・将来の目標を 1 つのフォームで） */
export function CareerBasicForm({
  career,
  onSave,
  onClose,
}: {
  career: Career;
  onSave: (patch: Pick<Career, "direction" | "area" | "commuteMaxMin" | "dorm" | "wish" | "parentWish" | "futureGoal">) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [direction, setDirection] = useState<Exclude<CareerDirection, ""> | null>(career.direction || null);
  const [area, setArea] = useState(career.area ?? "");
  const [commute, setCommute] = useState(numStr(career.commuteMaxMin));
  const [dorm, setDorm] = useState<Exclude<Dorm, ""> | null>(career.dorm || null);
  const [wish, setWish] = useState(career.wish ?? "");
  const [parentWish, setParentWish] = useState(career.parentWish ?? "");
  const [futureGoal, setFutureGoal] = useState(career.futureGoal ?? "");

  const save = () => {
    const cm = parseNum(commute);
    if (cm != null && (cm < 1 || cm > 300)) return board.toast("通学時間は 1〜300 分で入力してください");
    onSave({
      direction: direction ?? "",
      area: area.trim() || undefined,
      commuteMaxMin: cm,
      dorm: dorm ?? "",
      wish: wish.trim() || undefined,
      parentWish: parentWish.trim() || undefined,
      futureGoal: futureGoal.trim() || undefined,
    });
  };

  return (
    <HubSheet title="進路の希望を編集" onClose={onClose}>
      <Field label="進路の方向">
        <Seg<Exclude<CareerDirection, "">>
          ariaLabel="進路の方向"
          allowClear
          value={direction}
          onChange={setDirection}
          options={optionsOf(CAREER_DIRECTION_LABEL)}
        />
      </Field>
      <Field label="希望エリア">
        <input aria-label="希望エリア" value={area} onChange={(e) => setArea(e.target.value)} placeholder="例）市内と、隣の市まで" />
      </Field>
      <NumField label="通学時間の上限" unit="分" decimals={0} value={commute} onChange={setCommute} />
      <Field label="寮">
        <Seg<Exclude<Dorm, "">>
          ariaLabel="寮の可否"
          allowClear
          value={dorm}
          onChange={setDorm}
          options={optionsOf(DORM_LABEL)}
        />
      </Field>
      <Field label="本人の希望">
        <textarea
          aria-label="本人の希望"
          rows={3}
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="例）高校でもサッカーを続けたい。"
        />
      </Field>
      <Field label="保護者の意向">
        <textarea
          aria-label="保護者の意向"
          rows={3}
          value={parentWish}
          onChange={(e) => setParentWish(e.target.value)}
          placeholder="例）費用の面で公立を第一に考えている。"
        />
      </Field>
      <Field label="将来の目標">
        <textarea
          aria-label="将来の目標"
          rows={2}
          value={futureGoal}
          onChange={(e) => setFutureGoal(e.target.value)}
          placeholder="例）プロを目指しつつ、大学でも続けられる学力をつける。"
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}

export type ChoiceInput = Omit<SchoolChoice, "id" | "rank" | "updatedAt" | "updatedBy">;

/** 志望校の追加・編集（学校名・公立/私立/国立・学科コース・受験方法・特待・ステータス・サッカー部情報・基準の目安・志望理由） */
export function ChoiceForm({
  edit,
  onSave,
  onClose,
}: {
  edit?: SchoolChoice;
  onSave: (rec: ChoiceInput) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [school, setSchool] = useState(edit?.school ?? "");
  const [type, setType] = useState<Exclude<SchoolType, ""> | null>(edit?.type || null);
  const [course, setCourse] = useState(edit?.course ?? "");
  const [method, setMethod] = useState<AdmissionMethod>(edit?.method ?? "undecided");
  const [scholarship, setScholarship] = useState<Scholarship | "">(edit?.scholarship ?? "");
  const [status, setStatus] = useState<ChoiceStatus>(edit?.status ?? "research");
  const [soccerInfo, setSoccerInfo] = useState(edit?.soccerInfo ?? "");
  const [criteria, setCriteria] = useState(edit?.criteria ?? "");
  const [reason, setReason] = useState(edit?.reason ?? "");

  const save = () => {
    if (!school.trim()) return board.toast("学校名を入力してください");
    onSave({
      school: school.trim(),
      type: type ?? "",
      course: course.trim() || undefined,
      method,
      scholarship: scholarship || undefined,
      status,
      soccerInfo: soccerInfo.trim() || undefined,
      criteria: criteria.trim() || undefined,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <HubSheet title={edit ? "志望校を編集" : "志望校を追加"} onClose={onClose}>
      <Field label="学校名">
        <input aria-label="学校名" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="例）県立 青葉ヶ丘高校" />
      </Field>
      <Field label="公立・私立・国立">
        <Seg<Exclude<SchoolType, "">>
          ariaLabel="公立・私立・国立"
          allowClear
          value={type}
          onChange={setType}
          options={optionsOf(SCHOOL_TYPE_LABEL)}
        />
      </Field>
      <Field label="学科・コース">
        <input aria-label="学科・コース" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="例）普通科" />
      </Field>
      <div className="formrow">
        <Field label="受験方法">
          <select aria-label="受験方法" value={method} onChange={(e) => setMethod(e.target.value as AdmissionMethod)}>
            {optionsOf(ADMISSION_METHOD_LABEL).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="特待">
          <select aria-label="特待" value={scholarship} onChange={(e) => setScholarship(e.target.value as Scholarship | "")}>
            <option value="">未選択</option>
            {optionsOf(SCHOLARSHIP_LABEL).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="ステータス">
        <select aria-label="ステータス" value={status} onChange={(e) => setStatus(e.target.value as ChoiceStatus)}>
          {optionsOf(CHOICE_STATUS_LABEL).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="サッカー部の情報">
        <textarea
          aria-label="サッカー部の情報"
          rows={2}
          value={soccerInfo}
          onChange={(e) => setSoccerInfo(e.target.value)}
          placeholder="例）県リーグ1部。平日4日練習。寮あり。"
        />
      </Field>
      <Field label="基準の目安">
        <input
          aria-label="基準の目安"
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="例）内申 32/45 前後・評定に1がないこと"
        />
      </Field>
      <Field label="志望理由">
        <textarea
          aria-label="志望理由"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例）家から近く、練習見学で部の雰囲気がよかった。"
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}

export type ActivityInput = Omit<CareerActivity, "id" | "updatedAt" | "updatedBy">;

/** 進路活動の追加・編集（日付・種別・学校・メモ） */
export function ActivityForm({
  edit,
  onSave,
  onClose,
}: {
  edit?: CareerActivity;
  onSave: (rec: ActivityInput) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? localDateStr());
  const [kind, setKind] = useState<ActivityKind>(edit?.kind ?? "practice");
  const [school, setSchool] = useState(edit?.school ?? "");
  const [note, setNote] = useState(edit?.note ?? "");

  const save = () => {
    if (!date) return board.toast("日付を入力してください");
    onSave({ date, kind, school: school.trim() || undefined, note: note.trim() || undefined });
  };

  return (
    <HubSheet title={edit ? "活動を編集" : "活動を追加"} onClose={onClose}>
      <div className="formrow">
        <Field label="日付">
          <input aria-label="日付" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="種別">
          <select aria-label="種別" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {optionsOf(ACTIVITY_KIND_LABEL).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="学校">
        <input aria-label="学校" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="例）県立 青葉ヶ丘高校" />
      </Field>
      <Field label="メモ">
        <textarea
          aria-label="メモ"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例）夏の練習会に参加。守備の切り替えを褒められた。"
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}

export type InterviewInput = Omit<Interview, "id" | "updatedAt" | "updatedBy">;

/** 面談記録の追加・編集（面談日・参加者・担当・内容）。スタッフが開くと担当の既定はログイン中の名前 */
export function InterviewForm({
  edit,
  viewer,
  onSave,
  onClose,
}: {
  edit?: Interview;
  viewer: HubViewer;
  onSave: (rec: InterviewInput) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? localDateStr());
  const [participants, setParticipants] = useState<Participant[]>(
    edit?.participants ?? (viewer === "staff" ? ["player", "staff"] : ["player"])
  );
  const [staff, setStaff] = useState(edit?.staff ?? (viewer === "staff" ? board.auth.name ?? "" : ""));
  const [note, setNote] = useState(edit?.note ?? "");

  const save = () => {
    if (!date) return board.toast("面談日を入力してください");
    if (!note.trim()) return board.toast("面談の内容を入力してください");
    onSave({ date, participants, staff: staff.trim() || undefined, note: note.trim() });
  };

  return (
    <HubSheet title={edit ? "面談を編集" : "面談を追加"} onClose={onClose}>
      <Field label="面談日">
        <input aria-label="面談日" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="参加者">
        <MultiSeg<Participant>
          ariaLabel="参加者"
          value={participants}
          onChange={setParticipants}
          options={optionsOf(PARTICIPANT_LABEL)}
        />
      </Field>
      <Field label="担当">
        <input aria-label="担当" value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="例）岡本" />
      </Field>
      <Field label="内容">
        <textarea
          aria-label="内容"
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="話したこと・決まったこと・次までの宿題など"
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}

export type ActionInput = Omit<ActionItem, "id" | "done" | "updatedAt" | "updatedBy">;

/** 次のアクションの追加・編集（内容・期限・担当）。「済み」は一覧のチェックで切り替える */
export function ActionForm({
  edit,
  onSave,
  onClose,
}: {
  edit?: ActionItem;
  onSave: (rec: ActionInput) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [text, setText] = useState(edit?.text ?? "");
  const [due, setDue] = useState(edit?.due ?? "");
  const [owner, setOwner] = useState<Participant | null>(edit?.owner ?? null);

  const save = () => {
    if (!text.trim()) return board.toast("内容を入力してください");
    onSave({ text: text.trim(), due: due || undefined, owner: owner ?? undefined });
  };

  return (
    <HubSheet title={edit ? "アクションを編集" : "アクションを追加"} onClose={onClose}>
      <Field label="内容">
        <input aria-label="内容" value={text} onChange={(e) => setText(e.target.value)} placeholder="例）英検の申込み（準2級）" />
      </Field>
      <Field label="期限" hint="入れると、過ぎても済んでいないときに赤で知らせます。">
        <input aria-label="期限" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field label="担当">
        <Seg<Participant>
          ariaLabel="担当"
          allowClear
          value={owner}
          onChange={setOwner}
          options={optionsOf(PARTICIPANT_LABEL)}
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}
