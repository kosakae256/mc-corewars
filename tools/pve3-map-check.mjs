/**
 * 戦場が**決まりを守っているか**を、組む前に確かめる。
 *
 *     node tools/pve3-map-check.mjs <id>
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 *
 * ## なぜ道具にしたのか
 *
 * > ### 目で見て気づけない
 * >
 * > **範囲の食み出し・浮いた岩・登れる外壁・遮られた視線**は、
 * > **中に立っていても分からない。** 数えないと出てこない。
 *
 * `tests/` に置けないのは、`scripts/` が `./build.js` の形で読み合っていて、
 * **Node が `.ts` のまま辿れない**ため。**esbuild で束ねてから読む。**
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACK = path.resolve("worlds/pve-v3/packs/pve_v3");
const HALF = 50;
const GROUND = 0;
const SPAWN_Z = -40;
const PORTAL_Z = 40;

// ---- 束ねて読む
const dir = mkdtempSync(path.join(tmpdir(), "mapcheck-"));
const out = path.join(dir, "map.mjs");
execFileSync(
  process.execPath,
  [
    path.join(PACK, "node_modules", "esbuild", "bin", "esbuild"),
    path.join(PACK, "scripts/core/maps.ts"),
    "--bundle",
    "--format=esm",
    `--outfile=${out}`,
  ],
  { cwd: PACK, stdio: "pipe" }
);
const { MAPS } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

// **どのマップを見るか。** 書かなければ番号順の 1 枚目
const id = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "basin";
const def = MAPS[id];
if (def === undefined) {
  console.error(`知らないマップ: ${id}
あるのは ${Object.keys(MAPS).join(" / ")}`);
  process.exit(1);
}
console.log(`${id}（${def.name}）`);
const ops = def.ops();

/**
 * **満たさないことにした決まり**（`14-map-build.md` 0-10）。
 *
 * **企画に書いてあるものだけ**（`core/maps.ts` の `waive`）。
 */
const waived = new Set(def.waive ?? []);
if (waived.size > 0) console.log(`  免除: ${[...waived].join(" / ")}`);
let bad = 0;
/** @param rule `14-map-build.md` の番号。**免除していれば落とさない** */
const ng = (m, rule) => {
  if (rule !== undefined && waived.has(rule)) {
    console.log("  免除", m);
    return;
  }
  console.log("  NG", m);
  bad++;
};

// ---- 0-0. **ブロックの名前が実在するか**（2026-09-06 追加）
//
// > ### 名前を間違えると、組んでいる途中で止まる
// >
// > ```
// > block type terracotta not found
// > ```
// >
// > **Bedrock の ID は Java と違う**——`terracotta` は `hardened_clay`、
// > `grass` は `grass_block`、`chain` は `iron_chain`。
// > **`@minecraft/vanilla-data` の表と突き合わせる。**
const { MinecraftBlockTypes } = await import(
  pathToFileURL(path.join(PACK, "node_modules/@minecraft/vanilla-data/lib/index.js")).href
);
const known = new Set(Object.values(MinecraftBlockTypes).map((v) => String(v).replace(/^minecraft:/, "")));
{
  const unknown = new Set();
  for (const op of ops) {
    // **自前のブロック**（`pve_v3:` など）は表に無い
    if (op.block === "air" || op.block.includes(":") || known.has(op.block)) continue;
    unknown.add(op.block);
  }
  console.log(`0-0 実在しないブロック名  ${unknown.size} 種`);
  if (unknown.size > 0) ng(`知らないブロック名: ${[...unknown].join(" / ")}`, "0-0");
}

// ---- 0-11. **落ちるブロックを使わない**（2026-09-06 追加）
//
// > ### 置いた先が空なら、その場で落ちる
// >
// > **飾りで縁や張り出しに置くと、組んだ端から崩れていく。**
const FALLING =
  /^(gravel|sand|red_sand|suspicious_sand|suspicious_gravel|[a-z_]*concrete_powder|[a-z_]*anvil|dragon_egg|scaffolding|pointed_dripstone)$/;
{
  const fall = new Set();
  for (const op of ops) if (FALLING.test(op.block)) fall.add(op.block);
  console.log(`0-11 落ちるブロック  ${fall.size} 種`);
  if (fall.size > 0) ng(`落ちるブロックを使っている: ${[...fall].join(" / ")}`, "0-11");
}

