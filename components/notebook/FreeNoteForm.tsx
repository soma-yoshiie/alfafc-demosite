"use client";

import { useState } from "react";
import type { FreeNote, NoteFigure, NotePhoto } from "@/lib/types";
import { trimBody } from "@/lib/figures";
import { useBoard } from "../BoardProvider";
import { DateMini, DraftBanner, SaveErr, todayStr, useNoteDraft } from "./formParts";
import { ReflectionField } from "./ReflectionField";

/* note-free §2: 自由ノートの作成・編集。題名 → 本文・図（ReflectionField の free）→ 提出。
   コンディション・今週の目標の帯・達成度・共有は出さない。予定・目標にはひも付けない */

type FreeDraft = { date: string; title: string; body: string; figures?: NoteFigure[]; photo?: NotePhoto };

export function FreeNoteForm({ edit, onDone }: { edit?: FreeNote; onDone: () => void }) {
  const board = useBoard();
  const me = board.auth.playerId ?? "";
  const [date, setDate] = useState(edit?.date ?? todayStr());
  const [title, setTitle] = useState(edit?.title ?? "");
  const [body, setBody] = useState(edit?.body ?? "");
  const [figures, setFigures] = useState<NoteFigure[]>(edit?.figures ?? []);
  const [photo, setPhoto] = useState<NotePhoto | undefined>(edit?.photo);
  const [saveErr, setSaveErr] = useState(false);

  const hasContent = !!(title.trim() || body.trim() || figures.length || !!photo);
  const draft = useNoteDraft<FreeDraft>(edit ? null : `free:${me}`, { date, title, body, figures, photo }, hasContent);
  const restoreDraft = () => {
    const d = draft.pending;
    if (!d) return;
    setDate(d.date);
    setTitle(d.title);
    setBody(d.body);
    setFigures(d.figures ?? []);
    setPhoto(d.photo);
    draft.dismiss();
  };

  const submit = () => {
    const tb = trimBody(body, figures, photo);
    if (!title.trim() && !tb.body && tb.figures.length === 0 && !tb.photo) {
      board.toast("題名か本文を入力してください");
      return;
    }
    const base = {
      playerId: me,
      kind: "free" as const,
      date,
      title: title.trim() || undefined,
      body: tb.body || undefined,
      figures: tb.figures.length ? tb.figures : undefined,
      photo: tb.photo,
    };
    let ok = edit ? board.updateNote({ ...edit, ...base }) : board.addNote(base);
    // 下書きにも同じ写真が入っているので、新規で失敗したら下書きを消してもう一度だけ試す
    if (!ok && !edit) {
      draft.clear();
      ok = board.addNote(base);
    }
    if (!ok) {
      setSaveErr(true);
      return;
    }
    setSaveErr(false);
    draft.clear();
    onDone();
  };

  return (
    <div className="noteform freeform">
      <div className="freehead">
        <h2>{edit ? "自由ノートを編集" : "自由ノート"}</h2>
        <DateMini value={date} onChange={setDate} />
      </div>
      {draft.pending && !hasContent && <DraftBanner onRestore={restoreDraft} onDiscard={draft.discard} />}
      <div className="formfield">
        <label htmlFor="free-title">題名</label>
        <input id="free-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）コーナーキックの動き方" />
      </div>
      <ReflectionField
        body={body}
        figures={figures}
        photo={photo}
        variant="free"
        onToast={board.toast}
        onChange={(v) => {
          setBody(v.body);
          setFigures(v.figures);
          setPhoto(v.photo);
        }}
      />
      {saveErr && <SaveErr />}
      <button className="bigbtn" onClick={submit}>
        {edit ? "更新する" : "提出する"}
      </button>
    </div>
  );
}
