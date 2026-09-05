/**
 * 岩山の窪地——**決まった場所**（湧く所・壇とポータル・その間の道）。
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 * **座標は 20 マップ共通**なので、ここを写せば別のマップでも同じ形になる。
 *
 * **地形（`map-basin.ts`）とは分けてある**——地形を作り直しても、
 * **飛んでくる場所と行き先は動かさない。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, PORTAL_Z, SEED, SPAWN_Z } from "./map-basin-const.js";
import { inRiverAt, isLand, topOf } from "./map-basin.js";
import { noise } from "./noise.js";

/** 中心からの隔たり */
function dist(dx: number, dz: number): number {
  return Math.hypot(dx, dz);
}

/**
 * 平らにならす。
 *
 * > ### 裏側を出っ張らせない（2026-09-05）
 * >
 * > 前は**底から柱を立てて**いた。浮島では、
 * > **湧く所と壇の下だけが、島の裏から棒のように突き出していた。**
 * >
 * > **足りないぶんだけ足し、余ったぶんだけ削る。**
 * > **島の厚みには触らない。**
 */
export function pave(ops: BuildOp[], tops: Map<string, number>, x: number, z: number, y: number): void {
  const top = topOf(x, z);
  // **低ければ積む。** 積むのは差のぶんだけ
  if (top < y - 1) ops.push(fill(x, top, z, x, y - 1, z, "stone"));
  // **高ければ削る**（上を空けるついでに落ちる）
  ops.push(fill(x, y + 1, z, x, Math.max(y + 6, top + 1), z, "air"));
  // **敷石も 1 マスごとに引く**（0-7）
  const v = noise(x, z, 1, SEED + 21);
  ops.push(
    set(
      x,
      y,
      z,
      v > 0.72 ? "mossy_stone_bricks" : v > 0.46 ? "stone_bricks" : v > 0.2 ? "cracked_stone_bricks" : "stone"
    )
  );
  tops.set(`${x},${z}`, y);
}

export function flatten(
  ops: BuildOp[],
  tops: Map<string, number>,
  cx: number,
  cz: number,
  radius: number,
  y: number
): void {
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      if (dist(x - cx, z - cz) > radius) continue;
      if (!isLand(x, z)) continue;
      pave(ops, tops, x, z, y);
    }
  }
}

/** 奥の壇と、そこへ上がる石段 */
export function dais(ops: BuildOp[], tops: Map<string, number>): void {
  // ---- **石畳の広場。高さは y ＝ 0**（`spec/14-map-build.md` 0-1）
  //
  // > ### ポータルの地面は y ＝ 0 で固定
  // >
  // > 前は高さ 4 の塚に載せていた。**マップが変わっても同じ高さに立っていないと、
  // > 進行の仕組みが位置を決め打ちできない。**
  const R = 10.5;
  for (let x = -12; x <= 12; x++) {
    for (let z = PORTAL_Z - 12; z <= PORTAL_Z + 12; z++) {
      if (dist(x, z - PORTAL_Z) > R) continue;
      // **島の外には敷かない**（0-5。足元が無いと浮く）
      if (!isLand(x, z)) continue;
      pave(ops, tops, x, z, GROUND);
    }
  }

  // ---- 広場の縁の柱
  for (const sx of [-7, 7]) {
    for (const dz of [-4, 0, 4]) {
      const z = PORTAL_Z + dz;
      const base = tops.get(`${sx},${z}`);
      if (base === undefined) continue;
      ops.push(fill(sx, base + 1, z, sx, base + 4, z, "cobblestone"));
      ops.push(set(sx, base + 5, z, "lantern"));
    }
  }

  // ---- ポータル。**足元が y ＝ 0、門は y ＝ 1 から**
  for (const dx of [-2, 2]) ops.push(fill(dx, GROUND + 1, PORTAL_Z, dx, GROUND + 5, PORTAL_Z, "stone_bricks"));
  ops.push(fill(-2, GROUND + 6, PORTAL_Z, 2, GROUND + 6, PORTAL_Z, "stone_bricks"));
  // **門は消えた状態で置く**（`13-flow.md` 2-3）。灯すのはクリアしたとき
  ops.push(fill(-1, GROUND + 1, PORTAL_Z, 1, GROUND + 5, PORTAL_Z, "pve_v3:portal"));

  // ---- **門の裏だけを埋める**（`spec/14-map-build.md` 0-3）
  //
  // > **必要なのは「門の裏へ抜けられないこと」だけ。**
  // > 島の縁から先はもともと奈落なので、**壁で仕切る意味がない。**
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = 1; dy <= 7; dy++) {
      const v = noise(dx * 7, dy * 5, 1, SEED + 44);
      const worn = dy >= 6 && v > 0.45;
      const block =
        Math.abs(dx) === 3 || dy === 7
          ? "mossy_stone_brick_wall"
          : worn
            ? "cracked_stone_bricks"
            : v > 0.66
              ? "chiseled_stone_bricks"
              : v > 0.33
                ? "stone_bricks"
                : "mossy_stone_bricks";
      ops.push(set(dx, GROUND + dy, PORTAL_Z + 1, block));
    }
  }
  ops.push(fill(-3, GROUND + 1, PORTAL_Z + 1, 3, GROUND + 1, PORTAL_Z + 1, "stone_bricks"));
  for (const dx of [-4, 4]) {
    ops.push(fill(dx, GROUND + 1, PORTAL_Z + 1, dx, GROUND + 3, PORTAL_Z + 1, "cobblestone"));
    ops.push(set(dx, GROUND + 4, PORTAL_Z + 1, "lantern"));
  }
}

/** 手前の湧く所 */
export function spawnPad(ops: BuildOp[], tops: Map<string, number>): void {
  flatten(ops, tops, 0, SPAWN_Z, 7, GROUND);
  // ---- **飛んでくる 1 マス**（`spec/14-map-build.md` 0-2）
  //
  // > **足場は「たまたま地面があった」では駄目。**
  // > **下は不透過、上は 3 マス空ける。** ここには何も置かない。
  ops.push(set(0, GROUND, SPAWN_Z, "stone_bricks"));
  ops.push(fill(0, GROUND + 1, SPAWN_Z, 0, GROUND + 3, SPAWN_Z, "air"));
  // 焚き火は**真上を外して**置く
  ops.push(set(0, GROUND + 1, SPAWN_Z - 2, "campfire"));
  for (const sx of [-5, 5]) {
    ops.push(fill(sx, GROUND + 1, SPAWN_Z, sx, GROUND + 3, SPAWN_Z, "cobblestone"));
    ops.push(set(sx, GROUND + 4, SPAWN_Z, "lantern"));
  }
}

/** 湧く所から壇までの道 */
export function path(ops: BuildOp[], tops: Map<string, number>): void {
  for (let z = SPAWN_Z + 7; z <= PORTAL_Z - 14; z++) {
    const bend = Math.round(Math.sin((z + 40) / 26) * 5);
    for (let dx = -2; dx <= 2; dx++) {
      const x = bend + dx;
      const h = topOf(x, z);
      if (inRiverAt(x, z)) continue;
      ops.push(set(x, h, z, Math.abs(dx) === 2 ? "coarse_dirt" : "gravel"));
    }
  }
}
