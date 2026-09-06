/**
 * **その人にコマンドを流す。**
 *
 * `services/feedback.ts` から切り出した（2026-09-06）——
 * **1 ファイル 300 行の決まり**（`11-code-rules.md`）。
 */

import { system, type Entity, type Player } from "@minecraft/server";

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
 * /damage @s 0 self_destruct
 * ```
 *
 * > ### 0 ダメージで「当たった」だけを見せる
 * >
 * > **HP はこちらが持っている**（`state/hp.ts`）。**バニラの体力は触らせない。**
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
      entity.runCommand("damage @s 0 self_destruct");
    } catch {
      /* 消えている・コマンドが通らない */
    }
  });
}
