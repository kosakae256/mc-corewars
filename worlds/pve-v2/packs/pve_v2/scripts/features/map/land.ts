/**
 * 周りの地形を作る係。**帯に区切って、まとめて置く。**
 *
 * 仕様は `docs/02-map.md` 9 章、**高さと表面の決め方は `terrain.ts`。**
 *
 * ## なぜ帯に区切るのか
 *
 * > ### 500 マス先のブロックは、そのままでは置けない
 * >
 * > **読み込まれていないチャンクには置けない**（例外になる）。
 * > **`tickingarea` を張れば読み込まれる**が、**1 つの大きさに上限がある**。
 * >
 * > **144 x 144（9 x 9 チャンク）の帯**に区切り、
 * > **張る → 待つ → 置く → 外す**を繰り返す。
 *
 * ## なぜ 1 柱ずつ置かないのか
 *
 * > ### 25 万本の柱を 1 本ずつ埋めると、呼ぶ回数だけで詰まる
 * >
 * > **高さと表面が同じ柱は、隣どうしで続くことが多い**（地形は滑らかだから）。
 * > **続く区間をまとめて 1 回の `fillBlocks` にする**——呼ぶ回数が 1/5 以下になる。
 * >
 * > そのために**表面の粒は「場所から決まる値」**にしてある（`terrain.ts` の `grain`）。
 * > 乱数だと、同じ柱を 2 回聞いたときに答えが変わり、まとめられない。
 *
 * ## 進み方
 *
 * ```
 * 帯を選ぶ → tickingarea を張る → 40 tick 待つ
 *        → x を 1 列ずつ。z 方向にまとめて置く（空ける・積む・表面）
 *        → tickingarea を外す → 次の帯
 * ```
 */

import { BlockVolume, GameMode, type Dimension, type Player } from "@minecraft/server";

import {
  AREA,
  LIMITS,
  bridgeAt,
  bridgeBlock,
  heightAt,
  inField,
  shapeOf,
  strataAt,
  surfaceAt,
  type Shape,
} from "./terrain.js";

/** 帯の一辺（マス）。**9 チャンク ＝ 144**（`tickingarea` の上限に収まる） */
const TILE = 144;

/**
 * 帯を張ってから置きはじめるまで（tick）。**2 秒。**
 *
 * > ### `tickingarea` だけでは足りなかった
 * >
 * > 実機で **15 万ブロックが置けなかった**（2026-09-01）。読み込みが間に合っていない。
 * > **その帯の真ん中へプレイヤーを飛ばし、2 秒待ってから置く。**
 * > プレイヤーの周りは確実に読み込まれる。
 */
const WAIT = 40;

/** プレイヤーを飛ばす高さ（**峰より上**） */
const EYE = 235;

/** 1 tick に触るブロック数の上限。**多いと重くなる** */
const BUDGET = 60000;

/**
 * 1 tick に呼ぶ `fillBlocks` の回数の上限。
 *
 * **地層を入れると、1 本の柱が 10 枚以上に分かれる。**
 * ブロック数だけで測ると、呼ぶ回数が跳ね上がって詰まる。
 */
const CALLS = 320;

/** 地面の上をどれだけ空けるか。**全部空にすると 6000 万マスになる**ので、要る所だけ */
const AIR_UP = 30;

interface Tile {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
}

type Phase = "load" | "build";

interface Job {
  readonly dim: Dimension;
  readonly by: Player;
  /** 始めたときの居場所と遊び方（**終わったら戻す**） */
  readonly home: { x: number; y: number; z: number };
  readonly mode: GameMode;
  readonly shape: Shape;
  readonly tiles: readonly Tile[];
  at: number;
  phase: Phase;
  wait: number;
  /** いま置いている列（x） */
  x: number;
  failed: number;
  placed: number;
}

let job: Job | undefined;

/** いま作っている最中か */
export function busy(): boolean {
  return job !== undefined;
}

