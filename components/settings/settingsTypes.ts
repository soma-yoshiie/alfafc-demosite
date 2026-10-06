import type { MutableRefObject } from "react";

/** 設定画面の状態（specs/settings-plan-a.md §2-1）。top＝スマホは一覧／PC は左のカテゴリで選んだ区画の行 */
export type SettingsView =
  | { mode: "top" }
  | { mode: "account" }
  | { mode: "teamBasics" }
  | { mode: "stage" }
  | { mode: "invite" }
  | { mode: "staff" }
  | { mode: "notif" }
  | { mode: "plan" }
  | { mode: "data" }
  // チーム運営の管理シートと同じ編集画面を設定の下層として出す（specs/settings-inline-manage.md §2）
  | { mode: "groups" }
  | { mode: "categories" }
  | { mode: "competitions" }
  | { mode: "league" }
  | { mode: "fitnessTests" };

/** PC の左のカテゴリ（§4）。about は選手の「バージョン」。groups〜fitnessTests は押すとすぐ右に編集画面（管理シートと同じ中身）を出す */
export type SettingsCat =
  | "account"
  | "basics"
  | "groups"
  | "categories"
  | "competitions"
  | "league"
  | "fitnessTests"
  | "staff"
  | "invite"
  | "public"
  | "notif"
  | "plan"
  | "data"
  | "about";

/** 保存のある下層フォームへ渡す共通の props */
export interface SettingsFormProps {
  pc: boolean;
  /** 未保存の変更があるか（戻るときの確認に使う） */
  onDirty: (dirty: boolean) => void;
  /** スマホのヘッダーの「保存」から呼ばれる保存の処理（フォームが毎回セットする） */
  saveRef: MutableRefObject<(() => void) | null>;
  /** 保存したあと一覧へ戻る */
  onDone: () => void;
}
