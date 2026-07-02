"use client";

import { dmThreadKey } from "@/lib/types";
import { useBoard } from "./BoardProvider";
import ChatThread from "./ChatThread";
import { E } from "./Emoji";

export default function ChatScreen() {
  const board = useBoard();
  const isCoach = board.auth.role === "coach";

  return (
    <div className="app chatapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ メニュー
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">
            CHAT<b> ルーム</b>
          </div>
          <div className="tag team" style={{ marginTop: 4 }}>
            {board.state.teamName ?? "マイチーム"}
          </div>
        </div>
      </header>

      {isCoach ? (
        <div className="scroll" style={{ padding: "0 14px calc(env(safe-area-inset-bottom) + 24px)" }}>
          <CoachConversations />
        </div>
      ) : (
        <div className="scroll" style={{ padding: "0 14px calc(env(safe-area-inset-bottom) + 8px)", display: "flex" }}>
          <PlayerChat />
        </div>
      )}
    </div>
  );
}

function CoachConversations() {
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
          : a.kind === "image"
          ? "画像"
          : "動画";
    }
    return { text: t, ts: m.ts };
  };

  const Row = ({ title, team, to }: { title: string; team?: boolean; to: string }) => {
    const pv = preview(to);
    return (
      <button className="convrow" onClick={() => board.openSheet({ type: "chat", chatTo: to })}>
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

function PlayerChat() {
  const board = useBoard();
  const memberId = board.auth.playerId ?? null;
  const myKey = memberId ? dmThreadKey(memberId) : "team";
  return (
    <div className="chattab" style={{ flex: 1 }}>
      <ChatThread to={myKey} as={{ role: "member", playerId: memberId }} />
    </div>
  );
}
