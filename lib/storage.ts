import type {
  Announcement,
  BoardState,
  CalFilter,
  ChatMessage,
  ChatReads,
  CoachDeliverable,
  DrillDoc,
  EventSquad,
  FitnessRecord,
  FitnessStandardKey,
  FitnessTest,
  Library,
  NotebookEntry,
  Point,
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
import { ensureGradeGroups, ensureGroupColors, gradeGroupsFor } from "./groups";
import { isStandardKey, STANDARD_KEYS, standardKeyForName, standardTestId } from "./fitnessScore";
import { normalizeProfile, type PlayerProfile } from "./profile";
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
/** セットプレー操作列（SetPieceBar）の4グループの開閉状態（setpiece-redesign §5） */
const SPBAR_OPEN_KEY = "soccer_tactics_spbar_v1";
const TEAM_KEY = "soccer_tactics_team_v1";
const VIEWER_KEY = "soccer_tactics_viewer_v1";
const MESSAGES_KEY = "soccer_tactics_messages_v1";
// chat-plan-a §2-3: 1 対 1 の既読時刻。§6: team/grp メッセージ → お知らせの移行済みマーカー
const CHATREADS_KEY = "soccer_tactics_chatreads_v1";
const CHATMIG_KEY = "soccer_tactics_chatmig_v1";
// chat-plan-a §3-1: チャット上部のセグメント（お知らせ／メッセージ）の選択。"ann"／"msg"
const CHATSEG_KEY = "soccer_tactics_chatseg_v1";
const NOTEBOOK_KEY = "soccer_tactics_notebook_v1";
const DELIVER_KEY = "soccer_tactics_coachdeliver_v1";
const NOTIF_SEEN_KEY = "soccer_tactics_notif_seen_v1";
const LAST_EVENT_CATEGORY_KEY = "soccer_tactics_lastcat_v1";
// カレンダーの絞り込みと色の作り直し（案A §2）: 旧キー（単一グループ選択）は撤去。
// 新キーは読み込み時に旧キーをremoveItemし、二度と読まない
const CALGROUP_KEY_OLD = "soccer_tactics_calgroup_v1";
const CALFILTER_KEY = "soccer_tactics_calfilter_v2";
// calendar-plan-a §11-1: PCの絞り込みパネル(.calside)の開閉状態。値は"open"/"closed"のみ
const CALSIDE_OPEN_KEY = "soccer_tactics_calside_v1";
const NBSIDE_OPEN_KEY = "soccer_tactics_nbside_v1";
const ROSSIDE_OPEN_KEY = "soccer_tactics_rosside_v1";
const GROUPFILTER_KEY = "soccer_tactics_groupfilter_v1";
const TEAM_LOGO_KEY = "soccer_tactics_teamlogo_v1";
const USER_ARTICLES_KEY = "soccer_tactics_user_articles_v1";
const COACHLAB_KEY = "soccer_tactics_coachlab_v1";
// player-hub §1-1: 選手のプロフィール（成長・テスト・成績表・進路）。Record<playerId, PlayerProfile>。
// BoardState.players には足さない（共有戦術の取り込みで丸ごと置き換わる・300ms デバウンス保存は容量超過を黙って無視する）
const PROFILE_KEY = "soccer_tactics_profile_v1";
// player-hub §1-5: デモのサンプル(3 人分)を入れ終えたマーカー。消したあとに勝手に再投入しないため
const PROFILE_SEED_KEY = "soccer_tactics_profile_seed_v1";

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
/** 移行判定の版。判定条件を変えたら上げる（旧版のマーカーが残るブラウザで判定し直すため）。
 *  "4"（player-hub §1-5）: 旧デモ→新デモの判定は"3"で済んでいるため繰り返さず、
 *  p08/p10 への新体力テストの標準種目の測定サンプル追加だけを一度走らせる */
const DEMO_SEED_VERSION = "4";
const OLD_DEMO_TEAM_NAME = "アルファラスFC U-12";

/**
 * 設定の「デモデータを入れ直す」用。このアプリの保存データ（soccer_tactics_* と alfa-* の
 * 補助キー）をすべて消す。ログイン情報（alfa_coach_account_v1 / alfa_session_v1）は残す。
 * 選手のプロフィール（PROFILE_KEY）とそのサンプル投入済みマーカー（PROFILE_SEED_KEY）も
 * soccer_tactics_ で始まるのでここで消える（player-hub §1-5）。
 * 呼び出し側で location.reload() すると初回起動と同じ新しいデモが入る
 */
export function resetAppData(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith("soccer_tactics_") || k.startsWith("alfa-"))) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* 無視 */
  }
}
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
 * 旧デモ（p01〜p16・小5/6・「アルファラスFC U-12」）を中学年代の新デモ（70人）へ移行する本体。
 * マーカーの管理は呼び出し側（migrateOldDemo）。マーカーが"3"より前のブラウザでだけ呼ばれる。
 */
