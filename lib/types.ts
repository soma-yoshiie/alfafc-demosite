// 戦術ボードの型定義

/** ポジション略号 */
export type Position =
  | "GK"
  | "CB" | "LB" | "RB" | "LWB" | "RWB"
  | "DM" | "CM" | "AM" | "LM" | "RM"
  | "LW" | "RW" | "ST" | "CF";

/** ポジションの大分類（色分け・フィルタ用） */
export type Group = "gk" | "df" | "mf" | "fw";

/** 利き足 */
export type DominantFoot = "right" | "left" | "both";

/** 体力測定の記録1件（種目は自由入力） */
export interface FitnessRecord {
  id: string;
  /** 種目名（例: 50m走 / 1500m走 / 反復横跳び） */
  name: string;
  /** 記録値（例: 7.8秒 / 5分40秒 / 52回） */
  value: string;
  /** 計測日 YYYY-MM-DD */
  date: string;
}

/** チームに登録された選手（名簿の1人） */
export interface Player {
  id: string;
  name: string;
  /** ログイン用メールアドレス（スタッフが登録） */
  email?: string;
  /** 背番号（任意） */
  number: number | null;
  position: Position;
  /** 身長cm */
  height?: number | null;
  /** 体重kg */
  weight?: number | null;
  dominantFoot?: DominantFoot;
  /** 体力測定の記録 */
  fitness?: FitnessRecord[];
  /** 怪我履歴（スタッフ管理） */
  injuries?: InjuryRecord[];
  /** 戦術上の役割メモ（タップで表示・編集する詳細な役割） */
  roleNote?: string;
}

/** ピッチ上の座標。x:0(左)-100(右) / y:0(自陣)-100(敵陣) */
export interface Point {
  x: number;
  y: number;
}

/** スタメン枠。pid が null なら空き枠 */
export interface Slot {
  role: Position;
  x: number;
  y: number;
  pid: string | null;
}

/** アニメーションの操作対象。選手はスロット番号、ボールは 'ball' */
export type Actor = number | "ball";

/** 1本の動きのルート（クリップ） */
export interface Move {
  actor: Actor;
  path: Point[];
  /** 開始秒 */
  start: number;
  /** 移動にかける秒数 */
  dur: number;
}

/** 永続化するボード全体の状態（作業中のボード） */
export interface BoardState {
  teamName: string | null;
  formation: string;
  slots: Slot[];
  /** 登録選手（名簿）。スタメン・控え両方の母集団 */
  players: Player[];
  ball: Point;
  moves: Move[];
  captain: string | null;
}

/* ===== 保存ライブラリ / フォルダ / プラン ===== */

/** 戦術を分類するフォルダ（スタッフプラン） */
export interface Folder {
  id: string;
  name: string;
}

/** 名前付きで保存された戦術。名簿(players)は含まずチーム側で共有 */
export interface SavedPlay {
  id: string;
  title: string;
  folderId: string | null;
  formation: string;
  slots: Slot[];
  ball: Point;
  moves: Move[];
  updatedAt: number;
}

export interface Library {
  plays: SavedPlay[];
  folders: Folder[];
}

/**
 * 料金プラン（クラブ単位の有料サブスク・無料プランなし）。
 * 安全設計・コア機能・差別化機能（出席率/ノート/戦術配信）は全プラン共通。
 * プラン差は「規模」（チーム数・選手数・コーチ席数）のみ。データは全プラン永続保存。
 */
export type PlanTier = "starter" | "standard" | "pro";

export interface PlanInfo {
  name: string;
  /** 月額（円） */
  monthly: number;
  /** 年額（円・2ヶ月分お得＝月額×10相当） */
  annual: number;
  /** 規模上限（表示用） */
  teams: string;
  players: string;
  seats: string;
  /** 想定クラブ */
  target: string;
}

export const PLAN_ORDER: PlanTier[] = ["starter", "standard", "pro"];

