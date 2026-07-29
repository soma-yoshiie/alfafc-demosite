"use client";

// 図形パレット（追加ボタン群＋選択中の図形の色・線種・サイズ・場面スコープ編集）。
// PenControls を手本に、編集モード / アニメスタジオで共有する。
// Phase 1b: 選手追従図形（連結ライン/囲み枠）は「選手をタップして選択」
// という待機フロー（pendingShape）を経由して作成する。ガイド表示トグルもここに置く。

import { useBoard } from "./BoardProvider";
import {
  IconCurvedArrow,
  IconEllipse,
  IconHullShape,
  IconLinkNodes,
  IconRectZone,
  IconTextLabel,
  IconTrash,
} from "./icons";

const COLORS = [
  { c: "#ffe27a", name: "イエロー" },
  { c: "#ffffff", name: "ホワイト" },
  { c: "#ff5d6c", name: "レッド" },
  { c: "#4fc3f7", name: "ブルー" },
  { c: "#15233c", name: "ネイビー" },
];

const ADD_ITEMS: {
  kind: "zoneEllipse" | "zoneRect" | "text" | "arrow";
  label: string;
  Icon: typeof IconEllipse;
}[] = [
  { kind: "zoneEllipse", label: "楕円ゾーン", Icon: IconEllipse },
  { kind: "zoneRect", label: "矩形ゾーン", Icon: IconRectZone },
  { kind: "text", label: "テキスト", Icon: IconTextLabel },
  { kind: "arrow", label: "曲線矢印", Icon: IconCurvedArrow },
];

/** 選手タップ待ちフローで作成する追従図形 */
const PENDING_ITEMS: {
  kind: "link" | "hull";
  label: string;
  Icon: typeof IconEllipse;
}[] = [
  { kind: "link", label: "連結ライン", Icon: IconLinkNodes },
  { kind: "hull", label: "囲み枠", Icon: IconHullShape },
];

const SIZES: { v: "s" | "m" | "l"; label: string }[] = [
  { v: "s", label: "小" },
  { v: "m", label: "中" },
  { v: "l", label: "大" },
];

/** 太さ3段（ピッチ%単位）。zone は輪郭用、arrow/link はそれより太め。
 * 未設定時の既定値（下記 widthInfo の def）と各段の値を一致させてある */
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

const GUIDE_ITEMS: { key: "lanes" | "zones" | "legend"; label: string }[] = [
  { key: "lanes", label: "5レーン" },
  { key: "zones", label: "エリア名" },
  { key: "legend", label: "凡例" },
];

export default function ShapesBar({ onClose }: { onClose?: () => void }) {
  const board = useBoard();
  const shapes = board.state.shapes ?? [];
  const sel = board.selShape ? shapes.find((s) => s.id === board.selShape) ?? null : null;
  const pending = board.pendingShape;
  const guides = board.state.guides ?? {};

  // zoneEllipse/zoneRect/arrow/link の選択中だけ、太さ3段トグルの選択肢と
  // 現在の実効幅（width ?? 既定値）に最も近い段を求める
  const widthInfo =
    sel &&
    (sel.kind === "zoneEllipse" ||
      sel.kind === "zoneRect" ||
      sel.kind === "arrow" ||
      sel.kind === "link")
      ? (() => {
          const isZone = sel.kind === "zoneEllipse" || sel.kind === "zoneRect";
          const options = isZone
            ? ZONE_WIDTHS
            : sel.kind === "arrow"
              ? ARROW_WIDTHS
              : LINK_WIDTHS;
          const def = isZone ? 0.5 : sel.kind === "arrow" ? 1.1 : 1.0;
          const effective = sel.width ?? def;
          const nearest = options.reduce((best, o) =>
            Math.abs(o.w - effective) < Math.abs(best.w - effective) ? o : best
          ).w;
          return { options, nearest };
        })()
      : null;

  const toggleGuide = (key: "lanes" | "zones" | "legend") => {
    board.setGuides({ [key]: !guides[key] } as Partial<{
      lanes: boolean;
      zones: boolean;
      legend: boolean;
    }>);
  };

  return (
    <div className="penbar">
      <div className="pengroup">
        {ADD_ITEMS.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            className="shapeadd"
            disabled={!!pending}
            onClick={() => board.addShape(kind)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        {PENDING_ITEMS.map(({ kind, label, Icon }) => (
          <button
            key={kind}
            className="shapeadd"
            disabled={!!pending}
            onClick={() => board.startPendingShape(kind)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {pending && (
        <div className="pengroup">
          <span className="pendinghint">
            選手をタップして選択（{pending.actors.length}人）
          </span>
          <button className="penact" onClick={board.confirmPendingShape}>
            決定
          </button>
          <button className="penact danger" onClick={board.cancelPendingShape}>
            キャンセル
          </button>
        </div>
      )}

      {sel && !pending && (
        <>
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

          {widthInfo && (
            <div className="pengroup">
              {widthInfo.options.map(({ w, name }) => (
                <button
                  key={w}
                  className={`penwidth${widthInfo.nearest === w ? " on" : ""}`}
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
                autoFocus
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
                onClick={() =>
                  board.updateShape(sel.id, { showCount: sel.showCount === false })
                }
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
        </>
      )}

      <div className="pengroup">
        {GUIDE_ITEMS.map(({ key, label }) => (
          <button
            key={key}
            className={`penscope${guides[key] ? " on" : ""}`}
            title="ピッチガイドの表示切替"
            onClick={() => toggleGuide(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pengroup right">
        {sel && !pending && (
          <button
            className="penact danger"
            title="この図形を削除"
            onClick={() => board.deleteShape(sel.id)}
          >
            <IconTrash />
          </button>
        )}
        <button
          className="penact close"
          onClick={() => (onClose ? onClose() : board.setShapesOpen(false))}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
