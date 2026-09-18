import type {
  BoardState,
  ChatMessage,
  CoachDeliverable,
  DrillDoc,
  FitnessRecord,
  Library,
  NotebookEntry,
  SavedDrill,
  SchoolStage,
  Settings,
  TeamData,
  TeamGroup,
  TeamViewer,
} from "./types";
import type { UserArticle } from "./articles";
import type { CoachLabState } from "./coachlab";
import { emptyCoachLabState } from "./coachlab";
import { ensureGradeGroups, gradeGroupsFor } from "./groups";
import {
  DEFAULT_FITNESS_TESTS,
  FITNESS_TEST_1000M,
  FITNESS_TEST_50M,
  FITNESS_TEST_SIDESTEP,
  SAMPLE_CUSTOM_GROUPS,
  SAMPLE_PLAYERS,
  SAMPLE_TEAM_NAME,
} from "./sampleTeam";

const KEY = "soccer_tactics_state_v1";
const LIB_KEY = "soccer_tactics_library_v1";
const SETTINGS_KEY = "soccer_tactics_settings_v1";
const DRILLS_KEY = "soccer_tactics_drills_v1";
const DRILL_WORK_KEY = "soccer_tactics_drill_work_v1";
const SETPIECE_WORK_KEY = "soccer_tactics_setpiece_work_v1";
const TEAM_KEY = "soccer_tactics_team_v1";
const VIEWER_KEY = "soccer_tactics_viewer_v1";
const MESSAGES_KEY = "soccer_tactics_messages_v1";
const NOTEBOOK_KEY = "soccer_tactics_notebook_v1";
const DELIVER_KEY = "soccer_tactics_coachdeliver_v1";
const NOTIF_SEEN_KEY = "soccer_tactics_notif_seen_v1";
const LAST_EVENT_CATEGORY_KEY = "soccer_tactics_lastcat_v1";
const CALGROUP_KEY = "soccer_tactics_calgroup_v1";
const GROUPFILTER_KEY = "soccer_tactics_groupfilter_v1";
const TEAM_LOGO_KEY = "soccer_tactics_teamlogo_v1";
const USER_ARTICLES_KEY = "soccer_tactics_user_articles_v1";
const COACHLAB_KEY = "soccer_tactics_coachlab_v1";

/* ---- 体力測定：旧形式(id/name/value:string)→新形式(testId/value:number)の後方互換変換 ---- */

/** 旧形式の体力測定記録（種目名・記録値が自由入力の文字列だった時代のデータ） */
interface LegacyFitnessRecord {
  id?: string;
  name?: string;
  value?: unknown;
  date?: string;
  /** 新形式データなら存在する（すでに変換済み＝素通しする目印） */
  testId?: string;
}

