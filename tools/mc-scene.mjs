/**
 * 地形と建物を**1 つの場面（scene.json）にまとめる。**
 *
 *     node tools/mc-scene.mjs <出来上がった js の場所> <種> <出す先.json>
 *
 * ## 何のためか
 *
 * **平面図では、色合いと起伏の違和感が分からない。**
 * 3 次元に起こして**写真を撮る**ための下ごしらえ（撮るのは `tools/mc-render.py`）。
 *
 * ```
 * terrain.ts ─tsc─▶ terrain.js ─┐
 * fortress.ts ─tsc─▶ fortress.js ┴─ここ─▶ scene.json ─mc-render.py─▶ 写真
 * ```
 *
 * ## 場面の形
 *
 * **柱の一番上だけ**を持つ（高さと、そこに見えるブロック）。
 * 中身は見えないので要らない——**写真で見るのは表面だけ。**
 */

import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const seed = Number(process.argv[3] ?? 1);
const out = process.argv[4] ?? "scene.json";

const url = (f) => pathToFileURL(path.resolve(dir, f)).href;
const T = await import(url("terrain.js"));
const { fortress } = await import(url("models/fortress.js"));

const A = T.AREA;
const shape = T.shapeOf(seed);
const w = A.x2 - A.x1 + 1;
const l = A.z2 - A.z1 + 1;

const H = new Int16Array(w * l).fill(-999); // -999 = 何も無い
const B = new Int16Array(w * l).fill(-1);
const palette = [];
const idOf = new Map();
const id = (name) => {
  let v = idOf.get(name);
  if (v === undefined) {
    v = palette.length;
    palette.push(name);
    idOf.set(name, v);
  }
  return v;
};

// ---- 地形
for (let z = A.z1; z <= A.z2; z++) {
  for (let x = A.x1; x <= A.x2; x++) {
    if (T.inField(x, z)) continue;
    const h = T.heightAt(x, z, shape);
    const steep = Math.max(
      Math.abs(h - T.heightAt(x + 2, z, shape)),
      Math.abs(h - T.heightAt(x, z + 2, shape))
    );
    const i = (z - A.z1) * w + (x - A.x1);
    H[i] = h;
    B[i] = id(T.surfaceAt(x, z, h, shape, steep));
    // **橋は上に乗る**（写真で見えないと、谷を渡れているか分からない）
    const br = T.bridgeAt(x, z, shape);
    if (br !== undefined && br.y > h) {
      H[i] = br.rail ? br.y + 1 : br.y;
      B[i] = id(T.bridgeBlock(x, z, shape, br.rail ? "rail" : "deck"));
    }
  }
}

// ---- 要塞（**戦場の箱にそのまま入る大きさ**）。柱の一番上だけ拾う
const FIELD = T.FIELD;
const [mw, mh, ml] = fortress.size;
const ox = FIELD.x1 + Math.floor((FIELD.x2 - FIELD.x1 + 1 - mw) / 2);
const oz = FIELD.z1 + Math.floor((FIELD.z2 - FIELD.z1 + 1 - ml) / 2);
const oy = FIELD.y1;
for (const [bx, by, bz, pi] of fortress.blocks) {
  const x = ox + bx;
  const y = oy + by;
  const z = oz + bz;
  if (x < A.x1 || x > A.x2 || z < A.z1 || z > A.z2) continue;
  const i = (z - A.z1) * w + (x - A.x1);
  if (y <= H[i]) continue;
  H[i] = y;
  B[i] = id(fortress.palette[pi]);
}

writeFileSync(
  out,
  JSON.stringify({
    x0: A.x1,
    z0: A.z1,
    w,
    l,
    field: FIELD,
    palette,
    h: Array.from(H),
    b: Array.from(B),
  })
);
console.log(`場面: ${w} x ${l}  ブロック ${palette.length} 種  ->  ${out}`);
