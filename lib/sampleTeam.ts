import type { FitnessTest, Player, TeamGroup } from "./types";

/** 初回起動時に入っているサンプルのジュニアユースチーム名簿（編集・削除可） */
export const SAMPLE_TEAM_NAME = "アルファラスFC ジュニアユース";

/* ===== グループ（groups-everywhere §2）：カスタムグループの初期データ =====
 * 学年グループ（中1/中2/中3）は TeamProvider 側で ensureGradeGroups により
 * schoolStage:"junior" から自動生成されるため、ここではカスタムグループのみ定義する。
 * ID はサンプル選手側の Player.groupIds（下記）とも一致させること */
export const SAMPLE_GROUP_A_ID = "grp_a";
export const SAMPLE_GROUP_B_ID = "grp_b";
export const SAMPLE_GROUP_GK_ID = "grp_gk";

export const SAMPLE_CUSTOM_GROUPS: TeamGroup[] = [
  { id: SAMPLE_GROUP_A_ID, label: "Aチーム", kind: "custom" },
  { id: SAMPLE_GROUP_B_ID, label: "Bチーム", kind: "custom" },
  { id: SAMPLE_GROUP_GK_ID, label: "GK", kind: "custom" },
];

/* ===== 体力測定：デフォルト種目ID ===== */
// storage.ts の旧形式(id/name/value:string)→新形式(testId/value:number)変換でも
// この5つのIDへ写像するため、値そのものを定数化して両モジュールで共有する。
export const FITNESS_TEST_50M = "fit_50m";
export const FITNESS_TEST_1000M = "fit_1000m";
export const FITNESS_TEST_LONGJUMP = "fit_longjump";
export const FITNESS_TEST_SIDESTEP = "fit_sidestep";
export const FITNESS_TEST_SITUPS = "fit_situps";

/** 初回起動時にシードするデフォルトの体力測定種目（スタッフが追加・編集・削除可） */
export const DEFAULT_FITNESS_TESTS: FitnessTest[] = [
  { id: FITNESS_TEST_50M, name: "50m走", unit: "秒", lowerIsBetter: true },
  { id: FITNESS_TEST_1000M, name: "1000m走", unit: "秒", lowerIsBetter: true },
  { id: FITNESS_TEST_LONGJUMP, name: "立ち幅跳び", unit: "cm" },
  { id: FITNESS_TEST_SIDESTEP, name: "反復横跳び", unit: "回" },
  { id: FITNESS_TEST_SITUPS, name: "上体起こし", unit: "回" },
];

