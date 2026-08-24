"use client";

import { useEffect, useState } from "react";
import { useBoard } from "./BoardProvider";
import {
  DEFAULT_SETPIECE_PRESET_ID,
  SETPIECE_PRESETS,
  getSetPiecePreset,
  pairPresetId,
} from "@/lib/setPiecePresets";
import type { PitchViewMode, SetPieceKind } from "@/lib/types";
import { IconFlipH, IconHalfPitch, IconPlusSquare, IconUndo } from "./icons";

const KIND_ORDER: SetPieceKind[] = ["ck", "fk", "gk", "throwin", "pk"];
const KIND_LABEL: Record<SetPieceKind, string> = {
  ck: "CK",
  fk: "FK",
  gk: "ゴールキック",
  throwin: "スローイン",
  pk: "PK",
};

const FORMAT_ORDER: (8 | 11)[] = [8, 11];
const FORMAT_LABEL: Record<8 | 11, string> = { 8: "8人制", 11: "11人制" };

/**
 * セットプレーデザイン画面の操作バー。FormationBar.tsx が雛形だが、フォーメーション選択の
 * 代わりに「種別(CK/FK/…)＋攻守」でプリセットを絞り込み、選んだプリセットを盤面へ適用する。
 * 上段=種別チップ＋攻守トグル（絞り込みのみ・盤面は変えない）、
 * 下段=絞り込み後のプリセットチップ（選択で即適用）＋左右反転／新規作成／ズーム(種目別)⇔フル表示切替。
 */
