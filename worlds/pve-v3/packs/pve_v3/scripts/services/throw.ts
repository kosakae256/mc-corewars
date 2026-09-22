/**
 * **投げる敵の動き。** 山なりの投擲と、周りへの弾幕。
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 3 章・7 章。
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。** **投げる系だけをこちらへ移した。**
 */

import { system, world, type Entity, type Player, type Vector3 } from "@minecraft/server";
import { hittable } from "./mobaim.js";

import type { EnemyDef } from "../core/enemy.js";
import { poison } from "./ailment.js";
import { boom } from "./boom.js";
import { groundCircle } from "./fx.js";
import { fire } from "./bullet.js";
import { hit } from "./combat.js";
import { lob } from "./lob.js";
import { putBomb } from "./onfall.js";
import { tellOps } from "./tell.js";
import { powerOf } from "./melee.js";
import { startSwing } from "./swing.js";
import { has } from "../state/hp.js";
import { faceAt, ready, skipFriends, swingOf, told } from "./traits.js";
import { rangedBusy, visibleTarget } from "./ranged-ai.js";

/** 敵の弾の軌跡（`24-mob-howto.md` 10-4） */
const FOE_TRAIL = "pve_v3:foe_trail";

/** 投石ハスク・ボマー。**山なりに投げる** */
export function doLob(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const l = def.lob;
  if (l === undefined) return;
  const target = visibleTarget(mob, people, l.range);
  // > ### **溜めてから投げる**（`EnemyDef.lob.windup`・2026-09-09）
  // >
  // > **腕を振り上げてから離す。** **見てから避ける手がかりになる。**
  // > **溜め始めた後は、相手が離れても投げ切る**（`services/windup.ts` と同じ考え）。
  const hold = held.get(mob.id);
  if (hold !== undefined) {
    if (now < hold.at) return;
    held.delete(mob.id);
    rangedBusy(mob, false);
    throwOne(mob, def, l, hold.to, now);
    return;
  }
  if (target === undefined) return;
  if (!ready(mob, swingOf(mob, def), now)) return;
  if (l.windup !== undefined && l.windup > 0) {
    startSwing(mob);
    held.set(mob.id, { at: now + l.windup, to: target });
    rangedBusy(mob, true);
    return;
  }
  throwOne(mob, def, l, target, now);
}

/**
 * 狙う点。**`scatter` を書いた敵は、そのぶん散らす。**
 *
 * **中心に寄らないよう平方根で散らす**——**外周まで均されて、円の中に等しく落ちる。**
 */
function aimAt(to: Player, scatter?: number): Vector3 {
  const q = to.location;
  if (scatter === undefined || scatter <= 0) return { x: q.x, y: q.y + 1, z: q.z };
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * scatter;
  return { x: q.x + Math.cos(a) * r, y: q.y + 1, z: q.z + Math.sin(a) * r };
}

/** 瓶が割れる音が届く距離（マス） */
const SOUND_RANGE = 24;

/** 溜め中のもの。**投げ先も控える** */
const held = new Map<string, { readonly at: number; readonly to: Player }>();

