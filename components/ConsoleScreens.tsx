"use client";

import { useMemo, useRef, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import { E } from "./Emoji";
import { ARTICLES } from "@/lib/articles";
import { ArticlesBody, ArticleBody, SettingsBody } from "./SheetManager";
import type { BoardState, PitchType, SavedDrill, SavedPlay } from "@/lib/types";
import { renderTacticPng } from "@/lib/exportImage";
import { renderDrillPng } from "@/lib/exportDrill";
import { loadDrills } from "@/lib/storage";

/**
 * PCレール直結の3画面（ライブラリ／お役立ち記事／設定）。
 * 従来はモーダル(シート)で開いていたが、レールの他項目と同様に
 * 画面切り替えで表示する。お役立ち記事／設定は SheetManager 側の *Body を
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
  const [tab, setTabState] = useState<"plays" | "drills">("plays");
  // 初期選択（マウント時のみ）: 戦術タブの先頭項目
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const list = [...board.library.plays].sort((a, b) => b.updatedAt - a.updatedAt);
    return list[0]?.id ?? null;
  });

  const plays = useMemo(
    () => [...board.library.plays].sort((a, b) => b.updatedAt - a.updatedAt),
    [board.library.plays]
  );
  // DrillProvider はここでは使えないため localStorage から直接読む（LibraryBody と同じ方式）。
  // 練習タブを開いたときだけ読む
  const drills = useMemo(
    () => (tab === "drills" ? [...loadDrills()].sort((a, b) => b.updatedAt - a.updatedAt) : []),
    [tab]
  );
  // レールのサブナビが登録するonSelectは、ConsoleShell側の同値比較で更新が
  // スキップされることがあり古い plays を閉じ込めるおそれがあるため、
  // 常に最新値を参照できる ref 経由で読む（ChatScreen の教訓に倣う）
  const playsRef = useRef(plays);
  playsRef.current = plays;
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // タブ切替（レールサブナビとペイン内タブの両方から呼ばれる）。
  // 同じタブの再クリックで選択が先頭に巻き戻らないようガードする
  const switchTab = (next: "plays" | "drills") => {
    if (tabRef.current === next) return;
    if (next === "plays") {
      setSelectedId(playsRef.current[0]?.id ?? null);
    } else {
      const list = [...loadDrills()].sort((a, b) => b.updatedAt - a.updatedAt);
      setSelectedId(list[0]?.id ?? null);
    }
    setTabState(next);
  };

  const selectedPlay = tab === "plays" ? plays.find((p) => p.id === selectedId) ?? null : null;
  const selectedDrill = tab === "drills" ? drills.find((d) => d.id === selectedId) ?? null : null;

  const handleDeletePlay = (id: string) => {
    board.deletePlay(id);
    setSelectedId((cur) => {
      if (cur !== id) return cur;
      const remaining = plays.filter((p) => p.id !== id);
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

  return (
    <div className="app libapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ メニュー
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
                まだ保存された戦術はありません。
                <br />
                盤面を作って上部の保存ボタンで保存しましょう。
              </div>
            ) : (
              <div className="liblist">
                {board.library.folders.map((f) => {
                  const fp = plays.filter((p) => p.folderId === f.id);
                  return (
                    <div key={f.id}>
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
        ) : drills.length === 0 ? (
          <div className="empty-msg">まだ保存された練習メニューはありません。</div>
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
        )}
      </div>

      <div className="libmain">
        {tab === "plays" ? (
          selectedPlay ? (
            <PlayPreview play={selectedPlay} onDelete={handleDeletePlay} />
          ) : (
            <div className="libempty">
              {plays.length === 0 ? "まだ保存された戦術はありません" : "項目を選んでください"}
            </div>
          )
        ) : selectedDrill ? (
          <DrillPreview drill={selectedDrill} />
        ) : (
          <div className="libempty">
            {drills.length === 0 ? "まだ保存された練習メニューはありません" : "項目を選んでください"}
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

export function ArticlesScreen() {
  const board = useBoard();
  const [selected, setSelected] = useState<string | null>(null);
  // 絞り込みは画面側で保持する（記事詳細から戻っても一覧の状態が残るように）
  const [cat, setCat] = useState<string>("all");
  const isRoot = selected === null;
  const count = (cat === "all" ? ARTICLES : ARTICLES.filter((a) => a.category === cat)).length;

  return (
    <div className="app artapp">
      <header>
        <div
          className="fpback"
          onClick={() => (isRoot ? board.setScreen("home") : setSelected(null))}
        >
          ‹ {isRoot ? "メニュー" : "戻る"}
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">
            お役立ち<b>記事</b>
          </div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {isRoot ? `${count}本` : "記事"}
          </div>
        </div>
      </header>
      <div className="scroll screenbody">
        {isRoot ? (
          <ArticlesBody onOpen={setSelected} cat={cat} onCatChange={setCat} hideTitle />
        ) : (
          <ArticleBody articleId={selected ?? undefined} />
        )}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const board = useBoard();

  return (
    <div className="app setapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ メニュー
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">設定</div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {board.state.teamName ?? "マイチーム"}
          </div>
        </div>
      </header>
      <div className="scroll screenbody">
        <SettingsBody hideTitle />
      </div>
    </div>
  );
}
