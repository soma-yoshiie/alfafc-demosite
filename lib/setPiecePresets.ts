// セットプレーデザイン画面のシナリオ定義テーブル。
// 8人制（スロット8枠＝GK+7）を基本に、11人制版（スロット11枠＝GK+10。idは同じ定石に
// "-11"サフィックスを付けてペア化）を各シナリオぶん追加収録する。CK/FK/ゴールキック/
// スローイン/PKの代表的な定石を収録する。lib/formations.ts の FORMATIONS には絶対に
// 混ぜない（スタメンUIに露出してしまうため）。

import type {
  BoardState,
  OppToken,
  Player,
  Point,
  Position,
  PitchViewMode,
  SetPieceKind,
  Shape,
  Slot,
} from "./types";

/** セットプレー1シナリオの定義。座標は既存ピッチの正規化系（x:0-100 左-右 / y:0-100 自陣-敵陣）を使う */
export interface SetPiecePreset {
  id: string;
  kind: SetPieceKind;
  side: "attack" | "defense";
  /** 何人制のシナリオか（GK含む人数＝slots/oppsの要素数と一致） */
  format: 8 | 11;
  label: string;
  desc: string;
  ball: Point;
  view: PitchViewMode;
  /** 8枠(8人制)/11枠(11人制)ぶんの初期配置（自チーム）。要素数はformatと一致させる */
  slots: { x: number; y: number; role: Position }[];
  /** 相手トークンの初期配置（slotsと同数。attack側は守る相手・defense側は攻める相手を表す） */
  opps: { x: number; y: number }[];
  /** 初期図形（ゾーン網掛け／役割テキスト／マンマーク連結線など）。任意 */
  shapes?: Shape[];
  memo?: string;
}

/* ------------------------------------------------------------------ */
/* CK（コーナーキック）                                                 */
/* ------------------------------------------------------------------ */

const CK_NEAR_ATTACK: SetPiecePreset = {
  id: "ck-near-attack",
  kind: "ck",
  side: "attack",
  format: 8,
  label: "CK：ニア狙い",
  desc: "近い ポストへ速いボールを送り込むU-12年代の定石。ニアで合わせて折り返しも狙う。",
  view: "boxatk",
  ball: { x: 97, y: 97 },
  slots: [
    { role: "RW", x: 97, y: 96 }, // キッカー
    { role: "CM", x: 85, y: 88 }, // ショート要員
    { role: "ST", x: 60, y: 95 }, // ニア1
    { role: "CF", x: 55, y: 90 }, // ニア2
    { role: "LW", x: 40, y: 93 }, // ファー
    { role: "AM", x: 50, y: 86 }, // スポット
    { role: "DM", x: 50, y: 76 }, // エッジ回収
    { role: "GK", x: 50, y: 63 }, // 残り（自陣に残るGK。boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
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
  shapes: [
    { id: "ckn-zone", kind: "zoneRect", x: 58, y: 94, w: 20, h: 12, color: "#ff8a65" },
    { id: "ckn-label-zone", kind: "text", x: 58, y: 94, text: "ニア", size: "m", color: "#ff8a65" },
    { id: "ckn-label-kicker", kind: "text", x: 90, y: 90, text: "キッカー", size: "s" },
  ],
  memo: "ニア狙いはU-12年代の定石。速く鋭いボールで潰す。",
};

const CK_FAR_ATTACK: SetPiecePreset = {
  id: "ck-far-attack",
  kind: "ck",
  side: "attack",
  format: 8,
  label: "CK：ファー狙い",
  desc: "ファーポストへ大きく蹴り、折り返しで押し込む。",
  view: "boxatk",
  ball: { x: 97, y: 97 },
  slots: [
    { role: "RW", x: 97, y: 96 }, // キッカー
    { role: "CM", x: 85, y: 88 }, // ショート要員
    { role: "ST", x: 60, y: 94 }, // ニア
    { role: "CF", x: 40, y: 95 }, // ファー1
    { role: "LW", x: 36, y: 90 }, // ファー2
    { role: "AM", x: 50, y: 86 }, // スポット
    { role: "DM", x: 50, y: 76 }, // エッジ回収
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 },
    { x: 58, y: 96 },
    { x: 42, y: 96 },
    { x: 60, y: 92 },
    { x: 38, y: 93 },
    { x: 34, y: 88 },
    { x: 49, y: 84 },
    { x: 50, y: 78 },
  ],
  shapes: [
    { id: "ckf-zone", kind: "zoneRect", x: 38, y: 92, w: 20, h: 14, color: "#4fc3f7" },
    { id: "ckf-label-zone", kind: "text", x: 38, y: 92, text: "ファー", size: "m", color: "#4fc3f7" },
  ],
  memo: "ファー狙いは奥へ流れるボールへの詰めがポイント。",
};

const CK_SHORT_ATTACK: SetPiecePreset = {
  id: "ck-short-attack",
  kind: "ck",
  side: "attack",
  format: 8,
  label: "CK：ショート",
  desc: "ショートコーナーで数的優位を作り、崩してから折り返す。",
  view: "boxatk",
  ball: { x: 97, y: 97 },
  slots: [
    { role: "RW", x: 97, y: 96 }, // キッカー
    { role: "CM", x: 88, y: 90 }, // ショート1
    { role: "RM", x: 80, y: 82 }, // ショート2
    { role: "ST", x: 58, y: 94 }, // ニア
    { role: "LW", x: 42, y: 93 }, // ファー
    { role: "AM", x: 50, y: 86 }, // スポット
    { role: "DM", x: 50, y: 76 }, // エッジ回収
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 },
    { x: 90, y: 88 },
    { x: 58, y: 96 },
    { x: 42, y: 96 },
    { x: 60, y: 92 },
    { x: 40, y: 91 },
    { x: 49, y: 84 },
    { x: 50, y: 78 },
  ],
  memo: "ショートで相手を引き出し、空いたスペースへクロス。",
};

