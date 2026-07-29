"use client";

// 図形オブジェクト（ゾーン塗り・テキスト・曲線矢印・選手追従図形）の描画・操作レイヤー。
// ゾーン/矢印/連結ライン/囲み枠はSVGで描くが、テキスト・人数バッジは
// SVGだと縦横比が歪むためHTMLのdivで描く。
// ポインタは常時受け取る（Keynote風：パレット未オープンでもクリックで選択・ドラッグ移動できる）。
// 図形は z-index 1 でトークンより下に描画されるため、トークン操作は引き続き優先される。

import { useEffect, useLayoutEffect, useRef } from "react";
import type React from "react";
import type {
  Actor,
  ArrowShape,
  HullShape,
  LinkShape,
  PitchViewMode,
  Point,
  Shape,
  ShapePatch,
  ZoneShape,
} from "@/lib/types";
import { actorPos } from "@/lib/animation";
import { convexHull, trimQuadEnd } from "@/lib/geometry";
import { ySpan, yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const TEXT_SIZE: Record<string, number> = { s: 10, m: 13, l: 17 };

/** 2次ベジェの終端に矢頭を作る（PathLayer の arrowHead と同形式） */
function arrowHead(from: Point, to: Point, col: string, key: string, view: PitchViewMode | undefined) {
  const ax = from.x,
    ay = yToTop(from.y, view),
    bx = to.x,
    by = yToTop(to.y, view);
  const ang = Math.atan2(by - ay, bx - ax);
  const Lh = 2.6,
    W = 1.6;
  const x1 = bx - Lh * Math.cos(ang) + W * Math.sin(ang);
  const y1 = by - Lh * Math.sin(ang) - W * Math.cos(ang);
  const x2 = bx - Lh * Math.cos(ang) - W * Math.sin(ang);
  const y2 = by - Lh * Math.sin(ang) + W * Math.cos(ang);
  return (
    <polygon
      key={key}
      points={`${bx.toFixed(1)},${by.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(
        1
      )} ${x2.toFixed(1)},${y2.toFixed(1)}`}
      fill={col}
    />
  );
}

type DragKind = "move" | "resize" | "p0" | "p1" | "c";

interface DragState {
  id: string;
  kind: DragKind;
  sx: number;
  sy: number;
  orig: Shape;
}

export default function ShapesLayer() {
  const board = useBoard();
  const view = board.state.pitchView;
  const drag = useRef<DragState | null>(null);

  // アニメ中の「描き込み」表示OFF：図形は描画しない
  const hideDrawings = board.mode === "anim" && !board.showDrawings;
  const shapes = hideDrawings
    ? []
    : (board.state.shapes ?? []).filter((s) =>
        board.mode === "edit"
          ? s.step == null
          : s.step == null || s.step === board.viewStep
      );

  // 図形操作は常時可能（Keynote風：パレット未オープンでもクリック選択・ドラッグできる）
  const interactive = true;

  // 図形要素・トークン・ボール以外（ピッチ背景/罫線）をタップしたら選択解除する。
  // SVGルートは常に pointer-events:none のため、SVG側の背景タップ判定では拾えない。
  // ペン（.pathsvg.pen）配下やミニツールバー（.formatbar）のクリックは対象外にする
  // （ネイティブaddEventListenerはReactのsynthetic stopPropagationより先に着火するため明示除外が必要）。
  useEffect(() => {
    const el = board.pitchRef.current;
    if (!el) return;
    const onBgPointerDown = (e: PointerEvent) => {
      if (board.selShape == null && board.selStroke == null) return;
      const target = e.target as Element | null;
      if (
        target?.closest(".tok, .ball, svg.shapes, .shapetext, .pathsvg.pen, .formatbar")
      )
        return;
      board.setSelShape(null);
      board.setSelStroke(null);
    };
    el.addEventListener("pointerdown", onBgPointerDown);
    return () => el.removeEventListener("pointerdown", onBgPointerDown);
  }, [board.pitchRef, board.selShape, board.selStroke, board.setSelShape, board.setSelStroke]);

  // コミット後（ペイント前）に実測ディスク中心で link/hull の描画点を補正する。
  // レンダー中に getBoundingClientRect を読むと古い位置を拾う（stale read）ため、
  // レンダーは actorPos のみで行い、この useLayoutEffect で確定値へ合わせる。
  // board オブジェクト自体を依存にすると毎レンダ実行になるため、個別の値を列挙する
  useLayoutEffect(() => {
    board.syncAttachedShapes(board.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    board.state.shapes,
    board.state.slots,
    board.state.opponents,
    board.state.ball,
    board.state.pitchView,
    board.mode,
    board.viewStep,
  ]);

  const startDrag = (e: React.PointerEvent, id: string, kind: DragKind, orig: Shape) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* 一部環境では capture 不可。続行する */
    }
    drag.current = { id, kind, sx: e.clientX, sy: e.clientY, orig };
    board.setSelShape(id);
    board.setShapesOpen(true);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = board.getPitchRect();
    if (!r) return;
    const dxPct = ((e.clientX - d.sx) / r.width) * 100;
    const dyPct = -((e.clientY - d.sy) / r.height) * ySpan(view);

    if (d.kind === "move") {
      if (d.orig.kind === "arrow") {
        const o = d.orig;
        board.updateShape(d.id, {
          p0: { x: clamp(o.p0.x + dxPct, 0, 100), y: clamp(o.p0.y + dyPct, 0, 100) },
          p1: { x: clamp(o.p1.x + dxPct, 0, 100), y: clamp(o.p1.y + dyPct, 0, 100) },
          c: { x: clamp(o.c.x + dxPct, 0, 100), y: clamp(o.c.y + dyPct, 0, 100) },
        });
      } else if (
        d.orig.kind === "zoneEllipse" ||
        d.orig.kind === "zoneRect" ||
        d.orig.kind === "text"
      ) {
        // 追従図形（link/hull）は actor 追従のため move ドラッグ非対応
        const o = d.orig;
        board.updateShape(d.id, {
          x: clamp(o.x + dxPct, 0, 100),
          y: clamp(o.y + dyPct, 0, 100),
        });
      }
      return;
    }
    if (d.kind === "resize" && (d.orig.kind === "zoneEllipse" || d.orig.kind === "zoneRect")) {
      const o = d.orig as ZoneShape;
      board.updateShape(d.id, {
        w: Math.max(6, o.w + dxPct * 2),
        h: Math.max(6, o.h - dyPct * 2),
      });
      return;
    }
    if (d.orig.kind === "arrow" && (d.kind === "p0" || d.kind === "p1" || d.kind === "c")) {
      const o = d.orig as ArrowShape;
      const base = o[d.kind];
      board.updateShape(d.id, {
        [d.kind]: { x: clamp(base.x + dxPct, 0, 100), y: clamp(base.y + dyPct, 0, 100) },
      } as ShapePatch);
    }
  };

  const onDragEnd = () => {
    drag.current = null;
  };

  const dragProps = (id: string, kind: DragKind, orig: Shape) => ({
    onPointerDown: (e: React.PointerEvent) => startDrag(e, id, kind, orig),
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  });

  const svgShapes = shapes.filter(
    (s): s is Exclude<Shape, { kind: "text" | "link" | "hull" }> =>
      s.kind !== "text" && s.kind !== "link" && s.kind !== "hull"
  );
  const textShapes = shapes.filter((s): s is Extract<Shape, { kind: "text" }> => s.kind === "text");
  const linkShapes = shapes.filter((s): s is LinkShape => s.kind === "link");
  const hullShapes = shapes.filter((s): s is HullShape => s.kind === "hull");

  // 追従図形（link/hull）の「今の位置」。レンダー中は actorPos のみで計算する
  // （getBoundingClientRect はレンダー中に読まない＝stale read を避ける）。
  // ディスクの実測中心への補正はコミット後の useLayoutEffect（syncAttachedShapes）が行う
  const now = board.getTime();
  const posOf = (a: Actor): Point =>
    actorPos(
      a,
      now,
      board.state.moves,
      board.state.slots,
      board.state.ball,
      board.state.opponents,
      board.state.holder
    );

  if (
    svgShapes.length === 0 &&
    textShapes.length === 0 &&
    linkShapes.length === 0 &&
    hullShapes.length === 0 &&
    !interactive
  )
    return null;

  return (
    <>
      <svg
        className={`pathsvg shapes${interactive ? " active" : ""}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {linkShapes.map((s) => {
          const col = s.color ?? "#ffe27a";
          const sel = board.selShape === s.id;
          const w = s.width ?? 1.0;
          const pts = s.actors
            .map((a) => posOf(a))
            .map((p) => `${p.x.toFixed(1)},${yToTop(p.y, view).toFixed(1)}`)
            .join(" ");
          return (
            <polyline
              key={s.id}
              ref={(el) => board.registerShapeEl(s.id, el)}
              points={pts}
              fill="none"
              stroke={col}
              strokeWidth={sel ? w + 0.6 : w}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: interactive ? "auto" : "none" }}
              onPointerDown={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                board.setSelShape(s.id);
                board.setShapesOpen(true);
              }}
            />
          );
        })}
        {hullShapes.map((s) => {
          const col = s.color ?? "#ffe27a";
          const sel = board.selShape === s.id;
          const pts = convexHull(s.actors.map((a) => {
            const p = posOf(a);
            return { x: p.x, y: yToTop(p.y, view) };
          }));
          const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          return (
            <polygon
              key={s.id}
              ref={(el) => board.registerShapeEl(s.id, el)}
              points={points}
              fill={col}
              fillOpacity={0.14}
              stroke={col}
              strokeWidth={sel ? 1.3 : 0.7}
              style={{ pointerEvents: interactive ? "auto" : "none" }}
              onPointerDown={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                board.setSelShape(s.id);
                board.setShapesOpen(true);
              }}
            />
          );
        })}
        {svgShapes.map((s) => {
          const col = s.color ?? "#ffe27a";
          const sel = board.selShape === s.id;
          if (s.kind === "zoneEllipse" || s.kind === "zoneRect") {
            const cx = s.x;
            const cy = yToTop(s.y, view);
            const rx = s.w / 2;
            // データの h はそのまま。half表示では画面上の高さが2倍に見えるようスケールする
            const ry = (s.h * (100 / ySpan(view))) / 2;
            const zw = s.width ?? 0.5;
            return (
              <g key={s.id} ref={(el) => board.registerShapeEl(s.id, el)}>
                {s.kind === "zoneEllipse" ? (
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    fill={col}
                    fillOpacity={0.22}
                    stroke={col}
                    strokeWidth={zw}
                    opacity={0.85}
                    style={{ pointerEvents: interactive ? "auto" : "none" }}
                    {...dragProps(s.id, "move", s)}
                  />
                ) : (
                  <rect
                    x={cx - rx}
                    y={cy - ry}
                    width={s.w}
                    height={ry * 2}
                    rx={1.5}
                    fill={col}
                    fillOpacity={0.22}
                    stroke={col}
                    strokeWidth={zw}
                    opacity={0.85}
                    style={{ pointerEvents: interactive ? "auto" : "none" }}
                    {...dragProps(s.id, "move", s)}
                  />
                )}
                {sel && (
                  <circle
                    className="shapehandle"
                    cx={cx + rx}
                    cy={cy + ry}
                    r={1.6}
                    style={{ pointerEvents: interactive ? "auto" : "none" }}
                    {...dragProps(s.id, "resize", s)}
                  />
                )}
              </g>
            );
          }
          if (s.kind === "arrow") {
            const p0 = { x: s.p0.x, y: yToTop(s.p0.y, view) };
            const p1 = { x: s.p1.x, y: yToTop(s.p1.y, view) };
            const c = { x: s.c.x, y: yToTop(s.c.y, view) };
            // 軸線は矢頭の根元で切り詰める（見た目の先端 p1 と矢頭の向きは不変）
            const trimmed = trimQuadEnd(p0, c, p1, 2.1);
            return (
              <g key={s.id} ref={(el) => board.registerShapeEl(s.id, el)}>
                <path
                  d={`M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${trimmed.c.x.toFixed(
                    1
                  )} ${trimmed.c.y.toFixed(1)} ${trimmed.end.x.toFixed(1)} ${trimmed.end.y.toFixed(
                    1
                  )}`}
                  fill="none"
                  stroke={col}
                  strokeWidth={s.width ?? 1.1}
                  strokeDasharray={s.dash ? "2.4 1.6" : undefined}
                  strokeLinecap="round"
                  style={{ pointerEvents: interactive ? "auto" : "none" }}
                  {...dragProps(s.id, "move", s)}
                />
                {arrowHead(s.c, s.p1, col, `${s.id}-head`, view)}
                {sel && (
                  <>
                    <line className="shapeguide" x1={p0.x} y1={p0.y} x2={c.x} y2={c.y} />
                    <line className="shapeguide" x1={c.x} y1={c.y} x2={p1.x} y2={p1.y} />
                    <circle
                      className="shapehandle"
                      cx={p0.x}
                      cy={p0.y}
                      r={1.8}
                      style={{ pointerEvents: interactive ? "auto" : "none" }}
                      {...dragProps(s.id, "p0", s)}
                    />
                    <circle
                      className="shapehandle"
                      cx={p1.x}
                      cy={p1.y}
                      r={1.8}
                      style={{ pointerEvents: interactive ? "auto" : "none" }}
                      {...dragProps(s.id, "p1", s)}
                    />
                    <circle
                      className="shapehandle ctrl"
                      cx={c.x}
                      cy={c.y}
                      r={1.3}
                      style={{ pointerEvents: interactive ? "auto" : "none" }}
                      {...dragProps(s.id, "c", s)}
                    />
                  </>
                )}
              </g>
            );
          }
          return null;
        })}
      </svg>
      {textShapes.map((s) => {
        const sel = board.selShape === s.id;
        return (
          <div
            key={s.id}
            ref={(el) => board.registerShapeEl(s.id, el)}
            className={`shapetext${sel ? " sel" : ""}`}
            style={{
              left: `${s.x}%`,
              top: `${yToTop(s.y, view)}%`,
              fontSize: `${TEXT_SIZE[s.size ?? "m"]}px`,
              borderColor: s.color ?? "#ffe27a",
              pointerEvents: interactive ? "auto" : "none",
            }}
            {...dragProps(s.id, "move", s)}
          >
            {s.text}
          </div>
        );
      })}
      {hullShapes
        .filter((s) => s.showCount !== false)
        .map((s) => {
          const pts = convexHull(
            s.actors.map((a) => {
              const p = posOf(a);
              return { x: p.x, y: yToTop(p.y, view) };
            })
          );
          if (pts.length === 0) return null;
          const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
          const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
          return (
            <div
              key={s.id + "_badge"}
              ref={(el) => board.registerShapeEl(s.id + "_badge", el)}
              className="hullcount"
              style={{ left: `${cx}%`, top: `${cy}%`, background: s.color ?? "#ffe27a" }}
            >
              {s.actors.length}人
            </div>
          );
        })}
    </>
  );
}
