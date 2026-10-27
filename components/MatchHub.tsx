"use client";

import React, { useEffect, useRef, useState } from "react";
import { GOAL_ORIGIN_LABELS } from "@/lib/types";
import type { MatchRecord, Player } from "@/lib/types";
import { matchTargetLabel } from "@/lib/groups";
import { eventOfMatch } from "@/lib/matchEvents";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { IconEdit } from "./icons";
import { useWidth } from "./ProfileCharts";
import { HubEmpty, HubHead, usePc, useTabRowMore } from "./hub/common";

/**
 * 試合の詳細（p14 §5。specs/filter-compact-and-match-hub.md）。名簿の個人ページ（PlayerHub）と同じ骨格・同じ
 * クラス（.phub*）で組む：ヘッダーカード（勝敗・スコア・相手・日付・大会・対象・試合時間）＋ページ内メニュー
 * （基本／得点・失点／メンバー）＋本文。PC のスタッフは右ペイン（RecMatchPane）、スマホ・PC の選手は全画面／差し替え表示で使う。
 *
 * - メニューの形・狭いときの扱い・セクション切替時のスクロール戻しは PlayerHub と同じ（useWidth・NARROW_ON/OFF）。
 * - section/onSection を渡すと親が選択を持つ（無ければ内部 state。保存しない）。
 * - 試合の編集は onEdit（親が試合記録フォームのシートを開く）。削除は編集フォームの一番下（ux-fix R3-5）。
 *   記録が無くなったら（削除した・見つからない）onDeleted を呼んで一覧へ戻す。
 * - ヘッダーは「勝敗バッジ｜相手名・日付・大会・対象｜スコア（一覧と同じ .mscore）｜鉛筆」。基本情報はヘッダーと重ならない
 *   行（試合時間・フォーメーション・試合会場）だけ。会場が空のスタッフは「会場を追加」の入力。
 */

export type MatchHubSection = "overview" | "goals" | "members";

const MATCH_SECTIONS: { key: MatchHubSection; label: string }[] = [
  { key: "overview", label: "基本" },
  { key: "goals", label: "得点・失点" },
  { key: "members", label: "メンバー" },
];

/** ハブの幅がこれ未満なら「狭い」（PlayerHub と同じ値。NARROW_OFF 以上に戻るまで続ける） */
const NARROW_ON = 560;
const NARROW_OFF = 580;

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → "M/D(曜)" */
function fmtMDW(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return `${mo}/${d}(${WD[new Date(Number(m[1]), mo - 1, d).getDay()]})`;
}

/** 試合時間の表示（TeamHub の halfLabel と同じ式。例: 「20分ハーフ」／1 本(periods===1)は「40分」） */
function halfLabel(m: { halfMinutes?: number; periods?: 1 | 2 }): string | null {
  if (!m.halfMinutes) return null;
  return `${m.halfMinutes}分${m.periods === 1 ? "" : "ハーフ"}`;
}

