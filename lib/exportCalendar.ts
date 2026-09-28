// カレンダーの絞り込みと色の作り直し（案A §6）: スマホのリスト表示「画像で保存」用PNG。
// lib/exportImage.ts の renderTacticPng と同じ作法（依存ライブラリなし・Canvas 2Dのみで直接描画・
// scale=2の高解像度・長い文字列は clip() で省略）。ここだけで完結させるため、
// clip()/roundRectPath() は同じ内容をこのファイル内に複製する（seasonReport.tsのroundRectと同様、
// 各書き出しファイルは自己完結という既存の作法に合わせる）。

/** 1件の予定（呼び出し側でcalEventVisible通過後・groupColorOf等で解決済みの値を渡す） */
export interface CalendarPngEvent {
  title: string;
  /** 「19:00〜20:30」「終日」「9/13〜9/14」など、表示用に整形済みの文字列（空文字なら描かない） */
  timeLabel: string;
  /** 種類ラベル（categoryOf(e, categories).label） */
  categoryLabel: string;
  /** 対象グループの色（groupColorOf。全員向けはALL_TARGETS_COLOR） */
  color: string;
  /** 対象名（targetLabelと同じ文字列。「対象外」のときは呼び出し側でこの文字列に差し替え済み） */
  targetLabel: string;
  /** 試合（e.kind==="match"）か。左端の縦棒を塗りではなく輪（枠だけ）にする */
  isMatch: boolean;
  /** 選手・保護者の「すべて」表示で対象外の予定か（案A §2/§5と同じ意味。目印に持たせるだけ） */
  outside?: boolean;
}

/** 1日ぶんの予定（CalendarTabのmonthDaysと同じ形）。evsが空の日は含めない */
export interface CalendarPngDay {
  /** 日（1〜31） */
  d: number;
  /** 曜日 0=日..6=土 */
  wd: number;
  evs: CalendarPngEvent[];
}

/** renderCalendarListPngの入力。CalendarTabのmonthDays（絞り込み後の全件）をそのまま渡す想定 */
export interface CalendarPngInput {
  /** mは0-11（JSのDate/CalendarTabのym.mと同じ基準） */
  ym: { y: number; m: number };
  teamName: string | null;
  days: CalendarPngDay[];
  /** 「選択中の絞り込み」1行（.calselと同じ内容のプレーンテキスト版） */
  selLabel: string;
}

const WD_JA = ["日", "月", "火", "水", "木", "金", "土"];

const W = 540;
const PAD_X = 24;
const HEADER_H = 88;
const FOOTER_H = 32;
const DATE_COL_W = 56;
const ROW_H = 44;
const ROW_GAP = 6;
const DAY_PAD_Y = 14;
const LINE_COLOR = "#e3e6ea";

/**
 * その月のリスト表示（絞り込み後の全件。スクロールに関係なく全部）を1枚のPNG画像
 * （dataURL）として描画する（案A §6）。予定が1件も無いときは呼び出し側でboard.toast
 * を出し、この関数自体は呼ばない想定（0件でも描画自体は可能だが、その判定は呼び出し側に置く）。
 */
