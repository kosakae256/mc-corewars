#!/usr/bin/env node
/**
 * **ワールドに保存したマップを、控えとして取り出す。**
 *
 *     node tools/pve3-map-freeze.mjs              全部
 *     node tools/pve3-map-freeze.mjs testmap      1 つだけ
 *     node tools/pve3-map-freeze.mjs --list       何が入っているか見るだけ
 *
 * 決まりと**戻し方**は `worlds/pve-v3/docs/spec/19-map-store.md` 8 章。
 *
 * ## なぜ要るのか
 *
 * > ### ワールドに保存したものは、アドオンと一緒に旅をしない
 * >
 * > `StructureSaveMode.World` で保存したものは**ワールドの db の中**にあり、
 * > **`structures` フォルダにファイルは作られない**（2026-09-06 に確かめた）。
 * > **ワールドが壊れたら、手で直したマップは戻らない。**
 *
 * > ### **これは控え。パックには入れない**（2026-09-06 決定）
 * >
 * > **1 マップ 5 MB**（65 万マス × 4 バイト × 2 層、無圧縮）。
 * > **パックに入れると、遊ぶ人のディスクにそのまま残る。**
 * > **生成器があるマップは焼く必要がない**ので、**控えとして別の場所に置く。**
 *
 * ## どうやっているか
 *
 * ワールドの db には `structuretemplate_<名前空間>:<名前>` というキーで入っていて、
 * **値がそのまま `.mcstructure` の中身**（リトルエンディアンの NBT）。**そのまま書き出す。**
 *
 * ```
 * db/  →  worlds/pve-v3/backup/maps/<マップ>/<区画>.mcstructure.gz
 * ```
 *
 * > ### **gzip して置く**
 * >
 * > **中身はほとんど空気と一様な埋め**なので、**0.6% まで縮む**（5 MB → 30 KB）。
 * > **ゲームは読まない**ので、圧縮していて構わない。
 *
 * > ### **ゲームを閉じてから走らせること**
 * >
 * > 開いたまま db を触ると壊れる。**この道具は db を丸ごと写してから読む**が、
 * > **書き込みの途中を写す**と中身が古い／欠けることがある。
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { LevelDB } from "leveldb-zlib";

/** 名前空間。**`core/map-store.ts` の `PREFIX` と同じ** */
const NS = "pve3";

/** db のキーの頭 */
const PREFIX = "structuretemplate_";

/** そのパックの uuid。**当たっているワールドを、これで見つける** */
const PACK_UUID = JSON.parse(
  readFileSync(path.resolve("worlds/pve-v3/packs/pve_v3/behavior_packs/pve_v3/manifest.json"), "utf8")
).header.uuid;

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith("--"));
const listOnly = args.includes("--list");

/**
 * 書き出し先。**パックの外。**
 *
 * **控えなので、ゲームからは読まれない。**`--out <道>` で変えられる。
 */
const OUT = path.resolve(
  args.indexOf("--out") >= 0 ? (args[args.indexOf("--out") + 1] ?? "") : "worlds/pve-v3/backup/maps"
);


/** ワールドを置いている所を全部。**新しいランチャーは「利用者ごと」に分かれている** */
function worldRoots() {
  const base = path.join(process.env.APPDATA ?? "", "Minecraft Bedrock", "Users");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((u) => path.join(base, u, "games", "com.mojang", "minecraftWorlds"))
    .filter((p) => existsSync(p));
}

/** そのワールドの名前 */
function nameOf(dir) {
  const f = path.join(dir, "levelname.txt");
  return existsSync(f) ? readFileSync(f, "utf8").trim() : path.basename(dir);
}

/** db を最後に触った時刻。**どれが「いま遊んでいる」ワールドかの目印** */
function touchedAt(dir) {
  let newest = 0;
  try {
    for (const f of readdirSync(path.join(dir, "db"))) {
      const t = statSync(path.join(dir, "db", f)).mtimeMs;
      if (t > newest) newest = t;
    }
  } catch {
    /* db が無い */
  }
  return newest;
}

/**
 * そのパックが当たっているワールドを探す。
 *
 * **同じパックが複数のワールドに当たっていることがある**ので、
 * **db を最後に触ったもの**を選ぶ（＝いま遊んでいる方）。**他のものも出す。**
 */
