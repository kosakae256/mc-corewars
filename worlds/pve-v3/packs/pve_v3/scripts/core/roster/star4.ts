/**
 * ★4 の敵。
 *
 * **決定表は [`docs/07-enemy-plan.md`](../../../../docs/07-enemy-plan.md) 6-4 章。**
 * **表に書いてあるものだけを、そのまま写す。**
 *
 * > ### **★ごとにファイルを分けてある**（2026-09-08）
 * >
 * > **1 ファイル 300 行までという決まりがある**（`eslint` の `max-lines`）。
 * > **50 体を 1 枚に書くと、必ず超える。**
 * > **★ごとに分ければ、別の★を足す人と手がぶつからない。**
 */

import type { EnemyDef } from "../enemy.js";

export const STAR4: Readonly<Record<string, EnemyDef>> = {
  zknight: {
    id: "zknight",
    name: "騎士ゾンビ",
    star: 4,
    hp: 100,
    attack: 25,
    speed: 1.1,
    interval: 18,
    reach: 2.5,
    kind: "melee",
    emerald: 4,
    knockback: 0.9,
    head: "minecraft:iron_helmet",
    hand: "minecraft:iron_sword",
  },

  sknight: {
    id: "sknight",
    name: "騎士スケルトン",
    star: 4,
    hp: 80,
    attack: 15,
    speed: 1.1,
    interval: 50,
    reach: 15,
    kind: "shoot",
    shot: 2.025,
    emerald: 4,
    knockback: 0.4,
    hand: "minecraft:bow",
    head: "minecraft:iron_helmet",
  },

  // ---- バニラの見た目を借りる（型 A・`24-mob-howto.md` 9-2）

  // **クリーパー**（`07-enemy-plan.md` 6-4）。**攻撃は爆発だけ。近接の殴りは持たない。**
  // **`kind: "boom"` を書くと `features/mob/index.ts` が導火線を扱う**——
  // **間合い（`reach`）に入る → 攻撃速度ぶんの時間 → 爆発 → 消滅。**
  // **`boom.noStop` は書かない**ので、**離れると導火線が消える**（バニラと同じ）。
  // **爆発したらエメラルドは入らない**（`mob.remove()` で消すため `awardKill` を通らない）。
  //
  // **`radius: 4` / `up: 0.55` は `core/tuning.ts` の `BOOM` と同じ値**——
  // **クリーパーが基準で、★5 の帯電クリーパーがこれより広い。**
  //
  // > ### **`entities/creeper.json` に手で足したもの**
  // >
  // > **`minecraft:behavior.move_towards_target`（優先度 4）。**
  // > **ひな形は `kind` が boom の敵に攻撃部品を付けない**（`pve3-newmob.mjs`）——
  // > **正しい**（クリーパーは殴らない）**が、寄る足まで無くなる。**
  // > **狙いは付くのに近づかないので、導火線に永久に火が点かない。**
  // > **公式**: *move_towards_target — Allows mob to move towards its current target.*
  // > **`within_radius` は 0**（*tries to occupy the same block as the target*）。
  creeper: {
    // **帯電クリーパーと実体を分け合う**——**あちらの導火線は 1.5 秒**
    chargedInterval: 30,
    // **バニラのクリーパーを上書きしてある**（膨らみのため）
    spawnId: "minecraft:creeper",
    id: "creeper",
    name: "クリーパー",
    star: 4,
    hp: 100,
    attack: 150,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "boom",
    emerald: 4,
    knockback: 3.0,
    // **半径 5**（2026-09-09 に 4 から広げた）
    boom: { radius: 5, up: 0.55 },
  },

  // **闇魚**（`07-enemy-plan.md` 6-4）。**備考は空**——**ただ速くて硬いだけ。**
  // **エメラルド倍率だけ ★4 の例外で 2.0**（表のとおり）
  mite: {
    id: "mite",
    name: "闇魚",
    star: 4,
    hp: 60,
    attack: 10,
    speed: 1.5,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 0.4,
  },

  // ---- 自前スキンの人型（型 B・`24-mob-howto.md` 9-2）

  // **ファントム**。**自由に飛ぶ**——**`fly` の旗で飛ぶ部品に差し替わる**
  // （`25-enemy-kit.md` 11 章）。
  // **表にある「壁を通り抜ける」は未実装**——**共通部品に抜ける仕組みが無い。**
  wraith: {
    // **壁を抜ける**（`07-enemy-plan.md` ★4）
    ghost: true,
    id: "wraith",
    name: "ファントム",
    star: 4,
    hp: 80,
    attack: 10,
    // **飛ぶ敵の物差し**（バニラのコウモリは 0.1）
    baseSpeed: 0.15,
    hover: { min: 1, max: 5 },
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 4,
    knockback: 1.0,
    fly: true,
  },

  // **テレポート**。**10 秒に 1 回、戦っている人の所へ跳ぶ**（`25-enemy-kit.md` 13 章）。
  // **200 tick ＝ 10 秒。** **見ているだけの人には跳ばない**のは部品側が見る
  blinker: {
    id: "blinker",
    name: "テレポート",
    star: 4,
    hp: 80,
    attack: 10,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 4,
    knockback: 0.5,
    blink: 200,
  },

  // **痛恨の一撃**。**押す強さが 2 段**——**普段は 0.1、20 倍が出たときだけ 5.0。**
  // **`knockback` が普段の値、`crit.knock` が出たときの値**（`services/melee.ts`）。
  // **力 5 × 20 ＝ 100**
  crit: {
    id: "crit",
    name: "痛恨の一撃",
    star: 4,
    hp: 150,
    attack: 5,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 4,
    knockback: 0.1,
    crit: { chance: 0.1, mult: 20, knock: 5.0, up: 0.9 },
  },

  // **散弾**。**弾は飛ばさない**——**`services/sweep.ts` がその場で当たりを決める**
  // （`25-enemy-kit.md` 7 章）。**`hits: 50` ＝ 同じ人に 50 回**（力 2 × 50 ＝ 100）。
  //
  // > ### **半径 6・広がり 30 度に決めた理由**
  // >
  // > **扇の中に居れば距離に関係なく 50 発ぶん入る**（`sweep.ts` は減衰しない）。
  // > **100 は初期 HP そのもの**——**「入ったら死ぬ」を、狭さと短さで釣り合わせる。**
  // >
  // > | | |
  // > | --- | --- |
  // > | **半径 6** | **近接（2.5）より遠く、弓（15）よりずっと近い。** 散弾らしい間合い |
  // > | **広がり 30 度** | **回転は 360・妖狐は 90**（`sweep.ts`）。**散弾がいちばん狭い** |
  // >
  // > **速度 0.5 で動きながら毎秒撃つ**ので、**横へ回れば必ず外せる。**
  shotgun: {
    // **殴らない**（寄る足として `melee_box_attack` は残す）
    noMelee: true,
    id: "shotgun",
    name: "散弾",
    star: 4,
    hp: 80,
    // **1 発 3**（2026-09-09。20 発ぜんぶ当たれば 60）
    attack: 3,
    speed: 0.5,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    // **自前の銃**（`24-mob-howto.md` 16-5）
    hand: "pve_v3:gun",
    emerald: 4,
    knockback: 0,
    // **20 マスで撃ち始める**（`sweep.radius` が「撃ち始める距離」）
    sweep: { radius: 20, angle: 30, atRange: true },
    // **実体のある弾を 20 発**（2026-09-09）。**弾速 2.0 マス／tick・届く距離 20 マス**
    buck: { count: 20, spread: 45, speed: 2.0, range: 20, body: "pve_v3:pellet", fat: 0.5 },
  },

  // **汚染**。**自分では攻撃しない**——**力 0 なので `services/melee.ts` が当てない。**
  // **倒れると半径 3 の円が 5 秒**（100 tick）**残り、2 tick ごとに最大 HP の 1 %**
  // （`25-enemy-kit.md` 4 章・10 章）
  taint: {
    id: "taint",
    name: "汚染",
    star: 4,
    hp: 120,
    attack: 4,
    speed: 2.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 4,
    knockback: 0,
    fall: { zone: { radius: 3, life: 100, cut: 1 } },
  },

  // 通常攻撃4、死に際の落雷50。呪いの倍率は両方へ適用する（spec/42）。
  charged: {
    id: "charged",
    name: "帯電",
    star: 4,
    hp: 120,
    attack: 50,
    meleeAttack: 4,
    speed: 2.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 4,
    knockback: 0,
    // **青い円 ＋ 落雷**（2026-09-10・`25-enemy-kit.md` 10-1）
    fall: { boom: { radius: 3, bolt: true } },
  },
};
