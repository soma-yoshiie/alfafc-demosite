"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { LeagueResult, LeagueRow } from "@/lib/types";
import { rowsFromResults } from "@/lib/sampleLeague";
import {
  LEAGUE_NUM_KEYS,
  LEAGUE_NUM_LABEL,
  leagueDraftResultsLoose,
  leagueDraftRows,
  parseLeagueInt,
  type LeagueDraftRow,
  type LeagueResultDraft,
} from "@/lib/leagueDraft";
import { useBoard } from "../../BoardProvider";
import { useTeam } from "../../TeamProvider";
import { IconTrash } from "../../icons";
import type { ManageProps } from "./types";

/**
 * 順位表の編集（p14 §3-4。名称・チームごとの勝/分/敗/得点/失点。順位・試合数・勝点は自動計算）。
 * TeamHub の管理シートと設定の下層で同じ中身を出す。開くたびに部品が作り直されるので、
 * 初期値は開いた時点の順位表（並びは今の順位順）。数値は文字列で持ち、保存時に検証して数値にする。
 * 保存したあとは onSaved（チーム運営＝閉じる／戻る、設定のスマホ＝一覧へ、PC＝そのまま）。
 * onDirty：下書きが保存値（開いた時点、または直前に保存した内容）と違うとき true。
 */
