# 起動時のスプラッシュをロゴ（A＋ボール＋金の弧）を軸に作り直す — 正本

ユーザーが用意したロゴ画像（~/.claude/alfa-verify-tools/sp_ref_logo.jpg、941×1672）を軸に、最初に開いたときの演出（SplashScreen）を作り直す。ロゴは画像を貼らず **SVG で起こし、部品ごとに描く順番をつけて動かす**。ログイン画面・左のレール（LogoMark）は今回触らない（§5）。

## 0. 参考画像から取った寸法と色（941×1672 の座標）

- 銀の棒：中心線 (452,606)→(340,926)、太さ 60、両端は丸。色は上 #e9eee8 → 下 #c8d1cc。
- 金の棒：中心線 (452,606)→(565,926)、太さ 60、両端は丸。銀の上に重ねる（頂点は金が見える）。色は上 #d6b564 → 下 #b58b37。
- ボール：中心 (593.5,695.5)、外の黒い縁まで半径 75（縁 6）。縁の外側の端は上 620・下 771・左 518・右 669 で実測。白は中央やや左上が明るい。
- 金の弧：**ボールとは同心ではない**（ボールの中心から右上へ (+11,−16) ずれた円）。金の画素（棒とボールを除く約 4900 点）に円を当てはめた値は、中心 (604.4,681.1)、半径 104.4、太さ 15.6、両端は丸。左上（画面角度 −144°、頂点のすぐ右）から時計回りに右下（+31°）まで約 175°。ボールの中心から見た弧の距離は角度によって 108〜124 と変わる（弧の両端はボールの縁に近く、右上は離れる。ボールを「抱えて」見える形）。色 #d4b562 → #bd9a47。
- 「ALFA FOOTBALL」：大文字の高さ 64、幅 574（棒の幅 406 の 1.41 倍）、色 #35363b 付近の墨。ページの中央に置く。マークは A の頂点がほぼページ中央（弧とボールのぶん右に伸びる）。
- 「サッカー戦術ボード ／ チーム運営」：高さ 26、幅 530、色 #9a9da3 付近の灰、字間が広い。
- 縦の間（見かけ：画素の塊の間）：棒の下端→題字の上 88、題字の下→副題の上 44（画面ではマークの縮尺 0.5047 を掛けて 44px と 22px）。
- 地：#f4f5f9（アプリの --surface #eef1f5 で代用。背景は変えない）。

## 1. マーク（components/BrandMark.tsx・新規）

viewBox は `-85 0 510 400`（参考座標から (300,565) を引いた値。弧の右端 x=416.6 は箱の中に入る。左に 85 足して **A の頂点 x=152 が箱の中央 170 の近くに来る**ようにし、題字と中央が揃う）。下の SVG をそのまま JSX に写す（属性は camelCase：strokeWidth・strokeLinecap・clipPath・pathLength・stopColor・gradientUnits）。グラデーションと clipPath の id は `uid` プロップ（既定 "bm"）を前置して衝突を避ける。`className` プロップを root の svg に付ける。`aria-label="ALFA FOOTBALL"`。

- 棒と弧は `pathLength="1"`（描く向き＝d の向き：銀は左下→頂点、金は頂点→右下、弧は左上→右下の時計回り）。pathLength は WebKit が 2020-01 に実装済み（Safari 13.1 以降）。
- ボールは `<g className="bm-ball">` にまとめる（中の 5 つの五角形は中央の「頂点の方向」(−90°+72°k) に距離 64、外接半径 24、径方向に 0.65 に潰し、頂点が中心向き。中央の頂点と縫い目でつなぐ。`clipPath` で円の中に収める）。
- ボールの外の黒い縁 6、縫い目 4.5。ボールは参考の位置に合わせて `<g class="bm-ball">` の**内側**の `<g transform="translate(-0.5 -4.5)">` で動かす（`.bm-ball` 自体には CSS の transform アニメがあるので、属性の transform は付けない。clipPath も内側にあるので一緒に動く）。
- 色は上記のとおりトークンにせず**生値**（ブランド色。R3 で --gold を消した方針は変えない：splash の中だけで使う）。

