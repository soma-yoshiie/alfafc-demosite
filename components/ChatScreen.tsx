"use client";

import { useEffect, useState } from "react";
import { dmThreadKey } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import ChatThread from "./ChatThread";
import { E } from "./Emoji";
import { MobileHeader } from "./MobileHeader";

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
 * 直近に開いていたスレッド（画面を離れて戻ったときの復元用）。
 * 添付の戦術/練習を開くと別画面へ遷移するため、モジュールスコープで持たないと
 * 戻るたびに会話を選び直すことになる。
 */
let lastCoachThread: string | null = null;

export default function ChatScreen() {
  const board = useBoard();
  const isCoach = board.auth.role === "coach";
  // PCでは前回のスレッド（無ければチーム全員）を初期選択。モバイルは常に null。
  // ChatScreen はクライアント側の画面遷移でのみマウントされる（プリレンダーはホームのみ）
  const [selected, setSelectedState] = useState<string | null>(() => {
    if (typeof window === "undefined" || !window.matchMedia(PC_MQ).matches) return null;
    return lastCoachThread ?? "team";
  });
  const setSelected = (to: string | null) => {
    if (to) lastCoachThread = to;
    setSelectedState(to);
  };

  // ブレークポイントを跨いだときの整合:
  // - PC→モバイル: 選択を捨てる(隠れた ChatThread の二重マウントとスクロール停滞を防ぐ)
  // - モバイル→PC: シートで開いていた会話をインラインへ引き継いでシートを閉じる
  //   (放置するとシートとマスター・ディテールが二重表示になる)
  useEffect(() => {
    if (!isCoach) return;
    const mql = window.matchMedia(PC_MQ);
    const sync = () => {
      if (mql.matches) {
        const sheet = board.sheet;
        if (sheet.type === "chat") {
          setSelectedState(sheet.chatTo ?? lastCoachThread ?? "team");
          if (sheet.chatTo) lastCoachThread = sheet.chatTo;
          board.closeSheet();
        } else {
          setSelectedState((cur) => cur ?? lastCoachThread ?? "team");
        }
      } else {
        setSelectedState(null);
      }
    };
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach, board.sheet]);

  // イベント非依存の保険: チャットシートが開いた（=モバイル経路が使われた）ときは
  // インライン選択を解除する。MQLのchangeが取りこぼされた環境でも、
  // 隠れたChatThreadとシートの二重マウントだけは確実に防ぐ
  useEffect(() => {
    if (isCoach && board.sheet.type === "chat") setSelectedState(null);
  }, [isCoach, board.sheet]);

  const players = board.state.players;
  const threadTitle = (to: string): string =>
    to === "team" ? "チーム全員" : players.find((p) => dmThreadKey(p.id) === to)?.name ?? "会話";
  // 戻りラベル: 押下先は常にホームのため、PCでは「‹ ホーム」に(モバイルは「‹ メニュー」のまま)
  const pc = usePc();

  return (
    <div className="app chatapp">
      {pc ? (
        <header>
          <div className="fpback" onClick={() => board.setScreen("home")}>
            ‹ ホーム
          </div>
          <div className="brand" style={{ marginLeft: 4 }}>
            <div className="logo">チャット</div>
            <div className="tag team" style={{ marginTop: 4 }}>
              {board.state.teamName ?? "マイチーム"}
            </div>
          </div>
        </header>
      ) : (
        // mobile-redesign §1-6: 下部タブ「チャット」の直下画面のため戻るは出さない
        <MobileHeader title="チャット" />
      )}

      {/* paddingは基底CSS(.chatapp .scroll / .pchat)へ移設（PCで上書きできるように） */}
      {isCoach ? (
        <>
          <div className="scroll">
            <CoachConversations selected={selected} onSelect={setSelected} />
          </div>
          {/* PC専用の第2ペイン(スレッド本文)。モバイルでは selected が常に null のためマウントされない */}
          <div className="chatmain">
            {selected ? (
              <div className="chattab" style={{ flex: 1 }}>
                {/* どの会話を開いているかを常に明示する(個人DMへの取り違え送信を防ぐ) */}
                <div className="chatpanehead">
                  <div className="convavatar">
                    {selected === "team" ? <E n="users" /> : threadTitle(selected).slice(0, 1)}
                  </div>
                  <span className="chatpanename">{threadTitle(selected)}</span>
                  {selected === "team" && <span className="chatpaneall">全員</span>}
                </div>
                <ChatThread to={selected} />
              </div>
            ) : (
              <div className="chatempty">会話を選んでください</div>
            )}
          </div>
        </>
      ) : (
        <div className="scroll pchat">
          <PlayerChat />
        </div>
      )}
    </div>
  );
}

