"use client";

import { useState } from "react";
import type React from "react";
import { useBoard } from "./BoardProvider";
import { LAYOUT_KIND_ORDER, toLayoutKind, type LayoutKind, type PlacingRequest } from "@/lib/setPieceLayouts";
import { buildDeliveryMove, getDelivery, type DeliveryBend } from "@/lib/setPieceDelivery";
import { loadSpBarOpen, saveSpBarOpen } from "@/lib/storage";
import type { BallTrajectory, PitchViewMode } from "@/lib/types";
import PenControls from "./PenControls";
import ShapesBar from "./ShapesBar";
import {
  IconFilm,
  IconFlipH,
  IconGhost,
  IconMove,
  IconPen,
  IconRoute,
  IconShapes,
  IconTrash,
  IconUndo,
} from "./icons";

const KIND_LABEL: Record<LayoutKind, string> = {
  ck: "CK",
  fk: "FK",
  throwin: "スローイン",
};
const SIDE_LABEL: Record<"attack" | "defense", string> = { attack: "攻撃", defense: "守備" };
/** 旧種別（ゴールキック・PK）の要約表示用ラベル（レビュー指摘(1回目・minor)：
 * kindがnullのとき見出しの要約が空になり、何の文書を編集しているか分からなかった。
 * components/SheetManager.tsx の SP_KIND_LABEL と同じ内容） */
const LEGACY_KIND_LABEL: Record<"gk" | "pk", string> = { gk: "ゴールキック", pk: "PK" };

const FORMAT_ORDER: (8 | 11)[] = [8, 11];
const FORMAT_LABEL: Record<8 | 11, string> = { 8: "8人制", 11: "11人制" };

/** 「ボールの軌道」の3択の表示名（setpiece-redesign §4）。スローインだけ表示名を変える */
const TRAJ_ORDER: BallTrajectory[] = ["ground", "driven", "lofted"];
const TRAJ_LABEL: Record<BallTrajectory, string> = { ground: "グラウンダー", driven: "ライナー", lofted: "浮き球" };
const THROWIN_TRAJ_LABEL: Record<BallTrajectory, string> = { ground: "足元へ", driven: "速く", lofted: "山なり" };

/** 曲がり5段階（スローインでは出さない） */
const BEND_ORDER: DeliveryBend[] = [-2, -1, 0, 1, 2];
const BEND_LABEL: Record<DeliveryBend, string> = {
  [-2]: "左に大きく",
  [-1]: "左",
  0: "まっすぐ",
  1: "右",
  2: "右に大きく",
};

/** 「ボールの軌道」グループ見出しの要約（例「浮き球・右に曲げる」/「未設定」） */
function trajSummary(kind: LayoutKind, delivery: ReturnType<typeof getDelivery>): string {
  if (!delivery) return "未設定";
  const label = (kind === "throwin" ? THROWIN_TRAJ_LABEL : TRAJ_LABEL)[delivery.trajectory];
  if (kind === "throwin" || delivery.bend === 0) return label;
  return `${label}・${delivery.bend < 0 ? "左に曲げる" : "右に曲げる"}`;
}

/** 操作列のグループid（setpiece-redesign §5）。開閉状態のlocalStorageキーにもそのまま使う */
type SpGroupId = "kind" | "traj" | "view" | "draw";

/** グループの見出しボタン1つ分。実際の中身(spgroup-body)は呼び出し側が別に描画する
 * （PCは見出しを1行に横並び、開いたグループの中身をその下にまとめて積むため＝§5） */
function SpGroupHead({
  groupId,
  label,
  summary,
  open,
  onToggle,
}: {
  groupId: SpGroupId;
  label: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`spgroup-head${open ? " on" : ""}`}
      aria-expanded={open}
      aria-controls={`spgroup-body-${groupId}`}
      onClick={onToggle}
    >
      <span className="spgroup-name">{label}</span>
      {summary && <span className="spgroup-summary">{summary}</span>}
      <span className="spgroup-car" aria-hidden="true">
        {open ? "▾" : "▸"}
      </span>
    </button>
  );
}

/**
 * セットプレーデザイン画面の操作バー。setpiece-redesign §1・§2・§5・§7。
 * 種別(CK/FK/スローイン)×攻守×人数から「基本配置」を作る（旧プリセットのチップ行は廃止）。
 * 操作は4グループ（種類／ボールの軌道／表示／描く・動かす）にまとめ、グループごとに
 * 開閉できる（見出し行は横並び、開いた中身はその下に積む。開閉状態はlocalStorageに保存）。
 */
