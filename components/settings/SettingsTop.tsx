"use client";

import { useEffect, useState } from "react";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { PLAN_INFO } from "@/lib/types";
import type { SchoolStage } from "@/lib/types";
import { loadNotifPrefs } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { SettingsAccountCard, SettingsGroup, SettingsRow, SettingsToggleRow } from "./SettingsRows";
import { notifValue } from "./NotifPrefsForm";
import type { SettingsCat, SettingsView } from "./settingsTypes";

const STAGE_LABEL: Record<SchoolStage, string> = {
  elementary: "小学生",
  junior: "中学生",
  high: "高校生",
};

const DATA_HINT = "このブラウザのデータを、バックアップとしてファイルに保存します。";

/**
 * 設定の一覧（スタッフ。§2-3）。スマホは全区画を縦に並べ、PC は左のカテゴリ（cat）で選んだ区画の行だけを出す。
 * 行の右の値は今の設定から計算する。
 */
export default function SettingsTop({
  cat,
  go,
}: {
  /** PC：選んだカテゴリ。省略（スマホ）は全区画 */
  cat?: SettingsCat;
  go: (v: SettingsView) => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const [prefsVer, setPrefsVer] = useState(0);
  useEffect(() => {
    const bump = () => setPrefsVer((v) => v + 1);
    window.addEventListener("alfa-notifprefs", bump);
    return () => window.removeEventListener("alfa-notifprefs", bump);
  }, []);

  const t = team.team;
  const players = board.state.players.length;
  const customCats = team.categories.filter((c) => !c.builtin).length;
  const groupNames = team.groups.map((g) => g.label).join("・") || "未登録";
  const comps = t.competitions.length;
  const tests = (t.fitnessTests ?? []).length;
  const prefs = loadNotifPrefs();
  void prefsVer; // 通知の設定が変わったら再計算する（alfa-notifprefs）
  const showAll = cat === undefined;

  const account = (
    <SettingsAccountCard
      name={board.auth.name}
      sub="監督・管理者"
      email={board.auth.email}
      onClick={() => go({ mode: "account" })}
    />
  );
  const teamBasics = (
    <SettingsRow
      label="チーム名とエンブレム"
      value={board.state.teamName ?? "マイチーム"}
      onClick={() => go({ mode: "teamBasics" })}
    />
  );
  const stage = (
    <SettingsRow label="学校区分" value={STAGE_LABEL[team.schoolStage]} onClick={() => go({ mode: "stage" })} />
  );
  const groups = <SettingsRow label="学年・グループ" value={groupNames} onClick={() => go({ mode: "groups" })} />;
  const categories = (
    <SettingsRow
      label="予定の種類"
      value={customCats > 0 ? `練習・試合 ほか ${customCats}` : "練習・試合"}
      onClick={() => go({ mode: "categories" })}
    />
  );
  const competitions = (
    <SettingsRow
      label="大会"
      value={comps > 0 ? `${comps} 件` : "未登録"}
      onClick={() => go({ mode: "competitions" })}
    />
  );
  const league = (
    <SettingsRow
      label="順位表"
      value={team.league.rows.length > 0 ? team.league.title?.trim() || "リーグ順位表" : "未登録"}
      onClick={() => go({ mode: "league" })}
    />
  );
  const fitnessTests = (
    <SettingsRow
      label="体力テストの種目"
      value={tests > 0 ? `${tests} 種目` : "未登録"}
      onClick={() => go({ mode: "fitnessTests" })}
    />
  );
  const staff = <SettingsRow label="スタッフ" value={`${t.coaches.length} 人`} onClick={() => go({ mode: "staff" })} />;
  const invite = (
    <SettingsRow
      label="選手・保護者の招待"
      value={board.playerPassword ? "共通パスワード 設定済み" : "共通パスワード 既定のまま"}
      onClick={() => go({ mode: "invite" })}
    />
  );
  const matchesPublic = (
    <SettingsToggleRow
      label="試合記録を選手・保護者に公開"
      checked={board.matchesPublic}
      onChange={board.setMatchesPublic}
    />
  );
  const notif = <SettingsRow label="通知" value={notifValue(board.auth.role, prefs)} onClick={() => go({ mode: "notif" })} />;
  const plan = (
    <SettingsRow
      label="プラン"
      value={`${PLAN_INFO[board.plan].name}・選手 ${players} 人`}
      onClick={() => go({ mode: "plan" })}
    />
  );
  const dataRow = <SettingsRow label="データ" desc="書き出し・デモデータの入れ直し" onClick={() => go({ mode: "data" })} />;
  const version = <SettingsRow label="バージョン" value={APP_VERSION} />;

  if (!showAll) {
    // PC：選んだカテゴリの行だけ。groups〜fitnessTests は左の列を押した時点で編集画面を出すので、ここに来るのは
    // スマホの下層から PC 幅へ広げたときだけ
    return (
      <div className="st-top">
        {cat === "account" && <SettingsGroup>{account}</SettingsGroup>}
        {cat === "basics" && (
          <SettingsGroup>
            {teamBasics}
            {stage}
          </SettingsGroup>
        )}
        {cat === "groups" && <SettingsGroup>{groups}</SettingsGroup>}
        {cat === "categories" && <SettingsGroup>{categories}</SettingsGroup>}
        {cat === "competitions" && <SettingsGroup>{competitions}</SettingsGroup>}
        {cat === "league" && <SettingsGroup>{league}</SettingsGroup>}
        {cat === "fitnessTests" && <SettingsGroup>{fitnessTests}</SettingsGroup>}
        {cat === "staff" && <SettingsGroup>{staff}</SettingsGroup>}
        {cat === "invite" && <SettingsGroup>{invite}</SettingsGroup>}
        {cat === "public" && <SettingsGroup>{matchesPublic}</SettingsGroup>}
        {cat === "notif" && <SettingsGroup>{notif}</SettingsGroup>}
        {cat === "plan" && <SettingsGroup>{plan}</SettingsGroup>}
        {cat === "data" && (
          <SettingsGroup hint={DATA_HINT}>
            {dataRow}
            {version}
          </SettingsGroup>
        )}
      </div>
    );
  }

  return (
    <div className="st-top">
      <SettingsGroup>{account}</SettingsGroup>
      <SettingsGroup title="チーム">
        {teamBasics}
        {stage}
        {groups}
        {categories}
        {competitions}
        {league}
        {fitnessTests}
      </SettingsGroup>
      <SettingsGroup title="メンバー">
        {staff}
        {invite}
        {matchesPublic}
      </SettingsGroup>
      <SettingsGroup title="通知">{notif}</SettingsGroup>
      <SettingsGroup title="プラン">{plan}</SettingsGroup>
      <SettingsGroup title="データ" hint={DATA_HINT}>
        {dataRow}
        {version}
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow label="ログアウト" danger onClick={() => window.dispatchEvent(new Event("alfa-logout"))} />
      </SettingsGroup>
    </div>
  );
}
