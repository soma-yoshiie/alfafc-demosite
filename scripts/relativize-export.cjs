/*
 * 静的書き出し（out/）を「どこに置いても動く」ように加工するスクリプト。
 * - HTML 内の絶対パス（/_next/ ・ /icon.svg）を、ファイルの深さに応じた相対パスへ書き換え
 *   → ルート配信 / GitHub Pages のサブパス（/リポジトリ名/）/ file:// のどこでも動く
 * - GitHub Pages の Jekyll が "_next" を無視しないよう .nojekyll を作成
 * - 仕上げに out/ を docs/ へミラー（GitHub Pages「/docs」公開用。out/ は .gitignore 対象）
 * 使い方: next build（output:export）後に `node scripts/relativize-export.cjs`
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

const htmls = walk(outDir).filter((f) => f.endsWith(".html"));
let rewritten = 0;
for (const f of htmls) {
  const rel = path.relative(outDir, path.dirname(f));
  const depth = rel === "" ? 0 : rel.split(path.sep).length;
  const prefix = depth === 0 ? "" : "../".repeat(depth);
  const before = fs.readFileSync(f, "utf8");
  // href/src 属性だけでなく、RSCフライトデータ（インラインJSON）内の絶対パスも一括で相対化する。
  const after = before
    .split("/_next/")
    .join(`${prefix}_next/`)
    .split("/icon.svg")
    .join(`${prefix}icon.svg`);
  if (after !== before) {
    fs.writeFileSync(f, after);
    rewritten++;
  }
}

fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

// GitHub Pages「Deploy from a branch / フォルダ:/docs」公開用に、out/ を docs/ へ丸ごとミラーする。
// （out/ は .gitignore 対象。docs/ は追跡されるのでそのまま push できる）
const docsDir = path.join(process.cwd(), "docs");
fs.rmSync(docsDir, { recursive: true, force: true });
fs.cpSync(outDir, docsDir, { recursive: true });

console.log(
  `relativize-export: ${rewritten} HTML を相対パス化＋.nojekyll を作成し、docs/ にミラーしました（GitHub Pages /docs 公開用）。`
);
