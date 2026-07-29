"use client";

import { useEffect, useRef, useState } from "react";
import { animTotal, durFromPath, stepDur } from "@/lib/animation";
import { sceneClient } from "@/lib/tacticsScene";
import type { Actor, MoveKind } from "@/lib/types";
import { isOppActor, moveKind, oppIndex } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import TacticsTimeline, { type TimelineHandle } from "./TacticsTimeline";
import {
  IconChat,
  IconExpand,
  IconMove,
  IconPause,
  IconPlay,
  IconPlayAll,
  IconRoute,
  IconTrash,
} from "./icons";

/** 「ワードで作成」の例文（タップで入力欄へ） */
const NL_EXAMPLES = [
  "LBがサイドを上がったらそのスペースを埋めるようにCMが移動する",
  "STが裏に抜けてトップ下がSTにパス",
  "右SBがオーバーラップしながらRWが中に絞る",
];

/** 線種チップの選択肢。shot（シュート）はボールのルートにのみ表示する */
const KIND_LABEL: Record<MoveKind, string> = {
  run: "ラン",
  pass: "パス",
  dribble: "ドリブル",
  shot: "シュート",
};

/** 動きの緩急ラベル */
const EASE_LABEL: Record<"std" | "dash" | "linear", string> = {
  std: "なめらか",
  dash: "ダッシュ",
  linear: "等速",
};

