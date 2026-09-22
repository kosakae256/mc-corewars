/**
 * ★2 の敵。
 *
 * **決定表は [`docs/07-enemy-plan.md`](../../../../docs/07-enemy-plan.md) 6-2 章。**
 * **表に書いてあるものだけを、そのまま写す。**
 *
 * > ### **★ごとにファイルを分けてある**（2026-09-08）
 * >
 * > **1 ファイル 300 行までという決まりがある**（`eslint` の `max-lines`）。
 * > **50 体を 1 枚に書くと、必ず超える。**
 * > **★ごとに分ければ、別の★を足す人と手がぶつからない。**
 */

import type { EnemyDef } from "../enemy.js";

export const STAR2: Readonly<Record<string, EnemyDef>> = {
  zguard: {
    id: "zguard",
    name: "衛兵ゾンビ",
    star: 2,
    hp: 60,
    attack: 15,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 0.9,
    head: "minecraft:leather_helmet",
    hand: "minecraft:wooden_sword",
  },

  sbowman: {
    id: "sbowman",
    name: "弓兵スケルトン",
    star: 2,
    hp: 40,
    attack: 10,
    speed: 1.0,
    interval: 60,
    reach: 15,
    kind: "shoot",
    shot: 2.025,
    emerald: 2,
    knockback: 0.4,
    hand: "minecraft:bow",
    head: "minecraft:leather_helmet",
  },

  crusher: {
    id: "crusher",
    name: "重撃",
    star: 2,
    hp: 60,
    attack: 25,
    speed: 1.0,
    interval: 29,
    reach: 2.5,
    kind: "melee",
    // **重い一発に見せる**（見た目だけ。力は `attack`）
    hand: "minecraft:iron_axe",
    emerald: 2,
    knockback: 0.9,
  },

  // ---- その他（バニラの見た目を借りる近接・`07-enemy-plan.md` 6-1）

  // **ウシ**（`07-enemy-plan.md` 6-2）。**中立**——**殴られるまで襲ってこない**。
  // **`neutral` を書くと、狙いを付ける部品（`nearest_attackable_target`）が外れ、
  // `hurt_by_target` だけが残る**（`25-enemy-kit.md` 12 章）。
  cow: {
    id: "cow",
    name: "ウシ",
    star: 2,
    hp: 120,
    attack: 20,
    speed: 1.1,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 0.9,
    neutral: true,
  },

  // ---- 自前スキンの人型（型 B・`24-mob-howto.md` 9-2）

  // **冷気**。**殴った相手に鈍足 2 を 2 秒**——
  // **`amp: 1` が鈍足 2**（段は 0 から数える）、**40 tick が 2 秒**。
  // 付けるのは `services/melee.ts`（`25-enemy-kit.md` 5 章）
  chiller: {
    id: "chiller",
    name: "冷気",
    star: 2,
    hp: 40,
    attack: 10,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 0.4,
    ailment: { slow: { amp: 1, ticks: 40 } },
  },

  // **丸ノコ**。**1 発は軽いが、手数で削る**——
  // **攻撃速度 10.0 ＝ 2 tick に 1 回**、**押さない（`knockback: 0`）**
  sawman: {
    id: "sawman",
    name: "丸ノコ",
    star: 2,
    hp: 40,
    attack: 2,
    speed: 1.0,
    interval: 2,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 0,
  },

  // **投石ハスク**（`07-enemy-plan.md` 6-2）。**近接を持ったまま、石も投げる。**
  // **`lob` は `services/throw.ts` が投げる**（`25-enemy-kit.md` 3 章）——
  // **飛距離 7 マス・着弾まで 10 tick（0.5 秒）＝ 見てから避けられない。**
  // **攻撃速度 0.5 ＝ `interval` 40**（殴りも投げも、この間隔で回る）
  slinger: {
    id: "slinger",
    name: "投石ハスク",
    star: 2,
    hp: 40,
    attack: 20,
    speed: 1.0,
    interval: 40,
    // **この距離まで寄ったら投げる**（`ranged_attack` の `attack_radius`）
    reach: 7,
    // **スケルトンと同じ AI**（寄って、止まって、投げる）。近接は持たない
    kind: "shoot",
    emerald: 2,
    knockback: 0.9,
    // **山なりに投げる**（`arc`）。飛距離 7・着弾 0.5 秒。
    // **`arc` を書くと、投げる瞬間に腕を振る**（`25-enemy-kit.md` 3-1）
    lob: { range: 7, flight: 10, arc: true },
    // **飛ぶのは石の実体**（`25-enemy-kit.md` 3-2）。**遅いので跡は残さない**——
    // **粒で見せると点が並んで、やはり跡に見えた**
    body: "pve_v3:rock",
    noTrail: true,
  },

  // **回転**。**自分の周りへまとめて斬る範囲攻撃**（`sweep`・`25-enemy-kit.md` 7 章）。
  // **半径 4 マス・全周（`angle: 360`）。**
  // **攻撃速度 0.25 ＝ `interval` 80 が、そのまま溜めの長さになる**
  spinner: {
    id: "spinner",
    name: "回転",
    star: 2,
    hp: 60,
    attack: 10,
    speed: 1.0,
    interval: 80,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 1.0,
    // **刀を持たせる**（`24-mob-howto.md` 16-5）。**溜めと回転斬りの見た目に要る**
    hand: "pve_v3:katana",
    sweep: { radius: 4, angle: 360 },
  },

  // **爆弾**。**自分では一切攻撃しない**——**寄ってくるだけ。**
  // **倒れた所へ爆弾を落とし、2 秒後（`fuse: 40`）に爆発する**
  // （`fall.bomb`・`services/onfall.ts`。**地面に範囲の予告が出る**）。
  // **力 40 は爆発の中心の値**——外へ行くほど減る。**半径 4 は共通の既定と同じ値**
  // （`core/tuning.ts` の `BOOM.radius`）を**明示して書く**——
  // **予告の円（`stepBombs`）と爆発の範囲を、必ず一致させるため。**
  //
  // > ### **「攻撃しない」は部品を外して作った**（`24-mob-howto.md` 9-1）
  // >
  // > **殴りは `melee_box_attack` がバニラで当てている**ので、
  // > **`interval` をいくら伸ばしても「最初の 1 発」は入ってしまう。**
  // > **`entities/bomblet.json` から `minecraft:attack` と `melee_box_attack`（41 段ごと）を外し、
  // > 代わりに `behavior.move_towards_target` を入れて「寄るだけ」にした。**
  // > **この `interval` は使われない**——**起こし直したときに殴り出さないよう、長く取ってある。**
  bomblet: {
    // **自分では一切攻撃しない**（`07-enemy-plan.md` ★2）。**寄りはする**
    noMelee: true,
    id: "bomblet",
    name: "爆弾",
    star: 2,
    hp: 20,
    attack: 40,
    speed: 1.5,
    interval: 12000,
    reach: 2.5,
    kind: "melee",
    emerald: 2,
    knockback: 3.0,
    fall: { bomb: { radius: 4, fuse: 40 } },
  },

  // **ガスト**。**飛ぶ**（`fly`・`25-enemy-kit.md` 11 章）。**自前の爆発弾を撃つ。**
  // **`kind: "shoot"` ＋ `lob.boomRadius` で、`services/mobshot.ts` が「落ちる爆発弾」にする**
  // （`lob` を持つ撃つ敵には重力が付く）。**地面か人に当たった所で爆ぜる。**
  // **弾速 0.5 マス／tick。** **撃ち始めるのは 15 マス**（ほかの撃つ敵と同じ）——
  // **弾はその 2 倍まで飛ぶ**（`24-mob-howto.md` 10-5）。
  // **溜め 2 秒は `entities/gast.json` の `charge_shoot_trigger` / `charge_charged_trigger`**
  // （バニラのガストと同じ値。**41 段ぶんにも書いてある**）。
  // **爆発の半径 3 は、クリーパー・爆弾の 4 より小さい**——
  // **一度きりのあちらと違い、4 秒おきに空から撃ち続ける**ため。
  gast: {
    id: "gast",
    name: "ガスト",
    star: 2,
    hp: 20,
    attack: 10,
    speed: 1.0,
    interval: 80,
    // **射程 50 マス**（2026-09-08 決定）。バニラのガストは 64
    reach: 50,
    kind: "shoot",
    // **弾速 0.75 マス／tick ＝ 15 マス／秒**（2026-09-09 に半分にした）。
    // **0.5 では遅すぎ、1.5 では速すぎた**——**その間**
    shot: 0.75,
    // **矢と同じ粒では見分けが付かない**——火の玉にする
    trail: "pve_v3:foe_fire",
    emerald: 2,
    knockback: 3.0,
    fly: true,
    // > ### **バニラのガストの速さを 1.0 とする**（`bedrock-samples` の `ghast.json`）
    // >
    // > **バニラは `minecraft:movement: 0.03`**——**歩く敵の 1/10 未満。**
    // > **歩く物差し（0.2875）で 1.0 にすると、目で追えない速さになっていた。**
    baseSpeed: 0.25,
    // **狙う人から見て 2〜6 マス上に居る**——**上に居続けると弓でしか届かない**
    hover: { min: 2, max: 6 },
    // > ### **溜めの合図は外した**（実測・2026-09-08）
    // >
    // > **`charge_shoot_trigger` と `attack_interval` を両方書くと、
    // > 溜めが済むたびに撃って、間隔が効かなくなった**——**連射になった。**
    // > **間隔だけで回す**（攻撃速度 0.25 ＝ 4 秒に 1 発）。
    // **当たった所・届いた所で爆ぜる**（`boomRadius` だけ使う。14-3 章）
    lob: { range: 50, flight: 30, boomRadius: 3 },
  },
};
