"use client";

import { useId } from "react";
import type { Player, TeamGroup } from "@/lib/types";
import { dmThreadKey, groupThreadKey } from "@/lib/types";
import { GroupChips } from "./GroupChips";

export interface SendTarget {
  mode: "none" | "team" | "player" | "group";
  playerId?: string;
  /** mode==="group" のときの宛先グループ（複数可。groups-phase2 §5-4） */
  groupIds?: string[];
}

/**
 * 送信先を会話キーの配列に変換（groups-phase2 §5-4）。グループは選んだ各グループ宛へ複数キーになる。
 * 送信しない・宛先未確定（グループ未選択など）なら空配列。
 */
export function targetThreadKeys(t: SendTarget): string[] {
  if (t.mode === "team") return ["team"];
  if (t.mode === "player" && t.playerId) return [dmThreadKey(t.playerId)];
  if (t.mode === "group" && t.groupIds && t.groupIds.length > 0) return t.groupIds.map(groupThreadKey);
  return [];
}

/** 戦術/トレーニング保存時の「送信先」セレクタ */
export function SendTargetField({
  players,
  groups,
  value,
  onChange,
  allowNone = true,
}: {
  players: Player[];
  /** groups-phase2 §5-4: 宛先「グループ」の選択肢。グループが1つも無ければ選択肢ごと出さない */
  groups: TeamGroup[];
  value: SendTarget;
  onChange: (t: SendTarget) => void;
  /** false のとき「送信しない」を出さない（送信専用シート向け） */
  allowNone?: boolean;
}) {
  // フィールドごとに一意な radio グループ名（複数箇所で再利用されても衝突しない）
  const groupName = "sendtgt-" + useId();
  return (
    <div className="formfield">
      <label>{allowNone ? "送信先（任意・選手アプリに届きます）" : "送信先（選手アプリに届きます）"}</label>
      <div className="sendtgt">
        {allowNone && (
          <label className={value.mode === "none" ? "on" : ""}>
            <input
              type="radio"
              name={groupName}
              checked={value.mode === "none"}
              onChange={() => onChange({ mode: "none" })}
            />
            送信しない
          </label>
        )}
        <label className={value.mode === "team" ? "on" : ""}>
          <input
            type="radio"
            name={groupName}
            checked={value.mode === "team"}
            onChange={() => onChange({ mode: "team" })}
          />
          チーム全員
        </label>
        <label className={value.mode === "player" ? "on" : ""}>
          <input
            type="radio"
            name={groupName}
            checked={value.mode === "player"}
            onChange={() =>
              onChange({ mode: "player", playerId: value.playerId ?? players[0]?.id })
            }
          />
          個人
        </label>
        {groups.length > 0 && (
          <label className={value.mode === "group" ? "on" : ""}>
            <input
              type="radio"
              name={groupName}
              checked={value.mode === "group"}
              onChange={() => onChange({ mode: "group", groupIds: value.groupIds ?? [] })}
            />
            グループ
          </label>
        )}
      </div>
      {value.mode === "player" && (
        <select
          style={{ marginTop: 8 }}
          value={value.playerId ?? ""}
          onChange={(e) => onChange({ mode: "player", playerId: e.target.value })}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.number != null ? `（#${p.number}）` : ""}
            </option>
          ))}
        </select>
      )}
      {value.mode === "group" && (
        <div style={{ marginTop: 8 }}>
          <GroupChips
            groups={groups}
            value={value.groupIds ?? []}
            onChange={(ids) => onChange({ mode: "group", groupIds: ids })}
            multi
          />
        </div>
      )}
    </div>
  );
}
