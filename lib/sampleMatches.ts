import { addDaysStr } from "./dates";
import { SAMPLE_GROUP_A_ID } from "./sampleTeam";
import type { Competition, MatchRecord } from "./types";

/*
 * デモの大会と試合記録（初回シード用。components/TeamProvider.tsx の sampleTeam から呼ぶ）。
 * demo-data-consistency §2: 順位表のデモ（lib/sampleLeague.ts の sampleLeague）も自チームの試合はここから数えるので、
 * スコアを順位表の側に書き写さない（数字は 1 か所）。
 */

/** リーグ戦の大会（順位表のデモはこの大会の試合記録から自チームの結果を作る） */
export const SAMPLE_LEAGUE_COMPETITION_ID = "cmp1";
/**
 * リーグ戦の名前（大会名と順位表の見出しで共有する）。
 * demo-data-consistency §1: 試合の日付は今日から数えた相対日付なので、季節や月の入った名前（旧「春季リーグ U-12」
 * 「4〜6月」）にすると開く日によって食い違う。季節を持たない名前にし、年代は中学年代（ジュニアユース）に合わせて U-15 にした
 */
export const SAMPLE_LEAGUE_NAME = "市内リーグ U-15";

export const SAMPLE_COMPETITIONS: Competition[] = [
  { id: SAMPLE_LEAGUE_COMPETITION_ID, name: SAMPLE_LEAGUE_NAME, note: "市内のクラブの総当たり" },
  { id: "cmp2", name: "練習試合", note: "" },
];

/** デモの試合記録（m1〜m4＝リーグ戦、m5・m6＝練習試合）。日付は today からの相対 */
export function sampleMatches(today: string): MatchRecord[] {
  return [
    {
      id: "m1",
      date: addDaysStr(today, -116),
      opponent: "みどり台SC",
      competitionId: SAMPLE_LEAGUE_COMPETITION_ID,
      ourScore: 3,
      theirScore: 1,
      formation: "3-3-1",
      lineup: [
        { pos: "GK", playerId: "p01" },
        { pos: "DF1", playerId: "p02" },
        { pos: "DF2", playerId: "p04" },
        { pos: "DF3", playerId: "p16" },
        { pos: "MF1", playerId: "p06" },
        { pos: "MF2", playerId: "p08" },
        { pos: "MF3", playerId: "p09" },
        { pos: "FW1", playerId: "p10" },
      ],
      periods: 2,
      halfMinutes: 20,
      goals: [
        { playerId: "p10", minute: 12, origin: "open" },
        { playerId: "p09", minute: 27, assistPlayerId: "p08", origin: "counter" },
        { playerId: "p10", minute: 39, origin: "open" },
      ],
      subs: [{ outPlayerId: "p09", inPlayerId: "p15", minute: 33 }],
      conceded: [{ minute: 19, origin: "set" }],
      note: "序盤から主導権を握れた。左右のワイドが起点になった。",
    },
    {
      id: "m2",
      date: addDaysStr(today, -95),
      opponent: "白鷺FC",
      competitionId: SAMPLE_LEAGUE_COMPETITION_ID,
      ourScore: 1,
      theirScore: 2,
      formation: "3-2-2",
      lineup: [
        { pos: "GK", playerId: "p01" },
        { pos: "DF1", playerId: "p02" },
        { pos: "DF2", playerId: "p04" },
        { pos: "DF3", playerId: "p05" },
        { pos: "MF1", playerId: "p06" },
        { pos: "MF2", playerId: "p07" },
        { pos: "FW1", playerId: "p08" },
        { pos: "FW2", playerId: "p11" },
      ],
      periods: 2,
      halfMinutes: 20,
      goals: [{ playerId: "p08", minute: 41, assistPlayerId: "p06", origin: "set" }],
      subs: [{ outPlayerId: "p07", inPlayerId: "p14", minute: 30 }],
      conceded: [
        { minute: 15, origin: "open" },
        { minute: 44, origin: "counter" },
      ],
      note: "後半に運動量が落ち、終盤の失点が響いた。",
    },
    {
      id: "m3",
      date: addDaysStr(today, -67),
      opponent: "東ヶ丘少年団",
      competitionId: SAMPLE_LEAGUE_COMPETITION_ID,
      ourScore: 2,
      theirScore: 0,
      formation: "3-3-1",
      lineup: [
        { pos: "GK", playerId: "p01" },
        { pos: "DF1", playerId: "p02" },
        { pos: "DF2", playerId: "p04" },
        { pos: "DF3", playerId: "p16" },
        { pos: "MF1", playerId: "p06" },
        { pos: "MF2", playerId: "p09" },
        { pos: "MF3", playerId: "p11" },
        { pos: "FW1", playerId: "p10" },
      ],
      periods: 2,
      halfMinutes: 20,
      goals: [
        { playerId: "p11", minute: 8, origin: "open" },
        { playerId: "p10", minute: 35, assistPlayerId: "p09", origin: "counter" },
      ],
      subs: [],
      note: "早い時間の先制が効いた。守備の連携も安定していた。",
    },
    {
      id: "m4",
      date: addDaysStr(today, -53),
      opponent: "コスモスJFC",
      competitionId: SAMPLE_LEAGUE_COMPETITION_ID,
      ourScore: 2,
      theirScore: 2,
      formation: "2-4-1",
      lineup: [
        { pos: "GK", playerId: "p01" },
        { pos: "DF1", playerId: "p02" },
        { pos: "DF2", playerId: "p16" },
        { pos: "MF1", playerId: "p06" },
        { pos: "MF2", playerId: "p07" },
        { pos: "MF3", playerId: "p09" },
        { pos: "MF4", playerId: "p11" },
        { pos: "FW1", playerId: "p08" },
      ],
      periods: 2,
      halfMinutes: 20,
      goals: [
        { playerId: "p09", minute: 15, origin: "open" },
        { playerId: "p06", minute: 44, origin: "set" },
      ],
      subs: [{ outPlayerId: "p11", inPlayerId: "p15", minute: 30 }],
      conceded: [
        { minute: 25, origin: "counter" },
        { minute: 41, origin: "set" },
      ],
      note: "終盤に追いつかれたが、粘って追いつき返した。",
    },
    {
      id: "m5",
      date: addDaysStr(today, -32),
      opponent: "青葉SC",
      competitionId: "cmp2",
      ourScore: 0,
      theirScore: 3,
      goals: [],
      subs: [{ outPlayerId: "p07", inPlayerId: "p14", minute: 25 }],
      note: "相手の運動量に終始押し込まれた。次への課題が見えた試合。",
    },
    {
      id: "m6",
      date: addDaysStr(today, -11),
      opponent: "高砂フットボールクラブ",
      competitionId: "cmp2",
      // groups-phase2 §3-1: サンプル試合のうち1件（練習試合）をAチーム対象にする
      groupIds: [SAMPLE_GROUP_A_ID],
      ourScore: 4,
      theirScore: 2,
      goals: [
        { playerId: "p10", minute: 5 },
        { playerId: "p08", minute: 22, assistPlayerId: "p11" },
        { playerId: "p09", minute: 30 },
        { playerId: "p10", minute: 38 },
      ],
      subs: [{ outPlayerId: "p10", inPlayerId: "p15", minute: 42 }],
      note: "終始主導権を握り、複数得点で快勝。",
    },
  ];
}
