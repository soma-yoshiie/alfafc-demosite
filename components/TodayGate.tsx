"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTeam } from "./TeamProvider";
import { localDateStr } from "@/lib/dates";
import { byStartAsc, categoryOf, occursOn } from "@/lib/calendarUtils";
import type { TeamEvent } from "@/lib/types";

/**
 * 起動画面（スプラッシュ）の直後に「今日の予定」を大きく見せる画面。
 * 予定が無い日は「オフ」。どこをタップしてもホームへ進む（Enter／Space／Esc でも可）。
 */
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

export default function TodayGate({ onDone }: { onDone: () => void }) {
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
      className={`todaygate${leaving ? " leave" : ""}`}
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
      <div className="todaygate-body">
        <div className="todaygate-date">{fmtDate(today)}</div>
        <div className="todaygate-label">今日の予定</div>
        {events.length === 0 ? (
          <>
            <div className="todaygate-off">オフ</div>
            <div className="todaygate-sub">
              {next ? `次の予定は ${fmtDate(next.date)} ${next.title}` : "今日の予定はありません"}
            </div>
          </>
        ) : (
          <div className="todaygate-list">
            {events.map((e) => {
              const cat = categoryOf(e, team.categories);
              const time = fmtTime(e);
              return (
                <div className="todaygate-ev" key={e.id}>
                  <span className="todaygate-cat">{cat.label}</span>
                  <div className="todaygate-title">{e.title}</div>
                  {time && <div className="todaygate-time">{time}</div>}
                  {e.place && <div className="todaygate-place">{e.place}</div>}
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