```svg
<svg class="brandmark" viewBox="-85 0 510 400" xmlns="http://www.w3.org/2000/svg" aria-label="ALFA FOOTBALL">
  <defs>
    <linearGradient id="bm_silver" gradientUnits="userSpaceOnUse" x1="152" y1="41" x2="40" y2="361">
      <stop offset="0" stop-color="#eef1ee"/><stop offset="1" stop-color="#c5cdc8"/>
    </linearGradient>
    <linearGradient id="bm_gold" gradientUnits="userSpaceOnUse" x1="152" y1="41" x2="265" y2="361">
      <stop offset="0" stop-color="#d8b866"/><stop offset="1" stop-color="#b38935"/>
    </linearGradient>
    <linearGradient id="bm_arc" gradientUnits="userSpaceOnUse" x1="219.8" y1="54.8" x2="393.7" y2="170.1">
      <stop offset="0" stop-color="#d4b562"/><stop offset="1" stop-color="#bd9a47"/>
    </linearGradient>
    <radialGradient id="bm_ball" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.75" stop-color="#f4f4f4"/><stop offset="1" stop-color="#d9dbda"/>
    </radialGradient>
    <clipPath id="bm_clip"><circle cx="294" cy="135" r="72"/></clipPath>
  </defs>
  <path class="bm-silver" d="M40 361 L152 41" pathLength="1" stroke="url(#bm_silver)" stroke-width="60" stroke-linecap="round" fill="none"/>
  <path class="bm-gold" d="M152 41 L265 361" pathLength="1" stroke="url(#bm_gold)" stroke-width="60" stroke-linecap="round" fill="none"/>
  <path class="bm-arc" d="M219.8 54.8 A104.4 104.4 0 0 1 393.7 170.1" pathLength="1" stroke="url(#bm_arc)" stroke-width="15.6" stroke-linecap="round" fill="none"/>
  <g class="bm-ball">
    <g transform="translate(-0.5 -4.5)">
      <circle cx="294" cy="135" r="72" fill="url(#bm_ball)" stroke="#1b1c1e" stroke-width="6"/>
      <g clip-path="url(#bm_clip)" fill="#1b1c1e">
        <polygon points="294.0,108.0 319.7,126.7 309.9,156.8 278.1,156.8 268.3,126.7"/>
        <g transform="translate(294 135) rotate(-90) translate(64 0) scale(0.65 1) rotate(90)"><polygon points="0.0,-24.0 22.8,-7.4 14.1,19.4 -14.1,19.4 -22.8,-7.4" transform="rotate(180)"/></g>
        <g transform="translate(294 135) rotate(-18) translate(64 0) scale(0.65 1) rotate(18)"><polygon points="0.0,-24.0 22.8,-7.4 14.1,19.4 -14.1,19.4 -22.8,-7.4" transform="rotate(252)"/></g>
        <g transform="translate(294 135) rotate(54) translate(64 0) scale(0.65 1) rotate(-54)"><polygon points="0.0,-24.0 22.8,-7.4 14.1,19.4 -14.1,19.4 -22.8,-7.4" transform="rotate(324)"/></g>
        <g transform="translate(294 135) rotate(126) translate(64 0) scale(0.65 1) rotate(-126)"><polygon points="0.0,-24.0 22.8,-7.4 14.1,19.4 -14.1,19.4 -22.8,-7.4" transform="rotate(36)"/></g>
        <g transform="translate(294 135) rotate(198) translate(64 0) scale(0.65 1) rotate(-198)"><polygon points="0.0,-24.0 22.8,-7.4 14.1,19.4 -14.1,19.4 -22.8,-7.4" transform="rotate(108)"/></g>
      </g>
      <g stroke="#1b1c1e" stroke-width="4.5" stroke-linecap="round" fill="none" clip-path="url(#bm_clip)">
        <line x1="294.0" y1="108.0" x2="294.0" y2="86.6"/>
        <line x1="319.7" y1="126.7" x2="340.0" y2="120.0"/>
        <line x1="309.9" y1="156.8" x2="322.4" y2="174.2"/>
        <line x1="278.1" y1="156.8" x2="265.6" y2="174.2"/>
        <line x1="268.3" y1="126.7" x2="248.0" y2="120.0"/>
      </g>
    </g>
  </g>
</svg>
```

## 2. 画面（components/SplashScreen.tsx）

```tsx
<div className={`splash${leaving ? " leave" : ""}`} onClick={...今のまま}>
  <div className="splash-mark"><BrandMark uid="sp" /></div>
  <div className="splash-title">ALFA FOOTBALL</div>
  <div className="splash-sub">サッカー戦術ボード ／ チーム運営</div>
  <div className="splash-skip">タップでスキップ</div>
</div>
```