const CK_ZONE_DEFENSE: SetPiecePreset = {
  id: "ck-zone-defense",
  kind: "ck",
  side: "defense",
  format: 8,
  label: "CK対応：ゾーン",
  desc: "ゾーンでスペースを守る配置。ポスト番と6ヤード列でニア/ファーを固める。",
  view: "boxdef",
  ball: { x: 97, y: 3 },
  slots: [
    { role: "CB", x: 58, y: 4 }, // ポスト番
    { role: "CB", x: 50, y: 6 }, // 6ヤード列1
    { role: "LB", x: 44, y: 5 }, // 6ヤード列2
    { role: "RB", x: 62, y: 6 }, // 6ヤード列3
    { role: "DM", x: 46, y: 14 }, // 前列1
    { role: "CM", x: 54, y: 14 }, // 前列2
    { role: "RM", x: 87, y: 11 }, // キッカー妨害
    { role: "GK", x: 50, y: 2 }, // GK
  ],
  opps: [
    { x: 97, y: 3 }, // 相手キッカー
    { x: 85, y: 10 }, // 相手ショート
    { x: 60, y: 5 }, // 相手ニア1
    { x: 55, y: 9 }, // 相手ニア2
    { x: 40, y: 6 }, // 相手ファー
    { x: 50, y: 13 }, // 相手スポット
    { x: 50, y: 22 }, // 相手エッジ
    { x: 50, y: 37 }, // 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  shapes: [
    { id: "ckzd-six", kind: "zoneRect", x: 50, y: 6, w: 34, h: 10, color: "#81c784" },
    { id: "ckzd-front", kind: "zoneRect", x: 50, y: 14, w: 40, h: 8, color: "#64b5f6" },
    { id: "ckzd-label-six", kind: "text", x: 50, y: 6, text: "6yゾーン", size: "s" },
    { id: "ckzd-label-front", kind: "text", x: 50, y: 14, text: "前列ゾーン", size: "s" },
  ],
  memo: "ゾーンで面を埋め、こぼれ球に強い配置。",
};

const CK_MIX_DEFENSE: SetPiecePreset = {
  id: "ck-mix-defense",
  kind: "ck",
  side: "defense",
  format: 8,
  label: "CK対応：ミックス",
  desc: "ゾーン4＋マンマーク3の併用。核となる相手選手だけ人につく。",
  view: "boxdef",
  ball: { x: 97, y: 3 },
  slots: [
    { role: "CB", x: 58, y: 4 }, // ゾーン1
    { role: "CB", x: 42, y: 4 }, // ゾーン2
    { role: "LB", x: 50, y: 6 }, // ゾーン3
    { role: "DM", x: 50, y: 14 }, // ゾーン4
    { role: "RB", x: 60, y: 8 }, // マーク1（相手ニア）
    { role: "CM", x: 39, y: 8 }, // マーク2（相手ファー）
    { role: "RM", x: 49, y: 12 }, // マーク3（相手スポット）
    { role: "GK", x: 50, y: 2 }, // GK
  ],
  opps: [
    { x: 97, y: 3 }, // opp0: 相手キッカー
    { x: 85, y: 10 }, // opp1: 相手ショート
    { x: 60, y: 6 }, // opp2: 相手ニア ← マーク1
    { x: 39, y: 6 }, // opp3: 相手ファー ← マーク2
    { x: 49, y: 11 }, // opp4: 相手スポット ← マーク3
    { x: 50, y: 20 }, // opp5: 相手エッジ
    { x: 70, y: 14 }, // opp6: 相手予備
    { x: 50, y: 37 }, // opp7: 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  shapes: [
    { id: "ckmd-zone", kind: "zoneRect", x: 50, y: 5, w: 30, h: 10, color: "#81c784" },
    { id: "ckmd-label-zone", kind: "text", x: 50, y: 5, text: "ゾーン", size: "s" },
    { id: "ckmd-label-mark", kind: "text", x: 50, y: 12, text: "マンマーク", size: "s" },
    { id: "ckmd-link1", kind: "link", actors: [4, "opp2"], color: "#e57373" },
    { id: "ckmd-link2", kind: "link", actors: [5, "opp3"], color: "#e57373" },
    { id: "ckmd-link3", kind: "link", actors: [6, "opp4"], color: "#e57373" },
  ],
  memo: "要注意の相手だけ人につき、残りはゾーンで面を守る。",
};

/* ------------------------------------------------------------------ */
/* FK（フリーキック）                                                   */
/* ------------------------------------------------------------------ */

const FK_DIRECT_ATTACK: SetPiecePreset = {
  id: "fk-direct-attack",
  kind: "fk",
  side: "attack",
  format: 8,
  label: "FK：直接（壁越え）",
  desc: "壁の上を越すコースを作る。キッカー2枚でどちらが蹴るか迷わせる。",
  view: "boxatk",
  ball: { x: 44, y: 76 },
  slots: [
    { role: "CM", x: 44, y: 76 }, // キッカー1
    { role: "AM", x: 48, y: 77 }, // キッカー2
    { role: "RM", x: 56, y: 87 }, // スクリーン（壁の視界を遮る）
    { role: "ST", x: 58, y: 95 }, // ニアポスト
    { role: "CF", x: 40, y: 95 }, // ファーポスト
    { role: "DM", x: 50, y: 70 }, // リバウンド
    { role: "CB", x: 50, y: 66 }, // エッジカバー
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 }, // 相手GK
    { x: 48, y: 85 }, // 壁1
    { x: 52, y: 85 }, // 壁2
    { x: 56, y: 85 }, // 壁3
    { x: 58, y: 93 }, // ニアポストマーク
    { x: 40, y: 93 }, // ファーポストマーク
    { x: 50, y: 73 }, // リバウンドケア
    { x: 50, y: 65 }, // 予備カバー（boxatkビューの可視域端に配置してクリップを防ぐ）
  ],
  memo: "壁の外側からニアサイドを叩く形。キッカー2枚で駆け引きを作る。",
};

const FK_CROSS_ATTACK: SetPiecePreset = {
  id: "fk-cross-attack",
  kind: "fk",
  side: "attack",
  format: 8,
  label: "FK：クロス攻撃",
  desc: "サイドからのFKをクロスとして送り込む。CKに近い崩し方。",
  view: "boxatk",
  ball: { x: 90, y: 72 },
  slots: [
    { role: "RM", x: 90, y: 72 }, // キッカー
    { role: "ST", x: 60, y: 95 }, // ニア1
    { role: "CF", x: 56, y: 90 }, // ニア2
    { role: "LW", x: 40, y: 93 }, // ファー
    { role: "AM", x: 50, y: 86 }, // スポット
    { role: "CM", x: 80, y: 80 }, // ショート
    { role: "DM", x: 50, y: 76 }, // エッジ回収
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 },
    { x: 58, y: 96 },
    { x: 42, y: 96 },
    { x: 61, y: 93 },
    { x: 56, y: 88 },
    { x: 39, y: 91 },
    { x: 49, y: 84 },
    { x: 82, y: 76 },
  ],
  memo: "CKに近い形。キッカーの質でニア/ファーを使い分ける。",
};

