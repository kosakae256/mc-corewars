/**
 * 戦闘まわりの決まりごと。
 *
 * 仕様は `docs/spec/11-match.md` 5章。
 *
 * - **味方は殴れない**
 * - **復帰直後は 5 秒無敵。ただし押される力は残る**
 *
 * 炎の扱いは `features/special/fireproof.ts` に集めてある
 *（`docs/spec/14-death.md` 6-B）。
 */

import { system, world, Player, EntityDamageCause, type Entity, type EntityDamageSource } from "@minecraft/server";

import { isRunning, shouldBeInBattle, teamOf } from "../../lib/match-state.js";
import { giveLoadout } from "../loadout/index.js";
import { droneOwner, isFlyingDrone } from "../drone/index.js";
import { tntOwnerId } from "../special/tnt.js";

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

/** ドローンの実体 */
const DRONE = "game:drone";

/** 火の点いた TNT の実体 */
const TNT = "minecraft:tnt";

/**
 * 味方どうしか。
 *
 * **試合の外は全部「味方」とみなす**（ロビーで削り合わせない）。
 * 所属は試合中にしか無い（`docs/spec/11-match.md` 6-Y）ので、
 * 「所属が無いなら分からない」にすると**非開始中は素通り**してしまう。
 */
function friendly(a: Player, b: Player): boolean {
  if (a.id === b.id) return true;
  if (!shouldBeInBattle(a) || !shouldBeInBattle(b)) return true;
  const x = teamOf(a);
  const y = teamOf(b);
  if (x === undefined || y === undefined) return true;
  return x === y;
}

/** 攻撃してきた相手がプレイヤーなら返す。**殴りだけ** */
function attackerOf(source: { damagingEntity?: Entity; cause: EntityDamageCause }): Player | undefined {
  if (source.cause !== EntityDamageCause.entityAttack) return undefined;
  const e = source.damagingEntity;
  return e instanceof Player ? e : undefined;
}

/**
 * 傷つけた相手がプレイヤーなら返す。**手段は問わない。**
 *
 * 矢や雪玉のときは**撃った人**が入る。
 * 機体は体力 1 なので、**当たれば何であれ落ちる**——殴りだけ見ても足りない。
 */
function damagerOf(source: EntityDamageSource): Player | undefined {
  const e = source.damagingEntity;
  return e instanceof Player ? e : undefined;
}

/** その実体の種類は。**消えていれば違うものとして扱う** */
function victimTypeIs(entity: Entity, typeId: string): boolean {
  try {
    return entity.typeId === typeId;
  } catch {
    return false;
  }
}

/**
 * 味方の機体なら打ち消す。
 *
 * **持ち主が分からない機体には手を出さない。**
 * 置いてきた機体は持ち主を覚えているので、普通は分かる。
 */
function guardDrone(ev: { damageSource: EntityDamageSource; cancel: boolean }, drone: Entity): void {
  const attacker = damagerOf(ev.damageSource);
  if (attacker === undefined) return;
  const owner = droneOwner(drone);
  if (owner === undefined) return;
  if (friendly(attacker, owner)) ev.cancel = true;
}

/**
 * 味方が点けた TNT の巻き添えか。
 *
 * **点けた本人だけは食らう。**
 */
function blockedByOwnTnt(ev: { damageSource: EntityDamageSource }, victim: Player): boolean {
  const src = ev.damageSource;
  if (src.cause !== EntityDamageCause.entityExplosion && src.cause !== EntityDamageCause.blockExplosion) return false;
  const tnt = src.damagingEntity;
  if (tnt === undefined || !victimTypeIs(tnt, TNT)) return false;

  const ownerId = tntOwnerId(tnt);
  // **誰の物か分からない TNT は、これまでどおり全員に当たる**
  if (ownerId === undefined) return false;
  // **点けた本人には当たる**
  if (ownerId === victim.id) return false;

  const owner = world.getAllPlayers().find((p) => p.id === ownerId);
  // **点けた人が居なくなっていたら、当たる**（判断材料が無い）
  if (owner === undefined) return false;
  return friendly(owner, victim);
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
    const victim = ev.hurtEntity;

    // ---- **味方の機体は殴れない**（2026-08-25 追加 / `docs/spec/23-drone.md` 5-B）
    //
    // 機体は**体力 1。** 当たれば必ず落ちる。
    // 混戦の中で振った剣が味方の機体に当たるだけで、
    // **その人の 5 ダイヤが消える。**
    //
    // **自分の機体も含める。** 誤って落とすのは味方に落とされるのと同じ
    if (!(victim instanceof Player)) {
      if (victimTypeIs(victim, DRONE)) guardDrone(ev, victim);
      return;
    }

    // ---- **味方が置いた TNT では倒れない**（2026-08-25 追加 / 5-1）
    //
    // TNT は**置いた瞬間に着火する**（`docs/03-content.md` 1-4）。
    // 攻め込む味方の足元へ投げれば、それだけで**味方を吹き飛ばせる。**
    //
    // **自分だけは巻き添えを食う。** 逃げ場の無い所で使えば自分が飛ぶ、
    // という**投げ手側の危うさは残す**
    if (blockedByOwnTnt(ev, victim)) {
      ev.cancel = true;
      return;
    }

    const attacker = attackerOf(ev.damageSource);
    if (attacker === undefined) return;

    // ---- **飛んでいる間は殴れない**（docs/spec/23-drone.md 2 章）
    //
    // ドローンは**見るための行動。** 見ながら戦えては、上げる代償が消える
    if (isFlyingDrone(attacker.id)) {
      ev.cancel = true;
      return;
    }
    // 自分自身は対象外
    if (attacker.id === victim.id) return;

    // ---- **試合に出ていない人は殴れない・殴られない**（2026-08-25 追加）
    //
    // ロビーで殴り合えると、**待っている間に削り合いが始まる。**
    // ワイヤーの練習をしている人が巻き込まれるのも困る
    //（`docs/spec/13-grapple.md` 6章）。
    //
    // **どちらか一方でも試合の外なら止める。**
    // 戦場から届く攻撃も、ロビーから出る攻撃も同じ
    if (!shouldBeInBattle(attacker) || !shouldBeInBattle(victim)) {
      ev.cancel = true;
      return;
    }

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
