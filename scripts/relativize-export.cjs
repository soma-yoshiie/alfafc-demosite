/*
 * 静的書き出し（out/）を「どこに置いても動く」ように加工するスクリプト。
 * 1. HTML 内の絶対パス（/_next/ と app/ のアイコン /icon0.svg・/icon1.png・/apple-icon.png）を、ファイルの深さに応じた相対パスへ書き換え
 *    → ルート配信 / GitHub Pages のサブパス（/リポジトリ名/）/ file:// のどこでも動く
 *      （file:// だけは、ブラウザの制限で 3D のモデル（.glb）が読めない）
 * 2. webpack の実行時の公開パス（_next/static/chunks/webpack-*.js の `X.p="/_next/"`）を、
 *    「この script 自身の src 属性の、_next/ まで」を使う式へ書き換え
 *    → あとから読む部品（next/dynamic の chunk。セットプレーの 3D）と、ページ本体の読み込みがサブパスの下を指す
 * 3. CSS 内の絶対パス url(/_next/…)（next/font の Web フォント）を、その CSS ファイルから見た相対パスへ書き換え
 * 4. GitHub Pages の Jekyll が "_next" を無視しないよう .nojekyll を作成
 * 5. 仕上げに out/ を docs/ へミラー（GitHub Pages「/docs」公開用。out/ は .gitignore 対象）
 * 2・3 の理由と確かめ方は specs/pages-subpath.md。
 * 1〜3 は、書き換えの中身を先に全部作って検査し、通ってからまとめて書く。書き換える相手が見つからないとき・
 * 知らない形の絶対パスがあるとき・もう加工済みのときは、out/ も docs/ も書き換えずに止まる
 * （気づかないまま、サブパスで落ちる版や壊れた版を公開しないため）。
 * 使い方: next build（output:export）後に `node scripts/relativize-export.cjs`（`npm run export` が続けて実行する）
 */
const fs = require("fs");
const path = require("path");

