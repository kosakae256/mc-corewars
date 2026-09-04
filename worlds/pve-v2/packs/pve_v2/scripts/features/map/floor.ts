/**
 * 戦場の床を散らす係。**歩いたまわりの y = 13 を、暗い石でまばらに敷き替える。**
 *
 * 仕様は `docs/02-map.md` 10 章。
 *
 * ## 同じ場所は必ず同じ石
 *
 * > ### 毎回引き直すと、通るたびに床が変わる
 * >
 * > **座標から作ったハッシュで引く**（乱数を使わない）。
 * > **入れ直すと種が変わる**ので、別の散り方をやり直せる。
 *
 * **4 × 4 の升のハッシュを 6 割、1 マスごとのハッシュを 4 割**混ぜる。
 * こうすると**小さな塊で散る**——1 マスごとに独立させると砂嵐になる。
 */

import { type Player, type Vector3, system } from "@minecraft/server";

/** 塗る高さ（戦場の床） */
const Y = 13;

/** まわり何マスを塗るか */
const REACH = 14;

/** 1 tick に塗る数 */
const PER_TICK = 200;

/**
 * 使う石と、その出やすさ。
 *
 * **岩盤と石炭鉱石は少なめ**——目立つので、点々と混じるくらいでよい。
 */
const STONES: ReadonlyArray<readonly [string, number]> = [
  ["cobbled_deepslate", 1.6],
  ["deepslate_bricks", 1.4],
  ["cracked_deepslate_bricks", 1.2],
  ["cracked_polished_blackstone_bricks", 0.9],
  ["smooth_basalt", 1.2],
  ["mud", 1.1],
  ["deepslate_coal_ore", 0.5],
  ["bedrock", 0.35],
];

const TOTAL = STONES.reduce((sum, s) => sum + s[1], 0);

/** 場所から決まる値（0〜1）。**同じ引数なら必ず同じ** */
function hash(x: number, z: number, seed: number): number {
  let a = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  a = Math.imul(a ^ (a >>> 13), 1274126177) >>> 0;
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
}

/** その柱に置く石 */
function stoneAt(x: number, z: number, seed: number): string {
  // **升 6 割 ＋ 1 マス 4 割**（小さな塊で散らす）
  const t = hash(x >> 2, z >> 2, seed) * 0.6 + hash(x, z, seed + 17) * 0.4;
  let v = t * TOTAL;
  for (const s of STONES) {
    v -= s[1];
    if (v <= 0) return s[0];
  }
  return "cobbled_deepslate";
}

interface Work {
  readonly player: Player;
  readonly seed: number;
  /** もう塗った柱（**二度は塗らない**） */
  readonly done: Set<string>;
}

/** 入れている人（**複数人が同時に入れてよい**） */
const active = new Map<string, Work>();

/** 入／切。**戻り値は入れたかどうか** */
export function toggle(player: Player): boolean {
  const key = player.id;
  if (active.has(key)) {
    active.delete(key);
    return false;
  }
  active.set(key, {
    player,
    // **入れ直すと種が変わる**——別の散り方をやり直せる
    seed: (Date.now() ^ (system.currentTick * 2654435761)) >>> 0,
    done: new Set<string>(),
  });
  return true;
}

/** その人は入れているか */
export function on(player: Player): boolean {
  return active.has(player.id);
}

/** 1 人ぶん塗る */
function paint(w: Work): void {
  const dim = w.player.dimension;
  const at: Vector3 = w.player.location;
  const cx = Math.floor(at.x);
  const cz = Math.floor(at.z);

  let left = PER_TICK;
  for (let dx = -REACH; dx <= REACH && left > 0; dx++) {
    for (let dz = -REACH; dz <= REACH && left > 0; dz++) {
      if (dx * dx + dz * dz > REACH * REACH) continue;
      const x = cx + dx;
      const z = cz + dz;
      const key = `${x},${z}`;
      if (w.done.has(key)) continue;

      const block = dim.getBlock({ x, y: Y, z });
      if (block === undefined) continue; // 読み込まれていない
      w.done.add(key);
      left -= 1;

      // **床がない所は塗らない**
      if (block.isAir) continue;
      // **壁や柱の下は塗らない**（見えないうえに、構造物を壊す）
      const above = dim.getBlock({ x, y: Y + 1, z });
      if (above === undefined || !above.isAir) continue;

      const stone = stoneAt(x, z, w.seed);
      if (block.typeId === `minecraft:${stone}`) continue;
      try {
        block.setType(`minecraft:${stone}`);
      } catch {
        /* 置けなければ諦める */
      }
    }
  }
}

/** 1 tick ぶん進める */
export function step(): void {
  if (active.size === 0) return;
  for (const [key, w] of active) {
    try {
      // プレイヤーが消えていたら外す
      if (w.player.dimension === undefined) {
        active.delete(key);
        continue;
      }
      paint(w);
    } catch {
      active.delete(key);
    }
  }
}
