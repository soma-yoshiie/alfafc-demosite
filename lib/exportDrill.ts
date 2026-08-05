import type { DrillDoc, DrillItem, DrillLine, Point } from "./types";
import { drillSceneCount } from "./types";
import { LINE_COLORS, wavy } from "./drillDraw";

/**
 * 練習メニュー（ドリル図）をPNG dataURLとして描画。
 * 複数場面（sceneCount>1）は renderDrillPngMulti に委譲する。単一場面（未定義/1）は
 * 従来どおりこの関数がそのまま描画する（見た目を変えないための後方互換）
 */
export function renderDrillPng(doc: DrillDoc): string {
  // 単一場面でも意図テキストが書かれていれば multi 側で描く(黙って捨てない)。
  // 旧データは sceneIntents を持たないため、従来経路の出力は変わらない
  if (drillSceneCount(doc) > 1 || (doc.sceneIntents?.[0] ?? "").trim()) {
    return renderDrillPngMulti(doc);
  }
  // 横コートはランドスケープのキャンバスにして潰れを防ぐ
  const landscape = doc.pitchType === "fullh";
  const W = landscape ? 980 : 750;
  const px = 24;
  const py = 80;
  const pw = W - 48;
  const ph = landscape ? Math.round((pw * 10) / 16) : doc.memo ? 760 : 836;
  const memoH = doc.memo ? 180 : 0;
  const H = landscape ? py + ph + memoH + 60 : 980;

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

/**
 * 複数場面（sceneCount>1）の練習メニューを縦積みでPNG化。
 * 場面ごとに「場面 n」見出し＋ピッチ＋その場面の意図テキストを描画し、全体メモは最後に1回だけ描く。
 * renderDrillPng とはコード上完全に独立させ、単一場面側の出力（既存の見た目）に影響しないようにしている
 */
function renderDrillPngMulti(doc: DrillDoc): string {
  const landscape = doc.pitchType === "fullh";
  const W = landscape ? 980 : 750;
  const px = 24;
  const pw = W - 48;
  const sceneCount = drillSceneCount(doc);
  // 単一場面(意図つき)のときは「場面 n」見出しを出さない
  const showHead = sceneCount > 1;
  const discR = doc.discSize === "S" ? 10 : doc.discSize === "M" ? 12 : 15;
  // ピッチはエディタと同じ実アスペクトを保つ(潰すと図形が歪み動線の角度が変わる)。
  // 縦系コートは高さが出るため、幅を縮めて中央寄せし総高さを抑える
  const pwS = landscape ? pw : Math.round(pw * 0.66);
  const pxS = landscape ? px : Math.round((W - pwS) / 2);
  const phScene = landscape
    ? Math.round((pwS * 10) / 16)
    : doc.pitchType === "full"
    ? Math.round((pwS * 10) / 7)
    : Math.round((pwS * 6) / 5);

  // キャンバスの高さは描画前に確定させる必要があるため、計測専用の仮コンテキストで
  // 各場面の意図テキスト・全体メモの折返し行を先に計算する
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "400 13px sans-serif";
  const intentLines = Array.from({ length: sceneCount }, (_, i) => {
    const t = (doc.sceneIntents?.[i] ?? "").trim();
    return t ? measureWrap(measure, t, pw) : [];
  });
  measure.font = "400 15px sans-serif";
  const memoLines = doc.memo ? measureWrap(measure, doc.memo, W - 52) : [];

  const headTop = 80;
  const sceneHeadH = showHead ? 28 : 8;
  const gapAfterPitch = 12;
  const intentLH = 19;
  const sceneGap = 26;
  const memoLH = 22;

  const sceneTops: number[] = [];
  let y = headTop;
  for (let i = 0; i < sceneCount; i++) {
    sceneTops.push(y);
    y += sceneHeadH + phScene + gapAfterPitch;
    if (intentLines[i].length) y += intentLines[i].length * intentLH + 4;
    y += sceneGap;
  }
  const memoTop = y;
  if (doc.memo) y += 24 + Math.max(1, memoLines.length) * memoLH + 12;
  const H = y + 44; // フッター分

  // iOS Safariのキャンバス面積上限(約1678万px)を超えると toDataURL が空になるため、
  // 面積に応じてscaleを段階的に落とす
  let scale = 2;
  while (scale > 1 && W * H * scale * scale > 15_000_000) scale -= 0.5;

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

  for (let i = 0; i < sceneCount; i++) {
    const top = sceneTops[i];
    if (showHead) {
      ctx.fillStyle = "#caff3a";
      ctx.font = "800 13px sans-serif";
      ctx.fillText(`場面 ${i + 1}`, 26, top + 20);
    }

    const py = top + sceneHeadH;
    drawPitch(ctx, doc, pxS, py, pwS, phScene);
    const mapX = (x: number) => pxS + (x / 100) * pwS;
    const mapY = (yy: number) => py + ((100 - yy) / 100) * phScene;

    doc.lines.filter((l) => (l.step ?? 0) === i).forEach((l) => drawLine(ctx, l, mapX, mapY));
    doc.items
      .filter((it) => (it.step ?? 0) === i)
      .forEach((it) => drawItem(ctx, it, mapX, mapY, discR));

    if (intentLines[i].length) {
      const ty = py + phScene + gapAfterPitch;
      ctx.fillStyle = "#eafff0";
      ctx.font = "400 13px sans-serif";
      intentLines[i].forEach((line, li) => ctx.fillText(line, 26, ty + li * intentLH));
    }
  }

  // memo（全体で1回だけ）
  if (doc.memo) {
    ctx.fillStyle = "#7d9389";
    ctx.font = "700 12px sans-serif";
    ctx.fillText("MEMO", 26, memoTop + 6);
    ctx.fillStyle = "#eafff0";
    ctx.font = "400 15px sans-serif";
    memoLines.forEach((line, li) => ctx.fillText(line, 26, memoTop + 28 + li * memoLH));
  }

  // brand
  ctx.fillStyle = "#7d9389";
  ctx.font = "600 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Made with ALFA FOOTBALL — サッカー練習メニュー", W / 2, H - 18);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

/**
 * ライブラリ一覧用のサムネイル（ピッチ部分のみの小さなPNG）。
 * 複数場面のドリルでも場面0（旧データはstep未定義＝0扱い）だけを描く
 */
export function renderDrillThumbPng(doc: DrillDoc): string {
  const landscape = doc.pitchType === "fullh";
  const W = landscape ? 168 : 120;
  const H = landscape ? 105 : doc.pitchType === "full" ? 168 : 144;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  const mapX = (x: number) => (x / 100) * W;
  const mapY = (y: number) => ((100 - y) / 100) * H;

  drawPitch(ctx, doc, 0, 0, W, H, 0.42);
  doc.lines
    .filter((l) => (l.step ?? 0) === 0)
    .forEach((l) => drawLine(ctx, l, mapX, mapY, 0.42));
  const discR = doc.discSize === "S" ? 10 : doc.discSize === "M" ? 12 : 15;
  doc.items
    .filter((it) => (it.step ?? 0) === 0)
    .forEach((it) => drawItem(ctx, it, mapX, mapY, discR, 0.42));

  return canvas.toDataURL("image/png");
}

function drawPitch(
  ctx: CanvasRenderingContext2D,
  doc: DrillDoc,
  px: number,
  py: number,
  pw: number,
  ph: number,
  k = 1
) {
  roundRect(ctx, px, py, pw, ph, 18 * k);
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
    ctx.lineWidth = 2 * k;
    const inset = 4 * k;
    ctx.strokeRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2);
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    if (doc.pitchType === "fullh") {
      // 横向きフル：縦のセンターライン＋左右のボックス
      const boxH = ph * 0.52;
      const boxW = pw * 0.14;
      const gboxH = ph * 0.28;
      const gboxW = pw * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx, py + 8 * k);
      ctx.lineTo(cx, py + ph - 8 * k);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, ph * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(px + inset, py + (ph - boxH) / 2, boxW, boxH);
      ctx.strokeRect(px + inset, py + (ph - gboxH) / 2, gboxW, gboxH);
      ctx.strokeRect(px + pw - inset - boxW, py + (ph - boxH) / 2, boxW, boxH);
      ctx.strokeRect(px + pw - inset - gboxW, py + (ph - gboxH) / 2, gboxW, gboxH);
    } else {
      const boxW = pw * 0.52;
      const boxH = ph * 0.16;
      ctx.strokeRect(px + (pw - boxW) / 2, py + inset, boxW, boxH);
      if (doc.pitchType === "full") {
        ctx.strokeRect(px + (pw - boxW) / 2, py + ph - inset - boxH, boxW, boxH);
        ctx.beginPath();
        ctx.moveTo(px + 8 * k, cy);
        ctx.lineTo(px + pw - 8 * k, cy);
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
  mapY: (y: number) => number,
  k = 1
) {
  if (l.path.length < 2) return;
  const col = LINE_COLORS[l.kind];
  const pts = (l.kind === "dribble" ? wavy(l.path, 1.6, 7) : l.path).map((p) => ({
    x: mapX(p.x),
    y: mapY(p.y),
  }));
  ctx.strokeStyle = col;
  ctx.lineWidth = 3 * k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(l.kind === "pass" ? [9 * k, 7 * k] : []);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (l.kind === "line") return; // 直線は矢印なし
  // arrowhead（元のパス方向で）
  const a = l.path[l.path.length - 2];
  const b = l.path[l.path.length - 1];
  arrow(ctx, { x: mapX(a.x), y: mapY(a.y) }, { x: mapX(b.x), y: mapY(b.y) }, col, k);
}

function arrow(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  col: string,
  k = 1
) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = 13 * k;
  const w = 7 * k;
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
  discR: number,
  k = 1
) {
  const cx = mapX(it.x);
  const cy = mapY(it.y);
  switch (it.kind) {
    case "cone": {
      const s = 15 * k;
      ctx.fillStyle = "#ff8a65";
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s * 0.8, cy + s * 0.7);
      ctx.lineTo(cx - s * 0.8, cy + s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5 * k;
      ctx.stroke();
      break;
    }
    case "player":
    case "oppo": {
      const r = discR * k;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = it.kind === "player" ? "#caff3a" : "#ff5b6e";
      ctx.fill();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = "#0a0e0c";
      ctx.stroke();
      if (it.label && k >= 0.75) {
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
      ctx.arc(cx, cy, 9 * k, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3 * k, 0, Math.PI * 2);
      ctx.fillStyle = "#222";
      ctx.fill();
      break;
    }
    case "goal": {
      const w = 64 * k;
      const h = 16 * k;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((it.rot ?? 0) * Math.PI) / 180);
      ctx.strokeStyle = "#eafff0";
      ctx.lineWidth = 3 * k;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "rgba(234,255,240,0.4)";
      ctx.lineWidth = 1 * k;
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
      ctx.arc(cx, cy, 7 * k, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.strokeStyle = "#0a0e0c";
      ctx.lineWidth = 1.5 * k;
      ctx.stroke();
      break;
    }
    case "text": {
      const label = it.label || "";
      if (!label) break;
      const fs = Math.round(15 * k);
      ctx.font = `800 ${fs}px sans-serif`;
      const tw = ctx.measureText(label).width;
      const padX = 8 * k;
      const bh = fs + 10 * k;
      ctx.fillStyle = "rgba(10,14,12,0.55)";
      roundRect(ctx, cx - tw / 2 - padX, cy - bh / 2, tw + padX * 2, bh, 6 * k);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
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

/**
 * wrapText と同じ折返しロジックだが、描画せず行配列で返す。
 * renderDrillPngMulti は実キャンバスを確定させる前に各テキストブロックの高さを
 * 積算する必要があるため、描画とは別に行数だけを先に計算できるようにしている
 */
function measureWrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text.split("")) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
