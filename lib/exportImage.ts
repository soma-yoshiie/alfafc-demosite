import type { BoardState } from "./types";
import { groupOf } from "./formations";
import { GROUP_COLORS } from "./colors";

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

  // ---- ピッチ ----
  const px = 24;
  const py = 104;
  const pw = W - 48;
  const ph = 812;
  const mapX = (x: number) => px + (x / 100) * pw;
  const mapY = (y: number) => py + ((100 - y) / 100) * ph;

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
  const boxW = pw * 0.52;
  const boxH = ph * 0.14;
  const gboxW = pw * 0.28;
  const gboxH = ph * 0.06;
  ctx.strokeRect(px + (pw - boxW) / 2, py + 4, boxW, boxH);
  ctx.strokeRect(px + (pw - gboxW) / 2, py + 4, gboxW, gboxH);
  ctx.strokeRect(px + (pw - boxW) / 2, py + ph - 4 - boxH, boxW, boxH);
  ctx.strokeRect(px + (pw - gboxW) / 2, py + ph - 4 - gboxH, gboxW, gboxH);
  ctx.restore();

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
