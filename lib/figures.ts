/* note-reflection-figure §1・§2: 本文の途中に挟む図（純粋な関数） */
import type { FigLineKind, FigUnderlay, NoteFigure } from "./types";

/** 下敷きの幅（余白込み 74m）を 1000 とする */
export const FIG_W = 1000;
export const FIG_M = 74;
/** 1m あたりの図の単位 */
export const FIG_PER_M = FIG_W / FIG_M;

/** 下敷きの名前・図の高さ（幅 1000 のとき）・viewBox の高さ（m。原点は左上 −3,−3） */
export const UNDERLAYS: Record<FigUnderlay, { label: string; h: number; vbH: number }> = {
  blank: { label: "白紙", h: 811, vbH: 60 },
  full: { label: "全面", h: 1500, vbH: 111 },
  half: { label: "ハーフ", h: 770, vbH: 57 },
  box: { label: "ゴール前", h: 527, vbH: 39 },
};
export const UNDERLAY_ORDER: FigUnderlay[] = ["blank", "full", "half", "box"];

export const MAX_FIGS = 4;
export const MAX_LINES = 40;
export const MAX_MARKS = 30;
export const MAX_TEXTS = 6;
export const MAX_TEXT_LEN = 16;
export const PEN_PTS = 24;
export const LINE_PTS = 10;
export const MAX_HISTORY = 40;

export const REFLECT_HEADS = ["うまくいった場面", "うまくいかなかった場面", "次にやること"];

export const LINE_LABEL: Record<FigLineKind, string> = {
  pen: "ペン",
  pass: "パス",
  dribble: "ドリブル",
  run: "動き",
  shot: "シュート",
};

export type Block = { type: "text"; text: string } | { type: "fig"; fig: NoteFigure };

let figSeq = 0;
/** ノートの中で重ならない図の id */
export function newFigId(): string {
  figSeq += 1;
  return `fig_${Date.now().toString(36)}_${figSeq}_${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyFigure(underlay: FigUnderlay = "full", at = 0): NoteFigure {
  return { id: newFigId(), at, underlay, lines: [], marks: [], texts: [] };
}

export function figureIsEmpty(f: NoteFigure): boolean {
  return f.lines.length === 0 && f.marks.length === 0 && f.texts.length === 0;
}

/** 本文を図の所で分ける。文字と図が交互に並び、最後は必ず文字（空でもよい） */
export function splitBody(body: string, figures: NoteFigure[] | undefined): Block[] {
  const figs = (figures ?? []).slice().sort((a, b) => a.at - b.at);
  // 切れ目にできる位置：0・改行の直前・末尾
  const ends: number[] = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === "\n") ends.push(i);
  if (ends[ends.length - 1] !== body.length) ends.push(body.length);
  const snap = (at: number) => {
    const a = Math.max(0, Math.min(body.length, Math.round(Number.isFinite(at) ? at : 0)));
    let best = ends[0];
    for (const e of ends) if (Math.abs(e - a) < Math.abs(best - a)) best = e;
    return best;
  };
  const blocks: Block[] = [];
  let cursor = 0;
  let lastCut = -1;
  for (const fig of figs) {
    const cut = Math.max(lastCut, snap(fig.at));
    if (cut === lastCut) {
      // 同じ切れ目に続く図：間の文字は空（区切りの改行は前の図で落とし済み）
      blocks.push({ type: "text", text: "" });
      blocks.push({ type: "fig", fig });
      continue;
    }
    blocks.push({ type: "text", text: body.slice(cursor, cut) });
    blocks.push({ type: "fig", fig });
    cursor = cut;
    // 切れ目の改行 1 つは区切りとして落とす。ただし本文の先頭（cut = 0）には joinBlocks が区切りを入れないので落とさない
    if (cut > 0 && body[cursor] === "\n") cursor += 1;
    lastCut = cut;
  }
  blocks.push({ type: "text", text: body.slice(cursor) });
  return blocks;
}

/** 文字のブロックを改行でつないで body に、図の at はその図より前の文字の長さに */
export function joinBlocks(blocks: Block[]): { body: string; figures: NoteFigure[] } {
  let body = "";
  const figures: NoteFigure[] = [];
  for (const b of blocks) {
    if (b.type === "text") {
      if (!b.text) continue;
      body = body ? body + "\n" + b.text : b.text;
    } else {
      figures.push({ ...b.fig, at: body.length });
    }
  }
  return { body, figures };
}

/** 保存前の整え：前後の空白を落とし、図の at を同じ位置に合わせ直す */
export function trimBody(body: string, figures: NoteFigure[]): { body: string; figures: NoteFigure[] } {
  const lead = body.length - body.trimStart().length;
  const t = body.trim();
  return {
    body: t,
    figures: figures.map((f) => ({ ...f, at: Math.max(0, Math.min(t.length, f.at - lead)) })),
  };
}

/** 点（[x0,y0,x1,y1,…]）を max 個以下に間引く（始点と終点は残す） */
export function thinPath(p: number[], max: number): number[] {
  const n = Math.floor(p.length / 2);
  if (n <= max) return p.slice(0, n * 2);
  const out: number[] = [];
  for (let k = 0; k < max; k++) {
    const i = Math.round((k * (n - 1)) / (max - 1));
    out.push(p[i * 2], p[i * 2 + 1]);
  }
  return out;
}

/** 要約用：見出しだけの行と空行を飛ばし、空白 1 つでつなぐ */
export function bodyExcerpt(body: string): string {
  const heads = new Set(REFLECT_HEADS);
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !heads.has(l.replace(/[：:]\s*$/, "")))
    .join(" ");
}

const rnd = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(v) ? v : 0)));

/** 保存前：座標を整数に丸め、点を間引き、上限を超えた分を落とす */
export function roundFigure(f: NoteFigure): NoteFigure {
  const h = UNDERLAYS[f.underlay].h;
  return {
    id: f.id,
    at: Math.max(0, Math.round(f.at)),
    underlay: f.underlay,
    lines: f.lines.slice(0, MAX_LINES).map((l) => {
      const p = thinPath(l.p, l.k === "pen" ? PEN_PTS : LINE_PTS).map((v, i) => rnd(v, i % 2 ? h : FIG_W));
      return l.by ? { k: l.k, p, by: l.by } : { k: l.k, p };
    }),
    marks: f.marks.slice(0, MAX_MARKS).map((m) => {
      const r = { k: m.k, x: rnd(m.x, FIG_W), y: rnd(m.y, h) };
      return m.by ? { ...r, by: m.by } : r;
    }),
    texts: f.texts.slice(0, MAX_TEXTS).map((t) => {
      const r = { x: rnd(t.x, FIG_W), y: rnd(t.y, h), t: t.t.slice(0, MAX_TEXT_LEN) };
      return t.by ? { ...r, by: t.by } : r;
    }),
  };
}

/** 一覧の要約に添える「図 N 枚」 */
export function figureCountLabel(figures: NoteFigure[] | undefined): string {
  return figures && figures.length > 0 ? ` ・ 図 ${figures.length} 枚` : "";
}
