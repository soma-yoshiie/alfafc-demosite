"use client";

import { useMemo, useRef, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useConsoleSubnav } from "../ConsoleShell";
import type { ConsoleSubnavItem } from "../ConsoleShell";
import { E } from "../Emoji";
import { MobileHeader } from "../MobileHeader";
import { MobileSegments } from "../MobileSegments";
import { useCoachLab } from "./CoachLabProvider";
import { allArticles } from "@/lib/coachlab";
import { useIsPc } from "./CoachLabParts";
import { CoachLabExplore, CoachLabFollowing } from "./CoachLabExplore";
import CoachLabAuthor from "./CoachLabAuthor";
import CoachLabArticle from "./CoachLabArticle";
import CoachLabEditor, { clearCoachLabDraft } from "./CoachLabEditor";
import CoachLabEarnings from "./CoachLabEarnings";
import CoachLabProfileForm from "./CoachLabProfileForm";

/**
 * コーチラボの入口画面（ルーティング）。ScreenNameは"articles"のまま、内部で
 * 探す／フォロー中／指導者ページ／記事ページ／書く／収益／プロフィールを切り替える。
 * PCはコンソールシェル内、モバイルは単一カラム。詳細は specs/coachlab.md §5・§5-8。
 */

type ClView =
  | { kind: "explore" }
  | { kind: "following" }
  | { kind: "author"; authorId: string }
  | { kind: "article"; articleId: string }
  | { kind: "write" }
  | { kind: "earnings" }
  | { kind: "profile" };

