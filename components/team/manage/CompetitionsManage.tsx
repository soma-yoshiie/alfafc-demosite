"use client";

import { useState } from "react";
import { useBoard } from "../../BoardProvider";
import { useTeam } from "../../TeamProvider";
import { E } from "../../Emoji";
import { IconEdit } from "../../icons";
import type { ManageProps } from "./types";

/** 大会の登録・管理。TeamHub の管理シートと設定の下層で同じ中身を出す（データは useTeam()） */
export function CompetitionsManage({ hideTitle }: ManageProps) {
  const board = useBoard();
  const team = useTeam();
  // 大会管理
  const [mgrComp, setMgrComp] = useState("");
  // p15 §3: 大会の行のインライン編集（種目管理の testEdit* と同じ作り。同時に編集できるのは 1 行）
  const [compEditId, setCompEditId] = useState<string | null>(null);
  const [compEditName, setCompEditName] = useState("");
  const [compEditNote, setCompEditNote] = useState("");

  return (
    <>
      {!hideTitle && <h2>大会の登録・管理</h2>}
      <div className="formfield">
        <label>新しい大会を登録</label>
        <div className="dynrow">
          <input
            value={mgrComp}
            onChange={(e) => setMgrComp(e.target.value)}
            placeholder="例）秋季リーグ U-12 / 〇〇カップ"
          />
          <button
            className="dynadd"
            style={{ width: "auto", flex: "0 0 auto", padding: "0 14px" }}
            onClick={() => {
              if (!mgrComp.trim()) return;
              team.addCompetition(mgrComp);
              setMgrComp("");
            }}
          >
            登録
          </button>
        </div>
      </div>
      <div className="list">
        {team.team.competitions.length === 0 ? (
          <div className="empty-msg">登録された大会はありません。</div>
        ) : (
          team.team.competitions.map((c) => {
            const n = team.team.matches.filter((m) => m.competitionId === c.id).length;
            return (
              <div key={c.id} className="cmprow">
                {/* p15 §3: 編集中の行は入力欄 2 つ＋保存／キャンセル（体力測定の種目管理と同じクラス） */}
                {compEditId === c.id ? (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 統括調整: 入力欄は .formfield に入れてフォームと同じ見た目にする（素の input のままだった） */}
                    <div className="formfield" style={{ margin: "0 0 8px" }}>
                      <label>大会名</label>
                      <input
                        value={compEditName}
                        onChange={(e) => setCompEditName(e.target.value)}
                        placeholder="大会名"
                        autoFocus
                      />
                    </div>
                    <div className="formfield" style={{ margin: 0 }}>
                      <label>メモ（期間・会場など）</label>
                      <input
                        value={compEditNote}
                        onChange={(e) => setCompEditNote(e.target.value)}
                        placeholder="例）4〜6月・市内リーグ"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        className="bigbtn"
                        style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                        onClick={() => {
                          if (!compEditName.trim()) {
                            board.toast("大会名を入力してください");
                            return;
                          }
                          team.updateCompetition({ id: c.id, name: compEditName, note: compEditNote });
                          setCompEditId(null);
                        }}
                      >
                        保存する
                      </button>
                      <button
                        className="bigbtn ghost"
                        style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                        onClick={() => setCompEditId(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="cmpinfo">
                      <div className="cmpnm">{c.name}</div>
                      <div className="cmpsub">
                        {n}試合{c.note ? ` ・ ${c.note}` : ""}
                      </div>
                    </div>
                    <button
                      className="msgdel"
                      aria-label="大会を編集"
                      onClick={() => {
                        setCompEditId(c.id);
                        setCompEditName(c.name);
                        setCompEditNote(c.note ?? "");
                      }}
                    >
                      <IconEdit />
                    </button>
                    <button
                      className="msgdel"
                      onClick={() => {
                        if (window.confirm(`「${c.name}」を削除しますか？（試合記録は残ります）`))
                          team.removeCompetition(c.id);
                      }}
                    >
                      <E n="trash" />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
