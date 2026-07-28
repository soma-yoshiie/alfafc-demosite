"use client";

import { useEffect, useRef, useState } from "react";
import { animTotal } from "@/lib/animation";
import { sceneClient } from "@/lib/tacticsScene";
import { useBoard } from "./BoardProvider";
import TacticsTimeline, { type TimelineHandle } from "./TacticsTimeline";
import { E } from "./Emoji";

/** 「ことばで作る」の例文（タップで入力欄へ） */
const NL_EXAMPLES = [
  "LBがサイドを上がったらそのスペースを埋めるようにCMが移動する",
  "STが裏に抜けてトップ下がSTにパス",
  "右SBがオーバーラップしながらRWが中に絞る",
];

export default function AnimationStudio() {
  const board = useBoard();
  const { slots, players } = board.state;
  const scrubRef = useRef<HTMLInputElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const totRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<TimelineHandle>(null);

  // ことばで作る
  const [nlOpen, setNlOpen] = useState(false);
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);

  const moves = board.state.moves;
  const T = animTotal(moves);

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

  /** 文章からシーンを生成 → 即再生（タイムラインで微調整できる） */
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
    board.toast(`${res.moves.length}本の動きを生成しました`);
    // state反映後に先頭から自動再生
    setTimeout(() => {
      board.resetPlay();
      board.startPlay();
    }, 80);
  };

  return (
    <div className="studio">
      <div className="stitle">
        <b>ANIM STUDIO</b>
        <div className="hintxt">
          選手・ボールをなぞるとルートを描けます
          <br />
          下のタイムラインでタイミングを調整
        </div>
      </div>

      <div className="transport">
        <div
          className="tbtn play"
          onClick={() => (board.isPlaying ? board.stopPlay() : board.startPlay())}
        >
          {board.isPlaying ? "⏸ 停止" : "▶ 再生"}
        </div>
        <div className="tbtn" title="先頭へ" onClick={board.resetPlay}>
          ⟲
        </div>
        <div
          className="tbtn"
          title="最後のルートを削除"
          onClick={() => {
            if (!moves.length) {
              board.toast("元に戻すルートがありません");
              return;
            }
            board.stopPlay();
            const last = moves[moves.length - 1];
            if (board.selActor === last.actor) board.setSelActor(null);
            board.undoMove();
            board.toast("最後のルートを削除しました");
          }}
        >
          ↩
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
          title="全消去"
          onClick={() => {
            board.stopPlay();
            board.clearMoves();
            board.setSelActor(null);
            board.toast("全ルートを消去しました");
          }}
        >
          <E n="trash" />
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
          board.seek((v / 1000) * animTotal(board.state.moves));
        }}
      />
      <div className="tline">
        <span ref={curRef}>0.0s</span>
        <span ref={totRef}>0.0s</span>
      </div>

      <div className="sttools">
        <div
          className={`toolchip${nlOpen ? " on" : ""}`}
          onClick={() => setNlOpen(!nlOpen)}
        >
          💬 ことばで作る
        </div>
        <div
          className={`toolchip${board.showPaths ? " on" : ""}`}
          onClick={() => board.setShowPaths(!board.showPaths)}
        >
          〰 ルート{board.showPaths ? "表示" : "非表示"}
        </div>
        <div className="toolchip" onClick={board.enterFullplay}>
          ⛶ 全画面再生
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
            {nlBusy ? "生成中…" : "▶ シーンを生成して再生"}
          </button>
        </div>
      )}

      <div className="clips">
        <TacticsTimeline ref={tlRef} />
      </div>
    </div>
  );
}
