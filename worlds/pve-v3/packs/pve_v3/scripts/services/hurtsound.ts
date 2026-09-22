/**
 * **受けた音。** 誰に、どれだけ聞こえるか。
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 9 章。
 *
 * > ### **全部の音が、全員に、同じ音量で届いていた**
 * >
 * > **向きを消すために `is3D: false` にした**ぶん、**距離も効かなくなった。**
 * > **`damage` コマンドは当たるたびに鳴る**ので、
 * > **敵が 100 体いる戦場では、被弾音が壁になっていた。**
 *
 * **`game.player.hurt` は音量 0 に上書きしてある**（リソースパック）。
 * **鳴らすのはここから。** **`damage` コマンドは消さない**——**消していいのは音だけ。**
 */

import { Player, world, type Entity } from "@minecraft/server";

/**
 * 受けた音（`22-feedback.md` 9 章）。
 *
 * > ### **`damage` の音とは別名**（2026-09-08）
 * >
 * > **`game.player.hurt` は音量 0 に上書きしてある**——
 * > **`damage` コマンドは当たるたびに鳴り、それが全員に届いていた。**
 * > **中身は同じバニラの音。** **鳴らす相手を、こちらで決める。**
 */
const HURT_SOUND = "pve_v3:damaged";

/**
 * 受けた音の大きさ。
 *
 * > ### **受けた音は必ず鳴る**（2026-09-06 決定・`22-feedback.md` 1 章）
 * >
 * > **奈落でも、毒でも、爆風でも鳴らす。**
 * > **鳴らない削られ方があると、HP が減った理由が分からない。**
 */
const HURT_VOLUME = 0.3;

/**
 * **他の人・敵が受けた音が届く距離（マス）**（`22-feedback.md` 9 章）。
 *
 * > ### 遠くの被弾は要らない
 * >
 * > **敵が 100 体いると、被弾音が壁になる。**
 * > **近くで起きていることだけ聞こえればいい。**
 */
const HURT_RANGE = 5;

/** 他の人・敵が受けた音の、**いちばん近いときの音量**。距離で絞る */
const HURT_NEAR = 0.18;

/** その人に、向きの無い音を鳴らす。**頭の位置を渡す**（`22-feedback.md` 1-1） */
function toEar(p: Player, id: string, volume: number): void {
  if (volume <= 0) return;
  try {
    p.playSound(id, { volume, pitch: 0.9 + Math.random() * 0.2, location: p.getHeadLocation() });
  } catch {
    /* 消えている */
  }
}

/**
 * **受けた音を、聞こえるべき人にだけ鳴らす**（`22-feedback.md` 9 章）。
 *
 * | | |
 * | --- | --- |
 * | **受けた本人** | いつでも鳴る。**自分の HP が減った理由が分かるように** |
 * | **他の人・敵が受けた** | **そこから 5 マス以内の人だけ。** 遠いほど小さい |
 * | **当てた本人** | **鳴らさない。** 当てた合図が別にある |
 *
 * **敵が受けたときも同じ**——**近くで起きていることだけ聞こえる。**
 */
export function hurtSound(target: Entity, by?: Player): void {
  const self = target instanceof Player ? target : undefined;
  if (self !== undefined) toEar(self, HURT_SOUND, HURT_VOLUME);
  let at;
  try {
    at = target.location;
  } catch {
    return;
  }
  for (const p of world.getAllPlayers()) {
    try {
      // **当てた本人には鳴らさない**（2026-09-08）——
      // **当てた合図（金床の音）が別に鳴る**ので、重ねると 2 発当たったように聞こえる
      if (p.id === self?.id || p.id === by?.id) continue;
      const q = p.location;
      const d = Math.hypot(q.x - at.x, q.y - at.y, q.z - at.z);
      if (d > HURT_RANGE) continue;
      toEar(p, HURT_SOUND, HURT_NEAR * (1 - d / HURT_RANGE));
    } catch {
      /* 抜けた */
    }
  }
}
