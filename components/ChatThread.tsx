"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment } from "@/lib/types";
import { dmThreadKey, groupThreadKey, threadGroupId } from "@/lib/types";
import { loadDrills } from "@/lib/storage";
import { fileToAttachment } from "@/lib/media";
import { groupsOfPlayer } from "@/lib/groups";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { E } from "./Emoji";
import { IconSend } from "./icons";

/**
 * 1つの会話（チーム全員 or 個人DM）を表示するチャット。
 * - スタッフ: `to` の会話をそのまま表示・送信
 * - 選手: 自分のDM(`to`)＋チーム全員の連絡を一つのタイムラインで表示。送信は常にスタッフ宛DM
 */
export default function ChatThread({
  to,
  as,
}: {
  to: string;
  /** デモのロール切替プレビュー用に送受信者を上書き */
  as?: { role: "coach" | "member"; playerId: string | null };
}) {
  const board = useBoard();
  const team = useTeam();
  const isCoach = as ? as.role === "coach" : board.auth.role === "coach";
  const myPlayerId = as ? as.playerId : board.auth.playerId ?? null;
  const myDm = myPlayerId ? dmThreadKey(myPlayerId) : null;
  const me = myPlayerId ? board.state.players.find((p) => p.id === myPlayerId) ?? null : null;
  // groups-phase2 §5-1: 選手のタイムラインに合流させる所属グループ。所属は毎回 playerInGroup
  // （groupsOfPlayer内部で使用）で評価するため、外れた選手には過去分も自然に見えなくなる
  const myGroups = me ? groupsOfPlayer(me, team.groups) : [];

  const [text, setText] = useState("");
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [picker, setPicker] = useState<"play" | "drill" | "setpiece" | null>(null);
  const imgInput = useRef<HTMLInputElement | null>(null);
  const vidInput = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const msgs = useMemo(() => {
    if (isCoach) {
      return [...board.messages.filter((m) => m.to === to)].sort((a, b) => a.ts - b.ts);
    }
    // グループが削除済みならmyGroupsに現れないため、そのグループ宛の過去メッセージも
    // ここで自然に対象外になる（groups-phase2 §5-1「誰にも表示しない」）
    const myGroupKeys = new Set(myGroups.map((g) => groupThreadKey(g.id)));
    const list = board.messages.filter(
      (m) => m.to === "team" || m.to === myDm || myGroupKeys.has(m.to)
    );
    return [...list].sort((a, b) => a.ts - b.ts);
  }, [board.messages, isCoach, to, myDm, myGroups]);

  /** グループ宛の会話キーならグループ名を返す（グループが無ければnull） */
  const groupLabelOf = (key: string): string | null => {
    const gid = threadGroupId(key);
    if (!gid) return null;
    return team.groups.find((g) => g.id === gid)?.label ?? null;
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const drills = useMemo(() => (picker === "drill" ? loadDrills() : []), [picker]);

  const isMine = (from: string) =>
    isCoach ? from === "coach" : from === myDm;

  async function onFile(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const res = await fileToAttachment(file);
    if (typeof res === "string") {
      board.toast(res);
      return;
    }
    setPending((p) => [...p, { kind: res.kind, dataUrl: res.dataUrl, title: res.title }]);
    setAttachOpen(false);
  }

  function send() {
    if (!text.trim() && pending.length === 0) return;
    const from = isCoach ? "coach" : myDm ?? "";
    const sendTo = isCoach ? to : myDm ?? "";
    if (!sendTo) return;
    const memberName =
      board.state.players.find((p) => p.id === myPlayerId)?.name ??
      board.auth.name;
    board.sendMessage({
      to: sendTo,
      from,
      fromName: isCoach ? "スタッフ" : memberName,
      text: text.trim() || undefined,
      attachments: pending.length ? pending : undefined,
    });
    setText("");
    setPending([]);
    setAttachOpen(false);
  }

  // groups-phase2 §5-1: 選手・保護者のタイムライン上部の説明文（所属グループ名を並べる）
  const scopeHint =
    myGroups.length > 0
      ? `チーム全員・${myGroups.map((g) => g.label).join("・")}宛てと、スタッフとの個別メッセージが表示されます`
      : "チーム全員宛てと、スタッフとの個別メッセージが表示されます";

  return (
    <div className="chatwrap">
      {!isCoach && <div className="chatscopehint">{scopeHint}</div>}
      <div className="chatscroll">
        {msgs.length === 0 ? (
          <div className="empty-msg">メッセージはまだありません。</div>
        ) : (
          msgs.map((m) => {
            const groupLabel = groupLabelOf(m.to);
            return (
            <div key={m.id} className={`chatrow${isMine(m.from) ? " mine" : ""}`}>
              <div className="chatbubble">
                {!isMine(m.from) && (
                  <div className="chatname">{m.fromName ?? (m.from === "coach" ? "スタッフ" : "選手")}</div>
                )}
                {m.text && <div className="chattext">{m.text}</div>}
                {m.attachments?.map((a, i) => (
                  <AttachmentView key={i} att={a} />
                ))}
                <div className="chatmeta">
                  {m.to === "team" && <span className="chatbadge">全員</span>}
                  {groupLabel && <span className="chatbadge">{groupLabel}</span>}
                  <span className="chatdate">
                    {new Date(m.ts).toLocaleString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {isCoach && (
                    <button className="chatdel" onClick={() => board.removeMessage(m.id)}>
                      <E n="trash" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* 添付プレビュー */}
      {pending.length > 0 && (
        <div className="chatpending">
          {pending.map((a, i) => (
            <div key={i} className="chatchip">
              <span>
                {a.kind === "play" && <E n="clipboard" />}
                {a.kind === "drill" && <E n="run" />}
                {a.kind === "setpiece" && <E n="target" />}
                {a.kind === "image" && <E n="image" />}
                {a.kind === "video" && <E n="video" />}{" "}
                {a.title ?? a.kind}
              </span>
              <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* 添付メニュー */}
      {attachOpen && (
        <div className="chatattach">
          <button onClick={() => imgInput.current?.click()}><E n="image" /> 画像</button>
          <button onClick={() => vidInput.current?.click()}><E n="video" /> 動画</button>
          {isCoach && (
            <>
              <button onClick={() => setPicker("play")}><E n="clipboard" /> 戦術</button>
              <button onClick={() => setPicker("drill")}><E n="run" /> トレーニング</button>
              <button onClick={() => setPicker("setpiece")}><E n="target" /> セットプレー</button>
            </>
          )}
        </div>
      )}

      {/* 戦術/トレーニングのピッカー */}
      {picker === "play" && (
        <div className="chatpicker">
          <div className="chatpicker-h">
            戦術を選ぶ
            <button onClick={() => setPicker(null)}>×</button>
          </div>
          {board.library.plays.length === 0 ? (
            <div className="empty-msg">保存した戦術がありません。</div>
          ) : (
            board.library.plays.map((p) => (
              <button
                key={p.id}
                className="chatpick"
                onClick={() => {
                  setPending((cur) => [...cur, { kind: "play", title: p.title, play: p }]);
                  setPicker(null);
                  setAttachOpen(false);
                }}
              >
                <E n="clipboard" /> {p.title}
                <span>{p.formation} ・ {p.moves.length}本</span>
              </button>
            ))
          )}
        </div>
      )}
      {picker === "drill" && (
        <div className="chatpicker">
          <div className="chatpicker-h">
            トレーニングを選ぶ
            <button onClick={() => setPicker(null)}>×</button>
          </div>
          {drills.length === 0 ? (
            <div className="empty-msg">保存した練習メニューがありません。</div>
          ) : (
            drills.map((d) => (
              <button
                key={d.id}
                className="chatpick"
                onClick={() => {
                  setPending((cur) => [...cur, { kind: "drill", title: d.title, drill: d }]);
                  setPicker(null);
                  setAttachOpen(false);
                }}
              >
                <E n="run" /> {d.title}
                <span>{d.items.length}個の配置 ・ {d.lines.length}本の動線</span>
              </button>
            ))
          )}
        </div>
      )}
      {picker === "setpiece" && (
        <div className="chatpicker">
          <div className="chatpicker-h">
            セットプレーを選ぶ
            <button onClick={() => setPicker(null)}>×</button>
          </div>
          {(board.library.setPieces ?? []).length === 0 ? (
            <div className="empty-msg">保存したセットプレーがありません。</div>
          ) : (
            board.library.setPieces!.map((p) => (
              <button
                key={p.id}
                className="chatpick"
                onClick={() => {
                  setPending((cur) => [...cur, { kind: "setpiece", title: p.title, setpiece: p }]);
                  setPicker(null);
                  setAttachOpen(false);
                }}
              >
                <E n="target" /> {p.title}
              </button>
            ))
          )}
        </div>
      )}

      {/* 入力欄 */}
      <div className="chatcompose">
        <button
          className={`chatplus${attachOpen ? " on" : ""}`}
          onClick={() => setAttachOpen((v) => !v)}
          aria-label="添付"
        >
          ＋
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="メッセージを入力"
        />
        <button className="chatsend" onClick={send} aria-label="送信">
          <IconSend />
        </button>
      </div>

      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        hidden
        onChange={onFile}
      />
      <input
        ref={vidInput}
        type="file"
        accept="video/*"
        hidden
        onChange={onFile}
      />
    </div>
  );
}

function AttachmentView({ att }: { att: ChatAttachment }) {
  const board = useBoard();
  if (att.kind === "image" && att.dataUrl) {
    return <img className="chatimg" src={att.dataUrl} alt={att.title ?? "画像"} />;
  }
  if (att.kind === "video" && att.dataUrl) {
    return <video className="chatvideo" src={att.dataUrl} controls playsInline />;
  }
  if (att.kind === "play" && att.play) {
    return (
      <button className="chatattcard" onClick={() => board.loadPlayData(att.play!)}>
        <E n="clipboard" /> 戦術「{att.title ?? att.play.title}」を見る
      </button>
    );
  }
  if (att.kind === "drill" && att.drill) {
    return (
      <button className="chatattcard" onClick={() => board.openDrillData(att.drill!)}>
        <E n="run" /> トレーニング「{att.title ?? att.drill.title}」を見る
      </button>
    );
  }
  if (att.kind === "setpiece" && att.setpiece) {
    return (
      <button className="chatattcard" onClick={() => board.loadSetPieceData(att.setpiece!)}>
        <E n="target" /> セットプレー「{att.title ?? att.setpiece.title}」を見る
      </button>
    );
  }
  return null;
}
