/**
 * 中央島を画像と構造物に書き出す。
 *
 * **82x82 は構造物ブロックの上限 64 を超える**ので、4つに分割する。
 * 分割は書き出しのときだけで、設計も確認する画像も1つのまま。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { encodePng } from "./png.mjs";
import { renderIso, renderTop, renderPlan } from "./render.mjs";
import { splitToStructures, checkPalette } from "./mcstructure.mjs";
import { overhang, report, find } from "./check.mjs";
import { buildMid, levels } from "./designs/mid.mjs";
import { cropTo81, CENTER_IN } from "./crop.mjs";
import { STRUCT_DIRS } from "./structdirs.mjs";
import { publish } from "./publish.mjs";
import { origin, GROUND, CENTER_X, CENTER_Z } from "./placement.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });
const save = (n, cv) => {
  writeFileSync(join(out, n), encodePng(cv.w, cv.h, cv.px));
  console.log(`  ${n}  ${cv.w}x${cv.h}`);
};

checkPalette();
// **81 マス幅に切り詰める。** 中心を列 40（世界 1000）に合わせるため
const v = cropTo81(buildMid());
console.log(`中央島: ${v.sx} x ${v.sy} x ${v.sz}  ${v.count()} ブロック\n`);

save("mid-iso.png", renderIso(v, { scale: 4, tilt: 0.5 }));
save("mid-low.png", renderIso(v, { scale: 4, tilt: 0.26 }));
save("mid-top.png", renderTop(v, { scale: 4 }));
const romaji = { 地面: "ground", 城壁の上: "wall", 隅櫓: "tower", 天守: "keep" };
for (const [name, y] of Object.entries(levels())) {
  save(`mid-plan-${romaji[name] ?? name}.png`, renderPlan(v, y, { scale: 4 }));
}

// ---------------------------------------------------------------- 検査
console.log("\n=== 検査 ===");
const G = 34;
// 島の縁と、軒・梁は「張り出すのが正しい」ので判定から外す
const bad = overhang(v, 2, ["dark_oak_planks"]).filter(([x, y]) => y > G + 1);
console.log(`地上で支え無し: ${bad.length} 個`);
const by = {};
for (const [x, y, z, id] of bad) by[id] = (by[id] || 0) + 1;
for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${k}: ${n}`);
}
const spot = find(v, "diamond_block")[0];
if (spot) {
  report(v, [spot[0], spot[1] + 1, spot[2]], {
    ダイヤ: "diamond_block", エメラルド: "emerald_block",
  });
}

// ---------------------------------------------------------------- 構造物
console.log("\n=== 構造物（4分割）===");
// **継ぎ目は 27。** 門(38..44)・天守(28..54)・4つの櫓(6..20 / 62..76) を
// どれも跨がない唯一の帯。中央(41)で割ると門が真っ二つになり、
// 置く位置を1マス間違えるだけで門がずれて見える
const parts = splitToStructures(v, "mid", 64, 27);
const dirs = STRUCT_DIRS(here);

// **版つきの名前で配る**（publish.mjs 参照）
const published = publish(here, dirs, parts.map((p) => ({ base: p.name, buffer: p.buffer })), true);
const byBase = Object.fromEntries(published.map((r) => [r.base, r]));

for (const p of parts) {
  const r = byBase[p.name];
  console.log(`  ${r.name.padEnd(12)} 位置(${p.ox},${p.oz})  ${p.size.join("x")}  ${p.buffer.length} バイト  ` +
    (r.changed ? `版${r.version}へ更新${r.removed ? `（旧 ${r.removed} 削除）` : ""}` : `版${r.version}のまま`));
}
for (const d of dirs) console.log(`  → ${d}`);

// **座標は placement.mjs から計算する。** 手で足し算しない
const M = CENTER_IN, GROUND_IN = 34;   // 設計内での中心と地面（81幅なので 40）
const [oX, oY, oZ] = origin(CENTER_X, CENTER_Z, M, M, GROUND_IN);

console.log("\nゲーム内で（そのまま打てる）:");
for (const p of parts) {
  console.log(`  /structure load corewars:${byBase[p.name].name} ${oX + p.ox} ${oY} ${oZ + p.oz}`);
}
console.log(`  （地面の高さ ${GROUND} / 中心 ${CENTER_X},${CENTER_Z}）`);
