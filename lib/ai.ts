// サッカーノートのAI分析。
// いまは「ローカル決定論的要約」を返すが、将来 Claude API 実装に
// 差し替えやすいよう AiClient インターフェースで抽象化している。
// 差し替えは末尾の `aiClient` を別実装に切り替えるだけ（UIは非同期前提で書いてある）。

import type { PlayPoint } from "./types";

export interface AiStat {
  label: string;
  value: string;
}

export interface AiAnalysis {
  summary: string;
  stats: AiStat[];
}

/** ⑫ AI試合レポートの入力 */
export interface MatchReportInput {
  minutes?: number;
  position?: string;
  good?: string;
  improve?: string;
  /** ② プレーエリアの要約（あれば添える） */
  zoneSummary?: string;
}

/** AI分析クライアント。ローカル実装・将来のAPI実装が共通で満たす契約 */
export interface AiClient {
  /** ② プレーエリア記録の分析 */
  analyzePlayArea(points: PlayPoint[]): Promise<AiAnalysis>;
  /** ⑫ 試合レポートの要約 */
  summarizeMatchReport(input: MatchReportInput): Promise<AiAnalysis>;
}

const pct = (v: number, n: number) => (n === 0 ? 0 : Math.round((v / n) * 100));

/** ② プレーエリアのローカル決定論的分析 */
export function analyzePlayAreaLocal(points: PlayPoint[]): AiAnalysis {
  const n = points.length;
  if (n === 0) {
    return {
      summary: "プレー記録がまだありません。コートをタップして「受けた / シュート / ミス」を記録しましょう。",
      stats: [],
    };
  }
  const left = points.filter((p) => p.x < 38).length;
  const center = points.filter((p) => p.x >= 38 && p.x <= 62).length;
  const right = points.filter((p) => p.x > 62).length;
  const attacking = points.filter((p) => p.y >= 66).length; // 敵陣寄り
  const shots = points.filter((p) => p.kind === "shot").length;
  const miss = points.filter((p) => p.kind === "miss").length;

  const zones: [string, number][] = [
    ["左サイド", left],
    ["中央", center],
    ["右サイド", right],
  ];
  zones.sort((a, b) => b[1] - a[1]);
  const top = zones[0];

  const stats: AiStat[] = [
    { label: "左サイド", value: pct(left, n) + "%" },
    { label: "中央", value: pct(center, n) + "%" },
    { label: "右サイド", value: pct(right, n) + "%" },
    { label: "敵陣進入", value: pct(attacking, n) + "%" },
    { label: "シュート / ミス", value: `${shots} / ${miss}` },
  ];

  const lines: string[] = [];
  lines.push(`${top[0]}でのプレーが${pct(top[1], n)}%と最も多くなっています。`);
  if (pct(center, n) < 20) lines.push("中央への進入が少なめです。中で受ける動きを増やすと選択肢が広がります。");
  if (pct(attacking, n) < 30) lines.push("敵陣でのプレーが少なめです。高い位置でボールに関わる回数を増やしましょう。");
  if (n >= 4 && miss / n > 0.3) lines.push("ミスの割合がやや高めです。受ける前の体の向きと首振りを意識しましょう。");
  if (shots === 0) lines.push("シュートの記録がありません。フィニッシュの意識も持ってみましょう。");

  return { summary: lines.join(" "), stats };
}

/** ⑫ 試合レポートのローカル決定論的要約 */
export function summarizeMatchReportLocal(input: MatchReportInput): AiAnalysis {
  const lines: string[] = [];
  if (input.position) lines.push(`${input.position}としての出場でした。`);
  if (input.good?.trim()) lines.push(`良かった点（${input.good.trim()}）は継続して伸ばしましょう。`);
  if (input.improve?.trim()) lines.push(`次は「${input.improve.trim()}」を意識して取り組みましょう。`);
  if (input.zoneSummary) lines.push(input.zoneSummary);
  if (lines.length === 0) {
    lines.push("出場時間・ポジション・良かった点・改善点を入力するとAIが要約します。");
  }
  const stats: AiStat[] = [];
  if (input.minutes != null) stats.push({ label: "出場時間", value: input.minutes + "分" });
  if (input.position) stats.push({ label: "ポジション", value: input.position });
  return { summary: lines.join(" "), stats };
}

/** ローカル実装（API不要・即時） */
export const localAiClient: AiClient = {
  async analyzePlayArea(points: PlayPoint[]) {
    return analyzePlayAreaLocal(points);
  },
  async summarizeMatchReport(input: MatchReportInput) {
    return summarizeMatchReportLocal(input);
  },
};

/**
 * アプリで使うAIクライアント。
 * ★将来 Claude API に差し替える場合はここを claudeAiClient 等に変更するだけ。
 * 例）lib/aiClaude.ts に AiClient 実装（fetch でバックエンド→Anthropic API
 *     claude-opus-4-8 / claude-sonnet-4-6 を呼ぶ）を用意して差し替える。
 */
export const aiClient: AiClient = localAiClient;
