"use client";

import React, { useEffect, useRef, useState } from "react";
import { STAGE_GRADES, gradeLabel } from "@/lib/types";
import type { DominantFoot } from "@/lib/types";
import { ageFromGrade, ageOnApril1 } from "@/lib/profile";
import { groupOf } from "@/lib/formations";
import { playerSeasonStats } from "@/lib/playerStats";
import { perPlayerAttendance } from "@/lib/attendanceStats";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useProfiles } from "./ProfileProvider";
import { IconEdit } from "./icons";
import { useWidth } from "./ProfileCharts";
import { HUB_SECTIONS, HubEmpty, customGroupsOf, usePc } from "./hub/common";
import type { HubSection, HubSectionProps, HubViewer } from "./hub/common";
import { HubSheet } from "./hub/common";
import { PlayerBasicForm } from "./hub/PlayerBasicForm";
import OverviewSection from "./hub/OverviewSection";
import GrowthSection from "./hub/GrowthSection";
import FitnessSection from "./hub/FitnessSection";
import InjuriesSection from "./hub/InjuriesSection";
import ExamsSection from "./hub/ExamsSection";
import GradesSection from "./hub/GradesSection";
import CareerSection from "./hub/CareerSection";
import ActivitySection from "./hub/ActivitySection";
import ReportSection from "./hub/ReportSection";

/**
 * 選手の個人ページ（ハブ。specs/player-hub.md §3）。1 人の選手の全データを、ページ内メニュー（セクション）で
 * 切り替えて見る・編集する部品。スタッフの名簿（PC 右ペイン／スマホの全画面）と選手側の「プロフィール」画面で
 * 同じ部品を使う。
 *
 * - nav="inline"：ハブ自身がメニューを持つ（PC＝左の縦メニュー .phubnav、スマホ＝ヘッダー下の横スクロールの
 *   チップ列 .phubtabs）。nav="external"：メニューは描かず、section/onSection で親（PC レールのサブナビ）が切り替える。
 * - 幅が狭いとき（§3・第 5 段の修正）：名簿の 3 列（絞り込み 220｜一覧 300｜個人ページ）は 1024〜1300px 台で個人ページが
 *   250〜500px になり、縦メニュー 160px を置くと本文が潰れる。ハブ自身の幅を測り（ProfileCharts の useWidth）、
 *   NARROW_ON 未満なら PC でも縦メニューをやめてチップ列にし、ルートに .narrow を付ける（KPI・数値カードを 2 列などに。
 *   CSS は PC ブロック末尾「mobile-redesign PC reset」の .phub.narrow）。
 * - 最後に開いたセクションは state（保存しない）。
 * - 右上の小さな IconEdit ボタンで基本情報のフォーム（PlayerBasicForm）を開く。onEditBasic があれば親に任せる
 *   （TeamHub の playerForm シートなど）、無ければハブ自身のシート（.phubsheet）で開く。
 *
 * セクションの追加方法：components/hub/XxxSection.tsx に default export の
 * `(props: HubSectionProps) => JSX` を書き、下の SECTION_VIEWS の該当キーへ置く。
 */

export interface PlayerHubProps {
  playerId: string;
  viewer: HubViewer;
  /** "inline"＝ハブがメニューを持つ／"external"＝親がメニューを持つ（section/onSection で制御） */
  nav?: "inline" | "external";
  section?: HubSection;
  onSection?: (s: HubSection) => void;
  /** 編集ボタンを親が処理する（無ければハブ内のシートで PlayerBasicForm を開く） */
  onEditBasic?: () => void;
  /** 選手を削除したとき（親が選択を外す） */
  onDeleted?: () => void;
  /** 「種目を管理 ›」（スタッフの名簿だけ。TeamHub の fitnessTests シートを開く） */
  onManageFitnessTests?: () => void;
  /** 基本情報フォームのグループ欄の「＋ 管理」 */
  onManageGroups?: () => void;
}

/** ハブの幅がこれ未満なら「狭い」（縦メニューをやめてチップ列に。NARROW_OFF 以上に戻るまで続ける＝境目での行き来を防ぐ） */
const NARROW_ON = 560;
const NARROW_OFF = 580;