/** 旧の自由入力値（例: "7.7秒" "6分04秒" "51回"）から数値を抽出する */
function parseLegacyFitnessValue(raw: unknown): number {
  const s = String(raw ?? "");
  const mmss = s.match(/(\d+)\s*分\s*(\d+(?:\.\d+)?)\s*秒/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const m = s.match(/[\d.]+/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * 旧UIが例示していた自由入力の種目名 → デフォルト種目IDへの写像。
 * 該当しない自由入力（ユーザーが独自に付けた種目名）はデータを失わないよう、
 * 名前由来の暫定ID（"legacy_"+種目名）を割り当てて記録自体は保持する
 * （対応する FitnessTest 未登録のため、種目名・単位の表示はUI側の扱いに委ねる）。
 */
function legacyFitnessTestId(name: string): string {
  if (name.includes("50m")) return FITNESS_TEST_50M;
  if (name.includes("1500m") || name.includes("1000m")) return FITNESS_TEST_1000M;
  if (name.includes("反復横跳び")) return FITNESS_TEST_SIDESTEP;
  return "legacy_" + name.trim().replace(/\s+/g, "_");
}

/** Player.fitness配列を旧形式→新形式へ変換する（すでに新形式の要素はtestIdの有無で判定し素通し） */
function migrateFitness(fitness: unknown): FitnessRecord[] {
  if (!Array.isArray(fitness)) return [];
  return fitness.map((raw): FitnessRecord => {
    const f = raw as LegacyFitnessRecord;
    if (f && typeof f.testId === "string") {
      return {
        testId: f.testId,
        date: String(f.date ?? ""),
        value: typeof f.value === "number" ? f.value : parseLegacyFitnessValue(f.value),
      };
    }
    return {
      testId: legacyFitnessTestId(String(f?.name ?? "")),
      date: String(f?.date ?? ""),
      value: parseLegacyFitnessValue(f?.value),
    };
  });
}

/* ---- 旧デモデータの移行（groups-editing-and-place-history §2） ----
 * 新デモ名簿（70人・中学）は初回起動時（loadState()/loadTeam()がnullを返したとき）にしか
 * 入らないため、以前から使っているブラウザには旧デモ（p01〜p16の16人・小5/6・
 * 「アルファラスFC U-12」）がlocalStorageに残ったまま表示され続けてしまう。
 * loadState()・loadTeam()の先頭でこの関数を呼び、旧デモの署名に一致するときだけ
 * 新デモへ書き換える（ユーザーが自分で選手を足した・学校区分を変えたチームには触らない）。 */
const DEMO_SEED_KEY = "soccer_tactics_demo_seed_v1";
const OLD_DEMO_TEAM_NAME = "アルファラスFC U-12";
/** 旧デモにだけあったカスタムグループ（低学年・高学年）。新デモには存在しないため削除する */
const OLD_DEMO_CUSTOM_GROUP_IDS = ["grp_low", "grp_high"];

/** kind未定義（旧データ）は"custom"とみなす（loadTeam()の読み込み正規化と同じ作法） */
function rawGroupKind(g: { kind?: string }): "grade" | "custom" {
  return g.kind === "grade" ? "grade" : "custom";
}

/**
 * レビュー指摘(major・§3): schoolStage未設定（旧データ）の既定は当面"junior"だが、
 * §2の移行対象外（ユーザーが選手を足していて移行しないデータ）ではPlayer.gradeが
 * 小5/6のまま残っている。一律"junior"にすると学年表示が「中5」「中6」になり、
 * メンバー0人の中1〜3まで増えてしまう（移行前の既定"elementary"からの退行）。
 * gradeに4以上（中学・高校のgradeLabelには存在しない値）を持つ選手が1人でもいれば
 * "elementary"と推定し、いなければ現在の既定どおり"junior"にする。
 */
function inferDefaultSchoolStage(): SchoolStage {
  if (typeof window === "undefined") return "junior";
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return "junior";
    const data = JSON.parse(raw) as { players?: unknown };
    const players = Array.isArray(data.players) ? (data.players as Array<{ grade?: unknown }>) : [];
    const hasElementaryGrade = players.some((p) => typeof p.grade === "number" && p.grade >= 4);
    return hasElementaryGrade ? "elementary" : "junior";
  } catch {
    return "junior";
  }
}

/** id配列からremovedIdsを取り除く。0件ならundefinedに戻す（TeamProvider.removeGroupと同じ後始末） */
function stripRemovedGroupIds(ids: unknown, removedIds: string[]): string[] | undefined {
  if (!Array.isArray(ids) || removedIds.length === 0) return Array.isArray(ids) ? (ids as string[]) : undefined;
  const rest = (ids as string[]).filter((id) => !removedIds.includes(id));
  return rest.length > 0 ? rest : undefined;
}

/**
 * 旧デモ（p01〜p16・小5/6・「アルファラスFC U-12」）を中学年代の新デモ（70人）へ移行する。
 * 完了マーカー(DEMO_SEED_KEY)に"2"を書いた後は、判定結果によらず以後は何もしない
 * （loadState()/loadTeam()のどちらが先に呼ばれても実質1回だけ判定・移行する）。
 */
export function migrateOldDemo(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(DEMO_SEED_KEY) === "2") return;
    window.localStorage.setItem(DEMO_SEED_KEY, "2");

    const stateRaw = window.localStorage.getItem(KEY);
    if (!stateRaw) return;
    const state = JSON.parse(stateRaw) as { players?: unknown; teamName?: unknown } & Record<string, unknown>;
    const oldPlayers = state.players;
    // 署名：playersが存在し、全員のidがp01〜p16の範囲（人数は1〜16）
    if (!Array.isArray(oldPlayers) || oldPlayers.length === 0 || oldPlayers.length > 16) return;
    const isOldId = (id: unknown) => typeof id === "string" && /^p(0[1-9]|1[0-6])$/.test(id);
    if (!(oldPlayers as Array<{ id?: unknown }>).every((p) => isOldId(p?.id))) return;
    // 署名：teamNameが旧名または現在のSAMPLE_TEAM_NAME（未設定も可）
    if (state.teamName != null && state.teamName !== OLD_DEMO_TEAM_NAME && state.teamName !== SAMPLE_TEAM_NAME) {
      return;
    }

    const teamRaw = window.localStorage.getItem(TEAM_KEY);
    const team = teamRaw
      ? (JSON.parse(teamRaw) as { schoolStage?: unknown; groups?: unknown } & Record<string, unknown>)
      : null;
    // 署名：team_v1が無い、またはschoolStageが未設定か"elementary"
    if (team && team.schoolStage != null && team.schoolStage !== "elementary") return;

    // ---- 署名一致：移行する ----
    // レビュー指摘(minor・§2): 自作カスタムグループのid集合を先に出しておき、p01〜p16の
    // groupIds上書き時にも使う（後段のグループ再構築と同じ「残す」判定）。これが無いと
    // 「自作グループは一覧に残るが所属人数が0人になる」（グループを使い続けられない）
    const prevGroups = team && Array.isArray(team.groups) ? (team.groups as Array<{ id: string; kind?: string }>) : [];
    const keptCustomIds = prevGroups
      .filter((g) => rawGroupKind(g) === "custom" && !OLD_DEMO_CUSTOM_GROUP_IDS.includes(g.id))
      .map((g) => g.id);

    const oldById = new Map<string, Record<string, unknown>>();
    (oldPlayers as Array<Record<string, unknown>>).forEach((p) => {
      if (typeof p?.id === "string") oldById.set(p.id, p);
    });
    const newPlayers = SAMPLE_PLAYERS.map((sample) => {
      const old = oldById.get(sample.id);
      if (!old) return sample; // p17〜p70はサンプルをそのまま追加
      // p01〜p16：保存済みの項目（名前・背番号・ポジション・身長体重・体力測定・怪我など）を残し、
      // gradeは新デモ（中学年代）の値に上書きする。groupIdsは新デモの所属（学年・A/B/GK）に
      // 差し替えつつ、自作カスタムグループへの所属だけは残す（丸ごと上書きすると自作グループの
      // 所属人数が0人になり、グループが使い続けられなくなるため）
      const oldGroupIds = Array.isArray((old as { groupIds?: unknown }).groupIds)
        ? ((old as { groupIds?: unknown }).groupIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      const keptOwnGroupIds = oldGroupIds.filter((id) => keptCustomIds.includes(id));
      const mergedGroupIds = [...new Set([...keptOwnGroupIds, ...(sample.groupIds ?? [])])];
      return { ...old, grade: sample.grade, groupIds: mergedGroupIds };
    });
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        ...state,
        players: newPlayers,
        teamName: state.teamName === OLD_DEMO_TEAM_NAME ? SAMPLE_TEAM_NAME : state.teamName,
      })
    );

    let removedGroupIds: string[] = [];
    if (team) {
      const keptCustoms = prevGroups.filter((g) => keptCustomIds.includes(g.id));
      const missingSampleCustoms = SAMPLE_CUSTOM_GROUPS.filter(
        (g) => !keptCustoms.some((k) => k.id === g.id)
      );
      const nextGroups: TeamGroup[] = [
        ...gradeGroupsFor("junior", []),
        ...(keptCustoms as TeamGroup[]),
        ...missingSampleCustoms,
      ];
      removedGroupIds = prevGroups.map((g) => g.id).filter((id) => !nextGroups.some((g) => g.id === id));

      const stripField = <T extends { groupIds?: unknown }>(items: unknown): T[] | undefined =>
        Array.isArray(items)
          ? (items as T[]).map((x) =>
              (x as { groupIds?: unknown }).groupIds !== undefined
                ? { ...x, groupIds: stripRemovedGroupIds((x as { groupIds?: unknown }).groupIds, removedGroupIds) }
                : x
            )
          : undefined;

      window.localStorage.setItem(
        TEAM_KEY,
        JSON.stringify({
          ...team,
          schoolStage: "junior",
          groups: nextGroups,
          events: stripField(team.events) ?? team.events,
          announcements: stripField(team.announcements) ?? team.announcements,
          matches: stripField(team.matches) ?? team.matches,
        })
      );
    }

    if (removedGroupIds.length > 0) {
      const deliverRaw = window.localStorage.getItem(DELIVER_KEY);
      if (deliverRaw) {
        const items = JSON.parse(deliverRaw);
        if (Array.isArray(items)) {
          const next = (items as Array<Record<string, unknown>>).map((d) =>
            d.targetGroupIds !== undefined
              ? { ...d, targetGroupIds: stripRemovedGroupIds(d.targetGroupIds, removedGroupIds) }
              : d
          );
          window.localStorage.setItem(DELIVER_KEY, JSON.stringify(next));
        }
      }
    }

    console.info("[alfa] 旧デモデータを中学年代の名簿に更新しました");
  } catch {
    /* 壊れたデータで例外が出ても以後の読み込みを妨げない */
  }
}

