"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import { ARTICLE_CATEGORIES } from "@/lib/articles";
import type { ArticleAttachment, UserArticle } from "@/lib/articles";
import { ARTICLE_TAGS_SUGGEST, MAX_PRICE, MIN_PRICE, canPublishPaid } from "@/lib/coachlab";
import type { SavedDrill, SavedPlay, SavedSetPiece } from "@/lib/types";
import { loadDrills } from "@/lib/storage";
import { fmtDateTime, totalChars, useIsPc, useMeId } from "./CoachLabParts";

/**
 * コーチラボ「書く」画面（自分の記事一覧＋エディタ）。旧 ConsoleScreens.ArticleForm を
 * 移植し、タグ・価格・有料ライン・返金・読者の想定を追加した（specs/coachlab.md §5-5）。
 * PCは左:一覧/右:エディタの2ペイン、モバイルは単一カラム（一覧⇄エディタを切り替え）。
 */

type PriceMode = "free" | "300" | "500" | "1000" | "2000" | "custom";

function priceFromMode(mode: PriceMode, custom: string): number {
  switch (mode) {
    case "free":
      return 0;
    case "300":
      return 300;
    case "500":
      return 500;
    case "1000":
      return 1000;
    case "2000":
      return 2000;
    case "custom":
      return Math.round(Number(custom));
    default:
      return 0;
  }
}
function modeFromPrice(price: number | undefined): { mode: PriceMode; custom: string } {
  if (!price) return { mode: "free", custom: "" };
  if (price === 300 || price === 500 || price === 1000 || price === 2000) {
    return { mode: String(price) as PriceMode, custom: "" };
  }
  return { mode: "custom", custom: String(price) };
}

