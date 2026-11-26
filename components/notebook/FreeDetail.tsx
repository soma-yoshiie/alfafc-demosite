"use client";

import type { FreeNote } from "@/lib/types";
import { ReflectionView } from "./ReflectionView";

/* note-free §4: 自由ノートの詳細。題名（17px・700）→ 本文・図（ReflectionView）。
   「メモ」「振り返り」の見出しは出さない。スタッフのコメントは NoteDetail の共通の所 */
export function FreeDetail({ note, viewer, ownNote }: { note: FreeNote; viewer?: "player" | "staff"; ownNote?: boolean }) {
  return (
    <div className="freedetail">
      {note.title?.trim() && <h3 className="freedetail-t">{note.title}</h3>}
      <ReflectionView body={note.body} figures={note.figures} photo={note.photo} noteId={note.id} viewer={viewer} ownNote={ownNote} />
    </div>
  );
}
