"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NoteFigure, NotePhoto } from "@/lib/types";
import { MAX_FIGS, REFLECT_HEADS, emptyFigure, figureHasStaff, joinBlocks, splitBody, type Block } from "@/lib/figures";
import { HubMenu } from "../hub/common";
import { IconPlus } from "../icons";
import { FigureEditor } from "./FigureEditor";
import { FigureView } from "./FigureView";
import { PhotoBox, pickPhoto } from "./PhotoBlock";

/* note-reflection-figure §4: 振り返りの欄（練習・試合・自主練に共通）。文字 → 図の箱 → 文字 … の順 */

/** free＝自由ノート（note-free §2）。見出し・補助文・チップなしで、末尾に「＋ 文字／＋ 図／＋ 写真」の行を持つ */
export type ReflectionVariant = "practice" | "match" | "solo" | "free";
const ROWS: Record<ReflectionVariant, number> = { practice: 5, match: 6, solo: 3, free: 3 };
const HOLDER: Record<ReflectionVariant, string> = {
  practice: "練習全体の振り返り",
  match: "試合の振り返り",
  solo: "自己ベストや気づいたことなど",
  free: "文字を書く",
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
  photo,
  variant,
  onChange,
  onToast,
}: {
  body: string;
  figures: NoteFigure[];
  /** note-free §3: 1 ノートに 1 枚までの写真 */
  photo?: NotePhoto;
  variant: ReflectionVariant;
  onChange: (v: { body: string; figures: NoteFigure[]; photo?: NotePhoto }) => void;
  /** 写真を読み込めなかったときの知らせ */
  onToast?: (m: string) => void;
}) {
  const blocks = splitBody(body, figures, photo);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoAt = useRef<{ blockIdx: number; cut: number } | null>(null);
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
  const atPhotoLimit = !!photo;
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

  const isFree = variant === "free";
  const atLimit = figures.length >= MAX_FIGS;
  const startNew = () => {
    if (composing.current || atLimit) return;
    // 自由ノートの「＋ 図」は、いつも末尾に入れる
    const i = isFree ? textIdx[textIdx.length - 1] : currentBlock();
    const b = blocks[i];
    if (b.type !== "text") return;
    const l = last.current;
    const pos = !isFree && l && l.i === i ? Math.min(l.pos, b.text.length) : b.text.length;
    const nl = b.text.indexOf("\n", pos);
    const cut = nl === -1 ? b.text.length : nl;
    setEditing({ mode: "new", fig: emptyFigure("full"), blockIdx: i, cut });
  };

  /** 「＋ 文字」：末尾の欄にカーソルを置く（末尾が空でなければ改行を 1 つ足して続きを書く） */
  const addText = () => {
    if (composing.current) return;
    const i = textIdx[textIdx.length - 1];
    const b = blocks[i];
    if (b.type !== "text") return;
    if (b.text === "" || b.text.endsWith("\n")) {
      setPendingFocus({ i, pos: b.text.length });
      return;
    }
    const text = b.text + "\n";
    emit(blocks.map((x, j) => (j === i ? { type: "text", text } : x)));
    setPendingFocus({ i, pos: text.length });
  };

  /** 「上へ」「下へ」：空の文字の欄は数えず、1 つ上・下のブロックと入れ替える（自由ノートだけ） */
  const items = blocks.filter((b) => b.type !== "text" || b.text !== "");
  const swapped = (id: string, dir: -1 | 1): Block[] | null => {
    const arr = items.slice();
    const i = arr.findIndex((b) => (id === "photo" ? b.type === "photo" : b.type === "fig" && b.fig.id === id));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return null;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr;
  };
  const sigOf = (bs: Block[]) => bs.filter((b) => b.type !== "text" || b.text !== "").map((b) => (b.type === "text" ? "t" + b.text : b.type === "fig" ? "f" + b.fig.id : "p")).join("|");
  /** 入れ替えて保存し直した結果で並びが変わるときだけ押せる（同じ位置の図と写真は図が先なので変わらない） */
  const canMove = (id: string, dir: -1 | 1): boolean => {
    const a = swapped(id, dir);
    if (!a) return false;
    const r = joinBlocks(a);
    return sigOf(splitBody(r.body, r.figures, r.photo)) !== sigOf(items);
  };
  const moveFig = (id: string, dir: -1 | 1) => {
    const arr = swapped(id, dir);
    if (!arr) return;
    last.current = null;
    emit(arr);
  };

  const finish = (res: NoteFigure | null) => {
    const ed = editing;
    setEditing(null);
    last.current = null; // 欄の並びが変わるので、最後に触った欄の番号は捨てる
    if (!ed) return;
    if (ed.mode === "edit") {
      if (res) onChange({ body, photo, figures: figures.map((f) => (f.id === ed.fig.id ? { ...res, at: f.at } : f)) });
      else onChange({ body, photo, figures: figures.filter((f) => f.id !== ed.fig.id) });
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
    // スタッフが描き足した図は、図ごと消すとスタッフの線も消える。相手の物なので、消す前に確かめる
    const f = figures.find((x) => x.id === id);
    if (f && figureHasStaff(f) && !window.confirm("スタッフの描き足しも消えます。図を削除しますか？")) return;
    last.current = null; // 後ろの欄の番号がずれるため
    onChange({ body, photo, figures: figures.filter((f) => f.id !== id) });
  };

  /** 「写真を入れる」：入れる位置は図と同じ決め方（自由ノートは末尾）。写真を選ぶ間に位置を覚えておく */
  const startPhoto = () => {
    if (composing.current) return;
    if (atPhotoLimit) return;
    const i = isFree ? textIdx[textIdx.length - 1] : currentBlock();
    const b = blocks[i];
    if (b.type !== "text") return;
    const l = last.current;
    const pos = !isFree && l && l.i === i ? Math.min(l.pos, b.text.length) : b.text.length;
    const nl = b.text.indexOf("\n", pos);
    photoAt.current = { blockIdx: i, cut: nl === -1 ? b.text.length : nl };
    fileRef.current?.click();
  };
  const onPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const at = photoAt.current;
    photoAt.current = null;
    if (!f || !at) return;
    const r = await pickPhoto(f);
    if (typeof r === "string") {
      onToast?.(r);
      return;
    }
    const bs = blocksRef.current;
    const b = bs[at.blockIdx];
    if (!b || b.type !== "text" || bs.some((x) => x.type === "photo")) return;
    const a = b.text.slice(0, at.cut);
    const rest = b.text.slice(at.cut + (b.text[at.cut] === "\n" ? 1 : 0));
    last.current = null;
    emit([
      ...bs.slice(0, at.blockIdx),
      { type: "text", text: a },
      { type: "photo", photo: { src: r.src, at: 0 } },
      { type: "text", text: rest },
      ...bs.slice(at.blockIdx + 1),
    ]);
  };
  const removePhoto = () => {
    last.current = null;
    onChange({ body, figures, photo: undefined });
  };

  let n = 0;
  let firstText = true;
  return (
    <div className={`refl${isFree ? " free" : ""}`}>
      {!isFree && <div className="refl-h">振り返り</div>}
      {(variant === "practice" || variant === "match") && (
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
                  items={
                    isFree
                      ? [
                          { label: "上へ", disabled: !canMove(b.fig.id, -1), onClick: () => moveFig(b.fig.id, -1) },
                          { label: "下へ", disabled: !canMove(b.fig.id, 1), onClick: () => moveFig(b.fig.id, 1) },
                          { label: "削除", onClick: () => removeFig(b.fig.id) },
                        ]
                      : [
                          { label: "図を直す", onClick: () => setEditing({ mode: "edit", fig: b.fig }) },
                          { label: "図を削除", onClick: () => removeFig(b.fig.id) },
                        ]
                  }
                />
              </div>
            </div>
          );
        }
        if (b.type === "photo") {
          return (
            <PhotoBox
              key="photo"
              photo={b.photo}
              menu={
                isFree
                  ? [
                      { label: "上へ", disabled: !canMove("photo", -1), onClick: () => moveFig("photo", -1) },
                      { label: "下へ", disabled: !canMove("photo", 1), onClick: () => moveFig("photo", 1) },
                      { label: "写真を削除", onClick: removePhoto },
                    ]
                  : [{ label: "写真を削除", onClick: removePhoto }]
              }
            />
          );
        }
        // 図があるときは、1 つ目の欄も 2 行から（図・写真が無いときだけ最初の高さ）
        const rows = firstText && figures.length === 0 && !photo ? ROWS[variant] : 2;
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
      {isFree ? (
        <div className="freeadd">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addText}>
            ＋ 文字
          </button>
          <button type="button" disabled={atLimit} onMouseDown={(e) => e.preventDefault()} onClick={startNew}>
            ＋ 図
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} disabled={atPhotoLimit} onClick={startPhoto}>
            ＋ 写真
          </button>
        </div>
      ) : (
        <div className="refl-addrow">
          <button type="button" className="refl-add" disabled={atLimit} onMouseDown={(e) => e.preventDefault()} onClick={startNew}>
            <IconPlus width={18} height={18} />
            図を入れる
          </button>
          <button type="button" className="refl-add" disabled={atPhotoLimit} onMouseDown={(e) => e.preventDefault()} onClick={startPhoto}>
            <IconPlus width={18} height={18} />
            写真を入れる
          </button>
        </div>
      )}
      {/* 画像だけ。capture は付けない（カメラと写真の一覧の両方から選べる） */}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoFile} />
      {atPhotoLimit && <div className="refl-limit">写真は 1 つのノートに 1 枚までです</div>}
      {atLimit && <div className="refl-limit">図は 1 つのノートに {MAX_FIGS} 枚までです</div>}
      {editing && <FigureEditor initial={editing.fig} onDone={finish} onCancel={() => setEditing(null)} />}
    </div>
  );
}
