/**
 * ボクセルを `.mcstructure` に書き出す。
 *
 * 形式は `tools/make-empty-structure.mjs` で確立済みのものを踏襲する
 * （リトルエンディアンの NBT・圧縮なし）。
 * あちらは「全て -1（何もしない）」の空ファイルだったが、
 * こちらは**実際のブロックを入れる**。
 *
 * ## 構造
 *
 *   format_version : int
 *   size           : list<int>[3]
 *   structure      : compound
 *     block_indices : list< list<int> >   … 2層。1層目が本体、2層目は水など
 *     entities      : list（空）
 *     palette       : compound
 *       default : compound
 *         block_palette      : list<compound>  … 使うブロックの一覧
 *         block_position_data : compound（空）
 *   structure_world_origin : list<int>[3]
 *
 * ## 並び順が肝
 *
 * `block_indices` は **X → Y → Z の順**（X が一番外側）。
 * ここを間違えると、形が転置されたり潰れたりする。
 */
import { PALETTE } from "./palette.mjs";

const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, STRING: 8, LIST: 9, COMPOUND: 10 };

class NbtWriter {
  constructor() { this.parts = []; }
  raw(b) { this.parts.push(b); return this; }
  u8(v) { const b = Buffer.alloc(1); b.writeUInt8(v); return this.raw(b); }
  i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); return this.raw(b); }
  str(s) {
    const body = Buffer.from(s, "utf8");
    const len = Buffer.alloc(2); len.writeUInt16LE(body.length);
    return this.raw(len).raw(body);
  }
  named(type, name) { return this.u8(type).str(name); }
  build() { return Buffer.concat(this.parts); }
}

/**
 * パレットの名前 → Minecraft のブロック識別子。
 *
 * **色用のパレット名と、ゲーム内の識別子は別物。**
 * 見た目の確認用に付けた名前を、そのままゲームへ渡さない。
 */
const BLOCK_ID = {
  oak_planks: "minecraft:oak_planks",
  spruce_planks: "minecraft:spruce_planks",
  dark_oak_planks: "minecraft:dark_oak_planks",
  oak_log: "minecraft:oak_log",
  spruce_log: "minecraft:spruce_log",
  oak_stairs: "minecraft:oak_stairs",
  cobblestone_stairs: "minecraft:stone_stairs",
  stone_stairs: "minecraft:normal_stone_stairs",
  oak_slab: "minecraft:oak_slab",
  oak_fence: "minecraft:oak_fence",

  stone_bricks: "minecraft:stone_bricks",
  mossy_stone_bricks: "minecraft:mossy_stone_bricks",
  cracked_stone_bricks: "minecraft:cracked_stone_bricks",
  chiseled_stone_bricks: "minecraft:chiseled_stone_bricks",
  stone_brick_stairs: "minecraft:stone_brick_stairs",
  stone_brick_slab: "minecraft:stone_brick_slab",
  stone_brick_wall: "minecraft:stone_brick_wall",
  smooth_stone: "minecraft:smooth_stone",
  cobblestone: "minecraft:cobblestone",
  stone: "minecraft:stone",
  andesite: "minecraft:andesite",
  polished_andesite: "minecraft:polished_andesite",
  deepslate_bricks: "minecraft:deepslate_bricks",
  deepslate_tiles: "minecraft:deepslate_tiles",
  gravel: "minecraft:gravel",
  mud_bricks: "minecraft:mud_bricks",

  oak_leaves: "minecraft:oak_leaves",
  spruce_leaves: "minecraft:spruce_leaves",
  azalea_leaves: "minecraft:azalea_leaves",
  moss_block: "minecraft:moss_block",
  vine: "minecraft:vine",

  glass_pane: "minecraft:glass_pane",
  glass: "minecraft:glass",
  glowstone: "minecraft:glowstone",
  lantern: "minecraft:lantern",
  white_concrete: "minecraft:white_concrete",
  red_concrete: "minecraft:red_concrete",
  blue_concrete: "minecraft:blue_concrete",
  light_blue_concrete: "minecraft:light_blue_concrete",

  iron_block: "minecraft:iron_block",
  gold_block: "minecraft:gold_block",
  diamond_block: "minecraft:diamond_block",
  emerald_block: "minecraft:emerald_block",
};

/** 対応表に無いものは気づけるように落とす。黙って別のブロックにしない */
function idOf(name) {
  const id = BLOCK_ID[name];
  if (!id) throw new Error(`ブロック識別子が未登録: ${name}（mcstructure.mjs の BLOCK_ID に足す）`);
  return id;
}

