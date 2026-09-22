/**
 * **共通部品の配線。** **`EnemyDef` に書いた旗を、部品へつなぐ。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md`。
 *
 * ## なぜ 1 箇所に集めるのか
 *
 * > ### **敵ごとにコードを書かせない**
 * >
 * > **敵を 1 体足すのは「`roster.ts` に 1 行」だけ**にしたい。
 * > **動きは全部ここが読む。** **同じ旗は、必ず同じ動きになる。**
 *
 * ```
 * roster.ts の EnemyDef ── 旗（fall / lob / beam / sweep / aura / blink）
 *        ↓ ここが読む
 * services/ の共通部品（boom / zone / sweep / beam / lob / aura / ailment）
 * ```
 */

import { Player, world, type Entity, type Vector3 } from "@minecraft/server";
import { hittable } from "./mobaim.js";

import type { EnemyDef } from "../core/enemy.js";
import { stepAilments } from "./ailment.js";
import { startSwing, stepSwings } from "./swing.js";
import { stepAuras } from "./aura.js";
import { doAura } from "./support.js";
import { hover } from "./hover.js";
import { doRangedSweep } from "./buckshot.js";
import { doWindup } from "./windup.js";
import { doChargedSweep, pruneChargedSweeps } from "./charged-sweep.js";
import { doChargedShot, pruneChargedShots } from "./charged-shot.js";
import { doBeam } from "./beam.js";
import { doBlink } from "./blink.js";
import { onFallen } from "./combat.js";
import { subscribeSwung } from "./swung.js";
export { subscribeFuse } from "./fuselisten.js";
import { tellOps } from "./tell.js";
import { defOf } from "./enemydef.js";
import { CHECKED } from "../core/checked.js";
import { stepFuse } from "./fuse.js";
import { ENEMY_FAMILY, allEnemies } from "./field.js";
import { doLob, doOrbit } from "./throw.js";
import { powerOf } from "./melee.js";
import { onFall, stepBombs } from "./onfall.js";
import { summon } from "./spawn.js";
import { stepZones } from "./zone.js";
import { has } from "../state/hp.js";
import { KEYS } from "../state/keys.js";
import { pruneRanged, updateRanged } from "./ranged-ai.js";

/** いまの tick。**死に際の中でも要る** */
let tickNow = 0;

/** その個体の攻撃間隔（tick）。**呪いで縮んだ後の値** */
export function swingOf(mob: Entity, def: EnemyDef): number {
  try {
    const v = mob.getDynamicProperty(KEYS.swing);
    if (typeof v === "number" && v > 0) return v;
  } catch {
    /* 消えている */
  }
  return def.interval;
}

/** 最後に動いた時刻。**id ごと** */
/** **振った合図**（`minecraft:behavior.delayed_attack` の `on_attack`） */
const lastAct = new Map<string, number>();

/**
 * 溜めが終わったか。
 *
 * > ### **湧いた瞬間に撃たせない**
 * >
 * > **初回は「時計を始める」だけ**——**出てきた瞬間の不意打ちを消す。**
 */
export function ready(mob: Entity, gap: number, now: number): boolean {
  const last = lastAct.get(mob.id);
  if (last !== undefined && now - last < gap) return false;
  lastAct.set(mob.id, now);
  return last !== undefined;
}

/** いちばん近い人 */
export function nearest(at: Entity, people: readonly Player[], within: number): Player | undefined {
  let best: Player | undefined;
  let near = within;
  for (const p of people) {
    // **クリエイティブ・観戦は狙わない**（`24-mob-howto.md` 1-3）
    if (p.dimension.id !== at.dimension.id || !has(p) || !hittable(p)) continue;
    const q = p.location;
    const d = Math.hypot(q.x - at.location.x, q.y - at.location.y, q.z - at.location.z);
    if (d >= near) continue;
    near = d;
    best = p;
  }
  return best;
}

