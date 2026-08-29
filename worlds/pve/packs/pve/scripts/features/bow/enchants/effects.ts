/**
 * エンチャントが何をするか。
 *
 * 仕様は `docs/spec/20-enchants.md`。
 *
 * ## 固有能力とぶつかったら
 *
 * **同じ軸を武器が持っているなら、武器が勝つ**（同 3 章）。
 * **拡散だけは掛け合わせる**——2 本の弓に 5 発の拡散で **10 本。**
 *
 * ## ここにあるもの
 *
 * | 何 | どう効くか |
 * | --- | --- |
 * | `powerOf` | **攻撃力の倍率**（強撃・狙撃・死神…を全部掛ける） |
 * | `spreadOf` | **矢の本数と、1 本ごとの割合** |
 * | `pierceOf` | **貫く数** |
 * | `chargeOf` | **ため時間の倍率** |
 * | `onHit` | **当たった後**（炸裂・連鎖・吸収） |
 */

import type { Entity, Player, Vector3 } from "@minecraft/server";

import { current, heal, max } from "../../../state/hp.js";
import { levelOf, type Enchant } from "../../../state/item-enchant.js";
import { hit } from "../../damage/index.js";
import { mobsAround, playAbility, put, splash } from "../abilities/util.js";
import type { HitContext, ShotContext } from "../abilities/index.js";
import type { EnchantAxis } from "./list.js";

/** 群狼を数える距離（マス）と上限 */
const PACK_RANGE = 8;
const PACK_CAP = 0.3;

/** 狙撃・接射が効き切る距離（マス） */
const RANGE_SPAN = 30;

/** 拡散の段ごとの「本数」と「1 本の割合」（`docs/spec/20-enchants.md` 2 章） */
const SPREAD = [
  { count: 2, rate: 0.6 },
  { count: 3, rate: 0.45 },
  { count: 4, rate: 0.4 },
  { count: 5, rate: 0.35 },
] as const;

/**
 * 追撃・初撃のための覚え書き。**メモリだけ**（`/reload` で消えてよい）。
 *
 * | | |
 * | --- | --- |
 * | `lastTarget` | **最後に当てた相手**（追撃が数える） |
 * | `pursueCount` | 同じ相手に続けて当てた数 |
 * | `touched` | **一度でも当てた相手**（初撃が見る） |
 * | `freeDraw` | **次の 1 発はためきり扱い**（矢継ぎ早） |
 */
const lastTarget = new Map<string, string>();

/**
 * **誰が最後にその相手へ当てたか**（連携が見る）。
 *
 * 相手の id → 撃った人の id。**自分以外が当てた相手**を狙うと上がる。
 */
const lastHitter = new Map<string, string>();
const pursueCount = new Map<string, number>();
const touched = new Set<string>();
const freeDraw = new Set<string>();

/** その武器が既に持っている軸か（`Ability.owns`） */
export function ownsAxis(owns: readonly EnchantAxis[] | undefined, axis: EnchantAxis): boolean {
  return owns !== undefined && owns.includes(axis);
}

/**
 * 攻撃力の倍率。**掛け合わせる。**
 *
 * **距離や相手の残りで変わるもの**は、当てる直前でないと決まらない——
 * `target` を渡せるときは渡す（渡さなければ、その分は 1 倍）。
 */
