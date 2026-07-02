"use client";

import { useRef, useState } from "react";
import type React from "react";
import type { DiscSize, DrillItemKind, DrillLineKind, PitchType, Point, SavedDrill } from "@/lib/types";
import { simplify } from "@/lib/animation";
import { ITEM_LABEL, LINE_LABEL } from "@/lib/drillDraw";
import { useBoard } from "./BoardProvider";
import { DrillProvider, ITEM_TOOLS, LINE_TOOLS, useDrill } from "./DrillProvider";
import { SendTargetField, targetThreadKey, type SendTarget } from "./SendTarget";
import { E } from "./Emoji";
import DrillItemView from "./DrillItemView";
import DrillLines from "./DrillLines";
import { IconDownload, IconFolder, IconSave } from "./icons";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const PITCH_LABEL: Record<PitchType, string> = {
  half: "ハーフ",
  full: "フル縦",
  fullh: "フル横",
  blank: "ブランク",
};

const DISC_LABEL: Record<DiscSize, string> = { L: "大", M: "中", S: "小" };

function Markings({ type }: { type: PitchType }) {
  if (type === "blank") return null;
  if (type === "half")
    return (
      <div className="markings">
        <div className="mk box-top" />
        <div className="mk box-top-s" />
      </div>
    );
  if (type === "fullh")
    return (
      <div className="markings">
        <div className="mk center-line-v" />
        <div className="mk center-circle" />
        <div className="mk spot" />
        <div className="mk box-left" />
        <div className="mk box-left-s" />
        <div className="mk box-right" />
        <div className="mk box-right-s" />
      </div>
    );
  return (
    <div className="markings">
      <div className="mk center-line" />
      <div className="mk center-circle" />
      <div className="mk spot" />
      <div className="mk box-top" />
      <div className="mk box-top-s" />
      <div className="mk box-bot" />
      <div className="mk box-bot-s" />
    </div>
  );
}

/* ---- bottom sheet shell (drill用) ---- */
function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <div className={`sheet${open ? " on" : ""}`}>
        <div className="grabzone" onClick={onClose}>
          <div className="grab" />
        </div>
        <div className="sheetBody">{open ? children : null}</div>
      </div>
    </>
  );
}

function ToolChip({ t, label }: { t: ReturnType<typeof useDrill>["tool"]; label: string }) {
  const drill = useDrill();
  return (
    <div
      className={`toolchip${drill.tool === t ? " on" : ""}`}
      onClick={() => drill.setTool(t)}
    >
      {label}
    </div>
  );
}

