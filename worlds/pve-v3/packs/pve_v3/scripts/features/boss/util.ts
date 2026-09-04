/**
 * 飛竜の共通の道具。**向き・距離・当てる・記憶。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6 章。
 */

import { world, type Entity, type Player, type Vector3 } from "@minecraft/server";

export { brake, faceAt, faceDir, push, turnTo, unit, wrap, yawOf } from "./geom.js";

import type { ActDef, ActId, BossAct, Phase } from "../../core/boss.js";
import { hit } from "../../services/combat.js";
import { has } from "../../state/hp.js";

/** 実体 */
export const WYVERN = "pve_v3:wyvern";

/** 既定の HP。**仮** */
export const BOSS_HP = 6000;

/**
 * **既定の呪い**（速さの倍率）。
 *
 * > `/pve:boss` を素で叩いたときに掛かる。**倍速が今の既定の相手。**
 */
export const BOSS_CURSE = 2;

/** 名札 */
export const LABEL = "§c飛竜";

/** 突進のいま */
export interface Rush {
  readonly kind: "line" | "strafe";
  /** 進む向き（単位） */
  readonly dir: Vector3;
  readonly power: number;
  /** いつまで押すか（tick） */
  readonly until: number;
  /** 当てた相手。**1 回の突進で 1 人 1 回** */
  readonly done: Set<string>;
}

/** その 1 体の記憶。**メモリだけ**（`/reload` で消えてよい） */
export interface Brain {
  phase: Phase;
  /** その状態に入った tick */
  since: number;
  /**
   * いま出している攻撃。
   *
   * `from` は**溜めが始まった tick**。本体は `from + def.windup` から。
   */
  act?: { def: ActDef; from: number; next: number; fired: boolean; aimed: boolean; side?: "l" | "r" };
  /**
   * **狙い。溜めを始めた瞬間に覚えて、以降は動かさない**（6-0 の 2）。
   *
   * > **ずっと追尾すると、避けても当たる。**
   */
  aim?: Vector3;
  cools: Map<ActId, number>;
  /** 空で撃った回数 */
  airActs: number;
  /** 通り過ぎた HP の関門の数 */
  gates: number;
  /** 最後に抽選した tick */
  rolled: number;
  rush?: Rush;
  /** **隙が明ける tick。** これまでは何もしない */
  stun: number;
  /** **突進が終わったら必ず降りる**（とびかかりは着地で終わる） */
  forceLand?: boolean;
}

const brains = new Map<string, Brain>();

export function brainOf(id: string, now: number): Brain {
  let b = brains.get(id);
  if (b === undefined) {
    b = { phase: "ground", since: now, cools: new Map(), airActs: 0, gates: 0, rolled: now, stun: 0 };
    brains.set(id, b);
  }
  return b;
}

export function forget(id: string): void {
  brains.delete(id);
}

/** 居なくなった飛竜の記憶を落とす */
export function forgetExcept(alive: ReadonlySet<string>): void {
  for (const id of Array.from(brains.keys())) if (!alive.has(id)) brains.delete(id);
}

/**
 * **飛んでいるか。** 実体の値をそのまま読む。
 *
 * > ### 見た目と中身をずらさない
 * >
 * > **`pve_v3:fly` が実際の状態とずれると、落ちながら歩く**——
 * > 動きの切り替えがこの値を見ているため。
 */
export function isFlying(boss: Entity): boolean {
  try {
    return boss.getProperty("pve_v3:fly") === true;
  } catch {
    return false;
  }
}

/** 足が地に着いているか */
export function onGround(boss: Entity): boolean {
  try {
    return boss.isOnGround;
  } catch {
    return true;
  }
}

/** 場に居る飛竜 */
export function bosses(): Entity[] {
  try {
    return world.getDimension("overworld").getEntities({ type: WYVERN });
  } catch {
    return [];
  }
}

/** 近くで、まだ立っている人 */
export function victims(boss: Entity, range = 48): Player[] {
  return world.getAllPlayers().filter((p) => has(p) && distTo(boss, p) < range);
}

