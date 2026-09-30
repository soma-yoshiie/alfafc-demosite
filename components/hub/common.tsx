"use client";

import React, { useEffect, useState } from "react";
import type { Player, SchoolStage, TeamGroup } from "@/lib/types";
import { STAGE_GRADES, gradeLabel } from "@/lib/types";
import type { PlayerProfile, TermSystem } from "@/lib/profile";
import { TERM_OPTIONS, termLabel, updatedByLabel } from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { playerInGroup } from "@/lib/groups";

/**
 * 個人ページ（PlayerHub。player-hub §3）の共通部品。セクション（components/hub/*Section.tsx）と
 * PlayerHub 本体、フォームが共有する。第 3 段（テスト・成績表・進路）も同じ部品で書く：
 *   HubSheet（下からのシート／PC は中央のダイアログ）・SheetSave（末尾の保存ボタン）・Field／NumField／Seg／MultiSeg／
 *   GradeTermFields（入力。学年と学期の選択）・
 *   parseNum／sanitizeNum（数値入力）・fmtMD／fmtUpdated（日付の表示）・HubEmpty／HubAdd／HubRowBtn（空状態・追加・行末ボタン）・
 *   LastUpdated（セクション末尾の「最終更新」）・HubSectionProps（セクションが受け取る値）。
 */

/* ===================== PC 判定 ===================== */

const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TeamHub.tsx の usePc() と同じ手法） */
export function usePc(): boolean {
  const [pc, setPc] = useState<boolean>(() => typeof window !== "undefined" && window.matchMedia(PC_MQ).matches);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const onChange = () => setPc(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return pc;
}

/* ===================== セクションの定義 ===================== */

export type HubViewer = "staff" | "player";
export type HubSection =
  | "overview"
  | "growth"
  | "fitness"
  | "exams"
  | "grades"
  | "career"
  | "injuries"
  | "activity"
  | "report";

/** メニューの並び（PC の縦メニュー・スマホのチップ列・選手 PC のレールのサブナビで共通） */
export const HUB_SECTIONS: { key: HubSection; label: string }[] = [
  { key: "overview", label: "基本" },
  { key: "growth", label: "成長" },
  { key: "fitness", label: "体力" },
  { key: "exams", label: "テスト" },
  { key: "grades", label: "成績表" },
  { key: "career", label: "進路" },
  { key: "injuries", label: "怪我" },
  { key: "activity", label: "活動" },
  { key: "report", label: "レポート" },
];

/** 各セクションが受け取る値。PlayerHub が最新の Player・プロフィール・年齢などを計算して渡す */
export interface HubSectionProps {
  /** 最新の Player（board.state.players から） */
  p: Player;
  /** その選手のプロフィール（記録が無ければ空のプロフィール） */
  profile: PlayerProfile;
  viewer: HubViewer;
  /** 学校区分（学年ラベル・年齢の換算に使う） */
  stage: SchoolStage;
  /** 4 月 1 日時点の年齢（生年月日があればそれを優先、無ければ学年から。分からなければ null） */
  age: number | null;
  /** 別のセクションへ移る（KPI のマス・「シーズンレポートを見る ›」など） */
  go: (s: HubSection) => void;
  /** 「種目を管理 ›」（スタッフの名簿だけ。TeamHub の fitnessTests シートを開く。無ければリンクを出さない） */
  onManageFitnessTests?: () => void;
}

/* ===================== 日付・数値の整形 ===================== */

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → "M/D(曜)"（TeamHub の fmtDate と同じ形式） */
export function fmtMD(s: string | undefined | null): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return `${mo}/${d}(${WD[new Date(y, mo - 1, d).getDay()]})`;
}

/** "YYYY-MM-DD" → "YYYY/M/D"（年をまたぐ記録の一覧用） */
export function fmtYMD(s: string | undefined | null): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : s;
}

/** updatedAt（ms）→ "M/D(曜)"（ローカル日付。toISOString は使わない） */
export function fmtUpdated(at: number): string {
  return fmtMD(localDateStr(new Date(at)));
}