const FK_WALL_DEFENSE: SetPiecePreset = {
  id: "fk-wall-defense",
  kind: "fk",
  side: "defense",
  format: 8,
  label: "FK対応：壁",
  desc: "壁3枚＋マンマークで直接コースと折返しの両方をケアする。",
  view: "boxdef",
  ball: { x: 52, y: 22 },
  slots: [
    { role: "CB", x: 48, y: 16 }, // 壁1
    { role: "CB", x: 52, y: 16 }, // 壁2
    { role: "LB", x: 56, y: 16 }, // 壁3
    { role: "RB", x: 58, y: 8 }, // マーク1（相手ニアポスト）
    { role: "DM", x: 42, y: 8 }, // マーク2（相手ファーポスト）
    { role: "CM", x: 50, y: 12 }, // マーク3（相手スポット）
    { role: "RM", x: 66, y: 20 }, // カバー（ショート対応）
    { role: "GK", x: 50, y: 2 }, // GK
  ],
  opps: [
    { x: 52, y: 22 }, // opp0: 相手キッカー
    { x: 58, y: 6 }, // opp1: 相手ニアポスト ← マーク1
    { x: 42, y: 6 }, // opp2: 相手ファーポスト ← マーク2
    { x: 50, y: 10 }, // opp3: 相手スポット ← マーク3
    { x: 66, y: 18 }, // opp4: 相手ショート
    { x: 50, y: 30 }, // opp5: 相手エッジ
    { x: 34, y: 18 }, // opp6: 相手予備
    { x: 50, y: 37 }, // opp7: 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  shapes: [
    { id: "fkwd-wallline", kind: "link", actors: [0, 1, 2], color: "#90a4ae" },
    { id: "fkwd-label-wall", kind: "text", x: 52, y: 16, text: "壁", size: "s" },
    { id: "fkwd-link1", kind: "link", actors: [3, "opp1"], color: "#e57373" },
    { id: "fkwd-link2", kind: "link", actors: [4, "opp2"], color: "#e57373" },
    { id: "fkwd-link3", kind: "link", actors: [5, "opp3"], color: "#e57373" },
  ],
  memo: "壁は入射角を消す位置。マークは折返しの脅威につく。",
};

/* ------------------------------------------------------------------ */
/* ゴールキック                                                        */
/* ------------------------------------------------------------------ */

const GK_BUILD: SetPiecePreset = {
  id: "gk-build",
  kind: "gk",
  side: "attack",
  format: 8,
  label: "ゴールキック：つなぐ",
  desc: "CBが開き、アンカーが間に降りてビルドアップする8人制サリーダの定石。",
  view: "full",
  ball: { x: 50, y: 6 },
  slots: [
    { role: "GK", x: 50, y: 6 },
    { role: "CB", x: 72, y: 16 }, // 右CB（開く）
    { role: "CB", x: 28, y: 16 }, // 左CB（開く）
    { role: "DM", x: 50, y: 14 }, // アンカー（間に降りる）
    { role: "RB", x: 90, y: 32 }, // 右サイド高め
    { role: "LB", x: 10, y: 32 }, // 左サイド高め
    { role: "CM", x: 50, y: 40 }, // 中盤サポート
    { role: "ST", x: 50, y: 62 }, // 前線の出口
  ],
  opps: [
    { x: 60, y: 26 },
    { x: 40, y: 26 },
    { x: 85, y: 34 },
    { x: 15, y: 34 },
    { x: 50, y: 22 },
    { x: 65, y: 44 },
    { x: 35, y: 44 },
    { x: 50, y: 96 },
  ],
  shapes: [
    { id: "gkb-label-anchor", kind: "text", x: 50, y: 14, text: "降りる", size: "s" },
    { id: "gkb-label-cb", kind: "text", x: 72, y: 16, text: "開く", size: "s" },
  ],
  memo: "CBが開いてアンカーが降り、数的優位でビルドアップ。",
};

const GK_LONG: SetPiecePreset = {
  id: "gk-long",
  kind: "gk",
  side: "attack",
  format: 8,
  label: "ゴールキック：ロング",
  desc: "前線で競り、セカンドボールを回収する。",
  view: "full",
  ball: { x: 50, y: 6 },
  slots: [
    { role: "GK", x: 50, y: 6 },
    { role: "ST", x: 50, y: 55 }, // 競り合いターゲット
    { role: "CF", x: 40, y: 48 }, // セカンド回収1
    { role: "RW", x: 62, y: 50 }, // セカンド回収2
    { role: "CM", x: 50, y: 38 }, // セカンド回収3
    { role: "DM", x: 40, y: 32 }, // セカンド回収4
    { role: "CB", x: 66, y: 16 },
    { role: "CB", x: 34, y: 16 },
  ],
  opps: [
    { x: 50, y: 52 },
    { x: 44, y: 50 },
    { x: 56, y: 50 },
    { x: 50, y: 36 },
    { x: 36, y: 34 },
    { x: 64, y: 34 },
    { x: 50, y: 20 },
    { x: 50, y: 96 },
  ],
  shapes: [{ id: "gkl-label-target", kind: "text", x: 50, y: 55, text: "競る", size: "s" }],
  memo: "競り合いに強い選手を前線に。セカンドは中盤で回収。",
};

/* ------------------------------------------------------------------ */
/* スローイン                                                          */
/* ------------------------------------------------------------------ */

const THROWIN_ADVANCE: SetPiecePreset = {
  id: "throwin-advance",
  kind: "throwin",
  side: "attack",
  format: 8,
  label: "スローイン：前進",
  desc: "投げ手→第1の受け手→第2の動きで前進する。",
  view: "boxatk",
  ball: { x: 3, y: 72 },
  slots: [
    { role: "LB", x: 3, y: 72 }, // 投げ手
    { role: "CM", x: 15, y: 73 }, // 第1受け手
    { role: "LW", x: 9, y: 88 }, // 第2の動き（裏へ）
    { role: "DM", x: 28, y: 66 },
    { role: "CB", x: 22, y: 64 }, // boxatkビュー(y58-100)の可視域端に配置
    { role: "RM", x: 72, y: 78 },
    { role: "ST", x: 50, y: 92 },
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビューの可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 7, y: 69 },
    { x: 17, y: 76 },
    { x: 11, y: 85 },
    { x: 30, y: 64 },
    { x: 44, y: 64 },
    { x: 58, y: 70 },
    { x: 50, y: 65 },
    { x: 50, y: 96 }, // 相手GK
  ],
  memo: "第1受け手が壁になり、裏へ抜ける動きで前進する。タッチライン際なのでboxatkビューに収まる。",
};

