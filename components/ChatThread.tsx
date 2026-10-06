"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatAttachment, ChatMessage, ChatReplyTo } from "@/lib/types";
import { dmThreadKey } from "@/lib/types";
import { loadDrills } from "@/lib/storage";
import {
  attachmentLabel,
  fmtClock,
  fmtDayDivider,
  isSameDay,
  isOppKey,
  isSeenByOther,
  latestCounterpartTs,
  makeReplyTo,
  staffIdentity,
  STAFF_FALLBACK,
  type ChatSide,
} from "@/lib/chat";
import { fileToAttachment } from "@/lib/media";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useMatchups } from "./matchup/MatchupProvider";
import { E } from "./Emoji";
import { IconSend } from "./icons";

/** 同じ送信者の発言をまとめる間隔（chat-plan-a §3-4: 5 分以内・同じ日） */
const RUN_GAP_MS = 5 * 60_000;
/** 長押しでメニューを出すまでの時間（スマホ。chat-plan-a §3-4） */
const LONG_PRESS_MS = 500;
/** メニューを開いた直後の「指を離したときの click」でメニューが閉じないための猶予 */
const MENU_GUARD_MS = 350;
const MENU_W = 168;
const MENU_ROW_H = 44;
/** メニューの上下の余白＋枠（.chatmenu の padding 6px×2 と border 1px×2） */
const MENU_PAD = 14;
/** 対象の吹き出しとメニューの間 */
const MENU_GAP = 6;

/**
 * 書きかけの文（会話ごと）。PC の 2 ペインでお知らせへ切り替えたり画面を出入りしたりすると ChatThread が
 * 作り直され、useState の入力中の文が消える。モジュールに持って、作り直したときに戻す
 * （chat-plan-a §3-6。キーは視点＋会話。送信したら消す。添付は大きいので持たない）
 */
const drafts = new Map<string, string>();

type Sender = { name: string; role?: string };

/** 連続表示の判定に使う送信者の同一性（スタッフは fromName が違えば別の人として扱う） */
function senderKey(m: ChatMessage): string {
  return `${m.from}|${m.fromName ?? ""}`;
}
function sameRun(prev: ChatMessage, cur: ChatMessage): boolean {
  return senderKey(prev) === senderKey(cur) && cur.ts - prev.ts <= RUN_GAP_MS && isSameDay(prev.ts, cur.ts);
}

/** 引用・返信バーに出す本文（本文が無ければ添付の名前） */
function quoteTextOf(m: ChatMessage): string {
  if (m.text?.trim()) return m.text;
  const a = m.attachments?.[0];
  return a ? attachmentLabel(a) : "";
}

/**
 * スタッフと選手・保護者の 1 対 1 のスレッド（chat-plan-a §3-4。会話キーは "p:<playerId>" だけ）。
 * - 上部に「保護者も見られます」の帯／自分＝右・accent、相手＝左・灰／連続まとめ・日付区切り
 * - 開いた時点の未読の手前に「ここから未読」、表示中は markChatRead を呼び続ける、自分の最後の発言に「既読」
 * - 引用返信（押すと元の発言へ。お知らせの引用なら詳細を開く）
 * - 長押し（PC は右クリック／ホバーの「…」）で 返信・コピー・削除
 * team／grp:* の会話は廃止したので、お知らせは ChatHome 側（ここでは扱わない）。
 * 会話キーが "opp:<teamId>" のときは練習試合の相手チームのスタッフとのやり取り（スタッフだけ。matchup-demo §5）
 */
