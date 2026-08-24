// Phase3 出力強化：時刻t のボード全体を Canvas に描く共通基盤。
// lib/exportImage.ts（静的PNG）の描画コードを手本に、時刻tに応じたアニメ位置・
// 現在の場面のみのペン/図形/ルートを描けるよう拡張したもの。
// exportImage.ts 自体はこのファイルからは一切参照・変更しない（静止画の見た目を非破壊に保つ）。

import type { Actor, BoardState, Point, PitchViewMode, Position } from "./types";
import { isOppActor, moveKind, oppIndex } from "./types";
import { groupOf } from "./formations";
import { GROUP_COLORS, actorColor } from "./colors";
import { actorPos, alongPath, orderRank, pathLen, stepAtTime } from "./animation";
import { convexHull, trimQuadEnd } from "./geometry";
import { ySpan, yToTop } from "./pitchView";

/** ヘッダー帯の高さ（px・キャンバス幅によらず固定） */
export const HEADER_H = 36;

export interface FrameOpts {
  /** キャンバス幅 px */
  w: number;
  /** キャンバス高 px */
  h: number;
  /** 現在の場面のルート矢印を描くか（既定 true） */
  showPaths?: boolean;
}

/**
 * 用途別のキャンバスサイズを算出する。
 * width（キャンバス幅）を指定すると、ピッチ表示モードに応じた縦横比から
 * ヘッダー込みの高さを返す（full ≒ 480:640 / half ≒ 480:340 相当の比率）。
 * boxatk/boxdef は y可視範囲が42（=100の42%）と半分以下のため、横長（画面のPNG/GIF書き出しも
 * 同じ構図になるよう）に ≒ 480:300 相当の比率にする（PC表示側の横長クロップ演出と揃える）。
 */
export function frameSize(view: PitchViewMode | undefined, width: number): { w: number; h: number } {
  const ratio =
    view === "half" ? 340 / 480 :
    view === "boxatk" || view === "boxdef" ? 300 / 480 :
    640 / 480;
  return { w: width, h: Math.round(HEADER_H + width * ratio) };
}

