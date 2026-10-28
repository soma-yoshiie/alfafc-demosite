"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatReplyTo } from "@/lib/types";
import { dmThreadKey } from "@/lib/types";
import { ALL_THREAD_KEY, groupThreadInfo, isGroupKey, isOppKey, playerGroupKeys, threadMembers } from "@/lib/chat";
import { groupsOfPlayer } from "@/lib/groups";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import ChatHome, { useChatHeaderAction } from "./ChatHome";
import ChatThread from "./ChatThread";
import { useMatchups } from "./matchup/MatchupProvider";
import { IconPlus } from "./icons";
import { MobileHeader, MobileHeaderAction } from "./MobileHeader";

const PC_MQ = "(min-width: 1024px)";

/** 画面幅の条件を追跡するフック（TeamHub.tsx usePc() と同じ手法） */
function useMedia(query: string): boolean {
  const [on, setOn] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setOn(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return on;
}

/**
 * PC の右のペインの選択（開いている会話キー）。viewer は選択した視点。視点（スタッフ／選手・保護者）が
 * 変わったら別の視点の選択は使わない。会話キーは "p:<playerId>"／"grp:all"・"grp:<groupId>"／"opp:<teamId>"（スタッフだけ）
 */
interface PaneMemory {
  viewer: string;
  key: string | null;
  /** 開いたあとスクロールして光らせる吹き出し（ホームのお知らせ・通知から開いたとき）と、その指示の回数 */
  focusId?: string | null;
  focusN?: number;
}

/**
 * 直近に開いていた会話（画面を離れて戻ったときの復元用）。
 * 添付の戦術/練習を開くと別画面へ遷移するため、モジュールスコープで持たないと戻るたびに選び直すことになる。
 * 持つのは「どの会話か」だけ。引用（replyTo）・光らせる吹き出しは一度だけ使う値なので入れない。
 * ログアウト・「選手として閲覧」の切替をまたいでも残るので、視点（viewer）が違えば捨てる
 */
let lastPane: PaneMemory | null = null;

/**
 * チャット画面（board.screen === "chat"）。1 画面（home-chat-groups-roster §2-1）。
 * - スマホ：<ChatHome />（グループ／選手・保護者／相手チーム）。行を押すとスレッドのシート（SheetManager の ChatSheet）
 * - PC：左 320px＝一覧｜右＝スレッド（2 列）。何も選んでいなければ先頭のグループ（全員）を開く。
 *   選手・保護者の PC も同じ枠（自分が入っているグループとスタッフとの 1 対 1）
 */
export default function ChatScreen() {
  const board = useBoard();
  const team = useTeam();
  const { teams: oppTeams } = useMatchups();
  const isStaff = team.viewer.role === "coach";
  const memberId = isStaff ? null : team.viewer.memberPlayerId ?? board.auth.playerId ?? null;
  const me = memberId ? board.state.players.find((p) => p.id === memberId) ?? null : null;
  const pc = useMedia(PC_MQ);
  const headerAction = useChatHeaderAction(isStaff && board.auth.role === "coach");

  // 視点（閲覧者）の同一性。role／memberPlayerId／ログインが変わったら、前の視点で開いていたペインは使わない
  const viewerKey = [team.viewer.role, team.viewer.memberPlayerId ?? "", board.auth.role, board.auth.playerId ?? "", board.auth.name].join("|");

  // ChatScreen はクライアント側の画面遷移でのみマウントされる（プリレンダーはホームのみ）
  const [paneState, setPaneState] = useState<PaneMemory>(() =>
    typeof window !== "undefined" && window.matchMedia(PC_MQ).matches && lastPane && lastPane.viewer === viewerKey
      ? { viewer: lastPane.viewer, key: lastPane.key }
      : { viewer: viewerKey, key: null }
  );
  const pane: PaneMemory = paneState.viewer === viewerKey ? paneState : { viewer: viewerKey, key: null };
  const setPane = (patch: Partial<Omit<PaneMemory, "viewer">>) =>
    setPaneState((prev) => ({
      ...(prev.viewer === viewerKey ? prev : { viewer: viewerKey, key: null }),
      ...patch,
      viewer: viewerKey,
    }));
  // PC のときだけ復元用に控える（スマホは選択を持たない）
  useEffect(() => {
    if (pc) lastPane = { viewer: viewerKey, key: pane.key };
  }, [pc, viewerKey, pane.key]);

  // 引用（DM に一度だけ付ける値）。送信・取り消し（ChatThread の onReplyConsumed）で外す。画面を離れると捨てる
  const [pendingReply, setPendingReply] = useState<{ key: string; replyTo: ChatReplyTo } | null>(null);

  const openThread = (key: string, opts?: { replyTo?: ChatReplyTo; messageId?: string }) => {
    setPane({ key, focusId: opts?.messageId ?? null, focusN: (pane.focusN ?? 0) + (opts?.messageId ? 1 : 0) });
    // 別の会話へ移ったら引用は持ち越さない
    setPendingReply((cur) => (opts?.replyTo ? { key, replyTo: opts.replyTo } : cur && cur.key === key ? cur : null));
  };

  // PC では、他画面・新しいメッセージのシート・ホームのお知らせから開かれたスレッドも右のペインへ引き継ぐ
  // （放置するとシートとペインが二重表示になる。ブレークポイントを跨いだ場合もここで拾う）
  useEffect(() => {
    if (!pc) return;
    const sh = board.sheet;
    if (sh.type !== "chat" || !sh.chatTo) return;
    const to = sh.chatTo === "team" ? ALL_THREAD_KEY : sh.chatTo;
    if (to.startsWith("p:") || isGroupKey(to) || (isOppKey(to) && isStaff)) {
      openThread(to, { replyTo: sh.replyTo, messageId: sh.messageId });
      board.closeSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, board.sheet]);

  // 実際に右へ出す会話。選んだ会話が今の視点で開けるものでなければ使わず、何も選んでいなければ先頭のグループ（全員）
  const visibleKeys = useMemo(() => {
    if (isStaff) return null; // スタッフは何でも（存在確認は下で）
    return new Set([dmThreadKey(memberId ?? ""), ...playerGroupKeys(me, team.groups)]);
  }, [isStaff, memberId, me, team.groups]);
  const valid = (k: string | null): k is string => {
    if (!k) return false;
    if (!isStaff) return !!visibleKeys?.has(k);
    if (isGroupKey(k)) return !!groupThreadInfo(k, team.groups);
    if (isOppKey(k)) return oppTeams.some((t) => `opp:${t.id}` === k);
    return k.startsWith("p:") && board.state.players.some((p) => dmThreadKey(p.id) === k);
  };
  const threadKey = pc ? (valid(pane.key) ? pane.key : ALL_THREAD_KEY) : null;

  const players = board.state.players;
  const groupInfo = threadKey && isGroupKey(threadKey) ? groupThreadInfo(threadKey, team.groups) : null;
  const oppDm = threadKey && isStaff && isOppKey(threadKey) ? threadKey : null;
  const oppTeam = oppDm ? oppTeams.find((t) => `opp:${t.id}` === oppDm) ?? null : null;
  const selPlayer = threadKey && isStaff && threadKey.startsWith("p:") ? players.find((p) => dmThreadKey(p.id) === threadKey) ?? null : null;
  const memberCount = groupInfo ? threadMembers(groupInfo.key, players, team.groups).length : 0;

  return (
    <div className="app chatapp">
      {pc ? (
        <header>
          <div className="brand">
            <div className="logo">チャット</div>
          </div>
        </header>
      ) : (
        // mobile-redesign §1-6: 下部タブ「チャット」の直下画面のため戻るは出さない。
        // 右アクションはスタッフの「新しいメッセージ」
        <MobileHeader
          title="チャット"
          actions={
            headerAction && (
              <MobileHeaderAction primary label={headerAction.label} onClick={headerAction.onClick}>
                <IconPlus />
              </MobileHeaderAction>
            )
          }
        />
      )}

      {/* paddingは基底CSS(.chatapp .scroll)へ移設（PCで上書きできるように） */}
      <div className="scroll">
        <ChatHome
          pc={pc}
          showCompose={pc && isStaff && board.auth.role === "coach"}
          onOpen={pc ? (k) => openThread(k) : undefined}
          selectedKey={threadKey}
        />
      </div>

      {/* PC専用の第2ペイン。モバイルでは描画しない（隠れた ChatThread の二重マウントと既読の誤更新を防ぐ） */}
      {pc && threadKey && (
        <div className="chatmain">
          <div className="chattab" style={{ flex: 1 }}>
            {/* どの会話を開いているかを常に明示する(取り違え送信を防ぐ) */}
            <div className="chatpanehead">
              {groupInfo ? (
                <>
                  <span className="convdotbox" aria-hidden="true">
                    <i className="convdot" style={{ background: groupInfo.color }} />
                  </span>
                  <span className="chatpanename">{groupInfo.label}</span>
                  <span className="chatpaneall">{memberCount}人</span>
                </>
              ) : (
                <>
                  <div className="convavatar">
                    {oppDm ? "対" : isStaff ? Array.from(selPlayer?.name ?? "?")[0] : "ス"}
                  </div>
                  {/* ux-fix R2-7: スタッフは選手名を押すと個人ページへ（右の「ノート」はその選手の提出一覧へ） */}
                  {isStaff && selPlayer ? (
                    <button
                      type="button"
                      className="chatpanename chatpanelink"
                      aria-label={`${selPlayer.name}の個人ページを開く`}
                      onClick={() => {
                        board.setTeamIntent({ tab: "ros", playerId: selPlayer.id });
                        board.setScreen("team");
                      }}
                    >
                      {selPlayer.name} <span aria-hidden="true">›</span>
                    </button>
                  ) : (
                    <span className="chatpanename">
                      {oppDm ? oppTeam?.name ?? "相手チーム" : isStaff ? selPlayer?.name ?? "メッセージ" : "スタッフ"}
                    </span>
                  )}
                  {oppDm && <span className="chatpaneall">対戦相手</span>}
                  {isStaff && selPlayer && groupsOfPlayer(selPlayer, team.groups).length > 0 && (
                    <span className="chatpaneall">
                      {groupsOfPlayer(selPlayer, team.groups)
                        .map((g) => g.label)
                        .join("・")}
                    </span>
                  )}
                  {isStaff && selPlayer && (
                    <button
                      type="button"
                      className="st-btn ghost chatpanenote"
                      onClick={() => {
                        board.setNoteIntent({ playerId: selPlayer.id });
                        board.setScreen("notebook");
                      }}
                    >
                      ノート
                    </button>
                  )}
                </>
              )}
            </div>
            {/* key は会話だけ。引用を外したこと（onReplyConsumed）で作り直しが起きないようにする。
                開いたままのスレッドへ新しい引用が来たときは ChatThread が prop の変化で取り込む */}
            <ChatThread
              key={`${threadKey}:${pane.focusN ?? 0}`}
              to={threadKey}
              as={isStaff ? undefined : { role: "member", playerId: memberId }}
              replyTo={pendingReply && pendingReply.key === threadKey ? pendingReply.replyTo : undefined}
              onReplyConsumed={() => setPendingReply(null)}
              focusId={pane.focusId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
