/**
 * 能力から使う道具。**同じものを 4 か所で書かない。**
 *
 * 仕様は `docs/spec/19-weapons.md` 3 章。
 *
 * ## ここに集めた理由
 *
 * 「近くのモブを集める」「粒を置く」「音を鳴らす」「範囲を削る」は、
 * **どの能力でも要る。** 各ファイルに写していたので、
 * **直すときに 4 か所を直す**ことになっていた（2026-08-29 に集めた）。
 */

import type { Dimension, Entity, Vector3 } from "@minecraft/server";

import { current, has } from "../../../state/hp.js";
import { hit } from "../../damage/index.js";
import type { ShotContext } from "./index.js";

/**
 * **後で動かすものは、必ずこれで包む。**
 *
 * `system.runTimeout` / `runInterval` の中で投げると、
 * **その輪ごと止まる**（`loop.ts` の受け止めは効かない）。
 * **1 つこけても、残りは動き続ける**ようにする。
 */
export function safe(name: string, run: () => void): void {
  try {
    run();
  } catch (err) {
    console.warn(`[bow] ${name}: ${String(err)}`);
  }
}

/** 粒を置く。**読み込まれていない所では何もしない** */
export function put(dim: Dimension, id: string, at: Vector3): void {
  try {
    dim.spawnParticle(id, at);
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * **その弓の能力の音**を鳴らす（`docs/spec/16-feedback.md` 3-1）。
 *
 * **音は弓ごとに違う**（`pve.ability.<弓>`）。
 * 持っていない弓では**何も鳴らさない**——共通の音で埋めない。
 */
export function playAbility(ctx: ShotContext, at: Vector3, volume = 0.5): void {
  const id = ctx.bow.abilitySound;
  if (id === undefined) return;
  play(ctx.player.dimension, id, at, volume);
}

/** 音を鳴らす */
export function play(dim: Dimension, id: string, at: Vector3, volume = 0.5): void {
  try {
    dim.playSound(id, at, { volume });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 近くのモブ。**プレイヤーは含めない。**
 *
 * **人を巻き込まない**のは全部の能力で同じ（PvE なので）。
 */
export function mobsAround(dim: Dimension, at: Vector3, radius: number): Entity[] {
  try {
    return dim
      .getEntities({ location: at, maxDistance: radius })
      .filter((e) => e.typeId !== "minecraft:player" && has(e));
  } catch {
    return [];
  }
}

/** そこから見て、いちばん近いモブ */
export function nearestMob(dim: Dimension, at: Vector3, radius: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of mobsAround(dim, at, radius)) {
    try {
      const p = e.location;
      const d = Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    } catch {
      /* もう居ない */
    }
  }
  return best;
}

/** そこへ向く単位ベクトル。**胴の高さを狙う** */
export function toward(from: Vector3, target: Entity): Vector3 | undefined {
  try {
    const p = target.location;
    const v = { x: p.x - from.x, y: p.y + 1.0 - from.y, z: p.z - from.z };
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  } catch {
    return undefined;
  }
}

/**
 * 範囲を削る。**追加ダメージとして通す**（`docs/spec/10-damage.md` 5 章）。
 *
 * **属性は乗り、効果は連鎖しない。**
 */
export function splash(ctx: ShotContext, at: Vector3, radius: number, rate: number): void {
  for (const e of mobsAround(ctx.player.dimension, at, radius)) {
    hit({
      by: ctx.player,
      target: e,
      attack: ctx.attack * rate,
      via: ctx.bow.item,
      kind: "extra",
      elements: ctx.elements,
    });
  }
}

/** 外へ押す（負の強さで引き寄せる） */
export function shove(target: Entity, from: Vector3, strength: number, lift: number): void {
  try {
    const p = target.location;
    const dx = p.x - from.x;
    const dz = p.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    target.applyImpulse({ x: (dx / len) * strength, y: lift, z: (dz / len) * strength });
  } catch {
    /* 押せない相手 */
  }
}

/**
 * その相手は倒れたか。
 *
 * **倒れた相手はもう消えている**（`hit()` が消す）ので、
 * **HP が読めないことが「倒れた」の合図**になる。
 */
export function killed(target: Entity): boolean {
  const now = current(target);
  return now === undefined || now <= 0;
}

/** 横へ回した向き。**上下は変えない**（狙いがぶれると当てられない） */
export function turn(dir: Vector3, angle: number): Vector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: dir.x * cos - dir.z * sin, y: dir.y, z: dir.x * sin + dir.z * cos };
}
