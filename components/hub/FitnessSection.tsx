"use client";

import React, { useMemo, useState } from "react";
import type { FitnessRecord, FitnessTest } from "@/lib/types";
import { FITNESS_ITEMS, gradeFor, scoreFor, standardSessionDates, totalScore } from "@/lib/fitnessScore";
import { fmtFitnessValue } from "@/lib/fitness";
import { localDateStr } from "@/lib/dates";
import type { FitnessSessionKind } from "@/lib/profile";
import { FITNESS_SESSION_KINDS, FITNESS_SESSION_LABEL, fitnessSessionId } from "@/lib/profile";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { useProfiles } from "../ProfileProvider";
import { RadarChart, TrendChart } from "../ProfileCharts";
import {
  Field,
  HubAdd,
  HubEmpty,
  HubHead,
  HubRowBtn,
  HubSheet,
  Seg,
  SheetSave,
  fmtDiff,
  fmtMD,
  fmtYMD,
} from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「体力」（player-hub §3-4）：新体力テスト（文部科学省 12〜19 歳）の得点・合計・総合評価とレーダー、
 * 種目ごとのカード（最新値・前回との差・得点・推移グラフ。lowerIsBetter は Y を反転して「上ほど良い」）、
 * 測定回（日付ごと）の一覧と一括追加・日付単位の削除。
 * 記録は既存の Player.fitness（FitnessRecord{testId,value,date}）のまま使い、追加・削除は TeamProvider の
 * addFitnessRecords／removeFitnessSession（1 回の updatePlayer）で行う。測定回の区分（学校の新体力テスト／クラブ測定／
 * その他。メモに残すだけ）は FitnessRecord に置き場が無いので、プロフィールの fitnessSessions（測定日ごとに 1 件）に持つ。
 */

/** レーダーの軸ラベル（文字が長いと左右にはみ出すので 5 文字以内に縮める） */
const RADAR_LABEL: Record<string, string> = {
  grip: "握力",
  situp: "上体起こし",
  sitreach: "長座体前屈",
  sidestep: "反復横とび",
  stamina: "持久力",
  sprint50: "50m走",
  longjump: "立ち幅とび",
  handball: "ハンド投げ",
};

