// クラブエンブレム用の画像リサイズ処理。
// 依存ライブラリなし・Canvasで直接描画（lib/media.ts の圧縮処理と同じ作法）。

/** リサイズ結果の1辺の最大ピクセル */
const MAX_EDGE = 256;
/**
 * localStorage へ書く dataURL 文字列の長さ上限（約300,000文字）。
 * base64 デコード後のバイト数ではなく「実際に書く文字列長」で判定する
 * （localStorage は UTF-16 で計上されるため実消費はさらに約2倍）。
 */
const MAX_CHARS = 300 * 1000;
/** MAX_EDGE で収まらない場合に段階的に試す縮小サイズ */
const FALLBACK_EDGES = [192, 128, 96];

export class ImageResizeError extends Error {}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load failed"));
    img.src = src;
  });
}

/**
 * 正方形キャンバスにアスペクト比を保ったまま中央配置して dataURL 化する。
 * 透過を持ちうる形式(PNG/WebP)は PNG のまま、それ以外(JPEG等)は JPEG に落として
 * 容量を抑える（lib/media.ts と同じ判断）。余白は PNG なら透明、JPEG なら白。
 */
function drawSquare(img: HTMLImageElement, size: number, keepAlpha: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageResizeError("この端末では画像を処理できません");
  const scale = Math.min(size / img.width, size / img.height, 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const x = Math.round((size - w) / 2);
  const y = Math.round((size - h) / 2);
  ctx.clearRect(0, 0, size, size);
  if (!keepAlpha) {
    // JPEGは透過を持てないため、余白が黒く潰れないよう白を敷く
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  }
  ctx.drawImage(img, x, y, w, h);
  return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * クラブエンブレム画像を最大256×256の正方形 data URL へ変換する。
 * 保存上限を超える場合は段階的にサイズを縮小して再試行し、
 * それでも超える場合・読み込みに失敗した場合は ImageResizeError を投げる。
 */
export async function fileToEmblemDataUrl(file: File): Promise<string> {
  let src: string;
  try {
    src = await readAsDataUrl(file);
  } catch {
    throw new ImageResizeError("画像の読み込みに失敗しました");
  }
  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    throw new ImageResizeError("画像の読み込みに失敗しました");
  }
  // 寸法を持たない画像(intrinsic sizeの無いSVG等)は1pxの空エンブレムになるため弾く
  if (!img.width || !img.height) {
    throw new ImageResizeError("この画像形式には対応していません");
  }

  const keepAlpha = /png|webp/i.test(file.type);
  for (const size of [MAX_EDGE, ...FALLBACK_EDGES]) {
    const out = drawSquare(img, size, keepAlpha);
    if (out.length <= MAX_CHARS) return out;
  }
  throw new ImageResizeError("画像が大きすぎます。別の画像をお試しください");
}
