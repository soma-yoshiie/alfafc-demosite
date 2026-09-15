# サッカーノートへの動画組み込み 調査メモ

調査日：2026-09-15（opus5 ×4 並列調査＋費用の独立検算）／整理：fable5
背景：ヒアリングで「配布動画を画面録画して LINE で指導者に送る運用は、サッカーノートと別媒体になり一貫性が薄れる。アプリ内に動画を貼りたい」という要望。
価格は各社公式ページの 2026-09-15 時点の値。USD は税抜、1 USD = 150 JPY の概算併記。海外 SaaS は消費税（リバースチャージ等）が別途かかりうる。

## 1. 結論

1. **時刻指定コメント**（動画の n 秒にコメント）は、自前の `<video>`、Cloudflare Stream、Mux、YouTube IFrame API のいずれでも実装できる。実装コストは小さい（再生位置の秒数をノートに保存するだけ）。
2. **選手による切り出し**は、ブラウザ内で新しい動画ファイルを作る方式（WebCodecs／ffmpeg.wasm／MediaRecorder）が iOS では制約が大きい。**「開始秒・終了秒だけ保存して範囲再生する参照クリップ」**なら追加容量ゼロ・端末負荷ゼロで、時刻コメントとデータ構造を共通化できる。サーバー側なら Mux の instant clipping（再エンコードなし・追加費用なし）が同等。
3. **費用**は「動画をどれだけ預かるか」で1桁変わる。1チーム（25人・週2本×3分・720p・12か月保持）で月 ¥222（Bunny）〜 ¥6,244（Cloudflare Stream）。想定売上（月 1,980〜4,980 円）に対し、フル動画を東京リージョンの GCS で預かると原価割れしうる。短尺クリップだけ・保持期間を切る・変換込みの動画 SaaS を使う、のいずれかで抑える。
4. **YouTube リンク案**は技術的には動くが、有料アプリ内での埋め込み視聴は API 規約上グレー、子どもが出演する動画は YouTube 側の判断で埋め込みが止まりうる、削除耐性が最低、の3点で中核機能には向かない。指導者が任意で貼る「参考リンク」に限定するのが安全。
5. **LINE 運用の弱点は仕様として根拠がある**：動画は5分上限で再圧縮（二次情報）、トーク内の写真・動画の保存期間は公式非公表、アルバムの動画保存は LYP プレミアム会員限定かつ1本5分以内、ノートへの動画投稿は 2024-02-15 廃止、Keep は 2024-08-28 終了。

## 2. 技術的な実現方法（切り出し・時刻コメント）

| 方式 | 実現性 | 要点 | 出典 |
|---|---|---|---|
| (a) 開始/終了秒だけ保存して範囲再生（参照クリップ） | ◎ | 追加容量ゼロ・端末負荷ゼロ。時刻コメントと同じデータ構造。工数 2〜3 人日 | — |
| (b) WebCodecs＋Mediabunny でブラウザ内再エンコード | △ | VideoEncoder/Decoder は iOS Safari 16.4〜。AudioEncoder/Decoder は Safari 26.0 でようやく追加＝iOS 26 未満で音声つき切り出しは実装が重い | https://caniuse.com/webcodecs, https://webkit.org/blog/17333/ |
| (c) ffmpeg.wasm | × | 入力 2GB 上限、スマホで発熱・メモリ不足・タブ破棄のリスク。保護者端末に不向き | https://ffmpegwasm.netlify.app/docs/faq |
| (d) MediaRecorder で `<video>` を録り直す | × | HTMLMediaElement.captureStream() が Safari/iOS Safari 未対応 | MDN browser-compat-data |
| (e) `<input accept="video/*" capture>` | ○ | アップロード前に OS 標準のトリム UI は出ない。写真アプリで編集→保存→選ぶ手順になり、LINE 運用と手間が変わらない | https://caniuse.com/html-media-capture |
| サーバー側 Mux instant clipping | ◎ | 再生 URL に asset_start_time/asset_end_time を付けるだけ。再エンコードなし・追加費用なし・即時。精度はセグメント単位（数秒） | https://www.mux.com/docs/guides/create-instant-clips |
| サーバー側 Cloudflare Stream clip API／Mux asset clipping | ○ | フレーム精度・MP4 化が可能だが、新規アセット＝保存課金が二重 | 各社 docs |
| ネイティブ化（Capacitor/RN） | ○ | AVAssetExportSession のトリムは一瞬、バックグラウンドアップロード可。App Store 審査・2ストア運用・保護者のインストール障壁が乗る | — |

