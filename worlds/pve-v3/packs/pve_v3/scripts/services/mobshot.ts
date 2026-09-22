/**
 * **敵の矢。** **バニラに撃たせて、矢だけ差し替える。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 10 章。
 *
 * ```
 * バニラの ranged_attack ──▶ minecraft:shooter が「種」を出す
 *                                    │
 *                       湧いた瞬間に、ここが捕まえる
 *                                    │
 *                       ├ 種は消す
 *                       └ 同じ場所・同じ向きで、自前の弾を撃つ
 * ```
 *
 * > ### なぜバニラに撃たせるのか
 * >
 * > **`ranged_attack` は「間合いまで寄る・視線が通ったら撃つ・腕を引く」を全部持っている。**
 * > **捨てるには惜しい。** **撃つ間隔も部品の段（`pve_v3:haste_*`）でそのまま効く。**
 * > **壁越しに撃たないのも、バニラの視線判定がやってくれる。**
 *
 * > ### **消し損ねたら、撃たない**
 * >
 * > **バニラの矢が残ったまま自前の弾も撃つと、1 回の射撃で 2 発分入る。**
 */

import { world, type Entity, type Vector3 } from "@minecraft/server";

import { ENEMIES } from "../core/roster.js";
import type { EnemyDef } from "../core/enemy.js";
import { pointAt, type HitShape } from "../core/geometry.js";
import { fire } from "./bullet.js";
import { aimFor, arcTo, hittable } from "./mobaim.js";
import { LOB } from "../core/tuning.js";
import { boom } from "./boom.js";
import { hit } from "./combat.js";
import { knockOf, powerOf } from "./melee.js";
import { KEYS } from "../state/keys.js";
import { startSwing } from "./swing.js";
import { tellOps } from "./tell.js";
import { visibleTarget } from "./ranged-ai.js";
import { rangedReach } from "../core/ranged-ai.js";
import { captureSeed } from "./shot-seed.js";
import { current } from "../state/hp.js";

/**
 * **撃った合図の弾**（`24-mob-howto.md` 10-1）。**これを捕まえる。**
 *
 * > ### **バニラの矢は使わない**（2026-09-08 変更）
 * >
 * > **バニラの矢は `uncertainty_base: 16` / `uncertainty_multiplier: 4` を持っている。**
 * > **狙った所からわざとずらす**ので、**矢がまっすぐ飛ばなかった。**
 * > **自前の種はどちらも 0。** **向いた所へまっすぐ出る。**
 */
/** 弾の速さ（マス／tick）。**書いていない敵の既定。9 マス／秒** */
const SHOT = 0.45;

/** 届く距離（マス）。**書いていない敵の既定** */
const RANGE = 15;

/**
 * 当たり判定の形。**プレイヤーに当てるので細い**（`24-mob-howto.md` 10-2）。
 *
 * **味方の矢（0.9）より細い**——**太いと、避けたつもりが当たる。**
 */
/**
 * 弾の当たり。
 *
 * > ### **細すぎた**（2026-09-08 決定）
 * >
 * > **0.45 では、当たっているように見えて抜けていく。**
 * > **3 倍の 1.35 にした。** **敵ごとに変えるなら `EnemyDef.shotFat`。**
 */
const SHAPE: HitShape = { fat: 1.35, marks: [0.9, 1.6] };

/*
 * > ### **見た目の実体は連れない**（2026-09-08 決定）
 * >
 * > **一度は `pve_v3:arrow` を連れて歩いていたが、描かれなかった。**
 * > **弾は script が飛ばしているので、実体は要らない**——**赤い粒だけで見せる。**
 */

/**
 * **軌跡の粒。** **敵の弾は赤**（2026-09-08 決定）。
 *
 * **味方の矢は金色**（`pve_v3:arrow_trail`）。**色で敵味方が分かる。**
 */
const TRAIL = "pve_v3:foe_trail";

/**
 * **弾が消えるまでの距離**は、撃ち始める距離の**この倍**（2026-09-08）。
 *
 * > ### 撃ち始める距離と、届く距離は別
 * >
 * > **`reach` は「ここまで近づいたら撃つ」**（`attack_radius`）。
 * > **撃ったあと、相手が下がっても追いつくように、弾はその倍まで飛ぶ。**
 */
const RANGE_MULT = 2;

/** 粒を置く間隔（マス）。**弾は 1 tick に約 1 マス進む**ので、1 tick に 1 回 */
const GAP = 1.4;

/** 押す向きを出すために、当たった点から戻す距離（マス） */
const BACK = 3;

