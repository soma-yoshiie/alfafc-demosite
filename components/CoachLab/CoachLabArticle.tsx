"use client";

import { useEffect, useMemo } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import { allArticles, readingMinutes, resolveAuthorId } from "@/lib/coachlab";
import type { ArticleAttachment } from "@/lib/articles";
import type { BoardState } from "@/lib/types";
import { renderTacticPng } from "@/lib/exportImage";
import { renderDrillPng } from "@/lib/exportDrill";
import {
  AuthorMini,
  FollowButton,
  fmtDate,
  fmtYen,
  priceLabel,
  resolveAuthorProfile,
  totalChars,
  useMeId,
} from "./CoachLabParts";
import { ArticleCard } from "./CoachLabExplore";

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 記事に添付された戦術/練習/セットプレーのプレビューカード（SheetManager.ArticleAttachmentCardと同じ組み立て方） */
function AttachmentCard({ att }: { att: ArticleAttachment }) {
  const board = useBoard();
  const pngUrl = useMemo(() => {
    try {
      if (att.kind === "play" && att.play) {
        const state: BoardState = {
          ...board.state,
          formation: att.play.formation,
          slots: att.play.slots,
          ball: att.play.ball,
          moves: att.play.moves,
          holder: att.play.holder ?? null,
          opponents: att.play.opponents ?? [],
          drawings: att.play.drawings ?? [],
          shapes: att.play.shapes ?? [],
          stepCount: att.play.stepCount ?? 1,
          guides: att.play.guides ?? {},
          pitchView: att.play.pitchView ?? "full",
        };
        return renderTacticPng(state);
      }
      if (att.kind === "drill" && att.drill) return renderDrillPng(att.drill);
      if (att.kind === "setpiece" && att.setpiece) {
        const sp = att.setpiece;
        const state: BoardState = {
          ...board.state,
          formation: sp.formation,
          slots: sp.slots,
          ball: sp.ball,
          moves: sp.moves,
          holder: sp.holder ?? null,
          opponents: sp.opponents ?? [],
          drawings: sp.drawings ?? [],
          shapes: sp.shapes ?? [],
          stepCount: sp.stepCount ?? 1,
          guides: sp.guides ?? {},
          pitchView: sp.pitchView ?? "full",
          setPiece: sp.setPiece,
        };
        return renderTacticPng(state);
      }
      return null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att, board.state]);

  return (
    <div className="artatt">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
        <span className="artcat" style={{ marginTop: 0 }}>
          {att.kind === "play" ? "戦術" : att.kind === "drill" ? "練習" : "セットプレー"}
        </span>
        {att.title}
      </div>
      {pngUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pngUrl} alt={att.title} />
      ) : (
        <div className="artlead">プレビューを表示できません</div>
      )}
      <button
        type="button"
        className="bigbtn ghost"
        style={{ marginTop: 10 }}
        onClick={() => {
          if (att.kind === "play" && att.play) board.loadPlayData(att.play);
          else if (att.kind === "drill" && att.drill) board.openDrillData(att.drill);
          else if (att.kind === "setpiece" && att.setpiece) board.loadSetPieceData(att.setpiece);
        }}
      >
        開く
      </button>
    </div>
  );
}

