/**
 * ロールの常時効果。
 *
 * 仕様は `docs/spec/24-role.md` 4 章。
 *
 * ## ここに集める
 *
 * **持ち続けている間ずっと効くもの**を 1 箇所に置く。
 *
 * | ロール | 効果 |
 * | --- | --- |
 * | Berserker | **攻撃力 1.5 倍** |
 * | Loophole | **採掘速度上昇**（採掘 I） |
 *
 * ロールごとに別の見張りを立てない。**増えたらここに足す。**
 */

import { EntityDamageCause, Player, system, world } from "@minecraft/server";

import { roleOf } from "../../lib/roles.js";
import { roleStack } from "../loadout/index.js";
import { damageLogOn, goDown } from "../death/index.js";

/** Engineer の操作機 */
const DRONE_CONTROL = "game:drone_control";

/**
 * ロールの道具を持たせ直す。
 *
 * **無くしていたら渡す。** 持っていれば何もしない。
 *
 * 買ったものではないので、**失わせる意味が無い。**
 */
function keepRoleItem(player: Player, item: string): void {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === item) return;
    c.addItem(roleStack(item));
  } catch {
    /* 持ち物が読めない。次の機会に */
  }
}

/** 効果を付け直す間隔（tick）。**効果が切れる前に掛け直す** */
const INTERVAL = 40;

/** 効果の長さ（tick）。**間隔より長くする**（切れ目を作らない） */
const DURATION = 100;

/**
 * 常時効果を掛け直す。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startRoleEffects(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const role = roleOf(player);

      // ---- **ロールの道具を切らさない**（2026-08-26 追加）
      //
      // 捨てた分は消える（`features/special/nodrop`）が、
      // **配り直しは復活のときにしか走らない。**
      // 試合中に手放したら、その試合はもう出せないことになる
      if (role.drone) keepRoleItem(player, DRONE_CONTROL);

      if (role.haste <= 0) continue;
      try {
        player.addEffect("haste", DURATION, {
          amplifier: role.haste - 1,
          // **印を出さない。** 常時なので、出ていても情報にならない
          showParticles: false,
        });
      } catch {
        /* 消えている */
      }
    }
  }, INTERVAL);
}

/**
 * 攻撃力の倍率を効かせる。
 *
 * **打ち消して与え直さない**（ノックバックまで消える）。
 * **入った後に、増えた分だけ体力を削る。**
 *
 * ## `applyDamage` では効かなかった（2026-08-28 修正）
 *
 * 殴った直後は**無敵時間**（約 0.5 秒）に入っている。
 * そこへ `applyDamage` を足しても**まるごと捨てられる。**
 *
 * > 倍率が「効いていない気がする」のではなく、**一度も効いていなかった。**
 *
 * **体力を直接引く。** 無敵時間は体力の書き換えには効かない。
 *
 * 引くのは**軽減された後の値**（`ev.damage`）を基準にした分なので、
 * 防具の効き目は保たれる。
 *
 * ## 倒れるところまで削るときは、死亡処理へ渡す
 *
 * 体力を 0 にすると**こちらの死亡処理を通らない**
 *（[14-death.md](../../../docs/spec/14-death.md)）。
 * 誰に倒されたかも、持ち物を残すかも決まらないまま死ぬ。
 *
 * **残りが足りないなら、削らずに `goDown` を呼ぶ。**
 */
export function registerRoleDamage(): void {
  world.afterEvents.entityHurt.subscribe((ev) => {
    const by = ev.damageSource.damagingEntity;
    if (!(by instanceof Player)) return;
    if (ev.damageSource.cause !== EntityDamageCause.entityAttack) return;

    const mul = roleOf(by).damage;
    if (mul <= 1) return;

    // **増える分だけ削る。** 1.5 倍なら 0.5 倍ぶん
    const extra = ev.damage * (mul - 1);
    // ---- **効いているかを見せる**（`/game:dmglog`。2026-08-28 追加）
    //
    // 「多分効いていない」を**推測で追わない。**
    // 入った値・倍率・足した分を、殴った側に出す
    if (damageLogOn()) {
      try {
        by.sendMessage(
          `§8[dmg] 倍率 ${mul} / 入った ${ev.damage.toFixed(2)} / 足す ${extra.toFixed(2)}` +
            ` §8[${ev.damageSource.cause}] → ${ev.hurtEntity.typeId}`
        );
      } catch {
        /* 消えている */
      }
    }
    if (extra <= 0) return;

    const victim = ev.hurtEntity;
    try {
      const health = victim.getComponent("minecraft:health");
      if (health === undefined) return;
      const now = health.currentValue;
      if (now - extra > 0) {
        health.setCurrentValue(now - extra);
        return;
      }
      // ---- **倒れるところまで削った**
      if (victim instanceof Player) {
        goDown(victim, by, "hit");
        return;
      }
      // 人でないなら、そのまま落とす（機体など）
      health.setCurrentValue(0);
    } catch {
      /* 消えている */
    }
  });
}
