"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MatchPhase, PlayKind, PlayLine, PlayLineKind, PlayPoint, Point } from "@/lib/types";
import { MATCH_PHASE_LABEL, PLAY_KIND_LABEL, PLAY_LINE_LABEL } from "@/lib/types";
import {
  PLAY_KINDS,
  PLAY_LINE_KINDS,
  markCanvas,
  markPhase,
  playStats,
  popPhaseCanvas,
} from "@/lib/plays";
import { PlayAreaPitch, isInGoalFrame, type PitchView, type PlayTool } from "../MiniPitch";
import { PlayStatsRow } from "./PlayStatsRow";
import { LineResultSheet, ShotCourseSheet } from "./PlaySheets";

/* note-pitch-v2 §2-2・§2-3: プレーの記録（選手）／ピッチに描いて伝える（スタッフ）の編集部品。
   データ（plays・playLines）は親が持つ。画面の状態（道具・フェーズ・ピッチ番号・全面／ハーフ・シート）はここに持つ */

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props =
  | {
      mode: "player";
      plays: PlayPoint[];
      playLines: PlayLine[];
      onPlays: Setter<PlayPoint[]>;
      onLines: Setter<PlayLine[]>;
      phases: MatchPhase[];
    }
  | {
      mode: "staff";
      plays: PlayPoint[];
      playLines: PlayLine[];
      onPlays: Setter<PlayPoint[]>;
      onLines: Setter<PlayLine[]>;
    };

/** ハーフ表示で見える範囲（敵陣側）の下端。y（保存の座標）がこれ未満の印は入れ物の外 */
const HALF_VISIBLE_MIN_Y = 100 - 54 / 1.05;

