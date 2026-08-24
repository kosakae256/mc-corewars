/**
 * マップ用の独自ブロック `game:map_parts_*` を生成する。
 *
 * ## なぜ独自ブロックにするのか
 *
 * Core Wars では**プレイヤーが橋としてブロックを置く**。それは壊せないと困る。
 * つまり「マップの一部か、誰かが置いたものか」を区別する必要がある。
 *
 * 座標と種類の組み合わせでも判定できる（そうしていた）が、
 * **ブロックの種類そのもので区別できるなら、そちらが確実。**
 * 座標判定は「島の上に自分で置いた石レンガ」を誤って守ってしまう。
 *
 * ## 何を作るか
 *
 * **立方体のブロックだけ。** 25 種。
 *
 * 階段・柵・板ガラス・ツタ・ランタン・葉は作らない。
 * 組み込みモデルが `minecraft:geometry.full_block` しかなく、
 * 形・向き・隣と繋がる挙動を自作することになって割に合わない
 *（`docs/research/10-custom-block-replacement.md`）。
 *
 * ## 作らないもの（重要）
 *
 * | ブロック | 理由 |
 * | --- | --- |
 * | `white_concrete` | **コア。壊すことが目的** |
 * | `blue_concrete` `red_concrete` | **コアの色かもしれない。** 確定するまで保留 |
 * | `light_blue_concrete` | リスポーン地点の目印。同上 |
 *
 * ## テクスチャ
 *
 * **バニラのテクスチャキーをそのまま参照する。** 画像を複製しない。
 * キーは `reference/bedrock-samples/resource_pack/blocks.json` から引いた。
 *
 * > `stone` のキーは `stone` ではなく **`flattened_stone`**。間違えやすい。
 */

import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const BP = join(ROOT, "worlds", "core-wars", "packs", "game", "behavior_packs", "game");
const RP = join(ROOT, "worlds", "core-wars", "packs", "game", "resource_packs", "game");

const NAMESPACE = "game";
const PREFIX = "map_parts_";
const FORMAT = "1.26.40";

/**
 * リソースパックの `blocks.json` だけは**別のバージョン体系**。
 *
 * 1.26.40 を書くと
 * 「exceeds largest currently supported version: 1.21.40」と警告され、
 * **1.1.0 として扱われて音の指定が効かなくなる。**
 */
const RP_BLOCKS_FORMAT = "1.21.40";

/**
 * 作るブロック。
 *
 * `texture` は文字列なら全面共通、オブジェクトなら面ごと。
 * `sound` はバニラの `blocks.json` に書かれていたものをそのまま使う。
 */
