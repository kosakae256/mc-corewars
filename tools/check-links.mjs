/**
 * ドキュメント中の相対リンクが、実在するファイルを指しているかを調べる。
 *
 * ## なぜ要るか
 *
 * ドキュメント駆動で進める以上、**リンクが切れていると読めない。**
 * だが手で確認するのは無理がある。ファイルを移動したとき、
 * どのリンクが壊れたかを人が漏れなく追うのは現実的でない。
 *
 * 実際、`docs/game/` を `worlds/core-wars/docs/` へ移した際に
 * 相対リンクがまとめて壊れた。**そのとき初めてこの道具を作った。**
 *
 * ## 使い方
 *
 *   node tools/check-links.mjs           切れているリンクを一覧する
 *   node tools/check-links.mjs --fix     移動先を探して自動で直す
 *
 * `--fix` は**ファイル名が一意に決まるものだけ**直す。
 * 同名のファイルが複数ある場合は直さず、人に判断させる。
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, posix } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const FIX = process.argv.includes("--fix");

/** 対象にしないディレクトリ */
const SKIP = new Set(["node_modules", ".git", "dist", "lib", "out", "reference"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const files = walk(ROOT);

/** ファイル名 → 実在するパスの一覧（--fix の候補探し用） */
const byName = new Map();
for (const f of files) {
  const n = f.split(/[\\/]/).pop();
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(f);
}

const LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
let broken = 0, fixed = 0, ambiguous = 0;

for (const file of files) {
  let text = readFileSync(file, "utf8");
  let changed = false;
  const here = dirname(file);

  text = text.replace(LINK, (whole, label, target) => {
    // 外部リンク・アンカーだけのものは対象外
    if (/^(https?:|mailto:|#)/.test(target)) return whole;
    const [path, hash] = target.split("#");
    if (!path) return whole;

    const abs = resolve(here, path);
    if (existsSync(abs)) return whole;

    broken++;
    const name = path.split("/").pop();
    const cands = byName.get(name) ?? [];

    if (!FIX) {
      console.log(`切れ: ${relative(ROOT, file)}\n      → ${target}` +
        (cands.length === 1 ? `\n      候補: ${relative(ROOT, cands[0])}` :
         cands.length > 1 ? `\n      候補が ${cands.length} 件（人が選ぶ必要あり）` :
         `\n      候補なし`));
      if (cands.length !== 1) ambiguous++;
      return whole;
    }

    if (cands.length !== 1) { ambiguous++; return whole; }
    const rel = posix.join(...relative(here, cands[0]).split(/[\\/]/));
    changed = true; fixed++;
    return `[${label}](${rel}${hash ? "#" + hash : ""})`;
  });

  if (changed) writeFileSync(file, text);
}

console.log(`\n対象 ${files.length} ファイル / 切れているリンク ${broken}`);
if (FIX) console.log(`  直した ${fixed} / 直せなかった ${ambiguous}`);
process.exit(broken > 0 && !FIX ? 1 : 0);
