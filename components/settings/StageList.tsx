"use client";

import { useTeam } from "../TeamProvider";
import type { SchoolStage } from "@/lib/types";
import { SettingsGroup } from "./SettingsRows";

const STAGES: { key: SchoolStage; label: string }[] = [
  { key: "elementary", label: "小学生（小1〜小6）" },
  { key: "junior", label: "中学生（中1〜中3）" },
  { key: "high", label: "高校生（高1〜高3）" },
];

/**
 * 学校区分（§3-3）。押すとその場で setSchoolStage（範囲外の学年の選手がいるときの確認とトーストは
 * setSchoolStage 側。キャンセルなら状態が変わらないので ✓ も元のまま）
 */
export default function StageList() {
  const team = useTeam();
  return (
    <div className="st-form">
      <SettingsGroup hint="学年グループの範囲とラベルが変わります。範囲外になる学年は未設定に戻ります。">
        {STAGES.map((s) => {
          const on = team.schoolStage === s.key;
          return (
            <button
              key={s.key}
              type="button"
              className="st-row"
              aria-pressed={on}
              onClick={() => {
                if (!on) team.setSchoolStage(s.key);
              }}
            >
              <span className="st-row-tx">
                <span className="st-row-label">{s.label}</span>
              </span>
              {on && (
                <span className="st-row-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </SettingsGroup>
    </div>
  );
}
