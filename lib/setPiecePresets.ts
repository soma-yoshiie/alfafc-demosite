// セットプレーデザイン画面のシナリオ定義テーブル。
// 8人制（スロット8枠＝GK+7）を前提に、CK/FK/ゴールキック/スローイン/PKの
// 代表的な定石を収録する。lib/formations.ts の FORMATIONS には絶対に混ぜない
// （スタメンUIに露出してしまうため）。

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
  label: string;
  desc: string;
  ball: Point;
  view: PitchViewMode;
  /** 8枠ぶんの初期配置（自チーム） */
  slots: { x: number; y: number; role: Position }[];
  /** 相手トークンの初期配置（8個。attack側は守る相手・defense側は攻める相手を表す） */
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
    { role: "RM", x: 85, y: 10 }, // キッカー妨害
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
    { role: "CB", x: 50, y: 64 }, // boxatkビュー(y58-100)の可視域端に配置
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

/** 収録シナリオ一覧 */
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
];

/** 新規作成時の既定プリセット */
export const DEFAULT_SETPIECE_PRESET_ID = "ck-near-attack";

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
 * 8枠すべてに basePlayers から選手を割り当て（空き枠を作らない）、ボール位置・相手トークン・
 * 初期図形・setPiece メタ情報を設定する。basePlayers が空のときのみ pid は null になる。
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
    formation: "8人制 3-3-1",
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
    },
  };
}
