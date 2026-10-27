"use client";

import { useState } from "react";
import { AUTHOR_ROLES, ARTICLE_TAGS_SUGGEST, LICENSES, REGIONS } from "@/lib/coachlab";
import type { License } from "@/lib/coachlab";
import { Row } from "../matchup/FindPanel";

/**
 * コーチラボ「探す」の絞り込み（ux-fix R2-5）。検索欄の下には「記事｜指導者」の切替と種類のチップ 1 行だけを置き、
 * 価格・対象・ハッシュタグ・並び替え（指導者のときは資格・地域・役割）はここに集める。
 * スマホ＝ヘッダー右の絞り込みボタン → Sheet、PC＝左の 184px の列（.clside）。見た目は練習試合の FindPanel／
 * カレンダーの CalFilterPanel と同じ（.calfilterpanel-*、丸＝1 つだけ選ぶ／四角＝いくつでも選ぶ）。
 * 状態は CoachLabScreen が持つ（ヘッダーのボタン・シート・一覧が同じ状態を見るため）。
 */

export type ArticleSort = "new" | "likes" | "purchases";
export type PriceFilter = "all" | "free" | "paid";
export type AudienceFilter = "all" | "coach" | "parent" | "player";
export type ExploreMode = "articles" | "authors";

export interface ClExplore {
  mode: ExploreMode;
  setMode: (m: ExploreMode) => void;
  q: string;
  setQ: (v: string) => void;
  cat: string;
  setCat: (v: string) => void;
  price: PriceFilter;
  setPrice: (v: PriceFilter) => void;
  audience: AudienceFilter;
  setAudience: (v: AudienceFilter) => void;
  tags: string[];
  toggleTag: (t: string) => void;
  clearTags: () => void;
  sort: ArticleSort;
  setSort: (v: ArticleSort) => void;
  license: License | "";
  setLicense: (v: License | "") => void;
  region: string;
  setRegion: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  /** 今のモードで、絞り込みパネルの条件が何か掛かっているか（種類のチップと検索語は含めない） */
  active: boolean;
  /** 今のモードの絞り込みパネルの条件をもどす */
  reset: () => void;
}

export function useClExplore(): ClExplore {
  const [mode, setMode] = useState<ExploreMode>("articles");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [price, setPrice] = useState<PriceFilter>("all");
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<ArticleSort>("new");
  const [license, setLicense] = useState<License | "">("");
  const [region, setRegion] = useState("");
  const [role, setRole] = useState("");

  const active =
    mode === "articles"
      ? price !== "all" || audience !== "all" || tags.length > 0 || sort !== "new"
      : !!license || !!region || !!role;
  const reset = () => {
    if (mode === "articles") {
      setPrice("all");
      setAudience("all");
      setTags([]);
      setSort("new");
    } else {
      setLicense("");
      setRegion("");
      setRole("");
    }
  };
  return {
    mode, setMode, q, setQ, cat, setCat, price, setPrice, audience, setAudience,
    tags, toggleTag: (t) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])),
    clearTags: () => setTags([]),
    sort, setSort, license, setLicense, region, setRegion, role, setRole, active, reset,
  };
}

const PRICES: { v: PriceFilter; label: string }[] = [
  { v: "all", label: "すべて" },
  { v: "free", label: "無料" },
  { v: "paid", label: "有料" },
];
const AUDIENCES: { v: AudienceFilter; label: string }[] = [
  { v: "all", label: "すべて" },
  { v: "coach", label: "指導者向け" },
  { v: "parent", label: "保護者向け" },
  { v: "player", label: "選手向け" },
];
const SORTS: { v: ArticleSort; label: string }[] = [
  { v: "new", label: "新着" },
  { v: "likes", label: "参考になった数" },
  { v: "purchases", label: "購入数" },
];

