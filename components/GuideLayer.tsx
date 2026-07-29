"use client";

// ピッチガイド（5レーン・エリア名・凡例）の表示レイヤー。
// board.state.guides のON/OFFに応じて描画するだけの静的レイヤー（操作なし）。
// ラベル文字はSVGだと縦横比で歪むため全てHTML divで描く。

import { yToTop } from "@/lib/pitchView";
import { useBoard } from "./BoardProvider";

const LANE_X = [20, 40, 60, 80];
const THIRD = 100 / 3;
const THIRDS: { y0: number; y1: number; label: string }[] = [
  { y0: 0, y1: THIRD, label: "ディフェンディングサード" },
  { y0: THIRD, y1: THIRD * 2, label: "ミドルサード" },
  { y0: THIRD * 2, y1: 100, label: "アタッキングサード" },
];

export default function GuideLayer() {
  const board = useBoard();
  const guides = board.state.guides ?? {};
  const view = board.state.pitchView;
  if (!guides.lanes && !guides.zones && !guides.legend) return null;

  // half表示（敵陣y50-100のみ表示）では自陣側にかかる境界線・帯は見えないため描かない
  const zoneBoundaries = [THIRD, THIRD * 2].filter((y) => view !== "half" || y > 50);
  const thirds = THIRDS.filter((t) => view !== "half" || t.y1 > 50);
  const vitalTop = yToTop(88, view);
  const vitalBottom = yToTop(74, view);

  return (
    <>
      <svg className="pathsvg guides" viewBox="0 0 100 100" preserveAspectRatio="none">
        {guides.lanes && (
          <>
            <rect x={20} y={0} width={20} height={100} fill="#ffffff" fillOpacity={0.05} />
            <rect x={60} y={0} width={20} height={100} fill="#ffffff" fillOpacity={0.05} />
            {LANE_X.map((x) => (
              <line
                key={x}
                x1={x}
                y1={0}
                x2={x}
                y2={100}
                stroke="#ffffff"
                strokeOpacity={0.25}
                strokeWidth={0.25}
                strokeDasharray="1.4 1.2"
              />
            ))}
          </>
        )}
        {guides.zones && (
          <>
            {zoneBoundaries.map((y) => (
              <line
                key={y}
                x1={0}
                y1={yToTop(y, view)}
                x2={100}
                y2={yToTop(y, view)}
                stroke="#ffffff"
                strokeOpacity={0.25}
                strokeWidth={0.25}
                strokeDasharray="1.4 1.2"
              />
            ))}
            <rect
              x={30}
              y={vitalTop}
              width={40}
              height={vitalBottom - vitalTop}
              fill="#ffffff"
              fillOpacity={0.06}
            />
          </>
        )}
      </svg>
      {guides.zones && (
        <>
          {thirds.map((t) => (
            <div
              key={t.label}
              className="guidelabel"
              style={{ left: "3%", top: `${yToTop((t.y0 + t.y1) / 2, view)}%` }}
            >
              {t.label}
            </div>
          ))}
          <div className="guidelabel vital" style={{ left: "50%", top: `${yToTop(81, view)}%` }}>
            バイタルエリア
          </div>
        </>
      )}
      {guides.legend && (
        <div className="legendbox">
          <div className="legendrow">
            <svg className="legendline" viewBox="0 0 24 6">
              <line x1="1" y1="3" x2="23" y2="3" stroke="#ffe27a" strokeWidth="2" />
            </svg>
            <span>ラン</span>
          </div>
          <div className="legendrow">
            <svg className="legendline" viewBox="0 0 24 6">
              <line x1="1" y1="3" x2="23" y2="3" stroke="#ffe27a" strokeWidth="2" strokeDasharray="3 2" />
            </svg>
            <span>パス</span>
          </div>
          <div className="legendrow">
            <svg className="legendline" viewBox="0 0 24 6">
              <path d="M1 3 Q4 0 7 3 T13 3 T19 3 T23 3" stroke="#ffe27a" strokeWidth="1.4" fill="none" />
            </svg>
            <span>ドリブル</span>
          </div>
          <div className="legendrow">
            <svg className="legendline" viewBox="0 0 24 6">
              <line x1="1" y1="1.6" x2="23" y2="1.6" stroke="#ffe27a" strokeWidth="1.4" />
              <line x1="1" y1="4.4" x2="23" y2="4.4" stroke="#ffe27a" strokeWidth="1.4" />
            </svg>
            <span>シュート＝二重線</span>
          </div>
        </div>
      )}
    </>
  );
}