const BLOCKS = [
  { from: "stone", texture: "flattened_stone", sound: "stone" },
  { from: "cobblestone", texture: "cobblestone", sound: "stone" },
  { from: "stone_bricks", texture: "stone_bricks", sound: "stone" },
  { from: "mossy_stone_bricks", texture: "mossy_stone_bricks", sound: "stone" },
  { from: "andesite", texture: "andesite", sound: "stone" },
  { from: "polished_andesite", texture: "polished_andesite", sound: "stone" },
  { from: "deepslate_bricks", texture: "deepslate_bricks", sound: "deepslate_bricks" },
  { from: "deepslate_tiles", texture: "deepslate_tiles", sound: "deepslate_bricks" },
  { from: "moss_block", texture: "moss_block", sound: "moss_block" },
  { from: "oak_planks", texture: "oak_planks", sound: "wood" },
  { from: "dark_oak_planks", texture: "dark_oak_planks", sound: "wood" },
  { from: "spruce_planks", texture: "spruce_planks", sound: "wood" },
  {
    from: "oak_log",
    texture: { side: "oak_log_side", up: "oak_log_top", down: "oak_log_top" },
    sound: "wood",
    axis: true,
  },
  {
    from: "spruce_log",
    texture: { side: "spruce_log_side", up: "spruce_log_top", down: "spruce_log_top" },
    sound: "wood",
    axis: true,
  },

  // ---- 手で作り直されたマップで見つかったもの（2026-08-24）
  // `/kit:scan` の報告をもとに追加した。**推測ではなく実測**
  { from: "blue_terracotta", texture: "blue_terracotta", sound: "terracotta" },
  { from: "red_terracotta", texture: "red_terracotta", sound: "terracotta" },

  // **透過するブロック。** 普通の立方体と同じ設定だと真っ黒になる
  { from: "blue_stained_glass", texture: "blue_stained_glass", sound: "glass", glass: true },
  { from: "red_stained_glass", texture: "red_stained_glass", sound: "glass", glass: true },

  // **光る。** light_emission を付けないとただの模様になる
  {
    from: "verdant_froglight",
    texture: {
      side: "verdant_froglight_side",
      up: "verdant_froglight_top",
      down: "verdant_froglight_top",
    },
    sound: "froglight",
    light: 15,
    axis: true,
  },
  {
    from: "pearlescent_froglight",
    texture: {
      side: "pearlescent_froglight_side",
      up: "pearlescent_froglight_top",
      down: "pearlescent_froglight_top",
    },
    sound: "froglight",
    light: 15,
    axis: true,
  },

  // ---- 葉（2026-08-24 追加）
  // **立方体なので独自ブロックにできる。** 当初は「形を持つ」と誤って分類していた。
  // 独自ブロックにすると `flammable: false` が付き、**燃えなくなる。**
  // これが目的。バニラのままだと延焼でマップから消える
  //
  // 葉は透過するので `alpha_test`、色はバイオームではなく
  // **針葉樹の固定色**（`evergreen_foliage`）
  {
    from: "spruce_leaves",
    texture: "spruce_leaves",
    sound: "grass",
    render: "alpha_test",
    tint: "evergreen_foliage",
  },

  // ---- ジェネレータの目印（2026-08-24 追加）
  // **独自ブロックにする。** 壊されると湧かなくなるので守る必要があり、
  // 座標に頼らず種類だけで守れる方が確実。
  //
  // > ジェネレータの検出は**この識別子を見ること。**
  // > バニラの鉄・金・ダイヤ・エメラルドブロックは、
  // > プレイヤーが持ち込んだものなので目印ではない。**区別が付くようになる。**
  { from: "iron_block", texture: "iron_block", sound: "iron" },
  { from: "gold_block", texture: "gold_block", sound: "metal" },
  { from: "diamond_block", texture: "diamond_block", sound: "metal" },
  // **エメラルドだけ旧テクスチャを使う**（2026-08-24）。
  // バニラに旧版のキーは無いので、画像をリソースパックに置いて登録した
  //（`resource_packs/game/textures/terrain_texture.json`）
  { from: "emerald_block", texture: "game_emerald_block_legacy", sound: "metal" },
];

/**
 * **まだ入れていないもの。**
 *
 * `blue_concrete` / `red_concrete` は立方体なので置き換えられるが、
 * **コアがこの色である可能性がある。**
 * コアを置き換えると壊せなくなり、ゲームが成立しない。
 *
 * コアの色が確定してから、片方だけを足すこと。
 */
export const PENDING = ["blue_concrete", "red_concrete"];

/**
 * 面ごとのテクスチャ指定を `material_instances` に組み立てる。
 *
 * `glass` が真なら**透過するように描く**。
 * `render_method` を既定のまま（`opaque`）にすると、
 * ステンドグラスが**ただの不透明な板**になる。
 */
function materialInstances(texture, glass, render, tint) {
  const extra = glass
    ? { render_method: "blend", face_dimming: false, ambient_occlusion: 0 }
    : {};
  if (render !== undefined) extra.render_method = render;
  if (tint !== undefined) extra.tint_method = tint;
  if (typeof texture === "string") return { "*": { texture, ...extra } };
  const out = { "*": { texture: texture.side, ...extra } };
  if (texture.up) out.up = { texture: texture.up, ...extra };
  if (texture.down) out.down = { texture: texture.down, ...extra };
  return out;
}

/**
 * 向き（`pillar_axis`）を持つブロックの定義を組み立てる。
 *
 * ## なぜ要るか
 *
 * 丸太とヒカリゴケは**横倒しに置ける**。木目の向きが変わる。
 * 向きを持たない独自ブロックに差し替えると、
 * **横倒しだったものが全部縦になり、見た目が崩れる。**
 *
 * ## どうやるか
 *
 * 状態 `game:axis`（x / y / z）を持たせ、
 * **permutation で模型ごと回す**（`minecraft:transformation`）。
 * 面ごとのテクスチャも一緒に回るので、木目の向きが正しく出る。
 */
const AXIS_STATE = "game:axis";