export function powerOf(list: readonly Enchant[], ctx: ShotContext, target?: Entity, at?: Vector3): number {
  let mul = 1;

  // 強撃：段 × 20%
  mul *= 1 + levelOf(list, "power") * 0.2;

  // 背水の陣：**自分の HP が低いほど**
  const lastStand = levelOf(list, "last_stand");
  if (lastStand > 0) {
    const now = current(ctx.player) ?? 0;
    const cap = max(ctx.player) ?? 1;
    mul *= 1 + lastStand * 0.2 * (1 - Math.max(0, Math.min(1, now / cap)));
  }

  // 孤高：**近くに味方が居ないと**（PvE なので、いまはほぼ常に効く）
  const lone = levelOf(list, "lone");
  if (lone > 0 && alone(ctx.player)) mul *= 1 + lone * 0.12;

  // 群狼：**近くの敵が多いほど**（上限あり）
  const pack = levelOf(list, "pack");
  if (pack > 0 && at !== undefined) {
    const n = mobsAround(ctx.player.dimension, at, PACK_RANGE).length;
    mul *= 1 + Math.min(PACK_CAP, n * pack * 0.03);
  }

  if (target !== undefined && at !== undefined) {
    // 狙撃・接射：**距離で変わる**
    const dist = Math.min(RANGE_SPAN, Math.hypot(at.x - ctx.from.x, at.y - ctx.from.y, at.z - ctx.from.z));
    const snipe = levelOf(list, "snipe");
    if (snipe > 0) mul *= 1 + snipe * 0.15 * (dist / RANGE_SPAN);
    const close = levelOf(list, "close");
    if (close > 0) mul *= 1 + close * 0.15 * (1 - dist / RANGE_SPAN);

    // 死神：**相手の HP が低いほど**
    const reaper = levelOf(list, "reaper");
    if (reaper > 0) {
      const now = current(target) ?? 0;
      const cap = max(target) ?? 1;
      mul *= 1 + reaper * 0.17 * (1 - Math.max(0, Math.min(1, now / cap)));
    }

    // 初撃：**まだ当てていない敵**への 1 発目
    if (levelOf(list, "first_strike") > 0 && !touched.has(idOf(target))) mul *= 1.5;

    // 連携：**味方が最後に当てた敵**へ
    const link = levelOf(list, "link");
    if (link > 0) {
      const who = lastHitter.get(idOf(target));
      if (who !== undefined && who !== ctx.player.id) mul *= 1 + link * 0.12;
    }

    // 追撃：**同じ敵に当て続けるほど**
    const pursue = levelOf(list, "pursue");
    if (pursue > 0 && lastTarget.get(ctx.player.id) === idOf(target)) {
      mul *= 1 + Math.min(pursue * 0.1, (pursueCount.get(ctx.player.id) ?? 0) * pursue * 0.02);
    }
  }

  return mul;
}

function idOf(e: Entity): string {
  try {
    return e.id;
  } catch {
    return "";
  }
}

/** 近くに味方が居ないか（**自分は数えない**） */
function alone(player: Player): boolean {
  try {
    return (
      player.dimension
        .getEntities({ location: player.location, maxDistance: 12, type: "minecraft:player" })
        .filter((e) => e.id !== player.id).length === 0
    );
  } catch {
    return true;
  }
}

/**
 * 拡散。**本数と、1 本ごとの割合。**
 *
 * **武器の拡散と掛け合わせる**ので、ここは「何倍に増やすか」を返す。
 */
export function spreadOf(list: readonly Enchant[]): { count: number; rate: number } {
  const lv = levelOf(list, "spread");
  if (lv <= 0) return { count: 1, rate: 1 };
  return SPREAD[Math.min(SPREAD.length, lv) - 1] ?? { count: 1, rate: 1 };
}

/** 貫く数の足し前（**武器が貫通を持っているなら呼ばない**） */
export function pierceOf(list: readonly Enchant[]): { add: number; falloff: number } {
  return levelOf(list, "pierce") > 0 ? { add: 1, falloff: 0.3 } : { add: 0, falloff: 0 };
}

/**
 * ため時間の倍率（**短いほど速い**）。
 *
 * | | |
 * | --- | --- |
 * | 速射 | 段 × 15% 短く |
 * | 矢継ぎ早 | **倒した次の 1 発は、ためきり扱い** |
 */
export function chargeOf(list: readonly Enchant[], player: Player, heldTicks: number): number {
  if (freeDraw.has(player.id) && levelOf(list, "quick_nock") > 0) {
    freeDraw.delete(player.id);
    return 999; // **ためきり扱い**（呼ぶ側が上限で丸める）
  }
  const quick = levelOf(list, "quick");
  if (quick <= 0) return heldTicks;
  return heldTicks / Math.max(0.25, 1 - quick * 0.15);
}

