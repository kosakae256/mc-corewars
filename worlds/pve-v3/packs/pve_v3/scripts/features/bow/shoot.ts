/**
 * 矢を飛ばす。**自前の弾。**
 *
 * **バニラの矢は使わない**——当たり方も見え方も、こちらで決めたいため。
 *
 * **飛ばす仕組みそのものは `services/bullet.ts`**（`24-mob-howto.md` 10-2）。
 * **敵の矢と同じ所を通る。** ここに書くのは**「弓の 1 発は何なのか」**だけ。
 *
 * ```
 * 撃つ ──▶ services/bullet.ts に 1 発頼む
 *            └ 当たったら onHit が呼ばれる ──▶ 威力を組み立てて hit()
 * ```
 *
 * ## v2 から持ってきたもの
 *
 * **札（エンチャント）に関わる部分は全部落とした**——
 * マルチショット・貫通・反射・追尾・連鎖・業火・恵みの雨。
 * **残したのは「飛ぶ・当たる・壁で止まる・軌跡を出す」だけ。**
 */

import { Player, type Entity, type Vector3 } from "@minecraft/server";

import { norm, type HitShape } from "../../core/geometry.js";
import { BOW_HIT, buildShot } from "../../services/attack.js";
import { fire } from "../../services/bullet.js";
import { critFx } from "../../services/fx.js";
import { has } from "../../state/hp.js";
import { hit } from "../../services/combat.js";

/** 弾の速さ（マス/tick）。**80 マス/秒** */
const SPEED = 4;

/** 届く距離（マス） */
const RANGE = 48;

/**
 * 当たりとみなす太さ（半径・マス）。
 *
 * **2026-09-10 に 0.9 から 2 倍**——**狭いと言われた。**
 * **敵の当たり判定そのものではなく、矢の側の太さ**（`core/geometry.ts` の `HitShape`）。
 */
const FAT = 1.8;

/** 当たり判定の形（足元からの高さ＝胴と頭、太さ） */
const SHAPE: HitShape = { fat: FAT, marks: [0.9, 1.6] };

/** 軌跡の粒 */
const TRAIL = "pve_v3:arrow_trail";

/** 味方の的（当たらない） */
const ALLY = "pve_v3:ally";

/** 誰が、どの敵に、もう当てたか（初撃）。**メモリだけ** */
const touched = new Map<string, Set<string>>();

/** 味方か（矢が素通りする） */
function isAlly(e: Entity): boolean {
  try {
    return e instanceof Player || e.typeId === ALLY;
  } catch {
    return false;
  }
}

function isMoving(player: Player): boolean {
  try {
    const v = player.getVelocity();
    return Math.hypot(v.x, v.z) > 0.05;
  } catch {
    return false;
  }
}

/** 当たった */
function land(by: Player, moving: boolean, target: Entity, distance: number, now: number, at: Vector3): void {
  const seen = touched.get(by.id) ?? new Set<string>();
  const first = !seen.has(target.id);

  const shot = buildShot(BOW_HIT, { shooter: by, target, distance, moving, firstHit: first, now });

  seen.add(target.id);
  touched.set(by.id, seen);

  // **クリと素の値を渡す**——特殊攻撃はクリ前の値を参照する
  hit({ by, target, attack: shot.final, via: "pve_v3:bow", crit: shot.crit, power: shot.power });

  // ---- 当たった合図。**光は当たった点に、音は本人に**
  //
  // > ### 弓の通常ヒットは、**クリティカルの粒**を使う（2026-09-02 決定）
  // >
  // > **v2 の「通常ヒット」の粒（`hit_burst` 1 枚）は、弓には弱すぎた。**
  // > **刺さった手応えは、光の筋があって初めて出る。**
  //
  // **音は `services/feedback.ts` が鳴らす**（2026-09-06）——
  // **通常ヒットもクリティカルも、同じ金床の音**。
  // ここで鳴らすと**クリだけ 2 重に鳴る。**
  try {
    critFx(by.dimension, at);
  } catch {
    /* 消えている */
  }
}

/** 1 発撃つ */
export function shoot(player: Player): void {
  try {
    const at = player.getHeadLocation();
    const moving = isMoving(player);
    fire({
      dim: player.dimension,
      from: at,
      dir: norm(player.getViewDirection()),
      speed: SPEED,
      range: RANGE,
      shape: SHAPE,
      trail: TRAIL,
      // **自分と味方は素通り**（PvE。味方が壁にならない）。**的でないものも抜ける**
      skip: (e) => e.id === player.id || isAlly(e) || !has(e),
      onHit: (target, flown, point, now) => land(player, moving, target, flown, now, point),
    });
    // **音量は半分**——連射するので、既定のままだと耳に張り付く
    player.playSound("random.bow", { volume: 0.5, pitch: 1.1 + Math.random() * 0.1 });
  } catch {
    /* 消えている */
  }
}