function axisPermutations() {
  return [
    // y は既定の向き。回さない
    { condition: `q.block_state('${AXIS_STATE}') == 'x'`, components: { "minecraft:transformation": { rotation: [0, 0, 90] } } },
    { condition: `q.block_state('${AXIS_STATE}') == 'z'`, components: { "minecraft:transformation": { rotation: [90, 0, 0] } } },
  ];
}

function blockJson(b) {
  const id = `${NAMESPACE}:${PREFIX}${b.from}`;
  return {
    format_version: FORMAT,
    "minecraft:block": {
      description: {
        identifier: id,
        ...(b.axis === true ? { states: { [AXIS_STATE]: ["x", "y", "z"] } } : {}),
        // **クリエイティブの持ち物一覧に出す。**
        // 試合はサバイバルなので、遊ぶ側の手には渡らない。
        // 作り手がマップを直すときに要る
        menu_category: { category: "construction" },
      },
      components: {
        "minecraft:geometry": "minecraft:geometry.full_block",
        "minecraft:material_instances": materialInstances(b.texture, b.glass === true, b.render, b.tint),

        // **壊せなくする。**
        // ただしクリエイティブでどうなるかは未確認
        //（docs/research/10-custom-block-replacement.md 3-4）。
        // スクリプト側の保護と二重にかけてある
        "minecraft:destructible_by_mining": false,
        "minecraft:destructible_by_explosion": false,

        // 立方体として振る舞わせる
        "minecraft:collision_box": true,
        "minecraft:selection_box": true,

        // **透過するブロックは光を遮らない。** 15 のままだと中が真っ暗になる
        "minecraft:light_dampening": b.glass === true || b.render === "alpha_test" ? 0 : 15,

        // 光るブロックだけ付ける
        ...(b.light !== undefined ? { "minecraft:light_emission": b.light } : {}),

        // ------------------------------------------------------------------
        // **採掘と爆発以外の壊し方も、ここで塞ぐ。**
        //
        // スクリプトで止められるのは `playerBreakBlock` と `explosion` だけ。
        // ピストン・炎・液体には**イベントが無い**ので、
        // ブロック定義で拒否するしかない
        // ------------------------------------------------------------------

        // **ピストンで動かされない。**
        // 押し出して奈落へ落とす、引き込んで穴を開ける、を防ぐ
        "minecraft:movable": { movement_type: "immovable" },

        // **燃えない。** 隣の炎から燃え移らず、燃やされても壊れない
        "minecraft:flammable": false,

        // **水に流されない。** 既定も blocking だが、明示しておく
        "minecraft:liquid_detection": {
          detection_rules: [
            { liquid_type: "water", on_liquid_touches: "blocking", can_contain_liquid: false },
          ],
        },
      },
      // **向きを持つものだけ permutation を足す**
      ...(b.axis === true ? { permutations: axisPermutations() } : {}),
    },
  };
}

// ---------------------------------------------------------------- 書き出し
const blockDir = join(BP, "blocks");
mkdirSync(blockDir, { recursive: true });

// **前回の生成物を消してから作る。**
// 一覧から外したブロックが残り続けると、パックに幽霊が住む
let removed = 0;
if (existsSync(blockDir)) {
  for (const f of readdirSync(blockDir)) {
    if (f.startsWith(PREFIX) && f.endsWith(".json")) {
      rmSync(join(blockDir, f));
      removed++;
    }
  }
}

for (const b of BLOCKS) {
  writeFileSync(
    join(blockDir, `${PREFIX}${b.from}.json`),
    JSON.stringify(blockJson(b), null, 2) + "\n",
  );
}

// リソースパック側は**音だけ**。テクスチャは BP の material_instances で指定済み
mkdirSync(RP, { recursive: true });
const rpBlocks = { format_version: RP_BLOCKS_FORMAT };
for (const b of BLOCKS) {
  rpBlocks[`${NAMESPACE}:${PREFIX}${b.from}`] = { sound: b.sound };
}
writeFileSync(join(RP, "blocks.json"), JSON.stringify(rpBlocks, null, 2) + "\n");

console.log(`独自ブロックを ${BLOCKS.length} 種 生成（前回の ${removed} 件を削除）`);
for (const b of BLOCKS) {
  console.log(`  ${NAMESPACE}:${PREFIX}${b.from}`.padEnd(34) + `← ${b.from}`);
}
console.log(`\n  BP: ${blockDir}`);
console.log(`  RP: ${join(RP, "blocks.json")}`);
