// セットプレーデザインの「基本配置」を種別×攻守×人数（×位置）から作る生成関数。
// setpiece-redesign §1・§3。検証（Nodeから直接呼ぶ・tscで一時出力する等）をしやすくする
// ため、型以外のimportを持たない純粋関数のモジュールにする（lib/setPiecePresets.ts等の
// 他モジュールには依存しない＝旧プリセットの座標が必要な箇所はこのファイル内に複製して持つ）。

import type { Point, PitchViewMode, Position } from "./types";

/** このモジュールが生成を担当する種別（ゴールキック・PKは対象外＝setpiece-redesign §1） */
export type LayoutKind = "ck" | "fk" | "throwin";

/** KIND_ORDER相当（種別チップの表示順）。SetPieceBar.tsx・Header.tsx から共通で使う */
export const LAYOUT_KIND_ORDER: LayoutKind[] = ["ck", "fk", "throwin"];

/** 文字列がLayoutKind（ck/fk/throwin）かどうかを判定して絞り込む。旧種別
 * （gk/pk）や未設定はnull（種別チップがどれも選択されない状態として扱う） */
export function toLayoutKind(k: string | undefined | null): LayoutKind | null {
  return k === "ck" || k === "fk" || k === "throwin" ? k : null;
}

export interface SetPieceLayoutInput {
  kind: LayoutKind;
  side: "attack" | "defense";
  format: 8 | 11;
  /** キック/スローの起点（§3-2の生成規則で使用）。FK・スローインのみ使用。
   * 未指定時はDEFAULT_ORIGINへフォールバックする（CKでは無視） */
  origin?: Point;
}

/**
 * 「新規作成」「種別チップ」から位置を選ぶモードへ入るための依頼（setpiece-redesign
 * §3-1・§7）。位置が決まったら action:"new" は newSetPiece、"apply" は
 * applySetPieceLayout を呼ぶ（Header.tsx / SetPieceBar.tsx / SetPieceBoard.tsx で共有する型）
 */
export interface PlacingRequest {
  kind: "fk" | "throwin";
  side: "attack" | "defense";
  format: 8 | 11;
  action: "new" | "apply";
}

export interface SetPieceLayout {
  ball: Point;
  view: PitchViewMode;
  slots: { x: number; y: number; role: Position }[];
  opps: { x: number; y: number }[];
}

/** 新規文書の既定入力（CK・攻撃・8人制） */
export const DEFAULT_SETPIECE_LAYOUT_INPUT: SetPieceLayoutInput = {
  kind: "ck",
  side: "attack",
  format: 8,
};

interface LayoutRecord {
  ball: Point;
  view: PitchViewMode;
  slots: { x: number; y: number; role: Position }[];
  opps: { x: number; y: number }[];
}

type BySideFormat = Record<"attack" | "defense", Record<8 | 11, LayoutRecord>>;

/* ------------------------------------------------------------------ */
/* CK（コーナーキック）: 既存プリセット ck-near-attack（攻撃）・ck-zone-defense（守備）と
   各-11の座標だけを複製する（ゾーンの網掛け・「ニア」「キッカー」等の図形・メモは付けない）。
   origin は右コーナー固定（左は既存の「左右反転」で作る＝setpiece-redesign §1） */
