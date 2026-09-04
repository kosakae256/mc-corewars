#!/usr/bin/env node
/**
 * パックを **「正式なパック」としてワールドに当てる。**
 *
 *     node tools/mc-install.mjs worlds/pve-v3/packs/pve_v3
 *     node tools/mc-install.mjs worlds/pve-v3/packs/pve_v3 --world "企画をテスト中"
 *     node tools/mc-install.mjs --worlds            （ワールドの一覧）
 *
 * 決まりは `docs/research/15-pack-delivery.md`。
 *
 * ## なぜ要るのか
 *
 * > ### 開発用パックは、参加してきた人に配られない
 * >
 * > `npm run local-deploy` は **`development_*_packs` に置く**（公式ひな形の既定）。
 * > **その端末でしか読まれない。**
 * >
 * > **ビヘイビアはホストが動かすので全員に効く**が、
 * > **リソパは各自の端末が描く**ので、**持っていない人には出ない。**
 * > 「AI は効いているのにモデルが古い」はこれ。
 *
 * **正式なパック**（`resource_packs/` `behavior_packs/`）としてワールドに当てると、
 * **参加時に自動で配られる。** その代わり**入り直しのたびに再ダウンロード**になる。
 *
 * ## やること
 *
 * 1. `behavior_packs/<名>` ＋ `dist/scripts` → `com.mojang/behavior_packs/<名>`
 * 2. `resource_packs/<名>` → `com.mojang/resource_packs/<名>`
 * 3. ワールドの `world_behavior_packs.json` / `world_resource_packs.json` に
 *    **uuid と版を書く**（同じ uuid の行は入れ替える）
 *
 * **ゲームを閉じてから走らせること。** 開いていると上書きし返される。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : (args[i + 1] ?? true);
};

/** com.mojang の場所。**新しいランチャー側** */
const MOJANG = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
  "Minecraft Bedrock",
  "Users",
  "Shared",
  "games",
  "com.mojang"
);

const WORLDS = path.join(MOJANG, "minecraftWorlds");

function worldList() {
  if (!existsSync(WORLDS)) return [];
  return readdirSync(WORLDS)
    .map((id) => {
      const dir = path.join(WORLDS, id);
      const nameFile = path.join(dir, "levelname.txt");
      const name = existsSync(nameFile) ? readFileSync(nameFile, "utf8").trim() : id;
      return { id, dir, name };
    })
    .filter((w) => existsSync(path.join(w.dir, "level.dat")));
}

if (args.includes("--worlds")) {
  for (const w of worldList()) console.log(`  ${w.name}   [${w.id}]`);
  process.exit(0);
}

const packRoot = args.find((a) => !a.startsWith("--"));
if (packRoot === undefined) {
  console.error("使い方: node tools/mc-install.mjs <パックの場所> [--world <名前>]");
  process.exit(1);
}

/** その組の中の behavior_packs/* と resource_packs/* を集める */
function sources(root) {
  const out = [];
  for (const [kind, dest] of [
    ["behavior_packs", "behavior_packs"],
    ["resource_packs", "resource_packs"],
  ]) {
    const base = path.join(root, kind);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const from = path.join(base, name);
      if (!existsSync(path.join(from, "manifest.json"))) continue;
      out.push({ kind, dest, name, from });
    }
  }
  return out;
}

const packs = sources(packRoot);
if (packs.length === 0) {
  console.error(`manifest を持つパックが見つからない: ${packRoot}`);
  process.exit(1);
}

// ---- ワールドを選ぶ
const worlds = worldList();
const wanted = flag("world");
let world;
if (typeof wanted === "string") {
  world = worlds.find((w) => w.name === wanted || w.id === wanted);
  if (world === undefined) {
    console.error(`ワールドが見つからない: ${wanted}`);
    for (const w of worlds) console.error(`  ${w.name}   [${w.id}]`);
    process.exit(1);
  }
} else if (worlds.length === 1) {
  world = worlds[0];
} else {
  console.error("ワールドが複数ある。--world で選ぶこと:");
  for (const w of worlds) console.error(`  ${w.name}   [${w.id}]`);
  process.exit(1);
}

console.log(`ワールド: ${world.name}  [${world.id}]`);

// ---- 置く
const applied = { behavior_packs: [], resource_packs: [] };
for (const p of packs) {
  const manifest = JSON.parse(readFileSync(path.join(p.from, "manifest.json"), "utf8"));
  const to = path.join(MOJANG, p.dest, p.name);
  // **丸ごと入れ替える。** 消し忘れたファイルが残ると、原因の分かりにくい不具合になる
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(p.from, to, { recursive: true });

  // **ビヘイビアは、組み上げたスクリプトを重ねる**
  if (p.kind === "behavior_packs") {
    const dist = path.join(packRoot, "dist", "scripts");
    if (existsSync(dist)) cpSync(dist, path.join(to, "scripts"), { recursive: true });
    else console.log("  （dist/scripts が無い。先に npm run build）");
  }

  applied[p.dest].push({ pack_id: manifest.header.uuid, version: manifest.header.version });
  console.log(`  置いた: ${p.dest}/${p.name}  v${manifest.header.version.join(".")}`);
}

// ---- ワールドに当てる
for (const [dest, file] of [
  ["behavior_packs", "world_behavior_packs.json"],
  ["resource_packs", "world_resource_packs.json"],
]) {
  const list = applied[dest];
  if (list.length === 0) continue;
  const p = path.join(world.dir, file);
  let current = [];
  if (existsSync(p)) {
    try {
      current = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      current = [];
    }
  }
  if (!Array.isArray(current)) current = [];
  const mine = new Set(list.map((x) => x.pack_id));
  // **同じ uuid の行は入れ替える。** 他人の行は触らない
  const kept = current.filter((x) => !mine.has(x?.pack_id));
  const next = [...kept, ...list];
  writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`  当てた: ${file}  （残した ${kept.length} 行 ＋ 自分の ${list.length} 行）`);
  for (const x of kept) console.log(`    ※ 他のパックが残っている: ${x.pack_id}`);
}

console.log("");
console.log("**ゲームを開いていたら、一度閉じてから開き直すこと。**");
console.log("参加者には、入るときに自動で配られる（版を上げれば再ダウンロードされる）。");
