// グループ機能の全面展開（groups-everywhere §1）のヘルパー集約。
// 学年グループ（kind:"grade"。所属はPlayer.gradeから自動）とカスタムグループ
// （kind:"custom"。所属はPlayer.groupIds）を横断して扱う。
// カレンダーの絞り込み専用ヘルパー（eventTargetsGroup/targetLabel）は引き続き lib/calendarUtils.ts 側。

import type {
  Announcement,
  CoachDeliverable,
  Player,
  SchoolStage,
  TeamEvent,
  TeamGroup,
} from "./types";
import { gradeLabel, STAGE_GRADES } from "./types";

const ALL_SCHOOL_STAGES = Object.keys(STAGE_GRADES) as SchoolStage[];

/**
 * labelがgrade段の「未改名の既定ラベル」か（3区分いずれかのgradeLabel(stage,grade)と一致するか）。
 * gradeGroupsFor()で、学校区分変更時にラベルを差し替えてよいか判定するのに使う。
 */
function isDefaultGradeLabel(label: string, grade: number): boolean {
  return ALL_SCHOOL_STAGES.some((s) => gradeLabel(s, grade) === label);
}

/**
 * stage の学年ぶんの学年グループ一覧。既存の groups に kind:"grade" で該当学年のものが
 * あればそれを使うが、Phase D-1(C2-major): ラベルが3区分いずれかの既定ラベルのまま
 * （＝未改名）のときだけ新stageの既定ラベルへ差し替える。ユーザーが改名済み（どの区分の
 * 既定とも一致しない）ラベルはそのまま保持する（仕様§1「学年グループは改名可」）。
 * 無ければ既定ラベルの雛形を生成する。範囲外（stage変更で対象外になった）学年は含まれない。
 */
export function gradeGroupsFor(stage: SchoolStage, groups: TeamGroup[]): TeamGroup[] {
  return STAGE_GRADES[stage].map((g) => {
    const existing = groups.find((x) => x.kind === "grade" && x.grade === g);
    if (!existing) return { id: `grp_grade_${g}`, label: gradeLabel(stage, g), kind: "grade" as const, grade: g };
    if (isDefaultGradeLabel(existing.label, g)) return { ...existing, label: gradeLabel(stage, g) };
    return existing;
  });
}

/** 選手gがグループgの所属か（学年グループはPlayer.grade、カスタムグループはPlayer.groupIdsで判定） */
export function playerInGroup(p: Player, g: TeamGroup): boolean {
  return g.kind === "grade" ? p.grade === g.grade : !!p.groupIds?.includes(g.id);
}

/** 選手が所属している全グループ（学年＋カスタム） */
export function groupsOfPlayer(p: Player, groups: TeamGroup[]): TeamGroup[] {
  return groups.filter((g) => playerInGroup(p, g));
}

/** グループのメンバー選手一覧（名簿の並び順のまま） */
export function membersOf(groupId: string, players: Player[], groups: TeamGroup[]): Player[] {
  const g = groups.find((x) => x.id === groupId);
  if (!g) return [];
  return players.filter((p) => playerInGroup(p, g));
}

/**
 * 対象グループID配列をgroupsで解決した実体一覧（削除済みIDは除外）。
 * eventTargetsPlayer/announcementTargetsPlayer/deliverableTargetsPlayerで共用する。
 */
function resolveGroups(ids: string[], groups: TeamGroup[]): TeamGroup[] {
  return ids
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is TeamGroup => !!g);
}

/**
 * 予定eが選手pを対象にしているか：全員対象／対象グループのいずれかに所属／
 * 対象外だが選手が「参加する」で追加済み(optInPlayerIds)、のいずれか。
 * Phase D-1(C1-major): 対象グループが全て削除済み(id解決0件)のときは、表示側のtargetLabel()
 * が「全員」にフォールバックするのに合わせ、判定側も全員対象とみなす（さもないと参照先が
 * 消えた予定が「全員」表示のまま誰にも届かなくなる）。
 */
