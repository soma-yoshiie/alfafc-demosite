"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { gradeLabel, STAGE_GRADES } from "@/lib/types";
import { ALL_TARGETS_COLOR, playerInGroup } from "@/lib/groups";
import { useBoard } from "../../BoardProvider";
import { useTeam } from "../../TeamProvider";
import { E } from "../../Emoji";
import { IconEdit } from "../../icons";
import { ColorChoiceList } from "../ColorChoiceList";
import { GroupMembersEditor } from "./GroupMembersEditor";
import type { Player } from "@/lib/types";
import type { ManageProps } from "./types";

/**
 * グループ管理（カレンダーの対象§2 / groups-everywhere §5 / groups-editing-and-place-history §4）。
 * TeamHub の管理シートと設定の下層で同じ中身を出す。データは useTeam() から読み書きする。
 * 「戻る」のとき、メンバー編集中なら先に一覧へ戻す（backRef。true を返したら親は閉じない）。
 */
export function GroupsManage({
  players,
  hideTitle,
  backRef,
  pane,
}: Omit<ManageProps, "players"> & {
  /** メンバー編集（チェックリスト）の対象 */
  players: Player[];
  /** TeamHub の PC ペイン（モーダルでない）か。「追加する」ボタンの青（accent）はスマホのシートだけ */
  pane?: boolean;
}) {
  const board = useBoard();
  const team = useTeam();
  // グループ管理シート内でメンバー一覧を開いているグループID（学年・カスタムどちらも可。
  // groups-editing-and-place-history §4）。部品ごと作り直されるので、シートが替わればリセットされる
  const [groupMembersId, setGroupMembersId] = useState<string | null>(null);
  // カレンダーの絞り込みと色の作り直し（案A §1）: 色の丸をタップした行の下にパレットを開く。
  // groupMembersIdと同じく部品ごと作り直されるので、シートが替わればリセットされる
  const [groupColorPickId, setGroupColorPickId] = useState<string | null>(null);
  // レビュー指摘対応（calendar-plan-a §11-3）: 色の選び方がスウォッチ1行(約54px)から
  // 8行・約366pxの縦リスト(ColorChoiceList)に変わったため、下の方のグループで開くと
  // .list(overflow-y:auto)のスクロール範囲外に出てしまう。開いたら見える位置までスクロールする
  const groupSwatchesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (groupColorPickId) groupSwatchesRef.current?.scrollIntoView({ block: "nearest" });
  }, [groupColorPickId]);


  // グループ管理（カテゴリ管理と同じ構造）
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupEditLabel, setGroupEditLabel] = useState("");

  // groups-everywhere §5: メンバー編集中の「戻る」は、まずグループ一覧へ戻すだけ（親は閉じない）
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (groupMembersId) {
        setGroupMembersId(null);
        return true;
      }
      return false;
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, groupMembersId]);

  return (
    <>
      {groupMembersId ? (
        (() => {
          const g = team.groups.find((x) => x.id === groupMembersId);
          if (!g) return null;
          return (
            <GroupMembersEditor group={g} players={players} onBack={() => setGroupMembersId(null)} />
          );
        })()
      ) : (
        <>
          {!hideTitle && <h2>グループ管理</h2>}
          <div className="list">
            {team.groups.length === 0 && (
              <div className="empty-msg">登録されたグループはありません。</div>
            )}
            {team.groups.map((g) => {
              const isGrade = g.kind === "grade";
              const memberCount = players.filter((p) => playerInGroup(p, g)).length;
              return (
                <Fragment key={g.id}>
                <div className="catrow">
                  {groupEditId === g.id ? (
                    <div style={{ flex: 1 }}>
                      <input
                        value={groupEditLabel}
                        onChange={(e) => setGroupEditLabel(e.target.value)}
                        style={{ marginBottom: 8 }}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="bigbtn"
                          style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                          onClick={() => {
                            if (!groupEditLabel.trim()) {
                              board.toast("名前を入力してください");
                              return;
                            }
                            team.updateGroup({ ...g, label: groupEditLabel.trim() });
                            setGroupEditId(null);
                          }}
                        >
                          保存する
                        </button>
                        <button
                          className="bigbtn ghost"
                          style={{ flex: 1, margin: 0, padding: 10, fontSize: 14 }}
                          onClick={() => setGroupEditId(null)}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* カレンダーの絞り込みと色の作り直し（案A §1・calendar-plan-a §11-3）:
                          色の丸をタップすると行の下にColorChoiceList(7色＋カスタム)が開く。
                          選ぶとteam.updateGroupで即反映（月の点・リストの線に使われる色。
                          groupColorOf参照） */}
                      <button
                        type="button"
                        className="calgroupdot"
                        aria-label={`「${g.label}」の色を変更`}
                        onClick={() => setGroupColorPickId(groupColorPickId === g.id ? null : g.id)}
                      >
                        <span style={{ background: g.color }} />
                      </button>
                      {/* Phase D-1(C2-minor): サブテキストが非タップで、メンバー編集の入口が
                          右側の人型アイコン(次のbutton)だけだと初見で気づきにくい。
                          仕様§5「『メンバー（n人）』→ 選手のチェックリスト」どおり、
                          サブテキスト自体もタップ可能にする（既存アイコンは残す）。
                          groups-editing-and-place-history §4: 学年グループも同じ入口から
                          メンバー一覧（閲覧のみ）を開けるようにする */}
                      <div
                        className="cmpinfo"
                        style={{ cursor: "pointer" }}
                        onClick={() => setGroupMembersId(g.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setGroupMembersId(g.id);
                          }
                        }}
                      >
                        <div className="cmpnm">{g.label}</div>
                        <div className="cmpsub">
                          {isGrade ? `学年で自動 ・ メンバー ${memberCount}人 ›` : `メンバー ${memberCount}人 ›`}
                        </div>
                      </div>
                      <button
                        className="msgdel"
                        aria-label={isGrade ? "メンバーを表示" : "メンバーを編集"}
                        onClick={() => setGroupMembersId(g.id)}
                      >
                        <E n="users" />
                      </button>
                      <button
                        className="msgdel"
                        aria-label="編集"
                        onClick={() => {
                          setGroupEditId(g.id);
                          setGroupEditLabel(g.label);
                        }}
                      >
                        <IconEdit />
                      </button>
                      <button
                        className="msgdel"
                        aria-label="削除"
                        onClick={() => {
                          const msg = isGrade
                            ? `「${g.label}」を削除しますか？（予定・連絡・試合記録からもこのグループが外れます。選手の学年は変わりません）`
                            : `「${g.label}」を削除しますか？（予定からもこのグループが外れます）`;
                          if (window.confirm(msg)) team.removeGroup(g.id);
                        }}
                      >
                        <E n="trash" />
                      </button>
                    </>
                  )}
                </div>
                {groupColorPickId === g.id && (
                  <div className="grpswatches" ref={groupSwatchesRef}>
                    <ColorChoiceList
                      value={g.color ?? ALL_TARGETS_COLOR}
                      onChange={(hex, source) => {
                        team.updateGroup({ ...g, color: hex });
                        // レビュー指摘対応（calendar-plan-a §11-3）: カスタムの色ピッカーは
                        // 入力のたびonChangeが飛ぶため、ここで閉じるとinputがDOMから外れ、
                        // ブラウザの色ピッカーごと閉じて最初の1色しか反映できなかった。
                        // プリセット行を選んだときだけ閉じる
                        if (source === "preset") setGroupColorPickId(null);
                      }}
                    />
                  </div>
                )}
                </Fragment>
              );
            })}
          </div>
          {/* groups-editing-and-place-history §4: 学年グループを削除した後に戻すための入口。
              現在の学校区分の学年のうち、学年グループが無いものだけをチップで並べる
              （全部そろっていれば行ごと出さない）。チップは対象欄の「＋管理」と同じ
              .grouppick-item.manageを流用（新規CSSなし） */}
          {(() => {
            const stage = team.schoolStage ?? "junior";
            const missingGrades = STAGE_GRADES[stage].filter(
              (n) => !team.groups.some((x) => x.kind === "grade" && x.grade === n)
            );
            if (missingGrades.length === 0) return null;
            return (
              <div className="formfield">
                <label>学年グループを追加</label>
                <div className="grouppick">
                  {missingGrades.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="grouppick-item manage"
                      onClick={() => team.addGradeGroup(n)}
                    >
                      {gradeLabel(stage, n)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="formfield">
            <label>新しいグループを追加</label>
            <input
              value={newGroupLabel}
              onChange={(e) => setNewGroupLabel(e.target.value)}
              placeholder="例）Aチーム / Bチーム"
            />
          </div>
          <button
            // Phase D-1(C2-minor): 新設シートがスマホの緑bigbtnを増やさないよう、他の主要CTA
            // (§3-4対応済み箇所)と同じ流儀でモバイルはaccent(青)にする。PC(pane)は不変
            className={`bigbtn${pane ? "" : " accent"}`}
            onClick={() => {
              if (!newGroupLabel.trim()) {
                board.toast("名前を入力してください");
                return;
              }
              team.addGroup(newGroupLabel);
              setNewGroupLabel("");
            }}
          >
            追加する
          </button>
        </>
      )}
    </>
  );
}
