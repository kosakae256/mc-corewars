/**
 * 撃つ。**48 本ぶんの通り道はここ 1 本。**
 *
 * 仕様は `docs/spec/19-weapons.md`、矢の前提は `docs/drafts/archer-weapons.md` 0 章。
 *
 * ## 矢は実体にしない
 *
 * **まっすぐ・かなり速い**ので、**その場で線を引いて当てる。**
 *
 * | 実体で飛ばすと | |
 * | --- | --- |
 * | 速い弾 | **1 tick で通り抜ける。** 当たり判定が抜ける |
 * | 数が増える | 拡散・連射で**実体が溢れる** |
 * | 見た目 | **粒で描くほうが自由** |
 *
 * ## 固有能力の差し込み口
 *
 * ```
 * rays    何本・どの向き・何割      （拡散）
 * power   攻撃力の倍率              （ため・連撃・賽）
 * pierce  何体まで抜けるか          （貫通）
 * onHit   当たった相手ごと          （吸収・押す・印）
 * onImpact 着いた場所で             （爆発・場）
 * after   撃った後                  （反動・分身・追い撃ち）
 * ```
 *
 * **弓は「どの型か」を持つだけ**（`features/bow/abilities/`）。
 */

import { MolangVariableMap, system, world, type Entity, type Player, type Vector3 } from "@minecraft/server";

import { finalAttack } from "../../lib/attack.js";
import { chargeRate } from "../../lib/charge.js";
import { ELEMENTS, type Element } from "../../lib/element.js";
import { has, heal } from "../../state/hp.js";
import { killed, mobsAround, toward } from "./abilities/util.js";
import { hit } from "../damage/index.js";
import { applyElement } from "../element/effects.js";
import { weaponKindOf } from "../element/gauges.js";
import { resistOf } from "../element/resist.js";
import { addGauge } from "../../state/gauge.js";
import { abilityOf, type HitContext, type Ray, type ShotContext } from "./abilities/index.js";
import {
  chargeOf,
  elementScaleOf,
  focusOf,
  healsAllies,
  onEnchantHit,
  forcesElement,
  onEnchantMiss,
  ownsAxis,
  pierceOf,
  powerOf,
  spreadOf,
} from "./enchants/effects.js";
import { levelOf, type Enchant } from "../../state/item-enchant.js";
import type { Bow } from "./weapons.js";

/** 届く距離（マス） */
const RANGE = 48;

/** 当たりとみなす太さ（半径・マス） */
const FAT = 0.9;

/**
 * 線を描く間隔（マス）。
 *
 * **一片の長さ（1.0〜1.2）より短くする。** 間隔のほうが長いと**点線になる。**
 */
const TRAIL_STEP = 0.7;

/** きらめきを散らす間隔（線の何片ごとか） */
const SPARK_EVERY = 3;

/** 狙う高さ（足元から。胴と頭） */
const MARKS = [0.9, 1.6] as const;

