/**
 * 剣を生成する。
 *
 * 仕様は `worlds/core-wars/docs/03-content.md` 1-1。
 *
 * ## なぜ専用の剣を作るのか
 *
 * **バニラのアイテムの火力は書き換えられない。**
 * ブロックのテクスチャのように上書きする手段が無い。
 *
 * 火力を 4〜8 の等差にしたいので、**同じ見た目の別のアイテム**を作る。
 * テクスチャはバニラのものをそのまま指すので、こちらには持たない。
 *
 * ## なぜ生成するのか
 *
 * 5 本とも**違うのは数値だけ。** 手で書くと、直すときに
 * どれかを直し忘れる。**表を 1 つ置いて、そこから作る。**
 *
 * ## 使い方
 *
 *   node tools/gen-swords.mjs
 */

import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DST = join(ROOT, "worlds", "core-wars", "packs", "game", "behavior_packs", "game", "items");

/**
 * 絵の名前を登録する先。
 *
 * **バニラのテクスチャを指すだけでは足りない。**
 * `minecraft:icon` に書けるのは**登録済みの名前**で、道ではない。
 *
 * しかもバニラは剣を `sword` という 1 つの名前に配列でまとめており、
 * **`stone_sword` のような名前は存在しない。**
 * だから自分で名前を付け直す。
 */
const TEX = join(
  ROOT,
  "worlds",
  "core-wars",
  "packs",
  "game",
  "resource_packs",
  "game",
  "textures",
  "item_texture.json"
);

/**
 * 店の盤面に専用のアイテムを登録する先。
 *
 * **盤面はバニラのアイテム一覧しか持っていない。**
 * 登録しないと、持ち物の欄でも品揃えでも**空白のマス**になる。
 *
 * `vendor/` の中だが、**ここは設定ファイル**（配布元がそう案内している）。
 * `_global_variables.json` と同じ扱いにする。
 */
const CHEST_UI_CONSTANTS = join(
  ROOT,
  "worlds",
  "core-wars",
  "packs",
  "game",
  "scripts",
  "vendor",
  "chest-ui",
  "constants.js"
);

/**
 * 剣のほかに登録が要る専用のアイテム。
 *
 * **`game:` で始まるものは全部ここに要る。**
 */
const EXTRA_ITEMS = [{ id: "game:starter_sword", texture: "textures/items/wood_sword" }];

/** 絵の名前。**アイテムの識別子と揃える** */
const iconName = (id) => `game_sword_${id}`;

/**
 * 剣の表。**ここが唯一の正。**
 *
 * | 列 | 意味 |
 * | --- | --- |
 * | `damage` | 火力。**1 段ごとに必ず 1 上がる** |
 * | `durability` | 耐久度。バニラと同じ値 |
 * | `enchantability` | エンチャントの付きやすさ。バニラと同じ値 |
 * | `repair` | 金床で直すのに使うもの |
 * | `icon` | テクスチャの名前。**バニラのものを指す** |
 *
 * 銅はバニラの値が分からないので、**石と鉄の間**に置いた。
 */
const SWORDS = [
  { id: "stone", name: "石の剣", damage: 4, durability: 131, ench: 5, repair: "minecraft:cobblestone" },
  { id: "copper", name: "銅の剣", damage: 5, durability: 190, ench: 8, repair: "minecraft:copper_ingot" },
  { id: "iron", name: "鉄の剣", damage: 6, durability: 250, ench: 14, repair: "minecraft:iron_ingot" },
  { id: "diamond", name: "ダイヤの剣", damage: 7, durability: 1561, ench: 10, repair: "minecraft:diamond" },
  {
    id: "netherite",
    name: "ネザライトの剣",
    damage: 8,
    durability: 2031,
    ench: 15,
    repair: "minecraft:netherite_ingot",
  },
];

/** 定義の書式。**バニラのアイテムに合わせる** */
const FORMAT = "1.26.40";

mkdirSync(DST, { recursive: true });

// **前回の生成物を消してから作る。** 表から消した剣が残り続けないように
if (existsSync(DST)) {
  for (const f of readdirSync(DST)) {
    if (f.startsWith("sword_") && f.endsWith(".json")) rmSync(join(DST, f));
  }
}

for (const s of SWORDS) {
  const out = {
    format_version: FORMAT,
    "minecraft:item": {
      description: {
        identifier: `game:sword_${s.id}`,
        // **`group` は書かない。**
        // 名前空間の付いていない値を渡すと弾かれ、
        // **アイテムが 1 つも読み込まれない。** 支給の剣に合わせる
        menu_category: { category: "equipment" },
      },
      components: {
        "minecraft:display_name": { value: s.name },
        // **名前で指す。** 中身はバニラのテクスチャ（item_texture.json 参照）
        "minecraft:icon": iconName(s.id),
        "minecraft:max_stack_size": 1,
        "minecraft:hand_equipped": true,
        "minecraft:damage": s.damage,
        "minecraft:durability": { max_durability: s.durability },
        "minecraft:enchantable": { value: s.ench, slot: "sword" },
        "minecraft:repairable": {
          repair_items: [{ items: [s.repair], repair_amount: Math.round(s.durability / 4) }],
        },
      },
    },
  };
  writeFileSync(join(DST, `sword_${s.id}.json`), JSON.stringify(out, null, 2) + "\n");
}

// ---------------------------------------------------------------- 絵の登録
//
// **他の登録を消さない。** この道具が作った名前だけを入れ替える
const tex = JSON.parse(readFileSync(TEX, "utf8"));
for (const k of Object.keys(tex.texture_data)) {
  if (k.startsWith("game_sword_")) delete tex.texture_data[k];
}
for (const s of SWORDS) {
  tex.texture_data[iconName(s.id)] = { textures: `textures/items/${s.id}_sword` };
}
writeFileSync(TEX, JSON.stringify(tex, null, 2) + "\n");

// ---------------------------------------------------------------- 盤面への登録
//
// **中身だけ差し替える。** 配布元のファイルなので、他は触らない
const entries = [
  ...SWORDS.map((s) => ({ id: `game:sword_${s.id}`, texture: `textures/items/${s.id}_sword` })),
  ...EXTRA_ITEMS,
];
const body = entries.map((e) => `\t'${e.id}': { texture: '${e.texture}', type: 'item' },`).join("\n");
const consts = readFileSync(CHEST_UI_CONSTANTS, "utf8");
const re = /export const custom_content = \{[\s\S]*?\n\};/;
if (!re.test(consts)) throw new Error("custom_content が見つかりません（配布元の形が変わった？）");
writeFileSync(CHEST_UI_CONSTANTS, consts.replace(re, `export const custom_content = {\n${body}\n};`));

console.log(`剣を ${SWORDS.length} 本生成`);
for (const s of SWORDS) console.log(`  game:sword_${s.id}  火力 ${s.damage}  耐久 ${s.durability}`);
console.log(`  盤面に登録 ${entries.length} 件`);
console.log(`\n  → ${DST}`);
