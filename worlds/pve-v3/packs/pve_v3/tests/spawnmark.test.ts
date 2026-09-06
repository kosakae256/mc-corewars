import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pack, unpack, keyOf, same, isFullBlock } from "../scripts/core/spawnmark.ts";

describe("湧き点 — 詰め方", () => {
  it("**詰めて開くと、元に戻る**", () => {
    const marks = [
      { x: -50, y: -50, z: -50 },
      { x: 0, y: 0, z: 0 },
      { x: 50, y: 29, z: 50 },
      { x: -7, y: 3, z: 41 },
    ];
    assert.deepEqual(unpack(pack(marks)), marks);
  });
  it("**1 点 4 文字**（1000 点で約 4 KB）", () => {
    const marks = Array.from({ length: 100 }, (_, i) => ({ x: i - 50, y: 0, z: 0 }));
    assert.equal(pack(marks).length, 400);
  });
  it("**空でも壊れない**", () => {
    assert.deepEqual(unpack(""), []);
    assert.equal(pack([]), "");
  });
  it("**読めない字は捨てる**", () => {
    assert.deepEqual(unpack("!!!!"), []);
  });
  it("**鍵はマップ名で引く。2 本目から番号が付く**", () => {
    assert.equal(keyOf("basin", 0), "pve_v3:spawn:basin");
    assert.equal(keyOf("basin", 1), "pve_v3:spawn:basin:2");
  });
  it("**同じ点か見分ける**", () => {
    assert.ok(same({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }));
    assert.ok(!same({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 4 }));
  });
});

describe("湧き点 — 実体のあるブロックか", () => {
  it("**丸ごと詰まっているものは通す**", () => {
    for (const b of ["stone", "minecraft:stone_bricks", "deepslate", "white_wool", "obsidian", "sandstone"]) {
      assert.ok(isFullBlock(b), b);
    }
  });
  it("**空・液体は通さない**", () => {
    for (const b of ["air", "water", "lava"]) assert.ok(!isFullBlock(b), b);
  });
  it("**半ブロック・階段・柵・草・松明の上からは湧かせない**", () => {
    for (const b of [
      "stone_slab",
      "oak_stairs",
      "oak_fence",
      "cobblestone_wall",
      "glass_pane",
      "short_grass",
      "tall_grass",
      "torch",
      "lantern",
      "white_carpet",
      "iron_bars",
      "ladder",
      "snow_layer",
      "farmland",
      "grass_path",
      "campfire",
      "end_rod",
      "pve_v3:portal",
    ]) {
      assert.ok(!isFullBlock(b), b);
    }
  });
});
