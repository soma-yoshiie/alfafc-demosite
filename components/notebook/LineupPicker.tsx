"use client";

import { useState } from "react";
import type { MatchPhase, MatchPhaseLineup } from "@/lib/types";
import { MATCH_PHASE_LABEL } from "@/lib/types";
import { FORMATION_KEYS, buildSlots } from "@/lib/formations";
import { PLAY_PHASES } from "@/lib/plays";
import { FormationPitch } from "../MiniPitch";

export function emptyLineup(phase: MatchPhase): MatchPhaseLineup {
  return { phase, ownFormation: "4-3-3", ownPositionIndex: null, oppFormation: "4-4-2" };
}

/* note-pitch-v2 §2-1: 出場した位置の編集。
   データ（lineups）は親が持つ。開いているフェーズと「相手も表示」（保存しない）はここに持つ */
export function LineupPicker({
  lineups,
  onChange,
}: {
  lineups: MatchPhaseLineup[];
  onChange: (next: MatchPhaseLineup[]) => void;
}) {
  const [activePhase, setActivePhase] = useState<MatchPhase>("1st");
  const [showOpp, setShowOpp] = useState(false);

  const found = lineups.findIndex((l) => l.phase === activePhase);
  const idx = found >= 0 ? found : 0;
  const lu = lineups[idx];
  // 切り替えの表示は前半｜後半｜延長の順（保存の配列の順は変えない）
  const phaseOrder = lineups.slice().sort((a, b) => PLAY_PHASES.indexOf(a.phase) - PLAY_PHASES.indexOf(b.phase));
  const phasesPresent = lineups.map((l) => l.phase);

  const setLineup = (i: number, patch: Partial<MatchPhaseLineup>) =>
    onChange(lineups.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addPhase = (p: MatchPhase) => {
    onChange([...lineups, emptyLineup(p)]);
    setActivePhase(p);
  };

  const role = lu && lu.ownPositionIndex != null ? buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role : null;

  return (
    <>
      <div className="notesec-h">出場した位置</div>
      {lineups.length >= 2 && (
        <div className="phasebar">
          {phaseOrder.map((l) => (
            <button
              key={l.phase}
              type="button"
              className={`phasechip${lu && l.phase === lu.phase ? " on" : ""}`}
              aria-pressed={!!lu && l.phase === lu.phase}
              onClick={() => setActivePhase(l.phase)}
            >
              {MATCH_PHASE_LABEL[l.phase]}
            </button>
          ))}
        </div>
      )}
      {lu && (
        <>
          <div className="formgrid lu">
            <div className="formfield" style={{ flex: 1, margin: 0 }}>
              <label>自チーム</label>
              <select value={lu.ownFormation} onChange={(e) => setLineup(idx, { ownFormation: e.target.value, ownPositionIndex: null })}>
                {FORMATION_KEYS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="formfield" style={{ flex: 1, margin: 0 }}>
              <label>相手</label>
              <select value={lu.oppFormation} onChange={(e) => setLineup(idx, { oppFormation: e.target.value })}>
                {FORMATION_KEYS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="phasehint">自分の位置を押す{role ? `：${role}` : ""}</div>
          <div className="npwrap">
            <FormationPitch
              ownFormation={lu.ownFormation}
              ownPositionIndex={lu.ownPositionIndex}
              onPickPosition={(i) => setLineup(idx, { ownPositionIndex: i })}
              oppFormation={lu.oppFormation}
              showOpp={showOpp}
            />
          </div>
          <label className="sharetoggle lu">
            <input type="checkbox" checked={showOpp} onChange={(e) => setShowOpp(e.target.checked)} />
            <span>相手も表示</span>
          </label>
          {lineups.length >= 2 && (
            <button type="button" className="linkdanger" onClick={() => onChange(lineups.filter((_, j) => j !== idx))}>
              {MATCH_PHASE_LABEL[lu.phase]}を削除
            </button>
          )}
        </>
      )}
      <div className="phaseadd">
        {PLAY_PHASES.map(
          (p) =>
            !phasesPresent.includes(p) && (
              <button key={p} type="button" className="dynadd" style={{ width: "auto", flex: 1 }} onClick={() => addPhase(p)}>
                ＋ {MATCH_PHASE_LABEL[p]}を追加
              </button>
            )
        )}
      </div>
    </>
  );
}