export default function CoachLabArticle({
  articleId,
  onOpenAuthor,
  onOpenArticle,
}: {
  articleId: string;
  onOpenAuthor: (authorId: string) => void;
  onOpenArticle: (articleId: string) => void;
}) {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();
  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);
  const a = merged.find((x) => x.id === articleId);

  useEffect(() => {
    if (a) cl.recordView(a.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);

  if (!a) {
    return <div className="empty-msg">記事が見つかりませんでした。削除された可能性があります。</div>;
  }

  const authorId = resolveAuthorId(a, meId);
  const profile = resolveAuthorProfile(a, cl.profiles, meId);
  const isMine = authorId === meId;
  const priced = !!a.price && a.price > 0;
  const hasPaywall = priced && a.paidFrom != null && a.paidFrom < a.body.length;
  const purchased = cl.hasPurchased(a.id);
  const fullAccess = isMine || purchased || !hasPaywall;

  const splitAt = a.paidFrom ?? a.body.length;
  const visibleBody = fullAccess ? a.body : a.body.slice(0, splitAt);
  const hiddenBody = fullAccess ? [] : a.body.slice(splitAt);
  const attachments = a.attachments ?? [];
  const showAttachments = fullAccess || attachments.length === 0;

  const purchaseRec = cl.purchases.find((p) => p.userId === meId && p.articleId === a.id);
  const withinRefundWindow = !!purchaseRec && Date.now() - purchaseRec.ts < REFUND_WINDOW_MS;
  const refundable = a.refundable !== false;

  const related = merged.filter((x) => x.id !== a.id && resolveAuthorId(x, meId) === authorId).slice(0, 3);

  const handlePurchase = () => {
    if (!a.price) return;
    if (!window.confirm(`「${a.title}」を${fmtYen(a.price)}で購入します。よろしいですか？`)) return;
    cl.purchase(a.id, a.price);
    board.toast("購入しました。全文を読めます。");
  };
  const handleRefund = () => {
    if (!window.confirm("返金を申請しますか？購入記録を取り消し、有料部分は再び非表示になります。")) return;
    cl.refundPurchase(a.id);
    board.toast("返金を申請しました。購入を取り消しました。");
  };
  const handleReport = () => board.toast("報告を受け付けました");

  const PaywallBox = () => (
    <div className="cl-paywall">
      <div className="cl-paywall-title">ここから先は有料です</div>
      <div className="cl-paywall-stats">
        残り{hiddenBody.length}段落・約{totalChars(hiddenBody)}文字
        {attachments.length > 0 && ` ・添付${attachments.length}件`}
      </div>
      <div className="cl-paywall-row">
        <span className="cl-paywall-price">{fmtYen(a.price ?? 0)}</span>
        <span className={`cl-paywall-refund${refundable ? "" : " no"}`}>
          {refundable ? "返金可（購入後24時間以内）" : "返金不可"}
        </span>
      </div>
      <button type="button" className="bigbtn" onClick={handlePurchase}>
        購入して読む {fmtYen(a.price ?? 0)}
      </button>
      <div className="cl-paywall-note">デモのため実際の決済は行われません。</div>
    </div>
  );

  return (
    <div className="cl-article-grid">
      <div className="cl-article-main">
        <div className="cl-article-meta">
          <span className="artcat" style={{ marginTop: 0 }}>{a.category}</span>
          {(a.tags ?? []).map((t) => (
            <span key={t} className="cl-tagchip">#{t}</span>
          ))}
          <span className="cl-metadot">{fmtDate(a.publishedAt ?? a.ts)}</span>
          <span className="cl-metadot">読了{readingMinutes(a.body)}分</span>
        </div>
        <h1 className="cl-article-title">{a.title}</h1>
        <div className="cl-article-authorrow">
          <AuthorMini profile={profile} onOpen={onOpenAuthor} />
          {!isMine && <FollowButton authorId={authorId} />}
        </div>

        <div className="artbody cl-article-body">
          {visibleBody.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {!fullAccess && <PaywallBox />}
        {fullAccess && purchased && !isMine && (
          <div className="cl-purchased-row">
            <span className="cl-purchased-badge">購入済み</span>
            {refundable && withinRefundWindow && (
              <button type="button" className="cl-linkbtn" onClick={handleRefund}>
                返金を申請
              </button>
            )}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="cl-attachments">
            {showAttachments ? (
              attachments.map((att, i) => <AttachmentCard key={i} att={att} />)
            ) : (
              <div className="cl-attachlocked">添付{attachments.length}件（購入すると閲覧できます）</div>
            )}
          </div>
        )}

        <div className="cl-article-footer">
          {!isMine && (
            <button
              type="button"
              className={`cl-likebtn${cl.hasLiked(a.id) ? " on" : ""}`}
              onClick={() => cl.toggleLike(a.id)}
            >
              参考になった {cl.likeCount(a.id)}
            </button>
          )}
          {isMine && <div className="cl-likebtn static">参考になった {cl.likeCount(a.id)}</div>}

          {related.length > 0 && (
            <>
              <div className="setsec-h">この指導者の他の記事</div>
              <div className="cl-grid">
                {related.map((r) => (
                  <ArticleCard key={r.id} a={r} onOpenAuthor={onOpenAuthor} onOpenArticle={onOpenArticle} />
                ))}
              </div>
            </>
          )}

          <button type="button" className="cl-linkbtn cl-report" onClick={handleReport}>
            問題を報告
          </button>
        </div>
      </div>

      <aside className="cl-article-side">
        <div className="cl-sidecard">
          <AuthorMini profile={profile} onOpen={onOpenAuthor} />
          {!isMine && <FollowButton authorId={authorId} />}
        </div>
        {!fullAccess && (
          <div className="cl-sidecard cl-sidebuy">
            <div className="cl-paywall-price">{priceLabel(a.price)}</div>
            <button type="button" className="bigbtn" onClick={handlePurchase}>
              購入して読む
            </button>
          </div>
        )}
        {fullAccess && purchased && !isMine && (
          <div className="cl-sidecard">
            <span className="cl-purchased-badge">購入済み</span>
          </div>
        )}
      </aside>
    </div>
  );
}