function migrateOldDemoRoster(): void {
  try {
    // 署名判定の経緯：マーカー"2"の時代は署名が厳しすぎて（人数16以下・全員が旧サンプルid・チーム名が
    // 旧名のまま）、数週間デモを触って選手を足したりチーム名を変えたりしたブラウザでは
    // 一度も移行されないまま"2"が書かれ、以後は再判定もされなかった。版を"3"に上げて判定し直した
    const stateRaw = window.localStorage.getItem(KEY);
    if (!stateRaw) return;
    const state = JSON.parse(stateRaw) as { players?: unknown; teamName?: unknown } & Record<string, unknown>;
    const oldPlayers = state.players;
    // 署名：旧サンプルの選手（p01〜p16）が8人以上残っている名簿。自分で足した選手や
    // チーム名の変更があっても「旧デモを使い続けているブラウザ」とみなす（実チームは未運用）
    if (!Array.isArray(oldPlayers) || oldPlayers.length === 0) return;
    const isOldId = (id: unknown) => typeof id === "string" && /^p(0[1-9]|1[0-6])$/.test(id);
    const oldSampleCount = (oldPlayers as Array<{ id?: unknown }>).filter((p) => isOldId(p?.id)).length;
    if (oldSampleCount < 8) return;

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
    // ユーザーが自分で足した選手（サンプル外のid）は末尾に残す。小学生の学年（4以上）は
    // 中学年代では存在しないラベルになるため未設定に戻す（設定の区分変更と同じ扱い）
    const sampleIds = new Set(SAMPLE_PLAYERS.map((p) => p.id));
    const extraPlayers = (oldPlayers as Array<Record<string, unknown>>)
      .filter((p) => typeof p?.id === "string" && !sampleIds.has(p.id as string))
      .map((p) => (typeof p.grade === "number" && p.grade > 3 ? { ...p, grade: null } : p));
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        ...state,
        players: [...newPlayers, ...extraPlayers],
        teamName:
          state.teamName == null || state.teamName === OLD_DEMO_TEAM_NAME ? SAMPLE_TEAM_NAME : state.teamName,
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

/**
 * デモ名簿（p08・p10）に、新体力テストの標準種目（握力・長座体前屈・20mシャトルラン・ハンドボール投げ）の
 * 測定サンプルを足す（player-hub §1-5）。lib/sampleTeam.ts のサンプルのうち標準種目の id（ft_std_*）の記録だけを対象にし、
 * すでに同じ (testId, date) がある選手には足さない（スタッフが消した既存の記録を復活させない）。
 * 名簿に p08／p10 がいない（デモ名簿でない・削除済み）ときは何もしない
 */
function addDemoFitnessSamples(): void {
  try {
    const stateRaw = window.localStorage.getItem(KEY);
    if (!stateRaw) return;
    const state = JSON.parse(stateRaw) as { players?: unknown } & Record<string, unknown>;
    if (!Array.isArray(state.players)) return;
    let changed = false;
    const players = (state.players as Array<Record<string, unknown>>).map((p) => {
      if (p?.id !== "p08" && p?.id !== "p10") return p;
      const sample = SAMPLE_PLAYERS.find((x) => x.id === p.id);
      if (!sample) return p;
      const have = Array.isArray(p.fitness) ? (p.fitness as FitnessRecord[]) : [];
      const add = (sample.fitness ?? []).filter(
        (r) => r.testId.startsWith("ft_std_") && !have.some((h) => h.testId === r.testId && h.date === r.date)
      );
      if (add.length === 0) return p;
      changed = true;
      return { ...p, fitness: [...have, ...add] };
    });
    if (changed) window.localStorage.setItem(KEY, JSON.stringify({ ...state, players }));
  } catch {
    /* 壊れたデータで例外が出ても以後の読み込みを妨げない */
  }
}

/**
 * 旧デモの移行と、デモのサンプル追加を版つきで一度だけ走らせる。マーカー(DEMO_SEED_KEY)が現行の版の
 * ブラウザでは何もしない（loadState()/loadTeam()のどちらが先に呼ばれても実質1回だけ）。
 * 旧デモ→新デモの判定（migrateOldDemoRoster）はマーカー"3"で済んでいるので、"3"のブラウザでは繰り返さない
 * （判定条件が変わっていないため。繰り返すと、移行済みでチーム設定が未保存のブラウザで学年などを上書きしかねない）
 */
export function migrateOldDemo(): void {
  if (typeof window === "undefined") return;
  let prev: string | null;
  try {
    prev = window.localStorage.getItem(DEMO_SEED_KEY);
    if (prev === DEMO_SEED_VERSION) return;
    window.localStorage.setItem(DEMO_SEED_KEY, DEMO_SEED_VERSION);
  } catch {
    return;
  }
  if (prev !== "3") migrateOldDemoRoster();
  // 旧デモ移行で新デモの名簿が入った直後でも、保存済みの p08/p10 に標準種目の測定サンプルが無ければ足す
  addDemoFitnessSamples();
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
    // board-squad-and-pc-polish §2-1: 形が壊れていれば未定義に戻す（旧データとして
    // normalizeBoard/seedBenchIfMissing 側の1度きりの補完に委ねる）
    if (data.benchIds !== undefined && !Array.isArray(data.benchIds)) {
      data.benchIds = undefined;
    }
    if (data.benchSize !== undefined && typeof data.benchSize !== "number") {
      data.benchSize = undefined;
    }
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

/** applySetPieceLayout/newSetPieceが基本配置を生成した直後のslots/opponents/ball座標の基準
 * （BoardProvider.isSetPieceLayoutEditedの比較用）。レビュー指摘(2回目・major)：この基準を
 * 作業中データ(SETPIECE_WORK_KEY)と一緒に永続化しないと、保存データがある状態（＝2回目
 * 以降の起動すべて）では常にnullになり、リロード後や右上「新規作成」からはドラッグだけの
 * 手入れを検知できず無警告で配置が作り直されてしまっていた */
export interface SpLayoutBaseline {
  ball: Point;
  slots: { x: number; y: number }[];
  opponents: { x: number; y: number }[];
}

/* ---- セットプレーデザイン（作業中の第2文書スロット） ---- */
export function loadSetPieceWork(): {
  state: BoardState;
  currentId: string | null;
  layoutBaseline?: SpLayoutBaseline | null;
} | null {
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

export function saveSetPieceWork(
  state: BoardState,
  currentId: string | null,
  layoutBaseline?: SpLayoutBaseline | null
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETPIECE_WORK_KEY, JSON.stringify({ state, currentId, layoutBaseline }));
  } catch {
    /* 無視 */
  }
}

/** セットプレー操作列の4グループ（種類/ボールの軌道/表示/描く・動かす）の開閉状態。
 * キーはグループid、値がtrue＝開。未保存・保存が壊れている場合は空オブジェクト
 * （呼び出し側で「初回は種類だけ開く」の既定値を補う） */
export function loadSpBarOpen(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SPBAR_OPEN_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    return data;
  } catch {
    return {};
  }
}

export function saveSpBarOpen(open: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPBAR_OPEN_KEY, JSON.stringify(open));
  } catch {
    /* 無視 */
  }
}

