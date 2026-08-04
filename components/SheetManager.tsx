"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_POSITIONS, FORMATION_KEYS, groupOf } from "@/lib/formations";
import type {
  DominantFoot,
  FitnessRecord,
  InjuryRecord,
  InjuryStatus,
  MatchRecord,
  PitchType,
  Player,
  Position,
  SavedDrill,
  SavedPlay,
} from "@/lib/types";
import { INJURY_STATUS_LABEL, PLAN_INFO, PLAN_ORDER } from "@/lib/types";
import { downloadDataUrl, renderTacticPng } from "@/lib/exportImage";
import { canExportWebm, downloadBlob, exportGif, exportWebm } from "@/lib/exportAnim";
import { fileToEmblemDataUrl } from "@/lib/imageResize";
import { openPrintView } from "@/lib/printView";
import { buildLineUrl, buildShareUrl } from "@/lib/share";
import { loadDrills, loadTeam } from "@/lib/storage";
import { attendanceRate } from "@/lib/teamStats";
import {
  aggregateTech,
  matchSummary,
  perMatchTech,
  perPlayerTech,
  type MatchTechRow,
  type TechStats,
} from "@/lib/teamStatsAgg";
import { ARTICLES } from "@/lib/articles";
import { computePlayerKpi, computeTeamSummary } from "@/lib/coaching";
import { localDateStr, weekStart } from "@/lib/dates";
import { useBoard, type KpiMetric, type StatMetric } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import ChatThread from "./ChatThread";
import { E } from "./Emoji";
import LogoMark from "./Logo";
import { SendTargetField, targetThreadKey, type SendTarget } from "./SendTarget";
import {
  IconBook,
  IconCalendarCheck,
  IconCog,
  IconCone,
  IconLogout,
  IconUsers,
} from "./icons";

const FOOT_LABEL: Record<DominantFoot, string> = {
  right: "右足",
  left: "左足",
  both: "両足",
};

const PITCH_LABEL: Record<PitchType, string> = {
  half: "ハーフ",
  full: "フル縦",
  fullh: "フル横",
  blank: "ブランク",
};

