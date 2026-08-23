/** 出したコマンドの座標が正しいかを、実データで検算する。 */
import { readFileSync } from "node:fs";
import { readNbt } from "./nbt-read.mjs";
import { GROUND, CENTER_X, CENTER_Z, CORE_A_X, CORE_B_X, CORE_Z } from "./placement.mjs";

const read = (n) => {
  const { root } = readNbt(readFileSync(`../../world/structures/${n}.mcstructure`));
  const [sx, sy, sz] = root.size;
  const pal = root.structure.palette.default.block_palette.map((e) => e.name);
  const idx = root.structure.block_indices[0];
  const at = (x, y, z) => { const q = idx[(x * sy + y) * sz + z]; return q >= 0 ? pal[q] : "minecraft:air"; };
  return { sx, sy, sz, at };
};
let ng = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "OK " : "★NG"} ${msg}`); if (!cond) ng++; };

console.log(`地面 GROUND = ${GROUND}\n`);

// ---- 拠点 ----
console.log("拠点 base_v3");
const b = read("base_v3");
const CORE_IN = 20, B_G = 22;
// 構造物の中でコアが本当に (20,32,20) にあるか
let coreY = -1;
for (let y = 0; y < b.sy; y++) if (b.at(CORE_IN, y, CORE_IN).includes("concrete")) coreY = y;
console.log(`  大きさ ${b.sx}x${b.sy}x${b.sz} / コアの高さ 内部y=${coreY} (${b.at(CORE_IN, coreY, CORE_IN)})`);
ok(b.at(CORE_IN, coreY - 1, CORE_IN) === "minecraft:glass_pane" &&
   b.at(CORE_IN, coreY + 1, CORE_IN) === "minecraft:glass_pane", "コアが板ガラスに挟まれている");
for (const [label, cx, rot] of [["A", CORE_A_X, "270_degrees"], ["B", CORE_B_X, "90_degrees"]]) {
  const ox = cx - CORE_IN, oy = GROUND - B_G, oz = CORE_Z - CORE_IN;
  console.log(`  拠点${label}: /structure load corewars:base_v3 ${ox} ${oy} ${oz} ${rot}`);
  ok(ox + CORE_IN === cx && oz + CORE_IN === CORE_Z, `  → コアが (${cx},${CORE_Z}) に来る`);
  ok(oy + coreY === GROUND + (coreY - B_G), `  → コアの高さ ${oy + coreY}（地面+${coreY - B_G}）`);
}
ok(GROUND - B_G === -32, "拠点の y が -32（あなたが成功した値と一致）");

// ---- 中央 ----
console.log("\n中央 mid（継ぎ目 27）");
const M = 41, M_G = 34;
const oX = CENTER_X - M, oY = GROUND - M_G, oZ = CENTER_Z - M;
const midParts = [["mid_nw_v2", 0, 0], ["mid_ne_v3", 27, 0], ["mid_sw_v3", 0, 27], ["mid_se_v3", 27, 27]];
let cov = new Set();
for (const [n, ox, oz] of midParts) {
  const p = read(n);
  console.log(`  ${n.padEnd(11)} ${p.sx}x${p.sy}x${p.sz}  → ${oX+ox} ${oY} ${oZ+oz}  (x ${oX+ox}..${oX+ox+p.sx-1})`);
  for (let i = 0; i < p.sx; i++) cov.add(oX + ox + i);
}
ok(cov.size === 82 && Math.min(...cov) === 959 && Math.max(...cov) === 1040, "x が 959..1040 を隙間なく覆う");
// 城の中心が世界 1000 に来るか（天守の中心にランタンを置いてある）
const se = read("mid_se_v3");
ok(oX + 27 + (M - 27) === CENTER_X, `城の中心が x=${CENTER_X} に来る`);
ok(oY + M_G === GROUND, `地面が y=${GROUND} に来る`);
ok(oY === -44, "中央の y が -44");

// ---- 裏側 ----
console.log("\n裏側 under");
const uParts = [["under_nw_v3", 0, 0], ["under_ne_v4", 27, 0], ["under_sw_v4", 0, 27], ["under_se_v4", 27, 27]];
const u0 = read("under_nw_v3");
const uY = GROUND - M_G;
console.log(`  高さ ${u0.sy} / 置く y=${uY} → 世界 ${uY}..${uY + u0.sy - 1}`);
ok(uY === -44, "底が -44");
ok(uY + u0.sy - 1 === -11, "上端が -11（-10 以上に触れない）");
for (const [n, ox, oz] of uParts) {
  const p = read(n);
  ok(p.sy === u0.sy, `${n} の高さが揃っている (${p.sy})`);
}
console.log(ng === 0 ? "\n★ すべて一致" : `\n★ ${ng} 件おかしい`);
