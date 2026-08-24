/**
 * クラフトを禁止するレシピを生成する。
 *
 * 仕様は `worlds/core-wars/docs/spec/11-match.md` 6-H。
 *
 * ## 何をするか
 *
 * **バニラのレシピを、同じ識別子で上書きする。**
 *
 * レシピの `tags` は「どこで作れるか」を表す。
 * **空にすると、どこでも作れなくなる。**
 *
 * 作業台も、持ち物の 2x2 も、同時に塞げる。
 *
 * ## なぜ生成するのか
 *
 * 対象は 1180 件。**手では書けない。**
 *
 * バニラのレシピを読んで、**識別子と種類だけを写す。**
 * Minecraft の版が上がってレシピが増えたら、
 * **動かし直すだけ**で追従できる。
 *
 * ## 使い方
 *
 *   node tools/gen-no-craft.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

/** 読み取り元。**編集しない**（`reference/README.md`） */
const SRC = join(ROOT, "reference", "bedrock-samples", "behavior_pack", "recipes");

/** 書き出し先 */
const DST = join(ROOT, "worlds", "core-wars", "packs", "game", "behavior_packs", "game", "recipes");

/**
 * **禁止しない**レシピ。
 *
 * ここに載っているものだけは、バニラのまま作れる。
 *
 * > **足すときは理由を書くこと。**
 * > クラフトを許すと、ショップを通さずに物が手に入る。
 * > 経済の設計（`docs/01-rules.md`）に直接効く。
 */
const ALLOWED = new Set([
  // はさみ（2026-08-24）。使い道は未確定
  "minecraft:shears",
]);

/**
 * 塞ぐ対象のタグ。
 *
 * **`crafting_table` だけ。** かまど・醸造台・石切台には触らない。
 * 塞ぐ理由が無いし、触ると壊す範囲が広がる。
 */
const TARGET_TAG = "crafting_table";

/**
 * 差し替え先の作り場。
 *
 * ## `tags: []` は使えない
 *
 * 空にすると「No tags specified」「Recipe has no result item(s)」で
 * **不正なレシピとして弾かれ、上書きが成立しない。**
 * バニラのレシピがそのまま残る。実際にそうなった。
 *
 * **正しいレシピの形を保ったまま、作り場だけを存在しないものにする。**
 * この名前の作り場はゲーム内に無いので、どこでも作れない。
 */
const NOWHERE = "game:nowhere";

/**
 * 差し替え先の材料と結果。
 *
 * **形は正しく、内容は無意味に。**
 * 結果を空にできないので、何かを指定する必要がある。
 * 作り場が存在しないので、この内容が実際に使われることはない。
 *
 * `minecraft:air` は**アイテムとして扱えず弾かれる**ので使わない。
 * バリアブロックなら実在し、かつ**万一作れても誰も欲しがらない。**
 */
const DUMMY_ITEM = "minecraft:barrier";

/**
 * 差し替えるレシピの形式のバージョン。
 *
 * **1.20 以上にすると `unlock` が必須になる。**
 * 「1.20+ Recipes require unlock data」で弾かれ、
 * **バニラのレシピがそのまま残る。** 実際にそうなった。
 *
 * こちらは「作れないこと」だけが目的で、解放条件に意味は無い。
 * **古い形式に固定して、要求そのものを避ける。**
 */
const FORMAT = "1.12.0";

// ---------------------------------------------------------------- 生成
mkdirSync(DST, { recursive: true });

// **前回の生成物を消してから作る。**
// バニラから消えたレシピが残り続けると、幽霊のレシピになる
let removed = 0;
if (existsSync(DST)) {
  for (const f of readdirSync(DST)) {
    if (f.endsWith(".json")) {
      rmSync(join(DST, f));
      removed++;
    }
  }
}

let blocked = 0;
let allowed = 0;
let skipped = 0;
let duplicated = 0;

/**
 * 既に書いた識別子。
 *
 * **バニラには、同じ識別子を持つファイルが複数ある。**
 * そのまま写すと「duplicate identifier in same pack」で弾かれ、
 * **その分だけ上書きが成立しない。**
 */
const written = new Set();

for (const file of readdirSync(SRC)) {
  if (!file.endsWith(".json")) continue;
  const src = JSON.parse(readFileSync(join(SRC, file), "utf8"));

  for (const [kind, body] of Object.entries(src)) {
    if (!kind.startsWith("minecraft:recipe")) continue;
    const tags = body.tags ?? [];
    if (!tags.includes(TARGET_TAG)) {
      skipped++;
      continue;
    }
    const id = body.description?.identifier;
    if (id === undefined) continue;
    if (ALLOWED.has(id)) {
      allowed++;
      continue;
    }
    // **同じ識別子は 1 度だけ。** 重複するとパックごと弾かれる
    if (written.has(id)) {
      duplicated++;
      continue;
    }
    written.add(id);

    // **形は正しいレシピのまま、作り場だけを存在しないものにする。**
    //
    // `tags: []` にすると不正なレシピとして弾かれ、
    // **バニラのレシピがそのまま残る。** 上書きにならない
    const out = {
      format_version: FORMAT,
      [kind]: {
        description: { identifier: id },
        tags: [NOWHERE],
        ...(kind === "minecraft:recipe_shaped"
          ? {
              pattern: ["#"],
              key: { "#": { item: DUMMY_ITEM } },
            }
          : { ingredients: [{ item: DUMMY_ITEM }] }),
        result: { item: DUMMY_ITEM },
      },
    };
    writeFileSync(join(DST, file), JSON.stringify(out, null, 2) + "\n");
    blocked++;
  }
}

console.log(`クラフト禁止のレシピを生成（前回の ${removed} 件を削除）`);
console.log(`  禁止した      ${blocked} 件`);
console.log(`  許可したまま  ${allowed} 件  ${[...ALLOWED].join(", ")}`);
console.log(`  対象外        ${skipped} 件（かまど・醸造台・石切台など）`);
console.log(`  重複で飛ばした ${duplicated} 件`);
console.log(`\n  → ${DST}`);
