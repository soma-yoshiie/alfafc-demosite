"use client";

import React, { useMemo, useState } from "react";
import type { SchoolStage } from "@/lib/types";
import type { ExamKind, ExamRecord, Judgement, Subject, TermSystem } from "@/lib/profile";
import {
  EXAM_KIND_LABEL,
  JUDGEMENTS,
  MAIN5,
  SUBJECTS,
  SUBJECT_LABEL,
  compareExamsDesc,
  estimateTerm,
  examTotal,
  gradeTermLabel,
  newRecordId,
  termLabel,
} from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { useProfiles } from "../ProfileProvider";
import { SubjectBars, TrendChart } from "../ProfileCharts";
import {
  Field,
  GradeTermFields,
  HubAdd,
  HubEmpty,
  HubHead,
  HubRowBtn,
  HubSheet,
  LastUpdated,
  NumField,
  Seg,
  SheetSave,
  fmtDiff,
  fmtYMD,
  latestStamp,
  numStr,
  parseNum,
  sanitizeNum,
} from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「テスト」（player-hub §3-5）：5 教科合計の推移（TrendChart。点にテスト名、学年平均の合計、目標合計の水平線）、
 * テストごとのカード（新しい順。教科ごとの自分／学年平均の横棒 SubjectBars、5 教科合計と平均との差、9 教科合計、
 * 順位・人数、偏差値・判定（模試）、目標、振り返り）、追加・編集・削除のフォーム。
 * 点・満点（既定 100）・学年平均は教科ごとに持ち、合計は表示のたびに lib/profile.ts の examTotal で計算する（保存しない）。
 * 選手・スタッフのどちらも編集できる（viewer による差は無し。更新者は ProfileProvider が自動で付ける）。
 */

const KINDS = Object.keys(EXAM_KIND_LABEL) as ExamKind[];

/** 点を入れた教科か */
const entered = (e: Pick<ExamRecord, "scores">, k: Subject) => typeof e.scores[k]?.score === "number";

export default function ExamsSection({ p, profile, stage }: HubSectionProps) {
  const profiles = useProfiles();
  const [form, setForm] = useState<{ edit?: ExamRecord } | null>(null);
  const system: TermSystem = profile.termSystem ?? "3";

  const desc = useMemo(() => [...profile.exams].sort(compareExamsDesc), [profile.exams]);
  const asc = useMemo(() => [...desc].reverse(), [desc]);

  // 推移には 5 教科そろったテストだけを使う（そろっていない合計を並べると、下がったように見えてしまう）
  const full = asc.filter((e) => examTotal(e, MAIN5).complete);
  const excluded = asc.length - full.length;
  // 学年平均の合計は、5 教科すべてに平均があるテストだけ
  const avgFull = full.filter((e) => MAIN5.every((k) => typeof e.scores[k]?.avg === "number"));
  // 目標線は、目標を入れたいちばん新しいテストの値
  const targetExam = [...asc].reverse().find((e) => typeof e.targetTotal5 === "number" && e.targetTotal5 > 0);

  const remove = (e: ExamRecord) => {
    if (!window.confirm(`${e.name}（${fmtYMD(e.date)}）を削除しますか？`)) return;
    profiles.removeRecord(p.id, "exams", e.id);
  };

  return (
    <section className="phubsec" aria-label="テスト">
      <HubHead title="テスト" sub="定期テスト・模試" />

      {/* 上：5 教科合計の推移（点は 2 つ以上で描く。1 つなら下のカードだけ） */}
      {full.length >= 2 && (
        <div className="phubcard">
          <div className="phubcard-t">5 教科合計の推移</div>
          <TrendChart
            xKind="date"
            unit="点"
            ariaLabel="5 教科合計の推移"
            series={[
              {
                label: "5 教科合計",
                points: full.map((e) => ({ x: e.date, y: examTotal(e, MAIN5).total, title: e.name })),
              },
              ...(avgFull.length >= 2
                ? [
                    {
                      label: "学年平均",
                      color: "var(--mut)",
                      points: avgFull.map((e) => ({ x: e.date, y: examTotal(e, MAIN5).avgTotal ?? 0, title: e.name })),
                    },
                  ]
                : []),
            ]}
            target={targetExam ? { label: "目標合計", value: targetExam.targetTotal5! } : undefined}
          />
          {excluded > 0 && (
            <div className="phubnote">5 教科そろっていないテストは、推移のグラフには含めていません。</div>
          )}
        </div>
      )}
      {asc.length > 0 && full.length < 2 && (
        <div className="phubnote">5 教科そろったテストが 2 回分になると、合計の推移のグラフが出ます。</div>
      )}

      <HubHead title="テストの記録" sub="新しい順" />
      <HubAdd onClick={() => setForm({})}>テストを追加</HubAdd>
      {desc.length === 0 ? (
        <HubEmpty hint="定期テストや模試を受けたら「テストを追加」から記録します。教科ごとの点と学年平均、5 教科合計の推移が見られます。" />
      ) : (
        <div className="phubexams">
          {desc.map((e) => (
            <ExamCard
              key={e.id}
              e={e}
              stage={stage}
              onEdit={() => setForm({ edit: e })}
              onDelete={() => remove(e)}
            />
          ))}
        </div>
      )}
      <LastUpdated {...latestStamp(profile.exams)} />

      {form && (
        <ExamForm
          edit={form.edit}
          stage={stage}
          system={system}
          defaultGrade={p.grade ?? 1}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            profiles.setRecord(p.id, "exams", { ...rec, id: form.edit?.id ?? newRecordId("ex") });
            setForm(null);
          }}
        />
      )}
    </section>
  );
}

