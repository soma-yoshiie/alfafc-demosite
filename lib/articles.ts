import type { SavedDrill, SavedPlay } from "./types";

export interface Article {
  id: string;
  category: string;
  title: string;
  lead: string;
  /** 本文（段落配列） */
  body: string[];
}

/** 記事に添付する戦術/練習（チャット添付と同じく埋め込みでライブラリ非依存） */
export interface ArticleAttachment {
  kind: "play" | "drill";
  title: string;
  play?: SavedPlay;
  drill?: SavedDrill;
}

/**
 * スタッフが投稿した記事。id は "u-" プレフィクスで seed（"a-"）と区別する。
 * draft=true は下書き（投稿画面の一覧にのみ表示。閲覧一覧・モバイルシートには出ない）
 */
export interface UserArticle extends Article {
  /** 掲載する名前 */
  author: string;
  ts: number;
  updatedAt: number;
  draft?: boolean;
  attachments?: ArticleAttachment[];
}

/** 閲覧一覧用: seed記事 + 公開済み投稿記事（新しい順で先頭に） */
export function mergedArticles(userArticles: UserArticle[]): Article[] {
  const published = userArticles
    .filter((a) => !a.draft)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return [...published, ...ARTICLES];
}

export const ARTICLE_CATEGORIES = ["練習法", "コンディション", "戦術", "チーム運営"] as const;

/** メニューの「お役立ち記事」一覧（デモ用の読み物コンテンツ） */
export const ARTICLES: Article[] = [
  {
    id: "a-cone-dribble",
    category: "練習法",
    title: "コーンドリブルで差をつける3つのコツ",
    lead: "ジグザグドリブルを“速く・正確に”するための基礎ポイント。",
    body: [
      "1. ボールは足の近くに置く。タッチ数を増やし、コーンのギリギリを通すイメージで。",
      "2. 顔を上げる。3歩に1回は前を見て、周囲の状況を確認するクセをつけましょう。",
      "3. 左右両足を使う。アウトサイド→インサイドの連続タッチで方向転換をスムーズに。",
      "練習メニュー（ドリル図）でコーンを配置し、動線を描いて選手に共有すると効果的です。",
    ],
  },
  {
    id: "a-warmup",
    category: "コンディション",
    title: "ケガを防ぐ動的ウォームアップ",
    lead: "練習・試合前の10分でパフォーマンスと安全性が変わります。",
    body: [
      "静的ストレッチよりも、体を動かしながら可動域を広げる“動的ストレッチ”が効果的です。",
      "もも上げ→お尻キック→ランジ→サイドステップ→軽いダッシュの順で心拍を上げていきます。",
      "全身が温まってからボールを使った練習に入ることで、肉離れや捻挫のリスクを下げられます。",
    ],
  },
  {
    id: "a-press",
    category: "戦術",
    title: "前から奪う：少年期のプレッシングの考え方",
    lead: "“がむしゃら”ではなく、合図を決めて全員で連動する。",
    body: [
      "プレスは1人で行っても剥がされます。最初の選手が方向を限定し、周りが連動して奪います。",
      "合図は『相手の背後へのパス』『トラップが浮いた』など、チームでルールを決めましょう。",
      "戦術アニメーションで“誰がどこへ動くか”を時間差つきで見せると、選手の理解が早まります。",
    ],
  },
  {
    id: "a-attendance",
    category: "チーム運営",
    title: "出欠管理を続けるコツと活用法",
    lead: "ただ集めるだけで終わらせない、出席データの使い方。",
    body: [
      "予定は早めに登録し、リマインドを送ると回答率が上がります。",
      "出席率は選手プロフィールから確認できます。練習量と成長・コンディションの関係を振り返りましょう。",
      "欠席が続く選手には個別に声かけを。データはあくまで“きっかけ”として使うのがポイントです。",
    ],
  },
];
