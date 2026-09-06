/**
 * 11「森の洋館」の**部屋割りと床。純粋。**
 *
 * ```
 * scanRooms   間取りを走査して、部屋の四角を拾う
 * roomOps     部屋ごとに床を塗り、置き物を並べる（1 階と 2 階で意匠を変える）
 * corridorOps 廊下に赤い絨毯を敷き、壁に灯りを点ける
 * ```
 *
 * > ### **同じ部屋を 2 階にも作らない**（`spec/14-map-build.md` 0-6）
 * >
 * > 間取りは上下で同じでよい——**人が建てたものは揃っている。**
 * > だが**中身まで同じだと、上ったことに気づけない。** 意匠の表を 2 つ持つ。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { F1, F2, SEED, isOpen, roomKey, spaceAt } from "./map-mansion-plan.js";
import { propsOf, type Room, type Theme } from "./map-mansion-props.js";

/** 1 階の意匠。**番号は `roomKey`**（x の帯 × 16 ＋ z の帯） */
const PLAN1: Readonly<Record<number, Theme>> = {
  1: "jail",
  2: "stair",
  3: "mush",
  33: "red",
  34: "drill",
  35: "store",
  49: "study",
  51: "secret",
  81: "bed",
  83: "shrine",
  97: "statue",
  98: "dine",
  99: "garden",
  129: "hearth",
  130: "stair",
  131: "red",
  200: "bay",
  201: "bay",
  202: "bay",
  203: "bay",
};

/** 2 階の意匠。**同じ部屋の上には違うものを置く** */
const PLAN2: Readonly<Record<number, Theme>> = {
  1: "store",
  2: "stair",
  3: "bed",
  33: "statue",
  34: "dine",
  35: "study",
  49: "red",
  51: "secret",
  81: "hearth",
  83: "jail",
  97: "red",
  98: "drill",
  99: "shrine",
  129: "mush",
  130: "stair",
  131: "garden",
  200: "bay",
  201: "bay",
  202: "bay",
  203: "bay",
};

/** 間取りを走査して、部屋の四角を拾う。**壁は含まない** */
export function scanRooms(): readonly Room[] {
  const box = new Map<number, { x0: number; x1: number; z0: number; z1: number }>();
  for (let z = -45; z <= 45; z++) {
    for (let x = -42; x <= 42; x++) {
      if (spaceAt(x, z) !== "room") continue;
      const k = roomKey(x, z);
      if (k < 0) continue;
      const b = box.get(k);
      if (b === undefined) box.set(k, { x0: x, x1: x, z0: z, z1: z });
      else {
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x);
        b.z0 = Math.min(b.z0, z);
        b.z1 = Math.max(b.z1, z);
      }
    }
  }
  const out: Room[] = [];
  for (const [key, b] of box) out.push({ key, ...b });
  return out;
}

/**
 * 部屋の床。**意匠ごとに材を変える。**
 *
 * **縁の 1 マスは必ず石**——木の床が壁にそのまま突き当たると、
 * どこまでが床でどこからが壁か分からなくなる。
 */
function floorOf(t: Theme, r: Room, x: number, z: number): string {
  const rim = x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1;
  if (rim && t !== "red" && t !== "mush") return ((x + z) & 1) === 0 ? "stone_bricks" : "cobblestone";
  const n = noise(SEED + 71, x, r.key, z);
  switch (t) {
    case "red":
      return rim ? "black_wool" : "red_wool";
    case "mush":
      return n < 0.7 ? "mycelium" : "podzol";
    case "garden":
      return n < 0.5 ? "moss_block" : n < 0.8 ? "podzol" : "coarse_dirt";
    case "jail":
      return n < 0.35 ? "mossy_cobblestone" : "cobblestone";
    case "shrine":
      return ((x + z) & 1) === 0 ? "polished_andesite" : "stone_bricks";
    case "statue":
      return n < 0.3 ? "polished_andesite" : "stone_bricks";
    case "drill":
      return n < 0.25 ? "andesite" : n < 0.4 ? "cobblestone" : "stone_bricks";
    case "dine":
      return n < 0.14 ? "spruce_planks" : "dark_oak_planks";
    case "bed":
    case "study":
      return n < 0.2 ? "birch_planks" : "dark_oak_planks";
    default:
      return n < 0.12 ? "spruce_planks" : "dark_oak_planks";
  }
}

/** 部屋を仕上げる。**床 → 置き物**の順（置き物を床で塗り潰さない） */
export function roomOps(ops: BuildOp[]): void {
  const rooms = scanRooms();
  for (const r of rooms) {
    for (const y of [F1, F2]) {
      const t = (y === F1 ? PLAN1 : PLAN2)[r.key];
      if (t === undefined || t === "stair") continue;
      for (let x = r.x0; x <= r.x1; x++) {
        for (let z = r.z0; z <= r.z1; z++) {
          if (spaceAt(x, z) !== "room") continue;
          ops.push(set(x, y, z, floorOf(t, r, x, z)));
        }
      }
      propsOf(ops, t, r, y);
    }
  }
}

/**
 * 廊下。**壁に接していないマスを赤い絨毯にする**——
 * それだけで、幅の真ん中に筋が通る。**幅を数えなくてよい。**
 */
export function corridorOps(ops: BuildOp[]): void {
  for (let z = -45; z <= 45; z++) {
    for (let x = -42; x <= 42; x++) {
      if (spaceAt(x, z) !== "corr") continue;
      const wall = !isOpen(x - 1, z) || !isOpen(x + 1, z) || !isOpen(x, z - 1) || !isOpen(x, z + 1);
      for (const y of [F1, F2]) {
        if (!wall) {
          ops.push(set(x, y, z, "red_wool"));
          continue;
        }
        ops.push(set(x, y, z, ((x + z) & 1) === 0 ? "stone_bricks" : "polished_andesite"));
      }
      if (!wall) continue;
      // **灯りは天井から吊る**（0-5）。
      //
      // > ### 壁の隣に置くだけでは足りない
      // >
      // > **その壁は、あとから扉として抜かれるかもしれない。**
      // > 実際、松明を壁付けにしたら **55 個が宙に浮いて検査に落ちた**（2026-09-06）。
      // > **天井は抜かない**ので、鎖で下げれば必ず繋がる。
      const lit = Math.abs(x) > 1 && (((x + z) % 6) + 6) % 6 === 0;
      if (!lit) continue;
      // **天井の真下に置く**——ランタンは上の面に吊り下がるので、支えが要らない
      for (const y of [F1, F2]) ops.push(set(x, y + 7, z, "lantern"));
    }
  }
}

/**
 * 窓廊下の腰高欄。
 *
 * **外壁沿いの廊下は、ただの通路になりやすい。**
 * **柵と灯りを一定の拍で置く**と、窓の並びと合って「廊下」に見える。
 */
export function galleryOps(ops: BuildOp[]): void {
  for (const z of [-23, 22]) {
    for (let x = -36; x <= 36; x++) {
      if (Math.abs(x) <= 4 || spaceAt(x, z) !== "corr") continue;
      const m = (((x + 2) % 5) + 5) % 5;
      if (m !== 0) continue;
      for (const y of [F1, F2]) {
        ops.push(fill(x, y + 1, z, x, y + 2, z, "dark_oak_fence"));
        ops.push(set(x, y + 3, z, "lantern"));
      }
    }
  }
}
