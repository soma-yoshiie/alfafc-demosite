"use client";

import { useRef } from "react";
import type React from "react";
import type { Actor, Point } from "@/lib/types";
import { isOppActor, oppIndex } from "@/lib/types";
import { roleFromXY } from "@/lib/formations";
import { simplify, straightenIfLine } from "@/lib/animation";
import { topToY, ySpan, yToTop } from "@/lib/pitchView";
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
 * 選手トークン / ボール / 相手トークン共通のドラッグ操作。
 * editモード: 移動・入れ替え・タップ。
 * animモード: ピッチ上のなぞりをルートとして記録（現在の場面へ追加）。
 */
export function usePointerDrag(actor: Actor) {
  const board = useBoard();
  const view = board.state.pitchView;
  const d = useRef<DragState>({
    sx: 0, sy: 0, ox: 0, oy: 0, nx: 0, ny: 0,
    moved: false, rect: null, recording: false, pts: [], active: false,
  });

  const base = (): Point => {
    const st = board.stateRef.current;
    if (actor === "ball") return st.ball;
    if (typeof actor === "number") return st.slots[actor];
    return (st.opponents ?? [])[oppIndex(actor)] ?? { x: 50, y: 50 };
  };

  /** アニメ中は再生ヘッドで動かした「表示位置」が起点（inline styleから読む） */
  const displayedPos = (el: HTMLElement): Point => {
    const lx = parseFloat(el.style.left);
    const ty = parseFloat(el.style.top);
    if (Number.isFinite(lx) && Number.isFinite(ty)) return { x: lx, y: topToY(ty, view) };
    return base();
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
    const anim = board.mode === "anim";
    if (anim) board.stopPlay(); // 再生中のなぞり事故を防ぐ
    const b = anim ? displayedPos(el) : base();
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
    if (anim && board.animTool === "draw") {
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
    const [yMin, yMax] = view === "half" ? [51, 97] : [3, 97];
    const ny = clamp(st.oy - ((e.clientY - st.sy) / st.rect.height) * ySpan(view), yMin, yMax);
    st.nx = nx;
    st.ny = ny;
    const el = e.currentTarget;
    el.style.left = nx + "%";
    el.style.top = yToTop(ny, view) + "%";
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

    // ----- 図形の「選手タップ待ち」中は、タップをその選択に割り込ませる -----
    if (!st.moved && board.pendingShapeRef.current) {
      el.style.left = st.ox + "%";
      el.style.top = yToTop(st.oy, view) + "%";
      if (board.mode === "anim") {
        st.recording = false;
        board.setTempDraw(null);
      }
      board.pendingShapeTap(actor);
      return;
    }

    // ----- anim モード -----
    if (board.mode === "anim") {
      st.recording = false;
      board.setTempDraw(null);
      // タップ（移動なし）→ 操作対象の選択トグル
      if (!st.moved) {
        el.style.left = st.ox + "%";
        el.style.top = yToTop(st.oy, view) + "%";
        // 保持者を選択中に別の味方をタップ → パス生成（選択トグルより優先）。
        // 場面終了時点の保持者（場面内のパスを受けた選手）も対象＝同一場面からの連鎖を許可
        if (
          board.pendingShapeRef.current == null &&
          board.selActor != null &&
          (board.selActor === board.holderAtStep(board.activeStep) ||
            board.selActor === board.holderAtStepEnd(board.activeStep)) &&
          typeof actor === "number" &&
          board.stateRef.current.slots[actor]?.pid != null &&
          actor !== board.selActor
        ) {
          board.passTo(actor);
          return;
        }
        const on = board.selActor === actor;
        board.setSelActor(on ? null : actor);
        board.setSelMove(on ? null : { actor, step: board.activeStep });
        return;
      }
      // 「移動」ツール：配置とルートをまとめて平行移動
      if (board.animTool === "move") {
        board.translateActor(actor, st.nx - st.ox, st.ny - st.oy);
        return;
      }
      // ボールを味方ディスクへドラッグ＆ドロップ＝パスを自動生成する（保持者がいるときのみ・相手は対象外）
      if (actor === "ball") {
        const target = overlappingBallTarget(st, true);
        const holder =
          board.holderAtStep(board.activeStep) ??
          board.holderAtStepEnd(board.activeStep);
        if (typeof target === "number" && holder != null && target !== holder) {
          board.passTo(target);
          return;
        }
      }
      // 「ルート」ツール：ほぼ直線のドラッグは直線移動として確定
      const path = straightenIfLine(simplify(st.pts));
      if (path.length >= 2) {
        board.addMove(actor, path);
        board.setSelActor(actor);
        board.setSelMove({ actor, step: board.activeStep });
        // その場面をすぐ再生して結果を見せる
        setTimeout(() => board.playStep(board.activeStep), 60);
      } else {
        el.style.left = st.ox + "%";
        el.style.top = yToTop(st.oy, view) + "%";
      }
      return;
    }

    // ----- edit モード -----
    // ドラッグ中に手で書いたインラインstyleを一旦ホーム位置へ戻し、
    // 以降の配置は React の props(state) に委ねる（imperativeとpropの同期ズレ防止）。
    const resetStyle = () => {
      el.style.left = st.ox + "%";
      el.style.top = yToTop(st.oy, view) + "%";
    };

    if (!st.moved) {
      resetStyle();
      if (actor === "ball") return;
      if (typeof actor === "number") onSlotTap(actor);
      else board.openSheet({ type: "oppMenu", opp: oppIndex(actor) });
      return;
    }
    if (actor === "ball") {
      const target = overlappingBallTarget(st);
      if (target != null) {
        board.setHolder(target);
        board.toast(`${ballHolderLabel(target)}にボールを持たせました`);
      } else {
        const wasHeld = board.stateRef.current.holder != null;
        board.setHolder(null);
        board.setBall(st.nx, st.ny);
        if (wasHeld) board.toast("ボールを離しました");
      }
      return;
    }
    if (isOppActor(actor)) {
      resetStyle();
      board.moveOpponent(oppIndex(actor), st.nx, st.ny);
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
    const dy = rect.top + (yToTop(st.ny, view) / 100) * rect.height;
    const THRESHOLD = 40; // px（ディスク径相当＝見た目で重なったら成立）
    let best = -1;
    let bestDist = THRESHOLD;
    for (let j = 0; j < slots.length; j++) {
      if (j === self) continue;
      if (slots[j].pid == null) continue;
      const cx = rect.left + (slots[j].x / 100) * rect.width;
      const cy = rect.top + (yToTop(slots[j].y, view) / 100) * rect.height;
      const dist = Math.hypot(dx - cx, dy - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = j;
      }
    }
    return best;
  }

  /**
   * ドラッグ中の「ボール」の中心(nx,ny)に重なっている選手（pidあり枠）または相手トークンを返す（なければ null）。
   * overlappingOccupiedSlot と同じ px 閾値（ディスク径相当）で判定し、相手トークンも対象に含める。
   * alliesOnly=true のときは相手トークンを候補から除外する（アニメ中のボールD&Dパス判定用）。
   */
  function overlappingBallTarget(st: DragState, alliesOnly = false): Actor | null {
    const rect = st.rect;
    if (!rect) return null;
    const st_ = board.stateRef.current;
    const dx = rect.left + (st.nx / 100) * rect.width;
    const dy = rect.top + (yToTop(st.ny, view) / 100) * rect.height;
    const THRESHOLD = 40; // px（ディスク径相当＝見た目で重なったら成立）
    let best: Actor | null = null;
    let bestDist = THRESHOLD;
    st_.slots.forEach((s, j) => {
      if (s.pid == null) return;
      const cx = rect.left + (s.x / 100) * rect.width;
      const cy = rect.top + (yToTop(s.y, view) / 100) * rect.height;
      const dist = Math.hypot(dx - cx, dy - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = j;
      }
    });
    if (!alliesOnly) {
      (st_.opponents ?? []).forEach((o, j) => {
        const cx = rect.left + (o.x / 100) * rect.width;
        const cy = rect.top + (yToTop(o.y, view) / 100) * rect.height;
        const dist = Math.hypot(dx - cx, dy - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = `opp${j}` as Actor;
        }
      });
    }
    return best;
  }

  /** toast用の保持者ラベル（選手名 or 「相手n」） */
  function ballHolderLabel(target: Actor): string {
    const st_ = board.stateRef.current;
    if (typeof target === "number") {
      const s = st_.slots[target];
      const p = s?.pid ? st_.players.find((pl) => pl.id === s.pid) : null;
      return p?.name ?? "選手";
    }
    const o = (st_.opponents ?? [])[oppIndex(target)];
    return `相手${o?.label ?? oppIndex(target) + 1}`;
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
