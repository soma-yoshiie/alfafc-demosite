# サッカーノート×試合動画 設計ドラフト v1（2026-09-15 の条件変更により `specs/video-note-design-v2.md` に置き換え。キックオフ合わせ・短尺前提・Firebase 前提は v2 で撤回）

作成：2026-09-15／設計：fable5（opus5 の3視点案＋審査を統合）／調査の根拠：`specs/video-in-notebook-research.md`
ユースケース：スタッフが試合記録に動画を添付し、選手がその動画を見ながら試合ノートを書き「【前 15:08】ここで…」のように場面を指して書く。スタッフも同じ場面を指してコメントする。

## 1. 動画の置き場所（結論）

- **アプリ内で再生することを唯一の体験にし、外部サイトへ飛ばす導線は作らない。** 現状の `MatchNote.videoUrl` は `target="_blank"` で外部に開くだけで、この要件と矛盾する（小学生が外部アプリに出ると書きかけのノートを見失う）。
- **実体の置き場所は段階的に差し替える**（型 `VideoSource` に隠蔽し、ノート側は `videoId`＋秒だけを持つ）：
  - Phase 1（今のデモ）：端末内 IndexedDB の Blob（data URL は使わない。base64 は 1.37 倍で iOS でシークが効かない）
  - Phase 2：Firebase Storage 東京に**短尺（3分・40MB 以内）だけ**保存。短尺・無変換なら 1チーム月 ¥150〜800 程度（調査メモの ¥3,536 は 3分×650分＋HLS 変換前提）
  - Phase 3：Bunny／Mux（変換込み・instant clipping）
- mp4 直リンクは添付時に `loadedmetadata` を 5 秒試す `inlinePlayable` 判定でアプリ内再生できるものだけ受け、Drive／iCloud／YouTube は「参考リンク」に隔離（埋め込まない・時刻チップの対象外）。
- 前後半フルの動画は預からない（クラブ既存ストレージの直リンクをアプリ内再生）。

## 2. データ構造（差分）

```ts
export type VideoSource =
  | { kind: "local"; blobKey: string; bytes: number; mime: string }   // P1 IndexedDB
  | { kind: "stored"; path: string; bytes: number }                    // P2 Firebase 東京
  | { kind: "hosted"; provider: "bunny" | "mux"; playbackId: string }  // P3
  | { kind: "direct"; url: string; inlinePlayable: boolean }           // mp4 直リンク
  | { kind: "link"; url: string; site: "youtube" | "other" };          // 参考のみ

export type VideoVisibility =
  | { scope: "staff" } | { scope: "team" } | { scope: "players"; playerIds: string[] };

/** 動画は MatchRecord の子ではなく独立（練習・自主練ノートからも参照可） */
export interface VideoAsset {
  id: string; teamId: string; title: string;
  source: VideoSource; durationSec?: number; poster?: string;   // poster=縮小JPEG必須
  matchId?: string; eventId?: string;
  /** 動画の経過秒↔試合時計（キックオフ合わせ）。未設定なら「動画 17:42」と明示表記 */
  kickoffOffsetSec?: number; secondHalfOffsetSec?: number;
  /** 映っている選手。既定は MatchRecord.lineup から自動投入、スタッフは外すだけ */
  appearsPlayerIds?: string[];
  visibility: VideoVisibility;            // 既定 { scope: "team" }
  credit?: string;                        // 撮影した保護者
  createdBy: string; createdAt: number;
  expiresAt?: number;                     // 既定 12 か月
  removedAt?: number; removedReason?: "expired" | "deleted" | "consent";
}

export interface MatchRecord { /* 既存のまま */ videoIds?: string[]; }

/** 一点も範囲も同じ型。t は常に動画の経過秒（真値）、表示だけ試合時計に変換 */
export interface VideoCue { label: string; videoId: string; t: number; tEnd?: number; }

/** 一時停止フレームへの描き込み */
export interface FrameNote { videoId: string; atSec: number; image: string; plays: PlayPoint[]; playLines: PlayLine[]; }

interface NoteBase {
  // 既存 body / staffComment / staffDrawing …
  videoIds?: string[];
  cues?: VideoCue[];        // body 中の【前 15:08】の対応表
  staffCues?: VideoCue[];   // staffComment 中の対応表
  frameNotes?: FrameNote[];
  staffDrawing?: { plays: PlayPoint[]; playLines: PlayLine[]; at?: VideoCue }; // 描き始めの再生位置を自動記録
}

/** 選手ごとの保護者同意（撤回つき）。映っている選手に1人でも同意なし／撤回があれば staff 限定へ自動降格 */
export interface VideoConsent { playerId: string; grantedAt: number; grantedBy: string; revokedAt?: number; }
```

- 本文は `<textarea>` のまま。文中に人間可読マーカー `【前 15:08】`／`【前 15:08-15:22】` を挿入し、対応表を `cues` に別持ち。`cues` に無いラベルは素の文字として描く（子どもが消しても壊れない）。
- 前半／後半／延長の前置で同一時刻の取り違えを防ぐ。
- 削除要求は `removedAt` で実体だけ消し、ノートと時刻チップは残す（本人の記録）。

## 3. 画面と操作（390px）

