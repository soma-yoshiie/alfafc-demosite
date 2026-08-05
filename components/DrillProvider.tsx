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
import { drillSceneCount } from "@/lib/types";
import {
  loadDrills,
  loadDrillWork,
  saveDrills,
  saveDrillWork,
} from "@/lib/storage";
import { renderDrillPng } from "@/lib/exportDrill";
import { useBoard } from "./BoardProvider";

/** 配置・描画ツール。null = 選択（直接操作）モード */
export type DrillTool = DrillLineKind | DrillItemKind;

export const LINE_TOOLS: DrillLineKind[] = ["run", "pass", "dribble", "line"];
export const ITEM_TOOLS: DrillItemKind[] = [
  "cone",
  "player",
  "oppo",
  "ball",
  "goal",
  "marker",
  "text",
];

export type DrillSelection =
  | { type: "item"; id: string }
  | { type: "line"; id: string }
  | null;

export type DrillSheet = "library" | "saveAs" | "memo" | "send" | null;

const HISTORY_MAX = 60;

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

function cloneDoc(d: DrillDoc): DrillDoc {
  return {
    title: d.title,
    memo: d.memo,
    pitchType: d.pitchType,
    discSize: d.discSize,
    items: d.items.map((it) => ({ ...it })),
    lines: d.lines.map((l) => ({ ...l, path: l.path.map((p) => ({ ...p })) })),
    sceneCount: d.sceneCount,
    sceneIntents: d.sceneIntents ? [...d.sceneIntents] : undefined,
  };
}