/** 秒を「m:ss」に（グラフの目盛り用。60 秒未満はそのまま） */
function mmss(v: number): string {
  if (v < 60) return String(Math.round(v * 100) / 100);
  const t = Math.round(v);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** 時間の入力（"3:45" → 225）。数値はそのまま。読めなければ null */
function parseValue(s: string, isTime: boolean): number | null {
  const t = s.trim();
  if (t === "" || t === "." || t === ":") return null;
  if (isTime && t.includes(":")) {
    const [m, sec] = t.split(":");
    const mm = Number(m || 0);
    const ss = Number(sec || 0);
    return Number.isFinite(mm) && Number.isFinite(ss) ? mm * 60 + ss : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface TestRow {
  id: string;
  name: string;
  unit: string;
  lowerIsBetter?: boolean;
  standardKey?: FitnessTest["standardKey"];
  /** 種目マスタに無い（削除済みの種目）。向きが分からないので差に意味色を付けない */
  orphan?: boolean;
  /** 新しい順 */
  recs: FitnessRecord[];
}

export default function FitnessSection({ p, profile, viewer, age, onManageFitnessTests }: HubSectionProps) {
  const board = useBoard();
  const team = useTeam();
  const profiles = useProfiles();
  const [form, setForm] = useState<{ date?: string } | null>(null);
  const tests = useMemo(() => team.team.fitnessTests ?? [], [team.team.fitnessTests]);
  const recs = useMemo(() => p.fitness ?? [], [p.fitness]);
  const sex = profile.sex ?? "male";

  // 種目ごとの記録（新しい順）。種目マスタに無い testId（種目を削除したあとも記録は残る）も行として出す
  const rows: TestRow[] = useMemo(() => {
    const by = new Map<string, FitnessRecord[]>();
    recs.forEach((r) => {
      const l = by.get(r.testId) ?? [];
      l.push(r);
      by.set(r.testId, l);
    });
    by.forEach((l) => l.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
    const known: TestRow[] = tests
      .filter((t) => (by.get(t.id)?.length ?? 0) > 0)
      .map((t) => ({
        id: t.id,
        name: t.name,
        unit: t.unit,
        lowerIsBetter: t.lowerIsBetter,
        standardKey: t.standardKey,
        recs: by.get(t.id)!,
      }));
    const knownIds = new Set(known.map((k) => k.id));
    const orphans: TestRow[] = [...by.keys()]
      .filter((id) => !knownIds.has(id))
      .map((id) => ({ id, name: "削除済みの種目", unit: "", orphan: true, recs: by.get(id)! }));
    return [...known, ...orphans];
  }, [recs, tests]);

  // 測定回（日付ごと。新しい順）
  const sessions = useMemo(() => {
    const by = new Map<string, FitnessRecord[]>();
    recs.forEach((r) => by.set(r.date, [...(by.get(r.date) ?? []), r]));
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [recs]);

  // 測定回の区分（測定日 → 区分）。記録の無い日付のメモは出さない（sessions から引くだけ）
  const kindByDate = useMemo(
    () => new Map(profile.fitnessSessions.map((s) => [s.date, s.kind] as const)),
    [profile.fitnessSessions]
  );

  // 新体力テストの要約（標準種目が 1 つも無ければこのブロックは出さない）
  const hasStd = tests.some((t) => t.standardKey);
  const dates = standardSessionDates(recs, tests);
  const latest = totalScore(recs, tests, sex);
  const prev = dates.length >= 2 ? totalScore(recs, tests, sex, dates[1]) : null;
  const grade = latest.complete ? gradeFor(latest.total, age) : null;
  const scoreVals = (t: ReturnType<typeof totalScore>) =>
    FITNESS_ITEMS.map((it) => t.items.find((x) => x.item === it.key)?.score ?? 0);

  const removeSession = (date: string, n: number) => {
    if (!window.confirm(`${fmtYMD(date)} の測定（${n} 種目）を削除しますか？`)) return;
    team.removeFitnessSession(p.id, date);
    profiles.removeRecord(p.id, "fitnessSessions", fitnessSessionId(date));
  };

  const testName = (id: string) => tests.find((t) => t.id === id);
  const manage =
    viewer === "staff" && onManageFitnessTests ? (
      <button type="button" className="phubrowbtn" onClick={onManageFitnessTests}>
        種目を管理 ›
      </button>
    ) : null;

  return (
    <section className="phubsec" aria-label="体力">
      <HubHead title="体力" sub="新体力テストと体力測定" action={manage} />

      {hasStd && latest.n > 0 && (
        <div className="phubcard">
          <div className="phubcard-t">新体力テスト</div>
          <div className="phubsum">
            {latest.complete ? (
              <>
                合計 <b>{latest.total}</b> 点
                {grade && (
                  <>
                    {" "}
                    ・ 評価 <b>{grade}</b>（{age} 歳）
                  </>
                )}
              </>
            ) : (
              <>
                {latest.n} 種目 ・ 合計 <b>{latest.total}</b> 点
              </>
            )}
            {prev && prev.n === latest.n && (
              <span className="phubsum-d">
                前回（{fmtMD(dates[1])}）{prev.total} 点 {fmtDiff(latest.total - prev.total, 0)}
              </span>
            )}
          </div>
          <div className="phubnote">
            {latest.complete
              ? "8 種目の得点（各 1〜10 点）の合計です（80 点満点）。"
              : `8 種目そろうと総合評価（A〜E）が出ます（あと ${8 - latest.n} 種目）。`}
            持久走と 20m シャトルランはどちらか一方で採点します（両方あればシャトルラン）。
            {!profile.sex && " 性別が未設定のため、男子の得点表で採点しています（基本で設定できます）。"}
          </div>
          {latest.n >= 3 && (
            <RadarChart
              axes={FITNESS_ITEMS.map((it) => RADAR_LABEL[it.key] ?? it.label)}
              series={[
                ...(prev ? [{ label: `前回 ${fmtMD(dates[1])}`, values: scoreVals(prev) }] : []),
                { label: `最新 ${fmtMD(dates[0])}`, values: scoreVals(latest), fill: true },
              ]}
            />
          )}
        </div>
      )}

      {/* 種目ごとのカード */}
      <HubHead title="種目ごとの記録" action={null} />
      <HubAdd onClick={() => setForm({})}>測定を追加</HubAdd>
      {tests.length === 0 && rows.length === 0 ? (
        <HubEmpty
          title="体力測定の種目がまだありません"
          hint={viewer === "staff" ? "「種目を管理」から種目を追加してください。" : "スタッフが種目を登録すると記録できます。"}
        />
      ) : rows.length === 0 ? (
        <HubEmpty hint="「測定を追加」から記録します。種目ごとの推移と、新体力テストの得点・評価が出ます。" />
      ) : (
        <div className="phubfcards">
          {rows.map((r) => {
            const last = r.recs[0];
            const before = r.recs[1];
            const diff = before ? Math.round((last.value - before.value) * 100) / 100 : null;
            // 改善＝緑・悪化＝赤（lowerIsBetter を見る）。削除済みの種目は向きが分からないので色なし
            const improved =
              diff != null && diff !== 0 && !r.orphan ? (r.lowerIsBetter ? diff < 0 : diff > 0) : null;
            const score = r.standardKey ? scoreFor(r.standardKey, last.value, sex) : null;
            const timeAxis = r.unit === "秒" && Math.max(...r.recs.map((x) => x.value)) >= 60;
            const asc = [...r.recs].reverse();
            return (
              <div className="phubfcard" key={r.id}>
                <div className="phubfcard-h">
                  <b>{r.name}</b>
                  {r.standardKey && <span className="phubtag">新体力テスト</span>}
                </div>
                <div className="phubfcard-v">
                  {fmtFitnessValue(last.value, r.unit)}
                  {diff != null && (
                    <span className={`phubdiff${improved === true ? " up" : improved === false ? " down" : ""}`}>
                      {fmtDiff(diff, 2)}
                      {timeAxis ? "秒" : r.unit}
                    </span>
                  )}
                  {score != null && <span className="phubscore">得点 {score}/10</span>}
                </div>
                <div className="phubfcard-d">
                  {fmtYMD(last.date)}
                  {before && ` ・ 前回 ${fmtFitnessValue(before.value, r.unit)}（${fmtMD(before.date)}）`}
                </div>
                {r.recs.length >= 2 ? (
                  <TrendChart
                    xKind="date"
                    height={150}
                    invert={!!r.lowerIsBetter}
                    unit={timeAxis ? "" : r.unit}
                    format={timeAxis ? mmss : undefined}
                    series={[{ label: r.name, points: asc.map((x) => ({ x: x.date, y: x.value })) }]}
                  />
                ) : (
                  <div className="phubnote">2 回以上測ると推移のグラフが出ます。</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 測定回（日付ごと）。日付単位で削除できる */}
      {sessions.length > 0 && (
        <>
          <HubHead title="測定の履歴" sub="測定日ごと" action={null} />
          <div className="phublist">
            {sessions.map(([date, list]) => (
              <div className="phubsession" key={date}>
                <div className="phubsession-h">
                  <b>{fmtYMD(date)}</b>
                  {kindByDate.get(date) && <span className="phubtag">{FITNESS_SESSION_LABEL[kindByDate.get(date)!]}</span>}
                  <span>{list.length} 種目</span>
                  <HubRowBtn danger label={`${fmtYMD(date)} の測定を削除`} onClick={() => removeSession(date, list.length)}>
                    削除
                  </HubRowBtn>
                </div>
                <ul>
                  {list.map((r, i) => {
                    const t = testName(r.testId);
                    const sc = t?.standardKey ? scoreFor(t.standardKey, r.value, sex) : null;
                    return (
                      <li key={`${r.testId}-${i}`}>
                        <span>{t?.name ?? "削除済みの種目"}</span>
                        <b>{fmtFitnessValue(r.value, t?.unit ?? "")}</b>
                        {sc != null && <small>{sc}点</small>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {form && (
        <FitnessSessionForm
          tests={tests}
          existingDates={sessions.map(([d]) => d)}
          kindByDate={kindByDate}
          onClose={() => setForm(null)}
          onSave={(date, kind, list) => {
            team.addFitnessRecords(p.id, list.map((x) => ({ ...x, date })));
            // 区分は測定日ごとに 1 件。選ばなければ（または外したら）その日のメモを消す
            if (kind) profiles.setRecord(p.id, "fitnessSessions", { id: fitnessSessionId(date), date, kind });
            else profiles.removeRecord(p.id, "fitnessSessions", fitnessSessionId(date));
            setForm(null);
            board.toast(`${list.length} 種目の測定を記録しました`);
          }}
        />
      )}
    </section>
  );
}

/** 測定の追加フォーム：測定日（今日）、区分（学校の新体力テスト／クラブ測定／その他。任意のメモ）、種目ごとの入力欄（全種目を縦に並べ、空欄は保存しない） */
function FitnessSessionForm({
  tests,
  existingDates,
  kindByDate,
  onSave,
  onClose,
}: {
  tests: FitnessTest[];
  existingDates: string[];
  /** 記録済みの測定日の区分（同じ日付を選んだら、その区分を初期値にする） */
  kindByDate: Map<string, FitnessSessionKind>;
  onSave: (date: string, kind: FitnessSessionKind | null, list: { testId: string; value: number }[]) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [date, setDate] = useState(localDateStr());
  const [vals, setVals] = useState<Record<string, string>>({});
  // undefined＝まだ触っていない（日付に合わせて、記録済みの区分を初期値にする）。null＝選んでいない
  const [pickedKind, setPickedKind] = useState<FitnessSessionKind | null | undefined>(undefined);
  const kind = pickedKind === undefined ? kindByDate.get(date) ?? null : pickedKind;

  const save = () => {
    if (!date) return board.toast("測定日を入力してください");
    const list: { testId: string; value: number }[] = [];
    for (const t of tests) {
      const raw = vals[t.id] ?? "";
      if (raw.trim() === "") continue;
      const v = parseValue(raw, t.unit === "秒");
      if (v == null || v <= 0) return board.toast(`${t.name} の記録を数値で入力してください`);
      list.push({ testId: t.id, value: Math.round(v * 100) / 100 });
    }
    if (list.length === 0) return board.toast("1 つ以上の種目を入力してください");
    onSave(date, kind, list);
  };

  return (
    <HubSheet title="測定を追加" onClose={onClose}>
      <Field
        label="測定日"
        hint={existingDates.includes(date) ? "この日付の記録があります。入力した種目は上書きされます。" : undefined}
      >
        <input aria-label="測定日" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="区分" hint="記録のメモです（得点には影響しません）。">
        <Seg<FitnessSessionKind>
          ariaLabel="区分"
          allowClear
          value={kind}
          onChange={setPickedKind}
          options={FITNESS_SESSION_KINDS.map((k) => ({ value: k, label: FITNESS_SESSION_LABEL[k] }))}
        />
      </Field>
      {tests.length === 0 ? (
        <div className="phubnote">体力測定の種目がありません。先に「種目を管理」から追加してください。</div>
      ) : (
        tests.map((t) => {
          const time = t.unit === "秒";
          return (
            <Field
              key={t.id}
              label={`${t.name}（${t.unit}）`}
              hint={time && t.standardKey === "endurance" ? "秒で入力（例: 3分45秒 → 225 または 3:45）" : undefined}
            >
              <input
                aria-label={t.name}
                value={vals[t.id] ?? ""}
                inputMode="decimal"
                placeholder="測っていなければ空欄"
                onChange={(e) =>
                  setVals((cur) => ({
                    ...cur,
                    [t.id]: e.target.value.replace(time ? /[^0-9.:]/g : /[^0-9.]/g, "").slice(0, 8),
                  }))
                }
              />
            </Field>
          );
        })
      )}
      <SheetSave onClick={save} />
    </HubSheet>
  );
}
