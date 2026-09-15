"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { opponentFromTitle, useCountdown } from "./homeData";
import { localDateStr } from "@/lib/dates";
import { byStartAsc, categoryOf, occursOn } from "@/lib/calendarUtils";
import type { TeamEvent } from "@/lib/types";

/**
 * 起動画面（スプラッシュ）の直後に「今日の予定」を大きく見せる画面。
 * 予定が無い日は「オフ」。どこをタップしてもホームへ進む（Enter／Space／Esc でも可）。
 * 見た目は 試合／練習／その他／オフ で分け、背景の層と動く飾りで最初の印象をつくる。
 */
type Theme = "match" | "practice" | "other" | "off";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return `${m}月${d}日（${WD[wd]}）`;
}

function fmtTime(e: TeamEvent): string {
  if (e.allDay) return "終日";
  if (!e.time) return "";
  return e.endTime ? `${e.time}〜${e.endTime}` : `${e.time}〜`;
}

function toMs(ymd: string, hm?: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (hm) {
    const [hh, mm] = hm.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/* ---------- 飾り（装飾のみ。読み上げ対象外） ---------- */

/** 試合: 夜のスタジアム。照明が揺れ、ピッチのラインが描かれ、ボールが転がってくる */
function MatchArt() {
  return (
    <div className="tg-art tg-art-match" aria-hidden="true">
      <div className="tg-light tg-light-l" />
      <div className="tg-light tg-light-r" />
      <svg className="tg-pitch tg-zoom" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice">
        <g className="tg-lines" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="40" y="60" width="310" height="580" rx="3" pathLength={1} />
          <line x1="40" y1="350" x2="350" y2="350" pathLength={1} />
          <circle cx="195" cy="350" r="62" pathLength={1} />
          <rect x="100" y="60" width="190" height="96" pathLength={1} />
          <rect x="100" y="544" width="190" height="96" pathLength={1} />
          <rect x="145" y="60" width="100" height="38" pathLength={1} />
          <rect x="145" y="602" width="100" height="38" pathLength={1} />
        </g>
        <g className="tg-ball">
          <circle cx="0" cy="0" r="14" fill="#ffffff" />
          <polygon points="0,-6 5.7,-1.9 3.5,4.9 -3.5,4.9 -5.7,-1.9" fill="#1b2230" />
          <path
            d="M0 -14 L0 -8 M11 -9 L6 -4 M-11 -9 L-6 -4 M9 10 L4 6 M-9 10 L-4 6"
            stroke="#1b2230"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <div className="tg-grain" />
      <div className="tg-shade" />
    </div>
  );
}

/** 練習: 芝の緑。コーンがジグザグに並び、ドリブルの点線に沿ってボールが動く */
/* 中央の文字帯（およそ y 250〜520）を避けて、上にコーンの列、下にドリブルの点線を置く */
const CONE_PATH = "M40 120 C 110 170, 170 60, 240 120 S 340 200, 360 130";
const DRILL_PATH = "M30 600 C 110 660, 180 560, 240 610 S 330 690, 370 620";
const CONES: [number, number][] = [
  [42, 138],
  [120, 142],
  [200, 96],
  [282, 156],
  [356, 148],
];
function PracticeArt() {
  return (
    <div className="tg-art tg-art-practice" aria-hidden="true">
      <div className="tg-grass" />
      <div className="tg-light tg-light-l" />
      <svg className="tg-drill tg-zoom" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice">
        <path className="tg-path" d={CONE_PATH} fill="none" strokeWidth="3" strokeLinecap="round" />
        <path className="tg-path" d={DRILL_PATH} fill="none" strokeWidth="3" strokeLinecap="round" />
        {CONES.map(([x, y], i) => (
          <g key={i} className="tg-cone" style={{ animationDelay: `${0.25 + i * 0.18}s` }}>
            <polygon points={`${x},${y - 26} ${x + 13},${y} ${x - 13},${y}`} fill="#e8862a" />
            <rect x={x - 17} y={y - 2} width="34" height="5" rx="2" fill="#b8641a" />
            <rect x={x - 7} y={y - 16} width="14" height="4" fill="#ffffff" opacity="0.85" />
          </g>
        ))}
        <circle className="tg-dball" r="9" fill="#ffffff">
          <animateMotion dur="4.2s" repeatCount="indefinite" rotate="auto" path={DRILL_PATH} />
        </circle>
      </svg>
      <div className="tg-grain" />
      <div className="tg-shade" />
    </div>
  );
}

/** オフ: 夜空。星がまたたき、流れ星が走り、月が出ている */
const STARS: [number, number, number][] = [
  [8, 10, 3], [22, 6, 2], [35, 16, 2], [48, 8, 3], [63, 13, 2], [78, 5, 2], [91, 14, 3],
  [14, 27, 2], [30, 23, 3], [55, 26, 2], [70, 21, 2], [86, 29, 3], [11, 42, 2], [40, 38, 2],
  [60, 36, 3], [93, 44, 2], [25, 52, 2], [75, 50, 2],
];
function OffArt() {
  return (
    <div className="tg-art tg-art-off" aria-hidden="true">
      {STARS.map(([x, y, s], i) => (
        <span
          key={i}
          className="tg-star"
          style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${(i % 6) * 0.55}s` }}
        />
      ))}
      <span className="tg-shoot" />
      <svg className="tg-moon" viewBox="0 0 100 100">
        <path d="M62 8a42 42 0 1 0 30 72A34 34 0 0 1 62 8z" fill="#f4e7b0" />
      </svg>
      <div className="tg-hill" />
      <div className="tg-grain" />
      <div className="tg-shade" />
    </div>
  );
}

/** その他（保護者会など）: 落ち着いた紺に斜めの光 */
function OtherArt() {
  return (
    <div className="tg-art tg-art-other" aria-hidden="true">
      <div className="tg-light tg-light-l" />
      <div className="tg-grain" />
      <div className="tg-shade" />
    </div>
  );
}

/** 開始までのカウントダウン／進行中／終了 */
function StatusPill({ e }: { e: TeamEvent }) {
  const startMs = useMemo(() => (e.allDay ? null : toMs(e.date, e.time)), [e.allDay, e.date, e.time]);
  const endMs = useMemo(
    () => (e.allDay || !e.time ? null : e.endTime ? toMs(e.date, e.endTime) : toMs(e.date, e.time) + 2 * 3600_000),
    [e.allDay, e.date, e.time, e.endTime]
  );
  const cd = useCountdown(startMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (startMs == null || cd == null) return null;
  const word = e.kind === "match" ? "キックオフ" : "開始";
  let text: string;
  if (endMs != null && now >= endMs) text = e.kind === "match" ? "試合終了" : "終了";
  else if (cd.started) text = e.kind === "match" ? "試合中" : "進行中";
  else if (cd.days > 0) text = `${word}まで ${cd.days}日 ${cd.hours}時間`;
  else if (cd.hours > 0) text = `${word}まで ${cd.hours}時間 ${cd.minutes}分`;
  else text = `${word}まで ${cd.minutes}分`;
  return <div className="todaygate-status">{text}</div>;
}

export default function TodayGate({ onDone }: { onDone: () => void }) {
  const board = useBoard();
  const team = useTeam();
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const today = localDateStr();

  const events = useMemo(
    () => team.team.events.filter((e) => occursOn(e, today)).sort(byStartAsc),
    [team.team.events, today]
  );
  // 予定が無い日は、次の予定を1行だけ添える
  const next = useMemo(() => {
    if (events.length > 0) return null;
    return [...team.team.events].filter((e) => e.date > today).sort(byStartAsc)[0] ?? null;
  }, [events.length, team.team.events, today]);

  const theme: Theme = useMemo(() => {
    if (events.length === 0) return "off";
    if (events.some((e) => e.kind === "match")) return "match";
    if (events.some((e) => categoryOf(e, team.categories).builtin)) return "practice";
    return "other";
  }, [events, team.categories]);

  const teamName = board.state.teamName ?? "マイチーム";
  // 状態（カウントダウン等）は今日の最初の予定に付ける（試合の日は最初の試合）
  const primary = useMemo(() => events.find((e) => e.kind === "match") ?? events[0] ?? null, [events]);

  const done = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, 250);
  };

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  return (
    <div
      ref={rootRef}
      className={`todaygate theme-${theme}${leaving ? " leave" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="タップしてホームへ"
      onClick={done}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Escape") {
          ev.preventDefault();
          done();
        }
      }}
    >
      {theme === "match" && <MatchArt />}
      {theme === "practice" && <PracticeArt />}
      {theme === "off" && <OffArt />}
      {theme === "other" && <OtherArt />}

      <div className="todaygate-body">
        <div className="todaygate-date">{fmtDate(today)}</div>
        <div className="todaygate-label">
          {theme === "match" ? "きょうは試合" : theme === "practice" ? "きょうは練習" : theme === "off" ? "きょうは" : "今日の予定"}
        </div>

        {events.length === 0 ? (
          <>
            <div className="todaygate-off">オフ</div>
            <div className="todaygate-sub">ゆっくり休んで、次にそなえよう</div>
            {next && (
              <div className="todaygate-next">
                次の予定 ・ {fmtDate(next.date)} {next.title}
              </div>
            )}
          </>
        ) : (
          <div className="todaygate-list">
            {events.map((e) => {
              const cat = categoryOf(e, team.categories);
              const time = fmtTime(e);
              const opponent = e.kind === "match" ? opponentFromTitle(e.title) : null;
              return (
                <div className="todaygate-ev" key={e.id}>
                  <span className={`todaygate-cat${e.kind === "match" ? " match" : ""}`}>{cat.label}</span>
                  {opponent ? (
                    <div className="todaygate-vs">
                      <div className="todaygate-own">{teamName}</div>
                      <div className="todaygate-vsmark">VS</div>
                      <div className="todaygate-opp">{opponent}</div>
                    </div>
                  ) : (
                    <div className="todaygate-title">{e.title}</div>
                  )}
                  {time && <div className="todaygate-time">{time}</div>}
                  {e.place && <div className="todaygate-place">{e.place}</div>}
                  {primary && primary.id === e.id && <StatusPill e={e} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="todaygate-hint">タップしてホームへ</div>
    </div>
  );
}