/** board-squad-and-pc-polish §3: events[].squad の形を検査する。壊れていれば読み込み正規化で消す */
function isValidEventSquad(v: unknown): v is EventSquad {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<EventSquad>;
  return (
    typeof s.formation === "string" &&
    Array.isArray(s.starters) &&
    s.starters.every(
      (x) =>
        !!x &&
        typeof x === "object" &&
        typeof (x as { role?: unknown }).role === "string" &&
        typeof (x as { playerId?: unknown }).playerId === "string"
    ) &&
    Array.isArray(s.bench) &&
    s.bench.every((id) => typeof id === "string") &&
    typeof s.updatedAt === "number"
  );
}

/** お知らせ 1 件の読み込み正規化（chat-plan-a §2-1。形が違う項目だけ undefined にする） */
function normalizeAnnouncement(a: Announcement): Announcement {
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : undefined;
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  return {
    ...a,
    groupIds: strArr(a.groupIds),
    title: str(a.title),
    pinned: a.pinned === true ? true : undefined,
    fromName: str(a.fromName),
    fromRole: str(a.fromRole),
    attachments: Array.isArray(a.attachments) ? a.attachments : undefined,
    seenBy: strArr(a.seenBy),
    acks: strArr(a.acks),
    remindedAt: typeof a.remindedAt === "number" ? a.remindedAt : undefined,
  };
}

