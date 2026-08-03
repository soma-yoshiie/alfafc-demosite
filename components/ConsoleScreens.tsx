"use client";

import { useMemo, useState } from "react";
import { useBoard } from "./BoardProvider";
import { useConsoleSubnav } from "./ConsoleShell";
import { E } from "./Emoji";
import { ARTICLES } from "@/lib/articles";
import { LibraryBody, ArticlesBody, ArticleBody, SettingsBody } from "./SheetManager";

/**
 * PCレール直結の3画面（ライブラリ／お役立ち記事／設定）。
 * 従来はモーダル(シート)で開いていたが、レールの他項目と同様に
 * 画面切り替えで表示する。中身は SheetManager 側の *Body コンポーネントを
 * そのまま再利用し、モバイルのシート表示（DOM・見た目）は一切変えない。
 */

export function LibraryScreen() {
  const board = useBoard();
  const [tab, setTab] = useState<"plays" | "drills">("plays");

  const consoleSubnav = useMemo(
    () => ({
      anchor: "library" as const,
      items: [
        {
          key: "plays",
          label: "戦術",
          icon: <E n="clipboard" />,
          on: tab === "plays",
          onSelect: () => setTab("plays"),
        },
        {
          key: "drills",
          label: "練習",
          icon: <E n="run" />,
          on: tab === "drills",
          onSelect: () => setTab("drills"),
        },
      ],
    }),
    [tab]
  );
  useConsoleSubnav(consoleSubnav);

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
      <div className="scroll screenbody">
        <LibraryBody tab={tab} onTabChange={setTab} />
      </div>
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