export interface SetPieceBarProps {
  onEnter3D?: () => void;
  /** 「動かす」3択（両方｜味方だけ｜相手だけ）。実体(.sp-lock-own/.sp-lock-opp)は
   * 親(SetPieceBoard)が持つ（setpiece-redesign §2） */
  moveMode?: "both" | "own" | "opp";
  onSetMoveMode?: (mode: "both" | "own" | "opp") => void;
  /** FK/スローインの位置を選ぶモードへ入る依頼を親(SetPieceBoard)へ送る
   * （種別チップ・「位置を選び直す」から。setpiece-redesign §3-1） */
  onStartPlacing?: (req: PlacingRequest) => void;
  /** 位置を選ぶモード中の依頼そのもの（SetPieceBoardが持つ）。種類チップ・要約の表示に使う
   * （レビュー指摘(1回目)：後述） */
  placing?: PlacingRequest | null;
}

export default function SetPieceBar({
  onEnter3D,
  moveMode = "both",
  onSetMoveMode,
  onStartPlacing,
  placing = null,
}: SetPieceBarProps = {}) {
  const board = useBoard();
  // 編集系コントロールはスタッフのみ（選手は共有セットプレーの閲覧のみ。FormationBarと同じ規約）
  const isCoach = board.auth.role === "coach";
  const meta = board.state.setPiece;

  // 種別チップ(CK/FK/スローイン)はckPieceKindの3つだけ。旧種別(ゴールキック/PK)の文書を
  // 開いたときはどのチップも選択されない状態でよい（setpiece-redesign §1）。
  // レビュー指摘(1回目・critical/major): 以前はuseStateで持っていたため、FK/スローインを
  // 選んで位置を選ぶモードへ入った後「やめる」でキャンセルすると、盤面(meta)は元の種別の
  // ままなのにチップ・要約だけFKに残ってしまい、以後FKチップも同値early-returnで無反応に
  // なっていた。meta（実際に適用済みの盤面）から導出する値へ戻し、位置を選ぶモード中だけ
  // その依頼(placing)の値を「仮表示」する形にすることで、キャンセルすれば自動的にmeta基準へ
  // 戻る（別状態を持たない＝ずれようがない）
  const kind: LayoutKind | null = placing ? placing.kind : toLayoutKind(meta?.kind);
  const side: "attack" | "defense" = placing ? placing.side : meta?.side ?? "attack";
  const format: 8 | 11 = placing ? placing.format : meta?.format ?? 8;

  // グループの開閉状態。初回（保存データなし）は「種類」だけ開く（setpiece-redesign §5）。
  // レビュー指摘(2回目・major): 「ボールの軌道」の開閉はBoardProvider側のspTrajOpenが
  // 単一の情報源（直下のコメント参照）のため、このopenMapは常にtrajキーを持たない状態に
  // 保つ（保存済みlocalStorageにtrajが含まれていても、この時点で取り除いてstateに残さない。
  // 以前はここでstoredをそのままstateへ入れていたため、mount時点のtraj値がこのコンポーネント
  // の再レンダーをまたいで古いまま残り、後述のtoggleGroupが書き戻すたびにBoardProvider側の
  // 最新のtraj値を上書きして消してしまっていた＝2つの書き手が存在する不具合の実体）
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const { traj: _traj, ...rest } = loadSpBarOpen();
    return Object.keys(rest).length > 0 ? rest : { kind: true };
  });
  // 「ボールの軌道」だけはBoardProvider側のspTrajOpenが単一の情報源（Pitch/DeliveryLayer
  // の表示可否も兼ねるため。setpiece-redesign §4）。他の3グループはこのコンポーネント内の
  // openMapのみで完結する
  const isOpen = (id: SpGroupId) => (id === "traj" ? board.spTrajOpen : !!openMap[id]);
  const toggleGroup = (id: SpGroupId) => {
    if (id === "traj") {
      board.setSpTrajOpen(!board.spTrajOpen);
      return;
    }
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      // レビュー指摘(1回目→2回目で再修正): 保存はlocalStorageを読み直してからマージする。
      // next（=openMap）はtrajキーを一切持たないため、ここでBoardProvider側が書いた最新の
      // trajをそのまま素通りさせる（以前はnextにmount時点の古いtrajが混ざっており、それが
      // 読み直した最新値を後勝ちで上書きして消してしまっていた＝受け入れ基準7違反）
      saveSpBarOpen({ ...loadSpBarOpen(), ...next });
      return next;
    });
  };

  if (!isCoach) return null;

  // ペン・図形は編集/アニメ両モード共通（FormationBarと同じ文法・同じProvider state）
  const penBtn = (
    <button
      className={`fmini pen${board.penMode ? " on" : ""}`}
      title="ペンでピッチに描き込む"
      onClick={() => board.setPenMode(!board.penMode)}
    >
      <IconPen />
      <span>ペン</span>
    </button>
  );
  const shapesBtn = (
    <button
      className={`fmini shapes${board.shapesOpen ? " on" : ""}`}
      title="図形（ゾーン・矢印・テキスト等）をピッチに配置"
      onClick={() => board.setShapesOpen(!board.shapesOpen)}
    >
      <IconShapes />
      <span>図形</span>
    </button>
  );
  const drawPanels = (
    <>
      {board.penMode && (
        <div className="fbarpen">
          <PenControls />
        </div>
      )}
      {board.shapesOpen && (
        <div className="fbarshapes">
          <ShapesBar />
        </div>
      )}
    </>
  );

  // 「動かす」3択（両方｜味方だけ｜相手だけ）。編集・アニメ両モード共通で使う（§2）
  const moveSummary = moveMode === "opp" ? "相手だけ" : moveMode === "own" ? "味方だけ" : "";
  const moveGroup = (
    <div className="spmovegrp">
      <span className="spbar-label">動かす</span>
      <div className="spmove3" role="group" aria-label="動かす対象">
        <button
          type="button"
          className={`spmovebtn${moveMode === "both" ? " on" : ""}`}
          onClick={() => onSetMoveMode?.("both")}
        >
          両方
        </button>
        <button
          type="button"
          className={`spmovebtn${moveMode === "own" ? " on" : ""}`}
          onClick={() => onSetMoveMode?.("own")}
        >
          味方だけ
        </button>
        <button
          type="button"
          className={`spmovebtn${moveMode === "opp" ? " on" : ""}`}
          onClick={() => onSetMoveMode?.("opp")}
        >
          相手だけ
        </button>
      </div>
    </div>
  );

  // 表示範囲は3択（全体｜ゴール前｜PA拡大。setpiece-redesign §6）。どちらのゴールかは
  // 攻守(meta.side)ではなく「ボールに近い側」で決める（ボールy≥50→相手ゴール側）。
  // 旧実装はmeta.side基準だったが、それだと守備の配置でもボールを相手陣に置いた場合などに
  // 実際のボール位置と食い違う（旧プリセット「スローイン：キープ」のような例も、ボール位置
  // 基準にすることで個別のpresetId分岐なしに解決する）。
  // （ゴールキックは見取り図がピッチ全体に及ぶためズーム変種を持たない＝出さない）。
  // レビュー指摘(1回目): 表示範囲3択・左右反転・.spbar-presets/spview-*マーカーはアニメ中の
  // 「表示」グループにも要る（仕様§5-3）ため、アニメ判定より前で計算してどちらの分岐からも
  // 使えるようにする
  const showViewRange = meta != null && meta.kind !== "gk";
  const nearAttackGoal = board.state.ball.y >= 50;
  const goalView: PitchViewMode = nearAttackGoal ? "boxatk" : "boxdef";
  const paView: PitchViewMode = nearAttackGoal ? "paatk" : "padef";
  const view = board.state.pitchView;
  // 旧仕様の pitchView:"half" が残った文書は「ゴール前」扱いにし、表示を壊さず
  // 選び直せるようにする（half自体はもう選択肢に出さない）
  type ViewRange = "full" | "goal" | "pa";
  const viewRange: ViewRange =
    view === "paatk" || view === "padef" ? "pa" :
    view === "half" || view === "boxatk" || view === "boxdef" ? "goal" :
    "full";
  const viewRangeControls = showViewRange ? (
    <div className="spview3" role="group" aria-label="表示範囲">
      <button
        type="button"
        className={`spviewbtn${viewRange === "full" ? " on" : ""}`}
        onClick={() => {
          board.setPitchView("full");
          board.toast("フルコート表示");
        }}
      >
        全体
      </button>
      <button
        type="button"
        className={`spviewbtn${viewRange === "goal" ? " on" : ""}`}
        onClick={() => {
          board.setPitchView(goalView);
          board.toast("ゴール前表示");
        }}
      >
        ゴール前
      </button>
      <button
        type="button"
        className={`spviewbtn${viewRange === "pa" ? " on" : ""}`}
        onClick={() => {
          board.setPitchView(paView);
          // レビュー指摘(1回目・minor): CKの既定配置(ボールx=99)のようにPA拡大の可視x範囲
          // (14〜86)の外にボールがある場合、ボールが消えた理由が分からない。一言添える
          const bx = board.state.ball.x;
          board.toast(bx < 14 || bx > 86 ? "PA拡大表示（ボールは枠の外です）" : "PA拡大表示");
          // 統括の最終調整: ここにあった自動スクロール（ピッチの下端を下部タブに合わせる）は外した。
          // PC では非表示の .mtab を基準にして毎回最下部まで飛び、スマホでも PA 拡大でいちばん
          // 見たいゴール側（上端）が操作列の下に隠れていた。スクロール位置はそのままにする
        }}
      >
        PA拡大
      </button>
    </div>
  ) : null;
  const flipButton = (
    <button
      className="fmini"
      title="配置を左右反転する"
      onClick={() => {
        board.flipSetPieceX();
        board.toast("左右反転しました");
      }}
    >
      <IconFlipH />
      <span>左右反転</span>
    </button>
  );
  // .spbar-presets + spview-*マーカーは、Pitch.tsx側のCSS(:has()で.spapp越しに検知)が
  // 表示範囲(boxatk/boxdef)に応じてセンターライン等を隠したり、PC側でピッチのアスペクト比を
  // 変えたりするために使う既存の仕組み（globals.css）。「表示」グループが閉じていても
  // ピッチの見た目自体は変わってはいけないため、開閉に関わらず常にマウントされるこの
  // 最上位コンテナへ付け続ける（グループの中身=spgroup-bodyだけを開閉に応じて出し入れする）。
  // PA拡大(paatk/padef)はyの変換がboxatk/boxdefと同じなので、そのままspview-box系の
  // マーカーも付けてセンターライン等の非表示・PCのアスペクト比を共用し、追加のspview-pa系
  // マーカーだけを足してCSS側のscale変形・トークン等の逆倍率を別途トリガーする（setpiece-redesign §6）。
  // レビュー指摘(1回目): 旧実装はアニメ分岐(spgroups-anim)のルート要素にこのマーカーが
  // 付いておらず、アニメ中はPA拡大の逆倍率・PCのアスペクト比補正・センターライン等の非表示が
  // 全部外れていた。アニメ・編集どちらのルート要素にも同じマーカーを付けて解決する
  const viewMarkerClass =
    view === "boxatk" ? " spview-box spview-boxatk" :
    view === "boxdef" ? " spview-box spview-boxdef" :
    view === "paatk" ? " spview-box spview-boxatk spview-pa" :
    view === "padef" ? " spview-box spview-boxdef spview-pa" :
    "";

  // アニメ編集中はプリセット差し替え(盤面を丸ごと置換=進行中のアニメも消える)を隠し、
  // 代わりに戦術ボード(FormationBar)のアニメ中と同じ描画コントロール一式を出す
  // （旧実装はここでバーごと消していたため「軌道を描く・図示するコマンドが無い」状態だった）。
  // 「表示」「描く・動かす」の2グループのみ（種類/ボールの軌道の切替はアニメ中は不可）
  if (board.mode === "anim") {
    const animViewParts: string[] = [];
    if (board.showPaths) animViewParts.push("ルート表示");
    if (board.showDrawings) animViewParts.push("描き込み");
    if (board.showGhost) animViewParts.push("残像");
    return (
      <>
        <div className={`spgroups spgroups-anim spbar-presets${viewMarkerClass}`}>
          <div className="spgroups-head">
            <SpGroupHead
              groupId="view"
              label="表示"
              summary={animViewParts.join("・")}
              open={isOpen("view")}
              onToggle={() => toggleGroup("view")}
            />
            <SpGroupHead
              groupId="draw"
              label="描く・動かす"
              summary={moveSummary}
              open={isOpen("draw")}
              onToggle={() => toggleGroup("draw")}
            />
          </div>
          {isOpen("view") && (
            <div className="fbar spgroup-body" id="spgroup-body-view">
              {/* レビュー指摘(1回目): 仕様§5-3「表示：表示範囲(§6)・左右反転。アニメ中は
                  ここにルート表示/描き込み/残像」どおり、表示範囲3択・左右反転を追加する
                  （盤面を置き換えない操作なのでアニメ中でも安全） */}
              {viewRangeControls}
              {flipButton}
              <button
                className={`fmini${board.showPaths ? " on" : ""}`}
                title="ルート矢印の表示/非表示"
                onClick={() => board.setShowPaths(!board.showPaths)}
              >
                <IconRoute />
                <span>ルート表示</span>
              </button>
              <button
                className={`fmini${board.showDrawings ? " on" : ""}`}
                title="ペン・図形の描き込みの表示/非表示"
                onClick={() => {
                  const next = !board.showDrawings;
                  board.setShowDrawings(next);
                  if (!next) {
                    board.setSelShape(null);
                    board.setSelStroke(null);
                  }
                }}
              >
                <IconShapes />
                <span>描き込み</span>
              </button>
              <button
                className={`fmini${board.showGhost ? " on" : ""}`}
                title="残像（前の場面の開始位置）の表示/非表示"
                onClick={() => board.setShowGhost(!board.showGhost)}
              >
                <IconGhost />
                <span>残像</span>
              </button>
            </div>
          )}
          {isOpen("draw") && (
            <div className="fbar spgroup-body" id="spgroup-body-draw">
              {penBtn}
              {shapesBtn}
              {moveGroup}
              {onEnter3D && (
                <button
                  type="button"
                  className="fmini sp3dtoggle"
                  title="アニメーションを3Dで再生"
                  onClick={onEnter3D}
                >
                  <span>3D</span>
                </button>
              )}
            </div>
          )}
        </div>
        {drawPanels}
      </>
    );
  }

  // 「配置を作り直します。いまの配置と動きは消えます。よろしいですか？」の確認が要るか
  // （moves／描き込み／図形が1つでもある、または保存済みの文書を開いている＝§1）
  const isDirty = (): boolean => {
    const s = board.state;
    return (
      s.moves.length > 0 ||
      (s.drawings?.length ?? 0) > 0 ||
      (s.shapes?.length ?? 0) > 0 ||
      board.currentSetPieceId != null ||
      // レビュー指摘(1回目): トークンをドラッグしただけの手入れはmoves/drawings/shapesに
      // 現れないため、生成直後の座標からの差分も見る（isSetPieceLayoutEdited）
      board.isSetPieceLayoutEdited()
    );
  };

  // 種別/攻守/人数チップの共通ハンドラ。基本配置を作り直す＝手が入っていれば確認する。
  // 種別が未選択(null＝旧gk/pk文書)のままside/formatだけ変える分には何も適用しない。
  // FK/スローインへ切り替えた直後（または起点(origin)をまだ持たない文書）は、その場で
  // 基本配置を作らず位置を選ぶモードへ入る（setpiece-redesign §3-1）。既に起点があれば
  // side/formatだけの変更として、その起点のまま作り直す
  const applyChange = (nextKind: LayoutKind | null, nextSide: "attack" | "defense", nextFormat: 8 | 11) => {
    // レビュー指摘(1回目・major): 同値のときに常にreturnしていたため、選択済みの種別チップを
    // 押しても何も起きず、旧CKプリセット文書（ゾーン・「ニア」等の図形付き）を「図形なしの
    // 基本配置」に作り直す手段が無かった（受け入れ基準1）。meta.presetIdが残っている
    // （＝旧プリセット由来）ときは値が同じでも素通りさせず作り直す。新規生成した文書は
    // 常にpresetId:undefinedのため、この場合は従来どおり同値クリックは無反応のまま
    const noChange = nextKind === kind && nextSide === side && nextFormat === format;
    if (noChange && meta?.presetId == null) return;
    const needsPlacing =
      (nextKind === "fk" || nextKind === "throwin") && (nextKind !== kind || meta?.origin == null);
    const commit = () => {
      if (!nextKind) return;
      if (needsPlacing) {
        onStartPlacing?.({ kind: nextKind, side: nextSide, format: nextFormat, action: "apply" });
        return;
      }
      // レビュー指摘(1回目・major): 攻守だけを切り替えたとき起点(origin)を実座標のまま渡すと
      // （buildSetPieceLayoutは常に「攻撃視点」の正準空間へ変換してから生成するため）、
      // 守備の配置なのにボールが相手ゴール前に残ってしまう。攻守が変わるときは上下反転
      // （y→100-y。canonicalToLayoutの向きと合わせる）してから渡す
      const origin =
        meta?.origin && nextSide !== side ? { x: meta.origin.x, y: 100 - meta.origin.y } : meta?.origin;
      board.applySetPieceLayout({ kind: nextKind, side: nextSide, format: nextFormat, origin });
    };
    if (nextKind && isDirty()) {
      if (window.confirm("配置を作り直します。いまの配置と動きは消えます。よろしいですか？")) commit();
      return;
    }
    commit();
  };

  // 「位置を選び直す」：種別・攻守・人数はそのままにFK/スローインの起点だけ選び直す（§3-1）
  const handleReplaceOrigin = () => {
    if (kind !== "fk" && kind !== "throwin") return;
    const k = kind;
    const commit = () => onStartPlacing?.({ kind: k, side, format, action: "apply" });
    if (isDirty()) {
      if (window.confirm("配置を作り直します。いまの配置と動きは消えます。よろしいですか？")) commit();
      return;
    }
    commit();
  };

  // 種類グループの要約（例「FK・攻撃・11人制」）。旧種別(kind未選択)のときは要約を出さない
  // 旧種別(gk/pk)文書は要約に旧ラベルを出す（レビュー指摘(1回目・minor)）
  const legacyKind = !kind && meta && (meta.kind === "gk" || meta.kind === "pk") ? meta.kind : null;
  const kindSummary = kind
    ? `${KIND_LABEL[kind]}・${SIDE_LABEL[side]}・${FORMAT_LABEL[format]}`
    : legacyKind
    ? `${LEGACY_KIND_LABEL[legacyKind]}・${SIDE_LABEL[side]}・${FORMAT_LABEL[format]}`
    : "";
  // 表示グループの要約（例「ゴール前」）
  const viewSummary = viewRange === "pa" ? "PA拡大" : viewRange === "goal" ? "ゴール前" : "全体";

  // 「ボールの軌道」グループ（setpiece-redesign §4）。対象はCK/FK/スローイン＝kindが
  // 決まっている間だけ出す（旧gk/pk文書はkind=nullのため出さない）
  const delivery = kind ? getDelivery(board.state) : null;
  const handleCreateDelivery = () => {
    const target = side === "attack" ? { x: 50, y: 92 } : { x: 50, y: 8 };
    board.setSetPieceDelivery(
      buildDeliveryMove({ from: board.state.ball, target, trajectory: "ground", bend: 0, slots: board.state.slots })
    );
  };
  const setTraj = (traj: BallTrajectory) => {
    if (!delivery) return;
    board.setSetPieceDelivery(
      buildDeliveryMove({
        from: board.state.ball,
        target: delivery.target,
        trajectory: traj,
        bend: kind === "throwin" ? 0 : delivery.bend,
        slots: board.state.slots,
      })
    );
  };
  const setBend = (bend: DeliveryBend) => {
    if (!delivery) return;
    board.setSetPieceDelivery(
      buildDeliveryMove({
        from: board.state.ball,
        target: delivery.target,
        trajectory: delivery.trajectory,
        bend,
        slots: board.state.slots,
      })
    );
  };
  const trajContent: React.ReactNode | null = kind ? (
    !delivery ? (
      <>
        <span className="spbar-label">まだ軌道がありません</span>
        <button className="fmini" title="ボールの軌道を作る" onClick={handleCreateDelivery}>
          <IconRoute />
          <span>軌道を作る</span>
        </button>
      </>
    ) : (
      <>
        <span className="spbar-label">軌道</span>
        {TRAJ_ORDER.map((t) => (
          <button
            key={t}
            className={`chip${delivery.trajectory === t ? " on" : ""}`}
            onClick={() => setTraj(t)}
          >
            {(kind === "throwin" ? THROWIN_TRAJ_LABEL : TRAJ_LABEL)[t]}
          </button>
        ))}
        {kind !== "throwin" && (
          <>
            <span className="spbar-label">曲がり</span>
            {BEND_ORDER.map((b) => (
              <button key={b} className={`chip${delivery.bend === b ? " on" : ""}`} onClick={() => setBend(b)}>
                {BEND_LABEL[b]}
              </button>
            ))}
          </>
        )}
        <button className="fmini" title="ボールの軌道を消す" onClick={() => board.setSetPieceDelivery(null)}>
          <IconTrash />
          <span>消す</span>
        </button>
      </>
    )
  ) : null;
  const trajGroupSummary = kind ? trajSummary(kind, delivery) : "";

  return (
    <>
      <div className={`spgroups spbar-presets${viewMarkerClass}`}>
        <div className="spgroups-head">
          <SpGroupHead
            groupId="kind"
            label="種類"
            summary={kindSummary}
            open={isOpen("kind")}
            onToggle={() => toggleGroup("kind")}
          />
          {trajContent && (
            <SpGroupHead
              groupId="traj"
              label="ボールの軌道"
              summary={trajGroupSummary}
              open={isOpen("traj")}
              onToggle={() => toggleGroup("traj")}
            />
          )}
          <SpGroupHead
            groupId="view"
            label="表示"
            summary={viewSummary}
            open={isOpen("view")}
            onToggle={() => toggleGroup("view")}
          />
          <SpGroupHead
            groupId="draw"
            label="描く・動かす"
            summary={moveSummary}
            open={isOpen("draw")}
            onToggle={() => toggleGroup("draw")}
          />
        </div>

        {isOpen("kind") && (
          <div className="fbar spgroup-body" id="spgroup-body-kind">
            {legacyKind && (
              <span className="spbar-label">
                {LEGACY_KIND_LABEL[legacyKind]}：この種別は新しい作り方の対象外です
              </span>
            )}
            {LAYOUT_KIND_ORDER.map((k) => (
              <button
                key={k}
                className={`chip${kind === k ? " on" : ""}`}
                onClick={() => applyChange(k, side, format)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
            {/* レビュー指摘(1回目・minor): ラベルと選択肢を別々の要素のまま並べると、
                スマホで折り返したときにラベルが対応する選択肢から切り離される（「攻守」の
                直後に攻撃だけ来て、守備は次行の「人数」の直前に来てしまう）。
                1つの折り返し単位(.spkindgrp)でくくる */}
            <span className="spkindgrp">
              <span className="spbar-label">攻守</span>
              <button
                className={`chip${side === "attack" ? " on" : ""}`}
                onClick={() => applyChange(kind, "attack", format)}
              >
                攻撃
              </button>
              <button
                className={`chip${side === "defense" ? " on" : ""}`}
                onClick={() => applyChange(kind, "defense", format)}
              >
                守備
              </button>
            </span>
            <span className="spkindgrp">
              <span className="spbar-label">人数</span>
              {FORMAT_ORDER.map((f) => (
                <button
                  key={f}
                  className={`chip${format === f ? " on" : ""}`}
                  onClick={() => applyChange(kind, side, f)}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </span>
            {(kind === "fk" || kind === "throwin") && (
              <button className="fmini" title="位置を選び直す" onClick={handleReplaceOrigin}>
                <IconMove />
                <span>位置を選び直す</span>
              </button>
            )}
            {board.canRestoreSetPiece && (
              <button className="fmini" title="直前の配置に戻す" onClick={board.restoreSetPieceSnapshot}>
                <IconUndo />
                <span>元に戻す</span>
              </button>
            )}
          </div>
        )}

        {trajContent && isOpen("traj") && (
          <div className="fbar spgroup-body" id="spgroup-body-traj">
            {trajContent}
          </div>
        )}

        {isOpen("view") && (
          <div className="fbar spgroup-body" id="spgroup-body-view">
            {viewRangeControls}
            {flipButton}
          </div>
        )}

        {isOpen("draw") && (
          <div className="fbar spgroup-body" id="spgroup-body-draw">
            <button
              className="fmini opp"
              title="相手チームのトークンを配置"
              onClick={() => board.addOpponent()}
            >
              <span className="oppdot" />
              <span>＋相手</span>
            </button>
            {penBtn}
            {shapesBtn}
            <button
              className="fmini"
              title="動きのアニメーションを作成（トークンをドラッグして軌道を記録）"
              onClick={board.openStudio}
            >
              <IconFilm />
              <span>アニメ</span>
            </button>
            {moveGroup}
            {onEnter3D && (
              <button
                type="button"
                className="fmini sp3dtoggle"
                title="配置を3Dで確認"
                onClick={onEnter3D}
              >
                <span>3D</span>
              </button>
            )}
          </div>
        )}
      </div>
      {drawPanels}
    </>
  );
}