/** 始める。**押すたびに違う地形**（種は毎回変える） */
export function start(dim: Dimension, by: Player, seed: number): void {
  const tiles: Tile[] = [];
  for (let x = AREA.x1; x <= AREA.x2; x += TILE) {
    for (let z = AREA.z1; z <= AREA.z2; z += TILE) {
      tiles.push({ x1: x, z1: z, x2: Math.min(x + TILE - 1, AREA.x2), z2: Math.min(z + TILE - 1, AREA.z2) });
    }
  }
  let mode = GameMode.Creative;
  try {
    mode = by.getGameMode();
  } catch {
    /* 取れなければ創造で戻す */
  }
  job = {
    dim,
    by,
    home: { x: by.location.x, y: by.location.y, z: by.location.z },
    mode,
    shape: shapeOf(seed),
    tiles,
    at: 0,
    phase: "load",
    wait: 0,
    x: 0,
    failed: 0,
    placed: 0,
  };
  // **観戦にする**——落下も窒息もせず、ブロックの邪魔にもならない
  try {
    by.setGameMode(GameMode.Spectator);
  } catch {
    /* 変えられなければそのまま */
  }
  by.sendMessage(
    `§7地形を作る。§f${AREA.x2 - AREA.x1 + 1} x ${AREA.z2 - AREA.z1 + 1}§7 を §f${tiles.length}§7 帯に分けて置く（数分かかる）`
  );
}

/** 元の居場所と遊び方へ戻す */
function goHome(j: Job): void {
  try {
    j.by.teleport(j.home);
    j.by.setGameMode(j.mode);
  } catch {
    /* 消えている */
  }
}

/** やめる */
export function stop(): void {
  if (job === undefined) return;
  area(job.dim, "remove");
  goHome(job);
  job.by.sendMessage("§7地形づくりを止めた");
  job = undefined;
}

/** いまの帯に `tickingarea` を張る／外す */
function area(dim: Dimension, what: "add" | "remove"): void {
  const j = job;
  if (j === undefined) return;
  try {
    if (what === "remove") {
      dim.runCommand("tickingarea remove pve2_land");
      return;
    }
    const t = j.tiles[j.at];
    if (t === undefined) return;
    dim.runCommand("tickingarea remove pve2_land");
    dim.runCommand(`tickingarea add ${t.x1} 0 ${t.z1} ${t.x2} 250 pve2_land`);
  } catch {
    // **無くても続ける**——プレイヤーの近くなら読み込まれている
  }
}

/** その柱の傾き（**急な所は岩肌にする**ため） */
function steepAt(x: number, z: number, h: number, s: Shape): number {
  return Math.max(Math.abs(h - heightAt(x + 2, z, s)), Math.abs(h - heightAt(x, z + 2, s)));
}

/**
 * 1 列（x を固定して z 方向）を置く。
 *
 * **高さと表面が同じ区間をまとめる。** 戻り値は触ったブロック数（重さの目安）。
 */
