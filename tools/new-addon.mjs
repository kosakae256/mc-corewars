#!/usr/bin/env node
/**
 * addons/_template から新しいアドオンを生成する。
 *
 *   node tools/new-addon.mjs <アドオン名> ["説明"]
 *
 * - アドオン名は英小文字・数字・アンダースコアのみ（パックフォルダ名と
 *   Custom Component の名前空間に使うため）
 * - manifest.json の UUID は 4 つとも新規採番する
 *   （使い回すとゲーム側でパックが衝突して読み込まれない）
 * - 生成後に npm install まで行う
 */
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(ROOT, "addons", "_template");

const name = process.argv[2];
const description = process.argv[3] ?? `${name} behavior pack`;

if (!name) {
  console.error("使い方: node tools/new-addon.mjs <アドオン名> [\"説明\"]");
  process.exit(1);
}
if (!/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error(`アドオン名が不正: "${name}"\n英小文字で始まり、英小文字・数字・アンダースコアのみ使えます。`);
  process.exit(1);
}
if (name === "_template") {
  console.error("_template は予約名です。");
  process.exit(1);
}

const dest = join(ROOT, "addons", name);
if (existsSync(dest)) {
  console.error(`すでに存在します: addons/${name}`);
  process.exit(1);
}
if (!existsSync(TEMPLATE)) {
  console.error(`ひな形が見つかりません: ${TEMPLATE}`);
  process.exit(1);
}

// 1. コピー
cpSync(TEMPLATE, dest, { recursive: true });

// 2. __ADDON__ ディレクトリをリネーム
for (const packs of ["behavior_packs", "resource_packs"]) {
  renameSync(join(dest, packs, "__ADDON__"), join(dest, packs, name));
}

// 3. プレースホルダ置換（UUID は 4 つとも新規）
const replacements = {
  __ADDON__: name,
  __DESCRIPTION__: description,
  __UUID_BP_HEADER__: randomUUID(),
  __UUID_BP_SCRIPT__: randomUUID(),
  __UUID_RP_HEADER__: randomUUID(),
  __UUID_RP_MODULE__: randomUUID(),
};

const TEXT_EXT = /\.(json|ts|mjs|js|md|env)$/;
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!TEXT_EXT.test(entry) && entry !== ".env") continue;
    let s = readFileSync(p, "utf8");
    const before = s;
    for (const [k, v] of Object.entries(replacements)) s = s.split(k).join(v);
    if (s !== before) writeFileSync(p, s);
  }
}
walk(dest);

console.log(`addons/${name} を作成しました。`);
console.log(`  BP UUID: ${replacements.__UUID_BP_HEADER__}`);
console.log(`  RP UUID: ${replacements.__UUID_RP_HEADER__}`);

// 4. 依存インストール
console.log("\nnpm install 中...");
execFileSync("npm", ["install"], { cwd: dest, stdio: "inherit", shell: process.platform === "win32" });

console.log(`
完了。次はこれ:

  cd addons/${name}
  npm run local-deploy          # ゲームに配置（--watch で監視）

ゲーム側でワールドを作り、ビヘイビアーパック "${name} BP" を有効化してください。
`);
