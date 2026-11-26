"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NotePhoto } from "@/lib/types";
import { fileToAttachment } from "@/lib/media";
import { storageHasRoom } from "@/lib/storage";
import { HubMenu } from "../hub/common";

/* note-free §3: 写真の箱と、押すと開く大きく見る画面。縮小は lib/media.ts の処理（長辺 1280px・JPEG 0.72）を使う */

/** 1 枚の縮小後の大きさの上限（文字数）。超えたら、もう一段小さくしてから入れる（note-free §9 判断 16） */
const PHOTO_MAX = 700_000;
/** 写真を入れた後も、ほかの保存（予定・出欠・チャットなど）のために残しておく大きさ（文字数） */
const STORAGE_RESERVE = 500_000;

/** data URL を JPEG で描き直す（長辺は maxEdge まで）。読めない画像は null */
function toJpeg(src: string, maxEdge: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const edge = Math.max(img.naturalWidth, img.naturalHeight);
      const r = edge > maxEdge ? maxEdge / edge : 1;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * r));
      c.height = Math.max(1, Math.round(img.naturalHeight * r));
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 選んだ画像ファイルを縮小して data URL に。画像でないとき・失敗したときは文字列（知らせの文言）を返す */
export async function pickPhoto(file: File): Promise<{ src: string } | string> {
  if (!file.type.startsWith("image/")) return "画像を選んでください";
  const r = await fileToAttachment(file);
  if (typeof r === "string") return r;
  if (r.kind !== "image") return "画像を選んでください";
  // PNG・読めなかった画像（HEIC など）は JPEG に描き直す。描き直せなければ読み込めない画像
  let src = r.dataUrl;
  if (!src.startsWith("data:image/jpeg")) {
    const j = await toJpeg(src, 1280, 0.72);
    if (!j) return "この画像は読み込めません";
    src = j;
  }
  // 細かい柄の写真などで大きいときは、もう一段小さくする（長辺 960px・品質 0.6）。それでも大きければ入れない
  if (src.length > PHOTO_MAX) src = (await toJpeg(src, 960, 0.6)) ?? src;
  if (src.length > PHOTO_MAX) return "この画像は大きすぎます。別の写真を選んでください";
  // 端末の保存は、予定・出欠・チャットなどと分け合っている。入れた後の残りが少なくなるなら入れない
  if (!storageHasRoom(src.length + STORAGE_RESERVE)) return "端末の保存がいっぱいに近いため、写真を入れられません。古い写真を消してください";
  return { src };
}

/** 大きく見る画面：暗幕の上に画像。右上「閉じる」、右下「拡大」（2 倍。縦横にスクロール） */
export function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [big, setBig] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    // 開いたら画面そのものへ焦点を移し（ボタンに輪を出さない。目標の重ね表示と同じ作り）、閉じたら元の所（写真の箱）へ戻す
    const opener = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="photoview" role="dialog" aria-modal="true" aria-label="写真" tabIndex={-1} ref={boxRef}>
      <div className={"photoview-scroll" + (big ? " big" : "")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="ノートの写真" />
      </div>
      <button type="button" className="photoview-btn close" onClick={onClose}>
        閉じる
      </button>
      <button type="button" className="photoview-btn zoom" aria-pressed={big} onClick={() => setBig((b) => !b)}>
        {big ? "元に戻す" : "拡大"}
      </button>
    </div>,
    document.body
  );
}

/** 写真の箱。押すと大きく見る。menu を渡すと右上に「…」 */
export function PhotoBox({
  photo,
  menu,
  className,
}: {
  photo: NotePhoto;
  menu?: { label: string; onClick: () => void; disabled?: boolean }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"photobox" + (className ? " " + className : "")}>
      <button type="button" className="photobox-open" aria-label="写真を大きく見る" onClick={() => setOpen(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} alt="ノートの写真" />
      </button>
      {menu && (
        <div className="figbox-more">
          <HubMenu label="写真のメニュー" items={menu} />
        </div>
      )}
      {open && <PhotoViewer src={photo.src} onClose={() => setOpen(false)} />}
    </div>
  );
}