export default function CoachLabScreen() {
  const board = useBoard();
  const cl = useCoachLab();
  const pc = useIsPc();
  const isCoach = board.auth.role === "coach";

  const [stack, setStack] = useState<ClView[]>([{ kind: "explore" }]);
  const current = stack[stack.length - 1];

  // 「書く」のエディタが未保存のとき、レール遷移・戻る操作の前に確認する
  // （旧ArticlesScreenのformDirtyRef/confirmDiscardと同じ方針）。
  // 確認を通過して実際に離れるときは、書きかけの退避(clDraft)も明示的に消す
  // （消さないと、確認ダイアログで「破棄する」を選んだのに再訪時に復元されてしまう）
  const currentRef = useRef(current);
  currentRef.current = current;
  const writeDirtyRef = useRef(false);
  const confirmLeaveWrite = (): boolean => {
    if (writeDirtyRef.current && !window.confirm("編集中の内容を破棄しますか？")) return false;
    writeDirtyRef.current = false;
    if (currentRef.current.kind === "write") clearCoachLabDraft();
    return true;
  };

  const push = (view: ClView) => {
    if (!confirmLeaveWrite()) return;
    setStack((s) => [...s, view]);
  };
  const goTop = (view: ClView) => {
    // 既に同じトップレベル画面にいるだけなら何もしない
    // （「書く」で編集中に同じレール項目を再クリックしても確認ダイアログを出さない）
    if (stack.length === 1 && current.kind === view.kind) return;
    if (!confirmLeaveWrite()) return;
    setStack([view]);
  };
  const back = () => {
    if (!confirmLeaveWrite()) return;
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  const openAuthor = (authorId: string) => push({ kind: "author", authorId });
  const openArticle = (articleId: string) => push({ kind: "article", articleId });
  // プロフィールへの寄り道だけは「離脱」として扱わない（push/confirmLeaveWriteを通さない）。
  // 有料記事の公開ブロック（CoachLabEditor.tsx:publishBlocked）や著者ページの
  // 「プロフィールを編集」から呼ばれる。confirmLeaveWriteを通すと「編集中の内容を
  // 破棄しますか？」の確認→OKでclearCoachLabDraft()まで実行され、書きかけの記事本文が
  // 消えてしまう。ここでは単にスタックへpushするだけにして、書きかけの下書き(clDraft)を
  // 残す。戻ってきたときはCoachLabEditor側がclDraftのeditIdを見て同じ記事を開き直す
  const goProfile = () => setStack((s) => [...s, { kind: "profile" }]);

  const navItems = useMemo(() => {
    const items: ConsoleSubnavItem[] = [
      { key: "explore", label: "探す", icon: <E n="search" />, on: current.kind === "explore", onSelect: () => goTop({ kind: "explore" }) },
      { key: "following", label: "フォロー中", icon: <E n="star" />, on: current.kind === "following", onSelect: () => goTop({ kind: "following" }) },
    ];
    if (isCoach) {
      items.push(
        { key: "write", label: "書く", icon: <E n="pencil" />, on: current.kind === "write", onSelect: () => goTop({ kind: "write" }) },
        { key: "earnings", label: "収益", icon: <E n="chart" />, on: current.kind === "earnings", onSelect: () => goTop({ kind: "earnings" }) },
        { key: "profile", label: "プロフィール", icon: <E n="users" />, on: current.kind === "profile", onSelect: () => goTop({ kind: "profile" }) }
      );
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.kind, isCoach]);
  // PCレールのサブナビ（.conrail-sub）とモバイルのヘッダー直下セグメント(MobileSegments)で
  // 同じ項目を共有する。.conrailはモバイルでは display:none のため、レールのサブナビだけでは
  // モバイルから「フォロー中／書く／収益／プロフィール」に到達できない
  const consoleSubnav = useMemo(() => ({ anchor: "articles" as const, items: navItems }), [navItems]);
  useConsoleSubnav(consoleSubnav);

  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);

  let tag = "指導者の記事を読む・書く・売る";
  if (current.kind === "following") tag = "フォロー中の指導者の新着";
  else if (current.kind === "author") tag = cl.profiles.find((p) => p.id === current.authorId)?.name ?? "指導者ページ";
  else if (current.kind === "article") tag = merged.find((a) => a.id === current.articleId)?.title ?? "記事";
  else if (current.kind === "write") tag = "書く";
  else if (current.kind === "earnings") tag = "収益";
  else if (current.kind === "profile") tag = "プロフィール編集";

  const isRoot = stack.length === 1;
  // mobile-redesign Phase D-1(C2-minor 到達不能コード): backLabelはPC分岐の<header>内
  // (160行以降)でのみ使われる(=pcがtrueのときしか参照されない)ため、pc?...:"メニュー"の
  // false側は到達しない死にコードだった。「‹ メニュー」表記は他画面でも全廃済みのため簡約する
  const backLabel = isRoot ? "ホーム" : "戻る";
  const handleBack = () => {
    if (isRoot) {
      if (!confirmLeaveWrite()) return;
      // ホームの行／その他ハブの行のどちらから開いたかでnavFromに従い戻る
      // （mobile-redesign-v2 §2）
      board.setScreen(board.navFrom === "home" ? "home" : "other");
    } else {
      back();
    }
  };

  const renderBody = () => {
    switch (current.kind) {
      case "explore":
        return <CoachLabExplore onOpenAuthor={openAuthor} onOpenArticle={openArticle} />;
      case "following":
        return <CoachLabFollowing onOpenAuthor={openAuthor} onOpenArticle={openArticle} />;
      case "author":
        return (
          <CoachLabAuthor
            authorId={current.authorId}
            onOpenArticle={openArticle}
            onOpenAuthor={openAuthor}
            onGoProfile={goProfile}
          />
        );
      case "article":
        return <CoachLabArticle articleId={current.articleId} onOpenAuthor={openAuthor} onOpenArticle={openArticle} />;
      case "earnings":
        return isCoach ? <CoachLabEarnings /> : <div className="empty-msg">この画面は指導者のみ利用できます。</div>;
      case "profile":
        return isCoach ? (
          <CoachLabProfileForm onSaved={back} />
        ) : (
          <div className="empty-msg">この画面は指導者のみ利用できます。</div>
        );
      case "write":
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="app clapp">
      {pc ? (
        <header>
          <div className="fpback" onClick={handleBack}>
            ‹ {backLabel}
          </div>
          <div className="brand" style={{ marginLeft: 4 }}>
            <div className="logo">コーチラボ</div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {tag}
            </div>
          </div>
        </header>
      ) : (
        <>
          {/* mobile-redesign §1-6/§1-7: 共通ヘッダー＋ヘッダー直下セグメント。
              .cl-mobilenav(下部ナビ)は廃止し、同じnavItemsをセグメントで表示する。
              ルート(探す/フォロー中)でも、ホームの行/その他ハブの行のどちらから開いても
              戻れるよう「‹戻る」を常に出す（mobile-redesign-v2 §2） */}
          <MobileHeader title={isRoot ? "コーチラボ" : tag} onBack={handleBack} />
          {isRoot && (
            <div className="mseg-wrap">
              <MobileSegments ariaLabel="コーチラボの表示切替" items={navItems} />
            </div>
          )}
        </>
      )}

      {current.kind === "write" && isCoach ? (
        <CoachLabEditor
          onDirtyChange={(d) => {
            writeDirtyRef.current = d;
          }}
          onGoProfile={goProfile}
        />
      ) : (
        <div className="scroll screenbody">{renderBody()}</div>
      )}
    </div>
  );
}
