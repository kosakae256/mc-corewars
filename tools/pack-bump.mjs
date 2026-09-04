#!/usr/bin/env node
/**
 * パックの **manifest の版を上げる。**
 *
 *     node tools/pack-bump.mjs worlds/pve-v3/packs/pve_v3
 *     node tools/pack-bump.mjs worlds/pve-v3/packs/pve_v3 --rp   （RP だけ）
 *     node tools/pack-bump.mjs worlds/pve-v3/packs/pve_v3 --minor
 *
 * 決まりは `docs/imp.md` 10-10。
 *
 * ## なぜ要るのか
 *
 * > ### 版を上げないと、直したものが届かないことがある
 * >
 * > **Minecraft はパックを版で見分ける。**
 * > 同じ版のまま中身だけ変えると、**古いものが使われ続ける**ことがある。
 * > **絵やモデルを差し替えたのに変わらない**とき、まずここを疑う。
 *
 * ## 何を直すか
 *
 * | | |
 * | --- | --- |
 * | `header.version` | 末尾を ＋1（`--minor` なら真ん中を ＋1、末尾は 0） |
 * | `modules[].version` | **header と同じ値に揃える** |
 * | `dependencies[].version` | **同じ組のパックを指しているものだけ**直す |
 *
 * **手で 3 か所を直すと、必ずどれか忘れる。**
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--"));
const minor = args.includes("--minor");
const onlyRp = args.includes("--rp");
const onlyBp = args.includes("--bp");

if (root === undefined) {
  console.error("使い方: node tools/pack-bump.mjs <パックの場所> [--rp|--bp] [--minor]");
  process.exit(1);
}

/** `behavior_packs/*` と `resource_packs/*` の manifest を集める */
function manifests(dir) {
  const out = [];
  for (const kind of ["behavior_packs", "resource_packs"]) {
    if (onlyRp && kind !== "resource_packs") continue;
    if (onlyBp && kind !== "behavior_packs") continue;
    const base = path.join(dir, kind);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const p = path.join(base, name, "manifest.json");
      if (existsSync(p)) out.push({ kind, name, path: p });
    }
  }
  return out;
}

const found = manifests(root);
if (found.length === 0) {
  console.error(`manifest が見つからない: ${root}`);
  process.exit(1);
}

/** 上げたあとの版。**uuid → version** */
const bumped = new Map();

for (const m of found) {
  const json = JSON.parse(readFileSync(m.path, "utf8"));
  const v = json.header?.version;
  if (!Array.isArray(v) || v.length !== 3) {
    console.error(`  版が読めない: ${m.path}`);
    continue;
  }
  const next = minor ? [v[0], v[1] + 1, 0] : [v[0], v[1], v[2] + 1];
  json.header.version = next;
  for (const mod of json.modules ?? []) mod.version = [...next];
  bumped.set(json.header.uuid, next);
  writeFileSync(m.path, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`  ${m.kind}/${m.name}  ${v.join(".")} → ${next.join(".")}`);
}

// ---- 依存も直す。**同じ組のパックを指しているものだけ**
for (const m of found) {
  const json = JSON.parse(readFileSync(m.path, "utf8"));
  let touched = false;
  for (const dep of json.dependencies ?? []) {
    const to = bumped.get(dep.uuid);
    if (to === undefined) continue;
    if (JSON.stringify(dep.version) === JSON.stringify(to)) continue;
    dep.version = [...to];
    touched = true;
  }
  if (!touched) continue;
  writeFileSync(m.path, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`  ${m.kind}/${m.name}  依存の版も揃えた`);
}