/* ===================== テストのカード ===================== */

function ExamCard({
  e,
  stage,
  onEdit,
  onDelete,
}: {
  e: ExamRecord;
  stage: SchoolStage;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t5 = examTotal(e, MAIN5);
  const t9 = examTotal(e, SUBJECTS);
  const hasMain = MAIN5.some((k) => entered(e, k));
  const hasPractical = SUBJECTS.some((k) => !MAIN5.includes(k) && entered(e, k));
  // 横棒の行：点を入れた教科（主要 5 教科は 1 つでも入れていれば、空いている教科も「—」で並べる）
  const rows = SUBJECTS.filter((k) => entered(e, k) || (hasMain && MAIN5.includes(k))).map((k) => {
    const s = e.scores[k];
    return {
      label: SUBJECT_LABEL[k],
      value: typeof s?.score === "number" ? s.score : null,
      max: typeof s?.max === "number" && s.max > 0 ? s.max : 100,
      avg: typeof s?.avg === "number" ? s.avg : null,
    };
  });
  const target = typeof e.targetTotal5 === "number" && e.targetTotal5 > 0 ? e.targetTotal5 : null;
  const meta = [fmtYMD(e.date), gradeTermLabel(stage, e.grade, e.term)].join(" ・ ");

  return (
    <article className="phubexam" aria-label={e.name}>
      <div className="phubexam-h">
        <div className="phubexam-title">
          <b>{e.name}</b>
          <span className="phubtag">{EXAM_KIND_LABEL[e.kind]}</span>
        </div>
        <div className="phubrow-act">
          <HubRowBtn label={`${e.name} を編集`} onClick={onEdit}>
            編集
          </HubRowBtn>
          <HubRowBtn danger label={`${e.name} を削除`} onClick={onDelete}>
            削除
          </HubRowBtn>
        </div>
      </div>
      <div className="phubexam-meta">{meta}</div>

      {rows.length > 0 ? <SubjectBars rows={rows} /> : <div className="phubnote">教科の点は未入力です。</div>}

      <div className="phubfacts">
        {t5.n > 0 && (
          <div className="phubfact">
            <div className="l">5 教科合計{!t5.complete && `（${t5.n} 教科）`}</div>
            <div className="v">
              {t5.total}
              <small>/ {t5.max} 点</small>
            </div>
            {t5.diff != null && (
              <div className={`d ${t5.diff > 0 ? "up" : t5.diff < 0 ? "down" : ""}`}>平均との差 {fmtDiff(t5.diff)}</div>
            )}
          </div>
        )}
        {hasPractical && t9.n > 0 && (
          <div className="phubfact">
            <div className="l">9 教科合計{!t9.complete && `（${t9.n} 教科）`}</div>
            <div className="v">
              {t9.total}
              <small>/ {t9.max} 点</small>
            </div>
            {t9.diff != null && (
              <div className={`d ${t9.diff > 0 ? "up" : t9.diff < 0 ? "down" : ""}`}>平均との差 {fmtDiff(t9.diff)}</div>
            )}
          </div>
        )}
        {e.rank != null && (
          <div className="phubfact">
            <div className="l">学年順位</div>
            <div className="v">
              {e.rank}
              <small>位{e.rankOf != null ? ` / ${e.rankOf} 人` : ""}</small>
            </div>
          </div>
        )}
        {(e.deviation != null || e.judgement) && (
          <div className="phubfact">
            <div className="l">偏差値・判定</div>
            <div className="v">
              {e.deviation != null ? e.deviation : "—"}
              {e.judgement && <small>判定 {e.judgement}</small>}
            </div>
          </div>
        )}
        {target != null && (
          <div className="phubfact">
            <div className="l">目標（5 教科合計）</div>
            <div className="v">
              {target}
              <small>点</small>
            </div>
            <div className="d">
              {t5.complete ? (t5.total >= target ? "達成" : `あと ${Math.round((target - t5.total) * 10) / 10} 点`) : "5 教科そろうと差が出ます"}
            </div>
          </div>
        )}
      </div>

      {e.note && (
        <div className="phubexam-note">
          <span>振り返り</span>
          <div className="phubmemo">{e.note}</div>
        </div>
      )}
    </article>
  );
}

/* ===================== フォーム ===================== */

interface ScoreInput {
  score: string;
  max: string;
  avg: string;
}

/** テストの追加・編集フォーム：名前、種別、実施日、学年・学期（既定＝選手の学年と、日付から推定した学期）、
 *  教科ごとに 点／満点（既定 100）／学年平均、順位・人数、偏差値・判定（模試だけ）、目標（5 教科合計）、振り返り */
function ExamForm({
  edit,
  stage,
  system,
  defaultGrade,
  onSave,
  onClose,
}: {
  edit?: ExamRecord;
  stage: SchoolStage;
  system: TermSystem;
  defaultGrade: number;
  onSave: (rec: Omit<ExamRecord, "id" | "updatedAt" | "updatedBy">) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [name, setName] = useState(edit?.name ?? "");
  const [kind, setKind] = useState<ExamKind>(edit?.kind ?? "mid");
  const [date, setDate] = useState(edit?.date ?? localDateStr());
  const [grade, setGrade] = useState(String(edit?.grade ?? defaultGrade));
  const [term, setTerm] = useState(edit?.term ?? estimateTerm(localDateStr(), system));
  // 学期を自分で選んだら、日付を変えても推定で上書きしない（編集のときは最初から触らない）
  const [termTouched, setTermTouched] = useState(!!edit);
  const [sc, setSc] = useState<Record<Subject, ScoreInput>>(() => {
    const init = {} as Record<Subject, ScoreInput>;
    SUBJECTS.forEach((k) => {
      const s = edit?.scores[k];
      init[k] = { score: numStr(s?.score), max: s ? numStr(s.max ?? 100) : "100", avg: numStr(s?.avg) };
    });
    return init;
  });
  const [rank, setRank] = useState(numStr(edit?.rank));
  const [rankOf, setRankOf] = useState(numStr(edit?.rankOf));
  const [dev, setDev] = useState(numStr(edit?.deviation));
  const [judge, setJudge] = useState<Judgement | null>(edit?.judgement ?? null);
  const [target, setTarget] = useState(numStr(edit?.targetTotal5));
  const [note, setNote] = useState(edit?.note ?? "");

  // 名前を空のまま保存したときの自動の名前（「2学期 中間テスト」など）
  const autoName = kind === "mock" ? "模試" : kind === "other" ? "テスト" : `${termLabel(term)} ${EXAM_KIND_LABEL[kind]}`;

  const setScore = (k: Subject, f: keyof ScoreInput, v: string) =>
    setSc((cur) => ({ ...cur, [k]: { ...cur[k], [f]: sanitizeNum(v, f === "max" ? 0 : 1) } }));

  const save = () => {
    if (!date) return board.toast("実施日を入力してください");
    const scores: ExamRecord["scores"] = {};
    for (const k of SUBJECTS) {
      const s = parseNum(sc[k].score);
      const mx = parseNum(sc[k].max) ?? 100;
      const av = parseNum(sc[k].avg);
      if (s == null && av == null) continue;
      if (mx <= 0) return board.toast(`${SUBJECT_LABEL[k]}の満点を入力してください`);
      if (s != null && s > mx) return board.toast(`${SUBJECT_LABEL[k]}の点が満点（${mx}）を超えています`);
      if (av != null && av > mx) return board.toast(`${SUBJECT_LABEL[k]}の学年平均が満点（${mx}）を超えています`);
      scores[k] = { score: s, max: mx, avg: av };
    }
    if (!SUBJECTS.some((k) => typeof scores[k]?.score === "number")) {
      return board.toast("教科の点を 1 つ以上入力してください");
    }
    const rk = parseNum(rank);
    const ro = parseNum(rankOf);
    if (rk != null && rk < 1) return board.toast("順位は 1 以上で入力してください");
    if (rk != null && ro != null && rk > ro) return board.toast("順位が人数を超えています");
    const dv = kind === "mock" ? parseNum(dev) : null;
    if (dv != null && (dv < 20 || dv > 100)) return board.toast("偏差値は 20〜100 で入力してください");
    const tg = parseNum(target);
    if (tg != null && tg <= 0) return board.toast("目標は 1 以上で入力してください");
    onSave({
      name: name.trim() || autoName,
      kind,
      date,
      grade: Number(grade),
      term,
      scores,
      rank: rk,
      rankOf: ro,
      deviation: dv,
      judgement: kind === "mock" ? judge : null,
      targetTotal5: tg,
      note: note.trim() || undefined,
    });
  };

  return (
    <HubSheet title={edit ? "テストを編集" : "テストを追加"} onClose={onClose}>
      <Field label="テスト名">
        <input aria-label="テスト名" value={name} onChange={(e) => setName(e.target.value)} placeholder={`例）${autoName}`} />
      </Field>
      <div className="formrow">
        <Field label="種別">
          <select aria-label="種別" value={kind} onChange={(e) => setKind(e.target.value as ExamKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {EXAM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="実施日">
          <input
            aria-label="実施日"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (!termTouched && e.target.value) setTerm(estimateTerm(e.target.value, system));
            }}
          />
        </Field>
      </div>
      <GradeTermFields
        stage={stage}
        system={system}
        grade={grade}
        term={term}
        onGrade={setGrade}
        onTerm={(t) => {
          setTerm(t);
          setTermTouched(true);
        }}
      />

      <div className="phubsheet-sec">教科ごとの点</div>
      <div className="phubscores" role="group" aria-label="教科ごとの点">
        <div className="phubscores-h">
          <span />
          <span>点</span>
          <span>満点</span>
          <span>学年平均</span>
        </div>
        {SUBJECTS.map((k, i) => (
          <React.Fragment key={k}>
            {i === MAIN5.length && <div className="phubscores-sep">実技など（受けたものだけ）</div>}
            <div className="phubscore-row">
              <label>{SUBJECT_LABEL[k]}</label>
              <input
                aria-label={`${SUBJECT_LABEL[k]} 点`}
                inputMode="decimal"
                value={sc[k].score}
                onChange={(e) => setScore(k, "score", e.target.value)}
              />
              <input
                aria-label={`${SUBJECT_LABEL[k]} 満点`}
                inputMode="numeric"
                value={sc[k].max}
                onChange={(e) => setScore(k, "max", e.target.value)}
              />
              <input
                aria-label={`${SUBJECT_LABEL[k]} 学年平均`}
                inputMode="decimal"
                placeholder="任意"
                value={sc[k].avg}
                onChange={(e) => setScore(k, "avg", e.target.value)}
              />
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="formrow">
        <NumField label="学年順位" unit="位" decimals={0} value={rank} onChange={setRank} />
        <NumField label="学年の人数" unit="人" decimals={0} value={rankOf} onChange={setRankOf} />
      </div>
      {kind === "mock" && (
        <>
          <NumField label="偏差値" decimals={1} value={dev} onChange={setDev} />
          <Field label="志望校の判定">
            <Seg<Judgement>
              ariaLabel="志望校の判定"
              allowClear
              value={judge}
              onChange={setJudge}
              options={JUDGEMENTS.map((j) => ({ value: j, label: j }))}
            />
          </Field>
        </>
      )}
      <NumField
        label="目標（5 教科合計）"
        unit="点"
        decimals={0}
        value={target}
        onChange={setTarget}
        hint="入れると、推移のグラフに目標の線が出ます。"
      />
      <Field label="振り返り">
        <textarea
          aria-label="振り返り"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例）数学の計算ミスを減らす。見直しの時間を残す。"
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}