/** localStorage から状態を復元（SSR/未保存時は null） */
export function loadState(): BoardState | null {
  if (typeof window === "undefined") return null;
  migrateOldDemo();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as BoardState;
    if (!data || !Array.isArray(data.slots)) return null;
    if (Array.isArray(data.players)) {
      data.players = data.players.map((p) => {
        if (!p) return p;
        let next = p;
        if (Array.isArray(p.fitness)) next = { ...next, fitness: migrateFitness(p.fitness) };
        // groups-everywhere §1: groupIdsが配列でなければ（旧データ・壊れたデータ）除去する
        if (p.groupIds !== undefined && !Array.isArray(p.groupIds)) {
          next = { ...next, groupIds: undefined };
        }
        return next;
      });
    }
    return data;
  } catch {
    return null;
  }
}

/** localStorage へ状態を保存 */
export function saveState(state: BoardState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 容量超過などは無視 */
  }
}

/* ---- ライブラリ（保存された戦術） ---- */
export function loadLibrary(): Library | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LIB_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Library;
    if (!data || !Array.isArray(data.plays)) return null;
    if (!Array.isArray(data.folders)) data.folders = [];
    if (!Array.isArray(data.setPieces)) data.setPieces = [];
    return data;
  } catch {
    return null;
  }
}

