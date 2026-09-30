"use client";

import React, { useState } from "react";
import { gradeLabel } from "@/lib/types";
import type { Measurement } from "@/lib/profile";
import {
  BMI_TARGET_BAND,
  GROWTH_MIN_DAYS,
  GROWTH_SPURT_CM_PER_YEAR,
  SEX_LABEL,
  bmi,
  growthVelocity,
  nationalAverage,
  newRecordId,
} from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { useProfiles } from "../ProfileProvider";
import { TrendChart } from "../ProfileCharts";
import {
  Field,
  HubAdd,
  HubEmpty,
  HubHead,
  HubRowBtn,
  HubSheet,
  LastUpdated,
  NumField,
  SheetSave,
  fmtDiff,
  fmtYMD,
  latestStamp,
  numStr,
  parseNum,
} from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「成長」（player-hub §3-3）：身長・体重の推移グラフ（日付軸・全国平均の破線）、最新値と前回差、
 * BMI（目安帯のみ。中学生に大人向けの判定語は出さない）、成長速度（60 日以上あいたとき）、測定の一覧と追加・編集・削除。
 * 保存・削除のたびに、最新の記録の値を Player.height/weight へ同期する（名簿・戦術ボードの表示と食い違わないように）。
 */

const byDateAsc = (a: Measurement, b: Measurement) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.updatedAt - b.updatedAt;

