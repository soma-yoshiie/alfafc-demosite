"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DiscSize,
  DrillDoc,
  DrillItemKind,
  DrillLineKind,
  PitchType,
  Point,
  SavedDrill,
} from "@/lib/types";
import {
  loadDrills,
  loadDrillWork,
  saveDrills,
  saveDrillWork,
} from "@/lib/storage";
import { renderDrillPng } from "@/lib/exportDrill";
import { useBoard } from "./BoardProvider";

export type DrillTool =
  | "move"
  | "delete"
  | DrillLineKind
  | DrillItemKind;

export const LINE_TOOLS: DrillTool[] = ["run", "pass", "dribble", "line"];
export const ITEM_TOOLS: DrillItemKind[] = [
  "cone",
  "player",
  "oppo",
  "ball",
  "goal",
  "marker",
];

function sampleDrill(): DrillDoc {
  return {
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
      {
        id: "l2",
        kind: "run",
        path: [
          { x: 50, y: 68 },
          { x: 50, y: 86 },
        ],
      },
    ],
  };
}

function emptyDoc(): DrillDoc {
  return { title: "新しい練習メニュー", memo: "", pitchType: "half", items: [], lines: [], discSize: "L" };
}

let seq = 0;
function nid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

interface DrillContextValue {
  doc: DrillDoc;
  tool: DrillTool;
  setTool: (t: DrillTool) => void;
  setPitchType: (p: PitchType) => void;
  setTitle: (t: string) => void;
  setMemo: (m: string) => void;
  addItem: (kind: DrillItemKind, x: number, y: number) => void;
  moveItem: (id: string, x: number, y: number) => void;
  removeItem: (id: string) => void;
  rotateItem: (id: string) => void;
  setDiscSize: (s: DiscSize) => void;
  addLine: (kind: DrillLineKind, path: Point[]) => void;
  removeLine: (id: string) => void;
  clearAll: () => void;
  undo: () => void;
  // library
  drills: SavedDrill[];
  currentId: string | null;
  saveDrill: () => void;
  saveAsNew: (title: string) => void;
  loadDrill: (id: string) => void;
  deleteDrill: (id: string) => void;
  newDrill: () => void;
  exportPng: () => void;
  // refs / drawing
  pitchRef: React.RefObject<HTMLDivElement | null>;
  getPitchRect: () => DOMRect | null;
  tempLine: Point[] | null;
  setTempLine: (pts: Point[] | null) => void;
  // sheet
  sheet: "library" | "saveAs" | "memo" | null;
  openSheet: (s: "library" | "saveAs" | "memo" | null) => void;
}

const Ctx = createContext<DrillContextValue | null>(null);
export function useDrill(): DrillContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDrill must be used within DrillProvider");
  return v;
}

