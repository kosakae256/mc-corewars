/**
 * ★3 の敵。
 *
 * **決定表は [`docs/07-enemy-plan.md`](../../../../docs/07-enemy-plan.md) 6-3 章。**
 * **表に書いてあるものだけを、そのまま写す。**
 *
 * > ### **★ごとにファイルを分けてある**（2026-09-08）
 * >
 * > **1 ファイル 300 行までという決まりがある**（`eslint` の `max-lines`）。
 * > **50体分を一枚にせず、★ごとに分けて行数超過と作業の競合を避ける。**
 */

import type { EnemyDef } from "../enemy.js";

export const STAR3: Readonly<Record<string, EnemyDef>> = {
  zroyal: {
    id: "zroyal",
    name: "近衛ゾンビ",
    star: 3,
    hp: 80,
    attack: 20,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 0.9,
    head: "minecraft:golden_helmet",
    hand: "minecraft:golden_sword",
  },

  sroyal: {
    id: "sroyal",
    name: "近衛スケルトン",
    star: 3,
    hp: 60,
    attack: 12,
    speed: 1.0,
    interval: 50,
    reach: 15,
    kind: "shoot",
    shot: 2.025,
    emerald: 3,
    knockback: 0.4,
    hand: "minecraft:bow",
    head: "minecraft:golden_helmet",
  },

  // ---- **バニラの見た目を借りるもの**（型 A・`24-mob-howto.md` 9-2）

  // **大スライム**（`07-enemy-plan.md` 6-3）。**跳ねて進む**——**作り方は `24-mob-howto.md` 14 章。**
  // **速度 1.0 は便宜上の値**。**跳ね方そのものが速さになる。**
  // **倒すと ★1 の `slime` が 4 体出る**（`fall.split`・`25-enemy-kit.md` 10 章）。
  // **エメラルドは本体では貰えない**（`emerald: 0`）——**払うのは子の 4 体。**
  // **見た目はバニラの「中」スライム**（`minecraft:variant` 2・当たり判定 1.04）
  bigslime: {
    // **中スライムの見た目**（`07-enemy-plan.md` ★3）
    variant: 2,
    id: "bigslime",
    name: "大スライム",
    star: 3,
    hp: 80,
    attack: 15,
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 0,
    knockback: 0.4,
    fall: { split: { into: "slime", count: 4 } },
  },

  // **骨マン**。**ふざけモブ**——**速度 5.0・攻撃速度 20.0（＝ 1 tick に 1 発）・HP 1・力 1。**
  // **押しても動かない**（`knockback: 0`）。**弓は持たない**ので `hand` を書かない
  boneman: {
    id: "boneman",
    name: "骨マン",
    star: 3,
    hp: 1,
    attack: 1,
    speed: 5.0,
    interval: 1,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 0,
  },

  // **劇薬**。**瓶を投げる**（`lob`・`25-enemy-kit.md` 3 章）。**力は 0**——**削るのは毒だけ。**
  // **毒は最大 HP の 20 % を 10 秒（200 tick）かけて**（`services/ailment.ts`）。
  // **飛距離 12 マス・着弾まで 30 tick は、ボマー（10 マス／30 tick）を基準に決めた**——
  // **同じ「見て避けられる」速さのまま、力を持たないぶん間合いだけ広げてある**（2026-09-08）
  venom: {
    // **力 0。ダメージは毒だけ**——**殴っても削らない**
    noMelee: true,
    id: "venom",
    name: "劇薬",
    star: 3,
    hp: 60,
    attack: 0,
    // **移動速度 0.8**（2026-09-09 に 1.5 から下げた）
    speed: 0.8,
    // **3 マスより近づかない**（`entities/venom.json` の `avoid_mob_type`）
    standoff: 3,
    // **攻撃速度 0.5 ＝ 40 tick に 1 本**（2026-09-09 に 2.0 から下げた）
    interval: 40,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 0,
    // > ### **バニラのウィッチと同じ投げ方**
    // >
    // > **山なりに瓶を投げ、落ちた所に半径 2.5 の毒だまりが一瞬出る。**
    // > **爆発はしない**（`services/throw.ts`）。
    lob: {
      range: 12,
      // **着弾まで 14 tick**（2026-09-09 に 30 から縮めた）——
      // **30 だと山が高すぎて、頭の上から湧いて落ちてくるように見えた**
      flight: 14,
      // **溜め 20 tick**（1 秒）。**腕を振り上げてから離す**
      windup: 20,
      // **瓶の実体を投げる**（`24-mob-howto.md` 16-9）。**跡は出さない**
      body: "pve_v3:flask",
      noTrail: true,
      // **5 秒かけて最大 HP の 20 %**——**1 秒に 4 % を 5 回**（2026-09-09）
      poison: { pct: 20, ticks: 100, radius: 2.5 },
    },
  },

  // **ブレイズ**。**浮ける**（`fly`）。**炎を 3 連射**——
  // **3 連射・間隔 0.3 秒・溜め 4 秒はバニラのブレイズと同じ**
  // 溜めと連射はScriptで管理し、接近中も時計を進める（spec/40）。
  // 弾速0.75マス／tick。30マス以内で溜め始め、弾は60マスまで飛ぶ。
  blaze: {
    // **背の高いまま飛ぶ**（引っかからないので切らない）
    tallFly: true,
    // > ### **玉の実体は連れない**（2026-09-08 決定）
    // >
    // > **`pve_v3:fireball` を湧かせようとして「出せなかった」と出ていた。**
    // > **矢のときと同じ**（`24-mob-howto.md` 10-4）——**粒だけで足りる。**
    // **散らばり**（度）。**10 は散りすぎたので 4 に**（2026-09-08）
    spread: 4,
    // **玉が大きいぶん、当たりも太く**
    shotFat: 1.6,
    // **炎の軌跡**（矢の粒と見分ける）
    trail: "pve_v3:foe_fire",
    // **3 連射・溜め 4 秒はバニラのブレイズと同じ**（段で一緒に縮む）
    charge: { shoot: 4, burst: 3, burstGap: 0.3, commit: true, approach: 10, particle: "pve_v3:blaze_charge" },
    id: "blaze",
    name: "ブレイズ",
    star: 3,
    hp: 60,
    attack: 20,
    speed: 1.0,
    interval: 80,
    reach: 30,
    kind: "shoot",
    shot: 0.75,
    emerald: 3,
    // **火の弾で弾く**（2026-09-08 決定。表の 0 から変更）
    knockback: 0.4,
    fly: true,
  },

  // ---- **自前スキンの人型**（型 B・`24-mob-howto.md` 9-2）

  // **カウボーイ**。**銃弾は飛ばない**——**撃った瞬間に当たる線**（`beam`・`25-enemy-kit.md` 8 章）。
  // **射程 20 マス・貫通しない。** **攻撃速度 0.5 ＝ 40 tick に 1 発**
  gunner: {
    // 射撃中は停止、射程外・射線なしでは接近する（spec/38）。
    noMelee: true,
    id: "gunner",
    name: "カウボーイ",
    hand: "pve_v3:pistol",
    star: 3,
    hp: 40,
    attack: 10,
    speed: 1.0,
    // **攻撃速度 0.8 ＝ 25 tick に 1 発**（2026-09-09 に 0.5 から上げた）
    interval: 25,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 1.0,
    // **弾速 2.5 マス／tick**（2026-09-09）。**即着 → 4 → 2.5** と落とした——
    // **見てから避けられる速さ**（20 マス先まで 8 tick）
    beam: { range: 20, speed: 2.5 },
  },

  // **飛行**。**飛んで移動する**（`fly`・`25-enemy-kit.md` 11 章）。
  // **ファントムと違い、壁は抜けない**——`navigation.fly` で経路を探す
  flyer: {
    id: "flyer",
    name: "飛行",
    star: 3,
    hp: 60,
    attack: 10,
    // **飛ぶ敵の物差し**（バニラのコウモリは 0.1）
    baseSpeed: 0.15,
    hover: { min: 1, max: 5 },
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 1.0,
    fly: true,
  },

  // **ボマー**。**投げるだけ**（`lob`）。**飛距離 10 マス・着弾まで 30 tick（1.5 秒）**——
  // **見て避けられる。** **着弾で半径 3 の爆発**（`boomRadius`）。
  // **爆発を持つので押す強さは 0 にしない**（`07-enemy-plan.md` 6 章の共通の決まり）
  bomber: {
    // **投げる敵は間合いを取る**（`core/trait.ts` の `standoff`）
    standoff: 6,
    // **近接は無い。投げるだけ**（`07-enemy-plan.md` ★3）。**寄りはする**
    noMelee: true,
    id: "bomber",
    name: "ボマー",
    star: 3,
    hp: 60,
    attack: 15,
    speed: 1.0,
    // **攻撃速度 1.0 ＝ 20 tick に 1 発**（2026-09-09 に 0.5 から 2 倍にした）
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 3.0,
    // > ### **小さい爆弾を投げて、落ちてから爆ぜる**（2026-09-09 に変えた）
    // >
    // > **その場で爆ぜるのをやめた。** **地面に着いてから 1.5 秒**——
    // > **爆弾と同じで、膨らんで赤く点滅し、範囲の円が地面に出る。**
    // > **半径は 2**（爆弾の 4 より小さい）。**投げる物も小さい**（`pve_v3:minibomb`）。
    // **狙いは足元から半径 3 マスに散る**（`core/trait.ts` の `scatter`）
    lob: { range: 10, flight: 30, boomRadius: 2, fuse: 30, scatter: 3, body: "pve_v3:minibomb", noTrail: true },
  },

  // **タンク**。**備考は空**——**ただ硬くて速いだけ。**
  // **「少し大きい」は `pve3-newmob.mjs --scale 1.2`**、**盾は `hand`**（見た目だけ）
  tank: {
    id: "tank",
    name: "タンク",
    star: 3,
    hp: 200,
    attack: 3,
    // **速度は 2026-09-08 に 3.0 → 1.0**（速すぎた）
    speed: 1.0,
    interval: 40,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 0.5,
    hand: "minecraft:shield",
  },

  // **恵み**。**攻撃しない**（力 0・押す 0）。
  // **周り 5 マスの敵を、1 tick ごとに最大 HP の 0.25 % 回復**（`aura`・`25-enemy-kit.md` 9 章）。
  // **プレイヤーからは常に 10 マス以上離れる**（`keepAway`）
  healer: {
    id: "healer",
    name: "恵み",
    star: 3,
    hp: 100,
    attack: 0,
    // 支援役の移動速度を1.0へ戻す（spec/38）。
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 0,
    aura: { healPct: 0.25, keepAway: 10 },
  },

  // **鼓舞**。**攻撃しない**（力 0・押す 0）。
  // **周り 5 マスの敵は、5 秒間（100 tick）攻撃力が 1.5 倍**（`aura`）。
  // **恵みと同じく、プレイヤーからは 10 マス以上離れる**
  rouser: {
    id: "rouser",
    name: "鼓舞",
    star: 3,
    hp: 100,
    attack: 0,
    // **恵みと同じ足並み**（2026-09-09）
    speed: 1.0,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 3,
    knockback: 0,
    aura: { atkMult: 1.5, atkTicks: 100, keepAway: 10 },
  },
};