- `<b> FOOTBALL</b>`（緑）はやめ、題字は 1 色。
- onDone は自動とタップのどちらから来ても **1 回だけ**（doneRef）。タップの setTimeout もアンマウントで clearTimeout。2 回目のタップは無視。
- 自動で閉じる時刻：`setLeaving(true)` を **2900ms**、`onDone` を **3350ms**（描画が終わって 1.9s で全部そろい、1 秒見せてから消える）。タップは今のまま（leave → 250ms → onDone）。
- LogoMark の import を外す（Logo.tsx 自体は残す：login・rail が使う）。

## 3. CSS（app/globals.css の基礎ブロック。`.splash` 〜 `@keyframes sp-fadein` の範囲を書き換える）

```css
.splash {
  …今の宣言のまま（position/inset/z-index/flex/background: var(--surface)/color/transition/cursor/user-select）…
  gap: 0;                                  /* 間は各要素の margin-top で決める */
  --spw: min(66vw, 280px);                 /* マークの箱の幅（390px で 257、PC で 280） */
  --spw: min(66vw, 280px, 55svh);          /* 横向き（844×390）や背の低い画面では高さでも抑え、副題と「タップでスキップ」が重ならない。svh 非対応なら上の行 */
  --sp-ease: cubic-bezier(0.4, 0, 0.2, 1);
}
.splash.leave { opacity: 0; }
.splash-mark { width: var(--spw); aspect-ratio: 510 / 400; }
.splash-mark svg { width: 100%; height: 100%; display: block; overflow: visible; }
.splash-title {
  font-family: var(--font-display);
  font-size: calc(var(--spw) * 0.19);      /* 390px で 49px：大文字の高さ≒34 ＝ マーク幅 204 の 0.167（参考 0.158） */
  font-weight: 700;                        /* Bebas Neue は 400 しか無いので合成の太字。参考の太さに寄せる（PC の .splash-title 600 の指定は §3 末尾で外す） */
  line-height: 1;
  letter-spacing: 0.1em;                   /* 390px で題字の幅 289 ＝ マーク幅の 1.42（参考 1.41） */
  color: #2e3035;
  margin-top: calc(var(--spw) * 0.145);     /* 棒の下端→題字の大文字の上端が約 44px（参考 88×0.5047）。題字の箱の上の余白約 7px を含む */
  white-space: nowrap;
  animation: sp-up 0.6s ease 1.15s both;
}
.splash-sub {
  font-size: max(12px, calc(var(--spw) * 0.052));
  font-weight: 500;
  letter-spacing: 0.2em;
  color: #9a9da3;
  margin-top: calc(var(--spw) * 0.03);      /* 題字の大文字の下端→副題の上端が約 22px（参考 44×0.5047）。題字は line-height:1 で大文字の下に約 10px の余白が残るので小さく取る */
  white-space: nowrap;
  animation: sp-up 0.6s ease 1.35s both;
}
.splash-skip { …今のまま（position/bottom/font-size/letter-spacing/color/opacity）…; animation: sp-fadein 0.6s ease 1.7s forwards; }

/* 描く順番：銀（左下→頂点）→ 金（頂点→右下）→ ボールが回りながら現れる → 金の弧が時計回りに → 題字 → 副題 → スキップ */
.splash .bm-silver { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sp-draw 0.45s var(--sp-ease) 0s both; }
.splash .bm-gold   { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sp-draw 0.45s var(--sp-ease) 0.4s both; }
.splash .bm-arc    { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sp-draw 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) 0.95s both; }
.splash .bm-ball   { transform-box: fill-box; transform-origin: center; animation: sp-ballin 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.8s both; }
@keyframes sp-draw   { 0% { stroke-dashoffset: 1; opacity: 0; } 2% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 1; } }  /* 0% の opacity 0 は丸い端の「点」が出ないため */
@keyframes sp-ballin { 0% { transform: scale(0.3) rotate(-120deg); opacity: 0; } 60% { transform: scale(1.06) rotate(10deg); opacity: 1; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes sp-up     { …今のまま（login-head も使う。消さない）… }
@keyframes sp-fadein { …今のまま… }
```