export function eventTargetsPlayer(e: TeamEvent, p: Player, groups: TeamGroup[]): boolean {
  if (!e.groupIds || e.groupIds.length === 0) return true;
  const resolved = resolveGroups(e.groupIds, groups);
  if (resolved.length === 0) return true;
  if (resolved.some((g) => playerInGroup(p, g))) return true;
  return !!e.optInPlayerIds?.includes(p.id);
}

/** 予定eの対象選手一覧（出欠の分母などに使用） */
export function eventTargetPlayers(e: TeamEvent, players: Player[], groups: TeamGroup[]): Player[] {
  return players.filter((p) => eventTargetsPlayer(e, p, groups));
}

/**
 * 連絡aが選手pを対象にしているか（未定義/空のgroupIds＝全員）。
 * Phase D-1(C1-major): announcementLabel()と同じく、対象グループが全て削除済みなら全員対象とみなす。
 */
export function announcementTargetsPlayer(a: Announcement, p: Player, groups: TeamGroup[]): boolean {
  if (!a.groupIds || a.groupIds.length === 0) return true;
  const resolved = resolveGroups(a.groupIds, groups);
  if (resolved.length === 0) return true;
  return resolved.some((g) => playerInGroup(p, g));
}

/**
 * 配信物dが選手pを対象にしているか：targetPlayerIds／targetGroupIdsのいずれかで指定があれば
 * そのOR判定、両方とも未指定（空を含む）なら全員対象。既存のtargetPlayerIdsのみを見る
 * deliverTargets()(types.ts、Phase D-1で削除)とは異なり、targetGroupIdsも合わせて判定する。
 * Phase D-1(C1-major): DeliverDetail表示は個人宛指定が無くグループが全て削除済みのとき
 * 「チーム全員」にフォールバックするため、判定側もそれに合わせて全員対象とみなす
 * （個人宛の指定がある場合は表示どおりその指定を優先し、フォールバックしない）。
 */
export function deliverableTargetsPlayer(d: CoachDeliverable, p: Player, groups: TeamGroup[]): boolean {
  const hasPlayerTarget = !!d.targetPlayerIds && d.targetPlayerIds.length > 0;
  const hasGroupTarget = !!d.targetGroupIds && d.targetGroupIds.length > 0;
  if (!hasPlayerTarget && !hasGroupTarget) return true;
  if (hasPlayerTarget && d.targetPlayerIds!.includes(p.id)) return true;
  if (hasGroupTarget) {
    const resolved = resolveGroups(d.targetGroupIds!, groups);
    if (!hasPlayerTarget && resolved.length === 0) return true;
    return resolved.some((g) => playerInGroup(p, g));
  }
  return false;
}

/**
 * 配信物dが選手pに見えるか（一覧表示・通知の判定用の共通ヘルパー）。
 * Phase D-1(C1-minor): DeliverViews/lib/notifications.tsの3箇所は、選手が名簿から見つからない
 * とき(meP未検出)に全配信を通す`: true`フォールバックを個別に持っていたが、旧deliverTargets
 * （全員宛＋自分宛だけ通す）より緩く他人宛・他グループ宛の配信まで見えていた。
 * ここに集約し、フォールバックを「宛先指定のない配信だけ通す」に統一する。
 */
export function deliverableVisibleToPlayer(
  d: CoachDeliverable,
  meP: Player | undefined,
  groups: TeamGroup[]
): boolean {
  if (meP) return deliverableTargetsPlayer(d, meP, groups);
  return !(d.targetPlayerIds?.length) && !(d.targetGroupIds?.length);
}

/**
 * 学年グループの整合。STAGE_GRADES[stage]ぶんの学年グループ（無ければ既定ラベルで追加、
 * 既存は改名済みラベルのまま保持）を先に並べ、カスタムグループを後ろに残す。
 * 範囲外になった学年グループ（stage変更で対象外）は結果から外れる＝削除。
 */
export function ensureGradeGroups(stage: SchoolStage, groups: TeamGroup[]): TeamGroup[] {
  const customs = groups.filter((g) => g.kind !== "grade");
  return [...gradeGroupsFor(stage, groups), ...customs];
}
