"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NoteFigure } from "@/lib/types";
import { MAX_FIGS, REFLECT_HEADS, emptyFigure, joinBlocks, splitBody, type Block } from "@/lib/figures";
import { HubMenu } from "../hub/common";
import { IconPlus } from "../icons";
import { FigureEditor } from "./FigureEditor";
import { FigureView } from "./FigureView";

/* note-reflection-figure §4: 振り返りの欄（練習・試合・自主練に共通）。文字 → 図の箱 → 文字 … の順 */

export type ReflectionVariant = "practice" | "match" | "solo";
const ROWS: Record<ReflectionVariant, number> = { practice: 5, match: 6, solo: 3 };
const HOLDER: Record<ReflectionVariant, string> = {
  practice: "練習全体の振り返り",
  match: "試合の振り返り",
  solo: "自己ベストや気づいたことなど",
};
const LINE_H = 22.5;
const CHROME = 22; // 上下 padding 20 + 枠 2
const MAX_H = 12 * LINE_H + CHROME;

function AutoTa({
  value,
  rows,
  placeholder,
  taRef,
  onChange,
  onTouch,
  onComposing,
}: {
  value: string;
  rows: number;
  placeholder?: string;
  taRef: (el: HTMLTextAreaElement | null) => void;
  onChange: (v: string) => void;
  onTouch: () => void;
  onComposing: (on: boolean) => void;
}) {
  const el = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => {
    const t = el.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight + 2, MAX_H) + "px";
    t.style.overflowY = t.scrollHeight + 2 > MAX_H ? "auto" : "hidden";
  };
  useLayoutEffect(fit, [value, rows]);
  return (
    <textarea
      ref={(n) => {
        el.current = n;
        taRef(n);
      }}
      className="refl-ta"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onTouch}
      onSelect={onTouch}
      onClick={onTouch}
      onKeyUp={onTouch}
      onCompositionStart={() => onComposing(true)}
      onCompositionEnd={() => {
        onComposing(false);
        onTouch();
      }}
    />
  );
}

