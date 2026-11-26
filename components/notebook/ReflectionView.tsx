"use client";

import type { NoteFigure } from "@/lib/types";
import { splitBody } from "@/lib/figures";
import { FigureView } from "./FigureView";

/** note-reflection-figure §7: 本文と図を splitBody の順に見せる（詳細・選手とスタッフの両方） */
export function ReflectionView({ body, figures }: { body?: string; figures?: NoteFigure[] }) {
  const blocks = splitBody(body ?? "", figures);
  let n = 0;
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "text" ? (
          b.text.trim() ? (
            <div key={i} className="notesec-b">
              {b.text}
            </div>
          ) : null
        ) : (
          <div key={b.fig.id} className="figbox view">
            <FigureView fig={b.fig} />
            <span className="figbox-cap">図 {++n}</span>
          </div>
        )
      )}
    </>
  );
}
