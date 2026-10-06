import type { MutableRefObject } from "react";
import type { Player } from "@/lib/types";

export type ManageProps = {
  /** GroupsManage だけ必須（メンバー編集）。ほかは省略可 */
  players?: Player[];
  /** 設定の中で出すとき true：中の <h2>（「グループ管理」など）を出さない（ヘッダーに画面名があるため） */
  hideTitle?: boolean;
  /** 保存して閉じる操作があるとき（順位表の「保存する」）：保存後に呼ぶ */
  onSaved?: () => void;
  /** 未保存の変更の有無を知らせる（順位表だけ。設定の未保存の確認に使う） */
  onDirty?: (dirty: boolean) => void;
  /** 「戻る」を部品の中で先に処理したいとき（グループのメンバー編集中 → 一覧へ）。親が back のときに呼び、true を返したら親は閉じない */
  backRef?: MutableRefObject<(() => boolean) | null>;
};
