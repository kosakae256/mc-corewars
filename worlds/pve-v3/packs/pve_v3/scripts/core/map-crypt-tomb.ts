/**
 * 15. 地下墓所——**納骨廊・骨堂・崩れの間。**
 *
 * 間取りは `map-crypt-plan.ts`、材は `map-crypt-mat.ts`、造作は `map-crypt-fit.ts`。
 *
 * > ### **狭い道は、狭いなりに見せる**
 * >
 * > 納骨廊は**幅 5・高さ 5**。柱を立てる余地は無い。
 * > **壁を 2 段に彫って棺を納める**（ローマの `loculi`）——
 * > **壁そのものが意匠になる**ので、通り道は狭いままでよい。
 *
 * > ### **行き止まりにしない**
 * >
 * > 東西とも、**2 本の納骨廊を連絡廊で繋いで輪にしてある**
 * > （`map-crypt-plan.ts` の間取り）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND } from "./map-frame.js";
import { GALLERY, HYPO, floorAt, isOpen } from "./map-crypt-plan.js";
import { boneAt, soilAt, stoneAt } from "./map-crypt-mat.js";
import { cobweb, coffin, hang, niche, pick, stand } from "./map-crypt-fit.js";

/**
 * 廊下の両側の壁に、**棺を 2 段に納める。**
 *
 * `along` は廊下の長手。**2 マス目まで岩が残っている所だけ彫る**——
 * 抜けると隣の部屋へ穴が開く。
 */
function loculi(ops: BuildOp[], x1: number, x2: number, z1: number, z2: number, along: "x" | "z"): void {
  const lo = along === "x" ? x1 : z1;
  const hi = along === "x" ? x2 : z2;
  const sides = along === "x" ? [z1 - 1, z2 + 1] : [x1 - 1, x2 + 1];
  for (let t = lo; t <= hi; t += 2) {
    for (let i = 0; i < 2; i++) {
      const s = sides[i] as number;
      const d = i === 0 ? -1 : 1;
      const x = along === "x" ? t : s;
      const z = along === "x" ? s : t;
      if (isOpen(x, z)) continue;
      const bx = along === "x" ? x : x + d;
      const bz = along === "x" ? z + d : z;
      if (isOpen(bx, bz)) continue; // **裏が部屋。彫ると抜ける**
      const base = floorAt(along === "x" ? x : x - d, along === "x" ? z - d : z);
      niche(ops, x, base + 1, z, 2, 139);
      niche(ops, x, base + 3, z, 1, 149);
    }
  }
}

/** 廊下の灯り。**壁に接した空きマスへ置く**（浮かせない・0-5） */
function gallerySconces(ops: BuildOp[], x1: number, x2: number, z1: number, z2: number, along: "x" | "z"): void {
  const lo = along === "x" ? x1 : z1;
  const hi = along === "x" ? x2 : z2;
  const sides = along === "x" ? [z1, z2] : [x1, x2];
  let i = 0;
  for (let t = lo + 2; t <= hi - 2; t += 5, i++) {
    const s = sides[i % 2] as number;
    const x = along === "x" ? t : s;
    const z = along === "x" ? s : t;
    if (!isOpen(x, z)) continue;
    // **天井から吊る。** 壁付けだと、壁龕を彫った所で足場が消えて浮く（0-5）
    hang(ops, x, z, GALLERY, 1, pick(151, x, 3, z) < 0.5 ? "lantern" : "soul_lantern");
    if (i % 3 === 0) ops.push(set(x, GALLERY, z, "glowstone"));
  }
}

/** 納骨廊 1 本ぶん */
interface Hall {
  readonly x1: number;
  readonly x2: number;
  readonly z1: number;
  readonly z2: number;
  readonly along: "x" | "z";
}

const HALLS: readonly Hall[] = [
  { x1: -43, x2: -30, z1: -9, z2: -5, along: "x" },
  { x1: 30, x2: 43, z1: -9, z2: -5, along: "x" },
  { x1: -43, x2: -30, z1: 3, z2: 7, along: "x" },
  { x1: 30, x2: 43, z1: 3, z2: 7, along: "x" },
  { x1: -43, x2: -39, z1: -9, z2: 7, along: "z" },
  { x1: 39, x2: 43, z1: -9, z2: 7, along: "z" },
];

