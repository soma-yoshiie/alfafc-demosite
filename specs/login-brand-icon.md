# ログインのロゴとアプリのアイコンを、起動画面と同じ BrandMark に — 正本

オーナーの依頼（2026-11-08）：「ログイン画面の上のロゴが前のものになっているから、今の開いた時のアニメーションと同じロゴに変えて。アプリのアイコンも同じロゴにして（アプリのアイコンは ALFA FOOTBALL の文字を入れずにロゴだけでいい）」。

## 0. 範囲

- 触ったもの：`components/LoginScreen.tsx`、`app/globals.css` の `.login-mark / .login-logo / .login-tag`（基底）と PC ブロックの 2 か所（§3）、`app/icon0.svg`・`app/icon1.png`・`app/apple-icon.png`（旧 `app/icon.svg` は削除）、`scripts/relativize-export.cjs`。
- 触らないもの：PC の左レールのロゴ（`components/ConsoleShell.tsx` の `LogoMark` / `.rail-mark`。別の依頼。`components/Logo.tsx` はそのために残す）、`layout.tsx` の `themeColor`（旧緑 #15803d。依頼外）、起動画面（`SplashScreen.tsx` / `BrandMark.tsx` / `splash-brand.md`）。

## 1. ログイン画面（`LoginScreen.tsx`・CSS 基底 `login-brand-icon §1`）

- マークは起動画面と同じ部品 `<BrandMark uid="lg" />`（`uid` でグラデーション・clipPath の id が `sp_*` と衝突しない）。
- 題字は `ALFA FOOTBALL` の 1 色（`--ink` を継承）。緑の `<b> FOOTBALL</b>` は廃止（起動画面の題字を 1 色にした `splash-brand.md` §2 に合わせる）。
- 寸法は起動画面の縮尺を保つ：
  - `.login-mark`：幅 160px、`aspect-ratio: 510 / 400`（箱の高さ 125.5）、`margin: 0 auto 20px`。svg は `display:block; overflow:visible`（`.splash-mark svg` と同じ）。
  - `.login-logo`：30px・700・`line-height:1`・字間 0.1em・`white-space:nowrap`。題字 30px ＝ マーク幅 160 × 0.19（起動画面は `--spw × 0.19`）。
  - `.login-tag`：`margin-top: 8px`（4 → 8）。
  - 見かけの間：棒の下端→題字の大文字の上端 約 27px（起動画面の 44/257 × 160）、題字→副題 約 13px。
- 中心：題字・マーク・カードの中心 x は一致する（マークの箱は A の頂点が中央に来るよう左に 85 ずらしてあるので、箱を中央に置けば題字と揃う。`splash-brand.md` §1）。

## 2. アプリのアイコン（`app/`）

| ファイル | 用途 | 中身 |
|---|---|---|
| `icon0.svg` | favicon（Chrome・Firefox・Edge） | 200 の箱、4px 内側に角丸 44 のタイル。地 #f4f5f9（参考画像の地）。マークはタイル幅の 72%（箱の 200 × 0.72 = 144） |
| `icon1.png` | favicon（Safari は SVG の favicon を読まない） | `icon0.svg` と同じ絵を 192px に |
| `apple-icon.png` | iOS「ホーム画面に追加」 | 180px・全面 #f4f5f9（角は iOS が丸めるので丸めない）。マークは 68%（Apple の安全域の内側） |

- マークの幾何は `BrandMark.tsx` と同じ（棒・弧・ボール・五角形・縫い目の座標と色をそのまま。グラデーション id は `ic_` / `ap_` を前置）。見かけの範囲は x 10〜416.6・y 3.9〜391（左端＝銀の棒の丸い端、上端・右端＝金の弧、下端＝棒の丸い端）で、この範囲の中心を箱の中心に置く。文字は入れない。
- 色はブランド色の生値（`splash-brand.md` §1 と同じ方針。トークンにしない）。
- 生成：`~/.claude/alfa-verify-tools/p43/mkicon.js`（`tile()` が SVG 文字列を作る）＋ `writeicons.js`（リポジトリの `sharp` で PNG に描く）。マークを直したら `BrandMark.tsx` → `mkicon.js` の `markInner` → `writeicons.js` の順に直して描き直す。
- Next.js の metadata ファイル規約は `icon.*` を **1 つしか拾わない**（`icon.svg` と `icon.png` を並べたら png だけが `<head>` に出た）。番号付き `icon0.svg`・`icon1.png` なら両方出る（`<link rel="icon" … sizes="any">`・`sizes="192x192"`・`<link rel="apple-touch-icon" … sizes="180x180">`）。
- `scripts/relativize-export.cjs`：相対化の対象を `/icon.svg` の 1 つから `icon0.svg`・`icon1.png`・`apple-icon.png` の 3 つに。名前を変えたらここも直す（忘れると GitHub Pages のサブパスで 404）。root と `404/` の両方で相対化されることは作業用フォルダで確認した。