export function distTo(boss: Entity, target: Player): number {
  const a = boss.location;
  const b = target.location;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * **水平の**隔たり。
 *
 * > ### 間合いは水平で測る（6-0 の 3）
 * >
 * > 高さまで入れると、**真上に居る相手に噛みつこうとする。**
 */
export function flatDist(boss: Entity, at: Vector3): number {
  const a = boss.location;
  return Math.hypot(at.x - a.x, at.z - a.z);
}

/** そこの地面の高さ。**見つからなければ元の高さ** */
export function groundY(boss: Entity, x: number, z: number, from: number): number {
  try {
    const start = Math.floor(from);
    for (let dy = 0; dy < 48; dy++) {
      const b = boss.dimension.getBlock({ x: Math.floor(x), y: start - dy, z: Math.floor(z) });
      if (b !== undefined && !b.isAir && !b.isLiquid) return b.location.y + 1;
    }
  } catch {
    /* 読み込まれていない */
  }
  return from;
}

/**
 * **相手の真下の地面。**
 *
 * > ### 空は歩かない（6-0 の 3）
 * >
 * > 浮いている相手をそのまま目指すと、**空中を歩く。**
 * > **足元の地面**を目指し、**2 マス以下の段差は無視する**（登れる段差として扱う）。
 */
export function groundSpot(boss: Entity, at: Vector3): Vector3 {
  const y = groundY(boss, at.x, at.z, at.y);
  const mine = boss.location.y;
  // **2 マス以下の差は無かったことにする**——小刻みな上下でよろけない
  return { x: at.x, y: Math.abs(y - mine) <= 2 ? mine : y, z: at.z };
}

/**
 * その実体から見た、相手の向き（度）。**0 が正面、180 が真後ろ。**
 *
 * > **`getRotation().y` から向きを組み立てるとずれる。**
 * > **`getViewDirection()` が向きそのもの。**
 */
export function angleTo(boss: Entity, target: Player): number {
  const v = boss.getViewDirection();
  const vlen = Math.hypot(v.x, v.z) || 1;
  const dx = target.location.x - boss.location.x;
  const dz = target.location.z - boss.location.z;
  const dlen = Math.hypot(dx, dz) || 1;
  const dot = (v.x / vlen) * (dx / dlen) + (v.z / vlen) * (dz / dlen);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/** いちばん近い相手 */
export function nearest(boss: Entity): Player | undefined {
  return victims(boss).sort((a, b) => distTo(boss, a) - distTo(boss, b))[0];
}

/** 見た目の切り替えに使う値を置く */
export function setAct(boss: Entity, act: BossAct | "none"): void {
  try {
    boss.setProperty("pve_v3:act", act);
  } catch {
    /* 定義が読み込まれていない */
  }
}

/** 音 */
export function sound(boss: Entity, id: string, volume = 1.0, pitch = 1.0): void {
  try {
    boss.dimension.playSound(id, boss.location, { volume, pitch });
  } catch {
    /* 見えない所 */
  }
}

/**
 * **その場所から遠ざかる向きへ弾く。**
 *
 * > ### 当たった手応えは、数字より「動かされること」で出る
 * >
 * > 弾く元は**竜の位置**（弾なら**弾の位置**）。
 * > 少しだけ上へも押す——**地面に擦らずに飛ぶ。**
 */
export function knockFrom(target: Player, from: Vector3, power: number, up = 0.4): void {
  if (power <= 0) return;
  try {
    const at = target.location;
    const dx = at.x - from.x;
    const dz = at.z - from.z;
    const n = Math.hypot(dx, dz) || 1;
    target.applyKnockback({ x: (dx / n) * power, z: (dz / n) * power }, up);
  } catch {
    /* 消えている */
  }
}

/** 範囲に当てる */
export function splash(boss: Entity, radius: number, damage: number, knock: number, via: string): void {
  const at = boss.location;
  for (const p of victims(boss, radius + 2)) {
    const d = distTo(boss, p);
    if (d > radius) continue;
    hit({ target: p, attack: damage, via });
    if (knock <= 0) continue;
    try {
      const dx = p.location.x - at.x;
      const dz = p.location.z - at.z;
      const n = Math.hypot(dx, dz) || 1;
      p.applyKnockback({ x: (dx / n) * knock, z: (dz / n) * knock }, 0.45);
    } catch {
      /* 消えている */
    }
  }
}
