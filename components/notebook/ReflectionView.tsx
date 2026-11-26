"use client";

import { useState } from "react";
import type { NoteFigure, NotePhoto, NotebookEntry } from "@/lib/types";
import { figureHasStaff, splitBody } from "@/lib/figures";
import { useBoard } from "../BoardProvider";
import { FigureEditor } from "./FigureEditor";
import { FigureView } from "./FigureView";
import { PhotoBox } from "./PhotoBlock";

/* note-reflection-figure §7・note-free §3・§5: 本文と図・写真を splitBody の順に見せる（詳細・選手とスタッフの両方）。
   スタッフの線がある図の上には切り替え、スタッフには「描き足す」 */

type Layer = "mine" | "staff" | "both";

/** 見せる層だけの図（下敷きはいつも残す） */
function layerOf(f: NoteFigure, layer: Layer): NoteFigure {
  if (layer === "both") return f;
  const keep = (by?: "staff") => (layer === "staff" ? by === "staff" : by !== "staff");
  return {
    ...f,
    lines: f.lines.filter((l) => keep(l.by)),
    marks: f.marks.filter((m) => keep(m.by)),
    texts: f.texts.filter((t) => keep(t.by)),
  };
}

function ViewFigure({
  fig,
  no,
  viewer,
  ownNote,
  onDraw,
}: {
  fig: NoteFigure;
  no: number;
  viewer?: "player" | "staff";
  ownNote?: boolean;
  onDraw?: () => void;
}) {
  const [layer, setLayer] = useState<Layer>("both");
  const staffLines = figureHasStaff(fig);
  return (
    <div className="figwrap">
      {staffLines && (
        <div className="figswitch" role="group" aria-label="スタッフの図の見せ方">
          {(
            [
              ["mine", viewer === "staff" || !ownNote ? "選手の図" : "自分の図"],
              ["staff", "スタッフの図"],
              ["both", "重ねる"],
            ] as [Layer, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" className={`canvaschip${layer === k ? " on" : ""}`} aria-pressed={layer === k} onClick={() => setLayer(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="figbox view">
        <FigureView fig={layerOf(fig, layer)} />
        <span className="figbox-cap">図 {no}</span>
      </div>
      {onDraw && (
        <button type="button" className="figstaff" onClick={onDraw}>
          {/* コメントの欄の「＋ ピッチに描いて伝える」（別のピッチ）と区別できるよう、どの図に描くのかを書く */}
          {staffLines ? "描き足しを直す" : "この図に描き足す"}
        </button>
      )}
    </div>
  );
}

export function ReflectionView({
  body,
  figures,
  photo,
  noteId,
  viewer,
  ownNote,
}: {
  body?: string;
  figures?: NoteFigure[];
  photo?: NotePhoto;
  /** 詳細のとき：ノートの id（スタッフの描き足し・写真を消すに使う） */
  noteId?: string;
  viewer?: "player" | "staff";
  /** 自分のノートの詳細：写真の下に「写真を消す」 */
  ownNote?: boolean;
}) {
  const board = useBoard();
  const [drawing, setDrawing] = useState<NoteFigure | null>(null);
  const blocks = splitBody(body ?? "", figures, photo);
  let n = 0;

  /** スタッフの描き足しの「完了」。保存できなかったら false を返す（作図の画面は閉じず、その中で知らせる） */
  const finishDraw = (res: NoteFigure | null): boolean => {
    const target = drawing;
    const entry = noteId ? board.notebook.find((x) => x.id === noteId) : undefined;
    if (!target || !res || !noteId || !entry) {
      setDrawing(null);
      return true;
    }
    const next = (figures ?? []).map((f) => (f.id === target.id ? { ...res, at: f.at } : f));
    // スタッフのコメントがあるときは、コメントの時刻を今に（選手側で新着として出る）
    const ok = board.updateNote({ ...entry, figures: next, ...(entry.staffComment ? { staffCommentTs: Date.now() } : {}) } as NotebookEntry);
    if (!ok) return false;
    setDrawing(null);
    board.toast("図を送りました");
    return true;
  };

  // 写真だけの自由ノートは、写真を消すと中身の無いノートが残るので「写真を消す」を出さない
  const own = noteId ? board.notebook.find((x) => x.id === noteId) : undefined;
  const photoOnly =
    own?.kind === "free" && !own.title?.trim() && !own.body?.trim() && (own.figures?.length ?? 0) === 0;

  const removePhoto = () => {
    if (!noteId) return;
    if (!window.confirm("写真を消しますか？文字と図は残ります。")) return;
    board.patchNote(noteId, { photo: undefined });
  };

  return (
    <>
      {blocks.map((b, i) =>
        b.type === "text" ? (
          b.text.trim() ? (
            <div key={i} className="notesec-b">
              {b.text}
            </div>
          ) : null
        ) : b.type === "fig" ? (
          <ViewFigure
            key={b.fig.id}
            fig={b.fig}
            no={++n}
            viewer={viewer}
            ownNote={ownNote}
            onDraw={viewer === "staff" && noteId ? () => setDrawing(b.fig) : undefined}
          />
        ) : (
          <div key="photo" className="photowrap">
            <PhotoBox photo={b.photo} />
            {ownNote && noteId && !photoOnly && (
              <button type="button" className="photodel" onClick={removePhoto}>
                写真を消す
              </button>
            )}
          </div>
        )
      )}
      {drawing && <FigureEditor initial={drawing} as="staff" onDone={finishDraw} onCancel={() => setDrawing(null)} />}
    </>
  );
}