- 時刻コメント：`currentTime` を保存。YouTube だけは「プレーヤーの前面にオーバーレイ禁止」の最小機能要件があるため、シークバー上のコメントマーカーは置けない（プレーヤー外に置く）。
- アップロード：1080p は 1 分あたり数十 MB（iPhone 1080p/30 ≒ 45〜60MB/分は推測）。Cloudflare Stream は 200MB 超で tus（再開可能アップロード）必須。上り 5Mbps で 100MB ≒ 160 秒。初期は「短く撮る」運用ガイドが費用対効果高。

## 3. 費用（1チームあたり月額、定常＝12か月分が蓄積、720p のみ保存・単一出力）

前提：25 人、週 2 本×3 分＝月 217 本・650 分、配信 720p ≒ 35MB/本、指導者 1.5 回＋本人 1 回視聴＝月 1,625 分・約 19GB、12 か月保持＝7,800 分・91GB。

| サービス | 1チーム/月 | 100チーム/月 | 備考 |
|---|---|---|---|
| Bunny Stream（720p 単独設定） | $1.48 ≒ ¥222（既定の複数解像度なら $2.75 ≒ ¥413） | $148〜275 ≒ ¥22,000〜41,000 | 変換無料。保存拠点に日本なし（最寄りシンガポール）。トークン認証で限定公開可 |
| AWS 東京（S3＋MediaConvert＋CloudFront） | $13.33 ≒ ¥2,000（原本も保持なら $21.45 ≒ ¥3,218） | $1,435〜2,247 ≒ ¥215,000〜337,000 | 変換費が 5〜8 割。CloudFront 従量は月 1TB 無料枠あり |
| Mux（720p） | $18.72 ≒ ¥2,808（コールド割引で最小 $7.49） | $1,922 ≒ ¥288,300 | 配信は月 10 万分無料。署名 URL 無料。PAYG は月 $20 クレジット |
| GCS／Firebase Storage 東京＋Transcoder | $23.57 ≒ ¥3,536（HLS 3 段なら $50.03 ≒ ¥7,504） | $2,357〜5,003 | 東京バケットには Firebase 無料枠が付かない |
| Cloudflare Stream | $41.62 ≒ ¥6,244（初月 $6.62、6か月保持なら約 $21） | $4,063 ≒ ¥609,375 | 保存 $5/1,000 分が効く。実装は最も簡単 |
| YouTube 限定公開 | $0 | $0 | Data API のアップロードは 1 日 100 本上限、未監査は private 固定 |

出典：https://developers.cloudflare.com/stream/pricing/ ／ https://www.mux.com/pricing/video ／ https://bunny.net/docs/stream/pricing ／ AWS 価格 JSON（S3・MediaConvert）・https://aws.amazon.com/jp/cloudfront/pricing/ ／ https://cloud.google.com/storage/pricing ／ https://cloud.google.com/transcoder/pricing ／ https://firebase.google.com/pricing

最大のコストドライバーは「変換を自前でやるか、変換込みの動画 SaaS に乗るか」と「原本を保持するか」。売上 1,980〜4,980 円に対し Bunny は 4〜20%、AWS 東京は 40〜160%、Cloudflare Stream は 125〜315%。

## 4. YouTube／外部リンク方式と法務

