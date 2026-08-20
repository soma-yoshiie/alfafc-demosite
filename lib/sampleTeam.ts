import type { Player } from "./types";

/** 初回起動時に入っているサンプルの少年団チーム名簿（編集・削除可） */
export const SAMPLE_TEAM_NAME = "アルファラスFC U-12";

// 学年(grade)は出欠の学年別集計・名簿表示のデモ用に5年/6年をバランス良く付与している。
// 既存ユーザーのlocalStorageには効かない(初回シード時のみ使われる新規データのため)。
export const SAMPLE_PLAYERS: Player[] = [
  { id: "p01", name: "佐藤 蓮", number: 1, position: "GK", email: "ren@alfafc.example", height: 151, weight: 44, dominantFoot: "right", grade: 6 },
  { id: "p02", name: "中村 大翔", number: 2, position: "RB", height: 147, weight: 37, dominantFoot: "right", grade: 6 },
  { id: "p03", name: "伊藤 陽斗", number: 4, position: "CB", height: 155, weight: 46, dominantFoot: "right", grade: 6 },
  { id: "p04", name: "渡辺 湊", number: 5, position: "CB", height: 150, weight: 40, dominantFoot: "left", grade: 5 },
  {
    id: "p05",
    name: "木村 樹",
    number: 3,
    position: "LB",
    height: 146,
    weight: 36,
    dominantFoot: "left",
    grade: 6,
    injuries: [
      {
        id: "inj1",
        date: "2026-08-06",
        area: "右足首 捻挫",
        status: "recovering",
        note: "軽めのメニューから復帰中。来週フル合流予定。",
      },
    ],
  },
  { id: "p06", name: "高橋 颯太", number: 6, position: "CM", height: 149, weight: 41, dominantFoot: "right", grade: 6 },
  { id: "p07", name: "斎藤 悠真", number: 8, position: "CM", height: 147, weight: 34, dominantFoot: "right", grade: 5 },
  {
    id: "p08",
    name: "佐藤 蒼空",
    number: 10,
    position: "AM",
    email: "sora@alfafc.example",
    height: 151,
    weight: 43,
    dominantFoot: "left",
    grade: 6,
    fitness: [
      { id: "f1", name: "50m走", value: "7.7秒", date: "2026-05-16" },
      { id: "f2", name: "1500m走", value: "6分04秒", date: "2026-05-16" },
      { id: "f3", name: "反復横跳び", value: "51回", date: "2026-07-25" },
    ],
  },
  { id: "p09", name: "小林 律", number: 7, position: "RW", height: 145, weight: 35, dominantFoot: "right", grade: 6 },
  { id: "p10", name: "加藤 朝陽", number: 9, position: "ST", height: 153, weight: 47, dominantFoot: "right", grade: 5 },
  { id: "p11", name: "吉田 結翔", number: 11, position: "LW", height: 144, weight: 33, dominantFoot: "left", grade: 6 },
  // 控え
  { id: "p12", name: "山本 駿", number: 12, position: "GK", height: 150, weight: 45, dominantFoot: "right", grade: 5 },
  {
    id: "p13",
    name: "松本 暖",
    number: 13,
    position: "CB",
    grade: 5,
    injuries: [
      {
        id: "inj2",
        date: "2026-06-30",
        area: "左太もも 肉離れ(軽度)",
        status: "recovering",
        note: "痛みは引いてきたが、ダッシュ系は様子を見ながら段階的に負荷を上げる。",
      },
    ],
  },
  { id: "p14", name: "井上 碧", number: 14, position: "CM", grade: 5 },
  { id: "p15", name: "田中 大和", number: 15, position: "ST", grade: 5 },
  { id: "p16", name: "鈴木 新", number: 17, position: "LB", grade: 6 },
];
