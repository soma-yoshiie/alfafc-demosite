import type { Session } from "./types";
import type { Article, UserArticle } from "./articles";
import { ARTICLES } from "./articles";

/**
 * コーチラボ（指導者が記事を投稿・販売し、読者がフォロー・購入できる仕組み）のデータ層。
 * 端末内デモ（localStorage）。決済は疑似（確認→購入記録のみ、実際の課金は行わない）。
 * 詳細は specs/coachlab.md を参照。
 */

/* ===================== 資格・地域・タグの定数 ===================== */

export type License =
  | "JFA S級"
  | "JFA A級"
  | "JFA B級"
  | "JFA C級"
  | "JFA D級"
  | "キッズリーダー"
  | "GKレベル1"
  | "GKレベル2"
  | "GKレベル3"
  | "フィジカルフィットネスC級"
  | "審判1級"
  | "審判2級"
  | "審判3級"
  | "審判4級"
  | "元プロ選手"
  | "海外指導経験"
  | "教員免許（保健体育）"
  | "アスレティックトレーナー";

/** topLicense() が最上位とみなす優先順（先頭ほど上位） */
export const LICENSES: License[] = [
  "JFA S級",
  "JFA A級",
  "JFA B級",
  "JFA C級",
  "JFA D級",
  "キッズリーダー",
  "GKレベル1",
  "GKレベル2",
  "GKレベル3",
  "フィジカルフィットネスC級",
  "審判1級",
  "審判2級",
  "審判3級",
  "審判4級",
  "元プロ選手",
  "海外指導経験",
  "教員免許（保健体育）",
  "アスレティックトレーナー",
];

export const AUTHOR_ROLES = [
  "監督",
  "コーチ",
  "GKコーチ",
  "アナリスト",
  "トレーナー",
  "スクール代表",
  "部活動顧問",
  "保護者コーチ",
  "その他",
] as const;
export type AuthorRole = (typeof AUTHOR_ROLES)[number];

/** 47都道府県 */
export const REGIONS: string[] = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export const ARTICLE_TAGS_SUGGEST: string[] = [
  "U-12", "U-15", "U-18", "8人制", "11人制", "ビルドアップ", "プレッシング",
  "セットプレー", "GK", "フィジカル", "メンタル", "保護者対応", "チーム運営", "部活動",
];

/* ===================== 手数料モデル ===================== */

/** 販売手数料（決済手数料込み・単一率） */
export const SALE_FEE_RATE = 0.15;
/** 振込手数料（デモでは0円） */
export const PAYOUT_FEE_YEN = 0;
export const MIN_PRICE = 100;
export const MAX_PRICE = 50000;
/** 振込申請の最低額 */
export const MIN_PAYOUT = 1000;

/** 価格を「手数料」と「指導者の取り分」に分ける */
export function splitSale(price: number): { fee: number; creator: number } {
  const fee = Math.round(price * SALE_FEE_RATE);
  return { fee, creator: price - fee };
}

/* ===================== 型 ===================== */

/** 経歴の1行（from/to は "2019" や "2021-04" のような文字列） */
export interface CareerItem {
  from: string;
  to?: string;
  org: string;
  role: string;
}

export interface AuthorProfile {
  /** 自分: "me:<email小文字>"／シード: "s-<slug>" */
  id: string;
  name: string;
  headline: string;
  bio: string;
  licenses: License[];
  role?: string;
  team?: string;
  region?: string;
  career: CareerItem[];
  /** アバター色（0-359）。名前の頭文字を丸で表示する際に使う */
  hue: number;
  createdAt: number;
  updatedAt: number;
  /** シード（架空の指導者）データであることを示す。上書きしない目印 */
  seed?: boolean;
  /** シードの初期フォロワー数（表示用のベース値。実フォローに加算する） */
  followerBase?: number;
}