/* ------------------------------------------------------------------ */
const CK_LAYOUTS: BySideFormat = {
  attack: {
    8: {
      ball: { x: 99, y: 99 },
      view: "boxatk",
      slots: [
        { role: "RW", x: 97, y: 96 },
        { role: "CM", x: 85, y: 88 },
        { role: "ST", x: 60, y: 95 },
        { role: "CF", x: 55, y: 90 },
        { role: "LW", x: 40, y: 93 },
        { role: "AM", x: 50, y: 86 },
        { role: "DM", x: 50, y: 76 },
        { role: "GK", x: 50, y: 63 },
      ],
      opps: [
        { x: 50, y: 98 },
        { x: 58, y: 96 },
        { x: 42, y: 96 },
        { x: 61, y: 93 },
        { x: 56, y: 88 },
        { x: 39, y: 91 },
        { x: 49, y: 84 },
        { x: 50, y: 78 },
      ],
    },
    11: {
      ball: { x: 99, y: 99 },
      view: "boxatk",
      slots: [
        { role: "RW", x: 97, y: 96 },
        { role: "CM", x: 85, y: 89 },
        { role: "RM", x: 78, y: 83 },
        { role: "ST", x: 60, y: 95 },
        { role: "LW", x: 40, y: 93 },
        { role: "AM", x: 50, y: 87 },
        { role: "CF", x: 50, y: 91 },
        { role: "DM", x: 50, y: 77 },
        { role: "CB", x: 56, y: 66 },
        { role: "CB", x: 44, y: 66 },
        { role: "GK", x: 50, y: 62 },
      ],
      opps: [
        { x: 50, y: 98 },
        { x: 58, y: 96 },
        { x: 42, y: 96 },
        { x: 61, y: 93 },
        { x: 53, y: 90 },
        { x: 56, y: 87 },
        { x: 39, y: 91 },
        { x: 49, y: 84 },
        { x: 50, y: 79 },
        { x: 56, y: 71 },
        { x: 44, y: 71 },
      ],
    },
  },
  defense: {
    8: {
      ball: { x: 99, y: 1 },
      view: "boxdef",
      slots: [
        { role: "CB", x: 58, y: 4 },
        { role: "CB", x: 50, y: 6 },
        { role: "LB", x: 44, y: 5 },
        { role: "RB", x: 62, y: 6 },
        { role: "DM", x: 46, y: 14 },
        { role: "CM", x: 54, y: 14 },
        { role: "RM", x: 87, y: 11 },
        { role: "GK", x: 50, y: 2 },
      ],
      opps: [
        { x: 97, y: 3 },
        { x: 85, y: 10 },
        { x: 60, y: 5 },
        { x: 55, y: 9 },
        { x: 40, y: 6 },
        { x: 50, y: 13 },
        { x: 50, y: 22 },
        { x: 50, y: 37 },
      ],
    },
    11: {
      ball: { x: 99, y: 1 },
      view: "boxdef",
      slots: [
        { role: "CB", x: 58, y: 4 },
        { role: "CB", x: 50, y: 6 },
        { role: "LB", x: 44, y: 5 },
        { role: "RB", x: 62, y: 6 },
        { role: "DM", x: 46, y: 13 },
        { role: "CM", x: 54, y: 13 },
        { role: "LM", x: 38, y: 11 },
        { role: "RM", x: 62, y: 7 },
        { role: "AM", x: 33, y: 8 },
        { role: "RWB", x: 88, y: 12 },
        { role: "GK", x: 50, y: 2 },
      ],
      opps: [
        { x: 97, y: 3 },
        { x: 85, y: 10 },
        { x: 80, y: 15 },
        { x: 60, y: 5 },
        { x: 40, y: 6 },
        { x: 50, y: 9 },
        { x: 53, y: 7 },
        { x: 50, y: 16 },
        { x: 56, y: 28 },
        { x: 44, y: 28 },
        { x: 50, y: 39 },
      ],
    },
  },
};

/* ------------------------------------------------------------------ */
/* FK・スローイン: 位置(origin)から基本配置を作る生成規則（setpiece-redesign §3-2）。
   ピッチは105m×68m相当（yの1=1.05m、xの1=0.68m。8/11人制とも同じ換算を使う簡略化）。
   距離・間隔（9.15m/1.2m/6〜10m等）はいったんメートル空間で計算し、データ座標へ戻す
   （x/yのメートル換算率が違うため、データ空間のまま計算すると距離感が歪む）。
   攻撃＝キックの主体を「味方(attackers)」、守備＝同じ規則をy→100-yで上下反転し
   味方と相手を入れ替えて作る（攻守どちらも人・役割を持つRP[]として生成し、
   側に応じてslots/oppsへ振り分ける＝守備側のslotsにも役割を出せるようにするため）。 */
/* ------------------------------------------------------------------ */

const M_PER_X = 0.68;
const M_PER_Y = 1.05;
const toM = (p: Point): Point => ({ x: p.x * M_PER_X, y: p.y * M_PER_Y });
const fromM = (p: Point): Point => ({ x: p.x / M_PER_X, y: p.y / M_PER_Y });

