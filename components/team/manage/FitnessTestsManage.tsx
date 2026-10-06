"use client";

import { useState } from "react";
import { useBoard } from "../../BoardProvider";
import { useTeam } from "../../TeamProvider";
import { E } from "../../Emoji";
import { IconEdit } from "../../icons";
import type { ManageProps } from "./types";

/**
 * 体力測定：種目管理（R4b）。カテゴリ管理と同じ構造(一覧+インライン編集+追加フォーム)。
 * 記録が残っている種目の削除はteam.removeFitnessTest内でガードし、失敗時はboard.toastで案内する
 */
export function FitnessTestsManage({ hideTitle }: ManageProps) {
  const board = useBoard();
  const team = useTeam();
  // 体力測定：種目管理（カテゴリ管理[2938行目付近]と同じ構造で編集/削除/追加）
  const [newTestName, setNewTestName] = useState("");
  const [newTestUnit, setNewTestUnit] = useState("");
  const [newTestLower, setNewTestLower] = useState(false);
  const [testEditId, setTestEditId] = useState<string | null>(null);
  const [testEditName, setTestEditName] = useState("");
  const [testEditUnit, setTestEditUnit] = useState("");
  const [testEditLower, setTestEditLower] = useState(false);

  return (
    <>
      {!hideTitle && <h2>種目を管理</h2>}
      <div className="list">
        {(team.team.fitnessTests ?? []).length === 0 && (
          <div className="empty-msg">登録された種目はありません。</div>
        )}
        {(team.team.fitnessTests ?? []).map((t) => (
          <div key={t.id} className="catrow">
            {testEditId === t.id ? (
              <div style={{ flex: 1 }}>
                <input
                  value={testEditName}
                  onChange={(e) => setTestEditName(e.target.value)}
                  style={{ marginBottom: 8 }}
                  autoFocus
                />
                <div className="formgrid">
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label>単位</label>
                    <input value={testEditUnit} onChange={(e) => setTestEditUnit(e.target.value)} />
                  </div>
                  <div className="formfield" style={{ flex: 1, margin: 0 }}>
                    <label className="daytoggle">
                      <input
                        type="checkbox"
                        checked={testEditLower}
                        onChange={(e) => setTestEditLower(e.target.checked)}
                      />
                      <span />
                      小さい方が良い
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    className="bigbtn"
                    style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                    onClick={() => {
                      if (!testEditName.trim() || !testEditUnit.trim()) {
                        board.toast("種目名と単位を入力してください");
                        return;
                      }
                      team.updateFitnessTest({
                        id: t.id,
                        name: testEditName.trim(),
                        unit: testEditUnit.trim(),
                        lowerIsBetter: testEditLower || undefined,
                      });
                      setTestEditId(null);
                    }}
                  >
                    保存する
                  </button>
                  <button
                    className="bigbtn ghost"
                    style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                    onClick={() => setTestEditId(null)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="cmpinfo">
                  <div className="cmpnm">
                    {t.name}
                    {/* player-hub §1-4: 新体力テストの種目の印（小さなタグ。個人ページの「体力」の種目カードと同じ見た目） */}
                    {t.standardKey && <span className="phubtag">新体力テスト</span>}
                  </div>
                  <div className="cmpsub">
                    単位: {t.unit}
                    {t.lowerIsBetter ? " ・ 小さい方が良い" : ""}
                  </div>
                </div>
                <button
                  className="msgdel"
                  aria-label="編集"
                  onClick={() => {
                    setTestEditId(t.id);
                    setTestEditName(t.name);
                    setTestEditUnit(t.unit);
                    setTestEditLower(!!t.lowerIsBetter);
                  }}
                >
                  <IconEdit />
                </button>
                <button
                  className="msgdel"
                  aria-label="削除"
                  onClick={() => {
                    if (window.confirm(`「${t.name}」を削除しますか？`)) team.removeFitnessTest(t.id);
                  }}
                >
                  <E n="trash" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="formfield">
        <label>新しい種目を追加</label>
        <input
          value={newTestName}
          onChange={(e) => setNewTestName(e.target.value)}
          placeholder="例）50m走 / 立ち幅跳び"
        />
      </div>
      <div className="formgrid">
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label>単位</label>
          <input value={newTestUnit} onChange={(e) => setNewTestUnit(e.target.value)} placeholder="例）秒 / cm / 回" />
        </div>
        <div className="formfield" style={{ flex: 1, margin: 0 }}>
          <label className="daytoggle">
            <input type="checkbox" checked={newTestLower} onChange={(e) => setNewTestLower(e.target.checked)} />
            <span />
            小さい方が良い
          </label>
        </div>
      </div>
      <button
        className="bigbtn"
        onClick={() => {
          if (!newTestName.trim() || !newTestUnit.trim()) {
            board.toast("種目名と単位を入力してください");
            return;
          }
          team.addFitnessTest(newTestName, newTestUnit, newTestLower || undefined);
          setNewTestName("");
          setNewTestUnit("");
          setNewTestLower(false);
        }}
      >
        追加する
      </button>
    </>
  );
}
