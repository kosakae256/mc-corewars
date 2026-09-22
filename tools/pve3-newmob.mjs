/**
 * 敵モブのひな形を作る。
 *
 *     node tools/pve3-newmob.mjs <id> --look <バニラのモブ>
 *
 * 例:
 *
 *     node tools/pve3-newmob.mjs husk --look husk          # バニラの見た目を借りる
 *     node tools/pve3-newmob.mjs crusher --human           # 自前スキンの人型
 *     node tools/pve3-newmob.mjs stray --look stray
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 9 章・11 章。
 *
 * ## なぜひな形が要るのか——**バグを取るため**
 *
 * > **手で写すと、モブごとに少しずつ違う JSON ができる。**
 * > **1 体で直したバグが、他の体では直っていない。**
 * > **ひな形から作れば、直す所は 1 つで済む。**
 *
 * ## 何が「共通」なのか
 *
 * **ゾンビとスケルトンを突き合わせて割り出した**（2026-09-08）。
 *
 * | | |
 * | --- | --- |
 * | **ビヘイビア** | **23 個の部品が完全に一致。** 違ったのは**速さ**と**攻撃まわりだけ** |
 * | **見た目** | **描画制御と `pre_animation` が一致。** 違ったのは**模型・材質・絵とアニメ名だけ** |
 *
 * **だから、この道具が書くのは「23 個 ＋ 攻撃 ＋ 見た目の指定」。**
 *
 * ## 先に固有値を書く
 *
 * **固有値の持ち主は `scripts/core/enemy.ts` の `ENEMIES`。**
 * **そこに無い id は作れない**——**速さも攻撃間隔も、そこから読む。**
 *
 * ## 作ったあと
 *
 * 1. **見た目を確かめる**（模型・絵はバニラから借りている）
 * 2. **`npm run check` → デプロイ**
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { settings, stamp } from "./pve3-mobjson.mjs";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PACK = path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3");
const BP = path.join(PACK, "behavior_packs", "pve_v3", "entities");
const LOOT = path.join(PACK, "behavior_packs", "pve_v3", "loot_tables", "gear");
const RP = path.join(PACK, "resource_packs", "pve_v3", "entity");

/** **バニラの見本。** 模型・絵・アニメの名前はここから読む */
const VANILLA = path.join(ROOT, "bedrock-samples", "resource_pack", "entity");
/** バニラのビヘイビア（実体の中身） */
const VANILLA_BP = path.join(ROOT, "bedrock-samples", "behavior_pack", "entities");
/** バニラの描画制御の置き場 */
const VANILLA_RC = path.join(ROOT, "bedrock-samples", "resource_pack", "render_controllers");
/** こちらの描画制御の置き場 */
const RC = path.join(PACK, "resource_packs", "pve_v3", "render_controllers");

/**
 * **赤く光る／色味を乗せる式**（`pve3_hurt.render_controllers.json` と同じ）。
 *
 * **写した描画制御にも、これを足す**——**足さないと、その敵だけ色が乗らない。**
 */
const OVERLAY = {
  r: "q.property('pve_v3:chill') > 0 ? 0.3 : q.property('pve_v3:tint_r')",
  g: "q.property('pve_v3:chill') > 0 ? 0.72 : q.property('pve_v3:tint_g')",
  b: "q.property('pve_v3:chill') > 0 ? 1.0 : q.property('pve_v3:tint_b')",
  a: "q.property('pve_v3:chill') > 0 ? q.property('pve_v3:chill') * 0.28 : q.property('pve_v3:tint_a')",
};

/** 当たり判定の既定（ゾンビ・スケルトンと同じ） */
/** **飛ぶ敵の当たり判定の上限**（オウムと同じ 1 マス） */
const FLY_BOX = 1.0;

const BOX = { width: 0.6, height: 1.9 };

/**
 * **どの敵も持つ性質**（`properties`）。
 *
 * | | |
 * | --- | --- |
 * | `pve_v3:hurt` | 赤く光る |
 * | `pve_v3:swing` | **殴りモーションの時計**（`services/swing.ts`） |
 * | `pve_v3:fuse` | **膨らみの進み具合**（`services/fuse.ts`） |
 * | `pve_v3:chill` / `tint_*` | 色味 |
 */
function propsOf(tint) {
  return {
    "pve_v3:hurt": { type: "bool", default: false, client_sync: true },
    // > ### **鼓舞が掛かっている印**（2026-09-09）
    // >
    // > **`controller.animation.pve3.roused` がこれを見て、
    // > 攻撃力上昇の札を実体について回らせる**（`25-enemy-kit.md` 9-3）。
    "pve_v3:roused": { type: "bool", default: false, client_sync: true },
    // > ### **殴りモーションの時計**（2026-09-08）
    // >
    // > **バニラのゴーレムの腕振りは `variable.attack_animation_tick` で動く。**
    // > **これは engine が本物のゴーレムにだけ入れる値**——こちらの実体には来ない。
    // > **`pre_animation` でこの property から作る**（`services/swing.ts` が動かす）。
    "pve_v3:swing": { type: "float", range: [flo(0), flo(10)], default: flo(0), client_sync: true },
    // > ### **膨らみの進み具合**（0〜1・2026-09-08）
    // >
    // > **公式**: *`query.swell_amount` — Only works for "minecraft:creeper" and "minecraft:wither".*
    // > **写した実体では動かない**ので、**自前の property で同じ値を作る。**
    // > **バニラの `animation.creeper.swelling` は、そこから計算した変数を見るだけ**——
    // > **アニメはそのまま使える。**
    "pve_v3:fuse": { type: "float", range: [flo(0), flo(1)], default: flo(0), client_sync: true },
    // > ### **溜めの進み具合**（0〜1・2026-09-09）
    // >
    // > **薙ぎ払う敵の溜めは script が数える**（`services/windup.ts`）——
    // > **`delayed_attack` の `on_attack` が鳴らなかった**（`24-mob-howto.md` 16-2）。
    "pve_v3:windup": { type: "float", range: [flo(0), flo(1)], default: flo(0), client_sync: true },
    "pve_v3:chill": { type: "float", range: [flo(0), flo(1)], default: flo(0), client_sync: true },
    // **色味**（`24-mob-howto.md` 6-5）。**同じ模型で別の個体に見せる**
    "pve_v3:tint_r": { type: "float", range: [flo(0), flo(1)], default: flo(tint[0]), client_sync: true },
    "pve_v3:tint_g": { type: "float", range: [flo(0), flo(1)], default: flo(tint[1]), client_sync: true },
    "pve_v3:tint_b": { type: "float", range: [flo(0), flo(1)], default: flo(tint[2]), client_sync: true },
    // **`a` が 0 なら、色は乗らない**
    "pve_v3:tint_a": { type: "float", range: [flo(0), flo(1)], default: flo(tint[3]), client_sync: true },
  };
}

/**
 * **狙い方。** **どの敵も同じ**（`24-mob-howto.md` 1-2）。
 *
 * **100 マス・壁越し・クリエイティブは狙わない。**
 */
const TARGET = {
  priority: 2,
  reselect_targets: true,
  must_see: false,
  within_radius: 100,
  entity_types: [
    {
      filters: {
        all_of: [
          { test: "is_family", subject: "other", value: "player" },
          // **クリエイティブは狙わせない**（`24-mob-howto.md` 1-3）
          { none_of: [{ test: "has_ability", subject: "other", value: "instabuild" }] },
        ],
      },
      max_dist: 100,
      must_see: false,
    },
  ],
};

