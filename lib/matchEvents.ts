// p15 §6: 試合記録（MatchRecord）とカレンダーの試合の予定（TeamEvent）の連携。
// React に依存しない純関数だけを置く。matches 配列への記録の出し入れは呼び出し側（TeamProvider）が行い、
// ここでは events と、記録の eventId だけを扱う。

import type { Competition, MatchRecord, TeamData, TeamEvent } from "./types";

/** 自動で作る予定の題名。「{大会名|試合} vs {相手}」 */
export function matchEventTitle(
  m: Pick<MatchRecord, "opponent" | "competitionId" | "competition">,
  comps: Competition[]
): string {
  const named = m.competitionId ? comps.find((c) => c.id === m.competitionId)?.name : undefined;
  const head = named?.trim() || m.competition?.trim() || "試合";
  const opp = m.opponent.trim();
  return opp ? `${head} vs ${opp}` : head;
}

/** 記録に紐づく予定（無い・予定が削除済みなら undefined） */
export function eventOfMatch(m: MatchRecord, events: TeamEvent[]): TeamEvent | undefined {
  if (!m.eventId) return undefined;
  return events.find((e) => e.id === m.eventId);
}

/** 予定に紐づく記録（無ければ undefined。複数あれば日付が新しい方） */
export function matchOfEvent(eventId: string, matches: MatchRecord[]): MatchRecord | undefined {
  let best: MatchRecord | undefined;
  for (const m of matches) {
    if (m.eventId !== eventId) continue;
    if (!best || m.date > best.date) best = m;
  }
  return best;
}

/**
 * 紐づけ先の候補を探す：同じ日・kind==="match"・まだどの記録にも紐づいていない予定。
 * 候補が 1 件ならそれ。複数なら題名に相手名を含むもの（1 件に決まるときだけ）。決まらなければ undefined
 */
export function findLinkableEvent(
  m: Pick<MatchRecord, "date" | "opponent">,
  events: TeamEvent[],
  matches: MatchRecord[]
): TeamEvent | undefined {
  const taken = new Set<string>();
  for (const x of matches) if (x.eventId) taken.add(x.eventId);
  const opp = m.opponent.trim();
  // 統括の裁定（レビュー F3/F5）: 題名に「vs 別の相手」と書いてある予定には紐づけない
  // （同じ日に 1 件しか無くても、相手が違えば別の試合。題名に相手が無い予定は候補に残す）
  const cands = events.filter(
    (e) => e.kind === "match" && e.date === m.date && !taken.has(e.id) && titleAllowsOpponent(e.title, opp)
  );
  if (cands.length <= 1) return cands[0];
  if (!opp) return undefined;
  const hit = cands.filter((e) => e.title.includes(opp));
  return hit.length === 1 ? hit[0] : undefined;
}

/** 予定の題名の「vs ○○」が、記録の相手と食い違っていないか（題名に相手が書かれていなければ true） */
function titleAllowsOpponent(title: string, opp: string): boolean {
  const m = title.match(/(?:vs\.?|VS|ＶＳ|対)\s*(.+)$/i);
  const named = m ? m[1].trim() : "";
  if (!named || !opp) return true;
  return named.includes(opp) || opp.includes(named);
}

/** 記録が紐づいている予定の id（＝結果が出ている試合）。「次の予定」やメンバー登録の候補から外すのに使う */
export function linkedEventIds(matches: MatchRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const m of matches) if (m.eventId) ids.add(m.eventId);
  return ids;
}

/**
 * 試合結果をカレンダーに映すためだけの予定か（自動で作った予定で、出欠が 1 件も入っていない）。
 * 出席率の分母・出欠の履歴には数えない（レビュー F1: 過去の試合を記録するたびに全員の出席率が下がるのを防ぐ）。
 * スタッフが後から出欠を入れた予定は、普通の予定と同じに数える
 */
export function isResultOnlyEvent(e: TeamEvent, attendance: TeamData["attendance"]): boolean {
  return e.fromMatch === true && Object.keys(attendance[e.id] ?? {}).length === 0;
}

/**
 * 記録 1 件をカレンダーへ反映した events と、eventId を確定した記録を返す（どちらも新しいオブジェクト）。
 * 1) m.eventId の予定がある → fromMatch の予定だけ題名・日付・場所・大会・対象を記録に合わせる（手で作った予定は触らない）
 * 2) 無い → findLinkableEvent で見つかればその id を m.eventId に
 * 3) 見つからない → 予定を新しく作る（kind:"match"、allDay:true、fromMatch:true）
 */
