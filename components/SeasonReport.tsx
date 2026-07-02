"use client";

import { useMemo, useState } from "react";
import type { SeasonRange } from "@/lib/seasonReport";
import { buildSeasonReport, renderSeasonImage } from "@/lib/seasonReport";
import { downloadDataUrl } from "@/lib/exportImage";
import { loadTeam } from "@/lib/storage";
import { useBoard } from "./BoardProvider";
import { E } from "./Emoji";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function SeasonReport({ playerId }: { playerId: string }) {
  const board = useBoard();
  const player = board.state.players.find((p) => p.id === playerId);
  const [range, setRange] = useState<SeasonRange>({
    from: `${new Date().getFullYear()}-01-01`,
    to: todayStr(),
  });

  const data = useMemo(() => {
    if (!player) return null;
    return buildSeasonReport(
      player,
      board.notebook,
      board.deliverables,
      loadTeam(),
      range,
      board.state.teamName ?? "マイチーム"
    );
  }, [player, board.notebook, board.deliverables, board.state.teamName, range]);

  if (!player || !data) return <div className="empty-msg">選手が見つかりません。</div>;

  const saveImage = () => {
    try {
      const url = renderSeasonImage(data);
      downloadDataUrl(url, `report_${player.name}_${range.to}.png`);
      board.toast("画像を保存しました");
    } catch {
      board.toast("画像の生成に失敗しました");
    }
  };

  return (
    <div className="notetools">
      <h2><E n="doc" /> シーズンレポート</h2>

      {/* 期間（印刷対象外） */}
      <div className="formgrid noprint">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>開始</label>
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>終了</label>
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
      </div>
      <div className="reportacts noprint">
        <button className="bigbtn" onClick={() => window.print()}><E n="printer" /> 印刷 / PDF保存</button>
        <button className="bigbtn ghost" onClick={saveImage}><E n="image" /> 画像で保存</button>
      </div>

      {/* 印刷・画面共通のレポート本体 */}
      <div className="reportsheet">
        <div className="rephead">
          <div>
            <div className="repbrand">ALFA<b> FOOTBALL</b> ／ シーズンレポート</div>
            <div className="repname">{data.playerName}<span>{data.teamName}{data.number != null ? ` ・ #${data.number}` : ""}</span></div>
          </div>
          <div className="reprange">{data.range.from}<br />〜 {data.range.to}</div>
        </div>

        <div className="repgrid">
          <RepStat v={`${data.matches}`} l="試合数" />
          <RepStat v={data.attendancePct != null ? `${data.attendancePct}%` : "—"} l="出席率" />
          <RepStat v={`${data.noteCounts.total}`} l="ノート" />
          <RepStat v={`${data.soloCount}`} l={`自主練(最長${data.soloBestStreak}日)`} />
          <RepStat v={data.assignmentTotal ? `${data.assignmentDone}/${data.assignmentTotal}` : "—"} l="課題達成" />
          <RepStat v={data.quizAvgPct != null ? `${data.quizAvgPct}%` : "—"} l="テスト平均" />
        </div>

        {data.positions.length > 0 && (
          <RepSec h="出場ポジション">
            <div className="ps-row">
              {data.positions.map(([r, n]) => (
                <span key={r} className="ps-chip">{r} <b>{n}</b>試合</span>
              ))}
            </div>
          </RepSec>
        )}

        <RepSec h="総括（自動生成）">
          <div className="repsummary">{data.summary}</div>
        </RepSec>

        {data.insights.length > 0 && (
          <RepSec h="代表的な気づき">
            {data.insights.map((t, i) => <div key={i} className="repline">・{t}</div>)}
          </RepSec>
        )}
        {data.bestPlays.length > 0 && (
          <RepSec h="ベストプレー">
            {data.bestPlays.map((t, i) => <div key={i} className="repline"><E n="star" /> {t}</div>)}
          </RepSec>
        )}
        {data.staffComments.length > 0 && (
          <RepSec h="コーチからのコメント">
            {data.staffComments.map((t, i) => <div key={i} className="repline"><E n="comment" /> {t}</div>)}
          </RepSec>
        )}

        <div className="repfoot">ノート内容・出欠・配信回答から自動集計（AI不使用・ルールベース）</div>
      </div>
    </div>
  );
}

function RepStat({ v, l }: { v: string; l: string }) {
  return (
    <div className="repstat">
      <div className="repsv">{v}</div>
      <div className="repsl">{l}</div>
    </div>
  );
}
function RepSec({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <div className="repsec">
      <div className="repsec-h">{h}</div>
      {children}
    </div>
  );
}