// 学年(grade)は中学年代(schoolStage:"junior")のデモ用に中1/中2/中3(23/24/23人)を付与している。
// 既存ユーザーのlocalStorageには効かない(初回シード時のみ使われる新規データのため)。
// p01〜p16はノート・試合記録・出欠の既存サンプルが参照しているため、id・name・number・emailは維持し
// 学年とgroupIds(Aチーム/Bチーム/GK)だけを新デモ(groups-everywhere §2)に合わせて再設定している。
// p01〜p08=中2・p09〜p16=中3（§8-3の「選手（佐藤 蒼空＝中2）」＝p08に合わせた。specs/groups-everywhere.md §2を訂正済み）。
export const SAMPLE_PLAYERS: Player[] = [
  { id: "p01", name: "佐藤 蓮", number: 1, position: "GK", email: "ren@alfafc.example", height: 151, weight: 44, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_A_ID, SAMPLE_GROUP_GK_ID] },
  { id: "p02", name: "中村 大翔", number: 2, position: "RB", height: 147, weight: 37, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  {
    id: "p03",
    name: "伊藤 陽斗",
    number: 4,
    position: "CB",
    height: 155,
    weight: 46,
    dominantFoot: "right",
    grade: 2,
    groupIds: [SAMPLE_GROUP_A_ID],
    fitness: [
      { testId: FITNESS_TEST_50M, value: 8.2, date: "2026-05-16" },
      { testId: FITNESS_TEST_1000M, value: 300, date: "2026-05-16" },
      { testId: FITNESS_TEST_LONGJUMP, value: 168, date: "2026-05-16" },
      { testId: FITNESS_TEST_SIDESTEP, value: 46, date: "2026-05-16" },
      { testId: FITNESS_TEST_SITUPS, value: 24, date: "2026-05-16" },
      { testId: FITNESS_TEST_50M, value: 8.0, date: "2026-07-25" },
      { testId: FITNESS_TEST_SIDESTEP, value: 48, date: "2026-07-25" },
    ],
  },
  { id: "p04", name: "渡辺 湊", number: 5, position: "CB", height: 150, weight: 40, dominantFoot: "left", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  {
    id: "p05",
    name: "木村 樹",
    number: 3,
    position: "LB",
    height: 146,
    weight: 36,
    dominantFoot: "left",
    grade: 2,
    groupIds: [SAMPLE_GROUP_B_ID],
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
  {
    id: "p06",
    name: "高橋 颯太",
    number: 6,
    position: "CM",
    height: 149,
    weight: 41,
    dominantFoot: "right",
    grade: 2,
    groupIds: [SAMPLE_GROUP_B_ID],
    fitness: [
      { testId: FITNESS_TEST_50M, value: 8.5, date: "2026-05-16" },
      { testId: FITNESS_TEST_1000M, value: 315, date: "2026-05-16" },
      { testId: FITNESS_TEST_LONGJUMP, value: 160, date: "2026-05-16" },
      { testId: FITNESS_TEST_SIDESTEP, value: 44, date: "2026-05-16" },
      { testId: FITNESS_TEST_SITUPS, value: 22, date: "2026-05-16" },
      { testId: FITNESS_TEST_50M, value: 8.3, date: "2026-07-25" },
      { testId: FITNESS_TEST_SITUPS, value: 25, date: "2026-07-25" },
    ],
  },
  { id: "p07", name: "斎藤 悠真", number: 8, position: "CM", height: 147, weight: 34, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_A_ID] },
  {
    id: "p08",
    name: "佐藤 蒼空",
    number: 10,
    position: "AM",
    email: "sora@alfafc.example",
    height: 151,
    weight: 43,
    dominantFoot: "left",
    grade: 2,
    groupIds: [SAMPLE_GROUP_A_ID],
    // 既存3件（旧形式）を新形式へ移行。旧「1500m走」はデフォルト種目の「1000m走」へ写像し、
    // 記録値はそのまま秒数として引き継ぐ（"6分04秒"→364秒）。
    fitness: [
      { testId: FITNESS_TEST_50M, value: 7.7, date: "2026-05-16" },
      { testId: FITNESS_TEST_1000M, value: 364, date: "2026-05-16" },
      { testId: FITNESS_TEST_SIDESTEP, value: 51, date: "2026-07-25" },
    ],
  },
  {
    id: "p09",
    name: "小林 律",
    number: 7,
    position: "RW",
    height: 145,
    weight: 35,
    dominantFoot: "right",
    grade: 3,
    groupIds: [SAMPLE_GROUP_A_ID],
    fitness: [
      { testId: FITNESS_TEST_50M, value: 7.9, date: "2026-05-16" },
      { testId: FITNESS_TEST_1000M, value: 290, date: "2026-05-16" },
      { testId: FITNESS_TEST_LONGJUMP, value: 172, date: "2026-05-16" },
      { testId: FITNESS_TEST_SIDESTEP, value: 49, date: "2026-05-16" },
      { testId: FITNESS_TEST_SITUPS, value: 26, date: "2026-05-16" },
      { testId: FITNESS_TEST_50M, value: 7.7, date: "2026-07-25" },
      { testId: FITNESS_TEST_LONGJUMP, value: 176, date: "2026-07-25" },
    ],
  },
  {
    id: "p10",
    name: "加藤 朝陽",
    number: 9,
    position: "ST",
    height: 153,
    weight: 47,
    dominantFoot: "right",
    grade: 3,
    groupIds: [SAMPLE_GROUP_A_ID],
    fitness: [
      { testId: FITNESS_TEST_50M, value: 8.1, date: "2026-05-16" },
      { testId: FITNESS_TEST_1000M, value: 305, date: "2026-05-16" },
      { testId: FITNESS_TEST_LONGJUMP, value: 175, date: "2026-05-16" },
      { testId: FITNESS_TEST_SIDESTEP, value: 47, date: "2026-05-16" },
      { testId: FITNESS_TEST_SITUPS, value: 27, date: "2026-05-16" },
      { testId: FITNESS_TEST_50M, value: 7.9, date: "2026-07-25" },
      { testId: FITNESS_TEST_SIDESTEP, value: 49, date: "2026-07-25" },
    ],
  },
  { id: "p11", name: "吉田 結翔", number: 11, position: "LW", height: 144, weight: 33, dominantFoot: "left", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  // 控え
  { id: "p12", name: "山本 駿", number: 12, position: "GK", height: 150, weight: 45, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_A_ID, SAMPLE_GROUP_GK_ID] },
  {
    id: "p13",
    name: "松本 暖",
    number: 13,
    position: "CB",
    grade: 3,
    groupIds: [SAMPLE_GROUP_A_ID],
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
  { id: "p14", name: "井上 碧", number: 14, position: "CM", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  { id: "p15", name: "田中 大和", number: 15, position: "ST", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  { id: "p16", name: "鈴木 新", number: 17, position: "LB", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  // ここから中学年代デモ拡張（groups-everywhere §2）で追加した p17〜p70
  { id: "p17", name: "山田 大輝", number: 16, position: "GK", height: 165, weight: 47, dominantFoot: "right", grade: 1, groupIds: [SAMPLE_GROUP_GK_ID] },
  { id: "p18", name: "佐々木 陸", number: 18, position: "GK", height: 172, weight: 52, dominantFoot: "right", grade: 1, groupIds: [SAMPLE_GROUP_GK_ID] },
  { id: "p19", name: "山口 悠人", number: 19, position: "CB", height: 153, weight: 57, dominantFoot: "right", grade: 1 },
  { id: "p20", name: "林 颯", number: 20, position: "CB", email: "hayate@alfafc.example", height: 160, weight: 62, dominantFoot: "left", grade: 1 },
  { id: "p21", name: "清水 翔太", number: 21, position: "LB", height: 167, weight: 41, dominantFoot: "right", grade: 1 },
  { id: "p22", name: "山崎 健太", number: 22, position: "RB", height: 174, weight: 46, dominantFoot: "right", grade: 1 },
  { id: "p23", name: "森 拓海", number: 23, position: "CB", height: 155, weight: 51, dominantFoot: "right", grade: 1 },
  { id: "p24", name: "池田 直樹", number: 24, position: "LB", height: 162, weight: 56, dominantFoot: "right", grade: 1 },
  { id: "p25", name: "橋本 航", number: 25, position: "RB", height: 169, weight: 61, dominantFoot: "left", grade: 1 },
  { id: "p26", name: "阿部 海斗", number: 26, position: "CM", height: 150, weight: 40, dominantFoot: "right", grade: 1 },
  { id: "p27", name: "石川 佑真", number: 27, position: "CM", height: 157, weight: 45, dominantFoot: "right", grade: 1 },
  { id: "p28", name: "前田 晴", number: 28, position: "DM", height: 164, weight: 50, dominantFoot: "right", grade: 1 },
  { id: "p29", name: "藤田 陽向", number: 29, position: "AM", height: 171, weight: 55, dominantFoot: "right", grade: 1 },
  { id: "p30", name: "後藤 蒼", number: 30, position: "CM", email: "aoi@alfafc.example", height: 152, weight: 60, dominantFoot: "left", grade: 1 },
  { id: "p31", name: "岡田 幸太郎", number: 31, position: "LM", height: 159, weight: 65, dominantFoot: "right", grade: 1 },
  { id: "p32", name: "長谷川 雄大", number: 32, position: "RM", height: 166, weight: 44, dominantFoot: "right", grade: 1 },
  { id: "p33", name: "村上 翼", number: 33, position: "ST", height: 173, weight: 49, dominantFoot: "right", grade: 1 },
  { id: "p34", name: "近藤 一輝", number: 34, position: "ST", height: 154, weight: 54, dominantFoot: "right", grade: 1 },
  { id: "p35", name: "石井 琉生", number: 35, position: "CF", height: 161, weight: 59, dominantFoot: "left", grade: 1 },
  { id: "p36", name: "坂本 咲人", number: 36, position: "LW", height: 168, weight: 64, dominantFoot: "right", grade: 1 },
  { id: "p37", name: "遠藤 伊織", number: 37, position: "RW", height: 175, weight: 43, dominantFoot: "right", grade: 1 },
  { id: "p38", name: "青木 大地", number: 38, position: "ST", height: 156, weight: 48, dominantFoot: "right", grade: 1 },
  { id: "p39", name: "藤井 悠斗", number: 39, position: "CF", height: 163, weight: 53, dominantFoot: "right", grade: 1 },
  { id: "p40", name: "西村 和真", number: 40, position: "GK", height: 170, weight: 58, dominantFoot: "left", grade: 2, groupIds: [SAMPLE_GROUP_B_ID, SAMPLE_GROUP_GK_ID] },
  { id: "p41", name: "福田 俊介", number: 41, position: "CB", height: 151, weight: 63, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p42", name: "太田 倫太郎", number: 42, position: "LB", height: 158, weight: 42, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p43", name: "三浦 煌", number: 43, position: "RB", height: 165, weight: 47, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p44", name: "岡本 奏太", number: 44, position: "CM", height: 172, weight: 52, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p45", name: "松田 晃", number: 45, position: "CM", height: 153, weight: 57, dominantFoot: "left", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p46", name: "中川 尊", number: 46, position: "DM", height: 160, weight: 62, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p47", name: "中野 佳祐", number: 47, position: "AM", height: 167, weight: 41, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p48", name: "原田 豪", number: 48, position: "LM", height: 174, weight: 46, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p49", name: "小川 遥斗", number: 49, position: "ST", height: 155, weight: 51, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p50", name: "竹内 礼央", number: 50, position: "ST", height: 162, weight: 56, dominantFoot: "left", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p51", name: "金子 慶太", number: 51, position: "CF", height: 169, weight: 61, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p52", name: "和田 昴", number: 52, position: "LW", height: 150, weight: 40, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p53", name: "中山 漣", number: 53, position: "RW", height: 157, weight: 45, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p54", name: "石田 大樹", number: 54, position: "ST", height: 164, weight: 50, dominantFoot: "right", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p55", name: "上田 誠", number: 55, position: "CF", height: 171, weight: 55, dominantFoot: "left", grade: 2, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p56", name: "森田 健", number: 56, position: "GK", height: 152, weight: 60, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_A_ID, SAMPLE_GROUP_GK_ID] },
  { id: "p57", name: "柴田 力", number: 57, position: "CB", height: 159, weight: 65, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  { id: "p58", name: "酒井 蒼太", number: 58, position: "CB", height: 166, weight: 44, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  { id: "p59", name: "工藤 陽翔", number: 59, position: "LB", height: 173, weight: 49, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_A_ID] },
  { id: "p60", name: "横山 大和", number: 60, position: "RB", email: "yamato@alfafc.example", height: 154, weight: 54, dominantFoot: "left", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p61", name: "宮崎 流星", number: 61, position: "CB", email: "ryusei@alfafc.example", height: 161, weight: 59, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p62", name: "宮本 楓", number: 62, position: "CM", height: 168, weight: 64, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p63", name: "内田 恵太", number: 63, position: "CM", height: 175, weight: 43, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p64", name: "高木 康太", number: 64, position: "DM", height: 156, weight: 48, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p65", name: "谷口 創", number: 65, position: "AM", height: 163, weight: 53, dominantFoot: "left", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p66", name: "今井 光", number: 66, position: "LM", height: 170, weight: 58, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p67", name: "増田 智也", number: 67, position: "RM", height: 151, weight: 63, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p68", name: "小野 周平", number: 68, position: "ST", height: 158, weight: 42, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p69", name: "河野 涼太", number: 69, position: "CF", height: 165, weight: 47, dominantFoot: "right", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
  { id: "p70", name: "藤原 雅人", number: 70, position: "LW", height: 172, weight: 52, dominantFoot: "left", grade: 3, groupIds: [SAMPLE_GROUP_B_ID] },
];
