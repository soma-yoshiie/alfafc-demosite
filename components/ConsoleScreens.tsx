"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import { E } from "./Emoji";
import { ARTICLE_CATEGORIES, mergedArticles } from "@/lib/articles";
import type { ArticleAttachment, UserArticle } from "@/lib/articles";
import { ArticlesBody, ArticleBody, SettingsBody } from "./SheetManager";
import type { BoardState, PitchType, SavedDrill, SavedPlay } from "@/lib/types";
import { renderTacticPng } from "@/lib/exportImage";
import { renderDrillPng } from "@/lib/exportDrill";
import { loadDrills } from "@/lib/storage";

const PC_MQ = "(min-width: 1024px)";

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
  // 内部モードは "read"(閲覧) / "post"(投稿)。ScreenNameは"articles"のまま切り替える
  // （別ScreenNameにするとレールのサブナビ登録(anchor一致)が外れて消えるため禁止）
  const [mode, setModeState] = useState<"read" | "post">("read");
  // 絞り込みは画面側で保持する（記事詳細から戻っても一覧の状態が残るように）
  const [cat, setCat] = useState<string>("all");
  // 初期選択（マウント時のみ）: マージ後リストの先頭を選ぶ（LibraryScreen 41-46の前例）。
  // モバイルの単一.scroll切替(下記の!pc分岐)は現行どおり isRoot(=selected===null) で
  // 一覧/詳細を出し分けるため見え方は変わらない（このスクリーン自体、レールが隠れる
  // 幅では通常到達しない＝ホームのタイルは従来どおりSheetを開く経路のまま）
  // 先頭記事のプリセットはPC(2ペイン)のみ。狭幅の単一カラムでは従来どおり一覧から始める
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window !== "undefined" && window.matchMedia(PC_MQ).matches
      ? mergedArticles(board.userArticles)[0]?.id ?? null
      : null
  );
  // 投稿の編集対象。"new"=新規作成、null=一覧のみ（未選択）
  const [editId, setEditIdState] = useState<string | "new" | null>(null);
  // PC判定（読み物のマスター・ディテール化に使用）
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

  const merged = useMemo(() => mergedArticles(board.userArticles), [board.userArticles]);
  const isRoot = selected === null;
  const count = (cat === "all" ? merged : merged.filter((a) => a.category === cat)).length;
  // 選択記事が消えていた場合(自分の投稿を下書きに戻した等)のガード。
  // ArticleBodyの内部return null(該当なし)に頼らず、右ペイン側で空状態を出す
  const selectedArticle = selected ? merged.find((a) => a.id === selected) ?? null : null;

  // ---- 投稿フォームの未保存ガード ----
  // dirty状態はArticleForm内部で判定し、onDirtyChange経由でrefへ反映する
  // （refなのでコンポーネント再生成やサブナビの同値スキップの影響を受けない）
  const formDirtyRef = useRef(false);
  const confirmDiscard = () =>
    !formDirtyRef.current || window.confirm("編集中の内容を破棄しますか？");

  const setEditId = (next: string | "new" | null) => {
    if (editId === next) return;
    if (!confirmDiscard()) return;
    formDirtyRef.current = false;
    clearArticleFormDraft(); // 破棄を確認済みなので退避も消す(次回開いたとき復元しない)
    setEditIdState(next);
  };

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const switchMode = (next: "read" | "post") => {
    if (modeRef.current === next) return;
    if (!confirmDiscard()) return;
    formDirtyRef.current = false;
    clearArticleFormDraft();
    setModeState(next);
  };
  // レールのサブナビは同値スキップ(key/label/badge/on/anchorのみ比較)によりonSelectが
  // 古いまま残ることがあるため、常に最新のswitchModeを参照できるref経由で呼ぶ
  // （LibraryScreen 58-77 の前例に準拠）
  const switchModeRef = useRef(switchMode);
  switchModeRef.current = switchMode;

  const consoleSubnav = useMemo(
    () => ({
      anchor: "articles" as const,
      items: [
        {
          key: "read",
          label: "記事一覧",
          icon: <E n="doc" />,
          on: mode === "read",
          onSelect: () => switchModeRef.current("read"),
        },
        {
          key: "post",
          label: "記事を投稿",
          icon: <E n="pencil" />,
          on: mode === "post",
          onSelect: () => switchModeRef.current("post"),
        },
      ],
    }),
    [mode]
  );
  useConsoleSubnav(consoleSubnav);

  return (
    <div className="app artapp">
      <header>
        {/* PCの読み物は選択が常に入る2ペインなので、LibraryScreenと同じく1クリックでメニューへ戻す。
            「‹ 戻る」の二段戻りは狭幅の単一カラム時のみ */}
        <div
          className="fpback"
          onClick={() => {
            if (mode === "post" && pc) switchMode("read");
            else if (pc || isRoot) board.setScreen("home");
            else setSelected(null);
          }}
        >
          ‹ {mode === "post" && pc ? "記事一覧" : pc || isRoot ? "メニュー" : "戻る"}
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">
            お役立ち<b>記事</b>
          </div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {mode === "post" && pc ? "記事を投稿" : pc || isRoot ? `${count}本` : "記事"}
          </div>
        </div>
      </header>

      {/* 投稿フォームのCSSはPCブロックにしか無いため、post表示はPC限定(狭幅では読み物へフォールバック) */}
      {mode === "post" && pc ? (
        <>
          <div className="artpane screenbody">
            <button type="button" className="bigbtn" onClick={() => setEditId("new")}>
              ＋ 新しい記事を書く
            </button>
            <OwnArticleList
              articles={board.userArticles}
              editId={editId}
              onSelect={setEditId}
            />
          </div>
          <div className="artmain screenbody">
            {editId === null ? (
              <div className="artempty">
                左の一覧から記事を選ぶか、＋ 新しい記事を書く から始めてください
              </div>
            ) : (
              <ArticleForm
                key={editId}
                editId={editId}
                onSaved={(id) => {
                  formDirtyRef.current = false;
                  setEditIdState(id);
                }}
                onDeleted={() => {
                  formDirtyRef.current = false;
                  setEditIdState(null);
                }}
                onDirtyChange={(d) => {
                  formDirtyRef.current = d;
                }}
              />
            )}
          </div>
        </>
      ) : pc ? (
        <>
          <div className="artpane screenbody">
            <ArticlesBody
              onOpen={setSelected}
              cat={cat}
              onCatChange={setCat}
              hideTitle
              selectedId={selected}
            />
          </div>
          <div className="artmain screenbody">
            {selectedArticle ? (
              <ArticleBody articleId={selectedArticle.id} />
            ) : (
              <div className="artempty">記事を選んでください</div>
            )}
          </div>
        </>
      ) : (
        <div className="scroll screenbody">
          {isRoot ? (
            <ArticlesBody onOpen={setSelected} cat={cat} onCatChange={setCat} hideTitle />
          ) : (
            <ArticleBody articleId={selected ?? undefined} />
          )}
        </div>
      )}
    </div>
  );
}