| 観点 | A: YouTube 限定公開＋時刻コメント | B: 自前ホスティング（Stream/Mux 等） | C: 短尺クリップのみ Firebase Storage 東京 | D: 外部リンクのみ |
|---|---|---|---|---|
| 利用者の手間 | 指導者が手動アップ＋URL 貼付 | アプリ内アップロードで最小 | 切り出し→投稿を数タップ | URL を貼るだけ（LINE から出す手間は残る） |
| 法務リスク | 高（有料アプリ内埋め込みは Developer Policies の課金禁止に抵触しうる。Google 米国への子どもの動画移転） | 中（外国事業者への保存の整理が必要） | 低〜中（東京リージョン、PPC Q7-53 のクラウド例外で整理可） | 低（自社は保持しない）が統制不能 |
| 削除耐性 | 最低（未ログイン視聴無効化・年齢制限で埋め込み停止・削除） | 高 | 高 | 最低 |
| アプリの価値 | 中（オーバーレイ禁止・関連動画） | 最高 | 高（ノートと一体化） | 低 |

- YouTube：API Developer Policies「埋め込みプレーヤーでの視聴に課金してはならない」、子どもの安全ポリシー「子ども出演コンテンツはポリシー違反がなくてもコメント・おすすめ・未ログイン視聴を無効化しうる」、Data API videos.insert は 1 日 100 回・未監査プロジェクトは private 固定（https://developers.google.com/youtube/v3/docs/videos/insert）。
- 法務：顔が映る動画は個人情報。小学生は保護者同意が必要（PPC Q1-62）。令和 8 年改正個人情報保護法（2026-07-10 成立、公布から 2 年以内に施行）で 16 歳未満の法定代理人同意の明文化・利用停止等請求の緩和・「本人の最善の利益」責務が新設（https://www.ppc.go.jp/personalinfo/legal/r8kaiseihogohou/）。保護者同意の記録と削除要求への即応が設計要件。本メモは法的助言ではなく、サービスイン前に法務レビューを受けること。
- Firebase 東京（asia-northeast1）は作成後にロケーション変更不可。GCS 署名付き URL の最長有効期限は 7 日。

## 5. 既存サービスと差別化

- 時刻コメント・描き込み・スロー再生は SPLYZA Teams／Hudl／OnForm／Dartfish で標準。日本のノート系（SOCCER NOTE、footballLOG）は時刻コメントを持たず、映像分析系はノート（言語化）を主機能にしていない。「ノート×動画秒数コメント」が空白地帯。
- 価格：SPLYZA Teams 16,500 円〜/月（税込）＋初期 22,000 円（https://products.splyza.com/teams/）、SOCCER NOTE スタンダード 11,000 円/月（税込・100 名）（https://soccernote.jp/）、Hudl Club Soccer Core $500/チーム/年（https://www.hudl.com/pricing/club/soccer）、OnForm Coach Basic $19.99/月。想定の 1,980〜4,980 円は 1 桁安い帯。
- MVP 5 点：①秒数ひも付きコメント、②参照クリップ（開始・終了秒）、③一時停止した 1 フレームの静止画への矢印描き込み（Canvas のみ）、④スロー/コマ送り（playbackRate と currentTime 加算）、⑤ノート（試合・練習・自主練）との一体化。2 画面比較は上位機能なので後回し。
- LINE：動画 5 分上限・再圧縮（二次情報）、保存期間は公式非公表、アルバム動画は LYP プレミアム（月 508 円）限定・1 本 5 分以内、ノートの動画投稿は 2024-02-15 廃止、Keep は 2024-08-28 終了。

## 6. 段階案