/**
 * **どのモブにも同じ 23 個。**
 *
 * **外すと壊れるもの**は `24-mob-howto.md` 9 章の表にある。
 * **`minecraft:movement` と段は `pve3-mobjson.mjs` が書く**ので、ここには無い。
 */
function common(box, move, nav, scale, def) {
  const out = {
    "minecraft:type_family": { family: ["pve_mob", "mob"] },
    "minecraft:collision_box": box,
    "minecraft:physics": {},
    [`minecraft:movement.${move}`]: {},
    [`minecraft:navigation.${nav}`]:
      nav === "climb" ? {} : { is_amphibious: true, can_pass_doors: true, can_walk: true },
    "minecraft:jump.static": {},
    "minecraft:can_climb": {},
    "minecraft:persistent": {},
    // **バニラの体力は飾り**（`24-mob-howto.md` 4 章）。
    // **5000 にしてある**——**無敵時間を抜けるのに 999 まで入れる**ため（`services/iframe.ts`）
    "minecraft:health": { value: 5000, max: 5000 },
    "minecraft:breathable": {
      total_supply: 15,
      suffocate_time: -20,
      breathes_air: true,
      breathes_water: true,
    },
    "minecraft:fire_immune": {},
    "minecraft:knockback_resistance": { value: 1 },
    // **索敵は 3 か所に書く**（`24-mob-howto.md` 1-2）
    "minecraft:behavior.nearest_attackable_target": TARGET,
    "minecraft:behavior.random_stroll": { priority: 7, speed_multiplier: 1 },
    "minecraft:behavior.look_at_player": { priority: 8, look_distance: 6 },
    "minecraft:loot": { table: "loot_tables/empty.json" },
    "minecraft:nameable": { always_show: true, allow_name_tag_renaming: false },
    "minecraft:follow_range": { value: 100, max: 100 },
    "minecraft:behavior.random_look_around": { priority: 9 },
    "minecraft:behavior.float": { priority: 0 },
    "minecraft:behavior.hurt_by_target": { priority: 1 },
    // **書かないと重なる**（`24-mob-howto.md` 1-4）
    "minecraft:pushable_by_entity": {},
    "minecraft:pushable_by_block": {},
  };
  // > ### **飛ぶ**（`25-enemy-kit.md` 11 章）
  // >
  // > **`EnemyDef.fly` を書いた敵だけ。** **歩く部品を外して、飛ぶ部品に差し替える。**
  if (def?.fly === true || def?.ghost === true) {
    // > ### **ミツバチの形**（`25-enemy-kit.md` 11 章・2026-09-08 に 4 回目でここへ来た）
    // >
    // > **公式**: *`navigation.hover` — Allows this entity to generate paths in the air
    // > like the vanilla Bees do. Keeps them from falling out of the skies.*
    // >
    // > **重力は切らない**——**`navigation.hover` が浮かせる。**
    // > **切ると摩擦も消えて、止まれなくなる**（前はそれで速すぎた）。
    delete out[`minecraft:movement.${move}`];
    delete out[`minecraft:navigation.${nav}`];
    delete out["minecraft:can_climb"];
    out["minecraft:movement.hover"] = {};
    out["minecraft:navigation.hover"] = {
      can_path_over_water: true,
      can_sink: false,
      can_pass_doors: true,
      can_path_from_air: true,
      avoid_water: true,
      avoid_damage_blocks: true,
      avoid_sun: false,
    };
    out["minecraft:can_fly"] = {};
    // **速さは `minecraft:movement` ではなくこちら**（`pve3-mobjson.mjs` が値を書く）
    out["minecraft:flying_speed"] = { value: 0.15 };
    // > ### **当たり判定は 1 マス以下にする**（実測・2026-09-08）
    // >
    // > **`navigation.hover` を使うバニラは全部小さい**——
    // > **ミツバチ 0.55 × 0.5 ／ アレイ 0.35 × 0.6 ／ オウム 0.5 × 1.0。**
    // > **背の高い体だと、1 マスの段差に引っかかって進めなくなる。**
    if (def.tallFly !== true && out["minecraft:collision_box"].height > FLY_BOX) {
      out["minecraft:collision_box"] = {
        width: Math.min(out["minecraft:collision_box"].width, FLY_BOX),
        height: FLY_BOX,
      };
    }
  }
  // > ### **壁を抜ける**（ファントム。`25-enemy-kit.md` 11 章）
  // >
  // > **ヴェックスは `has_collision: false` で壁を抜ける。** 同じ手を使う。
  if (def?.ghost === true) {
    // > ### **壁を抜けるが、埋まったままにはしない**（実測・2026-09-08）
    // >
    // > **`has_collision: false` だけだと、経路探索は壁を避けようとするのに
    // > 体は抜けてしまい、壁の中で止まる。**
    // > **`navigation.hover` は「壁の中に居る」を想定していない。**
    // >
    // > **抜けるのは体だけ。** **経路は壁の中も通れることにする**——
    // > **`can_pass_doors` と同じ考えで、閉じた場所も道と見なす。**
    out["minecraft:physics"] = { has_collision: false };
    out["minecraft:navigation.hover"] = {
      ...out["minecraft:navigation.hover"],
      // **壁の中も道になる。** **詰まらない**
      can_break_doors: false,
      can_open_doors: false,
      can_path_from_air: true,
      can_pass_doors: true,
      is_amphibious: true,
    };
  }
  // > ### **うろつくだけ**（弾幕。`25-enemy-kit.md` 14 章）
  // >
  // > **狙いを付ける部品も、殴られて狙う部品も外す。** **`random_stroll` だけが残る。**
  if (def?.roam === true) {
    delete out["minecraft:behavior.nearest_attackable_target"];
    delete out["minecraft:behavior.hurt_by_target"];
  }
  if (def?.neutral === true) {
    delete out["minecraft:behavior.nearest_attackable_target"];
    /* **狙う部品は `pve_v3:angry` の群に移す**（`writeBehavior` が置く） */
    // > ### **中立の敵は `hurt_by_target` が唯一の狙い方**（実測・2026-09-08）
    // >
    // > **既定の `max_dist` は 16。** **16 マス離れると狙いが外れて、追うのをやめる。**
    // > **「最後まで追い続ける」に反する**ので、ほかの敵と同じ 100 にする。
    // > **クリエイティブと味方は狙わせない**（`24-mob-howto.md` 1-3）。
    out["minecraft:behavior.hurt_by_target"] = {
      priority: 1,
      entity_types: [
        {
          filters: {
            all_of: [
              { test: "is_family", subject: "other", value: "player" },
              { none_of: [{ test: "has_ability", subject: "other", value: "instabuild" }] },
            ],
          },
          max_dist: 100,
          must_see: false,
        },
      ],
      alert_same_type: false,
    };
  }
  // > ### **動かない**（追尾弾）
  // >
  // > **歩く部品ごと外す。** **`random_stroll` が残ると、じりじり動く。**
  if (def?.still === true) {
    // > ### **部品は残す。速さを 0 にするだけ**（実測・2026-09-08 に直した）
    // >
    // > **一度は `movement.basic` と `navigation.walk` を外した。**
    // > **すると弾を 1 発も撃たなくなった**——**`ranged_attack` は動く部品を前提にしている。**
    // >
    // > **バニラのシュルカーも両方持っている。** **動かないのは `movement` が 0 だから。**
    delete out["minecraft:behavior.random_stroll"];
    // > ### **押されない**
    // >
    // > **押されると、頭上の表示だけが取り残されて見えた。**
    // > **「動かない」敵なので、そもそも押されないのが正しい。**
    delete out["minecraft:pushable_by_entity"];
    delete out["minecraft:pushable_by_block"];
  }
  // > ### **`minecraft:variant` を書かないと消える実体がある**（実測・2026-09-08）
  // >
  // > **スライムは `query.variant` で大きさを決める。** **部品が無いと倍率 0 ＝ 透明。**
  if (typeof def?.variant === "number") out["minecraft:variant"] = { value: def.variant };
  // **跳ねて進む敵は、着地してから次に跳ぶまでの間**（`24-mob-howto.md` 14 章）。
  // **既定は [0,0] ＝ 一切止まらない**
  if (move === "jump") out["minecraft:movement.jump"] = { jump_delay: [0.16, 0.5] };
  // **大きさ違いを作る**（同じ模型で「大」「小」）
  if (scale !== undefined) out["minecraft:scale"] = { value: scale };
  return out;
}

