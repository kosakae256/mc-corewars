/**
 * ワールドを触る係（ブロックを置く・消す・音）。**Minecraft API に触るのはここと features だけ。**
 */

import { BlockPermutation, BlockVolume, world, type Dimension } from "@minecraft/server";

import { BUILD_BOX, inRing, RING_OUTER, RING_Y, type Box } from "../core/box.js";

/** `fillBlocks` は 1 回 32,768 マスまで（pve-v3 `builder.ts` で踏んだ）。60×60 = 3,600 なので 9 層ずつ */
const MAX_FILL = 32768;

export function overworld(): Dimension | undefined {
  try {
    return world.getDimension("overworld");
  } catch {
    return undefined;
  }
}

/** 箱の中を空気にする。y で切って上限に収める */
export function clearBox(box: Box = BUILD_BOX): void {
  const dim = overworld();
  if (!dim) return;
  const sx = box.max.x - box.min.x + 1;
  const sz = box.max.z - box.min.z + 1;
  const layers = Math.max(1, Math.floor(MAX_FILL / (sx * sz)));
  for (let y = box.min.y; y <= box.max.y; y += layers) {
    const top = Math.min(box.max.y, y + layers - 1);
    dim.fillBlocks(
      new BlockVolume({ x: box.min.x, y, z: box.min.z }, { x: box.max.x, y: top, z: box.max.z }),
      "minecraft:air"
    );
  }
}

/** 観覧の輪を置く（16-world-rules 1 章）。何度置いても同じ */
export function placeRing(): void {
  const dim = overworld();
  if (!dim) return;
  const glass = BlockPermutation.resolve("minecraft:glass");
  for (let x = -RING_OUTER; x <= RING_OUTER; x++) {
    for (let z = -RING_OUTER; z <= RING_OUTER; z++) {
      // **空気のところにだけ置く。** 手で変えたブロック（出題のボタンなど）を上書きしない（16-world-rules 1 章）
      if (inRing(x, z) && dim.getBlock({ x, y: RING_Y, z })?.isAir) dim.setBlockPermutation({ x, y: RING_Y, z }, glass);
    }
  }
}

const permutations = new Map<string, BlockPermutation>();

/** 1 個置く。id は許可リストを通したもの（`core/palette.ts`） */
export function placeBlock(x: number, y: number, z: number, id: string): void {
  const dim = overworld();
  if (!dim) return;
  let perm = permutations.get(id);
  if (!perm) {
    perm = BlockPermutation.resolve(id);
    permutations.set(id, perm);
  }
  dim.setBlockPermutation({ x, y, z }, perm);
}

export function playSoundAt(id: string, x: number, y: number, z: number, volume = 1, pitch = 1): void {
  const dim = overworld();
  if (!dim) return;
  try {
    dim.playSound(id, { x, y, z }, { volume, pitch });
  } catch {
    /* 音が無い */
  }
}

/** 全員の耳元で鳴らす（位置に依らない。どこにいてもどの向きでも同じに聞こえる） */
export function playSoundAll(id: string, volume = 1, pitch = 1): void {
  for (const p of world.getAllPlayers()) {
    try {
      p.playSound(id, { volume, pitch });
    } catch {
      /* 抜けた */
    }
  }
}
