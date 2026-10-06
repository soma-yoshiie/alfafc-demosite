"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { localDateStr } from "@/lib/dates";
import {
  filterPosts,
  isDefaultMatchupFilter,
  loadMatchupSideOpen,
  matchupFilterLine,
  saveMatchupSideOpen,
} from "@/lib/matchup";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { IconFilter, IconPlus } from "../icons";
import { MobileHeader, MobileHeaderAction } from "../MobileHeader";
import { MobileSegments } from "../MobileSegments";
import { usePc } from "../hub/common";
import { Sheet } from "../team/Sheet";
import { FindPanel } from "./FindPanel";
import { useMatchups } from "./MatchupProvider";
import { MyPostDetail, MyPostList, sortMyPosts } from "./MyPosts";
import { PostDetail } from "./PostDetail";
import { PostForm } from "./PostForm";
import { PostList } from "./PostList";

/**
 * 練習試合の画面（specs/matchup-demo.md §1・§4）。スタッフだけ。
 * PC：ヘッダー＋3 列（絞り込み 184px｜一覧 360px｜詳細）。絞り込み列は隠せる（隠すと一覧の上に「絞り込み」）。
 * スマホ：MobileHeader＋セグメント「探す｜自分の募集」。絞り込みはヘッダー右のボタンで下からのシート。
 */

type MatchupTab = "find" | "mine";