export function toMcStructure(voxels) {
  // 使うブロックだけをパレットに集める
  const order = [];
  const index = new Map();
  const indexOf = (name) => {
    if (name === "air") return -1;              // -1 は「置かない」
    if (!index.has(name)) { index.set(name, order.length); order.push(name); }
    return index.get(name);
  };

  // **X → Y → Z の順**。ここを間違えると形が壊れる
  const cells = [];
  for (let x = 0; x < voxels.sx; x++)
    for (let y = 0; y < voxels.sy; y++)
      for (let z = 0; z < voxels.sz; z++)
        cells.push(indexOf(voxels.get(x, y, z)));

  const w = new NbtWriter();
  w.u8(TAG.COMPOUND).str("");                   // 根の compound（名前は空）
  w.named(TAG.INT, "format_version").i32(1);
  w.named(TAG.LIST, "size").u8(TAG.INT).i32(3).i32(voxels.sx).i32(voxels.sy).i32(voxels.sz);

  w.named(TAG.COMPOUND, "structure");

  //   block_indices: 2層。1層目が本体、2層目は使わない（全て -1）
  w.named(TAG.LIST, "block_indices").u8(TAG.LIST).i32(2);
  w.u8(TAG.INT).i32(cells.length);
  for (const c of cells) w.i32(c);
  w.u8(TAG.INT).i32(cells.length);
  for (let i = 0; i < cells.length; i++) w.i32(-1);

  w.named(TAG.LIST, "entities").u8(TAG.COMPOUND).i32(0);

  //   palette
  w.named(TAG.COMPOUND, "palette");
  w.named(TAG.COMPOUND, "default");
  w.named(TAG.LIST, "block_palette").u8(TAG.COMPOUND).i32(order.length);
  for (const name of order) {
    w.named(TAG.STRING, "name").str(idOf(name));
    w.named(TAG.COMPOUND, "states").u8(TAG.END);   // 状態は既定のまま
    w.named(TAG.INT, "version").i32(18163713);     // 1.21 系のブロック版数
    w.u8(TAG.END);                                  // このブロックの終わり
  }
  w.named(TAG.COMPOUND, "block_position_data").u8(TAG.END);
  w.u8(TAG.END);                                    // default の終わり
  w.u8(TAG.END);                                    // palette の終わり
  w.u8(TAG.END);                                    // structure の終わり

  w.named(TAG.LIST, "structure_world_origin").u8(TAG.INT).i32(3).i32(0).i32(0).i32(0);
  w.u8(TAG.END);                                    // 根の終わり

  return { buffer: w.build(), palette: order };
}

/** パレットに載っているブロックが全部変換できるかを先に確かめる */
export function checkPalette() {
  const missing = Object.keys(PALETTE).filter((k) => k !== "air" && !BLOCK_ID[k]);
  if (missing.length) throw new Error(`識別子が未登録: ${missing.join(", ")}`);
}

/**
 * 大きすぎる設計を、構造物ブロックに収まる大きさへ分割する。
 *
 * **上限は 64 x 384 x 64。** これを超えると1つの構造物にできない。
 *
 * 分割するのは**書き出しのときだけ**。
 * 設計そのものは1つのままなので、確認する画像も1枚で済む。
 *
 * @returns [{ name, ox, oz, buffer, size }]
 */
/**
 * 大きすぎる構造物を、構造物ブロックの上限（64x384x64）に収まるよう割る。
 *
 * @param {number} [seam] **境界の位置。** ここで2つに割る（0..seam-1 / seam..末尾）
 *
 * 継ぎ目を跨いだ構造は、置く位置を1マス間違えるとそこだけ食い違う。
 * 壁のような一様な面なら気づきにくいが、**門だと一目でずれて見える。**
 * 実際に門を跨いで割っていて「門がずれている」と指摘された。
 * 中央割りではなく、門を避けた位置で割る。
 */
export function splitToStructures(voxels, baseName, limit = 64, seam = null) {
  // 各軸の切れ目を作る。**seam があればそこで2分割、無ければ均等割り**
  const cuts = (len) => {
    if (seam !== null) return [[0, seam], [seam, len]];
    const n = Math.ceil(len / limit);
    const w = Math.ceil(len / n);
    const out = [];
    for (let i = 0; i < n; i++) out.push([i * w, Math.min((i + 1) * w, len)]);
    return out;
  };

  const xs = cuts(voxels.sx);
  const zs = cuts(voxels.sz);

  for (const [a, b] of [...xs, ...zs]) {
    if (b - a > limit) throw new Error(`分割後も上限 ${limit} を超える: ${b - a}`);
  }

  const names = xs.length === 2 && zs.length === 2
    ? [["nw", "ne"], ["sw", "se"]]
    : null;

  const out = [];
  for (let r = 0; r < zs.length; r++) {
    for (let c = 0; c < xs.length; c++) {
      const [ox, ex] = xs[c], [oz, ez] = zs[r];
      const sx = ex - ox, sz = ez - oz;

      // 切り出した範囲だけの器を作る
      const part = new (Object.getPrototypeOf(voxels).constructor)(sx, voxels.sy, sz);
      for (let y = 0; y < voxels.sy; y++)
        for (let z = 0; z < sz; z++)
          for (let x = 0; x < sx; x++)
            part.set(x, y, z, voxels.get(ox + x, y, oz + z));

      const suffix = names ? names[r][c] : `${r}_${c}`;
      out.push({
        name: `${baseName}_${suffix}`,
        ox, oz, size: [sx, voxels.sy, sz],
        buffer: toMcStructure(part).buffer,
      });
    }
  }
  return out;
}