function newId(p: string): string {
  return `${p}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
}

/* ---------------- Sheet shell ---------------- */
function Sheet({
  open,
  onClose,
  children,
  full,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  full?: boolean;
  onBack?: () => void;
}) {
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <div className={`sheet${open ? " on" : ""}${full ? " full" : ""}`}>
        {/* PCダイアログ用の閉じるボタン（モバイルでは基底CSSで非表示） */}
        <button className="sheetx" type="button" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
        {full ? (
          <div className="sheettop">
            <button className="sheetback" onClick={onBack ?? onClose}>
              ‹ 戻る
            </button>
          </div>
        ) : (
          <div className="grabzone" onClick={onClose}>
            <div className="grab" />
          </div>
        )}
        <div className="sheetBody">{open ? children : null}</div>
      </div>
    </>
  );
}

/* ---------------- Assign player to slot ---------------- */
function AssignSheet({ slot }: { slot: number }) {
  const board = useBoard();
  const [q, setQ] = useState("");
  const { slots, players } = board.state;
  const inXi = new Set(slots.map((s) => s.pid).filter(Boolean));
  const role = slots[slot].role;
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return players
      .filter((p) => !inXi.has(p.id))
      .filter(
        (p) =>
          !kw ||
          p.name.toLowerCase().includes(kw) ||
          p.position.toLowerCase().includes(kw) ||
          String(p.number ?? "").includes(kw)
      )
      .sort((a, b) => {
        // 枠の役割と同グループを上位に
        const ga = groupOf(a.position) === groupOf(role) ? 0 : 1;
        const gb = groupOf(b.position) === groupOf(role) ? 0 : 1;
        return ga - gb;
      });
  }, [players, inXi, q, role]);

  return (
    <>
      <h2>
        選手を配置 <span>{role}</span>
      </h2>
      <div className="controls">
        <input
          className="search"
          placeholder="名前・背番号・ポジションで検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="list">
        {list.length === 0 ? (
          <div className="empty-msg">
            配置できる控え選手がいません。
            <br />
            下のボタンから新しい選手を追加できます。
          </div>
        ) : (
          list.map((p) => (
            <div
              key={p.id}
              className="prow"
              onClick={() => {
                board.assignPlayer(slot, p.id);
                board.closeSheet();
                board.toast(`${p.name} を ${role} に配置しました`);
              }}
            >
              <div className={`pos ${groupOf(p.position)}`}>{p.position}</div>
              <div className="meta">
                <div className="nm">{p.name}</div>
                <div className="sub">背番号 {p.number ?? "—"}</div>
              </div>
              <div className="num">{p.number ?? "–"}</div>
            </div>
          ))
        )}
      </div>
      <button
        className="bigbtn ghost"
        onClick={() =>
          board.openSheet({ type: "playerForm", assignSlot: slot })
        }
      >
        ＋ 新しい選手を追加して配置
      </button>
    </>
  );
}

/* ---------------- Slot action menu ---------------- */
function SlotMenu({ slot }: { slot: number }) {
  const board = useBoard();
  const s = board.state.slots[slot];
  const player = s.pid ? board.state.players.find((p) => p.id === s.pid) : null;
  const [note, setNote] = useState(player?.roleNote ?? "");
  if (!player) return null;
  const isCapt = board.state.captain === player.id;
  const dirty = (note.trim() || "") !== (player.roleNote ?? "");
  const saveNote = () => {
    board.updatePlayer({ ...player, roleNote: note.trim() || undefined });
    board.toast("役割メモを保存しました");
  };
  return (
    <>
      <h2>
        {player.name} <span>{s.role}</span>
      </h2>

      {/* 役割メモ（タップで表示・編集する詳細な役割） */}
      <div className="rolememo">
        <label>
          役割メモ <span className="rmrole">{s.role}</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="例）右に張って幅を作る。ボール非保持はSBの背後をカバー。"
        />
        <button className={`rmsave${dirty ? " on" : ""}`} disabled={!dirty} onClick={saveNote}>
          {dirty ? "メモを保存" : "保存済み"}
        </button>
      </div>

      <div className="menu">
        <div
          className="mitem"
          onClick={() => board.openSheet({ type: "assign", slot })}
        >
          <div className="mi"><E n="swap" /></div> 選手を入れ替える
        </div>
        <div
          className="mitem"
          onClick={() => {
            board.setCaptain(isCapt ? null : player.id);
            board.closeSheet();
            board.toast(isCapt ? "キャプテンを解除しました" : `${player.name} をキャプテンに設定`);
          }}
        >
          <div className="mi"><E n="captain" /></div> {isCapt ? "キャプテンを解除" : "キャプテンに設定"}
        </div>
        <div
          className="mitem"
          onClick={() => board.openSheet({ type: "playerDetail", playerId: player.id })}
        >
          <div className="mi"><E n="pencil" /></div> 選手プロフィールを開く
        </div>
        <div
          className="mitem danger"
          onClick={() => {
            board.removePlayer(slot);
            board.closeSheet();
            board.toast(`${player.name} をスタメンから外しました`);
          }}
        >
          <div className="mi"><E n="benchout" /></div> スタメンから外す（ベンチへ）
        </div>
      </div>
    </>
  );
}

/* ---------------- Opponent token menu ---------------- */
function OppMenu({ index }: { index: number }) {
  const board = useBoard();
  const o = (board.state.opponents ?? [])[index];
  const [label, setLabel] = useState(o?.label ?? "");
  if (!o) return null;
  const dirty = label.trim() !== o.label;
  return (
    <>
      <h2>
        相手トークン <span>{o.label}</span>
      </h2>
      <div className="rolememo">
        <label>番号・ラベル</label>
        <input
          className="search"
          value={label}
          maxLength={3}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例）9"
        />
        <button
          className={`rmsave${dirty ? " on" : ""}`}
          disabled={!dirty}
          onClick={() => {
            board.updateOpponentLabel(index, label.trim() || o.label);
            board.toast("ラベルを変更しました");
            board.closeSheet();
          }}
        >
          {dirty ? "変更を保存" : "保存済み"}
        </button>
      </div>
      <div className="menu">
        <div
          className="mitem"
          onClick={() => {
            board.addOpponent();
            board.closeSheet();
          }}
        >
          <div className="mi">＋</div> 相手トークンを追加
        </div>
        <div
          className="mitem danger"
          onClick={() => {
            board.deleteOpponent(index);
            board.closeSheet();
            board.toast("相手トークンを削除しました");
          }}
        >
          <div className="mi">×</div> このトークンを削除
        </div>
      </div>
    </>
  );
}

/* ---------------- Roster list ---------------- */
function RosterSheet() {
  const board = useBoard();
  const [q, setQ] = useState("");
  const { players } = board.state;
  const kw = q.trim().toLowerCase();
  const list = players.filter(
    (p) => !kw || p.name.toLowerCase().includes(kw) || p.position.toLowerCase().includes(kw)
  );
  return (
    <>
      <h2>
        名簿 <span>{players.length}人</span>
      </h2>
      <div className="controls">
        <input
          className="search"
          placeholder="名前・ポジションで検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="list">
        {list.length === 0 ? (
          <div className="empty-msg">選手がいません。下のボタンから追加してください。</div>
        ) : (
          list.map((p) => {
            const activeInj = (p.injuries ?? []).find((x) => x.status !== "ok");
            return (
              <div
                key={p.id}
                className="prow"
                onClick={() => board.openSheet({ type: "playerDetail", playerId: p.id })}
              >
                <div className={`pos ${groupOf(p.position)}`}>{p.position}</div>
                <div className="meta">
                  <div className="nm">
                    {p.name}
                    {board.state.captain === p.id ? " (C)" : ""}
                  </div>
                  <div className="sub">
                    背番号 {p.number ?? "—"}
                    {activeInj ? ` ・ ${INJURY_STATUS_LABEL[activeInj.status]}` : ""}
                  </div>
                </div>
                {activeInj && (
                  <span className={`injbadge ${activeInj.status}`}>
                    {INJURY_STATUS_LABEL[activeInj.status]}
                  </span>
                )}
                <div className="num">{p.number ?? "–"}</div>
              </div>
            );
          })
        )}
      </div>
      <button
        className="bigbtn"
        onClick={() => board.openSheet({ type: "playerForm" })}
      >
        ＋ 新規選手を追加
      </button>
    </>
  );
}

/* ---------------- コーチ・ダッシュボードのサマリーカード → 選手別内訳 ---------------- */
const KPI_HINT: Record<KpiMetric, string> = {
  // カードの数値は「各選手の出席率の平均」であって、出欠数の総和比ではない
  attendance: "スタッフが記録した出欠（今日までの予定）に対する出席の割合の平均です。",
  notesWeek: "今週（月曜起点）に提出されたノートの件数です。",
  uncommented: "コーチのコメントがまだ付いていないノートの件数です。",
  // カード/バッジの値は週数ではなく「継続中の人数」
  solo: "自主練が続いている選手の人数です（週は月曜起点）。",
};

function KpiSheet({ metric }: { metric: KpiMetric }) {
  const board = useBoard();
  const kpis = useMemo(() => {
    const team = loadTeam();
    return board.state.players.map((p) =>
      computePlayerKpi(p, board.notebook, board.deliverables, team)
    );
  }, [board.state.players, board.notebook, board.deliverables]);

  const monday = weekStart(localDateStr());
  const notesThisWeekOf = (pid: string) =>
    board.notebook.filter((n) => n.playerId === pid && n.date >= monday).length;

  // ダッシュボードのカードと同じ関数で集計する（式をコピーすると集計側の修正に追随できない）
  const summary = useMemo(() => computeTeamSummary(kpis, board.notebook), [kpis, board.notebook]);
  // 名簿から削除された選手のノートは残るため、選手別合計と全体件数がズレうる。
  // その差分を「名簿外」として1行で出し、カード＝見出し＝行の合計を必ず閉じさせる
  const orphanNotes = useMemo(() => {
    const known = new Set(board.state.players.map((p) => p.id));
    return board.notebook.filter((n) => n.date >= monday && !known.has(n.playerId)).length;
  }, [board.notebook, board.state.players, monday]);

  let rows = [...kpis];
  if (metric === "attendance") {
    // 出席率なし(予定が無い)は「0%の要注意」ではないので末尾へ回す
    const rated = rows.filter((k) => k.attendancePct != null);
    const unrated = rows.filter((k) => k.attendancePct == null);
    rated.sort((a, b) => (a.attendancePct ?? 0) - (b.attendancePct ?? 0));
    rows = [...rated, ...unrated];
  } else if (metric === "notesWeek") {
    rows.sort((a, b) => notesThisWeekOf(b.playerId) - notesThisWeekOf(a.playerId));
  } else if (metric === "uncommented") {
    rows = rows.filter((k) => k.uncommented > 0).sort((a, b) => b.uncommented - a.uncommented);
  } else {
    // バッジは「継続中の人数」なので、行も継続中の選手だけにする
    rows = rows.filter((k) => k.soloStreak > 0).sort((a, b) => b.soloStreak - a.soloStreak);
  }

  const ratedCount = kpis.filter((k) => k.attendancePct != null).length;
  const heading: Record<KpiMetric, { title: string; badge: string }> = {
    attendance: {
      title: "出席率",
      badge:
        summary.avgAttendance != null
          ? `チーム平均 ${summary.avgAttendance}%（${ratedCount}人）`
          : "チーム平均 —",
    },
    notesWeek: { title: "今週のノート", badge: `${summary.notesThisWeek}件` },
    uncommented: { title: "未コメント", badge: `${summary.uncommentedTotal}件` },
    solo: { title: "自主練継続", badge: `${summary.soloActive}人` },
  };
  const h = heading[metric];

  return (
    <>
      <h2>
        {h.title} <span>{h.badge}</span>
      </h2>
      <div className="list">
        {rows.length === 0 ? (
          <div className="empty-msg">
            {metric === "uncommented"
              ? "未コメントはありません。"
              : metric === "solo"
              ? "自主練が継続中の選手はいません。"
              : "対象の選手がいません。"}
          </div>
        ) : (
          rows.map((k) => (
            <div
              key={k.playerId}
              className="prow"
              onClick={() =>
                // 戻ったときに同じ内訳へ帰れるよう、開いた指標を持ち回す
                board.openSheet({ type: "playerDetail", playerId: k.playerId, kpiMetric: metric })
              }
            >
              <div className="meta">
                <div className="nm">{k.name}</div>
                {metric === "attendance" && <div className="sub">出席 {k.attendance.yes}/{k.attendance.total}</div>}
                {metric === "solo" && <div className="sub">自主練 {k.soloCount}回</div>}
              </div>
              <div className="kpinum">
                {metric === "attendance" && (k.attendancePct != null ? `${k.attendancePct}%` : "—")}
                {metric === "notesWeek" && notesThisWeekOf(k.playerId)}
                {metric === "uncommented" && k.uncommented}
                {metric === "solo" && `${k.soloStreak}週`}
              </div>
            </div>
          ))
        )}
        {metric === "notesWeek" && orphanNotes > 0 && (
          <div className="prow" style={{ cursor: "default" }}>
            <div className="meta">
              <div className="nm">名簿外の選手</div>
              <div className="sub">削除された選手が提出したノート</div>
            </div>
            <div className="kpinum">{orphanNotes}</div>
          </div>
        )}
      </div>
      <div className="kpihint">{KPI_HINT[metric]}</div>
    </>
  );
}

/* ---------------- PCホーム「チームスタッツ」/選手側「マイスタッツ」カード → 内訳 ---------------- */
const STAT_TITLE: Record<StatMetric, string> = {
  record: "試合成績",
  shot: "シュート",
  pass: "パス",
  dribble: "ドリブル",
};
const STAT_RATE_LABEL: Record<Exclude<StatMetric, "record">, string> = {
  shot: "決定率",
  pass: "成功率",
  dribble: "成功率",
};
const STAT_HINT: Record<StatMetric, string> = {
  record: "チーム運営に登録した試合記録から集計しています。勝率＝勝ち÷試合数（引き分けを含む）です。",
  shot: "試合ノートのプレー記録（シュート）から集計しています。決定率＝ゴール数÷シュート数です。",
  pass: "試合ノートのプレー記録（パス）から集計しています。成功率＝成功数÷本数です。",
  dribble: "試合ノートのプレー記録（ドリブル）から集計しています。成功率＝成功数÷本数です。",
};
const WD = ["日", "月", "火", "水", "木", "金", "土"];
function fmtStatDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return s;
  const dt = new Date(y, m - 1, d);
  return `${m}/${d}(${WD[dt.getDay()]})`;
}
function statPct(a: number, b: number): number | null {
  return b > 0 ? Math.round((a / b) * 100) : null;
}
/** シュート/パス/ドリブルの「試行数・成功(ゴール)数・率」を指標ごとに取り出す共通アクセサ。
 * TechStats（選手別合計）・MatchTechRow（試合別内訳）のどちらでも使えるよう最小の形で受け取る */
function techPick(
  s: { shots: number; goals: number; pass: number; passOk: number; dribble: number; dribbleOk: number },
  metric: Exclude<StatMetric, "record">
): { count: number; ok: number; okLabel: string; p: number | null } {
  if (metric === "shot") return { count: s.shots, ok: s.goals, okLabel: "ゴール", p: statPct(s.goals, s.shots) };
  if (metric === "pass") return { count: s.pass, ok: s.passOk, okLabel: "成功", p: statPct(s.passOk, s.pass) };
  return { count: s.dribble, ok: s.dribbleOk, okLabel: "成功", p: statPct(s.dribbleOk, s.dribble) };
}

function StatSheet({ metric }: { metric: StatMetric }) {
  const board = useBoard();
  const teamCtx = useTeam();
  const coach = board.auth.role === "coach";
  const myId = board.auth.playerId;

  // ホームのカードと同じライブなソース(useTeam)から読む。
  // loadTeam()のスナップショットだとカードとシートで数値ソースが二重化する
  const team = teamCtx.team;
  const matches = useMemo(
    () => [...(team?.matches ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [team]
  );
  const summary = useMemo(() => matchSummary(matches), [matches]);
  const compName = (m: MatchRecord): string | undefined =>
    m.competitionId
      ? team?.competitions.find((c: { id: string; name: string }) => c.id === m.competitionId)?.name
      : m.competition;

  // コーチ表示: チーム全選手の合計 / 選手表示: 自分の合計（見出しバッジ用）
  const teamTech: TechStats = useMemo(() => aggregateTech(board.notebook), [board.notebook]);
  // playerId が無いセッションでは0件扱い(undefinedを渡すと全選手合算=他人の数字が混ざる)
  const myTech: TechStats = useMemo(
    () => (myId ? aggregateTech(board.notebook, myId) : aggregateTech([], undefined)),
    [board.notebook, myId]
  );
  const playerRows = useMemo(
    () => perPlayerTech(board.notebook, board.state.players),
    [board.notebook, board.state.players]
  );
  const myMatchRows: MatchTechRow[] = useMemo(
    () => (myId ? perMatchTech(board.notebook, myId) : []),
    [board.notebook, myId]
  );

  let badge: string;
  if (metric === "record") {
    badge = `${summary.wins}勝${summary.draws}分${summary.losses}敗`;
  } else {
    const pick = techPick(coach ? teamTech : myTech, metric);
    badge = pick.p != null ? `${STAT_RATE_LABEL[metric]} ${pick.p}%` : `${STAT_RATE_LABEL[metric]} —`;
  }

  return (
    <>
      <h2>
        {STAT_TITLE[metric]} <span>{badge}</span>
      </h2>
      <div className="list">
        {metric === "record" ? (
          matches.length === 0 ? (
            <div className="empty-msg">試合記録がまだありません。</div>
          ) : (
            matches.map((m) => {
              const win = m.ourScore > m.theirScore;
              const draw = m.ourScore === m.theirScore;
              const cname = compName(m);
              return (
                <div key={m.id} className="prow" style={{ cursor: "default" }}>
                  <div className="meta">
                    <div className="nm">{m.opponent}</div>
                    <div className="sub">
                      {fmtStatDate(m.date)}
                      {cname ? ` ・ ${cname}` : ""}
                    </div>
                  </div>
                  <div className="kpinum statscorewrap">
                    <span>
                      {m.ourScore}-{m.theirScore}
                    </span>
                    <span className={`statwdl ${win ? "win" : draw ? "draw" : "lose"}`}>
                      {win ? "勝" : draw ? "分" : "敗"}
                    </span>
                  </div>
                </div>
              );
            })
          )
        ) : coach ? (
          (() => {
            const rows = playerRows
              .map((r) => ({ r, pick: techPick(r, metric) }))
              .filter(({ pick }) => pick.count > 0)
              .sort((a, b) => b.pick.count - a.pick.count);
            // 名簿から削除された選手のノートは残るため、その差分を1行で出して
            // カード・見出しバッジ・行合計を必ず一致させる(KpiSheetと同じ手当て)
            const known = new Set(board.state.players.map((p) => p.id));
            const orphanNotes = board.notebook.filter((n) => !known.has(n.playerId));
            const orphanPick = techPick(aggregateTech(orphanNotes), metric);
            return rows.length === 0 && orphanPick.count === 0 ? (
              <div className="empty-msg">試合ノートのデータがまだありません。</div>
            ) : (
              rows.map(({ r, pick }) => (
                <div
                  key={r.playerId}
                  className="prow"
                  onClick={() =>
                    // 戻ったときに同じ内訳へ帰れるよう、開いた指標を持ち回す（KpiSheetと同じ方式）
                    board.openSheet({ type: "playerDetail", playerId: r.playerId, statMetric: metric })
                  }
                >
                  <div className="meta">
                    <div className="nm">{r.name}</div>
                    <div className="sub">
                      {pick.okLabel} {pick.ok}
                    </div>
                  </div>
                  <div className="kpinum">
                    {pick.count}本{pick.p != null ? `（${pick.p}%）` : ""}
                  </div>
                </div>
              )).concat(
                orphanPick.count > 0
                  ? [
                      <div key="__orphan" className="prow" style={{ cursor: "default" }}>
                        <div className="meta">
                          <div className="nm">名簿外の選手</div>
                          <div className="sub">削除された選手のノート</div>
                        </div>
                        <div className="kpinum">
                          {orphanPick.count}本{orphanPick.p != null ? `（${orphanPick.p}%）` : ""}
                        </div>
                      </div>,
                    ]
                  : []
              )
            );
          })()
        ) : (
          (() => {
            const rows = myMatchRows
              .map((m) => ({ m, pick: techPick(m, metric) }))
              .filter(({ pick }) => pick.count > 0);
            return rows.length === 0 ? (
              <div className="empty-msg">試合ノートのデータがまだありません。</div>
            ) : (
              rows.map(({ m, pick }, i) => (
                <div key={`${m.date}_${i}`} className="prow" style={{ cursor: "default" }}>
                  <div className="meta">
                    <div className="nm">{m.title}</div>
                    <div className="sub">
                      {fmtStatDate(m.date)} ・ {pick.okLabel} {pick.ok}
                    </div>
                  </div>
                  <div className="kpinum">
                    {pick.count}本{pick.p != null ? `（${pick.p}%）` : ""}
                  </div>
                </div>
              ))
            );
          })()
        )}
      </div>
      <div className="kpihint">{STAT_HINT[metric]}</div>
    </>
  );
}

/* ---------------- Player add / edit form ---------------- */
function PlayerForm({
  player,
  assignSlot,
}: {
  player?: Player;
  assignSlot?: number;
}) {
  const board = useBoard();
  const [name, setName] = useState(player?.name ?? "");
  const [number, setNumber] = useState(
    player?.number != null ? String(player.number) : ""
  );
  const [position, setPosition] = useState<Position>(player?.position ?? "CM");
  const [email, setEmail] = useState(player?.email ?? "");
  const [height, setHeight] = useState(player?.height != null ? String(player.height) : "");
  const [weight, setWeight] = useState(player?.weight != null ? String(player.weight) : "");
  const [foot, setFoot] = useState<DominantFoot | "">(player?.dominantFoot ?? "");
  const editing = !!player;

  const save = () => {
    const nm = name.trim();
    if (!nm) {
      board.toast("選手名を入力してください");
      return;
    }
    const num = number.trim() === "" ? null : Number(number);
    const profile = {
      email: email.trim() === "" ? undefined : email.trim().toLowerCase(),
      height: height.trim() === "" ? null : Number(height),
      weight: weight.trim() === "" ? null : Number(weight),
      dominantFoot: foot === "" ? undefined : foot,
    };
    if (editing && player) {
      board.updatePlayer({ ...player, name: nm, number: num, position, ...profile });
      board.openSheet({ type: "playerDetail", playerId: player.id });
      board.toast("選手情報を更新しました");
    } else {
      const id = board.createPlayer({ name: nm, number: num, position, ...profile });
      if (assignSlot != null) {
        board.assignPlayer(assignSlot, id);
        board.toast(`${nm} を配置しました`);
        board.closeSheet();
      } else {
        board.toast(`${nm} を名簿に追加しました`);
        board.openSheet({ type: "playerDetail", playerId: id });
      }
    }
  };

  return (
    <>
      <h2>{editing ? "選手を編集" : "選手を追加"}</h2>
      <div className="formfield">
        <label>選手名</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例）山田 太郎"
          autoFocus
        />
      </div>
      <div className="formfield">
        <label>メールアドレス（選手ログイン用）</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="例）taro@example.com"
          autoComplete="off"
        />
      </div>
      <div className="formgrid">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>背番号</label>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="任意"
            inputMode="numeric"
          />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>ポジション</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as Position)}
          >
            {ALL_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="formgrid">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>身長(cm)</label>
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="任意"
            inputMode="numeric"
          />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>体重(kg)</label>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="任意"
            inputMode="decimal"
          />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>利き足</label>
          <select value={foot} onChange={(e) => setFoot(e.target.value as DominantFoot | "")}>
            <option value="">—</option>
            <option value="right">右足</option>
            <option value="left">左足</option>
            <option value="both">両足</option>
          </select>
        </div>
      </div>
      <button className="bigbtn" onClick={save}>
        {editing ? "保存する" : "追加する"}
      </button>
      {editing && player && (
        <button
          className="bigbtn ghost"
          style={{ color: "var(--red)" }}
          onClick={() => {
            board.deletePlayer(player.id);
            board.closeSheet();
            board.toast(`${player.name} を削除しました`);
          }}
        >
          この選手を削除
        </button>
      )}
    </>
  );
}

/* ---------------- Player detail (profile / fitness / injury / attendance) ---------------- */
function PlayerDetail({ playerId }: { playerId: string }) {
  const board = useBoard();
  const p = board.state.players.find((x) => x.id === playerId);
  // 出席率は保存済みのチームデータから読み取り（読み取り専用）
  const att = useMemo(() => attendanceRate(loadTeam(), playerId), [playerId]);
  if (!p) return null;
  const fitness = p.fitness ?? [];
  const injuries = p.injuries ?? [];

  const removeFitness = (id: string) =>
    board.updatePlayer({ ...p, fitness: fitness.filter((f) => f.id !== id) });
  const removeInjury = (id: string) =>
    board.updatePlayer({ ...p, injuries: injuries.filter((i) => i.id !== id) });

  return (
    <>
      <h2>
        {p.name} <span>{p.position}</span>
      </h2>
      <div className="detail">
        <div className="profrow">
          <div className="profcell">
            <div className="pk">背番号</div>
            <div className="pv">{p.number ?? "—"}</div>
          </div>
          <div className="profcell">
            <div className="pk">身長</div>
            <div className="pv">{p.height != null ? `${p.height}` : "—"}<small>cm</small></div>
          </div>
          <div className="profcell">
            <div className="pk">体重</div>
            <div className="pv">{p.weight != null ? `${p.weight}` : "—"}<small>kg</small></div>
          </div>
          <div className="profcell">
            <div className="pk">利き足</div>
            <div className="pv">{p.dominantFoot ? FOOT_LABEL[p.dominantFoot] : "—"}</div>
          </div>
        </div>

        {p.email && <div className="profmail"><E n="mail" /> {p.email}</div>}

        <button className="bigbtn ghost" onClick={() => board.openSheet({ type: "playerForm", player: p })}>
          基本情報を編集
        </button>

        <div className="dsec">
          <div className="dsec-h"><E n="chart" /> 出席率</div>
          <div className="dline">出席 {att.yes} / 全 {att.total} 予定（{att.pct}%）</div>
          <div className="ratebar big"><i style={{ width: `${att.pct}%` }} /></div>
        </div>

        <div className="dsec">
          <div className="dsec-h"><E n="run" /> 体力測定</div>
          {fitness.length === 0 ? (
            <div className="dsec-e">記録なし</div>
          ) : (
            fitness.map((f) => (
              <div key={f.id} className="injrow">
                <div className="injmain">
                  <div className="injarea">{f.name}：<b style={{ color: "var(--lime)" }}>{f.value}</b></div>
                  <div className="injmeta">{f.date}</div>
                </div>
                <button className="injbtn" onClick={() => board.openSheet({ type: "fitness", playerId, fitnessId: f.id })}><E n="pencil" /></button>
                <button className="injbtn" onClick={() => removeFitness(f.id)}>×</button>
              </div>
            ))
          )}
          <button className="dynadd" onClick={() => board.openSheet({ type: "fitness", playerId })}>
            ＋ 測定記録を追加
          </button>
        </div>

        <div className="dsec">
          <div className="dsec-h"><E n="bandage" /> 怪我履歴（スタッフ管理）</div>
          {injuries.length === 0 ? (
            <div className="dsec-e">記録なし</div>
          ) : (
            injuries.map((x) => (
              <div key={x.id} className="injrow">
                <span className={`injbadge ${x.status}`}>{INJURY_STATUS_LABEL[x.status]}</span>
                <div className="injmain">
                  <div className="injarea">{x.area}</div>
                  <div className="injmeta">{x.date}{x.note ? ` ・ ${x.note}` : ""}</div>
                </div>
                <button className="injbtn" onClick={() => board.openSheet({ type: "injuryEdit", playerId, injuryId: x.id })}><E n="pencil" /></button>
                <button className="injbtn" onClick={() => removeInjury(x.id)}>×</button>
              </div>
            ))
          )}
          <button className="dynadd" onClick={() => board.openSheet({ type: "injuryEdit", playerId })}>
            ＋ 怪我を追加
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------------- Fitness record form ---------------- */
function FitnessForm({ playerId, fitnessId }: { playerId: string; fitnessId?: string }) {
  const board = useBoard();
  const p = board.state.players.find((x) => x.id === playerId);
  const rec = p?.fitness?.find((f) => f.id === fitnessId);
  const [fname, setFname] = useState(rec?.name ?? "");
  const [value, setValue] = useState(rec?.value ?? "");
  const [date, setDate] = useState(rec?.date ?? new Date().toISOString().slice(0, 10));
  if (!p) return null;

  return (
    <>
      <h2>{rec ? "測定記録を編集" : "測定記録を追加"}</h2>
      <div className="formfield">
        <label>種目</label>
        <input value={fname} onChange={(e) => setFname(e.target.value)} placeholder="例）50m走 / 1500m走 / 反復横跳び" autoFocus />
      </div>
      <div className="formgrid">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>記録</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="例）7.8秒 / 5分40秒" />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>計測日</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <button
        className="bigbtn"
        onClick={() => {
          if (!fname.trim() || !value.trim()) {
            board.toast("種目と記録を入力してください");
            return;
          }
          const list = p.fitness ?? [];
          const next: FitnessRecord = {
            id: rec?.id ?? newId("f"),
            name: fname.trim(),
            value: value.trim(),
            date,
          };
          const fitness = rec ? list.map((f) => (f.id === rec.id ? next : f)) : [next, ...list];
          board.updatePlayer({ ...p, fitness });
          board.openSheet({ type: "playerDetail", playerId });
        }}
      >
        保存する
      </button>
    </>
  );
}

/* ---------------- Injury record form ---------------- */
function InjuryForm({ playerId, injuryId }: { playerId: string; injuryId?: string }) {
  const board = useBoard();
  const p = board.state.players.find((x) => x.id === playerId);
  const rec = p?.injuries?.find((i) => i.id === injuryId);
  const [date, setDate] = useState(rec?.date ?? new Date().toISOString().slice(0, 10));
  const [area, setArea] = useState(rec?.area ?? "");
  const [status, setStatus] = useState<InjuryStatus>(rec?.status ?? "recovering");
  const [note, setNote] = useState(rec?.note ?? "");
  if (!p) return null;

  return (
    <>
      <h2>{rec ? "怪我履歴を編集" : "怪我を追加"}</h2>
      <div className="formgrid">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>受傷日</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>状態</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as InjuryStatus)}>
            <option value="out">離脱中</option>
            <option value="recovering">復帰途上</option>
            <option value="ok">完治</option>
          </select>
        </div>
      </div>
      <div className="formfield">
        <label>部位・内容</label>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例）右足首 捻挫" />
      </div>
      <div className="formfield">
        <label>メモ（復帰予定など）</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）来週フル合流予定" />
      </div>
      <button
        className="bigbtn"
        onClick={() => {
          if (!area.trim()) {
            board.toast("部位・内容を入力してください");
            return;
          }
          const list = p.injuries ?? [];
          const next: InjuryRecord = {
            id: rec?.id ?? newId("inj"),
            date,
            area: area.trim(),
            status,
            note: note.trim() || undefined,
          };
          const injuries = rec ? list.map((i) => (i.id === rec.id ? next : i)) : [next, ...list];
          board.updatePlayer({ ...p, injuries });
          board.openSheet({ type: "playerDetail", playerId });
        }}
      >
        保存する
      </button>
    </>
  );
}

/* ---------------- Formation picker ---------------- */
function FormationSheet() {
  const board = useBoard();
  return (
    <>
      <h2>
        フォーメーション <span>現在 {board.state.formation}</span>
      </h2>
      <div className="formgridsel">
        {FORMATION_KEYS.map((f) => (
          <button
            key={f}
            className={`fcell${f === board.state.formation ? " on" : ""}`}
            onClick={() => {
              if (f !== board.state.formation) board.setFormation(f);
              board.closeSheet();
              board.toast(`フォーメーションを ${f} に変更`);
            }}
          >
            {f}
          </button>
        ))}
      </div>
      <p className="planseote" style={{ paddingTop: 4 }}>
        ※ 配置中の選手は引き継がれます（枠ごとに移動）。
      </p>
    </>
  );
}

/* ---------------- More menu ---------------- */
function MoreSheet() {
  const board = useBoard();
  return (
    <>
      <h2>メニュー</h2>
      <div className="menu">
        <div className="mitem" onClick={() => board.openSheet({ type: "roster" })}>
          <div className="mi"><IconUsers /></div> 名簿（選手プロフィール）
        </div>
        <div
          className="mitem"
          onClick={() => {
            board.setScreen("drill");
            board.closeSheet();
          }}
        >
          <div className="mi"><IconCone /></div> 練習メニュー（ドリル図）
        </div>
        <div
          className="mitem"
          onClick={() => {
            board.setScreen("team");
            board.closeSheet();
          }}
        >
          <div className="mi"><IconCalendarCheck /></div> チーム（出欠・連絡）
        </div>
        <div className="mitem" onClick={() => board.openSheet({ type: "articles" })}>
          <div className="mi"><IconBook /></div> お役立ち記事
        </div>
        <div className="mitem" onClick={() => board.openSheet({ type: "settings" })}>
          <div className="mi"><IconCog /></div> 設定（チーム・プラン）
          <span style={{ marginLeft: "auto", color: "var(--lime)", fontWeight: 700, fontSize: 13 }}>
            {PLAN_INFO[board.plan].name}
          </span>
        </div>
        <div
          className="mitem danger"
          onClick={() => {
            board.closeSheet();
            window.dispatchEvent(new Event("alfa-logout"));
          }}
        >
          <div className="mi"><IconLogout /></div> ログアウト
        </div>
      </div>
    </>
  );
}

/* ---------------- Save as ---------------- */
/* ---------------- Chat（戦術・トレーニング・画像・動画の送信） ---------------- */
function ChatSheet({ to }: { to: string }) {
  const board = useBoard();
  const title =
    to === "team"
      ? "チーム全員"
      : board.state.players.find((p) => "p:" + p.id === to)?.name ?? "メッセージ";
  return (
    <div className="chatsheet">
      <h2 className="chathead">{title}</h2>
      <ChatThread to={to} />
    </div>
  );
}

function SaveSheet() {
  const board = useBoard();
  const n = board.library.plays.length;
  const [title, setTitle] = useState(
    board.currentPlayTitle ?? `戦術 ${n + 1}`
  );
  const [folderId, setFolderId] = useState<string | null>(null);
  const [target, setTarget] = useState<SendTarget>({ mode: "none" });
  const threadKey = targetThreadKey(target);

  const sendPlay = () => {
    if (!threadKey) return;
    const play = board.snapshotPlay(title);
    board.sendMessage({
      to: threadKey,
      from: "coach",
      fromName: "スタッフ",
      attachments: [{ kind: "play", title: play.title, play }],
    });
  };

  return (
    <>
      <h2>
        戦術を保存・送信 <span>保存 {n}件</span>
      </h2>
      <div className="formfield">
        <label>タイトル</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      {board.library.folders.length > 0 && (
        <div className="formfield">
          <label>フォルダ</label>
          <select
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value || null)}
          >
            <option value="">未分類</option>
            {board.library.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <SendTargetField
        players={board.state.players}
        value={target}
        onChange={setTarget}
      />

      <button
        className="bigbtn"
        onClick={() => {
          if (board.savePlay(title, folderId)) {
            if (threadKey) sendPlay();
            board.closeSheet();
          }
        }}
      >
        {threadKey ? "保存して送信する" : "新しく保存する"}
      </button>

      {threadKey && (
        <button
          className="bigbtn ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            sendPlay();
            board.closeSheet();
          }}
        >
          保存せずに送信する
        </button>
      )}
    </>
  );
}

/* ---------------- Library ---------------- */
function PlayRow({ play }: { play: SavedPlay }) {
  const board = useBoard();
  const coach = true; // フォルダ機能は全プラン共通
  const date = new Date(play.updatedAt).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className={`playrow${board.currentPlayId === play.id ? " cur" : ""}`}>
      <div className="playmain" onClick={() => board.loadPlay(play.id)}>
        <div className="playtitle">{play.title}</div>
        <div className="playsub">
          {play.formation} ・ {play.moves.length}本のルート ・ {date}
        </div>
      </div>
      <div className="playacts">
        {coach && board.library.folders.length > 0 && (
          <select
            value={play.folderId ?? ""}
            onChange={(e) => board.movePlayToFolder(play.id, e.target.value || null)}
            title="フォルダ移動"
          >
            <option value="">未分類</option>
            {board.library.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        <button
          title="名前を変更"
          onClick={() => {
            const t = window.prompt("新しいタイトル", play.title);
            if (t != null) board.renamePlay(play.id, t);
          }}
        >
          <E n="pencil" />
        </button>
        <button title="複製" onClick={() => board.duplicatePlay(play.id)}>
          <E n="copy" />
        </button>
        <button
          title="削除"
          onClick={() => {
            if (window.confirm(`「${play.title}」を削除しますか？`))
              board.deletePlay(play.id);
          }}
        >
          <E n="trash" />
        </button>
      </div>
    </div>
  );
}

function DrillRow({ drill }: { drill: SavedDrill }) {
  const board = useBoard();
  const date = new Date(drill.updatedAt).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="playrow">
      <div
        className="playmain"
        onClick={() => {
          board.setDrillIntent({ open: drill.id });
          board.setScreen("drill");
          board.closeSheet();
        }}
      >
        <div className="playtitle">{drill.title}</div>
        <div className="playsub">
          {PITCH_LABEL[drill.pitchType] ?? "ピッチ"} ・ 配置{drill.items?.length ?? 0}個 ・ 動線
          {drill.lines?.length ?? 0}本 ・ {date}
        </div>
      </div>
    </div>
  );
}

export function LibraryBody({
  tab,
  onTabChange,
}: {
  tab: "plays" | "drills";
  onTabChange: (t: "plays" | "drills") => void;
}) {
  const board = useBoard();
  const coach = true; // フォルダ機能は全プラン共通
  const setTab = onTabChange;
  const plays = [...board.library.plays].sort((a, b) => b.updatedAt - a.updatedAt);
  const unfiled = plays.filter((p) => !p.folderId || !coach);
  // DrillProvider は DrillEditor 内部にマウントされておりグローバルシートからは
  // useDrill() が使えないため localStorage から直接読む。
  // 練習タブを開いたときだけ読む（PC専用タブなのでモバイルでは一度も走らない）
  const sortedDrills = useMemo(
    () =>
      tab === "drills"
        ? [...loadDrills()].sort((a, b) => b.updatedAt - a.updatedAt)
        : [],
    [tab]
  );

  return (
    <>
      <div className="libtabs">
        <button className={`libtab${tab === "plays" ? " on" : ""}`} onClick={() => setTab("plays")}>
          戦術
        </button>
        <button className={`libtab${tab === "drills" ? " on" : ""}`} onClick={() => setTab("drills")}>
          練習
        </button>
      </div>
      {tab === "plays" ? (
        <>
          <h2>
            保存した戦術 <span>{board.library.plays.length}件</span>
          </h2>
          <div className="controls" style={{ display: "flex", gap: 8 }}>
            <button
              className="bigbtn"
              style={{ margin: 0, flex: 1, width: "auto" }}
              onClick={board.newPlay}
            >
              ＋ 新規作成
            </button>
            <button
              className="bigbtn ghost"
              style={{ margin: 0, flex: 1, width: "auto" }}
              onClick={() => {
                const n = window.prompt("フォルダ名");
                if (n) board.createFolder(n);
              }}
            >
              ＋ フォルダ
            </button>
          </div>
          <div className="list">
            {plays.length === 0 ? (
              <div className="empty-msg">
                まだ保存された戦術はありません。
                <br />
                盤面を作って上部の保存ボタンで保存しましょう。
              </div>
            ) : (
              <>
                {coach &&
                  board.library.folders.map((f) => {
                    const fp = plays.filter((p) => p.folderId === f.id);
                    return (
                      <div key={f.id}>
                        <div className="folderhdr">
                          <E n="folder" /> {f.name}
                          <button onClick={() => board.deleteFolder(f.id)}>削除</button>
                        </div>
                        {fp.length === 0 ? (
                          <div className="folderempty">（空）</div>
                        ) : (
                          fp.map((p) => <PlayRow key={p.id} play={p} />)
                        )}
                      </div>
                    );
                  })}
                {coach && board.library.folders.length > 0 && (
                  <div className="folderhdr"><E n="folderopen" /> 未分類</div>
                )}
                {unfiled.map((p) => (
                  <PlayRow key={p.id} play={p} />
                ))}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <h2>
            保存した練習 <span>{sortedDrills.length}件</span>
          </h2>
          <div className="list">
            {sortedDrills.length === 0 ? (
              <div className="empty-msg">まだ保存された練習メニューはありません。</div>
            ) : (
              sortedDrills.map((d) => <DrillRow key={d.id} drill={d} />)
            )}
          </div>
          <div className="libhint">
            サムネイル表示・削除・名前の変更は練習メニュー画面のライブラリで行えます。
          </div>
          <div className="controls" style={{ display: "flex" }}>
            <button
              className="bigbtn ghost"
              style={{ margin: 0, flex: 1, width: "auto" }}
              onClick={() => {
                board.setDrillIntent("library");
                board.setScreen("drill");
                board.closeSheet();
              }}
            >
              練習メニュー画面のライブラリを開く
            </button>
          </div>
        </>
      )}
    </>
  );
}

function LibrarySheet() {
  const [tab, setTab] = useState<"plays" | "drills">("plays");
  return <LibraryBody tab={tab} onTabChange={setTab} />;
}

/* ---------------- Share / export ---------------- */
/** YYYYMMDD形式の日付文字列（ファイル名用） */
function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function ShareSheet() {
  const board = useBoard();
  const img = useMemo(() => {
    try {
      return renderTacticPng(board.state);
    } catch {
      return "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const url = useMemo(() => buildShareUrl(board.buildShareSnapshot()), [board]);
  const text = `${board.state.teamName ?? "マイチーム"} の戦術${
    board.currentPlayTitle ? `「${board.currentPlayTitle}」` : ""
  }`;
  // アニメ書き出しの進捗（null=待機中、0-1=書き出し中）
  const [gifBusy, setGifBusy] = useState<number | null>(null);
  const [webmBusy, setWebmBusy] = useState<number | null>(null);

  const fileBase = board.currentPlayTitle ? board.currentPlayTitle : `戦術_${dateStamp()}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      board.toast("リンクをコピーしました");
    } catch {
      window.prompt("このリンクをコピーしてください", url);
    }
  };

  const saveGif = async () => {
    if (gifBusy != null) return;
    if (board.state.moves.length === 0) {
      board.toast("アニメがありません。先にルートを描いてください");
      return;
    }
    setGifBusy(0);
    try {
      const blob = await exportGif(board.state, (p) => setGifBusy(p));
      downloadBlob(blob, `${fileBase}.gif`);
      board.toast("GIFを書き出しました");
    } catch {
      board.toast("GIFの書き出しに失敗しました");
    } finally {
      setGifBusy(null);
    }
  };

  const saveWebm = async () => {
    if (webmBusy != null) return;
    if (board.state.moves.length === 0) {
      board.toast("アニメがありません。先にルートを描いてください");
      return;
    }
    if (!canExportWebm()) {
      board.toast("このブラウザは動画出力に未対応です（Chrome/Edge推奨）");
      return;
    }
    setWebmBusy(0);
    try {
      const blob = await exportWebm(board.state, (p) => setWebmBusy(p));
      downloadBlob(blob, `${fileBase}.webm`);
      board.toast("動画を書き出しました");
    } catch {
      board.toast("動画の書き出しに失敗しました");
    } finally {
      setWebmBusy(null);
    }
  };

  const printOrPdf = () => {
    if (!openPrintView(board.state, board.currentPlayTitle)) {
      board.toast("ポップアップを許可してください");
    }
  };

  return (
    <>
      <h2>共有・出力</h2>
      {img && (
        <div className="shareprev">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="フォーメーション画像" />
        </div>
      )}
      <button
        className="bigbtn"
        onClick={() => img && downloadDataUrl(img, "tactics.png")}
      >
        画像を保存（PNG）
      </button>
      <button className="bigbtn ghost" onClick={copy}>
        リンクをコピー
      </button>
      <button
        className="bigbtn ghost"
        onClick={() => window.open(buildLineUrl(text, url), "_blank")}
      >
        LINEで送る
      </button>
      <button className="bigbtn ghost" disabled={gifBusy != null} onClick={saveGif}>
        {gifBusy != null ? `書き出し中… ${Math.round(gifBusy * 100)}%` : "GIFで保存（アニメ）"}
      </button>
      <button className="bigbtn ghost" disabled={webmBusy != null} onClick={saveWebm}>
        {webmBusy != null ? `書き出し中… ${Math.round(webmBusy * 100)}%` : "動画で保存（WebM）"}
      </button>
      <button className="bigbtn ghost" onClick={printOrPdf}>
        印刷・PDF
      </button>
    </>
  );
}

