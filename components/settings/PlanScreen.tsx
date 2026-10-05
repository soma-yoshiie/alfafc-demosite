"use client";

import { useBoard } from "../BoardProvider";
import { PLAN_INFO, PLAN_ORDER } from "@/lib/types";

/** プラン（§3-7）。月額＝名簿の選手数 × 1 人あたりの月額。切り替えはデモ（課金なし） */
export default function PlanScreen() {
  const board = useBoard();
  const cur = board.plan;
  const players = board.state.players.length;
  const now = PLAN_INFO[cur];
  const total = players * now.perPlayer;

  return (
    <div className="st-form">
      <section className="st-plannow" aria-label="現在のプラン">
        <div className="st-plannow-k">現在のプラン</div>
        <div className="st-plannow-name">{now.name}プラン</div>
        <div className="st-plannow-sum">
          選手 {players} 人 × {now.perPlayer.toLocaleString("ja-JP")} 円 ＝ {total.toLocaleString("ja-JP")} 円／月（税別）
        </div>
      </section>
      <div className="st-plans">
        {PLAN_ORDER.map((tier) => {
          const p = PLAN_INFO[tier];
          const on = cur === tier;
          return (
            <section key={tier} className={`st-plan${on ? " on" : ""}`}>
              <div className="st-plan-head">
                <div className="st-plan-name">{p.name}</div>
                {on && <span className="st-plan-now">利用中</span>}
              </div>
              <div className="st-plan-price">
                1 人 {p.perPlayer.toLocaleString("ja-JP")} 円<small>／月</small>
              </div>
              <p className="st-plan-lead">{p.lead}</p>
              <div className="st-plan-video">{p.video}</div>
              {!on && (
                <button
                  type="button"
                  className="st-btn"
                  onClick={() => {
                    if (!window.confirm(`${p.name}プランに変更しますか？（デモのため課金はありません）`)) return;
                    board.setPlan(tier);
                    board.toast(`${p.name}プランに変更しました`);
                  }}
                >
                  このプランに変更
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="st-note">月額は名簿の選手数で決まります。金額は税別です。</p>
      <p className="st-note">これはデモのプラン切替で、実際の課金は行われません。</p>
    </div>
  );
}
