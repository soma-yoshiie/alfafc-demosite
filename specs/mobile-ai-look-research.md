# AIっぽく見えるUIの原因と、それを避けるデザイン指針

調査：2026-09-11（opus5 による Web 調査）／用途：`specs/mobile-redesign.md` §8 の根拠資料
対象：スマホ向け業務Webアプリ（サッカーチーム運営）

## 0. 要約

「AIっぽさ」は単一の悪い選択から生まれるのではなく、**制約がないときにモデルが訓練データの統計的平均へ収束すること（distributional convergence）**から生まれる。Anthropic自身がこれを明言しており、「安全で、誰も怒らせないデザイン選択が訓練データを支配しているため、方向づけがないとその高確率な中心からサンプリングされる」と説明している（[Anthropic: Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)）。したがって対策は「センスを足す」ことではなく、**トークンとルールで選択肢を先に潰す**こと。

## 1. なぜ「AIっぽく」なるのか（原因）

| 原因 | 内容 | 出典 |
|---|---|---|
| 訓練データの偏り | Tailwind UI が長年 `bg-indigo-500` を既定にしたため、GitHub/Stack Overflow 上に大量の藍紫コードが蓄積。Tailwind作者 Adam Wathan 自身が「地球上のあらゆるAI生成UIがindigoになった件を公式に謝罪したい」と冗談を述べている | [DEV: Why Every AI-Built Website Looks the Same](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p) |
| 自己強化ループ | AI生成の紫サイトが公開され、次世代モデルの訓練データになる | [Medium](https://medium.com/@ketanmk26/why-ai-built-websites-all-look-the-same-and-what-to-do-about-it-5b7576590a13) |
| コード一貫性の副作用 | 元Figma AIエンジニアの指摘として「LLMは一貫したコードを書くよう訓練されている＝一貫したデザインが出る。一貫性はロジックには利点、デザインには負債」 | [Jim Nielsen: The AI Aesthetic](https://blog.jim-nielsen.com/2026/ai-aesthetic/) |
| コンポーネントライブラリの既定値 | shadcn / Material UI の意見の強いデフォルトから逸脱しない | [truematter](https://www.truematter.com/ideas/post/hey-claude-why-do-ai-generated-interfaces-all-look-the-same) |

## 2. 「AIっぽいUI」の具体的な特徴

最も網羅的な一覧は、約100項目を9カテゴリに分類した公開カタログ [unslop-ui-skill / TELLS.md](https://github.com/claudiusararu/unslop-ui-skill)。以下、本件（業務系モバイル）に効くものを抜粋。

### 2-1. 配色
- 藍紫プライマリ `#4f46e5` / `#7c3aed`、"VibeCode purple" `#8B5CF6` `#A78BFA`（色相250〜280）
- 紫→青の斜めグラデ `from-purple-600 via-violet-500 to-blue-500`。日本語圏でも同一指摘があり、典型値 `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`（[Zenn: AIスロップから脱出する](https://zenn.dev/kenimo49/articles/ai-slop-escape-frontend-design)）
- 低コントラスト本文 `gray-500/400`（`#6b7280` `#9ca3af`）→ WCAG不適合
- 臆病な均等パレット：彩度・明度の近い4〜5色が並び、階層が決まらない
- shadcnダークをそのまま出荷：zinc-950背景 + zinc-900カード + zinc-800ボーダー
- ネオングロー `shadow-[0_0_40px_rgba(139,92,246,0.5)]`
- 「脱・紫」の逃避先であるクリーム #faf8f4 + セージ + チャコール自体が既に新しいテル
- Jim Nielsen は現行の"AI美学"としてベージュ／クリーム＋オレンジアクセント＋セリフ体＋✨を挙げる

### 2-2. タイポグラフィ
- Inter / Geist をそのまま、あるいは "anti-Inter" として Space Grotesk に収束（Anthropic公式スキルは Space Grotesk を名指しで警告）
- Space Grotesk見出し + Instrument Serif斜体 + Inter本文の三点セット
- 見出しの斜体セリフ1単語
- `tracking-tight` 反射：全見出しに自動適用。14〜16px本文にまで負のトラッキング
- グラデーションクリップ文字 `bg-clip-text text-transparent`
- 16px/leading-7 固定：キャプションも本文もリードも同じサイズ・行間＝階層の不在
- 大文字アイブロウ `text-xs uppercase tracking-widest`
- 数値が非等幅（`tabular-nums` 未指定）で表や統計がガタつく

### 2-3. レイアウト
- 中央寄せ英雄公式：`max-w-3xl mx-auto text-center` にアイブロウ→H1→サブ→ボタン2個
- 均一3カラム `grid-cols-3` の強制等高
- feature soup：同一サイズのアイコンカードを延々反復
- 単一コンテナ幅 `max-w-7xl` を全セクションに適用
- 均一な縦リズム `py-20` がどこも同じ＝セクション間とセクション内の間隔が等しい
- 統計バンド：3〜4等分の「大きい数字＋小さいラベル」
- モバイルで全グリッドが `grid-cols-1` に潰れ、同一カードの無限リストになる

### 2-4. コンポーネント
- shadcnカード既定 `rounded-xl border bg-white p-6 shadow-sm` をあらゆる内容に適用
- アイコンチップ `h-12 w-12 rounded-lg bg-primary/10` にLucideグリフ
- カード上端/左端の色ストライプ —「em-dash と並ぶほど確実なAIのサイン」（[Developers Digest: 16 patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)）
- ヒーローのピルバッジ `rounded-full border px-3 py-1` ＋ ✨
- 全カードに `hover:-translate-y-1 hover:shadow-lg`
- Soft SaaS：すべて `rounded-2xl/3xl` + `shadow-lg/xl` の入れ子
- グラスモーフィズム `bg-white/10 backdrop-blur-md border-white/20` の全面適用
- 空状態：中央に線アイコン＋「No data yet」＋破線ボックス内のCTA

### 2-5. アイコン
- 絵文字をアイコン代わりに（ナビ、箇条書き）。OS毎に描画が変わり、サイズ調整もできない
- ✨ ＝ AI の記号化
- Lucideの 1.5px モノラインをそのまま
- 絵文字は機能面でも不利：JAWS等では読み上げられないことがある（[Ashley Sheridan](https://www.ashleysheridan.co.uk/blog/Emoji+and+Accessibility)、[Pope Tech](https://blog.pope.tech/2026/04/01/making-emojis-and-icons-screen-reader-accessible/)）

### 2-6. 文言
- Title Case の見出し、「🚀 高速セットアップ」形式の絵文字箇条書き
- 三点リズム「速く、安全で、信頼できる」
- プレースホルダ人格：Acme Inc / Jane Doe / 山田太郎 / lorem ipsum
- CTAのクローン「はじめる」「詳しく見る」「無料で試す」
- 空の個人化「あなたのために設計されました」
- em-dash（—）の乱用

## 3. 避けるための指針

### 3-1. 配色
- アクセントは1色だけ。「1つのアクセント＋2つのニュートラルを実hex値で定義し、それ以外を禁止する」（[designpixil](https://designpixil.com/blog/ai-slop-design)）
- Refactoring UI：UIの大半はグレーであり、アクセントは階層と意味を作るために控えめに使う（[Building Your Color Palette](https://refactoringui.com/previews/building-your-color-palette)）
- 背景の階調は3段（ページ／面／境界）に固定
- Material 3：「ナビゲーションバーに多色や低コントラスト色を使わない」（[M3 Navigation bar](https://m3.material.io/components/navigation-bar/guidelines)）
- Apple：「タブのラベルとコンテンツ背景に近い色を使わない。コンテンツが色鮮やかならタブバーはモノクロにする」（[HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)）

### 3-2. タイポグラフィ（和文）
- 本文・UIテキストは16 CSS px 以上、14px未満は原則不可。デジタル庁は 16〜45px を主レンジ、14px は制約時のみ（[デジタル庁: タイポグラフィ](https://design.digital.go.jp/dads/foundations/typography/)）
- 行間は本文150%以上、大見出し140%、高密度な管理画面で120〜130%、単行UIで100%
- SmartHR：見出し1.25倍／段落1.5倍（[SmartHR Design System](https://smarthr.design/basics/typography/)）
- Apple：iOS既定17pt、最小11pt、200%までの拡大に対応（[HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)）
- font-family は system-ui 単独を避け和文を明示。ICS MEDIA推奨 `"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif`（[ICS MEDIA](https://ics.media/entry/200317/)）
- 和文に負のletter-spacingを掛けない

### 3-3. レイアウト
- 左揃えを既定。中央揃えは空状態など限定用途のみ
- 均一グリッドを捨ててリスト＋密度へ。業務アプリでは「同サイズカードの反復」が最も強いAIサイン
- 縦リズムはセクション間 > セクション内
- 非対称化が最小コストで効く（[Qiita](https://qiita.com/kenimo49/items/8aaa2bf0d25c704637ae)）

### 3-4. アイコン・コンポーネント
- アイコンは1セットに統一・線幅統一・24px。絵文字は不可
- 角丸は2値まで（面 8px／ピル 999px）
- 影は2段まで。ダークモードでは影ではなく明るい面で高度を表す
- 境界線は 1px・1色。カード上端の色ストライプは使わない

### 3-5. 文言
- 空状態は「教えられる瞬間」であり、自信・学習性・初手の実行を助ける（[NN/g: Empty States](https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/)）
- 「No results found」ではなく「何が起きたか・なぜ・次に何をするか」を書く
- CTAは総称語でなく実際の操作名

## 4. 下部ナビゲーションの公式指針

### Apple HIG（Tab bars）
| 項目 | 記述 |
|---|---|
| 個数 | iPhoneの上限数値は現行HIGに記載なし。「5個以下」はiPadOSのセクションのみ |
| ラベル | 「ナビゲーションを助けるためラベルを含める。可能な限り1単語で」 |
| アイコン | 塗りつぶしシンボルを優先 |
| あふれ | "Avoid overflow tabs" |
| 用途 | 「タブバーはナビゲーション用であり、アクション用ではない」 |
| 状態 | 「内容が無くてもタブを無効化・非表示にしない」 |

- コントロールサイズ：既定 44×44pt／最小 28×28pt。コントラスト：17pt以下 4.5:1／18pt 3:1
- 注意：「iPhoneは最大5タブ」「高さ49pt/83pt」「ホームインジケータ34pt」は現行HIGに記載なし（通説）

### Material Design 3（Navigation bar）
| 項目 | 値 |
|---|---|
| 目的地の数 | 3〜5 |
| ラベル | 必須。1〜2単語。削除・折り返し・縮小しない |
| アイコン | アクティブ＝filled、非アクティブ＝outlined。最低3:1 |
| バー高さ | Flexible 64dp／Baseline 80dp |
| アイコンサイズ | 24dp。アイコン〜ラベル間 4dp |
| アクティブインジケータ | Baseline は 64×32dp のピル |
| ラベル書式 | 12sp / 行高16 / 500（非アクティブ）・700（アクティブ）/ トラッキング0.5 |
| 幅・位置 | ウィンドウ幅100%、位置固定 |
| 挙動 | アクティブなタブを再選択したら先頭にスクロール。スクリーンリーダー有効時はスクロールで隠さない |
| 文字拡大 | 2倍までは全ラベルが画面内に見えること |

### タップターゲット
- Material 3：48×48dp以上、8dp以上の間隔（[M3 Structure](https://m3.material.io/foundations/designing/structure)）
- WCAG 2.2 SC 2.5.8（AA）：24×24 CSSピクセル以上（[W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)）
- 実効タップ領域48pxを満たすのが安全

### Webアプリでのセーフエリア
`viewport-fit=cover` と組み合わせ（[MDN: env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env)）:

```css
padding-bottom: calc(8px + env(safe-area-inset-bottom));
```

## 5. 日本の業務系・スポーツ系モバイルアプリの傾向

- **TeamHub（ドリコム）**：出欠管理／スコア／動画画像共有／掲示板・チャット／リマインド。下部タブ構成・配色は公開テキストから未確認（[tips.tmhub.jp](https://tips.tmhub.jp/)）
- **Sgrum**：保護者向けとスタッフ向け「Sgrum Connect」を別アプリに分離（[App Store](https://apps.apple.com/jp/app/id1266233676)）
- **BAND（NAVER）**：ホーム／投稿／トーク／カレンダー／アルバム。ブランドカラー緑 #21c531 の単色アクセント（[App Store](https://apps.apple.com/jp/app/band/id542613198)）
- **コドモン**：画面下部に HOME／連絡／資料室／その他（出典間で項目名が食い違うため断定しない）
- **LINE**：ホーム／トーク／VOOM／ニュース／ウォレットの5項目。一部を差し替え可能（[ガイド](https://guide.line.me/ja/chats-calls-notifications/)）
- **note**：下部に「ホーム」「マイページ」等

傾向（推測を含む）：①下部タブ4〜5項目 ②日本語ラベル常時表示（2〜4文字） ③単色アクセント（緑・青緑・オレンジ系。紫グラデはほぼ見られない） ④未読バッジ前提。グラデーション・ガラス風・絵文字アイコンは確認できず。

## 6. チェックリスト（原案20項目）

1. アクセント色は1色だけ。セマンティック色（成功/警告/エラー）は別枠で3色まで
2. 色相250〜280（藍〜紫）を全面禁止。`#4f46e5` `#7c3aed` `#8B5CF6` `#667eea` `#764ba2` をブラックリスト化
3. 背景の階調は3段（ページ／面／境界）
4. グラデーション・グラスモーフィズム・ネオングローを全面禁止
5. 影は2段まで。カードの既定は影なし＋1px境界線
6. 角丸は2値だけ（面＝8px、ピル/アバター＝999px）
7. 境界線は 1px・1色。カード上端/左端の色ストライプを使わない
8. 本文16px以上、14px未満は禁止。補助テキストの下限は14px
9. 行間は本文1.6、見出し1.3、単行UI 1.0
10. 和文フォントを明示指定
11. サイズ階層は5段に固定。ウェイトは400と700の2つだけ
12. 和文に負のletter-spacingを掛けない。数値は `tabular-nums`
13. 絵文字をUIに使わない
14. アイコンは1セット・線幅1.5px統一・24px。装飾用アイコンチップを作らない
15. 左揃えを既定
16. 均一カードグリッド禁止。一覧はリスト行（高さ56〜72px、区切り線1px）を第一選択に
17. ダッシュボードの数値タイルは3つまで
18. バッジ・ピルは意味のあるものだけ
19. 文言は具体的に。CTAは操作名。空状態は「何が無いか＋次の一手」を1〜2文で
20. 下部タブは4〜5項目、ラベル必須・日本語2〜4文字、アイコン24px、ラベル12px、実効タップ領域48×48px以上、バー高さ56〜64px＋safe-area、アクティブは塗りアイコン＋アクセント色、非アクティブは線アイコン。タブにアクションを置かず、空でもタブを消さない。同じタブ再タップで先頭にスクロール

## 主要出典

- [unslop-ui-skill / TELLS.md](https://github.com/claudiusararu/unslop-ui-skill)
- [Developers Digest: AI Design Slop — 16 Patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)
- [Jim Nielsen: The AI Aesthetic](https://blog.jim-nielsen.com/2026/ai-aesthetic/)
- [Hacker News: Slightly reducing the sloppiness of AI generated front end](https://news.ycombinator.com/item?id=48504912)
- [DEV: Why Every AI-Built Website Looks the Same](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p)
- [Anthropic: Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)
- [Zenn: AIスロップから脱出する](https://zenn.dev/kenimo49/articles/ai-slop-escape-frontend-design) / [Zenn: AIっぽいだけで避けられないように](https://zenn.dev/tokium_dev/articles/04387b258ba54e) / [Qiita](https://qiita.com/kenimo49/items/8aaa2bf0d25c704637ae)
- [Apple HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) / [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) / [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Material 3: Navigation bar guidelines](https://m3.material.io/components/navigation-bar/guidelines) / [specs](https://m3.material.io/components/navigation-bar/specs) / [accessibility](https://m3.material.io/components/navigation-bar/accessibility) / [Structure](https://m3.material.io/foundations/designing/structure)
- [WCAG 2.2: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [デジタル庁デザインシステム: タイポグラフィ](https://design.digital.go.jp/dads/foundations/typography/) / [SmartHR Design System](https://smarthr.design/basics/typography/) / [ICS MEDIA](https://ics.media/entry/200317/)
- [NN/g: Empty States](https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/) / [NN/g: Mobile Navigation Patterns](https://www.nngroup.com/articles/mobile-navigation-patterns/)
- [MDN: env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env)

## 調査上の注意

以下は一次情報に記載がなく、通説として流布している数値。実装判断には使えるが根拠として引用しない。

- 「iPhoneのタブは最大5個」→ 現行Apple HIGに記載なし
- 「iOSタブバー高さ 49pt / 83pt」「ホームインジケータ 34pt」→ HIGに記載なし
- 「44×44pt が最小」→ 現行HIGでは44ptは Default、Minimumは 28×28pt
- TeamHub / Sgrum / note の下部タブ構成と各社のブランドカラー hex は公開テキストからは未確認