/** 数値入力の整形：数字と小数点 1 つだけ。小数は decimals 桁まで（0 なら整数のみ） */
export function sanitizeNum(v: string, decimals = 1): string {
  if (decimals <= 0) return v.replace(/[^0-9]/g, "");
  const cleaned = v.replace(/[^0-9.]/g, "");
  const i = cleaned.indexOf(".");
  if (i < 0) return cleaned;
  return cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, "").slice(0, decimals);
}

/** 入力文字列 → 数値。空欄・壊れた値は null */
export function parseNum(v: string): number | null {
  const t = v.trim();
  if (t === "" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 数値 → 入力欄の初期文字列（null は空） */
export function numStr(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

/** ▲/▼ つきの差（+0 は「±0」。小数の誤差を丸める） */
export function fmtDiff(d: number, digits = 1): string {
  const r = Math.round(d * 10 ** digits) / 10 ** digits;
  if (r === 0) return "±0";
  return `${r > 0 ? "▲" : "▼"}${Math.abs(r)}`;
}

/** 選手が所属するカスタムグループ（学年グループは grade から自動なので含めない） */
export function customGroupsOf(p: Player, groups: TeamGroup[]): TeamGroup[] {
  return groups.filter((g) => g.kind === "custom" && playerInGroup(p, g));
}

/* ===================== シート（§3-10） ===================== */

/**
 * 編集フォームのシート。スマホは下からのシート、PC は内容の上に重ねる中央のダイアログ（幅 560px）。
 * 見出し＋右上「キャンセル」。末尾に <SheetSave/>（.bigbtn「保存」。緑は主ボタンのここだけ）を置く。
 * 背景のタップ・Esc で閉じる。CSS は基底の .phubsheet*（.teamapp／.profapp のどちらの下でも効く）
 */
export function HubSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="phubsheetback" onClick={onClose}>
      <div className="phubsheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="phubsheet-h">
          <h2>{title}</h2>
          <button type="button" className="phubsheet-x" onClick={onClose}>
            キャンセル
          </button>
        </div>
        <div className="phubsheet-b">{children}</div>
      </div>
    </div>
  );
}

/** フォーム末尾の保存ボタン（.bigbtn。ラベルは「保存」固定） */
export function SheetSave({ onClick, label = "保存" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="bigbtn" onClick={onClick}>
      {label}
    </button>
  );
}

/* ===================== 入力部品 ===================== */

/** ラベル付きの入力欄の器（.formfield）。入力欄には aria-label も付ける（ラベルは見た目用） */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="formfield">
      <label>{label}</label>
      {children}
      {hint && <div className="fieldhint phubhint">{hint}</div>}
    </div>
  );
}

/** 数値の入力欄（text 入力＋inputMode＋正規表現。SheetManager の作法）。decimals=0 で整数 */
export function NumField({
  label,
  value,
  onChange,
  decimals = 1,
  unit,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimals?: number;
  unit?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={unit ? `${label}（${unit}）` : label} hint={hint}>
      <input
        aria-label={label}
        value={value}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        placeholder={placeholder ?? "未入力可"}
        onChange={(e) => onChange(sanitizeNum(e.target.value, decimals))}
      />
    </Field>
  );
}

/**
 * 選択肢のセグメント（評定 1〜5・性別・学期制・参加者など。スマホでも 44px）。
 * 選んだものをもう一度押すと解除（null）にできる（allowClear）
 */