function Inner() {
  const board = useBoard();
  const drill = useDrill();
  const { doc, tool } = drill;
  const draw = useRef({
    active: false,
    pts: [] as Point[],
    rect: null as DOMRect | null,
    sx: 0,
    sy: 0,
    moved: false,
  });
  const [titleDraft, setTitleDraft] = useState("");
  const [memoDraft, setMemoDraft] = useState("");
  const [asTitle, setAsTitle] = useState("");
  const [drillTarget, setDrillTarget] = useState<SendTarget>({ mode: "none" });

  const drillThreadKey = targetThreadKey(drillTarget);
  const sendDrill = () => {
    if (!drillThreadKey) return;
    const d: SavedDrill = {
      id: "drill_snap_" + Date.now().toString(36),
      title: (asTitle || doc.title).trim() || "練習メニュー",
      memo: doc.memo,
      pitchType: doc.pitchType,
      discSize: doc.discSize,
      items: doc.items.map((it) => ({ ...it })),
      lines: doc.lines.map((l) => ({ ...l, path: l.path.map((p) => ({ ...p })) })),
      updatedAt: Date.now(),
    };
    board.sendMessage({
      to: drillThreadKey,
      from: "coach",
      fromName: "スタッフ",
      attachments: [{ kind: "drill", title: d.title, drill: d }],
    });
  };

  const isLine = (LINE_TOOLS as string[]).includes(tool);
  const isItem = (ITEM_TOOLS as string[]).includes(tool);

  const toCoord = (clientX: number, clientY: number): Point => {
    const r = draw.current.rect!;
    return {
      x: clamp(((clientX - r.left) / r.width) * 100, 2, 98),
      y: clamp((1 - (clientY - r.top) / r.height) * 100, 2, 98),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isLine && !isItem) return;
    draw.current.rect = drill.getPitchRect();
    if (!draw.current.rect) return;
    draw.current.active = true;
    draw.current.moved = false;
    draw.current.sx = e.clientX;
    draw.current.sy = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (isLine) {
      const c = toCoord(e.clientX, e.clientY);
      draw.current.pts = [c];
      drill.setTempLine([c]);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draw.current.active) return;
    if (Math.abs(e.clientX - draw.current.sx) > 4 || Math.abs(e.clientY - draw.current.sy) > 4)
      draw.current.moved = true;
    if (isLine) {
      const c = toCoord(e.clientX, e.clientY);
      const last = draw.current.pts[draw.current.pts.length - 1];
      if (Math.hypot(c.x - last.x, c.y - last.y) > 2) {
        draw.current.pts.push(c);
        drill.setTempLine(draw.current.pts.slice());
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draw.current.active) return;
    draw.current.active = false;
    if (isLine) {
      const pts = draw.current.pts;
      drill.setTempLine(null);
      if (pts.length >= 2) {
        drill.addLine(tool as DrillLineKind, simplify(pts));
      }
    } else if (isItem) {
      const c = toCoord(e.clientX, e.clientY);
      drill.addItem(tool as DrillItemKind, c.x, c.y);
    }
  };

  return (
    <div className="app drillapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ メニュー
        </div>
        <button
          className="drilltitle"
          onClick={() => {
            setTitleDraft(doc.title);
            setMemoDraft(doc.memo);
            drill.openSheet("memo");
          }}
          title="タイトル・メモ"
        >
          {doc.title}
          {doc.memo ? " ✎" : ""}
        </button>
        <div className="hbtn">
          <div className="icon" title="保存" onClick={drill.saveDrill}>
            <IconSave />
          </div>
          <div className="icon" title="保存した練習" onClick={() => drill.openSheet("library")}>
            <IconFolder />
          </div>
          <div className="icon" title="画像で保存" onClick={drill.exportPng}>
            <IconDownload />
          </div>
        </div>
      </header>

      <div className="fbar">
        {(["half", "full", "fullh", "blank"] as PitchType[]).map((p) => (
          <div
            key={p}
            className={`chip${doc.pitchType === p ? " on" : ""}`}
            onClick={() => drill.setPitchType(p)}
          >
            {PITCH_LABEL[p]}
          </div>
        ))}
        <div
          className="chip"
          title="選手・相手の丸の大きさ"
          onClick={() => {
            const order: DiscSize[] = ["L", "M", "S"];
            const cur = doc.discSize ?? "L";
            drill.setDiscSize(order[(order.indexOf(cur) + 1) % order.length]);
          }}
        >
          丸 {DISC_LABEL[doc.discSize ?? "L"]}
        </div>
        <div className="chip" onClick={drill.undo} title="元に戻す">
          ↩ 元に戻す
        </div>
        <div className="chip" onClick={drill.clearAll} style={{ color: "var(--red)" }}>
          <E n="trash" /> 全消去
        </div>
      </div>

      <div className="scroll">
        <div className="pitchwrap">
          <div
            className={`pitch ${doc.pitchType} disc-${(doc.discSize ?? "L").toLowerCase()}`}
            ref={drill.pitchRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ touchAction: "none" }}
          >
            <Markings type={doc.pitchType} />
            <DrillLines />
            {doc.items.map((it) => (
              <DrillItemView key={it.id} item={it} />
            ))}
            {doc.items.length === 0 && doc.lines.length === 0 && (
              <div className="hint">
                下のツールを選んで、ピッチをタップで配置／なぞって動線を描きます
              </div>
            )}
          </div>
        </div>

        <div className="studio" style={{ display: "flex" }}>
          <div className="stitle">
            <b>ツール</b>
            <div className="hintxt">
              配置：タップ ／ 動線：なぞる
              <br />
              ゴールは移動ツールでタップ＝向き変更
            </div>
          </div>
          <div className="sttools">
            <ToolChip t="move" label="移動" />
            {LINE_TOOLS.map((t) => (
              <ToolChip key={t} t={t} label={LINE_LABEL[t as DrillLineKind]} />
            ))}
            <ToolChip t="delete" label="削除" />
          </div>
          <div className="sttools">
            {ITEM_TOOLS.map((t) => (
              <ToolChip key={t} t={t} label={"＋ " + ITEM_LABEL[t]} />
            ))}
          </div>
        </div>
      </div>

      {/* sheets */}
      <Sheet open={drill.sheet === "library"} onClose={() => drill.openSheet(null)}>
        <h2>
          保存した練習メニュー <span>{drill.drills.length}件</span>
        </h2>
        <div className="controls">
          <button className="bigbtn" style={{ width: "100%", margin: 0 }} onClick={drill.newDrill}>
            ＋ 新規作成
          </button>
        </div>
        <div className="list">
          {drill.drills.length === 0 ? (
            <div className="empty-msg">まだ保存された練習メニューはありません。</div>
          ) : (
            [...drill.drills]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((s) => (
                <div
                  key={s.id}
                  className={`playrow${drill.currentId === s.id ? " cur" : ""}`}
                >
                  <div className="playmain" onClick={() => drill.loadDrill(s.id)}>
                    <div className="playtitle">{s.title}</div>
                    <div className="playsub">
                      {PITCH_LABEL[s.pitchType]} ・ アイテム{s.items.length} ・ 動線{s.lines.length}
                    </div>
                  </div>
                  <div className="playacts">
                    <button
                      title="削除"
                      onClick={() => {
                        if (window.confirm(`「${s.title}」を削除しますか？`))
                          drill.deleteDrill(s.id);
                      }}
                    >
                      <E n="trash" />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </Sheet>

      <Sheet open={drill.sheet === "memo"} onClose={() => drill.openSheet(null)}>
        <h2>タイトル・メモ</h2>
        <div className="formfield">
          <label>タイトル</label>
          <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} autoFocus />
        </div>
        <div className="formfield">
          <label>メモ（ねらい・回数など）</label>
          <textarea
            value={memoDraft}
            onChange={(e) => setMemoDraft(e.target.value)}
            rows={5}
            style={{
              width: "100%",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "12px 13px",
              color: "var(--ink)",
              fontSize: 15,
              fontFamily: "Manrope, sans-serif",
              resize: "vertical",
            }}
          />
        </div>
        <button
          className="bigbtn"
          onClick={() => {
            drill.setTitle(titleDraft.trim() || "練習メニュー");
            drill.setMemo(memoDraft);
            drill.openSheet(null);
          }}
        >
          保存
        </button>
      </Sheet>

      <Sheet open={drill.sheet === "saveAs"} onClose={() => drill.openSheet(null)}>
        <h2>練習メニューを保存・送信</h2>
        <div className="formfield">
          <label>タイトル</label>
          <input
            value={asTitle || doc.title}
            onChange={(e) => setAsTitle(e.target.value)}
            autoFocus
          />
        </div>
        <SendTargetField
          players={board.state.players}
          value={drillTarget}
          onChange={setDrillTarget}
        />
        <button
          className="bigbtn"
          onClick={() => {
            drill.saveAsNew(asTitle || doc.title);
            if (drillThreadKey) sendDrill();
          }}
        >
          {drillThreadKey ? "保存して送信する" : "保存する"}
        </button>
        {drillThreadKey && (
          <button
            className="bigbtn ghost"
            style={{ marginTop: 8 }}
            onClick={() => {
              sendDrill();
              drill.openSheet(null);
            }}
          >
            保存せずに送信する
          </button>
        )}
      </Sheet>
    </div>
  );
}

export default function DrillEditor() {
  return (
    <DrillProvider>
      <Inner />
    </DrillProvider>
  );
}