function norm(v: Vector3): Vector3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? { x: 0, y: 0, z: 1 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * その実体は線の上に居るか。**居るなら距離**。
 *
 * `getEntitiesFromRay` は使わない——**返らないことがある**
 *（前のワールドで、当たっているはずのダーツが当たらなかった）。
 */
function along(from: Vector3, dir: Vector3, target: Entity): number | undefined {
  let at: Vector3;
  try {
    at = target.location;
  } catch {
    return undefined;
  }
  let best: number | undefined;
  for (const h of MARKS) {
    const v = { x: at.x - from.x, y: at.y + h - from.y, z: at.z - from.z };
    const t = v.x * dir.x + v.y * dir.y + v.z * dir.z;
    if (t <= 0 || t > RANGE) continue;
    const dx = v.x - dir.x * t;
    const dy = v.y - dir.y * t;
    const dz = v.z - dir.z * t;
    if (dx * dx + dy * dy + dz * dz > FAT * FAT) continue;
    if (best === undefined || t < best) best = t;
  }
  return best;
}

/** そこまで壁が無いか */
function clear(player: Player, from: Vector3, dir: Vector3, dist: number): boolean {
  try {
    return player.dimension.getBlockFromRay(from, dir, { maxDistance: Math.max(0, dist - 0.2) }) === undefined;
  } catch {
    return true;
  }
}

/** 壁までの距離。**当たらなかったときの線の長さ** */
function wallAt(player: Player, from: Vector3, dir: Vector3): number {
  try {
    const wall = player.dimension.getBlockFromRay(from, dir, { maxDistance: RANGE });
    if (wall === undefined) return RANGE;
    const b = wall.block.location;
    return Math.hypot(b.x + 0.5 - from.x, b.y + 0.5 - from.y, b.z + 0.5 - from.z);
  } catch {
    return RANGE;
  }
}

/**
 * 線を描く。
 *
 * **一片ずつ、進む向きへ寝かせた板を置く**（`docs/spec/13-bow-view.md` 4 章）。
 * 向きは粒の側では分からないので、**こちらから渡す**（`v.dx` / `v.dy` / `v.dz`）。
 */
function trail(player: Player, bow: Bow, from: Vector3, dir: Vector3, dist: number, step: number): void {
  const dim = player.dimension;
  const vars = new MolangVariableMap();
  vars.setFloat("dx", dir.x);
  vars.setFloat("dy", dir.y);
  vars.setFloat("dz", dir.z);

  let n = 0;
  for (let d = 1; d < dist; d += step) {
    const at = { x: from.x + dir.x * d, y: from.y + dir.y * d, z: from.z + dir.z * d };
    try {
      dim.spawnParticle(bow.trail, at, vars);
      // **きらめきは間引く。** 毎片に付けると線がぼやける
      if (bow.spark !== undefined && n % SPARK_EVERY === 0) dim.spawnParticle(bow.spark, at);
    } catch {
      /* 読み込まれていない */
    }
    n += 1;
  }
}

/**
 * 線の上に居る相手を、近い順に。
 *
 * ## 人には当たらない
 *
 * **PvE なので、矢は人を素通りする**（`docs/spec/10-damage.md` 1-2）。
 * **味方が前に立っても、矢が止まらない。**
 *
 * @param allies **人も的にする**（癒しの弓・光の射手だけ true）
 */
function targetsAlong(
  player: Player,
  from: Vector3,
  dir: Vector3,
  allies: boolean
): { entity: Entity; dist: number }[] {
  const out: { entity: Entity; dist: number }[] = [];
  try {
    for (const e of player.dimension.getEntities({ location: from, maxDistance: RANGE })) {
      if (e.id === player.id) continue;
      // **人は素通りする**（回復させる弓のときだけ的になる）
      if (e.typeId === "minecraft:player" && !allies) continue;
      // **HP を持たないものは的にしない**（落ちている物・矢など）
      if (!has(e)) continue;
      const t = along(from, dir, e);
      if (t === undefined) continue;
      if (!clear(player, from, dir, t)) continue;
      out.push({ entity: e, dist: t });
    }
  } catch {
    /* 読み込まれていない */
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/**
 * 1 本ぶん飛ばす。
 *
 * **拡散も、分身も、追い撃ちも、全部ここを通る**——
 * 通り道が 1 本なら、**当たり方の直しも 1 か所で済む。**
 *
 * @param origin 撃ち出す場所。**分身だけ、ずらして撃つ**
 * @returns **当たった数**（外したかどうかの判定に使う）
 */
export function fireRay(ctx: ShotContext, ray: Ray, origin?: Vector3): number {
  const ability = abilityOf(ctx.bow.ability);
  const from = origin ?? ctx.from;
  const dir = norm(ray.dir);
  const attack = ctx.attack * ray.rate;

  // **攻撃力が無いなら飛ばさない**（大砲を溜め切っていないときなど）
  if (attack <= 0) return 0;

  // **武器が貫通を持っているなら、エンチャントの貫通は働かない**
  //（`docs/spec/20-enchants.md` 3 章）
  const ownPierce = ability.pierceFor?.(ctx) ?? ability.pierce;
  const extra =
    ownsAxis(ability.owns, "pierce") || ownPierce !== undefined ? { add: 0, falloff: 0 } : pierceOf(ctx.enchants);
  const pierce = Math.max(1, (ownPierce ?? 1) + extra.add);
  const falloff = ability.falloff ?? extra.falloff;
  // **人を的にするのは、回復させる弓だけ**（PvE。`docs/spec/10-damage.md` 1-2）
  const allies = ability.friendly === true || healsAllies(ctx.enchants);
  const found = targetsAlong(ctx.player, from, dir, allies);

  let reach = wallAt(ctx.player, from, dir);
  let impact: Vector3 | undefined;
  let index = 0;

  for (const t of found) {
    if (index >= pierce) break;
    if (t.dist > reach) break;
    const rate = Math.max(0.1, 1 - falloff * index);
    let at: Vector3;
    try {
      at = t.entity.location;
    } catch {
      continue;
    }
    // **人に当たるのは回復させる弓だけ。** 削らずに回復させる
    if (t.entity.typeId === "minecraft:player") {
      heal(t.entity, attack * rate);
      try {
        t.entity.dimension.playSound("pve.common.bless", at, { volume: 0.45 });
        t.entity.dimension.spawnParticle("pve:star_flash", { x: at.x, y: at.y + 1.0, z: at.z });
      } catch {
        /* 読み込まれていない */
      }
      index += 1;
      if (impact === undefined) impact = at;
      continue;
    }

    // **エンチャントの倍率は、当てる直前でないと決まらない**
    //（狙撃・死神・群狼は距離や相手の残りで変わる）
    const boost = powerOf(ctx.enchants, ctx, t.entity, at);
    hit({
      by: ctx.player,
      target: t.entity,
      attack: attack * rate * boost,
      via: ctx.bow.item,
      charge: ctx.charge,
      elements: ctx.elements,
      elementScale: (ability.elementScale ?? 1) * elementScaleOf(ctx.enchants),
    });
    const hitCtx = { ...ctx, target: t.entity, at, index, killed: killed(t.entity) };
    try {
      ability.onHit?.(hitCtx);
    } catch (err) {
      console.warn(`[bow] onHit ${ctx.bow.ability}: ${String(err)}`);
    }
    try {
      onEnchantHit(ctx.enchants, hitCtx, ability.owns);
      // **貫魔：属性が蓄積を待たずに 1 回起きる**（`docs/spec/20-enchants.md` 2 章）
      if (forcesElement(ctx.enchants) && ctx.elements.length > 0) {
        forceElements(hitCtx);
      }
    } catch (err) {
      console.warn(`[bow] enchant onHit: ${String(err)}`);
    }
    if (impact === undefined) impact = at;
    index += 1;
  }

  // **抜けないなら、最初の相手で線が止まる**
  if (index > 0 && pierce === 1) reach = Math.min(reach, found[0]?.dist ?? reach);

  trail(ctx.player, ctx.bow, from, dir, reach, ability.trailStep ?? TRAIL_STEP);

  const spot = impact ?? {
    x: from.x + dir.x * reach,
    y: from.y + dir.y * reach,
    z: from.z + dir.z * reach,
  };
  // **能力から撃った矢では、着弾の能力を動かさない**
  //（跳弾が跳弾を呼ぶと止まらない。`docs/spec/19-weapons.md` 3 章）
  if ((ctx.depth ?? 0) === 0) {
    try {
      ability.onImpact?.(ctx, spot, index > 0);
    } catch (err) {
      console.warn(`[bow] onImpact ${ctx.bow.ability}: ${String(err)}`);
    }
  }
  return index;
}

/**
 * 1 発撃つ。
 *
 * @param heldTicks 押していた長さ（tick）
 * @param elements その 1 本に付いている属性（`docs/spec/17-element.md`）
 */
export function shoot(
  player: Player,
  bow: Bow,
  heldTicks: number,
  elements: readonly Element[] = [],
  enchants: readonly Enchant[] = []
): void {
  let from: Vector3;
  let dir: Vector3;
  try {
    from = player.getHeadLocation();
    dir = norm(player.getViewDirection());
  } catch {
    return;
  }

  // **ため具合は 1 秒を満とする**（`lib/charge.ts`）。
  //
  // **1 秒より長く引ける弓**（長弓・重弓・大砲）は、
  // **能力が `heldTicks` を見て上乗せする**——
  // ここで弓ごとに変えてしまうと、**基礎攻撃力の意味（1 秒ためた 1 発）が崩れる。**
  const ability = abilityOf(bow.ability);
  // **ためを変えるエンチャントは、ためを持つ弓でだけ効く**
  //（`docs/spec/20-enchants.md` 3 章。速射弓には効かない）
  const owns = ownsAxis(ability.owns, "charge");
  const held = owns ? heldTicks : chargeOf(enchants, player, heldTicks);
  const charge = chargeRate(held);

  // ---- **最終攻撃力を組み立てる**（`docs/spec/10-damage.md` 3-1）
  const base: ShotContext = {
    player,
    bow,
    charge,
    heldTicks,
    attack: finalAttack({ base: bow.base, charge }),
    elements,
    enchants,
    from,
    dir,
  };
  const ctx: ShotContext = {
    ...base,
    // **距離や相手で変わらないぶんだけ、ここで掛ける**（残りは当てる直前）
    attack:
      base.attack * (ability.power?.(base) ?? 1) * powerOf(enchants, base) * (owns ? 1 : focusOf(enchants, heldTicks)),
    // **属性が足りなければ、その 1 発だけ足す**（双属の弓）
    elements: padElements(elements, ability.minElements ?? 0),
  };

  // ---- 何本、どの向きへ（拡散）
  // **追尾：武器が持っていなければ、狙いを寄せる**（`docs/spec/20-enchants.md` 3 章）
  const aimed =
    !ownsAxis(ability.owns, "homing") && levelOf(enchants, "homing") > 0 ? { ...ctx, dir: homingDir(ctx) } : ctx;

  // **拡散は掛け合わせる**（2 本の弓 × 5 発の拡散 ＝ 10 本。同 3 章）
  const rays = spreadRays(ability.rays?.(aimed) ?? [{ dir: aimed.dir, rate: 1 }], enchants);
  let landed = 0;
  for (const ray of rays) landed += fireRay(aimed, ray);

  // **反射：武器が持っていなければ、壁で 1 回だけ跳ねる**
  if (landed === 0 && !ownsAxis(ability.owns, "bounce") && levelOf(enchants, "reflect") > 0) {
    const back = { x: -dir.x, y: Math.abs(dir.y) * 0.3, z: -dir.z };
    const spot = { x: from.x + dir.x * 3, y: from.y + dir.y * 3, z: from.z + dir.z * 3 };
    system.runTimeout(() => {
      fireRay({ ...aimed, depth: 1 }, { dir: back, rate: 0.8 }, spot);
    }, 3);
  }

  // ---- 音（**放つ音はバニラで揃える**。`docs/spec/13-bow-view.md` 3-1）
  try {
    player.playSound("random.bow", { pitch: 1.1 + Math.random() * 0.1 });
    if (bow.trailSound !== undefined) {
      player.dimension.playSound(
        bow.trailSound,
        { x: from.x + dir.x * 3, y: from.y + dir.y * 3, z: from.z + dir.z * 3 },
        { volume: 0.75, pitch: 0.96 + Math.random() * 0.08 }
      );
    }
  } catch {
    /* 消えている */
  }

  try {
    // **1 本も当たらなかったときだけ**（連撃が切れる・大砲が撃てない）
    if (landed === 0) {
      ability.onMiss?.(ctx);
      onEnchantMiss(player);
    }
  } catch (err) {
    console.warn(`[bow] onMiss ${bow.ability}: ${String(err)}`);
  }

  try {
    ability.after?.(ctx);
  } catch (err) {
    console.warn(`[bow] after ${bow.ability}: ${String(err)}`);
  }
}

/**
 * 貫魔（エンチャント）。**属性を、蓄積を待たずに 1 回起こす。**
 *
 * 蓄積は `applyElement` が満なら最大の効果を出す（`docs/spec/17-element.md` 2 章）ので、
 * **その 1 回だけ、蓄積を満まで押し上げてから起こす。**
 */
function forceElements(c: HitContext): void {
  const weapon = weaponKindOf(c.bow.item);
  for (const el of c.elements) {
    try {
      // **満まで押し上げる**（耐性ぶん足す）
      addGauge(c.target, weapon, el, resistOf(c.target, el), system.currentTick);
      applyElement({ ...c, dealt: c.attack, killed: c.killed }, el, system.currentTick);
    } catch (err) {
      console.warn(`[bow] 貫魔 ${el}: ${String(err)}`);
    }
  }
}

/**
 * 追尾（エンチャント）。**近い相手へ狙いを寄せる。**
 *
 * **矢を実体にしていない**ので、曲がる代わりに**撃つ向きを寄せる**
 *（追尾ミサイルと同じ考え方。`docs/spec/19-weapons.md` 3 章）。
 */
function homingDir(ctx: ShotContext): Vector3 {
  let best: Vector3 | undefined;
  let bestDot = 0.6;
  for (const e of mobsAround(ctx.player.dimension, ctx.from, 32)) {
    const to = toward(ctx.from, e);
    if (to === undefined) continue;
    const dot = to.x * ctx.dir.x + to.y * ctx.dir.y + to.z * ctx.dir.z;
    if (dot > bestDot) {
      bestDot = dot;
      best = to;
    }
  }
  return best ?? ctx.dir;
}

/**
 * 拡散を掛け合わせる（`docs/spec/20-enchants.md` 3 章）。
 *
 * **武器が 2 本撃つなら、その 2 本それぞれが 5 発に散る**——**10 本。**
 * **1 本ごとの割合も掛け算**なので、総火力は増えすぎない。
 */
function spreadRays(rays: readonly Ray[], enchants: readonly Enchant[]): Ray[] {
  const { count, rate } = spreadOf(enchants);
  if (count <= 1) return [...rays];
  const out: Ray[] = [];
  for (const ray of rays) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
      const a = t * 0.16;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      out.push({
        dir: { x: ray.dir.x * cos - ray.dir.z * sin, y: ray.dir.y, z: ray.dir.x * sin + ray.dir.z * cos },
        rate: ray.rate * rate,
      });
    }
  }
  return out;
}

/**
 * 属性を足す。**その 1 発のあいだだけ**（双属の弓。`docs/spec/19-weapons.md` 3 章）。
 *
 * **アイテムには書かない。** 書くと、撃つたびに増えていく。
 */
function padElements(elements: readonly Element[], least: number): readonly Element[] {
  if (least <= elements.length) return elements;
  const out: Element[] = [...elements];
  while (out.length < least) {
    const pick = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    if (pick !== undefined && !out.includes(pick)) out.push(pick);
  }
  return out;
}

/** いま持っているものの識別子 */
export function heldItem(player: Player): string | undefined {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    return c?.getItem(player.selectedSlotIndex)?.typeId;
  } catch {
    return undefined;
  }
}

/** 世界に居る人を id で引く */
export function playerById(id: string): Player | undefined {
  try {
    return world.getAllPlayers().find((p) => p.id === id);
  } catch {
    return undefined;
  }
}
