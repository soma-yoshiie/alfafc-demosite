"use client";

import { useEffect, useState } from "react";
import { useBoard } from "./BoardProvider";
import { DEFAULT_SETPIECE_PRESET_ID, SETPIECE_PRESETS } from "@/lib/setPiecePresets";
import type { SetPieceKind } from "@/lib/types";
import { IconFlipH, IconHalfPitch, IconPlusSquare, IconUndo } from "./icons";

const KIND_ORDER: SetPieceKind[] = ["ck", "fk", "gk", "throwin", "pk"];
const KIND_LABEL: Record<SetPieceKind, string> = {
  ck: "CK",
  fk: "FK",
  gk: "ゴールキック",
  throwin: "スローイン",
  pk: "PK",
};

/**
 * セットプレーデザイン画面の操作バー。FormationBar.tsx が雛形だが、フォーメーション選択の
 * 代わりに「種別(CK/FK/…)＋攻守」でプリセットを絞り込み、選んだプリセットを盤面へ適用する。
 * 上段=種別チップ＋攻守トグル（絞り込みのみ・盤面は変えない）、
 * 下段=絞り込み後のプリセットチップ（選択で即適用）＋左右反転／新規作成／ハーフ表示切替。
 */
export default function SetPieceBar() {
  const board = useBoard();
  // 編集系コントロールはスタッフのみ（選手は共有セットプレーの閲覧のみ。FormationBarと同じ規約）
  const isCoach = board.auth.role === "coach";
  const meta = board.state.setPiece;

  const [kind, setKind] = useState<SetPieceKind>(meta?.kind ?? "ck");
  const [side, setSide] = useState<"attack" | "defense">(meta?.side ?? "attack");
  // プリセット適用の直前状態を1件だけ覚えておき、「元に戻す」で戻せるようにする
  // （HYDRATE置換にはreducer側の汎用履歴が無いため、バー側の最小限の安全策として持つ）
  const [prevPresetId, setPrevPresetId] = useState<string | null>(null);

  // 別のセットプレー文書を読み込んだとき(currentSetPieceIdが変わったとき)は、
  // 絞り込みチップをその文書の種別/攻守へ合わせ、Undo履歴も持ち越さない
  // （レンダー中のstate調整。Reactの公式パターンに従いuseRefではなくuseStateで前回値を追跡する）
  const [syncedId, setSyncedId] = useState<string | null>(board.currentSetPieceId);
  if (syncedId !== board.currentSetPieceId) {
    setSyncedId(board.currentSetPieceId);
    if (meta) {
      setKind(meta.kind);
      setSide(meta.side);
    }
    setPrevPresetId(null);
  }

  // プリセット適用(applySetPiecePreset)・共有取込(applyImport)はcurrentSetPieceIdを
  // 変えないまま種別/攻守が変わりうるため、絞り込みチップをmeta(kind/side)自体の変化からも
  // 同期する（syncedIdの分岐だけでは取りこぼす）
  useEffect(() => {
    if (!meta) return;
    setKind(meta.kind);
    setSide(meta.side);
  }, [meta?.kind, meta?.side]);

  // アニメ編集中はプリセット差し替え(盤面を丸ごと置換=進行中のアニメも消える)を隠す。
  // 既存の戦術ボード(FormationBar)でも同じ理由でフォーメーション変更等をアニメ中は隠している
  if (!isCoach || board.mode === "anim") return null;

  const list = SETPIECE_PRESETS.filter((p) => p.kind === kind && p.side === side);
  const currentPresetId = meta?.presetId ?? null;

  const applyPreset = (id: string) => {
    if (id === currentPresetId) return;
    setPrevPresetId(currentPresetId);
    board.applySetPiecePreset(id);
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
      </div>
      <div className="fbar spbar-presets">
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
        <button
          className={`fmini half${board.state.pitchView === "half" ? " on" : ""}`}
          title="敵陣ハーフを拡大表示"
          onClick={() => {
            const next = board.state.pitchView === "half" ? "full" : "half";
            board.setPitchView(next);
            board.toast(next === "half" ? "ハーフコート表示" : "フルコート表示");
          }}
        >
          <IconHalfPitch />
          <span>ハーフ</span>
        </button>
      </div>
    </>
  );
}