/** 時刻 t（秒）のボード全体を ctx に描画する */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: BoardState,
  t: number,
  opts: FrameOpts
): void {
  const { w, h } = opts;
  const showPaths = opts.showPaths !== false;
  const view = state.pitchView;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0e0c";
  ctx.fillRect(0, 0, w, h);

  /* ---- ヘッダー ---- */
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "700 14px sans-serif";
  ctx.fillStyle = "#eafff0";
  ctx.fillText("ALFA", 12, HEADER_H / 2);
  const alfaW = ctx.measureText("ALFA").width;
  ctx.fillStyle = "#caff3a";
  ctx.fillText(" FOOTBALL", 12 + alfaW, HEADER_H / 2);

  ctx.fillStyle = "#caff3a";
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(state.formation, w - 12, HEADER_H / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  /* ---- ピッチ領域 ---- */
  const margin = Math.max(8, Math.round(w * 0.02));
  const px = margin;
  const py = HEADER_H + margin;
  const pw = w - margin * 2;
  const ph = h - py - margin;
  // exportImage.ts（pw≒702px基準）に合わせた各パーツのスケール係数
  const scale = pw / 702;
  const S = (v: number) => v * scale;

  const mapX = (x: number) => px + (x / 100) * pw;
  const mapY = (y: number) => py + (yToTop(y, view) / 100) * ph;

  /* ---- 芝ストライプ＋ライン ---- */
  roundRectPath(ctx, px, py, pw, ph, S(18));
  ctx.save();
  ctx.clip();
  const bands = 11;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#15493a" : "#12402f";
    ctx.fillRect(px, py + (i * ph) / bands, pw, ph / bands + 1);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, S(2));
  const boxW = pw * 0.52;
  const boxH = ph * 0.14;
  const gboxW = pw * 0.28;
  const gboxH = ph * 0.06;
  if (view === "half") {
    ctx.beginPath();
    ctx.moveTo(px + 4, py + ph - 4);
    ctx.lineTo(px + 4, py + 4);
    ctx.lineTo(px + pw - 4, py + 4);
    ctx.lineTo(px + pw - 4, py + ph - 4);
    ctx.stroke();
    ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + 4, gboxW, gboxH);
    ctx.beginPath();
    ctx.moveTo(px + 8, py + ph - 4);
    ctx.lineTo(px + pw - 8, py + ph - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph - 4, pw * 0.16, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (view === "boxatk") {
    // 敵陣ボックス周辺クロップ：開いた3辺＋ゴールエリア（下端はクロップ線＝ピッチの実在ラインでは
    // ないため、half表示のハーフウェイライン/センターサークルに相当する装飾は描かない）
    ctx.beginPath();
    ctx.moveTo(px + 4, py + ph - 4);
    ctx.lineTo(px + 4, py + 4);
    ctx.lineTo(px + pw - 4, py + 4);
    ctx.lineTo(px + pw - 4, py + ph - 4);
    ctx.stroke();
    ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + 4, gboxW, gboxH);
  } else if (view === "boxdef") {
    // 自陣ボックス周辺クロップ：開いた3辺（上端がクロップ線）＋ゴールエリア
    ctx.beginPath();
    ctx.moveTo(px + 4, py + 4);
    ctx.lineTo(px + 4, py + ph - 4);
    ctx.lineTo(px + pw - 4, py + ph - 4);
    ctx.lineTo(px + pw - 4, py + 4);
    ctx.stroke();
    ctx.strokeRect(px + (pw - boxW) / 2, py + ph - 4 - boxH, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + ph - 4 - gboxH, gboxW, gboxH);
  } else {
    ctx.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
    ctx.beginPath();
    ctx.moveTo(px + 8, py + ph / 2);
    ctx.lineTo(px + pw - 8, py + ph / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, pw * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, Math.max(1.5, S(4)), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();
    ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + 4, gboxW, gboxH);
    ctx.strokeRect(px + (pw - boxW) / 2, py + ph - 4 - boxH, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + ph - 4 - gboxH, gboxW, gboxH);
  }
  ctx.restore();

  /* ---- ピッチガイド（5レーン・エリア名・凡例） ---- */
  const guides = state.guides ?? {};
  if (guides.lanes || guides.zones) {
    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, S(18));
    ctx.clip();
    if (guides.lanes) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(mapX(20), py, mapX(40) - mapX(20), ph);
      ctx.fillRect(mapX(60), py, mapX(80) - mapX(60), ph);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = Math.max(0.8, S(1.4));
      ctx.setLineDash([S(6), S(5)]);
      [20, 40, 60, 80].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(mapX(x), py);
        ctx.lineTo(mapX(x), py + ph);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    if (guides.zones) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = Math.max(0.8, S(1.4));
      ctx.setLineDash([S(6), S(5)]);
      // half/boxatk/boxdef表示では可視範囲外にかかる境界線は画面（GuideLayer）に出ないため描かない
      [100 / 3, 200 / 3]
        .filter((y) => {
          if (view === "half") return y > 50;
          if (view === "boxatk") return y > 58;
          if (view === "boxdef") return y < 42;
          return true;
        })
        .forEach((y) => {
          ctx.beginPath();
          ctx.moveTo(px, mapY(y));
          ctx.lineTo(px + pw, mapY(y));
          ctx.stroke();
        });
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(mapX(30), mapY(88), mapX(70) - mapX(30), mapY(74) - mapY(88));
    }
    ctx.restore();

    if (guides.zones) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `700 ${Math.max(9, S(13))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // 各見出しは、現在のビューで可視の範囲にあるものだけ描く
      // （boxatk/boxdefはボックス周辺のみのクロップのため、該当するサード1つ以外は画面に出ない）
      if (view !== "boxatk" && view !== "boxdef") {
        ctx.fillText("アタッキングサード", px + S(14), mapY((200 / 3 + 100) / 2));
        ctx.fillText("ミドルサード", px + S(14), mapY((100 / 3 + 200 / 3) / 2));
      } else if (view === "boxatk") {
        ctx.fillText("アタッキングサード", px + S(14), mapY((200 / 3 + 100) / 2));
      }
      // half/boxatk表示では自陣側の「ディフェンディングサード」は画面に出ないため描かない
      if (view !== "half" && view !== "boxatk") {
        ctx.fillText("ディフェンディングサード", px + S(14), mapY((0 + 100 / 3) / 2));
      }
      ctx.textAlign = "center";
      // 「バイタルエリア」（y81）はboxdef（y0-42）では画面に出ないため描かない
      if (view !== "boxdef") {
        ctx.fillText("バイタルエリア", mapX(50), mapY(81));
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
  if (guides.legend) {
    const bx = px + S(14);
    const bw = S(150);
    const rowH = S(22);
    const rows: { label: string; dash: number[]; wavy?: boolean; double?: boolean }[] = [
      { label: "ラン", dash: [] },
      { label: "パス", dash: [S(6), S(4)] },
      { label: "ドリブル", dash: [], wavy: true },
      { label: "シュート＝二重線", dash: [], double: true },
    ];
    const bh = rowH * rows.length + S(16);
    const by = py + ph - bh - S(14);
    roundRectPath(ctx, bx, by, bw, bh, S(8));
    ctx.fillStyle = "rgba(10,14,12,0.6)";
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, S(1));
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
    ctx.lineCap = "round";
    rows.forEach((r, i) => {
      const ly = by + S(14) + i * rowH;
      ctx.beginPath();
      if (r.wavy) {
        ctx.moveTo(bx + S(10), ly);
        ctx.quadraticCurveTo(bx + S(16), ly - S(4), bx + S(22), ly);
        ctx.quadraticCurveTo(bx + S(28), ly + S(4), bx + S(34), ly);
      } else if (r.double) {
        ctx.moveTo(bx + S(10), ly - S(2));
        ctx.lineTo(bx + S(34), ly - S(2));
        ctx.moveTo(bx + S(10), ly + S(2));
        ctx.lineTo(bx + S(34), ly + S(2));
      } else {
        ctx.moveTo(bx + S(10), ly);
        ctx.lineTo(bx + S(34), ly);
      }
      ctx.strokeStyle = "#ffe27a";
      ctx.lineWidth = Math.max(1, S(2));
      ctx.setLineDash(r.dash);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#eafff0";
      ctx.font = `700 ${Math.max(8, S(12))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(r.label, bx + S(42), ly);
    });
    ctx.textBaseline = "alphabetic";
  }

  /* ---- 現在の場面 ---- */
  const cur = stepAtTime(state.moves, t, state.stepCount);

  /* ---- ペンの描き込み（現在の場面 or 全場面共通のもの） ---- */
  (state.drawings ?? []).forEach((d) => {
    if (d.path.length < 2) return;
    if (d.step != null && d.step !== cur) return;
    const lw = ((d.width ?? 0.9) / 100) * pw * 0.85 + S(2);
    ctx.beginPath();
    ctx.moveTo(mapX(d.path[0].x), mapY(d.path[0].y));
    for (let i = 1; i < d.path.length; i++) {
      ctx.lineTo(mapX(d.path[i].x), mapY(d.path[i].y));
    }
    ctx.strokeStyle = d.color ?? "#ffe27a";
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(d.dash ? [lw * 2.4, lw * 1.8] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  /* ---- 図形オブジェクト（現在の場面 or 全場面共通のもの） ---- */
  (state.shapes ?? []).forEach((sh) => {
    if (sh.step != null && sh.step !== cur) return;
    const col = sh.color ?? "#ffe27a";
    if (sh.kind === "zoneEllipse" || sh.kind === "zoneRect") {
      const cx = mapX(sh.x);
      const cy = mapY(sh.y);
      const rw = (sh.w / 100) * pw;
      const rh = (sh.h / ySpan(view)) * ph;
      ctx.beginPath();
      if (sh.kind === "zoneEllipse") {
        ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      } else {
        roundRectPath(ctx, cx - rw / 2, cy - rh / 2, rw, rh, S(6));
      }
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = ((sh.width ?? 0.5) / 100) * pw * 0.85 + S(2);
      ctx.strokeStyle = col;
      ctx.stroke();
    } else if (sh.kind === "arrow") {
      const p0x = mapX(sh.p0.x);
      const p0y = mapY(sh.p0.y);
      const p1x = mapX(sh.p1.x);
      const p1y = mapY(sh.p1.y);
      const cxp = mapX(sh.c.x);
      const cyp = mapY(sh.c.y);
      const Lh = S(16);
      const Wd = S(9);
      // 軸線は矢頭の根元で切り詰める（見た目の先端・矢頭の向きは不変。ShapesLayer と同じ trim/Lh 比率）
      const trimmed = trimQuadEnd(
        { x: p0x, y: p0y },
        { x: cxp, y: cyp },
        { x: p1x, y: p1y },
        Lh * (2.1 / 2.6)
      );
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.quadraticCurveTo(trimmed.c.x, trimmed.c.y, trimmed.end.x, trimmed.end.y);
      ctx.strokeStyle = col;
      ctx.lineWidth = ((sh.width ?? 1.1) / 100) * pw * 0.85 + S(2);
      ctx.lineCap = "round";
      ctx.setLineDash(sh.dash ? [S(8), S(6)] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      const ang = Math.atan2(p1y - cyp, p1x - cxp);
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p1x - Lh * Math.cos(ang) + Wd * Math.sin(ang), p1y - Lh * Math.sin(ang) - Wd * Math.cos(ang));
      ctx.lineTo(p1x - Lh * Math.cos(ang) - Wd * Math.sin(ang), p1y - Lh * Math.sin(ang) + Wd * Math.cos(ang));
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    } else if (sh.kind === "text") {
      const cx = mapX(sh.x);
      const cy = mapY(sh.y);
      const fontPx = Math.max(8, S(sh.size === "s" ? 13 : sh.size === "l" ? 19 : 15));
      ctx.font = `700 ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const padX = S(12);
      const padY = S(8);
      const tw = ctx.measureText(sh.text).width;
      const bw = tw + padX * 2;
      const bh = fontPx + padY * 2;
      roundRectPath(ctx, cx - bw / 2, cy - bh / 2, bw, bh, S(8));
      ctx.fillStyle = "rgba(10,14,12,0.55)";
      ctx.fill();
      ctx.lineWidth = Math.max(1, S(1.5));
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(sh.text, cx, cy + 1);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    } else if (sh.kind === "link") {
      const pts = sh.actors.map((a) => actorPos(a, t, state.moves, state.slots, state.ball, state.opponents, state.holder));
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const qx = mapX(p.x);
          const qy = mapY(p.y);
          if (i === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        });
        ctx.strokeStyle = col;
        ctx.lineWidth = ((sh.width ?? 1.0) / 100) * pw * 0.85 + S(2);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    } else if (sh.kind === "hull") {
      const basePts = sh.actors.map((a) => actorPos(a, t, state.moves, state.slots, state.ball, state.opponents, state.holder));
      const hull = convexHull(basePts);
      if (hull.length >= 3) {
        ctx.beginPath();
        hull.forEach((p, i) => {
          const qx = mapX(p.x);
          const qy = mapY(p.y);
          if (i === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        });
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1, S(2));
        ctx.strokeStyle = col;
        ctx.stroke();
        if (sh.showCount !== false) {
          const cxp = hull.reduce((s, p) => s + p.x, 0) / hull.length;
          const cyp = hull.reduce((s, p) => s + p.y, 0) / hull.length;
          const cx = mapX(cxp);
          const cy = mapY(cyp);
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(6, S(15)), 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.fillStyle = "#0a0e0c";
          ctx.font = `800 ${Math.max(8, S(13))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${sh.actors.length}人`, cx, cy + 1);
          ctx.textBaseline = "alphabetic";
          ctx.textAlign = "left";
        }
      }
    }
  });

  /* ---- ルート矢印（現在の場面のみ） ---- */
  if (showPaths) {
    const curMoves = state.moves.filter((m) => (m.step ?? 0) === cur && m.path.length >= 2);
    curMoves.forEach((m) => {
      const col = actorColor(m.actor, state.slots);
      const kind = moveKind(m);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.2, pw * 0.011);
      if (kind === "shot") {
        // シュート：法線方向に±0.55オフセットした平行2本の実線（二重線）
        const a = m.path[0];
        const b = m.path[m.path.length - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const off = 0.55;
        [off, -off].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(mapX(a.x + nx * s), mapY(a.y + ny * s));
          ctx.lineTo(mapX(b.x + nx * s), mapY(b.y + ny * s));
          ctx.stroke();
        });
      } else {
        ctx.beginPath();
        if (kind === "dribble") {
          const pts = wavyDataPoints(m.path);
          pts.forEach((p, i) => {
            const qx = mapX(p.x);
            const qy = mapY(p.y);
            if (i === 0) ctx.moveTo(qx, qy);
            else ctx.lineTo(qx, qy);
          });
        } else {
          m.path.forEach((p, i) => {
            const qx = mapX(p.x);
            const qy = mapY(p.y);
            if (i === 0) ctx.moveTo(qx, qy);
            else ctx.lineTo(qx, qy);
          });
        }
        ctx.setLineDash(kind === "pass" ? [pw * 0.024, pw * 0.016] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 矢頭
      drawArrowHead(ctx, mapX, mapY, m.path[m.path.length - 2], m.path[m.path.length - 1], col, pw);

      // 始点の番号ドット
      const st = m.path[0];
      const n = orderRank(state.moves, m);
      const dotR = Math.max(3, pw * 0.027);
      const dcx = mapX(st.x);
      const dcy = mapY(st.y);
      ctx.beginPath();
      ctx.arc(dcx, dcy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = Math.max(0.6, pw * 0.004);
      ctx.strokeStyle = "#0a0e0c";
      ctx.stroke();
      ctx.fillStyle = "#0a0e0c";
      ctx.font = `800 ${Math.max(8, pw * 0.03)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), dcx, dcy + 1);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    });
  }

  /* ---- トークン ---- */
  const ballPos = actorPos("ball", t, state.moves, state.slots, state.ball, state.opponents, state.holder);
  drawActorToken(ctx, mapX, mapY, "ball", ballPos, state, scale);

  state.slots.forEach((s, i) => {
    if (!s.pid) return;
    const p = actorPos(i, t, state.moves, state.slots, state.ball, state.opponents, state.holder);
    drawActorToken(ctx, mapX, mapY, i, p, state, scale);
  });

  (state.opponents ?? []).forEach((_, i) => {
    const actor = `opp${i}` as Actor;
    const p = actorPos(actor, t, state.moves, state.slots, state.ball, state.opponents, state.holder);
    drawActorToken(ctx, mapX, mapY, actor, p, state, scale);
  });
}

/* ------------------------------------------------------------------ */
/* 描画ヘルパー                                                          */
/* ------------------------------------------------------------------ */

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** ドリブル用：ルートに沿って直交方向に揺らした波線の点列（データ座標のまま）。PathLayer.wavyPoints の移植 */
function wavyDataPoints(path: Point[]): Point[] {
  const L = pathLen(path);
  if (L === 0) return [];
  const n = Math.max(10, Math.round(L / 1.1));
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const a = alongPath(path, p);
    const b = alongPath(path, Math.min(1, p + 0.02));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const edge = i === 0 || i === n ? 0 : 1;
    const off = Math.sin(((p * L) / 2.6) * Math.PI) * 0.9 * edge;
    out.push({ x: a.x - dy * off, y: a.y + dx * off });
  }
  return out;
}

/** ルート矢印の矢頭（三角形）を描く */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  aData: Point,
  bData: Point,
  color: string,
  pw: number
) {
  const ax = mapX(aData.x);
  const ay = mapY(aData.y);
  const bx = mapX(bData.x);
  const by = mapY(bData.y);
  const ang = Math.atan2(by - ay, bx - ax);
  const Lh = Math.max(6, pw * 0.026);
  const Wd = Math.max(3.5, pw * 0.016);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - Lh * Math.cos(ang) + Wd * Math.sin(ang), by - Lh * Math.sin(ang) - Wd * Math.cos(ang));
  ctx.lineTo(bx - Lh * Math.cos(ang) - Wd * Math.sin(ang), by - Lh * Math.sin(ang) + Wd * Math.cos(ang));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** ボールトークン */
