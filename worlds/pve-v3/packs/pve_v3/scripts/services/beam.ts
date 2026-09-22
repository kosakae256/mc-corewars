/**
 * **即着の線。** **弾速が無い**——**撃った瞬間に当たる。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 8 章。
 *
 * | 使う敵 | |
 * | --- | --- |
 * | **カウボーイ**（★3） | **銃弾。** 貫通しない |
 * | **チェンバー**（★5） | **高威力の一撃。** **貫通する**（`07-enemy-plan.md`） |
 *
 * ## なぜ弾ではないのか
 *
 * > ### **避けられない、という性能**
 * >
 * > **`bullet.ts` は毎 tick 進めるので、必ず飛行時間がある。**
 * > **「見てから避けられない」を作るには、その場で決めるしかない。**
 *
 * **壁は止める**（`services/wall.ts`）——**壁越しには当たらない。**
 */

import { MolangVariableMap, world, type Dimension, type Entity, type Player, type Vector3 } from "@minecraft/server";

import { BEAM } from "../core/tuning.js";
import { pierced } from "../core/beam.js";

/** 押す向きを出すために、当たった点から戻す距離（マス） */
const BACK = 3;
import { distanceAlong, pointAt } from "../core/geometry.js";
import { hit } from "./combat.js";
import { has } from "../state/hp.js";
import { fire } from "./bullet.js";
import { hittable } from "./mobaim.js";
import { powerOf } from "./melee.js";
import { startSwing } from "./swing.js";
import { faceAt, nearest, ready, swingOf, told, toward } from "./traits.js";
import type { EnemyDef } from "../core/enemy.js";
import { wallAlong } from "./wall.js";
import { rangedBusy, visibleTarget } from "./ranged-ai.js";
import { clearSight } from "./sight.js";
import { aimGun } from "./gun-aim.js";

/** 1 回ぶんの頼み方 */
export interface BeamSpec {
  readonly dim: Dimension;
  /** 出る所 */
  readonly from: Vector3;
  /** 向き（長さ 1） */
  readonly dir: Vector3;
  /** 力 */
  readonly power: number;
  /** 届く距離（マス）。**書かなければ既定** */
  readonly range?: number;
  /** 当たりの太さ（マス）。**書かなければ既定** */
  readonly fat?: number;
  /** **貫通するか。** 書かなければ既定（貫通しない） */
  readonly pierce?: boolean;
  /** 押す強さ */
  readonly knock?: number;
  /** **上へ飛ばす強さ**（`22-feedback.md` 6-2）。**書かなければ浮かせない** */
  readonly up?: number;
  /** 見た目の粒。**書かなければ既定** */
  readonly particle?: string;
}

/** 線を描く */
function draw(spec: BeamSpec, length: number): void {
  const particle = spec.particle ?? BEAM.particle;
  // > ### **手前から順に現れる**（2026-09-10）
  // >
  // > **全部を同時に置くと「線が引かれた」ようにしか見えない。**
  // > **`v.delay` までは大きさ 0** にして、**端まで `BEAM.travel` 秒で走らせる**
  // > （`25-enemy-kit.md` 8-2-1）。**当たりはその場で決まっている**——**見た目だけ。**
  const vars = new MolangVariableMap();
  const far = Math.max(BEAM.gap, length);
  for (let d = 0; d < length; d += BEAM.gap) {
    try {
      vars.setFloat("delay", (d / far) * BEAM.travel);
      spec.dim.spawnParticle(particle, pointAt(spec.from, spec.dir, d), vars);
    } catch {
      /* 読み込まれていない */
    }
  }
}

/**
 * 撃つ。
 *
 * @returns 当てた人数
 */
export function beam(spec: BeamSpec, source?: Entity): number {
  const want = spec.range ?? BEAM.range;
  // **壁までで切る**
  const wall = wallAlong(spec.dim, spec.from, spec.dir, want);
  const range = wall ?? want;
  draw(spec, range);

  // **胴と頭を見る**（`core/geometry.ts` の `HitShape`）
  const shape = { fat: spec.fat ?? BEAM.fat, marks: [0.9, 1.6] };
  const found: { readonly p: Entity; readonly at: number }[] = [];
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== spec.dim.id || !has(p) || !hittable(p)) continue;
    const t = distanceAlong(spec.from, spec.dir, range, p.location, shape);
    if (t === undefined) continue;
    if (!clearSight(spec.dim, spec.from, { ...p.location, y: p.location.y + 1 })) continue;
    found.push({ p, at: t });
  }
  // **貫通の判定は core に置いてある**（`npm test` が見張る・`core/beam.ts`）
  const targets = pierced(found, spec.pierce === true);
  for (const f of targets) {
    hit({
      target: f.p,
      attack: spec.power,
      // **飛んできた向きへ押す**（`24-mob-howto.md` 10-5）
      source: source ?? pointAt(spec.from, spec.dir, Math.max(0, f.at - 3)),
      knockPower: spec.knock,
      knockUp: spec.up,
    });
  }
  return targets.length;
}

/**
 * **飛ぶ弾として撃つ**（`EnemyDef.beam.speed` を書いた敵・2026-09-09）。
 *
 * > ### **即着は強すぎた**（カウボーイ）
 * >
 * > **撃った瞬間に当たるので、見てから避ける手が無い。**
 * > **弾速を持たせると、間合いと動きで避けられるようになる。**
 *
 * **当たりの太さ・粒・壁の扱いは `services/bullet.ts` に任せる**——
 * **矢と同じ 1 本を通す。**
 */
