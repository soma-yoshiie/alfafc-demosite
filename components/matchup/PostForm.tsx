"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SchoolStage } from "@/lib/types";
import type { MatchupPost, TimeBand } from "@/lib/matchup";
import { matchupAgeOptions } from "@/lib/matchup";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { Seg } from "../hub/common";
import { useMatchups } from "./MatchupProvider";

/**
 * 募集する（specs/matchup-demo.md §4-4）。PC は右の列、スマホは下からのシートの中身。
 * 必須は日にち 1 つ以上（今日以降）と年代。出すとトースト「募集を出しました」で自分の募集の一覧へ戻る。
 */

const TIME_BANDS: { value: TimeBand; label: string }[] = [
  { value: "am", label: "午前" },
  { value: "pm", label: "午後" },
  { value: "all", label: "終日" },
];
const VENUES: { value: MatchupPost["venue"]["kind"]; label: string }[] = [
  { value: "own", label: "自分の会場" },
  { value: "either", label: "会場は相談" },
  { value: "away", label: "相手の会場" },
];
const FEES: { value: MatchupPost["venue"]["fee"]; label: string }[] = [
  { value: "free", label: "無料" },
  { value: "split", label: "会場費を折半" },
  { value: "ask", label: "相談" },
];
const FORMATS: { value: 8 | 11; label: string }[] = [
  { value: 8, label: "8 人制" },
  { value: 11, label: "11 人制" },
];
const REFEREES: { value: MatchupPost["referee"]; label: string }[] = [
  { value: "mutual", label: "相互" },
  { value: "host", label: "主催が出す" },
  { value: "arrange", label: "相談" },
];
const LEVELS = ["同じくらい", "強め", "ゆるめ"].map((v) => ({ value: v, label: v }));
const VISIBILITIES: { value: MatchupPost["visibility"]; label: string }[] = [
  { value: "30", label: "30km 以内" },
  { value: "50", label: "50km 以内" },
  { value: "all", label: "制限なし" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATES = 3;

/** ラベル付きの欄。err があれば赤い枠とメッセージ（先頭の誤りへスクロールするので .err を付ける） */
function Field({
  label,
  htmlFor,
  err,
  children,
}: {
  label: string;
  htmlFor?: string;
  err?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-field${err ? " err" : ""}`}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <div className="mt-label">{label}</div>}
      {children}
      {err && (
        <p className="mt-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export function PostForm({
  stage,
  pc,
  onClose,
  onDone,
}: {
  stage: SchoolStage;
  pc: boolean;
  /** 閉じる（PC の「閉じる」） */
  onClose: () => void;
  /** 出し終えた（画面側で自分の募集の一覧に戻す） */
  onDone: () => void;
}) {
  const board = useBoard();
  const mt = useMatchups();
  const today = localDateStr();
  const ages = matchupAgeOptions(stage);
  const uid = useId();
  const formRef = useRef<HTMLDivElement>(null);

  const [dates, setDates] = useState<string[]>([""]);
  const [timeBand, setTimeBand] = useState<TimeBand>("am");
  const [venueKind, setVenueKind] = useState<MatchupPost["venue"]["kind"]>("own");
  const [venueName, setVenueName] = useState("");
  const [fee, setFee] = useState<MatchupPost["venue"]["fee"]>("free");
  const [ageGroup, setAgeGroup] = useState("");
  const [format, setFormat] = useState<8 | 11>(11);
  const [periods, setPeriods] = useState("3");
  const [minutes, setMinutes] = useState("20");
  const [referee, setReferee] = useState<MatchupPost["referee"]>("mutual");
  const [levelHint, setLevelHint] = useState("同じくらい");
  const [visibility, setVisibility] = useState<MatchupPost["visibility"]>("30");
  const [note, setNote] = useState("");
  const [errs, setErrs] = useState<{ date?: string; age?: string; count?: string }>({});
  const [tried, setTried] = useState(0);

  // 出せなかったとき、先頭の誤りの欄へ寄せる（長いシートで見落とさないように）
  useEffect(() => {
    if (tried === 0) return;
    formRef.current?.querySelector(".mt-field.err")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [tried]);

  const setDateAt = (i: number, v: string) => setDates((cur) => cur.map((d, j) => (j === i ? v : d)));

  const submit = () => {
    const picked = Array.from(new Set(dates.filter((d) => d !== ""))).sort();
    const e: typeof errs = {};
    if (picked.length === 0) e.date = "日にちを 1 つ以上入れてください";
    else if (picked.some((d) => !DATE_RE.test(d))) e.date = "日にちの形が正しくありません";
    else if (picked.some((d) => d < today)) e.date = "今日より前の日にちは選べません";
    if (!ageGroup) e.age = "年代を選んでください";
    const p = Number(periods);
    const m = Number(minutes);
    if (!(Number.isInteger(p) && p >= 1 && p <= 8 && Number.isInteger(m) && m >= 5 && m <= 60)) {
      e.count = "本数は 1〜8、1 本の分は 5〜60 で入れてください";
    }
    setErrs(e);
    if (Object.keys(e).length > 0) {
      setTried((n) => n + 1);
      return;
    }
    mt.addPost({
      dates: picked,
      timeBand,
      venue: { kind: venueKind, name: venueKind === "own" && venueName.trim() ? venueName.trim() : undefined, fee },
      ageGroup,
      format,
      periods: p,
      minutes: m,
      referee,
      levelHint,
      note: note.trim() || undefined,
      visibility,
    });
    board.toast("募集を出しました");
    onDone();
  };

  return (
    <div className="mt-form" ref={formRef}>
      <div className="mt-form-h">
        <div className="mt-form-title">募集する</div>
        {pc && (
          <button type="button" className="mt-form-x" onClick={onClose}>
            閉じる
          </button>
        )}
      </div>

      <Field label="日にち" err={errs.date}>
        {dates.map((d, i) => (
          <div key={i} className="mt-daterow">
            <input
              type="date"
              className="st-input"
              aria-label={`日にち ${i + 1}`}
              min={today}
              value={d}
              onChange={(e) => setDateAt(i, e.target.value)}
            />
            {dates.length > 1 && (
              <button type="button" className="mt-link danger" onClick={() => setDates((cur) => cur.filter((_, j) => j !== i))}>
                削除
              </button>
            )}
          </div>
        ))}
        {dates.length < MAX_DATES && (
          <button type="button" className="mt-link" onClick={() => setDates((cur) => [...cur, ""])}>
            ＋ 日にちを足す
          </button>
        )}
      </Field>

      <Field label="時間帯">
        <Seg options={TIME_BANDS} value={timeBand} onChange={(v) => v && setTimeBand(v)} ariaLabel="時間帯" />
      </Field>

      <Field label="会場">
        <Seg options={VENUES} value={venueKind} onChange={(v) => v && setVenueKind(v)} ariaLabel="会場" />
        {venueKind === "own" && (
          <input
            className="st-input"
            aria-label="会場名"
            maxLength={40}
            placeholder="例）アルファラス第1グラウンド"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
          />
        )}
      </Field>

      <Field label="費用">
        <Seg options={FEES} value={fee} onChange={(v) => v && setFee(v)} ariaLabel="費用" />
      </Field>

      <div className="mt-pair">
        <Field label="年代" htmlFor={`${uid}-age`} err={errs.age}>
          <select id={`${uid}-age`} className="st-input" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            <option value="">選んでください</option>
            {ages.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="人数制">
          <Seg options={FORMATS} value={format} onChange={(v) => v && setFormat(v)} ariaLabel="人数制" />
        </Field>
      </div>

      <Field label="本数と 1 本の時間" err={errs.count}>
        <div className="mt-pair">
          <label className="mt-unit">
            <input
              className="st-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={8}
              aria-label="本数"
              value={periods}
              onChange={(e) => setPeriods(e.target.value)}
            />
            <span>本</span>
          </label>
          <label className="mt-unit">
            <input
              className="st-input"
              type="number"
              inputMode="numeric"
              min={5}
              max={60}
              aria-label="1 本の分"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <span>分</span>
          </label>
        </div>
      </Field>

      <Field label="審判">
        <Seg options={REFEREES} value={referee} onChange={(v) => v && setReferee(v)} ariaLabel="審判" />
      </Field>

      <Field label="レベルの目安">
        <Seg options={LEVELS} value={levelHint} onChange={(v) => v && setLevelHint(v)} ariaLabel="レベルの目安" />
      </Field>

      <Field label="見せる相手">
        <Seg options={VISIBILITIES} value={visibility} onChange={(v) => v && setVisibility(v)} ariaLabel="見せる相手" />
      </Field>

      <Field label="相手に伝えること（任意）" htmlFor={`${uid}-note`}>
        <textarea
          id={`${uid}-note`}
          className="st-input mt-msg"
          rows={3}
          maxLength={200}
          placeholder="例）駐車場は 15 台まで。雨天は前日に連絡します"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <button type="button" className="st-btn mt-form-submit" onClick={submit}>
        募集を出す
      </button>
    </div>
  );
}
