"use client";

import { useEffect, useState } from "react";
import { clearNoteDraft, loadNoteDraft, saveNoteDraft } from "@/lib/storage";
import { localDateStr } from "@/lib/dates";
import { IconAlertCircle } from "../icons";

/* 作成フォームの共通部品（下書き・日付・保存失敗の 1 行）。NotebookScreen と FreeNoteForm の両方から使う（循環 import を避けるため分けた） */

export function todayStr(): string {
  return localDateStr();
}

/**
 * フォーム下書きの自動保存（新規作成時のみ。編集時は key=null で無効）。
 * 入力が止まって600ms後に localStorage へ退避し、再訪時に復元バナーを出す。
 */
export function useNoteDraft<T>(key: string | null, snapshot: T, hasContent: boolean) {
  const [pending, setPending] = useState<T | null>(() => (key ? loadNoteDraft<T>(key) : null));
  useEffect(() => {
    if (!key || !hasContent) return;
    const t = setTimeout(() => {
      // 重くて保存できなかったら、写真を外して保存し直す（入力は画面に残る。下書きから写真だけが減る）
      if (!saveNoteDraft(key, snapshot) && snapshot && typeof snapshot === "object" && "photo" in snapshot) {
        saveNoteDraft(key, { ...(snapshot as object), photo: undefined });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [key, snapshot, hasContent]);
  return {
    /** 復元可能な下書き（バナー表示用） */
    pending,
    /** 復元した/しないに関わらずバナーを閉じる */
    dismiss: () => setPending(null),
    /** 下書きを破棄してバナーも閉じる */
    discard: () => {
      if (key) clearNoteDraft(key);
      setPending(null);
    },
    /** 提出完了時に呼ぶ（下書き削除） */
    clear: () => {
      if (key) clearNoteDraft(key);
    },
  };
}

export function DraftBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="aibox" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 0, marginBottom: 12 }}>
      <span style={{ flex: 1 }}>書きかけの下書きがあります</span>
      <button type="button" className="dynadd" style={{ width: "auto", marginTop: 0 }} onClick={onRestore}>
        続きから書く
      </button>
      <button type="button" className="dynadd" style={{ width: "auto", marginTop: 0 }} onClick={onDiscard}>
        破棄
      </button>
    </div>
  );
}

/** note-reflection-figure §5: 日付の小さな入力（文字 12px・灰。当たりは 44px） */
export function DateMini({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="datemini">
      <input type="date" aria-label="日付" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** note-reflection-figure §6: 保存できなかったときの 1 行（「提出する」の上） */
export function SaveErr() {
  return (
    <div className="saveerr" role="alert">
      <IconAlertCircle width={20} height={20} aria-hidden="true" />
      <span>
        <span className="nobreak">保存できませんでした。</span>
        <span className="nobreak">図や写真を減らしてください</span>
      </span>
    </div>
  );
}
