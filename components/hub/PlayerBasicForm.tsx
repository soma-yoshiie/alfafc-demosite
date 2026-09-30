"use client";

import React, { useEffect, useState } from "react";
import type { DominantFoot, Player, Position } from "@/lib/types";
import { STAGE_GRADES, gradeLabel } from "@/lib/types";
import type { Sex, TermSystem } from "@/lib/profile";
import { SEX_LABEL, TERM_SYSTEM_LABEL } from "@/lib/profile";
import { ALL_POSITIONS } from "@/lib/formations";
import { useBoard } from "../BoardProvider";
import { useTeam } from "../TeamProvider";
import { useProfiles } from "../ProfileProvider";
import { GroupChips } from "../GroupChips";
import { Field, Seg, SheetSave, customGroupsOf, numStr, sanitizeNum } from "./common";
import type { HubViewer } from "./common";

/**
 * 選手の基本情報フォームの中身（player-hub §3-2）。TeamHub の playerForm の入力欄を部品化したもので、
 * 個人ページ（PlayerHub の編集ボタン）と TeamHub の「選手を追加」シートの両方から使う。
 * 見出し（h2）と「キャンセル」は呼び出し側のシート（HubSheet／TeamHub の Sheet）が持ち、
 * ここは入力欄＋末尾の「保存」＋（スタッフが既存の選手を編集するときだけ）キャプテン・削除を描く。
 *
 * - 保存は最新の Player を base にする（board.state.players から引き直す。TeamHub の livePf と同じ。
 *   フォームを開いた時点のスナップショットだと、開いている間に足した体力測定・怪我が消える）＋ profiles.update
 *   （生年月日・性別・在籍校・学期制）。
 * - 選手（viewer="player"）は名前・メール・グループを変えられない（表示だけ。メールを変えるとログインできなくなる）。
 *   メールは選手には表示もしない。
 * - 所属グループは TeamHub と同じ 3 方向マージ（開いた時点・フォーム内の操作・保存直前の最新）で反映する。
 * - 身長・体重は成長セクションの記録から入れる（最新の記録が Player.height/weight に同期される）ので、ここには置かない。
 * - keep を渡すと、入力中の値をその ref へ写し、マウントし直したときに復元する（TeamHub のグループ管理シートへ
 *   行って戻ってもフォームの入力が消えないように。ref は呼び出し側のシートと同じ寿命で持つ）。
 */

/** フォームの下書き（PlayerBasicForm の入力欄の値をそのまま持つ） */
export interface PlayerFormDraft {
  name: string;
  number: string;
  position: Position;
  foot: "" | DominantFoot;
  grade: string;
  groupIds: string[];
  email: string;
  birth: string;
  sex: Sex | "";
  school: string;
  term: TermSystem;
}

