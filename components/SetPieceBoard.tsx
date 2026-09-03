"use client";

import { useEffect, useState } from "react";
import type React from "react";
import dynamic from "next/dynamic";
import { useBoard } from "./BoardProvider";
import type { SheetType } from "./BoardProvider";
import Header from "./Header";
import SetPieceBar from "./SetPieceBar";
import Pitch from "./Pitch";
import AnimationStudio from "./AnimationStudio";
import FullPlayOverlay from "./FullPlayOverlay";
import { SaveBody, ShareBody } from "./SheetManager";
import { CAMERA_PRESET_LABEL, CAMERA_PRESET_ORDER, type CameraPresetId } from "@/lib/setPiece3d";

/**
 * セットプレー3Dビューア本体。three.js/@react-three一式を直接importする重いコンポーネントのため
 * next/dynamic({ssr:false})で遅延ロードする＝import()はユーザーが実際に3D表示を選んで
 * このコンポーネントが初めてレンダーされる瞬間まで発火しない（他画面のバンドルにも混ざらない）。
 * output:"export"（next.config.mjs）の静的書き出しとも、クライアント専用コンポーネントとして
 * 素直に両立する（ssr:false はビルド時にこのチャンクのSSR/プリレンダーを行わないだけで、
 * 静的HTML出力自体は妨げない）。
 */
const SetPiece3D = dynamic(() => import("./SetPiece3D"), {
  ssr: false,
  loading: () => (
    <div className="pitchwrap sp3dwrap">
      <div className="pitch sp3dpitch sp3dloading">3Dビューを読み込み中…</div>
    </div>
  ),
});

/** 操作方法ヘルプパネルの開閉状態を記憶するsessionStorageキー（10項）。タブを閉じるまでの
 * 間だけ記憶する簡易な永続化で、複雑な仕組みは持たない（仕様どおり）。 */
const SP3D_HELP_KEY = "alfa_sp3d_help_open";

/** sessionStorageからヘルプパネルの開閉状態を読む。プライベートブラウズ等でstorageが
 * 使えない環境でも表示切替自体は機能するよう、読み書き失敗は無視する（既定は閉）。 */
function readStoredHelpOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SP3D_HELP_KEY) === "1";
  } catch {
    return false;
  }
}
function writeStoredHelpOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SP3D_HELP_KEY, open ? "1" : "0");
  } catch {
    /* 無視（保存できなくても表示切替自体は機能する） */
  }
}

/** PC(min-width:1024px)判定のブレークポイント。TacticsBoard.tsx usePc() と同じ値・同じ手法 */
const PC_MQ = "(min-width: 1024px)";

/** PC幅かどうかを追跡するフック（TacticsBoard.tsx usePc() と同じ手法） */
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

/**
 * PCのセットプレー画面で中央ダイアログの代わりに右カラム(.boardside)のパネルに出す種別。
 * TacticsBoard.tsx の BoardPanelType と同形だが、セットプレーでは選手配置・枠メニュー・
 * フォーメーション変更は不要なため save/share のみに絞る
 * （SheetManager.tsx の SETPIECE_PANEL_TYPES と対応させること）。
 */
type SpPanelType = "save" | "share";

function isSpPanelType(t: SheetType): t is SpPanelType {
  return t === "save" || t === "share";
}

const SP_PANEL_TITLE: Record<SpPanelType, string> = {
  save: "セットプレーを保存・送信",
  share: "共有・出力",
};

/** .boardside の通常内容(アニメStudio)の代わりに出すパネル。中身はモバイルのシートと共通の
 * SheetManager.tsx の *Body をそのまま使う（TacticsBoard.tsx の BoardPanelHost と同じ考え方） */
function SpPanelHost({ type }: { type: SpPanelType }) {
  const board = useBoard();
  const body: React.ReactNode = type === "save" ? <SaveBody /> : <ShareBody />;
  return (
    <div className="bpanel">
      <div className="bpanelhead">
        <button type="button" className="bpanelback" onClick={board.closeSheet}>
          ‹ 戻る
        </button>
        <div className="bpaneltitle">{SP_PANEL_TITLE[type]}</div>
      </div>
      <div className="bpanelbody">{body}</div>
    </div>
  );
}

/** 共有リンクで届いたセットプレーの読み込み確認。TacticsBoard.tsx の ImportBanner と同じ
 * .bimport 文法（画面上部の1行バナー）をそのまま踏襲する。setPiece メタが無いスナップショット
 * （＝通常の戦術の共有）はここでは扱わない（TacticsBoard側のバナーが対象）*/
function ImportBanner() {
  const board = useBoard();
  const snap = board.pendingImport;
  if (!snap || !snap.setPiece) return null;
  return (
    <div className="bimport">
      <span className="bimporttext">
        共有されたセットプレーが届いています
        {snap.title ? `「${snap.title}」` : ""}
      </span>
      <div className="bimportbtns">
        <button type="button" className="bimportbtn primary" onClick={board.applyImport}>
          読み込む
        </button>
        <button type="button" className="bimportbtn ghost" onClick={board.discardImport}>
          破棄
        </button>
      </div>
    </div>
  );
}