/**
 * 体力測定の種目マスタに「新体力テストの種目」の印（standardKey）を補う（player-hub §1-4）。
 * ・印の無い種目は名前から推定して付ける（「50m走」「立ち幅跳び／とび」「反復横跳び／とび」「上体起こし」
 *   「1500m走／持久走」ほか。同じ印は 1 つの種目にしか付けない）。記録（Player.fitness）には触らない。
 *   「1000m走」は推定しない：標準の持久走の得点表は男子 1500m・女子 1000m なので、男子の 1000m の記録を
 *   当てると実際より高い得点になる（クラブ独自の種目のまま）
 * ・名前が「1000m走」で standardKey "endurance" が付いて保存されている種目（旧版の補完で付いたもの）は、その印を外す
 *   （正規化は毎回走るが、外したあとは該当しないので冪等）。外した結果マスタに持久走の印が 1 つも無くなるときは、
 *   標準の持久走（ft_std_endurance）を末尾に足す（標準種目の数を保つ。足すのは印を外したその 1 回だけ）
 * ・標準種目が足りない旧データには、足りない分を ft_std_<key> の id で末尾に足す（マスタが増えるだけ）。
 *   足すのは「補完を 1 回も済ませていない（seed=true）印が 1 つも保存されていない旧マスタ」のときだけ。
 *   補完を済ませたかは TeamData.fitnessStdSeeded（loadTeam が立てて保存する）で覚え、印の有無から推定しない：
 *   推定だと、スタッフが標準種目を全部削除してクラブ独自の種目だけ残したとき（印が 0 件）、読み込みのたびに復活してしまう。
 *   空配列（全削除）も触らない
 * 保存済みの印が不正な値なら外す。元の配列は書き換えない
 */
function normalizeFitnessTests(tests: FitnessTest[], seed: boolean): FitnessTest[] {
  let valid = tests.filter((t): t is FitnessTest => !!t && typeof t === "object" && typeof t.name === "string");
  // 「1000m走」に付いた標準の持久走の印を外す（上の説明）
  let stripped = false;
  valid = valid.map((t) => {
    if (t.standardKey !== "endurance" || t.name.replace(/\s+/g, "") !== "1000m走") return t;
    stripped = true;
    const rest: FitnessTest = { ...t };
    delete rest.standardKey;
    return rest;
  });
  const hadMark = valid.some((t) => isStandardKey(t.standardKey));
  const used = new Set<string>(valid.filter((t) => isStandardKey(t.standardKey)).map((t) => t.standardKey as string));
  const next = valid.map((t): FitnessTest => {
    if (isStandardKey(t.standardKey)) return t;
    const rest: FitnessTest = { ...t };
    delete rest.standardKey; // 不正な値が保存されていたら外す
    const key = standardKeyForName(t.name);
    if (!key || used.has(key)) return rest;
    used.add(key);
    return { ...rest, standardKey: key };
  });
  const addStandard = (key: FitnessStandardKey) => {
    const def = DEFAULT_FITNESS_TESTS.find((d) => d.standardKey === key);
    if (!def) return;
    used.add(key);
    const id = standardTestId(key);
    if (next.some((t) => t.id === id)) return; // 同じ id の種目が（印なしで）すでにあるときは足さない（id の重複を避ける）
    next.push({ ...def, id });
  };
  if (stripped && !used.has("endurance")) addStandard("endurance");
  if (seed && valid.length > 0 && !hadMark) {
    for (const key of STANDARD_KEYS) {
      if (used.has(key)) continue;
      addStandard(key);
    }
  }
  return next;
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
    // player-hub §1-4: 種目に新体力テストの印（standardKey）を補い、足りない標準種目を足す
    // 標準種目の補完は 1 回だけ（fitnessStdSeeded が立っていれば二度と足さない。立てて保存するのは次の saveTeam）
    data.fitnessTests = normalizeFitnessTests(
      Array.isArray(data.fitnessTests) ? data.fitnessTests : DEFAULT_FITNESS_TESTS,
      data.fitnessStdSeeded !== true
    );
    data.fitnessStdSeeded = true;
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
    // カレンダーの絞り込みと色の作り直し（案A §1）: 色未設定のグループ（旧データ）に
    // 未使用パレット色を補う。一度色が付けば保存後は毎回ここを通っても変化しない
    data.groups = ensureGroupColors(data.groups);
    // events の optInPlayerIds が配列でなければ除去する
    data.events = data.events.map((e) =>
      e.optInPlayerIds !== undefined && !Array.isArray(e.optInPlayerIds)
        ? { ...e, optInPlayerIds: undefined }
        : e
    );
    // announcements の groupIds が配列でなければ除去する。chat-plan-a §2-1: お知らせの追加項目
    // （seenBy・acks・attachments は配列、pinned は真偽、title 等は文字列、remindedAt は数値）も
    // 形が壊れていれば外す（旧データはそのまま通る）
    data.announcements = data.announcements.map(normalizeAnnouncement);
    // groups-phase2 §3-1: matches の groupIds が配列でなければ除去する
    data.matches = data.matches.map((m) =>
      m.groupIds !== undefined && !Array.isArray(m.groupIds) ? { ...m, groupIds: undefined } : m
    );
    // board-squad-and-pc-polish §3: events の squad の形が壊れていれば消す
    data.events = data.events.map((e) =>
      e.squad !== undefined && !isValidEventSquad(e.squad) ? { ...e, squad: undefined } : e
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * team を保存する。成否を返す（容量超過などで書けなかったら false）。
 * 通常の保存は成否を見なくてよい。chat-plan-a §6 の移行だけは、書けたと確かめてから messages を消すために使う
 */
export function saveTeam(team: TeamData): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(TEAM_KEY, JSON.stringify(team));
    return true;
  } catch {
    return false;
  }
}

