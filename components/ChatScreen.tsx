"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatReplyTo } from "@/lib/types";
import { dmThreadKey } from "@/lib/types";
import { isOppKey, visibleAnnouncements } from "@/lib/chat";
import { groupsOfPlayer } from "@/lib/groups";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import ChatHome, { AnnReadPanel, AnnouncementDetail, useChatHeaderAction, useChatSeg } from "./ChatHome";
import ChatThread from "./ChatThread";
import { useMatchups } from "./matchup/MatchupProvider";
import { IconPlus } from "./icons";
import { MobileHeader, MobileHeaderAction } from "./MobileHeader";

const PC_MQ = "(min-width: 1024px)";
/**
 * 既読パネルを右の第 3 列に出す幅（chat-plan-a §3-6）。レール 208 + 左 320 + 右 280 を引いても
 * 中の列が 440px 以上残る幅。これより狭い PC 幅では、既読パネルは詳細の下に続けて出す（列は増やさない）
 */
const READ_COL_MQ = "(min-width: 1280px)";

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
 * PC の中のペインの選択。お知らせ用（annId）と 1 対 1 用（dmPid）を別々に持ち、どちらを出すかは
 * 左のセグメントで決める。1 つの選択にすると、お知らせを開いたときに開いていた 1 対 1 が上書きされて
 * 「メッセージ」へ戻っても消えている（chat-plan-a §3-6）。
 * viewer は選択した視点。視点（スタッフ／選手・保護者）が変わったら別の視点の選択は使わない。
 * dmPid は選手の id か、相手チームとの会話キー（"opp:<teamId>"。matchup-demo §5。スタッフだけ）
 */
interface PaneMemory {
  viewer: string;
  annId: string | null;
  dmPid: string | null;
}

/**
 * 直近に開いていたペイン（画面を離れて戻ったときの復元用）。
 * 添付の戦術/練習を開くと別画面へ遷移するため、モジュールスコープで持たないと
 * 戻るたびに選び直すことになる。
 * 持つのは「どのお知らせ／どの選手」だけ。引用（replyTo）は一度だけ使う値なので入れない
 * （入れると、送信したあと画面を戻ったときに引用バーが復活して関係ない発言に付く）。
 * ログアウト・「選手として閲覧」の切替をまたいでも残るので、視点（viewer）が違えば捨てる
 */
let lastPane: PaneMemory | null = null;

/**
 * チャット画面（board.screen === "chat"）。
 * - スマホ：<ChatHome />（お知らせ｜メッセージ）。ヘッダー右はセグメントに連動（chat-plan-a §3-5）
 * - PC（chat-plan-a §3-6）：左 320px＝セグメント＋一覧｜中＝お知らせの詳細 or 1 対 1｜右 280px＝既読パネル
 *   （スタッフがお知らせを開いたときだけ）。選手・保護者の PC も同じ枠で、メッセージを選んだら中に
 *   スタッフとの 1 対 1 をそのまま出す
 */