- **スタッフが添付**：試合記録の詳細に「動画」セクション（リスト行、サムネ 96×54）。「＋追加」で3択：①リンクを貼る ②端末の動画を選ぶ ③保護者にお願いする（枠だけ作りチャットに定型依頼）。直後に**キックオフ合わせ**（スクラブして「ここがキックオフ」を1回。スキップ可）。
- **選手が書く**：試合を選ぶとその試合の動画棚が自動で付く。ヘッダー 52px／`sticky` の 16:9 プレイヤー（358×201、`preload="none"`＋ポスター）／操作バー 44px `[◀10][▶/❚❚][10▶][0.5×] 前15:08 [時刻を入れる]`／`<textarea>` 16px／キーボード表示中だけ定型文チップ行。
- **キーボードが出たら**：`visualViewport` の resize（可視高が初期の 70% 割れ）で動画ゾーンを 72px のバー（112×63 の小画面＋現在時刻＋時刻を入れる）に自動縮小。`<video>` の DOM は動かさず CSS 寸法だけ変える（DOM 移動は iOS で再生が止まる）。効かない端末向けに「プレイヤーを隠す」トグル。PiP は上級オプション止まり。
- **スタッフがコメント**：同じ画面で子どものチップをタップして同じ場面へ。コメント欄にも「時刻を入れる」。一時停止中の「この画面に描く」で既存描画部品をフレーム画像に流用（`FrameNote`）。
- **選手が見返す**：チップタップで sticky プレイヤーがシーク（範囲は `tEnd` で自動停止）。ページ遷移も読み直しも無し。「クリップ」一覧＋固定タグ（切り替え／背後／ビルドアップ／セットプレー／1対1／得点・失点）。

## 4. 「15:08からのシーンで…」の入力

1. 「時刻を入れる」1タップでキャレット位置に `【前 15:08】`＋半角スペース、同時に**自動一時停止**。
2. 反応遅れ補正：既定で再生位置の **1.5 秒手前**を入れ、直後だけ `[−1秒] 前15:08 [+1秒]` の微調整行。
3. 範囲：長押しで開始、ボタンが「ここまで」に変わり再タップで `【前 15:08-15:22】`（3秒未満は前後 1.5 秒ずつ広げる）。切り出さず秒だけ＝追加容量ゼロ。
4. チップタップでジャンプ、長押しで ±1秒／範囲化／削除。
5. 定型文チップ「ここで」「うまくいったのは」「つぎはこうする」で 3 タップ 1 文。
6. シークバー下に自分の cue を青い目盛りで表示、得点・失点の分（`MatchGoal.minute`）を候補表示。
7. 音声入力は標準キーボードのマイクを案内（専用ボタンは作らない）。

## 5. 通信量・端末負荷

`preload="none"`＋ポスター必須（開いた時点は JPEG 30KB のみ）、`playsInline`、DOM 上の `<video>` は常に 1 つ、離脱時に `src` 解放。配信 720p 単独。初回だけ「約35MBを使います」と数字を出し、「Wi-Fi のときだけ読み込む」既定オン。範囲再生は HTTP Range。`fastSeek()` 優先、`loadedmetadata` 前のシークは保留キュー。速度 0.5/0.75/1.0、コマ送りは `currentTime += 1/30`。

## 6. 段階と概算工数

- **Phase 1（今のデモ・IndexedDB）約 15 人日**：型と videoStore 1.5／旧 videoUrl 移行 0.5／動画棚 UI＋3択＋inlinePlayable 2.0／キックオフ合わせ 1.0／VideoNotePlayer 3.0／時刻チップ 2.5／定型文と下書き連携 0.5／スタッフの時刻コメントと FrameNote 1.5／クリップ一覧とタグ 1.0／通知・権限 0.5／390px 検証 1.0。
- **Phase 2（Firebase 東京）約 11 人日**：Storage＋Rules＋短命署名URL 3.0／再開可能アップロードと上限検証 3.0／保護者同意・撤回・台帳 2.0／保持期限と削除 1.5／移行と実機検証 1.5。
- **Phase 3（Bunny／Mux）約 4 人日**：`hosted` 追加と instant clipping の対応づけ。ノートのデータは無変更。

## 7. 未決事項

1. 保護者同意の粒度（チーム加入時一括か、児童ごとか）と文面。法務レビュー必須。
2. 対戦相手の子どもが映る動画の扱い（受容か、顔ぼかしか）。
3. 預かる上限 3分／40MB の妥当性（最初のチームで計測）。
4. フル前後半を直リンクで賄えるクラブがどれだけあるか。
5. 保護者に添付権を与えるか、スタッフ経由の2段にするか。
6. 動画機能をどのプランに含めるか、容量課金にするか。
7. Phase 3 の事業者（Bunny は国内保存拠点なし）。
8. 保持期限の既定（12 か月かシーズン終了＋3か月か）と削除窓口。
9. キックオフ合わせをスタッフが運用するか（未設定は注意表示）。
10. LINE 内ブラウザでの `<video>` インライン再生と `visualViewport` の挙動（Phase 1 の最初の PoC）。
11. 入力欄 16px を v1 §8-8 の例外として追記する合意。
