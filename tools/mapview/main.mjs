/**
 * 設計を画像に描き出す。
 *
 * **ゲームに入れる前に見るための道具。**
 * 見ないまま作ると変なものができる（docs/spec/08-map-authoring.md）。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { encodePng } from "./png.mjs";
import { toMcStructure, checkPalette } from "./mcstructure.mjs";
import { STRUCT_DIRS } from "./structdirs.mjs";
import { publish } from "./publish.mjs";
import { origin, GROUND, CORE_A_X, CORE_B_X, CORE_Z } from "./placement.mjs";
import { renderIso, renderTop, renderSlice, renderPlan } from "./render.mjs";
import { buildBase, SIZE, levels } from "./designs/base.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const save = (name, cv) => {
  const p = join(out, name);
  writeFileSync(p, encodePng(cv.w, cv.h, cv.px));
  console.log(`  ${name}  ${cv.w}x${cv.h}`);
};

const v = buildBase();
console.log(`拠点島: ${v.sx}x${v.sy}x${v.sz}  ブロック数 ${v.count()}`);
// **2つの角度で見る。** 高い角度は配置、低い角度は立面と軒の下
save("base-iso.png", renderIso(v, { scale: 7, tilt: 0.5 }));
save("base-low.png", renderIso(v, { scale: 7, tilt: 0.26 }));
save("base-side.png", renderIso(v, { scale: 7, tilt: 0.14 }));
save("base-top.png", renderTop(v, { scale: 7 }));
save("base-slice.png", renderSlice(v, Math.round((SIZE - 1) / 2), { scale: 7 }));

// **各階の平面図。** 戦闘空間が確保できているかはこれで見る
const romaji = { "1階": "f1", "2階（屋上）": "f2" };
for (const [name, y] of Object.entries(levels())) {
  save(`base-plan-${romaji[name] ?? name}.png`, renderPlan(v, y, { scale: 6 }));
}


// ---------------------------------------------------------------- 構造物の書き出し
//
// **画像で確認したものを、そのままゲームへ持ち込む。**
// 別々に作ると、見たものと置かれるものがズレる。

checkPalette();
const { buffer, palette } = toMcStructure(v);
console.log(`
構造物: ${v.sx} x ${v.sy} x ${v.sz} / ${buffer.length} バイト / ブロック ${palette.length} 種`);

// **版つきの名前で配る。**
// Minecraft は構造物を名前でキャッシュするので、
// 同じ名前で差し替えても古い中身が読まれる（publish.mjs 参照）
const dirs = STRUCT_DIRS(here);
const [r] = publish(here, dirs, [{ base: "base", buffer }]);

console.log(r.changed
  ? `  中身が変わった → 版 ${r.version} へ${r.removed ? `（旧 ${r.removed} は削除）` : ""}`
  : `  中身は同じ → 版 ${r.version} のまま`);
for (const d of dirs) console.log(`  → ${d}`);

// **座標は placement.mjs から計算する。** 手で足し算しない
// 拠点は正面(+Z)が中央を向くよう設計してある。
// 拠点A は中央が +X 方向なので 270度、拠点B は -X 方向なので 90度回す
const CORE_IN = 20;        // 構造物の中でのコアの水平位置
const GROUND_IN = 22;      // 構造物の中での地面の高さ

console.log("\nゲーム内で（そのまま打てる）:");
for (const [label, cx, rot] of [["拠点A", CORE_A_X, "270_degrees"], ["拠点B", CORE_B_X, "90_degrees"]]) {
  const [x, y, z] = origin(cx, CORE_Z, CORE_IN, CORE_IN, GROUND_IN);
  console.log(`  ${label}  /structure load corewars:${r.name} ${x} ${y} ${z} ${rot}`);
}
console.log(`  （地面の高さ ${GROUND} / コアは A(${CORE_A_X},${CORE_Z}) B(${CORE_B_X},${CORE_Z})）`);
