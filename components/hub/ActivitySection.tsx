"use client";

import React, { useMemo } from "react";
import type { AttendanceStatus } from "@/lib/types";
import { NOTE_KIND_LABEL } from "@/lib/types";
import { playerSeasonStats } from "@/lib/playerStats";
import { monthlyAttendance, perPlayerAttendance } from "@/lib/attendanceStats";
import { eventTargetsPlayer } from "@/lib/groups";
import { isResultOnlyEvent } from "@/lib/matchEvents";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { TrendChart } from "../ProfileCharts";
import { HubEmpty, HubHead, fmtMD } from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「活動」（player-hub §3-8）：今季成績のタイル（RosPlayerPane の .hdash/.hstat を移したもの。
 * .hdash はスマホで display:none なので、ハブでは .phubstat として新しく組む）、出席（出席率・出席・欠席・未定、
 * 月別出席率のグラフと直近 10 件の出欠履歴）、ノート提出（件数・直近 5 件。押すとサッカーノートへ）。
 * 月別出席率は既存 LineChart（CSS が .noteapp/.teamapp 配下限定・Y が 0 始まり）ではなく TrendChart で描く。
 */

const STATUS_LABEL: Record<AttendanceStatus, string> = { yes: "○ 出席", maybe: "△ 未定", no: "× 欠席" };

function Stat({ v, l, s }: { v: React.ReactNode; l: string; s?: string }) {
  return (
    <div className="phubstat">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export default function ActivitySection({ p }: HubSectionProps) {
  const board = useBoard();
  const team = useTeam();

  const stats = useMemo(
    () => playerSeasonStats(p.id, team.team.matches, board.notebook),
    [p.id, team.team.matches, board.notebook]
  );
  const att = useMemo(() => perPlayerAttendance(team.team, [p], "all")[0], [team.team, p]);
  const monthly = useMemo(() => monthlyAttendance(team.team, [p], 6), [team.team, p]);
  const today = localDateStr();
  const history = useMemo(
    () =>
      [...team.team.events]
        // p15 レビュー: 試合結果を映すためだけの予定（自動で作成・出欠なし）は履歴に出さない（「未記録」で埋まるため）
        .filter(
          (e) => e.date <= today && eventTargetsPlayer(e, p, team.groups) && !isResultOnlyEvent(e, team.team.attendance)
        )
        .sort((a, b) => (a.date === b.date ? (b.time ?? "").localeCompare(a.time ?? "") : a.date < b.date ? 1 : -1))
        .slice(0, 10),
    [team.team.events, team.team.attendance, team.groups, p, today]
  );
  const notes = useMemo(
    () =>
      board.notebook
        .filter((n) => n.playerId === p.id)
        .sort((a, b) => (a.date === b.date ? b.ts - a.ts : a.date < b.date ? 1 : -1)),
    [board.notebook, p.id]
  );
  // 月別出席率：記録の無い月（pct=0 と区別できない）は点にしない
  const monthPts = monthly.filter((m) => m.recorded > 0);

  return (
    <section className="phubsec" aria-label="活動">
      <HubHead title="今季成績" />
      <div className="phubstats">
        <Stat v={stats.apps} l="出場" />
        <Stat v={stats.goals} l="得点" />
        <Stat v={stats.assists} l="アシスト" />
      </div>
      <div className="phubstats">
        <Stat
          v={stats.shotPct != null ? `${stats.shotPct}%` : "—"}
          l="シュート決定率"
          s={`${stats.noteGoals}/${stats.shots}`}
        />
        <Stat v={stats.passPct != null ? `${stats.passPct}%` : "—"} l="パス成功率" s={`試行 ${stats.passAtt}`} />
        <Stat v={stats.dribblePct != null ? `${stats.dribblePct}%` : "—"} l="ドリブル成功率" s={`試行 ${stats.dribbleAtt}`} />
      </div>
      <div className="phubnote">出場・得点・アシストは試合記録、決定率・成功率は選手が提出した試合ノートから集計しています。</div>

      <HubHead title="出席" sub="今日までの予定" />
      <div className="phubstats four">
        <Stat v={att && att.recorded > 0 ? `${att.pct}%` : "—"} l="出席率" />
        <Stat v={att?.yes ?? 0} l="出席" />
        <Stat v={att?.no ?? 0} l="欠席" />
        <Stat v={att?.maybe ?? 0} l="未定" />
      </div>
      {monthPts.length >= 2 && (
        <div className="phubcard">
          <div className="phubcard-t">月別出席率の推移（直近 6 か月）</div>
          <TrendChart
            xKind="category"
            unit="%"
            domain={[0, 100]}
            series={[{ label: "出席率", points: monthPts.map((m) => ({ x: m.label, y: m.pct })) }]}
          />
        </div>
      )}
      {history.length === 0 ? (
        <HubEmpty title="まだ出欠の記録がありません" hint="予定に出欠を記録すると、ここに直近の履歴が出ます。" />
      ) : (
        <>
          <div className="phubcard-t phubsub">直近の出欠履歴</div>
          <div className="phublist">
            {history.map((e) => {
              const entry = team.team.attendance[e.id]?.[p.id];
              return (
                <div className="phubrow" key={e.id}>
                  <div className="phubrow-main">
                    <b>{e.title}</b>
                    <span>
                      {fmtMD(e.date)}
                      {entry?.comment ? ` ・ ${entry.comment}` : ""}
                    </span>
                  </div>
                  <div className="phubrow-st">{entry?.status ? STATUS_LABEL[entry.status] : "未記録"}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <HubHead
        title="ノート提出"
        action={
          <button type="button" className="phubrowbtn" onClick={() => board.setScreen("notebook")}>
            サッカーノートを開く ›
          </button>
        }
      />
      <div className="phubcard">
        <div className="phubsum">
          提出 <b>{notes.length}</b> 件{notes[0] ? ` ・ 直近 ${fmtMD(notes[0].date)}` : ""}
        </div>
        {notes.length > 0 && (
          <ul className="phubnotes">
            {notes.slice(0, 5).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => board.setScreen("notebook")}>
                  <span>{fmtMD(n.date)}</span>
                  <b>{NOTE_KIND_LABEL[n.kind]}ノート</b>
                </button>
              </li>
            ))}
          </ul>
        )}
        {notes.length === 0 && <div className="phubkv-empty">まだノートの提出がありません。</div>}
      </div>
    </section>
  );
}
