import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

/** チーム設定（旗） */
export function IconFlag(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </Svg>
  );
}

/** 名簿（人物） */
export function IconUsers(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

/** 新規作成（プラス枠） */
export function IconPlusSquare(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </Svg>
  );
}

/** 練習メニュー（コーン） */
export function IconCone(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 3 6.5 20h11z" />
      <path d="M8.7 12h6.6" />
      <path d="M4.5 20h15" />
    </Svg>
  );
}

/** チーム（カレンダー＋チェック） */
export function IconCalendarCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </Svg>
  );
}

/** 整列（回転） */
export function IconRotate(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </Svg>
  );
}

/** プラン（星） */
export function IconStar(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  );
}

/** 保存（フロッピー） */
export function IconSave(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </Svg>
  );
}

/** ライブラリ（フォルダ） */
export function IconFolder(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.6l-1.7-2.1a1 1 0 0 0-.8-.4H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z" />
    </Svg>
  );
}

/** 画像で保存（ダウンロード） */
export function IconDownload(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Svg>
  );
}

/** 元に戻す */
export function IconUndo(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a6 6 0 0 1 0 12h-4" />
    </Svg>
  );
}

/** やり直し（元に戻すの逆） */
export function IconRedo(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a6 6 0 0 0 0 12h4" />
    </Svg>
  );
}

/** 送信（紙飛行機） */
export function IconSend(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Svg>
  );
}

/** 複製（コピー） */
export function IconCopy(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

/** 削除（ゴミ箱） */
export function IconTrash(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

/** 共有 */
export function IconShare(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </Svg>
  );
}

/** ルート（波線） */
export function IconRoute(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M2 12c2.5 0 2.5-6 5-6s2.5 6 5 6 2.5-6 5-6 2.5 6 5 6" />
    </Svg>
  );
}

/** 再生 */
export function IconPlay(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 設定（歯車） */
export function IconCog(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  );
}

/** 記事（本） */
export function IconBook(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </Svg>
  );
}

/** 表示（目） */
export function IconEye(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

/** 非表示（目に斜線） */
export function IconEyeOff(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a16.8 16.8 0 0 1-2.7 3.7" />
      <path d="M6.1 6.1A16.7 16.7 0 0 0 2 11s3.5 7 10 7a10.8 10.8 0 0 0 4.6-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </Svg>
  );
}

/** ログアウト */
export function IconLogout(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </Svg>
  );
}

/** チャット（吹き出し） */
export function IconChat(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5Z" />
      <path d="M8.5 11.5h7M8.5 8.5h7M8.5 14.5h4" />
    </Svg>
  );
}

/** サッカーノート（ノート） */
export function IconNote(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 4a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2Z" />
      <path d="M4 7h3M4 12h3M4 17h3" />
      <path d="M10 8h6M10 12h6M10 16h3" />
    </Svg>
  );
}

/** 一時停止 */
export function IconPause(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 通し再生（二重再生） */
export function IconPlayAll(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <polygon points="3 5 12 12 3 19 3 5" fill="currentColor" stroke="none" />
      <polygon points="12 5 21 12 12 19 12 5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** ペン（鉛筆） */
export function IconPen(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Svg>
  );
}

/** 全画面（拡大） */
export function IconExpand(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </Svg>
  );
}

/** 移動（十字矢印） */
export function IconMove(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M12 2v20M2 12h20" />
      <path d="m9 5 3-3 3 3M9 19l3 3 3-3M5 9 2 12l3 3M19 9l3 3-3 3" />
    </Svg>
  );
}

/** 図形パレット（四角＋丸） */
export function IconShapes(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="3" y="10" width="9" height="9" rx="1.5" />
      <circle cx="16.5" cy="7.5" r="4.5" />
    </Svg>
  );
}

/** 楕円ゾーン */
export function IconEllipse(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="12" rx="9" ry="6" />
    </Svg>
  );
}

/** 矩形ゾーン */
export function IconRectZone(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
    </Svg>
  );
}

/** テキストラベル */
export function IconTextLabel(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 6h16" />
      <path d="M12 6v14" />
      <path d="M9 20h6" />
    </Svg>
  );
}

/** 曲線矢印 */
export function IconCurvedArrow(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 18C4 10 10 5 20 6" />
      <path d="M15 3.5 20 6l-3 4.5" />
    </Svg>
  );
}

/** 連結ライン（2点を線で結ぶ） */
export function IconLinkNodes(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
      <circle cx="5" cy="19" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="2.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 囲み枠（五角形） */
export function IconHullShape(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <polygon points="12 2 21 9 17.5 20 6.5 20 3 9" />
    </Svg>
  );
}

/** 残像（点線の丸＝ゴースト表示） */
export function IconGhost(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="7.5" strokeDasharray="2.6 3" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** アニメ（映写機。ヘッダーの「戦術アニメ」アイコンと同じパス） */
export function IconFilm(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg strokeWidth={1.9} {...p}>
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3.4 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Svg>
  );
}

/** ハーフコート（長方形の下半分が点線＝敵陣ハーフの拡大表示） */
export function IconHalfPitch(p: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...p}>
      <path d="M4 12V4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5V12" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <path
        d="M4 12v5.5A1.5 1.5 0 0 0 5.5 19h13a1.5 1.5 0 0 0 1.5-1.5V12"
        strokeDasharray="2.2 2.4"
      />
    </Svg>
  );
}
