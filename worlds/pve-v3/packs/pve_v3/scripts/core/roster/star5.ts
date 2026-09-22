/**
 * ★5 の敵。
 *
 * **決定表は [`docs/07-enemy-plan.md`](../../../../docs/07-enemy-plan.md) 6-5 章。**
 * **表に書いてあるものだけを、そのまま写す。**
 *
 * > ### **★ごとにファイルを分けてある**（2026-09-08）
 * >
 * > **1 ファイル 300 行までという決まりがある**（`eslint` の `max-lines`）。
 * > **50 体を 1 枚に書くと、必ず超える。**
 * > **★ごとに分ければ、別の★を足す人と手がぶつからない。**
 */

import type { EnemyDef } from "../enemy.js";

export const STAR5: Readonly<Record<string, EnemyDef>> = {
  zgeneral: {
    id: "zgeneral",
    name: "将軍ゾンビ",
    // **★5 の固有色**（赤）
    color: "§c",
    star: 5,
    hp: 120,
    attack: 30,
    speed: 1.25,
    interval: 16,
    reach: 2.5,
    kind: "melee",
    emerald: 5,
    knockback: 0.9,
    head: "minecraft:diamond_helmet",
    hand: "minecraft:diamond_sword",
  },

  // ---- スケルトン系（中核）。**弾速と射程は ★で変えない**（未決定のため ★1 と同じ）

  sgeneral: {
    id: "sgeneral",
    name: "将軍スケルトン",
    // **★5 の固有色**（青）
    color: "§9",
    star: 5,
    hp: 100,
    attack: 25,
    speed: 1.25,
    interval: 40,
    reach: 15,
    kind: "shoot",
    shot: 2.025,
    emerald: 5,
    knockback: 0.4,
    hand: "minecraft:bow",
    head: "minecraft:diamond_helmet",
  },

  // ---- バニラの見た目を借りる（型 A・`24-mob-howto.md` 9-2）

  // 追尾弾。0.5秒ごとに撃ち、射線がないときは位置取りする（spec/38）。
  // **`homing` はバニラのシュルカー弾に寄せた 0.1 から、0.15 へ上げた**（2026-09-10）——
  // **1 なら即座に向いて避けられない、緩いほど回り込めば振り切れる**（`25-enemy-kit.md` 6 章）。
  // **弾は浮かせない**——**浮かせるのは爆発だけ**（`22-feedback.md` 6-2）
  seeker: {
    id: "seeker",
    name: "追尾弾",
    // **★5 の固有色**（紫・シュルカー）
    color: "§5",
    star: 5,
    hp: 100,
    // **15**（2026-09-10 に 30 から落とした）
    attack: 15,
    speed: 1.0,
    interval: 10,
    // **索敵も射程も 100 マス**（2026-09-10 に 16 から伸ばした）。**弾はその倍まで飛ぶ**
    reach: 100,
    kind: "shoot",
    // **0.15 マス／tick ＝ 3 マス／秒**（2026-09-10 に 0.3 から半分にした）。
    // **バニラのシュルカー弾よりさらに遅い**——**20 秒の寿命でも 60 マスしか進まない**
    shot: 0.15,
    emerald: 5,
    knockback: 0.5,
    // **0.15**（2026-09-10 に 0.1 から 1.5 倍）
    homing: 0.15,
    // **壁を無視して撃ち、弾は壁で消えず迂回する**（唯一の例外・`25-enemy-kit.md` 6-1）
    throughWall: true,
    // **消えるのは、当たったときと 20 秒の時間切れだけ**（`25-enemy-kit.md` 6-1-1）
    shotLife: 400,
    // **100 マス以内からランダムに 1 人選び、その人を追い続ける**（`25-enemy-kit.md` 6-1-2）
    lockOn: 100,
  },

  // **ゴーレム**（`07-enemy-plan.md` 6-5）。**殴り方はバニラのゴーレムと同じ**——**旗は無い。**
  // **「攻撃が全部、少し浮かせる」は共通部品に無い**（浮くのは爆発だけ）。**`knockback` だけ書いてある**
  golem: {
    id: "golem",
    name: "ゴーレム",
    // **★5 の固有色**（鉄灰）
    color: "§8",
    star: 5,
    hp: 500,
    attack: 10,
    speed: 0.5,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 5,
    knockback: 2.0,
    // **殴りでも少し浮かせる**（爆発以外で浮かせる唯一の敵・`22-feedback.md` 6-2）
    knockUp: 0.35,
  },

  // ---- 人型（自前の絵。`tools/pve3-skin.py`）

  // **チェンバー**（`07-enemy-plan.md` 6-5）。**弾速の無い高威力の一撃**——
  // **`beam` は撃った瞬間に当たる**（`25-enemy-kit.md` 8 章）。**貫通する。**
  // 射程50マス・4秒に1回。射撃時は停止し、射線がなければ位置取りする（spec/38）。
  chamber: {
    // **狙撃なので殴らない**（`07-enemy-plan.md` ★5）
    noMelee: true,
    id: "chamber",
    name: "チェンバー",
    // **★5 の固有色**（真っ黄色）
    color: "§e",
    star: 5,
    hp: 80,
    // **20**（2026-09-10 に 40 から落とした）
    attack: 20,
    // 射撃できない間だけ歩く。
    speed: 1.0,
    // **攻撃速度 0.25 ＝ 80 tick（4 秒）に 1 発**
    interval: 80,
    reach: 50,
    kind: "melee",
    emerald: 5,
    knockback: 1.0,
    // **一撃が重いので浮かせる**（`22-feedback.md` 6-2 の例外）
    knockUp: 0.35,
    // **紫から赤へ移る線が、1 秒かけて薄れる**（`25-enemy-kit.md` 8-2-1）
    trail: "pve_v3:beam_trail",
    // **湧いた瞬間の声**（`25-enemy-kit.md` 8-A）
    call: "pve_v3:chamber.call",
    // **構え 1 秒 → 撃つ → 休む**（`25-enemy-kit.md` 8-3）
    beam: {
      range: 50,
      pierce: true,
      windup: 20,
      loud: true,
      report: { sound: "pve_v3:chamber.shot", pitch: 1 },
    },
  },

  // **妖狐**（`07-enemy-plan.md` 6-5）。**前方の広い範囲へ炎**——**`sweep`**（`25-enemy-kit.md` 7 章）。
  // **`hits` は書かない ＝ 当たりは 1 回だけ**（重ならない）。
  // 30マス以内で静止し、相手を追って3秒溜める。呪いで溜めと戻りが短縮（spec/34）。
  kitsune: {
    id: "kitsune",
    name: "妖狐",
    noMelee: true,
    // **★5 の固有色**（朱・火を使う）
    color: "§6",
    star: 5,
    hp: 100,
    attack: 30,
    speed: 1.0,
    interval: 60,
    reach: 30,
    kind: "melee",
    // **火を放つ間合い**（`move_around_target`）
    standoff: 10,
    emerald: 5,
    knockback: 2.0,
    // **前方へ火を放つ。** **近接ではない**——間合いを取って撒く
    sweep: { radius: 30, angle: 100, atRange: true, windup: 60, recover: 10, effect: "foxfire" },
  },

  // **帯電クリーパー**（`07-enemy-plan.md` 6-5）。**クリーパーの強い版。**
  // **`noStop` ＝ 膨らみ始めたら止まらない**——**離れても、そのまま爆発する。**
  // **半径 6 はクリーパー（既定 4）より広い。** **`up` 0.8 で高く浮かせる**——
  // **押す強さ 5.0 は爆発の中心の値**（外へ行くほど減る・`25-enemy-kit.md` 2 章）。
  // **攻撃速度 0.66 ＝ 膨らんでから爆発するまで 30 tick**
  boltcreeper: {
    // **クリーパーと同じ実体データ**（足す群だけ違う）
    spawnId: "minecraft:creeper",
    // **同じ実体データで帯電させる**（`minecraft:charged_creeper` の群）
    charged: true,
    id: "boltcreeper",
    name: "帯電クリーパー",
    // **★5 の固有色**（黄緑・帯電と草）
    color: "§a",
    star: 5,
    hp: 100,
    attack: 300,
    speed: 1.0,
    interval: 30,
    reach: 3,
    kind: "boom",
    emerald: 5,
    knockback: 5.0,
    // **半径 8**（2026-09-09 に 6 から広げた）
    boom: { radius: 8, up: 0.8, noStop: true },
  },

  // **弾幕**（`07-enemy-plan.md` 6-5）。**周りへ 16 発をまとめて撒く**
  // （`25-enemy-kit.md` 6 章・`services/throw.ts`）。
  // 速さ9マス/秒、射程30マス。地面の約1〜2マス上を飛び、丸い粒を飛ばす（spec/36）。
  barrage: {
    // > ### **飛んで、20 マスまで寄る**（2026-09-10・`25-enemy-kit.md` 6-2）
    // >
    // > **うろつくだけでは、射程 30 の外に居ることのほうが多かった。**
    // > **「飛行」と同じ作り**（`fly`）**にして、20 マスまでは寄る**——**そこから先は寄らない**
    // > （`entities/barrage.json` の `move_towards_target.within_radius`）。
    fly: true,
    hover: { min: 1, max: 2, ground: true },
    // **20 マスで止まるので、そもそも殴る間合いに入らない**
    noMelee: true,
    standoff: 20,
    // **飛ぶ敵の物差し**（バニラのコウモリは 0.1）
    baseSpeed: 0.15,
    id: "barrage",
    name: "弾幕",
    // **★5 の固有色**（青緑・幽霊）
    color: "§3",
    star: 5,
    hp: 100,
    attack: 5,
    speed: 0.5,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 5,
    knockback: 0.2,
    // 実体を生成しない丸弾表示。既存の当たりの太さは維持（spec/36）。
    // 弾速2倍・発射頻度半分で、同時弾数を約1/4にする。
    orbit: { count: 16, speed: 0.45, range: 30, sprite: "pve_v3:barrage_bullet", fat: 0.9 },
  },

  // **パワー系**（`07-enemy-plan.md` 6-5）。**備考は空 ＝ ただ強いだけ。** **旗は無い**
  titan: {
    id: "titan",
    name: "パワー系",
    // **★5 の固有色**（暗赤・重さ）
    color: "§4",
    star: 5,
    hp: 200,
    attack: 200,
    speed: 0.4,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 5,
    knockback: 5.0,
  },

  // **急所**（`07-enemy-plan.md` 6-5）。**力を使わない**（`attack` 0）——
  // **`ratio: 20` を書くと `services/melee.ts` が最大 HP の 20 % を持っていく。**
  // **育てても軽くならない**
  vital: {
    id: "vital",
    name: "急所",
    // **★5 の固有色**（白・刃）
    color: "§f",
    star: 5,
    hp: 200,
    attack: 0,
    speed: 0.7,
    interval: 20,
    reach: 2.5,
    kind: "melee",
    emerald: 5,
    knockback: 5.0,
    ratio: 20,
  },
};
