/**
 * 中央の島の**地面より下だけ**を構造物にする。
 *
 * ## なぜ要るか
 *
 * 回転コピーで 1/4 を配るとき、切り出す範囲の下端より下は手つかずになる。
 * 島の裏側（鍾乳石や絞り込み）はノイズで作っていて**四方対称ではない**ので、
 * 上だけ揃えても下が食い違う。下だけを別に配って揃える。
 *
 * ## 上端の切り方が肝
 *
 * `/structure load` は**構造物の air もそのまま書き込む**。
 * 上端を高く取りすぎると、その高さにある建築物を air で消してしまう。
 * **だから上端は「配る範囲の1つ下」で厳密に切る。**
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Voxels } from "./voxel.mjs";
import { cropTo81, CENTER_IN } from "./crop.mjs";
import { buildMid } from "./designs/mid.mjs";
import { toMcStructure, splitToStructures } from "./mcstructure.mjs";
import { STRUCT_DIRS } from "./structdirs.mjs";
import { publish } from "./publish.mjs";
import { origin, GROUND, CENTER_X, CENTER_Z } from "./placement.mjs";
import { encodePng } from "./png.mjs";
import { renderIso } from "./render.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const M = CENTER_IN, GROUND_IN = 34;   // 設計内での中心と地面（81幅なので 40）

// **どこまでを「下」とするか。** 世界座標で指定する。
// 既定 -11 は「手で保存した範囲が -10 から始まっている」前提。
// 範囲が -11 から始まっていたなら `MC_UNDER_TOP=-12` で切り替える
const TOP_WORLD = process.env.MC_UNDER_TOP !== undefined
  ? Number(process.env.MC_UNDER_TOP)
  : -11;

// **81 マス幅に切り詰める。** 中心を列 40（世界 1000）に合わせるため
const v = cropTo81(buildMid());

// 世界座標 → 設計内の高さ
const toInner = (worldY) => worldY - GROUND + GROUND_IN;
const yTop = toInner(TOP_WORLD);       // 含む
const yBottom = 0;

if (yTop < yBottom) throw new Error(`上端 ${TOP_WORLD} が島の底より下`);

console.log(`地面 y=${GROUND} / 島は世界 y=${GROUND - GROUND_IN}..${GROUND} にある`);
console.log(`切り出す範囲: 世界 y=${GROUND - GROUND_IN}..${TOP_WORLD}（設計内 ${yBottom}..${yTop} / 高さ ${yTop - yBottom + 1}）`);

// 下だけを別の器へ写す
const h = yTop - yBottom + 1;
const u = new Voxels(v.sx, h, v.sz);
let blocks = 0;
for (let y = 0; y < h; y++)
  for (let z = 0; z < v.sz; z++)
    for (let x = 0; x < v.sx; x++) {
      const b = v.get(x, yBottom + y, z);
      u.set(x, y, z, b);
      if (b && b !== "air") blocks++;
    }
console.log(`  実ブロック ${blocks}`);

// ---------------------------------------------------------- 四方対称にする
// **上でやった回転コピーと同じ変換を、裏側にもかける。**
// 島の裏はノイズで作っていて元は非対称。上だけ回転コピーすると、
// 切り出しの下端（世界 -10 / -11 の境目）で形が食い違う。
//
// 軸は**列 41（世界 1000）**。実測でこの軸の対称性が最も高かった。
// 時計回り 90 度: (x,z) → (82-z, x)
// **軸は列 40（世界 1000）。** 81 幅なので、これで過不足なく閉じる。
// 90度回転（時計回り）: (x,z) → (80-z, x)
const AXIS = 1000;
const K = 80;
const SRC = CENTER_IN;               // 南東の 1/4 の始まり（世界 1000 = 内部 40）
const rot = [
  (x, z) => [x, z],                  //   0度（そのまま）
  (x, z) => [K - z, x],              //  90度 → 南西
  (x, z) => [K - x, K - z],          // 180度 → 北西
  (x, z) => [z, K - x],              // 270度 → 北東
];
console.log(`  回転の軸: ${AXIS}`);
// **元を先に退避する。** 同じ器を読みながら書くと、
// 軸の列(x=41)と行(z=41)が読む前に上書きされて壊れる
const src = new Map();
for (let y = 0; y < h; y++)
  for (let sz = SRC; sz <= 80; sz++)
    for (let sx = SRC; sx <= 80; sx++)
      src.set(`${sx},${y},${sz}`, u.get(sx, y, sz));

let written = 0;
for (let y = 0; y < h; y++)
  for (let sz = SRC; sz <= 80; sz++)
    for (let sx = SRC; sx <= 80; sx++) {
      const b = src.get(`${sx},${y},${sz}`);
      for (const f of rot) {
        const [dx, dz] = f(sx, sz);
        if (dx < 0 || dz < 0 || dx > 80 || dz > 80) continue;   // 81幅なら余りは出ない
        u.set(dx, y, dz, b);
        written++;
      }
    }
console.log(`  四方対称にした（南東の1/4を4方向へ / ${written} マス書き換え）`);
console.log(`  余りの列なし（81幅なので全域が対称）`);

// 目で見て確かめる
const out = join(here, "out");
mkdirSync(out, { recursive: true });
const iso = renderIso(u, { scale: 4, height: 0.9, tilt: 0.5 });
writeFileSync(join(out, "underside-iso.png"), encodePng(iso.w, iso.h, iso.px));
console.log(`  out/underside-iso.png  ${iso.w}x${iso.h}`);

// **継ぎ目は中央の島と同じ 27。** 打ち込む数字を揃えて、間違いを減らす
// **軸ごとに別の名前にする。** 混ざると原因の分からない1マスずれになる
const tag = "under";
const parts = splitToStructures(u, tag, 64, 27);
const dirs = STRUCT_DIRS(here);
const published = publish(here, dirs, parts.map((p) => ({ base: p.name, buffer: p.buffer })), true);
const byBase = Object.fromEntries(published.map((r) => [r.base, r]));

console.log("\n=== 構造物（4分割）===");
for (const p of parts) {
  const r = byBase[p.name];
  console.log(`  ${r.name.padEnd(12)} 位置(${p.ox},${p.oz})  ${p.size.join("x")}  ${p.buffer.length} バイト  ` +
    (r.changed ? `版${r.version}へ更新${r.removed ? `（旧 ${r.removed} 削除）` : ""}` : `版${r.version}のまま`));
}
for (const d of dirs) console.log(`  → ${d}`);

// 置く高さは「島の底」。上端ではない
const [oX, , oZ] = origin(CENTER_X, CENTER_Z, M, M, GROUND_IN);
const oY = GROUND - GROUND_IN;

console.log("\nゲーム内で（そのまま打てる）:");
for (const p of parts) {
  console.log(`  /structure load corewars:${byBase[p.name].name} ${oX + p.ox} ${oY} ${oZ + p.oz}`);
}
console.log(`  （世界 y=${oY}..${TOP_WORLD} だけを書き換える。${TOP_WORLD + 1} 以上には触れない）`);