export default function GrowthSection({ p, profile, stage, age }: HubSectionProps) {
  const board = useBoard();
  const profiles = useProfiles();
  const [form, setForm] = useState<{ edit?: Measurement } | null>(null);

  const asc = [...profile.measurements].sort(byDateAsc);
  const desc = [...asc].reverse();
  const withH = asc.filter((m) => m.height != null);
  const withW = asc.filter((m) => m.weight != null);
  const lastH = withH[withH.length - 1];
  const prevH = withH[withH.length - 2];
  const lastW = withW[withW.length - 1];
  const prevW = withW[withW.length - 2];
  // 記録が無いときは Player.height/weight（登録値）を数値カードに出す
  const curH = lastH?.height ?? p.height ?? null;
  const curW = lastW?.weight ?? p.weight ?? null;
  const curBmi = bmi(curH, curW);
  const band = p.position === "GK" ? BMI_TARGET_BAND.gk : BMI_TARGET_BAND.fp;

  // 成長速度：最新の身長記録と、60 日以上前でいちばん近い身長記録の間（cm/年）
  let velocity: { v: number; from: string; to: string } | null = null;
  if (lastH) {
    for (let i = withH.length - 2; i >= 0; i--) {
      const v = growthVelocity(withH[i], lastH);
      if (v != null) {
        velocity = { v, from: withH[i].date, to: lastH.date };
        break;
      }
    }
  }

  // 全国平均（令和 6 年度 学校保健統計）。年齢は 4/1 時点。sex 未設定は男子で引き、凡例に「男子の平均」と書く
  const nat = nationalAverage(age, profile.sex);
  const gradeTxt = p.grade != null ? gradeLabel(stage, p.grade) : age != null ? `${age}歳` : "";
  const natLabel = `全国平均（${gradeTxt}${profile.sex ? ` ${SEX_LABEL[profile.sex]}` : "・男子の平均"}）`;

  /** 最新の記録の値を Player.height/weight へ同期する（最新の Player を base に） */
  const syncPlayer = (list: Measurement[]) => {
    const sorted = [...list].sort(byDateAsc);
    const h = [...sorted].reverse().find((m) => m.height != null)?.height;
    const w = [...sorted].reverse().find((m) => m.weight != null)?.weight;
    const live = board.state.players.find((x) => x.id === p.id) ?? p;
    if ((h != null && h !== live.height) || (w != null && w !== live.weight)) {
      board.updatePlayer({ ...live, height: h ?? live.height, weight: w ?? live.weight });
    }
  };

  const remove = (m: Measurement) => {
    if (!window.confirm(`${fmtYMD(m.date)} の測定記録を削除しますか？`)) return;
    profiles.removeRecord(p.id, "measurements", m.id);
    syncPlayer(profile.measurements.filter((x) => x.id !== m.id));
  };

  const hasAny = asc.length > 0;
  const addBtn = <HubAdd onClick={() => setForm({})}>測定を追加</HubAdd>;

  return (
    <section className="phubsec" aria-label="成長">
      <HubHead title="成長" sub="身長・体重の推移" action={null} />

      {/* 数値カード：最新値（前回との差）・BMI（目安帯）・成長速度 */}
      <div className="phubnums">
        <div className="phubnumcard">
          <div className="l">身長</div>
          <div className="v">
            {curH != null ? curH : "—"}
            {curH != null && <small>cm</small>}
          </div>
          <div className="d">
            {lastH && prevH ? `前回比 ${fmtDiff(lastH.height! - prevH.height!)}cm` : lastH ? fmtYMD(lastH.date) : "登録値"}
          </div>
        </div>
        <div className="phubnumcard">
          <div className="l">体重</div>
          <div className="v">
            {curW != null ? curW : "—"}
            {curW != null && <small>kg</small>}
          </div>
          <div className="d">
            {lastW && prevW ? `前回比 ${fmtDiff(lastW.weight! - prevW.weight!)}kg` : lastW ? fmtYMD(lastW.date) : "登録値"}
          </div>
        </div>
        <div className="phubnumcard">
          <div className="l">BMI</div>
          <div className="v">{curBmi ?? "—"}</div>
          <div className="d">
            {curBmi != null ? (
              <>
                <BmiMeter value={curBmi} min={band.min} max={band.max} />
                目安 {band.min.toFixed(1)}〜{band.max.toFixed(1)}
              </>
            ) : (
              "身長と体重から計算"
            )}
          </div>
        </div>
        <div className="phubnumcard">
          <div className="l">成長速度</div>
          <div className="v">
            {velocity ? velocity.v : "—"}
            {velocity && <small>cm/年</small>}
          </div>
          <div className="d">
            {velocity
              ? velocity.v >= GROWTH_SPURT_CM_PER_YEAR
                ? "成長スパートの目安"
                : `${fmtYMD(velocity.from)} → ${fmtYMD(velocity.to)}`
              : `${GROWTH_MIN_DAYS} 日以上あけて 2 回測ると出ます`}
          </div>
        </div>
      </div>

      {/* 推移グラフ（点は 2 つ以上で描く。1 つなら数値カードだけ） */}
      {withH.length >= 2 && (
        <div className="phubcard">
          <div className="phubcard-t">身長の推移</div>
          <TrendChart
            xKind="date"
            unit="cm"
            series={[{ label: "身長", points: withH.map((m) => ({ x: m.date, y: m.height! })) }]}
            reference={nat ? { label: natLabel, value: nat.height } : undefined}
          />
        </div>
      )}
      {withW.length >= 2 && (
        <div className="phubcard">
          <div className="phubcard-t">体重の推移</div>
          <TrendChart
            xKind="date"
            unit="kg"
            series={[{ label: "体重", points: withW.map((m) => ({ x: m.date, y: m.weight! })) }]}
            reference={nat ? { label: natLabel, value: nat.weight } : undefined}
          />
        </div>
      )}
      {hasAny && withH.length < 2 && withW.length < 2 && (
        <div className="phubnote">2 回以上測ると、推移のグラフが出ます。</div>
      )}

      {/* 測定の一覧 */}
      <HubHead title="測定の記録" action={null} />
      {addBtn}
      {!hasAny ? (
        <HubEmpty hint="身長・体重を測ったら「測定を追加」から記録します。推移のグラフと全国平均との比較が出ます。" />
      ) : (
        <div className="phublist">
          {desc.map((m) => (
            <div className="phubrow" key={m.id}>
              <div className="phubrow-main">
                <b>{fmtYMD(m.date)}</b>
                <span>
                  {[
                    m.height != null ? `身長 ${m.height}cm` : null,
                    m.weight != null ? `体重 ${m.weight}kg` : null,
                    m.sittingHeight != null ? `座高 ${m.sittingHeight}cm` : null,
                  ]
                    .filter(Boolean)
                    .join(" ・ ")}
                </span>
                {m.note && <small>{m.note}</small>}
              </div>
              <div className="phubrow-act">
                <HubRowBtn label={`${fmtYMD(m.date)} の測定を編集`} onClick={() => setForm({ edit: m })}>
                  編集
                </HubRowBtn>
                <HubRowBtn danger label={`${fmtYMD(m.date)} の測定を削除`} onClick={() => remove(m)}>
                  削除
                </HubRowBtn>
              </div>
            </div>
          ))}
        </div>
      )}
      <LastUpdated {...latestStamp(profile.measurements)} />

      {form && (
        <MeasurementForm
          edit={form.edit}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            // 同じ日付の別の記録があれば上書き確認（追加なら相手の id に載せ替え、編集なら相手を消して自分を残す）
            const other = profile.measurements.find((x) => x.date === rec.date && x.id !== form.edit?.id);
            if (other && !window.confirm(`${fmtYMD(rec.date)} の記録があります。上書きしますか？`)) return;
            const id = form.edit?.id ?? other?.id ?? newRecordId("ms");
            if (other && form.edit) profiles.removeRecord(p.id, "measurements", other.id);
            profiles.setRecord(p.id, "measurements", { ...rec, id });
            syncPlayer([
              ...profile.measurements.filter((x) => x.id !== id && x.id !== other?.id),
              { ...rec, id, updatedAt: Date.now(), updatedBy: "" },
            ]);
            setForm(null);
          }}
        />
      )}
    </section>
  );
}