/** 道具の絵。ピッチの上の印・線と同じ形（受けた＝輪、シュート＝黄の丸、ミス＝赤の ×、ドリブル＝波線、パス＝破線） */
function ToolIcon({ kind }: { kind: PlayKind | PlayLineKind }) {
  const common = { width: 28, height: 18, viewBox: "0 0 28 18", "aria-hidden": true, focusable: false } as const;
  if (kind === "receive") {
    return (
      <svg {...common}>
        <circle cx="14" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    );
  }
  if (kind === "shot") {
    return (
      <svg {...common}>
        <circle cx="14" cy="9" r="6" fill="#ffd166" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "miss") {
    return (
      <svg {...common}>
        <circle cx="14" cy="9" r="7" fill="#ffffff" stroke="var(--danger)" strokeWidth="1.5" />
        <path d="M10.5 5.5L17.5 12.5M17.5 5.5L10.5 12.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "dribble") {
    return (
      <svg {...common}>
        <path
          d="M1 9q2.5 -6 5 0t5 0t5 0t4 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polygon points="27,9 21,5.8 21,12.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M1 9H20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3.4 2.4" />
      <polygon points="27,9 21,5.8 21,12.2" fill="currentColor" />
    </svg>
  );
}

function ToolLabel({ kind }: { kind: PlayKind | PlayLineKind }) {
  // 3 つ目は「トラップミス」を 1 行に収めるため「ミス」と書く（aria-label は「トラップミス」）
  if (kind === "miss") return <span>ミス</span>;
  if (kind === "receive" || kind === "shot") return <span>{PLAY_KIND_LABEL[kind]}</span>;
  return <span>{PLAY_LINE_LABEL[kind]}</span>;
}

/** 1 列 5 つの道具（受けた・シュート・ミス・ドリブル・パス） */
function PlayTools({ tool, onTool }: { tool: PlayTool; onTool: (t: PlayTool) => void }) {
  return (
    <div className="playtools">
      {PLAY_KINDS.map((k) => {
        const on = tool.mode === "point" && tool.kind === k;
        return (
          <button
            key={k}
            type="button"
            className={`playkind ${k}${on ? " on" : ""}`}
            aria-pressed={on}
            aria-label={k === "miss" ? "トラップミス" : undefined}
            onClick={() => onTool({ mode: "point", kind: k })}
          >
            <ToolIcon kind={k} />
            <ToolLabel kind={k} />
          </button>
        );
      })}
      {PLAY_LINE_KINDS.map((k) => {
        const on = tool.mode === "line" && tool.kind === k;
        return (
          <button
            key={k}
            type="button"
            className={`playline ${k}${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onTool({ mode: "line", kind: k })}
          >
            <ToolIcon kind={k} />
            <ToolLabel kind={k} />
          </button>
        );
      })}
    </div>
  );
}

export function PlayRecorder(props: Props) {
  const { plays, playLines, onPlays, onLines } = props;
  const player = props.mode === "player";
  const phases: MatchPhase[] = props.mode === "player" ? props.phases : [];
  const [tool, setTool] = useState<PlayTool>(player ? { mode: "point", kind: "receive" } : { mode: "line", kind: "pass" });
  // 記録・表示フェーズ（前半/後半/延長）
  const [playPhase, setPlayPhase] = useState<MatchPhase>("1st");
  // 現フェーズ内で表示・記録中のピッチ番号（複数ピッチ記録用）
  const [activeCanvas, setActiveCanvas] = useState(0);
  // 表示の切り替え（保存しない。既定は全面）
  const [view, setView] = useState<PitchView>("full");
  // シュートコース編集シートの対象（plays 配列の index。null なら非表示）
  const [shotEditIndex, setShotEditIndex] = useState<number | null>(null);
  // パス/ドリブル結果編集シートの対象（playLines 配列の index。null なら非表示）
  const [lineEditIndex, setLineEditIndex] = useState<number | null>(null);

  const etPresent = phases.includes("et");
  // 延長のマークを全消去して延長チップが消えたら前半へフォールバック
  useEffect(() => {
    if (playPhase === "et" && !etPresent) setPlayPhase("1st");
  }, [playPhase, etPresent]);
  // フェーズを切り替えたらピッチ選択を 1 枚目に戻す
  useEffect(() => {
    setActiveCanvas(0);
  }, [playPhase]);

  /* ---------- スタッフ（ピッチに描いて伝える）：フェーズ・ピッチ番号なし ---------- */
  if (props.mode === "staff") {
    return (
      <>
        <div className="npwrap">
          <PlayAreaPitch
            tone="staff"
            points={plays}
            lines={playLines}
            tool={tool}
            onAddPoint={(x, y) =>
              onPlays((prev) => [...prev, { x, y, kind: tool.mode === "point" ? tool.kind : "receive" }])
            }
            onAddLine={(path) =>
              onLines((prev) => [...prev, { kind: tool.mode === "line" ? tool.kind : "pass", path }])
            }
          />
          {/* 道具・1つ戻す／全消去もピッチと同じ幅の箱の中に置く（ピッチ → 道具の順。選手と同じ） */}
          <PlayTools tool={tool} onTool={setTool} />
          {(plays.length > 0 || playLines.length > 0) && (
            <div className="playacts">
              <button
                type="button"
                className="dynadd"
                onClick={() => (tool.mode === "line" ? onLines((p) => p.slice(0, -1)) : onPlays((p) => p.slice(0, -1)))}
              >
                1つ戻す
              </button>
              <button
                type="button"
                className="dynadd"
                onClick={() => {
                  onPlays([]);
                  onLines([]);
                }}
              >
                全消去
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  /* ---------- 選手（自分のプレー） ---------- */
  const phaseMarkCount = (p: MatchPhase) =>
    plays.filter((pt) => markPhase(pt.phase) === p).length + playLines.filter((l) => markPhase(l.phase) === p).length;
  // 現フェーズで使われているピッチ枚数（未使用でも選択中のピッチまでは表示。最低1・最大4枚）
  const canvasMaxUsed = Math.max(
    0,
    ...plays.filter((p) => markPhase(p.phase) === playPhase).map((p) => markCanvas(p.canvas)),
    ...playLines.filter((l) => markPhase(l.phase) === playPhase).map((l) => markCanvas(l.canvas))
  );
  const canvasCount = Math.min(4, Math.max(1, canvasMaxUsed + 1, activeCanvas + 1));
  const scopedPlays = plays.filter((p) => markPhase(p.phase) === playPhase && markCanvas(p.canvas) === activeCanvas);
  const scopedPlayLines = playLines.filter((l) => markPhase(l.phase) === playPhase && markCanvas(l.canvas) === activeCanvas);
  // 現フェーズのシュート点（元の plays 配列 index 付き。編集シートを開くのに使う）
  const phaseShots = plays
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => p.kind === "shot" && markPhase(p.phase) === playPhase);

  // ハーフで自陣側に隠れている印（点は位置、軌道は全点が隠れているもの）
  const hiddenCount =
    view === "half"
      ? scopedPlays.filter((p) => p.y < HALF_VISIBLE_MIN_Y).length +
        scopedPlayLines.filter((l) => l.path.length > 0 && l.path.every((pt) => pt.y < HALF_VISIBLE_MIN_Y)).length
      : 0;

  // ピッチタップで点を追加。シュートは追加直後にコース編集シートを開く
  const addPoint = (x: number, y: number) => {
    const kind = tool.mode === "point" ? tool.kind : "receive";
    // 親の更新関数の中で自分の state を変えると React が警告するので、追加する位置は先に決める
    const at = plays.length;
    onPlays((prev) => [...prev, { x, y, kind, phase: playPhase, canvas: activeCanvas }]);
    if (kind === "shot") setShotEditIndex(at);
  };

  // なぞって軌道を追加。パス/ドリブルは追加直後に結果編集シートを開く
  const addLine = (path: Point[]) => {
    const kind = tool.mode === "line" ? tool.kind : "dribble";
    const at = playLines.length;
    onLines((prev) => [...prev, { kind, path, phase: playPhase, canvas: activeCanvas }]);
    if (kind === "pass" || kind === "dribble") setLineEditIndex(at);
  };

  const clearCanvas = () => {
    const n = scopedPlays.length;
    const m = scopedPlayLines.length;
    if (n === 0 && m === 0) return;
    if (!window.confirm(`このピッチの記録（点 ${n} ・ 軌道 ${m}）を消しますか？`)) return;
    onPlays((prev) => prev.filter((p) => !(markPhase(p.phase) === playPhase && markCanvas(p.canvas) === activeCanvas)));
    onLines((prev) => prev.filter((l) => !(markPhase(l.phase) === playPhase && markCanvas(l.canvas) === activeCanvas)));
  };

  const counts = `${MATCH_PHASE_LABEL[playPhase]} ・ 点 ${scopedPlays.length} ／ 軌道 ${scopedPlayLines.length}${
    canvasCount > 1 ? ` ・ ピッチ ${activeCanvas + 1}` : ""
  }`;
  const hint =
    tool.mode === "point"
      ? `ピッチを押して「${PLAY_KIND_LABEL[tool.kind]}」を置く（${counts}）`
      : `ピッチをなぞって「${PLAY_LINE_LABEL[tool.kind]}」を描く（${counts}）`;

  return (
    <>
      <div className="notesec-h" style={{ marginTop: 14 }}>自分のプレー</div>
      <div className="phasebar">
        {phases.map((p) => {
          const cnt = phaseMarkCount(p);
          return (
            <button
              key={p}
              type="button"
              className={`phasechip${playPhase === p ? " on" : ""}`}
              aria-pressed={playPhase === p}
              onClick={() => setPlayPhase(p)}
            >
              {MATCH_PHASE_LABEL[p]}{cnt > 0 ? ` ${cnt}` : ""}
            </button>
          );
        })}
      </div>
      <div className="npbar">
        <div className="npbar-l">
          <span className="npbar-t">ピッチ</span>
          {Array.from({ length: canvasCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`canvaschip${activeCanvas === i ? " on" : ""}`}
              aria-label={`ピッチ${i + 1}`}
              aria-pressed={activeCanvas === i}
              onClick={() => setActiveCanvas(i)}
            >
              {i + 1}
            </button>
          ))}
          {canvasCount < 4 && (
            <button
              type="button"
              className="canvaschip add"
              aria-label="ピッチを追加"
              onClick={() => setActiveCanvas(canvasCount)}
            >
              ＋
            </button>
          )}
        </div>
        <div className="npbar-r">
          <button type="button" className={`canvaschip${view === "full" ? " on" : ""}`} aria-pressed={view === "full"} onClick={() => setView("full")}>
            全面
          </button>
          <button type="button" className={`canvaschip${view === "half" ? " on" : ""}`} aria-pressed={view === "half"} onClick={() => setView("half")}>
            ハーフ
          </button>
        </div>
      </div>
      <div className="npwrap">
        <PlayAreaPitch
          points={scopedPlays}
          lines={scopedPlayLines}
          tool={tool}
          view={view}
          onAddPoint={addPoint}
          onAddLine={addLine}
        />
        <PlayTools tool={tool} onTool={setTool} />
      </div>
      <div className="phasehint">{hint}</div>
      {hiddenCount > 0 && <div className="phasehint">自陣側の印 {hiddenCount} 個は「全面」で見える</div>}
      {(plays.length > 0 || playLines.length > 0) && (
        <div className="playacts">
          <button
            type="button"
            className="dynadd"
            onClick={() =>
              tool.mode === "line"
                ? onLines((p) => popPhaseCanvas(p, playPhase, activeCanvas))
                : onPlays((p) => popPhaseCanvas(p, playPhase, activeCanvas))
            }
          >
            1つ戻す
          </button>
          <button type="button" className="dynadd danger" onClick={clearCanvas}>
            このピッチを消去
          </button>
        </div>
      )}
      {(plays.length > 0 || playLines.length > 0) && <PlayStatsRow stats={playStats(plays, playLines)} />}

      {phaseShots.length > 0 && (
        <div className="shotlist">
          {phaseShots.map(({ p, idx }, i) => (
            <button key={idx} type="button" className="shotrow" onClick={() => setShotEditIndex(idx)}>
              <span className={`shotmark${p.course ? (p.scored ? "" : " nogoal") : " none"}`} />
              <span>シュート{i + 1} ・ {p.course ? (p.scored ? "ゴール" : "ノーゴール") : "コース未記録"}</span>
              {p.shotNote && <small>{p.shotNote.slice(0, 20)}</small>}
            </button>
          ))}
        </div>
      )}

      {shotEditIndex != null && plays[shotEditIndex] && (
        <ShotCourseSheet
          shot={plays[shotEditIndex]}
          onPick={(x, y) => {
            const scored = isInGoalFrame(x, y);
            onPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, course: { x, y }, scored } : p)));
          }}
          onSetScored={(v) => onPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, scored: v } : p)))}
          onSetNote={(v) => onPlays((prev) => prev.map((p, i) => (i === shotEditIndex ? { ...p, shotNote: v } : p)))}
          onClose={() => setShotEditIndex(null)}
          onDelete={() => {
            onPlays((prev) => prev.filter((_, i) => i !== shotEditIndex));
            setShotEditIndex(null);
          }}
        />
      )}

      {lineEditIndex != null && playLines[lineEditIndex] && (
        <LineResultSheet
          line={playLines[lineEditIndex]}
          onSetSuccess={(v) => onLines((prev) => prev.map((l, i) => (i === lineEditIndex ? { ...l, success: v } : l)))}
          onSetNote={(v) => onLines((prev) => prev.map((l, i) => (i === lineEditIndex ? { ...l, note: v } : l)))}
          onClose={() => setLineEditIndex(null)}
          onDelete={() => {
            onLines((prev) => prev.filter((_, i) => i !== lineEditIndex));
            setLineEditIndex(null);
          }}
        />
      )}
    </>
  );
}