function drawBallToken(
  ctx: CanvasRenderingContext2D,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  p: Point,
  scale: number
) {
  const cx = mapX(p.x);
  const cy = mapY(p.y);
  const r = Math.max(3, 11 * scale);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.4, 4 * scale), 0, Math.PI * 2);
  ctx.fillStyle = "#222";
  ctx.fill();
}

/** 選手トークン（ディスク＋背番号＋キャプテンマーク＋名前ラベル） */
function drawPlayerToken(
  ctx: CanvasRenderingContext2D,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  p: Point,
  role: Position,
  number: number | null,
  name: string,
  isCaptain: boolean,
  scale: number
) {
  const cx = mapX(p.x);
  const cy = mapY(p.y);
  const r = Math.max(8, 26 * scale);
  const g = groupOf(role);

  // 影
  ctx.beginPath();
  ctx.arc(cx, cy + 3 * scale, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  // ディスク
  const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  grad.addColorStop(0, "#1d2722");
  grad.addColorStop(1, "#10160f");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, 3 * scale);
  ctx.strokeStyle = GROUP_COLORS[g] ?? GROUP_COLORS.mf;
  ctx.stroke();

  // 背番号
  ctx.fillStyle = "#eafff0";
  ctx.font = `800 ${Math.max(9, 24 * scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(number != null ? String(number) : "–", cx, cy + 1);

  // キャプテン
  if (isCaptain) {
    ctx.beginPath();
    ctx.arc(cx - r + 4 * scale, cy - r + 4 * scale, Math.max(4, 9 * scale), 0, Math.PI * 2);
    ctx.fillStyle = "#ffd166";
    ctx.fill();
    ctx.fillStyle = "#0a0e0c";
    ctx.font = `800 ${Math.max(6, 11 * scale)}px sans-serif`;
    ctx.fillText("C", cx - r + 4 * scale, cy - r + 4 * scale + 1);
  }

  // 名前ラベル（動画/GIFでは小さめ）
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#eafff0";
  const nameFont = Math.max(7, 12 * scale);
  ctx.font = `700 ${nameFont}px sans-serif`;
  ctx.fillText(clipText(ctx, name, r * 4.6), cx, cy + r + nameFont + 3);
  ctx.textAlign = "left";
}

/** 相手トークン */
function drawOppToken(
  ctx: CanvasRenderingContext2D,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  p: Point,
  label: string,
  scale: number
) {
  const cx = mapX(p.x);
  const cy = mapY(p.y);
  const r = Math.max(6, 20 * scale);
  ctx.beginPath();
  ctx.arc(cx, cy + 2 * scale, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#7e2430";
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, 3 * scale);
  ctx.strokeStyle = GROUP_COLORS.opp ?? "#ff5d6c";
  ctx.stroke();
  ctx.fillStyle = "#ffe3e7";
  ctx.font = `800 ${Math.max(8, 19 * scale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

/** actor 種別を判別して対応するトークンを描く */
function drawActorToken(
  ctx: CanvasRenderingContext2D,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  actor: Actor,
  pos: Point,
  state: BoardState,
  scale: number
) {
  if (actor === "ball") {
    drawBallToken(ctx, mapX, mapY, pos, scale);
    return;
  }
  if (isOppActor(actor)) {
    const o = (state.opponents ?? [])[oppIndex(actor)];
    if (o) drawOppToken(ctx, mapX, mapY, pos, o.label, scale);
    return;
  }
  const slot = state.slots[actor as number];
  if (!slot || !slot.pid) return;
  const player = state.players.find((pl) => pl.id === slot.pid);
  if (!player) return;
  drawPlayerToken(
    ctx,
    mapX,
    mapY,
    pos,
    slot.role,
    player.number,
    player.name,
    state.captain === player.id,
    scale
  );
}
