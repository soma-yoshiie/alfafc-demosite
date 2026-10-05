"use client";

import { useEffect, useRef, useState } from "react";
import { useBoard } from "../BoardProvider";
import { fileToEmblemDataUrl } from "@/lib/imageResize";
import type { SettingsFormProps } from "./settingsTypes";

/** チーム名とエンブレム（§3-2）。チーム名は保存ボタンで確定、エンブレムの選択・削除はその場で反映する */
export default function TeamBasicsForm({ pc, onDirty, saveRef, onDone }: SettingsFormProps) {
  const board = useBoard();
  const [name, setName] = useState(board.state.teamName ?? "");
  const emblemInput = useRef<HTMLInputElement | null>(null);

  const dirty = name.trim() !== (board.state.teamName ?? "");
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  function save() {
    board.setTeamName(name.trim());
    board.toast("チーム名を保存しました");
    onDirty(false);
    onDone();
  }
  useEffect(() => {
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  });

  async function onEmblemFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToEmblemDataUrl(file);
      // 保存に失敗しても表示だけ変わる（リロードで消える）ので、成否で文言を変える
      const saved = board.setTeamLogo(dataUrl);
      board.toast(saved ? "エンブレムを更新しました" : "保存容量が足りません。小さい画像をお試しください");
    } catch (err) {
      board.toast(err instanceof Error ? err.message : "画像の読み込みに失敗しました");
    }
  }

  return (
    <div className="st-form">
      <div className="st-field">
        <label htmlFor="st-teamname">チーム名</label>
        <input
          id="st-teamname"
          className="st-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例）アルファラスFC U-12"
        />
        <p className="st-hint">空にすると「マイチーム」と表示されます。</p>
      </div>
      <div className="st-field">
        <label id="st-emblem-label">エンブレム</label>
        <div className="emblemrow" role="group" aria-labelledby="st-emblem-label">
          {board.teamLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="emblemprev" src={board.teamLogo} alt="" />
          ) : (
            <div className="emblemprev empty" aria-hidden="true">
              {(board.state.teamName ?? "マイチーム").trim().charAt(0)}
            </div>
          )}
          <button type="button" className="formbtn" onClick={() => emblemInput.current?.click()}>
            <span className="fb-label">画像を選ぶ</span>
          </button>
          {board.teamLogo && (
            <button
              type="button"
              className="formbtn danger"
              onClick={() => {
                // 元に戻すには再アップロードが必要なため確認する（このアプリの破壊的操作の作法）
                if (!window.confirm("エンブレムを削除しますか？")) return;
                board.setTeamLogo(null);
                board.toast("エンブレムを削除しました");
              }}
            >
              <span className="fb-label">削除</span>
            </button>
          )}
        </div>
        <p className="st-hint">ホーム・レール・設定に表示されます。正方形の画像（PNG／JPG／WebP）を推奨します。</p>
        <input ref={emblemInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onEmblemFile} />
      </div>
      {pc && (
        <button type="button" className="st-btn" onClick={save}>
          保存
        </button>
      )}
    </div>
  );
}
