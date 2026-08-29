/**
 * 手応え。**赤く光る・音・ノックバック。**
 *
 * 仕様は `docs/spec/16-feedback.md`。
 *
 * ## バニラの点滅は借りない
 *
 * `applyDamage` でバニラに赤くさせる手は使わない——**無敵時間に飲まれる。**
 * 10 tick 以内の 2 発目は何も起きず、
 * **「1 tick に 3 発ぜんぶ入る」（`docs/spec/10-damage.md` 1-1）と噛み合わない。**
 *
 * > 前のワールドで同じ穴に落ちた。
 * > **「+50% が乗らない」の原因が、無敵時間に飲まれた `applyDamage` だった。**
 *
 * **実体の property を script が立てて、script が下ろす。**
 */

import { Player, world, type Entity, type Vector3 } from "@minecraft/server";

import type { Element } from "../../lib/element.js";

/** 「いま赤い」を持つ property（`entities/grunt.json`） */
const HURT = "pve:hurt";

/**
 * 赤いままの長さ（tick）。**バニラと同じ 10 tick（0.5 秒）。**
 *
 * はじめ 3 tick にしていたが、**一瞬すぎて見えなかった**（2026-08-29）。
 *
 * > **多段ヒットの間は赤いままになる**（星屑は 5 tick ごとに落ちる）。
 * > **それでよい**——バニラも連続で殴られれば赤いままになる。
 */
const FLASH = 10;

/** 殴られた音。**いまはバニラの音を借りている**（`docs/spec/16-feedback.md` 3 章） */
const SOUND = "game.player.hurt";

/**
 * 属性ごとの手応え（`docs/spec/16-feedback.md` 2-2）。
 *
 * **書いていない属性は、ふつうの手応え**（赤く光る・殴られた音）。
 */
const FEEL: Readonly<Partial<Record<Element, { flash: boolean; sound: string; volume: number }>>> = {
  // **炎は赤くしない。** 燃えている間ずっと赤いと、殴られたのか焼かれたのか分からない
  fire: { flash: false, sound: "random.fizz", volume: 0.25 },
};

/** ノックバックの強さ（`docs/spec/16-feedback.md` 4 章） */
const KNOCK_H = 0.9;
const KNOCK_V = 0.35;

/** 赤くしたもの。**id → 下ろす時刻（tick）** */
const flashing = new Map<string, number>();

function setHurt(entity: Entity, on: boolean): void {
  try {
    entity.setProperty(HURT, on);
  } catch {
    // property を持たない実体（プレイヤーなど）。**それでよい**
  }
}

/** 赤くする */
function flash(entity: Entity, now: number): void {
  setHurt(entity, true);
  flashing.set(entity.id, now + FLASH);
}

/** 音を鳴らす。**当たった場所から** */
function sound(entity: Entity, at: Vector3, id: string, volume: number): void {
  try {
    entity.dimension.playSound(id, at, { volume, pitch: 0.9 + Math.random() * 0.2 });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 押す。**プレイヤーが受けたときだけ**（`docs/spec/16-feedback.md` 4 章）。
 *
 * モブを押すと、**多段ヒットの武器が当てるたびに遠ざける。**
 */
function knock(target: Entity, from: Entity | undefined): void {
  if (!(target instanceof Player) || from === undefined) return;
  try {
    const a = target.location;
    const b = from.location;
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    target.applyKnockback({ x: (dx / len) * KNOCK_H, z: (dz / len) * KNOCK_H }, KNOCK_V);
  } catch {
    /* 消えている */
  }
}

/**
 * 当たった手応えを出す。
 *
 * @param from 殴った相手（**居なければ押さない**）
 * @param element **属性ダメージなら、その属性**（音と赤みが変わる）
 */
export function feedback(target: Entity, from: Entity | undefined, now: number, element?: Element): void {
  const feel = element === undefined ? undefined : FEEL[element];
  try {
    const at = target.location;
    if (feel?.flash !== false) flash(target, now);
    sound(target, { x: at.x, y: at.y + 1, z: at.z }, feel?.sound ?? SOUND, feel?.volume ?? 0.9);
    // **属性で押さない。** 押すのは殴られたときだけ（風は自分で押す）
    if (element === undefined) knock(target, from);
  } catch {
    /* もう居ない */
  }
}

/**
 * 赤いのを下ろす。**毎 tick。**
 *
 * **覚えているものではなく、時刻で下ろす**——
 * 途中で消えた実体は `setProperty` が失敗するだけで、記録は捨てる。
 */
export function stepFeedback(now: number): void {
  if (flashing.size === 0) return;
  for (const [id, until] of flashing) {
    if (now < until) continue;
    flashing.delete(id);
    const e = byId(id);
    if (e === undefined) continue;
    setHurt(e, false);
  }
}

/** id から実体を引く。**居なければ undefined** */
function byId(id: string): Entity | undefined {
  try {
    return world.getEntity(id) ?? undefined;
  } catch {
    return undefined;
  }
}
