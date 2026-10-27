"use client";

import React, { useEffect, useRef, useState } from "react";
import { useBoard } from "../BoardProvider";
import { SEX_LABEL, TERM_SYSTEM_LABEL, ageOn } from "@/lib/profile";
import { HubHead, LastUpdated, fmtYMD } from "./common";
import type { HubSectionProps } from "./common";

/**
 * スタッフのメモ（Player.roleNote）をその場で書く欄（ux-fix R2-7）。入力中は手元の文字を持ち、
 * 欄を離れたとき（onBlur）に board.updatePlayer で保存する。別の画面で書き換わったら手元も追従する
 */
function RoleNoteEditor({ p }: { p: HubSectionProps["p"] }) {
  const board = useBoard();
  const [text, setText] = useState(p.roleNote ?? "");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setText(p.roleNote ?? "");
  }, [p.id, p.roleNote]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const save = () => {
    const next = text.trim();
    if (next === (p.roleNote ?? "")) {
      setText(next);
      return;
    }
    board.updatePlayer({ ...p, roleNote: next || undefined });
    setText(next);
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="phubmemo-edit">
      <textarea
        className="st-input phubmemo-input"
        rows={3}
        aria-label="スタッフのメモ"
        placeholder="メモを書く（スタッフだけに見えます）"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
      />
      {saved && (
        <div className="phubmemo-saved" role="status">
          保存しました
        </div>
      )}
    </div>
  );
}

/**
 * セクション「基本」（player-hub §3-2）：基本情報の表（メール（スタッフだけ）・生年月日・性別・在籍校・学期制。
 * 背番号・ポジション・利き足・学年・グループ・役割は名前のカード（要約）にあるので表に置かない。ux-fix R2-4）、スタッフのメモ（Player.roleNote。スタッフだけ）、
 * 「シーズンレポートを見る ›」の行。生年月日〜学期制は PlayerProfile 側で、ヘッダー右上の編集ボタン
 * （PlayerBasicForm）から編集する。
 */

export default function OverviewSection({ p, profile, viewer, stage, go }: HubSectionProps) {
  const staff = viewer === "staff";
  // ux-fix R2-4 レビュー: 生年月日の横は今日時点の満年齢（props の age は 4/1 時点で、体力テスト・成長の比較用）
  const ageToday = ageOn(profile.birthDate);
  const missing = !profile.birthDate || !profile.sex;

  // 背番号・ポジション・利き足・学年・グループ・役割は名前のカード（要約）に出ているので表には置かない
  const rows: { k: string; v: React.ReactNode }[] = [
    ...(staff ? [{ k: "メール", v: p.email ?? "" }] : []),
    {
      k: "生年月日",
      v: profile.birthDate ? (
        <>
          {fmtYMD(profile.birthDate)}
          {ageToday != null && `（${ageToday} 歳）`}
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
      </dl>
      {missing && (
        <div className="phubnote">
          生年月日と性別を登録すると、全国平均との比較や新体力テストの評価が正確になります（右上の鉛筆ボタンから編集できます）。
        </div>
      )}

      {staff && (
        <>
          <HubHead title="スタッフのメモ" />
          <RoleNoteEditor p={p} />
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
