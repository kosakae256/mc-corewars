/**
 * 戦闘まわりの決まりごと。
 *
 * 仕様は `docs/spec/11-match.md` 5章。
 *
 * - **味方は殴れない**
 * - **復帰直後は 5 秒無敵。ただし押される力は残る**
 */

import { system, world, Player, EntityDamageCause, type Entity } from "@minecraft/server";

import { isRunning, teamOf } from "../../lib/match-state.js";
import { giveLoadout } from "../loadout/index.js";

/** 無敵の長さ（tick）。5 秒 */
const INVULNERABLE_TICKS = 100;

/**
 * 無敵の付け方。
 *
 * **ダメージを打ち消す方法は採らない。**
 * 打ち消すとノックバックまで消え、
 * 奈落へ突き落とす戦術（`docs/02-map.md` 2-A-2）が
 * 復帰直後の相手に効かなくなってしまう。
 *
 * **耐性（resistance）なら、ダメージだけが 0 になり、押される力は残る。**
 */
const RESISTANCE = "resistance";

/** 効果の強さ。最大にして、確実にダメージを 0 にする */
const RESISTANCE_LEVEL = 255;

/** 攻撃してきた相手がプレイヤーなら返す */
function attackerOf(source: { damagingEntity?: Entity; cause: EntityDamageCause }): Player | undefined {
  if (source.cause !== EntityDamageCause.entityAttack) return undefined;
  const e = source.damagingEntity;
  return e instanceof Player ? e : undefined;
}

/**
 * 復帰直後の無敵を付ける。
 *
 * **開始時・途中参加時・リスポーン時**に呼ぶ。
 */
export function grantSpawnProtection(player: Player): void {
  player.addEffect(RESISTANCE, INVULNERABLE_TICKS, {
    amplifier: RESISTANCE_LEVEL,
    // **粒子を出さない。** 相手から見て無敵と分かる必要はない
    showParticles: false,
  });
}

/**
 * 購読を始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない（実際に事故った）。
 */
export function registerCombat(): void {
  // ---- 味方は殴れない
  world.beforeEvents.entityHurt.subscribe((ev) => {
    // **試合中だけ効かせる。** 準備中に殴り合えないと調整しづらい
    if (!isRunning()) return;
    const victim = ev.hurtEntity;
    if (!(victim instanceof Player)) return;
    const attacker = attackerOf(ev.damageSource);
    if (attacker === undefined) return;
    // 自分自身は対象外
    if (attacker.id === victim.id) return;

    const a = teamOf(attacker);
    const b = teamOf(victim);
    // **どちらかがチーム未所属なら、判断材料が無い。** 何もしない
    if (a === undefined || b === undefined) return;
    if (a !== b) return;

    ev.cancel = true;
  });

  // ---- リスポーンしたら、無敵と支給品
  world.afterEvents.playerSpawn.subscribe((ev) => {
    // **初回参加も、死亡後の復帰も、同じイベントで来る。**
    // `initialSpawn` で区別できるが、どちらでも同じ処理でよい
    if (!isRunning()) return;
    const player = ev.player;
    system.run(() => {
      grantSpawnProtection(player);
      giveLoadout(player);
    });
  });
}
