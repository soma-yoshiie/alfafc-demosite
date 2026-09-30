"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SchoolStage } from "@/lib/types";
import { STAGE_GRADES, gradeLabel } from "@/lib/types";
import type { Certification, GradeGoal, ReportCard, Subject, TermSystem } from "@/lib/profile";
import {
  MAIN3,
  MAIN5,
  SUBJECTS,
  SUBJECT_LABEL,
  TERM_OPTIONS,
  compareCards,
  estimateTerm,
  goalProgress,
  gradeTermLabel,
  neededSumFor,
  newRecordId,
  ratingAverage,
  ratingCount,
  ratingSum,
  ratingSumIfComplete,
  termLabel,
} from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { useProfiles } from "../ProfileProvider";
import { TrendChart } from "../ProfileCharts";
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
  fmtYMD,
  latestStamp,
  numStr,
  parseNum,
} from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「成績表」（player-hub §3-6）：目標カード（評定平均 3.4 → 9 教科合計 31 以上、あと n）、評定平均の推移
 * （カテゴリ軸「中1 1学期」＋目標線）、通知表の表（行＝9 教科・列＝学期の新しい 4 学期分。横スクロール。前の学期との差の ▲/▼、
 * 教科別の目標と差、9科・5科・3科の合計と評定平均、欠席・遅刻・早退）、学期の追加・編集・削除（列見出しを押す）、検定。
 * 評定平均は lib/profile.ts の ratingAverage（9 教科合計 ÷ 9。そろっていなければ入力済みの n で割り「（n 教科）」と添える）、
 * 目標の合計は neededSumFor（round1(合計 ÷ 9) ≥ 目標を満たす最小の合計。3.4 → 31、3.6 → 32）を使う。選手・スタッフのどちらも編集できる。
 */

/** 表に出す学期の数（新しい方から）。これより多いときは「過去の学期も表示」で広げる */
const SHOWN = 4;

/** 前の学期との差の ▲/▼（0・前が無い・片方が未入力なら出さない） */
function Delta({ cur, prev, digits = 0 }: { cur: number | null | undefined; prev: number | null | undefined; digits?: number }) {
  if (typeof cur !== "number" || typeof prev !== "number") return null;
  const d = Math.round((cur - prev) * 10 ** digits) / 10 ** digits;
  if (d === 0) return null;
  return (
    <span className={`d ${d > 0 ? "up" : "down"}`} title="前の学期との差">
      {d > 0 ? "▲" : "▼"}
      {Math.abs(d)}
    </span>
  );
}

/** 新しい通知表の既定の学年・学期：いちばん新しい通知表の次の学期（最後の学期なら次の学年の最初）。無ければ今の学年と、今日から推定した学期 */
function nextAfter(
  latest: ReportCard | undefined,
  stage: SchoolStage,
  system: TermSystem,
  defaultGrade: number
): { grade: number; term: string } {
  const terms = TERM_OPTIONS[system];
  if (latest) {
    const i = terms.indexOf(latest.term);
    if (i >= 0 && i < terms.length - 1) return { grade: latest.grade, term: terms[i + 1] };
    if (i === terms.length - 1) {
      const grades = STAGE_GRADES[stage];
      return { grade: grades.includes(latest.grade + 1) ? latest.grade + 1 : latest.grade, term: terms[0] };
    }
  }
  return { grade: defaultGrade, term: estimateTerm(localDateStr(), system) };
}

type FormState = { k: "card"; edit?: ReportCard } | { k: "goal" } | { k: "cert"; edit?: Certification };