export const PLAN_INFO: Record<PlanTier, PlanInfo> = {
  starter: { name: "スターター", monthly: 1980, annual: 19800, teams: "1", players: "〜30", seats: "2", target: "少年団・単独チーム" },
  standard: { name: "スタンダード", monthly: 4980, annual: 49800, teams: "〜3", players: "〜100", seats: "8", target: "中規模クラブ・複数学年" },
  pro: { name: "プロ", monthly: 9800, annual: 98000, teams: "無制限", players: "無制限", seats: "無制限", target: "大規模クラブ" },
};

/** 旧プラン値（free/coach/team）→新プランへの移行マップ */
export function migratePlan(v: string): PlanTier {
  const map: Record<string, PlanTier> = {
    free: "starter",
    coach: "standard",
    team: "pro",
    starter: "starter",
    standard: "standard",
    pro: "pro",
  };
  return map[v] ?? "starter";
}

export interface Settings {
  plan: PlanTier;
  /** 現在読み込み中の保存戦術ID（未保存なら null） */
  currentPlayId: string | null;
  /** 選手ログイン用の共通パスワード（スタッフが設定） */
  playerPassword?: string;
  /** 試合記録を選手・保護者に公開するか（設定から変更） */
  matchesPublic?: boolean;
}

/* ===== アカウント / ログイン ===== */

export type AuthRole = "coach" | "player";

/** スタッフ契約アカウント（デモ・端末内保存） */
export interface CoachAccount {
  name: string;
  email: string;
  password: string;
}

/** ログインセッション */
export interface Session {
  role: AuthRole;
  email: string;
  name: string;
  /** player のとき、対応する選手ID */
  playerId?: string;
}

/** URL/LINE共有用の自己完結スナップショット */
export interface ShareSnapshot {
  v: 1;
  teamName: string | null;
  title: string | null;
  formation: string;
  ball: Point;
  moves: Move[];
  slots: {
    role: Position;
    x: number;
    y: number;
    p: { name: string; number: number | null; position: Position } | null;
    capt?: boolean;
  }[];
}

/* ===== 練習メニュー（ドリル図） ===== */

/** 配置するアイテムの種類 */
export type DrillItemKind =
  | "cone"
  | "player"
  | "oppo"
  | "ball"
  | "goal"
  | "marker";

export interface DrillItem {
  id: string;
  kind: DrillItemKind;
  x: number;
  y: number;
  /** 選手などの番号・記号（任意） */
  label?: string;
  /** 向き（度）。ゴールなどの回転に使用 */
  rot?: number;
}

/** 動線の種類: ラン=実線矢印 / パス=破線矢印 / ドリブル=波線矢印 / line=直線(矢印なし) */
export type DrillLineKind = "run" | "pass" | "dribble" | "line";

/** 選手・相手の丸の大きさ */
export type DiscSize = "L" | "M" | "S";

export interface DrillLine {
  id: string;
  kind: DrillLineKind;
  path: Point[];
}

/** ピッチの表示タイプ。full=縦フル / fullh=横フル / half=ハーフ / blank=ブランク */
export type PitchType = "full" | "fullh" | "half" | "blank";

/** ドリル図のドキュメント */
export interface DrillDoc {
  title: string;
  memo: string;
  pitchType: PitchType;
  items: DrillItem[];
  lines: DrillLine[];
  /** 選手・相手の丸の大きさ（既定 L） */
  discSize?: DiscSize;
}

export interface SavedDrill extends DrillDoc {
  id: string;
  updatedAt: number;
}

/* ===== チームプラン（出欠・連絡） ===== */

export type TeamEventKind = "practice" | "match";

export interface TeamEvent {
  id: string;
  kind: TeamEventKind;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 開始時刻 HH:MM */
  time?: string;
  /** 終了時刻 HH:MM */
  endTime?: string;
  place?: string;
  note?: string;
}

export type AttendanceStatus = "yes" | "maybe" | "no";