/**
 * 攻撃まわり。**ここだけが種類で変わる。**
 *
 * **間隔（`cooldown_time` / `attack_interval_*`）は `pve3-mobjson.mjs` が上書きする。**
 */
function attackOf(def, reach) {
  if (def.kind === "shoot") {
    const out = {
      "minecraft:behavior.ranged_attack": {
        // > ### **バニラのスケルトンと同じ 0**（2026-09-08 に直した）
        // >
        // > **数が小さいほど優先。** **うちは 4 で、拾う・狙う・浮くより後回しだった。**
        // > **撃つ動きが割り込まれて、寄る動きだけが残っていた**——**0 距離まで詰めた原因。**
        priority: 0,
        attack_interval_min: 3.0,
        attack_interval_max: 3.0,
        // **ここまで近づいたら撃つ**
        attack_radius: reach,
        // **溜めと連射**（`EnemyDef.charge`）。**バニラの値をそのまま**。
        // **段で一緒に縮む**（`pve3-mobjson.mjs` の `attackAt`）
        ...(def.charge === undefined
          ? {}
          : {
              charge_shoot_trigger: def.charge.shoot,
              ...(def.charge.charged === undefined ? {} : { charge_charged_trigger: def.charge.charged }),
              ...(def.charge.burst === undefined ? {} : { burst_shots: def.charge.burst }),
              ...(def.charge.burstGap === undefined ? {} : { burst_interval: def.charge.burstGap }),
            }),
        // > ### **`attack_radius_min` は入れない**（2026-09-08 に外した）
        // >
        // > **公式**: *If the target is closer, this mob will move first before firing.*
        // > **「近すぎたら動く」＝ 下がる。** **近づくと逃げていく**ので、使わない。
      },
      // **「種」を出させて、`services/mobshot.ts` が自前の弾に差し替える**（`24-mob-howto.md` 10-1）。
      // **バニラの矢は狙いをわざとずらす**（`uncertainty_base`）ので使わない。
      //
      // > ### **`sound` は入れない**（2026-09-08）
      // >
      // > **弓の音は `is3D: false` にしてある**（`22-feedback.md` 1-1）——
      // > **距離で小さくならないので、敵が撃つたびに耳元で鳴る。**
      "minecraft:shooter": { def: "pve_v3:seed" },
    };
    // **武器は部品では持たせない**（`24-mob-howto.md` 10-3）——
    // **装備表は script で湧かせた個体に効かない。** `EnemyDef.hand` から script が持たせる
    return out;
  }
  // > ### **「寄る」と「削る」は別物**（実測・2026-09-08 に 2 度直した）
  // >
  // > **`melee_box_attack` を外すと、寄る動きまで消える**——
  // > **クリーパーは近づけず導火線に火が付かず、ボマーは投げる間合いに入れない。**
  // >
  // > **残したまま、力を 0 にする。** **削るのは script が止める**（`services/melee.ts`）。
  //
  // **離れていたい敵**（恵み・鼓舞）**と、うろつくだけの敵**（弾幕）**は、寄る動きも要らない。**
  // **薙ぎ払う敵も殴らない**（`services/enemydef.ts` の `hitsInMelee` と同じ決め方）
  const quiet = def.noMelee === true || def.kind === "boom" || def.sweep !== undefined;
  // > ### **導火線はバニラの仕組みをそのまま使う**（実測・2026-09-08 に作り直した）
  // >
  // > **script で数えていたときは、近づいた瞬間に爆発していた**——**予告が無い。**
  // > **バニラのクリーパーは 4 つの部品が噛み合って動いている**
  // > （`bedrock-samples/behavior_pack/entities/creeper.json`）:
  // >
  // > | 部品 | 役 |
  // > | --- | --- |
  // > | **`behavior.swell`** | **近づいたら膨らむ**（`start_distance` / `stop_distance`） |
  // > | **`target_nearby_sensor`** | **間合いに入った／出たで、イベントを鳴らす** |
  // > | **`minecraft:explode`**（群） | **導火線 1.5 秒 ＋ シューという音 ＋ 膨らむ絵** |
  // > | イベント | 群を足す／外す |
  // >
  // > **ダメージだけこちらで出す**——**`damage_scaling: 0` ＋ `breaks_blocks: false`。**
  // > **公式**: *damage_scaling — A value of 0 prevents the explosion from dealing any damage.*
  const swell =
    def.kind === "boom"
      ? {
          "minecraft:behavior.swell": {
            priority: 2,
            start_distance: reach,
            stop_distance: reach * 2.4,
          },
          "minecraft:target_nearby_sensor": {
            inside_range: reach,
            outside_range: reach * 2.4,
            // **壁越しには火が点かない**（バニラと同じ）
            must_see: true,
            on_inside_range: { event: "pve_v3:fuse", target: "self" },
            on_outside_range: { event: "pve_v3:unfuse", target: "self" },
            on_vision_lost_inside_range: { event: "pve_v3:unfuse", target: "self" },
          },
        }
      : {};
  if (def.aura !== undefined || def.roam === true) return {};
  // **薙ぎ払う敵は、溜めてから振る部品を使う**（`sweepAttack`）。
  // **遠くから撃つ薙ぎ払い**（散弾）**は近接ではない**——寄る足だけ残す
  if (def.sweep !== undefined && def.sweep.atRange !== true) {
    // > ### **`on_attack` は「当たった」ときにしか鳴らない**（実測・2026-09-09）
    // >
    // > **公式**: *on_attack — Defines the event to trigger when this entity
    // > **successfully** attacks.*
    // > **`damage: 0` だと当たったことにならない**——**イベントが飛ばず、
    // > 溜めるだけで一生振らない敵になる。**
    // >
    // > **1 を入れる。** **実ダメージは script が入れる**ので二重にはならない
    // > （`services/enemydef.ts` の `hitsInMelee` が薙ぎ払いの敵を外している）。
    return { "minecraft:attack": { damage: 1 }, ...sweepAttack(def, def.interval / 20) };
  }
  return {
    ...swell,
    // **1 を入れておく。** 実ダメージは script が入れる（`services/melee.ts`）。
    // **殴らない敵は 0**——**バニラ側でも削らない**
    "minecraft:attack": { damage: quiet ? 0 : 1 },
    // > ### **`track_target` が無いと、途中で固まる**（2026-09-08・原因を特定）
    // >
    // > **公式**: *track_target — Allows the entity to track the attack target,
    // > even if the entity has no sensing.*（既定 **false**）
    // >
    // > **`melee_box_attack` は、目標を「感じ取れている」ことを前提にしている**
    // > （`melee_fov` 90 度）。**こちらは `must_see: false` ＋ 100 マスで狙いを付ける**ので、
    // > **視界の外・壁の向こうの相手を目標にした瞬間、追えなくなる。**
    // >
    // > **それでも goal は動き続けて `random_stroll`（7）を押さえる**ので、
    // > **近づく途中で、殴りもせず歩きもせず立ち止まる。**
    // > **バニラのゾンビは `must_see: true` なので踏まない。** ピグリンは `track_target: true` を持つ。
    "minecraft:behavior.melee_box_attack": {
      priority: 4,
      can_spread_on_fire: true,
      cooldown_time: 1.0,
      track_target: true,
    },
  };
}