const outDir = path.join(process.cwd(), "out");
if (!fs.existsSync(outDir)) {
  console.error("out/ が見つかりません。先に `next build` を実行してください。");
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// out/ から見た道を、区切りを / にそろえて返す（Windows でも同じ結果にする）
const relOut = (f) => path.relative(outDir, f).split(path.sep).join("/");

function fail(message) {
  console.error(`relativize-export: ${message}`);
  console.error("out/ も docs/ も書き換えていません（specs/pages-subpath.md §2-3）。");
  process.exit(1);
}

// 同じ out/ に 2 回かけない。1 の置換は 2 回かけると、深い階層の HTML の ../_next/ を ..../_next/ に壊す。
// 加工済みの index.html には /_next/ が残らないので、それで見分ける（`npm run export` でやり直せば、next build が out/ を作り直す）。
const indexHtml = path.join(outDir, "index.html");
if (fs.existsSync(indexHtml) && !fs.readFileSync(indexHtml, "utf8").includes("/_next/")) {
  fail("out/ はもう加工済みです（index.html に /_next/ がありません）。このスクリプトだけをもう一度実行せず、`npm run export` でやり直してください。");
}

const files = walk(outDir);
// 書き換えの中身（ファイル → 新しい中身）。検査が全部通るまで、1 バイトも書かない
const writes = new Map();

// ---- 1. HTML ----
let rewritten = 0;
for (const f of files.filter((f) => f.endsWith(".html"))) {
  const rel = path.relative(outDir, path.dirname(f));
  const depth = rel === "" ? 0 : rel.split(path.sep).length;
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const before = fs.readFileSync(f, "utf8");
  // href/src 属性だけでなく、RSCフライトデータ（インラインJSON）内の絶対パスも一括で相対化する。
  // アイコンは app/ の metadata ファイル（icon0.svg・icon1.png・apple-icon.png。specs/login-brand-icon.md §2）。
  // 名前を変えたらここも直す（相対化し忘れると GitHub Pages のサブパスで 404 になる）
  let after = before.split("/_next/").join(`${prefix}_next/`);
  for (const icon of ["icon0.svg", "icon1.png", "apple-icon.png"]) {
    after = after.split(`"/${icon}`).join(`"${prefix}${icon}`);
  }
  if (after !== before) {
    writes.set(f, after);
    rewritten++;
  }
}

// ---- 2. webpack の実行時の公開パス（specs/pages-subpath.md §2-1）----
// webpack の実行時（webpack-*.js）は、あとから読む chunk の場所を「X.p + ファイル名」で作る。
// X.p は "/_next/"（サイトの根）のまま書き出されるので、サブパスでは https://<ホスト>/_next/… を取りに行って 404 になる。
// HTML の <script src> は 1 で相対パスにしてあるので、X.p も「この script 自身の src 属性の、_next/ まで」にそろえる
// （ルートなら "_next/"、1 つ深い HTML なら "../_next/"）。src 属性と同じ文字列にしておくと、webpack が
// 「もう HTML にある <script>」を見つけられるので、ページ本体を二重に取りに行かない。
// document が無い所（Worker）と、src から _next/ が見つからない所では、元の "/_next/" のまま。
const PUBLIC_PATH_RE = /([A-Za-z_$][\w$]*)\.p="\/_next\/"/g;
const PUBLIC_PATH_EXPR =
  '(function(){var s="undefined"!=typeof document&&document.currentScript,a=s&&s.getAttribute("src")||"",i=a.lastIndexOf("_next/");return i<0?"/_next/":a.slice(0,i+6)})()';
const runtimes = files.filter((f) => /^_next\/static\/chunks\/webpack-[^/]+\.js$/.test(relOut(f)));
if (runtimes.length === 0) {
  fail("webpack の実行時（_next/static/chunks/webpack-*.js）が見つかりません。Next.js の書き出しの形が変わった可能性があります。");
}
for (const f of runtimes) {
  const before = fs.readFileSync(f, "utf8");
  const found = (before.match(PUBLIC_PATH_RE) || []).length;
  if (found !== 1) {
    fail(`${relOut(f)} の公開パス（X.p="/_next/"）が ${found} か所でした（1 か所のはず）。Next.js の書き出しの形が変わった可能性があります。`);
  }
  writes.set(f, before.replace(PUBLIC_PATH_RE, (_, name) => `${name}.p=${PUBLIC_PATH_EXPR}`));
}

// ---- 3. CSS の中の絶対パス（specs/pages-subpath.md §2-2）----
// next/font の @font-face は url(/_next/static/media/….woff2) で書き出される。CSS の url() は、その CSS ファイルの
// 場所から解決されるので、「CSS のあるフォルダから _next/ まで」の相対パスにする（_next/static/css/ なら ../../）。
// 書き換え方を決めていない形（url() でない /_next/、/_next/ 以外の根からの url(/…)）があれば止まる。
const CSS_URL_RE = /url\(\s*(["']?)\/_next\//g;
const CSS_OTHER_ROOT_URL_RE = /url\(\s*["']?\/(?!\/)(?!_next\/)[^)"']*/g;
let cssFiles = 0;
let cssUrls = 0;
for (const f of files.filter((f) => f.endsWith(".css"))) {
  const toNext = path.relative(path.dirname(f), path.join(outDir, "_next")).split(path.sep).join("/") || ".";
  const before = fs.readFileSync(f, "utf8");
  const total = before.split("/_next/").length - 1;
  let n = 0;
  const after = before.replace(CSS_URL_RE, (_, quote) => {
    n++;
    return `url(${quote}${toNext}/`;
  });
  if (n !== total) {
    fail(`${relOut(f)} に、url(/_next/…) の形でない /_next/ が ${total - n} か所あります（書き換え方が決まっていません）。`);
  }
  const others = before.match(CSS_OTHER_ROOT_URL_RE) || [];
  if (others.length > 0) {
    const example = others[0].replace(/^url\(\s*["']?/, "");
    fail(`${relOut(f)} に、/_next/ 以外の根からの url() が ${others.length} か所あります（例 ${example}）。サブパスでは 404 になるので、相対パスで書くか、このスクリプトに書き換え方を足してください。`);
  }
  if (n > 0) {
    writes.set(f, after);
    cssFiles++;
    cssUrls += n;
  }
}

// ---- ここから書く（検査は全部通った）----
for (const [f, content] of writes) {
  fs.writeFileSync(f, content);
}
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

// GitHub Pages「Deploy from a branch / フォルダ:/docs」公開用に、out/ を docs/ へ丸ごとミラーする。
// （out/ は .gitignore 対象。docs/ は追跡されるのでそのまま push できる）
const docsDir = path.join(process.cwd(), "docs");
fs.rmSync(docsDir, { recursive: true, force: true });
fs.cpSync(outDir, docsDir, { recursive: true });

console.log(
  `relativize-export: HTML ${rewritten} 本・実行時の公開パス ${runtimes.length} か所・CSS の url() ${cssUrls} か所（${cssFiles} 本）を相対パス化＋.nojekyll を作成し、docs/ にミラーしました（GitHub Pages /docs 公開用）。`
);