export interface AttendanceEntry {
  status: AttendanceStatus;
  comment?: string;
}

/** スタッフからのお知らせ（戦術添付も可） */
export interface Announcement {
  id: string;
  ts: number;
  text: string;
  /** 添付した保存戦術 */
  playId?: string;
  playTitle?: string;
}

/* ===== チャット / メッセージ（戦術・トレーニング・画像・動画の送信） ===== */

/** 添付の種類: 戦術 / トレーニング(ドリル図) / 画像 / 動画 */
export type ChatAttachmentKind = "play" | "drill" | "image" | "video";

/** メッセージに添付するもの。戦術/ドリルは埋め込みデータでライブラリ非依存に読込可能 */
export interface ChatAttachment {
  kind: ChatAttachmentKind;
  /** 表示名（戦術/トレーニングのタイトル・ファイル名など） */
  title?: string;
  /** play 添付の埋め込みデータ */
  play?: SavedPlay;
  /** drill 添付の埋め込みデータ */
  drill?: SavedDrill;
  /** image/video の data URL */
  dataUrl?: string;
}

/**
 * 会話の宛先キー。
 * "team" = チーム全員 / "p:<playerId>" = 個人（その選手とスタッフのDM）
 */
export type ChatThreadKey = string;

/** 1通のメッセージ */
export interface ChatMessage {
  id: string;
  ts: number;
  /** 宛先（会話）キー */
  to: ChatThreadKey;
  /** 送信者: "coach" = スタッフ / "p:<playerId>" = 選手 */
  from: string;
  /** 送信者の表示名 */
  fromName?: string;
  text?: string;
  attachments?: ChatAttachment[];
}

/** 個人DMの会話キーを作る */
export function dmThreadKey(playerId: string): ChatThreadKey {
  return "p:" + playerId;
}
/** 会話キーが個人DMなら playerId を返す（チームなら null） */
export function threadPlayerId(key: ChatThreadKey): string | null {
  return key.startsWith("p:") ? key.slice(2) : null;
}

/** 試合の得点 */
export interface MatchGoal {
  playerId: string;
  minute?: number;
  assistPlayerId?: string;
}

/** 試合の交代 */
export interface MatchSub {
  outPlayerId: string;
  inPlayerId: string;
  minute?: number;
}

/** 大会・カップ戦など（試合記録の分類） */
export interface Competition {
  id: string;
  name: string;
  /** 期間・会場などのメモ（任意） */
  note?: string;
}

/** 試合記録（簡易スタッツ） */
export interface MatchRecord {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  opponent: string;
  /** 登録した大会のID（任意。未指定＝その他/単発） */
  competitionId?: string;
  /** 旧データ互換用の大会名フリーテキスト */
  competition?: string;
  ourScore: number;
  theirScore: number;
  goals: MatchGoal[];
  subs: MatchSub[];
  note?: string;
}

/* ===== サッカーノート（選手が提出する振り返り） ===== */

/** その日のコンディション */
export type NoteCondition = "great" | "good" | "normal" | "tired" | "bad";

export const NOTE_CONDITION_LABEL: Record<NoteCondition, string> = {
  great: "絶好調",
  good: "good",
  normal: "ふつう",
  tired: "疲れ気味",
  bad: "不調",
};

/**
 * サッカーノートの種別（3バケツ）。
 * match=試合ノート / practice=練習ノート / solo=自主練ノート
 */
export type NoteKind = "match" | "practice" | "solo";

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  match: "試合",
  practice: "練習",
  solo: "自主練",
};

/** 全ノート共通の基底 */
interface NoteBase {
  id: string;
  playerId: string;
  kind: NoteKind;
  /** YYYY-MM-DD */
  date: string;
  ts: number;
  condition?: NoteCondition;
  /** 自由メモ */
  body?: string;
  /** スタッフからのコメント（任意） */
  staffComment?: string;
  staffCommentTs?: number;
}

