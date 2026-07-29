"use client";

// 選択中の図形（selShape）またはペンストローク（selStroke）の近くに出す
// Keynote風のミニ書式バー。既存クラス（penswatch/penwidth/pendash/penscope/penact）を
// 流用した横一列・小型のツールバーとして .pitch 内に絶対配置する。
// 位置は対象DOM（ShapesLayer/PenLayerが registerShapeEl で登録した要素）の
// getBoundingClientRect を .pitch 基準の%へ変換して求める。図形のupdateShape等で
// 再レンダーされるたびに追従させるため、依存配列なしのuseLayoutEffectで毎回計算し直す
// （位置読みは軽微なコストのため許容）。

import { useLayoutEffect, useState } from "react";
import { useBoard } from "./BoardProvider";
import { IconTrash } from "./icons";

const COLORS = [
  { c: "#ffe27a", name: "イエロー" },
  { c: "#ffffff", name: "ホワイト" },
  { c: "#ff5d6c", name: "レッド" },
  { c: "#4fc3f7", name: "ブルー" },
  { c: "#15233c", name: "ネイビー" },
];

/** ストロークの太さ3段（ペンと同じ値） */
const STROKE_WIDTHS = [
  { w: 0.55, name: "細" },
  { w: 0.9, name: "中" },
  { w: 1.5, name: "太" },
];
/** 図形kind別の太さ3段（ShapesBarと同じ値） */
const ZONE_WIDTHS = [
  { w: 0.5, name: "細" },
  { w: 0.9, name: "中" },
  { w: 1.5, name: "太" },
];
const ARROW_WIDTHS = [
  { w: 0.7, name: "細" },
  { w: 1.1, name: "中" },
  { w: 1.8, name: "太" },
];
const LINK_WIDTHS = [
  { w: 0.7, name: "細" },
  { w: 1.0, name: "中" },
  { w: 1.8, name: "太" },
];
const SIZES: { v: "s" | "m" | "l"; label: string }[] = [
  { v: "s", label: "小" },
  { v: "m", label: "中" },
  { v: "l", label: "大" },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** 実効値に最も近い段の太さを返す */
const nearestWidth = (options: { w: number }[], effective: number) =>
  options.reduce((best, o) =>
    Math.abs(o.w - effective) < Math.abs(best.w - effective) ? o : best
  ).w;

interface BarPos {
  left: number; // .pitch基準の%
  top: number; // .pitch基準の%
  /** true: 対象の上に出す（バー下端をtopに合わせる）/ false: 対象の下に出す（上にはみ出す場合のクランプ） */
  above: boolean;
}

export default function FormatBar() {
  const board = useBoard();
  const shapes = board.state.shapes ?? [];
  const sel = board.selShape ? shapes.find((s) => s.id === board.selShape) ?? null : null;
  const strokes = board.state.drawings ?? [];
  const selStroke = board.selStroke
    ? strokes.find((d) => d.id === board.selStroke) ?? null
    : null;

  const targetId = sel ? sel.id : (selStroke?.id ?? null);

  const [pos, setPos] = useState<BarPos | null>(null);

  useLayoutEffect(() => {
    // 依存配列なし＝毎レンダー後に追従計算するが、値が変わらない限りは同一参照を返して
    // setState をバイパスする（これをしないと「setPos→再レンダー→effect再実行」の無限ループになる）
    if (!targetId) {
      setPos((p) => (p === null ? p : null));
      return;
    }
    const el = board.getShapeEl(targetId);
    const pr = board.getPitchRect();
    if (!el || !pr || pr.width <= 0 || pr.height <= 0) {
      setPos((p) => (p === null ? p : null));
      return;
    }
    const r = el.getBoundingClientRect();
    const centerXPct = ((r.left + r.width / 2 - pr.left) / pr.width) * 100;
    const topPct = ((r.top - pr.top) / pr.height) * 100;
    const bottomPct = ((r.bottom - pr.top) / pr.height) * 100;
    // 上辺の少し上に出すのが基本。ピッチ上端付近で収まらない場合は下側へクランプする
    const above = topPct >= 12;
    const left = clamp(centerXPct, 16, 84);
    const top = above ? Math.max(2, topPct - 2) : Math.min(96, bottomPct + 2);
    setPos((prev) =>
      prev && prev.left === left && prev.top === top && prev.above === above
        ? prev
        : { left, top, above }
    );
  });

  if (!pos || (!sel && !selStroke)) return null;

  const barLeft = `${pos.left}%`;
  const barTop = `${pos.top}%`;
  const barTransform = pos.above ? "translate(-50%, -100%)" : "translate(-50%, 0)";

  if (selStroke) {
    const id = selStroke.id as string;
    const curW = nearestWidth(STROKE_WIDTHS, selStroke.width ?? 0.9);
    return (
      <div className="formatbar" style={{ left: barLeft, top: barTop, transform: barTransform }}>
        <div className="pengroup">
          {COLORS.map(({ c, name }) => (
            <button
              key={c}
              className={`penswatch${(selStroke.color ?? "#ffe27a") === c ? " on" : ""}`}
              style={{ background: c }}
              title={name}
              onClick={() => board.updateStroke(id, { color: c })}
            />
          ))}
        </div>
        <div className="pengroup">
          {STROKE_WIDTHS.map(({ w, name }) => (
            <button
              key={w}
              className={`penwidth${curW === w ? " on" : ""}`}
              title={`太さ：${name}`}
              onClick={() => board.updateStroke(id, { width: w })}
            >
              <i style={{ height: `${Math.round(w * 3.4)}px` }} />
            </button>
          ))}
        </div>
        <div className="pengroup">
          <button
            className={`pendash${!selStroke.dash ? " on" : ""}`}
            title="実線"
            onClick={() => board.updateStroke(id, { dash: false })}
          >
            <i className="solid" />
          </button>
          <button
            className={`pendash${selStroke.dash ? " on" : ""}`}
            title="点線"
            onClick={() => board.updateStroke(id, { dash: true })}
          >
            <i className="dashed" />
          </button>
        </div>
        <div className="pengroup">
          <button
            className="penact danger"
            title="この描き込みを削除"
            onClick={() => board.deleteStroke(id)}
          >
            <IconTrash />
          </button>
        </div>
      </div>
    );
  }

  if (!sel) return null;
  const isZone = sel.kind === "zoneEllipse" || sel.kind === "zoneRect";
  const widthOptions = isZone
    ? ZONE_WIDTHS
    : sel.kind === "arrow"
      ? ARROW_WIDTHS
      : sel.kind === "link"
        ? LINK_WIDTHS
        : null;
  const widthDef = isZone ? 0.5 : sel.kind === "arrow" ? 1.1 : 1.0;
  const curW = widthOptions ? nearestWidth(widthOptions, sel.width ?? widthDef) : null;

  return (
    <div className="formatbar" style={{ left: barLeft, top: barTop, transform: barTransform }}>
      <div className="pengroup">
        {COLORS.map(({ c, name }) => (
          <button
            key={c}
            className={`penswatch${(sel.color ?? "#ffe27a") === c ? " on" : ""}`}
            style={{ background: c }}
            title={name}
            onClick={() => board.updateShape(sel.id, { color: c })}
          />
        ))}
      </div>

      {widthOptions && (
        <div className="pengroup">
          {widthOptions.map(({ w, name }) => (
            <button
              key={w}
              className={`penwidth${curW === w ? " on" : ""}`}
              title={`太さ：${name}`}
              onClick={() => board.updateShape(sel.id, { width: w })}
            >
              <i style={{ height: `${Math.round(w * 3.4)}px` }} />
            </button>
          ))}
        </div>
      )}

      {sel.kind === "arrow" && (
        <div className="pengroup">
          <button
            className={`pendash${!sel.dash ? " on" : ""}`}
            title="実線"
            onClick={() => board.updateShape(sel.id, { dash: false })}
          >
            <i className="solid" />
          </button>
          <button
            className={`pendash${sel.dash ? " on" : ""}`}
            title="点線"
            onClick={() => board.updateShape(sel.id, { dash: true })}
          >
            <i className="dashed" />
          </button>
        </div>
      )}

      {sel.kind === "text" && (
        <div className="pengroup">
          <input
            key={sel.id}
            type="text"
            className="shapetextinput"
            defaultValue={sel.text}
            maxLength={30}
            onChange={(e) => board.updateShape(sel.id, { text: e.target.value })}
          />
          {SIZES.map(({ v, label }) => (
            <button
              key={v}
              className={`penscope${(sel.size ?? "m") === v ? " on" : ""}`}
              onClick={() => board.updateShape(sel.id, { size: v })}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {sel.kind === "hull" && (
        <div className="pengroup">
          <button
            className={`penscope${sel.showCount !== false ? " on" : ""}`}
            title="囲んだ人数のバッジ表示"
            onClick={() => board.updateShape(sel.id, { showCount: sel.showCount === false })}
          >
            人数バッジ {sel.showCount !== false ? "ON" : "OFF"}
          </button>
        </div>
      )}

      {board.mode === "anim" && (
        <div className="pengroup">
          <button
            className={`penscope${sel.step == null ? " on" : ""}`}
            title="どの場面でも表示される図形"
            onClick={() => board.updateShape(sel.id, { step: undefined })}
          >
            全場面
          </button>
          <button
            className={`penscope${sel.step != null ? " on" : ""}`}
            title={`場面${board.activeStep + 1}のときだけ表示される図形`}
            onClick={() => board.updateShape(sel.id, { step: board.activeStep })}
          >
            この場面
          </button>
        </div>
      )}

      <div className="pengroup">
        <button
          className="penact danger"
          title="この図形を削除"
          onClick={() => board.deleteShape(sel.id)}
        >
          <IconTrash />
        </button>
      </div>
    </div>
  );
}