// ---- 置いたものを数え上げる
const key = (x, y, z) => `${x},${y},${z}`;
const solid = new Set();
const named = new Map();
for (const op of ops) {
  const air = op.block === "air";
  const pts = op.kind === "set" ? [op.at, op.at] : [op.from, op.to];
  const [x1, x2] = [pts[0].x, pts[1].x].sort((a, b) => a - b);
  const [y1, y2] = [pts[0].y, pts[1].y].sort((a, b) => a - b);
  const [z1, z2] = [pts[0].z, pts[1].z].sort((a, b) => a - b);
  if ((x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1) > 4000000) continue;
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        const k = key(x, y, z);
        if (air) {
          solid.delete(k);
          named.delete(k);
        } else {
          solid.add(k);
          named.set(k, op.block);
        }
      }
    }
  }
}

/** その柱に何か有るか */
const column = new Map();
for (const k of solid) {
  const [x, y, z] = k.split(",").map(Number);
  const c = `${x},${z}`;
  const cur = column.get(c);
  if (cur === undefined) column.set(c, { lo: y, hi: y });
  else {
    cur.lo = Math.min(cur.lo, y);
    cur.hi = Math.max(cur.hi, y);
  }
}

// ---- 0-1. ±50 より外に置かない（空気は「消す」側なので除く）
let mx = 0;
let mz = 0;
for (const k of solid) {
  const [x, , z] = k.split(",").map(Number);
  mx = Math.max(mx, Math.abs(x));
  mz = Math.max(mz, Math.abs(z));
}
console.log(`0-1 置いた端  x ±${mx} / z ±${mz}  （上限 ${HALF}）`);
if (mx > HALF || mz > HALF) ng("±50 より外に置いている", "0-1");

// ---- 0-3. 湧く所からポータルが見える
//
// **帯の中を数えるのではなく、目の高さから portal へ線を引いて辿る。**
// 立つのは y ＝ GROUND+1、目はその 1.6 上。ポータルの真ん中は壇の上。
const eye = { x: 0.5, y: GROUND + 1 + 1.6, z: SPAWN_Z + 0.5 };
const aim = { x: 0.5, y: GROUND + 4 + 3, z: PORTAL_Z + 0.5 };
const steps = 900;
const hits = [];
for (let i = 1; i < steps; i++) {
  const t = i / steps;
  const x = Math.floor(eye.x + (aim.x - eye.x) * t);
  const y = Math.floor(eye.y + (aim.y - eye.y) * t);
  const z = Math.floor(eye.z + (aim.z - eye.z) * t);
  // ポータルの手前 6 マス（壇の段）は、上がる所なので除く
  if (z > PORTAL_Z - 7) break;
  const k = key(x, y, z);
  if (solid.has(k) && !hits.includes(k)) hits.push(k);
}
console.log(`0-3 湧く所からポータルまでの線を遮るブロック  ${hits.length} 個`);
for (const k of hits.slice(0, 8)) console.log(`      (${k})  ${named.get(k)}`);
if (hits.length > 0) ng("湧いた所からポータルが見えない", "0-3");

// ---- 0-4. 外へ出られない
//
// **崖**なら 2 マス以上の段差、**浮島**なら縁の外が空。どちらかで閉じていればよい。
let openDirs = 0;
let worstDeg = 0;
for (let deg = 0; deg < 360; deg += 2) {
  const rad = (deg * Math.PI) / 180;
  let last = null;
  let jump = 0;
  let ended = false;
  for (let d = 20; d <= HALF; d++) {
    const x = Math.round(Math.cos(rad) * d);
    const z = Math.round(Math.sin(rad) * d);
    const c = column.get(`${x},${z}`);
    if (c === undefined) {
      ended = true; // **島が切れた＝奈落**
      break;
    }
    if (last !== null) jump = Math.max(jump, c.hi - last);
    last = c.hi;
  }
  if (!ended && jump < 2) {
    openDirs++;
    worstDeg = deg;
  }
}
console.log(`0-4 外へ出られる向き  ${openDirs} 方向`);
if (openDirs > 0) ng(`登れる／歩いて出られる向きがある（例 ${worstDeg}°）`, "0-4");