/**
 * 3D表示中に SetPieceBar の代わりに出すカメラプリセットバー（Canvas外のReact UI）。
 * 見た目は SetPieceBar 下段(.spbar-presets)と同じ .fbar/.chip/.fmini 語彙をそのまま使う。
 * 「リセット」は俯瞰45°プリセットへ再適用する（presetが既に"overhead"のときはReact state側の
 * onPreset呼び出しだけでは同値バイルアウトして何も起きないため、onResetはpreset状態を
 * "overhead"へ寄せるのと同時にSetPiece3D側のresetNonceを進め、同値でも遷移を強制する）。
 */
function CameraBar({
  preset,
  onPreset,
  onExit3D,
  onReset,
  helpOpen,
  onToggleHelp,
}: {
  preset: CameraPresetId;
  onPreset: (id: CameraPresetId) => void;
  onExit3D: () => void;
  onReset: () => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
}) {
  return (
    <div className="fbar spbar-presets sp3dbar">
      {CAMERA_PRESET_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          className={`chip${preset === id ? " on" : ""}`}
          onClick={() => onPreset(id)}
        >
          {CAMERA_PRESET_LABEL[id]}
        </button>
      ))}
      <button
        type="button"
        className="fmini"
        title="視点をリセット（操作: ドラッグ=回転 / 右ドラッグ・2本指=移動 / ピンチ・ホイール=ズーム）"
        onClick={onReset}
      >
        <span>リセット</span>
      </button>
      <button type="button" className="fmini" onClick={onExit3D}>
        <span>2Dに戻る</span>
      </button>
      <button
        type="button"
        className={`fmini${helpOpen ? " on" : ""}`}
        title="操作方法（マウス/トラックパッド/キーボード）"
        onClick={onToggleHelp}
      >
        <span>操作方法 ?</span>
      </button>
    </div>
  );
}

export default function SetPieceBoard() {
  const board = useBoard();
  const pc = usePc();
  const sheetType = board.sheet.type;
  const spPanelType = pc && isSpPanelType(sheetType) ? sheetType : null;
  const showImportBanner = pc && board.pendingImport?.setPiece != null;
  // 2D/3D表示切替。コンポーネントローカルstate（既定=2D）。同じ文書(BoardState)の
  // 切替ビューにすぎず、盤面データ(playState/spState)そのものは変えない
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [preset, setPreset] = useState<CameraPresetId>("overhead");
  // 「リセット」クリックのたびに増える値。presetが既に"overhead"でもSetPiece3D側の
  // プリセット遷移を強制的に再適用させるためのトリガー（CameraBar/CameraController参照）。
  const [resetNonce, setResetNonce] = useState(0);
  const handleResetCamera = () => {
    setPreset("overhead");
    setResetNonce((n) => n + 1);
  };
  // 操作方法ヘルプパネルの開閉。sessionStorageへ記憶する（タブを閉じるまでの簡易な永続化）。
  const [helpOpen, setHelpOpenState] = useState<boolean>(() => readStoredHelpOpen());
  const setHelpOpen = (open: boolean) => {
    setHelpOpenState(open);
    writeStoredHelpOpen(open);
  };
  // 味方/相手のドラッグ固定（密集での誤操作防止）。CSSクラス経由でpointer-eventsを遮断する
  const [lockOwn, setLockOwn] = useState(false);
  const [lockOpp, setLockOpp] = useState(false);
  const cls = [
    "app",
    "spapp",
    board.mode === "anim" ? "anim" : "",
    board.fullplay ? "fullplay" : "",
    board.mode === "anim" && !board.showPaths ? "nopaths" : "",
    lockOwn ? "sp-lock-own" : "",
    lockOpp ? "sp-lock-opp" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {showImportBanner && <ImportBanner />}
      <Header />
      {view === "2d" ? (
        <SetPieceBar
          onEnter3D={() => setView("3d")}
          lockOwn={lockOwn}
          lockOpp={lockOpp}
          onToggleLockOwn={() => setLockOwn((v) => !v)}
          onToggleLockOpp={() => setLockOpp((v) => !v)}
        />
      ) : (
        <CameraBar
          preset={preset}
          onPreset={setPreset}
          onExit3D={() => setView("2d")}
          onReset={handleResetCamera}
          helpOpen={helpOpen}
          onToggleHelp={() => setHelpOpen(!helpOpen)}
        />
      )}
      <div className="scroll">
        {view === "2d" ? (
          <Pitch />
        ) : (
          <SetPiece3D
            preset={preset}
            onPreset={setPreset}
            resetNonce={resetNonce}
            onReset={handleResetCamera}
            helpOpen={helpOpen}
            onCloseHelp={() => setHelpOpen(false)}
          />
        )}
        <div className="boardside">
          {spPanelType ? <SpPanelHost type={spPanelType} /> : <AnimationStudio />}
        </div>
      </div>
      <FullPlayOverlay />
    </div>
  );
}