/* --- ① スタメン・フォーメーション記録（試合ノート） --- */
export type MatchPhase = "1st" | "2nd" | "et";
export const MATCH_PHASE_LABEL: Record<MatchPhase, string> = {
  "1st": "前半",
  "2nd": "後半",
  et: "延長",
};

/** 1フェーズの陣形記録 */
export interface MatchPhaseLineup {
  phase: MatchPhase;
  /** 自チームのフォーメーションキー */
  ownFormation: string;
  /** 自分のポジション（スロット番号。未設定は null） */
  ownPositionIndex: number | null;
  /** 相手のフォーメーションキー */
  oppFormation: string;
}

/* --- ② プレーエリア記録（試合ノート／練習でも可） --- */
export type PlayKind = "receive" | "shot" | "miss";
export const PLAY_KIND_LABEL: Record<PlayKind, string> = {
  receive: "受けた",
  shot: "シュート",
  miss: "ミス",
};
/** ピッチ上のプレー記録（x:左右 / y:0自陣-100敵陣） */
export interface PlayPoint {
  x: number;
  y: number;
  kind: PlayKind;
}

/** プレーの軌道（ドリブル／パス／シュートコース） */
export type PlayLineKind = "dribble" | "pass" | "shot";
export const PLAY_LINE_LABEL: Record<PlayLineKind, string> = {
  dribble: "ドリブル",
  pass: "パス",
  shot: "シュートコース",
};
export interface PlayLine {
  kind: PlayLineKind;
  /** なぞった軌道（x:左右 / y:0自陣-100敵陣） */
  path: Point[];
}

/** 試合ノート */
export interface MatchNote extends NoteBase {
  kind: "match";
  /** 紐付く試合記録ID（任意） */
  matchId?: string;
  opponent?: string;
  /** ① 前半/後半/延長の陣形 */
  lineups?: MatchPhaseLineup[];
  /** ② プレーエリア記録 */
  plays?: PlayPoint[];
  /** ② プレーの軌道（ドリブル/パス/シュートコース） */
  playLines?: PlayLine[];
  /** ② AI分析（プレーエリア）の要約 */
  aiSummary?: string;
  /* --- ⑧ ベストプレー記録 --- */
  bestPlay?: string;
  reflectPlay?: string;
  /** 動画URL（任意） */
  videoUrl?: string;
  /* --- ⑫ AI試合レポート --- */
  minutes?: number;
  reportGood?: string;
  reportImprove?: string;
  /** ⑫ AI要約（ローカル生成・将来はAPI） */
  reportSummary?: string;
}

/** 練習ノート */
export interface PracticeNote extends NoteBase {
  kind: "practice";
  /** 紐付く練習予定ID（任意） */
  eventId?: string;
  /** ⑥ 今日の目標 */
  goalPre?: string;
  /** ⑥ 達成度 0-100 */
  achievement?: number;
  /** ④ 気づき（複数） */
  insights?: string[];
  /** ⑪ チームに共有する */
  isPublic?: boolean;
}

/** 自主練の種目 */
export type SoloKind = "lifting" | "running" | "strength" | "other";
export const SOLO_KIND_LABEL: Record<SoloKind, string> = {
  lifting: "リフティング",
  running: "ランニング",
  strength: "筋トレ",
  other: "その他",
};
export interface SoloItem {
  kind: SoloKind;
  /** 値（自由入力。例: 100回 / 5km / 30分） */
  value: string;
}

/** 自主練ノート */
export interface SoloNote extends NoteBase {
  kind: "solo";
  items: SoloItem[];
}

/** サッカーノート1件（選手が記入・提出、スタッフが閲覧・コメント） */
export type NotebookEntry = MatchNote | PracticeNote | SoloNote;

/* ===== コーチからの配信物（③練習メニュー / ⑤個人課題 / ⑦試合前ミーティング / ⑨理解度テスト） ===== */

