"use client";

import { useState } from "react";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { SettingsGroup } from "./SettingsRows";

const ROLES = ["監督", "コーチ", "スタッフ", "代表", "その他"];

/** 「役割 名前」（例「監督 岡本」）を役割と名前に分ける。空白が無ければ役割なし */
function splitCoach(s: string): { role: string; name: string } {
  const t = s.trim();
  const i = t.search(/\s/);
  if (i < 0) return { role: "", name: t };
  return { role: t.slice(0, i), name: t.slice(i).trim() };
}

/** staffIdentity（lib/chat.ts）と同じ探し方で、ログイン中の本人に当たる項目を返す */
export function findOwnCoach(authName: string, coaches: string[]): string | undefined {
  const an = (authName ?? "").trim();
  if (!an) return undefined;
  return coaches.find((c) => c.trim().split(/\s+/).includes(an) || (/\s/.test(an) && c.includes(an)));
}

/** スタッフ（§3-5）。TeamData.coaches の一覧・削除・追加（その場で保存） */
export default function StaffList() {
  const board = useBoard();
  const team = useTeam();
  // ux-fix R3-5：追加の役割の初期値は「コーチ」
  const [role, setRole] = useState("コーチ");
  const [name, setName] = useState("");
  const coaches = team.team.coaches;
  const own = findOwnCoach(board.auth.name, coaches);

  function add() {
    const nm = name.trim();
    if (!nm) return;
    // TeamProvider.addCoach は同じ文字列を黙って無視するので、ここで知らせる
    if (coaches.includes(`${role} ${nm}`)) {
      board.toast("同じスタッフが登録されています");
      return;
    }
    team.addCoach(`${role} ${nm}`);
    setName("");
  }

  return (
    <div className="st-form">
      <SettingsGroup hint="ここに登録した名前は、お知らせやメッセージの送信者名に使われます。">
        {coaches.length === 0 && (
          <div className="st-row static">
            <span className="st-row-tx">
              <span className="st-row-desc">登録されているスタッフはいません</span>
            </span>
          </div>
        )}
        {coaches.map((c) => {
          const p = splitCoach(c);
          return (
            <div key={c} className="st-row static">
              <span className="st-row-tx">
                <span className="st-row-label">{p.name}</span>
                <span className="st-row-desc">{[p.role, c === own ? "あなた" : ""].filter(Boolean).join("・")}</span>
              </span>
              {/* ux-fix R3-5：自分の行には削除を出さない（消すとお知らせやメッセージの送信者名が別のスタッフになる） */}
              {c !== own && (
                <button
                  type="button"
                  className="st-del"
                  onClick={() => {
                    if (window.confirm(`${p.name}を削除しますか？`)) team.removeCoach(c);
                  }}
                >
                  削除
                </button>
              )}
            </div>
          );
        })}
      </SettingsGroup>
      <div className="st-field">
        <label htmlFor="st-staffname">スタッフを追加</label>
        <div className="st-addrow">
          <select className="st-input st-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="役割">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            id="st-staffname"
            className="st-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
            }}
            placeholder="名前"
          />
          <button type="button" className="st-btn st-addbtn" onClick={add} disabled={!name.trim()}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