/** 集中：**1 秒より長く引くほど上がる**（段 × 10% / 0.5 秒） */
export function focusOf(list: readonly Enchant[], heldTicks: number): number {
  const lv = levelOf(list, "focus");
  if (lv <= 0) return 1;
  const extra = Math.max(0, heldTicks - 20) / 10;
  return 1 + Math.min(3, extra) * lv * 0.1;
}

/** 属性の蓄積の倍率（浸食） */
export function elementScaleOf(list: readonly Enchant[]): number {
  return 1 + levelOf(list, "erode") * 0.5;
}

/** 貫魔：**属性がその場で 1 回起きる** */
export function forcesElement(list: readonly Enchant[]): boolean {
  return levelOf(list, "pierce_magic") > 0;
}

/** 味方に当たると回復する（光の射手） */
export function healsAllies(list: readonly Enchant[]): boolean {
  return levelOf(list, "light_archer") > 0;
}

/**
 * 当たった後。**炸裂・連鎖・吸収・覚え書き。**
 *
 * @param owned 武器が既に持っている軸（`explode` を持つ弓では炸裂は働かない）
 */
export function onEnchantHit(list: readonly Enchant[], c: HitContext, owned: readonly EnchantAxis[] | undefined): void {
  // 吸収：与えたダメージの 段 × 2%
  const absorb = levelOf(list, "absorb");
  if (absorb > 0) heal(c.player, c.attack * absorb * 0.02);

  // 炸裂・連鎖：**武器が既に爆ぜるなら、こちらは働かない**
  if (!ownsAxis(owned, "explode")) {
    const burst = levelOf(list, "burst");
    if (burst > 0) {
      splash(c, c.at, 2.0, burst * 0.12);
      put(c.player.dimension, "pve:star_flash", { x: c.at.x, y: c.at.y + 0.6, z: c.at.z });
      // **エンチャントの音は、その弓の能力の音を借りる**（無ければ鳴らさない）
      playAbility(c, c.at, 0.35);
    }
    if (levelOf(list, "chain") > 0) {
      for (const e of mobsAround(c.player.dimension, c.at, 4.0)) {
        if (idOf(e) === idOf(c.target)) continue;
        hit({
          by: c.player,
          target: e,
          attack: c.attack * 0.3,
          via: c.bow.item,
          kind: "extra",
          elements: c.elements,
        });
        // **跳んだ跡も、その弓の軌跡で描く**
        put(c.player.dimension, c.bow.trail, { x: c.at.x, y: c.at.y + 1.0, z: c.at.z });
        break; // **「もう 1 体」まで**（下書き 2-1）
      }
    }
  }

  // 覚え書き（追撃・初撃・矢継ぎ早）
  const id = idOf(c.target);
  if (lastTarget.get(c.player.id) === id) {
    pursueCount.set(c.player.id, (pursueCount.get(c.player.id) ?? 0) + 1);
  } else {
    lastTarget.set(c.player.id, id);
    pursueCount.set(c.player.id, 0);
  }
  touched.add(id);
  lastHitter.set(id, c.player.id);
  if (c.killed && levelOf(list, "quick_nock") > 0) freeDraw.add(c.player.id);

  // 稼ぎのもの（**仕組みがまだ無い**。`docs/spec/20-enchants.md` 7 章）——
  // **倒したときに、それらしい手応えだけ返しておく**
  if (c.killed && (levelOf(list, "miner") > 0 || levelOf(list, "bookworm") > 0)) {
    put(c.player.dimension, "pve:star_dust", { x: c.at.x, y: c.at.y + 1.0, z: c.at.z });
    playAbility(c, c.at, 0.3);
  }
}

/** 外したとき。**追撃が切れる** */
export function onEnchantMiss(player: Player): void {
  lastTarget.delete(player.id);
  pursueCount.set(player.id, 0);
}
