"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR_CHOICES } from "@/lib/groups";
import { categoryNoteTarget } from "@/lib/calendarUtils";
import { useBoard } from "../../BoardProvider";
import { useTeam } from "../../TeamProvider";
import { E } from "../../Emoji";
import { IconEdit } from "../../icons";
import { ColorChoiceList } from "../ColorChoiceList";
import type { ManageProps } from "./types";

/** 新しいカテゴリの色の既定値（calendar-plan-a §11-3「新規の既定はブルー」） */
const DEFAULT_CATEGORY_COLOR = COLOR_CHOICES.find((p) => p.name === "ブルー")!.color;

/**
 * 種類の管理（p16 §4: 旧「カテゴリ管理」）。TeamHub の管理シートと設定の下層で同じ中身を出す。
 * データは useTeam() から読み書きするので、どちらから変えても同期する。
 */
export function CategoriesManage({ hideTitle }: ManageProps) {
  const board = useBoard();
  const team = useTeam();
  // カテゴリ管理
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatColor, setNewCatColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catEditLabel, setCatEditLabel] = useState("");
  const [catEditColor, setCatEditColor] = useState("");
  // p16 §5-2: 種類ごとの「サッカーノートに反映する」（編集行・新規追加）
  const [catEditNote, setCatEditNote] = useState(false);
  const [newCatNote, setNewCatNote] = useState(false);
  // レビュー指摘対応（calendar-plan-a §11-3）: グループ管理と同じ作り（ColorChoiceListが
  // 縦に長い）なので、編集行を開いたときに同じくスクロールして見える位置に寄せる
  const catEditRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (catEditId) catEditRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [catEditId]);

  return (
    <>
      {!hideTitle && <h2>種類の管理</h2>}
      <div className="list">
        {team.categories.map((c) => (
          <div key={c.id} className="catrow">
            {catEditId === c.id ? (
              <div style={{ flex: 1 }} ref={catEditRowRef}>
                {c.builtin ? (
                  <div className="cmpnm" style={{ marginBottom: 8 }}>
                    {c.label}
                  </div>
                ) : (
                  // 統括調整: 名前の入力欄は .formfield に入れてフォームと同じ見た目にする（素の input のままだった）
                  <div className="formfield" style={{ margin: "0 0 8px" }}>
                    <label>名前</label>
                    <input value={catEditLabel} onChange={(e) => setCatEditLabel(e.target.value)} autoFocus />
                  </div>
                )}
                {/* calendar-plan-a §11-3: 色の選択肢をiPhoneカレンダー式の縦リストにする */}
                <ColorChoiceList value={catEditColor} onChange={setCatEditColor} />
                {/* p16 §5-2: 組込み（練習・試合）も色とこのトグルは変えられる */}
                <div className="formfield" style={{ margin: "10px 0 0" }}>
                  <label className="daytoggle notetoggle">
                    <input type="checkbox" checked={catEditNote} onChange={(e) => setCatEditNote(e.target.checked)} />
                    <span />
                    サッカーノートに反映する
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    className="bigbtn"
                    style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                    onClick={() => {
                      if (!c.builtin && !catEditLabel.trim()) {
                        board.toast("名前を入力してください");
                        return;
                      }
                      team.updateCategory({
                        id: c.id,
                        label: c.builtin ? c.label : catEditLabel.trim(),
                        color: catEditColor,
                        noteTarget: catEditNote,
                      });
                      setCatEditId(null);
                    }}
                  >
                    保存する
                  </button>
                  <button
                    className="bigbtn ghost"
                    style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                    onClick={() => setCatEditId(null)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: c.color,
                    flex: "0 0 auto",
                    display: "inline-block",
                  }}
                />
                <div className="cmpinfo">
                  <div className="cmpnm">{c.label}</div>
                  {/* p16 §5-2: サッカーノートへの反映（実効値）を名前の下に出す */}
                  <div className="cmpsub">
                    {c.builtin ? "名前固定・" : ""}サッカーノート：{categoryNoteTarget(c) ? "反映する" : "反映しない"}
                  </div>
                </div>
                <button
                  className="msgdel"
                  aria-label="編集"
                  onClick={() => {
                    setCatEditId(c.id);
                    setCatEditLabel(c.label);
                    setCatEditColor(c.color);
                    setCatEditNote(categoryNoteTarget(c));
                  }}
                >
                  <IconEdit />
                </button>
                {!c.builtin && (
                  <button
                    className="msgdel"
                    aria-label="削除"
                    onClick={() => {
                      if (
                        window.confirm(
                          `「${c.label}」を削除しますか？（予定は残ります。種類なしになります）`
                        )
                      )
                        team.removeCategory(c.id);
                    }}
                  >
                    <E n="trash" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="formfield">
        <label>新しい種類を追加</label>
        <input
          value={newCatLabel}
          onChange={(e) => setNewCatLabel(e.target.value)}
          placeholder="例）遠征・合宿 / 保護者会"
        />
        {/* calendar-plan-a §11-3: 色の選択肢をiPhoneカレンダー式の縦リストにする */}
        <ColorChoiceList value={newCatColor} onChange={setNewCatColor} />
        <label className="daytoggle notetoggle">
          <input type="checkbox" checked={newCatNote} onChange={(e) => setNewCatNote(e.target.checked)} />
          <span />
          サッカーノートに反映する
        </label>
      </div>
      <button
        className="bigbtn"
        onClick={() => {
          if (!newCatLabel.trim()) {
            board.toast("名前を入力してください");
            return;
          }
          team.addCategory(newCatLabel, newCatColor, newCatNote);
          setNewCatLabel("");
          setNewCatColor(DEFAULT_CATEGORY_COLOR);
          setNewCatNote(false);
        }}
      >
        追加する
      </button>
    </>
  );
}
