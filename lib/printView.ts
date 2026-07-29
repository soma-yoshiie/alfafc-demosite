// Phase3 出力強化：印刷用ビュー。
// 別タブに自己完結HTMLを書き出し、window.print() を呼ぶ。

import { stepCountOf, stepStartTime } from "./animation";
import { renderTacticPng } from "./exportImage";
import { frameSize, renderFrame } from "./renderFrame";
import type { BoardState } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** 場面（ステップ）1つ分の静止画（矢印入り）をdataURLで生成する */
function renderScenePng(state: BoardState, step: number): string {
  const { w, h } = frameSize(state.pitchView, 560);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const t = stepStartTime(state.moves, step);
  renderFrame(ctx, state, t, { w, h, showPaths: true });
  return canvas.toDataURL("image/png");
}

/**
 * 印刷用ビューを新規タブで開く。
 * ポップアップがブロックされた場合は何もせず false を返す（呼び出し元でtoast表示）。
 */
export function openPrintView(state: BoardState, title: string | null): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;

  const mainImg = renderTacticPng(state);
  const stepCount = stepCountOf(state.moves, state.stepCount);

  const d = new Date();
  const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;

  let scenesHtml = "";
  if (stepCount >= 2) {
    const scenes: string[] = [];
    for (let s = 0; s < stepCount; s++) {
      const dataUrl = renderScenePng(state, s);
      scenes.push(
        `<div class="scene"><div class="scene-title">場面${s + 1}</div><img src="${dataUrl}" alt="場面${s + 1}" /></div>`
      );
    }
    scenesHtml = `<h2>場面ごとのルート</h2><div class="scene-grid">${scenes.join("")}</div>`;
  }

  const teamName = escapeHtml(state.teamName ?? "マイチーム");
  const titleHtml = title ? ` ／ ${escapeHtml(title)}` : "";
  const formation = escapeHtml(state.formation);
  const docTitle = escapeHtml(title ?? "戦術ボード");

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${docTitle}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    margin: 0;
    padding: 24px;
    color: #111;
    background: #fff;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }
  header h1 { font-size: 20px; margin: 0; }
  header .meta { font-size: 13px; color: #444; text-align: right; line-height: 1.6; }
  .main-img { width: 100%; max-width: 640px; display: block; margin: 0 auto 28px; }
  h2 { font-size: 16px; margin: 24px 0 12px; border-left: 4px solid #15493a; padding-left: 8px; }
  .scene-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .scene { border: 1px solid #ccc; border-radius: 8px; padding: 8px; }
  .scene-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
  .scene img { width: 100%; display: block; }
  @media print {
    body { padding: 8mm; }
    .scene-grid { grid-template-columns: 1fr 1fr; gap: 8mm; }
    .scene { break-inside: avoid; }
    .main-img { break-inside: avoid; }
  }
</style>
</head>
<body>
  <header>
    <h1>${teamName}${titleHtml}</h1>
    <div class="meta">フォーメーション：${formation}<br />${dateStr}</div>
  </header>
  <img class="main-img" src="${mainImg}" alt="フォーメーション" />
  ${scenesHtml}
  <script>
    (function () {
      var imgs = Array.prototype.slice.call(document.images);
      var printed = false;
      function doPrint() {
        if (printed) return;
        printed = true;
        window.print();
      }
      if (imgs.length === 0) {
        doPrint();
      } else {
        Promise.all(
          imgs.map(function (img) {
            if (img.complete) return Promise.resolve();
            return new Promise(function (resolve) {
              img.addEventListener("load", resolve);
              img.addEventListener("error", resolve);
            });
          })
        ).then(doPrint);
      }
      // 何らかの理由で画像の読み込みが完了しない場合のフォールバック
      setTimeout(doPrint, 3000);
    })();
  <\/script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