const THROWIN_KEEP: SetPiecePreset = {
  id: "throwin-keep",
  kind: "throwin",
  side: "attack",
  format: 8,
  label: "スローイン：キープ",
  desc: "無理に前進せず、外→中でボールを失わない形を作る。",
  view: "boxdef",
  ball: { x: 97, y: 22 },
  slots: [
    { role: "RB", x: 97, y: 22 }, // 投げ手
    { role: "CM", x: 86, y: 23 }, // 近サポート1
    { role: "DM", x: 88, y: 14 }, // 近サポート2
    { role: "CB", x: 80, y: 10 },
    { role: "CB", x: 60, y: 8 },
    { role: "AM", x: 70, y: 30 },
    { role: "LW", x: 20, y: 34 },
    { role: "GK", x: 50, y: 4 },
  ],
  opps: [
    { x: 94, y: 19 },
    { x: 84, y: 21 },
    { x: 86, y: 12 },
    { x: 76, y: 11 },
    { x: 66, y: 8 },
    { x: 68, y: 28 },
    { x: 50, y: 9 },
    { x: 50, y: 37 }, // 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  memo: "複数のサポート角度を作り、奪われない距離感を保つ。自陣タッチライン際なのでboxdefビューに収まる。",
};

/* ------------------------------------------------------------------ */
/* PK                                                                  */
/* ------------------------------------------------------------------ */

const PK_BASIC: SetPiecePreset = {
  id: "pk-basic",
  kind: "pk",
  side: "attack",
  format: 8,
  label: "PK：基本形",
  desc: "キッカー以外はペナルティエリア外で待機し、リバウンドに備える。",
  view: "boxatk",
  ball: { x: 50, y: 88 },
  slots: [
    { role: "ST", x: 50, y: 80 }, // キッカー（助走位置）
    { role: "CF", x: 44, y: 79 }, // リバウンド1
    { role: "AM", x: 56, y: 79 }, // リバウンド2
    { role: "CM", x: 38, y: 74 },
    { role: "CM", x: 62, y: 74 },
    { role: "DM", x: 50, y: 70 },
    { role: "CB", x: 48, y: 64 }, // boxatkビュー(y58-100)の可視域端に配置
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビューの可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 }, // 相手GK
    { x: 44, y: 80 },
    { x: 56, y: 80 },
    { x: 38, y: 76 },
    { x: 62, y: 76 },
    { x: 50, y: 72 },
    { x: 50, y: 64 },
    { x: 50, y: 66 }, // boxatkビューの可視域端に配置してクリップを防ぐ
  ],
  memo: "エリア外で待機し、こぼれ球を狙う。キッカー以外はライン上に並ぶ。",
};

/* ------------------------------------------------------------------ */
/* 11人制版（8人制の各定石と同一シナリオをGK+10で再構成。idは"-11"サフィックスでペア化） */
/* ------------------------------------------------------------------ */

/* --- CK（コーナーキック）11人制 ---
   攻撃=キッカー/ショート要員2/ボックス内4(ニア・ファー・スポット・中央)/エッジ回収/残り2+GK
   守備(ゾーン)=ゾーン6+マンマーク2+ポスト番+キッカー妨害+GK
   守備(ミックス)=ゾーン4+マン4+ポスト番+キッカー妨害+GK                                   */