/**
 * 東西の納骨廊。**壁龕の棺と、床に置いた石棺。**
 *
 * **西の奥（`z` ＝ 3〜7）は水が溜まっている**——
 * **床が 1 段低い**ので、そこだけ膝まで浸かって歩く。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function galleryOps(ops: BuildOp[]): void {
  for (const h of HALLS) {
    loculi(ops, h.x1, h.x2, h.z1, h.z2, h.along);
    gallerySconces(ops, h.x1, h.x2, h.z1, h.z2, h.along);
  }
  flooded(ops);
  for (const [x, z] of [
    [-36, -7],
    [36, -7],
    [37, 5],
    [-41, -1],
    [41, 1],
  ]) {
    if (!isOpen(x, z)) continue;
    coffin(ops, x, floorAt(x, z) + 1, z, "z", 3, 157);
  }
}

/**
 * 水の納骨廊。**溜まった水と、水際の苔。**
 *
 * **深さ 1**——落ちても上がれるし、跨げる（0-8）。
 */
function flooded(ops: BuildOp[]): void {
  for (let x = -43; x <= -30; x++) {
    for (let z = 3; z <= 7; z++) {
      if (!isOpen(x, z) || floorAt(x, z) !== GROUND - 1) continue;
      // **水は真ん中の 3 列にまとめる**——1 マスごとに引くと胡麻塩に散る
      if (z >= 4 && z <= 6) ops.push(set(x, GROUND - 1, z, "water"));
      else if (pick(163, x, 1, z) < 0.45) ops.push(set(x, GROUND - 1, z, "mossy_cobblestone"));
    }
  }
  // ---- 水際の壁の苔。**低い所だけ濃くする**（0-7）
  for (let x = -43; x <= -30; x++) {
    for (const z of [2, 8]) {
      if (isOpen(x, z)) continue;
      if (pick(167, x, 0, z) > 0.4) continue;
      ops.push(set(x, GROUND - 1, z, "mossy_cobblestone"));
      ops.push(set(x, GROUND, z, pick(173, x, 0, z) < 0.5 ? "moss_block" : "mossy_stone_bricks"));
    }
  }
}

// ================================================================ 骨堂

/** 骨堂の範囲 */
const OSS = { x1: -22, x2: -12, z1: -38, z2: -31 } as const;

/**
 * 骨堂。**壁いっぱいに骨を積んである。**
 *
 * > ### **棚は壁際だけ**
 * >
 * > 部屋の真ん中に積むと、**戦う場所が無くなる。**
 * > **奥行き 1 の棚を両側の壁に付ける**だけにして、真ん中は空けておく。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function ossuaryOps(ops: BuildOp[]): void {
  boneWalls(ops);
  boneShelves(ops);
  for (const [x, z] of [
    [-20, -36],
    [-15, -35],
  ]) {
    coffin(ops, x, GROUND + 1, z, "z", 3, 179);
  }
  for (const [x, z] of [
    [-21, -38],
    [-13, -38],
    [-17, -31],
  ]) {
    stand(ops, x, GROUND + 1, z, 2, pick(181, x, 0, z) < 0.5 ? "lantern" : "soul_lantern");
  }
  for (const [x, z] of [
    [-22, -38],
    [-13, -32],
  ]) {
    cobweb(ops, x, HYPO - 1, z);
  }
}

/** 壁の面を骨に張り替える。**目より下だけ**——上は石のままにして、帯に見せる */
function boneWalls(ops: BuildOp[]): void {
  for (let x = OSS.x1 - 1; x <= OSS.x2 + 1; x++) {
    for (let z = OSS.z1 - 1; z <= OSS.z2 + 1; z++) {
      const inside = x >= OSS.x1 && x <= OSS.x2 && z >= OSS.z1 && z <= OSS.z2;
      if (inside || isOpen(x, z)) continue;
      for (let y = GROUND + 1; y <= GROUND + 3; y++) {
        if (pick(191, x, y, z) > 0.72) continue;
        ops.push(set(x, y, z, boneAt(x, y, z)));
      }
      ops.push(set(x, GROUND + 4, z, stoneAt(x, GROUND + 4, z)));
    }
  }
}