export default function AnimationStudio() {
  const board = useBoard();
  const { slots, players } = board.state;
  const scrubRef = useRef<HTMLInputElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const totRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<TimelineHandle>(null);

  // ワードで作成
  const [nlOpen, setNlOpen] = useState(false);
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  // 詳細タイミング（タイムライン）は折りたたみ
  const [tlOpen, setTlOpen] = useState(false);

  const moves = board.state.moves;
  const T = animTotal(moves, board.state.stepCount);

  // 再生・シーク中の時間表示更新（再描画なし）
  useEffect(() => {
    board.onTick.current = (t, total) => {
      if (scrubRef.current)
        scrubRef.current.value = String(
          Math.round((Math.min(t, total) / total) * 1000)
        );
      if (curRef.current) curRef.current.textContent = Math.min(t, total).toFixed(1) + "s";
      if (totRef.current) totRef.current.textContent = total.toFixed(1) + "s";
      tlRef.current?.setTime(Math.min(t, total));
    };
    return () => {
      board.onTick.current = null;
    };
  }, [board]);

  // クリップの増減・尺変更で表示を同期し、ポーズ中の盤面も反映
  useEffect(() => {
    const t = board.getTime();
    if (scrubRef.current)
      scrubRef.current.value = String(Math.round((Math.min(t, T) / T) * 1000));
    if (curRef.current) curRef.current.textContent = Math.min(t, T).toFixed(1) + "s";
    if (totRef.current) totRef.current.textContent = T.toFixed(1) + "s";
    if (board.mode === "anim" && !board.isPlaying)
      board.applyPlayhead(Math.min(t, T));
  }, [T, moves, board]);

  /** 文章からシーンを生成 → 現在の場面に入れて即再生 */
  const runScene = async () => {
    const txt = nlText.trim();
    if (!txt) {
      board.toast("動きを文章で入力してください");
      return;
    }
    setNlBusy(true);
    const res = await sceneClient.buildScene(txt, {
      slots,
      players,
      ball: board.state.ball,
    });
    setNlBusy(false);
    if (res.warnings.length > 0) board.toast(res.warnings[0]);
    if (res.moves.length === 0) return;
    board.stopPlay();
    board.mergeMoves(res.moves);
    board.setSelActor(null);
    board.setSelMove(null);
    board.toast(`場面${board.activeStep + 1}に${res.moves.length}本の動きを生成しました`);
    // state反映後にこの場面を自動再生
    setTimeout(() => board.playStep(board.activeStep), 80);
  };

  /** アクター表示名 */
  const actorLabel = (actor: Actor): string => {
    if (actor === "ball") return "ボール";
    if (isOppActor(actor)) {
      const o = (board.state.opponents ?? [])[oppIndex(actor)];
      return o ? `相手${o.label}` : "相手";
    }
    const s = slots[actor as number];
    if (!s) return "選手";
    const p = s.pid ? players.find((x) => x.id === s.pid) : null;
    return p ? `${s.role} ${p.name.split(/\s+/)[0]}` : s.role;
  };

  // 選択中ルート（actor+場面で一意）
  const selIndex = board.selMove
    ? moves.findIndex(
        (m) =>
          m.actor === board.selMove!.actor &&
          (m.step ?? 0) === board.selMove!.step
      )
    : -1;
  const sel = selIndex >= 0 ? moves[selIndex] : null;

  const setSelPatch = (patch: Parameters<typeof board.updateMove>[1]) => {
    if (selIndex >= 0) board.updateMove(selIndex, patch);
  };

  const steps = board.stepCount;

  return (
    <div className="studio">
      <div className="stitle">
        <b>ANIM STUDIO</b>
        <div className="hintxt">
          {board.animTool === "move"
            ? "ドラッグで配置を移動（ルートも一緒に動きます）"
            : "ドラッグでルートを描画"}
        </div>
      </div>

      {/* 場面（ステップ）チップ */}
      <div className="steps">
        {Array.from({ length: steps }).map((_, s) => (
          <div
            key={s}
            className={`stepchip${s === board.activeStep ? " on" : ""}`}
            title={
              s === board.activeStep
                ? "もう一度タップでこの場面を再生"
                : `場面${s + 1}へ`
            }
            onClick={() =>
              s === board.activeStep
                ? board.playStep(s)
                : board.setActiveStep(s)
            }
          >
            <span className="steplabel">場面{s + 1}</span>
            <span className="stepdur">{stepDur(moves, s).toFixed(1)}s</span>
            {s === board.activeStep && steps > 1 && (
              <button
                className="stepdel"
                title="この場面を削除"
                onClick={(e) => {
                  e.stopPropagation();
                  board.stopPlay();
                  board.removeStep(s);
                  board.toast(`場面${s + 1}を削除しました`);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="stepchip add" title="新しい場面を追加" onClick={board.addStep}>
          ＋ 場面
        </div>
      </div>

      <div className="transport">
        <div
          className="tbtn play"
          title="この場面だけ再生"
          onClick={() =>
            board.isPlaying ? board.stopPlay() : board.playStep(board.activeStep)
          }
        >
          <span className="tlabel">
            {board.isPlaying ? <IconPause /> : <IconPlay />}
            {board.isPlaying ? "停止" : "この場面"}
          </span>
        </div>
        <div
          className="tbtn playall"
          title="最初から通しで再生"
          onClick={() => {
            if (board.isPlaying) {
              board.stopPlay();
              return;
            }
            board.resetPlay();
            board.startPlay();
          }}
        >
          <span className="tlabel">
            <IconPlayAll />
            通し
          </span>
        </div>
        <div className="spd">
          速度
          <select
            value={board.speed}
            onChange={(e) => board.setSpeed(+e.target.value)}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
        <div
          className="tbtn warn"
          title="全場面のルートを消去"
          onClick={() => {
            board.stopPlay();
            board.clearMoves();
            board.setSelActor(null);
            board.setSelMove(null);
            board.toast("すべてのルートを消去しました");
          }}
        >
          <IconTrash />
        </div>
        <div className="tbtn done" onClick={board.closeStudio}>
          完了
        </div>
      </div>

      <input
        ref={scrubRef}
        type="range"
        className="scrub"
        min={0}
        max={1000}
        defaultValue={0}
        onInput={(e) => {
          const v = +(e.target as HTMLInputElement).value;
          board.seek((v / 1000) * animTotal(board.state.moves, board.state.stepCount));
        }}
      />
      <div className="tline">
        <span ref={curRef}>0.0s</span>
        <span ref={totRef}>0.0s</span>
      </div>

      {/* 選択中ルートの編集（線種・速さ・削除） */}
      {sel && (
        <div className="selrow">
          <span className="tlselinfo">{actorLabel(sel.actor)}のルート</span>
          <div className="tlchips">
            {(Object.keys(KIND_LABEL) as MoveKind[])
              .filter((k) => k !== "shot" || sel.actor === "ball")
              .map((k) => (
                <button
                  key={k}
                  className={`tlchip kind ${k}${moveKind(sel) === k ? " on" : ""}`}
                  onClick={() => setSelPatch({ kind: k })}
                >
                  <i className={`lk ${k}`} />
                  {KIND_LABEL[k]}
                </button>
              ))}
            <span className="chipsep" />
            <button
              className="tlchip"
              onClick={() =>
                setSelPatch({
                  dur: Math.max(0.3, +(durFromPath(sel.path) * 0.6).toFixed(2)),
                })
              }
            >
              速く
            </button>
            <button
              className="tlchip"
              onClick={() => setSelPatch({ dur: durFromPath(sel.path) })}
            >
              標準
            </button>
            <button
              className="tlchip"
              onClick={() =>
                setSelPatch({ dur: +(durFromPath(sel.path) * 1.6).toFixed(2) })
              }
            >
              遅く
            </button>
            <span className="chipsep" />
            {(Object.keys(EASE_LABEL) as ("std" | "dash" | "linear")[]).map((k) => (
              <button
                key={k}
                className={`tlchip${(sel.ease ?? "std") === k ? " on" : ""}`}
                onClick={() => setSelPatch({ ease: k === "std" ? undefined : k })}
              >
                {EASE_LABEL[k]}
              </button>
            ))}
            <button
              className="tlchip danger"
              onClick={() => {
                board.setSelActor(null);
                board.setSelMove(null);
                board.deleteMove(selIndex);
                board.toast("ルートを削除しました");
              }}
            >
              削除
            </button>
          </div>
        </div>
      )}

      <div className="sttools">
        {/* ドラッグ操作の切替：配置移動 / ルート描画 */}
        <div className="toolseg" role="tablist" aria-label="ドラッグ操作">
          <button
            className={`tseg${board.animTool === "move" ? " on" : ""}`}
            title="ドラッグで配置を移動（ルートも一緒に動きます）"
            onClick={() => board.setAnimTool("move")}
          >
            <IconMove />
            移動
          </button>
          <button
            className={`tseg${board.animTool === "draw" ? " on" : ""}`}
            title="ドラッグでルートを描画"
            onClick={() => board.setAnimTool("draw")}
          >
            <IconRoute />
            ルート
          </button>
        </div>
        <div
          className={`toolchip${nlOpen ? " on" : ""}`}
          onClick={() => setNlOpen(!nlOpen)}
        >
          <IconChat />
          ワードで作成
        </div>
        <div className="toolchip" onClick={board.enterFullplay}>
          <IconExpand />
          全画面再生
        </div>
      </div>

      {nlOpen && (
        <div className="nlbox">
          <textarea
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            rows={2}
            placeholder="例）LBがサイドを上がったらそのスペースを埋めるようにCMが移動する"
          />
          <div className="nlexrow">
            {NL_EXAMPLES.map((ex) => (
              <button key={ex} className="nlex" onClick={() => setNlText(ex)}>
                {ex.length > 17 ? ex.slice(0, 17) + "…" : ex}
              </button>
            ))}
          </div>
          <button className="nlrun" onClick={runScene} disabled={nlBusy}>
            {nlBusy ? "生成中…" : `場面${board.activeStep + 1}に生成して再生`}
          </button>
        </div>
      )}

      {/* 詳細タイミング（従来タイムライン）は普段は畳んでおく */}
      <div
        className={`tltoggle${tlOpen ? " open" : ""}`}
        onClick={() => setTlOpen(!tlOpen)}
      >
        {tlOpen ? "▾" : "▸"} 詳細タイミング
        <span className="tltogglehint">動き出しのタイミングを個別調整</span>
      </div>
      {tlOpen && (
        <div className="clips">
          <TacticsTimeline ref={tlRef} />
        </div>
      )}
    </div>
  );
}