/** その敵の種類（`ENEMIES` の id）。**湧かせたときに入れてある** */
function kindOf(mob: Entity): string | undefined {
  try {
    const v = mob.getDynamicProperty(KEYS.kind);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** バニラの矢を、自前の弾に差し替える */
function replace(arrow: Entity, mob: Entity): void {
  const def = ENEMIES[kindOf(mob) ?? ""];
  // > ### **出どころは撃った本人の胸**（2026-09-08）
  // >
  // > **種はバニラが好きな所に置く**——**大きい実体だと頭の上あたりから出ていた。**
  const eye = mob.location;
  const at = { x: eye.x, y: eye.y + 1.2, z: eye.z };
  // **散らばりは敵ごと**（バニラのブレイズは `uncertainty_base: 10`）
  const dir = aimFor(arrow, mob, at, def);

  // **撃った瞬間の値を控える**——**当たる前に敵が死ぬ**ことがある
  const attack = powerOf(mob);

  // **先に消す。** 消せなければ撃たない（2 発分入るため）
  try {
    arrow.remove();
  } catch {
    tellOps("矢: 種を消せなかった（自前の弾は撃たない）");
    return;
  }

  if (attack <= 0 || (current(mob) ?? 0) <= 0) return;

  // Scriptで溜めを管理する敵から古い種が届いても、二重に撃たない。
  if (def?.charge?.commit) return;

  // > ### **山なりに投げる撃ち方**（`EnemyDef.lob.arc`・2026-09-08）
  // >
  // > **バニラの `ranged_attack` に「寄って止まって撃つ」をやらせたまま、
  // > 弾だけ山なりにする**——**投石ハスクは近接を持たない投擲モブになる。**
  // **壁を無視する敵は、射線を見ない**（追尾弾だけ・`25-enemy-kit.md` 6-1）
  if (
    def !== undefined &&
    def.throughWall !== true &&
    visibleTarget(mob, world.getAllPlayers(), rangedReach(def) ?? RANGE) === undefined
  ) {
    return;
  }
  fireMobShot(mob, def, dir);
}

/** 確定済みの射撃を共通の弾へ変換する。開始条件は呼び出し側で判定する。 */
export function fireMobShot(mob: Entity, def: EnemyDef | undefined, dir: Vector3): void {
  const eye = mob.location;
  const at = { x: eye.x, y: eye.y + 1.2, z: eye.z };
  const attack = powerOf(mob);
  const knockPower = knockOf(mob);
  if (attack <= 0) return;
  const arc = def?.lob?.arc === true ? arcTo(mob, def, at) : undefined;
  // > ### **投げる敵は腕を振る**（`25-enemy-kit.md` 3-1・2026-09-09）
  // >
  // > **弓を引く動きはバニラの部品にあるが、投げる動きは無い。**
  // > **殴りの腕振り**（`services/swing.ts`）**を流用する。**
  if (arc !== undefined) startSwing(mob);
  fire({
    dim: mob.dimension,
    from: at,
    dir: arc?.dir ?? dir,
    speed: arc?.speed ?? def?.shot ?? SHOT,
    gravity: arc === undefined ? undefined : LOB.gravity,
    range: (def?.reach ?? RANGE) * RANGE_MULT,
    // **太さは敵ごと**（大きい玉は当たりも太く）
    shape: def?.shotFat === undefined ? SHAPE : { ...SHAPE, fat: def.shotFat },
    // **敵ごとに変えられる**（ガストの火の玉は矢と別の粒）。
    // **`noTrail` を書いた敵は跡を残さない**（`25-enemy-kit.md` 3-2）
    trail: def?.noTrail === true ? undefined : (def?.trail ?? TRAIL),
    // **玉を連れて飛ぶ**（バニラの火の弾と同じ見た目）
    body: def?.body,
    // **人にしか当たらない。** 周りの敵を数えない（`24-mob-howto.md` 10-6）
    playersOnly: true,
    // **粒は間引く**——1 tick に 1 回で足りる
    gap: GAP,
    skip: (e) => !hittable(e),
    // > ### **追ってくる弾**（`25-enemy-kit.md` 6 章）
    // >
    // > **`EnemyDef.homing` を書いた敵だけ。** **毎 tick、近い人へ向きを寄せる。**
    homing: def?.homing,
    // **壁で消えず、手前で向きを変えて迂回する**（`25-enemy-kit.md` 6-1）
    throughWall: def?.throughWall,
    // **書いた敵は、距離ではなく時間で消える**（`25-enemy-kit.md` 6-1-1）
    life: def?.shotLife,
    // **狙う相手は撃った瞬間に 1 人決める**（`25-enemy-kit.md` 6-1-2）
    lockOn: def?.lockOn,
    // > ### **撃つ敵の弾は落とさない**（2026-09-08 に外した）
    // >
    // > **一度は `lob` を持つ撃つ敵に重力を掛けた。**
    // > **だが `mobshot` は相手へまっすぐ狙う**ので、**そこから落ちると狙いが外れる。**
    // > **15 マス先を 30 tick で狙うと 13 マス沈んだ。**
    // > **山なりに投げるのは `services/lob.ts` の役**——**あちらは落とす所から逆算する。**
    // > ### **押す向きは「飛んできた方向」**（2026-09-08 に直した）
    // >
    // > **当たった点は、ほぼ相手の体の中。**
    // > **そこから向きを出すと、わずかなずれで横向きになる。**
    // > **少し手前へ戻した点**を渡せば、**矢の進む向きにまっすぐ押せる。**
    onHit: (target, _flown, point) => {
      // **爆ぜる弾は、当たった点で爆ぜる**（ガスト。`25-enemy-kit.md` 2 章）
      if (def?.lob?.boomRadius !== undefined) {
        boom({ dim: mob.dimension, at: point, power: attack, radius: def.lob.boomRadius, knock: knockPower });
        return;
      }
      hit({ target, attack, source: pointAt(point, dir, -BACK), knockPower });
    },
    // **誰にも当たらず地面に届いたら、そこで爆ぜる**（ガスト）
    onEnd: (point) => {
      if (def?.lob?.boomRadius === undefined) return;
      boom({ dim: mob.dimension, at: point, power: attack, radius: def.lob.boomRadius, knock: knockPower });
    },
  });
}

/**
 * **1 イベント 1 購読**（`docs/imp.md` 10-2）。
 *
 * **種が湧いた瞬間**だけを見る。
 */
export function subscribeMobShot(): void {
  world.afterEvents.entitySpawn.subscribe((ev) => {
    try {
      captureSeed(ev.entity, replace);
    } catch {
      /* 消えている */
    }
  });
}
