import type { DrillDoc, DrillItem, DrillLine, Point } from "./types";
import { LINE_COLORS, wavy } from "./drillDraw";

/** 練習メニュー（ドリル図）をPNG dataURLとして描画 */
export function renderDrillPng(doc: DrillDoc): string {
  const W = 750;
  const H = 980;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#0a0e0c";
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = "#caff3a";
  ctx.font = "800 13px sans-serif";
  ctx.fillText("PRACTICE / 練習メニュー", 26, 36);
  ctx.fillStyle = "#eafff0";
  ctx.font = "800 24px sans-serif";
  ctx.fillText(clip(ctx, doc.title || "練習メニュー", W - 52), 26, 64);

  const px = 24;
  const py = 80;
  const pw = W - 48;
  const ph = doc.memo ? 760 : 836;
  const mapX = (x: number) => px + (x / 100) * pw;
  const mapY = (y: number) => py + ((100 - y) / 100) * ph;

  drawPitch(ctx, doc, px, py, pw, ph);

  // lines
  doc.lines.forEach((l) => drawLine(ctx, l, mapX, mapY));
  // items
  const discR = doc.discSize === "S" ? 10 : doc.discSize === "M" ? 12 : 15;
  doc.items.forEach((it) => drawItem(ctx, it, mapX, mapY, discR));

  // memo
  if (doc.memo) {
    const my = py + ph + 26;
    ctx.fillStyle = "#7d9389";
    ctx.font = "700 12px sans-serif";
    ctx.fillText("MEMO", 26, my);
    ctx.fillStyle = "#eafff0";
    ctx.font = "400 15px sans-serif";
    wrapText(ctx, doc.memo, 26, my + 22, W - 52, 22);
  }

  // brand
  ctx.fillStyle = "#7d9389";
  ctx.font = "600 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Made with ALFA FOOTBALL — サッカー練習メニュー", W / 2, H - 18);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

function drawPitch(
  ctx: CanvasRenderingContext2D,
  doc: DrillDoc,
  px: number,
  py: number,
  pw: number,
  ph: number
) {
  roundRect(ctx, px, py, pw, ph, 18);
  ctx.save();
  ctx.clip();
  if (doc.pitchType === "blank") {
    ctx.fillStyle = "#12402f";
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(px + (i * pw) / 10, py);
      ctx.lineTo(px + (i * pw) / 10, py + ph);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py + (i * ph) / 10);
      ctx.lineTo(px + pw, py + (i * ph) / 10);
      ctx.stroke();
    }
  } else {
    const bands = 11;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#15493a" : "#12402f";
      ctx.fillRect(px, py + (i * ph) / bands, pw, ph / bands + 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    if (doc.pitchType === "fullh") {
      // 横向きフル：縦のセンターライン＋左右のボックス
      const boxH = ph * 0.52;
      const boxW = pw * 0.14;
      const gboxH = ph * 0.28;
      const gboxW = pw * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx, py + 8);
      ctx.lineTo(cx, py + ph - 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, ph * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(px + 4, py + (ph - boxH) / 2, boxW, boxH);
      ctx.strokeRect(px + 4, py + (ph - gboxH) / 2, gboxW, gboxH);
      ctx.strokeRect(px + pw - 4 - boxW, py + (ph - boxH) / 2, boxW, boxH);
      ctx.strokeRect(px + pw - 4 - gboxW, py + (ph - gboxH) / 2, gboxW, gboxH);
    } else {
      const boxW = pw * 0.52;
      const boxH = ph * 0.16;
      ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
      if (doc.pitchType === "full") {
        ctx.strokeRect(px + (pw - boxW) / 2, py + ph - 4 - boxH, boxW, boxH);
        ctx.beginPath();
        ctx.moveTo(px + 8, cy);
        ctx.lineTo(px + pw - 8, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, pw * 0.12, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // half: 下端にセンターアーク
        ctx.beginPath();
        ctx.arc(cx, py + ph, pw * 0.18, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  l: DrillLine,
  mapX: (x: number) => number,
  mapY: (y: number) => number
) {
  if (l.path.length < 2) return;
  const col = LINE_COLORS[l.kind];
  const pts = (l.kind === "dribble" ? wavy(l.path, 1.6, 7) : l.path).map((p) => ({
    x: mapX(p.x),
    y: mapY(p.y),
  }));
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(l.kind === "pass" ? [9, 7] : []);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (l.kind === "line") return; // 直線は矢印なし
  // arrowhead（元のパス方向で）
  const a = l.path[l.path.length - 2];
  const b = l.path[l.path.length - 1];
  arrow(ctx, { x: mapX(a.x), y: mapY(a.y) }, { x: mapX(b.x), y: mapY(b.y) }, col);
}

function arrow(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  col: string
) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = 13;
  const w = 7;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(
    b.x - L * Math.cos(ang) + w * Math.sin(ang),
    b.y - L * Math.sin(ang) - w * Math.cos(ang)
  );
  ctx.lineTo(
    b.x - L * Math.cos(ang) - w * Math.sin(ang),
    b.y - L * Math.sin(ang) + w * Math.cos(ang)
  );
  ctx.closePath();
  ctx.fill();
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: DrillItem,
  mapX: (x: number) => number,
  mapY: (y: number) => number,
  discR: number
) {
  const cx = mapX(it.x);
  const cy = mapY(it.y);
  switch (it.kind) {
    case "cone": {
      const s = 15;
      ctx.fillStyle = "#ff8a65";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s * 0.8, cy + s * 0.7);
      ctx.lineTo(cx - s * 0.8, cy + s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case "player":
    case "oppo": {
      const r = discR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = it.kind === "player" ? "#caff3a" : "#ff5b6e";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0a0e0c";
      ctx.stroke();
      if (it.label) {
        ctx.fillStyle = "#0a0e0c";
        ctx.font = `800 ${Math.round(r * 0.95)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(it.label, cx, cy + 1);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      break;
    }
    case "ball": {
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#222";
      ctx.fill();
      break;
    }
    case "goal": {
      const w = 64;
      const h = 16;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((it.rot ?? 0) * Math.PI) / 180);
      ctx.strokeStyle = "#eafff0";
      ctx.lineWidth = 3;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "rgba(234,255,240,0.4)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + (i * w) / 6, -h / 2);
        ctx.lineTo(-w / 2 + (i * w) / 6, h / 2);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case "marker": {
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.strokeStyle = "#0a0e0c";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
  }
}

function roundRect(
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number
) {
  const chars = text.split("");
  let line = "";
  let yy = y;
  for (const ch of chars) {
    if (ch === "\n") {
      ctx.fillText(line, x, yy);
      line = "";
      yy += lh;
      continue;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
