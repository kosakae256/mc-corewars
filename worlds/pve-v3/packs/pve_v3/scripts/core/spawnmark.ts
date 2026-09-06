/**
 * 湧く場所の点。**詰め方と開き方。純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/21-spawn-mark.md` 2 章。
 *
 * ```
 * 1 点 ＝ 3 バイト（x＋50, z＋50, y＋50）  →  base64
 * ```
 *
 * > ### なぜ base64 なのか
 * >
 * > **ワールドの動的プロパティは文字列**。生のバイトは入らない。
 * > **1 点 4 文字**（3 バイト）に収まるので、**1000 点で約 4 KB。**
 * >
 * > `btoa` / `atob` は**この実行環境に無い**ので、自分で書く。
 */

/** 点 1 つ */
export interface Mark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 座標をずらす量。**負の数をバイトに収めるため** */
const OFF = 50;

/** 1 本の動的プロパティに詰める点の数。**溢れたら次の本へ** */
export const PER_SLOT = 2000;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 点の並び → 文字列 */
export function pack(marks: readonly Mark[]): string {
  const bytes: number[] = [];
  for (const m of marks) {
    bytes.push(clamp(m.x + OFF), clamp(m.z + OFF), clamp(m.y + OFF));
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] ?? "A";
    out += B64[(n >> 12) & 63] ?? "A";
    out += B64[(n >> 6) & 63] ?? "A";
    out += B64[n & 63] ?? "A";
  }
  return out;
}

/** 文字列 → 点の並び。**読めない字は捨てる** */
export function unpack(text: string): Mark[] {
  const bytes: number[] = [];
  for (let i = 0; i + 3 < text.length; i += 4) {
    let n = 0;
    let ok = true;
    for (let k = 0; k < 4; k++) {
      const v = B64.indexOf(text[i + k] ?? "");
      if (v < 0) {
        ok = false;
        break;
      }
      n = (n << 6) | v;
    }
    if (!ok) continue;
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  const out: Mark[] = [];
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    out.push({ x: (bytes[i] ?? 0) - OFF, z: (bytes[i + 1] ?? 0) - OFF, y: (bytes[i + 2] ?? 0) - OFF });
  }
  return out;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 同じ点か */
export function same(a: Mark, b: Mark): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * **丸ごと詰まっていないブロック**の見分け（名前の断片）。
 *
 * > ### `Block.isSolid` がこの版の API に無い（2026-09-06）
 * >
 * > `@minecraft/server` 2.9.0 にあるのは `isAir` / `isLiquid` / `isWaterlogged` だけ。
 * > **「実体のあるブロックからしか湧かせない」**を満たすため、**名前で見分ける。**
 * >
 * > **取りこぼしがあれば、ここに足す。** 完全ではないが、
 * > **半ブロック・階段・柵・草・松明の上から湧く**のは止まる。
 */
const NOT_FULL = [
  "_slab",
  "_stairs",
  "_fence",
  "_wall",
  "_pane",
  "_gate",
  "_door",
  "_trapdoor",
  "_button",
  "_pressure_plate",
  "_sign",
  "_banner",
  "_carpet",
  "_bed",
  "_candle",
  "_rail",
  "rail",
  "torch",
  "lantern",
  "ladder",
  "chain",
  "bars",
  "vine",
  "web",
  "flower",
  "sapling",
  "grass",
  "fern",
  "roots",
  "sprouts",
  "mushroom_",
  "bamboo",
  "kelp",
  "seagrass",
  "lily",
  "coral_fan",
  "dripstone",
  "scaffolding",
  "snow_layer",
  "sea_pickle",
  "cake",
  "pot",
  "campfire",
  "hopper",
  "cauldron",
  "composter",
  "brewing_stand",
  "enchanting_table",
  "anvil",
  "grindstone",
  "stonecutter",
  "lectern",
  "bell",
  "conduit",
  "farmland",
  "path",
  "amethyst_cluster",
  "bud",
  "head",
  "skull",
  "shulker_box",
  "end_rod",
  "lightning_rod",
  "turtle_egg",
  "azalea",
  "cactus",
  "sugar_cane",
  "cocoa",
  "chorus",
  "tripwire",
  "lever",
  "repeater",
  "comparator",
  "observer",
  "piston",
  "daylight",
  "frame",
  "portal",
];

/**
 * **その名前は「上に立てる、実体のあるブロック」か。**
 *
 * 空・液体は呼ぶ側で弾く。ここは**形**だけを見る。
 */
export function isFullBlock(typeId: string): boolean {
  const name = typeId.includes(":") ? typeId.slice(typeId.indexOf(":") + 1) : typeId;
  if (name === "air" || name === "water" || name === "lava") return false;
  return !NOT_FULL.some((frag) => name.includes(frag));
}

/** 引くための鍵。**マップ名で引く**（`21-spawn-mark.md` 2 章） */
export function keyOf(map: string, slot: number): string {
  return slot === 0 ? `pve_v3:spawn:${map}` : `pve_v3:spawn:${map}:${slot + 1}`;
}