1. **Phase 1（今のデモで可能）**：試合ノートの動画 URL／端末内の動画に、秒数コメント・参照クリップ・スロー再生・静止画描き込みを付ける。動画は預からない。
2. **Phase 2（バックエンド化時）**：短尺クリップ（例：30 秒以内・720p・上限 20MB）だけを Firebase Storage 東京に保存。署名付き URL・チーム限定の Security Rules・保持期間（例：12 か月）と削除フロー。保護者同意をチーム加入時に取得・記録。
3. **Phase 3（容量が伸びたら）**：変換込みの動画基盤（Bunny／Mux）へ移行し、instant clipping で切り出し。Cloudflare Stream は長期保持に弱いので保持期間を切れる場合のみ。

## 7. 未確認・要注意

- iPhone 1080p 撮影の 1 分あたり MB は Apple 公開資料になく推測（4K/30 HEVC=175MB 超/分からの換算）。
- LINE の 5 分上限は公式ヘルプで確認できず二次情報。実機確認を推奨。
- GCS 東京の単価は公式ページが JS 描画で再取得できず、採用時は料金計算ツールで再確認。Cloud Run の vCPU 単価も未確認。
- Mediabunny の iOS 実挙動は未検証。採用前に iOS 18 系・26 系で PoC。
- Cloudflare Stream のクリップ API が保存分数を消費するかは公式に明記なし。
- Mux Player の currentTime API は公式リファレンス URL が 404 で直接確認できず（HTMLMediaElement 互換という一般理解）。

## 8. 追記（2026-09-15）：長尺 90 分・国内事業者・法務／JFA

前提：1チーム月 6 試合×90 分、配信 720p 1.0GB/本（480p 0.55GB/本）、視聴 635 分/試合、12 か月保持（72 本）。価格は 2026-09-15 の公式ページ、税込に統一（USD は 1 USD=150 円）。

### 8-1. 国内事業者の費用（100 チーム運用時の 1 チームあたり月額・税込）

| 構成 | 720p | 480p | 備考 |
|---|---|---|---|
| さくら OS＋ウェブアクセラレータ＋VPS ffmpeg×2（推奨） | 686 円 | 409 円 | 1 チーム単独の最低額 690 円（変換は既存サーバー同居）。https://cloud.sakura.ad.jp/products/object-storage/ ／ https://cdn.sakura.ad.jp/price/ ／ https://vps.sakura.ad.jp/specification/ |
| SDPF（NTT ドコモビジネス）Wasabi 保存＋さくら配信＋変換 | 350 円 | — | 転送無料。最低 1,024GB/日。運営は米 Wasabi。https://sdpf.ntt.com/services/wasabi/pricing/ |
| ニフクラ／FJcloud-V OS＋変換 | 258 円（無料枠適用外なら 1,105 円） | — | 「グローバルアウト月 10TB 無料」がオブジェクトストレージ配信に適用されるか公式に明記なし。要書面確認。https://pfs.nifcloud.com/price/network.htm |
| KDDI KCPS OS＋変換 | 774 円 | — | 8,000 円/TB（税抜）、1TB 未満も同額。転送無料 |
| J-Stream Equipmedia | 3,000〜4,000 円（推測） | — | 1 チーム単独は Startup 55,000 円/月＋初期。12 か月未満契約は倍額 |
| 参考：AWS 東京（S3＋CloudFront＋EC2 ffmpeg） | 965 円 | — | MediaConvert なら 1,633 円。国内事業者の約 1.4 倍 |
| 参考：Wasabi 直販 東京 | 172 円 | — | 米 Wasabi Technologies 運営。$7.99/TB（2026-07-01〜） |

- 受注停止で新規不可：IIJ オブジェクトストレージ／IIJ GIO コンテンツアクセラレーション。画像専用で対象外：ImageFlux。
- さくらの制約：1 バケット 10TiB・毎秒 100 アクセス、ウェブアクセラレータ経由では OS の署名付き URL が使えずワンタイム URL で限定公開、キャッシュ 1 ファイル 2GiB 未満・保持最大 7 日、オブジェクト数課金（HLS 分割時は注意）、VPS 最低利用 3 か月。ウェブアクセラレータの ISMAP 登録はマニュアルに記載なし（OS は登録範囲）。
- 原価率：686 円 ÷ 1,980〜4,980 円 ＝ 14〜35%（480p は 8〜21%）。CDN キャッシュミス率（15〜40%）と視聴回数が最大の変動要因。

