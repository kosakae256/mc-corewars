/**
 * 火の玉。**実体にしない。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6-2-3。
 *
 * > ### 弾のために実体を増やさない
 * >
 * > 実体にすると**モデル・テクスチャ・定義・当たり判定の設定**が要る。
 * > **位置を毎 tick 進めて、火の粒を撒き、近い人を見る**だけで足りる。
 * >
 * > 見た目は粒。**当たったら消える。** ブロックを抜けない。
 */

import { world, type Dimension, type Vector3 } from "@minecraft/server";

import { BULLET } from "../../core/boss.js";
import { hit } from "../../services/combat.js";
import { knockFrom } from "./util.js";
import { has } from "../../state/hp.js";

interface Bullet {
  readonly dim: Dimension;
  at: Vector3;
  readonly vel: Vector3;
  left: number;
  readonly damage: number;
}

/** 飛んでいる弾。**メモリだけ**（`/reload` で消えてよい） */
const flying: Bullet[] = [];

/** 弾を撒き散らす音と粒 */
function burst(dim: Dimension, at: Vector3): void {
  try {
    dim.spawnParticle("minecraft:large_explosion", at);
    dim.playSound("random.explode", at, { volume: 0.9, pitch: 1.4 });
  } catch {
    /* 見えない所 */
  }
}

/**
 * **3 発同時に吐く。** 中央 ＋ 左右に拡散。
 *
 * @param dir 進む向き（単位でなくてよい）
 */
export function fire(dim: Dimension, from: Vector3, dir: Vector3, damage: number, haste = 1): void {
  const n = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const base = { x: dir.x / n, y: dir.y / n, z: dir.z / n };
  const half = (BULLET.count - 1) / 2;
  // **速さは倍率ぶん上げ、寿命は同じだけ縮める**——**届く距離は変えない**
  const speed = BULLET.speed * haste;
  const life = Math.max(1, Math.round(BULLET.life / haste));
  for (let i = 0; i < BULLET.count; i++) {
    // **水平に振る。** 上下に散らすと、地面と空に刺さって当たらない
    const rad = ((i - half) * BULLET.spread * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    flying.push({
      dim,
      at: { ...from },
      vel: {
        x: (base.x * cos - base.z * sin) * speed,
        y: base.y * speed,
        z: (base.x * sin + base.z * cos) * speed,
      },
      left: life,
      damage,
    });
  }
  try {
    dim.playSound("mob.ghast.fireball", from, { volume: 1.5, pitch: 0.8 });
  } catch {
    /* 見えない所 */
  }
}

/** ブロックに当たったか */
function blocked(b: Bullet): boolean {
  try {
    const block = b.dim.getBlock({
      x: Math.floor(b.at.x),
      y: Math.floor(b.at.y),
      z: Math.floor(b.at.z),
    });
    return block !== undefined && !block.isAir && !block.isLiquid;
  } catch {
    // **読み込まれていない所は、抜けたことにする**（止めると空に残り続ける）
    return false;
  }
}

/** 誰かに当たったか。当たったなら当てる */
function landed(b: Bullet): boolean {
  for (const p of world.getAllPlayers()) {
    if (!has(p)) continue;
    const at = p.location;
    const d = Math.hypot(at.x - b.at.x, at.y + 1 - b.at.y, at.z - b.at.z);
    if (d > BULLET.radius) continue;
    hit({ target: p, attack: b.damage, via: "wyvern:fireball" });
    // **弾いた元は弾の位置。** 竜からではなく、当たった方向へ飛ぶ
    knockFrom(p, b.at, BULLET.knock, 0.45);
    return true;
  }
  return false;
}

/** 1 tick 進める */
export function step(): void {
  for (let i = flying.length - 1; i >= 0; i--) {
    const b = flying[i];
    if (b === undefined) continue;
    b.at = { x: b.at.x + b.vel.x, y: b.at.y + b.vel.y, z: b.at.z + b.vel.z };
    b.left--;

    let gone = false;
    if (landed(b) || blocked(b)) {
      burst(b.dim, b.at);
      gone = true;
    } else if (b.left <= 0) {
      gone = true;
    } else {
      try {
        b.dim.spawnParticle("minecraft:basic_flame_particle", b.at);
      } catch {
        /* 見えない所 */
      }
    }
    if (gone) flying.splice(i, 1);
  }
}

/** 全部消す（試合の後片付け） */
export function clear(): void {
  flying.length = 0;
}