/**
 * **その人のほうへ向き直す。**
 *
 * > ### **狙う前に、体を向ける**（2026-09-09）
 * >
 * > **経路探索は「歩く先」を向くだけ**——**止まって撃つ敵・投げる敵は、
 * > 相手を見ないまま撃っていた。**
 *
 * **同じ場所へ跳ばすだけ**——**`facingLocation` は向きしか変えない。**
 */
export function faceAt(mob: Entity, to: Player): void {
  try {
    const q = to.location;
    mob.teleport(mob.location, { facingLocation: { x: q.x, y: q.y + 1.2, z: q.z } });
  } catch {
    /* 消えている */
  }
}

/** その人へ向かう単位ベクトル。**胸のあたりを狙う** */
export function toward(from: Entity, to: Player): Vector3 {
  const a = from.location;
  const b = to.location;
  const dx = b.x - a.x;
  const dy = b.y + 1 - (a.y + 1.5);
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/** 味方（敵）は素通りする */
export function skipFriends(e: Entity): boolean {
  try {
    if (!(e instanceof Player)) return true;
    return e.matches({ families: [ENEMY_FAMILY] });
  } catch {
    return true;
  }
}

/**
 * **中立の敵を怒らせる。**
 *
 * > ### **バニラには伝わっていない**（実測・2026-09-08）
 * >
 * > **こちらのダメージは `damage @s N self_destruct`**——**「自分で壊れた」扱い。**
 * > **`hurt_by_target` は誰に殴られたか分からないので、永久に反撃しなかった。**
 *
 * **殴られたら、こちらから群を足す。** **狙う部品が生えて、追い始める。**
 * **1 度足せば十分**——**同じ群を重ねても増えない。**
 */
export function anger(mob: Entity): void {
  try {
    if (defOf(mob)?.neutral !== true) return;
    mob.triggerEvent("pve_v3:anger");
  } catch {
    /* その群を持たない実体 */
  }
}

/**
 * 死に際を仕掛ける。**1 度だけ。**
 *
 * **力は `KEYS.atk`**（ウェーブ・人数・呪いを掛けた後の値）**を読む**——
 * **素の値を使うと、後半で弱くなる。**
 */
export function subscribeTraits(): void {
  // **薙ぎ払いは、ビヘイビアの `on_attack` から呼ばれる**（`services/swung.ts`）
  subscribeSwung();
  onFallen((mob) => {
    const def = defOf(mob);
    const fall = def?.fall;
    if (def === undefined || fall === undefined) return;
    const power = powerOf(mob) || def.attack;
    onFall(
      mob,
      {
        boom:
          fall.boom === undefined
            ? undefined
            : { power, radius: fall.boom.radius, up: fall.boom.up, bolt: fall.boom.bolt },
        bomb: fall.bomb === undefined ? undefined : { power, radius: fall.bomb.radius, fuse: fall.bomb.fuse },
        zone: fall.zone,
        split: fall.split,
      },
      tickNow,
      (id, at) => {
        // **子はウェーブ倍率を掛け直さない**（親のぶんで済んでいる）
        summon(id, at, false);
      }
    );
  });
}

/**
 * 毎 tick。**旗を持つ敵だけを動かす。**
 *
 * **旗を 1 つも持たない敵は、ここで何もしない**——**バニラの AI だけで動く。**
 */
/**
 * **旗が動いたことを、運営に 1 度だけ知らせる。**
 *
 * > ### **「近づいて殴るだけ」に見えるものが多かった**（2026-09-08）
 * >
 * > **旗が動いていないのか、動いているのに見えないのかが区別できなかった。**
 * > **1 度だけ出せば、切り分けが 1 往復で済む**（`24-mob-howto.md` 12 章）。
 */
export function told(what: string, mob: Entity): void {
  const def = defOf(mob);
  // **確かめ終えた敵は黙る**（`core/checked.ts`）——**まだ見ていない敵の報せが埋もれる**
  if (def !== undefined && CHECKED.has(def.id)) return;
  tellOps(`${what}: ${String(def?.name ?? mob.typeId)} が動いた`);
}

export function stepTraits(now: number): void {
  tickNow = now;
  stepBombs(now);
  stepZones(now);
  stepAilments(now);
  stepSwings();
  stepAuras(now, (id) => {
    try {
      return world.getEntity(id);
    } catch {
      return undefined;
    }
  });

  // > ### **敵を数えるのは 2 tick に 1 回**（2026-09-08）
  // >
  // > **爆弾・円・毒は毎 tick 進めないと時計がずれる。**
  // > **敵ごとの振る舞いは、半分の回数で足りる**——**溜めは tick 数で測っているので、
  // > 1 tick 遅れても見て分からない。** **敵が 100 体居ると、ここが毎 tick 100 回になる。**
  if (now % 2 !== 0) return;

  const people = world.getAllPlayers();
  // > ### **戦場の箱で切らない**（実測・2026-09-08 に直した）
  // >
  // > **`enemies()` は「いまの戦場の箱の中」しか返さない**（ウェーブを数えるため）。
  // > **箱の外で試すと、投げる・薙ぐ・支える動きが全部止まっていた**——
  // > **殴りだけはバニラ側なので動いていて、「ただのゾンビ」に見えた。**
  // >
  // > **振る舞いは場所に依らない。** **世界中の敵を見る。**
  const foes = allEnemies();
  pruneChargedSweeps(foes);
  pruneChargedShots(foes);
  pruneRanged(foes);
  for (const mob of foes) {
    try {
      const def = defOf(mob);
      if (def === undefined) {
        // **id が入っていない敵**——**旗は 1 つも動かない。** 黙らせない
        tellOps(`旗: ${mob.typeId} に id が入っていない（湧かせ方が違う）`);
        continue;
      }
      // > ### **飛ぶ動きは、ビヘイビアに任せた**（2026-09-08 に戻した）
      // >
      // > **自作の飛行 AI（`services/flight.ts`）は、経路探索と綱引きになった。**
      // > **公式に `navigation.float` ＋ `behavior.float_wander` がある**
      // > （`docs/research/05-entity-behaviors.md`）。
      // **間合いを取るのはビヘイビアの `avoid_mob_type`**（`pve3-newmob.mjs`）——
      // **script から押し返すと、歩く AI と綱引きになって動かない**
      // **飛ぶ敵の高さを帯の中に保つ**（`services/hover.ts`）
      if (def.hover !== undefined) hover(mob, people, def.hover, def.reach + 8);
      updateRanged(mob, def, people, now);
      if (def.charge?.commit) doChargedShot(mob, def, people, now);
      // **遠くから撃つ薙ぎ払い**（散弾）**は、script の時計で撃つ**
      if (def.sweep?.atRange === true) {
        if (def.sweep.windup !== undefined) doChargedSweep(mob, def, people, now);
        else doRangedSweep(mob, def, people, now);
      }
      // **溜めてから振る薙ぎ払い**（回転）**も script の時計**（`24-mob-howto.md` 16-2-1）
      if (def.sweep !== undefined && def.sweep.atRange !== true) doWindup(mob, def, people, now);
      if (def.aura !== undefined) doAura(mob, def, foes, people, now);
      if (def.beam !== undefined) doBeam(mob, def, people, now);
      // > ### **撃つ敵の弾は `mobshot.ts` が出す**（実測・2026-09-08）
      // >
      // > **ガストは `kind: "shoot"` と `lob` を両方持つ。**
      // > **両方走ると 1 周期に 2 発撃つ。** **投げるのは近接の敵だけ。**
      if (def.lob !== undefined && def.kind !== "shoot") doLob(mob, def, people, now);
      if (def.blink !== undefined) doBlink(mob, def, people, now);
      if (def.orbit !== undefined) doOrbit(mob, def, now);
    } catch {
      /* 消えている */
    }
  }
}

export { defOf };