export function DrillProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  const [doc, setDoc] = useState<DrillDoc>(sampleDrill);
  const [tool, setTool] = useState<DrillTool>("move");
  const [drills, setDrills] = useState<SavedDrill[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tempLine, setTempLine] = useState<Point[] | null>(null);
  const [sheet, setSheet] = useState<"library" | "saveAs" | "memo" | null>(null);
  const hydrated = useRef(false);
  const docRef = useRef(doc);
  const drillsRef = useRef(drills);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    drillsRef.current = drills;
  }, [drills]);

  // hydrate
  useEffect(() => {
    setDrills(loadDrills());
    const work = loadDrillWork();
    if (work) {
      setDoc(work.doc);
      setCurrentId(work.currentId ?? null);
    }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (hydrated.current) saveDrillWork(doc, currentId);
  }, [doc, currentId]);
  useEffect(() => {
    if (hydrated.current) saveDrills(drills);
  }, [drills]);

  // ホームから「保存した練習メニュー」で入ったらライブラリを開く
  useEffect(() => {
    if (board.drillIntent === "library") {
      setSheet("library");
      board.setDrillIntent(null);
    }
  }, [board]);

  // チャットで受け取ったトレーニング(ドリル)を読み込んで表示
  useEffect(() => {
    if (board.incomingDrill) {
      const d = board.incomingDrill;
      setDoc({
        title: d.title,
        memo: d.memo,
        pitchType: d.pitchType,
        discSize: d.discSize,
        items: d.items.map((it) => ({ ...it })),
        lines: d.lines.map((l) => ({ ...l, path: l.path.map((p) => ({ ...p })) })),
      });
      setCurrentId(null);
      setTool("move");
      setSheet(null);
      board.setIncomingDrill(null);
      board.toast(`「${d.title}」を表示しました`);
    }
  }, [board]);

  const pitchRef = useRef<HTMLDivElement | null>(null);
  const getPitchRect = useCallback(
    () => pitchRef.current?.getBoundingClientRect() ?? null,
    []
  );

  const setPitchType = useCallback(
    (p: PitchType) => setDoc((d) => ({ ...d, pitchType: p })),
    []
  );
  const setTitle = useCallback(
    (t: string) => setDoc((d) => ({ ...d, title: t })),
    []
  );
  const setMemo = useCallback(
    (m: string) => setDoc((d) => ({ ...d, memo: m })),
    []
  );
  const addItem = useCallback((kind: DrillItemKind, x: number, y: number) => {
    setDoc((d) => ({
      ...d,
      items: [...d.items, { id: nid("i"), kind, x, y }],
    }));
  }, []);
  const moveItem = useCallback((id: string, x: number, y: number) => {
    setDoc((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, x, y } : it)),
    }));
  }, []);
  const removeItem = useCallback((id: string) => {
    setDoc((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }));
  }, []);
  const rotateItem = useCallback((id: string) => {
    setDoc((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.id === id ? { ...it, rot: ((it.rot ?? 0) + 90) % 360 } : it
      ),
    }));
  }, []);
  const setDiscSize = useCallback((s: DiscSize) => {
    setDoc((d) => ({ ...d, discSize: s }));
  }, []);
  const addLine = useCallback((kind: DrillLineKind, path: Point[]) => {
    setDoc((d) => ({
      ...d,
      lines: [...d.lines, { id: nid("l"), kind, path }],
    }));
  }, []);
  const removeLine = useCallback((id: string) => {
    setDoc((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  }, []);
  const clearAll = useCallback(() => {
    setDoc((d) => ({ ...d, items: [], lines: [] }));
    board.toast("配置と動線を消去しました");
  }, [board]);
  const undo = useCallback(() => {
    setDoc((d) => {
      if (d.lines.length) return { ...d, lines: d.lines.slice(0, -1) };
      if (d.items.length) return { ...d, items: d.items.slice(0, -1) };
      return d;
    });
  }, []);

  const cloneDoc = useCallback((d: DrillDoc): DrillDoc => ({
    title: d.title,
    memo: d.memo,
    pitchType: d.pitchType,
    items: d.items.map((it) => ({ ...it })),
    lines: d.lines.map((l) => ({ ...l, path: l.path.map((p) => ({ ...p })) })),
  }), []);

  const saveDrill = useCallback(() => {
    const d = docRef.current;
    if (!currentId) {
      setSheet("saveAs");
      return;
    }
    setDrills((list) =>
      list.map((s) =>
        s.id === currentId
          ? { ...cloneDoc(d), id: currentId, updatedAt: Date.now() }
          : s
      )
    );
    board.toast("上書き保存しました");
  }, [currentId, cloneDoc, board]);

  const saveAsNew = useCallback(
    (title: string) => {
      const d = cloneDoc(docRef.current);
      d.title = title.trim() || d.title;
      const id = nid("drill");
      setDrills((list) => [{ ...d, id, updatedAt: Date.now() }, ...list]);
      setCurrentId(id);
      setDoc((cur) => ({ ...cur, title: d.title }));
      setSheet(null);
      board.toast(`「${d.title}」を保存しました`);
    },
    [cloneDoc, board]
  );

  const loadDrill = useCallback(
    (id: string) => {
      const s = drillsRef.current.find((x) => x.id === id);
      if (!s) return;
      setDoc(cloneDoc(s));
      setCurrentId(id);
      setTool("move");
      setSheet(null);
      board.toast(`「${s.title}」を読み込みました`);
    },
    [cloneDoc, board]
  );

  const deleteDrill = useCallback(
    (id: string) => {
      setDrills((list) => list.filter((x) => x.id !== id));
      setCurrentId((cur) => (cur === id ? null : cur));
      board.toast("削除しました");
    },
    [board]
  );

  const newDrill = useCallback(() => {
    setDoc(emptyDoc());
    setCurrentId(null);
    setTool("move");
    setSheet(null);
    board.toast("新しい練習メニューを作成しました");
  }, [board]);

  const exportPng = useCallback(() => {
    try {
      const url = renderDrillPng(docRef.current);
      const a = document.createElement("a");
      a.href = url;
      a.download = "drill.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      board.toast("画像を保存しました");
    } catch {
      board.toast("画像の生成に失敗しました");
    }
  }, [board]);

  const openSheet = useCallback(
    (s: "library" | "saveAs" | "memo" | null) => setSheet(s),
    []
  );

  const value = useMemo<DrillContextValue>(
    () => ({
      doc,
      tool,
      setTool,
      setPitchType,
      setTitle,
      setMemo,
      addItem,
      moveItem,
      removeItem,
      rotateItem,
      setDiscSize,
      addLine,
      removeLine,
      clearAll,
      undo,
      drills,
      currentId,
      saveDrill,
      saveAsNew,
      loadDrill,
      deleteDrill,
      newDrill,
      exportPng,
      pitchRef,
      getPitchRect,
      tempLine,
      setTempLine,
      sheet,
      openSheet,
    }),
    [
      doc,
      tool,
      drills,
      currentId,
      tempLine,
      sheet,
      setPitchType,
      setTitle,
      setMemo,
      addItem,
      moveItem,
      removeItem,
      rotateItem,
      setDiscSize,
      addLine,
      removeLine,
      clearAll,
      undo,
      saveDrill,
      saveAsNew,
      loadDrill,
      deleteDrill,
      newDrill,
      exportPng,
      getPitchRect,
      openSheet,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