export function syncMatchEvent(
  t: TeamData,
  m: MatchRecord,
  newEventId: () => string
): { events: TeamEvent[]; match: MatchRecord } {
  let linked = eventOfMatch(m, t.events);
  // 統括の裁定（レビュー F4）: 手で作った予定に紐づいた記録の日付を、その予定の期間の外へ直したら紐づけを外す
  // （別の日の予定に結果が出続けないように。下で新しい日付の予定を探し直す）
  if (linked && !linked.fromMatch && (m.date < linked.date || m.date > (linked.endDate ?? linked.date))) {
    linked = undefined;
    m = { ...m, eventId: undefined };
  }
  if (linked) {
    if (!linked.fromMatch) return { events: [...t.events], match: { ...m } };
    const next: TeamEvent = {
      ...linked,
      title: matchEventTitle(m, t.competitions),
      date: m.date,
      // 日付を後ろへずらしたとき、終了日が開始日より前にならないようにする
      endDate: linked.endDate && linked.endDate >= m.date ? linked.endDate : undefined,
      place: m.place || undefined,
      competitionId: m.competitionId,
      groupIds: m.groupIds && m.groupIds.length > 0 ? m.groupIds : undefined,
    };
    return { events: t.events.map((e) => (e.id === linked.id ? next : e)), match: { ...m } };
  }
  // 自分自身の古い紐づけは「使用中」に数えない
  const found = findLinkableEvent(
    m,
    t.events,
    t.matches.filter((x) => x.id !== m.id)
  );
  if (found) return { events: [...t.events], match: { ...m, eventId: found.id } };
  const id = newEventId();
  const ev: TeamEvent = {
    id,
    kind: "match",
    title: matchEventTitle(m, t.competitions),
    date: m.date,
    allDay: true,
    fromMatch: true,
    ...(m.place ? { place: m.place } : {}),
    ...(m.competitionId ? { competitionId: m.competitionId } : {}),
    ...(m.groupIds && m.groupIds.length > 0 ? { groupIds: m.groupIds } : {}),
  };
  return { events: [...t.events, ev], match: { ...m, eventId: id } };
}

/** 大会の名前の変更・削除のあと、自動で作った予定の題名と大会を記録に合わせ直す（手で作った予定は触らない） */
export function retitleMatchEvents(events: TeamEvent[], matches: MatchRecord[], comps: Competition[]): TeamEvent[] {
  return events.map((e) => {
    if (!e.fromMatch) return e;
    const m = matchOfEvent(e.id, matches);
    if (!m) return e;
    const title = matchEventTitle(m, comps);
    return title === e.title && m.competitionId === e.competitionId ? e : { ...e, title, competitionId: m.competitionId };
  });
}

/** 記録を消すとき：紐づく予定が fromMatch ならその予定と出欠(attendance[eventId])も消した TeamData の部分を返す */
export function removeMatchEvent(
  t: TeamData,
  m: MatchRecord
): { events: TeamEvent[]; attendance: TeamData["attendance"] } {
  const ev = eventOfMatch(m, t.events);
  // 別の記録が同じ予定に紐づいているときは残す
  if (!ev || !ev.fromMatch || t.matches.some((x) => x.id !== m.id && x.eventId === ev.id)) {
    return { events: t.events, attendance: t.attendance };
  }
  const attendance = { ...t.attendance };
  delete attendance[ev.id];
  return { events: t.events.filter((e) => e.id !== ev.id), attendance };
}

/**
 * 既存データの一括処理（1 回だけ）：紐づく予定の無い記録を、日付の古い順に syncMatchEvent へ通す。
 * matchEventsLinked を立てる。紐づき済みの記録は通さないので、2 回通しても予定は増えない
 */
export function linkAllMatches(t: TeamData, newEventId: () => string): TeamData {
  let cur: TeamData = t;
  const order = t.matches
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !eventOfMatch(m, t.events))
    .sort((a, b) => (a.m.date < b.m.date ? -1 : a.m.date > b.m.date ? 1 : a.i - b.i));
  for (const { m } of order) {
    const r = syncMatchEvent(cur, m, newEventId);
    cur = { ...cur, events: r.events, matches: cur.matches.map((x) => (x.id === m.id ? r.match : x)) };
  }
  return { ...cur, matchEventsLinked: true };
}