export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  allowClear,
  className,
}: {
  options: { value: T; label: string }[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  ariaLabel: string;
  allowClear?: boolean;
  /** 見た目の追加（例: "compact"＝評定 1〜5 を 1 行に並べる） */
  className?: string;
}) {
  return (
    <div className={`phubseg${className ? ` ${className}` : ""}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? "on" : ""}
            onClick={() => onChange(on && allowClear ? null : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 複数選べるセグメント（面談の参加者など）。押すたびに入り切り。並びは options の順 */
export function MultiSeg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  ariaLabel: string;
}) {
  return (
    <div className="phubseg" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            className={on ? "on" : ""}
            onClick={() =>
              onChange(options.filter((x) => (x.value === o.value ? !on : value.includes(x.value))).map((x) => x.value))
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 学年と学期の選択（テスト・通知表・成績目標の期限で共通。player-hub §3-5〜3-6）。学年は学校区分に合わせ、
 * 学期は学期制（3 学期制＝1・2・3 学期／2 学期制＝前期・後期）に合わせる。記録に別の値があればその値も選択肢に残す。
 * optional＝「未設定」を選べる（目標の期限）。grade は "" で未設定
 */
export function GradeTermFields({
  stage,
  system,
  grade,
  term,
  onGrade,
  onTerm,
  optional,
  gradeText = "学年",
  termText = "学期",
}: {
  stage: SchoolStage;
  system: TermSystem;
  grade: string;
  term: string;
  onGrade: (g: string) => void;
  onTerm: (t: string) => void;
  optional?: boolean;
  gradeText?: string;
  termText?: string;
}) {
  const grades = STAGE_GRADES[stage];
  const gNum = grade === "" ? null : Number(grade);
  const gradeOpts = gNum != null && !grades.includes(gNum) ? [...grades, gNum].sort((a, b) => a - b) : grades;
  const base = TERM_OPTIONS[system];
  const termOpts = term && !base.includes(term) ? [...base, term] : base;
  return (
    <div className="formrow">
      <Field label={gradeText}>
        <select aria-label={gradeText} value={grade} onChange={(e) => onGrade(e.target.value)}>
          {optional && <option value="">未設定</option>}
          {gradeOpts.map((g) => (
            <option key={g} value={String(g)}>
              {gradeLabel(stage, g)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={termText}>
        <select aria-label={termText} value={term} onChange={(e) => onTerm(e.target.value)}>
          {optional && <option value="">未設定</option>}
          {termOpts.map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/* ===================== 表示部品 ===================== */

/** 空状態（「まだ記録がありません」＋次の一手。player-hub §7-13） */
export function HubEmpty({
  title = "まだ記録がありません",
  hint,
  action,
  compact,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  /** 1 つのセクションに空の枠が並ぶとき（進路）の小さめの余白 */
  compact?: boolean;
}) {
  return (
    <div className={`phubempty${compact ? " compact" : ""}`}>
      <b>{title}</b>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

/** 「＋ …を追加」ボタン（点線の白地。一覧の上に置く） */
export function HubAdd({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="phubadd" onClick={onClick}>
      ＋ {children}
    </button>
  );
}

/** 行末の小さな文字ボタン（「編集」「削除」。danger で削除の赤） */
export function HubRowBtn({
  children,
  onClick,
  danger,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** 読み上げ用（例: 「2026/9/3 の測定を削除」） */
  label?: string;
  /** 押せない（並べ替えの「上へ」が先頭のときなど） */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`phubrowbtn${danger ? " danger" : ""}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** セクション見出し（左に見出し、右に操作ボタン） */
export function HubHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="phubh">
      <div>
        <h3>{title}</h3>
        {sub && <span className="phubh-sub">{sub}</span>}
      </div>
      {action}
    </div>
  );
}

/** セクション末尾の「最終更新 M/D(曜) 監督」（updatedAt/updatedBy。編集権限を後で決める材料。§1-1） */
export function LastUpdated({ at, by }: { at?: number; by?: string }) {
  if (!at) return null;
  const who = updatedByLabel(by);
  return (
    <div className="phubupd">
      最終更新 {fmtUpdated(at)}
      {who ? ` ${who}` : ""}
    </div>
  );
}

/** 記録の一覧から最も新しい updatedAt と、その更新者 */
export function latestStamp(items: { updatedAt?: number; updatedBy?: string }[]): { at?: number; by?: string } {
  let best: { updatedAt?: number; updatedBy?: string } | null = null;
  for (const it of items) if (it.updatedAt && (!best || it.updatedAt > (best.updatedAt ?? 0))) best = it;
  return { at: best?.updatedAt, by: best?.updatedBy };
}