export function saveLibrary(lib: Library): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch {
    /* 無視 */
  }
}

/* ---- 設定（プラン・現在の戦術） ---- */
export function loadSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Settings;
  } catch {
    return null;
  }
}

export function saveSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 無視 */
  }
}

/* ---- 練習メニュー（ドリル図） ---- */
export function loadDrills(): SavedDrill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRILLS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as SavedDrill[]) : [];
  } catch {
    return [];
  }
}

export function saveDrills(drills: SavedDrill[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRILLS_KEY, JSON.stringify(drills));
  } catch {
    /* 無視 */
  }
}

/* ---- 投稿された記事（コーチラボのユーザー投稿） ---- */
export function loadUserArticles(): UserArticle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USER_ARTICLES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as UserArticle[]) : [];
  } catch {
    return [];
  }
}

export function saveUserArticles(list: UserArticle[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_ARTICLES_KEY, JSON.stringify(list));
  } catch {
    /* 無視 */
  }
}

/* ---- コーチラボ（プロフィール・フォロー・購入・参考になった・閲覧数・振込） ---- */
export function loadCoachLab(): CoachLabState {
  const empty = emptyCoachLabState();
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(COACHLAB_KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return empty;
    return {
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      follows: Array.isArray(data.follows) ? data.follows : [],
      purchases: Array.isArray(data.purchases) ? data.purchases : [],
      likes: Array.isArray(data.likes) ? data.likes : [],
      views: data.views && typeof data.views === "object" ? data.views : {},
      payouts: Array.isArray(data.payouts) ? data.payouts : [],
    };
  } catch {
    return empty;
  }
}

export function saveCoachLab(state: CoachLabState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COACHLAB_KEY, JSON.stringify(state));
  } catch {
    /* 無視 */
  }
}

export function loadDrillWork(): { doc: DrillDoc; currentId: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRILL_WORK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.doc) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveDrillWork(doc: DrillDoc, currentId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRILL_WORK_KEY, JSON.stringify({ doc, currentId }));
  } catch {
    /* 無視 */
  }
}

/* ---- セットプレーデザイン（作業中の第2文書スロット） ---- */
export function loadSetPieceWork(): { state: BoardState; currentId: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETPIECE_WORK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.state || !Array.isArray(data.state.slots)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSetPieceWork(state: BoardState, currentId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETPIECE_WORK_KEY, JSON.stringify({ state, currentId }));
  } catch {
    /* 無視 */
  }
}

