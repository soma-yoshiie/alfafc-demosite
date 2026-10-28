// デモのグループのスレッド（home-chat-groups-roster §2-8）。新規シードのときだけ BoardProvider.sampleChat が使う。
// かつての sampleAnnouncements（お知らせ 3 件）を「グループのメッセージ（announce あり）」にして入れ、
// あわせて 全員 と 中1 のスレッドにスタッフの短い発言を入れる（グループが空に見えないように）。
// 既読（reads[key].members）と了解（acks）は対象の選手から決め打ちで選ぶ（実行のたびに同じ結果）。

import type { ChatMessage, ChatReads, Player } from "./types";
import { groupThreadKey } from "./types";
import { gradeGroupsFor, membersOf } from "./groups";
import { ALL_THREAD_KEY } from "./chat";
import { SAMPLE_CUSTOM_GROUPS, SAMPLE_GROUP_A_ID, SAMPLE_PLAYERS } from "./sampleTeam";

/**
 * ids（対象の選手 id・名簿順）から n 人を等間隔に選ぶ。include は必ず入れ、exclude は入れない
 */
export function pickSpread(ids: string[], n: number, include: string[] = [], exclude: string[] = []): string[] {
  const must = include.filter((id) => ids.includes(id));
  const pool = ids.filter((id) => !must.includes(id) && !exclude.includes(id));
  const need = Math.max(0, Math.min(n - must.length, pool.length));
  const chosen = new Set(must);
  pool.forEach((id, i) => {
    if (Math.floor(((i + 1) * need) / pool.length) > Math.floor((i * need) / pool.length)) chosen.add(id);
  });
  return ids.filter((id) => chosen.has(id));
}

export function sampleGroupChat(now: number, players: Player[] = SAMPLE_PLAYERS): { messages: ChatMessage[]; reads: ChatReads } {
  const groups = [...gradeGroupsFor("junior", []), ...SAMPLE_CUSTOM_GROUPS];
  const allIds = players.map((p) => p.id);
  const idsOf = (gid: string) => membersOf(gid, players, groups).map((p) => p.id);
  const gradeAIds = idsOf(SAMPLE_GROUP_A_ID);
  const grade3Ids = idsOf("grp_grade_3");
  const seen1 = pickSpread(allIds, 52, ["p08"]);
  const seen2 = pickSpread(grade3Ids, 20);
  const seen3 = pickSpread(gradeAIds, 15, [], ["p08"]);
  const okaStaff = { from: "coach", fromName: "岡本", fromRole: "監督" };
  const fujita = { from: "coach", fromName: "藤田", fromRole: "スタッフ" };
  const acksOf = (ids: string[], ts: number): Record<string, number> => {
    const rec: Record<string, number> = {};
    ids.forEach((id, i) => (rec[id] = ts + 60_000 * (i + 1)));
    return rec;
  };
  const membersAt = (ids: string[], ts: number): Record<string, number> => {
    const rec: Record<string, number> = {};
    ids.forEach((id) => (rec[id] = ts));
    return rec;
  };

  const tAll1 = now - 5 * 3600_000;
  const tAnn1 = now - 3600_000;
  const tAll2 = now - 2700_000; // お知らせのあとに選手が 1 件返す
  const tAnn2 = now - 3000_000;
  const tAnn3 = now - 2400_000;
  const tG1a = now - 26 * 3600_000;
  const tG1b = now - 4 * 3600_000;

  const messages: ChatMessage[] = [
    // ---- 全員 ----
    {
      id: "msg_demo_all_1",
      ts: tAll1,
      to: ALL_THREAD_KEY,
      ...okaStaff,
      text: "お疲れさまです。全体への連絡はこのグループに送ります。",
    },
    {
      id: "ann_demo_1",
      ts: tAnn1,
      to: ALL_THREAD_KEY,
      ...okaStaff,
      text: "今週末は練習試合です\n集合 8:45・スパイクの手入れも忘れずに。",
      announce: { ts: tAnn1, byName: "岡本" },
      pinned: true,
      acks: acksOf(pickSpread(seen1, 41, ["p08"]), tAnn1),
    },
    {
      id: "msg_demo_all_2",
      ts: tAll2,
      to: ALL_THREAD_KEY,
      from: "p:p08",
      fromName: players.find((p) => p.id === "p08")?.name ?? "佐藤 蒼空",
      text: "了解しました！",
    },
    // ---- 中3 ----
    {
      id: "ann_demo_2",
      ts: tAnn2,
      to: groupThreadKey("grp_grade_3"),
      ...fujita,
      text: "木曜はセットプレーの確認\n土曜の公式戦に向けて、木曜の練習はセットプレーの確認をします。",
      announce: { ts: tAnn2, byName: "藤田" },
      acks: acksOf(pickSpread(seen2, 15), tAnn2),
    },
    // ---- Aチーム ----
    {
      id: "ann_demo_3",
      ts: tAnn3,
      to: groupThreadKey(SAMPLE_GROUP_A_ID),
      ...okaStaff,
      text: "金曜 9:15 キックオフ\n金曜の練習試合は 9:15 キックオフ。集合は 8:30 です。",
      announce: { ts: tAnn3, byName: "岡本" },
      acks: acksOf(pickSpread(seen3, 12), tAnn3),
    },
    // ---- 中1 ----
    {
      id: "msg_demo_g1_1",
      ts: tG1a,
      to: groupThreadKey("grp_grade_1"),
      ...fujita,
      text: "中1のみんなへ。まずは水筒とタオルを忘れずに持ってきてください。",
    },
    {
      id: "msg_demo_g1_2",
      ts: tG1b,
      to: groupThreadKey("grp_grade_1"),
      ...okaStaff,
      text: "今週の練習は 17:00 からです。わからないことはここで聞いてね。",
    },
  ];

  // 既読：お知らせより後に開いた人（seen*）はそのスレッドの最新まで読んだことにする。
  // 佐藤 蒼空(p08) は全員は読み済み・中2のグループは自分の発言だけ・Aチームは未読（選手デモで未読が見える）
  const allAfter = Math.max(...messages.filter((m) => m.to === ALL_THREAD_KEY).map((m) => m.ts)) + 1000;
  const members1 = membersAt(seen1, tAnn1 + 30_000);
  members1["p08"] = allAfter;
  const reads: ChatReads = {
    [ALL_THREAD_KEY]: { staff: now - 60_000, members: members1 },
    [groupThreadKey("grp_grade_3")]: { staff: now - 60_000, members: membersAt(seen2, tAnn2 + 30_000) },
    [groupThreadKey(SAMPLE_GROUP_A_ID)]: { staff: now - 60_000, members: membersAt(seen3, tAnn3 + 30_000) },
    [groupThreadKey("grp_grade_1")]: { staff: now - 60_000 },
  };
  return { messages, reads };
}