// ---- 0-8. 島の上は、どこでも登れる
//
// > ### 「段差 2 マスが 1 つでもあれば駄目」ではない
// >
// > **1 マスの柱は、歩いて回り込める。** 見るべきは
// > **湧く所から歩いて行けない面が、まとまって残っていないか。**
// >
// > **1 マスずつ上り下りできる**として塗り広げ、**届かない面**を数える。
const PASS = new Set(["short_grass", "moss_carpet", "lantern", "campfire", "torch"]);
const top = new Map();
for (const k of solid) {
  const [x, y, z] = k.split(",").map(Number);
  if (PASS.has(named.get(k))) continue; // 通り抜けられるものは床にしない
  const c = `${x},${z}`;
  const cur = top.get(c);
  if (cur === undefined || y > cur) top.set(c, y);
}
const start = `0,${SPAWN_Z}`;
const reached = new Set([start]);
const queue = [start];
while (queue.length > 0) {
  const c = queue.pop();
  const [x, z] = c.split(",").map(Number);
  const y = top.get(c);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const n = `${x + dx},${z + dz}`;
    const ny = top.get(n);
    if (ny === undefined || reached.has(n)) continue;
    if (Math.abs(ny - y) > 1) continue; // **1 マスまで**
    reached.add(n);
    queue.push(n);
  }
}
// 届かない面を、まとまりごとに数える。
// **門とその衝立の上は除く**——装飾なので、登れなくてよい
const missed = [...top.keys()].filter((c) => {
  if (reached.has(c)) return false;
  const [x, z] = c.split(",").map(Number);
  if (Math.abs(x) <= 6 && z >= PORTAL_Z - 1) return false;
  return true;
});
const seenC = new Set();
let worst = 0;
let worstAt = "";
for (const c of missed) {
  if (seenC.has(c)) continue;
  const grp = [c];
  seenC.add(c);
  const q = [c];
  while (q.length > 0) {
    const cur = q.pop();
    const [x, z] = cur.split(",").map(Number);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = `${x + dx},${z + dz}`;
      if (seenC.has(n) || reached.has(n) || !top.has(n)) continue;
      seenC.add(n);
      grp.push(n);
      q.push(n);
    }
  }
  if (grp.length > worst) {
    worst = grp.length;
    worstAt = grp[0];
  }
}
console.log(`0-8 湧く所から歩いて行けない面  ${missed.length} マス（いちばん大きいまとまり ${worst} マス @ ${worstAt}）`);
if (worst >= 4) ng("登れない面がまとまって残っている", "0-8");

// ---- 0-5. **ひと繋がりか**
//
// > ### 浮島では「下に何か有る」は使えない
// >
// > **島ごと浮いている。** 見るべきは**島から切り離された塊が無いか。**
// > 6 方向で繋がりを辿り、**いちばん大きな塊に入らないもの**を落とす。
const seen = new Set();
let best = 0;
const orphans = [];
for (const startK of solid) {
  if (seen.has(startK)) continue;
  const group = [];
  const queue = [startK];
  seen.add(startK);
  while (queue.length > 0) {
    const k = queue.pop();
    group.push(k);
    const [x, y, z] = k.split(",").map(Number);
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const n = key(x + dx, y + dy, z + dz);
      if (!solid.has(n) || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  orphans.push(group);
  best = Math.max(best, group.length);
}
const loose = orphans.filter((g) => g.length !== best).flat();
console.log(`0-5 塊の数 ${orphans.length}（いちばん大きいものが ${best} ブロック）／離れている ${loose.length} 個`);
for (const k of loose.slice(0, 10)) console.log(`      (${k})  ${named.get(k)}`);
if (loose.length > 0) ng("島から切り離された塊がある", "0-5");

console.log(bad === 0 ? "\n決まりを満たしている" : `\n**${bad} 件、決まりを満たしていない**`);
process.exit(bad === 0 ? 0 : 1);
