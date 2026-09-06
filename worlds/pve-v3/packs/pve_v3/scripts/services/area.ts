/**
 * **戦場のチャンクを、先に読み込ませる。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 0-3。
 *
 * > ### 1000 マス先は読み込まれていない
 * >
 * > **着いた瞬間に地面が無いと、落ちるか埋まる。**
 * > **敵も、遠い湧き点には出せない**（`services/spawn.ts`）。
 *
 * > ### **全部には張らない**
 * >
 * > **重い。** **いま使う 1 枚だけ。** 次のマップへ移るときに張り替える。
 */

import { CommandPermissionLevel, system, world } from "@minecraft/server";

import { FIELD } from "../core/places.js";

/**
 * 区画の名前。**マップごとに別の名前にする**（2026-09-07）。
 *
 * > ### 同じ名前を消してから張ると、たまに張れない
 * >
 * > **消すのと張るのを同じ tick でやると、張るほうが弾かれることがある。**
 * > **名前を分ければ、消すのを待たずに張れる。**
 */
function tagOf(originX: number): string {
  return `pve3_map_${Math.round(originX / 1000)}`;
}

/** いま張っている場所（x）。**同じ所へ張り直さない** */
let at: number | undefined;

/** @returns 通ったか */
function run(cmd: string): boolean {
  try {
    world.getDimension("overworld").runCommand(cmd);
    return true;
  } catch {
    // **すでに有る／無いものを消した**——どちらも普通に起きる
    return false;
  }
}

function tellAdmin(text: string): void {
  for (const p of world.getAllPlayers()) {
    try {
      if (p.commandPermissionLevel !== CommandPermissionLevel.Any) p.sendMessage(text);
    } catch {
      /* 抜けた */
    }
  }
}

/** 1 枚ぶんを張る。**すでに有れば弾かれるだけ** */
function add(originX: number): boolean {
  const h = FIELD.half + 8;
  return run(`tickingarea add ${originX - h} 0 ${-h} ${originX + h} 0 ${h} ${tagOf(originX)}`);
}

/**
 * **その原点の戦場を読み込ませる。**
 *
 * > ### 一度で張れないことがある（2026-09-07）
 * >
 * > **移り変わりの最中は弾かれる。** **少し置いて、もう一度試す。**
 * > **すでに張れていれば、二度目は弾かれるだけ**——害はない。
 */
export function holdArea(originX: number): void {
  if (at === originX) return;
  const prev = at;
  at = originX;

  const ok = add(originX);
  // **駄目でも諦めない**——1 秒後と 3 秒後にもう一度
  system.runTimeout(() => add(originX), 20);
  system.runTimeout(() => {
    if (!add(originX) && !ok) {
      tellAdmin("§c戦場の区画を張れなかった §7— 敵が湧かないことがある（/tickingarea list）");
    }
  }, 60);

  // **前のぶんは、張ってから外す**（同じ tick に消して張ると、たまに張れない）
  if (prev !== undefined && prev !== originX) {
    system.runTimeout(() => run(`tickingarea remove ${tagOf(prev)}`), 40);
  }
}

/** 外す。**試合を畳んだとき** */
export function releaseArea(): void {
  const now = at;
  at = undefined;
  if (now !== undefined) run(`tickingarea remove ${tagOf(now)}`);
}