export type DeliverKind = "menu" | "assignment" | "meeting" | "quiz";
export const DELIVER_KIND_LABEL: Record<DeliverKind, string> = {
  menu: "練習メニュー",
  assignment: "個人課題",
  meeting: "試合前ミーティング",
  quiz: "理解度テスト",
};

interface DeliverBase {
  id: string;
  kind: DeliverKind;
  ts: number;
  title: string;
  /** 配信先の選手ID。未指定/空＝チーム全員 */
  targetPlayerIds?: string[];
}

/** ③ 練習メニュー配信＋選手の理解度/難易度/感想 */
export interface MenuResponse {
  understanding: number; // 1-5
  difficulty: number; // 1-5
  comment?: string;
  ts: number;
}
export interface PracticeMenuDeliver extends DeliverBase {
  kind: "menu";
  category?: string; // 3対2 / ポゼッション / ビルドアップ 等
  desc?: string;
  responses: Record<string, MenuResponse>;
}

/** ⑤ 個人課題＋選手の達成度回答 */
export type AssignmentStatus = "done" | "partial" | "none";
export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  done: "実践できた",
  partial: "一部できた",
  none: "できなかった",
};
export interface AssignmentResponse {
  status: AssignmentStatus;
  comment?: string;
  ts: number;
}
export interface AssignmentDeliver extends DeliverBase {
  kind: "assignment";
  detail?: string;
  responses: Record<string, AssignmentResponse>;
}

/** ⑦ 試合前ミーティング＋選手の確認/実行 */
export interface MeetingResponse {
  ack: boolean;
  /** 試合後：実行できたか */
  execution?: string;
  ts: number;
}
export interface MeetingDeliver extends DeliverBase {
  kind: "meeting";
  /** 対戦相手など */
  matchLabel?: string;
  attack: string[];
  defense: string[];
  responses: Record<string, MeetingResponse>;
}

/** ⑨ ポジション理解度テスト（選択式）＋回答 */
export interface QuizQuestion {
  q: string;
  options: string[];
  correct: number;
}
export interface QuizResponse {
  answers: number[];
  ts: number;
}
export interface QuizDeliver extends DeliverBase {
  kind: "quiz";
  questions: QuizQuestion[];
  responses: Record<string, QuizResponse>;
}

export type CoachDeliverable =
  | PracticeMenuDeliver
  | AssignmentDeliver
  | MeetingDeliver
  | QuizDeliver;

/** 配信物が対象選手に届くか */
export function deliverTargets(d: CoachDeliverable, playerId: string): boolean {
  return !d.targetPlayerIds || d.targetPlayerIds.length === 0 || d.targetPlayerIds.includes(playerId);
}

/** 怪我の状態 */
export type InjuryStatus = "out" | "recovering" | "ok";

export const INJURY_STATUS_LABEL: Record<InjuryStatus, string> = {
  out: "離脱中",
  recovering: "復帰途上",
  ok: "完治",
};

/** 怪我履歴の1件（スタッフ管理・選手プロフィールに保持） */
export interface InjuryRecord {
  id: string;
  /** 受傷日 YYYY-MM-DD */
  date: string;
  /** 部位・内容 */
  area: string;
  status: InjuryStatus;
  /** 復帰予定日など */
  note?: string;
}

export interface TeamData {
  events: TeamEvent[];
  /** [eventId][playerId] = 出欠 */
  attendance: Record<string, Record<string, AttendanceEntry>>;
  announcements: Announcement[];
  /** 共同編集デモ用のスタッフ名 */
  coaches: string[];
  /** 試合記録（過去データ） */
  matches: MatchRecord[];
  /** 登録した大会・カップ戦 */
  competitions: Competition[];
}

/** デモ用の閲覧者ロール。coach=管理 / member=選手・保護者 */
export type ViewerRole = "coach" | "member";

export interface TeamViewer {
  role: ViewerRole;
  /** member のとき、どの選手として見るか */
  memberPlayerId: string | null;
}
