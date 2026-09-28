// グループ機能の全面展開（groups-everywhere §1）のヘルパー集約。
// 学年グループ（kind:"grade"。所属はPlayer.gradeから自動）とカスタムグループ
// （kind:"custom"。所属はPlayer.groupIds）を横断して扱う。
// カレンダーの絞り込み専用ヘルパー（calEventVisible/targetLabel）は引き続き lib/calendarUtils.ts 側。

import type {
  Announcement,
  CoachDeliverable,
  MatchRecord,
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
 * カレンダーの絞り込みと色の作り直し（calendar-plan-a §11-3）: グループ・カテゴリ共通の
 * 色の選択肢（iPhoneカレンダーの「カレンダーのカラー」と同じ7色＋カスタム）。
 * 旧GROUP_PALETTE（8色）はLEGACY_GROUP_COLORSへ退避し、選択肢からは外した
 * （選べる色は常にこの7色＋任意のカスタムHEXになる）。
 */
export const COLOR_CHOICES: { color: string; name: string }[] = [
  { color: "#ff3b30", name: "レッド" },
  { color: "#ff9500", name: "オレンジ" },
  { color: "#ffcc00", name: "イエロー" },
  { color: "#34c759", name: "グリーン" },
  { color: "#007aff", name: "ブルー" },
  { color: "#af52de", name: "パープル" },
  { color: "#a2845e", name: "ブラウン" },
];

/**
 * 自動割り当て（ensureGroupColors/gradeGroupsFor/addGroup/addGradeGroup）で新規グループに
 * 色を配る順（calendar-plan-a §11-3）。COLOR_CHOICESの表示順（レッド始まり）とは別に、
 * 最初のグループがブルーになるようここだけ独自の順を持つ。
 */
export const AUTO_COLOR_ORDER: string[] = [
  "#007aff", // ブルー
  "#34c759", // グリーン
  "#af52de", // パープル
  "#ff9500", // オレンジ
  "#ff3b30", // レッド
  "#a2845e", // ブラウン
  "#ffcc00", // イエロー
];

/**
 * 旧固定パレット（案A §1、8色）。保存済みグループの色がこの8値のどれかのときは
 * 「未設定」とみなし、ensureGroupColors/gradeGroupsForが新しい色へ自動で付け替える
 * （calendar-plan-a §11-3「移行」）。ユーザーがカスタムで選んだ色（この8値以外）はそのまま保持する。
 */
export const LEGACY_GROUP_COLORS: string[] = [
  "#15803d",
  "#2563eb",
  "#7c5cbf",
  "#0f766e",
  "#d6324b",
  "#c2418f",
  "#8a5a2b",
  "#b7791f",
];

/**
 * 全員向け（対象グループなし、または対象グループが全て削除済み）の予定・点・帯に使う色
 * （案A §1）。CSSのvar(--blue)（=var(--ink)のネイビー）と同じ値。Canvas書き出し
 * （2段目・lib/exportCalendar.ts）でも同じhexを直接使うためここに定数として置く。
 */
export const ALL_TARGETS_COLOR = "#15233c";

/** colorが「自動で付け直してよい」値か（未設定、または旧固定パレットの値。calendar-plan-a §11-3） */
function needsAutoColor(color?: string): boolean {
  return !color || LEGACY_GROUP_COLORS.includes(color);
}

/**
 * usedColors（既に他のグループが使っている色。COLOR_CHOICES外の値＝カスタム色は無視）から見て
 * 「まだ使われていない」色をAUTO_COLOR_ORDER順で1つ選ぶ。7色すべて使用済みなら、
 * 使用回数が最少の色（同数はAUTO_COLOR_ORDER順）を返す（calendar-plan-a §11-3）。
 * ensureGroupColors/gradeGroupsForが「新規グループにどの色を割り当てるか」を決めるのに使う。
 */
function pickUnusedColor(usedColors: string[]): string {
  const counts = new Map<string, number>(AUTO_COLOR_ORDER.map((c) => [c, 0]));
  for (const c of usedColors) {
    if (counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const unused = AUTO_COLOR_ORDER.find((c) => counts.get(c) === 0);
  if (unused) return unused;
  let best = AUTO_COLOR_ORDER[0];
  let bestCount = counts.get(best) ?? 0;
  for (const c of AUTO_COLOR_ORDER) {
    const n = counts.get(c) ?? 0;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/**
 * 色が「未設定または旧パレット（＝自動で付け直してよい）」のグループに、未使用の色を
 * AUTO_COLOR_ORDER順（学年→カスタム）で割り当てる（calendar-plan-a §11-3）。それ以外
 * （ユーザーが選んだカスタム色。COLOR_CHOICESの7色を選び直した場合も含む）はそのまま保持する。
 * 呼び出し順に「直前に割り当てた色」も使用済みに数えるため、1回の呼び出し内で同じ色が
 * 重複しない。lib/storage.tsの読み込み正規化・components/TeamProvider.tsxのgroups初期化・
 * addGroup/addGradeGroupから呼ぶ。
 */
export function ensureGroupColors(groups: TeamGroup[]): TeamGroup[] {
  const used: string[] = groups.filter((g) => g.color && !needsAutoColor(g.color)).map((g) => g.color as string);
  return groups.map((g) => {
    if (!needsAutoColor(g.color)) return g;
    const color = pickUnusedColor(used);
    used.push(color);
    return { ...g, color };
  });
}

/**
 * 予定eの色（案A §1「グループ＝色、種類＝文字」）。対象グループ（e.groupIds）のうち
 * 最初に解決できたものの色。対象グループが無い（全員向け）、または全て削除済みで
 * 解決できない場合はALL_TARGETS_COLOR。2段目（月のマス・リスト行・画像保存）が使う。
 */
export function groupColorOf(e: TeamEvent, groups: TeamGroup[]): string {
  if (!e.groupIds || e.groupIds.length === 0) return ALL_TARGETS_COLOR;
  for (const id of e.groupIds) {
    const g = groups.find((x) => x.id === id);
    if (g) return g.color ?? ALL_TARGETS_COLOR;
  }
  return ALL_TARGETS_COLOR;
}

/**
 * stage の学年ぶんの学年グループ一覧。既存の groups に kind:"grade" で該当学年のものが
 * あればそれを使うが、Phase D-1(C2-major): ラベルが3区分いずれかの既定ラベルのまま
 * （＝未改名）のときだけ新stageの既定ラベルへ差し替える。ユーザーが改名済み（どの区分の
 * 既定とも一致しない）ラベルはそのまま保持する（仕様§1「学年グループは改名可」）。
 * 無ければ既定ラベルの雛形を生成する。範囲外（stage変更で対象外になった）学年は含まれない。
 * 案A §1・calendar-plan-a §11-3: 新規に作る学年グループ、および色が未設定／旧パレットの
 * ままの既存学年グループには、groups（渡された全グループ＝学年＋カスタム）の色を見て
 * 未使用の色を割り当てる（同じ呼び出しで複数新設・付け替えしても重複しない）。
 */
export function gradeGroupsFor(stage: SchoolStage, groups: TeamGroup[]): TeamGroup[] {
  const used: string[] = groups.filter((g) => g.color && !needsAutoColor(g.color)).map((g) => g.color as string);
  return STAGE_GRADES[stage].map((g) => {
    const existing = groups.find((x) => x.kind === "grade" && x.grade === g);
    if (!existing) {
      const color = pickUnusedColor(used);
      used.push(color);
      return { id: `grp_grade_${g}`, label: gradeLabel(stage, g), kind: "grade" as const, grade: g, color };
    }
    const relabeled = isDefaultGradeLabel(existing.label, g) ? { ...existing, label: gradeLabel(stage, g) } : existing;
    if (needsAutoColor(relabeled.color)) {
      const color = pickUnusedColor(used);
      used.push(color);
      return { ...relabeled, color };
    }
    return relabeled;
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
 * 絞り込みで選択中のグループID配列をgroupsで解決する（単一選択用）。groups-phase2 §1:
 * 保存されているIDが現在のgroupsに無ければ「すべて」とみなす、という各画面共通の作法をここに集約する。
 * 先頭のID以外は見ない（単一選択の値は常に0〜1件のため）。
 */
export function resolveFilterGroup(ids: string[], groups: TeamGroup[]): TeamGroup | null {
  const id = ids[0];
  if (!id) return null;
  return groups.find((g) => g.id === id) ?? null;
}

/** 絞り込みで選択中のグループID配列をgroupsで解決する（複数選択用）。削除済みIDは除外する。 */
export function resolveFilterGroups(ids: string[], groups: TeamGroup[]): TeamGroup[] {
  return resolveGroups(ids, groups);
}

/**
 * 試合記録mの対象表示ラベル（groups-phase2 §3-1）。calendarUtils.targetLabel()と同じ作法だが、
 * 予定の「全員」に対し試合記録は「全体」を使う（仕様§3の文言に合わせる）。
 * 解決できるIDが無ければ（未設定・全て削除済み）「全体」にフォールバックする。
 */
export function matchTargetLabel(m: MatchRecord, groups: TeamGroup[]): string {
  if (!m.groupIds || m.groupIds.length === 0) return "全体";
  const labels = resolveGroups(m.groupIds, groups).map((g) => g.label);
  return labels.length > 0 ? labels.join("・") : "全体";
}

/**
 * groupId(絞り込み中のグループ。nullは「すべて」)が試合記録mの対象に含まれるか。
 * calendarUtils.calEventVisible()の対象グループ判定と同じ考え方：全体対象の記録はどのグループを選んでいても表示する。
 */
export function matchTargetsGroup(m: MatchRecord, groupId: string | null): boolean {
  return groupId == null || !m.groupIds || m.groupIds.length === 0 || m.groupIds.includes(groupId);
}

/**
 * グループの短縮ラベル（チャットの会話一覧・スレッド見出しのアバター用。groups-phase2 §5-2/5-3）。
 * 末尾の「チーム」を外してから先頭2文字を取る（「Aチーム」→「A」、「中3」→「中3」、「GK」→「GK」）。
 */
export function groupAvatarLabel(label: string): string {
  const base = label.endsWith("チーム") ? label.slice(0, -3) : label;
  return base.slice(0, 2);
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
