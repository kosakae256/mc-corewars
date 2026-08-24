/**
 * ワールドにパックを結び付ける。
 *
 * ## これは何をするのか
 *
 * ワールドフォルダの `world_behavior_packs.json` /
 * `world_resource_packs.json` に、パックの **UUID とバージョン**を書く。
 * ゲームはこの一覧を見て、開発用フォルダなどからパックを探して読み込む。
 *
 * ゲーム内の「ワールドの設定」から手で有効にしても同じことが起きる。
 * **この道具は、それを間違いなく・繰り返し行えるようにするためのもの。**
 *
 * ## 必ず守ること
 *
 * **ワールドを閉じてから実行する。**
 * 開いたまま書き換えても、閉じるときにゲーム側の一覧で上書きされて消える。
 * 起動中は実行を拒否する。
 *
 * ## 使い方
 *
 *   node tools/attach-packs.mjs                     いまの状態を見る
 *   node tools/attach-packs.mjs --write             書き込む
 *   node tools/attach-packs.mjs --world "別の名前"  対象を変える
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const WORLD_NAME = argOf("--world") ?? "コアPVPを作る会";
const WRITE = process.argv.includes("--write");

/** 入れるパック。**ここに書いたものだけが入る** */
const PACKS = [
  { dir: "worlds/core-wars/packs/game", name: "game" },
  { dir: "worlds/core-wars/packs/kit", name: "kit" },
];

function argOf(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// ---------------------------------------------------------------- ワールドを探す
function worldRoots() {
  const appdata = process.env.APPDATA ?? "";
  const base = join(appdata, "Minecraft Bedrock", "Users");
  if (!existsSync(base)) return [];
  const out = [];
  for (const user of readdirSync(base)) {
    const w = join(base, user, "games", "com.mojang", "minecraftWorlds");
    if (existsSync(w)) out.push(w);
  }
  return out;
}

function findWorld(name) {
  for (const root of worldRoots()) {
    for (const id of readdirSync(root)) {
      const dir = join(root, id);
      const f = join(dir, "levelname.txt");
      if (!existsSync(f)) continue;
      if (readFileSync(f, "utf8").trim() === name) return dir;
    }
  }
  return null;
}

// ---------------------------------------------------------------- 起動確認
function minecraftRunning() {
  try {
    return execSync("tasklist", { encoding: "utf8" }).includes("Minecraft.Windows.exe");
  } catch {
    return false;   // 確認できないなら止めない
  }
}

// ---------------------------------------------------------------- パックを読む
function manifestsOf(dir, name) {
  const out = { bp: null, rp: null };
  for (const [key, folder] of [["bp", "behavior_packs"], ["rp", "resource_packs"]]) {
    const p = join(dir, folder, name, "manifest.json");
    if (!existsSync(p)) continue;
    const m = JSON.parse(readFileSync(p, "utf8"));
    out[key] = { pack_id: m.header.uuid, version: m.header.version, _name: m.header.name };
  }
  return out;
}

// ---------------------------------------------------------------- 本体
const world = findWorld(WORLD_NAME);
if (!world) {
  console.error(`ワールド「${WORLD_NAME}」が見つからない。`);
  console.error("見えているワールド:");
  for (const root of worldRoots())
    for (const id of readdirSync(root)) {
      const f = join(root, id, "levelname.txt");
      if (existsSync(f)) console.error(`  ${readFileSync(f, "utf8").trim()}`);
    }
  process.exit(1);
}
console.log(`ワールド: ${WORLD_NAME}`);
console.log(`  ${world}\n`);

const bp = [], rp = [];
for (const p of PACKS) {
  const m = manifestsOf(p.dir, p.name);
  for (const [key, list] of [["bp", bp], ["rp", rp]]) {
    if (!m[key]) { console.log(`  ${p.name} ${key.toUpperCase()}  （manifest なし・飛ばす）`); continue; }
    const { pack_id, version, _name } = m[key];
    console.log(`  ${_name.padEnd(10)} ${pack_id}  ${version.join(".")}`);
    list.push({ pack_id, version });
  }
}

const targets = [
  ["world_behavior_packs.json", bp],
  ["world_resource_packs.json", rp],
];

console.log("\n現在の中身:");
for (const [f] of targets) {
  const p = join(world, f);
  const cur = existsSync(p) ? readFileSync(p, "utf8").trim() : "(ファイルなし)";
  console.log(`  ${f}  ${cur === "[]" ? "空" : cur.slice(0, 120)}`);
}

if (!WRITE) {
  console.log("\n書き込むには --write を付ける。");
  console.log("**必ずワールドを閉じてから実行すること。**");
  process.exit(0);
}

if (minecraftRunning()) {
  console.error("\n★ Minecraft が起動中。中止した。");
  console.error("  開いたまま書き換えても、閉じるときに上書きされて消える。");
  console.error("  ワールドを閉じてから、もう一度実行すること。");
  process.exit(1);
}

for (const [f, list] of targets) {
  writeFileSync(join(world, f), JSON.stringify(list, null, 2) + "\n");
  console.log(`  書き込んだ: ${f}  ${list.length} 件`);
}
console.log("\n完了。ワールドを開き直すと読み込まれる。");
