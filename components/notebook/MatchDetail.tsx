"use client";

import { Fragment, useState } from "react";
import type { MatchNote, PlayLine, PlayPoint } from "@/lib/types";
import { MATCH_PHASE_LABEL } from "@/lib/types";
import { buildSlots } from "@/lib/formations";
import { PLAY_PHASES, groupPlays, markCanvas, markPhase, playNotes, playStats, playTitle } from "@/lib/plays";
import { E } from "../Emoji";
import { FormationPitch, GoalCourseView, PlayAreaPitch } from "../MiniPitch";
import { PlayStatsRow } from "./PlayStatsRow";
import { ShotViewSheet } from "./PlaySheets";

type StaffDrawing = { plays: PlayPoint[]; playLines: PlayLine[] };
type ViewLayer = "mine" | "staff" | "both";

/** note-play-chain §5: staffDrawing は選手の記録に重ねるスタッフの図。viewer は見る人（切り替えの文言が変わる） */
export function MatchDetail({
  note,
  staffDrawing,
  viewer = "player",
}: {
  note: MatchNote;
  staffDrawing?: StaffDrawing;
  viewer?: "staff" | "player";
}) {
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
  // note-play-chain §5: 選んだプレー（区画の鍵つき）とスタッフの図の見せ方（既定は重ねる）
  const [pickedRow, setPickedRow] = useState<string | null>(null);
  const [layer, setLayer] = useState<ViewLayer>("both");
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
          const secKey = `${p}-${c}`;
          const first = notePhases[0] === p && canvases[0] === c;
          const sd = staffDrawing && (staffDrawing.plays.length > 0 || staffDrawing.playLines.length > 0) ? staffDrawing : null;
          const hasStaff = !!sd;
          const showSwitch = first && hasStaff;
          const staffOnly = showSwitch && layer === "staff";
          const groups = groupPlays(pts, lns);
          const sel = groups.find((g) => `${secKey}|${g.id}` === pickedRow) ?? null;
          const strong = sel
            ? {
                points: sel.steps.filter((s) => s.type === "point").map((s) => s.index),
                lines: sel.steps.filter((s) => s.type === "line").map((s) => s.index),
              }
            : null;
          // 番号は「受けた」「シュート」にだけ付ける（単独のトラップミスの行を選んでも番号は出さない）
          const badges = sel
            ? sel.steps.filter((s) => s.type === "point" && s.kind !== "miss").map((s, n) => ({ point: s.index, n: n + 1 }))
            : undefined;
          let chainNo = 0;
          return (
            <div key={secKey} className="notesec">
              <div className="notesec-h">
                プレーエリア（{MATCH_PHASE_LABEL[p]}{staffOnly ? "" : ` ・ 点 ${pts.length} ／ 軌道 ${lns.length}`}）{multiCanvas ? `・ピッチ${c + 1}` : ""}
              </div>
              {showSwitch && (
                <div className="npview" role="group" aria-label="スタッフの図の見せ方">
                  {(
                    [
                      ["mine", viewer === "staff" ? "選手の記録" : "自分の記録"],
                      ["staff", "スタッフの図"],
                      ["both", "重ねる"],
                    ] as [ViewLayer, string][]
                  ).map(([k, label]) => (
                    <button key={k} type="button" className={`canvaschip${layer === k ? " on" : ""}`} aria-pressed={layer === k} onClick={() => setLayer(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="npwrap">
                {staffOnly && sd ? (
                  <PlayAreaPitch tone="staff" points={sd.plays} lines={sd.playLines} />
                ) : (
                  <PlayAreaPitch
                    points={pts}
                    lines={lns}
                    strong={strong}
                    badges={badges}
                    staffLayer={sd && showSwitch && layer === "both" ? { points: sd.plays, lines: sd.playLines } : null}
                    onPointClick={(_, pt) => {
                      const hit = shots.find((s) => s.src === pt);
                      if (hit) setShotView(hit.num);
                    }}
                    selectedIndex={shotSel ? pts.indexOf(shotSel.src) : null}
                  />
                )}
                {/* 重ねたときだけ、どちらの線かの凡例（承認図 c_detail_staff。緑の上の線と同じ色で見せる） */}
                {showSwitch && layer === "both" && (
                  <div className="nplegend">
                    <span>
                      <i className="nplegend-sw" aria-hidden="true" />
                      白＝{viewer === "staff" ? "選手の記録" : "自分の記録"}
                    </span>
                    <span>
                      <i className="nplegend-sw stf" aria-hidden="true" />
                      青＝スタッフの図
                    </span>
                  </div>
                )}
              </div>
              {groups.length > 0 && <div className="notesec-h playlist-h">プレーの一覧</div>}
              {groups.length > 0 && (
                <div className="playlist">
                  {groups.map((g) => {
                    const on = g.id === sel?.id;
                    const notes = playNotes(g, pts, lns);
                    const tag = g.chained ? `プレー ${++chainNo}` : "単独";
                    return (
                      <div key={g.id} className={`playitem${on ? " on" : ""}`}>
                        <button
                          type="button"
                          className={`playrow${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={(e) => {
                            if (on) {
                              setPickedRow(null);
                              return;
                            }
                            setPickedRow(`${secKey}|${g.id}`);
                            // 選んだプレーのピッチが画面の外にあるときは見える所まで寄せる（note-play-chain §10-13）
                            e.currentTarget.closest(".notesec")?.querySelector<HTMLElement>(".npitch")?.scrollIntoView({ block: "nearest" });
                            // 最後の手がシュートの行は、シュートのモーダルも開く
                            const last = g.steps[g.steps.length - 1];
                            if (last.type === "point" && last.kind === "shot") {
                              const hit = shots.find((s) => s.src === pts[last.index]);
                              if (hit) setShotView(hit.num);
                            }
                          }}
                        >
                          <span className="playrow-tag">{tag}</span>
                          <span className="playrow-b">
                            <span className="playrow-t">{playTitle(g, pts, lns)}</span>
                            {notes.length > 0 && <span className="playrow-n">{notes.join(" ・ ")}</span>}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
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