/* ---- 選手のプロフィール（成長・テスト・成績表・進路。player-hub §1-1） ---- */

/**
 * 全選手のプロフィール。形の壊れ・配列の欠落は normalizeProfile で補う。
 * 存在しない選手 id の記録も捨てない（名簿から消えた選手の記録は残す。表示しないだけ）
 */
export function loadProfiles(): Record<string, PlayerProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, PlayerProfile> = {};
    for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
      if (v && typeof v === "object") out[id] = normalizeProfile(v, id);
    }
    return out;
  } catch {
    return {};
  }
}

/** プロフィールを保存する。成否を返す（容量超過などで書けなかったら false。呼び出し側がトーストで知らせる） */
export function saveProfiles(profiles: Record<string, PlayerProfile>): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}

/** デモのサンプル(lib/sampleProfiles.ts)を入れ終えたか（player-hub §1-5） */
export function hasProfileSeedMarker(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(PROFILE_SEED_KEY) !== null;
  } catch {
    // 読めない環境では入れない（保存もできないため）
    return true;
  }
}

export function markProfileSeeded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_SEED_KEY, "1");
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

/**
 * カレンダーの絞り込み状態（案A §2。型は lib/types.ts の CalFilter）。コーチは
 * 「隠しているもの」を保存する減算型：hiddenGroupIds（非表示のグループID）・
 * hideAllTargets（全員向けを隠すか）・hiddenCategoryIds（非表示の種類ID。
 * 選手・保護者もこれだけ共用する）。存在しないIDが残っていても読み込み側
 * （lib/calendarUtils.ts の calEventVisible）は無視してよく、掃除（現存IDだけ残す）は
 * 呼び出し側（components/TeamHub.tsx の Inner）が保存前に行う。
 */
const EMPTY_CALFILTER: CalFilter = { hiddenGroupIds: [], hideAllTargets: false, hiddenCategoryIds: [] };

/** 次回も同じ絞り込みで開くための記憶。旧キー（soccer_tactics_calgroup_v1）は読まず、掃除する */
export function loadCalFilter(): CalFilter {
  if (typeof window === "undefined") return { ...EMPTY_CALFILTER };
  try {
    window.localStorage.removeItem(CALGROUP_KEY_OLD);
  } catch {
    /* 無視 */
  }
  try {
    const raw = window.localStorage.getItem(CALFILTER_KEY);
    if (!raw) return { ...EMPTY_CALFILTER };
    const data = JSON.parse(raw);
    return {
      hiddenGroupIds: Array.isArray(data?.hiddenGroupIds) ? data.hiddenGroupIds : [],
      hideAllTargets: !!data?.hideAllTargets,
      hiddenCategoryIds: Array.isArray(data?.hiddenCategoryIds) ? data.hiddenCategoryIds : [],
    };
  } catch {
    return { ...EMPTY_CALFILTER };
  }
}