/* ---------------- Settings（チーム設定＋プラン） ---------------- */
export function SettingsBody({ hideTitle }: { hideTitle?: boolean } = {}) {
  const board = useBoard();
  const cur = board.plan;
  const [annual, setAnnual] = useState(false);
  const [name, setName] = useState(board.state.teamName ?? "");
  const unit = annual ? "/年" : "/月";
  // 画面版は長時間表示されるため、外部でチーム名が変わったら入力欄も追随させる
  // （追随しないと onBlur で古い値に巻き戻してしまう）
  useEffect(() => {
    setName(board.state.teamName ?? "");
  }, [board.state.teamName]);

  const emblemInput = useRef<HTMLInputElement | null>(null);
  async function onEmblemFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToEmblemDataUrl(file);
      // 保存に失敗しても表示だけ変わる（リロードで消える）ので、成否で文言を変える
      const saved = board.setTeamLogo(dataUrl);
      board.toast(
        saved
          ? "エンブレムを更新しました"
          : "保存容量が足りません。小さい画像をお試しください"
      );
    } catch (err) {
      board.toast(err instanceof Error ? err.message : "画像の読み込みに失敗しました");
    }
  }

  return (
    <>
      {!hideTitle && <h2>設定</h2>}
      <div className="formfield">
        <label>チーム名</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => board.setTeamName(name.trim())}
          placeholder="例）アルファラスFC U-12"
        />
      </div>
      <div className="formfield">
        <label id="emblem-label">クラブエンブレム</label>
        <div className="emblemrow" role="group" aria-labelledby="emblem-label">
          {board.teamLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="emblemprev" src={board.teamLogo} alt="" />
          ) : (
            <div className="emblemprev empty" aria-hidden="true">
              {(board.state.teamName ?? "マイチーム").trim().charAt(0)}
            </div>
          )}
          <button
            type="button"
            className="formbtn"
            onClick={() => emblemInput.current?.click()}
          >
            <span className="fb-label">画像を選ぶ</span>
          </button>
          {board.teamLogo && (
            <button
              type="button"
              className="formbtn danger"
              onClick={() => {
                // 元に戻すには再アップロードが必要なため確認する（このアプリの破壊的操作の作法）
                if (!window.confirm("エンブレムを削除しますか？")) return;
                board.setTeamLogo(null);
                board.toast("エンブレムを削除しました");
              }}
            >
              <span className="fb-label">削除</span>
            </button>
          )}
        </div>
        <div className="fieldhint">
          レール上部と設定に表示されます。正方形の画像（PNG/JPG）を推奨します。
        </div>
        <input
          ref={emblemInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={onEmblemFile}
        />
      </div>
      <div className="formfield">
        <label>選手ログイン用の共通パスワード</label>
        <input
          value={board.playerPassword}
          onChange={(e) => board.setPlayerPassword(e.target.value)}
          placeholder="選手に共有するパスワード"
        />
        <div className="fieldhint">
          選手は「自分のメールアドレス＋この共通パスワード」でログインします。
        </div>
      </div>
      <div className="setsec-h">公開設定</div>
      <label className="pubtoggle" style={{ margin: "0 16px 12px" }}>
        <span>試合記録を選手・保護者に公開</span>
        <input
          type="checkbox"
          checked={board.matchesPublic}
          onChange={(e) => board.setMatchesPublic(e.target.checked)}
        />
        <i className="switch" />
      </label>
      <div className="setsec-h">プラン</div>
      <div className="trialbanner"><E n="gift" /> 30日間の無料トライアル中（全機能をお試しいただけます）</div>
      <div className="planlede">
        安全設計・出席率の可視化・サッカーノート・戦術配信は<b>全プラン共通</b>。
        プランの違いは「規模」（チーム数・選手数・コーチ席数）だけです。
      </div>
      <div className="billtoggle">
        <button className={annual ? "" : "on"} onClick={() => setAnnual(false)}>
          月払い
        </button>
        <button className={annual ? "on" : ""} onClick={() => setAnnual(true)}>
          年払い（2ヶ月お得）
        </button>
      </div>
      <div className="plans col">
        {PLAN_ORDER.map((tier) => {
          const p = PLAN_INFO[tier];
          const yen = annual ? p.annual : p.monthly;
          return (
            <div key={tier} className={`plancard${cur === tier ? " on" : ""}`}>
              <div className="pcname">
                {p.name}
                {tier === "standard" && <span className="pcbadge">人気</span>}
              </div>
              <div className="pchint">{p.target}</div>
              <div className="pcprice">
                ¥{yen.toLocaleString()}
                <small>{unit}</small>
              </div>
              <ul className="pcscale">
                <li>チーム数：{p.teams}</li>
                <li>選手数：{p.players}</li>
                <li>コーチ席：{p.seats}</li>
              </ul>
              {cur === tier ? (
                <div className="pcnow">利用中</div>
              ) : (
                <button
                  className="bigbtn"
                  onClick={() => {
                    board.setPlan(tier);
                    board.toast(`${p.name}プランに切り替えました（デモ）`);
                  }}
                >
                  {p.name}にする
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="planseote">
        ※ 全機能・データ保存は全プラン共通。違いは規模（上限超過時は上位プランへ）。
        <br />
        ※ 年払いは月額の10ヶ月分（2ヶ月分お得）。
        <br />
        ※ 月額＝カード決済。年額＝カード／請求書払い・銀行振込に対応（学校・部活の校費に対応）。
        <br />
        ※ これはデモ用のプラン切替です。実際の課金は行われません。
      </p>
    </>
  );
}

function SettingsSheet() {
  return <SettingsBody />;
}

/* ---------------- Articles ---------------- */
export function ArticlesBody({
  onOpen,
  cat: catProp,
  onCatChange,
  hideTitle,
}: {
  onOpen: (articleId: string) => void;
  /** 絞り込みを親で保持したいとき（画面版は詳細から戻っても維持する）。未指定なら内部state */
  cat?: string;
  onCatChange?: (c: string) => void;
  hideTitle?: boolean;
}) {
  const [catLocal, setCatLocal] = useState<string>("all");
  const cat = catProp ?? catLocal;
  const setCat = onCatChange ?? setCatLocal;
  const cats = Array.from(new Set(ARTICLES.map((a) => a.category)));
  const list = cat === "all" ? ARTICLES : ARTICLES.filter((a) => a.category === cat);
  return (
    <>
      {!hideTitle && (
        <h2>
          お役立ち記事 <span>{list.length}本</span>
        </h2>
      )}
      <div className="catbar">
        <button className={`catchip${cat === "all" ? " on" : ""}`} onClick={() => setCat("all")}>
          すべて
        </button>
        {cats.map((c) => (
          <button
            key={c}
            className={`catchip${cat === c ? " on" : ""}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="list">
        {list.map((a) => (
          <div
            key={a.id}
            className="artrow"
            onClick={() => onOpen(a.id)}
          >
            <span className="artcat">{a.category}</span>
            <div className="artmeta">
              <div className="arttitle">{a.title}</div>
              <div className="artlead">{a.lead}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ArticlesSheet() {
  const board = useBoard();
  return <ArticlesBody onOpen={(id) => board.openSheet({ type: "article", articleId: id })} />;
}

export function ArticleBody({ articleId }: { articleId?: string }) {
  const a = ARTICLES.find((x) => x.id === articleId);
  if (!a) return null;
  return (
    <>
      <h2 style={{ display: "block" }}>
        <span className="artcat" style={{ marginLeft: 0 }}>{a.category}</span>
        <div style={{ marginTop: 8 }}>{a.title}</div>
      </h2>
      <div className="artbody">
        {a.body.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </>
  );
}

function ArticleSheet({ articleId }: { articleId?: string }) {
  return <ArticleBody articleId={articleId} />;
}

/* ---------------- Import shared ---------------- */
function ImportSheet() {
  const board = useBoard();
  const snap = board.pendingImport;
  if (!snap) return null;
  const placed = snap.slots.filter((s) => s.p).length;
  return (
    <>
      <h2>共有された戦術</h2>
      <div className="importbox">
        <div className="impname">{snap.teamName ?? "共有チーム"}</div>
        <div className="impsub">
          {snap.title ? `「${snap.title}」 ・ ` : ""}
          {snap.formation} ・ 配置 {placed}人
        </div>
      </div>
      <p className="planseote" style={{ margin: "0 16px 8px" }}>
        ※ 読み込むと、現在編集中のボードはこの共有内容に置き換わります（保存済みの戦術は残ります）。
      </p>
      <button className="bigbtn" onClick={board.applyImport}>
        この戦術を読み込む
      </button>
      <button className="bigbtn ghost" onClick={board.closeSheet}>
        キャンセル
      </button>
    </>
  );
}

/* ---------------- Manager ---------------- */
export default function SheetManager() {
  const board = useBoard();
  const { sheet } = board;
  const open = sheet.type !== null;

  let content: React.ReactNode = null;
  switch (sheet.type) {
    case "assign":
      content = <AssignSheet slot={sheet.slot!} />;
      break;
    case "slotMenu":
      content = <SlotMenu slot={sheet.slot!} />;
      break;
    case "oppMenu":
      content = <OppMenu index={sheet.opp!} />;
      break;
    case "roster":
      content = <RosterSheet />;
      break;
    case "playerForm":
      content = <PlayerForm player={sheet.player} assignSlot={sheet.assignSlot} />;
      break;
    case "playerDetail":
      content = <PlayerDetail playerId={sheet.playerId!} />;
      break;
    case "fitness":
      content = <FitnessForm playerId={sheet.playerId!} fitnessId={sheet.fitnessId} />;
      break;
    case "injuryEdit":
      content = <InjuryForm playerId={sheet.playerId!} injuryId={sheet.injuryId} />;
      break;
    case "settings":
      content = <SettingsSheet />;
      break;
    case "articles":
      content = <ArticlesSheet />;
      break;
    case "article":
      content = <ArticleSheet articleId={sheet.articleId} />;
      break;
    case "formation":
      content = <FormationSheet />;
      break;
    case "more":
      content = <MoreSheet />;
      break;
    case "save":
      content = <SaveSheet />;
      break;
    case "library":
      content = <LibrarySheet />;
      break;
    case "share":
      content = <ShareSheet />;
      break;
    case "importShared":
      content = <ImportSheet />;
      break;
    case "chat":
      content = <ChatSheet to={sheet.chatTo ?? "team"} />;
      break;
    case "kpi":
      content = <KpiSheet metric={sheet.kpiMetric ?? "attendance"} />;
      break;
    case "stat":
      content = <StatSheet metric={sheet.statMetric ?? "record"} />;
      break;
  }

  // 名簿・記事・選手プロフィール・設定などは全画面表示＋戻るボタン
  const FULL: string[] = [
    "roster",
    "playerDetail",
    "playerForm",
    "fitness",
    "injuryEdit",
    "settings",
    "articles",
    "article",
    "chat",
  ];
  const full = !!sheet.type && FULL.includes(sheet.type);

  const onBack = (): void => {
    switch (sheet.type) {
      case "playerDetail":
        // KPI/スタッツ内訳から開いた場合は内訳へ戻す（名簿に飛ばすと並び順と文脈を失う）
        if (sheet.kpiMetric) board.openSheet({ type: "kpi", kpiMetric: sheet.kpiMetric });
        else if (sheet.statMetric) board.openSheet({ type: "stat", statMetric: sheet.statMetric });
        else board.openSheet({ type: "roster" });
        break;
      case "playerForm":
        if (sheet.player) board.openSheet({ type: "playerDetail", playerId: sheet.player.id });
        else if (sheet.assignSlot != null) board.openSheet({ type: "assign", slot: sheet.assignSlot });
        else board.openSheet({ type: "roster" });
        break;
      case "fitness":
      case "injuryEdit":
        board.openSheet({ type: "playerDetail", playerId: sheet.playerId });
        break;
      case "article":
        board.openSheet({ type: "articles" });
        break;
      default:
        board.closeSheet();
    }
  };

  return (
    <Sheet open={open} onClose={board.closeSheet} full={full} onBack={full ? onBack : undefined}>
      {content}
    </Sheet>
  );
}