export function renderCalendarListPng(input: CalendarPngInput): string {
  const scale = 2;

  // 事前計測: 各日の高さ（行の積み上げ＋上下パディング）を求めてから全体の高さを決める
  const dayHeights = input.days.map((day) => {
    const rowsH = day.evs.length * ROW_H + Math.max(0, day.evs.length - 1) * ROW_GAP;
    return Math.max(rowsH, 22) + DAY_PAD_Y * 2;
  });
  const daysH = dayHeights.reduce((s, h) => s + h, 0) + Math.max(0, input.days.length - 1); // 区切り線1px×(件数-1)
  const H = HEADER_H + daysH + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = Math.max(H, 1) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ---- ヘッダー ----
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#1d1f24";
  ctx.font = "700 22px sans-serif";
  ctx.fillText(`${input.ym.y}年${input.ym.m + 1}月の予定`, PAD_X, 34);

  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = "#6b7280";
  const subtitle = [input.teamName, input.selLabel].filter((v): v is string => !!v).join(" ・ ");
  ctx.fillText(clip(ctx, subtitle, W - PAD_X * 2 - 130), PAD_X, 56);

  ctx.textAlign = "right";
  ctx.font = "700 12px sans-serif";
  ctx.fillStyle = "#1d1f24";
  ctx.fillText("ALFA FOOTBALL", W - PAD_X, 30);
  ctx.textAlign = "left";

  // ---- 日ごとの行 ----
  let y = HEADER_H;
  input.days.forEach((day, di) => {
    const dh = dayHeights[di];
    const topY = y + DAY_PAD_Y;

    // 日付（左56px。日=赤、土=青）
    ctx.textAlign = "left";
    ctx.font = "700 22px sans-serif";
    ctx.fillStyle = day.wd === 0 ? "#d6324b" : day.wd === 6 ? "#2c6fd6" : "#1d1f24";
    ctx.fillText(String(day.d), PAD_X, topY + 20);
    ctx.font = "400 11px sans-serif";
    ctx.fillText(WD_JA[day.wd] ?? "", PAD_X, topY + 34);

    // 予定（右側。行高44px・行間6px）
    const evX = PAD_X + DATE_COL_W;
    const evW = W - PAD_X - evX;
    day.evs.forEach((ev, ei) => {
      const ry = topY + ei * (ROW_H + ROW_GAP);
      // 左端の縦線（グループ色。レビュー指摘対応: 幅2pxの矩形をlineWidth2でstrokeすると
      // 左右の縁が重なって塗りと同じ4px幅の棒になり、「試合は輪」の区別が付かなかった。
      // 縦線は種別に関係なく塗りに統一し、試合の目印は次の点(輪)だけで示す（calendar-plan-a §6） */
      ctx.fillStyle = ev.color;
      ctx.fillRect(evX, ry, 4, ROW_H);

      // 種類ラベルの前の点（練習など＝塗り、試合＝輪＝枠だけで中を空ける）。
      // ラベルのxはこの点の分だけ右へずらす
      const dotR = 3.5;
      const dotX = evX + 14 + dotR;
      const dotY = ry + 10;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      if (ev.isMatch) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = ev.color;
        ctx.stroke();
      } else {
        ctx.fillStyle = ev.color;
        ctx.fill();
      }

      const textX = evX + 14 + dotR * 2 + 6;
      const textMaxW = evW - (textX - evX) - 2;
      // 種類ラベル（灰の角丸）
      ctx.font = "700 11px sans-serif";
      const labelW = ctx.measureText(ev.categoryLabel).width + 14;
      roundRectPath(ctx, textX, ry + 2, labelW, 16, 8);
      ctx.fillStyle = "#eef1f5";
      ctx.fill();
      ctx.fillStyle = "#4b5563";
      ctx.textBaseline = "middle";
      ctx.fillText(ev.categoryLabel, textX + 7, ry + 10);
      ctx.textBaseline = "alphabetic";

      // タイトル（幅に収まらなければ省略）
      ctx.font = "700 14px sans-serif";
      ctx.fillStyle = "#1d1f24";
      ctx.fillText(clip(ctx, ev.title, textMaxW), textX, ry + 30);

      // 時刻・対象
      ctx.font = "400 12px sans-serif";
      ctx.fillStyle = "#6b7280";
      const meta = [ev.timeLabel, ev.targetLabel].filter((v) => !!v).join(" ・ ");
      ctx.fillText(clip(ctx, meta, textMaxW), textX, ry + 43);
    });

    y += dh;
    if (di < input.days.length - 1) {
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y + 0.5);
      ctx.lineTo(W - PAD_X, y + 0.5);
      ctx.stroke();
      y += 1;
    }
  });

  // ---- フッター ----
  ctx.textAlign = "center";
  ctx.font = "400 10px sans-serif";
  ctx.fillStyle = "#9aa4b2";
  ctx.fillText("ALFA FOOTBALL で作成", W / 2, H - 12);
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