export interface Follow {
  userId: string;
  authorId: string;
  ts: number;
}
export interface Purchase {
  userId: string;
  articleId: string;
  price: number;
  ts: number;
}
export interface Like {
  userId: string;
  articleId: string;
  ts: number;
}
export interface Payout {
  authorId: string;
  amount: number;
  ts: number;
}

export interface CoachLabState {
  profiles: AuthorProfile[];
  follows: Follow[];
  purchases: Purchase[];
  likes: Like[];
  /** 記事ID → 閲覧数 */
  views: Record<string, number>;
  payouts: Payout[];
}

export function emptyCoachLabState(): CoachLabState {
  return { profiles: [], follows: [], purchases: [], likes: [], views: {}, payouts: [] };
}

/* ===================== 共通ヘルパー ===================== */

/** board.auth（ログインセッション）から利用者IDを求める */
export function userIdOf(auth: Session): string {
  if (auth.role === "coach") return `me:${auth.email.toLowerCase()}`;
  return `p:${auth.playerId ?? ""}`;
}

/** プロフィールが持つ資格のうち、LICENSES の並び順で最も優先度の高い1つ */
export function topLicense(profile: AuthorProfile): License | undefined {
  return LICENSES.find((lic) => profile.licenses.includes(lic));
}

/** 記事の authorId（未設定の旧データは呼び出し元の利用者IDとして扱う＝旧データ互換） */
export function resolveAuthorId(a: UserArticle, meId: string): string {
  return a.authorId ?? meId;
}

/** 本文の総文字数から読了時間を概算する（500字/分・最小1分・切り上げ） */
export function readingMinutes(body: string[]): number {
  const chars = body.reduce((sum, p) => sum + p.length, 0);
  return Math.max(1, Math.ceil(chars / 500));
}

/** 有料記事を公開できるか（名前・肩書は必須。資格またはチーム名のどちらかが必要） */
export function canPublishPaid(profile: AuthorProfile | null): boolean {
  if (!profile) return false;
  if (!profile.name.trim() || !profile.headline.trim()) return false;
  return profile.licenses.length > 0 || !!(profile.team && profile.team.trim());
}

/* ===================== 検索 ===================== */

export interface ArticleSearchOptions {
  q?: string;
  category?: string;
  /** 複数タグはAND絞り込み */
  tag?: string[];
  priceFilter?: "all" | "free" | "paid";
  authorIds?: string[];
}