export function PlayerBasicForm({
  player,
  viewer,
  onDone,
  onDeleted,
  onManageGroups,
  keep,
}: {
  /** 編集する選手。undefined＝新規追加（スタッフだけ） */
  player?: Player;
  viewer: HubViewer;
  /** 保存・削除のあとに閉じる。新規追加のときは作った選手の id を渡す */
  onDone: (createdId?: string) => void;
  /** 選手を削除したとき（親が選択を外す） */
  onDeleted?: () => void;
  /** グループ欄の「＋ 管理」（TeamHub のグループ管理シートを開く。無ければチップだけ） */
  onManageGroups?: () => void;
  /** 入力中の値の写し先（マウントし直したときの復元元にもなる） */
  keep?: React.MutableRefObject<PlayerFormDraft | null>;
}) {
  const board = useBoard();
  const team = useTeam();
  const profiles = useProfiles();
  const staff = viewer === "staff";
  const stage = team.team.schoolStage ?? "elementary";
  const prof = player ? profiles.get(player.id) : undefined;

  const d = keep?.current ?? null;
  const [name, setName] = useState(d ? d.name : player?.name ?? "");
  const [number, setNumber] = useState(d ? d.number : numStr(player?.number));
  const [position, setPosition] = useState<Position>(d ? d.position : player?.position ?? ALL_POSITIONS[0]);
  const [foot, setFoot] = useState<"" | DominantFoot>(d ? d.foot : player?.dominantFoot ?? "");
  const [grade, setGrade] = useState(d ? d.grade : player?.grade != null ? String(player.grade) : "");
  const [groupIds, setGroupIds] = useState<string[]>(d ? d.groupIds : player?.groupIds ?? []);
  const [email, setEmail] = useState(d ? d.email : player?.email ?? "");
  const [birth, setBirth] = useState(d ? d.birth : prof?.birthDate ?? "");
  const [sex, setSex] = useState<Sex | "">(d ? d.sex : prof?.sex ?? "");
  const [school, setSchool] = useState(d ? d.school : prof?.school ?? "");
  const [term, setTerm] = useState<TermSystem>(d ? d.term : prof?.termSystem ?? "3");
  useEffect(() => {
    if (keep) keep.current = { name, number, position, foot, grade, groupIds, email, birth, sex, school, term };
  });

  const customGroups = team.groups.filter((g) => g.kind === "custom");
  const isCaptain = !!player && board.state.captain === player.id;

  const save = () => {
    const nm = name.trim();
    if (staff && !nm) {
      board.toast("名前を入力してください");
      return;
    }
    const num = number.trim() === "" ? null : parseInt(number, 10);
    const gr = grade.trim() === "" ? null : parseInt(grade, 10);
    const dominantFoot = foot === "" ? undefined : foot;
    // 所属グループの 3 方向マージ（TeamHub の playerForm と同じ）：フォームを開いた時点(base)・
    // フォーム内のチップ操作(groupIds)・保存直前の最新値(remote)で、フォーム内の追加/削除だけを反映する
    const baseIds = player?.groupIds ?? [];
    const remoteIds = player ? board.state.players.find((x) => x.id === player.id)?.groupIds ?? [] : [];
    const merged = new Set(remoteIds);
    new Set([...baseIds, ...groupIds]).forEach((id) => {
      const inBase = baseIds.includes(id);
      const inLocal = groupIds.includes(id);
      if (inLocal && !inBase) merged.add(id);
      if (!inLocal && inBase) merged.delete(id);
    });
    const mergedIds = merged.size > 0 ? [...merged] : undefined;

    const profPatch = {
      birthDate: birth || undefined,
      sex: sex || undefined,
      school: school.trim() || undefined,
      termSystem: term,
    };

    if (player) {
      // 最新の Player を base にする（開いている間に足した体力測定・怪我・身長体重を消さない）
      const live = board.state.players.find((x) => x.id === player.id) ?? player;
      board.updatePlayer({
        ...live,
        number: num,
        position,
        dominantFoot,
        grade: gr,
        ...(staff ? { name: nm, email: email.trim() || undefined, groupIds: mergedIds } : {}),
      });
      // 基本の補足を変えたときだけ書く（変えていないのに毎回書くと、記録の無い選手にもプロフィールができ、
      // 「基本」の最終更新が保存のたびに動く）
      if (
        (prof?.birthDate ?? "") !== birth ||
        (prof?.sex ?? "") !== sex ||
        (prof?.school ?? "") !== school.trim() ||
        (prof?.termSystem ?? "3") !== term
      ) {
        profiles.update(player.id, profPatch);
      }
      onDone();
    } else {
      const id = board.createPlayer({
        name: nm,
        number: num,
        position,
        dominantFoot,
        grade: gr,
        email: email.trim() || undefined,
        groupIds: mergedIds,
      });
      // 生年月日・性別・在籍校・学期制（既定の 3 学期制から変えたとき）のどれか 1 つでも入れたときだけ
      // プロフィールを作る（すべて既定のままなら空のプロフィールは作らない）。学期制だけ変えたときも落とさない
      if (birth || sex || school.trim() || term !== "3") profiles.update(id, profPatch);
      onDone(id);
    }
  };

  const del = () => {
    if (!player) return;
    if (window.confirm(`${player.name}を名簿から削除しますか？出欠の記録も削除されます`)) {
      board.deletePlayer(player.id);
      team.removePlayerAnswers(player.id);
      // 削除した選手としてプレビュー中ならスタッフ表示へ戻す（戻さないと存在しない選手のまま残る）
      if (team.viewer.memberPlayerId === player.id) team.setViewer("coach", null);
      onDeleted?.();
      onDone();
    }
  };

  return (
    <>
      {staff ? (
        <Field label="名前">
          <input aria-label="名前" value={name} onChange={(e) => setName(e.target.value)} placeholder="例）山田 太郎" />
        </Field>
      ) : (
        <Field label="名前" hint="名前の変更はスタッフに依頼してください。">
          <div className="phubro">{player?.name}</div>
        </Field>
      )}
      <div className="formrow">
        <Field label="背番号">
          <input
            aria-label="背番号"
            value={number}
            inputMode="numeric"
            placeholder="未設定可"
            onChange={(e) => setNumber(sanitizeNum(e.target.value, 0).slice(0, 3))}
          />
        </Field>
        <Field label="ポジション">
          <select aria-label="ポジション" value={position} onChange={(e) => setPosition(e.target.value as Position)}>
            {ALL_POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="利き足">
        <Seg<DominantFoot | "">
          ariaLabel="利き足"
          value={foot}
          onChange={(v) => setFoot(v ?? "")}
          options={[
            { value: "", label: "未設定" },
            { value: "right", label: "右足" },
            { value: "left", label: "左足" },
            { value: "both", label: "両足" },
          ]}
        />
      </Field>
      <Field label="学年">
        <select aria-label="学年" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">未設定</option>
          {STAGE_GRADES[stage].map((n) => (
            <option key={n} value={n}>
              {gradeLabel(stage, n)}
            </option>
          ))}
        </select>
      </Field>
      {staff ? (
        <Field label="グループ">
          <GroupChips groups={customGroups} value={groupIds} onChange={setGroupIds} multi onManage={onManageGroups} />
          {customGroups.length === 0 && (
            <div className="fieldhint phubhint">
              カスタムグループがありません。{onManageGroups ? "「＋ 管理」から追加できます。" : ""}
            </div>
          )}
        </Field>
      ) : (
        <Field label="グループ" hint="グループの変更はスタッフに依頼してください。">
          <div className="phubro">
            {player
              ? customGroupsOf(player, team.groups)
                  .map((g) => g.label)
                  .join("・") || "なし"
              : "なし"}
          </div>
        </Field>
      )}
      {staff && (
        <Field label="メール（任意）" hint="選手がログインするときのメールアドレスです。">
          <input
            aria-label="ログイン用メール"
            value={email}
            inputMode="email"
            autoCapitalize="none"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ログイン用メール"
          />
        </Field>
      )}
      <Field label="生年月日" hint="入れると全国平均との比較と新体力テストの評価が、学年より正確になります。">
        <input aria-label="生年月日" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
      </Field>
      <Field label="性別" hint="全国平均と新体力テストの得点表を選ぶのに使います（未設定は男子の表）。">
        <Seg<Sex | "">
          ariaLabel="性別"
          value={sex}
          onChange={(v) => setSex(v ?? "")}
          options={[
            { value: "", label: "未設定" },
            { value: "male", label: SEX_LABEL.male },
            { value: "female", label: SEX_LABEL.female },
          ]}
        />
      </Field>
      <Field label="在籍校">
        <input aria-label="在籍校" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="例）○○中学校" />
      </Field>
      <Field label="学期制" hint="成績表の学期の選択肢が変わります。">
        <Seg<TermSystem>
          ariaLabel="学期制"
          value={term}
          onChange={(v) => v && setTerm(v)}
          options={[
            { value: "3", label: TERM_SYSTEM_LABEL["3"] },
            { value: "2", label: TERM_SYSTEM_LABEL["2"] },
          ]}
        />
      </Field>
      <SheetSave onClick={save} />

      {/* キャプテン・削除はスタッフが既存の選手を編集するときだけ、フォームの末尾に置く（一覧・本体からは外した） */}
      {staff && player && (
        <div className="phubmanage">
          <button
            type="button"
            className="bigbtn ghost"
            onClick={() => {
              board.setCaptain(isCaptain ? null : player.id);
            }}
          >
            {isCaptain ? "キャプテンを解除" : "キャプテンにする"}
          </button>
          <button type="button" className="phubdel" onClick={del}>
            この選手を削除
          </button>
        </div>
      )}
    </>
  );
}
