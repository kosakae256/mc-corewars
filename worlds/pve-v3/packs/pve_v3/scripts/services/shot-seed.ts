/** 射撃の種から発射者を取得する。owner未設定の生成通知は最大2tickだけ待つ（spec/24 §10-1-6）。 */
import { system, type Entity } from "@minecraft/server";
import { isEnemy } from "./melee.js";
import { tellOps } from "./tell.js";

const pending = new Set<string>();

/** 待機中の同じ種を二重処理しない。変換・消滅・期限切れで記録を破棄する。 */
export function captureSeed(seed: Entity, replace: (seed: Entity, owner: Entity) => void): void {
  if (seed.typeId !== "pve_v3:seed" || pending.has(seed.id)) return;
  const id = seed.id;
  pending.add(id);
  const resolve = (left: number): void => {
    try {
      if (!seed.isValid) {
        pending.delete(id);
        return;
      }
      const owner = seed.getComponent("minecraft:projectile")?.owner;
      if (owner === undefined && left > 0) {
        system.runTimeout(() => resolve(left - 1), 1);
        return;
      }
      pending.delete(id);
      if (isEnemy(owner)) replace(seed, owner);
      else {
        seed.remove();
        if (owner === undefined) tellOps("矢: 種の発射者を2tick以内に取得できなかった");
      }
    } catch {
      pending.delete(id);
      tellOps("矢: 種の取得・変換に失敗した");
    }
  };
  resolve(2);
}