/** BMI の目安帯の小さなメーター（14〜30 の目盛り。薄い帯＝JFA の目標、点＝今の BMI。判定語は出さない） */
function BmiMeter({ value, min, max }: { value: number; min: number; max: number }) {
  const LO = 14;
  const HI = 30;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - LO) / (HI - LO)) * 100));
  return (
    <span className="phubmeter" role="img" aria-label={`BMI ${value}（目安 ${min}〜${max}）`}>
      <i className="pm-band" style={{ left: `${pos(min)}%`, width: `${pos(max) - pos(min)}%` }} />
      <i className="pm-dot" style={{ left: `${pos(value)}%` }} />
    </span>
  );
}

/** 測定の追加・編集フォーム（日付＝今日、身長・体重は小数 1 桁、座高は任意、メモ） */
function MeasurementForm({
  edit,
  onSave,
  onClose,
}: {
  edit?: Measurement;
  onSave: (rec: Omit<Measurement, "id" | "updatedAt" | "updatedBy">) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? localDateStr());
  const [h, setH] = useState(numStr(edit?.height));
  const [w, setW] = useState(numStr(edit?.weight));
  const [s, setS] = useState(numStr(edit?.sittingHeight));
  const [note, setNote] = useState(edit?.note ?? "");

  const save = () => {
    const hv = parseNum(h);
    const wv = parseNum(w);
    const sv = parseNum(s);
    if (!date) return board.toast("測定日を入力してください");
    if (hv == null && wv == null && sv == null) return board.toast("身長か体重を入力してください");
    if (hv != null && (hv < 50 || hv > 250)) return board.toast("身長は 50〜250cm で入力してください");
    if (wv != null && (wv < 10 || wv > 200)) return board.toast("体重は 10〜200kg で入力してください");
    if (sv != null && (sv < 30 || sv > 150)) return board.toast("座高は 30〜150cm で入力してください");
    onSave({
      date,
      height: hv,
      weight: wv,
      sittingHeight: sv,
      note: note.trim() || undefined,
    });
  };

  return (
    <HubSheet title={edit ? "測定を編集" : "測定を追加"} onClose={onClose}>
      <Field label="測定日">
        <input aria-label="測定日" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="formrow">
        <NumField label="身長" unit="cm" value={h} onChange={setH} />
        <NumField label="体重" unit="kg" value={w} onChange={setW} />
      </div>
      <NumField label="座高" unit="cm" value={s} onChange={setS} hint="任意（新体力テストの記録用紙にある項目です）。" />
      <Field label="メモ">
        <input aria-label="メモ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）学校の健康診断" />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}
