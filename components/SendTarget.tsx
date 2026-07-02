"use client";

import type { Player } from "@/lib/types";

export interface SendTarget {
  mode: "none" | "team" | "player";
  playerId?: string;
}

/** 送信先を会話キー（"team" / "p:<id>"）に変換。送信しないなら null */
export function targetThreadKey(t: SendTarget): string | null {
  if (t.mode === "team") return "team";
  if (t.mode === "player" && t.playerId) return "p:" + t.playerId;
  return null;
}

/** 戦術/トレーニング保存時の「送信先」セレクタ */
export function SendTargetField({
  players,
  value,
  onChange,
}: {
  players: Player[];
  value: SendTarget;
  onChange: (t: SendTarget) => void;
}) {
  return (
    <div className="formfield">
      <label>送信先（任意・選手アプリに届きます）</label>
      <div className="sendtgt">
        <label className={value.mode === "none" ? "on" : ""}>
          <input
            type="radio"
            checked={value.mode === "none"}
            onChange={() => onChange({ mode: "none" })}
          />
          送信しない
        </label>
        <label className={value.mode === "team" ? "on" : ""}>
          <input
            type="radio"
            checked={value.mode === "team"}
            onChange={() => onChange({ mode: "team" })}
          />
          チーム全員
        </label>
        <label className={value.mode === "player" ? "on" : ""}>
          <input
            type="radio"
            checked={value.mode === "player"}
            onChange={() =>
              onChange({ mode: "player", playerId: value.playerId ?? players[0]?.id })
            }
          />
          個人
        </label>
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
    </div>
  );
}
