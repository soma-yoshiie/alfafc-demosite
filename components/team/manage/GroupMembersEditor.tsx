"use client";

import { useState } from "react";
import type { Player, TeamGroup } from "@/lib/types";
import { gradeLabel } from "@/lib/types";
import { playerInGroup } from "@/lib/groups";
import { useBoard } from "../../BoardProvider";
import { useTeam } from "../../TeamProvider";

/**
 * グループのメンバー一覧（groups-everywhere §5 / groups-editing-and-place-history §4）。
 * カスタムグループ（kind:"custom"）は検索付きのチェックリストでPlayer.groupIdsを一括編集する。
 * 学年グループ（kind:"grade"）は閲覧のみ（所属はPlayer.gradeから自動決定のため編集不可。
 * チェックボックスは出さず、先頭に学年から自動である旨の説明を出す）。
 */
export function GroupMembersEditor({
  group,
  players,
  onBack,
}: {
  group: TeamGroup;
  players: Player[];
  onBack: () => void;
}) {
  const board = useBoard();
  const team = useTeam();
  const schoolStage = team.team.schoolStage ?? "junior";
  const isGrade = group.kind === "grade";
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  // レビュー指摘(major): 学年グループは閲覧のみ（チェックが無い）なので、絞り込まずに全員を
  // 出すと所属の手がかりが無くなる。カスタムグループは一括編集のため全員を出すのが正しいまま
  const base = isGrade ? players.filter((p) => playerInGroup(p, group)) : players;
  const list = base.filter((p) => !kw || p.name.toLowerCase().includes(kw));
  // Phase D-1(C2-minor): 70人が学年区切りなし・学年表示なしの一列だと「中3の誰か」を
  // 背番号だけで探すことになるため、行に学年ラベルを足す。選択中の人数も表示する
  const selectedCount = players.filter((p) => playerInGroup(p, group)).length;
  const toggle = (p: Player) => {
    if (isGrade) return; // 閲覧のみ（所属はPlayer.gradeから自動）
    const has = p.groupIds?.includes(group.id) ?? false;
    const next = has
      ? (p.groupIds ?? []).filter((x) => x !== group.id)
      : [...(p.groupIds ?? []), group.id];
    board.updatePlayer({ ...p, groupIds: next.length > 0 ? next : undefined });
  };
  return (
    <>
      <div className="tmback" onClick={onBack}>
        ‹ グループ管理
      </div>
      <h2>{group.label}のメンバー</h2>
      {isGrade && (
        <div style={{ margin: "0 16px 8px", fontSize: "12px", color: "var(--mut)" }}>
          学年グループのメンバーは選手の学年で自動的に決まります。学年は名簿の選手フォームで変更できます。
        </div>
      )}
      <div className="controls">
        <input
          className="search"
          placeholder="名前で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {/* mobile-redesign v1 §8: 12px未満禁止のため.fieldhint(11px)は使わずvar(--fs-body-s)にする */}
      <div style={{ margin: "0 16px 8px", fontSize: "var(--fs-body-s)", color: "var(--mut)" }}>
        {isGrade ? `${selectedCount}人` : `${selectedCount}人を選択中`}
      </div>
      <div className="list">
        {list.length === 0 ? (
          <div className="empty-msg">該当する選手がいません。</div>
        ) : (
          list.map((p) => {
            const checked = playerInGroup(p, group);
            return (
              <label
                key={p.id}
                className="attrow"
                style={{ cursor: isGrade ? "default" : "pointer" }}
              >
                {!isGrade && <input type="checkbox" checked={checked} onChange={() => toggle(p)} />}
                <div className="attname">
                  {p.name}
                  <small>
                    背番号 {p.number ?? "—"}
                    {p.grade != null ? ` ・ ${gradeLabel(schoolStage, p.grade)}` : ""}
                  </small>
                </div>
              </label>
            );
          })
        )}
      </div>
    </>
  );
}
