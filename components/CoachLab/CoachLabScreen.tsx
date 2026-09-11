"use client";

import { useBoard } from "../BoardProvider";

/**
 * コーチラボ本体（Phase A時点では仮実装）。
 * §5 の全画面（探す／フォロー中／指導者ページ／記事ページ／書く／収益／プロフィール）と
 * .cl-* CSS は Phase B で実装する。ここではヘッダーと入口の到達確認のみ行う。
 */
export default function CoachLabScreen() {
  const board = useBoard();
  return (
    <div className="app clapp">
      <header>
        <div className="fpback" onClick={() => board.setScreen("home")}>
          ‹ ホーム
        </div>
        <div className="brand" style={{ marginLeft: 4 }}>
          <div className="logo">コーチラボ</div>
          <div className="tag team" style={{ marginTop: 4 }}>
            指導者の記事を読む・書く・売る
          </div>
        </div>
      </header>
      <div className="scroll">
        <div className="empty-msg">準備中です。まもなく公開します。</div>
      </div>
    </div>
  );
}