const SECTION_VIEWS: Record<HubSection, React.ComponentType<HubSectionProps>> = {
  overview: OverviewSection,
  growth: GrowthSection,
  fitness: FitnessSection,
  exams: ExamsSection,
  grades: GradesSection,
  career: CareerSection,
  injuries: InjuriesSection,
  activity: ActivitySection,
  report: ReportSection,
};

/** いちばん近いスクロールする祖先（セクション切替でスクロール位置を戻すのに使う） */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function footLabel(f?: DominantFoot): string {
  return f === "right" ? "右足" : f === "left" ? "左足" : f === "both" ? "両足" : "";
}

export default function PlayerHub({
  playerId,
  viewer,
  nav = "inline",
  section,
  onSection,
  onEditBasic,
  onDeleted,
  onManageFitnessTests,
  onManageGroups,
}: PlayerHubProps) {
  const board = useBoard();
  const team = useTeam();
  const profiles = useProfiles();
  const pc = usePc();
  const [innerSec, setInnerSec] = useState<HubSection>("overview");
  const [editing, setEditing] = useState(false);
  const [rootRef, rootW] = useWidth<HTMLDivElement>(NARROW_OFF);
  const narrowRef = useRef(false);
  narrowRef.current = narrowRef.current ? rootW < NARROW_OFF : rootW < NARROW_ON;
  const narrow = narrowRef.current;
  const headRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const sec = section ?? innerSec;
  const go = (s: HubSection) => (onSection ? onSection(s) : setInnerSec(s));
  const inline = nav === "inline";
  // メニューの形：スマホと、PC でもハブが狭いとき（narrow）は横スクロールのチップ列、広い PC は左の縦メニュー
  const chips = inline && (!pc || narrow);
  const sideNav = inline && !chips;

  // セクションを切り替えたらスクロールを戻す。チップ列は上に貼り付くので、ヘッダーカードの下端までだけ戻し
  // （新しいセクションの先頭がチップ列の直下に来る）、縦メニューのときは先頭へ戻す
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const sc = scrollParent(rootRef.current);
    if (!sc) return;
    if (chips && headRef.current) {
      const top = headRef.current.getBoundingClientRect().bottom - sc.getBoundingClientRect().top + sc.scrollTop;
      if (sc.scrollTop > top) sc.scrollTop = top;
    } else {
      sc.scrollTop = 0;
    }
  }, [sec, chips, rootRef]);

  // KPI のマス・「シーズンレポートを見る ›」など、チップを押さずに切り替えたときも、選んだチップが横スクロールの
  // 見える範囲に入るようにする（縦には動かさない。player-hub §3）
  useEffect(() => {
    const row = rootRef.current?.querySelector<HTMLElement>(".phubtabs");
    const on = row?.querySelector<HTMLElement>("button.on");
    if (!row || !on) return;
    const r = row.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    if (b.left < r.left) row.scrollLeft -= r.left - b.left + 16;
    else if (b.right > r.right) row.scrollLeft += b.right - r.right + 16;
  }, [sec, chips, rootRef]);

  const p = board.state.players.find((x) => x.id === playerId);
  if (!p) {
    return (
      <div className="phub" ref={rootRef}>
        <HubEmpty title="この選手は見つかりません" />
      </div>
    );
  }

  const stage = team.team.schoolStage ?? "elementary";
  const profile = profiles.get(p.id);
  // 年齢（4/1 時点）：生年月日があればそれを優先、無ければ学年から
  const age = ageOnApril1(profile.birthDate) ?? ageFromGrade(stage, p.grade);
  const isCaptain = board.state.captain === p.id;
  const groups = customGroupsOf(p, team.groups);

  // 4 マスの KPI（§3-1）：身長・体重（最新の成長記録。無ければ Player の値）／今季 出場・得点／出席率／ノート提出
  const ms = [...profile.measurements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.updatedAt - b.updatedAt));
  const curH = [...ms].reverse().find((m) => m.height != null)?.height ?? p.height ?? null;
  const curW = [...ms].reverse().find((m) => m.weight != null)?.weight ?? p.weight ?? null;
  const stats = playerSeasonStats(p.id, team.team.matches, board.notebook);
  const att = perPlayerAttendance(team.team, [p], "all")[0];
  const noteCount = board.notebook.filter((n) => n.playerId === p.id).length;

  const View = SECTION_VIEWS[sec];
  const sectionProps: HubSectionProps = { p, profile, viewer, stage, age, go, onManageFitnessTests };

  const tabBtn = (s: { key: HubSection; label: string }) => (
    <button
      key={s.key}
      type="button"
      role="tab"
      aria-selected={sec === s.key}
      className={sec === s.key ? "on" : ""}
      onClick={() => go(s.key)}
    >
      {s.label}
    </button>
  );

  return (
    <div className={`phub${narrow ? " narrow" : ""}`} ref={rootRef}>
      {/* §3-1 ヘッダーカード */}
      {/* <header> 要素は画面全体のヘッダー用の指定（header{display:flex…}）が掛かるので div にする */}
      <div className="phubhead" ref={headRef}>
        <div className="phubhead-top">
          <div className="phubid">
            <span className={`phubpos ${groupOf(p.position)}`}>{p.position}</span>
            {p.number != null && <span className="phubno">#{p.number}</span>}
          </div>
          <div className="phubwho">
            <h2 className="phubname">
              {p.name}
              {isCaptain && <span className="phubcap">(C)</span>}
            </h2>
            <div className="phubsub">
              {p.grade != null && STAGE_GRADES[stage].includes(p.grade) && <span>{gradeLabel(stage, p.grade)}</span>}
              {groups.length > 0 && (
                <span className="phubgroups">
                  {groups.slice(0, 2).map((g) => (
                    <span key={g.id} className="phubgroup">
                      {g.label}
                    </span>
                  ))}
                  {groups.length > 2 && <span className="phubgroup more">+{groups.length - 2}</span>}
                </span>
              )}
              {footLabel(p.dominantFoot) && <span>利き足 {footLabel(p.dominantFoot)}</span>}
            </div>
          </div>
          <button
            type="button"
            className="phubedit"
            aria-label="基本情報を編集"
            title="基本情報を編集"
            onClick={() => (onEditBasic ? onEditBasic() : setEditing(true))}
          >
            <IconEdit />
          </button>
        </div>
        <div className="phubkpi">
          <button type="button" className="phubkpi-item" onClick={() => go("growth")}>
            <span className="v">
              {curH ?? "—"}
              <small>cm</small> / {curW ?? "—"}
              <small>kg</small>
            </span>
            <span className="l">身長・体重</span>
          </button>
          <button type="button" className="phubkpi-item" onClick={() => go("activity")}>
            <span className="v">
              {stats.apps}
              <small>試合</small> / {stats.goals}
              <small>点</small>
            </span>
            <span className="l">今季 出場・得点</span>
          </button>
          <button type="button" className="phubkpi-item" onClick={() => go("activity")}>
            <span className="v">{att && att.recorded > 0 ? `${att.pct}%` : "—"}</span>
            <span className="l">出席率</span>
          </button>
          <button type="button" className="phubkpi-item" onClick={() => go("activity")}>
            <span className="v">
              {noteCount}
              <small>件</small>
            </span>
            <span className="l">ノート提出</span>
          </button>
        </div>
      </div>

      {/* スマホ・狭い PC：ヘッダーカードの下の横スクロールのチップ列（44px） */}
      {chips && (
        <div className="phubtabs" role="tablist" aria-label="セクション">
          {HUB_SECTIONS.map(tabBtn)}
        </div>
      )}

      <div className={`phubbody${sideNav ? " withnav" : ""}`}>
        {/* 広い PC：左の縦メニュー（160px） */}
        {sideNav && (
          <nav className="phubnav" role="tablist" aria-orientation="vertical" aria-label="セクション">
            {HUB_SECTIONS.map(tabBtn)}
          </nav>
        )}
        {/* key でセクションごとに作り直す（開いていたフォームのシートを持ち越さない） */}
        <div className="phubmain" role="tabpanel" key={sec}>
          <View {...sectionProps} />
        </div>
      </div>

      {editing && (
        <HubSheet title="基本情報を編集" onClose={() => setEditing(false)}>
          <PlayerBasicForm
            player={p}
            viewer={viewer}
            onDone={() => setEditing(false)}
            onDeleted={onDeleted}
            onManageGroups={onManageGroups}
          />
        </HubSheet>
      )}
    </div>
  );
}