export default function MatchupScreen() {
  const board = useBoard();
  const teamCtx = useTeam();
  const mt = useMatchups();
  const pc = usePc();
  const coach = board.auth.role === "coach";
  const stage = teamCtx.team.schoolStage ?? "junior";

  const [tab, setTab] = useState<MatchupTab>("find");
  /** 探す：開いている募集の id（PC は選択中のカード、スマホは詳細を全画面で開く） */
  const [sel, setSel] = useState<string | null>(null);
  /** 自分の募集：開いている募集の id と、「募集する」フォームの開閉（PC は右の列、スマホは下からのシート） */
  const [mineSel, setMineSel] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // PC の絞り込み列の開閉（calside と同じ作法。既定は開く）。スマホの絞り込みシートの開閉は filterSheet
  const [sideOpen, setSideOpen] = useState(() => loadMatchupSideOpen());
  useEffect(() => {
    saveMatchupSideOpen(sideOpen);
  }, [sideOpen]);
  const [filterSheet, setFilterSheet] = useState(false);

  // スタッフだけの機能。選手・保護者がここへ来たらホームへ戻す
  useEffect(() => {
    if (!coach) board.setScreen("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach]);
  // PC 幅になったらスマホのシートは閉じる
  useEffect(() => {
    if (pc) setFilterSheet(false);
  }, [pc]);

  const today = useMemo(() => localDateStr(), []);
  const posts = useMemo(
    () => filterPosts(mt.posts, mt.teams, mt.filter, today),
    [mt.posts, mt.teams, mt.filter, today]
  );
  const matches = teamCtx.team.matches;
  const myPosts = useMemo(() => sortMyPosts(mt.posts), [mt.posts]);
  const myPostCount = myPosts.length;
  const selPost = sel ? posts.find((p) => p.id === sel) : undefined;
  const selTeam = selPost ? mt.teams.find((t) => t.id === selPost.teamId) : undefined;
  const minePost = mineSel ? myPosts.find((p) => p.id === mineSel) : undefined;

  // スマホで詳細（全画面）を閉じたとき、一覧のスクロール位置を戻す（一覧は詳細の間アンマウントされる）
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAt = useRef(0);
  const detailOpen = !pc && (tab === "find" ? !!selPost : !!minePost);
  useLayoutEffect(() => {
    if (!detailOpen && scrollRef.current) scrollRef.current.scrollTop = scrollAt.current;
  }, [detailOpen]);
  const rememberScroll = () => {
    scrollAt.current = scrollRef.current?.scrollTop ?? 0;
  };
  const filterIsDefault = isDefaultMatchupFilter(mt.filter, stage);

  // 絞り込みで一覧から消えた募集を、選択に残さない
  useEffect(() => {
    if (sel && !posts.some((p) => p.id === sel)) setSel(null);
  }, [posts, sel]);

  // 詳細を開いたまま相手が承諾したら、そのチームの会話へ移る（開いていなければトーストだけ。画面を開く前の承諾は対象外）
  const mountedAt = useRef(Date.now());
  const accepted = mt.lastAccepted;
  useEffect(() => {
    if (!accepted || accepted.at < mountedAt.current || tab !== "find") return;
    const open = mt.posts.find((p) => p.id === sel);
    if (open && open.teamId === accepted.teamId) mt.openThread(accepted.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted]);

  if (!coach) return null;

  const incoming = mt.pendingIncoming.length;
  const segments = (
    <MobileSegments
      ariaLabel="練習試合の表示切替"
      items={[
        { key: "find", label: "探す", on: tab === "find", onSelect: () => {
            setTab("find");
            setFormOpen(false);
          },
        },
        {
          key: "mine",
          label: "自分の募集",
          badge: incoming,
          badgeClass: "chatsegbadge",
          on: tab === "mine",
          onSelect: () => setTab("mine"),
        },
      ]}
    />
  );

  const openMine = (id: string) => {
    rememberScroll();
    setFormOpen(false);
    setMineSel(id);
  };
  const openForm = () => {
    setMineSel(null);
    setFormOpen(true);
  };
  // 募集を出し終えたら一覧へ戻す（トーストは PostForm が出す）
  const doneForm = () => {
    setFormOpen(false);
    setMineSel(null);
  };

  const list = (
    <PostList
      posts={posts}
      teams={mt.teams}
      matches={matches}
      selectedId={sel}
      onOpen={(id) => {
        rememberScroll();
        setSel(id);
      }}
      myRequestFor={mt.myRequestFor}
      today={today}
      lead={
        pc && !sideOpen ? (
          <button type="button" className="mt-showfilter" onClick={() => setSideOpen(true)}>
            <IconFilter />
            絞り込み
            {!filterIsDefault && <span className="dot" />}
          </button>
        ) : undefined
      }
    />
  );

  if (pc) {
    const withSide = tab === "find" && sideOpen;
    return (
      <div className="app mtapp">
        <header>
          <div className="brand">
            <div className="logo">練習試合</div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {board.state.teamName ?? "マイチーム"}
            </div>
          </div>
        </header>
        <div className={`mt-pc${withSide ? "" : " noside"}`}>
          {withSide && (
            <aside className="mtside">
              <button type="button" className="mtside-hide" onClick={() => setSideOpen(false)}>
                ‹ 絞り込みを隠す
              </button>
              <FindPanel filter={mt.filter} setFilter={mt.setFilter} stage={stage} compact />
            </aside>
          )}
          <section className="mt-list">
            <div className="mt-segrow">{segments}</div>
            {tab === "find" ? (
              list
            ) : (
              <div className="mt-listwrap">
                <div className="mt-listbar">
                  <span className="mt-count">{myPostCount} 件</span>
                  <button type="button" className="mt-newbtn" onClick={openForm}>
                    ＋ 募集する
                  </button>
                </div>
                <MyPostList posts={myPosts} teams={mt.teams} requests={mt.requests} selectedId={formOpen ? null : mineSel} onOpen={openMine} />
              </div>
            )}
          </section>
          <section className="mt-detail">
            {tab === "find" &&
              (selPost && selTeam ? (
                <PostDetail key={selPost.id} post={selPost} team={selTeam} matches={matches} pc />
              ) : (
                <div className="empty-msg">募集を選ぶと詳しい内容が出ます。</div>
              ))}
            {tab === "mine" &&
              (formOpen ? (
                <PostForm stage={stage} pc onClose={() => setFormOpen(false)} onDone={doneForm} />
              ) : minePost ? (
                <MyPostDetail key={minePost.id} post={minePost} teams={mt.teams} matches={matches} />
              ) : (
                <div className="empty-msg">募集を選ぶと詳しい内容が出ます。</div>
              ))}
          </section>
        </div>
      </div>
    );
  }

  // スマホ：詳細は全画面（ヘッダーの戻るで一覧へ）
  if (tab === "find" && selPost && selTeam) {
    return (
      <div className="app mtapp">
        <MobileHeader title={selTeam.name} onBack={() => setSel(null)} />
        <PostDetail key={selPost.id} post={selPost} team={selTeam} matches={matches} pc={false} />
      </div>
    );
  }
  if (tab === "mine" && minePost) {
    return (
      <div className="app mtapp">
        <MobileHeader title="自分の募集" onBack={() => setMineSel(null)} />
        <MyPostDetail key={minePost.id} post={minePost} teams={mt.teams} matches={matches} />
      </div>
    );
  }

  return (
    <div className="app mtapp">
      <MobileHeader
        title="練習試合"
        onBack={() => board.setScreen("other")}
        actions={
          tab === "find" ? (
            <MobileHeaderAction label="絞り込み" onClick={() => setFilterSheet(true)}>
              <IconFilter />
              {!filterIsDefault && <span className="dot" />}
            </MobileHeaderAction>
          ) : (
            <MobileHeaderAction primary label="募集する" onClick={openForm}>
              <IconPlus />
            </MobileHeaderAction>
          )
        }
      />
      <div className="mseg-wrap mt-segwrap">{segments}</div>
      <div className="scroll mt-scroll" ref={scrollRef}>
        {tab === "find" && (
          <>
            <button type="button" className="mt-filterline" onClick={() => setFilterSheet(true)}>
              <span className="mt-filterline-tx">{matchupFilterLine(mt.filter, stage)}</span>
              <span className="mt-filterline-act">変更</span>
            </button>
            {list}
          </>
        )}
        {tab === "mine" && (
          <div className="mt-listwrap">
            <div className="mt-listbar">
              <span className="mt-count">{myPostCount} 件</span>
            </div>
            <MyPostList posts={myPosts} teams={mt.teams} requests={mt.requests} selectedId={null} onOpen={openMine} />
          </div>
        )}
      </div>
      <Sheet open={filterSheet} onClose={() => setFilterSheet(false)}>
        <FindPanel filter={mt.filter} setFilter={mt.setFilter} stage={stage} onClose={() => setFilterSheet(false)} />
      </Sheet>
      <Sheet open={formOpen} onClose={() => setFormOpen(false)}>
        <PostForm stage={stage} pc={false} onClose={() => setFormOpen(false)} onDone={doneForm} />
      </Sheet>
    </div>
  );
}
