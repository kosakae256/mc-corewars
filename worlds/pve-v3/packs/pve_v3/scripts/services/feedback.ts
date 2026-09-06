/**
 * 手応え。**赤く光る・音・揺れ・ノックバック。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md`。
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
 *
 * ## 揺れているのは `camerashake` ではない（2026-09-06）
 *
 * **`camerashake` は「成功」を返すのに、何も起きなかった。**
 * **バニラの被弾の揺れを借りている**（`tilt`）。
 *
 * ## 画面を赤くするのは諦めた（2026-09-06）
 *
 * | 試したもの | 駄目だった理由 |
 * | --- | --- |
 * | 自前の霧（`fog push`） | **コマンドは通るのに、何も見えない** |
 * | `camera.fade` | **一度必ず塗り潰す。** 合計 0.5 秒より短くできない |
 * | バニラの被弾表示 | **Bedrock にそんな表示は無かった**（Java の話だった） |
 * | 自前の板を HUD に重ねる | **HUD が壊れた。** 赤い枠が出っぱなしになった |
 *
 * **残したのは揺れだけ。**
 */

import { EntityDamageCause, Player, system, world, type Entity } from "@minecraft/server";

import { run } from "./cmd.js";

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

/** 受けた音。**受けた本人にだけ鳴る** */
const HURT_SOUND = "game.player.hurt";

/**
 * 受けた音の大きさ。
 *
 * > ### **受けた音は必ず鳴る**（2026-09-06 決定・`22-feedback.md` 1 章）
 * >
 * > **奈落でも、毒でも、爆風でも鳴らす。**
 * > **鳴らない削られ方があると、HP が減った理由が分からない。**
 */
const HURT_VOLUME = 0.7;

/** 大ダメージと認める割合。**最大 HP に対して**（`22-feedback.md` 2 章） */
export const BIG_CUT = 0.24;

/**
 * 大ダメージの音。**ゴシャッという鈍い音**（2026-09-06 決定）。
 *
 * > ### **2 つ重ねる**
 * >
 * > 鉄ゴーレムの当たり音だけでは**軽くて、鳴っているか分からなかった。**
 * > **金床を低く落としたもの**を重ねて、**厚みを出す。**
 * >
 * > **当てた音も金床**（高さ 1.9）だが、**0.5 まで落とすと別物に聞こえる。**
 */
const BIG_SOUNDS: readonly { readonly id: string; readonly volume: number; readonly pitch: number }[] = [
  { id: "random.anvil_land", volume: 1, pitch: 0.5 },
  { id: "mob.irongolem.hit", volume: 1, pitch: 0.7 },
];

/** 大ダメージで体から噴き出す赤い粒（`resource_packs/pve_v3/particles/hurt_burst.json`） */
const BIG_BURST = "pve_v3:hurt_burst";

/**
 * 画面の揺れ。**強さと長さ（秒）**
 *
 * | | いつ |
 * | --- | --- |
 * | **小** | **受けるたび** |
 * | **大** | **最大 HP の 24% 以上**を持って行かれたとき |
 *
 * > ### 端末で「カメラの揺れ」を切っていると出ない
 * >
 * > **こちらから直せるものではない。**
 */
const SMALL_SHAKE = { power: 0.06, time: 0.12 } as const;
const BIG_SHAKE = { power: 0.28, time: 0.35 } as const;

/** ノックバックの強さ（`22-feedback.md` 4 章） */
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
 */
function sound(from: Entity | undefined, id: string, volume: number, pitch = 1): void {
  if (!(from instanceof Player)) return;
  try {
    // **少しだけ散らす**——同じ音が続くと機械的に聞こえる
    from.playSound(id, { volume, pitch: pitch * (0.95 + Math.random() * 0.1) });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * **画面を揺らす。**
 *
 * > ### 揺れているのは `camerashake` ではない（2026-09-06 に突き止めた）
 * >
 * > **`camerashake` は「成功」を返すのに、何も起きない。**
 * > **実際に揺れていたのは、バニラの被弾の揺れだった。**
 * >
 * > **1 だけ本物のダメージを入れて、同じ tick で体力を戻す。**
 * > **`override` で入れる**——`events/hurt.ts` が打ち消さない唯一の原因。
 * > **バニラの体力は 1000**（`entities/player.json`）なので、
 * > **1 tick に何発入っても、戻す処理が間に合う。**
 *
 * **強さは選べない。** バニラの揺れは 1 種類しかない。
 * **`camerashake` も一応流す**——効く端末なら、そのぶん強く揺れる。
 */
function shake(player: Player, power: number, time: number): void {
  system.run(() => {
    tilt(player);
    run(player, `camerashake add @s ${power} ${time} rotational`);
  });
}

/** バニラの被弾の揺れ。**体力は同じ tick で戻す** */
function tilt(player: Player): void {
  try {
    const hp = player.getComponent("minecraft:health");
    if (hp === undefined) return;
    const before = hp.currentValue;
    // **死なせない。** 戻す前に落ちてしまう（上限 1000 なので、まず起きない）
    if (before <= 2) return;
    player.applyDamage(1, { cause: EntityDamageCause.override });
    hp.setCurrentValue(before);
  } catch {
    /* 消えている */
  }
}

/**
 * **大ダメージの手応え**（`22-feedback.md` 2 章）。
 *
 * ```
 * 画面が揺れる ＋ ゴシャッと鳴る ＋ 体から赤い粒が噴き出す
 * ```
 */
export function bigHurt(player: Player, _now: number): void {
  shake(player, BIG_SHAKE.power, BIG_SHAKE.time);
  for (const one of BIG_SOUNDS) {
    try {
      player.playSound(one.id, { volume: one.volume, pitch: one.pitch });
    } catch {
      /* その音が無い端末。**残りは鳴る** */
    }
  }
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
 * 押す。**プレイヤーが受けたときだけ**（`22-feedback.md` 4 章）。
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
      // **受けるたびに、少しだけ揺らす**（2026-09-06 追加）
      shake(target, SMALL_SHAKE.power, SMALL_SHAKE.time);
    }
    // **音量は控えめに**（2026-08-31）——毎発鳴るので、大きいと耳に刺さる
    if (withSound) sound(from, SOUND, SOUND_VOLUME, SOUND_PITCH);
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