/** メートル空間でのa-b間距離 */
function distM(a: Point, b: Point): number {
  const A = toM(a);
  const B = toM(b);
  return Math.hypot(A.x - B.x, A.y - B.y);
}

/** aからbへの単位ベクトル（メートル空間で正規化。moveMへそのまま渡せる） */
function dirM(a: Point, b: Point): Point {
  const A = toM(a);
  const B = toM(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** aからメートル単位でdir方向へmeters進んだ点（データ座標で返す） */
function moveM(a: Point, dir: Point, meters: number): Point {
  const A = toM(a);
  return fromM({ x: A.x + dir.x * meters, y: A.y + dir.y * meters });
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const GOAL_CENTER: Point = { x: 50, y: 100 };
/** ゴール枠の半幅（x44.5〜55.5）。§4の「狙う場所がゴール枠内」判定と同じ値を使う */
const GOAL_HALF_WIDTH_X = 5.5;

/* ---- 生成の考え方（統括の作り直し・2026-09-21） ----
   以前は「サッカーの規則どおりに置く → 汎用の重なり解消で押しのける → 表示範囲へ比例圧縮」の
   順だったが、(a) 最低間隔をデータ座標や実メートルで決めても、画面の px 密度が端末で違うため
   スマホ（ピッチ幅 302px・トークン径 50px＝幅の 1/6）では重なりが残る (b) 表示範囲へ圧縮すると
   後方の選手が同じ高さに固まる、の 2 つが解けなかった。
   作り直し後は 2 段：
   (1) 行のテンプレート：ゴール前の列・こぼれ球の列・後方の列…を、最初から読める間隔
       （味方は横 23 以上＝名前ラベルの幅、列どうしは表示範囲に応じた高さ）で置く。後方と GK は
       表示範囲の下端の列に横へ広げて置く（圧縮しない）。
   (2) 読みやすさの検査：ボール・壁・キッカーなど動かせない点の近くに来た点だけを、
       「スマホ 390 と PC 1440 の両方の px 換算で、円どうし・味方の名前ラベルと重ならない」
       最寄りの位置へ動かす（横へのずらしを優先）。壁どうしは肩を並べるので重なってよい。 */

type Team = "own" | "opp";
interface Tok {
  x: number;
  y: number;
  team: Team;
  role: Position;
  /** 動かさない点（ボールの近くの決まりごと：壁）。他の点を押しのける障害物になる */
  fixed?: boolean;
  /** 壁の一員（壁どうしの重なりは許す） */
  wall?: boolean;
  /** タッチライン際に立つ点（スローワー）。x の可動域を広げる */
  edge?: boolean;
}

interface Metric {
  sx: number;
  sy: number;
}
/** 表示範囲ごとの「データ 1 あたりの px」。スマホ 390（ピッチ幅 302px）と PC 1440 の実測値。
 * box＝ゴール前（y の可視範囲 42）、full＝全体 */
const METRICS: Record<"box" | "full", Metric[]> = {
  box: [
    { sx: 3.02, sy: 12.86 },
    { sx: 7.52, sy: 11.62 },
  ],
  full: [
    { sx: 3.02, sy: 5.4 },
    { sx: 5.45, sy: 8.4 },
  ],
};
/* トークンの実際の描かれ方（実測）：味方は「円 51px ＋ 役割 ＋ 名前」の高さ 95px の箱が、データ座標の
   点を中心に置かれる（components/PlayerToken.tsx・.tok は translate(-50%,-50%)）。つまり円の中心は
   点より 22px 上、ラベル（役割＋名前。幅 最大74px・高さ 32px）の中心は点より 31.5px 下。
   相手は円だけで、点がそのまま円の中心 */
const DISC_PX = 51;
const OWN_DISC_UP_PX = 22;
const OWN_LABEL_DOWN_PX = 31.5;
const LABEL_HALF_W_PX = 37;
const LABEL_HALF_H_PX = 16;
/** ラベルに被る判定で使う、円の実効的な半径（角は当たらないので少し小さめ） */
const DISC_HIT_PX = 23;
/** ボールとトークンの円の中心の最低距離（ボールが隠れず掴める距離） */
const BALL_GAP_PX = 38;

/** a と b が画面上でぶつかるか（どちらかの端末の換算でぶつかれば true）。
 * 画面は常に y の大きい側が上（lib/pitchView.ts） */
function collides(
  a: Point,
  aKind: Team | "ball",
  b: Point,
  bKind: Team | "ball",
  view: "box" | "full",
  bothWall: boolean,
  /** true＝相手の円が絡む重なりは 4 割まで許す（11人制のゴール前表示はスマホだと面積が足りないため） */
  relaxed = false,
  /** true＝PC の換算だけで判定する（スマホでは面積が足りず解が無いときの最後の手段） */
  pcOnly = false
): boolean {
  for (const m of pcOnly ? METRICS[view].slice(1) : METRICS[view]) {
    const dX = (a.x - b.x) * m.sx;
    // 画面の下向きを正とした、点どうしの縦の差（a が b より下なら正）
    const dY = (b.y - a.y) * m.sy;
    const aDisc = aKind === "own" ? -OWN_DISC_UP_PX : 0; // 点から見た円の中心（下向き正）
    const bDisc = bKind === "own" ? -OWN_DISC_UP_PX : 0;
    const discDY = dY + aDisc - bDisc;
    if (aKind === "ball" || bKind === "ball") {
      if (Math.hypot(dX, discDY) < BALL_GAP_PX) return true;
      // ボールが味方の名前ラベルの上に乗らないようにする（ボールの半径は約 13px）
      const ownIsA = aKind === "own";
      const ownIsB = bKind === "own";
      if (ownIsA || ownIsB) {
        // ラベルの中心から見たボールの縦位置（下向き正）。own が a なら ball は b（dY は a→b で a が下なら正）
        const ballFromOwn = ownIsA ? -dY : dY;
        if (Math.abs(dX) < LABEL_HALF_W_PX + 10 && Math.abs(ballFromOwn - OWN_LABEL_DOWN_PX) < LABEL_HALF_H_PX + 10) return true;
      }
      continue;
    }
    if (bothWall) continue; // 壁どうしは肩を並べるので重なってよい
    const oppInvolved = aKind === "opp" || bKind === "opp";
    if (Math.hypot(dX, discDY) < (relaxed && oppInvolved ? DISC_PX * 0.62 : DISC_PX)) return true;
    // a の円が b（味方）のラベルに被る
    if (bKind === "own" && Math.abs(dX) < LABEL_HALF_W_PX + DISC_HIT_PX && Math.abs(dY + aDisc - OWN_LABEL_DOWN_PX) < LABEL_HALF_H_PX + DISC_HIT_PX) return true;
    // b の円が a（味方）のラベルに被る
    if (aKind === "own" && Math.abs(dX) < LABEL_HALF_W_PX + DISC_HIT_PX && Math.abs(-dY + bDisc - OWN_LABEL_DOWN_PX) < LABEL_HALF_H_PX + DISC_HIT_PX) return true;
    // 味方どうしのラベルが被る
    if (aKind === "own" && bKind === "own" && Math.abs(dX) < LABEL_HALF_W_PX * 2 && Math.abs(dY) < LABEL_HALF_H_PX * 2) return true;
  }
  return false;
}

/** 探索するずらし量（横を優先。費用＝横² ＋ (縦×3)²）。1 度だけ作って使い回す */
const OFFSETS: Point[] = (() => {
  const out: { x: number; y: number; c: number }[] = [];
  for (let dx = -60; dx <= 60; dx += 1.5) {
    for (let dy = -48; dy <= 48; dy += 0.75) {
      out.push({ x: dx, y: dy, c: dx * dx + dy * 3 * (dy * 3) });
    }
  }
  out.sort((p, q) => p.c - q.c);
  return out.map(({ x, y }) => ({ x, y }));
})();

/** 表示範囲ごとの y の可動域。味方は箱（高さ 95px）が上下にはみ出さないよう 4.2（全体表示は 8.8）空ける */
function yRange(team: Team, view: PitchViewMode): [number, number] {
  if (view === "boxatk") return team === "own" ? [62.2, 95.8] : [60.2, 97.8];
  if (view === "boxdef") return team === "own" ? [4.2, 37.8] : [2.2, 39.8];
  return team === "own" ? [8.8, 91.2] : [3, 98.5];
}

/** 読みやすさの検査（実座標＝上下反転後に行う）。tokens は優先度の高い順 */
function settle(tokens: Tok[], ball: Point, view: PitchViewMode): Tok[] {
  const mode: "box" | "full" = view === "full" ? "full" : "box";
  const out: (Tok | null)[] = tokens.map(() => null);
  /** cand が、自分（skip）以外の置き済みの点・ボールとぶつかる数 */
  const bad = (cand: Tok, skip: number, relaxed = false, pcOnly = false): number => {
    let n = collides(cand, cand.team, ball, "ball", mode, false, false, pcOnly) ? 1 : 0;
    out.forEach((q, j) => {
      if (q && j !== skip && collides(cand, cand.team, q, q.team, mode, !!cand.wall && !!q.wall, relaxed, pcOnly)) n++;
    });
    return n;
  };
  /** i 番目の点を、いま置いてある他の点とぶつからない最寄りの位置へ置く。残った衝突数を返す */
  const place = (i: number): number => {
    const tk = tokens[i];
    if (tk.fixed) {
      out[i] = { ...tk };
      return 0;
    }
    const [yLo, yHi] = yRange(tk.team, view);
    const xLo = tk.edge ? 4 : tk.team === "own" ? 9 : 4;
    const xHi = 100 - xLo;
    const base = { x: clamp(tk.x, xLo, xHi), y: clamp(tk.y, yLo, yHi) };
    let best: Tok = { ...tk, ...base };
    let bestBad = bad(best, i);
    // まず厳しい基準（どの円も重ならない）で探し、見つからなければ「相手の円が絡む重なりは
    // 4 割まで可」に緩めて探す。味方どうし・味方の名前ラベルは緩めない
    // 3 段目：それでも無ければ PC の換算だけで探す（11人制のゴール前表示は、スマホだと味方 11 人の
    // 円＋名前だけで可動域の 7 割を占め、全員を離して置く解が無い。PC は必ず重ならないようにする）
    let finalBad = bestBad;
    for (const [relaxed, pcOnly] of [[false, false], [true, false], [true, true]] as const) {
      if (bestBad === 0) break;
      bestBad = bad(best, i, relaxed, pcOnly);
      for (const o of OFFSETS) {
        if (bestBad === 0) break;
        const x = base.x + o.x;
        const y = base.y + o.y;
        if (x < xLo || x > xHi || y < yLo || y > yHi) continue;
        const cand: Tok = { ...tk, x, y };
        const b = bad(cand, i, relaxed, pcOnly);
        if (b < bestBad) {
          best = cand;
          bestBad = b;
        }
      }
      finalBad = pcOnly ? bad(best, i, true, false) : bestBad;
    }
    out[i] = best;
    return finalBad;
  };
  // 1 巡目：優先度順に置く（先に置いた点は動かない）
  tokens.forEach((_, i) => place(i));
  // 手直し：まだぶつかっている点と、その相手を、他の全点を見ながら置き直す（最大 4 巡）。
  // 1 巡目は「先に置いた点だけ」を避けるので、後から来た点に挟まれて行き場が無くなることがある
  for (let round = 0; round < 4; round++) {
    let remaining = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const cur = out[i]!;
      if (tokens[i].fixed || bad(cur, i) === 0) continue;
      if (place(i) === 0) continue;
      // 相手側を動かしてから、もう一度
      out.forEach((q, j) => {
        if (q && j !== i && !tokens[j].fixed && collides(out[i]!, out[i]!.team, q, q.team, mode, false)) place(j);
      });
      remaining += place(i);
    }
    if (remaining === 0) break;
  }
  return out.map((q) => q!);
}

/** この y 以上（攻撃視点）ならゴール前表示で作る */
const BOX_VIEW_MIN_Y = 70;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** 攻撃視点（相手ゴール＝y100）で作った点の列を、実際の攻守へ変換して検査に通す */
function finish(canonBall: Point, canon: { att: Tok[]; def: Tok[] }, order: Tok[], side: "attack" | "defense"): SetPieceLayout {
  const flipY = (y: number): number => (side === "attack" ? y : 100 - y);
  const ball = { x: canonBall.x, y: flipY(canonBall.y) };
  // ゴール前表示にするのはボールが十分ゴール寄り（y70 以上）のときだけ。58〜70 だとボールの
  // 後ろに立つキッカー（とその名前）が表示範囲の下端からはみ出すので、全体表示にする
  const view: PitchViewMode = canonBall.y >= BOX_VIEW_MIN_Y ? (side === "attack" ? "boxatk" : "boxdef") : "full";
  // 攻撃なら att が味方、守備なら def が味方
  const teamOf = (t: Tok): Team => ((t.team === "own") === (side === "attack") ? "own" : "opp");
  const real = order.map((t) => ({ ...t, y: flipY(t.y), team: teamOf(t) }));
  const settled = settle(real, ball, view);
  // order の並び（優先度順）から、元の att／def の並び順へ戻す
  const byRef = new Map<Tok, Tok>();
  order.forEach((t, i) => byRef.set(t, settled[i]));
  const ownSrc = side === "attack" ? canon.att : canon.def;
  const oppSrc = side === "attack" ? canon.def : canon.att;
  return {
    ball: { x: round1(ball.x), y: round1(ball.y) },
    view,
    slots: ownSrc.map((t) => {
      const s = byRef.get(t)!;
      return { x: round1(s.x), y: round1(s.y), role: t.role };
    }),
    opps: oppSrc.map((t) => {
      const s = byRef.get(t)!;
      return { x: round1(s.x), y: round1(s.y) };
    }),
  };
}

/** 横一列の x（中央 50 を挟んで等間隔。n=4 なら 15・38.3・61.7・85） */
function rowXs(n: number, lo: number, hi: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [50];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

const A = (x: number, y: number, role: Position, extra: Partial<Tok> = {}): Tok => ({ x, y, role, team: "own", ...extra });
const D = (x: number, y: number, role: Position, extra: Partial<Tok> = {}): Tok => ({ x, y, role, team: "opp", ...extra });

/**
 * FKの基本配置（攻撃視点＝相手ゴール y100 で生成。setpiece-redesign §3-2）。
 * team:"own"＝キックする側、"opp"＝守る側（finish が実際の攻守へ読み替える）
 */
function buildFkLayout(side: "attack" | "defense", format: 8 | 11, origin: Point): SetPieceLayout {
  // 実座標 → 攻撃視点
  const o = side === "attack" ? origin : { x: origin.x, y: 100 - origin.y };
  let ball: Point = { x: clamp(o.x, 2, 98), y: clamp(o.y, 2, 98) };
  // ペナルティエリアの中（x20.4〜79.6・y84.3〜）は FK ではなく PK になるので、エリアの外へ出す
  if (ball.x > 20.4 && ball.x < 79.6 && ball.y > 83) ball = { x: ball.x, y: 83 };
  const box = ball.y >= BOX_VIEW_MIN_Y;
  const d = distM(ball, GOAL_CENTER);
  const isSide = ball.x < 25 || ball.x > 75;
  const wallSize = d > 30 ? 1 : isSide ? (format === 11 ? 2 : 1) : format === 11 ? (d <= 22 ? 4 : 3) : 2;

  const frontN = format === 11 ? 4 : 3;
  const reboundN = format === 11 ? 2 : 1;
  const shortN = format === 11 ? 1 : 0;

  // 列の高さ：ゴール前表示は 42 の中に 4 列、全体表示はボールの位置から前後に広げる
  const frontY = box ? 89 : clamp(ball.y + 34, 72, 82);
  // マーカーは味方の円（点より 22px 上に描かれる）のすぐゴール側。円どうしが触れない最小の差
  const markDy = box ? 2.8 : 5.6;
  const reboundY = box ? 78 : frontY - 18;
  // 後方の 2 人と GK は表示範囲のいちばん下の列に横へ広げて置く（GK が前へ押し出されないように）
  const restY = box ? 63 : clamp(ball.y - 19, 12, 60);
  const ownGkY = box ? 63 : clamp(restY - 18, 8.8, 40);
  const fwdY = box ? 70.5 : clamp(restY + 12, 20, 70);

  const toGoal = dirM(ball, GOAL_CENTER);
  // キッカーはボールの後ろ（ゴールと反対側）。円でボールを隠さない距離
  const kickerAt = moveM(ball, toGoal, -6.5);
  const kicker = A(kickerAt.x, kickerAt.y, "AM");
  const roomSign = ball.x < 50 ? 1 : -1;
  const shorts = Array.from({ length: shortN }, () => A(ball.x + roomSign * 24, ball.y - 1, "CM"));
  const frontRoles: Position[] = ["LW", "ST", "CF", "RW"];
  const fronts = rowXs(frontN, frontN === 4 ? 15 : 22, frontN === 4 ? 85 : 78).map((x, i) =>
    A(x, frontY, frontN === 3 ? (["LW", "ST", "RW"] as Position[])[i] : frontRoles[i])
  );
  const rebounds = rowXs(reboundN, 32, 68).map((x, i) => A(x, reboundY, (["CM", "DM"] as Position[])[i]));
  const rests = [A(20, restY, "CB"), A(80, restY, "CB")];
  const ownGk = A(50, ownGkY, "GK");
  const att: Tok[] = [kicker, ...shorts, ...fronts, ...rebounds, ...rests, ownGk];

  // 壁：ボールとニアポストを結ぶ線上 9.15m。並びは線に直角。画面で「並んだ壁」に見えるよう
  // 間隔は実寸の肩幅ではなく横 5 ぶん（3.4m 相当）にする
  const nearPost: Point = { x: ball.x < 50 ? 50 - GOAL_HALF_WIDTH_X : 50 + GOAL_HALF_WIDTH_X, y: 100 };
  const wallDir = dirM(ball, nearPost);
  const wallCenter = moveM(ball, wallDir, 9.15);
  const wallPerp: Point = { x: -wallDir.y, y: wallDir.x };
  const wallRoles: Position[] = ["CM", "CB", "DM", "CM"];
  const walls = Array.from({ length: wallSize }, (_, i) => {
    const p = moveM(wallCenter, wallPerp, (i - (wallSize - 1) / 2) * (side === "defense" ? 4.6 : 3.4));
    return D(clamp(p.x, 3, 97), clamp(p.y, 3, 97.5), wallRoles[i], { fixed: true, wall: true });
  });
  const oppGk = D(50, 98, "GK");
  const fMarkRoles: Position[] = ["LB", "CB", "CB", "RB"];
  const fMarks = fronts.map((f, i) => D(f.x, f.y + markDy, frontN === 3 ? (["LB", "CB", "RB"] as Position[])[i] : fMarkRoles[i]));
  const rMarks = rebounds.map((r, i) => D(r.x, r.y + markDy, (["DM", "CM"] as Position[])[i]));
  const fwdN = Math.max(0, format - 1 - wallSize - fMarks.length - rMarks.length);
  // 前線に残る選手は、ボール（とキッカー・壁）の居る側を避けて反対側から並べる
  const awayXs = ball.x > 50 ? [12, 50, 88, 30] : [88, 50, 12, 70];
  const fwdXs = awayXs.slice(0, fwdN);
  const fwds = fwdXs.map((x, i) => D(x, fwdY, (["ST", "LW", "RW", "CF"] as Position[])[i % 4]));
  const def: Tok[] = [...walls, oppGk, ...fMarks, ...rMarks, ...fwds];

  // 優先度順（先に置いたものが動かない）
  const order: Tok[] = [...walls, kicker, oppGk, ownGk, ...rests, ...fronts, ...fMarks, ...rebounds, ...rMarks, ...shorts, ...fwds];
  return finish(ball, { att, def }, order, side);
}

/**
 * スローインの基本配置（攻撃視点で生成。setpiece-redesign §3-2）。
 * x は近い側のサイドラインへ吸着する（位置を選ぶモード側でも吸着するが、単体で呼ばれても安全に）
 */
function buildThrowinLayout(side: "attack" | "defense", format: 8 | 11, origin: Point): SetPieceLayout {
  const o = side === "attack" ? origin : { x: origin.x, y: 100 - origin.y };
  const left = o.x < 50;
  const ball: Point = { x: left ? 0.8 : 99.2, y: clamp(o.y, 2, 98) };
  const box = ball.y >= BOX_VIEW_MIN_Y;
  /** タッチラインからの距離 u → x */
  const X = (u: number): number => (left ? u : 100 - u);
  const by = ball.y;
  const cy = (y: number): number => clamp(y, 4, 96);
  const markDy = box ? 2.8 : 5.6;

  const thrower = A(X(5), by, left ? "LB" : "RB", { edge: true });
  const near1 = A(X(27), cy(by + 9), "CM");
  const near2 = A(X(27), cy(by - 9), "DM");
  const runner = A(X(30), cy(by + 26), "ST");
  const c1 = A(X(50), cy(by + 3), "AM");
  const restY = box ? 63 : cy(by - 22);
  const d1 = A(X(20), restY, "CB");
  const d2 = A(X(80), restY, "CB");
  const ownGk = A(50, box ? 63 : clamp(by - 42, 8.8, 40), "GK");
  const extra11: Tok[] =
    format === 11 ? [A(X(62), cy(by + 17), "CF"), A(X(80), cy(by + 8), left ? "RW" : "LW"), A(X(50), box ? 71.5 : cy(by - 12), "DM")] : [];
  const outfield: Tok[] = [thrower, near1, near2, runner, c1, ...extra11, d1, d2];
  const att: Tok[] = [...outfield, ownGk];

  const oppGk = D(50, 98, "GK");
  const mRoles: Position[] = [left ? "RM" : "LM", "CM", "DM", "CB", "CM", "CB", left ? "LB" : "RB", left ? "LW" : "RW", "ST", "CF"];
  const marks = outfield.map((a, i) =>
    a === thrower
      ? D(X(18), cy(by + 1.5), mRoles[i]) // スローワーの前に立つ
      : D(a.x + (a.x < 50 ? 3 : -3), cy(a.y + markDy), mRoles[i % mRoles.length])
  );
  const def: Tok[] = [oppGk, ...marks];

  const order: Tok[] = [thrower, oppGk, ownGk, d1, d2, ...outfield.filter((a) => a !== thrower && a !== d1 && a !== d2), ...marks];
  return finish(ball, { att, def }, order, side);
}

/** originが未指定のときのフォールバック（通常は位置を選ぶモードが先に起点を決めるため
 * 使われないが、純粋関数として呼ばれたときにも破綻しないための既定値） */
const DEFAULT_ORIGIN: Record<"fk" | "throwin", Record<"attack" | "defense", Point>> = {
  fk: { attack: { x: 78, y: 78 }, defense: { x: 22, y: 22 } },
  throwin: { attack: { x: 0.8, y: 65 }, defense: { x: 99.2, y: 35 } },
};

/**
 * 種別×攻守×人数（×起点）から、セットプレーの基本配置を作る（setpiece-redesign §1・§3）。
 * CKは既存プリセット座標の複製。FK/スローインはorigin（キック/スローの位置）から
 * §3-2の生成規則で配置を作る（人数ぴったり・重なりなし・範囲内）。
 */
export function buildSetPieceLayout(input: SetPieceLayoutInput): SetPieceLayout {
  if (input.kind === "ck") {
    const src = CK_LAYOUTS[input.side][input.format];
    return {
      ball: { ...src.ball },
      view: src.view,
      slots: src.slots.map((s) => ({ ...s })),
      opps: src.opps.map((o) => ({ ...o })),
    };
  }
  const origin = input.origin ?? DEFAULT_ORIGIN[input.kind][input.side];
  return input.kind === "fk"
    ? buildFkLayout(input.side, input.format, origin)
    : buildThrowinLayout(input.side, input.format, origin);
}
