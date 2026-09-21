"use client";

// ボールの軌道（キック/スローの狙い）を編集するレイヤー（setpiece-redesign §4）。
// 親(Pitch.tsx)が「ボールの軌道」グループが開いている間だけマウントする。
// 軌道の線はPathLayerのボールの線と同じ色・線種（白・パス/シュートで実線か二重線）で描き、
// 狙う場所にドラッグ可能なハンドル（タップ領域44px）を出す。
// ドラッグ中はusePointerDragと同じ流儀でDOM（ハンドル位置・線のpoints）を直接書き換え、
// pointerup時だけstateへ反映する（毎moveのdispatchによる再描画コストを避ける）。

import { useRef } from "react";
import type React from "react";
import { actorColor } from "@/lib/colors";
import { buildDeliveryMove, getDelivery } from "@/lib/setPieceDelivery";
import { topToY, yToTop } from "@/lib/pitchView";
import type { Point } from "@/lib/types";
import { useBoard } from "./BoardProvider";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function DeliveryLayer() {
  const board = useBoard();
  const view = board.state.pitchView;
  const delivery = getDelivery(board.state);
  const move = board.state.moves.find((m) => m.actor === "ball" && (m.step ?? 0) === 0);

  const lineRef = useRef<SVGPolylineElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ rect: DOMRect | null; active: boolean; last: Point | null }>({
    rect: null,
    active: false,
    last: null,
  });

  // 統括の最終調整: 以前はここで「move が無ければ既定の軌道を自動で作る」effect を持っていたが、
  // (1)「消す」で削除した直後に再発火して消せない (2) グループを開いただけで move が 1 件増え、
  // 手を入れていない盤面でも以後すべての切り替えに確認ダイアログが出る、の 2 つを招いた。
  // 自動生成はやめ、操作列の「軌道を作る」を押したときだけ作る（仕様 §4 も同じに改めた）

  if (!delivery || !move) return null;

  const col = actorColor("ball", board.state.slots);
  // 「消す」で無くなった直後の再描画漏れ対策も兼ね、実際のmoveの線種で見た目を合わせる
  const dashed = move.kind !== "shot";

  const pointsOf = (pts: Point[]) => pts.map((p) => `${p.x.toFixed(2)},${yToTop(p.y, view).toFixed(2)}`).join(" ");

  const previewPoints = (target: Point): string => {
    const built = buildDeliveryMove({
      from: board.stateRef.current.ball,
      target,
      trajectory: delivery.trajectory,
      bend: delivery.bend,
      slots: board.stateRef.current.slots,
    });
    return pointsOf(built.path);
  };

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current.rect = board.getPitchRect();
    drag.current.active = true;
    drag.current.last = null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 一部環境では capture 不可。続行する */
    }
  };

  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = drag.current;
    if (!st.active || !st.rect) return;
    const xPct = clamp(((e.clientX - st.rect.left) / st.rect.width) * 100, 0, 100);
    const topPct = ((e.clientY - st.rect.top) / st.rect.height) * 100;
    const y = clamp(topToY(topPct, view), 0, 100);
    const target: Point = { x: xPct, y };
    st.last = target;
    if (handleRef.current) {
      handleRef.current.style.left = xPct + "%";
      handleRef.current.style.top = yToTop(y, view) + "%";
    }
    if (lineRef.current) {
      lineRef.current.setAttribute("points", previewPoints(target));
    }
  };

  const onHandleUp = () => {
    const st = drag.current;
    st.active = false;
    const target = st.last ?? delivery.target;
    st.last = null;
    board.setSetPieceDelivery(
      buildDeliveryMove({
        from: board.stateRef.current.ball,
        target,
        trajectory: delivery.trajectory,
        bend: delivery.bend,
        slots: board.stateRef.current.slots,
      })
    );
  };

  return (
    <>
      <svg className="deliverysvg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          ref={lineRef}
          points={pointsOf(move.path)}
          fill="none"
          stroke={col}
          strokeWidth={0.9}
          strokeDasharray={dashed ? "2.4 1.6" : undefined}
          strokeLinecap="round"
        />
      </svg>
      <div
        ref={handleRef}
        className="deliveryhandle"
        style={{ left: `${delivery.target.x}%`, top: `${yToTop(delivery.target.y, view)}%` }}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      >
        <div className="deliveryhandledot" />
      </div>
    </>
  );
}
