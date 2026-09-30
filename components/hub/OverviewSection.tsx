"use client";

import React from "react";
import type { DominantFoot } from "@/lib/types";
import { gradeLabel } from "@/lib/types";
import { SEX_LABEL, TERM_SYSTEM_LABEL } from "@/lib/profile";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { HubHead, LastUpdated, customGroupsOf, fmtYMD } from "./common";
import type { HubSectionProps } from "./common";

/**
 * セクション「基本」（player-hub §3-2）：基本情報の表（背番号・ポジション・利き足・学年・グループ・
 * メール（スタッフだけ）・生年月日・性別・在籍校・学期制）、スタッフのメモ（Player.roleNote。スタッフだけ）、
 * 「シーズンレポートを見る ›」の行。生年月日〜学期制は PlayerProfile 側で、ヘッダー右上の編集ボタン
 * （PlayerBasicForm）から編集する。
 */

function footLabel(f?: DominantFoot): string {
  if (f === "right") return "右足";
  if (f === "left") return "左足";
  if (f === "both") return "両足";
  return "";
}

export default function OverviewSection({ p, profile, viewer, stage, age, go }: HubSectionProps) {
  const board = useBoard();
  const team = useTeam();
  const staff = viewer === "staff";
  const groups = customGroupsOf(p, team.groups);
  const isCaptain = board.state.captain === p.id;
  const missing = !profile.birthDate || !profile.sex;

  const rows: { k: string; v: React.ReactNode }[] = [
    { k: "背番号", v: p.number != null ? p.number : "" },
    { k: "ポジション", v: p.position },
    { k: "利き足", v: footLabel(p.dominantFoot) },
    { k: "学年", v: p.grade != null ? gradeLabel(stage, p.grade) : "" },
    {
      k: "グループ",
      v: groups.length > 0 ? (
        <span className="phubgroups">
          {groups.map((g) => (
            <span key={g.id} className="phubgroup">
              {g.label}
            </span>
          ))}
        </span>
      ) : (
        ""
      ),
    },
    ...(staff ? [{ k: "メール", v: p.email ?? "" }] : []),
    {
      k: "生年月日",
      v: profile.birthDate ? (
        <>
          {fmtYMD(profile.birthDate)}
          {age != null && <span className="phubkv-sub"> ・ 4/1 時点 {age} 歳</span>}
        </>
      ) : (
        ""
      ),
    },
    { k: "性別", v: profile.sex ? SEX_LABEL[profile.sex] : "" },
    { k: "在籍校", v: profile.school ?? "" },
    { k: "学期制", v: TERM_SYSTEM_LABEL[profile.termSystem ?? "3"] },
  ];

  return (
    <section className="phubsec" aria-label="基本">
      <HubHead title="基本情報" />
      <dl className="phubkv">
        {rows.map((r) => (
          <div className="phubkv-row" key={r.k}>
            <dt>{r.k}</dt>
            <dd>{r.v === "" ? <span className="phubkv-empty">—</span> : r.v}</dd>
          </div>
        ))}
        {isCaptain && (
          <div className="phubkv-row">
            <dt>役割</dt>
            <dd>キャプテン (C)</dd>
          </div>
        )}
      </dl>
      {missing && (
        <div className="phubnote">
          生年月日と性別を登録すると、全国平均との比較や新体力テストの評価が正確になります（右上の鉛筆ボタンから編集できます）。
        </div>
      )}

      {staff && (
        <>
          <HubHead title="スタッフのメモ" />
          <div className="phubcard">
            {p.roleNote ? (
              <div className="phubmemo">{p.roleNote}</div>
            ) : (
              <div className="phubkv-empty">未入力です。戦術ボードのスロットメニューで入力できます。</div>
            )}
          </div>
        </>
      )}

      <button type="button" className="phublink" onClick={() => go("report")}>
        <span>シーズンレポートを見る</span>
        <span aria-hidden="true">›</span>
      </button>
      {/* 基本の補足（生年月日〜学期制）だけの最終更新。記録の追加・削除では動かさない（player-hub §1-1） */}
      <LastUpdated at={profile.basicUpdatedAt} by={profile.basicUpdatedBy} />
    </section>
  );
}