- `.splash-mark .lm-ball`、`.splash-title b`、`@keyframes sp-pop`、`@keyframes sp-ball` は削除（他で使っていない。grep で確認）。
- 時間の目安（ms）：銀 0–450、金 400–850、ボール 800–1200、弧 950–1400、題字 1150–1750、副題 1350–1950、スキップ 1700–2300、消え始め 2900、終了 3350。
- `@media (prefers-reduced-motion: reduce)` の既存ブロック（27307 行付近）の中に `.splash * { animation-delay: 0s !important; }` を足す（duration は既に 0.01ms なので、遅延を消せば最初から全部見える）。
- PC ブロック 23254 行付近の `font-weight: 600` の一覧から `.splash-title,` を外す（基礎の 700 を PC でも使う）。PC の `.splash { background: radial-gradient(...) }`（20771 行付近）は今のまま。そこのコメント「ブランドロゴの緑(.login-logo b / .splash-title b)は据え置き」は「.login-logo b」だけに直す。

## 4. 検証（~/.claude/alfa-verify-tools/p37_splash.js・新規。p37 は空き番号）

セッション無し（localStorage を消す）で http://localhost:3000/ を開き、390×844（dpr 2）で：

1. 読み込み前に `window.setTimeout` を差し替え、2000ms 以上の遅延は登録しない（自動で閉じないようにする）。読み込み後 `document.getAnimations()` を全部 pause し、`currentTime` を 0, 150, 300, 450, 600, 800, 950, 1100, 1300, 1500, 1800, 2300 にして撮る（p37/f_NNNN.png、マークと文字の範囲 y 200–660 を切り出し）。
   - t=0：マークの箱の中に地の色以外の画素が無い（丸い端の点が出ていない）。
   - t=2300：bm-silver/bm-gold/bm-arc の stroke-dashoffset が 0、bm-ball の opacity 1、題字・副題・スキップの opacity 1。
2. t=2300 の全画面（p37/m_final.png）で：`.splash-mark` の幅 257±1、`.splash-title` の幅 ≤ 358、題字・副題・マークの中心 x が 195±2、横のはみ出し無し（scrollWidth ≤ clientWidth）。題字の上端 − マークの下端、副題の上端 − 題字の下端（箱の間）を記録。**見かけの間**（画素の塊の間：棒の下端→題字の大文字の上端、題字の下端→副題の上端）は 44±3 と 22±3（参考 88・44 の 0.5047 倍）、マークの見かけの幅（銀の棒の左端→弧の右端）は 205±2（dpr2 で 410、参考 409）。
3. 差し替え無しで開き直し、1500ms で `.splash` が残り、3600ms で `.splash` が無く `.login` がある（自動で閉じる）。セッション有り（seedCoach と同じ localStorage）で 3600ms に `.login` が無く本体がある。
4. 開き直して 500ms でタップ → 50ms 後 `.splash.leave`、400ms 後 `.splash` が無い。
5. `page.emulateMediaFeatures([{name:'prefers-reduced-motion', value:'reduce'}])` で開き、200ms で全部の opacity 1・dashoffset 0（p37/m_reduced.png）。
6. 1440×1000 で t=2300 の全画面（p37/pc_final.png）：`.splash-mark` の幅 280、中心 x 720±2。
7. ログイン画面（p37/m_login.png）と、コーチでログインした PC の左レール上部（p37/pc_rail.png）を撮り、LogoMark（旧ロゴ）のままであることを目で確認。
8. `npx tsc --noEmit`。
9. 参考画像との並び比較：p37/m_final.png のマーク〜副題の範囲と sp_ref_logo.jpg を横に並べた p37/compare.png を作る（PIL）。設計時の比較は ~/.claude/alfa-verify-tools/sp_design/compare3.png・ball_cmp.png。

## 5. 触らないこと

- components/Logo.tsx（LogoMark）と、それを使うログイン画面（.login-mark/.login-logo）・左レール（.rail-mark）。ロゴの差し替えは別の依頼。（追記 2026-11-08：ログイン画面とアプリのアイコンは `login-brand-icon.md` で BrandMark に置き換えた。左レールは旧ロゴのまま）
- `.splash` の背景（--surface／PC の radial-gradient）、z-index、タップで閉じる動き、AppFlow の分岐。
- `@keyframes sp-up`・`sp-fadein`（ログイン画面が使う）。
- 3D のブート画面 `.sp3dboot`。
