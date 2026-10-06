"use client";

import type { SchoolStage } from "@/lib/types";
import type { MatchupFilter } from "@/lib/matchup";
import { defaultMatchupFilter, isDefaultMatchupFilter, matchupAgeOptions } from "@/lib/matchup";

/**
 * 練習試合の絞り込み（specs/matchup-demo.md §4-1）。PC は左の列（.mtside。compact）、スマホは下からのシートの中身。
 * 見た目と構造は TeamHub の CalFilterPanel と同じクラス（.calfilterpanel-sec／-sech／-all／-row、.calchk）を使い、
 * 距離・人数制・日程は丸（ラジオ風）、年代は四角（チェック）、会場はトグル。
 */

const DISTANCES: { v: MatchupFilter["distance"]; label: string }[] = [
  { v: 10, label: "10km 以内" },
  { v: 30, label: "30km 以内" },
  { v: 50, label: "50km 以内" },
  { v: 0, label: "指定なし" },
];
const FORMATS: { v: MatchupFilter["format"]; label: string }[] = [
  { v: 8, label: "8 人制" },
  { v: 11, label: "11 人制" },
  { v: 0, label: "どちらも" },
];
const WHENS: { v: MatchupFilter["when"]; label: string }[] = [
  { v: "weekend", label: "今週末" },
  { v: "month", label: "今月" },
  { v: "next", label: "来月" },
  { v: "all", label: "すべて" },
];

/** 1 行（丸＝1 つだけ選ぶ／四角＝いくつでも選ぶ）。calfilterpanel-row と同じくキーボード（Enter／Space）でも操作できる */
function Row({
  on,
  kind,
  label,
  onSelect,
}: {
  on: boolean;
  kind: "radio" | "check";
  label: string;
  onSelect: () => void;
}) {
  return (
    <div
      className="calfilterpanel-row"
      role={kind === "radio" ? "radio" : "checkbox"}
      aria-checked={on}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className={`calchk mtc ${kind === "radio" ? "rd" : "sq"}${on ? " on" : ""}`} />
      <span>{label}</span>
    </div>
  );
}

export function FindPanel({
  filter,
  setFilter,
  stage,
  compact,
  onClose,
}: {
  filter: MatchupFilter;
  setFilter: (f: MatchupFilter) => void;
  stage: SchoolStage;
  /** true=PC の常設の列（見出し行・完了ボタンを出さない） */
  compact?: boolean;
  /** スマホのシートを閉じる（見出し行の「完了」用） */
  onClose?: () => void;
}) {
  const ages = matchupAgeOptions(stage);
  const allAges = ages.every((a) => filter.ageGroups.includes(a));
  // 年代は空にしない：最後の 1 つを外したら全部にチェックを戻す
  const toggleAge = (a: string) => {
    if (!filter.ageGroups.includes(a)) return setFilter({ ...filter, ageGroups: [...filter.ageGroups, a] });
    const rest = filter.ageGroups.filter((x) => x !== a);
    setFilter({ ...filter, ageGroups: rest.some((x) => ages.includes(x)) ? rest : ages });
  };

  return (
    <div className={`calfilterpanel mtpanel${compact ? " compact" : ""}`}>
      {!compact && (
        <div className="calfilterpanel-head">
          <b>絞り込み</b>
          <button type="button" onClick={onClose}>
            完了
          </button>
        </div>
      )}

      <div className="calfilterpanel-sec" role="radiogroup" aria-label="距離">
        <div className="calfilterpanel-sech">
          <b>距離</b>
        </div>
        {DISTANCES.map((d) => (
          <Row key={d.v} on={filter.distance === d.v} kind="radio" label={d.label} onSelect={() => setFilter({ ...filter, distance: d.v })} />
        ))}
      </div>

      <div className="calfilterpanel-sec" role="group" aria-label="年代">
        <div className="calfilterpanel-sech">
          <b>年代</b>
          {!allAges && (
            <button type="button" className="calfilterpanel-all" onClick={() => setFilter({ ...filter, ageGroups: ages })}>
              すべて選択
            </button>
          )}
        </div>
        {ages.map((a) => (
          <Row key={a} on={filter.ageGroups.includes(a)} kind="check" label={a} onSelect={() => toggleAge(a)} />
        ))}
      </div>

      <div className="calfilterpanel-sec" role="radiogroup" aria-label="人数制">
        <div className="calfilterpanel-sech">
          <b>人数制</b>
        </div>
        {FORMATS.map((f) => (
          <Row key={f.v} on={filter.format === f.v} kind="radio" label={f.label} onSelect={() => setFilter({ ...filter, format: f.v })} />
        ))}
      </div>

      <div className="calfilterpanel-sec" role="radiogroup" aria-label="日程">
        <div className="calfilterpanel-sech">
          <b>日程</b>
        </div>
        {WHENS.map((w) => (
          <Row key={w.v} on={filter.when === w.v} kind="radio" label={w.label} onSelect={() => setFilter({ ...filter, when: w.v })} />
        ))}
      </div>

      <div className="calfilterpanel-sec">
        <div className="calfilterpanel-sech">
          <b>会場</b>
        </div>
        <label className="calfilter-toggle mtvenue">
          <input
            type="checkbox"
            checked={filter.venueOnly}
            onChange={(e) => setFilter({ ...filter, venueOnly: e.target.checked })}
          />
          <span />
          相手の会場で開ける募集だけ
        </label>
      </div>

      {!isDefaultMatchupFilter(filter, stage) && (
        <button type="button" className="calfilterpanel-manage" onClick={() => setFilter(defaultMatchupFilter(stage))}>
          条件をもどす
        </button>
      )}
    </div>
  );
}
