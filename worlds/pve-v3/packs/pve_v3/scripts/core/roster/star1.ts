/**
 * ★1 の敵。
 *
 * **決定表は [`docs/07-enemy-plan.md`](../../../../docs/07-enemy-plan.md) 6-1 章。**
 * **表に書いてあるものだけを、そのまま写す。**
 *
 * > ### **★ごとにファイルを分けてある**（2026-09-08）
 * >
 * > **1 ファイル 300 行までという決まりがある**（`eslint` の `max-lines`）。
 * > **50 体を 1 枚に書くと、必ず超える。**
 * > **★ごとに分ければ、別の★を足す人と手がぶつからない。**
 */

import type { EnemyDef } from "../enemy.js";

export const STAR1: Readonly<Record<string, EnemyDef>> = {
  grunt: {
    id: "grunt",
    name: "ゾンビ",
    star: 1,
    hp: 40,
    attack: 10,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 1,
    knockback: 0.9,
  },
  // スケルトン系の矢は40.5マス／秒。15マスで撃ち始め、30マスまで飛ぶ。

  archer: {
    id: "archer",
    name: "スケルトン",
    star: 1,
    hp: 40,
    attack: 7,
    speed: 1.0,
    interval: 60,
    reach: 15,
    kind: "shoot",
    shot: 2.025,
    emerald: 1,
    knockback: 0.4,
    hand: "minecraft:bow",
  },

  // ---- ゾンビ系（中核・`docs/07-enemy-plan.md` 6 章）。**★は被り物で見分ける**

  silver: {
    id: "silver",
    name: "紙魚",
    star: 1,
    hp: 20,
    attack: 5,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 0.5,
    knockback: 0.4,
  },

  // **スライム**（`07-enemy-plan.md` 6-1）。**跳ねて進む**——**作り方は `24-mob-howto.md` 14 章。**
  // **速度 1.0 は便宜上の値**。**跳ね方そのものが速さになる**ので、`movement` だけでは決まらない

  slime: {
    // **小スライム。** **書かないと倍率 0 で透明になる**（`core/trait.ts`）
    variant: 1,
    id: "slime",
    name: "スライム",
    star: 1,
    hp: 20,
    attack: 5,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 1,
    knockback: 0.4,
  },

  // **コウモリ**（`07-enemy-plan.md` 6-1）。**敵対する飛行モブ。**
  // **飛ぶ部品は `fly` の旗が入れる**（`25-enemy-kit.md` 11 章）——**手で書かない。**
  // **攻撃速度 3.0 ＝ `interval` 20 / 3.0 ≒ 7 tick。**
  // **速度 1.0 は「バニラのコウモリと同じ速さ」という意味**——**歩きの換算とは別**

  bat: {
    id: "bat",
    name: "コウモリ",
    star: 1,
    hp: 5,
    attack: 1,
    // **飛ぶ敵の物差し**（バニラのコウモリは 0.1）
    // **飛ぶ速さの素**（`25-enemy-kit.md` 11-3）。**0.5 は速すぎた**
    baseSpeed: 0.15,
    hover: { min: 1, max: 4 },
    speed: 1.0,
    interval: 7,
    reach: 2.5,
    kind: "melee",
    emerald: 0.5,
    knockback: 0.9,
    fly: true,
  },

  // **ヒツジ**（`07-enemy-plan.md` 6-1）。**中立モブ**（`25-enemy-kit.md` 12 章）。
  // **`neutral` の旗で `behavior.nearest_attackable_target` が外れ、
  // `behavior.hurt_by_target` だけが残る**——**殴られるまで襲ってこない**

  sheep: {
    id: "sheep",
    name: "ヒツジ",
    star: 1,
    hp: 80,
    attack: 15,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 1,
    knockback: 0.9,
    neutral: true,
  },
};
