import type { Library, Move, SavedDrill, SavedPlay, SavedSetPiece, Slot } from "./types";
import { buildSlots } from "./formations";
import { SAMPLE_PLAYERS } from "./sampleTeam";
import { buildSetPieceState, getSetPiecePreset } from "./setPiecePresets";

/*
 * デモのライブラリ（ux-fix R3-3）。保存形式は今までどおり（Library／SavedDrill）。
 * 初回起動で保存データが無いときだけ BoardProvider／loadDrills が使う。
 * 戦術 2・練習 1・セットプレー 1 を入れて、ライブラリを開いたときに空でないようにする。
 */

const DAY = 24 * 60 * 60 * 1000;

function slotsWithPlayers(formation: string): Slot[] {
  const slots = buildSlots(formation);
  SAMPLE_PLAYERS.slice(0, slots.length).forEach((p, i) => {
    slots[i].pid = p.id;
  });
  return slots;
}

/** 戦術 2・セットプレー 1。フォルダは無し */
export function sampleLibrary(now: number = Date.now()): Library {
  // 4-3-3 のスロット番号：0=GK 1=RB 2=CB 3=CB 4=LB 5=CM 6=CM 7=CM 8=RW 9=ST 10=LW
  const buildUpMoves: Move[] = [
    { actor: "ball", path: [{ x: 50, y: 12 }, { x: 63, y: 24 }], start: 0, dur: 1, step: 0, kind: "pass", to: 2 },
    { actor: "ball", path: [{ x: 63, y: 24 }, { x: 68, y: 52 }], start: 0, dur: 1.1, step: 1, kind: "pass", to: 5 },
    { actor: 8, path: [{ x: 80, y: 78 }, { x: 86, y: 90 }], start: 0.2, dur: 1.3, step: 1, kind: "run" },
    { actor: "ball", path: [{ x: 68, y: 52 }, { x: 86, y: 90 }], start: 0, dur: 1.2, step: 2, kind: "pass", to: 8 },
  ];
  const buildUp: SavedPlay = {
    id: "demo_play_buildup",
    title: "ビルドアップ（4-3-3）",
    folderId: null,
    formation: "4-3-3",
    slots: slotsWithPlayers("4-3-3"),
    ball: { x: 50, y: 12 },
    moves: buildUpMoves,
    holder: null,
    opponents: [],
    drawings: [],
    shapes: [],
    stepCount: 3,
    guides: {},
    pitchView: "full",
    updatedAt: now - 3 * DAY,
  };

  const sideMoves: Move[] = [
    { actor: "ball", path: [{ x: 60, y: 50 }, { x: 82, y: 54 }], start: 0, dur: 0.9, step: 0, kind: "pass", to: 5 },
    { actor: 5, path: [{ x: 82, y: 54 }, { x: 88, y: 76 }], start: 0.3, dur: 1.4, step: 1, kind: "run" },
    { actor: 9, path: [{ x: 62, y: 83 }, { x: 55, y: 90 }], start: 0.2, dur: 1.2, step: 1, kind: "run" },
    { actor: "ball", path: [{ x: 88, y: 76 }, { x: 55, y: 90 }], start: 0.8, dur: 1, step: 1, kind: "pass", to: 9 },
  ];
  const side: SavedPlay = {
    id: "demo_play_side",
    title: "サイド攻撃（4-4-2）",
    folderId: null,
    formation: "4-4-2",
    slots: slotsWithPlayers("4-4-2"),
    ball: { x: 60, y: 50 },
    moves: sideMoves,
    holder: null,
    opponents: [],
    drawings: [],
    shapes: [],
    stepCount: 2,
    guides: {},
    pitchView: "full",
    updatedAt: now - 8 * DAY,
  };

  const setPieces: SavedSetPiece[] = [];
  const preset = getSetPiecePreset("ck-near-attack");
  if (preset) {
    const st = buildSetPieceState(preset, SAMPLE_PLAYERS.slice(0, preset.slots.length));
    if (st.setPiece) {
      setPieces.push({
        id: "demo_setpiece_ck",
        title: "CK：ニア狙い",
        folderId: null,
        formation: st.formation,
        slots: st.slots,
        ball: st.ball,
        moves: st.moves,
        holder: null,
        opponents: st.opponents,
        drawings: [],
        shapes: st.shapes,
        stepCount: 1,
        guides: {},
        pitchView: st.pitchView,
        updatedAt: now - 5 * DAY,
        setPiece: st.setPiece,
      });
    }
  }

  return { plays: [buildUp, side], folders: [], setPieces };
}

/** 練習メニュー 1（初回起動で保存データが無いときだけ。DrillProvider の作業中サンプルと同じ内容） */
export function sampleSavedDrills(now: number = Date.now()): SavedDrill[] {
  return [
    {
      id: "demo_drill_zigzag",
      title: "ジグザグ・ドリブル＆シュート",
      memo: "コーンをジグザグにドリブル → 最後にシュート。左右両足で。",
      pitchType: "half",
      discSize: "L",
      items: [
        { id: "i1", kind: "cone", x: 40, y: 32 },
        { id: "i2", kind: "cone", x: 60, y: 44 },
        { id: "i3", kind: "cone", x: 40, y: 56 },
        { id: "i4", kind: "player", x: 50, y: 18, label: "1" },
        { id: "i5", kind: "ball", x: 50, y: 23 },
        { id: "i6", kind: "goal", x: 50, y: 94 },
      ],
      lines: [
        {
          id: "l1",
          kind: "dribble",
          path: [
            { x: 50, y: 23 },
            { x: 40, y: 32 },
            { x: 60, y: 44 },
            { x: 40, y: 56 },
            { x: 50, y: 68 },
          ],
        },
        { id: "l2", kind: "run", path: [{ x: 50, y: 68 }, { x: 50, y: 86 }] },
      ],
      updatedAt: now - 2 * DAY,
    },
  ];
}