const CK_NEAR_ATTACK_11: SetPiecePreset = {
  id: "ck-near-attack-11",
  kind: "ck",
  side: "attack",
  format: 11,
  label: "CK：ニア狙い",
  desc: "近いポストへ速いボールを送り込む定石（11人制）。ニアで合わせて折り返しも狙う。",
  view: "boxatk",
  ball: { x: 97, y: 97 },
  slots: [
    { role: "RW", x: 97, y: 96 }, // キッカー
    { role: "CM", x: 85, y: 89 }, // ショート要員1
    { role: "RM", x: 78, y: 83 }, // ショート要員2
    { role: "ST", x: 60, y: 95 }, // ニア
    { role: "LW", x: 40, y: 93 }, // ファー
    { role: "AM", x: 50, y: 87 }, // スポット
    { role: "CF", x: 50, y: 91 }, // 中央
    { role: "DM", x: 50, y: 77 }, // エッジ回収
    { role: "CB", x: 56, y: 66 }, // 残り1
    { role: "CB", x: 44, y: 66 }, // 残り2
    { role: "GK", x: 50, y: 62 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
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
    { x: 56, y: 71 }, // 「残り」自陣CB(56,66)とのラベル重なりを避けるためy+3
    { x: 44, y: 71 }, // 「残り」自陣CB(44,66)とのラベル重なりを避けるためy+3
  ],
  shapes: [
    { id: "ckn11-zone", kind: "zoneRect", x: 58, y: 94, w: 20, h: 12, color: "#ff8a65" },
    { id: "ckn11-label-zone", kind: "text", x: 58, y: 94, text: "ニア", size: "m", color: "#ff8a65" },
    { id: "ckn11-label-kicker", kind: "text", x: 90, y: 90, text: "キッカー", size: "s" },
  ],
  memo: "ニア狙いはU-12年代の定石を11人制へ拡張。速く鋭いボールで潰す。",
};

const CK_FAR_ATTACK_11: SetPiecePreset = {
  id: "ck-far-attack-11",
  kind: "ck",
  side: "attack",
  format: 11,
  label: "CK：ファー狙い",
  desc: "ファーポストへ大きく蹴り、折り返しで押し込む（11人制）。",
  view: "boxatk",
  ball: { x: 97, y: 97 },
  slots: [
    { role: "RW", x: 97, y: 96 }, // キッカー
    { role: "CM", x: 85, y: 89 }, // ショート要員1
    { role: "RM", x: 78, y: 82 }, // ショート要員2
    { role: "ST", x: 60, y: 94 }, // ニア
    { role: "CF", x: 40, y: 95 }, // ファー1
    { role: "LW", x: 36, y: 90 }, // ファー2
    { role: "AM", x: 50, y: 87 }, // スポット
    { role: "DM", x: 50, y: 77 }, // エッジ回収
    { role: "CB", x: 56, y: 66 }, // 残り1
    { role: "CB", x: 44, y: 66 }, // 残り2
    { role: "GK", x: 50, y: 62 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 },
    { x: 58, y: 96 },
    { x: 42, y: 96 },
    { x: 60, y: 92 },
    { x: 38, y: 93 },
    { x: 34, y: 88 },
    { x: 49, y: 84 },
    { x: 50, y: 79 },
    { x: 56, y: 71 }, // 「残り」自陣CB(56,66)とのラベル重なりを避けるためy+3
    { x: 44, y: 71 }, // 「残り」自陣CB(44,66)とのラベル重なりを避けるためy+3
    { x: 50, y: 73 },
  ],
  shapes: [
    { id: "ckf11-zone", kind: "zoneRect", x: 38, y: 92, w: 20, h: 14, color: "#4fc3f7" },
    { id: "ckf11-label-zone", kind: "text", x: 38, y: 92, text: "ファー", size: "m", color: "#4fc3f7" },
  ],
  memo: "ファー狙いは奥へ流れるボールへの詰めがポイント（11人制）。",
};

const CK_SHORT_ATTACK_11: SetPiecePreset = {
  id: "ck-short-attack-11",
  kind: "ck",
  side: "attack",
  format: 11,
  label: "CK：ショート",
  desc: "ショートコーナーで数的優位を作り、崩してから折り返す（11人制）。",
  view: "boxatk",
  ball: { x: 97, y: 97 },
  slots: [
    { role: "RW", x: 97, y: 96 }, // キッカー
    { role: "CM", x: 88, y: 90 }, // ショート1
    { role: "RM", x: 80, y: 82 }, // ショート2
    { role: "ST", x: 58, y: 94 }, // ニア
    { role: "LW", x: 42, y: 93 }, // ファー
    { role: "AM", x: 50, y: 87 }, // スポット
    { role: "CF", x: 50, y: 91 }, // 中央
    { role: "DM", x: 50, y: 77 }, // エッジ回収
    { role: "CB", x: 56, y: 66 }, // 残り1
    { role: "CB", x: 44, y: 66 }, // 残り2
    { role: "GK", x: 50, y: 62 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 },
    { x: 90, y: 88 },
    { x: 58, y: 96 },
    { x: 42, y: 96 },
    { x: 60, y: 92 },
    { x: 40, y: 91 },
    { x: 49, y: 84 },
    { x: 50, y: 79 },
    { x: 56, y: 71 }, // 「残り」自陣CB(56,66)とのラベル重なりを避けるためy+3
    { x: 44, y: 71 }, // 「残り」自陣CB(44,66)とのラベル重なりを避けるためy+3
    { x: 50, y: 73 },
  ],
  memo: "ショートで相手を引き出し、空いたスペースへクロス（11人制）。",
};

const CK_ZONE_DEFENSE_11: SetPiecePreset = {
  id: "ck-zone-defense-11",
  kind: "ck",
  side: "defense",
  format: 11,
  label: "CK対応：ゾーン",
  desc: "ゾーン6＋マンマーク2＋ポスト番＋キッカー妨害＋GK（11人制）。面で守りつつ要注意の相手には人をつける。",
  view: "boxdef",
  ball: { x: 97, y: 3 },
  slots: [
    { role: "CB", x: 58, y: 4 }, // ポスト番
    { role: "CB", x: 50, y: 6 }, // ゾーン1
    { role: "LB", x: 44, y: 5 }, // ゾーン2
    { role: "RB", x: 62, y: 6 }, // ゾーン3
    { role: "DM", x: 46, y: 13 }, // ゾーン4
    { role: "CM", x: 54, y: 13 }, // ゾーン5
    { role: "LM", x: 38, y: 11 }, // ゾーン6
    { role: "RM", x: 62, y: 7 }, // マンマーク1（相手ニア＝opp3(60,5)近傍につく）
    { role: "AM", x: 33, y: 8 }, // マンマーク2（相手ファー）
    { role: "RWB", x: 88, y: 12 }, // キッカー妨害
    { role: "GK", x: 50, y: 2 }, // GK
  ],
  opps: [
    { x: 97, y: 3 }, // 相手キッカー
    { x: 85, y: 10 }, // 相手ショート1
    { x: 80, y: 15 }, // 相手ショート2
    { x: 60, y: 5 }, // 相手ニア ← マンマーク1
    { x: 40, y: 6 }, // 相手ファー ← マンマーク2
    { x: 50, y: 9 }, // 相手スポット
    { x: 53, y: 7 }, // 相手中央
    { x: 50, y: 16 }, // 相手エッジ回収
    { x: 56, y: 28 }, // 相手残り1
    { x: 44, y: 28 }, // 相手残り2
    { x: 50, y: 39 }, // 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  shapes: [
    { id: "ckzd11-six", kind: "zoneRect", x: 50, y: 6, w: 34, h: 10, color: "#81c784" },
    { id: "ckzd11-front", kind: "zoneRect", x: 46, y: 13, w: 26, h: 8, color: "#64b5f6" },
    { id: "ckzd11-label-six", kind: "text", x: 50, y: 6, text: "6yゾーン", size: "s" },
    { id: "ckzd11-label-front", kind: "text", x: 46, y: 13, text: "前列ゾーン", size: "s" },
    { id: "ckzd11-link1", kind: "link", actors: [7, "opp3"], color: "#e57373" },
    { id: "ckzd11-link2", kind: "link", actors: [8, "opp4"], color: "#e57373" },
  ],
  memo: "ゾーンで面を埋めつつ、危険な2枚だけ人につく（11人制）。",
};

const CK_MIX_DEFENSE_11: SetPiecePreset = {
  id: "ck-mix-defense-11",
  kind: "ck",
  side: "defense",
  format: 11,
  label: "CK対応：ミックス",
  desc: "ゾーン4＋マン4の併用＋ポスト番＋キッカー妨害＋GK（11人制）。核となる相手選手を厚く人につく。",
  view: "boxdef",
  ball: { x: 97, y: 3 },
  slots: [
    { role: "CB", x: 58, y: 4 }, // ポスト番
    { role: "CB", x: 50, y: 6 }, // ゾーン1
    { role: "LB", x: 42, y: 5 }, // ゾーン2
    { role: "DM", x: 50, y: 13 }, // ゾーン3
    { role: "CM", x: 58, y: 13 }, // ゾーン4
    { role: "RB", x: 60, y: 7 }, // マーク1（相手ニア）
    { role: "LM", x: 38, y: 7 }, // マーク2（相手ファー）
    { role: "RM", x: 49, y: 11 }, // マーク3（相手スポット）
    { role: "RWB", x: 70, y: 15 }, // マーク4（相手ショート）
    { role: "LWB", x: 88, y: 11 }, // キッカー妨害
    { role: "GK", x: 50, y: 2 }, // GK
  ],
  opps: [
    { x: 97, y: 3 }, // opp0: 相手キッカー
    { x: 85, y: 10 }, // opp1: 相手ショート1
    { x: 80, y: 15 }, // opp2: 相手ショート2
    { x: 60, y: 6 }, // opp3: 相手ニア ← マーク1
    { x: 38, y: 6 }, // opp4: 相手ファー ← マーク2
    { x: 49, y: 10 }, // opp5: 相手スポット ← マーク3
    { x: 70, y: 14 }, // opp6: 相手ショート援護 ← マーク4
    { x: 50, y: 18 }, // opp7: 相手エッジ
    { x: 56, y: 30 }, // opp8: 相手残り1
    { x: 44, y: 30 }, // opp9: 相手残り2
    { x: 50, y: 39 }, // opp10: 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  shapes: [
    { id: "ckmd11-zone", kind: "zoneRect", x: 50, y: 5, w: 30, h: 10, color: "#81c784" },
    { id: "ckmd11-label-zone", kind: "text", x: 50, y: 5, text: "ゾーン", size: "s" },
    { id: "ckmd11-label-mark", kind: "text", x: 55, y: 12, text: "マンマーク", size: "s" },
    { id: "ckmd11-link1", kind: "link", actors: [5, "opp3"], color: "#e57373" },
    { id: "ckmd11-link2", kind: "link", actors: [6, "opp4"], color: "#e57373" },
    { id: "ckmd11-link3", kind: "link", actors: [7, "opp5"], color: "#e57373" },
    { id: "ckmd11-link4", kind: "link", actors: [8, "opp6"], color: "#e57373" },
  ],
  memo: "要注意の相手4人へ人につき、残りはゾーンで面を守る（11人制）。",
};

/* --- FK（フリーキック）11人制 --- 壁=4枚 --- */

const FK_DIRECT_ATTACK_11: SetPiecePreset = {
  id: "fk-direct-attack-11",
  kind: "fk",
  side: "attack",
  format: 11,
  label: "FK：直接（壁越え）",
  desc: "壁の上を越すコースを作る（11人制）。キッカー2枚でどちらが蹴るか迷わせる。",
  view: "boxatk",
  ball: { x: 44, y: 76 },
  slots: [
    { role: "CM", x: 44, y: 76 }, // キッカー1
    { role: "AM", x: 48, y: 77 }, // キッカー2
    { role: "RM", x: 56, y: 85 }, // スクリーン（壁の視界を遮る）
    { role: "ST", x: 58, y: 95 }, // ニアポスト
    { role: "CF", x: 40, y: 95 }, // ファーポスト
    { role: "LW", x: 50, y: 90 }, // スポット
    { role: "RW", x: 46, y: 88 }, // 中央
    { role: "DM", x: 50, y: 70 }, // リバウンド
    { role: "CB", x: 56, y: 65 }, // エッジカバー1
    { role: "CB", x: 44, y: 65 }, // エッジカバー2
    { role: "GK", x: 50, y: 62 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 }, // 相手GK
    { x: 46, y: 85 }, // 壁1
    { x: 50, y: 85 }, // 壁2
    { x: 54, y: 85 }, // 壁3
    { x: 58, y: 85 }, // 壁4
    { x: 58, y: 93 }, // ニアポストマーク
    { x: 40, y: 93 }, // ファーポストマーク
    { x: 50, y: 73 }, // リバウンドケア
    { x: 50, y: 66 }, // 予備カバー1
    { x: 60, y: 70 }, // 予備カバー2
    { x: 40, y: 70 }, // 予備カバー3（boxatkビューの可視域端に配置してクリップを防ぐ）
  ],
  memo: "壁の外側からニアサイドを叩く形。キッカー2枚で駆け引きを作る（11人制）。",
};

const FK_CROSS_ATTACK_11: SetPiecePreset = {
  id: "fk-cross-attack-11",
  kind: "fk",
  side: "attack",
  format: 11,
  label: "FK：クロス攻撃",
  desc: "サイドからのFKをクロスとして送り込む（11人制）。CKに近い崩し方。",
  view: "boxatk",
  ball: { x: 90, y: 72 },
  slots: [
    { role: "RM", x: 90, y: 72 }, // キッカー
    { role: "ST", x: 60, y: 95 }, // ニア
    { role: "CF", x: 56, y: 90 }, // 中央
    { role: "LW", x: 40, y: 93 }, // ファー
    { role: "AM", x: 50, y: 87 }, // スポット
    { role: "CM", x: 80, y: 80 }, // ショート1
    { role: "RW", x: 72, y: 76 }, // ショート2
    { role: "DM", x: 50, y: 77 }, // エッジ回収
    { role: "CB", x: 56, y: 66 }, // 残り1
    { role: "CB", x: 44, y: 66 }, // 残り2
    { role: "GK", x: 50, y: 62 }, // 残り（boxatkビュー(y58-100)の可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 },
    { x: 58, y: 96 },
    { x: 42, y: 96 },
    { x: 61, y: 93 },
    { x: 56, y: 88 },
    { x: 39, y: 91 },
    { x: 49, y: 84 },
    { x: 82, y: 76 },
    { x: 50, y: 79 },
    { x: 56, y: 71 }, // 「残り」自陣CB(56,66)とのラベル重なりを避けるためy+3
    { x: 44, y: 71 }, // 「残り」自陣CB(44,66)とのラベル重なりを避けるためy+3
  ],
  memo: "CKに近い形。キッカーの質でニア/ファーを使い分ける（11人制）。",
};

const FK_WALL_DEFENSE_11: SetPiecePreset = {
  id: "fk-wall-defense-11",
  kind: "fk",
  side: "defense",
  format: 11,
  label: "FK対応：壁",
  desc: "壁4枚＋マンマークで直接コースと折返しの両方をケアする（11人制）。",
  view: "boxdef",
  ball: { x: 52, y: 22 },
  slots: [
    { role: "CB", x: 46, y: 16 }, // 壁1
    { role: "CB", x: 50, y: 16 }, // 壁2
    { role: "LB", x: 54, y: 16 }, // 壁3
    { role: "RB", x: 58, y: 16 }, // 壁4
    { role: "RWB", x: 60, y: 8 }, // マーク1（相手ニアポスト）
    { role: "DM", x: 42, y: 8 }, // マーク2（相手ファーポスト）
    { role: "CM", x: 50, y: 12 }, // マーク3（相手スポット）
    { role: "LM", x: 66, y: 20 }, // マーク4（相手ショート対応）
    { role: "RM", x: 33, y: 17 }, // カバー（こぼれ球）
    { role: "AM", x: 50, y: 28 }, // フリーカバー
    { role: "GK", x: 50, y: 2 }, // GK
  ],
  opps: [
    { x: 52, y: 22 }, // opp0: 相手キッカー
    { x: 58, y: 6 }, // opp1: 相手ニアポスト ← マーク1
    { x: 42, y: 6 }, // opp2: 相手ファーポスト ← マーク2
    { x: 50, y: 10 }, // opp3: 相手スポット ← マーク3
    { x: 66, y: 18 }, // opp4: 相手ショート ← マーク4
    { x: 50, y: 30 }, // opp5: 相手エッジ
    { x: 34, y: 18 }, // opp6: 相手予備1
    { x: 50, y: 37 }, // opp7: 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
    { x: 60, y: 24 }, // opp8: 相手予備2
    { x: 40, y: 24 }, // opp9: 相手予備3
    { x: 50, y: 14 }, // opp10: 相手予備4
  ],
  shapes: [
    { id: "fkwd11-wallline", kind: "link", actors: [0, 1, 2, 3], color: "#90a4ae" },
    { id: "fkwd11-label-wall", kind: "text", x: 52, y: 16, text: "壁", size: "s" },
    { id: "fkwd11-link1", kind: "link", actors: [4, "opp1"], color: "#e57373" },
    { id: "fkwd11-link2", kind: "link", actors: [5, "opp2"], color: "#e57373" },
    { id: "fkwd11-link3", kind: "link", actors: [6, "opp3"], color: "#e57373" },
    { id: "fkwd11-link4", kind: "link", actors: [7, "opp4"], color: "#e57373" },
  ],
  memo: "壁は入射角を消す位置。4枚のマークは折返しの脅威につく（11人制）。",
};

/* --- ゴールキック 11人制 --- */

const GK_BUILD_11: SetPiecePreset = {
  id: "gk-build-11",
  kind: "gk",
  side: "attack",
  format: 11,
  label: "ゴールキック：つなぐ",
  desc: "CBが開き、アンカーが間に降りてビルドアップする11人制の定石。",
  view: "full",
  ball: { x: 50, y: 6 },
  slots: [
    { role: "GK", x: 50, y: 6 },
    { role: "CB", x: 66, y: 16 }, // 右CB（開く）
    { role: "CB", x: 34, y: 16 }, // 左CB（開く）
    { role: "RB", x: 88, y: 28 }, // 右サイド高め
    { role: "LB", x: 12, y: 28 }, // 左サイド高め
    { role: "DM", x: 50, y: 22 }, // アンカー（間に降りる）
    { role: "CM", x: 64, y: 38 }, // 右インサイドハーフ
    { role: "CM", x: 36, y: 38 }, // 左インサイドハーフ
    { role: "RW", x: 82, y: 58 }, // 右ウイング
    { role: "LW", x: 18, y: 58 }, // 左ウイング
    { role: "ST", x: 50, y: 66 }, // 前線の出口
  ],
  opps: [
    { x: 60, y: 26 },
    { x: 40, y: 26 },
    { x: 50, y: 20 },
    { x: 85, y: 32 },
    { x: 15, y: 32 },
    { x: 66, y: 42 },
    { x: 34, y: 42 },
    { x: 80, y: 60 },
    { x: 20, y: 60 },
    { x: 50, y: 58 },
    { x: 50, y: 92 },
  ],
  shapes: [
    { id: "gkb11-label-anchor", kind: "text", x: 50, y: 22, text: "降りる", size: "s" },
    { id: "gkb11-label-cb", kind: "text", x: 66, y: 16, text: "開く", size: "s" },
  ],
  memo: "CBが開いてアンカーが降り、両インサイドハーフで数的優位を作る（11人制）。",
};

const GK_LONG_11: SetPiecePreset = {
  id: "gk-long-11",
  kind: "gk",
  side: "attack",
  format: 11,
  label: "ゴールキック：ロング",
  desc: "前線で競り、セカンドボールを回収する（11人制）。",
  view: "full",
  ball: { x: 50, y: 6 },
  slots: [
    { role: "GK", x: 50, y: 6 },
    { role: "ST", x: 50, y: 58 }, // 競り合いターゲット
    { role: "CF", x: 42, y: 50 }, // セカンド回収1
    { role: "RW", x: 64, y: 52 }, // セカンド回収2
    { role: "LW", x: 36, y: 52 }, // セカンド回収3
    { role: "CM", x: 56, y: 38 }, // セカンド回収4
    { role: "CM", x: 44, y: 38 }, // セカンド回収5
    { role: "DM", x: 50, y: 30 }, // セカンド回収6
    { role: "CB", x: 68, y: 16 },
    { role: "CB", x: 32, y: 16 },
    { role: "RB", x: 86, y: 24 },
  ],
  opps: [
    { x: 50, y: 54 },
    { x: 44, y: 50 },
    { x: 56, y: 50 },
    { x: 50, y: 38 },
    { x: 36, y: 36 },
    { x: 64, y: 36 },
    { x: 50, y: 28 },
    { x: 50, y: 22 },
    { x: 66, y: 18 },
    { x: 34, y: 18 },
    { x: 50, y: 94 },
  ],
  shapes: [{ id: "gkl11-label-target", kind: "text", x: 50, y: 58, text: "競る", size: "s" }],
  memo: "競り合いに強い選手を前線に。セカンドは中盤の厚みで回収する（11人制）。",
};

/* --- スローイン 11人制 --- */

const THROWIN_ADVANCE_11: SetPiecePreset = {
  id: "throwin-advance-11",
  kind: "throwin",
  side: "attack",
  format: 11,
  label: "スローイン：前進",
  desc: "投げ手→第1の受け手→第2の動きで前進する（11人制）。",
  view: "boxatk",
  ball: { x: 3, y: 72 },
  slots: [
    { role: "LB", x: 3, y: 72 }, // 投げ手
    { role: "CM", x: 15, y: 73 }, // 第1受け手
    { role: "LW", x: 9, y: 88 }, // 第2の動き（裏へ）
    { role: "DM", x: 28, y: 66 },
    { role: "CB", x: 22, y: 64 }, // boxatkビュー(y58-100)の可視域端に配置
    { role: "RM", x: 72, y: 78 },
    { role: "ST", x: 50, y: 92 },
    { role: "CF", x: 60, y: 90 }, // 前線サポート
    { role: "AM", x: 40, y: 80 }, // 中間サポート
    { role: "RB", x: 30, y: 62 }, // 深いカバー
    { role: "GK", x: 50, y: 61 }, // 残り（boxatkビューの可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 7, y: 69 },
    { x: 17, y: 76 },
    { x: 11, y: 85 },
    { x: 30, y: 64 },
    { x: 44, y: 64 },
    { x: 58, y: 70 },
    { x: 50, y: 65 },
    { x: 50, y: 96 }, // 相手GK
    { x: 66, y: 72 },
    { x: 38, y: 72 },
    { x: 50, y: 83 },
  ],
  memo: "第1受け手が壁になり、裏へ抜ける動きで前進する（11人制）。タッチライン際なのでboxatkビューに収まる。",
};

const THROWIN_KEEP_11: SetPiecePreset = {
  id: "throwin-keep-11",
  kind: "throwin",
  side: "attack",
  format: 11,
  label: "スローイン：キープ",
  desc: "無理に前進せず、外→中でボールを失わない形を作る（11人制）。",
  view: "boxdef",
  ball: { x: 97, y: 22 },
  slots: [
    { role: "RB", x: 97, y: 22 }, // 投げ手
    { role: "CM", x: 86, y: 23 }, // 近サポート1
    { role: "DM", x: 88, y: 14 }, // 近サポート2
    { role: "CB", x: 80, y: 10 },
    { role: "CB", x: 60, y: 8 },
    { role: "AM", x: 70, y: 30 },
    { role: "LW", x: 20, y: 34 },
    { role: "RM", x: 74, y: 16 }, // 近サポート3
    { role: "LB", x: 40, y: 20 }, // 逆サイドカバー
    { role: "CF", x: 30, y: 28 }, // 前進の出口
    { role: "GK", x: 50, y: 4 },
  ],
  opps: [
    { x: 94, y: 19 },
    { x: 84, y: 21 },
    { x: 86, y: 12 },
    { x: 76, y: 11 },
    { x: 66, y: 8 },
    { x: 68, y: 28 },
    { x: 50, y: 9 },
    { x: 76, y: 18 },
    { x: 56, y: 14 },
    { x: 40, y: 24 },
    { x: 50, y: 37 }, // 相手GK（boxdefビュー(y0-42)の可視域端に配置してクリップを防ぐ）
  ],
  memo: "複数のサポート角度を作り、奪われない距離感を保つ（11人制）。自陣タッチライン際なのでboxdefビューに収まる。",
};

/* --- PK 11人制 --- */

const PK_BASIC_11: SetPiecePreset = {
  id: "pk-basic-11",
  kind: "pk",
  side: "attack",
  format: 11,
  label: "PK：基本形",
  desc: "キッカー以外はペナルティエリア外で待機し、リバウンドに備える（11人制）。",
  view: "boxatk",
  ball: { x: 50, y: 88 },
  slots: [
    { role: "ST", x: 50, y: 80 }, // キッカー（助走位置）
    { role: "CF", x: 44, y: 79 }, // リバウンド1
    { role: "AM", x: 56, y: 79 }, // リバウンド2
    { role: "CM", x: 38, y: 74 },
    { role: "CM", x: 62, y: 74 },
    { role: "DM", x: 50, y: 70 },
    { role: "RM", x: 30, y: 70 },
    { role: "LM", x: 70, y: 70 },
    { role: "CB", x: 56, y: 64 },
    { role: "CB", x: 44, y: 64 },
    { role: "GK", x: 50, y: 63 }, // 残り（boxatkビューの可視域端に配置してクリップを防ぐ）
  ],
  opps: [
    { x: 50, y: 98 }, // 相手GK
    { x: 44, y: 80 },
    { x: 56, y: 80 },
    { x: 38, y: 76 },
    { x: 62, y: 76 },
    { x: 50, y: 72 },
    { x: 50, y: 59 }, // 「残り」自陣GK(50,63)とのラベル重なりを避けるためy-5(可視域[58,100]内を維持)
    { x: 50, y: 66 },
    { x: 32, y: 70 },
    { x: 68, y: 70 },
    { x: 50, y: 69 },
  ],
  memo: "エリア外で待機し、こぼれ球を狙う。キッカー以外はライン上に並ぶ（11人制）。",
};

/** 収録シナリオ一覧（8人制13種＋11人制13種＝26種。idは同一定石を"-11"サフィックスでペア化） */
export const SETPIECE_PRESETS: SetPiecePreset[] = [
  CK_NEAR_ATTACK,
  CK_FAR_ATTACK,
  CK_SHORT_ATTACK,
  CK_ZONE_DEFENSE,
  CK_MIX_DEFENSE,
  FK_DIRECT_ATTACK,
  FK_CROSS_ATTACK,
  FK_WALL_DEFENSE,
  GK_BUILD,
  GK_LONG,
  THROWIN_ADVANCE,
  THROWIN_KEEP,
  PK_BASIC,
  CK_NEAR_ATTACK_11,
  CK_FAR_ATTACK_11,
  CK_SHORT_ATTACK_11,
  CK_ZONE_DEFENSE_11,
  CK_MIX_DEFENSE_11,
  FK_DIRECT_ATTACK_11,
  FK_CROSS_ATTACK_11,
  FK_WALL_DEFENSE_11,
  GK_BUILD_11,
  GK_LONG_11,
  THROWIN_ADVANCE_11,
  THROWIN_KEEP_11,
  PK_BASIC_11,
];

/** 新規作成時の既定プリセット */
export const DEFAULT_SETPIECE_PRESET_ID = "ck-near-attack";

/**
 * プリセットIDから、同一定石の別format版（8⇔11人制）のIDを返す（"-11"サフィックス規約）。
 * 実在確認はしない（呼び出し側が getSetPiecePreset で存在チェックする）。SetPieceBar の
 * フォーマット切替（相方プリセットを探す）にのみ使用する。
 */
export function pairPresetId(id: string): string {
  return id.endsWith("-11") ? id.slice(0, -3) : `${id}-11`;
}

export function getSetPiecePreset(id: string): SetPiecePreset | undefined {
  return SETPIECE_PRESETS.find((p) => p.id === id);
}

/** shapes の深いクローン（BoardProvider.cloneTactic と同じ規約：arrow/link/hull はネストを複製） */
function cloneShape(s: Shape): Shape {
  if (s.kind === "arrow") return { ...s, p0: { ...s.p0 }, p1: { ...s.p1 }, c: { ...s.c } };
  if (s.kind === "link" || s.kind === "hull") return { ...s, actors: [...s.actors] };
  return { ...s };
}

/**
 * プリセットとチーム名簿から、セットプレー用の BoardState を組み立てる。
 * preset.slots（8人制=8枠／11人制=11枠）すべてに basePlayers から選手を割り当て
 * （空き枠を作らない）、ボール位置・相手トークン・初期図形・setPiece メタ情報を設定する。
 * basePlayers が空のときのみ pid は null になる。戦術ボード（playState）は11人制が既定
 * なので、slots の枠数はプリセット定義（preset.slots.length＝preset.format）にそのまま従う
 * ＝8人制/11人制で分岐する専用ロジックは持たない。
 * teamName/captain は戦術ボード（playState）側の名簿情報をそのまま渡す（未指定は null）。
 */
export function buildSetPieceState(
  preset: SetPiecePreset,
  basePlayers: Player[],
  teamName: string | null = null,
  captain: string | null = null
): BoardState {
  const n = basePlayers.length;
  const slots: Slot[] = preset.slots.map((s, i) => ({
    role: s.role,
    x: s.x,
    y: s.y,
    pid: n > 0 ? basePlayers[i % n].id : null,
  }));
  const opponents: OppToken[] = preset.opps.map((o, i) => ({
    x: o.x,
    y: o.y,
    label: String(i + 1),
  }));
  return {
    teamName,
    formation: preset.format === 11 ? "4-3-3" : "8人制 3-3-1",
    slots,
    players: basePlayers,
    ball: { ...preset.ball },
    moves: [],
    captain,
    holder: null,
    opponents,
    drawings: [],
    shapes: (preset.shapes ?? []).map(cloneShape),
    stepCount: 1,
    guides: {},
    pitchView: preset.view,
    setPiece: {
      kind: preset.kind,
      side: preset.side,
      presetId: preset.id,
      memo: preset.memo,
      format: preset.format,
    },
  };
}