/**
 * **溜めてから振る敵**（回転・妖狐・散弾）。
 *
 * > ### **`delayed_attack` は当たる瞬間を教えてくれる**
 * > （`docs/research/05-entity-behaviors.md`・2026-09-08）
 * >
 * > **公式**: *Allows an entity to attack, while also delaying the damage-dealt
 * > until a specific time in the attack animation.*
 * >
 * > | 値 | 何か |
 * > | --- | --- |
 * > | `attack_duration` | **振り全体の長さ**（＝ 次に振るまでの間隔でもある） |
 * > | `hit_delay_pct` | **振りの何割で当たるか**（0.5 ＝ 真ん中） |
 * > | **`on_attack`** | **当たった瞬間に鳴らすイベント** |
 * > | `track_target` | **既定 true**（`melee_box_attack` は false） |
 *
 * **`on_attack` で `pve_v3:swung` を鳴らし、script が受けて範囲攻撃を出す**
 * （`services/traits.ts` の `subscribeSwung`）。**振りと当たりが必ず揃う。**
 */
function sweepAttack(def, seconds) {
  return {
    "minecraft:behavior.delayed_attack": {
      priority: 4,
      // **振り全体の長さ ＝ その敵の攻撃間隔**
      attack_duration: seconds,
      // **真ん中で当てる**（振りかぶって、下ろした所）
      hit_delay_pct: 0.5,
      // > ### **振り始める距離**（`07-enemy-plan.md` 回転）
      // >
      // > **公式**: *Used with the base size of the entity to determine
      // > minimum target-distance before trying to deal attack damage.*
      // > **体の大きさに掛かる**ので、**2 マスで振るなら 0.6 × 3.3 ≒ 2。**
      // > **当たる範囲は `sweep.radius`**（振ってから script が決める）——**別物。**
      reach_multiplier: 3.3,
      track_target: true,
      // **当たった瞬間に script を呼ぶ**
      on_attack: { event: "pve_v3:swung", target: "self" },
    },
  };
}

/**
 * **コメント付き JSON を読む。**
 *
 * **バニラのパックは `//` コメントと末尾カンマを含む。** `JSON.parse` は落ちる。
 */
