"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import type {
  DiscSize,
  DrillItemKind,
  DrillLine,
  DrillLineKind,
  PitchType,
  Point,
  SavedDrill,
} from "@/lib/types";
import { drillSceneCount } from "@/lib/types";
import { simplify } from "@/lib/animation";
import { ITEM_LABEL, LINE_COLORS, LINE_LABEL } from "@/lib/drillDraw";
import { renderDrillThumbPng } from "@/lib/exportDrill";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { DrillProvider, ITEM_TOOLS, LINE_TOOLS, useDrill } from "./DrillProvider";
import type { DrillSheet } from "./DrillProvider";
import { SendTargetField, targetThreadKeys, type SendTarget } from "./SendTarget";
import DrillItemView from "./DrillItemView";
import DrillLines from "./DrillLines";
import {
  IconCopy,
  IconDownload,
  IconEdit,
  IconFolder,
  IconRedo,
  IconRotate,
  IconSave,
  IconSend,
  IconTrash,
  IconUndo,
} from "./icons";
import { MobileHeader, MobileHeaderAction, MobileHeaderMore } from "./MobileHeader";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** PC(min-width:1024px)判定のブレークポイント。TeamHub.tsx usePc() と同じ値・同じ手法 */
const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TeamHub.tsx usePc() と同じ手法） */
function usePc(): boolean {
  const [pc, setPc] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(PC_MQ).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(PC_MQ);
    const onChange = () => setPc(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return pc;
}

/** PCの練習メニューで中央ダイアログ（旧：レールごと暗転するボトムシート）の代わりに
 * 右カラム(.dxside)のパネルに出す4面のタイトル（TacticsBoard.tsx BOARD_PANEL_TITLE と同じ手法） */
const DRILL_PANEL_TITLE: Record<Exclude<DrillSheet, null>, string> = {
  library: "保存した練習メニュー",
  memo: "タイトル・メモ",
  saveAs: "ライブラリに保存",
  send: "選手アプリに送信",
};

const PITCH_LABEL: Record<PitchType, string> = {
  half: "ハーフ",
  full: "フル縦",
  fullh: "フル横",
  blank: "ブランク",
};

const DISC_LABEL: Record<DiscSize, string> = { L: "大", M: "中", S: "小" };

function Markings({ type }: { type: PitchType }) {
  if (type === "blank") return null;
  if (type === "half")
    return (
      <div className="markings">
        <div className="mk box-top" />
        <div className="mk box-top-s" />
      </div>
    );
  if (type === "fullh")
    return (
      <div className="markings">
        <div className="mk center-line-v" />
        <div className="mk center-circle" />
        <div className="mk spot" />
        <div className="mk box-left" />
        <div className="mk box-left-s" />
        <div className="mk box-right" />
        <div className="mk box-right-s" />
      </div>
    );
  return (
    <div className="markings">
      <div className="mk center-line" />
      <div className="mk center-circle" />
      <div className="mk spot" />
      <div className="mk box-top" />
      <div className="mk box-top-s" />
      <div className="mk box-bot" />
      <div className="mk box-bot-s" />
    </div>
  );
}

/* ---- bottom sheet shell (drill用) ---- */
function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <div className={`sheet${open ? " on" : ""}`}>
        <div className="grabzone" onClick={onClose}>
          <div className="grab" />
        </div>
        <div className="sheetBody">{open ? children : null}</div>
      </div>
    </>
  );
}

/* ---- パレットのミニプレビュー ---- */
function ItemPreview({ kind }: { kind: DrillItemKind }) {
  let inner: React.ReactNode = null;
  if (kind === "cone") inner = <div className="d-cone" style={{ transform: "scale(0.62)" }} />;
  else if (kind === "player")
    inner = <div className="d-disc d-player" style={{ transform: "scale(0.55)" }}>1</div>;
  else if (kind === "oppo")
    inner = <div className="d-disc d-oppo" style={{ transform: "scale(0.55)" }}>1</div>;
  else if (kind === "ball") inner = <div className="d-ball" style={{ transform: "scale(0.8)" }} />;
  else if (kind === "goal") inner = <div className="d-goal" style={{ transform: "scale(0.5)" }} />;
  else if (kind === "marker") inner = <div className="d-marker" />;
  else if (kind === "text") inner = <span className="pv-text">あ</span>;
  return <span className="pv">{inner}</span>;
}

