"use client";

import { Fragment, useState } from "react";
import type { MatchNote } from "@/lib/types";
import { MATCH_PHASE_LABEL } from "@/lib/types";
import { buildSlots } from "@/lib/formations";
import { PLAY_PHASES, markCanvas, markPhase, playStats } from "@/lib/plays";
import { E } from "../Emoji";
import { FormationPitch, GoalCourseView, PlayAreaPitch } from "../MiniPitch";
import { PlayStatsRow } from "./PlayStatsRow";
import { ShotViewSheet } from "./PlaySheets";

export function MatchDetail({ note }: { note: MatchNote }) {
  const allPlays = note.plays ?? [];
  const allPlayLines = note.playLines ?? [];
  const stats = playStats(allPlays, allPlayLines);
  // マークが存在するフェーズだけ（前半→後半→延長の順）でセクション分割
  const notePhases = PLAY_PHASES.filter(
    (p) => allPlays.some((pt) => markPhase(pt.phase) === p) || allPlayLines.some((l) => markPhase(l.phase) === p)
  );
  // シュート（plays配列順に1,2,3…を採番。ゴール正面図の打点ラベルと一覧の#Nを揃える）。
  // src は元の点への参照（プレーエリアの点を押したとき、同じ参照で shots を引くため）
  const shots = allPlays.filter((p) => p.kind === "shot").map((p, i) => ({ ...p, num: i + 1, src: p }));
  // notebook-staff-redesign §4: シュートの位置モーダル。開いているシュートの採番（未選択は null）
  const [shotView, setShotView] = useState<number | null>(null);
  const shotSel = shotView != null ? shots.find((s) => s.num === shotView) ?? null : null;
  // note-pitch-v2 §3: 出場した位置は畳んだ 1 行（既定は畳む）。「相手も表示」は保存しない画面の状態
  // 表示は前半｜後半｜延長の順（保存の配列の順は変えない）
  const lineups = (note.lineups ?? []).slice().sort((a, b) => PLAY_PHASES.indexOf(a.phase) - PLAY_PHASES.indexOf(b.phase));
  const [lineupOpen, setLineupOpen] = useState(false);
  const [showOpp, setShowOpp] = useState(false);
  const roleOf = (lu: (typeof lineups)[number]) =>
    lu.ownPositionIndex != null ? buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role : null;
  const lineupSummary =
    lineups.map((lu) => (roleOf(lu) ? `${MATCH_PHASE_LABEL[lu.phase]} ${roleOf(lu)}` : `${MATCH_PHASE_LABEL[lu.phase]}（位置は未選択）`)).join(" ・ ") +
    (lineups.every((lu) => roleOf(lu)) ? " で出場" : "");
  return (
    <>
      <div className="notesec">
        <div className="notesec-h"><E n="vs" /> {note.opponent || "対戦相手"}</div>
        {(() => {
          if (note.halfMinutes == null && note.fullMatch == null) return null;
          const time = [
            note.halfMinutes != null ? `${note.halfMinutes}分ハーフ` : null,
            note.fullMatch === false
              ? note.playFrom != null && note.playTo != null
                ? `${note.playFrom}分〜${note.playTo}分に出場`
                : "途中出場"
              : "フル出場",
          ]
            .filter(Boolean)
            .join(" ・ ");
          return time ? <div className="notesec-b">{time}</div> : null;
        })()}
      </div>
      {lineups.length > 0 && (
        <div className="notesec">
          <div className="notesec-h">出場した位置</div>
          <button
            type="button"
            className="npfold"
            aria-expanded={lineupOpen}
            onClick={() => setLineupOpen((v) => !v)}
          >
            <span>{lineupSummary}</span>
            <svg className="npfold-chev" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {lineupOpen && (
            <>
              <label className="sharetoggle">
                <input type="checkbox" checked={showOpp} onChange={(e) => setShowOpp(e.target.checked)} />
                <span>相手も表示</span>
              </label>
              {lineups.map((lu, i) => {
                const role = lu.ownPositionIndex != null ? buildSlots(lu.ownFormation)[lu.ownPositionIndex]?.role : null;
                return (
                  <Fragment key={i}>
                    <div className="notesec-h">
                      {MATCH_PHASE_LABEL[lu.phase]} ・ 自{lu.ownFormation} / 相手{lu.oppFormation}
                      {role ? ` ・ ${role}` : ""}
                    </div>
                    <div className="npwrap">
                      <FormationPitch
                        ownFormation={lu.ownFormation}
                        ownPositionIndex={lu.ownPositionIndex}
                        oppFormation={lu.oppFormation}
                        showOpp={showOpp}
                      />
                    </div>
                  </Fragment>
                );
              })}
            </>
          )}
        </div>
      )}
      {notePhases.map((p) => {
        const phasePts = allPlays.filter((pt) => markPhase(pt.phase) === p);
        const phaseLns = allPlayLines.filter((l) => markPhase(l.phase) === p);
        // そのフェーズでマークがあるピッチ番号ごとにセクションを分ける（旧データはcanvas未設定＝0番扱い）
        const canvases = Array.from(
          new Set([...phasePts.map((pt) => markCanvas(pt.canvas)), ...phaseLns.map((l) => markCanvas(l.canvas))])
        ).sort((a, b) => a - b);
        const multiCanvas = canvases.length > 1;
        return canvases.map((c) => {
          const pts = phasePts.filter((pt) => markCanvas(pt.canvas) === c);
          const lns = phaseLns.filter((l) => markCanvas(l.canvas) === c);
          return (
            <div key={`${p}-${c}`} className="notesec">
              <div className="notesec-h">
                プレーエリア（{MATCH_PHASE_LABEL[p]} ・ 点 {pts.length} ／ 軌道 {lns.length}）{multiCanvas ? `・ピッチ${c + 1}` : ""}
              </div>
              <div className="npwrap">
                <PlayAreaPitch
                  points={pts}
                  lines={lns}
                  onPointClick={(_, pt) => {
                    const hit = shots.find((s) => s.src === pt);
                    if (hit) setShotView(hit.num);
                  }}
                  selectedIndex={shotSel ? pts.indexOf(shotSel.src) : null}
                />
              </div>
            </div>
          );
        });
      })}
      {shots.length > 0 && (
        <div className="notesec">
          <div className="notesec-h">シュート（{shots.length}本 ・ ゴール {stats.goals}）</div>
          <GoalCourseView shots={shots.filter((s) => s.course).map((s) => ({ course: s.course!, scored: s.scored, label: s.num }))} />
          <div className="shotlist">
            {shots.map((s) => (
              <button key={s.num} type="button" className="shotrow" onClick={() => setShotView(s.num)}>
                <span className={`shotmark${s.course ? (s.scored ? "" : " nogoal") : " none"}`} />
                <span>
                  #{s.num} {MATCH_PHASE_LABEL[markPhase(s.phase)]} ・ {s.course ? (s.scored ? "ゴール" : "ノーゴール") : "コース未記録"}
                </span>
                {s.shotNote && <small>{s.shotNote}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      {(allPlays.length > 0 || allPlayLines.length > 0) && (
        <div className="notesec">
          <div className="notesec-h">プレースタッツ（全フェーズ合算）</div>
          <PlayStatsRow stats={stats} />
        </div>
      )}

      {(note.bestPlay || note.reflectPlay || note.videoUrl) && (
        <div className="notesec">
          <div className="notesec-h">ベストプレー・反省</div>
          {note.bestPlay && <div className="notesec-b"><E n="star" /> ベスト：{note.bestPlay}</div>}
          {note.reflectPlay && <div className="notesec-b"><E n="repeat" /> 反省：{note.reflectPlay}</div>}
          {note.videoUrl && (
            <a className="videolink" href={note.videoUrl} target="_blank" rel="noreferrer"><E n="video" /> 動画を見る</a>
          )}
        </div>
      )}

      {shotSel && <ShotViewSheet shot={shotSel} onClose={() => setShotView(null)} />}
    </>
  );
}
