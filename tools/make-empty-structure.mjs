#!/usr/bin/env node
/**
 * GameTest 用の「空の構造ファイル」(.mcstructure) を作る。
 *
 *   node tools/make-empty-structure.mjs <出力先> [幅 高さ 奥行]
 *
 * ## なぜ必要か
 *
 * GameTest は構造ファイルの上で実行される。通常はゲーム内の
 * 構造ブロックで作るが、整地ボットには「何も無い平地」があればよいので、
 * 最小限の構造をここで生成する。
 *
 * ## 形式
 *
 * `.mcstructure` は **リトルエンディアンの NBT**（圧縮なし）。
 * 必要な要素:
 *   format_version : int
 *   size           : list<int>[3]
 *   structure      : compound
 *     block_indices : list< list<int> >   … 2層ぶん。-1 は「何もしない」
 *     entities      : list<compound>      … 空
 *     palette       : compound
 *       default.block_palette : list<compound>  … 空でよい
 *   structure_world_origin : list<int>[3]
 *
 * **block_indices を全て -1 にすると「元の地形をそのまま残す」**。
 * これが欲しい「空の構造」になる。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ------------------------------------------------------------ NBT 書き出し

const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
};

class NbtWriter {
  constructor() {
    this.parts = [];
  }

  raw(buf) {
    this.parts.push(buf);
    return this;
  }

  u8(v) {
    const b = Buffer.alloc(1);
    b.writeUInt8(v);
    return this.raw(b);
  }

  i32(v) {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v);
    return this.raw(b);
  }

  /** NBT の文字列は「長さ(u16 LE) + UTF-8」 */
  str(s) {
    const body = Buffer.from(s, "utf8");
    const len = Buffer.alloc(2);
    len.writeUInt16LE(body.length);
    return this.raw(len).raw(body);
  }

  /** タグ種別 + 名前 */
  named(type, name) {
    return this.u8(type).str(name);
  }

  build() {
    return Buffer.concat(this.parts);
  }
}

/**
 * 空の .mcstructure を作る。
 *
 * @param sx 幅 / @param sy 高さ / @param sz 奥行
 */
function buildEmptyStructure(sx, sy, sz) {
  const count = sx * sy * sz;
  const w = new NbtWriter();

  // ルートの compound（名前なし）
  w.named(TAG.COMPOUND, "");

  w.named(TAG.INT, "format_version").i32(1);

  // size: list<int>[3]
  w.named(TAG.LIST, "size").u8(TAG.INT).i32(3).i32(sx).i32(sy).i32(sz);

  // structure: compound
  w.named(TAG.COMPOUND, "structure");

  //   block_indices: list< list<int> > … 2層
  w.named(TAG.LIST, "block_indices").u8(TAG.LIST).i32(2);
  for (let layer = 0; layer < 2; layer++) {
    // 各層は list<int>。-1 = 何も置かない（元の地形を残す）
    w.u8(TAG.INT).i32(count);
    for (let i = 0; i < count; i++) w.i32(-1);
  }

  //   entities: 空の list<compound>
  w.named(TAG.LIST, "entities").u8(TAG.COMPOUND).i32(0);

  //   palette: compound { default: compound { block_palette: 空, block_position_data: 空 } }
  w.named(TAG.COMPOUND, "palette");
  w.named(TAG.COMPOUND, "default");
  w.named(TAG.LIST, "block_palette").u8(TAG.COMPOUND).i32(0);
  w.named(TAG.COMPOUND, "block_position_data");
  w.u8(TAG.END); // block_position_data の終わり
  w.u8(TAG.END); // default の終わり
  w.u8(TAG.END); // palette の終わり

  w.u8(TAG.END); // structure の終わり

  // structure_world_origin: list<int>[3]
  w.named(TAG.LIST, "structure_world_origin").u8(TAG.INT).i32(3).i32(0).i32(0).i32(0);

  w.u8(TAG.END); // ルートの終わり

  return w.build();
}

// ------------------------------------------------------------------ 実行

const out = process.argv[2];
if (!out) {
  console.error("使い方: node tools/make-empty-structure.mjs <出力先.mcstructure> [幅 高さ 奥行]");
  process.exit(1);
}
const sx = Number(process.argv[3] ?? 5);
const sy = Number(process.argv[4] ?? 5);
const sz = Number(process.argv[5] ?? 5);

const buf = buildEmptyStructure(sx, sy, sz);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);

console.log(`作成: ${out}`);
console.log(`  サイズ: ${sx}x${sy}x${sz}  ファイル: ${buf.length} bytes`);
