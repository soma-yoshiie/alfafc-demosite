// 「ことばで作る」：日本語の戦術文からアニメーションシーン（Move[]）を生成する。
// 例）「LBがサイドを上がったらそのスペースを埋めるようにCMが移動する」
//
// ローカル決定論的実装。将来 Claude API に差し替える場合は
// buildSceneFromText と同じ入出力（テキスト＋盤面 → SceneResult）の実装を
// 用意して sceneClient を切り替えるだけ（UIは非同期前提で書いてある）。

import type { Move, Player, Point, Position, Slot } from "./types";
import { durFromPath } from "./animation";

export interface SceneContext {
  slots: Slot[];
  players: Player[];
  ball: Point;
}

export interface SceneResult {
  moves: Move[];
  /** 読み取った手順の説明（確認表示用） */
  steps: string[];
  warnings: string[];
}

/** 将来のClaude実装と共通の契約 */
export interface SceneClient {
  buildScene(text: string, ctx: SceneContext): Promise<SceneResult>;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ */
/* 語彙                                                                */
/* ------------------------------------------------------------------ */

/** ポジション語 → 候補ロール＋左右の含意。上から順に最長一致で評価する */
const ROLE_WORDS: [RegExp, Position[], "L" | "R" | null][] = [
  [/左ウイングバック|\bLWB\b/, ["LWB", "LB", "LM"], "L"],
  [/右ウイングバック|\bRWB\b/, ["RWB", "RB", "RM"], "R"],
  [/ゴールキーパー|キーパー|\bGK\b/, ["GK"], null],
  [/左サイドバック|左SB|\bLB\b/, ["LB", "LWB"], "L"],
  [/右サイドバック|右SB|\bRB\b/, ["RB", "RWB"], "R"],
  [/センターバック|\bCB\b/, ["CB"], null],
  [/ボランチ|アンカー|\bDM\b/, ["DM", "CM"], null],
  [/トップ下|\bAM\b/, ["AM", "CM"], null],
  [/左ウイング|\bLW\b/, ["LW", "LM"], "L"],
  [/右ウイング|\bRW\b/, ["RW", "RM"], "R"],
  [/左サイドハーフ|左SH|\bLM\b/, ["LM", "LW"], "L"],
  [/右サイドハーフ|右SH|\bRM\b/, ["RM", "RW"], "R"],
  [/インサイドハーフ|セントラルハーフ|\bCM\b/, ["CM", "DM", "AM"], null],
  [/センターフォワード|ワントップ|フォワード|\bCF\b|\bFW\b|\bST\b|トップ/, ["ST", "CF"], null],
  [/サイドバック|\bSB\b/, ["LB", "RB", "LWB", "RWB"], null],
  [/サイドハーフ|\bSH\b/, ["LM", "RM", "LW", "RW"], null],
  [/ウイング|\bWG\b/, ["LW", "RW", "LM", "RM"], null],
];

/** フォーメーションに無いロールを最寄りスロットへ写像するための基準座標 */
const ROLE_HINT: Record<string, Point> = {
  GK: { x: 50, y: 8 },
  LB: { x: 18, y: 26 }, RB: { x: 82, y: 26 }, CB: { x: 50, y: 22 },
  LWB: { x: 11, y: 48 }, RWB: { x: 89, y: 48 },
  DM: { x: 50, y: 44 }, CM: { x: 50, y: 50 }, AM: { x: 50, y: 63 },
  LM: { x: 18, y: 54 }, RM: { x: 82, y: 54 },
  LW: { x: 20, y: 78 }, RW: { x: 80, y: 78 }, ST: { x: 50, y: 85 }, CF: { x: 50, y: 85 },
};

type Verb =
  | "pass" | "shoot" | "cross" | "dribble"
  | "run" | "fill" | "tuck" | "widen" | "drop" | "press" | "move";

const VERBS: [RegExp, Verb][] = [
  [/スルーパス|パス|フィード|くさび|預け/, "pass"],
  [/シュート|ミドル|打ち込|打つ/, "shoot"],
  [/クロス|センタリング|折り返/, "cross"],
  [/ドリブル|持ち上が|運[びぶん]/, "dribble"],
  [/埋め|カバー|穴を消|スペースを消/, "fill"],
  [/オーバーラップ|駆け上|上が|走り込|抜け出|裏[にへ]抜け|飛び出|突破/, "run"],
  [/絞|中に入|内側/, "tuck"],
  [/開い|開く|幅を取|大きく張|張り出/, "widen"],
  [/下が|戻[りるっ]|降り/, "drop"],
  [/プレス|寄せ|奪いに|チェック/, "press"],
  [/移動|動[きくい]|入[りるっ]|ポジション/, "move"],
];

const VERB_LABEL: Record<Verb, string> = {
  pass: "パス", shoot: "シュート", cross: "クロス", dribble: "ドリブル",
  run: "駆け上がる", fill: "スペースを埋める", tuck: "中に絞る",
  widen: "幅を取る", drop: "下がる", press: "プレスに行く", move: "移動する",
};

/* ------------------------------------------------------------------ */
/* 文の分割（順番 or 同時）                                            */
/* ------------------------------------------------------------------ */

const PAR_MARK = /(と同時に|同時に|しながら|ながら|とともに|と共に|いっしょに|一緒に)/g;
const SEQ_MARK = /(ったら|いたら|きたら|したら|たら|してから|てから|した後で?|た後で?|したあとで?|たあとで?|その後|それから|次に|続いて|そして|って|て|[。！？!?\n])/g;

interface Clause {
  text: string;
  /** 直前の節との関係。seq=終わってから / par=同時 */
  rel: "seq" | "par";
}

const SEQ_D = "\u0001";
const PAR_D = "\u0002";

function splitClauses(input: string): Clause[] {
  // 同時マーカー→順番マーカーの順に区切り文字へ置換して分割
  const marked = input.replace(PAR_MARK, PAR_D).replace(SEQ_MARK, SEQ_D);
  const out: Clause[] = [];
  let rel: "seq" | "par" = "seq";
  for (const part of marked.split(/([\u0001\u0002])/)) {
    if (part === SEQ_D) {
      rel = "seq";
      continue;
    }
    if (part === PAR_D) {
      rel = "par";
      continue;
    }
    const t = part.trim();
    if (t) out.push({ text: t, rel: out.length === 0 ? "seq" : rel });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 本体                                                                */
/* ------------------------------------------------------------------ */

/** 全角英数→半角・大文字化などの正規化 */
function normalize(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[a-z]+/g, (c) => c.toUpperCase());
}

interface RoleHit {
  slot: number;
  /** 節内での出現位置（が/に の判定に使う） */
  index: number;
  length: number;
}

export function buildSceneFromText(text: string, ctx: SceneContext): SceneResult {
  const { slots, players, ball } = ctx;
  const warnings: string[] = [];
  const steps: string[] = [];
  const sceneMoves: Move[] = [];

  // シーン内での現在位置・使用済みスロットの追跡
  const posNow = new Map<number, Point>();
  const usedSlots = new Set<number>();
  let ballNow: Point = { ...ball };
  let ballMove: Move | null = null;
  let lastVacated: Point | null = null; // 直前に動いた選手の「元の位置」＝そのスペース
  let cursor = 0; // 順番接続の基準時刻
  let prevStart = 0;

  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const posOf = (i: number): Point => posNow.get(i) ?? { x: slots[i].x, y: slots[i].y };
  const nameOf = (i: number): string => {
    const s = slots[i];
    const p = s.pid ? players.find((x) => x.id === s.pid) : null;
    return p ? `${s.role}（${p.name.split(/\s+/)[0]}）` : s.role;
  };

  /** ロール候補＋左右指定から実スロットを決める */
  const resolveSlot = (
    roles: Position[],
    side: "L" | "R" | null,
    near?: Point | null
  ): number | null => {
    let cand = slots.map((_, i) => i).filter((i) => roles.includes(slots[i].role));
    if (cand.length === 0) {
      // フォーメーションに無いロール → 基準座標の最寄りスロット（GK除く）
      const hint = ROLE_HINT[roles[0]];
      if (!hint) return null;
      cand = slots
        .map((_, i) => i)
        .filter((i) => slots[i].role !== "GK" || roles[0] === "GK");
      cand.sort((a, b) => dist(slots[a], hint) - dist(slots[b], hint));
      return cand[0] ?? null;
    }
    if (side) {
      const sided = cand.filter((i) => (side === "L" ? slots[i].x < 50 : slots[i].x > 50));
      if (sided.length) cand = sided;
    }
    if (near) {
      cand = [...cand].sort((a, b) => dist(posOf(a), near) - dist(posOf(b), near));
    } else {
      // 代替ロール（例：4-3-3のトップ下→CM）は本来の立ち位置に最も近いスロットを選ぶ
      const hint = ROLE_HINT[roles[0]];
      if (hint) cand = [...cand].sort((a, b) => dist(slots[a], hint) - dist(slots[b], hint));
    }
    // 未使用を優先（同じ選手ばかり選ばない）
    const fresh = cand.find((i) => !usedSlots.has(i));
    return fresh ?? cand[0] ?? null;
  };

  /** 節からポジション/選手名/背番号の言及をすべて拾う */
  const findRoleHits = (clause: string, near?: Point | null): RoleHit[] => {
    const hits: RoleHit[] = [];
    const taken: [number, number][] = []; // 重複マッチ防止（区間）
    const overlaps = (i: number, len: number) =>
      taken.some(([s, e]) => i < e && i + len > s);

    // 選手名（スタメンのみ・姓 or フルネーム）
    slots.forEach((s, si) => {
      if (!s.pid) return;
      const p = players.find((x) => x.id === s.pid);
      if (!p) return;
      for (const key of [p.name, p.name.split(/\s+/)[0]]) {
        if (key.length < 2) continue;
        const at = clause.indexOf(key);
        if (at >= 0 && !overlaps(at, key.length)) {
          hits.push({ slot: si, index: at, length: key.length });
          taken.push([at, at + key.length]);
          break;
        }
      }
    });
    // 背番号「7番」
    for (const m of clause.matchAll(/(\d{1,2})番/g)) {
      const num = +m[1];
      const si = slots.findIndex((s) => {
        const p = s.pid ? players.find((x) => x.id === s.pid) : null;
        return p?.number === num;
      });
      if (si >= 0 && !overlaps(m.index!, m[0].length)) {
        hits.push({ slot: si, index: m.index!, length: m[0].length });
        taken.push([m.index!, m.index! + m[0].length]);
      }
    }
    // ポジション語（既マッチ区間と重ならない最初の出現を採用）
    const sideHint: "L" | "R" | null = /左/.test(clause) ? "L" : /右/.test(clause) ? "R" : null;
    for (const [re, roles, side] of ROLE_WORDS) {
      const g = new RegExp(re.source, "g");
      for (const m of clause.matchAll(g)) {
        if (m.index == null || overlaps(m.index, m[0].length)) continue;
        const si = resolveSlot(roles, side ?? sideHint, near);
        if (si != null) {
          hits.push({ slot: si, index: m.index, length: m[0].length });
          taken.push([m.index, m.index + m[0].length]);
        }
        break; // 1行につき1言及
      }
    }
    return hits.sort((a, b) => a.index - b.index);
  };

  /** 経路を追加（同actorは連結＝1actor1ルートのエンジン制約に合わせる） */
  const pushMove = (
    actor: Move["actor"],
    path: Point[],
    rel: "seq" | "par",
    quick = false
  ): Move => {
    const p = path.map((q) => ({ x: clamp(q.x, 2, 98), y: clamp(q.y, 2, 98) }));
    let dur = durFromPath(p);
    if (quick) dur = Math.max(0.5, +(dur * 0.55).toFixed(2));
    const start = rel === "par" ? prevStart : cursor;

    const existing =
      actor === "ball" ? ballMove : sceneMoves.find((m) => m.actor === actor) ?? null;
    let mv: Move;
    if (existing) {
      // 2回目の動きは経路を連結して尺を伸ばす（開始は据え置き）
      existing.path = [...existing.path, ...p.slice(1)];
      existing.dur = +(existing.dur + dur).toFixed(2);
      mv = existing;
    } else {
      mv = { actor, path: p, start: +start.toFixed(2), dur };
      sceneMoves.push(mv);
      if (actor === "ball") ballMove = mv;
    }
    prevStart = mv.start;
    cursor = Math.max(cursor, mv.start + mv.dur);
    if (actor !== "ball") {
      posNow.set(actor as number, p[p.length - 1]);
      usedSlots.add(actor as number);
    } else {
      ballNow = p[p.length - 1];
    }
    return mv;
  };

  /** 中間点を1つ挟んだ自然な3点パス */
  const curved = (from: Point, to: Point, bend = 4): Point[] => {
    const mid = {
      x: (from.x + to.x) / 2 + (to.y > from.y ? bend : -bend),
      y: (from.y + to.y) / 2,
    };
    return [from, mid, to];
  };

  /* ---- 節ごとの解釈 ---- */
  const clauses = splitClauses(normalize(text));
  for (const cl of clauses) {
    const c = cl.text;
    const verb = VERBS.find(([re]) => re.test(c))?.[1] ?? null;
    const wantsFill = /そのスペース|空いたスペース|空けたスペース/.test(c);
    const near = wantsFill ? lastVacated : null;
    const hits = findRoleHits(c, near);

    // 「〜に/へ」が付く言及＝受け手、それ以外の先頭＝動作主
    const receiverHit = hits.find((h) => /^[にへ]/.test(c.slice(h.index + h.length)));
    const actorHit = hits.find((h) => h !== receiverHit) ?? null;

    if (!verb && !actorHit) continue; // 何も読み取れない節はスキップ

    const v: Verb =
      wantsFill && (!verb || verb === "move" || verb === "run") ? "fill" : verb ?? "move";

    // ボール系（パス・シュート・クロス）
    if (v === "pass") {
      if (!receiverHit) {
        warnings.push(`「${c}」：パスの受け手が読み取れませんでした（例：STにパス）`);
        continue;
      }
      const from = actorHit ? posOf(actorHit.slot) : ballNow;
      pushMove("ball", [from, posOf(receiverHit.slot)], cl.rel, true);
      steps.push(
        `ボール：${actorHit ? nameOf(actorHit.slot) : "現在地"} → ${nameOf(receiverHit.slot)} へパス`
      );
      continue;
    }
    if (v === "shoot") {
      const from = actorHit ? posOf(actorHit.slot) : ballNow;
      pushMove("ball", [from, { x: 50, y: 96 }], cl.rel, true);
      steps.push(`ボール：${actorHit ? nameOf(actorHit.slot) : "現在地"} からシュート`);
      continue;
    }
    if (v === "cross") {
      const from = actorHit ? posOf(actorHit.slot) : ballNow;
      pushMove("ball", curved(from, { x: 47, y: 88 }, 6), cl.rel, true);
      steps.push("ボール：クロスをゴール前へ");
      continue;
    }

    // 選手の動き
    if (!actorHit) {
      warnings.push(`「${c}」：動く選手を読み取れませんでした`);
      continue;
    }
    const si = actorHit.slot;
    const from = posOf(si);
    const origin = { ...from };
    let path: Point[];

    switch (v) {
      case "run": {
        const wide = /サイド|タッチライン|大外/.test(c);
        const inner = /中央|中[にへ]|ハーフスペース|裏/.test(c);
        const tx = wide
          ? from.x < 50 ? 10 : 90
          : inner
            ? from.x + (from.x < 50 ? 14 : -14)
            : from.x;
        path = curved(from, { x: tx, y: Math.min(88, from.y + 32) });
        break;
      }
      case "fill": {
        const target = lastVacated ?? { x: from.x, y: Math.min(88, from.y + 16) };
        path = curved(from, target, 3);
        break;
      }
      case "tuck":
        path = curved(from, { x: from.x + (from.x < 50 ? 18 : -18), y: from.y + 6 }, 3);
        break;
      case "widen":
        path = curved(from, { x: from.x < 50 ? 10 : 90, y: from.y + 4 }, 3);
        break;
      case "drop":
        path = curved(from, { x: from.x, y: Math.max(10, from.y - 22) }, 3);
        break;
      case "press": {
        const d = dist(from, ballNow) || 1;
        const k = Math.max(0, (d - 5) / d);
        path = [
          from,
          { x: from.x + (ballNow.x - from.x) * k, y: from.y + (ballNow.y - from.y) * k },
        ];
        break;
      }
      case "dribble":
        path = curved(from, { x: from.x * 0.7 + 50 * 0.3, y: Math.min(88, from.y + 28) });
        break;
      default: // move
        path = curved(from, { x: from.x, y: Math.min(88, from.y + 18) }, 3);
    }

    const hadBallMove = !!ballMove;
    const mv = pushMove(si, path, cl.rel);
    if (v === "dribble" && !hadBallMove) {
      // ドリブルはボールも同じ軌道・同じタイミングで運ぶ
      const bm = pushMove("ball", path, "par");
      bm.start = mv.start;
      bm.dur = mv.dur;
    }
    lastVacated = origin;
    steps.push(`${nameOf(si)}：${VERB_LABEL[v]}`);
  }

  if (sceneMoves.length === 0 && warnings.length === 0) {
    warnings.push(
      "動きを読み取れませんでした。「LBがサイドを上がる」のようにポジションと動きを書いてください。"
    );
  }
  return { moves: sceneMoves, steps, warnings };
}

/** ローカル実装（API不要・即時） */
export const localSceneClient: SceneClient = {
  async buildScene(text, ctx) {
    return buildSceneFromText(text, ctx);
  },
};

/**
 * アプリで使うシーン生成クライアント。
 * ★将来 Claude API に差し替える場合はここを別実装に変更するだけ。
 */
export const sceneClient: SceneClient = localSceneClient;
