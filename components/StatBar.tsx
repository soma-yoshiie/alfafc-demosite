"use client";

import { playerInGroup, resolveFilterGroup } from "@/lib/groups";
import { benchOf, benchSizeOf, outsideOf } from "@/lib/squad";
import { useBoard } from "./BoardProvider";
import { useTeam } from "./TeamProvider";
import { useGroupFilter } from "./GroupChips";

export default function StatBar() {
  const board = useBoard();
  const team = useTeam();
  const { players } = board.state;
  // board-squad-and-pc-polish §2-2: 配置シート・ベンチと共有する絞り込み(key "board")。
  // 選択中は3タイルともそのグループの人数にする（「すべて」に戻すと全体の数へ戻る）
  const [filterIds] = useGroupFilter("board");
  const filterGroup = resolveFilterGroup(filterIds, team.groups);

  const benchAll = benchOf(board.state);
  const outsideAll = outsideOf(board.state);
  const benchSize = benchSizeOf(board.state);

  const benchCount = filterGroup
    ? benchAll.filter((p) => playerInGroup(p, filterGroup)).length
    : benchAll.length;
  const outsideCount = filterGroup
    ? outsideAll.filter((p) => playerInGroup(p, filterGroup)).length
    : outsideAll.length;
  const rosterCount = filterGroup
    ? players.filter((p) => playerInGroup(p, filterGroup)).length
    : players.length;

  return (
    <>
      {filterGroup && <div className="statbarhint">{filterGroup.label}の人数</div>}
      <div className="statbar">
        <div className="stat">
          <div className="k">ベンチ</div>
          <div className="v">
            {benchCount}
            <small>{filterGroup ? "人" : `/${benchSize}`}</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">メンバー外</div>
          <div className="v">
            {outsideCount}
            <small>人</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">登録選手</div>
          <div className="v">
            {rosterCount}
            <small>人</small>
          </div>
        </div>
      </div>
    </>
  );
}
