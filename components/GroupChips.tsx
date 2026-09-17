"use client";

// グループ選択の共通部品（groups-everywhere §5）。
// 単一選択（絞り込み。例: 名簿の絞り込み）と複数選択（宛先。例: 配信・連絡・予定の対象、
// 選手フォームのグループ欄）の両方をこの1部品でまかなう。見た目は既存の予定フォーム「対象」欄
// （calendar-groups §2 の .grouppick/.grouppick-item）と同じ文法を流用し、新規CSSは追加しない。
// 並び順は呼び出し側が渡す groups の順（TeamProvider.groups は学年グループが先・カスタムが後）。

import { useEffect, useState } from "react";
import type { TeamGroup } from "@/lib/types";
import { loadGroupFilter, saveGroupFilter } from "@/lib/storage";

export function GroupChips({
  groups,
  value,
  onChange,
  allowAll,
  allLabel = "すべて",
  multi = false,
  onManage,
}: {
  groups: TeamGroup[];
  /** 選択中のグループID。単一選択(multi=false)でも配列（0〜1件）で統一する */
  value: string[];
  onChange: (ids: string[]) => void;
  /** 先頭に「すべて／全員」チップを出し、選択0件のときそれをon表示にする */
  allowAll?: boolean;
  allLabel?: string;
  multi?: boolean;
  /** 末尾に「＋ 管理」チップを出す（グループ管理シートを開く） */
  onManage?: () => void;
}) {
  const toggle = (id: string) => {
    if (multi) {
      onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    } else {
      onChange([id]);
    }
  };
  return (
    <div className="grouppick">
      {allowAll && (
        <button
          type="button"
          className={`grouppick-item${value.length === 0 ? " on" : ""}`}
          aria-pressed={value.length === 0}
          onClick={() => onChange([])}
        >
          {allLabel}
        </button>
      )}
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          className={`grouppick-item${value.includes(g.id) ? " on" : ""}`}
          aria-pressed={value.includes(g.id)}
          onClick={() => toggle(g.id)}
        >
          {g.label}
        </button>
      ))}
      {onManage && (
        <button
          type="button"
          className="grouppick-item manage"
          aria-label="グループを管理"
          onClick={onManage}
        >
          ＋ 管理
        </button>
      )}
    </div>
  );
}

/**
 * 画面ごとのグループ絞り込み選択をlocalStorageへ保存するフック（groups-everywhere §5）。
 * key（例: "roster"）ごとに選択（グループIDの配列）を分けて持つ。
 */
export function useGroupFilter(key: string): [string[], (ids: string[]) => void] {
  const [value, setValue] = useState<string[]>(() => loadGroupFilter(key));
  useEffect(() => {
    setValue(loadGroupFilter(key));
    // saveGroupFilterはlocalStorage直書きのみで状態が変わらないため、発火するイベントを
    // 購読して同じkeyの値を読み直す（同じkeyの部品が複数出ていても揃う。alfa-notifseenと同じ作法）
    const onFilterChange = () => setValue(loadGroupFilter(key));
    window.addEventListener("alfa-groupfilter", onFilterChange);
    return () => window.removeEventListener("alfa-groupfilter", onFilterChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const setAndSave = (ids: string[]) => {
    setValue(ids);
    saveGroupFilter(key, ids);
  };
  return [value, setAndSave];
}