/** 骨の棚。**両側の壁に付ける。奥行き 1・高さ 3** */
function boneShelves(ops: BuildOp[]): void {
  for (const z of [OSS.z1 + 1, OSS.z2 - 1]) {
    for (let x = OSS.x1 + 1; x <= OSS.x2 - 1; x++) {
      // **切れ目を入れる**——ぐるりと繋げると、ただの壁になる
      if (pick(193, x, 0, z) > 0.78) continue;
      const h = 2 + Math.floor(pick(197, x, 1, z) * 2);
      for (let y = GROUND + 1; y <= GROUND + h; y++) ops.push(set(x, y, z, boneAt(x, y, z)));
      if (pick(199, x, 2, z) < 0.3) ops.push(set(x, GROUND + h + 1, z, "skeleton_skull"));
    }
  }
}

// ================================================================ 崩れの間

/** 崩れの間の範囲 */
const CAV = { x1: 12, x2: 22, z1: -38, z2: -31 } as const;

/**
 * 崩れの間。**天井が抜けかけ、東の隅から土が流れ込んでいる。**
 *
 * > ### **穴は開けない**
 * >
 * > 天井を地表まで抜くと、**その柱だけ天面が低くなって、
 * > 岩の上を塗り広げる 0-8 から切り離される。**
 * > **抜けかけた天井（垂れ下がった土）**として見せるだけにする。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function collapseOps(ops: BuildOp[]): void {
  for (let x = CAV.x1; x <= CAV.x2; x++) {
    for (let z = CAV.z1; z <= CAV.z2; z++) {
      if (!isOpen(x, z)) continue;
      // ---- 東の隅（x ＝ 22, z ＝ −38）から遠ざかるほど薄くなる山
      const d = Math.hypot(x - 22, z + 38);
      // **高さ 3 まで。** 天井は 6 マスなので、それ以上積むと上を歩けてしまう
      const h = Math.min(3, Math.round(2.8 - d / 3.6 + pick(211, x, 0, z) * 0.5));
      for (let y = GROUND + 1; y <= GROUND + h; y++) ops.push(set(x, y, z, soilAt(x, y, z)));
      // **茸は茶だけ。** 赤い茸は暗い墓所の中で真っ赤な塊になって浮く
      if (h >= 1 && pick(223, x, 1, z) < 0.07) ops.push(set(x, GROUND + h + 1, z, "brown_mushroom"));
      // ---- 垂れ下がった天井。**抜けかけているだけで、穴は開けない**
      if (d < 11 && pick(229, x, 3, z) < 0.3) ops.push(set(x, HYPO - 1, z, soilAt(x, HYPO, z)));
    }
  }
  brokenPillars(ops);
  for (const [x, z] of [
    [13, -37],
    [19, -31],
  ]) {
    stand(ops, x, GROUND + 1, z, 2, "lantern");
  }
  for (const [x, z] of [
    [21, -38],
    [16, -32],
    [19, -35],
  ]) {
    cobweb(ops, x, HYPO - 1, z);
  }
}

/** 折れた柱。**高さを 1 本ずつ変える**（0-6） */
function brokenPillars(ops: BuildOp[]): void {
  const stumps: readonly (readonly [number, number, number])[] = [
    [15, -36, 4],
    [19, -34, 2],
    [21, -37, 3],
    [17, -32, 5],
  ];
  for (const [x, z, h] of stumps) {
    if (!isOpen(x, z)) continue;
    ops.push(fill(x, GROUND + 1, z, x, h, z, "polished_deepslate"));
    ops.push(set(x, h, z, "cracked_deepslate_bricks"));
  }
}
