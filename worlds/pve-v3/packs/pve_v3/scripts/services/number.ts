/**
 * ダメージの数字。**敵から飛び出して落ちる。**
 *
 * 仕様は `docs/spec/13-feedback.md` 2 章。
 *
 * ## 見えない実体の名札で出す
 *
 * ```
 * 当たる → 敵の少し上に出す → 上へ跳ねさせる → 1.2 秒で自然に消える
 * ```
 *
 * | | |
 * | --- | --- |
 * | 出す先 | **敵だけ**（自分が受けたぶんは出さない） |
 * | 何 | `pve_v3:dmg`（**模型を持たない実体**の名札） |
 * | 消し方 | **script が 1.2 秒後に消す**（`minecraft:timer` は実体が読み込めなくなるので使わない） |
 * | 出しすぎ | **1 tick に 6 個まで**（範囲攻撃で画面が埋まる） |
 *
 * ## 色で区別する
 *
 * | 何 | 色 |
 * | --- | --- |
 * | 通常攻撃 | 白 |
 * | クリティカル | **黄 ＋ `!`** |
 * | 特殊攻撃 | **水色** |
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Dimension,
  type Vector3,
} from "@minecraft/server";

/** 数字を出す実体（`behavior_packs/pve_v3/entities/dmg.json`） */
export const DMG = "pve_v3:dmg";

/** 1 tick に出す上限 */
const PER_TICK = 6;

/** 消えるまで（tick）。**1.2 秒** */
export const LIFE = 24;

let tickAt = -1;
let count = 0;

/** 何の数字か */
export type NumberKind = "base" | "crit" | "extra";

const COLOR: Record<NumberKind, string> = {
  base: "§f",
  crit: "§e",
  extra: "§b",
};

function jitter(): number {
  return (Math.random() - 0.5) * 0.6;
}

/** 1 つ出す。**1 未満は出さない**（0 が飛び交うと読めない） */
export function popNumber(dim: Dimension, at: Vector3, amount: number, kind: NumberKind): void {
  const value = Math.round(amount);
  if (value < 1) return;

  const now = system.currentTick;
  if (now !== tickAt) {
    tickAt = now;
    count = 0;
  }
  if (count >= PER_TICK) return;
  count += 1;

  try {
    const e = dim.spawnEntity(DMG, {
      x: at.x + jitter(),
      y: at.y + 1.4,
      z: at.z + jitter(),
    });
    e.nameTag = `${COLOR[kind]}${value}${kind === "crit" ? "!" : ""}`;
    // **上へ跳ねさせて、あとは落ちるに任せる**（実体に重力がある）
    e.applyImpulse({ x: jitter() * 0.08, y: 0.24, z: jitter() * 0.08 });
    system.runTimeout(() => {
      try {
        e.remove();
      } catch {
        /* もう居ない */
      }
    }, LIFE);
  } catch {
    /* 読み込まれていない */
  }
}
