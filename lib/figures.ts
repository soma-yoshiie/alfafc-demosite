/* note-reflection-figure §1・§2: 本文の途中に挟む図（純粋な関数） */
import type { FigLineKind, FigUnderlay, NoteFigure, NotePhoto } from "./types";

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

export type Block =
  | { type: "text"; text: string }
  | { type: "fig"; fig: NoteFigure }
  | { type: "photo"; photo: NotePhoto };

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

/** スタッフが描き足した物（by:"staff"）がある図か（note-free §5） */
export function figureHasStaff(f: NoteFigure): boolean {
  return f.lines.some((l) => l.by === "staff") || f.marks.some((m) => m.by === "staff") || f.texts.some((t) => t.by === "staff");
}

/** 本文を図・写真の所で分ける。文字と図（写真）が交互に並び、最後は必ず文字（空でもよい）。同じ位置なら図が先、写真は最後 */
export function splitBody(body: string, figures: NoteFigure[] | undefined, photo?: NotePhoto): Block[] {
  type Item = { at: number; block: Block };
  const items: Item[] = (figures ?? [])
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((fig) => ({ at: fig.at, block: { type: "fig", fig } as Block }));
  if (photo) {
    // 写真は、同じ位置の図より後ろ（図は at の昇順で安定に並び、写真を at の後ろへ差し込む）
    let k = items.length;
    while (k > 0 && items[k - 1].at > photo.at) k--;
    items.splice(k, 0, { at: photo.at, block: { type: "photo", photo } });
  }
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
  for (const it of items) {
    const cut = Math.max(lastCut, snap(it.at));
    if (cut === lastCut) {
      // 同じ切れ目に続く図：間の文字は空（区切りの改行は前の図で落とし済み）
      blocks.push({ type: "text", text: "" });
      blocks.push(it.block);
      continue;
    }
    blocks.push({ type: "text", text: body.slice(cursor, cut) });
    blocks.push(it.block);
    cursor = cut;
    // 切れ目の改行 1 つは区切りとして落とす。ただし本文の先頭（cut = 0）には joinBlocks が区切りを入れないので落とさない
    if (cut > 0 && body[cursor] === "\n") cursor += 1;
    lastCut = cut;
  }
  blocks.push({ type: "text", text: body.slice(cursor) });
  return blocks;
}

/** 文字のブロックを改行でつないで body に、図・写真の at はそれより前の文字の長さに */
export function joinBlocks(blocks: Block[]): { body: string; figures: NoteFigure[]; photo?: NotePhoto } {
  let body = "";
  const figures: NoteFigure[] = [];
  let photo: NotePhoto | undefined;
  for (const b of blocks) {
    if (b.type === "text") {
      if (!b.text) continue;
      body = body ? body + "\n" + b.text : b.text;
    } else if (b.type === "fig") {
      figures.push({ ...b.fig, at: body.length });
    } else {
      photo = { ...b.photo, at: body.length };
    }
  }
  return photo ? { body, figures, photo } : { body, figures };
}

/** 保存前の整え：前後の空白を落とし、図の at を同じ位置に合わせ直す */
export function trimBody(
  body: string,
  figures: NoteFigure[],
  photo?: NotePhoto
): { body: string; figures: NoteFigure[]; photo?: NotePhoto } {
  const lead = body.length - body.trimStart().length;
  const t = body.trim();
  const fix = (at: number) => Math.max(0, Math.min(t.length, at - lead));
  const out = { body: t, figures: figures.map((f) => ({ ...f, at: fix(f.at) })) };
  return photo ? { ...out, photo: { ...photo, at: fix(photo.at) } } : out;
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

/** 上限は、選手の物とスタッフの物（by:"staff"）を別に数える。並びは変えない（note-free §9 判断 21） */
function capEach<T extends { by?: "staff" }>(xs: T[], max: number): T[] {
  let own = 0;
  let staff = 0;
  return xs.filter((x) => (x.by === "staff" ? staff++ < max : own++ < max));
}

/** 保存前：座標を整数に丸め、点を間引き、上限を超えた分を落とす */
export function roundFigure(f: NoteFigure): NoteFigure {
  const h = UNDERLAYS[f.underlay].h;
  return {
    id: f.id,
    at: Math.max(0, Math.round(f.at)),
    underlay: f.underlay,
    lines: capEach(f.lines, MAX_LINES).map((l) => {
      const p = thinPath(l.p, l.k === "pen" ? PEN_PTS : LINE_PTS).map((v, i) => rnd(v, i % 2 ? h : FIG_W));
      return l.by ? { k: l.k, p, by: l.by } : { k: l.k, p };
    }),
    marks: capEach(f.marks, MAX_MARKS).map((m) => {
      const r = { k: m.k, x: rnd(m.x, FIG_W), y: rnd(m.y, h) };
      return m.by ? { ...r, by: m.by } : r;
    }),
    texts: capEach(f.texts, MAX_TEXTS).map((t) => {
      const r = { x: rnd(t.x, FIG_W), y: rnd(t.y, h), t: t.t.slice(0, MAX_TEXT_LEN) };
      return t.by ? { ...r, by: t.by } : r;
    }),
  };
}

/** 一覧の要約に添える「図 N 枚」 */
export function figureCountLabel(figures: NoteFigure[] | undefined): string {
  return figures && figures.length > 0 ? ` ・ 図 ${figures.length} 枚` : "";
}