export function LeagueEdit({ hideTitle, onSaved, onDirty }: ManageProps) {
  const board = useBoard();
  const team = useTeam();
  const lgOwnName = board.state.teamName ?? "マイチーム";
  const [lgTitle, setLgTitle] = useState(() => team.league.title ?? "");
  const [lgRows, setLgRows] = useState<LeagueDraftRow[]>(() => leagueDraftRows(team.league, lgOwnName));
  // p16 §6-2: 入力の方法（開いたときは保存済みの mode。未定義は数値）と試合結果の下書き。取り込む大会は既定「すべての大会」
  const [lgMode, setLgMode] = useState<"manual" | "results">(() =>
    team.league.mode === "results" ? "results" : "manual"
  );
  const [lgResults, setLgResults] = useState<LeagueResultDraft[]>(() =>
    team.league.mode === "results"
      ? (team.league.results ?? []).map((m) => ({
          id: m.id,
          aId: m.aId,
          bId: m.bId,
          aScore: String(m.aScore),
          bScore: String(m.bScore),
          date: m.date ?? "",
          ...(m.matchId ? { matchId: m.matchId } : {}),
        }))
      : []
  );
  const [lgImportComp, setLgImportComp] = useState("all");
  // 「数値 → 結果」へ切り替えた直後の注意を出す印
  const [lgWarn, setLgWarn] = useState(false);
  // 結果から数えた各チームの 勝-分-敗（結果の入力中に右へ出す。読み取り専用）
  const lgCounted = rowsFromResults(
    lgRows.map((r) => ({ id: r.id, name: r.name, win: 0, draw: 0, loss: 0, gf: 0, ga: 0 })),
    leagueDraftResultsLoose(lgResults)
  );
  const lgChangeMode = (next: "manual" | "results") => {
    if (next === lgMode) return;
    // 結果 → 数値: 数値の欄へその時点の結果から数えた値を入れる（結果の下書きは残す）。
    // 結果が 1 件も無いときは、手で入れた数値を 0 で潰さないよう触らない
    if (next === "manual" && leagueDraftResultsLoose(lgResults).length > 0) {
      const byId = new Map(lgCounted.map((r) => [r.id, r]));
      setLgRows((rows) =>
        rows.map((r) => {
          const c = byId.get(r.id);
          return c
            ? { ...r, win: String(c.win), draw: String(c.draw), loss: String(c.loss), gf: String(c.gf), ga: String(c.ga) }
            : r;
        })
      );
    }
    setLgWarn(next === "results");
    setLgMode(next);
  };
  const lgResPatch = (id: string, patch: Partial<LeagueResultDraft>) =>
    setLgResults((rs) => rs.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const lgDeleteTeam = (id: string) => {
    const n = lgResults.filter((m) => m.aId === id || m.bId === id).length;
    if (n > 0 && !window.confirm(`このチームの試合結果（${n} 件）も削除されます。よろしいですか？`)) return;
    setLgRows((rows) => rows.filter((x) => x.id !== id));
    if (n > 0) setLgResults((rs) => rs.filter((m) => m.aId !== id && m.bId !== id));
  };
  // 試合記録から取り込む: 相手名がチーム一覧の名前と一致（trim 後の完全一致）し、まだ取り込んでいない記録だけ
  const lgImportMatches = () => {
    const own = lgRows.find((r) => r.own);
    if (!own) return;
    const taken = new Set(lgResults.map((m) => m.matchId).filter(Boolean));
    const added: LeagueResultDraft[] = [];
    let missed = 0;
    for (const m of team.team.matches) {
      if (lgImportComp !== "all" && m.competitionId !== lgImportComp) continue;
      if (taken.has(m.id)) continue;
      const opp = lgRows.find((r) => !r.own && r.name.trim() !== "" && r.name.trim() === m.opponent.trim());
      if (!opp) {
        missed += 1;
        continue;
      }
      lgSeq.current += 1;
      added.push({
        id: "lgr_" + Date.now().toString(36) + "_" + lgSeq.current,
        aId: own.id,
        bId: opp.id,
        aScore: String(m.ourScore),
        bScore: String(m.theirScore),
        date: m.date,
        matchId: m.id,
      });
    }
    if (added.length > 0) setLgResults((rs) => [...rs, ...added]);
    // p16 レビュー: 0 件のときは「取り込める試合記録がありません」（取り込めない記録があればその件数を続ける）
    const missedNote = missed > 0 ? `（相手がチーム一覧に無い ${missed} 件は取り込めません）` : "";
    board.toast(
      added.length === 0 ? `取り込める試合記録がありません${missedNote}` : `${added.length} 件を取り込みました${missedNote}`
    );
  };
  // 「＋ チームを追加」直後の行（チーム名にフォーカスを移す）
  const [lgFocusId, setLgFocusId] = useState<string | null>(null);
  const lgNameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lgSeq = useRef(0);
  useEffect(() => {
    if (!lgFocusId) return;
    lgNameRefs.current[lgFocusId]?.focus();
    setLgFocusId(null);
  }, [lgFocusId]);
  const lgPatch = (id: string, patch: Partial<LeagueDraftRow>) =>
    setLgRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const saveLeague = () => {
    // 検証: チーム名（自チームの行は対象外）→ 数値（空欄＝0。0 以上の整数だけ）
    if (lgRows.some((r) => !r.own && !r.name.trim())) {
      board.toast("チーム名を入力してください");
      return;
    }
    if (lgMode === "results") {
      // p16 レビュー: 結果が 0 件のまま保存すると全チームの数値が 0 に置き換わる（切り替えて見ただけで手入力が消える）ので止める
      if (lgResults.length === 0) {
        board.toast("試合結果を 1 件以上入れてください");
        return;
      }
      // p16 §6-2: 試合結果から数え直した値を rows に入れ、results と mode も一緒に保存する
      const results: LeagueResult[] = [];
      for (const m of lgResults) {
        if (!m.aId || !m.bId || m.aId === m.bId) {
          board.toast("試合結果のチームを選んでください（同じチームどうしは入力できません）");
          return;
        }
        const aScore = parseLeagueInt(m.aScore);
        const bScore = parseLeagueInt(m.bScore);
        if (aScore == null || bScore == null) {
          board.toast("数値は 0 以上の整数で入力してください");
          return;
        }
        results.push({
          id: m.id,
          aId: m.aId,
          bId: m.bId,
          aScore,
          bScore,
          ...(m.date ? { date: m.date } : {}),
          ...(m.matchId ? { matchId: m.matchId } : {}),
        });
      }
      const base: LeagueRow[] = lgRows.map((r) => ({
        id: r.id,
        name: r.own ? lgOwnName : r.name.trim(),
        win: 0,
        draw: 0,
        loss: 0,
        gf: 0,
        ga: 0,
        ...(r.own ? { own: true as const } : {}),
      }));
      team.setLeague({ title: lgTitle.trim() || undefined, rows: rowsFromResults(base, results), mode: "results", results });
      afterSave();
      return;
    }
    const rows: LeagueRow[] = [];
    for (const r of lgRows) {
      const nums = LEAGUE_NUM_KEYS.map((k) => parseLeagueInt(r[k]));
      if (nums.some((n) => n == null)) {
        board.toast("数値は 0 以上の整数で入力してください");
        return;
      }
      const [win, draw, loss, gf, ga] = nums as number[];
      rows.push({
        id: r.id,
        name: r.own ? lgOwnName : r.name.trim(),
        win,
        draw,
        loss,
        gf,
        ga,
        ...(r.own ? { own: true as const } : {}),
      });
    }
    team.setLeague({ title: lgTitle.trim() || undefined, rows, mode: "manual" });
    afterSave();
  };

  // 未保存の判定: 開いた時点（保存したら保存した内容）の下書きと今の下書きを比べる
  const lgSnap = JSON.stringify({ t: lgTitle.trim(), m: lgMode, r: lgRows, s: lgResults });
  const lgBase = useRef<string | null>(null);
  if (lgBase.current === null) lgBase.current = lgSnap;
  const [, lgRerender] = useReducer((n: number) => n + 1, 0);
  const lgDirty = lgBase.current !== lgSnap;
  useEffect(() => {
    onDirty?.(lgDirty);
  }, [lgDirty, onDirty]);
  // アンマウント（閉じた・別の画面へ移った）ときは未保存なしに戻す
  useEffect(() => () => onDirty?.(false), [onDirty]);
  // 保存に成功したあと: 今の下書きを「保存済み」にして、親へ知らせる
  const afterSave = () => {
    lgBase.current = lgSnap;
    lgRerender();
    onSaved?.();
  };

  return (
    <>
      {!hideTitle && <h2>順位表を編集</h2>}
      <div className="formfield">
        <label>名称</label>
        <input
          value={lgTitle}
          onChange={(e) => setLgTitle(e.target.value)}
          placeholder="リーグ順位表（例：春季リーグ U-12）"
        />
      </div>
      {/* p16 §6-2: 入力の方法（RecSummaryPane の「チーム成績｜個人成績」と同じ .toolseg/.tseg） */}
      <div className="formfield">
        <label>入力の方法</label>
        <div className="toolseg lgedit-modeseg" role="tablist" aria-label="入力の方法">
          <button
            type="button"
            role="tab"
            aria-selected={lgMode === "manual"}
            className={`tseg${lgMode === "manual" ? " on" : ""}`}
            onClick={() => lgChangeMode("manual")}
          >
            数値を入力
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lgMode === "results"}
            className={`tseg${lgMode === "results" ? " on" : ""}`}
            onClick={() => lgChangeMode("results")}
          >
            試合結果を入力
          </button>
        </div>
      </div>
      {lgMode === "results" && <div className="sech lgedit-sech">チーム</div>}
      <div className="lgedit">
        {lgRows.map((r) => (
          <div key={r.id} className="lgedit-row">
            <div className="lgedit-top">
              {r.own ? (
                <div className="lgedit-name lgedit-ownname">
                  <b>{lgOwnName}</b>
                  <span className="phubtag lgedit-own">自チーム</span>
                </div>
              ) : (
                <div className="formfield lgedit-name">
                  <input
                    ref={(el) => {
                      lgNameRefs.current[r.id] = el;
                    }}
                    value={r.name}
                    onChange={(e) => lgPatch(r.id, { name: e.target.value })}
                    placeholder="チーム名"
                    aria-label="チーム名"
                  />
                </div>
              )}
              {lgMode === "results" &&
                (() => {
                  const c = lgCounted.find((x) => x.id === r.id);
                  return c ? <span className="lgedit-sum" title="結果から数えた 勝-分-敗">{`${c.win}-${c.draw}-${c.loss}`}</span> : null;
                })()}
              {!r.own && (
                <button
                  type="button"
                  className="lgedit-del"
                  aria-label="このチームを削除"
                  title="このチームを削除"
                  onClick={() => lgDeleteTeam(r.id)}
                >
                  <IconTrash />
                </button>
              )}
            </div>
            {lgMode === "manual" && (
              <div className="lgedit-nums">
                {LEAGUE_NUM_KEYS.map((k) => (
                  <label key={k}>
                    <span>{LEAGUE_NUM_LABEL[k]}</span>
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={r[k]}
                      onChange={(e) => lgPatch(r.id, { [k]: e.target.value })}
                      aria-label={`${r.own ? lgOwnName : r.name || "チーム"} ${LEAGUE_NUM_LABEL[k]}`}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="formfield">
        <button
          type="button"
          className="dynadd"
          onClick={() => {
            lgSeq.current += 1;
            const id = "lg_" + Date.now().toString(36) + "_" + lgSeq.current;
            setLgRows((rows) => [...rows, { id, name: "", win: "", draw: "", loss: "", gf: "", ga: "" }]);
            setLgFocusId(id);
          }}
        >
          ＋ チームを追加
        </button>
      </div>
      {lgMode === "results" && (
        <>
          <div className="sech lgedit-sech">試合結果（{lgResults.length} 件）</div>
          <div className="lgedit">
            {lgResults.map((m) => {
              const nameOf = (r: LeagueDraftRow) => (r.own ? lgOwnName : r.name.trim() || "（名前未入力）");
              return (
                <div key={m.id} className="lgres-row">
                  <div className="lgres-teams">
                    <div className="formfield">
                      <select
                        value={m.aId}
                        onChange={(e) => lgResPatch(m.id, { aId: e.target.value })}
                        aria-label="チーム A"
                      >
                        <option value="">チームを選ぶ</option>
                        {lgRows.map((r) => (
                          <option key={r.id} value={r.id}>
                            {nameOf(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="formfield">
                      <select
                        value={m.bId}
                        onChange={(e) => lgResPatch(m.id, { bId: e.target.value })}
                        aria-label="チーム B"
                      >
                        <option value="">チームを選ぶ</option>
                        {lgRows.map((r) => (
                          <option key={r.id} value={r.id}>
                            {nameOf(r)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="lgres-score">
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={m.aScore}
                      onChange={(e) => lgResPatch(m.id, { aScore: e.target.value })}
                      aria-label="チーム A の得点"
                    />
                    <span aria-hidden>-</span>
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={m.bScore}
                      onChange={(e) => lgResPatch(m.id, { bScore: e.target.value })}
                      aria-label="チーム B の得点"
                    />
                    <div className="formfield lgres-date">
                      <input
                        type="date"
                        value={m.date}
                        onChange={(e) => lgResPatch(m.id, { date: e.target.value })}
                        aria-label="日付（任意）"
                      />
                    </div>
                    <button
                      type="button"
                      className="lgedit-del"
                      aria-label="この試合結果を削除"
                      title="この試合結果を削除"
                      onClick={() => setLgResults((rs) => rs.filter((x) => x.id !== m.id))}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="formfield">
            <button
              type="button"
              className="dynadd"
              onClick={() => {
                lgSeq.current += 1;
                const own = lgRows.find((r) => r.own);
                setLgResults((rs) => [
                  ...rs,
                  {
                    id: "lgr_" + Date.now().toString(36) + "_" + lgSeq.current,
                    aId: own?.id ?? "",
                    bId: "",
                    aScore: "",
                    bScore: "",
                    date: "",
                  },
                ]);
              }}
            >
              ＋ 試合結果を追加
            </button>
          </div>
          {/* 試合記録から取り込む（相手名がチーム一覧と一致し、まだ取り込んでいない自チームの記録だけ） */}
          <div className="formfield">
            <label>取り込む大会</label>
            <select value={lgImportComp} onChange={(e) => setLgImportComp(e.target.value)} aria-label="取り込む大会">
              <option value="all">すべての大会</option>
              {team.team.competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="formfield">
            <button type="button" className="dynadd" onClick={lgImportMatches}>
              試合記録から取り込む
            </button>
          </div>
        </>
      )}
      {/* 数値 → 結果へ切り替えたときの注意（結果が 0 件のうちは別の文言） */}
      {lgMode === "results" && lgResults.length === 0 ? (
        <div className="lgedit-warn">試合結果を 1 件以上入れると順位表が作られます。</div>
      ) : (
        lgMode === "results" &&
        lgWarn && <div className="lgedit-warn">保存すると、順位表の数値は試合結果から数え直した値に置き換わります。</div>
      )}
      <div className="evnote" style={{ margin: "0 16px 12px" }}>
        {lgMode === "results"
          ? "入力した試合結果から、勝・分・敗・得点・失点を数えて順位表を作ります。順位は 勝点（勝 3・分 1）→ 得失点差 → 得点 の順です。"
          : "順位は 勝点（勝 3・分 1）→ 得失点差 → 得点 の順に自動で並びます。試合数は 勝＋分＋敗 です。"}
      </div>
      <button className="bigbtn" onClick={saveLeague}>
        保存する
      </button>
    </>
  );
}
