import type { MatchPhase, PlayKind, PlayLine, PlayLineKind, PlayPoint } from "@/lib/types";

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