### 8-2. 長尺の技術

- アップロード：スマホの上りは全国 16〜39Mbps（ICT 総研 2026-01）。5GB で 22〜51 分、10GB で 43〜105 分。PC 光回線なら 7〜14 分。tus（Blob.slice 分割・再開）＋ tusd が本命。iOS はバックグラウンドでタブが止まりうる。
- 変換：8 コア VPS・libx264 veryfast で 90 分→720p＋480p HLS が 15〜25 分、4 コアで 30〜45 分（いずれも推測・未実測）。無変換の 1080p 配信は 20 分視聴で 1.2GB なので不可。`-movflags +faststart` 必須（MP4 配信時）。
- 再生：HLS（iPhone はネイティブ、他は hls.js）または MP4＋Range。`hls_time` 2〜4 秒・`independent_segments` でジャンプ誤差は GOP 長（2 秒）。`fastSeek()` は使わない。通信量：480p 20 分＝約 180MB、720p＝約 375MB。
- 端末内保存：iOS は 7 日無操作で IndexedDB を消去しうる。1GB のオフライン保存は不可。
- 概算工数（フル実装）：アップロード 8〜12／変換 10〜15／配信再生 6〜10／時刻参照 UI 12〜18／iOS・Android 検証 5〜8 人日。

### 8-3. 法務・JFA・データ所在

- 個人情報保護法 28 条の「外国にある第三者」は法人格と所在で判断。AWS（アマゾンウェブサービスジャパン合同会社、日本法）・Google Cloud（Google Cloud Japan 合同会社）は該当せず、クラウド例外（PPC Q7-53）が成立すれば提供にも委託にも当たらない。ただし ①契約に「個人データを取り扱わない」旨がない ②アクセス制御不十分 ③サポート・サブプロセッサが触れる、のいずれかで例外は崩れる。例外が成立しても「外的環境の把握」の公表義務（Q10-25）は残る。
- ISMAP 登録：AWS C21-0008-2／Google Cloud C21-0004-2／Firebase C22-0042-2／Azure C21-0012-2／さくらのクラウド C21-0030-2／FJcloud-V C21-0021-2／IIJ GIO P2 C21-0026-2／IDCF C23-0070-2（https://www.ismap.go.jp/csm?id=cloud_service_list）。ガバメントクラウドは AWS 中心、さくらは 2026-03-27 に国産初の正式認定。GIGA 端末は ChromeOS 60%。
- JFA：KICKOFF／JFA ID の外部連携 API は公開情報で確認できず。連携可否は JFA 登録サービスデスクへ照会。手入力／CSV 前提で設計。
- 撮影ルール：鹿児島県少年サッカー連盟の例で「参加チーム全ての許可」「販売・譲渡禁止」を明文化。都道府県で異なる前提。
- 未成年：令和 8 年改正（2026-07-10 成立、2026-07-17 公布、2 年以内施行）で 16 歳未満は法定代理人同意を明文化。ガイドラインは 2027 年夏頃の見込み（二次情報）。
- 推奨：動画本体は国内事業者（さくら）に置き、アプリ本体・DB は東京リージョンなら海外事業者でも法務上は可。保護者・協会への説明を優先するなら動画は国内に固定。

### 8-4. 未確認事項

- Google Cloud 東京の単価（料金ページから抽出できず推測）。
- ニフクラの 10TB 無料枠の適用範囲。
- ffmpeg の変換時間（未実測）。Apple HLS Authoring Spec の推奨ビットレート表（未取得）。
- LINE 内ブラウザでの `<video>` 再生、iOS `<input type=file>` の動画サイズ上限、Veo の公開 API。