export function ReflectionField({
  body,
  figures,
  variant,
  onChange,
}: {
  body: string;
  figures: NoteFigure[];
  variant: ReflectionVariant;
  onChange: (v: { body: string; figures: NoteFigure[] }) => void;
}) {
  const blocks = splitBody(body, figures);
  const textIdx: number[] = [];
  blocks.forEach((b, i) => b.type === "text" && textIdx.push(i));
  const els = useRef(new Map<number, HTMLTextAreaElement | null>());
  const last = useRef<{ i: number; pos: number } | null>(null);
  const composing = useRef(false);
  const [pendingFocus, setPendingFocus] = useState<{ i: number; pos: number } | null>(null);
  // 作図の画面：どの図か（直す）／どこに入れるか（新しい）
  const [editing, setEditing] = useState<
    { mode: "edit"; fig: NoteFigure } | { mode: "new"; fig: NoteFigure; blockIdx: number; cut: number } | null
  >(null);

  useEffect(() => {
    if (!pendingFocus) return;
    const t = els.current.get(pendingFocus.i);
    if (t) {
      t.focus();
      t.setSelectionRange(pendingFocus.pos, pendingFocus.pos);
    }
    setPendingFocus(null);
  }, [pendingFocus]);

  const emit = (bs: Block[]) => onChange(joinBlocks(bs));
  const setText = (i: number, v: string) => emit(blocks.map((b, j) => (j === i && b.type === "text" ? { type: "text", text: v } : b)));
  const touch = (i: number) => {
    const t = els.current.get(i);
    last.current = { i, pos: t ? t.selectionStart : 0 };
  };
  /** 今いる欄（最後に触った欄。無ければ最後の欄） */
  const currentBlock = (): number => {
    const l = last.current;
    if (l && blocks[l.i]?.type === "text") return l.i;
    return textIdx[textIdx.length - 1];
  };

  const addHead = (head: string) => {
    if (composing.current) return;
    const i = currentBlock();
    const b = blocks[i];
    if (b.type !== "text") return;
    const pre = b.text === "" || b.text.endsWith("\n") ? "" : "\n";
    const text = b.text + pre + head + "：\n";
    emit(blocks.map((x, j) => (j === i ? { type: "text", text } : x)));
    setPendingFocus({ i, pos: text.length });
  };

  const atLimit = figures.length >= MAX_FIGS;
  const startNew = () => {
    if (composing.current || atLimit) return;
    const i = currentBlock();
    const b = blocks[i];
    if (b.type !== "text") return;
    const l = last.current;
    const pos = l && l.i === i ? Math.min(l.pos, b.text.length) : b.text.length;
    const nl = b.text.indexOf("\n", pos);
    const cut = nl === -1 ? b.text.length : nl;
    setEditing({ mode: "new", fig: emptyFigure("full"), blockIdx: i, cut });
  };

  const finish = (res: NoteFigure | null) => {
    const ed = editing;
    setEditing(null);
    last.current = null; // 欄の並びが変わるので、最後に触った欄の番号は捨てる
    if (!ed) return;
    if (ed.mode === "edit") {
      if (res) onChange({ body, figures: figures.map((f) => (f.id === ed.fig.id ? { ...res, at: f.at } : f)) });
      else onChange({ body, figures: figures.filter((f) => f.id !== ed.fig.id) });
      return;
    }
    if (!res) return;
    const b = blocks[ed.blockIdx];
    if (!b || b.type !== "text") return;
    const a = b.text.slice(0, ed.cut);
    const rest = b.text.slice(ed.cut + (b.text[ed.cut] === "\n" ? 1 : 0));
    const next: Block[] = [
      ...blocks.slice(0, ed.blockIdx),
      { type: "text", text: a },
      { type: "fig", fig: res },
      { type: "text", text: rest },
      ...blocks.slice(ed.blockIdx + 1),
    ];
    emit(next);
    last.current = null;
  };

  const removeFig = (id: string) => {
    last.current = null; // 後ろの欄の番号がずれるため
    onChange({ body, figures: figures.filter((f) => f.id !== id) });
  };

  let n = 0;
  let firstText = true;
  return (
    <div className="refl">
      <div className="refl-h">振り返り</div>
      {variant !== "solo" && (
        <>
          <div className="refl-hint">{REFLECT_HEADS.join("・")}</div>
          <div className="refl-chips">
            {REFLECT_HEADS.map((h) => (
              <button key={h} type="button" className="refl-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => addHead(h)}>
                {h}
              </button>
            ))}
          </div>
        </>
      )}
      {blocks.map((b, i) => {
        if (b.type === "fig") {
          n += 1;
          const idx = n;
          return (
            <div key={"f" + b.fig.id} className="figbox">
              <button type="button" className="figbox-open" aria-label={`図 ${idx} を直す`} onClick={() => setEditing({ mode: "edit", fig: b.fig })}>
                <FigureView fig={b.fig} />
              </button>
              <span className="figbox-cap">図 {idx}</span>
              <div className="figbox-more">
                <HubMenu
                  label={`図 ${idx} のメニュー`}
                  items={[
                    { label: "図を直す", onClick: () => setEditing({ mode: "edit", fig: b.fig }) },
                    { label: "図を削除", onClick: () => removeFig(b.fig.id) },
                  ]}
                />
              </div>
            </div>
          );
        }
        // 図があるときは、1 つ目の欄も 2 行から（図が無いときだけ最初の高さ）
        const rows = firstText && figures.length === 0 ? ROWS[variant] : 2;
        // 図の後ろの空の欄は、何の箱か分かるよう薄い案内を出す
        const ph = firstText ? HOLDER[variant] : "続きを書く";
        firstText = false;
        return (
          <AutoTa
            key={"t" + i}
            value={b.text}
            rows={rows}
            placeholder={ph}
            taRef={(el) => {
              els.current.set(i, el);
            }}
            onChange={(v) => setText(i, v)}
            onTouch={() => touch(i)}
            onComposing={(on) => (composing.current = on)}
          />
        );
      })}
      <button type="button" className="refl-add" disabled={atLimit} onMouseDown={(e) => e.preventDefault()} onClick={startNew}>
        <IconPlus width={18} height={18} />
        図を入れる
      </button>
      {atLimit && <div className="refl-limit">図は 1 つのノートに {MAX_FIGS} 枚までです</div>}
      {editing && <FigureEditor initial={editing.fig} onDone={finish} onCancel={() => setEditing(null)} />}
    </div>
  );
}