function findWorld() {
  const given = args.indexOf("--world");
  if (given >= 0 && args[given + 1] !== undefined) return args[given + 1];
  const hits = [];
  for (const root of worldRoots()) {
    for (const id of readdirSync(root)) {
      const dir = path.join(root, id);
      const json = path.join(dir, "world_behavior_packs.json");
      if (!existsSync(json)) continue;
      try {
        const rows = JSON.parse(readFileSync(json, "utf8"));
        if (Array.isArray(rows) && rows.some((r) => r?.pack_id === PACK_UUID)) {
          hits.push({ dir, at: touchedAt(dir) });
        }
      } catch {
        /* 壊れた json は飛ばす */
      }
    }
  }
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => b.at - a.at);
  for (const h of hits.slice(1)) {
    console.log(`  （他にも当たっている: ${nameOf(h.dir)}）`);
  }
  return hits[0].dir;
}

const world = findWorld();
if (world === undefined) {
  console.error(`pve_v3（${PACK_UUID}）が当たっているワールドが見つからない。--world <道> で指せる`);
  process.exit(1);
}
console.log(`ワールド: ${nameOf(world)}`);
console.log(`  ${world}`);

// ---- **db は写してから読む。** 開いたままのワールドを直接触らない
const work = mkdtempSync(path.join(tmpdir(), "mapfreeze-"));
const dbCopy = path.join(work, "db");
cpSync(path.join(world, "db"), dbCopy, { recursive: true });

const db = new LevelDB(dbCopy, { createIfMissing: false });
await db.open();

/** 見つけたもの。**名前 → 中身** */
const found = new Map();
for await (const [key, value] of db.getIterator({ keys: true, values: true, keyAsBuffer: true })) {
  const k = key.toString("latin1");
  if (!k.startsWith(PREFIX)) continue;
  const id = k.slice(PREFIX.length);
  const [ns, name] = id.split(":");
  if (ns === undefined || name === undefined) continue;
  found.set(`${ns}:${name}`, { ns, name, data: Buffer.from(value) });
}
await db.close();
rmSync(work, { recursive: true, force: true });

if (found.size === 0) {
  console.log("db に構造物が入っていない");
  process.exit(0);
}

// ---- マップごとにまとめる。**名前は `<マップ>_<区画>`**（`core/map-store.ts` の `idOf`）
const byMap = new Map();
for (const r of [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))) {
  if (r.ns !== NS) {
    console.log(`  ${r.ns}:${r.name}  §ほかの名前空間なので触らない`);
    continue;
  }
  const m = /^(.*)_(\d+)$/.exec(r.name);
  if (m === null) continue;
  const map = m[1];
  if (only !== undefined && map !== only) continue;
  const list = byMap.get(map) ?? [];
  list.push({ piece: Number(m[2]), data: r.data });
  byMap.set(map, list);
}

let raw = 0;
let small = 0;
for (const [map, pieces] of byMap) {
  pieces.sort((a, b) => a.piece - b.piece);
  const packed = pieces.map((p) => ({ piece: p.piece, gz: gzipSync(p.data, { level: 9 }) }));
  const before = pieces.reduce((n, p) => n + p.data.length, 0);
  const after = packed.reduce((n, p) => n + p.gz.length, 0);
  raw += before;
  small += after;
  console.log(`  ${map}  ${pieces.length} 枚  ${(before / 1048576).toFixed(2)} MB → ${(after / 1024).toFixed(0)} KB`);
  if (listOnly) continue;
  const dir = path.join(OUT, map);
  mkdirSync(dir, { recursive: true });
  for (const p of packed) writeFileSync(path.join(dir, `${map}_${p.piece}.mcstructure.gz`), p.gz);
  // **戻すときに要る覚え書き**（`19-map-store.md` 8 章）
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(
      {
        name: map,
        namespace: NS,
        pieces: packed.length,
        // **区画の数から割り方が分かる**（16 枚なら 4 × 4）
        grid: Math.round(Math.sqrt(packed.length)),
        savedAt: new Date().toISOString(),
        world: nameOf(world),
        note: "戻し方は worlds/pve-v3/docs/spec/19-map-store.md 8 章",
      },
      null,
      2
    )}\n`
  );
}

if (byMap.size === 0) {
  console.log("そのマップは db に無い");
} else if (listOnly) {
  console.log(`\n${byMap.size} マップぶんある（--list なので書き出していない）`);
} else {
  console.log(
    `\n${byMap.size} マップを控えた → ${path.relative(process.cwd(), OUT)}` +
      `  （${(raw / 1048576).toFixed(1)} MB → ${(small / 1024).toFixed(0)} KB）`
  );
}