export default function SetPieceBar({ onEnter3D }: { onEnter3D?: () => void } = {}) {
  const board = useBoard();
  // 編集系コントロールはスタッフのみ（選手は共有セットプレーの閲覧のみ。FormationBarと同じ規約）
  const isCoach = board.auth.role === "coach";
  const meta = board.state.setPiece;

  const [kind, setKind] = useState<SetPieceKind>(meta?.kind ?? "ck");
  const [side, setSide] = useState<"attack" | "defense">(meta?.side ?? "attack");
  const [format, setFormat] = useState<8 | 11>(meta?.format ?? 8);
  // プリセット適用の直前状態を1件だけ覚えておき、「元に戻す」で戻せるようにする
  // （HYDRATE置換にはreducer側の汎用履歴が無いため、バー側の最小限の安全策として持つ）
  const [prevPresetId, setPrevPresetId] = useState<string | null>(null);

  // 別のセットプレー文書を読み込んだとき(currentSetPieceIdが変わったとき)は、
  // 絞り込みチップをその文書の種別/攻守/人数へ合わせ、Undo履歴も持ち越さない
  // （レンダー中のstate調整。Reactの公式パターンに従いuseRefではなくuseStateで前回値を追跡する）
  const [syncedId, setSyncedId] = useState<string | null>(board.currentSetPieceId);
  if (syncedId !== board.currentSetPieceId) {
    setSyncedId(board.currentSetPieceId);
    if (meta) {
      setKind(meta.kind);
      setSide(meta.side);
      setFormat(meta.format ?? 8);
    }
    setPrevPresetId(null);
  }

  // プリセット適用(applySetPiecePreset)・共有取込(applyImport)はcurrentSetPieceIdを
  // 変えないまま種別/攻守/人数が変わりうるため、絞り込みチップをmeta(kind/side/format)自体の
  // 変化からも同期する（syncedIdの分岐だけでは取りこぼす）
  useEffect(() => {
    if (!meta) return;
    setKind(meta.kind);
    setSide(meta.side);
    setFormat(meta.format ?? 8);
  }, [meta?.kind, meta?.side, meta?.format]);

  // アニメ編集中はプリセット差し替え(盤面を丸ごと置換=進行中のアニメも消える)を隠す。
  // 既存の戦術ボード(FormationBar)でも同じ理由でフォーメーション変更等をアニメ中は隠している
  if (!isCoach || board.mode === "anim") return null;

  const list = SETPIECE_PRESETS.filter((p) => p.kind === kind && p.side === side && p.format === format);
  const currentPresetId = meta?.presetId ?? null;

  // 表示切替は「ズーム(種目別)/フル」の2択。ズーム先はプリセット定義(SETPIECE_PRESETS)の
  // view を優先する（例:「スローイン：キープ」はside:attackだがview:boxdefのため、
  // side基準で決めるとboxatkになり配置と矛盾して全トークンが盤外に消えてしまう）。
  // プリセットが見つからない場合（プリセット未適用の手動編集等）のみ、従来どおり
  // side基準（attack→boxatk・defense→boxdef）にフォールバックする。
  // （ゴールキックは見取り図がピッチ全体に及ぶためズーム変種を持たない＝ズーム不可）。
  const presetDef = currentPresetId ? getSetPiecePreset(currentPresetId) : undefined;
  const zoomView: PitchViewMode | null =
    meta && meta.kind !== "gk"
      ? presetDef?.view ?? (meta.side === "defense" ? "boxdef" : "boxatk")
      : null;
  const view = board.state.pitchView;
  // 旧仕様の pitchView:"half" が残った文書も「ズーム中」として扱い、表示を壊さず
  // フルへ戻せるようにする（half自体はもう選択肢に出さない）
  const isZoomed = view === "half" || view === "boxatk" || view === "boxdef";

  const applyPreset = (id: string) => {
    if (id === currentPresetId) return;
    setPrevPresetId(currentPresetId);
    board.applySetPiecePreset(id);
  };

  // 8人制⇔11人制トグル。現在のプリセットの相方format版（idの"-11"サフィックス規約）を
  // 適用する。相方が無い、または現在プリセット未適用のときは、その種別/攻守×切替先formatの
  // 先頭プリセットを使う（新規作成ボタンの list[0] と同じ考え方）。
  const applyFormat = (target: 8 | 11) => {
    if (target === format) return;
    let nextId: string | undefined;
    if (currentPresetId) {
      const cur = getSetPiecePreset(currentPresetId);
      const pair = getSetPiecePreset(pairPresetId(currentPresetId));
      if (pair && pair.format === target) {
        nextId = pair.id;
      } else if (cur) {
        nextId = SETPIECE_PRESETS.find(
          (p) => p.kind === cur.kind && p.side === cur.side && p.format === target
        )?.id;
      }
    }
    if (!nextId) {
      nextId = SETPIECE_PRESETS.find(
        (p) => p.kind === kind && p.side === side && p.format === target
      )?.id;
    }
    if (!nextId) return;
    setPrevPresetId(currentPresetId);
    setFormat(target);
    board.applySetPiecePreset(nextId);
  };

  return (
    <>
      <div className="fbar spbar-kind">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            className={`chip${kind === k ? " on" : ""}`}
            onClick={() => setKind(k)}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
        <span className="spbar-label">攻守</span>
        <button
          className={`chip${side === "attack" ? " on" : ""}`}
          onClick={() => setSide("attack")}
        >
          攻撃
        </button>
        <button
          className={`chip${side === "defense" ? " on" : ""}`}
          onClick={() => setSide("defense")}
        >
          守備
        </button>
        <span className="spbar-label">人数</span>
        {FORMAT_ORDER.map((f) => (
          <button
            key={f}
            className={`chip${format === f ? " on" : ""}`}
            onClick={() => applyFormat(f)}
          >
            {FORMAT_LABEL[f]}
          </button>
        ))}
      </div>
      <div
        className={`fbar spbar-presets${
          view === "boxatk" ? " spview-box spview-boxatk" :
          view === "boxdef" ? " spview-box spview-boxdef" :
          ""
        }`}
      >
        {list.length === 0 ? (
          <div className="spbar-empty">このタイプのプリセットはまだありません</div>
        ) : (
          list.map((p) => (
            <button
              key={p.id}
              className={`chip${currentPresetId === p.id ? " on" : ""}`}
              title={p.desc}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))
        )}
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
        {prevPresetId && prevPresetId !== currentPresetId && (
          <button
            className="fmini"
            title="直前の配置に戻す"
            onClick={() => {
              const target = prevPresetId;
              setPrevPresetId(currentPresetId);
              board.applySetPiecePreset(target);
            }}
          >
            <IconUndo />
            <span>元に戻す</span>
          </button>
        )}
        <button
          className="fmini"
          title="保存中のIDを外し、現在選択中の種別/攻守で新しいセットプレーを作成"
          onClick={() => {
            setPrevPresetId(null);
            board.newSetPiece(list[0]?.id ?? DEFAULT_SETPIECE_PRESET_ID);
          }}
        >
          <IconPlusSquare />
          <span>新規作成</span>
        </button>
        {(isZoomed || zoomView != null) && (
          <button
            className={`fmini zoom${isZoomed ? " on" : ""}`}
            title={zoomView ? "該当エリアを拡大表示" : "フルコート表示に戻す"}
            onClick={() => {
              const next = isZoomed ? "full" : zoomView ?? "full";
              board.setPitchView(next);
              board.toast(next === "full" ? "フルコート表示" : "ズーム表示");
            }}
          >
            <IconHalfPitch />
            <span>ズーム</span>
          </button>
        )}
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
    </>
  );
}