/** 保存状態の比較用（キー順に依存しない正規化シリアライズ） */
function docJson(d: DrillDoc): string {
  return JSON.stringify({
    t: d.title,
    m: d.memo,
    p: d.pitchType,
    s: d.discSize ?? "L",
    i: d.items.map((it) => [it.id, it.kind, it.x, it.y, it.label ?? "", it.rot ?? 0, it.step ?? 0]),
    l: d.lines.map((ln) => [ln.id, ln.kind, ln.path.map((q) => [q.x, q.y]), ln.step ?? 0]),
    sc: d.sceneCount ?? 1,
    // 末尾の空文字は落として比較(「1文字打って消した」だけで永久にdirtyになるのを防ぐ)
    si: (() => {
      const a = (d.sceneIntents ?? []).slice(0, drillSceneCount(d));
      while (a.length && !a[a.length - 1].trim()) a.pop();
      return a;
    })(),
  });
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** sceneIntentsを場面数ぶんの長さに正規化した新規配列で返す（欠けている場面は空文字で補完） */
function sceneIntentsOf(d: DrillDoc): string[] {
  const n = drillSceneCount(d);
  const src = d.sceneIntents ?? [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(src[i] ?? "");
  return out;
}

interface DrillContextValue {
  doc: DrillDoc;
  // ツール（null = 選択モード）
  tool: DrillTool | null;
  setTool: (t: DrillTool | null) => void;
  stampLock: boolean;
  setStampLock: (b: boolean) => void;
  // 選択
  selection: DrillSelection;
  select: (s: DrillSelection) => void;
  // 場面（シーン）: 1枚図では表現できない「この場面ではこの動き、次の場面ではこの動き」を段階で作る
  /** 現在表示・編集中の場面（0始まり）。永続化しない */
  scene: number;
  setScene: (n: number) => void;
  /** 現在の場面の配置を複製して新しい場面を追加（commit経由・undo可能）。上限6場面 */
  addScene: () => void;
  /** 場面nを削除（sceneCountが2以上のときのみ有効・commit経由） */
  removeScene: (n: number) => void;
  /** 場面nの意図テキストを更新（setMemoと同じくタイトル編集扱い・履歴には積まない） */
  setSceneIntent: (n: number, text: string) => void;
  // ドキュメント編集（履歴に積まれる）
  setPitchType: (p: PitchType) => void;
  setDiscSize: (s: DiscSize) => void;
  addItem: (kind: DrillItemKind, x: number, y: number) => string;
  moveItem: (id: string, x: number, y: number) => void;
  removeItem: (id: string) => void;
  rotateItem: (id: string) => void;
  duplicateItem: (id: string) => string | null;
  setItemLabel: (id: string, label: string) => void;
  addLine: (kind: DrillLineKind, path: Point[]) => string;
  removeLine: (id: string) => void;
  /** 動線の端点を動かす（beginGesture 後に呼ぶ・履歴は積まない） */
  setLinePointLive: (id: string, index: number, p: Point) => void;
  /** 動線全体を平行移動（beginGesture 後に呼ぶ・履歴は積まない） */
  translateLineLive: (id: string, dx: number, dy: number, orig: Point[]) => void;
  /** ドラッグ操作の開始時に1回呼ぶと、その時点が履歴に積まれる */
  beginGesture: () => void;
  clearAll: () => void;
  // タイトル・メモ（履歴に積まない）
  setTitle: (t: string) => void;
  setMemo: (m: string) => void;
  // 履歴
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // ライブラリ
  drills: SavedDrill[];
  currentId: string | null;
  /** 現在の内容がライブラリ保存版から変更されているか（未保存ドキュメントは常に true） */
  dirty: boolean;
  saveDrill: () => void;
  saveAsNew: (title: string) => void;
  loadDrill: (id: string) => void;
  /** 未保存の作業があれば確認してから読み込む（エディタ内ライブラリ／ライブラリシート共通） */
  loadDrillConfirmed: (id: string) => void;
  deleteDrill: (id: string) => void;
  newDrill: () => void;
  exportPng: () => void;
  // refs / drawing
  pitchRef: React.RefObject<HTMLDivElement | null>;
  getPitchRect: () => DOMRect | null;
  tempLine: Point[] | null;
  setTempLine: (pts: Point[] | null) => void;
  // sheet
  sheet: DrillSheet;
  openSheet: (s: DrillSheet) => void;
}

const Ctx = createContext<DrillContextValue | null>(null);
export function useDrill(): DrillContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDrill must be used within DrillProvider");
  return v;
}

export function DrillProvider({ children }: { children: React.ReactNode }) {
  const board = useBoard();
  // 作業中ドキュメントもlazy初期化（保存が無ければサンプル）。
  // effectでの復元だと、初期値サンプルのまま保存effectが先に走って
  // 保存済みの作業内容をサンプルで上書きする競合がある（drillsと同じ問題）
  const [doc, setDocState] = useState<DrillDoc>(() => {
    const work = loadDrillWork();
    return work ? { ...emptyDoc(), ...work.doc } : sampleDrill();
  });
  const [tool, setToolState] = useState<DrillTool | null>(null);
  const [stampLock, setStampLock] = useState(false);
  const [selection, setSelection] = useState<DrillSelection>(null);
  // 現在表示・編集中の場面（永続化しない）。addItem/addLine/nextLabel はコールバック内で
  // 常に最新値を読む必要があるため、docRef と同じ流儀で ref も並行して持つ
  const [scene, setSceneState] = useState<number>(0);
  const sceneRef = useRef(0);
  // lazy初期化で保存データを直接読む（TeamProviderと同じ方式）。
  // hydrate用effectでsetDrillsすると、初期値[]のまま保存effectが先に走って
  // ライブラリを空配列で上書きし、StrictModeの二重マウントで消失が確定する
  const [drills, setDrills] = useState<SavedDrill[]>(() => loadDrills());
  const [currentId, setCurrentId] = useState<string | null>(
    () => loadDrillWork()?.currentId ?? null
  );
  const [tempLine, setTempLine] = useState<Point[] | null>(null);
  const [sheet, setSheet] = useState<DrillSheet>(null);
  const hydrated = useRef(false);
  const docRef = useRef(doc);
  const drillsRef = useRef(drills);
  const currentIdRef = useRef(currentId);
  // 履歴（StrictModeの二重実行を避けるため、state更新関数の外で積む）
  const past = useRef<DrillDoc[]>([]);
  const future = useRef<DrillDoc[]>([]);
  const [histVer, setHistVer] = useState(0);
  // 保存済みスナップショット（dirty判定用）。null = ライブラリ未保存
  const savedJson = useRef<string | null>(null);
  const [savedVer, setSavedVer] = useState(0);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  useEffect(() => {
    drillsRef.current = drills;
  }, [drills]);
  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  // docが差し替わって場面数が減った（他ドキュメントの読込・場面削除等）場合に
  // 表示中のsceneが範囲外にならないようクランプする
  useEffect(() => {
    const n = drillSceneCount(doc);
    setSceneState((s) => clamp(s, 0, n - 1));
  }, [doc]);

  const bumpHist = useCallback(() => setHistVer((v) => v + 1), []);

  /** docを差し替え、直前の状態を履歴へ積む */
  const commit = useCallback(
    (next: DrillDoc) => {
      past.current.push(docRef.current);
      if (past.current.length > HISTORY_MAX) past.current.shift();
      future.current = [];
      docRef.current = next;
      setDocState(next);
      bumpHist();
    },
    [bumpHist]
  );

  /** 履歴に積まずにdocを差し替え（タイトル編集・ドラッグ中のライブ更新） */
  const setDocLight = useCallback((next: DrillDoc) => {
    docRef.current = next;
    setDocState(next);
  }, []);

  const beginGesture = useCallback(() => {
    past.current.push(cloneDoc(docRef.current));
    if (past.current.length > HISTORY_MAX) past.current.shift();
    future.current = [];
    bumpHist();
  }, [bumpHist]);

  const resetHistory = useCallback(() => {
    past.current = [];
    future.current = [];
    bumpHist();
  }, [bumpHist]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    docRef.current = prev;
    setDocState(prev);
    setSelection(null);
    bumpHist();
  }, [bumpHist]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    docRef.current = next;
    setDocState(next);
    setSelection(null);
    bumpHist();
  }, [bumpHist]);

  // hydrate（doc/currentId/drillsはlazy初期化済み。dirty判定用スナップショットだけ整える）
  useEffect(() => {
    const saved = currentId ? drills.find((s) => s.id === currentId) : null;
    savedJson.current = saved ? docJson(cloneDoc(saved)) : null;
    setSavedVer((v) => v + 1);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hydrated.current) saveDrillWork(doc, currentId);
  }, [doc, currentId]);
  useEffect(() => {
    if (hydrated.current) saveDrills(drills);
  }, [drills]);

  // チャットで受け取ったトレーニング(ドリル)を読み込んで表示
  useEffect(() => {
    if (board.incomingDrill) {
      const d = board.incomingDrill;
      const next = cloneDoc(d);
      docRef.current = next;
      setDocState(next);
      setCurrentId(null);
      savedJson.current = null;
      setSavedVer((v) => v + 1);
      setToolState(null);
      setSelection(null);
      setSceneState(0);
      setSheet(null);
      resetHistory();
      board.setIncomingDrill(null);
      board.toast(`「${d.title}」を表示しました`);
    }
  }, [board, resetHistory]);

  const pitchRef = useRef<HTMLDivElement | null>(null);
  const getPitchRect = useCallback(
    () => pitchRef.current?.getBoundingClientRect() ?? null,
    []
  );

  const setTool = useCallback((t: DrillTool | null) => {
    setToolState(t);
    if (t) setSelection(null);
  }, []);

  const select = useCallback((s: DrillSelection) => {
    setSelection(s);
    if (s) setToolState(null);
  }, []);

  /* ---- 場面（シーン） ---- */

  const setScene = useCallback((n: number) => {
    const cnt = drillSceneCount(docRef.current);
    setSceneState(clamp(Math.round(n), 0, cnt - 1));
    setSelection(null);
  }, []);

  const addScene = useCallback(() => {
    const d = docRef.current;
    const cnt = drillSceneCount(d);
    if (cnt >= 6) return;
    const cur = sceneRef.current;
    const newScene = cnt;
    // コーチは同じ配置から次の動きを描くことが多いため、現在の場面のitems/linesを複製して積み増す
    const items = d.items
      .filter((it) => (it.step ?? 0) === cur)
      .map((it) => ({ ...it, id: nid("i"), step: newScene }));
    const lines = d.lines
      .filter((l) => (l.step ?? 0) === cur)
      .map((l) => ({ ...l, id: nid("l"), step: newScene, path: l.path.map((p) => ({ ...p })) }));
    commit({
      ...d,
      items: [...d.items, ...items],
      lines: [...d.lines, ...lines],
      sceneCount: newScene + 1,
      sceneIntents: [...sceneIntentsOf(d), ""],
    });
    setSceneState(newScene);
    setSelection(null);
  }, [commit]);

  const removeScene = useCallback(
    (n: number) => {
      const d = docRef.current;
      const cnt = drillSceneCount(d);
      if (cnt <= 1 || n < 0 || n >= cnt) return;
      const items = d.items
        .filter((it) => (it.step ?? 0) !== n)
        .map((it) => ((it.step ?? 0) > n ? { ...it, step: (it.step ?? 0) - 1 } : { ...it }));
      const lines = d.lines
        .filter((l) => (l.step ?? 0) !== n)
        .map((l) =>
          (l.step ?? 0) > n
            ? { ...l, step: (l.step ?? 0) - 1, path: l.path.map((p) => ({ ...p })) }
            : { ...l, path: l.path.map((p) => ({ ...p })) }
        );
      const intents = sceneIntentsOf(d);
      intents.splice(n, 1);
      commit({ ...d, items, lines, sceneCount: cnt - 1, sceneIntents: intents });
      // 削除場面より後ろを表示中なら詰めて追従(BoardProviderのremoveStepと同じ規約)。
      // clampだけだと「見ていた場面の次」が表示されてしまう
      setSceneState((s) => (s > n ? s - 1 : clamp(s, 0, cnt - 2)));
      setSelection(null);
      board.toast(`場面${n + 1}を削除しました`);
    },
    [commit, board]
  );

  const setSceneIntent = useCallback(
    (n: number, text: string) => {
      const d = docRef.current;
      const intents = sceneIntentsOf(d);
      if (n < 0 || n >= intents.length) return;
      intents[n] = text;
      setDocLight({ ...d, sceneIntents: intents });
    },
    [setDocLight]
  );

  /* ---- 編集オペレーション ---- */

  const setPitchType = useCallback(
    (p: PitchType) => commit({ ...docRef.current, pitchType: p }),
    [commit]
  );
  const setDiscSize = useCallback(
    (s: DiscSize) => commit({ ...docRef.current, discSize: s }),
    [commit]
  );
  const setTitle = useCallback(
    (t: string) => setDocLight({ ...docRef.current, title: t }),
    [setDocLight]
  );
  const setMemo = useCallback(
    (m: string) => setDocLight({ ...docRef.current, memo: m }),
    [setDocLight]
  );

  /** 選手・相手は空いている番号を自動で振る（同じ場面内のitemsだけを見る＝場面をまたいで同じ番号を使い回せる） */
  const nextLabel = useCallback((kind: DrillItemKind): string | undefined => {
    if (kind !== "player" && kind !== "oppo") return undefined;
    const cur = sceneRef.current;
    const used = new Set(
      docRef.current.items
        .filter((i) => i.kind === kind && (i.step ?? 0) === cur)
        .map((i) => i.label)
    );
    let n = 1;
    while (used.has(String(n))) n += 1;
    return String(n);
  }, []);

  const addItem = useCallback(
    (kind: DrillItemKind, x: number, y: number): string => {
      const id = nid("i");
      const d = docRef.current;
      commit({
        ...d,
        items: [...d.items, { id, kind, x, y, label: nextLabel(kind), step: sceneRef.current }],
      });
      return id;
    },
    [commit, nextLabel]
  );

  const moveItem = useCallback(
    (id: string, x: number, y: number) => {
      const d = docRef.current;
      commit({
        ...d,
        items: d.items.map((it) => (it.id === id ? { ...it, x, y } : it)),
      });
    },
    [commit]
  );

  const removeItem = useCallback(
    (id: string) => {
      const d = docRef.current;
      commit({ ...d, items: d.items.filter((it) => it.id !== id) });
      setSelection((s) => (s?.type === "item" && s.id === id ? null : s));
    },
    [commit]
  );

  const rotateItem = useCallback(
    (id: string) => {
      const d = docRef.current;
      commit({
        ...d,
        items: d.items.map((it) =>
          it.id === id ? { ...it, rot: ((it.rot ?? 0) + 90) % 360 } : it
        ),
      });
    },
    [commit]
  );

  const duplicateItem = useCallback(
    (id: string): string | null => {
      const d = docRef.current;
      const src = d.items.find((it) => it.id === id);
      if (!src) return null;
      const nId = nid("i");
      const copy = {
        ...src,
        id: nId,
        x: clamp(src.x + 5, 2, 98),
        y: clamp(src.y - 5, 2, 98),
        label: nextLabel(src.kind) ?? src.label,
      };
      commit({ ...d, items: [...d.items, copy] });
      setSelection({ type: "item", id: nId });
      return nId;
    },
    [commit, nextLabel]
  );

  const setItemLabel = useCallback(
    (id: string, label: string) => {
      const d = docRef.current;
      commit({
        ...d,
        items: d.items.map((it) => (it.id === id ? { ...it, label } : it)),
      });
    },
    [commit]
  );

  const addLine = useCallback(
    (kind: DrillLineKind, path: Point[]): string => {
      const id = nid("l");
      const d = docRef.current;
      commit({ ...d, lines: [...d.lines, { id, kind, path, step: sceneRef.current }] });
      return id;
    },
    [commit]
  );

  const removeLine = useCallback(
    (id: string) => {
      const d = docRef.current;
      commit({ ...d, lines: d.lines.filter((l) => l.id !== id) });
      setSelection((s) => (s?.type === "line" && s.id === id ? null : s));
    },
    [commit]
  );

  const setLinePointLive = useCallback(
    (id: string, index: number, p: Point) => {
      const d = docRef.current;
      setDocLight({
        ...d,
        lines: d.lines.map((l) =>
          l.id === id
            ? { ...l, path: l.path.map((q, i) => (i === index ? { ...p } : q)) }
            : l
        ),
      });
    },
    [setDocLight]
  );

  const translateLineLive = useCallback(
    (id: string, dx: number, dy: number, orig: Point[]) => {
      const d = docRef.current;
      setDocLight({
        ...d,
        lines: d.lines.map((l) =>
          l.id === id
            ? {
                ...l,
                path: orig.map((q) => ({
                  x: clamp(q.x + dx, 2, 98),
                  y: clamp(q.y + dy, 2, 98),
                })),
              }
            : l
        ),
      });
    },
    [setDocLight]
  );

  const clearAll = useCallback(() => {
    const d = docRef.current;
    if (d.items.length === 0 && d.lines.length === 0) return;
    // 場面（シーン）も単一場面へリセットする（配置が全部消えるのに場面だけ複数残るのは不自然なため）
    commit({ ...d, items: [], lines: [], sceneCount: 1, sceneIntents: [] });
    setSceneState(0);
    setSelection(null);
    board.toast("配置と動線を消去しました（元に戻せます）");
  }, [commit, board]);

  /* ---- ライブラリ ---- */

  const markSaved = useCallback((d: DrillDoc) => {
    savedJson.current = docJson(d);
    setSavedVer((v) => v + 1);
  }, []);

  const saveDrill = useCallback(() => {
    const d = docRef.current;
    if (!currentId) {
      setSheet("saveAs");
      return;
    }
    const snap = cloneDoc(d);
    setDrills((list) =>
      list.map((s) =>
        s.id === currentId ? { ...snap, id: currentId, updatedAt: Date.now() } : s
      )
    );
    markSaved(snap);
    board.toast("上書き保存しました");
  }, [currentId, board, markSaved]);

  const saveAsNew = useCallback(
    (title: string) => {
      const d = cloneDoc(docRef.current);
      d.title = title.trim() || d.title;
      const id = nid("drill");
      setDrills((list) => [{ ...d, id, updatedAt: Date.now() }, ...list]);
      setCurrentId(id);
      setDocLight({ ...docRef.current, title: d.title });
      markSaved({ ...d });
      setSheet(null);
      board.toast(`「${d.title}」を保存しました`);
    },
    [board, markSaved, setDocLight]
  );

  const loadDrill = useCallback(
    (id: string) => {
      const s = drillsRef.current.find((x) => x.id === id);
      if (!s) return;
      const next = cloneDoc(s);
      docRef.current = next;
      setDocState(next);
      setCurrentId(id);
      markSaved(next);
      setToolState(null);
      setSelection(null);
      setSceneState(0);
      setSheet(null);
      resetHistory();
      board.toast(`「${s.title}」を読み込みました`);
    },
    [board, markSaved, resetHistory]
  );

  /**
   * 未保存の作業がある状態での読み込みは確認を挟む（編集中の内容は resetHistory で
   * undo からも復元できないため）。エディタ内ライブラリ・ライブラリシートの双方が
   * これを通ることで、入口による挙動差を作らない。
   */
  const loadDrillConfirmed = useCallback(
    (id: string) => {
      const cur = docRef.current;
      const hasContent =
        cur.items.length > 0 ||
        cur.lines.length > 0 ||
        (cur.sceneIntents ?? []).some((t) => t.trim() !== "");
      // dirty判定は下の dirty useMemo と同じ基準（保存済みスナップショットとの差分）
      const isDirty = savedJson.current == null || docJson(cur) !== savedJson.current;
      if (isDirty && hasContent && currentIdRef.current !== id) {
        const target = drillsRef.current.find((s) => s.id === id);
        if (!window.confirm(`現在の内容を置き換えて「${target?.title ?? ""}」を読み込みますか？`))
          return;
      }
      loadDrill(id);
    },
    [loadDrill]
  );

  // ホームから「保存した練習メニュー」で入ったらライブラリを開く
  // ／ライブラリシートの練習タブから特定のドリルを指定して入った場合はそれを読み込む
  useEffect(() => {
    const intent = board.drillIntent;
    if (intent === "library") {
      setSheet("library");
      board.setDrillIntent(null);
    } else if (intent && typeof intent === "object") {
      // シートは localStorage のスナップショットを表示しているため、
      // 別タブでの削除等で実体が無いことがある（黙って失敗させない）
      if (!drillsRef.current.some((s) => s.id === intent.open)) {
        board.toast("この練習メニューは見つかりませんでした");
        setSheet("library");
      } else {
        loadDrillConfirmed(intent.open);
      }
      board.setDrillIntent(null);
    }
  }, [board, loadDrillConfirmed]);

  const deleteDrill = useCallback(
    (id: string) => {
      setDrills((list) => list.filter((x) => x.id !== id));
      setCurrentId((cur) => {
        if (cur === id) {
          savedJson.current = null;
          setSavedVer((v) => v + 1);
          return null;
        }
        return cur;
      });
      board.toast("削除しました");
    },
    [board]
  );

  const newDrill = useCallback(() => {
    const next = emptyDoc();
    docRef.current = next;
    setDocState(next);
    setCurrentId(null);
    savedJson.current = null;
    setSavedVer((v) => v + 1);
    setToolState(null);
    setSelection(null);
    setSceneState(0);
    setSheet(null);
    resetHistory();
    board.toast("新しい練習メニューを作成しました");
  }, [board, resetHistory]);

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

  const openSheet = useCallback((s: DrillSheet) => setSheet(s), []);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  const dirty = useMemo(() => {
    void savedVer;
    if (savedJson.current == null) return true;
    return docJson(doc) !== savedJson.current;
  }, [doc, savedVer]);

  const value = useMemo<DrillContextValue>(
    () => ({
      doc,
      tool,
      setTool,
      stampLock,
      setStampLock,
      selection,
      select,
      scene,
      setScene,
      addScene,
      removeScene,
      setSceneIntent,
      setPitchType,
      setDiscSize,
      addItem,
      moveItem,
      removeItem,
      rotateItem,
      duplicateItem,
      setItemLabel,
      addLine,
      removeLine,
      setLinePointLive,
      translateLineLive,
      beginGesture,
      clearAll,
      setTitle,
      setMemo,
      undo,
      redo,
      canUndo,
      canRedo,
      drills,
      currentId,
      dirty,
      saveDrill,
      saveAsNew,
      loadDrill,
      loadDrillConfirmed,
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
      stampLock,
      selection,
      scene,
      drills,
      currentId,
      dirty,
      tempLine,
      sheet,
      canUndo,
      canRedo,
      setTool,
      select,
      setScene,
      addScene,
      removeScene,
      setSceneIntent,
      setPitchType,
      setDiscSize,
      addItem,
      moveItem,
      removeItem,
      rotateItem,
      duplicateItem,
      setItemLabel,
      addLine,
      removeLine,
      setLinePointLive,
      translateLineLive,
      beginGesture,
      clearAll,
      setTitle,
      setMemo,
      undo,
      redo,
      saveDrill,
      saveAsNew,
      loadDrill,
      loadDrillConfirmed,
      deleteDrill,
      newDrill,
      exportPng,
      getPitchRect,
      openSheet,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