/** 空行区切りの本文テキストを段落配列にする（保存時のbuildPayloadと同じ規則） */
function splitParagraphs(bodyText: string): string[] {
  return bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

type EditorFormErrors = { title?: string; body?: string; price?: string };

interface ClDraftShape {
  editId: string | "new";
  title: string;
  category: string;
  audience: "" | "coach" | "parent" | "player";
  lead: string;
  bodyText: string;
  tags: string[];
  attachments: ArticleAttachment[];
  priceMode: PriceMode;
  customPrice: string;
  paidFrom: string;
  refundable: boolean;
}
/** 書きかけの記事(セッション内)。レール遷移でアンマウントされても同じ対象を開き直せば復元する */
let clDraft: ClDraftShape | null = null;
function clearClDraft() {
  clDraft = null;
}
/**
 * CoachLabScreen側で「書く」から離れる操作が確定した（未保存ガードの確認を
 * 通過した）ときに呼ぶ。呼ばないと、離れた後で同じ記事を開き直した際に
 * 「破棄したはずの書きかけ」が復元されてしまう
 */
export function clearCoachLabDraft() {
  clearClDraft();
}

/** 左ペイン: 自分の記事一覧（下書き→公開中） */
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
    <div className={`artrow${editId === a.id ? " sel" : ""}`} onClick={() => onSelect(a.id)}>
      <span className="artcat">{a.category}</span>
      <div className="artmeta">
        <div className="arttitle">{a.title}</div>
        <div className="artby">
          {fmtDateTime(a.updatedAt)}
          {a.draft && " ・ 下書き"}
          {!a.draft && (a.price ?? 0) > 0 && ` ・ ¥${a.price}`}
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

function EditorForm({
  editId,
  onSaved,
  onDeleted,
  onDirtyChange,
  onGoProfile,
}: {
  editId: string | "new";
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onGoProfile: () => void;
}) {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();
  const existing = editId === "new" ? null : board.userArticles.find((a) => a.id === editId) ?? null;
  const draft = clDraft && clDraft.editId === editId ? clDraft : null;
  const [restoredDraft] = useState(!!draft);

  const priceInit = modeFromPrice(existing?.price);

  const [title, setTitle] = useState(draft?.title ?? existing?.title ?? "");
  const [category, setCategory] = useState<string>(draft?.category ?? existing?.category ?? ARTICLE_CATEGORIES[0]);
  const [audience, setAudience] = useState<"" | "coach" | "parent" | "player">(
    draft?.audience ?? existing?.audience ?? ""
  );
  const [lead, setLead] = useState(draft?.lead ?? existing?.lead ?? "");
  const [bodyText, setBodyText] = useState(draft?.bodyText ?? existing?.body?.join("\n\n") ?? "");
  const [tags, setTags] = useState<string[]>(draft?.tags ?? existing?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [attachments, setAttachments] = useState<ArticleAttachment[]>(
    draft?.attachments ?? existing?.attachments ?? []
  );
  const [priceMode, setPriceMode] = useState<PriceMode>(draft?.priceMode ?? priceInit.mode);
  const [customPrice, setCustomPrice] = useState(draft?.customPrice ?? priceInit.custom);
  const [paidFrom, setPaidFrom] = useState<string>(
    draft?.paidFrom ?? (existing?.paidFrom != null ? String(existing.paidFrom) : "")
  );
  const [refundable, setRefundable] = useState<boolean>(draft?.refundable ?? existing?.refundable ?? true);

  const [playPickerOpen, setPlayPickerOpen] = useState(false);
  const [drillPickerOpen, setDrillPickerOpen] = useState(false);
  const [setPiecePickerOpen, setSetPiecePickerOpen] = useState(false);
  const [pickerDrills, setPickerDrills] = useState<SavedDrill[] | null>(null);

  const [touched, setTouched] = useState<{ title?: boolean; body?: boolean; price?: boolean }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [publishBlocked, setPublishBlocked] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const priceRef = useRef<HTMLInputElement | null>(null);

  const paragraphs = useMemo(() => splitParagraphs(bodyText), [bodyText]);
  const price = priceFromMode(priceMode, customPrice);

  const errors = useMemo<EditorFormErrors>(() => {
    const e: EditorFormErrors = {};
    if (!title.trim()) e.title = "タイトルを入力してください";
    if (!bodyText.trim()) e.body = "本文を入力してください";
    if (priceMode === "custom") {
      if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) {
        e.price = `価格は${MIN_PRICE}〜${MAX_PRICE.toLocaleString("ja-JP")}円で入力してください`;
      }
    }
    return e;
  }, [title, bodyText, priceMode, price]);

  // ---- 未保存ガード ----
  const initialSnapRef = useRef(
    JSON.stringify({
      title: existing?.title ?? "",
      category: existing?.category ?? ARTICLE_CATEGORIES[0],
      audience: existing?.audience ?? "",
      lead: existing?.lead ?? "",
      bodyText: existing?.body?.join("\n\n") ?? "",
      tags: existing?.tags ?? [],
      attachments: existing?.attachments ?? [],
      priceMode: priceInit.mode,
      customPrice: priceInit.custom,
      paidFrom: existing?.paidFrom != null ? String(existing.paidFrom) : "",
      refundable: existing?.refundable ?? true,
    })
  );
  const dirtyRef = useRef(false);
  useEffect(() => {
    const snap = JSON.stringify({
      title,
      category,
      audience,
      lead,
      bodyText,
      tags,
      attachments,
      priceMode,
      customPrice,
      paidFrom,
      refundable,
    });
    const dirty = snap !== initialSnapRef.current;
    dirtyRef.current = dirty;
    onDirtyChange(dirty);
    clDraft = dirty
      ? { editId, title, category, audience, lead, bodyText, tags, attachments, priceMode, customPrice, paidFrom, refundable }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, category, audience, lead, bodyText, tags, attachments, priceMode, customPrice, paidFrom, refundable]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      onDirtyChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFirstError = (errs: EditorFormErrors) => {
    const target = errs.title ? titleRef.current : errs.body ? bodyRef.current : errs.price ? priceRef.current : null;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  };

  const buildPayload = (draftFlag: boolean): Omit<UserArticle, "id" | "ts" | "updatedAt"> => {
    const body = splitParagraphs(bodyText);
    const finalPrice = priceFromMode(priceMode, customPrice);
    const paidFromVal = finalPrice > 0 && paidFrom !== "" ? Number(paidFrom) : null;
    const authorName = cl.myProfile?.name?.trim() || board.auth.name;
    return {
      title: title.trim(),
      category,
      author: authorName,
      lead: lead.trim(),
      body,
      draft: draftFlag,
      attachments,
      authorId: existing?.authorId ?? meId,
      tags: tags.length > 0 ? tags : undefined,
      price: finalPrice > 0 ? finalPrice : undefined,
      paidFrom: paidFromVal,
      audience: audience || undefined,
      refundable: finalPrice > 0 ? refundable : undefined,
      publishedAt: draftFlag ? existing?.publishedAt : existing?.publishedAt ?? Date.now(),
    };
  };

  const trySave = (draftFlag: boolean, confirmMsg?: string): string | null => {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return null;
    }
    const finalPrice = priceFromMode(priceMode, customPrice);
    if (!draftFlag && finalPrice > 0 && !canPublishPaid(cl.myProfile)) {
      setPublishBlocked(true);
      return null;
    }
    setPublishBlocked(false);
    if (confirmMsg && !window.confirm(confirmMsg)) return null;
    const payload = buildPayload(draftFlag);
    initialSnapRef.current = JSON.stringify({
      title,
      category,
      audience,
      lead,
      bodyText,
      tags,
      attachments,
      priceMode,
      customPrice,
      paidFrom,
      refundable,
    });
    dirtyRef.current = false;
    clDraft = null;
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
      "コーチラボの読者に公開します。有料記事は購入者が出た後は下書きに戻せず削除もできません（編集は可能です）。"
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
    clDraft = null;
    board.toast("記事を削除しました");
    onDeleted();
  };

  const errFor = (key: keyof EditorFormErrors) => (touched[key] || submitAttempted ? errors[key] : undefined);

  const toggleTag = (t: string) => {
    setTags((cur) => {
      if (cur.includes(t)) return cur.filter((x) => x !== t);
      if (cur.length >= 5) return cur;
      return [...cur, t];
    });
  };
  const addCustomTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || tags.length >= 5) {
      setTagInput("");
      return;
    }
    setTags((cur) => [...cur, t]);
    setTagInput("");
  };

  const addPlayAttachment = (p: SavedPlay) => {
    setAttachments((list) =>
      list.some((a) => a.kind === "play" && a.play?.id === p.id) ? list : [...list, { kind: "play", title: p.title, play: p }]
    );
    setPlayPickerOpen(false);
  };
  const togglePlayPicker = () => {
    setDrillPickerOpen(false);
    setSetPiecePickerOpen(false);
    setPlayPickerOpen((v) => !v);
  };
  const toggleDrillPicker = () => {
    setPlayPickerOpen(false);
    setSetPiecePickerOpen(false);
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
  const toggleSetPiecePicker = () => {
    setPlayPickerOpen(false);
    setDrillPickerOpen(false);
    setSetPiecePickerOpen((v) => !v);
  };
  const addSetPieceAttachment = (p: SavedSetPiece) => {
    setAttachments((list) =>
      list.some((a) => a.kind === "setpiece" && a.setpiece?.id === p.id)
        ? list
        : [...list, { kind: "setpiece", title: p.title, setpiece: p }]
    );
    setSetPiecePickerOpen(false);
  };
  const removeAttachment = (i: number) => setAttachments((list) => list.filter((_, idx) => idx !== i));

  const published = existing != null && existing.draft === false;
  const salesLocked = !!existing && (existing.price ?? 0) > 0 && cl.purchaseCount(existing.id) > 0;

  const paidFromOptions = paragraphs.length >= 2 ? Array.from({ length: paragraphs.length - 1 }, (_, i) => i + 1) : [];
  const freeCount = price > 0 && paidFrom !== "" ? Number(paidFrom) : paragraphs.length;
  const paidParas = paragraphs.slice(freeCount);

  return (
    <div className="cl-form">
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
            <button
              type="button"
              className="artweaklink"
              onClick={handleUnpublish}
              disabled={salesLocked}
              title={salesLocked ? "購入者がいるため下書きに戻せません" : undefined}
            >
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
      {salesLocked && (
        <div className="cl-lockednote">購入実績があるため、下書きに戻す・削除はできません（編集は可能です）。</div>
      )}
      {publishBlocked && (
        <div className="cl-blockednote">
          有料記事の公開にはプロフィール（名前・肩書・資格またはチーム名）が必要です。
          <button type="button" className="cl-linkbtn" onClick={onGoProfile}>
            プロフィールを編集する
          </button>
        </div>
      )}

      <div className="cl-authorline">投稿者：{cl.myProfile?.name?.trim() || board.auth.name}（
        <button type="button" className="cl-linkbtn" onClick={onGoProfile}>
          プロフィールを編集
        </button>
        ）
      </div>

      <div className="ffield">
        <label htmlFor="clf-title">
          タイトル <span className="reqb">必須</span>
        </label>
        <input
          id="clf-title"
          ref={titleRef}
          className="big"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, title: true }))}
          aria-invalid={errFor("title") ? "true" : undefined}
          placeholder="記事のタイトル"
        />
        {errFor("title") && <div className="arterr">⚠ {errFor("title")}</div>}
      </div>

      <div className="ffield">
        <label>
          カテゴリ <span className="reqb">必須</span>
        </label>
        <div className="catbar">
          {ARTICLE_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`catchip${category === c ? " on" : ""}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="ffield">
        <label>
          読者の想定 <span className="optb">任意</span>
        </label>
        <div className="catbar">
          {([
            ["coach", "指導者向け"],
            ["parent", "保護者向け"],
            ["player", "選手向け"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`catchip${audience === v ? " on" : ""}`}
              onClick={() => setAudience((cur) => (cur === v ? "" : v))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ffield">
        <label htmlFor="clf-lead">
          リード文 <span className="optb">任意</span>
        </label>
        <input
          id="clf-lead"
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          placeholder="空欄の場合は本文の冒頭を自動で使用します"
        />
      </div>

      <div className="ffield">
        <label htmlFor="clf-body">
          本文 <span className="reqb">必須</span>
        </label>
        <textarea
          id="clf-body"
          ref={bodyRef}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, body: true }))}
          aria-invalid={errFor("body") ? "true" : undefined}
          placeholder="1行あけると段落が分かれます"
        />
        {errFor("body") && <div className="arterr">⚠ {errFor("body")}</div>}
      </div>

      <div className="ffield">
        <label>
          タグ <span className="optb">任意・最大5個</span>
        </label>
        <div className="catbar cl-wrapchips">
          {ARTICLE_TAGS_SUGGEST.map((t) => (
            <button
              key={t}
              type="button"
              className={`catchip${tags.includes(t) ? " on" : ""}`}
              onClick={() => toggleTag(t)}
              disabled={!tags.includes(t) && tags.length >= 5}
            >
              #{t}
            </button>
          ))}
        </div>
        {tags.filter((t) => !(ARTICLE_TAGS_SUGGEST as readonly string[]).includes(t)).length > 0 && (
          <div className="catbar cl-wrapchips">
            {tags
              .filter((t) => !(ARTICLE_TAGS_SUGGEST as readonly string[]).includes(t))
              .map((t) => (
                <button key={t} type="button" className="catchip on" onClick={() => toggleTag(t)}>
                  #{t}
                </button>
              ))}
          </div>
        )}
        <div className="cl-taginputrow">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTag();
              }
            }}
            placeholder="自由入力のタグ"
            disabled={tags.length >= 5}
          />
          <button type="button" className="artaddbtn" onClick={addCustomTag} disabled={tags.length >= 5}>
            追加
          </button>
        </div>
      </div>

      <div className="ffield">
        <label>
          添付 <span className="optb">任意</span>
        </label>
        {attachments.map((att, i) => (
          <div key={i} className="artattrow">
            <span className="artattkind">{att.kind === "play" ? "戦術" : att.kind === "drill" ? "練習" : "セットプレー"}</span>
            <span className="artatttitle">{att.title}</span>
            <button type="button" className="artattdel" onClick={() => removeAttachment(i)} aria-label="添付を削除">
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
        <button type="button" className="artaddbtn" onClick={toggleSetPiecePicker}>
          ＋ 保存したセットプレーを添付
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
        {setPiecePickerOpen && (
          <div className="artpick">
            {(board.library.setPieces ?? []).length === 0 ? (
              <div className="artpickempty">保存されたセットプレーがありません。</div>
            ) : (
              [...(board.library.setPieces ?? [])]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((p) => (
                  <button type="button" key={p.id} onClick={() => addSetPieceAttachment(p)}>
                    {p.title}
                  </button>
                ))
            )}
          </div>
        )}
      </div>

      <div className="ffield">
        <label>価格</label>
        <div className="catbar">
          {([
            ["free", "無料"],
            ["300", "¥300"],
            ["500", "¥500"],
            ["1000", "¥1,000"],
            ["2000", "¥2,000"],
            ["custom", "自由入力"],
          ] as const).map(([v, label]) => (
            <button key={v} type="button" className={`catchip${priceMode === v ? " on" : ""}`} onClick={() => setPriceMode(v)}>
              {label}
            </button>
          ))}
        </div>
        {priceMode === "custom" && (
          <>
            <input
              ref={priceRef}
              type="number"
              inputMode="numeric"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, price: true }))}
              placeholder={`${MIN_PRICE}〜${MAX_PRICE}`}
              style={{ marginTop: 8 }}
            />
            {errFor("price") && <div className="arterr">⚠ {errFor("price")}</div>}
          </>
        )}
      </div>

      {price > 0 && (
        <>
          <div className="ffield">
            <label>有料ライン</label>
            <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
              <option value="">全文無料</option>
              {paidFromOptions.map((n) => (
                <option key={n} value={n}>
                  第{n + 1}段落から有料
                </option>
              ))}
            </select>
            <div className="cl-paidpreview">
              無料で読める：冒頭{Math.min(freeCount, paragraphs.length)}段落、有料部分：{paidParas.length}段落・約
              {totalChars(paidParas)}字
            </div>
          </div>
          <div className="ffield">
            <label className="cl-checklabel">
              <input type="checkbox" checked={refundable} onChange={(e) => setRefundable(e.target.checked)} />
              購入後24時間以内の返金申請を受け付ける
            </label>
          </div>
        </>
      )}

      {existing && (
        <div className="artdangerzone">
          <button
            type="button"
            className="artdangerlink"
            onClick={handleDelete}
            disabled={salesLocked}
            title={salesLocked ? "購入者がいるため削除できません" : undefined}
          >
            この記事を削除
          </button>
        </div>
      )}
    </div>
  );
}

export default function CoachLabEditor({
  onDirtyChange,
  onGoProfile,
}: {
  onDirtyChange: (dirty: boolean) => void;
  onGoProfile: () => void;
}) {
  const board = useBoard();
  const pc = useIsPc();
  const [editId, setEditIdState] = useState<string | "new" | null>(null);
  const formDirtyRef = useRef(false);

  const confirmDiscard = () => !formDirtyRef.current || window.confirm("編集中の内容を破棄しますか？");

  const setEditId = (next: string | "new" | null) => {
    if (editId === next) return;
    if (!confirmDiscard()) return;
    formDirtyRef.current = false;
    onDirtyChange(false);
    clearClDraft();
    setEditIdState(next);
  };

  const handleDirty = (d: boolean) => {
    formDirtyRef.current = d;
    onDirtyChange(d);
  };

  const editorNode =
    editId === null ? null : (
      <EditorForm
        key={editId}
        editId={editId}
        onSaved={(id) => {
          formDirtyRef.current = false;
          onDirtyChange(false);
          setEditIdState(id);
        }}
        onDeleted={() => {
          formDirtyRef.current = false;
          onDirtyChange(false);
          setEditIdState(null);
        }}
        onDirtyChange={handleDirty}
        onGoProfile={onGoProfile}
      />
    );

  if (pc) {
    return (
      <>
        <div className="cl-writepane screenbody">
          <button type="button" className="bigbtn" onClick={() => setEditId("new")}>
            ＋ 新しい記事を書く
          </button>
          <OwnArticleList articles={board.userArticles} editId={editId} onSelect={setEditId} />
        </div>
        <div className="cl-writemain screenbody">
          {editorNode ?? (
            <div className="artempty">左の一覧から記事を選ぶか、＋ 新しい記事を書く から始めてください</div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="scroll screenbody">
      {editId === null ? (
        <>
          <button type="button" className="bigbtn" onClick={() => setEditId("new")}>
            ＋ 新しい記事を書く
          </button>
          <OwnArticleList articles={board.userArticles} editId={editId} onSelect={setEditId} />
        </>
      ) : (
        <>
          <button type="button" className="cl-linkbtn cl-backtolist" onClick={() => setEditId(null)}>
            ‹ 記事一覧に戻る
          </button>
          {editorNode}
        </>
      )}
    </div>
  );
}
