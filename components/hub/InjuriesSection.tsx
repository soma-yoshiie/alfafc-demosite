"use client";

import React, { useState } from "react";
import type { InjuryRecord, InjuryStatus } from "@/lib/types";
import { INJURY_STATUS_LABEL } from "@/lib/types";
import { newRecordId } from "@/lib/profile";
import { localDateStr } from "@/lib/dates";
import { useBoard } from "../BoardProvider";
import { Field, HubAdd, HubEmpty, HubHead, HubRowBtn, HubSheet, Seg, SheetSave, fmtYMD } from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「怪我」（player-hub §3-8）：既存 Player.injuries の一覧（日付・部位・状態・メモ）と
 * 「＋ 怪我を追加」「編集」「削除」。フォームは SheetManager の InjuryForm と同じ項目（日付の初期値は localDateStr）。
 * 保存は最新の Player を base に board.updatePlayer で行う。
 */

const STATUS_CLASS: Record<InjuryStatus, string> = { out: "out", recovering: "rec", ok: "ok" };

export default function InjuriesSection({ p }: HubSectionProps) {
  const board = useBoard();
  const [form, setForm] = useState<{ edit?: InjuryRecord } | null>(null);
  const list = [...(p.injuries ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  /** 最新の Player を base に injuries だけ差し替える（開いている間に足した体力測定などを消さない） */
  const commit = (injuries: InjuryRecord[]) => {
    const live = board.state.players.find((x) => x.id === p.id) ?? p;
    board.updatePlayer({ ...live, injuries });
  };

  const remove = (r: InjuryRecord) => {
    if (!window.confirm(`${fmtYMD(r.date)} の怪我の記録（${r.area}）を削除しますか？`)) return;
    commit((p.injuries ?? []).filter((x) => x.id !== r.id));
  };

  return (
    <section className="phubsec" aria-label="怪我">
      <HubHead title="怪我" sub="怪我の履歴" />
      <HubAdd onClick={() => setForm({})}>怪我を追加</HubAdd>
      {list.length === 0 ? (
        <HubEmpty hint="怪我をしたときは「怪我を追加」から記録します。復帰の目安もメモに残せます。" />
      ) : (
        <div className="phublist">
          {list.map((r) => (
            <div className="phubrow" key={r.id}>
              <div className="phubrow-main">
                <b>
                  {fmtYMD(r.date)}
                  <span className={`phubtag st-${STATUS_CLASS[r.status]}`}>{INJURY_STATUS_LABEL[r.status]}</span>
                </b>
                <span>{r.area}</span>
                {r.note && <small>{r.note}</small>}
              </div>
              <div className="phubrow-act">
                <HubRowBtn label={`${r.area} の怪我を編集`} onClick={() => setForm({ edit: r })}>
                  編集
                </HubRowBtn>
                <HubRowBtn danger label={`${r.area} の怪我を削除`} onClick={() => remove(r)}>
                  削除
                </HubRowBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <InjuryFormSheet
          edit={form.edit}
          onClose={() => setForm(null)}
          onSave={(rec) => {
            const cur = p.injuries ?? [];
            commit(form.edit ? cur.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...cur]);
            setForm(null);
          }}
        />
      )}
    </section>
  );
}

function InjuryFormSheet({
  edit,
  onSave,
  onClose,
}: {
  edit?: InjuryRecord;
  onSave: (rec: InjuryRecord) => void;
  onClose: () => void;
}) {
  const board = useBoard();
  const [date, setDate] = useState(edit?.date ?? localDateStr());
  const [status, setStatus] = useState<InjuryStatus>(edit?.status ?? "recovering");
  const [area, setArea] = useState(edit?.area ?? "");
  const [note, setNote] = useState(edit?.note ?? "");

  const save = () => {
    if (!date) return board.toast("受傷日を入力してください");
    if (!area.trim()) return board.toast("部位・内容を入力してください");
    onSave({
      id: edit?.id ?? newRecordId("inj"),
      date,
      area: area.trim(),
      status,
      note: note.trim() || undefined,
    });
  };

  return (
    <HubSheet title={edit ? "怪我を編集" : "怪我を追加"} onClose={onClose}>
      <Field label="受傷日">
        <input aria-label="受傷日" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="状態">
        <Seg<InjuryStatus>
          ariaLabel="状態"
          value={status}
          onChange={(v) => v && setStatus(v)}
          options={[
            { value: "out", label: INJURY_STATUS_LABEL.out },
            { value: "recovering", label: INJURY_STATUS_LABEL.recovering },
            { value: "ok", label: INJURY_STATUS_LABEL.ok },
          ]}
        />
      </Field>
      <Field label="部位・内容">
        <input aria-label="部位・内容" value={area} onChange={(e) => setArea(e.target.value)} placeholder="例）右足首 捻挫" />
      </Field>
      <Field label="メモ（復帰予定など）">
        <input aria-label="メモ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）来週フル合流予定" />
      </Field>
      <SheetSave onClick={save} />
    </HubSheet>
  );
}