/** タイトル・リード・本文・タグ・著者名を部分一致（大小無視）。タグはAND */
export function searchArticles(list: UserArticle[], opts: ArticleSearchOptions): UserArticle[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return list.filter((a) => {
    if (opts.category && opts.category !== "all" && a.category !== opts.category) return false;
    if (opts.priceFilter === "free" && (a.price ?? 0) > 0) return false;
    if (opts.priceFilter === "paid" && !((a.price ?? 0) > 0)) return false;
    if (opts.authorIds && opts.authorIds.length > 0) {
      if (!opts.authorIds.includes(a.authorId ?? "")) return false;
    }
    if (opts.tag && opts.tag.length > 0) {
      const tags = a.tags ?? [];
      if (!opts.tag.every((t) => tags.includes(t))) return false;
    }
    if (q) {
      const hay = [a.title, a.lead, a.body.join(" "), (a.tags ?? []).join(" "), a.author]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface AuthorSearchOptions {
  q?: string;
  license?: License;
  region?: string;
  role?: string;
}

/** 名前・肩書・チーム名・資格・地域を部分一致（大小無視）。資格名（例「S級」）やチーム名でも当たる */
export function searchAuthors(profiles: AuthorProfile[], opts: AuthorSearchOptions): AuthorProfile[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return profiles.filter((p) => {
    if (opts.license && !p.licenses.includes(opts.license)) return false;
    if (opts.region && p.region !== opts.region) return false;
    if (opts.role && p.role !== opts.role) return false;
    if (q) {
      const hay = [p.name, p.headline, p.team ?? "", p.region ?? "", ...p.licenses]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ===================== シードデータ ===================== */

const DAY = 86_400_000;
/** シードの日付計算はimport時のDate.now()ではなく固定基準時刻にする（毎回結果が変わらないように） */
const SEED_BASE = Date.UTC(2026, 8, 11);
function daysAgo(n: number): number {
  return SEED_BASE - n * DAY;
}

/** 指導者6名（全員架空。実在の人物・チーム名は使用していない） */
export const SEED_PROFILES: AuthorProfile[] = [
  {
    id: "s-alfa",
    name: "ALFA編集部",
    headline: "ALFA FOOTBALL運営",
    bio: "アプリの運営チームが、指導・チーム運営に関する読み物を定期的にまとめています。特定の指導者の視点に偏らない、一般的な知見を中心に紹介します。",
    licenses: [],
    career: [],
    hue: 205,
    createdAt: daysAgo(400),
    updatedAt: daysAgo(400),
    seed: true,
    followerBase: 420,
  },
  {
    id: "s-nakagaku",
    name: "橋本 直樹",
    headline: "中学クラブ監督・JFA S級",
    bio: "大学卒業後、中学年代のクラブチームでコーチを経て監督に。ボールを持たされるだけの守備から、意図を持って前進するビルドアップへの転換を得意分野にしています。",
    licenses: ["JFA S級", "JFA A級"],
    role: "監督",
    team: "府中南ジュニアユース",
    region: "東京都",
    career: [
      { from: "2011", to: "2015", org: "○○大学サッカー部", role: "主将" },
      { from: "2016", to: "2020", org: "府中南ジュニアユース", role: "コーチ" },
      { from: "2021", org: "府中南ジュニアユース", role: "監督" },
    ],
    hue: 152,
    createdAt: daysAgo(300),
    updatedAt: daysAgo(300),
    seed: true,
    followerBase: 185,
  },
  {
    id: "s-school",
    name: "小林 蒼太",
    headline: "サッカースクール代表・元プロ選手",
    bio: "現役時代は国内複数クラブでプレー。引退後、地域の育成年代に向けたスクールを立ち上げました。技術指導だけでなく、結果が出ない時期の気持ちの整え方も伝えています。",
    licenses: ["元プロ選手", "JFA B級"],
    role: "スクール代表",
    team: "湘南ジュニアFC",
    region: "神奈川県",
    career: [
      { from: "2005", to: "2016", org: "国内複数クラブ", role: "選手" },
      { from: "2017", org: "湘南ジュニアFC", role: "代表" },
    ],
    hue: 28,
    createdAt: daysAgo(260),
    updatedAt: daysAgo(260),
    seed: true,
    followerBase: 260,
  },
  {
    id: "s-koko",
    name: "村上 恵一",
    headline: "高校サッカー部顧問・保健体育科教員",
    bio: "保健体育科の教員として高校サッカー部の顧問を務めています。専門的な戦術指導よりも、保護者対応や部活動運営の工夫について発信しています。",
    licenses: ["教員免許（保健体育）", "JFA C級"],
    role: "部活動顧問",
    team: "県立誠明高校サッカー部",
    region: "千葉県",
    career: [{ from: "2013", org: "県立誠明高校", role: "保健体育科教員・サッカー部顧問" }],
    hue: 268,
    createdAt: daysAgo(220),
    updatedAt: daysAgo(220),
    seed: true,
    followerBase: 95,
  },
  {
    id: "s-gk",
    name: "大野 拓海",
    headline: "GKコーチ",
    bio: "GK専門のコーチとして、キャッチングやシュートストップだけでなく、配球やビルドアップの起点としてのGKの役割を指導しています。",
    licenses: ["GKレベル2", "JFA C級"],
    role: "GKコーチ",
    team: "大阪GKアカデミー",
    region: "大阪府",
    career: [{ from: "2015", org: "大阪GKアカデミー", role: "GKコーチ" }],
    hue: 95,
    createdAt: daysAgo(180),
    updatedAt: daysAgo(180),
    seed: true,
    followerBase: 140,
  },
  {
    id: "s-trainer",
    name: "石田 真央",
    headline: "アスレティックトレーナー",
    bio: "育成年代のコンディショニングとリカバリーを専門にしています。特別な設備がなくてもできる工夫を中心に発信しています。",
    licenses: ["アスレティックトレーナー"],
    role: "トレーナー",
    team: "中京フィジカルラボ",
    region: "愛知県",
    career: [{ from: "2018", org: "中京フィジカルラボ", role: "アスレティックトレーナー" }],
    hue: 350,
    createdAt: daysAgo(150),
    updatedAt: daysAgo(150),
    seed: true,
    followerBase: 58,
  },
];

/** 既存seed記事（lib/articles.ts の ARTICLES）に著者・タグ・公開日を付与するメタデータ */
export const SEED_ARTICLE_META: Record<string, { authorId: string; tags?: string[]; publishedAt: number }> = {
  "a-cone-touch": { authorId: "s-alfa", tags: ["U-12", "8人制"], publishedAt: daysAgo(120) },
  "a-warmup-why": { authorId: "s-trainer", tags: ["フィジカル", "U-15"], publishedAt: daysAgo(95) },
  "a-press-cues": { authorId: "s-nakagaku", tags: ["プレッシング", "11人制"], publishedAt: daysAgo(80) },
  "a-attendance-use": { authorId: "s-alfa", tags: ["チーム運営"], publishedAt: daysAgo(60) },
  "a-touch-kick": { authorId: "s-koko", tags: ["U-12"], publishedAt: daysAgo(45) },
};

/** 新規シード記事5本（うち有料3本：¥300／¥500／¥1,000）。本文はオリジナル */
export const SEED_ARTICLES: UserArticle[] = [
  {
    id: "s-buildup-firsttouch",
    category: "戦術",
    title: "ボランチが「受ける前に」外す一手だけで変わるビルドアップ",
    lead: "後ろでボールを持たされる場面は増えたのに、前進が増えないチームには共通の間が空いている。",
    body: [
      "最終ラインでボールを握れるようになったチームほど、次の課題がはっきり見えてくる。センターバックからボランチへ、ボランチから前線へと渡すその「間」で、相手の矢印を外す準備ができていないケースが多い。パスの受け手が正面を向いたまま止まっていると、どれだけ丁寧にパスをつないでも、相手は狩り場を絞り込みやすくなる。",
      "ここで効くのが、パスが出る直前の「半身の外し」だ。ボールを持つ選手がトラップする前に、受け手が体の向きを一度変えるだけで、次のパスコースが二方向に増える。声で指示するより、練習の中で「受ける前に一歩動いてから止まる」というルールを繰り返した方が、試合の中でも自然に出てくるようになる。",
      "具体的なメニューとしては、4対2のロンドをベースに、パスを受ける選手が必ずボール保持者のトラップ前に肩の向きを変える「先出しターン」の制約をつける。最初はテンポが落ちるが、慣れてくると相手の矢印を外す判断が速くなり、パスの角度そのものが増えていく。",
      "中学年代でここまで求めると難しいと感じるかもしれないが、実際には「受ける前に一歩」というシンプルなルールだけで十分に効果が出る。複雑な状況判断を教え込むより、体の向きという一点に絞ることで、選手自身が「次はどこが空くか」を自分の目で探し始める。",
      "最後に大事なのは、このビルドアップの型を一つの陣形やシステムに固定しないことだ。相手の並びが変わればパスコースも変わる。型を教えるのではなく、「受ける前に外す」という原則だけを共有しておけば、対戦相手が変わっても選手たちは同じ考え方で崩し方を探せるようになる。",
    ],
    author: "橋本 直樹",
    authorId: "s-nakagaku",
    tags: ["ビルドアップ", "U-12", "11人制"],
    price: 1000,
    paidFrom: 2,
    refundable: true,
    ts: daysAgo(20),
    updatedAt: daysAgo(20),
    publishedAt: daysAgo(20),
  },
  {
    id: "s-gk-distribution",
    category: "練習法",
    title: "GKのフィード、「蹴る前」に何を見ているか",
    lead: "遠くへ飛ばす練習ばかりしていても、実戦のフィードは上達しない。見るべき順番を変えるだけで選択肢が増える。",
    body: [
      "GKの配球練習というと、ロングキックの精度を上げる反復に偏りがちだ。だが試合で本当に差がつくのは、蹴る前にどこを見ているかという順番の方だ。ボールが自分に返ってくる前から相手のプレスの矢印を確認できているGKは、キャッチした瞬間には次のプレーがほぼ決まっている。",
      "見る順番の基本は、まず相手の一列目の枚数、次に味方センターバックの角度、最後に逆サイドの状況という三段階だ。この順で首を振る習慣をつけると、キャッチしてから配球判断までの時間が目に見えて短くなる。",
      "練習では、キャッチする瞬間にコーチが片手でサインを出し、GKはキャッチと同時にその方向を確認してから配球先を選ぶという制約をつけると、実戦に近い形で首振りの習慣がつく。",
      "この習慣が身につくと、ロングキックの飛距離を伸ばす練習よりも先に、配球の成功率そのものが上がる。飛ばす技術は後からでも伸ばせるが、見る順番は繰り返しの中でしか身につかないため、GKコーチとしては最優先で扱いたい部分だ。",
    ],
    author: "大野 拓海",
    authorId: "s-gk",
    tags: ["GK", "U-15"],
    price: 300,
    paidFrom: 3,
    refundable: true,
    ts: daysAgo(14),
    updatedAt: daysAgo(14),
    publishedAt: daysAgo(14),
  },
  {
    id: "s-pro-mentality",
    category: "コンディション",
    title: "「プロを経験した」からこそ話せる、メンタルの整え方",
    lead: "結果が出ない時期に何を考えていたかは、教科書には書かれていない。",
    body: [
      "現役時代、調子の波は誰にでもあった。うまくいかない時期に一番やってはいけなかったのは、練習量を増やして「とにかく頑張る」ことだった。焦って量を増やすほど、フォームや判断の質は落ちていった。",
      "指導者になってから気づいたのは、選手たちも同じ罠にはまりやすいということだ。結果が出ない選手ほど、自主練の時間を増やそうとする。量を増やす前に、まず何が崩れているかを一緒に確認する時間を作ることの方が効果が大きい。",
      "実際に取り入れているのは、練習後の5分間だけ「今日できたこと」を一つだけ選手に言わせる時間だ。できなかったことばかりに目が向きがちな時期ほど、この5分が効いてくる。",
      "現役時代に信頼していたメンタルコーチから教わった方法で、結果ではなくプロセスの一部を毎回言語化させるというシンプルなものだが、続けると選手自身が自分の調子の波に気づけるようになる。",
      "指導者としての役割は、調子の波をなくすことではなく、波の中でも崩れない一部分を選手と一緒に見つけておくことだと思っている。それがあれば、結果が出ない時期も次につながる時間に変えられる。",
    ],
    author: "小林 蒼太",
    authorId: "s-school",
    tags: ["メンタル", "U-18"],
    price: 500,
    paidFrom: 2,
    refundable: true,
    ts: daysAgo(9),
    updatedAt: daysAgo(9),
    publishedAt: daysAgo(9),
  },
  {
    id: "s-parent-contact",
    category: "チーム運営",
    title: "保護者への連絡、内容より「タイミング」で信頼が変わる",
    lead: "同じ内容の連絡でも、送るタイミング次第で受け取られ方はまったく違う。",
    body: [
      "試合や練習の変更連絡は、内容自体に問題がなくても、送るタイミングが遅いというだけで保護者の不満につながることがある。特に休日の予定に関わる連絡は、前日の夜より当日の朝の方が「準備が間に合わない」という声が増える。",
      "顧問として意識しているのは、変更が決まった時点でまず一報だけ先に入れることだ。詳細が固まっていなくても「変更の可能性があります、詳細は今夜までに」という一文があるだけで、保護者側の心構えがまったく違ってくる。",
      "良い知らせと悪い知らせを同じタイミングでまとめて送るのも避けたい。悪い知らせ（時間変更や中止）は単独で、理由を添えて送る。良い知らせと混ぜると、悪い知らせの方が読み飛ばされやすくなる。",
      "部活動という制約の多い環境では、連絡の内容を工夫する余地は限られている。だからこそ、いつ・どの順番で伝えるかという運用の部分に工夫の余地があると考えている。",
    ],
    author: "村上 恵一",
    authorId: "s-koko",
    tags: ["保護者対応", "チーム運営", "部活動"],
    price: 0,
    paidFrom: null,
    audience: "parent",
    ts: daysAgo(5),
    updatedAt: daysAgo(5),
    publishedAt: daysAgo(5),
  },
  {
    id: "s-recovery-nutrition",
    category: "コンディション",
    title: "練習後30分の過ごし方が、翌日のコンディションを決める",
    lead: "練習直後に何もしない30分が、疲労を翌日以降に持ち越す一番の原因になっている。",
    body: [
      "練習が終わった直後、選手たちはすぐに着替えて帰ろうとする。ここで何もせずに体を冷やしてしまうと、疲労物質の回収が遅れ、翌日以降に疲れが残りやすくなる。",
      "特別な設備がなくても、練習直後の5分だけ軽いジョグと動的なストレッチを挟むだけで、翌日の脚の張り方が変わってくる。時間がないという理由で省略されがちな部分だが、優先順位は高い。",
      "栄養面では、練習後30分以内に糖質とたんぱく質を少量でも摂ることを勧めている。おにぎり1個と牛乳1本のような身近な組み合わせで十分で、高価なサプリメントを揃える必要はない。",
      "保護者への説明も、難しい栄養学の話より「練習後30分以内に何か食べる」という一点に絞ると伝わりやすい。継続してもらうためには、複雑さより分かりやすさを優先している。",
    ],
    author: "石田 真央",
    authorId: "s-trainer",
    tags: ["フィジカル"],
    price: 0,
    paidFrom: null,
    ts: daysAgo(2),
    updatedAt: daysAgo(2),
    publishedAt: daysAgo(2),
  },
];

/** lib/articles.ts の Article（seed）を UserArticle の形へ補完する（著者・タグ・公開日を付与） */
function seedToUserArticle(a: Article): UserArticle {
  const meta = SEED_ARTICLE_META[a.id];
  const authorId = meta?.authorId ?? "s-alfa";
  const authorName = SEED_PROFILES.find((p) => p.id === authorId)?.name ?? "ALFA編集部";
  const publishedAt = meta?.publishedAt ?? 0;
  return {
    ...a,
    author: authorName,
    ts: publishedAt,
    updatedAt: publishedAt,
    authorId,
    tags: meta?.tags,
    publishedAt,
    price: 0,
    paidFrom: null,
    refundable: false,
  };
}

/**
 * 閲覧一覧用: 既存seed記事 + 新規シード記事 + 公開済みの投稿記事（新しい順で先頭）。
 * lib/articles.ts の mergedArticles() とは別に、コーチラボの一覧・検索・詳細はこちらを使う。
 */
export function allArticles(userArticles: UserArticle[]): UserArticle[] {
  const seedOld = ARTICLES.map(seedToUserArticle);
  const published = userArticles.filter((a) => !a.draft);
  return [...seedOld, ...SEED_ARTICLES, ...published].sort(
    (a, b) => (b.publishedAt ?? b.ts) - (a.publishedAt ?? a.ts)
  );
}