/** いちばん近いスクロールする祖先（セクション切替でスクロール位置を戻すのに使う。PlayerHub と同じ） */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** 試合会場が空のときの入力（「会場を追加」。入力欄を離れる・Enter で保存。空のままなら何もしない） */
function PlaceAdd({ onSave }: { onSave: (v: string) => void }) {
  const [v, setV] = useState("");
  const commit = () => {
    const t = v.trim();
    if (t) onSave(t);
  };
  return (
    <input
      className="st-input mhub-placeadd"
      value={v}
      placeholder="会場を追加"
      aria-label="会場を追加"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function MatchHub({
  matchId,
  players,
  canEdit,
  onEdit,
  onDeleted,
  section,
  onSection,
  onOpenPlayer,
}: {
  matchId: string;
  players: Player[];
  /** スタッフ表示か（鉛筆・削除・選手行のリンクを出す） */
  canEdit: boolean;
  onEdit: () => void;
  /** 削除後に呼ぶ（一覧へ戻す） */
  onDeleted: () => void;
  section?: MatchHubSection;
  onSection?: (s: MatchHubSection) => void;
  /** 先発の行から選手の個人ページを開く（レビュー nav-1: スマホは呼び出し側が戻り先を覚える）。未指定は teamIntent */
  onOpenPlayer?: (playerId: string) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const pc = usePc();
  const [innerSec, setInnerSec] = useState<MatchHubSection>("overview");
  const [rootRef, rootW] = useWidth<HTMLDivElement>(NARROW_OFF);
  const narrowRef = useRef(false);
  narrowRef.current = narrowRef.current ? rootW < NARROW_OFF : rootW < NARROW_ON;
  const narrow = narrowRef.current;
  const headRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const sec = section ?? innerSec;
  const go = (s: MatchHubSection) => (onSection ? onSection(s) : setInnerSec(s));
  // メニューの形：スマホと、PC でもハブが狭いとき（narrow）は横スクロールのチップ列、広い PC は左の縦メニュー
  const chips = !pc || narrow;
  const sideNav = !chips;

  // セクションを切り替えたらスクロールを戻す（PlayerHub と同じ。チップ列はヘッダーカードの下端まで、縦メニューは先頭へ）
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

  // 切り替えたとき、選んだチップが横スクロールの見える範囲に入るようにする
  useEffect(() => {
    const row = rootRef.current?.querySelector<HTMLElement>(".phubtabs");
    const on = row?.querySelector<HTMLElement>("button.on");
    if (!row || !on) return;
    const r = row.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    if (b.left < r.left) row.scrollLeft -= r.left - b.left + 16;
    // 右は 28px のフェード＋8px の間（.phubtabs.more）のぶんまで寄せる（最後のチップがフェードに掛からない）
    else if (b.right > r.right) row.scrollLeft += b.right - r.right + 36;
  }, [sec, chips, rootRef]);
  const tabsMore = useTabRowMore(rootRef, [sec, chips, narrow]);

  const m: MatchRecord | undefined = team.team.matches.find((x) => x.id === matchId);
  // 記録が無くなったら（編集フォームで削除した・古い ID）、親に一覧へ戻してもらう
  const missing = !m;
  useEffect(() => {
    if (missing) onDeleted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);
  if (!m) {
    return (
      <div className="phub mhub" ref={rootRef}>
        <HubEmpty title="この試合記録は見つかりません" />
      </div>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";
  const comps = team.team.competitions;
  const compName: string | null = m.competitionId
    ? comps.find((c) => c.id === m.competitionId)?.name ?? "（削除された大会）"
    : m.competition || null;
  const win = m.ourScore > m.theirScore;
  const draw = m.ourScore === m.theirScore;
  const resCls = win ? "w" : draw ? "d" : "l";
  const resLabel = win ? "勝" : draw ? "分" : "敗";
  const half = halfLabel(m);
  // 対象グループ（全体＝グループ未設定・解決できるものが無い）。一覧のバッジと同じ matchTargetLabel で判定する
  const targeted = team.groups.length > 0 && matchTargetLabel(m, team.groups) !== "全体";
  const targetGroups = targeted
    ? (m.groupIds ?? []).map((id) => team.groups.find((g) => g.id === id)).filter((g): g is NonNullable<typeof g> => !!g)
    : [];

  // p15 §5: 試合会場。記録の値が無ければ、紐づくカレンダーの予定の場所
  const placeText = m.place ?? eventOfMatch(m, team.team.events)?.place ?? "";
  const lineup = m.lineup ?? [];
  const conceded = m.conceded ?? [];

  const tabBtn = (s: { key: MatchHubSection; label: string }) => (
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

  const groupPills = (
    <span className="phubgroups">
      {targetGroups.map((g) => (
        <span key={g.id} className="phubgroup">
          {g.label}
        </span>
      ))}
    </span>
  );

  const overview = (
    <section className="phubsec" aria-label="基本">
      <HubHead title="基本情報" />
      <dl className="phubkv">
        {(
          [
            { k: "試合時間", v: half ?? "" },
            { k: "フォーメーション", v: m.formation ?? "" },
            // 会場が空のスタッフは、その場で書ける入力（離れたら保存）。選手・保護者は空なら行ごと出さない
            { k: "試合会場", v: placeText || (canEdit ? <PlaceAdd key={m.id} onSave={(v) => team.updateMatch({ ...m, place: v })} /> : null) },
          ] as { k: string; v: React.ReactNode }[]
        )
          .filter((r) => r.v !== null)
          .map((r) => (
            <div className="phubkv-row" key={r.k}>
              <dt>{r.k}</dt>
              <dd>{r.v === "" ? <span className="phubkv-empty">—</span> : r.v}</dd>
            </div>
          ))}
      </dl>
      <HubHead title="メモ" />
      <div className="phubcard">
        {m.note ? <div className="phubmemo">{m.note}</div> : <div className="phubkv-empty">未入力です。</div>}
      </div>
    </section>
  );

  const goals = (
    <section className="phubsec" aria-label="得点・失点">
      <HubHead title="得点" sub={`${m.goals.length} 件`} />
      {m.goals.length === 0 ? (
        <HubEmpty compact title="得点の記録がありません" />
      ) : (
        <div className="phublist">
          {m.goals.map((g, i) => {
            const sub = [
              g.assistPlayerId ? `アシスト ${nameOf(g.assistPlayerId)}` : null,
              g.origin ? GOAL_ORIGIN_LABELS[g.origin] : null,
            ]
              .filter(Boolean)
              .join(" ・ ");
            return (
              <div className="phubrow" key={i}>
                <div className="phubrow-main">
                  <b>
                    {g.minute != null ? `${g.minute}' ` : ""}
                    {nameOf(g.playerId)}
                  </b>
                  {sub && <span>{sub}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <HubHead title="失点" sub={`${conceded.length} 件`} />
      {conceded.length === 0 ? (
        <HubEmpty compact title={m.theirScore > 0 ? "失点の記録がありません" : "無失点です"} />
      ) : (
        <div className="phublist">
          {conceded.map((c, i) => (
            <div className="phubrow" key={i}>
              <div className="phubrow-main">
                <b>{c.minute != null ? `${c.minute}'` : "—"}</b>
                <span>{c.origin ? GOAL_ORIGIN_LABELS[c.origin] : "形は未記録"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const members = (
    <section className="phubsec" aria-label="メンバー">
      <HubHead title="先発" sub={m.formation} />
      {lineup.length === 0 ? (
        <HubEmpty compact title="先発の記録がありません" />
      ) : (
        <div className="phublist">
          {lineup.map((l, i) =>
            // スタッフは名簿の個人ページへ（TeamHub の teamIntent と同じ経路）。
            // レビュー mhub-1: 名簿から削除済みの選手（名前が「—」）の行はリンクにしない
            canEdit && players.some((p) => p.id === l.playerId) ? (
              <button
                type="button"
                className="phubrow"
                key={i}
                onClick={() =>
                  onOpenPlayer ? onOpenPlayer(l.playerId) : board.setTeamIntent({ tab: "ros", playerId: l.playerId })
                }
              >
                <div className="phubrow-main">
                  <b>{nameOf(l.playerId)}</b>
                  <span>{l.pos}</span>
                </div>
                <span className="phubrow-st" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
              <div className="phubrow" key={i}>
                <div className="phubrow-main">
                  <b>{nameOf(l.playerId)}</b>
                  <span>{l.pos}</span>
                </div>
              </div>
            )
          )}
        </div>
      )}
      <HubHead title="交代" sub={`${m.subs.length} 回`} />
      {m.subs.length === 0 ? (
        <HubEmpty compact title="交代の記録がありません" />
      ) : (
        <div className="phublist">
          {m.subs.map((s, i) => (
            <div className="phubrow" key={i}>
              <div className="phubrow-main">
                <b>
                  {s.minute != null ? `${s.minute}' ` : ""}
                  {nameOf(s.outPlayerId)} → {nameOf(s.inPlayerId)}
                </b>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className={`phub mhub${narrow ? " narrow" : ""}`} ref={rootRef}>
      {/* ヘッダーカード（<header> 要素は画面全体のヘッダー用の指定が掛かるので div） */}
      <div className="phubhead" ref={headRef}>
        <div className="phubhead-top">
          <div className="phubid">
            <span className={`mres ${resCls}`}>{resLabel}</span>
          </div>
          <div className="phubwho">
            <h2 className="phubname" title={m.opponent}>{m.opponent}</h2>
            <div className="phubsub">
              <span>{fmtMDW(m.date)}</span>
              {compName && <span>{compName}</span>}
              {targetGroups.length > 0 && groupPills}
            </div>
          </div>
          {/* ux-fix R3-5: スコアは一覧と同じ大きさ（.mscore）で右 */}
          <div className="mscore mhub-score" aria-label={`スコア ${m.ourScore} 対 ${m.theirScore}`}>
            {m.ourScore}
            <span>-</span>
            {m.theirScore}
          </div>
          {canEdit && (
            <button type="button" className="phubedit" aria-label="試合記録を編集" title="試合記録を編集" onClick={onEdit}>
              <IconEdit />
            </button>
          )}
        </div>
      </div>

      {chips && (
        <div className={`phubtabs${tabsMore ? " more" : ""}`} role="tablist" aria-label="セクション">
          {MATCH_SECTIONS.map(tabBtn)}
        </div>
      )}

      <div className={`phubbody${sideNav ? " withnav" : ""}`}>
        {sideNav && (
          <nav className="phubnav" role="tablist" aria-orientation="vertical" aria-label="セクション">
            {MATCH_SECTIONS.map(tabBtn)}
          </nav>
        )}
        {/* key でセクションごとに作り直す */}
        <div className="phubmain" role="tabpanel" key={sec}>
          {sec === "overview" ? overview : sec === "goals" ? goals : members}
        </div>
      </div>
    </div>
  );
}

export default MatchHub;
