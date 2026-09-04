/**
 * 手応え。**赤く光る・音・ノックバック。**
 *
 * 仕様は `docs/spec/13-feedback.md`。
 *
 * ## バニラの点滅は借りない
 *
 * `applyDamage` でバニラに赤くさせる手は使わない——**無敵時間に飲まれる。**
 * 10 tick 以内の 2 発目は何も起きず、
 * **「1 tick に 3 発ぜんぶ入る」（`docs/spec/11-damage.md` 1-1）と噛み合わない。**
 *
 * > 前のワールドで同じ穴に落ちた。
 * > **「+50% が乗らない」の原因が、無敵時間に飲まれた `applyDamage` だった。**
 *
 * **実体の property を script が立てて、script が下ろす。**
 */

import { Player, world, type Entity, type Vector3 } from "@minecraft/server";

/**
 * 「いま赤い」を持つ property（`entities/grunt.json`）。
 *
 * > ### 赤い点滅はやめた（2026-08-31 決定）
 * >
 * > **当てるたびに全身が赤くなるとうるさい**——弓は毎秒 2 発当たる。
 * > 当たったことは**火花と数字**で分かる。
 * > **property は立て続ける**（描画側が見ていないだけ。戻すのは 1 行）。
 */
const HURT = "pve_v3:hurt";

/**
 * 赤いままの長さ（tick）。**バニラと同じ 10 tick（0.5 秒）。**
 *
 * はじめ 3 tick にしていたが、**一瞬すぎて見えなかった**（2026-08-29）。
 *
 * > **多段ヒットの間は赤いままになる**（星屑は 5 tick ごとに落ちる）。
 * > **それでよい**——バニラも連続で殴られれば赤いままになる。
 */
const FLASH = 10;

/** 当てた合図。**殴った本人に鳴る**（`docs/spec/13-feedback.md` 3 章） */
const SOUND = "game.player.hurt";

/** 受けた音。**受けた本人にだけ鳴る** */
const HURT_SOUND = "game.player.hurt";

/** 受けた音の大きさ。**自分の被弾は分からないと困るので、当てた音より大きい** */
const HURT_VOLUME = 0.3;

/** ノックバックの強さ（`docs/spec/13-feedback.md` 4 章） */
const KNOCK_H = 0.9;
const KNOCK_V = 0.35;

/** 赤くしたもの。**id → 下ろす時刻（tick）** */
const flashing = new Map<string, number>();

function setHurt(entity: Entity, on: boolean): void {
  try {
    entity.setProperty(HURT, on);
  } catch {
    // property を持たない実体（プレイヤーなど）。**それでよい**
  }
}

/** 赤くする */
function flash(entity: Entity, now: number): void {
  setHurt(entity, true);
  flashing.set(entity.id, now + FLASH);
}

/**
 * 当たった音。**殴った本人にだけ鳴らす**（2026-08-31 決定）。
 *
 * > ### 場所から鳴らさない
 * >
 * > **遠くの敵に当てると聞こえない**——弓は 48 マス先まで届く。
 * > **他人のヒット音も要らない**（人数が増えると音が埋まる）。
 *
 * **殴ったのがモブなら鳴らさない**（相手はプレイヤーで、受けた側の手応えは別）。
 */
function sound(from: Entity | undefined, id: string, volume: number): void {
  if (!(from instanceof Player)) return;
  try {
    from.playSound(id, { volume, pitch: 0.9 + Math.random() * 0.2 });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 押す。**プレイヤーが受けたときだけ**（`docs/spec/13-feedback.md` 4 章）。
 *
 * モブを押すと、**多段ヒットの武器が当てるたびに遠ざける。**
 */
function knock(target: Entity, from: Entity | undefined): void {
  if (!(target instanceof Player) || from === undefined) return;
  try {
    const a = target.location;
    const b = from.location;
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    target.applyKnockback({ x: (dx / len) * KNOCK_H, z: (dz / len) * KNOCK_H }, KNOCK_V);
  } catch {
    /* 消えている */
  }
}

/**
 * 当たった手応えを出す。
 *
 * @param from 殴った相手（**居なければ押さない**）
 * @param withSound **通常攻撃のときだけ鳴らす**（2026-08-31 決定）。
 *   延焼のような**毎秒刻むもので鳴らすと、音が鳴りっぱなし**になる
 */
export function feedback(target: Entity, from: Entity | undefined, now: number, withSound = true): void {
  try {
    flash(target, now);

    // ---- **自分が受けたとき**は、受けた本人に鳴らす（2026-08-31）。
    //
    // 殴ってきたのがモブだと `from` はプレイヤーではないので、
    // **当てた側の音（下の `sound`）は誰にも鳴らない。**
    if (target instanceof Player) {
      try {
        target.playSound(HURT_SOUND, { volume: HURT_VOLUME, pitch: 0.9 + Math.random() * 0.2 });
      } catch {
        /* 消えている */
      }
    }
    // **音量は控えめに**（2026-08-31）——毎発鳴るので、大きいと耳に刺さる
    if (withSound) sound(from, SOUND, 0.2);
    knock(target, from);
  } catch {
    /* もう居ない */
  }
}

/**
 * 赤いのを下ろす。**毎 tick。**
 *
 * **覚えているものではなく、時刻で下ろす**——
 * 途中で消えた実体は `setProperty` が失敗するだけで、記録は捨てる。
 */
export function stepFeedback(now: number): void {
  if (flashing.size === 0) return;
  for (const [id, until] of flashing) {
    if (now < until) continue;
    flashing.delete(id);
    const e = byId(id);
    if (e === undefined) continue;
    setHurt(e, false);
  }
}

/** id から実体を引く。**居なければ undefined** */
function byId(id: string): Entity | undefined {
  try {
    return world.getEntity(id) ?? undefined;
  } catch {
    return undefined;
  }
}