/* ---- チーム（出欠・連絡） ---- */
export function loadTeam(): TeamData | null {
  if (typeof window === "undefined") return null;
  migrateOldDemo();
  try {
    const raw = window.localStorage.getItem(TEAM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as TeamData;
    if (!data || !Array.isArray(data.events)) return null;
    if (!data.attendance) data.attendance = {};
    if (!Array.isArray(data.announcements)) data.announcements = [];
    if (!Array.isArray(data.coaches)) data.coaches = [];
    if (!Array.isArray(data.matches)) data.matches = [];
    if (!Array.isArray(data.competitions)) data.competitions = [];
    if (!Array.isArray(data.groups)) data.groups = [];
    // 旧データ（種目マスタ未導入）は初回のみデフォルト種目を補完する。
    // 空配列（スタッフが全種目を削除した状態）は意図的な状態として上書きしない。
    if (!Array.isArray(data.fitnessTests)) data.fitnessTests = DEFAULT_FITNESS_TESTS;
    // groups-editing-and-place-history §3: 読み込み正規化
    // schoolStage未定義（旧データ）は"junior"とみなす（当面は中学年代から広めるため、
    // 従来の既定"elementary"から変更）。未設定だったときだけ、一度きりensureGradeGroupsで
    // 学年グループ（中1〜3）を補う（保存後はschoolStageが入るので二度と走らない。
    // TeamProviderの初期化ではensureGradeGroupsを呼ばなくなったため、初回の補完はここに一本化した）
    const schoolStageWasUnset = !data.schoolStage;
    const stage: SchoolStage = data.schoolStage ?? inferDefaultSchoolStage();
    data.schoolStage = stage;
    // groups の kind 未定義（旧データ）は "custom" とみなす
    data.groups = data.groups.map((g) => (g.kind ? g : { ...g, kind: "custom" as const }));
    if (schoolStageWasUnset) data.groups = ensureGradeGroups(stage, data.groups);
    // events の optInPlayerIds が配列でなければ除去する
    data.events = data.events.map((e) =>
      e.optInPlayerIds !== undefined && !Array.isArray(e.optInPlayerIds)
        ? { ...e, optInPlayerIds: undefined }
        : e
    );
    // announcements の groupIds が配列でなければ除去する
    data.announcements = data.announcements.map((a) =>
      a.groupIds !== undefined && !Array.isArray(a.groupIds) ? { ...a, groupIds: undefined } : a
    );
    // groups-phase2 §3-1: matches の groupIds が配列でなければ除去する
    data.matches = data.matches.map((m) =>
      m.groupIds !== undefined && !Array.isArray(m.groupIds) ? { ...m, groupIds: undefined } : m
    );
    return data;
  } catch {
    return null;
  }
}

export function saveTeam(team: TeamData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEAM_KEY, JSON.stringify(team));
  } catch {
    /* 無視 */
  }
}

/** 最後に選んだイベントカテゴリID（予定作成フォームの初期値記憶用） */
export function loadLastEventCategory(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_EVENT_CATEGORY_KEY) || null;
  } catch {
    return null;
  }
}

export function saveLastEventCategory(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_EVENT_CATEGORY_KEY, id);
  } catch {
    /* 無視 */
  }
}

/** カレンダーの絞り込み中グループ（次回も同じ絞り込みで開くための記憶。nullは「すべて」） */
export function loadCalGroup(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CALGROUP_KEY) || null;
  } catch {
    return null;
  }
}

export function saveCalGroup(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(CALGROUP_KEY, id);
    else window.localStorage.removeItem(CALGROUP_KEY);
  } catch {
    /* 無視 */
  }
}

/**
 * 画面ごとのグループ絞り込み選択（groups-everywhere §5: GroupChips共通フックuseGroupFilter用）。
 * 1つのlocalStorageキー配下に画面key（例: "roster"）ごとの選択（グループIDの配列）を持つ。
 */
export function loadGroupFilter(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GROUPFILTER_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const v = data && typeof data === "object" ? data[key] : undefined;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveGroupFilter(key: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(GROUPFILTER_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const map = data && typeof data === "object" ? data : {};
    map[key] = ids;
    window.localStorage.setItem(GROUPFILTER_KEY, JSON.stringify(map));
    // groups-phase2 §1: localStorage直書きのみで状態が変わらないため、
    // 同じkeyを使う複数の部品(useGroupFilter)が揃って読み直せるようイベントを発火する
    // （alfa-notifseenと同じ作法）
    window.dispatchEvent(new Event("alfa-groupfilter"));
  } catch {
    /* 無視 */
  }
}

/* ---- チャット（戦術・トレーニング・画像・動画の送信） ---- */
export function loadMessages(): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as ChatMessage[]) : null;
  } catch {
    return null;
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    /* 容量超過（画像・動画が大きい等）は無視 */
  }
}

