import type { MatchPhase, PlayKind, PlayLine, PlayLineKind, PlayPoint, Point } from "@/lib/types";

export const PLAY_KINDS: PlayKind[] = ["receive", "shot", "miss"];
export const PLAY_LINE_KINDS: PlayLineKind[] = ["dribble", "pass"];
export const PLAY_PHASES: MatchPhase[] = ["1st", "2nd", "et"];
/** フェーズ未設定は前半として扱う（後方互換） */
export const markPhase = (p?: MatchPhase): MatchPhase => p ?? "1st";
/** ピッチ番号未設定は0番目として扱う（後方互換） */
export const markCanvas = (c?: number): number => c ?? 0;
/** 対象配列から現フェーズ×現ピッチの最後の1件だけを取り除く */
export function popPhaseCanvas<T extends { phase?: MatchPhase; canvas?: number }>(arr: T[], phase: MatchPhase, canvas: number): T[] {
  const idx = arr.map((x) => markPhase(x.phase) === phase && markCanvas(x.canvas) === canvas).lastIndexOf(true);
  return idx === -1 ? arr : arr.filter((_, i) => i !== idx);
}
/** 試合のプレースタッツ。パス/ドリブルの success 未設定(旧データ)は成功として数える */
export function playStats(plays: PlayPoint[], lines: PlayLine[]) {
  const shots = plays.filter((p) => p.kind === "shot");
  const goals = shots.filter((p) => p.scored === true).length;
  const pass = lines.filter((l) => l.kind === "pass");
  const passOk = pass.filter((l) => l.success !== false).length;
  const dribble = lines.filter((l) => l.kind === "dribble");
  const dribbleOk = dribble.filter((l) => l.success !== false).length;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  return {
    shots: shots.length,
    goals,
    shotPct: pct(goals, shots.length),
    pass: pass.length,
    passPct: pct(passOk, pass.length),
    dribble: dribble.length,
    dribblePct: pct(dribbleOk, dribble.length),
    receive: plays.filter((p) => p.kind === "receive").length,
    trapMiss: plays.filter((p) => p.kind === "miss").length,
  };
}

/* ===== note-play-chain §2: つながったプレー（純粋な関数。playStats は変えない） ===== */

/** 次に置く印の通し番号（ノートの中の最大 ord ＋ 1。ord の無い古い印は 0 として数える） */
export function nextOrd(plays: PlayPoint[], lines: PlayLine[]): number {
  let m = 0;
  for (const p of plays) m = Math.max(m, p.ord ?? 0);
  for (const l of lines) m = Math.max(m, l.ord ?? 0);
  return m + 1;
}

export type PlayStep = { type: "point" | "line"; index: number; kind: PlayKind | PlayLineKind };
export type PlayGroup = { id: string; chained: boolean; steps: PlayStep[]; phase: MatchPhase; canvas: number };

/** プレーの一覧。index は渡した配列の中の位置 */
export function groupPlays(plays: PlayPoint[], lines: PlayLine[]): PlayGroup[] {
  type Item = { type: "point" | "line"; index: number; kind: PlayKind | PlayLineKind; chain?: string; seq: number; ord?: number; phase?: MatchPhase; canvas?: number; gen: number };
  const items: Item[] = [
    ...lines.map<Item>((l, i) => ({ type: "line", index: i, kind: l.kind as PlayLineKind, chain: l.chain, seq: l.seq ?? 0, ord: l.ord, phase: l.phase, canvas: l.canvas, gen: i })),
    ...plays.map<Item>((p, i) => ({ type: "point", index: i, kind: p.kind, chain: p.chain, seq: p.seq ?? 0, ord: p.ord, phase: p.phase, canvas: p.canvas, gen: lines.length + i })),
  ];
  const byChain = new Map<string, Item[]>();
  const rest: Item[][] = [];
  for (const it of items) {
    if (it.chain) {
      const arr = byChain.get(it.chain);
      if (arr) arr.push(it);
      else byChain.set(it.chain, [it]);
    } else rest.push([it]);
  }
  const sets: Item[][] = [...byChain.values(), ...rest];
  const out: { g: PlayGroup; ord?: number; gen: number }[] = [];
  for (const set of sets) {
    const chained = set.length >= 2;
    // 単独の「受けた」はプレーにしない（数が多い。数はスタッツに出る）。単独の「トラップミス」は 1 行で出す
    if (!chained && set[0].type === "point" && set[0].kind === "receive") continue;
    const sorted = set.slice().sort((a, b) => a.seq - b.seq || (a.ord ?? 0) - (b.ord ?? 0) || a.gen - b.gen);
    const ords = sorted.map((s) => s.ord).filter((o): o is number => o != null);
    const first = sorted[0];
    const id = chained && first.chain ? first.chain : first.ord != null ? `o${first.ord}` : `x${first.type}${first.index}`;
    out.push({
      g: {
        id,
        chained,
        steps: sorted.map((s) => ({ type: s.type, index: s.index, kind: s.kind })),
        phase: markPhase(first.phase),
        canvas: markCanvas(first.canvas),
      },
      ord: ords.length ? Math.min(...ords) : undefined,
      gen: Math.min(...sorted.map((s) => s.gen)),
    });
  }
  // ord の無い古い印は、軌道 → シュートの配列の順で、ord のある物より前
  out.sort((a, b) => {
    if (a.ord == null && b.ord == null) return a.gen - b.gen;
    if (a.ord == null) return -1;
    if (b.ord == null) return 1;
    return a.ord - b.ord;
  });
  return out.map((o) => o.g);
}

const STEP_LABEL: Record<PlayKind | PlayLineKind, string> = {
  receive: "受けた",
  shot: "シュート",
  miss: "トラップミス",
  dribble: "ドリブル",
  pass: "パス",
};

/** 「受けた → ドリブル → シュート（ゴール）」。最後の手の結果をかっこで付ける */
export function playTitle(group: PlayGroup, plays: PlayPoint[], lines: PlayLine[]): string {
  const names = group.steps.map((s) => STEP_LABEL[s.kind]);
  const last = group.steps[group.steps.length - 1];
  let result = "";
  if (last) {
    if (last.type === "point" && last.kind === "shot") {
      const p = plays[last.index];
      result = p ? (p.course ? (p.scored ? "ゴール" : "ノーゴール") : "コース未記録") : "";
    } else if (last.type === "line") {
      const l = lines[last.index];
      result = l ? (l.success === false ? "ミス" : "成功") : "";
    }
  }
  const joined = names.join(" → ");
  return result ? `${joined}（${result}）` : joined;
}

/** 軌道の状況メモとシュートの状況メモ（空でない物。手の順） */
export function playNotes(group: PlayGroup, plays: PlayPoint[], lines: PlayLine[]): string[] {
  const out: string[] = [];
  for (const s of group.steps) {
    const t = (s.type === "line" ? lines[s.index]?.note : plays[s.index]?.shotNote)?.trim();
    if (t) out.push(t);
  }
  return out;
}

/** シュートの線の行き先（ピッチの座標）。ゴール正面図の枠（x 14〜86）をゴールの幅（7.32m）に写す */
export function shotTarget(course: Point): Point {
  const xm = 30.34 + ((course.x - 14) / 72) * 7.32;
  return { x: xm / 0.68, y: 100 };
}
