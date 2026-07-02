"use client";

import { useRef } from "react";
import type React from "react";
import type { Actor, Point } from "@/lib/types";
import { roleFromXY } from "@/lib/formations";
import { simplify } from "@/lib/animation";
import { useBoard } from "./BoardProvider";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface DragState {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  nx: number;
  ny: number;
  moved: boolean;
  rect: DOMRect | null;
  recording: boolean;
  pts: Point[];
  active: boolean;
}

/**
 * 選手トークン / ボール共通のドラッグ操作。
 * editモード: 移動・入れ替え・タップ。
 * animモード: ピッチ上のなぞりをルートとして記録。
 */
export function usePointerDrag(actor: Actor) {
  const board = useBoard();
  const d = useRef<DragState>({
    sx: 0, sy: 0, ox: 0, oy: 0, nx: 0, ny: 0,
    moved: false, rect: null, recording: false, pts: [], active: false,
  });

  const base = (): Point => {
    const st = board.stateRef.current;
    return actor === "ball" ? st.ball : st.slots[actor as number];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const st = d.current;
    st.rect = board.getPitchRect();
    st.moved = false;
    st.active = true;
    st.sx = e.clientX;
    st.sy = e.clientY;
    const b = base();
    st.ox = b.x;
    st.oy = b.y;
    st.nx = b.x;
    st.ny = b.y;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 一部環境では capture 不可。続行する */
    }
    el.classList.add("drag");
    if (board.mode === "anim") {
      st.recording = true;
      st.pts = [{ x: b.x, y: b.y }];
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const st = d.current;
    if (!st.active || !st.rect) return;
    if (Math.abs(e.clientX - st.sx) > 5 || Math.abs(e.clientY - st.sy) > 5)
      st.moved = true;
    const nx = clamp(st.ox + ((e.clientX - st.sx) / st.rect.width) * 100, 3, 97);
    const ny = clamp(st.oy - ((e.clientY - st.sy) / st.rect.height) * 100, 3, 97);
    st.nx = nx;
    st.ny = ny;
    const el = e.currentTarget;
    el.style.left = nx + "%";
    el.style.top = 100 - ny + "%";
    if (board.mode === "anim" && st.recording) {
      const last = st.pts[st.pts.length - 1];
      if (Math.hypot(nx - last.x, ny - last.y) > 2.2) {
        st.pts.push({ x: nx, y: ny });
        board.setTempDraw({ actor, pts: st.pts.slice() });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const st = d.current;
    const el = e.currentTarget;
    el.classList.remove("drag");
    if (!st.active) return;
    st.active = false;

    // ----- anim モード -----
    if (board.mode === "anim") {
      st.recording = false;
      board.setTempDraw(null);
      // タップ（移動なし）→ 操作対象の選択トグル
      if (!st.moved) {
        el.style.left = st.ox + "%";
        el.style.top = 100 - st.oy + "%";
        board.setSelActor(board.selActor === actor ? null : actor);
        return;
      }
      const path = simplify(st.pts);
      if (path.length >= 2) {
        board.addMove(actor, path);
        board.setSelActor(actor);
        board.toast("ルートを追加しました");
      }
      // トークンは開始位置へ戻す（再描画で確定）
      el.style.left = st.ox + "%";
      el.style.top = 100 - st.oy + "%";
      return;
    }

    // ----- edit モード -----
    // ドラッグ中に手で書いたインラインstyleを一旦ホーム位置へ戻し、
    // 以降の配置は React の props(state) に委ねる（imperativeとpropの同期ズレ防止）。
    const resetStyle = () => {
      el.style.left = st.ox + "%";
      el.style.top = 100 - st.oy + "%";
    };

    if (!st.moved) {
      resetStyle();
      if (actor !== "ball") onSlotTap(actor as number);
      return;
    }
    if (actor === "ball") {
      board.setBall(st.nx, st.ny);
      return;
    }
    // ドラッグ中トークンの「中心」が、別の選手がいる枠に重なっていれば入れ替え。
    // 重なっていなければ自由移動（カーソル位置ではなくトークン中心で判定するためズレに強い）。
    const target = overlappingOccupiedSlot(st, actor as number);
    resetStyle();
    if (target >= 0) {
      board.swapSlots(actor as number, target);
      board.toast("選手を入れ替えました");
    } else {
      const role = roleFromXY(st.nx, st.ny);
      board.moveSlot(actor as number, st.nx, st.ny, role);
    }
  };

  /**
   * ドラッグ中トークンの中心(nx,ny)に重なっている「選手がいる枠」の slot 番号を返す（なければ -1）。
   * ディスク径(44px)相当の距離で判定。空き枠とは入れ替えない（自由移動に任せる）。
   */
  function overlappingOccupiedSlot(st: DragState, self: number): number {
    const rect = st.rect;
    if (!rect) return -1;
    const slots = board.stateRef.current.slots;
    const dx = rect.left + (st.nx / 100) * rect.width;
    const dy = rect.top + ((100 - st.ny) / 100) * rect.height;
    const THRESHOLD = 40; // px（ディスク径相当＝見た目で重なったら成立）
    let best = -1;
    let bestDist = THRESHOLD;
    for (let j = 0; j < slots.length; j++) {
      if (j === self) continue;
      if (slots[j].pid == null) continue;
      const cx = rect.left + (slots[j].x / 100) * rect.width;
      const cy = rect.top + ((100 - slots[j].y) / 100) * rect.height;
      const dist = Math.hypot(dx - cx, dy - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = j;
      }
    }
    return best;
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    const st = d.current;
    e.currentTarget.classList.remove("drag");
    st.active = false;
    st.recording = false;
    board.setTempDraw(null);
  };

  const onSlotTap = (slot: number) => {
    const s = board.stateRef.current.slots[slot];
    if (s.pid == null) board.openSheet({ type: "assign", slot });
    else board.openSheet({ type: "slotMenu", slot });
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