/* ---- 通知の既読タイムスタンプ（identityKeyごと） ---- */
export function loadNotifSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTIF_SEEN_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function saveNotifSeen(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(map));
    // 既読はlocalStorage直書きでReact状態を経由しないため、
    // バッジ表示側(ConsoleShell等)が購読できるようイベントを発火する
    window.dispatchEvent(new Event("alfa-notifseen"));
  } catch {
    /* 無視 */
  }
}

/* ---- サッカーノート（選手の振り返り提出） ---- */
export function loadNotebook(): NotebookEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NOTEBOOK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    // 旧フラット形式（kindなし・goal/body）→ 練習ノートへ移行
    return data.map((e): NotebookEntry => {
      if (e && e.kind) return e as NotebookEntry;
      return {
        id: e.id,
        playerId: e.playerId,
        kind: "practice",
        date: e.date,
        ts: e.ts,
        condition: e.condition,
        body: e.body,
        goalPre: e.goal,
        insights: [],
        staffComment: e.staffComment,
        staffCommentTs: e.staffCommentTs,
      };
    });
  } catch {
    return null;
  }
}

export function saveNotebook(entries: NotebookEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(entries));
  } catch {
    /* 無視 */
  }
}

/* ---- コーチからの配信物（練習メニュー/個人課題/ミーティング） ---- */
export function loadDeliverables(): CoachDeliverable[] | null {
  if (typeof window === "undefined") return null;
  // レビュー指摘(major): BoardProviderのdeliverables初期stateはlazy useStateでレンダー中に
  // loadDeliverables()を呼ぶため、TeamProviderのloadTeam()（migrateOldDemo呼び出し元）より
  // 先に走りうる。ここでも呼んでおかないと、移行前(掃除前)のtargetGroupIdsをそのまま読み、
  // 直後のsaveDeliverablesで移行結果が上書きされてしまう（マーカーがあるので二重実行はしない）
  migrateOldDemo();
  try {
    const raw = window.localStorage.getItem(DELIVER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    // 廃止済みkind（過去に配信していた種別など）の過去データが残っていても安全に無視する互換ガード
    return (data as CoachDeliverable[])
      .filter(
        (d) =>
          d &&
          (d.kind === "menu" ||
            d.kind === "assignment" ||
            d.kind === "meeting" ||
            d.kind === "setpiece")
      )
      // groups-everywhere §1: targetGroupIdsが配列でなければ除去する
      .map((d) =>
        d.targetGroupIds !== undefined && !Array.isArray(d.targetGroupIds)
          ? { ...d, targetGroupIds: undefined }
          : d
      );
  } catch {
    return null;
  }
}

export function saveDeliverables(items: CoachDeliverable[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DELIVER_KEY, JSON.stringify(items));
  } catch {
    /* 無視 */
  }
}

/* ---- ノート下書き（フォーム自動保存。kind×playerId ごと） ---- */
const NOTE_DRAFT_KEY = "soccer_tactics_note_draft_v1";

type DraftMap = Record<string, unknown>;

function loadDraftMap(): DraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTE_DRAFT_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? (data as DraftMap) : {};
  } catch {
    return {};
  }
}

function saveDraftMap(map: DraftMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTE_DRAFT_KEY, JSON.stringify(map));
  } catch {
    /* 無視 */
  }
}

export function loadNoteDraft<T>(key: string): T | null {
  const map = loadDraftMap();
  return (map[key] as T) ?? null;
}

export function saveNoteDraft(key: string, data: unknown): void {
  const map = loadDraftMap();
  map[key] = data;
  saveDraftMap(map);
}

export function clearNoteDraft(key: string): void {
  const map = loadDraftMap();
  if (!(key in map)) return;
  delete map[key];
  saveDraftMap(map);
}

export function loadViewer(): TeamViewer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEWER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TeamViewer;
  } catch {
    return null;
  }
}

export function saveViewer(v: TeamViewer): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWER_KEY, JSON.stringify(v));
  } catch {
    /* 無視 */
  }
}

/* ---- クラブエンブレム（レール上部・設定に表示するロゴ画像） ---- */
export function loadTeamLogo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TEAM_LOGO_KEY) || null;
  } catch {
    return null;
  }
}

/** 保存できたら true。dataURLは大きいので容量超過が実際に起こりうる＝呼び出し側で通知する */
export function saveTeamLogo(url: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (url) {
      window.localStorage.setItem(TEAM_LOGO_KEY, url);
    } else {
      window.localStorage.removeItem(TEAM_LOGO_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