/** TeamHub.tsx のチャットタブ本体としてもそのまま使う（mobile-redesign-v2 §3-2） */
export function CoachConversations({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (to: string) => void;
}) {
  const board = useBoard();
  const players = board.state.players;

  const preview = (key: string): { text: string; ts: number | null } => {
    const list = board.messages.filter((m) => m.to === key).sort((a, b) => b.ts - a.ts);
    const m = list[0];
    if (!m) return { text: "メッセージはまだありません", ts: null };
    let t = m.text ?? "";
    if (!t && m.attachments?.length) {
      const a = m.attachments[0];
      t =
        a.kind === "play"
          ? `戦術「${a.title ?? ""}」`
          : a.kind === "drill"
          ? `トレーニング「${a.title ?? ""}」`
          : a.kind === "setpiece"
          ? `セットプレー「${a.title ?? ""}」`
          : a.kind === "image"
          ? "画像"
          : "動画";
    }
    return { text: t, ts: m.ts };
  };

  const Row = ({ title, team, to }: { title: string; team?: boolean; to: string }) => {
    const pv = preview(to);
    const onClick = () => {
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
        onSelect(to);
      } else {
        board.openSheet({ type: "chat", chatTo: to });
      }
    };
    return (
      <button
        className={`convrow${selected === to ? " sel" : ""}`}
        aria-current={selected === to ? "true" : undefined}
        onClick={onClick}
      >
        <div className="convavatar">{team ? <E n="users" /> : title.slice(0, 1)}</div>
        <div className="convmain">
          <div className="convtop">
            <span className="convname">{title}</span>
            {pv.ts && (
              <span className="convdate">
                {new Date(pv.ts).toLocaleString("ja-JP", { month: "numeric", day: "numeric" })}
              </span>
            )}
          </div>
          <div className="convprev">{pv.text}</div>
        </div>
        <span className="convchev">›</span>
      </button>
    );
  };

  return (
    <div className="convlist">
      <Row title="チーム全員" team to="team" />
      {players.map((p) => (
        <Row key={p.id} title={p.name} to={dmThreadKey(p.id)} />
      ))}
    </div>
  );
}

/** TeamHub.tsx のチャットタブ本体としてもそのまま使う（mobile-redesign-v2 §3-2）。
 * Phase D-1(C2 major): playerId省略時は従来どおりboard.auth.playerId(ログイン本人)。
 * TeamHub.ChatTab はコーチが選手プレビュー中(isCoach=false、board.auth.playerIdはnull)
 * にもこれを描画するため、その閲覧対象(team.viewer.memberPlayerId)を明示的に渡せるようにする */
export function PlayerChat({ playerId }: { playerId?: string | null } = {}) {
  const board = useBoard();
  const memberId = (playerId !== undefined ? playerId : board.auth.playerId) ?? null;
  const myKey = memberId ? dmThreadKey(memberId) : "team";
  return (
    <div className="chattab" style={{ flex: 1 }}>
      <ChatThread to={myKey} as={{ role: "member", playerId: memberId }} />
    </div>
  );
}