export default function GradesSection({ p, profile, stage }: HubSectionProps) {
  const profiles = useProfiles();
  const [form, setForm] = useState<FormState | null>(null);
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const system: TermSystem = profile.termSystem ?? "3";

  const cards = useMemo(() => [...profile.reportCards].sort(compareCards), [profile.reportCards]);
  const shown = showAll ? cards : cards.slice(-SHOWN);
  const latest = cards[cards.length - 1];
  const goal = profile.gradeGoal;
  const target = typeof goal.targetAvg === "number" && goal.targetAvg > 0 ? goal.targetAvg : null;
  const subjectTargets = goal.subjectTargets ?? {};
  const hasSubjectTargets = SUBJECTS.some((k) => typeof subjectTargets[k] === "number");
  const hasGoalCols = target != null || hasSubjectTargets;
  const progress = target != null && latest ? goalProgress(latest, target) : null;
  const latestAvg = latest ? ratingAverage(latest) : null;
  const lbl = (c: Pick<ReportCard, "grade" | "term">) => gradeTermLabel(stage, c.grade, c.term);

  // 推移のグラフは 9 教科そろった学期だけ（そろっていない平均を並べると、上下して見えてしまう）
  const fullCards = cards.filter((c) => ratingCount(c) === SUBJECTS.length);
  const excluded = cards.length - fullCards.length;

  // 表は最新の学期が見えるよう、はじめに最新の学期が右端に来る位置までスクロールする（player-hub §3-6）。
  // 左端に見える列が固定の教科列の下に欠けないよう、データ列の幅を「見える列数できっちり収まる幅」（--phubcol）に揃え、
  // 列の境目で止める。はみ出すときだけ「横にスクロール」の案内を出す
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let lastW = -1;
    const fit = () => {
      lastW = el.clientWidth;
      el.style.removeProperty("--phubcol");
      const scroll = el.scrollWidth > el.clientWidth + 1;
      setScrollable(scroll);
      if (!scroll) return;
      const ths = Array.from(el.querySelectorAll<HTMLElement>("thead th"));
      const cols = ths.slice(1);
      const widest = Math.max(...cols.map((c) => c.offsetWidth));
      const avail = el.clientWidth - ths[0].offsetWidth;
      if (!(widest > 0) || avail < widest) return;
      el.style.setProperty("--phubcol", `${avail / Math.floor(avail / widest)}px`);
      const last = cols[shown.length - 1];
      if (last) el.scrollLeft = Math.max(0, last.offsetLeft + last.offsetWidth - el.clientWidth);
    };
    fit();
    // 画面の高さだけが変わる resize（スマホのアドレスバー）では位置を戻さない
    const onResize = () => {
      if (el.clientWidth !== lastW) fit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [shown.length, hasGoalCols, cards.length]);

  const removeCard = (c: ReportCard) => {
    if (!window.confirm(`${lbl(c)} の成績表を削除しますか？`)) return;
    profiles.removeRecord(p.id, "reportCards", c.id);
  };
  const removeCert = (c: Certification) => {
    if (!window.confirm(`${c.kind} ${c.level} の記録を削除しますか？`)) return;
    profiles.removeRecord(p.id, "certifications", c.id);
  };

  const certs = [...profile.certifications].sort((a, b) =>
    (b.date ?? "") < (a.date ?? "") ? -1 : (b.date ?? "") > (a.date ?? "") ? 1 : b.updatedAt - a.updatedAt
  );
  const deadline = goal.deadlineGrade != null ? gradeTermLabel(stage, goal.deadlineGrade, goal.deadlineTerm) : "";
  const goalEmpty = target == null && !goal.actions && !hasSubjectTargets && !deadline;
  const pct = progress ? Math.max(0, Math.min(100, (progress.sum / progress.needed) * 100)) : 0;

  return (
    <section className="phubsec" aria-label="成績表">
      <HubHead title="成績表" sub="通知表の評定と目標" />

      {/* 目標カード（数値＋期限＋行動） */}
      <div className="phubcard phubgoal">
        <div className="phubgoal-h">
          <div className="phubcard-t">成績の目標</div>
          <HubRowBtn label="成績の目標を編集" onClick={() => setForm({ k: "goal" })}>
            {goalEmpty ? "目標を設定" : "目標を編集"}
          </HubRowBtn>
        </div>
        {goalEmpty ? (
          <div className="phubkv-empty">
            まだ目標がありません。評定平均（例: 3.4）・期限・行動を決めると、あと何点で届くかが出ます。
          </div>
        ) : (
          <>
            {target != null && (
              <div className="phubgoal-main">
                目標 評定平均 <b>{target.toFixed(1)}</b>
                <small>（9 教科合計 {neededSumFor(target)} 以上）</small>
              </div>
            )}
            {deadline && <div className="phubgoal-meta">期限 {deadline}</div>}
            {target != null && (
              <>
                {progress && latest ? (
                  <>
                    <div
                      className={`phubgoal-bar${progress.reached ? " done" : ""}`}
                      role="img"
                      aria-label={`9 教科合計 ${progress.sum}（目標 ${progress.needed}）`}
                    >
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <div className="phubgoal-now">
                      現在 <b>{latestAvg ? latestAvg.avg.toFixed(1) : "—"}</b>
                      {!progress.complete && `（${progress.n} 教科）`}
                      <span className="phubgoal-sub">
                        {" "}
                        （{lbl(latest)} 合計 {progress.sum}）
                      </span>
                      {progress.complete &&
                        (progress.reached ? (
                          <span className="phubgoal-gap ok">達成</span>
                        ) : (
                          <span className="phubgoal-gap">
                            あと <b>{progress.gap}</b>
                          </span>
                        ))}
                      {!progress.complete && <div className="phubnote">9 教科そろうと「あと何点」が出ます。</div>}
                    </div>
                  </>
                ) : (
                  <div className="phubnote">通知表を入れると、目標まであと何点かが出ます。</div>
                )}
              </>
            )}
            {goal.actions && (
              <div className="phubgoal-act">
                <span className="l">目標のための行動</span>
                <div className="phubmemo">{goal.actions}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 評定平均の推移（カテゴリ軸＋目標線） */}
      {fullCards.length >= 2 && (
        <div className="phubcard">
          <div className="phubcard-t">評定平均の推移</div>
          <TrendChart
            xKind="category"
            ariaLabel="評定平均の推移"
            format={(v) => v.toFixed(1)}
            series={[
              {
                label: "評定平均",
                points: fullCards.map((c) => ({ x: lbl(c), y: ratingAverage(c)!.avg })),
              },
            ]}
            target={target != null ? { label: "目標", value: target } : undefined}
          />
          {excluded > 0 && <div className="phubnote">9 教科そろっていない学期は、グラフには含めていません。</div>}
        </div>
      )}
      {cards.length > 0 && fullCards.length < 2 && (
        <div className="phubnote">9 教科そろった学期が 2 学期分になると、評定平均の推移のグラフが出ます。</div>
      )}

      {/* 通知表の表 */}
      <HubHead title="通知表" sub="列の見出しを押すと編集・削除" />
      <HubAdd onClick={() => setForm({ k: "card" })}>学期を追加</HubAdd>
      {cards.length === 0 ? (
        <HubEmpty hint="通知表をもらったら「学期を追加」から評定を入れます。教科ごとの推移と、評定平均・合計が出ます。" />
      ) : (
        <>
          <div className="phubtablewrap" ref={wrapRef} role="region" aria-label="通知表の表（横にスクロールできます）" tabIndex={0}>
            <table className="phubtable">
              <thead>
                <tr>
                  <th scope="col">教科</th>
                  {shown.map((c) => (
                    <th scope="col" key={c.id}>
                      <button type="button" aria-label={`${lbl(c)} の成績表を編集・削除`} onClick={() => setForm({ k: "card", edit: c })}>
                        <span>{gradeLabel(stage, c.grade)}</span>
                        <span>{termLabel(c.term)}</span>
                      </button>
                    </th>
                  ))}
                  {hasGoalCols && (
                    <>
                      <th scope="col">目標</th>
                      <th scope="col">差</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {SUBJECTS.map((k) => {
                  const t = typeof subjectTargets[k] === "number" ? (subjectTargets[k] as number) : null;
                  const r = latest?.ratings[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{SUBJECT_LABEL[k]}</th>
                      {shown.map((c) => {
                        const prev = cards[cards.indexOf(c) - 1];
                        const v = c.ratings[k];
                        return typeof v === "number" ? (
                          <td key={c.id}>
                            {v}
                            <Delta cur={v} prev={prev?.ratings[k]} />
                          </td>
                        ) : (
                          <td key={c.id} className="na">
                            —
                          </td>
                        );
                      })}
                      {hasGoalCols && (
                        <>
                          <td className={t == null ? "na" : ""}>{t ?? "—"}</td>
                          <td className={t == null || typeof r !== "number" ? "na" : ""}>
                            {t == null || typeof r !== "number" ? "—" : r >= t ? "達成" : `あと ${t - r}`}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {/* 合計（9科・5科・3科）と評定平均。そろっていない合計は「—」 */}
                {(
                  [
                    ["9科合計", SUBJECTS],
                    ["5科合計", MAIN5],
                    ["3科合計", MAIN3],
                  ] as [string, Subject[]][]
                ).map(([label, subs], i) => (
                  <tr key={label} className={`sum${i === 0 ? " first" : ""}`}>
                    <th scope="row">{label}</th>
                    {shown.map((c) => {
                      const prev = cards[cards.indexOf(c) - 1];
                      const v = ratingSumIfComplete(c, subs);
                      return v == null ? (
                        <td key={c.id} className="na">
                          —
                        </td>
                      ) : (
                        <td key={c.id}>
                          {v}
                          <Delta cur={v} prev={prev ? ratingSumIfComplete(prev, subs) : null} />
                        </td>
                      );
                    })}
                    {hasGoalCols && (
                      <>
                        <td className={i === 0 && target != null ? "" : "na"}>{i === 0 && target != null ? neededSumFor(target) : ""}</td>
                        <td className={i === 0 && progress?.gap != null ? "" : "na"}>
                          {i === 0 && progress?.gap != null ? (progress.gap === 0 ? "達成" : `あと ${progress.gap}`) : ""}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                <tr className="sum">
                  <th scope="row">評定平均</th>
                  {shown.map((c) => {
                    const prev = cards[cards.indexOf(c) - 1];
                    const a = ratingAverage(c);
                    const pa = prev ? ratingAverage(prev) : null;
                    return a ? (
                      <td key={c.id}>
                        {a.avg.toFixed(1)}
                        {!a.complete && <small>（{a.n}教科）</small>}
                        <Delta cur={a.complete ? a.avg : null} prev={pa?.complete ? pa.avg : null} digits={1} />
                      </td>
                    ) : (
                      <td key={c.id} className="na">
                        —
                      </td>
                    );
                  })}
                  {hasGoalCols && (
                    <>
                      <td className={target != null ? "" : "na"}>{target != null ? target.toFixed(1) : ""}</td>
                      <td className="na" />
                    </>
                  )}
                </tr>
                {(
                  [
                    ["欠席", "absent"],
                    ["遅刻", "late"],
                    ["早退", "leftEarly"],
                  ] as [string, "absent" | "late" | "leftEarly"][]
                ).map(([label, key], i) => (
                  <tr key={key} className={`t-att${i === 0 ? " first" : ""}`}>
                    <th scope="row">{label}（日）</th>
                    {shown.map((c) => (
                      <td key={c.id} className={typeof c[key] === "number" ? "" : "na"}>
                        {typeof c[key] === "number" ? c[key] : "—"}
                      </td>
                    ))}
                    {hasGoalCols && (
                      <>
                        <td />
                        <td />
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {scrollable && <div className="phubnote">表は横にスクロールできます（左の「教科」は固定です）。</div>}
          {cards.length > SHOWN && (
            <button type="button" className="phubrowbtn phubtoggle" onClick={() => setShowAll((v) => !v)}>
              {showAll ? `新しい ${SHOWN} 学期だけ表示` : `過去の学期も表示（全 ${cards.length} 学期）`}
            </button>
          )}
          {shown.some((c) => c.comment) && (
            <ul className="phubcomments" aria-label="学期ごとの所見">
              {[...shown]
                .reverse()
                .filter((c) => c.comment)
                .map((c) => (
                  <li key={c.id}>
                    <b>{lbl(c)}</b>
                    {c.comment}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      <LastUpdated {...latestStamp([...profile.reportCards, goal])} />

      {/* 検定 */}
      <HubHead title="検定" sub="英検・数検・漢検など" />
      <HubAdd onClick={() => setForm({ k: "cert" })}>検定を追加</HubAdd>
      {certs.length === 0 ? (
        <HubEmpty compact hint="合格した検定を記録します（推薦の加点の確認に使えます）。" />
      ) : (
        <div className="phublist phubcerts">
          {certs.map((c) => (
            <div className="phubrow" key={c.id}>
              <div className="phubrow-main">
                <b>
                  {c.kind} {c.level}
                </b>
                {c.date && <small>取得 {fmtYMD(c.date)}</small>}
              </div>
              <div className="phubrow-act">
                <HubRowBtn label={`${c.kind} ${c.level} を編集`} onClick={() => setForm({ k: "cert", edit: c })}>
                  編集
                </HubRowBtn>
                <HubRowBtn danger label={`${c.kind} ${c.level} を削除`} onClick={() => removeCert(c)}>
                  削除
                </HubRowBtn>
              </div>
            </div>
          ))}
        </div>
      )}
      <LastUpdated {...latestStamp(profile.certifications)} />

      {form?.k === "card" && (
        <CardForm
          edit={form.edit}
          stage={stage}
          system={system}
          initial={nextAfter(latest, stage, system, p.grade ?? 1)}
          onClose={() => setForm(null)}
          onDelete={
            form.edit
              ? () => {
                  const c = form.edit!;
                  if (!window.confirm(`${lbl(c)} の成績表を削除しますか？`)) return;
                  profiles.removeRecord(p.id, "reportCards", c.id);
                  setForm(null);
                }
              : undefined
          }
          onSave={(rec) => {
            // 同じ学年・学期の別の成績表があれば上書き確認（追加なら相手の id に載せ替え、編集なら相手を消して自分を残す）
            const other = cards.find((c) => c.grade === rec.grade && c.term === rec.term && c.id !== form.edit?.id);
            if (other && !window.confirm(`${lbl(rec)} の成績表があります。上書きしますか？`)) return;
            const id = form.edit?.id ?? other?.id ?? newRecordId("rc");
            if (other && form.edit) profiles.removeRecord(p.id, "reportCards", other.id);
            profiles.setRecord(p.id, "reportCards", { ...rec, id });
            setForm(null);
          }}
        />
      )}
      {form?.k === "goal" && (
        <GoalForm
          goal={goal}
          stage={stage}
          system={system}
          onClose={() => setForm(null)}
          onSave={(g) => {
            profiles.update(p.id, { gradeGoal: g });
            setForm(null);
          }}
        />
      )}
      {form?.k === "cert" && (
        <CertForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            profiles.setRecord(p.id, "certifications", { ...rec, id: form.edit?.id ?? newRecordId("ce") });
            setForm(null);
          }}
        />
      )}
    </section>
  );
}

/* ===================== フォーム ===================== */

/** 通知表（1 学期分）の追加・編集：学年・学期（学期制に合わせた選択肢）、9 教科の評定（1〜5）、欠席・遅刻・早退、所見 */
function CardForm({
  edit,
  stage,
  system,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  edit?: ReportCard;
  stage: SchoolStage;
  system: TermSystem;
  /** 追加のときの学年・学期の既定 */
  initial: { grade: number; term: string };
  onSave: (rec: Omit<ReportCard, "id" | "updatedAt" | "updatedBy">) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [grade, setGrade] = useState(String(edit?.grade ?? initial.grade));
  const [term, setTerm] = useState(edit?.term ?? initial.term);
  const [r, setR] = useState<Partial<Record<Subject, number | null>>>(() => ({ ...(edit?.ratings ?? {}) }));
  const [absent, setAbsent] = useState(numStr(edit?.absent));
  const [late, setLate] = useState(numStr(edit?.late));
  const [left, setLeft] = useState(numStr(edit?.leftEarly));
  const [comment, setComment] = useState(edit?.comment ?? "");

  // 入力中の合計と評定平均（保存前の目安）
  const live = ratingAverage({ ratings: r });
  const liveSum = ratingSum({ ratings: r });

  const save = () => {
    const ratings: ReportCard["ratings"] = {};
    SUBJECTS.forEach((k) => {
      const v = r[k];
      if (typeof v === "number") ratings[k] = v;
    });
    if (Object.keys(ratings).length === 0) return board.toast("教科の評定を 1 つ以上入力してください");
    if (!term) return board.toast("学期を選んでください");
    onSave({
      grade: Number(grade),
      term,
      ratings,
      absent: parseNum(absent),
      late: parseNum(late),
      leftEarly: parseNum(left),
      comment: comment.trim() || undefined,
    });
  };

  return (
    <HubSheet title={edit ? "成績表を編集" : "学期を追加"} onClose={onClose}>
      <GradeTermFields stage={stage} system={system} grade={grade} term={term} onGrade={setGrade} onTerm={setTerm} />
      <div className="phubsheet-sec">教科の評定（1〜5）</div>
      <div className="phubrates">
        {SUBJECTS.map((k) => (
          <div className="phubrate" key={k}>
            <span>{SUBJECT_LABEL[k]}</span>
            <Seg<number>
              className="compact"
              ariaLabel={`${SUBJECT_LABEL[k]}の評定`}
              allowClear
              value={r[k] ?? null}
              onChange={(v) => setR((cur) => ({ ...cur, [k]: v }))}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
        ))}
      </div>
      <div className="phubnote phubsheet-live">
        {live
          ? `9 教科合計 ${liveSum} ・ 評定平均 ${live.avg.toFixed(1)}${live.complete ? "" : `（${live.n} 教科）`}`
          : "評定を選ぶと、合計と評定平均が出ます。"}
      </div>
      <div className="formrow">
        <NumField label="欠席" unit="日" decimals={0} value={absent} onChange={setAbsent} />
        <NumField label="遅刻" unit="日" decimals={0} value={late} onChange={setLate} />
        <NumField label="早退" unit="日" decimals={0} value={left} onChange={setLeft} />
      </div>
      <Field label="所見">
        <textarea
          aria-label="所見"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="通知表の所見・コメントなど"
        />
      </Field>
      <SheetSave onClick={save} />
      {onDelete && (
        <div className="phubmanage">
          <button type="button" className="phubdel" onClick={onDelete}>
            この学期の成績表を削除
          </button>
        </div>
      )}
    </HubSheet>
  );
}

/** 成績の目標の編集：目標の評定平均（小数 1 桁）、期限（学年・学期）、教科別の目標評定（任意）、行動 */
function GoalForm({
  goal,
  stage,
  system,
  onSave,
  onClose,
}: {
  goal: GradeGoal;
  stage: SchoolStage;
  system: TermSystem;
  onSave: (g: GradeGoal) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [avg, setAvg] = useState(numStr(goal.targetAvg));
  const [dGrade, setDGrade] = useState(goal.deadlineGrade != null ? String(goal.deadlineGrade) : "");
  const [dTerm, setDTerm] = useState(goal.deadlineTerm ?? "");
  const [sub, setSub] = useState<Partial<Record<Subject, number | null>>>(() => ({ ...(goal.subjectTargets ?? {}) }));
  const [showSub, setShowSub] = useState(SUBJECTS.some((k) => typeof goal.subjectTargets?.[k] === "number"));
  const [actions, setActions] = useState(goal.actions ?? "");

  const avgNum = parseNum(avg);

  const save = () => {
    if (avgNum != null && (avgNum < 1 || avgNum > 5)) return board.toast("目標の評定平均は 1.0〜5.0 で入力してください");
    const subjectTargets: NonNullable<GradeGoal["subjectTargets"]> = {};
    SUBJECTS.forEach((k) => {
      const v = sub[k];
      if (typeof v === "number") subjectTargets[k] = v;
    });
    const hasDeadline = dGrade !== "";
    onSave({
      targetAvg: avgNum,
      deadlineGrade: hasDeadline ? Number(dGrade) : null,
      deadlineTerm: hasDeadline && dTerm ? dTerm : undefined,
      subjectTargets: Object.keys(subjectTargets).length > 0 ? subjectTargets : undefined,
      actions: actions.trim() || undefined,
    });
  };

  return (
    <HubSheet title="成績の目標を編集" onClose={onClose}>
      <NumField
        label="目標の評定平均"
        value={avg}
        onChange={setAvg}
        placeholder="例）3.4"
        hint={avgNum != null && avgNum >= 1 && avgNum <= 5 ? `9 教科合計 ${neededSumFor(avgNum)} 以上で届きます。` : "9 教科の評定の平均（例: 3.4）。"}
      />
      <div className="phubsheet-sec">期限</div>
      <GradeTermFields
        optional
        stage={stage}
        system={system}
        grade={dGrade}
        term={dTerm}
        gradeText="期限の学年"
        termText="期限の学期"
        onGrade={setDGrade}
        onTerm={setDTerm}
      />
      {showSub ? (
        <>
          <div className="phubsheet-sec">教科別の目標評定（任意）</div>
          <div className="phubrates">
            {SUBJECTS.map((k) => (
              <div className="phubrate" key={k}>
                <span>{SUBJECT_LABEL[k]}</span>
                <Seg<number>
                  className="compact"
                  ariaLabel={`${SUBJECT_LABEL[k]}の目標評定`}
                  allowClear
                  value={sub[k] ?? null}
                  onChange={(v) => setSub((cur) => ({ ...cur, [k]: v }))}
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="phubadd phubsheet-more" onClick={() => setShowSub(true)}>
          ＋ 教科別の目標評定を決める（任意）
        </button>
      )}
      <Field label="目標のための行動">
        <textarea
          aria-label="目標のための行動"
          rows={3}
          value={actions}
          onChange={(e) => setActions(e.target.value)}
          placeholder="例）数学と英語の提出物を毎週、締切の前に出す。"
        />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}

const CERT_KINDS = ["英検", "数検", "漢検"];

/** 検定の追加・編集：種類（英検など）・級・取得日 */
function CertForm({
  edit,
  onSave,
  onClose,
}: {
  edit?: Certification;
  onSave: (rec: Omit<Certification, "id" | "updatedAt" | "updatedBy">) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [kind, setKind] = useState(edit?.kind ?? "");
  const [level, setLevel] = useState(edit?.level ?? "");
  const [date, setDate] = useState(edit?.date ?? "");

  const save = () => {
    if (!kind.trim()) return board.toast("検定の種類を入力してください");
    if (!level.trim()) return board.toast("級を入力してください");
    onSave({ kind: kind.trim(), level: level.trim(), date: date || undefined });
  };

  return (
    <HubSheet title={edit ? "検定を編集" : "検定を追加"} onClose={onClose}>
      <Field label="種類">
        <input
          aria-label="種類"
          list="phub-cert-kinds"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="例）英検"
        />
        <datalist id="phub-cert-kinds">
          {CERT_KINDS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </Field>
      <Field label="級">
        <input aria-label="級" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="例）3級・準2級" />
      </Field>
      <Field label="取得日">
        <input aria-label="取得日" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}
