/**
 * **その人にコマンドを流す。**
 *
 * `services/feedback.ts` から切り出した（2026-09-06）——
 * **1 ファイル 300 行の決まり**（`11-code-rules.md`）。
 */

import { system, type Entity, type Player } from "@minecraft/server";

import { nextAmount } from "./iframe.js";

/**
 * その人にコマンドを流す。
 *
 * > ### **`@s` が通らないことがある**
 * >
 * > `Player.runCommand` は**その人の権限**で走る。
 * > `camerashake` は**チート扱い**なので、権限が無いと弾かれる。
 * > **弾かれたら、次元から名前を指して流し直す**（そちらは権限を持っている）。
 *
 * @returns **流せなかった理由**（流せたら undefined）
 */
export function run(player: Player, cmd: string): string | undefined {
  let first: string;
  try {
    player.runCommand(cmd);
    return undefined;
  } catch (err) {
    first = String(err);
  }
  try {
    // **名前に空白が入ることがある**ので、必ず引用符で包む
    player.dimension.runCommand(cmd.replace("@s", `"${player.name}"`));
    return undefined;
  } catch (err) {
    const why = `${cmd} → 本人 ${first} / 次元 ${String(err)}`;
    console.warn(`[feedback] ${why}`);
    return why;
  }
}

/**
 * **バニラの被弾演出を出す**（`22-feedback.md` 7 章）。
 *
 * ```
 * /damage @s <量> self_destruct
 * ```
 *
 * > ### 体力は、入れた直後に戻す
 * >
 * > **HP はこちらが持っている**（`state/hp.ts`）。**バニラの体力は見た目だけ。**
 * > **量を 1 ずつ増やす**のは、無敵時間を通り抜けるため（`services/iframe.ts`）。
 * > **`self_destruct` は `events/hurt.ts` が打ち消さない原因**——
 * > だから**演出だけが通る。**
 *
 * > ### `applyDamage` では代わりにならない
 * >
 * > **0 を渡しても何も起きない。** **コマンドでないと演出が出ない**ので、
 * > `avoid-unnecessary-command` はここだけ切る。
 *
 * **読み取り専用の文脈から呼ばれることがある**ので、次の tick に回す。
 */
export function damageFlash(entity: Entity): void {
  system.run(() => {
    try {
      const hp = entity.getComponent("minecraft:health");
      const before = hp?.currentValue ?? 0;
      // > ### 無敵時間を通り抜ける（`services/iframe.ts`）
      // >
      // > **0 のままだと、10 tick の間は 2 発目が光らない。**
      // > **1 ずつ増やせば、当たるたびに光る。** 体力はすぐ戻す
      // **入れられるのは「体力 − 2」まで**（`services/iframe.ts`）——
      // **超えると `damage` が通らず、黙って何も起きない**
      const amount = nextAmount(entity.id, before - 2);
      // > ### **天井に着いたら、窓が明けるまで待つ**（実測・2026-09-08）
      // >
      // > **無敵時間を抜けるのに、量を 1 ずつ増やしている**（`services/iframe.ts`）。
      // > **上限は 24。** **汚染の円は 2 tick ごとに当たる**ので、
      // > **24 回（約 2.4 秒）で天井に着き、そこから先は全部バニラに弾かれていた。**
      // > **音だけ鳴って、赤くも光らず、画面も揺れない。**
      // >
      // > **天井では出さない。** **窓（10 tick）が明ければ量が 1 に戻り、また通る。**
      // > **見た目は 0.5 秒に 1 回になるが、止まるよりずっとよい。**
      if (amount === undefined) return;
      if (before <= amount + 1) return;
      entity.runCommand(`damage @s ${amount} self_destruct`);
      hp?.setCurrentValue(before);
    } catch {
      /* 消えている・コマンドが通らない */
    }
  });
}
