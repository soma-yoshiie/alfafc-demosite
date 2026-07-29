import type { BoardState } from "./types";
import { groupOf } from "./formations";
import { GROUP_COLORS } from "./colors";
import { actorPos } from "./animation";
import { convexHull, trimQuadEnd } from "./geometry";
import { ySpan, yToTop } from "./pitchView";

/**
 * 現在のスタメン配置を1枚のPNG画像（dataURL）として描画する。
 * 依存ライブラリなし・Canvasで直接描画。SNS共有/印刷用。
 */
export function renderTacticPng(state: BoardState): string {
  const W = 750;
  const H = 1040;
  const scale = 2; // 高解像度
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = "#0a0e0c";
  ctx.fillRect(0, 0, W, H);

  // ---- ヘッダー ----
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#eafff0";
  ctx.font = "700 30px sans-serif";
  ctx.fillText("ALFA", 26, 56);
  const tacW = ctx.measureText("ALFA").width;
  ctx.fillStyle = "#caff3a";
  ctx.fillText(" FOOTBALL", 26 + tacW, 56);

  // フォーメーション（右）
  ctx.fillStyle = "#caff3a";
  ctx.font = "700 26px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(state.formation, W - 26, 56);
  ctx.textAlign = "left";

  // チーム名
  if (state.teamName) {
    ctx.fillStyle = "#7d9389";
    ctx.font = "700 16px sans-serif";
    ctx.fillText(state.teamName, 26, 82);
  }

  // ハーフコート表示中の小さな表記
  const view = state.pitchView;
  if (view === "half") {
    ctx.fillStyle = "#7d9389";
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("ハーフコート表示", W - 26, 74);
    ctx.textAlign = "left";
  }

  // ---- ピッチ ----
  const px = 24;
  const py = 104;
  const pw = W - 48;
  const ph = 812;
  const mapX = (x: number) => px + (x / 100) * pw;
  const mapY = (y: number) => py + (yToTop(y, view) / 100) * ph;

  // 芝のストライプ
  roundRectPath(ctx, px, py, pw, ph, 18);
  ctx.save();
  ctx.clip();
  const bands = 11;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#15493a" : "#12402f";
    ctx.fillRect(px, py + (i * ph) / bands, pw, ph / bands + 1);
  }

  // ライン
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  const boxW = pw * 0.52;
  const boxH = ph * 0.14;
  const gboxW = pw * 0.28;
  const gboxH = ph * 0.06;
  if (view === "half") {
    // half: 上半分のみ（上のペナルティエリア＋ゴールエリア＋下端にセンターライン・センターサークルの半円）
    ctx.beginPath();
    ctx.moveTo(px + 4, py + ph - 4);
    ctx.lineTo(px + 4, py + 4);
    ctx.lineTo(px + pw - 4, py + 4);
    ctx.lineTo(px + pw - 4, py + ph - 4);
    ctx.stroke();
    ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + 4, gboxW, gboxH);
    // 下端：ハーフウェイライン
    ctx.beginPath();
    ctx.moveTo(px + 8, py + ph - 4);
    ctx.lineTo(px + pw - 8, py + ph - 4);
    ctx.stroke();
    // センターサークルの上半分が下端から覗く
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph - 4, pw * 0.16, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else {
    // 外枠
    ctx.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
    // センターライン
    ctx.beginPath();
    ctx.moveTo(px + 8, py + ph / 2);
    ctx.lineTo(px + pw - 8, py + ph / 2);
    ctx.stroke();
    // センターサークル
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, pw * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();
    // ペナルティエリア（上下）
    ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + 4, gboxW, gboxH);
    ctx.strokeRect(px + (pw - boxW) / 2, py + ph - 4 - boxH, boxW, boxH);
    ctx.strokeRect(px + (pw - gboxW) / 2, py + ph - 4 - gboxH, gboxW, gboxH);
  }
  ctx.restore();

  // ---- ピッチガイド（5レーン・エリア名・凡例） ----
  const guides = state.guides ?? {};
  if (guides.lanes || guides.zones) {
    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, 18);
    ctx.clip();
    if (guides.lanes) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(mapX(20), py, mapX(40) - mapX(20), ph);
      ctx.fillRect(mapX(60), py, mapX(80) - mapX(60), ph);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
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
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      [100 / 3, 200 / 3].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(px, mapY(y));
        ctx.lineTo(px + pw, mapY(y));
        ctx.stroke();
      });
      ctx.setLineDash([]);
      // バイタルエリア
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(mapX(30), mapY(88), mapX(70) - mapX(30), mapY(74) - mapY(88));
    }
    ctx.restore();

    if (guides.zones) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "700 13px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("アタッキングサード", px + 14, mapY((200 / 3 + 100) / 2));
      ctx.fillText("ミドルサード", px + 14, mapY((100 / 3 + 200 / 3) / 2));
      ctx.fillText("ディフェンディングサード", px + 14, mapY((0 + 100 / 3) / 2));
      ctx.textAlign = "center";
      ctx.fillText("バイタルエリア", mapX(50), mapY(81));
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
  if (guides.legend) {
    const bx = px + 14;
    const bw = 150;
    const rowH = 22;
    const rows: { label: string; dash: number[]; wavy?: boolean; double?: boolean }[] = [
      { label: "ラン", dash: [] },
      { label: "パス", dash: [6, 4] },
      { label: "ドリブル", dash: [], wavy: true },
      { label: "シュート＝二重線", dash: [], double: true },
    ];
    const bh = rowH * rows.length + 16;
    const by = py + ph - bh - 14;
    roundRectPath(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = "rgba(10,14,12,0.6)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
    ctx.lineCap = "round";
    rows.forEach((r, i) => {
      const ly = by + 14 + i * rowH;
      ctx.beginPath();
      if (r.wavy) {
        ctx.moveTo(bx + 10, ly);
        ctx.quadraticCurveTo(bx + 16, ly - 4, bx + 22, ly);
        ctx.quadraticCurveTo(bx + 28, ly + 4, bx + 34, ly);
      } else if (r.double) {
        ctx.moveTo(bx + 10, ly - 2);
        ctx.lineTo(bx + 34, ly - 2);
        ctx.moveTo(bx + 10, ly + 2);
        ctx.lineTo(bx + 34, ly + 2);
      } else {
        ctx.moveTo(bx + 10, ly);
        ctx.lineTo(bx + 34, ly);
      }
      ctx.strokeStyle = "#ffe27a";
      ctx.lineWidth = 2;
      ctx.setLineDash(r.dash);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#eafff0";
      ctx.font = "700 12px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(r.label, bx + 42, ly);
    });
    ctx.textBaseline = "alphabetic";
  }

  // ---- ペンの描き込み（場面限定のものはアニメ用なので除外） ----
  (state.drawings ?? []).forEach((d) => {
    if (d.path.length < 2 || d.step != null) return;
    // ピッチ%単位の線幅をpxへ換算（PenLayerと同じ見え方）
    const lw = ((d.width ?? 0.9) / 100) * pw * 0.85 + 2;
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

  // ---- 図形オブジェクト（場面限定のものはアニメ用なので除外） ----
  (state.shapes ?? []).forEach((sh) => {
    if (sh.step != null) return;
    const col = sh.color ?? "#ffe27a";
    if (sh.kind === "zoneEllipse" || sh.kind === "zoneRect") {
      const cx = mapX(sh.x);
      const cy = mapY(sh.y);
      const rw = (sh.w / 100) * pw;
      // データの h はそのまま。half表示では画面上の高さが2倍に見えるようスケールする
      const rh = (sh.h / ySpan(view)) * ph;
      ctx.beginPath();
      if (sh.kind === "zoneEllipse") {
        ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      } else {
        roundRectPath(ctx, cx - rw / 2, cy - rh / 2, rw, rh, 6);
      }
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = ((sh.width ?? 0.5) / 100) * pw * 0.85 + 2;
      ctx.strokeStyle = col;
      ctx.stroke();
    } else if (sh.kind === "arrow") {
      const p0x = mapX(sh.p0.x);
      const p0y = mapY(sh.p0.y);
      const p1x = mapX(sh.p1.x);
      const p1y = mapY(sh.p1.y);
      const cxp = mapX(sh.c.x);
      const cyp = mapY(sh.c.y);
      const Lh = 16;
      const W = 9;
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
      ctx.lineWidth = ((sh.width ?? 1.1) / 100) * pw * 0.85 + 2;
      ctx.lineCap = "round";
      ctx.setLineDash(sh.dash ? [8, 6] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      // 矢頭（制御点→終点の接線方向）
      const ang = Math.atan2(p1y - cyp, p1x - cxp);
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p1x - Lh * Math.cos(ang) + W * Math.sin(ang), p1y - Lh * Math.sin(ang) - W * Math.cos(ang));
      ctx.lineTo(p1x - Lh * Math.cos(ang) - W * Math.sin(ang), p1y - Lh * Math.sin(ang) + W * Math.cos(ang));
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    } else if (sh.kind === "text") {
      const cx = mapX(sh.x);
      const cy = mapY(sh.y);
      const fontPx = sh.size === "s" ? 13 : sh.size === "l" ? 19 : 15;
      ctx.font = `700 ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const padX = 12;
      const padY = 8;
      const tw = ctx.measureText(sh.text).width;
      const bw = tw + padX * 2;
      const bh = fontPx + padY * 2;
      roundRectPath(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 8);
      ctx.fillStyle = "rgba(10,14,12,0.55)";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(sh.text, cx, cy + 1);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    } else if (sh.kind === "link") {
      // 選手追従図形：静止画なのでベース座標（slots/opponents/ball）を使う
      const pts = sh.actors.map((a) => actorPos(a, 0, [], state.slots, state.ball, state.opponents));
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const qx = mapX(p.x);
          const qy = mapY(p.y);
          if (i === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        });
        ctx.strokeStyle = col;
        ctx.lineWidth = ((sh.width ?? 1.0) / 100) * pw * 0.85 + 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    } else if (sh.kind === "hull") {
      const basePts = sh.actors.map((a) => actorPos(a, 0, [], state.slots, state.ball, state.opponents));
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
        ctx.lineWidth = 2;
        ctx.strokeStyle = col;
        ctx.stroke();
        if (sh.showCount !== false) {
          const cxp = hull.reduce((s, p) => s + p.x, 0) / hull.length;
          const cyp = hull.reduce((s, p) => s + p.y, 0) / hull.length;
          const cx = mapX(cxp);
          const cy = mapY(cyp);
          ctx.beginPath();
          ctx.arc(cx, cy, 15, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.fillStyle = "#0a0e0c";
          ctx.font = "800 13px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${sh.actors.length}人`, cx, cy + 1);
          ctx.textBaseline = "alphabetic";
          ctx.textAlign = "left";
        }
      }
    }
  });

  // ---- ボール ----
  const bx = mapX(state.ball.x);
  const by = mapY(state.ball.y);
  ctx.beginPath();
  ctx.arc(bx, by, 11, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#222";
  ctx.fill();

  // ---- 選手トークン ----
  const byId = new Map(state.players.map((p) => [p.id, p]));
  state.slots.forEach((s) => {
    if (!s.pid) return;
    const p = byId.get(s.pid);
    if (!p) return;
    const cx = mapX(s.x);
    const cy = mapY(s.y);
    const r = 26;
    const g = groupOf(s.role);

    // 影
    ctx.beginPath();
    ctx.arc(cx, cy + 3, r, 0, Math.PI * 2);
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
    ctx.lineWidth = 3;
    ctx.strokeStyle = GROUP_COLORS[g] ?? GROUP_COLORS.mf;
    ctx.stroke();

    // 背番号
    ctx.fillStyle = "#eafff0";
    ctx.font = "800 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.number != null ? String(p.number) : "–", cx, cy + 1);

    // キャプテン
    if (state.captain === p.id) {
      ctx.beginPath();
      ctx.arc(cx - r + 4, cy - r + 4, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.fillStyle = "#0a0e0c";
      ctx.font = "800 11px sans-serif";
      ctx.fillText("C", cx - r + 4, cy - r + 5);
    }

    // 役割・名前
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#9ec92a";
    ctx.font = "700 13px sans-serif";
    ctx.fillText(s.role, cx, cy + r + 18);
    ctx.fillStyle = "#eafff0";
    ctx.font = "700 15px sans-serif";
    ctx.fillText(clip(ctx, p.name, 120), cx, cy + r + 36);
  });

  // ---- 相手トークン ----
  (state.opponents ?? []).forEach((o) => {
    const cx = mapX(o.x);
    const cy = mapY(o.y);
    const r = 20;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#7e2430";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = GROUP_COLORS.opp ?? "#ff5d6c";
    ctx.stroke();
    ctx.fillStyle = "#ffe3e7";
    ctx.font = "800 19px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(o.label, cx, cy + 1);
    ctx.textBaseline = "alphabetic";
  });

  // ---- フッター ----
  ctx.textAlign = "center";
  ctx.fillStyle = "#7d9389";
  ctx.font = "600 14px sans-serif";
  ctx.fillText("Made with ALFA FOOTBALL — サッカー戦術ボード", W / 2, H - 28);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

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

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/** dataURL をダウンロードさせる */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
