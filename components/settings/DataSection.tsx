"use client";

import { useBoard } from "../BoardProvider";
import { downloadBlob } from "@/lib/exportAnim";
import { localDateStr } from "@/lib/dates";
import { resetAppData } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

/**
 * このブラウザの保存データ（soccer_tactics_ で始まるキー）を JSON にまとめてダウンロードする。
 * ログイン情報（alfa_coach_account_v1／alfa_session_v1）は接頭辞が違うので含まれない。
 * 選手の共通パスワード（settings の playerPassword）も平文なので外す
 */
function exportAllData(): void {
  const data: Record<string, unknown> = {};
  const ls = window.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !k.startsWith("soccer_tactics_")) continue;
    const raw = ls.getItem(k);
    if (raw === null) continue;
    try {
      const v = JSON.parse(raw);
      if (k === "soccer_tactics_settings_v1" && v && typeof v === "object") delete (v as { playerPassword?: string }).playerPassword;
      data[k] = v;
    } catch {
      data[k] = raw;
    }
  }
  const body = { exportedAt: new Date().toISOString(), version: APP_VERSION, data };
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
  downloadBlob(blob, `alfa-football-backup-${localDateStr().replace(/-/g, "")}.json`);
}

/** データ（§3-8）：書き出しと、デモデータの入れ直し */
export default function DataSection() {
  const board = useBoard();
  return (
    <div className="st-form">
      <p className="st-lead">
        このブラウザに保存されたチーム・名簿・予定・ノート・記録などを、バックアップとしてファイルに保存します。スタッフのログイン情報と選手の共通パスワードは含まれません。
      </p>
      <button
        type="button"
        className="st-btn"
        onClick={() => {
          try {
            exportAllData();
            board.toast("書き出しました");
          } catch {
            board.toast("書き出せませんでした");
          }
        }}
      >
        データを書き出す
      </button>
      {/* デモデータの入れ直し。旧デモが残るブラウザは起動時に自動で中学年代の名簿へ移行するが
          （lib/storage.ts の migrateOldDemo）、手で作ったデータが混ざって判定に掛からない場合の
          逃げ道として、保存データを全部消して初回起動と同じ新しいデモに戻す入口を置く。
          ログイン情報は残す。元に戻せないので window.confirm で確認する（このアプリの破壊的操作の作法） */}
      <SettingsGroup hint="このブラウザのデータを消して、最新のデモ（中学 1〜3 年・70 人）を入れ直します。ログイン情報は残ります。">
        <SettingsRow
          label="保存データを消してデモに戻す"
          danger
          onClick={() => {
            const ok = window.confirm(
              "保存されているチーム・名簿・予定・ノート・記録をすべて消して、最新のデモデータ（中学1〜3年・70人）に入れ直します。この操作は元に戻せません。\n実行しますか？"
            );
            if (!ok) return;
            resetAppData();
            window.location.reload();
          }}
        />
      </SettingsGroup>
    </div>
  );
}