/** 投稿モード左ペイン: 自分の記事一覧（下書き→公開中の順） */
function OwnArticleList({
  articles,
  editId,
  onSelect,
}: {
  articles: UserArticle[];
  editId: string | "new" | null;
  onSelect: (id: string) => void;
}) {
  if (articles.length === 0) {
    return <div className="empty-msg">まだ記事を投稿していません。</div>;
  }
  const drafts = [...articles].filter((a) => a.draft).sort((a, b) => b.updatedAt - a.updatedAt);
  const published = [...articles].filter((a) => !a.draft).sort((a, b) => b.updatedAt - a.updatedAt);
  const Row = ({ a }: { a: UserArticle }) => (
    <div
      className={`artrow${editId === a.id ? " sel" : ""}`}
      onClick={() => onSelect(a.id)}
    >
      <span className="artcat">{a.category}</span>
      <div className="artmeta">
        <div className="arttitle">{a.title}</div>
        <div className="artby">
          {fmtDateTime(a.updatedAt)}
          {a.draft && " ・ 下書き"}
        </div>
      </div>
    </div>
  );
  return (
    <>
      {drafts.length > 0 && (
        <>
          <div className="setsec-h">下書き</div>
          {drafts.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </>
      )}
      {published.length > 0 && (
        <>
          <div className="setsec-h">公開中</div>
          {published.map((a) => (
            <Row key={a.id} a={a} />
          ))}
        </>
      )}
    </>
  );
}

type ArticleFormErrors = { title?: string; author?: string; body?: string };

/**
 * 投稿フォーム（note/Classroom型・単一カラム・Markdownなし）。
 * key={editId} で editId が変わるたびに再マウントさせ、内部stateを素直な
 * useStateの初期値に委ねる（前の編集内容が新しい対象へ持ち越らない）。
 */
/**
 * 書きかけの記事(セッション内)。レール遷移でArticlesScreenごとアンマウントされても、
 * 同じ編集対象を開き直したときに復元する(保存・削除・明示的な破棄でクリア)。
 * リロード/タブクローズはbeforeunloadで警告する
 */
let articleFormDraft: {
  editId: string | "new";
  title: string;
  category: string;
  author: string;
  lead: string;
  bodyText: string;
  attachments: ArticleAttachment[];
} | null = null;

export function clearArticleFormDraft() {
  articleFormDraft = null;
}

function ArticleForm({
  editId,
  onSaved,
  onDeleted,
  onDirtyChange,
}: {
  editId: string | "new";
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const board = useBoard();
  const existing = editId === "new" ? null : board.userArticles.find((a) => a.id === editId) ?? null;
  const draft = articleFormDraft && articleFormDraft.editId === editId ? articleFormDraft : null;
  const [restoredDraft] = useState(!!draft);

  const [title, setTitle] = useState(draft?.title ?? existing?.title ?? "");
  const [category, setCategory] = useState<string>(
    draft?.category ?? existing?.category ?? ARTICLE_CATEGORIES[0]
  );
  const [author, setAuthor] = useState(draft?.author ?? existing?.author ?? board.auth.name);
  const [lead, setLead] = useState(draft?.lead ?? existing?.lead ?? "");
  const [bodyText, setBodyText] = useState(draft?.bodyText ?? existing?.body?.join("\n\n") ?? "");
  const [attachments, setAttachments] = useState<ArticleAttachment[]>(
    draft?.attachments ?? existing?.attachments ?? []
  );
  const [playPickerOpen, setPlayPickerOpen] = useState(false);
  const [drillPickerOpen, setDrillPickerOpen] = useState(false);
  // 練習の読み込みはピッカーを開いたときだけ行う（LibraryScreenの練習タブと同方針）
  const [pickerDrills, setPickerDrills] = useState<SavedDrill[] | null>(null);

  const [touched, setTouched] = useState<{ title?: boolean; author?: boolean; body?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const authorRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const errors = useMemo<ArticleFormErrors>(() => {
    const e: ArticleFormErrors = {};
    if (!title.trim()) e.title = "タイトルを入力してください";
    if (!author.trim()) e.author = "掲載する名前を入力してください";
    if (!bodyText.trim()) e.body = "本文を入力してください";
    return e;
  }, [title, author, bodyText]);

  // ---- 未保存ガード: マウント時のスナップショットと現在値をJSON比較 ----
  const initialSnapRef = useRef(
    JSON.stringify({
      title: existing?.title ?? "",
      category: existing?.category ?? ARTICLE_CATEGORIES[0],
      author: existing?.author ?? board.auth.name,
      lead: existing?.lead ?? "",
      bodyText: existing?.body?.join("\n\n") ?? "",
      attachments: existing?.attachments ?? [],
    })
  );
  const dirtyRef = useRef(false);
  useEffect(() => {
    const snap = JSON.stringify({ title, category, author, lead, bodyText, attachments });
    const dirty = snap !== initialSnapRef.current;
    dirtyRef.current = dirty;
    onDirtyChange(dirty);
    // 書きかけをモジュールスコープへ退避(レール遷移でアンマウントされても復元できる)
    articleFormDraft = dirty
      ? { editId, title, category, author, lead, bodyText, attachments }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, category, author, lead, bodyText, attachments]);
  useEffect(() => {
    // リロード・タブクローズでの消失はブラウザ標準の離脱確認で防ぐ
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // アンマウント時（保存・削除・破棄いずれの遷移でも）親のdirtyを残さない保険
      onDirtyChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFirstError = (errs: ArticleFormErrors) => {
    const target = errs.title ? titleRef.current : errs.author ? authorRef.current : errs.body ? bodyRef.current : null;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  };

  const buildPayload = (draft: boolean): Omit<UserArticle, "id" | "ts" | "updatedAt"> => {
    const body = bodyText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    // リード未入力は空のまま保存し、表示側で本文冒頭へフォールバックする。
    // 自動生成文字列を保存すると本文を書き換えても古い冒頭が一覧に残り続けるため
    return { title: title.trim(), category, author: author.trim(), lead: lead.trim(), body, draft, attachments };
  };

  /** バリデーション→(必要なら)確認ダイアログ→保存、を行い保存後のIDを返す（失敗時null） */
  const trySave = (draft: boolean, confirmMsg?: string): string | null => {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return null;
    }
    if (confirmMsg && !window.confirm(confirmMsg)) return null;
    const payload = buildPayload(draft);
    // 保存成功時は未保存ガードの基準値を現在値に更新する。
    // editIdが変わらない保存（既存記事の上書き）ではArticleFormが再マウントされず
    // initialSnapRefが古いままになるため、ここで明示的に synchronize する
    initialSnapRef.current = JSON.stringify({ title, category, author, lead, bodyText, attachments });
    dirtyRef.current = false;
    articleFormDraft = null;
    onDirtyChange(false);
    if (editId === "new") {
      return board.addUserArticle(payload);
    }
    if (existing) {
      board.updateUserArticle({ ...existing, ...payload });
      return existing.id;
    }
    return null;
  };

  const handleSaveDraft = () => {
    const id = trySave(true);
    if (id) {
      board.toast("下書きを保存しました");
      onSaved(id);
    }
  };
  const handlePublish = () => {
    const id = trySave(
      false,
      "この記事を公開します。チームのメンバーが読めるようになります。よろしいですか？"
    );
    if (id) {
      board.toast("記事を公開しました");
      onSaved(id);
    }
  };
  const handleSaveChanges = () => {
    const id = trySave(false);
    if (id) {
      board.toast("記事を保存しました");
      onSaved(id);
    }
  };
  const handleUnpublish = () => {
    const id = trySave(true);
    if (id) {
      board.toast("公開を取り消して下書きに戻しました");
      onSaved(id);
    }
  };
  const handleDelete = () => {
    if (!existing) return;
    if (!window.confirm(`「${existing.title}」を削除しますか？`)) return;
    board.removeUserArticle(existing.id);
    articleFormDraft = null;
    board.toast("記事を削除しました");
    onDeleted();
  };

  const errFor = (key: keyof ArticleFormErrors) =>
    touched[key] || submitAttempted ? errors[key] : undefined;

  // ---- 添付 ----
  const addPlayAttachment = (p: SavedPlay) => {
    setAttachments((list) =>
      list.some((a) => a.kind === "play" && a.play?.id === p.id)
        ? list
        : [...list, { kind: "play", title: p.title, play: p }]
    );
    setPlayPickerOpen(false);
  };
  const togglePlayPicker = () => {
    setDrillPickerOpen(false);
    setPlayPickerOpen((v) => !v);
  };
  const toggleDrillPicker = () => {
    setPlayPickerOpen(false);
    setDrillPickerOpen((v) => {
      const next = !v;
      if (next) setPickerDrills(loadDrills());
      return next;
    });
  };
  const addDrillAttachment = (d: SavedDrill) => {
    setAttachments((list) =>
      list.some((a) => a.kind === "drill" && a.drill?.id === d.id)
        ? list
        : [...list, { kind: "drill", title: d.title || "無題の練習", drill: d }]
    );
    setDrillPickerOpen(false);
  };
  const removeAttachment = (i: number) => {
    setAttachments((list) => list.filter((_, idx) => idx !== i));
  };

  const published = existing != null && existing.draft === false;

  return (
    <div className="artform">
      {restoredDraft && (
        <div className="evnote" style={{ marginBottom: 10 }}>
          書きかけの内容を復元しました（保存するまで公開されません）
        </div>
      )}
      <div className="artactbar">
        {published ? (
          <>
            <button type="button" className="bigbtn" onClick={handleSaveChanges}>
              変更を保存
            </button>
            <button type="button" className="artweaklink" onClick={handleUnpublish}>
              公開を取り消す（下書きに戻す）
            </button>
          </>
        ) : (
          <>
            <button type="button" className="bigbtn ghost" onClick={handleSaveDraft}>
              下書き保存
            </button>
            <button type="button" className="bigbtn" onClick={handlePublish}>
              公開する
            </button>
          </>
        )}
      </div>

      <div className="ffield">
        <label htmlFor="artf-title">
          タイトル <span className="reqb">必須</span>
        </label>
        <input
          id="artf-title"
          ref={titleRef}
          className="big"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          aria-invalid={errFor("title") ? "true" : undefined}
          aria-describedby={errFor("title") ? "artf-title-err" : undefined}
          placeholder="記事のタイトル"
        />
        {errFor("title") && (
          <div id="artf-title-err" className="arterr">
            ⚠ {errFor("title")}
          </div>
        )}
      </div>

      <div className="ffield">
        <label>
          カテゴリ <span className="reqb">必須</span>
        </label>
        <div className="catbar">
          {ARTICLE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`catchip${category === c ? " on" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="ffield">
        <label htmlFor="artf-author">
          掲載する名前 <span className="reqb">必須</span>
        </label>
        <input
          id="artf-author"
          ref={authorRef}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, author: true }))}
          aria-invalid={errFor("author") ? "true" : undefined}
          aria-describedby={errFor("author") ? "artf-author-err" : undefined}
          placeholder="記事に表示する名前"
        />
        {errFor("author") && (
          <div id="artf-author-err" className="arterr">
            ⚠ {errFor("author")}
          </div>
        )}
      </div>

      <div className="ffield">
        <label htmlFor="artf-lead">
          リード文 <span className="optb">任意</span>
        </label>
        <input
          id="artf-lead"
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          placeholder="空欄の場合は本文の冒頭を自動で使用します"
        />
      </div>

      <div className="ffield">
        <label htmlFor="artf-body">
          本文 <span className="reqb">必須</span>
        </label>
        <textarea
          id="artf-body"
          ref={bodyRef}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, body: true }))}
          aria-invalid={errFor("body") ? "true" : undefined}
          aria-describedby={errFor("body") ? "artf-body-err" : undefined}
          placeholder="1行あけると段落が分かれます"
        />
        {errFor("body") && (
          <div id="artf-body-err" className="arterr">
            ⚠ {errFor("body")}
          </div>
        )}
      </div>

      <div className="ffield">
        <label>
          添付 <span className="optb">任意</span>
        </label>
        {attachments.map((att, i) => (
          <div key={i} className="artattrow">
            <span className="artattkind">{att.kind === "play" ? "戦術" : "練習"}</span>
            <span className="artatttitle">{att.title}</span>
            <button
              type="button"
              className="artattdel"
              onClick={() => removeAttachment(i)}
              aria-label="添付を削除"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="artaddbtn" onClick={togglePlayPicker}>
          ＋ 保存した戦術を添付
        </button>
        <button type="button" className="artaddbtn" onClick={toggleDrillPicker}>
          ＋ 保存した練習を添付
        </button>
        {playPickerOpen && (
          <div className="artpick">
            {board.library.plays.length === 0 ? (
              <div className="artpickempty">保存された戦術がありません。</div>
            ) : (
              [...board.library.plays]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((p) => (
                  <button type="button" key={p.id} onClick={() => addPlayAttachment(p)}>
                    {p.title}
                  </button>
                ))
            )}
          </div>
        )}
        {drillPickerOpen && (
          <div className="artpick">
            {!pickerDrills || pickerDrills.length === 0 ? (
              <div className="artpickempty">保存された練習メニューがありません。</div>
            ) : (
              [...pickerDrills]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((d) => (
                  <button type="button" key={d.id} onClick={() => addDrillAttachment(d)}>
                    {d.title || "無題の練習"}
                  </button>
                ))
            )}
          </div>
        )}
      </div>

      {existing && (
        <div className="artdangerzone">
          <button type="button" className="artdangerlink" onClick={handleDelete}>
            この記事を削除
          </button>
        </div>
      )}
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
