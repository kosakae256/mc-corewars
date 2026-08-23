/**
 * 人間のプレイヤーの殴りも派手にする（spec 3-A-8）。
 *
 * ## できないこと
 *
 * **振る速さそのものは変えられない。** 攻撃入力はクライアント側なので、
 * アドオンからは「もっと速く振れ」と言えない。
 * そもそも Bedrock のプレイヤーに攻撃クールダウンは無いので、
 * 連打すればその回数だけ振れている。
 *
 * ## できること
 *
 * 遅く見える原因は**殴られた側の無敵時間**（約10 tick）で、
 * これは消せない（調査結果は spec 3-A-8）。
 *
 * そこでボットと同じ手を使う。
 * **当たったことが分かる要素のうち、damage 処理を通らないもの
 * （ノックバック・音・パーティクル）を当たるたびに出す。**
 *
 * `entityHitEntity` は「melee attacks した」ときのイベントで、
 * ダメージが入ったかどうかのイベントではない。
 * 無敵時間中の空振りでも拾える見込み。
 */
import { Player, world, type Entity } from "@minecraft/server";

import { PLAYER_PUNCH_KNOCKBACK, PLAYER_PUNCH_KNOCKBACK_UP } from "./config.js";
import { showHit } from "./brawl.js";
import { isBot } from "./registry.js";

/**
 * 人間のプレイヤーか。
 *
 * **SimulatedPlayer もプレイヤーとして数えられる**ので、
 * 登録済みのボット名を除く。ボットは自前で演出しているので二重にかけない。
 */
function isHuman(entity: Entity): boolean {
  if (!(entity instanceof Player)) return false;
  return !isBot(entity.name);
}

/**
 * 殴ったときの手応えを足す。
 *
 * ワールド全体にかかる。何度呼んでも購読は1つ。
 */
let subscribed = false;

export function enablePlayerPunch(): void {
  if (subscribed) return;
  subscribed = true;

  world.afterEvents.entityHitEntity.subscribe((event) => {
    const attacker = event.damagingEntity;
    const victim = event.hitEntity;
    if (!isHuman(attacker)) return;
    if (!victim.isValid) return;

    const p = attacker.location;
    const q = victim.location;

    // 真上に重なっていると向きが作れない。そのときは適当な向きへ飛ばす
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    const nx = len < 0.01 ? 1 : dx / len;
    const nz = len < 0.01 ? 0 : dz / len;

    try {
      victim.applyKnockback(
        { x: nx * PLAYER_PUNCH_KNOCKBACK, z: nz * PLAYER_PUNCH_KNOCKBACK },
        PLAYER_PUNCH_KNOCKBACK_UP
      );
      showHit(attacker, victim);
    } catch {
      // 無効になった相手など。演出なので無視してよい
    }
  });
}