/** 一覧の上の 1 行に出す「選んだ条件」。何も選んでいなければ空文字（行を出さない） */
export function clFilterLine(f: ClExplore): string {
  const parts: string[] = [];
  if (f.mode === "articles") {
    if (f.price !== "all") parts.push(PRICES.find((x) => x.v === f.price)?.label ?? "");
    if (f.audience !== "all") parts.push(AUDIENCES.find((x) => x.v === f.audience)?.label ?? "");
    f.tags.forEach((t) => parts.push(`#${t}`));
    if (f.sort !== "new") parts.push(`${SORTS.find((x) => x.v === f.sort)?.label ?? ""}順`);
  } else {
    if (f.license) parts.push(f.license);
    if (f.region) parts.push(f.region);
    if (f.role) parts.push(f.role);
  }
  return parts.join("・");
}

export function ClFilterPanel({
  f,
  compact,
  onClose,
}: {
  f: ClExplore;
  /** true=PC の常設の列（見出し行・完了ボタンを出さない） */
  compact?: boolean;
  /** スマホのシートを閉じる（見出し行の「完了」用） */
  onClose?: () => void;
}) {
  return (
    <div className={`calfilterpanel clpanel${compact ? " compact" : ""}`}>
      {!compact && (
        <div className="calfilterpanel-head">
          <b>絞り込み</b>
          <button type="button" onClick={onClose}>
            完了
          </button>
        </div>
      )}

      {f.mode === "articles" ? (
        <>
          <div className="calfilterpanel-sec" role="radiogroup" aria-label="価格">
            <div className="calfilterpanel-sech">
              <b>価格</b>
            </div>
            {PRICES.map((x) => (
              <Row key={x.v} on={f.price === x.v} kind="radio" label={x.label} onSelect={() => f.setPrice(x.v)} />
            ))}
          </div>
          <div className="calfilterpanel-sec" role="radiogroup" aria-label="対象">
            <div className="calfilterpanel-sech">
              <b>対象</b>
            </div>
            {AUDIENCES.map((x) => (
              <Row key={x.v} on={f.audience === x.v} kind="radio" label={x.label} onSelect={() => f.setAudience(x.v)} />
            ))}
          </div>
          <div className="calfilterpanel-sec" role="group" aria-label="ハッシュタグ">
            <div className="calfilterpanel-sech">
              <b>ハッシュタグ</b>
              {/* ux-fix R3-2: 四角のチェックの所は見出しの右に「すべて解除」（選んでいるときだけ） */}
              {f.tags.length > 0 && (
                <button type="button" className="calfilterpanel-all" onClick={f.clearTags}>
                  すべて解除
                </button>
              )}
            </div>
            {ARTICLE_TAGS_SUGGEST.map((t) => (
              <Row key={t} on={f.tags.includes(t)} kind="check" label={`#${t}`} onSelect={() => f.toggleTag(t)} />
            ))}
          </div>
          <div className="calfilterpanel-sec" role="radiogroup" aria-label="並び替え">
            <div className="calfilterpanel-sech">
              <b>並び替え</b>
            </div>
            {SORTS.map((x) => (
              <Row key={x.v} on={f.sort === x.v} kind="radio" label={x.label} onSelect={() => f.setSort(x.v)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="calfilterpanel-sec">
            <div className="calfilterpanel-sech">
              <b>資格</b>
            </div>
            <select
              className="st-input clpanel-select"
              aria-label="資格"
              value={f.license}
              onChange={(e) => f.setLicense(e.target.value as License | "")}
            >
              <option value="">すべて</option>
              {LICENSES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="calfilterpanel-sec">
            <div className="calfilterpanel-sech">
              <b>地域</b>
            </div>
            <select
              className="st-input clpanel-select"
              aria-label="地域"
              value={f.region}
              onChange={(e) => f.setRegion(e.target.value)}
            >
              <option value="">すべて</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="calfilterpanel-sec">
            <div className="calfilterpanel-sech">
              <b>役割</b>
            </div>
            <select
              className="st-input clpanel-select"
              aria-label="役割"
              value={f.role}
              onChange={(e) => f.setRole(e.target.value)}
            >
              <option value="">すべて</option>
              {AUTHOR_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {f.active && (
        <button type="button" className="calfilterpanel-manage" onClick={f.reset}>
          条件をもどす
        </button>
      )}
    </div>
  );
}
