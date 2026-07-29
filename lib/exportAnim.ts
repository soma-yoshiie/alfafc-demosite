// Phase3 出力強化：アニメーションを GIF / WebM 動画として書き出す。
// フレーム描画は lib/renderFrame.ts の renderFrame を共通利用する。

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { animTotal } from "./animation";
import { frameSize, renderFrame } from "./renderFrame";
import type { BoardState } from "./types";

/** GIF出力のfps */
const GIF_FPS = 12;
/** GIF末尾のホールド秒数（最終フレームを繰り返す） */
const GIF_HOLD = 0.6;
/** WebM末尾のホールド秒数 */
const WEBM_HOLD = 0.5;

/**
 * アニメーションをGIFとして書き出す。
 * onProgress は 0〜1 で進捗を通知する。
 */
export async function exportGif(
  state: BoardState,
  onProgress: (p: number) => void
): Promise<Blob> {
  const { w, h } = frameSize(state.pitchView, 480);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

  const total = animTotal(state.moves, state.stepCount);
  const totalWithHold = total + GIF_HOLD;
  const frameCount = Math.max(1, Math.round(totalWithHold * GIF_FPS));
  const delayMs = Math.round(1000 / GIF_FPS);

  const gif = GIFEncoder();
  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(total, i / GIF_FPS);
    renderFrame(ctx, state, t, { w, h, showPaths: true });
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay: delayMs });
    onProgress((i + 1) / frameCount);
    // 数フレームごとにイベントループへ制御を返してUIをブロックしない
    if (i % 4 === 3) await new Promise((r) => setTimeout(r));
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
}

/** このブラウザで WebM 動画出力が可能か */
export function canExportWebm(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    (MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
      MediaRecorder.isTypeSupported("video/webm"))
  );
}

/**
 * アニメーションをWebM動画として書き出す（実時間駆動）。
 * onProgress は 0〜1 で進捗を通知する。
 */
export function exportWebm(
  state: BoardState,
  onProgress: (p: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!canExportWebm()) {
      reject(new Error("このブラウザは動画出力に未対応です"));
      return;
    }

    const { w, h } = frameSize(state.pitchView, 640);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    const total = animTotal(state.moves, state.stepCount);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    // エラー後にinterval内の描画/onProgressが呼ばれないようにするガード
    let stopped = false;
    const stopStream = () => stream.getTracks().forEach((t) => t.stop());
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stopStream();
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    recorder.onerror = () => {
      stopped = true;
      clearInterval(iv);
      stopStream();
      reject(new Error("動画の書き出しに失敗しました"));
    };

    // rAF はタブ非表示で停止し録画が固まるため、setInterval で実時間駆動する
    const start = performance.now();
    const iv = setInterval(() => {
      if (stopped) return;
      const t = (performance.now() - start) / 1000;
      renderFrame(ctx, state, Math.min(t, total), { w, h, showPaths: true });
      onProgress(Math.min(1, t / total));
      if (t >= total + WEBM_HOLD) {
        stopped = true;
        clearInterval(iv);
        recorder.stop();
      }
    }, 1000 / 30);
    recorder.start();
  });
}

/** Blob をファイルとしてダウンロードさせる（PNG版 downloadDataUrl のBlob版） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