/** 1 本投げる */
function throwOne(mob: Entity, def: EnemyDef, l: NonNullable<EnemyDef["lob"]>, target: Player, _now: number): void {
  // **投げる前に、相手のほうを向く**（`25-enemy-kit.md` 3-0）
  faceAt(mob, target);
  const at = mob.location;
  const power = powerOf(mob) || def.attack;
  // **爆ぜる弾は当たっても爆ぜる。** そうでなければ、当たった点で小さく効かせる
  const radius = l.boomRadius ?? 1.5;
  const blast = (spot: Vector3): void => {
    // > ### **毒の瓶は、力ではなく毒で削る**（劇薬。`25-enemy-kit.md` 5 章）
    // >
    // > **力が 0 なので、爆発では何も起きない。** **霧に触れた人に毒を付ける。**
    const mist = l.poison;
    if (mist !== undefined) {
      for (const p of world.getAllPlayers()) {
        if (!has(p) || !hittable(p)) continue;
        const q = p.location;
        if (Math.hypot(q.x - spot.x, q.y - spot.y, q.z - spot.z) > mist.radius) continue;
        poison(p, mist.pct, mist.ticks);
      }
      // > ### **落ちた所に、毒だまりを一瞬出す**（2026-09-09）
      // >
      // > **半径そのままの塗りつぶした緑の円**（`services/fx.ts`）。
      // > **「どこまでが毒か」が、その場で分かる。**
      groundCircle(mob.dimension, spot, mist.radius, "pve_v3:venom_circle");
      try {
        // **緑の飛沫**（2026-09-09 にバニラの白い粒から変えた）
        mob.dimension.spawnParticle("pve_v3:venom_splash", spot);
        // > ### **パリン**（バニラのガラスが割れる音・2026-09-09）
        // >
        // > **`dim.playSound` は小さすぎた**——**その場から鳴らすと距離で減る。**
        // > **近くの人に、その人の側で鳴らす**（`services/fx.ts` の `playNear` と同じ手）。
        for (const p of mob.dimension.getPlayers({ location: spot, maxDistance: SOUND_RANGE })) {
          p.playSound("random.glass", { location: spot, volume: 2.4, pitch: 1.15 });
        }
      } catch {
        /* 読み込まれていない */
      }
      // > ### **毒の瓶は爆ぜない**（**踏んだ**・2026-09-09）
      // >
      // > **`attackOf` は必ず 1 以上を返す**（`core/enemy.ts`）ので、
      // > **力 0 のつもりでも `power` は 1 になり、爆発まで走っていた。**
      // > **毒で削る敵は、毒だけ。**
      return;
    }
    // > ### **落ちてから数える**（ボマー・`EnemyDef.lob.fuse`・2026-09-09）
    // >
    // > **その場で爆ぜず、爆弾が転がって 1.5 秒後に爆ぜる。**
    // > **死に際に落とす爆弾と同じ仕組み**——**膨らんで、赤く点滅して、範囲の円が出る。**
    if (l.fuse !== undefined) {
      putBomb({
        dim: mob.dimension,
        at: spot,
        now: system.currentTick,
        power,
        radius,
        knock: def.knockback,
        fuse: l.fuse,
        body: l.body,
      });
      return;
    }
    boom({ dim: mob.dimension, at: spot, power, radius });
  };
  told("投擲", mob);
  // 専用の投擲模型を発射へ同期する（spec/33）。弾道・発射間隔は従来どおり。
  if (def.id === "bomber") startSwing(mob);
  lob({
    dim: mob.dimension,
    // > ### **出どころは胸**（2026-09-09 に下げた）
    // >
    // > **1.5 は頭の高さ**——**頭の上から湧いて見えると言われた。**
    from: { x: at.x, y: at.y + 1.1, z: at.z },
    to: aimAt(target, l.scatter),
    range: l.range * 2,
    flight: l.flight,
    // **瓶の実体を連れて飛ぶ**（劇薬）。**そのときは跡を出さない**
    body: l.body,
    noTrail: l.noTrail,
    skip: skipFriends,
    onHit: (_target, spot) => blast(spot),
    onEnd: (spot) => blast(spot),
  });
}

/**
 * 弾幕。**自分の周りへ、まとめて撒く。**
 *
 * ```
 * 横に円を描くよう等間隔に 16 発
 *   └ まっすぐ飛ぶ。速さは見て避けられるほど
 * ```
 */
export function doOrbit(mob: Entity, def: EnemyDef, now: number): void {
  const o = def.orbit;
  if (o === undefined) return;
  if (visibleTarget(mob, world.getAllPlayers(), o.range) === undefined) return;
  if (!ready(mob, swingOf(mob, def), now)) return;
  const at = mob.location;
  const from = { x: at.x, y: at.y + 1.2, z: at.z };
  const power = powerOf(mob) || def.attack;
  told("弾幕", mob);
  for (let i = 0; i < o.count; i++) {
    const t = (i / o.count) * 2 * Math.PI;
    fire({
      dim: mob.dimension,
      from,
      dir: { x: Math.cos(t), y: 0, z: Math.sin(t) },
      speed: o.speed,
      range: o.range,
      shape: { fat: o.fat ?? 0.45, marks: [0.9, 1.6] },
      // 実体または移動する一粒で表示する場合、固定した軌跡は出さない（spec/36）。
      // >
      // 弾幕は短寿命の粒をつないで描き、弾ごとのエンティティを生成しない。
      body: o.body,
      sprite: o.sprite,
      trail: o.body === undefined && o.sprite === undefined ? FOE_TRAIL : undefined,
      playersOnly: true,
      gap: 1.4,
      skip: skipFriends,
      onHit: (target, _flown, spot) => {
        hit({ target, attack: power, source: spot, knockPower: def.knockback });
      },
    });
  }
}
