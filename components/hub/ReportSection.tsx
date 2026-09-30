"use client";

import React from "react";
import SeasonReport from "../SeasonReport";
import type { HubSectionProps } from "./common";

/**
 * セクション「レポート」（player-hub §3-9）：SeasonReport をそのままマウントする（印刷・画像保存は今のまま）。
 * SeasonReport の CSS は .noteapp 配下にしか無いので .noteapp の div で包み、.noteapp に付く余計な指定は
 * .phub-report で打ち消す（基底の CSS を参照）。スタッフから選手のシーズンレポートを開く入口（ダッシュボード撤去で消えた分）。
 */
export default function ReportSection({ p }: HubSectionProps) {
  return (
    <section className="phubsec" aria-label="レポート">
      <div className="noteapp phub-report">
        <SeasonReport playerId={p.id} />
      </div>
    </section>
  );
}
