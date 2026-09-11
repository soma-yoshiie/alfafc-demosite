"use client";

import { useMemo } from "react";
import { useBoard } from "../BoardProvider";
import { useCoachLab } from "./CoachLabProvider";
import { MIN_PAYOUT, PAYOUT_FEE_YEN, SALE_FEE_RATE, allArticles, resolveAuthorId, splitSale } from "@/lib/coachlab";
import { fmtYen, priceLabel, useMeId } from "./CoachLabParts";

/**
 * 収益画面（コーチのみ）。KPI・記事別テーブル・手数料説明・振込申請。
 * 詳細は specs/coachlab.md §5-6。
 */
export default function CoachLabEarnings() {
  const board = useBoard();
  const cl = useCoachLab();
  const meId = useMeId();

  const merged = useMemo(() => allArticles(board.userArticles), [board.userArticles]);
  const myArticles = useMemo(
    () => merged.filter((a) => resolveAuthorId(a, meId) === meId),
    [merged, meId]
  );
  const earnings = cl.earningsFor(meId);
  const totalLikes = myArticles.reduce((sum, a) => sum + cl.likeCount(a.id), 0);
  const followerCount = cl.followerCount(meId);

  const rows = myArticles
    .map((a) => {
      const sales = cl.purchases
        .filter((p) => p.articleId === a.id)
        .reduce((sum, p) => sum + p.price, 0);
      return {
        id: a.id,
        title: a.title,
        price: a.price ?? 0,
        views: cl.views[a.id] ?? 0,
        purchases: cl.purchaseCount(a.id),
        sales,
        likes: cl.likeCount(a.id),
      };
    })
    .sort((a, b) => b.sales - a.sales);

  const example = splitSale(1000);
  const payoutFeeText =
    PAYOUT_FEE_YEN > 0 ? `振込手数料は${fmtYen(PAYOUT_FEE_YEN)}かかります。` : "振込手数料はかかりません。";

  const handlePayout = () => {
    if (earnings.payable < MIN_PAYOUT) return;
    if (!window.confirm(`${fmtYen(earnings.payable)}の振込を申請します。よろしいですか？`)) return;
    cl.requestPayout(earnings.payable);
    board.toast("振込を申請しました");
  };

  return (
    <>
      <div className="cl-kpirow">
        <div className="cl-kpi">
          <div className="cl-kpi-label">売上合計</div>
          <div className="cl-kpi-value">{fmtYen(earnings.totalSales)}</div>
        </div>
        <div className="cl-kpi">
          <div className="cl-kpi-label">受取見込み</div>
          <div className="cl-kpi-value">{fmtYen(earnings.expectedPayout)}</div>
        </div>
        <div className="cl-kpi">
          <div className="cl-kpi-label">販売数</div>
          <div className="cl-kpi-value">{earnings.count}</div>
        </div>
        <div className="cl-kpi">
          <div className="cl-kpi-label">参考になった合計</div>
          <div className="cl-kpi-value">{totalLikes}</div>
        </div>
        <div className="cl-kpi">
          <div className="cl-kpi-label">フォロワー数</div>
          <div className="cl-kpi-value">{followerCount}</div>
        </div>
      </div>

      <div className="setsec-h">記事別</div>
      {rows.length === 0 ? (
        <div className="empty-msg">まだ記事がありません。</div>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>価格</th>
                <th>閲覧</th>
                <th>購入数</th>
                <th>売上</th>
                <th>参考になった</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cl-table-title">{r.title}</td>
                  <td>{priceLabel(r.price)}</td>
                  <td>{r.views}</td>
                  <td>{r.purchases}</td>
                  <td>{fmtYen(r.sales)}</td>
                  <td>{r.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(rows.length === 0 || earnings.count === 0) && (
        <div className="cl-tablehint">
          自分の記事は自分では購入できません。別のアカウントで購入されると、ここに売上が反映されます。
        </div>
      )}

      <div className="cl-feecard">
        販売手数料は{Math.round(SALE_FEE_RATE * 100)}%（決済手数料込み）。例：¥1,000の記事が1本売れると受取は{fmtYen(example.creator)}。
        {payoutFeeText}売上は毎月末に自動で振り込まれます（{fmtYen(MIN_PAYOUT)}未満は翌月に繰り越し）。
      </div>

      <div className="cl-payoutcard">
        <div className="cl-payoutrow">
          <span>振込済み</span>
          <span>{fmtYen(earnings.paidOut)}</span>
        </div>
        <div className="cl-payoutrow">
          <span>振込可能額</span>
          <span>{fmtYen(earnings.payable)}</span>
        </div>
        <button type="button" className="bigbtn" disabled={earnings.payable < MIN_PAYOUT} onClick={handlePayout}>
          振込を申請する
        </button>
        {earnings.payable < MIN_PAYOUT && (
          <div className="cl-payouthint">振込申請には{fmtYen(MIN_PAYOUT)}以上の振込可能額が必要です。</div>
        )}
      </div>
    </>
  );
}
