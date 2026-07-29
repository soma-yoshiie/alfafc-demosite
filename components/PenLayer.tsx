"use client";

// フリーハンドペン：ピッチ上への描き込みレイヤー。
// penMode ON のときだけポインタを受け取り、なぞりをストロークとして保存する。
// ストローク自体は常時表示（ホワイトボードのチョーク風）。

import { useRef, useState } from "react";
import type React from "react";
import type { Point } from "@/lib/types";
import { simplify } from "@/lib/animation";
import { topToY, yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function PenLayer() {
  const board = useBoard();
  const view = board.state.pitchView;
  const drawing = useRef<Point[] | null>(null);
  const [livePts, setLivePts] = useState<Point[] | null>(null);

  const toPct = (e: React.PointerEvent): Point | null => {
    const r = board.getPitchRect();
    if (!r) return null;
    const topPct = ((e.clientY - r.top) / r.height) * 100;
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(topToY(topPct, view), 0, 100),
    };
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!board.penMode) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toPct(e);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    drawing.current = [p];
    setLivePts([p]);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const cur = drawing.current;
    if (!cur) return;
    const p = toPct(e);
    if (!p) return;
    const last = cur[cur.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.8) {
      cur.push(p);
      setLivePts(cur.slice());
    }
  };

  const onUp = () => {
    const cur = drawing.current;
    drawing.current = null;
    setLivePts(null);
    if (cur && cur.length >= 2) board.addStroke(simplify(cur));
  };

  // 全場面共通のもの＋（アニメ中は）表示中の場面に紐づくものだけ描く
  const strokes = (board.state.drawings ?? []).filter((s) =>
    board.mode === "edit"
      ? s.step == null
      : s.step == null || s.step === board.viewStep
  );
  // アニメ中の「描き込み」表示OFF：既存ストロークは非表示にする（新規描画は従来どおり可能）
  const hideDrawings = board.mode === "anim" && !board.showDrawings;
  if (strokes.length === 0 && !board.penMode) return null;

  const toPts = (path: Point[]) =>
    path.map((p) => `${p.x.toFixed(1)},${yToTop(p.y, view).toFixed(1)}`).join(" ");

  return (
    <svg
      className={`pathsvg pen${board.penMode ? " active" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {!hideDrawings && strokes.map((s, i) => {
        const pts = toPts(s.path);
        const w = s.width ?? 0.9;
        const sel = s.id != null && board.selStroke === s.id;
        // 当たり判定用ポリライン（透明・実効幅の2.5倍）。penMode中は無効化して描画を優先する
        const hitWidth = Math.max(w * 2.5, 3);
        return (
          <g key={s.id ?? i}>
            {sel && (
              <polyline
                points={pts}
                fill="none"
                stroke="#ffffff"
                strokeWidth={w + 0.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
                style={{ pointerEvents: "none" }}
              />
            )}
            <polyline
              points={pts}
              fill="none"
              stroke={s.color ?? "#ffe27a"}
              strokeWidth={w}
              strokeDasharray={s.dash ? `${w * 2.4} ${w * 1.8}` : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
              style={{ pointerEvents: "none" }}
            />
            <polyline
              ref={(el) => {
                if (s.id) board.registerShapeEl(s.id, el);
              }}
              points={pts}
              fill="none"
              stroke="transparent"
              strokeWidth={hitWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: board.penMode ? "none" : "auto" }}
              onPointerDown={(e) => {
                if (board.penMode || !s.id) return;
                e.stopPropagation();
                board.setSelStroke(s.id);
              }}
            />
          </g>
        );
      })}
      {livePts && livePts.length > 1 && (
        <polyline
          points={toPts(livePts)}
          fill="none"
          stroke={board.penColor}
          strokeWidth={board.penWidth}
          strokeDasharray={board.penDash ? `${board.penWidth * 2.4} ${board.penWidth * 1.8}` : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}
    </svg>
  );
}
