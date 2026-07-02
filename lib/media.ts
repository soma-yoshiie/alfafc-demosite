// 画像・動画ファイルを data URL に変換するヘルパー。
// localStorage はおよそ5MBが上限のため、画像は縮小し、動画はサイズ上限を設ける。

/** 動画の data URL 上限（約3.5MB） */
const VIDEO_LIMIT_BYTES = 3.5 * 1024 * 1024;
/** 画像の長辺の最大ピクセル */
const IMAGE_MAX_EDGE = 1280;

export interface MediaResult {
  kind: "image" | "video";
  dataUrl: string;
  title: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/** 画像を縮小して JPEG/PNG の data URL にする */
async function compressImage(file: File): Promise<string> {
  const src = await readAsDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const edge = Math.max(width, height);
      if (edge > IMAGE_MAX_EDGE) {
        const r = IMAGE_MAX_EDGE / edge;
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      // 透過がなければJPEGで圧縮、あればPNG
      const hasAlpha = file.type.includes("png");
      resolve(canvas.toDataURL(hasAlpha ? "image/png" : "image/jpeg", 0.72));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/**
 * 画像/動画ファイルを送信可能な data URL にする。
 * 成功時は MediaResult、上限超過などで失敗時は文字列のエラーメッセージを返す。
 */
export async function fileToAttachment(
  file: File
): Promise<MediaResult | string> {
  if (file.type.startsWith("image/")) {
    try {
      const dataUrl = await compressImage(file);
      return { kind: "image", dataUrl, title: file.name };
    } catch {
      return "画像の読み込みに失敗しました";
    }
  }
  if (file.type.startsWith("video/")) {
    if (file.size > VIDEO_LIMIT_BYTES) {
      return "動画は約3.5MBまで送信できます（端末内デモのため）";
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      return { kind: "video", dataUrl, title: file.name };
    } catch {
      return "動画の読み込みに失敗しました";
    }
  }
  return "画像または動画を選択してください";
}
