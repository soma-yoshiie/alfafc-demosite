import type { SVGProps } from "react";
import type { NoteCondition } from "@/lib/types";

/**
 * UIのカラー絵文字をSVGアイコンに統一するためのコンポーネント。
 * テキスト中に置けるよう 1em サイズ・currentColor で描画する（`<E n="bell" />`）。
 */
export type EmojiName =
  | "bell" | "chart" | "search" | "doc" | "printer" | "gift" | "fire" | "robot"
  | "note" | "star" | "repeat" | "target" | "bulb" | "megaphone" | "vs"
  | "attack" | "shield" | "check" | "hand" | "lock" | "ball" | "clipboard"
  | "run" | "image" | "video" | "users" | "bandage" | "folder" | "folderopen"
  | "mail" | "trophy" | "pin" | "refresh" | "comment" | "calendar" | "trash";

function S(props: SVGProps<SVGSVGElement>) {
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

const ICONS: Record<EmojiName, React.ReactNode> = {
  bell: <S><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></S>,
  chart: <S><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="13" y="7" width="3" height="10" /></S>,
  search: <S><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></S>,
  doc: <S><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></S>,
  printer: <S><path d="M6 9V3h12v6" /><rect x="6" y="13" width="12" height="8" /><path d="M3 9h18v7h-3" /><path d="M6 16H3V9" /></S>,
  gift: <S><rect x="3" y="8" width="18" height="4" /><path d="M5 12v9h14v-9" /><path d="M12 8v13" /><path d="M12 8S10.5 3 8 4.5 12 8 12 8Zm0 0s1.5-5 4-3.5S12 8 12 8Z" /></S>,
  fire: <S><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.7C9 9 9 11 10 11c0-3 2-4.5 2-9Z" /></S>,
  robot: <S><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 8V4M9 3h6" /><circle cx="9" cy="13" r="1.2" /><circle cx="15" cy="13" r="1.2" /></S>,
  note: <S><path d="M4 4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></S>,
  star: <S><polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9 12 2" fill="currentColor" stroke="none" /></S>,
  repeat: <S><path d="m17 2 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></S>,
  target: <S><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></S>,
  bulb: <S><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /></S>,
  megaphone: <S><path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z" /><path d="M18 8a4 4 0 0 1 0 8" /></S>,
  vs: <S><path d="M4 7l2.5 10L9 7" /><path d="M20 7h-3a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-3" /></S>,
  attack: <S><path d="M3 3l8 8M3 3v4M3 3h4" /><path d="M21 3l-8 8M21 3v4M21 3h-4" /><path d="m9 13-4 4-2 2 2 .5L7 21l2-2 4-4" /></S>,
  shield: <S><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></S>,
  check: <S><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></S>,
  hand: <S><path d="M8 11V5a1.5 1.5 0 0 1 3 0v5m0-1V4a1.5 1.5 0 0 1 3 0v6m0-2a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4-2L5 16c-.7-1 .5-2.5 1.7-1.8L8 15V8a1.5 1.5 0 0 1 3 0" /></S>,
  lock: <S><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>,
  ball: <S><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 5h-5L8 10z" fill="currentColor" stroke="none" /></S>,
  clipboard: <S><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M8 11h8M8 15h6" /></S>,
  run: <S><circle cx="14" cy="5" r="2" /><path d="M11 8l-3 3 2 3-2 5" /><path d="m11 8 4 2 1 4 3 1" /><path d="M10 11 6 10" /></S>,
  image: <S><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m5 18 5-5 4 3 2-2 3 4" /></S>,
  video: <S><rect x="3" y="6" width="18" height="12" rx="2" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></S>,
  users: <S><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></S>,
  bandage: <S><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9.5" cy="9.5" r="0.6" fill="currentColor" stroke="none" /><circle cx="14.5" cy="14.5" r="0.6" fill="currentColor" stroke="none" /></S>,
  folder: <S><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.6l-1.7-2.1a1 1 0 0 0-.8-.4H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z" /></S>,
  folderopen: <S><path d="M4 8V6a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2" /><path d="m3 9 2 11h14l2-9H6l-3 9" /></S>,
  mail: <S><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></S>,
  trophy: <S><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /></S>,
  pin: <S><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></S>,
  refresh: <S><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></S>,
  comment: <S><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" /></S>,
  calendar: <S><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></S>,
  trash: <S><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></S>,
};

export function E({ n, className }: { n: EmojiName; className?: string }) {
  return <span className={`emj${className ? " " + className : ""}`}>{ICONS[n]}</span>;
}

/* コンディション（5段階）の顔アイコン */
const FACE: Record<NoteCondition, React.ReactNode> = {
  great: <S><circle cx="12" cy="12" r="9" /><path d="M8 10h.01M16 10h.01" /><path d="M7.5 14a5 5 0 0 0 9 0z" fill="currentColor" stroke="none" /></S>,
  good: <S><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01" /><path d="M8.5 14.5a4 4 0 0 0 7 0" /></S>,
  normal: <S><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01" /><path d="M9 15h6" /></S>,
  tired: <S><circle cx="12" cy="12" r="9" /><path d="M8 11l2-1M14 10l2 1" /><path d="M9 15.5h6" /></S>,
  bad: <S><circle cx="12" cy="12" r="9" /><path d="M9 11l1.5-1M13.5 10 15 11" /><path d="M8.5 16a4 4 0 0 1 7 0" /></S>,
};

export function ConditionIcon({ c, className }: { c: NoteCondition; className?: string }) {
  return <span className={`emj${className ? " " + className : ""}`}>{FACE[c]}</span>;
}