export default function ChatThread({
  to,
  as,
  replyTo: initialReplyTo,
  onReplyConsumed,
  onOpenAnn,
}: {
  to: string;
  /** ロール切替プレビュー用に送受信者を上書き（コーチの「選手として閲覧」・選手本人の画面） */
  as?: { role: "coach" | "member"; playerId: string | null };
  /** 開いた直後から入力欄の上に付ける引用（お知らせの「スタッフに返信」。chat-plan-a §3-2） */
  replyTo?: ChatReplyTo | null;
  /**
   * 引用を使った（送信した）／取り消した（×）ときに呼ぶ。引用は一度だけ使う値なので、呼び出し側が保持していれば
   * ここで外す。外さないと、画面の出入りで ChatThread が作り直されるたびに引用が復活して、関係ない発言に付いてしまう
   */
  onReplyConsumed?: () => void;
  /** お知らせの引用を押したときの開き方。省略時は board シート annDetail */
  onOpenAnn?: (annId: string) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const isCoach = as ? as.role === "coach" : board.auth.role === "coach";
  const side: ChatSide = isCoach ? "staff" : "member";
  const myPlayerId = as ? as.playerId : board.auth.playerId ?? null;
  const myDm = myPlayerId ? dmThreadKey(myPlayerId) : null;
  // 選手側は常に自分とスタッフの会話（渡された to が別でも取り違えて表示・送信しない）
  const key = isCoach ? to : myDm ?? to;
  const counterpartId = key.startsWith("p:") ? key.slice(2) : null;
  const counterpart = counterpartId ? board.state.players.find((p) => p.id === counterpartId) ?? null : null;
  // 相手チームとの会話（スタッフだけ）。相手は OpponentTeam.staff（名前・役割）
  const { teams: oppTeams } = useMatchups();
  const isOpp = isCoach && isOppKey(key);
  const oppStaff = isOpp ? oppTeams.find((t) => `opp:${t.id}` === key)?.staff ?? null : null;
  const players = board.state.players;

  // 書きかけの文の保存先（視点＋会話。別のログイン・別の選手の視点に混ざらないよう視点を含める）
  const draftKey = `${side}|${myPlayerId ?? board.auth.name}|${key}`;
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? "");
  const setText = (v: string) => {
    setTextState(v);
    if (v) drafts.set(draftKey, v);
    else drafts.delete(draftKey);
  };
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [picker, setPicker] = useState<"play" | "drill" | "setpiece" | null>(null);
  const [replyTo, setReplyTo] = useState<ChatReplyTo | null>(initialReplyTo ?? null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; at: number } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const imgInput = useRef<HTMLInputElement | null>(null);
  const vidInput = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressPos = useRef<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // メニューを閉じたときにフォーカスを開く前の場所（「…」）へ戻すか（返信は入力欄へ移すので戻さない）
  const restoreFocusRef = useRef(true);
  // 返信バーが出て .chatscroll が縮むとき、一番下まで見ていたなら下端を保つ
  const stickBottomRef = useRef(false);
  const appliedReplyRef = useRef<ChatReplyTo | null | undefined>(initialReplyTo);

  const msgs = useMemo(
    () => board.messages.filter((m) => m.to === key).sort((a, b) => a.ts - b.ts),
    [board.messages, key]
  );

  // 開いた時点の既読時刻。「ここから未読」は現在値でなくこれで決める（現在値だと開いた直後に消える。chat-plan-a §3-4）
  const openedRef = useRef<{ key: string; at: number } | null>(null);
  if (!openedRef.current || openedRef.current.key !== key) {
    openedRef.current = { key, at: board.chatReads[key]?.[side] ?? 0 };
  }
  const openedAt = openedRef.current.at;

  // 既読にするのは本人の画面だけ（コーチが「選手として閲覧」しているだけで選手の既読を付けない）
  const canMarkRead = isCoach ? board.auth.role === "coach" : board.auth.role === "player";
  const incomingTs = latestCounterpartTs(board.messages, key, side);
  useEffect(() => {
    if (canMarkRead) board.markChatRead(key, side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, side, canMarkRead, incomingTs]);

  const isMine = (m: ChatMessage) => (isCoach ? m.from === "coach" : m.from === myDm);

  /** 相手の発言の名前・役割（スタッフ視点＝選手名、選手視点＝スタッフの名前＋役割バッジ） */
  const senderOf = (m: ChatMessage): Sender => {
    if (m.from === "coach") return { name: m.fromName ?? STAFF_FALLBACK, role: m.fromRole };
    if (isOpp) return { name: m.fromName ?? oppStaff?.name ?? "相手チーム", role: m.fromRole ?? oppStaff?.role };
    return { name: m.fromName ?? counterpart?.name ?? "選手" };
  };

  // 表示用に、日付区切り・未読線・連続まとめ・時刻の出し方を先に決める。
  // 「ここから未読」は連続のまとめの区切りとして扱う：その行は cont=false（名前・アバターを出し、線から離す）、
  // 直前の行は endOfRun=true（まとめの最後として時刻を出す）。そうしないと、まとめの途中に線が入って
  // 前の発言の時刻が消え、次の吹き出しが線に 2px で貼り付く
  const items = useMemo(() => {
    const unreadIdx = msgs.findIndex((m) => !isMine(m) && m.ts > openedAt);
    return msgs.map((m, i) => {
      const prev = msgs[i - 1];
      const next = msgs[i + 1];
      const mine = isMine(m);
      const newDay = !prev || !isSameDay(prev.ts, m.ts);
      const unreadLine = i === unreadIdx;
      const cont = !!prev && !newDay && !unreadLine && sameRun(prev, m);
      const endOfRun = !next || !sameRun(m, next) || i + 1 === unreadIdx;
      return { m, mine, day: newDay ? fmtDayDivider(m.ts) : null, cont, endOfRun, unreadLine };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs, openedAt, isCoach, myDm]);

  const lastMineId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].mine) return items[i].m.id;
    return null;
  }, [items]);

  // 開いたときは「ここから未読」（無ければ末尾）へ、その後の新着・送信では末尾へ。
  // scrollIntoView は外側のスクロール（チーム運営の .scroll）まで動かすため、この枠の scrollTop だけを触る
  const firstScroll = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (firstScroll.current !== key) {
      firstScroll.current = key;
      const line = el.querySelector<HTMLElement>(".chatunreadline");
      el.scrollTop = line ? Math.max(0, line.offsetTop - 12) : el.scrollHeight;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [key, msgs.length]);

  function closeMenu(restoreFocus = true) {
    restoreFocusRef.current = restoreFocus;
    setMenu(null);
  }

  // メニューを開いたら最初の項目へフォーカスを移し、閉じたら開く前の場所（「…」）へ戻す。
  // role=menu なのにフォーカスが中へ入らないと、キーボードでは操作できない
  useEffect(() => {
    if (!menu) return;
    const ae = document.activeElement;
    const opener = ae instanceof HTMLElement && ae !== document.body ? ae : null;
    restoreFocusRef.current = true;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      if (restoreFocusRef.current && opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // 開いた 1 回だけ（menu.at が開くたびに変わる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.at]);

  useEffect(() => {
    if (!menu) return;
    const at = menu.at;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    // 背景（.chatmenu-back）が覆うのはスレッドの枠の中だけ。左の一覧・会話ヘッダー・レールなど枠の外を押しても
    // 閉じるよう、document の pointerdown（capture）でも見る。開いた直後の猶予（指を離した click）は同じ
    const onDown = (e: PointerEvent) => {
      if (Date.now() - at <= MENU_GUARD_MS) return;
      const t = e.target as Node | null;
      if (t && (menuRef.current?.contains(t) || wrapRef.current?.contains(t))) return; // 枠の中は背景の onClick が閉じる
      closeMenu(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  // 返信バーが出て入力欄の上が伸びると .chatscroll が縮む。scrollTop は変わらないので、一番下まで見ていた場合は
  // 最後の発言が返信バーの下に隠れる。startReply で一番下にいたと覚えておき、縮んだ直後（描画前）に下端へ戻す
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (stickBottomRef.current && el) el.scrollTop = el.scrollHeight;
    stickBottomRef.current = false;
  }, [replyTo]);
  function rememberBottom() {
    const el = scrollRef.current;
    stickBottomRef.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  }

  // 開いたままのスレッドへ新しい引用が渡されたとき（PC で他画面・シートから「スタッフに返信」が来た場合）に取り込む。
  // key を pid だけにして作り直しに頼らない（引用を外しても作り直しが起きないように）
  useEffect(() => {
    if (!initialReplyTo || appliedReplyRef.current === initialReplyTo) return;
    appliedReplyRef.current = initialReplyTo;
    rememberBottom();
    setReplyTo(initialReplyTo);
  }, [initialReplyTo]);

  const drills = useMemo(() => (picker === "drill" ? loadDrills() : []), [picker]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
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
    // chat-plan-a §1: 1 対 1（選手・保護者、スタッフには相手チームも）以外へは送らない
    if (!sendTo || !(sendTo.startsWith("p:") || (isCoach && isOppKey(sendTo)))) return;
    const memberName = players.find((p) => p.id === myPlayerId)?.name ?? board.auth.name;
    // §2-4: スタッフの発言は fromName／fromRole を staffIdentity で埋める（選手は役割なし）
    const who = isCoach ? staffIdentity(board.auth.name, team.team.coaches) : null;
    board.sendMessage({
      to: sendTo,
      from,
      fromName: who ? who.name : memberName,
      fromRole: who?.role,
      text: text.trim() || undefined,
      attachments: pending.length ? pending : undefined,
      replyTo: replyTo ?? undefined,
    });
    setText("");
    setPending([]);
    setAttachOpen(false);
    setReplyTo(null);
    onReplyConsumed?.();
  }

  /* ---- 長押し・右クリック・「…」のメニュー（chat-plan-a §3-4） ---- */
  /**
   * メニューは対象の吹き出しの下（入りきらなければ上）に置き、押した吹き出しに重ねない（どの発言への操作かが
   * 見えるように。開いている間は行に .menuon の輪郭が付く）。上下どちらにも入らない大きい吹き出しだけ、
   * 従来どおり押した位置に置く。横は自分の発言なら右端、相手なら左端を吹き出しに揃える
   */
  function openMenuAt(id: string, clientX: number, clientY: number) {
    const wrap = wrapRef.current;
    const box = scrollRef.current;
    if (!wrap || !box) return;
    const wr = wrap.getBoundingClientRect();
    const rows = 2 + (canDelete(id) ? 1 : 0);
    const menuH = rows * MENU_ROW_H + MENU_PAD;
    const clampX = (v: number) => Math.min(Math.max(v, 8), Math.max(8, wr.width - MENU_W - 8));
    const fallbackY = () => Math.min(Math.max(clientY - wr.top, 8), Math.max(8, wr.height - menuH - 6));
    const rowEl = box.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    const bub = rowEl?.querySelector<HTMLElement>(".chatbubble");
    let x = clampX(clientX - wr.left);
    let y = fallbackY();
    if (rowEl && bub) {
      const br = bub.getBoundingClientRect();
      const sr = box.getBoundingClientRect();
      // 枠の外へ出ている部分は数えない（見えている範囲の上下に置く）
      const top = Math.max(br.top, sr.top);
      const bottom = Math.min(br.bottom, sr.bottom);
      x = clampX((rowEl.classList.contains("mine") ? br.right - MENU_W : br.left) - wr.left);
      if (bottom + MENU_GAP + menuH <= sr.bottom) y = bottom + MENU_GAP - wr.top;
      else if (top - MENU_GAP - menuH >= sr.top) y = top - MENU_GAP - menuH - wr.top;
    }
    setMenu({ id, x, y, at: Date.now() });
  }
  function canDelete(id: string): boolean {
    const m = msgs.find((x) => x.id === id);
    if (!m) return false;
    // スタッフは相手の発言も消せる（従来と同じ）。選手は自分の発言だけ
    return isCoach || m.from === myDm;
  }
  function clearPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressPos.current = null;
  }
  function onTouchStart(e: React.TouchEvent, id: string) {
    const t = e.touches[0];
    if (!t) return;
    clearPress();
    const pos = { x: t.clientX, y: t.clientY };
    pressPos.current = pos;
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      openMenuAt(id, pos.x, pos.y);
    }, LONG_PRESS_MS);
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    const p = pressPos.current;
    if (!t || !p) return;
    // 指が動いた（スクロール）ら長押しではない
    if (Math.abs(t.clientX - p.x) > 10 || Math.abs(t.clientY - p.y) > 10) clearPress();
  }
  useEffect(() => clearPress, []);

  function startReply(m: ChatMessage) {
    rememberBottom();
    setReplyTo(makeReplyTo("message", m.id, senderOf(m).name, quoteTextOf(m)));
    closeMenu(false); // フォーカスは入力欄へ移す
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  function copyText(m: ChatMessage) {
    closeMenu();
    const t = m.text ?? "";
    if (!t) {
      board.toast("コピーできる本文がありません");
      return;
    }
    try {
      void navigator.clipboard?.writeText(t).then(
        () => board.toast("コピーしました"),
        () => board.toast("コピーできませんでした")
      );
    } catch {
      board.toast("コピーできませんでした");
    }
  }
  function deleteMsg(m: ChatMessage) {
    closeMenu();
    // どの発言かが分かるよう、本文の冒頭（引用と同じ 60 字まで）を確認文に入れる
    const excerpt = makeReplyTo("message", m.id, "", quoteTextOf(m)).text;
    const q = excerpt ? `このメッセージを削除しますか？\n\n「${excerpt}」` : "このメッセージを削除しますか？";
    if (window.confirm(q)) board.removeMessage(m.id);
  }

  function jumpToQuote(q: ChatReplyTo) {
    if (q.source === "announcement") {
      if (onOpenAnn) onOpenAnn(q.id);
      else board.openSheet({ type: "annDetail", annId: q.id });
      return;
    }
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${q.id}"]`);
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 3), behavior: "smooth" });
    setFlashId(q.id);
    setTimeout(() => setFlashId((cur) => (cur === q.id ? null : cur)), 1400);
  }

  // メニュー内の矢印キー（↑↓で項目を移る・Home/End・Tab で閉じる）
  function onMenuKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let to: number | null = null;
    if (e.key === "ArrowDown") to = (i + 1) % items.length;
    else if (e.key === "ArrowUp") to = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (to === null) return;
    e.preventDefault();
    items[to].focus({ preventScroll: true });
  }

  const menuMsg = menu ? msgs.find((m) => m.id === menu.id) ?? null : null;

  return (
    <div className="chatwrap" ref={wrapRef}>
      {/* 保護者も見られることを常に明示する（スタッフ側・選手側の両方。chat-plan-a §3-4） */}
      <div className="chatguard">
        {isOpp ? "相手チームのスタッフとのやり取りです。選手・保護者には見えません" : "このやりとりは保護者も見られます"}
      </div>
      <div className="chatscroll" ref={scrollRef}>
        {msgs.length === 0 ? (
          <div className="empty-msg">メッセージはまだありません。</div>
        ) : (
          items.map(({ m, mine, day, cont, endOfRun, unreadLine }) => {
            const s = mine ? null : senderOf(m);
            const seen = mine && m.id === lastMineId && isSeenByOther(board.chatReads, key, side, m.ts);
            return (
              <div key={m.id} className="chatgroup">
                {day && <div className="chatday">{day}</div>}
                {unreadLine && <div className="chatunreadline">ここから未読</div>}
                <div
                  data-mid={m.id}
                  className={`chatrow${mine ? " mine" : ""}${cont ? " cont" : ""}${flashId === m.id ? " flash" : ""}${menu?.id === m.id ? " menuon" : ""}`}
                  onTouchStart={(e) => onTouchStart(e, m.id)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={clearPress}
                  onTouchCancel={clearPress}
                  onContextMenu={(e) => {
                    // PC は右クリック、スマホの長押しはブラウザ標準のメニューを出さずこちらへ寄せる
                    e.preventDefault();
                    clearPress();
                    openMenuAt(m.id, e.clientX, e.clientY);
                  }}
                >
                  {!mine && (
                    <div className={`chatavatar${cont ? " ghost" : ""}`} aria-hidden="true">
                      {cont ? "" : Array.from(s!.name)[0] ?? "?"}
                    </div>
                  )}
                  <div className="chatcol">
                    {!mine && !cont && s && (
                      <div className="chatnamerow">
                        <span className="chatname">{s.name}</span>
                        {s.role && <span className="chatrole">{s.role}</span>}
                      </div>
                    )}
                    {m.replyTo && (
                      <button type="button" className="chatquote" onClick={() => jumpToQuote(m.replyTo!)}>
                        <b>{m.replyTo.source === "announcement" ? `お知らせ（${m.replyTo.fromName}）` : m.replyTo.fromName}</b>
                        <span>{m.replyTo.text}</span>
                      </button>
                    )}
                    <div className="chatbubble">
                      {m.text && <div className="chattext">{m.text}</div>}
                      {m.attachments?.map((a, i) => (
                        <AttachmentView key={i} att={a} />
                      ))}
                    </div>
                    {(endOfRun || seen) && (
                      <div className="chatsub">
                        {seen && <span className="chatread">既読</span>} <span>{fmtClock(m.ts)}</span>
                      </div>
                    )}
                  </div>
                  {/* PC だけ、吹き出しにマウスを乗せたときに出る「…」（スマホは長押し） */}
                  <button
                    type="button"
                    className="chatmore"
                    aria-label="メッセージのメニュー"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      openMenuAt(m.id, r.left, r.bottom);
                    }}
                  >
                    …
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 長押し・右クリック・「…」のメニュー（返信／コピー／削除） */}
      {menu && menuMsg && (
        <>
          <div
            className="chatmenu-back"
            onClick={() => {
              if (Date.now() - menu.at > MENU_GUARD_MS) closeMenu();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (Date.now() - menu.at > MENU_GUARD_MS) closeMenu();
            }}
          />
          <div
            className="chatmenu"
            role="menu"
            aria-label="メッセージのメニュー"
            ref={menuRef}
            style={{ left: menu.x, top: menu.y }}
            onKeyDown={onMenuKey}
          >
            <button type="button" role="menuitem" onClick={() => startReply(menuMsg)}>
              返信
            </button>
            <button type="button" role="menuitem" onClick={() => copyText(menuMsg)}>
              コピー
            </button>
            {canDelete(menuMsg.id) && (
              <button type="button" role="menuitem" className="danger" onClick={() => deleteMsg(menuMsg)}>
                削除
              </button>
            )}
          </div>
        </>
      )}

      {/* 引用返信の対象（× で取り消し） */}
      {replyTo && (
        <div className="chatreplybar">
          <div className="chatquote">
            <b>{replyTo.source === "announcement" ? `お知らせ（${replyTo.fromName}）` : replyTo.fromName}</b>
            <span>{replyTo.text}</span>
          </div>
          <button
            type="button"
            aria-label="返信を取り消す"
            onClick={() => {
              setReplyTo(null);
              onReplyConsumed?.();
            }}
          >
            ×
          </button>
        </div>
      )}

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
                {a.kind === "video" && <E n="video" />} {a.title ?? a.kind}
              </span>
              <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* 添付メニュー */}
      {attachOpen && (
        <div className="chatattach">
          <button onClick={() => imgInput.current?.click()}>
            <E n="image" /> 画像
          </button>
          <button onClick={() => vidInput.current?.click()}>
            <E n="video" /> 動画
          </button>
          {isCoach && (
            <>
              <button onClick={() => setPicker("play")}>
                <E n="clipboard" /> 戦術
              </button>
              <button onClick={() => setPicker("drill")}>
                <E n="run" /> トレーニング
              </button>
              <button onClick={() => setPicker("setpiece")}>
                <E n="target" /> セットプレー
              </button>
            </>
          )}
        </div>
      )}

      {/* 戦術/トレーニング/セットプレーのピッカー */}
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
                <span>
                  {p.formation} ・ {p.moves.length}本
                </span>
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
                <span>
                  {d.items.length}個の配置 ・ {d.lines.length}本の動線
                </span>
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
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="メッセージを入力"
        />
        <button className="chatsend" onClick={send} aria-label="送信">
          <IconSend />
        </button>
      </div>

      <input ref={imgInput} type="file" accept="image/*" hidden onChange={onFile} />
      <input ref={vidInput} type="file" accept="video/*" hidden onChange={onFile} />
    </div>
  );
}

/** 添付の表示（戦術・練習メニュー・セットプレー・画像・動画。お知らせの詳細からも使う） */
export function AttachmentView({ att }: { att: ChatAttachment }) {
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