function readJsonc(file) {
  const s = fs.readFileSync(file, "utf-8");
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && s[i + 1] === "*") {
      i += 2;
      while (i + 1 < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * **`default` を必ず作る。**
 *
 * > ### **`default` が無いと、貼られない**（2026-09-08 に踏んだ）
 * >
 * > **描画制御が `Texture.default` を見る**（`controller.render.pve3_hurt`）。
 * > **バニラにはウサギのように `default` を持たない実体がある**——
 * > 鍵が `brown` `white` … しかない。**そのまま写すと透明になる。**
 * > **最初の 1 つを `default` にも割り当てる。**
 */
function withDefault(map, fallback) {
  const out = { ...(map ?? {}) };
  if (out.default === undefined) {
    const first = Object.values(out)[0];
    if (first !== undefined) out.default = first;
    else if (fallback !== undefined) out.default = fallback;
  }
  return out;
}

/**
 * 見た目。**バニラの見本から、模型・材質・絵・アニメを読む。**
 *
 * > ### **アニメはそのまま写す**（2026-09-08）
 * >
 * > **人型以外（クモ・ゴーレム・ラヴェジャー）は、humanoid のアニメでは動かない。**
 * > **バニラの `animations` と `scripts` をそのまま持ってくる。**
 * > **描画制御だけは、こちらのもの**（赤く光る仕掛けが要るため）。
 */
function lookOf(name, geo, tex) {
  // **自前の絵を使うとき**——**模型はこちらの人型、絵はこちらで描いたもの**
  if (geo !== undefined || tex !== undefined) {
    return {
      version: "1.10.0",
      materials: { default: "entity_alphatest" },
      textures: { default: tex ?? "textures/entity/pve3/unknown" },
      geometry: { default: geo ?? HUMAN_GEO },
    };
  }
  const file = path.join(VANILLA, `${name}.entity.json`);
  if (!fs.existsSync(file)) throw new Error(`バニラの見本が無い: ${file}`);
  const doc = readJsonc(file);
  const de = doc["minecraft:client_entity"].description;
  return {
    // **バニラと同じ版を書く**（`24-mob-howto.md` 6-6）。
    // **1.8.0 にしか `animation_controllers` は無く、1.10.0 にしか `scripts.animate` は無い**
    version: doc.format_version,
    materials: withDefault(de.materials, name),
    textures: withDefault(de.textures),
    geometry: withDefault(de.geometry),
    animations: de.animations,
    scripts: de.scripts,
    // **バニラは `animation_controllers` で動かしているものが多い**（クモ・ゴーレム・ウサギ）。
    // **`scripts.animate` が無い実体は、これが無いと一切動かない**
    controllers: de.animation_controllers,
    renders: de.render_controllers,
    particles: de.particle_effects,
    sounds: de.sound_effects,
  };
}

/**
 * **人型の模型。** **バニラの `geometry.humanoid.custom` を写して、絵の大きさを書き足したもの。**
 *
 * > ### **バニラのものを直接指してはいけない**（実測・2026-09-08）
 * >
 * > **`geometry.humanoid.custom` には `texture_width` / `texture_height` が無い。**
 * > **プレイヤーだけは engine が 64 × 64 と知っている**が、**ふつうの実体は知らない。**
 * > **箱の貼り位置（`uv`）が全部ずれて、人の形に見えなくなる。**
 */
const HUMAN_GEO = "geometry.pve3.humanoid";

/**
 * **人型のアニメの配線。**
 *
 * > ### **制御はモブのもの、絵はプレイヤーのもの**（実測・2026-09-08）
 * >
 * > **`controller.animation.player.root` はそのままでは使えない。**
 * > **`first_person` から始まり、一人称・地図・紙人形・ケープなど
 * > プレイヤーにしか無い変数で枝分かれする。**
 * >
 * > **だが制御は「名前」を流すだけ**——`attack.rotations` を流せ、としか言わない。
 * > **その名前が何を指すかは、こちらの実体ファイルが決める。**
 * > **だからバニラのモブ用の制御を使ったまま、中身をプレイヤーのアニメに差し替えられる。**
 *
 * **差し替えたもの**（バニラを読み比べて、**中身が違うものだけ**）:
 *
 * | 名前 | 前 | いま |
 * | --- | --- | --- |
 * | `attack.rotations` | `humanoid`（腕を横に振る） | **`player`**（振りかぶって叩く） |
 * | `attack.positions` | 無し | **`player`**（プレイヤーは 2 本流す） |
 * | `sneaking` | `humanoid`（腕を 72 度上げる別物） | **`player`** |
 * | `holding` / `bob` / `move` | — | **中身が同じだったので、そのまま** |
 *
 * **ゾンビからは借りない**——`animation.zombie.attack_bare_hand` が
 * **腕を前に突き出した姿勢**（ウィザースケルトンのような動き）を足してしまうため。
 */
/**
 * **回転斬りのアニメ**（`sweep` を持つ人型）。
 *
 * > ### **`pve_v3:swing` が 10 → 0 に落ちる間、体を回す**
 * >
 * > **`services/swing.ts` が 2 tick ごとに 2 ずつ減らす**（10 tick ＝ 0.5 秒）。
 * > **`10 × 72 度 ＝ 720 度**——**0.5 秒で 2 回転する。**
 * > **腕は前へ 90 度**（剣を横に構えた形）。**頭は逆に回して、正面を保つ。**
 */
const SPIN_ANIM = {
  animations: { pve3_spin: "animation.pve3.spin", pve3_spin_controller: "controller.animation.pve3.spin" },
  animate: ["pve3_spin_controller"],
};

const HUMAN_ANIM = {
  version: "1.10.0",
  animations: {
    look_at_target_default: "animation.humanoid.look_at_target.default",
    look_at_target_gliding: "animation.humanoid.look_at_target.gliding",
    look_at_target_swimming: "animation.humanoid.look_at_target.swimming",
    move: "animation.humanoid.move",
    "riding.arms": "animation.humanoid.riding.arms",
    "riding.legs": "animation.humanoid.riding.legs",
    "riding.body": "animation.humanoid.riding.body",
    holding: "animation.player.holding",
    humanoid_base_pose: "animation.humanoid.base_pose",
    brandish_spear: "animation.humanoid.brandish_spear",
    charging: "animation.humanoid.charging",
    // **殴り・しゃがみ・揺れは、プレイヤーのものを指す**（下の注記）
    "attack.positions": "animation.player.attack.positions",
    "attack.rotations": "animation.player.attack.rotations",
    sneaking: "animation.player.sneaking",
    bob: "animation.player.bob",
    damage_nearby_mobs: "animation.humanoid.damage_nearby_mobs",
    bow_and_arrow: "animation.humanoid.bow_and_arrow",
    use_item_progress: "animation.humanoid.use_item_progress",
    swimming: "animation.zombie.swimming",
    look_at_target_controller: "controller.animation.humanoid.look_at_target",
    move_controller: "controller.animation.humanoid.move",
    riding_controller: "controller.animation.humanoid.riding",
    holding_controller: "controller.animation.humanoid.holding",
    brandish_spear_controller: "controller.animation.humanoid.brandish_spear",
    charging_controller: "controller.animation.humanoid.charging",
    // **こちらの制御**——**バニラの `humanoid.attack` は `attack.rotations` しか流さない。**
    // **プレイヤーは `attack.positions` と 2 本流す**ので、同じ形にする
    attack_controller: "controller.animation.pve3.attack",
    sneaking_controller: "controller.animation.humanoid.sneaking",
    bob_controller: "controller.animation.humanoid.bob",
    damage_nearby_mobs_controller: "controller.animation.humanoid.damage_nearby_mobs",
    bow_and_arrow_controller: "controller.animation.humanoid.bow_and_arrow",
    use_item_progress_controller: "controller.animation.humanoid.use_item_progress",
    swimming_controller: "controller.animation.zombie.swimming",
  },
  scripts: {
    // **`animation.humanoid.move` は `variable.tcos0` で脚を振る。**
    // **これを作らないと、歩いても棒立ちになる**（スケルトンと同じ式）
    // **持ち物で腕を上げる旗。** プレイヤーと同じく 0 から始める
    initialize: ["variable.is_holding_right = 0.0;", "variable.is_holding_left = 0.0;"],
    pre_animation: [
      "variable.tcos0 = (Math.cos(query.modified_distance_moved * 38.17) * query.modified_move_speed / variable.gliding_speed_value) * 57.3;",
      // **`animation.player.attack.rotations` は、これで胴をひねる。**
      // **入れないと腕だけが振れて、プレイヤーの殴りに見えない**（player.entity.json と同じ式）
      "variable.attack_body_rot_y = Math.sin(360*Math.sqrt(variable.attack_time)) * 5.0;",
      "variable.riding_y_offset_with_respect_to_player = 0.5;",
      "variable.riding_y_offset_on_vehicle_where_other_entites_can_stand = query.is_riding_any_entity_of_type('minecraft:minecart', 'minecraft:boat', 'minecraft:chest_boat') ? -3.0 : 0.0;",
      "variable.riding_y_offset = variable.riding_y_offset_with_respect_to_player + variable.riding_y_offset_on_vehicle_where_other_entites_can_stand;",
    ],
    animate: [
      // **プレイヤーはこれを最初に流す**（腰の角度をゼロに戻す）
      "humanoid_base_pose",
      "look_at_target_controller",
      "move_controller",
      "riding_controller",
      "holding_controller",
      "brandish_spear_controller",
      "attack_controller",
      "sneaking_controller",
      "bob_controller",
      "damage_nearby_mobs_controller",
      // > ### **弓のアニメは、弓を持っているときだけ**（実測・2026-09-08）
      // >
      // > **`controller.animation.humanoid.bow_and_arrow` が入る条件は `query.has_target` だけ。**
      // > **弓を持っているかは見ていない。**
      // > **`animation.humanoid.bow_and_arrow` は両腕を `target_x_rotation - 90` にする**——
      // > **近接の敵が、腕を上げたままこちらへ向かってくる。**
      // >
      // > **プレイヤーは `get_equipped_item_name == 'bow'` で縛っている。** 同じように縛る。
      { bow_and_arrow_controller: "query.is_item_name_any('slot.weapon.mainhand', 'minecraft:bow')" },
      { charging_controller: "query.is_item_name_any('slot.weapon.mainhand', 'minecraft:bow')" },
      "use_item_progress_controller",
      "swimming_controller",
    ],
    should_update_effects_offscreen: "1.0",
  },
};

/**
 * **誰も入れない変数で絵を選ばせない。**
 *
 * > ### **ピンクになる**（実測・2026-09-08）
 * >
 * > **バニラのガストの描画制御は `Array.skins[variable.ischarging]`。**
 * > **`variable.ischarging` は engine が本物のガストにだけ入れる値**——
 * > **こちらの実体には来ないので、絵が決まらず、全面がピンクになる。**
 * >
 * > **`query.*` は engine が誰にでも入れるのでそのまま。**
 * > **`variable.*` の添字だけ 0 に潰す**——**並びの先頭 ＝ 既定の絵。**
 */
function pickable(body) {
  const fix = (v) =>
    typeof v === "string" ? v.replace(/\[\s*variable\.[a-z_0-9]+\s*\]/gi, "[0]") : v;
  const out = { ...body };
  if (Array.isArray(out.textures)) out.textures = out.textures.map(fix);
  if (Array.isArray(out.geometry)) out.geometry = out.geometry.map(fix);
  else out.geometry = fix(out.geometry);
  return out;
}

/**
 * **バニラの描画制御を写す。**
 *
 * > ### **1 つに差し替えてはいけない**（実測・2026-09-08 に踏んだ）
 * >
 * > **バニラの描画制御は「どの骨を出すか」「材質を何にするか」まで決めている。**
 * >
 * > | 実体 | バニラの描画制御が何をしているか | 差し替えたらどうなったか |
 * > | --- | --- | --- |
 * > | **シルバーフィッシュ** | **`part_visibility` で全部隠してから 10 個の骨だけ出す** | **余分な骨が出て、箱が乗ったような姿になった** |
 * > | **スライム** | **2 本使う**（内側の体 ＋ 外側の半透明） | **外側が消えて、別物の見た目になった** |
 *
 * **写して、`overlay_color` だけ足す。**
 *
 * @returns こちらの制御の名前の並び
 */
function copyRenders(id, names, force) {
  if (names === undefined || names.length === 0) return undefined;
  // ---- バニラの定義を集める
  const all = {};
  for (const f of fs.existsSync(VANILLA_RC) ? fs.readdirSync(VANILLA_RC) : []) {
    if (!f.endsWith(".json")) continue;
    try {
      Object.assign(all, readJsonc(path.join(VANILLA_RC, f)).render_controllers ?? {});
    } catch {
      /* 読めないものは飛ばす */
    }
  }
  const out = {};
  const used = [];
  for (const entry of names) {
    const from = typeof entry === "string" ? entry : Object.keys(entry)[0];
    const body = all[from];
    // **見つからなければ、こちらの既定を使う**（写せないものは無理に写さない）
    if (body === undefined) {
      used.push("controller.render.pve3_hurt");
      continue;
    }
    const to = `controller.render.pve3.${id}.${from.split(".").pop()}`;
    out[to] = { ...pickable(body), overlay_color: OVERLAY };
    used.push(typeof entry === "string" ? to : { [to]: Object.values(entry)[0] });
  }
  if (Object.keys(out).length === 0) return used;
  fs.mkdirSync(RC, { recursive: true });
  const file = path.join(RC, `pve3_${id}.render_controllers.json`);
  if (fs.existsSync(file) && force !== true) throw new Error(`もうある: ${file}（上書きするなら --force）`);
  fs.writeFileSync(file, `${JSON.stringify({ format_version: "1.8.0", render_controllers: out }, null, 2)}
`, "utf-8");
  return used;
}

/** 装備の部品。**表があるときだけ** */
function gearOf(table) {
  if (table === undefined) return {};
  return {
    "minecraft:equipment": { table },
    // **拾って着る動き。** バニラのモブが持っているのと同じ
    "minecraft:behavior.equip_item": { priority: 3 },
  };
}

/**
 * **装備表を書く。**
 *
 * > ### **持たせるのはバニラの仕組みで**（2026-09-08 に切り替えた）
 * >
 * > **script の `setEquipment` では弓が入らなかった**（弓も矢も出ない）。
 * > **バニラのモブは全部 `minecraft:equipment` の表で持っている**——**同じやり方にする。**
 * > **`ranged_attack` は弓を持っていないと撃たない**ので、ここが入らないと矢も出ない。
 *
 * @returns 表のパス（要らなければ undefined）
 */
function writeLoot(def, force) {
  const items = [def.hand, def.head].filter((x) => x !== undefined);
  if (items.length === 0) return undefined;
  const doc = {
    pools: items.map((name) => ({ rolls: 1, entries: [{ type: "item", name, weight: 1 }] })),
  };
  fs.mkdirSync(LOOT, { recursive: true });
  const file = path.join(LOOT, `${def.id}.json`);
  if (fs.existsSync(file) && force !== true) throw new Error(`もうある: ${file}（上書きするなら --force）`);
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}
`, "utf-8");
  return `loot_tables/gear/${def.id}.json`;
}

/** ビヘイビア側を書く */
/**
 * **中立の敵が怒る仕掛け。**
 *
 * > ### **こちらのダメージには「殴った人」が入っていない**（実測・2026-09-08）
 * >
 * > **`damage @s N self_destruct` で削っている**（`services/cmd.ts`）。
 * > **`self_destruct` は「自分で壊れた」**——**`hurt_by_target` は誰に殴られたか分からない。**
 * > **だから中立の敵は、殴っても永久に反撃しなかった。**
 *
 * **script が「怒った」と伝える**（`services/traits.ts` の `anger()`）。
 * **群を足すと、狙う部品が生える。**
 */
/**
 * **爆ぜる敵の導火線**（クリーパー・帯電クリーパー）。
 *
 * **バニラのクリーパーと同じ形**——**群を足すと火が点き、外すと消える。**
 * **`minecraft:explode` が、膨らむ絵とシューという音と 1.5 秒の待ちを作る。**
 * **ダメージは 0 にしてある**——**削るのは script**（`features/mob/index.ts`）。
 */
function fuseOf(def, seconds) {
  if (def.kind !== "boom") return {};
  return {
    component_groups: {
      "pve_v3:fuse_lit": {
        "minecraft:explode": {
          fuse_length: seconds,
          fuse_lit: true,
          power: 3,
          // **地形を壊さない**（`07-enemy-plan.md` 6 章）
          breaks_blocks: false,
          causes_fire: false,
          // **公式**: *A value of 0 prevents the explosion from dealing any damage.*
          damage_scaling: 0,
        },
      },
    },
    events: {
      "pve_v3:fuse": { add: { component_groups: ["pve_v3:fuse_lit"] } },
      "pve_v3:unfuse": { remove: { component_groups: ["pve_v3:fuse_lit"] } },
    },
  };
}

function angerOf(def) {
  if (def.neutral !== true) return {};
  return {
    component_groups: {
      "pve_v3:angry": {
        "minecraft:behavior.nearest_attackable_target": {
          priority: 2,
          reselect_targets: true,
          must_see: false,
          within_radius: 100,
          entity_types: [
            {
              filters: {
                all_of: [
                  { test: "is_family", subject: "other", value: "player" },
                  { none_of: [{ test: "has_ability", subject: "other", value: "instabuild" }] },
                ],
              },
              max_dist: 100,
              must_see: false,
            },
          ],
        },
      },
    },
    events: { "pve_v3:anger": { add: { component_groups: ["pve_v3:angry"] } } },
  };
}

/**
 * **バニラの実体をそのまま土台にする**（`--base <名前>`）。
 *
 * > ### **ひな形では作れないモブがある**（実測・2026-09-08）
 * >
 * > **クリーパーは 5 つの部品群と 4 つのイベントが噛み合って動く**——
 * > **膨らむ・火が点く・離れたら消える・爆ぜる。**
 * > **こちらのひな形に足していく形では、どうしても噛み合わなかった。**
 * >
 * > **バニラの JSON をそのまま持ってきて、こちらのぶんを足すほうが確か。**
 *
 * **足すもの**（PVE として要るもの）:
 *
 * | | |
 * | --- | --- |
 * | **家族** | `pve_mob`（`services/field.ts` がこれで数える） |
 * | **性質** | 赤く光る・振り・膨らみ・色味（`properties`） |
 * | **消えない** | `persistent` ／ 自然湧きしない（`is_spawnable: false`） |
 * | **HP** | **5000**（飾り。実 HP は `state/hp.ts`） |
 * | **狙い方** | 100 マス・壁越し・クリエイティブを狙わない |
 *
 * **消すもの**: バニラの落とし物・経験値・消滅・日光で燃える・触れる。
 *
 * **爆発は書き換える**——**地形を壊さない／ダメージは script が出す。**
 */
function fromVanilla(def, base, tint, replace) {
  const file = path.join(VANILLA_BP, `${base}.json`);
  if (!fs.existsSync(file)) throw new Error(`バニラの実体が無い: ${file}`);
  const doc = readJsonc(file);
  const ent = doc["minecraft:entity"];
  ent.description = {
    // > ### **バニラそのものを置き換える**（`--replace`・2026-09-08）
    // >
    // > **公式**: *`query.swell_amount` — Only works for "minecraft:creeper" and "minecraft:wither".*
    // > **写した実体では動かない。** **`minecraft:creeper` のまま上書きすれば動く。**
    // > **自然湧きは止める**（`is_spawnable: false`）ので、出るのはこちらが湧かせた分だけ。
    identifier: replace === true ? `minecraft:${base}` : `pve_v3:${def.id}`,
    is_summonable: true,
    is_spawnable: false,
    properties: propsOf(tint),
  };
  const comp = ent.components ?? {};
  // ---- **要らないものを外す**
  for (const k of [
    "minecraft:loot",
    "minecraft:experience_reward",
    "minecraft:despawn",
    "minecraft:burns_in_daylight",
    "minecraft:interact",
    "minecraft:hurt_on_condition",
    "minecraft:behavior.avoid_mob_type",
  ]) {
    delete comp[k];
  }
  // ---- **こちらのぶんを足す**
  Object.assign(comp, {
    "minecraft:type_family": { family: ["pve_mob", "mob"] },
    "minecraft:persistent": {},
    "minecraft:health": { value: 5000, max: 5000 },
    "minecraft:fire_immune": {},
    "minecraft:knockback_resistance": { value: 1 },
    "minecraft:loot": { table: "loot_tables/empty.json" },
    "minecraft:nameable": { always_show: true, allow_name_tag_renaming: false },
    "minecraft:follow_range": { value: 100, max: 100 },
    "minecraft:behavior.nearest_attackable_target": TARGET,
    // **実ダメージは script が入れる**（`services/fuse.ts`）
    "minecraft:attack": { damage: 0 },
  });
  // ---- **爆発は地形を壊さず、ダメージも出さない**
  for (const [name, group] of Object.entries(ent.component_groups ?? {})) {
    const boom = group["minecraft:explode"];
    if (boom === undefined) continue;
    // > ### **帯電のぶんは、別の長さ**（2026-09-08）
    // >
    // > **同じ実体データを、クリーパーと帯電クリーパーで分け合っている。**
    // > **帯電の群は `minecraft:charged_*`**——**そちらだけ導火線を長くできる。**
    const ticks = name.includes("charged") ? (def.chargedInterval ?? def.interval) : def.interval;
    group["minecraft:explode"] = {
      ...boom,
      breaks_blocks: false,
      causes_fire: false,
      destroy_affected_by_griefing: false,
      damage_scaling: 0,
      // **導火線の長さは、こちらの値**（呪いでは縮まない）
      // **JSON の導火線は、script より少し長く**——**script のダメージが先に入るように**
      fuse_length: ticks / 20 + 0.15,
    };
  }
  // > ### **帯電は、同じ実体の別の群**（2026-09-08 決定）
  // >
  // > **バニラのクリーパーは `minecraft:charged_creeper` の群を足すと帯電になる。**
  // > **`EnemyDef.charged` を書いた敵は、湧いた瞬間にその群を足す**
  // > （`services/spawn.ts`）——**実体データは 1 つのまま。**
  // **帯電の合図は、いつでも持たせておく**（分け合う相手が使う）
  if (ent.component_groups?.["minecraft:charged_creeper"] !== undefined) {
    ent.events = { ...ent.events, "pve_v3:charge": { add: { component_groups: ["minecraft:charged_creeper"] } } };
  }
  return doc;
}

function writeBehavior(def, box, reach, move, nav, scale, tint, gear) {
  return {
    format_version: "1.26.20",
    "minecraft:entity": {
      description: {
        identifier: `pve_v3:${def.id}`,
        is_summonable: true,
        is_spawnable: false,
        // **赤く光る・凍る・色味**（`resource_packs/.../render_controllers`）
        properties: propsOf(tint),
      },
      components: { ...common(box, move, nav, scale, def), ...attackOf(def, reach), ...gearOf(gear) },
      // **段は `pve3-mobjson.mjs` が書き足す**（既にある群は消さない）。
      // **中立の敵は「怒った群」をここで持つ**（`angerOf`）
      component_groups: { ...angerOf(def).component_groups, ...fuseOf(def, def.interval / 20).component_groups },
      // > ### **空のイベントでは鳴らない**（実測・2026-09-08）
      // >
      // > **`on_attack` が指すイベントの中身が空だと、実体は何も変わらない。**
      // > **`dataDrivenEntityTrigger` は「定義が変わった」ときの合図**なので、
      // > **何も変えないイベントは script まで届かない。**
      // >
      // > **`set_property` で振りの時計を立てる**（`Entity Events.html`）——
      // > **これで実体が変わるので合図が飛び、同時にアニメも回り出す。**
      events: {
        ...angerOf(def).events,
        ...fuseOf(def, def.interval / 20).events,
        ...(def.sweep === undefined
          ? {}
          : { "pve_v3:swung": { set_property: { "pve_v3:swing": 10.0 } } }),
      },
    },
  };
}

/**
 * 見た目側を書く。
 *
 * > ### **アニメの配線は、バニラをそのまま写す**（2026-09-08 に直した）
 * >
 * > **前は人型だけ最小構成を組み立てていた**（歩く・見る、だけ）。
 * > **その結果、殴るモーションも弓を構える姿勢も出なかった。**
 * > **攻撃の動きは `animation_controllers` が駆動している**——**捨ててはいけない。**
 *
 * > ### **空の `scripts` を書かない**
 * >
 * > **`"scripts": {}` を書くと、その実体は描画されない**（透明になる）。
 * > **クモとシルバーフィッシュがこれで消えていた**（バニラに `scripts` が無い）。
 */
function writeClient(def, look, animFrom, replace) {
  const src = animFrom ?? look;
  const desc = {
    identifier: replace ?? `pve_v3:${def.id}`,
    materials: look.materials,
    textures: look.textures,
    geometry: look.geometry,
    // **持ち物を描くのに要る**（`24-mob-howto.md` 6-6）。バニラの持ち物モブは全部これを持つ
    enable_attachables: true,
  };
  if (src.animations !== undefined) desc.animations = src.animations;
  // **`animation_controllers` は 1.8.0 だけ**（スキーマで確認・2026-09-08）
  if (src.controllers !== undefined && (src.version ?? "").startsWith("1.8")) {
    desc.animation_controllers = src.controllers;
  }
  // **空なら書かない**
  if (src.scripts !== undefined && Object.keys(src.scripts).length > 0) desc.scripts = swingIn(src.scripts, replace);
  if (src.particles !== undefined) desc.particle_effects = src.particles;
  if (src.sounds !== undefined) desc.sound_effects = src.sounds;
  desc.render_controllers = look.renders ?? ["controller.render.pve3_hurt"];
  // **版は、写した元と同じにする**——**混ぜると、片方の書き方が丸ごと無視される**
  return { format_version: src.version ?? "1.10.0", "minecraft:client_entity": { description: desc } };
}

/**
 * **殴りモーションの変数を作る 1 行を、`pre_animation` の先頭に入れる。**
 *
 * > ### **engine の変数は、こちらの実体には来ない**（実測・2026-09-08）
 * >
 * > **バニラのゴーレムは `variable.attack_animation_tick` で腕を振る。**
 * > **`pve3-anim.py` が「誰も入れていない」と教えてくれていた値。**
 * > **property から作れば、同じアニメがそのまま動く。**
 */
function swingIn(scripts, keepSwell) {
  const line = "variable.attack_animation_tick = q.property('pve_v3:swing');";
  const pre = scripts.pre_animation ?? [];
  // > ### **`query.swell_amount` を自前の property に差し替える**（2026-09-08）
  // >
  // > **公式**: *Only works for "minecraft:creeper" and "minecraft:wither".*
  // > **写した実体では常に 0**——**膨らまないまま、いきなり爆発して見える。**
  // > **式はバニラのまま**、**読む値だけ `pve_v3:fuse` に差し替える。**
  // **`--replace` でバニラそのものを上書きしたときは、`query.swell_amount` が動く**
  const swapped = keepSwell
    ? pre
    : pre.map((l) => (typeof l === "string" ? l.replace(/query\.swell_amount/g, "q.property('pve_v3:fuse')") : l));
  if (swapped.includes(line)) return { ...scripts, pre_animation: swapped };
  return { ...scripts, pre_animation: [line, ...swapped] };
}

/**
 * **小数として書く印**（`24-mob-howto.md` 9-4）。
 *
 * > ### **`0.0` が `0` になると、property が丸ごと読まれない**（**踏んだ**・2026-09-09）
 * >
 * > **JavaScript に整数と小数の区別が無い**ので、`JSON.stringify(0.0)` は `0` と書く。
 * > **Bedrock は `"type": "float"` に整数が来ると弾く**——
 * > *Error loading property 'pve_v3:chill': 'default' value does not match the specified type 'float'*
 * > **その 1 個で「Error loading Actor Properties」になり、全部の property が消える。**
 * > **`q.property()` が何も返さなくなる**（見た目が切り替わらない・膨らまない）。
 *
 * **印を付けて書き、最後に引用符だけ外す。**
 */
function flo(n) {
  return `##${Number(n).toFixed(2)}##`;
}

/** 印を外して、小数のまま JSON に置く */
function unflo(text) {
  return text.replace(/"##(-?\d+\.\d+)##"/g, "$1");
}

function save(file, doc, force) {
  if (fs.existsSync(file) && force !== true) throw new Error(`もうある: ${file}（上書きするなら --force）`);
  fs.writeFileSync(file, `${unflo(JSON.stringify(doc, null, 2))}\n`, "utf-8");
  return path.relative(ROOT, file);
}

function main() {
  const args = process.argv.slice(2);
  const id = args[0];
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i < 0 ? undefined : args[i + 1];
  };
  if (id === undefined || id.startsWith("-")) {
    console.log(
      "tsukaikata: node tools/pve3-newmob.mjs <id> --look <vanilla mob>" +
        " [--box WxH] [--scale n] [--move basic|skip|generic] [--nav walk|climb]" +
        " （飛ぶ・中立・動かないは roster.ts の fly / neutral / still で決まる）" +
        " [--human] [--geo <模型>] [--tex <絵のパス>] [--tint r,g,b,a] [--anim <バニラ>] [--base <バニラの実体>] [--force]"
    );
    return;
  }

  const { defs, walk, moveTop, tiers } = settings();
  const def = defs.find((d) => d.id === id);
  if (def === undefined) {
    console.log(`ENEMIES ni "${id}" ga nai. saki ni scripts/core/enemy.ts he kaku:`);
    console.log(`  ${id}: { id: "${id}", name: "?", hp: 40, attack: 20, speed: 0.8, interval: 20, reach: 2.5, kind: "melee" },`);
    process.exitCode = 1;
    return;
  }

  // > ### **人型は旗 1 つ**（`--human`・2026-09-08）
  // >
  // > **こちらの人型模型 ＋ `textures/entity/pve3/<id>` ＋ バニラの人型モブの配線**を、まとめて指す。
  // > **近接の人型はこれだけで作れる**（`24-mob-howto.md` 9-2）。
  const human = args.includes("--human");
  const geo = opt("geo") ?? (human ? HUMAN_GEO : undefined);
  const tex = opt("tex") ?? (human ? `textures/entity/pve3/${id}` : undefined);

  const look = lookOf(opt("look") ?? id, geo, tex);
  // **自前の絵のときは、アニメの配線を別のバニラから借りる**（既定はゾンビ）
  const custom = geo !== undefined || tex !== undefined;
  // > ### **人型はバニラの人型モブの配線を使う**（2026-09-08・実測で決め直した）
  // >
  // > **`--anim <バニラ>` を書けば、その実体から借りる。**
  // > **書かなければ `HUMAN_ANIM`**——**スケルトンやハスクと同じ、素の人型の動き。**
  // **薙ぎ払う人型には、回転斬りのアニメを足す**（`SPIN_ANIM`）
  const animArg = opt("anim");
  let animFrom = custom ? (animArg === undefined ? HUMAN_ANIM : lookOf(animArg)) : undefined;
  if (animFrom !== undefined && def.sweep !== undefined) {
    animFrom = {
      ...animFrom,
      animations: { ...animFrom.animations, ...SPIN_ANIM.animations },
      scripts: {
        ...animFrom.scripts,
        animate: [...(animFrom.scripts?.animate ?? []), ...SPIN_ANIM.animate],
      },
    };
  }
  const boxArg = opt("box");
  const box = boxArg === undefined ? BOX : { width: Number(boxArg.split("x")[0]), height: Number(boxArg.split("x")[1]) };
  const force = args.includes("--force");

  const scaleArg = opt("scale");
  const scale = scaleArg === undefined ? undefined : Number(scaleArg);
  const move = opt("move") ?? "basic";
  // **色味**（`--tint r,g,b,a`）。**書かなければ色を乗せない**
  const tintArg = opt("tint");
  const tint = tintArg === undefined ? [0, 0, 0, 0] : tintArg.split(",").map(Number);
  const nav = opt("nav") ?? "walk";
  const gear = writeLoot(def, force);
  // **バニラの見た目を借りるときは、描画制御も写す**（`24-mob-howto.md` 6-10）
  look.renders = custom ? undefined : copyRenders(id, look.renders, force);
  // > ### **バニラの実体をそのまま土台にする**（`--base <名前>`・2026-09-08）
  // >
  // > **部品群とイベントが噛み合って動くモブ**（クリーパー）**は、ひな形では作れない。**
  const baseOf = opt("base");
  const replace = args.includes("--replace");
  const bp = baseOf === undefined
    ? writeBehavior(def, box, def.reach ?? 2.5, move, nav, scale, tint, gear)
    : fromVanilla(def, baseOf, tint, replace);
  const a = save(path.join(BP, `${id}.json`), bp, force);
  const b = save(path.join(RP, `${id}.entity.json`), writeClient(def, look, animFrom, replace ? `minecraft:${baseOf}` : undefined), force);
  console.log(`kaita: ${a}`);
  console.log(`kaita: ${b}`);
  console.log(`  ${stamp(def, tiers, walk, moveTop)}`);
  console.log("tsugi: npm run check -> deploy（resopa no ban mo ageru）");
}

main();
