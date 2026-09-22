/**
 * **周りの敵へ効く力。** **支援役が持つ。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 9 章。
 *
 * | 使う敵 | 中身 |
 * | --- | --- |
 * | **恵み**（★3） | **半径 5 の敵を、1 tick ごとに 最大 HP の 0.25 % 回復** |
 * | **鼓舞**（★3） | **半径 5 の敵は、5 秒間 攻撃力が 1.5 倍** |
 *
 * **どちらも自分では攻撃しない。** **プレイヤーから 10 マス以上離れていたがる。**
 *
 * ## 攻撃倍率の持たせ方
 *
 * > ### **その個体の控えに書く**
 * >
 * > **`KEYS.atk` は湧いたときに入る「その敵の攻撃力」。**
 * > **鼓舞は、そこへ倍率を掛けた値を書き戻す**——**殴りも弾も、同じ値を読む。**
 * > **切れたら元に戻す**ので、元の値も控えておく。
 */

import { type Entity, type Player, type Vector3 } from "@minecraft/server";

import { AURA } from "../core/tuning.js";
import { KEYS } from "../state/keys.js";
import { current, has, heal, max as maxHp } from "../state/hp.js";

/** 2 点の距離 */
function far(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * **周りの敵を回復する**（恵み）。
 *
 * @param pct 1 回で戻す割合（最大 HP の %）
 */
export function healAura(self: Entity, friends: readonly Entity[], pct: number, radius?: number): void {
  const r = radius ?? AURA.radius;
  const at = self.location;
  for (const e of friends) {
    if (e.id === self.id || !has(e)) continue;
    if (far(at, e.location) > r) continue;
    const cap = maxHp(e) ?? 0;
    const now = current(e) ?? 0;
    if (cap <= 0 || now >= cap) continue;
    heal(e, Math.max(1, Math.round((cap * pct) / 100)));
    show(e, "pve_v3:heal_heart");
  }
}

/**
 * **効いていることを見せる。**
 *
 * > ### **数字が動くだけでは分からない**（2026-09-08）
 * >
 * > **回復も攻撃倍率も、見た目に何も出ないと「壊れている」と区別が付かない。**
 * > **粒を出せば、届いているかが一目で分かる。**
 */
function show(e: Entity, particle: string, up = 1.4): void {
  try {
    const at = e.location;
    e.dimension.spawnParticle(particle, { x: at.x, y: at.y + up, z: at.z });
  } catch {
    /* 読み込まれていない */
  }
}

/** 鼓舞が掛かっている敵。**id → 元の攻撃力と切れる時刻** */
const roused = new Map<string, { readonly base: number; until: number }>();

/**
 * **周りの敵の攻撃力を上げる**（鼓舞）。
 *
 * @param mult 倍率（1.5 なら 1.5 倍）
 * @param ticks 続く長さ
 */
export function rouseAura(
  self: Entity,
  friends: readonly Entity[],
  mult: number,
  ticks: number,
  now: number,
  radius?: number
): void {
  const r = radius ?? AURA.radius;
  const at = self.location;
  for (const e of friends) {
    if (e.id === self.id) continue;
    if (far(at, e.location) > r) continue;
    try {
      const got = roused.get(e.id);
      if (got !== undefined) {
        // **掛かっている間は、時間だけ延ばす**（倍率は重ねない）
        got.until = now + ticks;
        continue;
      }
      const v = e.getDynamicProperty(KEYS.atk);
      if (typeof v !== "number" || v <= 0) continue;
      roused.set(e.id, { base: v, until: now + ticks });
      e.setDynamicProperty(KEYS.atk, v * mult);
      mark(e, true);
    } catch {
      /* 消えている */
    }
  }
}

/**
 * **鼓舞が掛かっている印**（`pve_v3:roused`）。
 *
 * > ### **バニラの「攻撃力上昇」の札を昇らせる**（2026-09-09）
 * >
 * > **剣の絵を回したら、数が多くてうるさかった。** **効果の渦も違った。**
 * > **画面に出るあの札そのもの**（`textures/ui/strength_effect`）**を、
 * > 体の周りからばらばらに湧かせて、上へ昇らせる。**
 *
 * > ### **実体について回る**（2026-09-09）
 * >
 * > **`spawnParticle` で置くと、動く敵が札を置いていく。**
 * > **見た目の定義に口を作り**（`particle_effects`）**、
 * > `controller.animation.pve3.roused` が この property を見て出す。**
 * > **粒の側は `emitter_local_space.position: true`**——**実体と一緒に動く。**
 */
const MARK = "pve_v3:roused";

/** 印を点ける・消す。**持っていない実体なら黙って諦める** */
function mark(e: Entity, on: boolean): void {
  try {
    e.setProperty(MARK, on);
  } catch {
    /* その property を持たない実体 */
  }
}

/** 切れた鼓舞を戻す。**毎 tick** */
export function stepAuras(now: number, byId: (id: string) => Entity | undefined): void {
  if (roused.size === 0) return;
  for (const [id, got] of [...roused]) {
    if (now < got.until) continue;
    roused.delete(id);
    try {
      const e = byId(id);
      if (e === undefined) continue;
      e.setDynamicProperty(KEYS.atk, got.base);
      mark(e, false);
    } catch {
      /* もう居ない */
    }
  }
}

/**
 * **プレイヤーから離れる**（恵み・鼓舞）。
 *
 * > ### **AI では書けない**
 * >
 * > **`behavior.avoid_mob_type` はプレイヤーを避けるが、味方へ寄る動きと両立しない。**
 * > **近すぎるときだけ、こちらで押し返す。**
 */
export function keepAway(self: Entity, people: readonly Player[], want?: number): void {
  const r = want ?? AURA.keepAway;
  const at = self.location;
  let near: Player | undefined;
  let best = r;
  for (const p of people) {
    const d = far(at, p.location);
    if (d >= best) continue;
    best = d;
    near = p;
  }
  if (near === undefined) return;
  const dx = at.x - near.location.x;
  const dz = at.z - near.location.z;
  const len = Math.hypot(dx, dz);
  if (len <= 0) return;
  try {
    self.applyKnockback({ x: (dx / len) * AURA.fleeSpeed, z: (dz / len) * AURA.fleeSpeed }, 0);
  } catch {
    /* 消えている */
  }
}
