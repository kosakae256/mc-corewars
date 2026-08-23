/**
 * 暇なボットの殴り合い（spec 3-A-8）。
 *
 * 探索を全部やり切って何も見つからなかったボットは、
 * 他のボットをとてつもない速度で殴る。
 * **整地の役には立たない。止まっているより面白いから入れている。**
 *
 * ## 殴る速さと無敵時間
 *
 * **Bedrock のプレイヤーには攻撃クールダウンが存在しない**ので、
 * `attackEntity()` は毎 tick 呼んでよい。
 *
 * ただし**殴られた側に約10 tick の無敵時間があり、これは変えられない**
 * （調査結果は spec 3-A-8）。そのままだと殴っても相手が反応しない。
 *
 * そこで**ノックバックを自分で与える**。
 * `applyKnockback` はダメージ処理を通らないので無敵時間に縛られず、
 * **毎 tick 効く**。見た目上は毎 tick 殴っていることになる。
 *
 * ## 相手の選び方
 *
 * **自分より低い位置にいるボットを優先する。**
 * 下にいるボットは穴から出られなくなっている可能性が高いので、
 * わざわざそこまで移動して殴りに行く。
 * ノックバックは無敵時間に縛られないので、**殴れば上に押し出せる**。
 * 暇つぶしがそのまま救助になる。
 *
 * 誰も下にいなければ、横にいる誰かを殴る。
 * 近い相手を選ぶと、たまたま隣にいる2体だけで殴り合って絵が固まるので、
 * そこはランダムにする。
 *
 * ただし**毎 tick 選び直さない**。
 * 毎 tick 変えると、どこにも着かないまま向きだけ変わり続ける。
 */
import { system, type Entity } from "@minecraft/server";
import { LookDuration, type SimulatedPlayer } from "@minecraft/server-gametest";

import {
  BRAWL_CHASE_SPEED,
  BRAWL_HIT_PARTICLE,
  BRAWL_HIT_SOUND,
  BRAWL_HURT_SOUND,
  BRAWL_SOUND_VOLUME,
  BRAWL_INTERVAL,
  BRAWL_KNOCKBACK,
  BRAWL_KNOCKBACK_UP,
  BRAWL_REACH,
  BRAWL_RETARGET_TICKS,
  BRAWL_SWINGS_PER_TICK,
} from "./config.js";
import { botBelow, randomBot } from "./registry.js";

/**
 * 相手を殴る。
 *
 * **ノックバックも一緒に与える。**
 * ダメージ処理は無敵時間（約10 tick）に縛られるが、
 * `applyKnockback` は縛られないので毎 tick 効く。
 * 相手を物理的にどかしたいときは、これが本体になる。
 *
 * 暇なときの殴り合いと、
 * 置きたい場所に立たれたときの実力行使（spec 3-A-3）で共用する。
 */
export function punch(attacker: SimulatedPlayer, target: SimulatedPlayer): void {
  if (!attacker.isValid || !target.isValid) return;

  const p = attacker.location;
  const q = target.location;

  // Instant にしないと、向き終わるまでの数 tick を無駄にする
  attacker.lookAtEntity(target, LookDuration.Instant);

  // **1 tick に何度も殴る。**
  // `runInterval` は 1 tick が下限なので、
  // それ以上速くするには同じ tick の中で繰り返すしかない
  for (let i = 0; i < BRAWL_SWINGS_PER_TICK; i++) {
    attacker.attackEntity(target);
  }

  // 真上に重なっていると向きが作れない。そのときは適当な向きへ飛ばす
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len = Math.hypot(dx, dz);
  const nx = len < 0.01 ? 1 : dx / len;
  const nz = len < 0.01 ? 0 : dz / len;

  target.applyKnockback(
    { x: nx * BRAWL_KNOCKBACK, z: nz * BRAWL_KNOCKBACK },
    BRAWL_KNOCKBACK_UP
  );

  showHit(attacker, target);
}

/**
 * 当たったように見せる。
 *
 * **無敵時間は消せないので、疑似的に見せる**（spec 3-A-8）。
 * 赤く光る演出は damage 処理の中で起きるため約10 tick に1回しか出ないが、
 * **音とパーティクルは damage 処理を通らないので毎 tick 出せる**。
 * ノックバック（毎 tick 効く）と合わせると、連打が当たって見える。
 *
 * 音は1回の `punch` につき1回だけ鳴らす。
 * 殴る回数ぶん鳴らすと、ただの雑音になる。
 */
export function showHit(attacker: Entity, target: Entity): void {
  const at = target.getHeadLocation();

  try {
    const dimension = attacker.dimension;
    dimension.playSound(BRAWL_HIT_SOUND, at, { volume: BRAWL_SOUND_VOLUME });
    dimension.playSound(BRAWL_HURT_SOUND, at, { volume: BRAWL_SOUND_VOLUME });
    dimension.spawnParticle(BRAWL_HIT_PARTICLE, at);
  } catch {
    // チャンクが読めない等。演出なので失敗しても無視してよい
  }
}

export class Brawler {
  private runId: number | undefined;
  private target: SimulatedPlayer | undefined;
  private pickedAt = 0;

  constructor(
    private readonly bot: SimulatedPlayer,
    private readonly name: string
  ) {}

  start(): void {
    if (this.runId !== undefined) return;
    this.runId = system.runInterval(() => this.tick(), BRAWL_INTERVAL);
  }

  stop(): void {
    if (this.runId === undefined) return;
    system.clearRun(this.runId);
    this.runId = undefined;
    this.target = undefined;
    if (this.bot.isValid) this.bot.stopMoving();
  }

  private tick(): void {
    if (!this.bot.isValid) {
      this.stop();
      return;
    }

    this.retargetIfNeeded();

    const target = this.target;
    if (!target?.isValid) return;

    const p = this.bot.location;
    const q = target.location;
    const dist = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);

    if (dist > BRAWL_REACH) {
      // **エンティティを直接渡せるので、相対座標に変換しなくてよい**
      // 届いていない間は殴れない。全力で追う
      this.bot.navigateToEntity(target, BRAWL_CHASE_SPEED);
      return;
    }

    this.bot.stopMoving();
    punch(this.bot, target);
  }

  /**
   * 相手を選び直す。
   *
   * **自分より低い位置にいるボットを優先する。**
   * 下にいるボットは穴から出られなくなっている可能性が高いので、
   * わざわざそこまで移動して殴りに行く。
   * ノックバックは無敵時間に縛られないので、**殴れば上に押し出せる**。
   * 暇つぶしがそのまま救助になる。
   *
   * 下にいるボットが複数いればランダムに選ぶ（全員で1体に群がらないため）。
   * **誰も下にいなければ、横にいる（＝同じか上の）誰かを殴る。**
   * 止まっているよりは動いていた方がよい。
   *
   * 選び直しは毎 tick やらない。`BRAWL_RETARGET_TICKS` の間は同じ相手を追う
   * （毎 tick 変えると、どこにも着かないまま向きだけ変わり続ける）。
   */
  private retargetIfNeeded(): void {
    const stale = system.currentTick - this.pickedAt >= BRAWL_RETARGET_TICKS;
    if (this.target?.isValid && !stale) return;

    this.target = botBelow(this.bot.location.y, this.name) ?? randomBot(this.name);
    this.pickedAt = system.currentTick;
  }
}