function line(j: Job, t: Tile, x: number): { cost: number; calls: number } {
  let cost = 0;
  let calls = 0;
  let z = t.z1;
  while (z <= t.z2) {
    // **戦場の中は 1 マスも触らない**
    if (inField(x, z)) {
      z += 1;
      continue;
    }
    const h = heightAt(x, z, j.shape);
    const face = surfaceAt(x, z, h, j.shape, steepAt(x, z, h, j.shape));

    // ---- 橋の柱は 1 本ずつ（**数が少ないのでまとめなくてよい**）
    const br = bridgeAt(x, z, j.shape);

    // ---- 同じものが続くところまで伸ばす
    let e = z;
    if (br === undefined) {
      while (e + 1 <= t.z2 && !inField(x, e + 1)) {
        // **地層の升をまたいだら切る**（層の境目が変わるため）
        if ((e + 1) >> 4 !== z >> 4) break;
        if (bridgeAt(x, e + 1, j.shape) !== undefined) break;
        const h2 = heightAt(x, e + 1, j.shape);
        if (h2 !== h) break;
        if (surfaceAt(x, e + 1, h2, j.shape, steepAt(x, e + 1, h2, j.shape)) !== face) break;
        e += 1;
      }
    }
    const wide = e - z + 1;

    try {
      // 1. 上を空ける（**地面のすぐ上だけ**）
      const top = Math.min(LIMITS.SKY, h + AIR_UP);
      j.dim.fillBlocks(new BlockVolume({ x, y: h + 1, z }, { x, y: top, z: e }), "minecraft:air");
      cost += (top - h) * wide;
      calls += 1;
      // 2. 積む。**地層に分けて置く**——崖に出る面が 1 種類だと「土が貼ってあるだけ」に見える
      let y = LIMITS.FLOOR;
      while (y <= h - 1) {
        const rock = strataAt(x, z, y, j.shape);
        let ye = y;
        while (ye + 1 <= h - 1 && strataAt(x, z, ye + 1, j.shape) === rock) ye += 1;
        j.dim.fillBlocks(new BlockVolume({ x, y, z }, { x, y: ye, z: e }), `minecraft:${rock}`);
        cost += (ye - y + 1) * wide;
        calls += 1;
        y = ye + 1;
      }
      // 3. 表面
      j.dim.fillBlocks(new BlockVolume({ x, y: h, z }, { x, y: h, z: e }), `minecraft:${face}`);
      cost += wide;
      calls += 1;
      j.placed += wide;

      // 4. 橋（**桁・欄干・橋脚**）
      if (br !== undefined && br.y > h) {
        calls += 3;
        j.dim.fillBlocks(new BlockVolume({ x, y: h + 1, z }, { x, y: br.y + 3, z }), "minecraft:air");
        j.dim.setBlockType({ x, y: br.y, z }, `minecraft:${bridgeBlock(x, z, j.shape, "deck")}`);
        if (br.rail) j.dim.setBlockType({ x, y: br.y + 1, z }, `minecraft:${bridgeBlock(x, z, j.shape, "rail")}`);
        if (br.pillar && br.y - 1 > h) {
          j.dim.fillBlocks(
            new BlockVolume({ x, y: h + 1, z }, { x, y: br.y - 1, z }),
            `minecraft:${bridgeBlock(x, z, j.shape, "pillar")}`
          );
        }
        cost += br.y - h + 6;
      }
    } catch {
      j.failed += wide;
    }
    z = e + 1;
  }
  return { cost, calls };
}

/** 1 tick ぶん進める */
export function step(): void {
  const j = job;
  if (j === undefined) return;

  if (j.at >= j.tiles.length) {
    area(j.dim, "remove");
    goHome(j);
    const miss = j.failed > 0 ? `§7（置けなかった: §c${j.failed}§7）` : "";
    try {
      j.by.sendMessage(`§a地形ができた。§f${j.placed}§a 柱${miss}`);
    } catch {
      /* 消えている */
    }
    job = undefined;
    return;
  }

  const t = j.tiles[j.at];
  if (t === undefined) {
    j.at += 1;
    return;
  }

  // ---- 帯を読み込ませる
  if (j.phase === "load") {
    if (j.wait === 0) {
      area(j.dim, "add");
      // **その帯の真ん中へ飛ぶ。** プレイヤーの周りは確実に読み込まれる
      try {
        j.by.teleport({ x: (t.x1 + t.x2) / 2, y: EYE, z: (t.z1 + t.z2) / 2 });
        j.by.sendMessage(`§7帯 §f${j.at + 1}§7 / ${j.tiles.length}（${t.x1}, ${t.z1}）……`);
      } catch {
        /* 消えている */
      }
    }
    j.wait += 1;
    if (j.wait < WAIT) return;
    j.x = t.x1;
    j.phase = "build";
    return;
  }

  // ---- 置く
  let cost = 0;
  let calls = 0;
  while (j.x <= t.x2) {
    if (cost >= BUDGET || calls >= CALLS) return;
    const spent = line(j, t, j.x);
    cost += spent.cost;
    calls += spent.calls;
    j.x += 1;
  }

  // ---- その帯は終わり
  area(j.dim, "remove");
  j.at += 1;
  j.phase = "load";
  j.wait = 0;
}
