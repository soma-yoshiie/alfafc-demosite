"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import { E } from "./Emoji";
import { SettingsBody } from "./SheetManager";
import type {
  BoardState,
  PitchType,
  SavedDrill,
  SavedPlay,
  SavedSetPiece,
  SetPieceKind,
} from "@/lib/types";
import { renderTacticPng } from "@/lib/exportImage";
import { renderDrillPng } from "@/lib/exportDrill";
import { loadDrills } from "@/lib/storage";

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

/**
 * PCレール直結の3画面（ライブラリ／コーチラボ／設定）。
 * 従来はモーダル(シート)で開いていたが、レールの他項目と同様に
 * 画面切り替えで表示する。コーチラボ／設定は SheetManager 側の *Body を
 * そのまま再利用し、モバイルのシート表示（DOM・見た目）は一切変えない。
 * ライブラリのみPC専用のマスター・ディテール（左:一覧／右:プレビュー）を持つため
 * シート版(LibraryBody/SheetManager)とは別に画面専用実装を持つ。
 */

const PITCH_LABEL: Record<PitchType, string> = {
  half: "ハーフ",
  full: "フル縦",
  fullh: "フル横",
  blank: "ブランク",
};

/** セットプレーの種別/攻守バッジ表示用ラベル（SetPieceBar.tsx の KIND_LABEL と同じ内容） */
const SP_KIND_LABEL: Record<SetPieceKind, string> = {
  ck: "CK",
  fk: "FK",
  gk: "ゴールキック",
  throwin: "スローイン",
  pk: "PK",
};
const SP_SIDE_LABEL: Record<"attack" | "defense", string> = {
  attack: "攻撃",
  defense: "守備",
};

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LibraryScreen() {
  const board = useBoard();
  // 戻りラベル: 押下先は常にホームのため、PCでは「‹ ホーム」に(モバイルは「‹ メニュー」のまま)
  const pc = usePc();
  const [tab, setTabState] = useState<"plays" | "drills" | "setpieces">("plays");
  // 初期選択（マウント時のみ）: 戦術タブの先頭項目
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const list = [...board.library.plays].sort((a, b) => b.updatedAt - a.updatedAt);
    return list[0]?.id ?? null;
  });

  const plays = useMemo(
    () => [...board.library.plays].sort((a, b) => b.updatedAt - a.updatedAt),
    [board.library.plays]
  );
  const setPieces = useMemo(
    () => [...(board.library.setPieces ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
    [board.library.setPieces]
  );
  // DrillProvider はここでは使えないため localStorage から直接読む（LibraryBody と同じ方式）。
  // 練習タブを開いたときだけ読む
  const drills = useMemo(
    () => (tab === "drills" ? [...loadDrills()].sort((a, b) => b.updatedAt - a.updatedAt) : []),
    [tab]
  );
  // レールのサブナビが登録するonSelectは、ConsoleShell側の同値比較で更新が
  // スキップされることがあり古い plays/setPieces を閉じ込めるおそれがあるため、
  // 常に最新値を参照できる ref 経由で読む（ChatScreen の教訓に倣う）
  const playsRef = useRef(plays);
  playsRef.current = plays;
  const setPiecesRef = useRef(setPieces);
  setPiecesRef.current = setPieces;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // タブ切替（レールサブナビとペイン内タブの両方から呼ばれる）。
  // 同じタブの再クリックで選択が先頭に巻き戻らないようガードする
  const switchTab = (next: "plays" | "drills" | "setpieces") => {
    if (tabRef.current === next) return;
    if (next === "plays") {
      setSelectedId(playsRef.current[0]?.id ?? null);
    } else if (next === "setpieces") {
      setSelectedId(setPiecesRef.current[0]?.id ?? null);
    } else {
      const list = [...loadDrills()].sort((a, b) => b.updatedAt - a.updatedAt);
      setSelectedId(list[0]?.id ?? null);
    }
    setTabState(next);
  };

  const selectedPlay = tab === "plays" ? plays.find((p) => p.id === selectedId) ?? null : null;
  const selectedDrill = tab === "drills" ? drills.find((d) => d.id === selectedId) ?? null : null;
  const selectedSetPiece =
    tab === "setpieces" ? setPieces.find((p) => p.id === selectedId) ?? null : null;

  const handleDeletePlay = (id: string) => {
    board.deletePlay(id);
    setSelectedId((cur) => {
      if (cur !== id) return cur;
      const remaining = plays.filter((p) => p.id !== id);
      return remaining[0]?.id ?? null;
    });
  };

  const handleDeleteSetPiece = (id: string) => {
    board.deleteSetPiece(id);
    setSelectedId((cur) => {
      if (cur !== id) return cur;
      const remaining = setPieces.filter((p) => p.id !== id);
      return remaining[0]?.id ?? null;
    });
  };

  const consoleSubnav = useMemo(
    () => ({
      anchor: "library" as const,
      items: [
        {
          key: "plays",
          label: "戦術",
          icon: <E n="clipboard" />,
          on: tab === "plays",
          onSelect: () => switchTab("plays"),
        },
        {
          key: "drills",
          label: "練習",
          icon: <E n="run" />,
          on: tab === "drills",
          onSelect: () => switchTab("drills"),
        },
        {
          key: "setpieces",
          label: "セットプレー",
          icon: <E n="target" />,
          on: tab === "setpieces",
          onSelect: () => switchTab("setpieces"),
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab]
  );
  useConsoleSubnav(consoleSubnav);

  const unfiled = plays.filter((p) => !p.folderId);

  const PlayRowBtn = ({ p }: { p: SavedPlay }) => (
    <button
      type="button"
      className={`librow${selectedId === p.id ? " sel" : ""}`}
      aria-current={selectedId === p.id ? "true" : undefined}
      onClick={() => setSelectedId(p.id)}
    >
      <div className="librowtitle">{p.title}</div>
      <div className="librowsub">
        {p.formation} ・ {p.moves.length}本のルート ・ {fmtDateTime(p.updatedAt)}
      </div>
    </button>
  );

  const SetPieceRowBtn = ({ p }: { p: SavedSetPiece }) => (
    <button
      type="button"
      className={`librow${selectedId === p.id ? " sel" : ""}`}
      aria-current={selectedId === p.id ? "true" : undefined}
      onClick={() => setSelectedId(p.id)}
    >
      <div className="librowtitle">
        <span className="spkindbadge">
          {SP_KIND_LABEL[p.setPiece.kind]}・{SP_SIDE_LABEL[p.setPiece.side]}
        </span>
        {p.title}
      </div>
      <div className="librowsub">{fmtDateTime(p.updatedAt)}</div>
    </button>
  );

  return (
    <div className="app libapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ {pc ? "ホーム" : "メニュー"}
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">ライブラリ</div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {board.state.teamName ?? "マイチーム"}
          </div>
        </div>
      </header>

      <div className="libpane">
        {/* レールが無い幅(<1024px)向けのタブ。PCではレールのサブナビが担うため隠す */}
        <div className="libtabs">
          <button
            className={`libtab${tab === "plays" ? " on" : ""}`}
            onClick={() => switchTab("plays")}
          >
            戦術
          </button>
          <button
            className={`libtab${tab === "drills" ? " on" : ""}`}
            onClick={() => switchTab("drills")}
          >
            練習
          </button>
          <button
            className={`libtab${tab === "setpieces" ? " on" : ""}`}
            onClick={() => switchTab("setpieces")}
          >
            セットプレー
          </button>
        </div>
        {tab === "plays" ? (
          <>
            <div className="libctrls">
              <button type="button" className="formbtn" onClick={board.newPlay}>
                <span className="fb-label">＋ 新規作成</span>
              </button>
              <button
                type="button"
                className="formbtn"
                onClick={() => {
                  const n = window.prompt("フォルダ名");
                  if (n) board.createFolder(n);
                }}
              >
                <span className="fb-label">＋ フォルダ</span>
              </button>
            </div>
            {plays.length === 0 ? (
              <div className="empty-msg">
                <b>保存された戦術はありません</b>
                <br />
                盤面を作って共有・出力→ライブラリに保存から追加できます
              </div>
            ) : (
              <div className="liblist">
                {board.library.folders.map((f) => {
                  const fp = plays.filter((p) => p.folderId === f.id);
                  return (
                    <div key={f.id} className="libfolder">
                      <div className="folderhdr">
                        <E n="folder" /> {f.name}
                        <button onClick={() => board.deleteFolder(f.id)}>削除</button>
                      </div>
                      {fp.length === 0 ? (
                        <div className="folderempty">（空）</div>
                      ) : (
                        fp.map((p) => <PlayRowBtn key={p.id} p={p} />)
                      )}
                    </div>
                  );
                })}
                {board.library.folders.length > 0 && (
                  <div className="folderhdr">
                    <E n="folderopen" /> 未分類
                  </div>
                )}
                {unfiled.map((p) => (
                  <PlayRowBtn key={p.id} p={p} />
                ))}
              </div>
            )}
          </>
        ) : tab === "drills" ? (
          drills.length === 0 ? (
            !pc && (
              <div className="empty-msg">
                <b>保存された練習メニューはありません</b>
                <br />
                練習メニューを作成して保存すると、ここに一覧できます
              </div>
            )
          ) : (
            <div className="liblist">
              {drills.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`librow${selectedId === d.id ? " sel" : ""}`}
                  aria-current={selectedId === d.id ? "true" : undefined}
                  onClick={() => setSelectedId(d.id)}
                >
                  <div className="librowtitle">{d.title || "無題の練習"}</div>
                  <div className="librowsub">
                    {PITCH_LABEL[d.pitchType] ?? "ピッチ"} ・ 配置{d.items?.length ?? 0}個 ・ 動線
                    {d.lines?.length ?? 0}本 ・ {fmtDateTime(d.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : setPieces.length === 0 ? (
          <div className="empty-msg">
            <b>保存されたセットプレーはありません</b>
            <br />
            セットプレーデザイン画面で作って保存・送信から追加できます
          </div>
        ) : (
          <div className="liblist">
            {setPieces.map((p) => (
              <SetPieceRowBtn key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      <div className="libmain">
        {tab === "plays" ? (
          selectedPlay ? (
            <PlayPreview play={selectedPlay} onDelete={handleDeletePlay} />
          ) : (
            <div className="libempty">
              {plays.length === 0 ? (
                <>
                  <b>保存された戦術はありません</b>
                  <br />
                  盤面を作って共有・出力→ライブラリに保存から追加できます
                </>
              ) : (
                <>
                  <b>項目が選択されていません</b>
                  <br />
                  左の一覧から選ぶとプレビューが表示されます
                </>
              )}
            </div>
          )
        ) : tab === "drills" ? (
          selectedDrill ? (
            <DrillPreview drill={selectedDrill} />
          ) : (
            <div className="libempty">
              {drills.length === 0 ? (
                <>
                  <b>保存された練習メニューはありません</b>
                  <br />
                  練習メニューを作成して保存すると、ここに一覧できます
                </>
              ) : (
                <>
                  <b>項目が選択されていません</b>
                  <br />
                  左の一覧から選ぶとプレビューが表示されます
                </>
              )}
            </div>
          )
        ) : selectedSetPiece ? (
          <SetPiecePreview setPiece={selectedSetPiece} onDelete={handleDeleteSetPiece} />
        ) : (
          <div className="libempty">
            {setPieces.length === 0 ? (
              <>
                <b>保存されたセットプレーはありません</b>
                <br />
                セットプレーデザイン画面で作って保存・送信から追加できます
              </>
            ) : (
              <>
                <b>項目が選択されていません</b>
                <br />
                左の一覧から選ぶとプレビューが表示されます
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayPreview({
  play,
  onDelete,
}: {
  play: SavedPlay;
  onDelete: (id: string) => void;
}) {
  const board = useBoard();
  // プレビュー用の BoardState を組み立てる。名簿(players)・チーム名・キャプテンは
  // SavedPlay に含まれずチーム側で共有されるため、現在のチーム状態から補う
  // （board.loadPlay の LOAD_TACTIC が ...state で継承するのと同じ考え方）
  const pngUrl = useMemo(() => {
    try {
      const state: BoardState = {
        ...board.state,
        formation: play.formation,
        slots: play.slots,
        ball: play.ball,
        moves: play.moves,
        holder: play.holder ?? null,
        opponents: play.opponents ?? [],
        drawings: play.drawings ?? [],
        shapes: play.shapes ?? [],
        stepCount: play.stepCount ?? 1,
        guides: play.guides ?? {},
        pitchView: play.pitchView ?? "full",
      };
      return renderTacticPng(state);
    } catch {
      return null;
    }
    // 名簿・チーム名・キャプテンは board.state 由来のため依存に含める
  }, [play, board.state]);

  return (
    <div className="libdetail">
      <div className="libpanehead">
        <span className="libpanename">{play.title}</span>
        <span className="libpanetype">戦術</span>
      </div>
      <div className="libprev">
        {pngUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pngUrl} alt={play.title} />
        ) : (
          <div className="libprevph">プレビューを表示できません</div>
        )}
      </div>
      <dl className="libmeta">
        <div>
          <dt>フォーメーション</dt>
          <dd>{play.formation}</dd>
        </div>
        <div>
          <dt>ルート</dt>
          <dd>
            {play.moves.length}本{play.moves.length > 0 && <span className="libnote">（図は開始配置）</span>}
          </dd>
        </div>
        <div>
          <dt>更新日時</dt>
          <dd>{fmtDateTime(play.updatedAt)}</dd>
        </div>
      </dl>
      <div className="libacts">
        <button className="bigbtn" onClick={() => board.loadPlay(play.id)}>
          ボードで開く
        </button>
        <button className="bigbtn ghost" onClick={() => board.duplicatePlay(play.id)}>
          複製
        </button>
        <button
          className="bigbtn ghost"
          onClick={() => {
            const t = window.prompt("新しいタイトル", play.title);
            if (t != null) board.renamePlay(play.id, t);
          }}
        >
          名前を変更
        </button>
        <button
          className="bigbtn ghost"
          onClick={() => {
            if (window.confirm(`「${play.title}」を削除しますか？`)) onDelete(play.id);
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

/** SetPieceMeta.kind/side のバッジ表示ラベル（本ファイル冒頭の SP_KIND_LABEL/SP_SIDE_LABEL を参照） */
function SetPiecePreview({
  setPiece,
  onDelete,
}: {
  setPiece: SavedSetPiece;
  onDelete: (id: string) => void;
}) {
  const board = useBoard();
  // PlayPreview と同じ「SavedPlay(構造的に共通)+board.stateからBoardState再構成」レシピ。
  // setPiece メタも埋め込みのものをそのまま渡す
  const pngUrl = useMemo(() => {
    try {
      const state: BoardState = {
        ...board.state,
        formation: setPiece.formation,
        slots: setPiece.slots,
        ball: setPiece.ball,
        moves: setPiece.moves,
        holder: setPiece.holder ?? null,
        opponents: setPiece.opponents ?? [],
        drawings: setPiece.drawings ?? [],
        shapes: setPiece.shapes ?? [],
        stepCount: setPiece.stepCount ?? 1,
        guides: setPiece.guides ?? {},
        pitchView: setPiece.pitchView ?? "full",
        setPiece: setPiece.setPiece,
      };
      return renderTacticPng(state);
    } catch {
      return null;
    }
    // 名簿・チーム名・キャプテンは board.state 由来のため依存に含める
  }, [setPiece, board.state]);

  return (
    <div className="libdetail">
      <div className="libpanehead">
        <span className="libpanename">{setPiece.title}</span>
        <span className="libpanetype">セットプレー</span>
      </div>
      <div className="libprev">
        {pngUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pngUrl} alt={setPiece.title} />
        ) : (
          <div className="libprevph">プレビューを表示できません</div>
        )}
      </div>
      <dl className="libmeta">
        <div>
          <dt>種別</dt>
          <dd>
            {SP_KIND_LABEL[setPiece.setPiece.kind]} ・ {SP_SIDE_LABEL[setPiece.setPiece.side]}
          </dd>
        </div>
        <div>
          <dt>更新日時</dt>
          <dd>{fmtDateTime(setPiece.updatedAt)}</dd>
        </div>
      </dl>
      <div className="libacts">
        <button className="bigbtn" onClick={() => board.loadSetPiece(setPiece.id)}>
          ボードで開く
        </button>
        <button className="bigbtn ghost" onClick={() => board.duplicateSetPiece(setPiece.id)}>
          複製
        </button>
        <button
          className="bigbtn ghost"
          onClick={() => {
            const t = window.prompt("新しいタイトル", setPiece.title);
            if (t != null) board.renameSetPiece(setPiece.id, t);
          }}
        >
          名前を変更
        </button>
        <button
          className="bigbtn ghost"
          onClick={() => {
            if (window.confirm(`「${setPiece.title}」を削除しますか？`)) onDelete(setPiece.id);
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

function DrillPreview({ drill }: { drill: SavedDrill }) {
  const board = useBoard();
  const pngUrl = useMemo(() => {
    try {
      // 一覧用サムネイル(極小)ではなく、タイトル・メモ入りの書き出し用レンダラを使う
      return renderDrillPng(drill);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill.id, drill.updatedAt]);

  return (
    <div className="libdetail">
      <div className="libpanehead">
        <span className="libpanename">{drill.title || "無題の練習"}</span>
        <span className="libpanetype">練習</span>
      </div>
      <div className="libprev">
        {pngUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pngUrl} alt="" />
        ) : (
          <div className="libprevph">プレビューを表示できません</div>
        )}
      </div>
      <dl className="libmeta">
        <div>
          <dt>ピッチ種別</dt>
          <dd>{PITCH_LABEL[drill.pitchType] ?? "ピッチ"}</dd>
        </div>
        <div>
          <dt>配置</dt>
          <dd>{drill.items?.length ?? 0}個</dd>
        </div>
        <div>
          <dt>動線</dt>
          <dd>{drill.lines?.length ?? 0}本</dd>
        </div>
        {drill.memo && (
          <div>
            <dt>メモ</dt>
            <dd>{drill.memo}</dd>
          </div>
        )}
        <div>
          <dt>更新日時</dt>
          <dd>{fmtDateTime(drill.updatedAt)}</dd>
        </div>
      </dl>
      <div className="libacts">
        <button
          className="bigbtn"
          onClick={() => {
            board.setDrillIntent({ open: drill.id });
            board.setScreen("drill");
          }}
        >
          練習メニューで開く
        </button>
      </div>
      <div className="libhint">名前の変更・削除は「練習メニュー」画面のライブラリで行えます。</div>
    </div>
  );
}

export function SettingsScreen() {
  const board = useBoard();
  // 戻りラベル: 押下先は常にホームのため、PCでは「‹ ホーム」に(モバイルは「‹ メニュー」のまま)
  const pc = usePc();

  return (
    <div className="app setapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ {pc ? "ホーム" : "メニュー"}
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">設定</div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {board.state.teamName ?? "マイチーム"}
          </div>
        </div>
      </header>
      <div className="scroll screenbody">
        <div className="setwrap">
          <SettingsBody hideTitle />
        </div>
      </div>
    </div>
  );
}