export default function ChatScreen() {
  const board = useBoard();
  const team = useTeam();
  const { teams: oppTeams } = useMatchups();
  const isStaff = team.viewer.role === "coach";
  const memberId = isStaff ? null : team.viewer.memberPlayerId ?? board.auth.playerId ?? null;
  const me = memberId ? board.state.players.find((p) => p.id === memberId) ?? null : null;
  const pc = useMedia(PC_MQ);
  const wide = useMedia(READ_COL_MQ);
  const [seg, setSeg] = useChatSeg();
  const headerAction = useChatHeaderAction(isStaff && board.auth.role === "coach");

  // 視点（閲覧者）の同一性。role／memberPlayerId／ログインが変わったら、前の視点で開いていたペインは使わない
  const viewerKey = [team.viewer.role, team.viewer.memberPlayerId ?? "", board.auth.role, board.auth.playerId ?? "", board.auth.name].join("|");

  // ChatScreen はクライアント側の画面遷移でのみマウントされる（プリレンダーはホームのみ）
  const [paneState, setPaneState] = useState<PaneMemory>(() =>
    typeof window !== "undefined" && window.matchMedia(PC_MQ).matches && lastPane && lastPane.viewer === viewerKey
      ? lastPane
      : { viewer: viewerKey, annId: null, dmPid: null }
  );
  const pane: PaneMemory = paneState.viewer === viewerKey ? paneState : { viewer: viewerKey, annId: null, dmPid: null };
  const setPane = (patch: Partial<Omit<PaneMemory, "viewer">>) =>
    setPaneState((prev) => ({
      ...(prev.viewer === viewerKey ? prev : { viewer: viewerKey, annId: null, dmPid: null }),
      ...patch,
      viewer: viewerKey,
    }));
  // PC のときだけ復元用に控える（スマホは選択を持たない）
  useEffect(() => {
    if (pc) lastPane = { viewer: viewerKey, annId: pane.annId, dmPid: pane.dmPid };
  }, [pc, viewerKey, pane.annId, pane.dmPid]);

  // 「スタッフに返信」の引用。1 対 1 に一度だけ付ける値で、送信・取り消し（ChatThread の onReplyConsumed）で外す。
  // 画面を離れると捨てる（lastPane には入れない）
  const [pendingReply, setPendingReply] = useState<{ pid: string; replyTo: ChatReplyTo } | null>(null);

  // 開いたものに合わせて左のセグメントも切り替える（お知らせの「スタッフに返信」で 1 対 1 が開くとき、
  // 他画面から 1 対 1 が引き継がれるとき、左の一覧と中のペインが食い違わないように）
  const openAnn = (id: string) => {
    setPane({ annId: id });
    setSeg("ann");
  };
  const openDm = (pid: string, replyTo?: ChatReplyTo) => {
    setPane({ dmPid: pid });
    // 別の会話へ移ったら引用は持ち越さない
    setPendingReply((cur) => (replyTo ? { pid, replyTo } : cur && cur.pid === pid ? cur : null));
    setSeg("msg");
  };

  // PC では、他画面・新しいメッセージのシートから開かれた 1 対 1／お知らせの詳細もペインへ引き継ぐ
  // （放置するとシートとペインが二重表示になる。ブレークポイントを跨いだ場合もここで拾う）
  useEffect(() => {
    if (!pc) return;
    const sh = board.sheet;
    if (sh.type === "chat" && sh.chatTo?.startsWith("p:")) {
      openDm(sh.chatTo.slice(2), sh.replyTo);
      board.closeSheet();
    } else if (sh.type === "chat" && sh.chatTo && isOppKey(sh.chatTo) && isStaff) {
      // 相手チームとの会話（練習試合の承諾後など）。選手・保護者には開かない
      openDm(sh.chatTo);
      board.closeSheet();
    } else if (sh.type === "annDetail" && sh.annId) {
      openAnn(sh.annId);
      board.closeSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, board.sheet]);

  // 実際に中へ出すペイン。左のセグメントが決める（お知らせ＝詳細、メッセージ＝1 対 1）。
  // 選手・保護者は一覧から選ぶ手間をなくし、メッセージを選んだら 1 対 1 を直接出す。
  // お知らせは自分宛て（visibleAnnouncements）だけ。前の視点や他の画面で開いた宛先外のものは出さない
  const visibleAnns = useMemo(
    () => visibleAnnouncements(team.team.announcements, isStaff, me, team.groups),
    [team.team.announcements, isStaff, me, team.groups]
  );
  const annId = seg === "ann" && pane.annId && visibleAnns.some((a) => a.id === pane.annId) ? pane.annId : null;
  // 相手チームとの会話キーはスタッフだけ（選手・保護者の視点では使わない）
  const paneDm = pane.dmPid && isOppKey(pane.dmPid) && !isStaff ? null : pane.dmPid;
  const dmPid = seg === "msg" ? memberId ?? paneDm : null;
  const oppDm = dmPid && isStaff && isOppKey(dmPid) ? dmPid : null;
  const oppTeam = oppDm ? oppTeams.find((t) => `opp:${t.id}` === oppDm) ?? null : null;

  const players = board.state.players;
  const selPlayer = dmPid && !oppDm ? players.find((p) => p.id === dmPid) ?? null : null;
  const selAnn = annId ? team.team.announcements.find((a) => a.id === annId) ?? null : null;
  // 既読パネルはスタッフがお知らせを開いたときだけ、右の第 3 列に出す（狭い PC 幅では詳細の下に続ける）
  const readCol = pc && wide && isStaff && !!selAnn;

  return (
    <div className="app chatapp">
      {pc ? (
        <header>
          <div className="brand">
            <div className="logo">チャット</div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {board.state.teamName ?? "マイチーム"}
            </div>
          </div>
        </header>
      ) : (
        // mobile-redesign §1-6: 下部タブ「チャット」の直下画面のため戻るは出さない。
        // 右アクションは「お知らせ｜メッセージ」の選択に連動（スタッフだけ。§3-5）
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
          onOpenAnn={pc ? openAnn : undefined}
          onOpenDm={pc ? (pid) => openDm(pid) : undefined}
          selectedAnnId={annId}
          selectedDm={dmPid}
        />
      </div>

      {/* PC専用の第2ペイン。モバイルでは描画しない（隠れた ChatThread の二重マウントと既読の誤更新を防ぐ） */}
      {pc && (
        <div className="chatmain">
          {annId ? (
            <div className="chatpanescroll">
              <AnnouncementDetail
                key={annId}
                annId={annId}
                readPanel={!readCol}
                onClose={() => setPane({ annId: null })}
                onReply={memberId ? (q) => openDm(memberId, q) : undefined}
              />
            </div>
          ) : dmPid ? (
            <div className="chattab" style={{ flex: 1 }}>
              {/* どの会話を開いているかを常に明示する(個人への取り違え送信を防ぐ) */}
              <div className="chatpanehead">
                <div className="convavatar">
                  {oppDm ? "対" : isStaff ? Array.from(selPlayer?.name ?? "?")[0] : "ス"}
                </div>
                <span className="chatpanename">
                  {oppDm ? oppTeam?.name ?? "相手チーム" : isStaff ? selPlayer?.name ?? "メッセージ" : "スタッフ"}
                </span>
                {oppDm && <span className="chatpaneall">対戦相手</span>}
                {isStaff && selPlayer && groupsOfPlayer(selPlayer, team.groups).length > 0 && (
                  <span className="chatpaneall">
                    {groupsOfPlayer(selPlayer, team.groups)
                      .map((g) => g.label)
                      .join("・")}
                  </span>
                )}
              </div>
              {/* key は会話（pid）だけ。引用を外したこと（onReplyConsumed）で作り直しが起きないようにする。
                  開いたままのスレッドへ新しい引用が来たときは ChatThread が prop の変化で取り込む */}
              <ChatThread
                key={dmPid}
                to={oppDm ? oppDm : isStaff ? dmThreadKey(dmPid) : memberId ? dmThreadKey(memberId) : dmThreadKey(dmPid)}
                as={isStaff ? undefined : { role: "member", playerId: memberId }}
                replyTo={pendingReply && pendingReply.pid === dmPid ? pendingReply.replyTo : undefined}
                onReplyConsumed={() => setPendingReply(null)}
                onOpenAnn={openAnn}
              />
            </div>
          ) : (
            <div className="chatempty">
              {seg === "ann" ? "左の一覧からお知らせを選んでください" : "左の一覧から会話を選んでください"}
            </div>
          )}
        </div>
      )}

      {/* 右の既読パネル（スタッフがお知らせを開いたときだけ。chat-plan-a §3-6）。
          key で開くお知らせごとに作り直し、タブを既定の「未読」へ戻す */}
      {readCol && selAnn && (
        <aside className="chatreadcol" aria-label="既読の状況">
          <div className="chatreadhead">既読の状況</div>
          <div className="chatreadscroll">
            <AnnReadPanel key={selAnn.id} a={selAnn} />
          </div>
        </aside>
      )}
    </div>
  );
}
