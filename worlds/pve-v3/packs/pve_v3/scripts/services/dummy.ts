/**
 * 訓練用のカカシ。**置く・数える・満タンに戻す。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/23-enemy-unit.md` 1-1。
 *
 * > ### なぜ services に置くのか
 * >
 * > **運営メニュー（`features/admin`）からも呼ぶ。**
 * > **feature どうしは import しない**（`docs/imp.md` 10-4）ので、
 * > **共有したい振る舞いはここへ。**
 */

import { world, type Entity, type Vector3 } from "@minecraft/server";

import { has, heal, max, setup } from "../state/hp.js";
import { setLabel } from "../state/label.js";

/** 実体の id */
export const DUMMY = "pve_v3:dummy";

/** 見せかけの HP。**大きくして、割合がいつも満タンに見えるようにする** */
export const DUMMY_HP = 1_000_000;

/** 頭の上に出す名前 */
export const DUMMY_LABEL = "§7カカシ";

/** 場に居るカカシ */
export function dummies(): Entity[] {
  try {
    return world.getDimension("overworld").getEntities({ type: DUMMY });
  } catch {
    return [];
  }
}

/** 1 体置く */
export function putDummy(at: Vector3): Entity | undefined {
  try {
    const e = world.getDimension("overworld").spawnEntity(DUMMY, at);
    setup(e, DUMMY_HP);
    setLabel(e, DUMMY_LABEL);
    return e;
  } catch {
    return undefined;
  }
}

/** 全部消す。**@returns 消した数** */
export function clearDummies(): number {
  let n = 0;
  for (const d of dummies()) {
    try {
      d.remove();
      n++;
    } catch {
      /* もう居ない */
    }
  }
  return n;
}

/** 満タンに戻す。**削られた数字は出るが、倒れない** */
export function stepDummies(): void {
  for (const e of dummies()) {
    try {
      if (!has(e)) {
        setup(e, DUMMY_HP);
        setLabel(e, DUMMY_LABEL);
        continue;
      }
      heal(e, max(e) ?? DUMMY_HP);
    } catch {
      /* もう居ない */
    }
  }
}
