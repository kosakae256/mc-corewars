/**
 * 手応え。**赤く光る・音・揺れ・ノックバック。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md`。
 *
 * ## バニラの点滅は借りない
 *
 * `applyDamage` でバニラに赤くさせる手は使わない——**無敵時間に飲まれる。**
 * **実体の property を script が立てて、script が下ろす。**
 *
 * ## 揺れと赤み（2026-09-06）
 *
 * **`camerashake` は「成功」を返すのに何も起きなかった。**
 * **バニラの被弾の揺れを借りている**（`tilt`）。
 * **画面を赤くするのは諦めた**——理由は `22-feedback.md` 2-1。 */

import { EntityDamageCause, Player, system, world, type Entity, type Vector3 } from "@minecraft/server";

import { damageFlash, run } from "./cmd.js";
import { nextAmount } from "./iframe.js";
import { knockback } from "./knockback.js";
import { hurtSound } from "./hurtsound.js";

/**
 * 「いま赤い」を持つ property（`entities/grunt.json`）。
 *
 * > ### 描画側は見ていない（2026-08-31 決定）
 * >
 * > **property は立て続ける**が、赤い点滅そのものは出していない。
 * > 当たったことは**火花と数字**で分かる。
 */
const HURT = "pve_v3:hurt";

/**
 * 赤いままの長さ（tick）。**バニラと同じ 10 tick（0.5 秒）。**
 *
 * はじめ 3 tick にしていたが、**一瞬すぎて見えなかった**（2026-08-29）。
 */
const FLASH = 10;

/**
 * 当てた合図。**殴った本人に鳴る**（`22-feedback.md` 3 章）。
 *
 * > ### **pve-v2 のクリティカル音を、通常ヒットに使う**（2026-09-06 決定）
 * >
 * > `game.player.hurt` は**刺さった手応えが無かった。**
 * > **v2 で「効いた」と分かる音**（金床）に揃える。
 */
const SOUND = "random.anvil_land";
const SOUND_VOLUME = 0.35;
const SOUND_PITCH = 1.9;

/** 大ダメージと認める割合。**最大 HP に対して**（`22-feedback.md` 2 章） */
export const BIG_CUT = 0.24;

/** 大ダメージで体から噴き出す赤い粒（`resource_packs/pve_v3/particles/hurt_burst.json`） */
const BIG_BURST = "pve_v3:hurt_burst";

/**
 * 画面の揺れ。**強さと長さ（秒）。受けるたびに小さく**
 *
 * > ### 端末で「カメラの揺れ」を切っていると出ない
 * >
 * > **こちらから直せるものではない。**
 */
/**
 * > ### **`camerashake` は使わない**（2026-09-08 に外した）
 * >
 * > **「成功」を返すのに何も起きなかった**（2026-09-06 に判明していた）。
 * > **揺れは `damage` コマンドが出している**——**バニラの被弾の揺れ。**
 * > **二重に流す意味が無いので、処理から外した。**
 */

/** 赤くしたもの。**id → 下ろす時刻（tick）** */
const flashing = new Map<string, number>();

function setHurt(entity: Entity, on: boolean): void {
  try {
    entity.setProperty(HURT, on);
  } catch {
    // property を持たない実体（プレイヤーなど）。**それでよい**
  }
}

/**
 * 赤くする。**property ＋ バニラの被弾演出**（2026-09-07 追加）。
 *
 * **0 ダメージの `/damage`**——**光るだけで、体力は動かない。**
 */
function flash(entity: Entity, now: number): void {
  setHurt(entity, true);
  flashing.set(entity.id, now + FLASH);
  // > ### **`damage` コマンドは、相手が誰でも必ず通す**（2026-09-08 決定）
  // >
  // > **前はプレイヤーだけ `applyDamage` に分けていた。**
  // > **同じ「削られた」なのに出方が二通りある**のは、追いにくいだけだった。
  // > **赤く光るのも、画面が揺れるのも、これ 1 本から出る。**
  damageFlash(entity);
}

/**
 * 当たった音。**殴った本人にだけ鳴らす**（2026-08-31 決定）。
 *
 * > ### 場所から鳴らさない
 * >
 * > **遠くの敵に当てると聞こえない**——弓は 48 マス先まで届く。
 * > **他人のヒット音も要らない**（人数が増えると音が埋まる）。
 */
function sound(from: Entity | Vector3 | undefined, id: string, volume: number, pitch = 1): void {
  if (!(from instanceof Player)) return;
  try {
    // **少しだけ散らす**——同じ音が続くと機械的に聞こえる
    from.playSound(id, { volume, pitch: pitch * (0.95 + Math.random() * 0.1) });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * **大ダメージの手応え**（`22-feedback.md` 2 章）。
 *
 * > ### 音と揺れはやめた（2026-09-07）
 * >
 * > **雰囲気に合わなかった。** **残したのは赤い粒だけ。**
 * > **受けるたびの揺れ**（`SMALL_SHAKE`）**と、バニラの被弾音はそのまま。**
 */
export function bigHurt(player: Player, _now: number): void {
  burst(player);
}

/** **体から赤い粒が噴き出す。** 胸のあたりから */
function burst(player: Player): void {
  try {
    const at = player.location;
    player.dimension.spawnParticle(BIG_BURST, { x: at.x, y: at.y + 1.1, z: at.z });
  } catch {
    /* 見えない所 */
  }
}

/**
 * 当たった手応えを出す。
 *
 * @param from 殴った相手（**居なければ押さない**）
 * @param withSound **通常攻撃のときだけ鳴らす**（2026-08-31 決定）。
 *   延焼のような**毎秒刻むもので鳴らすと、音が鳴りっぱなし**になる
 * @param knockPower **押す強さ。** 省略なら既定（`core/knockback.ts`）
 */
export function feedback(
  target: Entity,
  from: Entity | Vector3 | undefined,
  now: number,
  withSound = true,
  knockMobs = false,
  knockPower?: number,
  knockUp?: number
): void {
  try {
    flash(target, now);

    // ---- **自分が受けたとき**は、受けた本人に鳴らす（2026-08-31）。
    //
    // 殴ってきたのがモブだと `from` はプレイヤーではないので、
    // **当てた側の音（下の `sound`）は誰にも鳴らない。**
    hurtSound(target, from instanceof Player ? from : undefined);
    if (target instanceof Player) {
    }
    // **音量は控えめに**（2026-08-31）——毎発鳴るので、大きいと耳に刺さる
    if (withSound) sound(from, SOUND, SOUND_VOLUME, SOUND_PITCH);
    knockback(target, from, { power: knockPower, up: knockUp, mobs: knockMobs });
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