## 3. PC の変更（CLAUDE.md §5「変えないもの」の例外手続き）

ログイン画面は幅で分岐しない 1 つの DOM なので、ロゴの差し替えは PC にも出る（それが依頼の目的）。PC ブロックで直したのは 2 か所だけ：

1. `font-weight: 600` の一覧（`.bigbtn, .fptag, … .login-logo, .fcell, …`）から `.login-logo,` を外す。基底の 700 を PC でも使う（`splash-brand.md` §3 で `.splash-title` に行ったのと同じ）。
2. コメント「ブランドロゴの緑(.login-logo b)は据え置き」を「BrandMark に置換済み（緑の b は無い）」に（規則の変更なし）。

変更前後：`~/.claude/alfa-verify-tools/p37/m_login.png`（旧ロゴ）→ `p43/m_login.png`・`p43/pc_login.png`。

## 4. 受け入れ基準と検証（p43：`~/.claude/alfa-verify-tools/p43_login.js`、結果 `p43/measure.json`）

1. 390×844 と 1440×1000 のログイン画面で `.login-mark` の中に `.bm-ball / .bm-silver / .bm-arc` があり、旧ロゴの `.lm-a` が無い。済。
2. `.login-logo b` が無い。題字は 700・30px・字間 3px。済。
3. マークの箱 160×125.5。題字・マーク・カードの中心 x が一致（390 で 195、1440 で 720）。済。
4. 横はみ出し 0（scrollWidth ＝ innerWidth）。カードの下端が画面内（390×844 で 692.6、1440×1000 で 744.6）。済。
5. `<head>` に `icon0.svg`（image/svg+xml・any）・`icon1.png`（192x192）・`apple-touch-icon`（180x180）の link 3 本。GET はいずれも 200。済。
6. console error 0、`npx tsc --noEmit` 0、`grep -c "^@media" app/globals.css` ＝ 9。済。
7. アイコンの見た目：`p43/icon_candidates.png`（地 3 色 × 180/64/32/16・明暗の地）。

## 5. 実装時の判断

1. **題字の緑をやめた**：依頼は「起動画面と同じロゴ」。起動画面の題字は 1 色（`splash-brand.md` §2）なので、マークだけ替えて緑を残すと「同じ」にならない。戻すなら `<b> FOOTBALL</b>` と `.login-logo b { color: var(--lime) }` を復活。
2. **アイコンの地は #f4f5f9**：#f4f5f9・白・#1b1c1e の 3 つを 180/64/32/16 で見比べた。参考画像（`sp_ref_logo.jpg`）と起動画面が明るい地なので同じにした。黒地は映えるがボールの黒い縁が地に溶け、「同じロゴ」から離れる。白は明るいタブ上でタイルの形が消える。
3. **PNG も置く**：Safari（Mac・iPhone）は SVG の favicon を読まないので、SVG だけだとタブとホーム画面に何も出ない。`icon1.png` と `apple-icon.png` を足した。
4. **番号付きのファイル名**：§2 のとおり Next は `icon.*` を 1 つしか拾わない。`icon.svg` の名前が変わるので `relativize-export.cjs` も直した。
5. **relativize-export.cjs は冪等でない**（`../_next/` の中の `/_next/` をもう一度置換して `../../_next/` にする）。`npm run export` の中で `next build` の直後に 1 回だけ動かすもので、単独で実行しない（作業中に誤って実行して `docs/404/index.html` が壊れたので `git checkout -- docs` で戻した）。
6. **レールのロゴは触らない**：依頼はログインとアイコン。PC レールの `LogoMark`（22px / 16px）は旧ロゴのまま。替えるなら `Logo.tsx` を消して `BrandMark` にし、`.rail-mark` の寸法（PC ブロック）を箱の比率 510/400 に合わせる作業が要る。
7. `themeColor`（#15803d・旧緑）は依頼外で未変更。