export function saveCalFilter(filter: CalFilter): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALFILTER_KEY, JSON.stringify(filter));
  } catch {
    /* 無視 */
  }
}

/**
 * PCの絞り込みパネル(.calside)の開閉状態（calendar-plan-a §11-1）。既定はtrue（開いた状態）。
 * 隠すと.calが1列になりカレンダー本体が全幅を使う。値は"open"/"closed"の文字列のみ持つ
 * （壊れている・未保存なら既定のtrueへフォールバック）。
 */
export function loadCalSideOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(CALSIDE_OPEN_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function saveCalSideOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALSIDE_OPEN_KEY, open ? "open" : "closed");
  } catch {
    /* 無視 */
  }
}

/**
 * PCのサッカーノート（スタッフ）の絞り込み列(.nbside)の開閉状態（notebook-staff-redesign §3-2）。
 * loadCalSideOpenと同じ作法：既定はtrue（開いた状態）。隠すと提出一覧と詳細の2列になる。
 * 値は"open"/"closed"の文字列のみ持つ（壊れている・未保存なら既定のtrueへフォールバック）。
 */
export function loadNbSideOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(NBSIDE_OPEN_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function saveNbSideOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NBSIDE_OPEN_KEY, open ? "open" : "closed");
  } catch {
    /* 無視 */
  }
}

/**
 * PCの名簿（チーム運営 › 名簿）の絞り込み列(.rosside)の開閉状態（player-hub §2-1）。
 * loadNbSideOpenと同じ作法：既定はtrue（開いた状態）。隠すと一覧と個人ページの2列になる。
 * 値は"open"/"closed"の文字列のみ持つ（壊れている・未保存なら既定のtrueへフォールバック）。
 */
export function loadRosSideOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ROSSIDE_OPEN_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function saveRosSideOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROSSIDE_OPEN_KEY, open ? "open" : "closed");
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

/**
 * メッセージを保存する。成否を返す（容量超過＝画像・動画が大きい等は false。通常の保存では無視してよい）。
 * chat-plan-a §6 の移行は、team を書く前に「残す messages」を先に書いて容量を空けるために使う
 */
export function saveMessages(messages: ChatMessage[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    return true;
  } catch {
    return false;
  }
}

/* ---- 1 対 1 の既読時刻（chat-plan-a §2-3） ---- */
export function loadChatReads(): ChatReads | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHATREADS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    // 値の形が壊れた会話だけ捨てる（数値以外の staff/member は除く）
    const out: ChatReads = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const r = v as { staff?: unknown; member?: unknown };
      out[k] = {
        staff: typeof r.staff === "number" ? r.staff : undefined,
        member: typeof r.member === "number" ? r.member : undefined,
      };
    }
    return out;
  } catch {
    return null;
  }
}

export function saveChatReads(reads: ChatReads): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHATREADS_KEY, JSON.stringify(reads));
  } catch {
    /* 無視 */
  }
}

/* ---- チャットのセグメント（お知らせ／メッセージ）の選択（chat-plan-a §3-1） ---- */
export type ChatSeg = "ann" | "msg";

export function loadChatSeg(): ChatSeg {
  if (typeof window === "undefined") return "ann";
  try {
    return window.localStorage.getItem(CHATSEG_KEY) === "msg" ? "msg" : "ann";
  } catch {
    return "ann";
  }
}

export function saveChatSeg(seg: ChatSeg): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHATSEG_KEY, seg);
    // useGroupFilter と同じ作法: 同じキーを見る部品（チーム運営のヘッダー・チャット本体・PC の画面）が
    // 揃って読み直せるよう、localStorage 直書きのあとにイベントを発火する
    window.dispatchEvent(new Event("alfa-chatseg"));
  } catch {
    /* 無視 */
  }
}

/* ---- team／grp メッセージ → お知らせの移行マーカー（chat-plan-a §6） ---- */
export function isChatMigrated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(CHATMIG_KEY) === "1";
  } catch {
    // 読めない環境では移行しない（毎回走って二重に移すより安全）
    return true;
  }
}

export function markChatMigrated(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHATMIG_KEY, "1");
  } catch {
    /* 無視 */
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