function LinePreview({ kind }: { kind: DrillLineKind }) {
  const col = LINE_COLORS[kind];
  return (
    <span className="pv">
      <svg viewBox="0 0 60 18" style={{ width: "100%", height: 18, display: "block" }}>
        {kind === "dribble" ? (
          <path
            d="M5 9 Q 11 2 17 9 T 29 9 T 41 9 T 50 9"
            fill="none"
            stroke={col}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ) : (
          <line
            x1={5}
            y1={9}
            x2={50}
            y2={9}
            stroke={col}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={kind === "pass" ? "5 4" : undefined}
          />
        )}
        {kind !== "line" && <polygon points="56,9 48,4.5 48,13.5" fill={col} />}
      </svg>
    </span>
  );
}

/* ---- ライブラリのサムネイル ---- */
const thumbCache = new Map<string, string>();
function DrillThumb({ drill: s }: { drill: SavedDrill }) {
  const key = s.id + "_" + s.updatedAt;
  const [url, setUrl] = useState<string | null>(() => thumbCache.get(key) ?? null);
  useEffect(() => {
    if (thumbCache.has(key)) {
      setUrl(thumbCache.get(key)!);
      return;
    }
    try {
      const u = renderDrillThumbPng(s);
      thumbCache.set(key, u);
      setUrl(u);
    } catch {
      /* ignore */
    }
  }, [key, s]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" /> : <span className="dcph" />;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ---- 選択した動線の端点ハンドル ---- */
function LineHandle({ line, index }: { line: DrillLine; index: number }) {
  const drill = useDrill();
  const st = useRef({ active: false, began: false, rect: null as DOMRect | null });
  const p = line.path[index];
  if (!p) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    st.current.active = true;
    st.current.began = false;
    st.current.rect = drill.getPitchRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.active || !s.rect) return;
    if (!s.began) {
      drill.beginGesture();
      s.began = true;
    }
    drill.setLinePointLive(line.id, index, {
      x: clamp(((e.clientX - s.rect.left) / s.rect.width) * 100, 2, 98),
      y: clamp((1 - (e.clientY - s.rect.top) / s.rect.height) * 100, 2, 98),
    });
  };
  const onPointerUp = () => {
    st.current.active = false;
  };

  return (
    <div
      className="dxhandle"
      style={{ left: `${p.x}%`, top: `${100 - p.y}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

function Inner() {
  const board = useBoard();
  const team = useTeam();
  const drill = useDrill();
  const pc = usePc();
  const { doc, tool, selection, stampLock, scene } = drill;
  // 盤面に描くのは現在の場面（シーン）のitems/linesだけ。旧データはstep未定義＝場面0扱い
  const sceneItems = doc.items.filter((it) => (it.step ?? 0) === scene);
  const sceneLines = doc.lines.filter((l) => (l.step ?? 0) === scene);
  const sceneCount = drillSceneCount(doc);
  const draw = useRef({
    active: false,
    placing: false,
    pts: [] as Point[],
    rect: null as DOMRect | null,
    sx: 0,
    sy: 0,
    moved: false,
  });
  const [titleDraft, setTitleDraft] = useState("");
  const [memoDraft, setMemoDraft] = useState("");
  const [asTitle, setAsTitle] = useState("");
  const [drillTarget, setDrillTarget] = useState<SendTarget>({ mode: "team" });
  const [labelEdit, setLabelEdit] = useState<null | { id: string; value: string; isNew: boolean }>(
    null
  );

  const isLine = tool !== null && (LINE_TOOLS as string[]).includes(tool);
  const isItem = tool !== null && (ITEM_TOOLS as string[]).includes(tool);

  /* ---- 送信 ---- */
  const drillThreadKeys = targetThreadKeys(drillTarget);
  const sendDrill = () => {
    // groups-phase2 §5-4: グループ宛を選んだのに未選択のまま送信しようとしたらtoastで気づかせる
    if (drillTarget.mode === "group" && drillThreadKeys.length === 0) {
      board.toast("グループを選んでください");
      return;
    }
    if (drillThreadKeys.length === 0) return;
    const d: SavedDrill = {
      id: "drill_snap_" + Date.now().toString(36),
      title: (asTitle || doc.title).trim() || "練習メニュー",
      memo: doc.memo,
      pitchType: doc.pitchType,
      discSize: doc.discSize,
      items: doc.items.map((it) => ({ ...it })),
      lines: doc.lines.map((l) => ({ ...l, path: l.path.map((p) => ({ ...p })) })),
      sceneCount: doc.sceneCount,
      sceneIntents: doc.sceneIntents ? [...doc.sceneIntents] : undefined,
      updatedAt: Date.now(),
    };
    drillThreadKeys.forEach((to) =>
      board.sendMessage({
        to,
        from: "coach",
        fromName: "スタッフ",
        attachments: [{ kind: "drill", title: d.title, drill: d }],
      })
    );
    board.toast("送信しました");
    drill.openSheet(null);
  };

  /* ---- ラベル編集 ---- */
  const commitLabel = () => {
    if (!labelEdit) return;
    const v = labelEdit.value.trim();
    if (!v && labelEdit.isNew) {
      drill.removeItem(labelEdit.id);
    } else {
      drill.setItemLabel(labelEdit.id, v);
    }
    setLabelEdit(null);
  };

  /* ---- ピッチ上の座標変換 ---- */
  const toCoord = (clientX: number, clientY: number): Point => {
    const r = draw.current.rect!;
    return {
      x: clamp(((clientX - r.left) / r.width) * 100, 2, 98),
      y: clamp((1 - (clientY - r.top) / r.height) * 100, 2, 98),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (labelEdit) commitLabel();
    if (!isLine && !isItem) {
      // 選択モード：背景タップで選択解除（アイテム・動線側は stopPropagation 済み）
      drill.select(null);
      return;
    }
    draw.current.rect = drill.getPitchRect();
    if (!draw.current.rect) return;
    draw.current.active = true;
    draw.current.moved = false;
    draw.current.sx = e.clientX;
    draw.current.sy = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (isLine) {
      const c = toCoord(e.clientX, e.clientY);
      draw.current.pts = [c];
      drill.setTempLine([c]);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draw.current.active) return;
    if (Math.abs(e.clientX - draw.current.sx) > 4 || Math.abs(e.clientY - draw.current.sy) > 4)
      draw.current.moved = true;
    if (isLine) {
      const c = toCoord(e.clientX, e.clientY);
      const last = draw.current.pts[draw.current.pts.length - 1];
      if (Math.hypot(c.x - last.x, c.y - last.y) > 2) {
        draw.current.pts.push(c);
        drill.setTempLine(draw.current.pts.slice());
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draw.current.active) return;
    draw.current.active = false;
    if (isLine) {
      const pts = draw.current.pts;
      drill.setTempLine(null);
      if (pts.length >= 2) {
        const id = drill.addLine(tool as DrillLineKind, simplify(pts));
        if (!stampLock) drill.select({ type: "line", id });
      }
    } else if (isItem) {
      const c = toCoord(e.clientX, e.clientY);
      const kind = tool as DrillItemKind;
      const id = drill.addItem(kind, c.x, c.y);
      if (kind === "text") {
        drill.select({ type: "item", id });
        setLabelEdit({ id, value: "", isNew: true });
      } else if (!stampLock) {
        drill.select({ type: "item", id });
      }
    }
  };

  /* ---- キーボードショートカット ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) drill.redo();
        else drill.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        drill.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (drill.selection?.type === "item") drill.removeItem(drill.selection.id);
        else if (drill.selection?.type === "line") drill.removeLine(drill.selection.id);
      } else if (e.key === "Escape") {
        drill.setTool(null);
        drill.select(null);
        setLabelEdit(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drill]);

  // PC専用パネル(.dxside)が開いたら選択中ツールを解除する。
  // パレットが見えない状態でツールが選択されたままだとピッチへ誤って置いてしまうため
  useEffect(() => {
    if (pc && drill.sheet != null) drill.setTool(null);
  }, [pc, drill.sheet, drill.setTool]);

  /* ---- 選択中の対象とコンテキストバーの位置 ---- */
  const selItem =
    selection?.type === "item" ? doc.items.find((i) => i.id === selection.id) : undefined;
  const selLine =
    selection?.type === "line" ? doc.lines.find((l) => l.id === selection.id) : undefined;
  let ctxAnchor: { x: number; yTop: number } | null = null;
  if (selItem) ctxAnchor = { x: selItem.x, yTop: 100 - selItem.y };
  else if (selLine && selLine.path.length) {
    const mid = selLine.path[Math.floor(selLine.path.length / 2)];
    ctxAnchor = { x: mid.x, yTop: 100 - mid.y };
  }
  const ctxBelow = ctxAnchor ? ctxAnchor.yTop < 20 : false;
  const showCtx = ctxAnchor && !labelEdit && tool === null;

  /* ---- 保存状態 ---- */
  const stateLabel = drill.currentId === null ? "未保存" : drill.dirty ? "変更あり" : "保存済み ✓";
  const stateCls = drill.currentId === null ? "new" : drill.dirty ? "dirty" : "saved";

  const confirmClear = () => {
    if (doc.items.length === 0 && doc.lines.length === 0) return;
    if (window.confirm("配置と動線をすべて消去しますか？（「元に戻す」で復元できます）"))
      drill.clearAll();
  };

  // 確認つき読み込みはProvider側に集約（ライブラリシートの練習タブ経由でも同じ挙動になる）
  const loadWithConfirm = (id: string) => drill.loadDrillConfirmed(id);

  /* ---- 4面（ライブラリ／メモ／保存／送信）の中身。PCでは右カラムのパネル、
     モバイルでは従来のボトムシートへ、器だけを出し分けて同じJSXを流用する ---- */
  const libraryBody = (
    <>
      <h2>
        保存した練習メニュー <span>{drill.drills.length}件</span>
      </h2>
      <div className="controls">
        <button className="bigbtn" style={{ width: "100%", margin: 0 }} onClick={drill.newDrill}>
          ＋ 新規作成
        </button>
      </div>
      <div className="list">
        {drill.drills.length === 0 ? (
          <div className="empty-msg">
            <b>保存された練習メニューはありません</b>
            <br />
            練習メニューを作成して保存すると、ここに一覧できます
          </div>
        ) : (
          [...drill.drills]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((s) => (
              <div key={s.id} className={`drillcard${drill.currentId === s.id ? " cur" : ""}`}>
                <button className="dcimg" onClick={() => loadWithConfirm(s.id)}>
                  <DrillThumb drill={s} />
                </button>
                <div className="dcbody" onClick={() => loadWithConfirm(s.id)}>
                  <div className="playtitle">{s.title}</div>
                  <div className="playsub">
                    {PITCH_LABEL[s.pitchType]}
                    {drillSceneCount(s) > 1 ? ` ・ 場面${drillSceneCount(s)}` : ""} ・{" "}
                    {fmtDate(s.updatedAt)}
                  </div>
                  {s.memo ? <div className="dcmemo">{s.memo}</div> : null}
                </div>
                <button
                  className="dcdel"
                  title="削除"
                  onClick={() => {
                    if (window.confirm(`「${s.title}」を削除しますか？`)) drill.deleteDrill(s.id);
                  }}
                >
                  <IconTrash />
                </button>
              </div>
            ))
        )}
      </div>
    </>
  );

  const memoBody = (
    <>
      <h2>タイトル・メモ</h2>
      <div className="formfield">
        <label>タイトル</label>
        <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} autoFocus />
      </div>
      <div className="formfield">
        <label>メモ（ねらい・回数など）</label>
        {/* 寸法は .formfield textarea(基底CSS)が持つ。インラインで持つとPC密度調整が効かない */}
        <textarea value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} rows={5} />
      </div>
      <button
        className="bigbtn"
        onClick={() => {
          drill.setTitle(titleDraft.trim() || "練習メニュー");
          drill.setMemo(memoDraft);
          drill.openSheet(null);
        }}
      >
        保存
      </button>
    </>
  );

  const saveAsBody = (
    <>
      <h2>ライブラリに保存</h2>
      <div className="formfield">
        <label>タイトル</label>
        <input
          value={asTitle || doc.title}
          onChange={(e) => setAsTitle(e.target.value)}
          autoFocus
        />
      </div>
      <button className="bigbtn" onClick={() => drill.saveAsNew(asTitle || doc.title)}>
        保存する
      </button>
    </>
  );

  const sendBody = (
    <>
      <h2>選手アプリに送信</h2>
      <div className="formfield">
        <label>タイトル</label>
        <input value={asTitle || doc.title} onChange={(e) => setAsTitle(e.target.value)} />
      </div>
      <SendTargetField
        players={board.state.players}
        groups={team.groups}
        value={drillTarget}
        onChange={setDrillTarget}
        allowNone={false}
      />
      <button
        className="bigbtn"
        disabled={drillTarget.mode !== "group" && drillThreadKeys.length === 0}
        onClick={sendDrill}
      >
        送信する
      </button>
    </>
  );

  // PC(matchMedia 1024px)ではシート(.scrim/.sheet)を描画せず、右カラム(.dxside)を
  // ツールパレットからパネルへ差し替える。sheet状態自体はモバイルと共通(drill.sheet)のまま
  const dxPanelType: Exclude<DrillSheet, null> | null = pc ? drill.sheet : null;
  const dxPanelBody: Record<Exclude<DrillSheet, null>, React.ReactNode> = {
    library: libraryBody,
    memo: memoBody,
    saveAs: saveAsBody,
    send: sendBody,
  };

  return (
    <div className="app drillapp dx">
      {pc ? (
        <header>
          {/* 戻り先: PCは常にホーム(不変) */}
          <div className="fpback" onClick={() => board.setScreen("home")}>
            ‹ ホーム
          </div>
          <button
            className="drilltitle"
            onClick={() => {
              setTitleDraft(doc.title);
              setMemoDraft(doc.memo);
              drill.openSheet("memo");
            }}
            title="タイトル・メモを編集"
          >
            <span className="dtname">
              {doc.title}
              <span className="dtedit">
                <IconEdit />
              </span>
            </span>
            <span className={`dtstate ${stateCls}`}>{stateLabel}</span>
          </button>
          <div className="hbtn">
            <button className="hact" title="保存した練習メニュー" onClick={() => drill.openSheet("library")}>
              <IconFolder />
              <span>ライブラリ</span>
            </button>
            <button className="hact" title="画像で保存" onClick={drill.exportPng}>
              <IconDownload />
              <span>画像</span>
            </button>
            <button className="hact" title="ライブラリに保存" onClick={drill.saveDrill}>
              <IconSave />
              <span>保存</span>
            </button>
            <button
              className="hact primary"
              title="選手アプリに送信"
              onClick={() => {
                setAsTitle(doc.title);
                drill.openSheet("send");
              }}
            >
              <IconSend />
              <span>送信</span>
            </button>
          </div>
        </header>
      ) : (
        // mobile-redesign Phase D-1(C1-critical): §1-6「アイコンボタン最大3つ」に収める。
        // 保存・送信(主CTA)は単独ボタンのまま残し、編集/ライブラリ/画像は
        // 「…」オーバーフロー(MobileHeaderMore)へ移す(機能は維持)
        <MobileHeader
          title="練習メニュー"
          subtitle={`${doc.title} ・ ${stateLabel}`}
          onBack={() => board.setScreen(board.navFrom === "home" ? "home" : "coaching")}
          actions={
            <>
              <MobileHeaderMore
                items={[
                  {
                    label: "タイトル・メモを編集",
                    icon: <IconEdit />,
                    onClick: () => {
                      setTitleDraft(doc.title);
                      setMemoDraft(doc.memo);
                      drill.openSheet("memo");
                    },
                  },
                  { label: "保存した練習メニュー", icon: <IconFolder />, onClick: () => drill.openSheet("library") },
                  { label: "画像で保存", icon: <IconDownload />, onClick: drill.exportPng },
                ]}
              />
              <MobileHeaderAction label="ライブラリに保存" onClick={drill.saveDrill}>
                <IconSave />
              </MobileHeaderAction>
              <MobileHeaderAction
                label="選手アプリに送信"
                primary
                onClick={() => {
                  setAsTitle(doc.title);
                  drill.openSheet("send");
                }}
              >
                <IconSend />
              </MobileHeaderAction>
            </>
          }
        />
      )}

      <div className="dxbody">
        <div className="dxstage">
          {/* 場面（シーン）チップ列。1つ目の練習でも「＋ 場面」を見つけられるよう場面が1つでも表示する */}
          <div className="dxsteps">
            {Array.from({ length: sceneCount }).map((_, i) => (
              <div
                key={i}
                className={`dxstep${scene === i ? " on" : ""}`}
                onClick={() => drill.setScene(i)}
              >
                <span>場面{i + 1}</span>
                {sceneCount > 1 && (
                  <button
                    type="button"
                    className="dxstepx"
                    title="この場面を削除"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          `場面${i + 1}を削除しますか？この場面の配置と意図も消えます。`
                        )
                      )
                        drill.removeScene(i);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="dxstepadd"
              title="新しい場面を追加（現在の配置を複製して次の動きを描く）"
              disabled={sceneCount >= 6}
              onClick={drill.addScene}
            >
              ＋ 場面
            </button>
          </div>

          <div className="dxpitchwrap">
            <div className={`pitchbox pb-${doc.pitchType}`}>
              <div
                className={`pitch ${doc.pitchType} disc-${(doc.discSize ?? "L").toLowerCase()}${
                  tool ? " arming" : ""
                }`}
                ref={drill.pitchRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{ touchAction: "none" }}
              >
                <Markings type={doc.pitchType} />
                <DrillLines />
                {sceneItems.map((it) => (
                  <DrillItemView key={it.id} item={it} />
                ))}
                {sceneItems.length === 0 && sceneLines.length === 0 && !tool && (
                  <div className="hint">
                    パレットからアイテムや動線を選んで
                    <br />
                    ピッチに配置しましょう
                  </div>
                )}
              </div>

              {/* 選択した動線の端点ハンドル */}
              {selLine && tool === null && (
                <>
                  <LineHandle line={selLine} index={0} />
                  <LineHandle line={selLine} index={selLine.path.length - 1} />
                </>
              )}

              {/* 選択対象のコンテキストツールバー */}
              {showCtx && ctxAnchor && (
                <div
                  className={`dxctx${ctxBelow ? " below" : ""}`}
                  style={{ left: `${ctxAnchor.x}%`, top: `${ctxAnchor.yTop}%` }}
                >
                  {selItem && (
                    <>
                      <button
                        title="複製"
                        onClick={() => drill.duplicateItem(selItem.id)}
                      >
                        <IconCopy />
                      </button>
                      {selItem.kind === "goal" && (
                        <button title="90°回転" onClick={() => drill.rotateItem(selItem.id)}>
                          <IconRotate />
                        </button>
                      )}
                      {(selItem.kind === "player" ||
                        selItem.kind === "oppo" ||
                        selItem.kind === "text") && (
                        <button
                          title={selItem.kind === "text" ? "テキストを編集" : "番号・ラベルを編集"}
                          onClick={() =>
                            setLabelEdit({
                              id: selItem.id,
                              value: selItem.label ?? "",
                              isNew: false,
                            })
                          }
                        >
                          <span className="tx">あ</span>
                        </button>
                      )}
                      <button
                        className="danger"
                        title="削除"
                        onClick={() => drill.removeItem(selItem.id)}
                      >
                        <IconTrash />
                      </button>
                    </>
                  )}
                  {selLine && (
                    <button
                      className="danger"
                      title="動線を削除"
                      onClick={() => drill.removeLine(selLine.id)}
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              )}

              {/* ラベル・テキスト編集 */}
              {labelEdit && selItem && (
                <div
                  className="dxlabeledit"
                  style={{ left: `${selItem.x}%`, top: `${100 - selItem.y}%` }}
                >
                  <input
                    autoFocus
                    value={labelEdit.value}
                    placeholder={selItem.kind === "text" ? "テキストを入力" : "番号・ラベル"}
                    onChange={(e) => setLabelEdit({ ...labelEdit, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) commitLabel();
                      if (e.key === "Escape") {
                        if (labelEdit.isNew) drill.removeItem(labelEdit.id);
                        setLabelEdit(null);
                      }
                    }}
                    onBlur={commitLabel}
                  />
                </div>
              )}

            </div>

            {/* 元に戻す / やり直す。.dxpitchwrap(place-items:center)基準の絶対配置にすることで
                ピッチ左"外"の余白に浮く=ピッチ内左下の配置物をボタンが塞がない。
                pitchbox内に置くと必ずピッチ上に乗り、意図欄の追加でdxstage基準も使えない */}
            <div className="dxundo">
              <button disabled={!drill.canUndo} onClick={drill.undo} title="元に戻す（Ctrl+Z）">
                <IconUndo />
              </button>
              <button disabled={!drill.canRedo} onClick={drill.redo} title="やり直す（Ctrl+Shift+Z）">
                <IconRedo />
              </button>
            </div>
          </div>

          {/* この場面の意図テキスト */}
          <div className="dxintent">
            <label htmlFor="dxintent-ta">この場面の意図</label>
            <textarea
              id="dxintent-ta"
              rows={2}
              placeholder="この場面でしてほしい動き・ねらい（例: 2人目が受けたら3人目が裏へ走る）"
              value={doc.sceneIntents?.[scene] ?? ""}
              onChange={(e) => drill.setSceneIntent(scene, e.target.value)}
            />
          </div>
        </div>

        <aside className="dxside">
          {dxPanelType ? (
            // PC(1024px以上)：drill.sheetが開いている間はツールパレットの代わりに
            // 「パネル」（ヘッダ＝タイトル＋‹ツールへ戻る＋各シートの中身）を表示する。
            // 中身(libraryBody等)はモバイルのボトムシートと共通のJSXをそのまま流用
            <div className="dxpanel">
              <div className="dxpanelhead">
                <button
                  type="button"
                  className="dxpanelback"
                  onClick={() => drill.openSheet(null)}
                >
                  ‹ ツールへ戻る
                </button>
                <div className="dxpaneltitle">{DRILL_PANEL_TITLE[dxPanelType]}</div>
              </div>
              <div className="dxpanelbody">{dxPanelBody[dxPanelType]}</div>
            </div>
          ) : (
            <>
              <section className="dxsec">
                <h3>ピッチ</h3>
                <div className="dxseg">
                  {(["half", "full", "fullh", "blank"] as PitchType[]).map((p) => (
                    <button
                      key={p}
                      className={doc.pitchType === p ? "on" : ""}
                      onClick={() => drill.setPitchType(p)}
                    >
                      {PITCH_LABEL[p]}
                    </button>
                  ))}
                </div>
                <div className="dxrow">
                  <span className="dxlbl">丸の大きさ</span>
                  <div className="dxseg sm">
                    {(["L", "M", "S"] as DiscSize[]).map((s) => (
                      <button
                        key={s}
                        className={(doc.discSize ?? "L") === s ? "on" : ""}
                        onClick={() => drill.setDiscSize(s)}
                      >
                        {DISC_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="dxsec">
                <h3>
                  アイテム<span className="dxhint">選んでピッチをタップ</span>
                </h3>
                <div className="dxpal">
                  {ITEM_TOOLS.map((k) => (
                    <button
                      key={k}
                      className={tool === k ? "on" : ""}
                      onClick={() => drill.setTool(tool === k ? null : k)}
                    >
                      <ItemPreview kind={k} />
                      {ITEM_LABEL[k]}
                    </button>
                  ))}
                </div>
              </section>

              <section className="dxsec">
                <h3>
                  動線<span className="dxhint">選んでピッチをなぞる</span>
                </h3>
                <div className="dxpal lines">
                  {LINE_TOOLS.map((k) => (
                    <button
                      key={k}
                      className={tool === k ? "on" : ""}
                      onClick={() => drill.setTool(tool === k ? null : k)}
                    >
                      <LinePreview kind={k} />
                      {LINE_LABEL[k].replace(/（.+）/, "")}
                    </button>
                  ))}
                </div>
              </section>

              <label className="dxlock">
                <input
                  type="checkbox"
                  checked={stampLock}
                  onChange={(e) => drill.setStampLock(e.target.checked)}
                />
                連続して配置する
              </label>

              <button className="dxclear" onClick={confirmClear}>
                <IconTrash /> 全消去
              </button>
            </>
          )}
        </aside>
      </div>

      {/* sheets（モバイルのみ。PCは.dxsideのパネルに出すためシート自体(.scrim/.sheet)を描画しない） */}
      {!pc && (
        <>
          <Sheet open={drill.sheet === "library"} onClose={() => drill.openSheet(null)}>
            {libraryBody}
          </Sheet>

          <Sheet open={drill.sheet === "memo"} onClose={() => drill.openSheet(null)}>
            {memoBody}
          </Sheet>

          <Sheet open={drill.sheet === "saveAs"} onClose={() => drill.openSheet(null)}>
            {saveAsBody}
          </Sheet>

          <Sheet open={drill.sheet === "send"} onClose={() => drill.openSheet(null)}>
            {sendBody}
          </Sheet>
        </>
      )}
    </div>
  );
}

export default function DrillEditor() {
  return (
    <DrillProvider>
      <Inner />
    </DrillProvider>
  );
}
