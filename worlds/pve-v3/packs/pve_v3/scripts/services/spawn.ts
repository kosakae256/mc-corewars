/**
 * 敵を湧かせる。
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md`。
 *
 * ```
 * 出す数と中身 ＝ 敵グループ（★）× 人数
 * 1 体の値     ＝ 固有値 × 人数倍率 × ウェーブ倍率 × 呪い倍率 × 丸め係数
 * ```
 *
 * > ### 一度に全部出さない
 * >
 * > **50 体を 1 tick で出すと固まる。** 待ち行列に積んで、少しずつ出す。
 */

import { world, type Entity } from "@minecraft/server";

import { attackOf, hpOf, LEGIONS, planOf, type EnemyDef } from "../core/enemy.js";
import { FIELD, PLACES } from "../core/places.js";
import { setup, setMax } from "../state/hp.js";
import { setLabel } from "../state/label.js";
import { KEYS } from "../state/keys.js";

/** 1 tick に出す数。**多いと固まる** */
const PER_TICK = 3;

/** これから出すもの */
interface Pending {
  readonly def: EnemyDef;
  readonly hp: number;
  readonly attack: number;
}

let queue: Pending[] = [];

/** まだ出し切っていないか */
export function spawning(): boolean {
  return queue.length > 0;
}

/** 出しかけを捨てる */
export function stopSpawning(): void {
  queue = [];
}

/**
 * そのウェーブの敵を積む。**出すのは `stepSpawn` が少しずつやる。**
 *
 * @returns 出す予定の数
 */
export function queueLegion(legionId: string, players: number, wave: number, curse: number): number {
  const legion = LEGIONS[legionId];
  if (legion === undefined) return 0;
  const plan = planOf(legion, Math.max(1, players), wave);
  const next: Pending[] = [];
  for (const pick of plan.picks) {
    for (let i = 0; i < pick.count; i++) {
      next.push({
        def: pick.enemy,
        hp: hpOf(pick.enemy, wave, curse, plan.pack),
        attack: attackOf(pick.enemy, players, curse),
      });
    }
  }
  queue = next;
  return next.length;
}

/** 湧く場所。**戦場の中に散らす。奥（ポータル側）から出す** */
function spotFor(i: number): { x: number; y: number; z: number } {
  const a = (i * 2.399963) % (Math.PI * 2); // 黄金角。**固まらずに散る**
  const r = 8 + ((i * 7) % 22);
  return {
    x: Math.round(Math.cos(a) * r),
    y: FIELD.groundY + 3,
    z: Math.round(FIELD.portalZ * 0.55 + Math.sin(a) * r),
  };
}

/** 1 体出す */
function spawnOne(p: Pending, i: number): Entity | undefined {
  try {
    const dim = world.getDimension("overworld");
    const e = dim.spawnEntity(`pve_v3:${p.def.id}`, spotFor(i));
    setup(e, p.hp);
    setMax(e, p.hp);
    setLabel(e, `§c${p.def.name}`);
    // **攻撃力はその個体に持たせる**（`services/attack.ts` が読む）
    e.setDynamicProperty(KEYS.atk, p.attack);
    e.setDynamicProperty(KEYS.kind, p.def.id);
    return e;
  } catch {
    return undefined;
  }
}

/** 待ち行列を少し進める */
export function stepSpawn(now: number): void {
  if (queue.length === 0) return;
  for (let n = 0; n < PER_TICK && queue.length > 0; n++) {
    const p = queue.shift();
    if (p === undefined) break;
    spawnOne(p, now + n);
  }
}

/** 湧く所の中心（確かめ用） */
export function spawnCenter(): { x: number; y: number; z: number } {
  return { x: PLACES.field.x, y: FIELD.groundY + 1, z: Math.round(FIELD.portalZ * 0.55) };
}