export function beamShot(spec: BeamSpec, speed: number, source?: Entity): void {
  fire({
    dim: spec.dim,
    from: spec.from,
    dir: spec.dir,
    speed,
    range: spec.range ?? BEAM.range,
    shape: { fat: spec.fat ?? BEAM.fat, marks: [0.9, 1.6] },
    trail: spec.particle ?? BEAM.particle,
    // **人にしか当たらない**（仲間の敵は素通り）
    playersOnly: true,
    gap: BEAM.gap,
    // **見ているだけの人・クリエイティブは素通り**
    skip: (e) => !hittable(e),
    onHit: (target, _flown, point) => {
      hit({
        target,
        attack: spec.power,
        // **当たった点は体の中。** 少し手前へ戻すと、飛んできた向きに押せる
        source: source ?? pointAt(point, spec.dir, -BACK),
        knockPower: spec.knock,
        knockUp: spec.up,
      });
    },
  });
}

/**
 * **構えている敵の、撃つ時刻**（tick）。**id ごと・メモリだけ**
 *
 * **`beam.windup` を書いた敵だけが載る**（チェンバー）。
 */
const aiming = new Map<string, number>();

/**
 * **構えの見た目を切り替える**（`25-enemy-kit.md` 8-3）。
 *
 * **合図は `minecraft:mark_variant`**——**薙ぎ払いの溜めと同じ仕組み**
 * （`services/windup.ts`。`q.property()` では見た目が変わらなかった）。
 */
function pose(mob: Entity, on: boolean): void {
  try {
    mob.triggerEvent(on ? "pve_v3:pose_charge" : "pve_v3:pose_none");
  } catch {
    /* その口を持たない実体 */
  }
}

/**
 * **構えてから撃つ**（`beam.windup` を書いた敵・`25-enemy-kit.md` 8-3）。
 *
 * > ### **構え切ったら、必ず撃つ**
 * >
 * > **相手が離れたからといって、構えを取り消さない**（薙ぎ払いと同じ決まり）。
 * > **当たるかどうかは、撃った後に決まる。**
 *
 * @returns **まだ撃たない**なら true（呼び手はそこで終わる）
 */
function aim(mob: Entity, def: EnemyDef, people: readonly Player[], now: number, ticks: number): boolean {
  const at = aiming.get(mob.id);
  if (at !== undefined) {
    if (now < at) return true;
    aiming.delete(mob.id);
    pose(mob, false);
    rangedBusy(mob, false);
    return false;
  }
  const target = visibleTarget(mob, people, def.beam?.range ?? 0);
  if (target === undefined) return true;
  if (!ready(mob, swingOf(mob, def), now)) return true;
  // **動かない敵は経路探索で向き直れない**ので、構え始めにも向ける
  faceAt(mob, target);
  pose(mob, true);
  rangedBusy(mob, true);
  aiming.set(mob.id, now + ticks);
  return true;
}

/**
 * **銃声を鳴らす**（`beam.loud`・`25-enemy-kit.md` 8-2-2）。
 *
 * > ### **`dim.playSound` では遠くまで届かない**（`services/throw.ts` で踏んだ）
 * >
 * > **その場から鳴らすと距離で減る。**
 * > **範囲内の人を数えて、その人の側で鳴らす。**
 */
function report(dim: Dimension, at: Vector3, custom?: { readonly sound: string; readonly pitch: number }): void {
  const r = { ...BEAM.report, ...custom };
  try {
    for (const p of dim.getPlayers({ location: at, maxDistance: r.range })) {
      p.playSound(r.sound, { location: at, volume: r.volume, pitch: r.pitch });
    }
  } catch {
    /* 読み込まれていない */
  }
}

/** カウボーイ・チェンバー。**撃った瞬間に当たる** */
export function doBeam(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const b = def.beam;
  if (b === undefined) return;
  if (def.id === "gunner") aimGun(mob, visibleTarget(mob, people, b.range), 1.5);
  if (b.windup !== undefined && b.windup > 0) {
    if (aim(mob, def, people, now, b.windup)) return;
  } else {
    if (visibleTarget(mob, people, b.range) === undefined) return;
    if (!ready(mob, swingOf(mob, def), now)) return;
  }
  startSwing(mob);
  const target = nearest(mob, people, b.range);
  if (target === undefined) return;
  told("線", mob);
  // > ### **撃つ瞬間に、相手へ向ける**（2026-09-09）
  // >
  // > **`behavior.look_at_target` は「たまに見る」ので、撃つ瞬間に向いている保証が無い。**
  // > **動かない敵は、経路探索で向き直ることもできない。**
  if (def.id === "gunner") aimGun(mob, target, 1.5);
  else faceAt(mob, target);
  const at = mob.location;
  const from = { x: at.x, y: at.y + 1.5, z: at.z };
  const power = powerOf(mob) || def.attack;
  // **撃った場所から、広い範囲に鈍い銃声**（`25-enemy-kit.md` 8-2-2）
  if (b.loud === true) report(mob.dimension, from, b.report);
  // **弾速を書いた敵は、本物の弾を飛ばす**（`25-enemy-kit.md` 8-1）
  if (b.speed !== undefined && b.speed > 0) {
    beamShot(
      {
        dim: mob.dimension,
        from,
        dir: toward(mob, target),
        power,
        range: b.range,
        knock: def.knockback,
        up: def.knockUp,
        particle: def.trail,
      },
      b.speed,
      mob
    );
    return;
  }
  beam(
    {
      dim: mob.dimension,
      from: { x: at.x, y: at.y + 1.5, z: at.z },
      dir: toward(mob, target),
      power: powerOf(mob) || def.attack,
      range: b.range,
      pierce: b.pierce,
      knock: def.knockback,
      up: def.knockUp,
      // **敵ごとに線の粒を選べる**（`25-enemy-kit.md` 8-2-1）
      particle: def.trail,
    },
    mob
  );
}
