/**
 * **モブの殴りを、バニラの当たりに乗せる。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/23-enemy-unit.md` 3-3。
 *
 * ```
 * バニラが振る（アニメも間合いもバニラ）
 *        ↓ 当たった瞬間
 * こちらのダメージを入れる（`services/combat.ts`）
 * ```
 *
 * > ### 自前のタイマーで殴らせない（2026-09-07 変更）
 * >
 * > **前は script が「間合いに入って n tick 経ったら当てる」としていた。**
 * > **振る動きはバニラ、当たるのは script**——**両者がずれて、腕と攻撃が合わなかった。**
 * >
 * > **当たる瞬間をバニラに任せれば、動きと必ず一致する。**
 *
 * > ### **当たった瞬間で拾う**（2026-09-08 に戻した）
 * >
 * > **`entityHurt` に乗せると、バニラの無敵時間（10 tick）に飲まれる。**
 * > **攻撃速度を上げても、0.5 秒に 1 回より速く当たらない。**
 * >
 * > **`entityHitEntity` は振るたびに飛んでくる。**
 * > 引き換えに、**クリエイティブ・スペクテイターは自分で弾く。**
 *
 * **攻撃速度は部品の差し替えで効かせる**（`entities/grunt.json` の `pve_v3:haste_*`）。
 */

import { GameMode, Player, world, type Entity } from "@minecraft/server";

import { poison, slow } from "./ailment.js";
import { hit } from "./combat.js";
import { ENEMY_FAMILY } from "./field.js";
import { defOf, hitsInMelee } from "./enemydef.js";
import { startSwing } from "./swing.js";
import type { EnemyDef } from "../core/enemy.js";
import { max as maxHp } from "../state/hp.js";
import { KEYS } from "../state/keys.js";

/** その敵の攻撃力。**湧かせたときに入れてある** */
export function powerOf(mob: Entity): number {
  try {
    const v = mob.getDynamicProperty(KEYS.atk);
    return typeof v === "number" && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** その敵が押す強さ。**持っていなければ既定**（`undefined`） */
export function knockOf(mob: Entity): number | undefined {
  try {
    const v = mob.getDynamicProperty(KEYS.kbPower);
    return typeof v === "number" && v >= 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** それは敵か */
export function isEnemy(entity: Entity | undefined): entity is Entity {
  if (entity === undefined) return false;
  try {
    return entity.matches({ families: [ENEMY_FAMILY] });
  } catch {
    return false;
  }
}

/**
 * **敵がその人を殴った。** こちらの HP を削る。
 *
 * @returns 削ったか
 */
export function enemyMelee(target: Player, mob: Entity | undefined): boolean {
  if (!isEnemy(mob)) return false;
  // **見ているだけの人は殴られない**（`23-enemy-unit.md` 3-3）
  //
  // > **バニラのダメージに乗っていたときは、これが勝手に付いてきた。**
  // > **当たりだけを見るようにしたので、自分で見る。**
  try {
    const mode = target.getGameMode();
    if (mode === GameMode.Creative || mode === GameMode.Spectator) return false;
  } catch {
    return false;
  }
  const def = defOf(mob);
  const swing = swingOf(target, mob, def, powerOf(mob), knockOf(mob));
  if (swing === undefined) return false;
  // **`source` を渡すと、ノックバックの向きが出る**（`22-feedback.md` 6 章）。
  // **押す強さは、その敵が持っている値**（無ければ既定）
  // **殴りモーションの時計を進める**（`services/swing.ts`）
  startSwing(mob);
  hit({ target, attack: swing.power, source: mob, knockPower: swing.knock, knockUp: swing.up, crit: swing.crit });
  ailOf(target, mob);
  return true;
}

/**
 * **その一発の中身を決める。**
 *
 * > ### **敵ごとの分岐は書かない**（`25-enemy-kit.md` 1 章）
 * >
 * > **旗を持つ敵は、全部ここを通る。**
 *
 * | 旗 | 何が変わるか |
 * | --- | --- |
 * | **`ratio`**（急所） | **力を使わず、相手の最大 HP の割合を持っていく**——**育てても軽くならない** |
 * | **`crit`**（痛恨の一撃） | **たまに力が跳ねる。** **そのときだけ押す強さも変わる** |
 *
 * @returns 当てないなら `undefined`
 */
function swingOf(
  target: Player,
  mob: Entity,
  def: EnemyDef | undefined,
  power: number,
  knock: number | undefined
):
  | { readonly power: number; readonly knock: number | undefined; readonly up?: number; readonly crit: boolean }
  | undefined {
  // **殴りでは削らない敵**（`services/enemydef.ts` の `hitsInMelee`）
  if (!hitsInMelee(def)) return undefined;
  // ---- **割合ダメージ**（急所）。**力が 0 でも当たる**
  // **上へも飛ばす敵**（ゴーレムだけ・`22-feedback.md` 6-2）
  const up = def?.knockUp;
  if (def?.ratio !== undefined) {
    const cap = maxHp(target) ?? 0;
    if (cap <= 0) return undefined;
    return { power: Math.max(1, Math.round((cap * def.ratio) / 100)), knock, up, crit: true };
  }
  if (power <= 0) return undefined;
  if (def?.meleeAttack !== undefined && def.attack > 0) {
    power = Math.max(1, Math.round((power * def.meleeAttack) / def.attack));
  }
  // ---- **たまに大きく当たる**（痛恨の一撃）
  const c = def?.crit;
  if (c !== undefined && Math.random() < c.chance) {
    // **大きい一撃だけは上へも飛ばす**（`core/trait.ts` の `crit.up`）
    return { power: Math.round(power * c.mult), knock: c.knock, up: c.up, crit: true };
  }
  return { power, knock, up, crit: false };
}

/**
 * **殴った相手に状態異常を付ける**（`25-enemy-kit.md` 5 章）。
 *
 * > ### **敵ごとの分岐は書かない**
 * >
 * > **`EnemyDef.ailment` を持つ敵は、全部ここを通る**——
 * > **冷気（鈍足）も劇薬（毒）も、旗を書くだけで効く。**
 */
function ailOf(target: Player, mob: Entity): void {
  const ail = defOf(mob)?.ailment;
  if (ail === undefined) return;
  if (ail.slow !== undefined) slow(target, ail.slow.amp, ail.slow.ticks);
  if (ail.poison !== undefined) poison(target, ail.poison.pct, ail.poison.ticks);
}

/**
 * **1 イベント 1 購読**（`docs/imp.md` 10-2）。
 *
 * > ### 無敵時間を通らない所で拾う（2026-09-08 変更）
 * >
 * > **`entityHurt`（傷ついた）はバニラの無敵時間に飲まれる。**
 * > **10 tick 以内の 2 発目は届かない**——**攻撃速度を上げても、
 * > 0.5 秒に 1 回より速く当たらなかった。**
 * >
 * > **`entityHitEntity`（当たった）は、振るたびに飛んでくる。**
 * > **無敵時間は、こちらの HP には無い**（`state/hp.ts`）。
 */
export function subscribeMelee(): void {
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const target = ev.hitEntity;
    if (!(target instanceof Player)) return;
    enemyMelee(target, ev.damagingEntity);
  });
}
