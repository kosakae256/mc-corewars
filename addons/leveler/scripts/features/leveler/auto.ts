/**
 * 整地の自動運転。
 *
 * 呼び出された時点で動き出し、対象が無くなるまで繰り返す（spec 3-1）。
 *
 * ## 進め方
 *
 * **全部を洗い出してから動くのではなく、1マスずつ確定して動く。**
 *
 *   1. 自分の位置から**最も近い1マス**を探す
 *   2. そこへ歩く
 *   3. 埋める
 *   4. 1 に戻る
 *
 * こうすると、埋めた結果が次の探索に反映されるので、
 * 「埋めたはずの場所をもう一度狙う」ことがなくなる。
 * ボットが移動すれば探索の中心も動くので、自然に作業範囲が広がっていく。
 */
import { system, world, type Dimension, type Vector3 } from "@minecraft/server";
import type { SimulatedPlayer } from "@minecraft/server-gametest";

import {
  AUTO_RADIUS,
  IDLE_RESCAN_TICKS,
  NEXT_TARGET_DELAY,
  RETRY_DELAY,
  SEARCH_WATCHDOG_TICKS,
} from "./config.js";
import { Brawler } from "./brawl.js";
import { unwatch, watch } from "./supervisor.js";
import { findByRaysJob, findNearestJob, findSharedJob } from "./scan.js";
import type { Target } from "./logic.js";
import { LevelWorker } from "./work.js";
import { claim, releaseAll } from "./registry.js";
import { MSG } from "../../lib/format.js";

export class AutoLeveler {
  private worker: LevelWorker | undefined;
  private running = false;
  private searching = false;
  /** 探索を始めた tick。返ってこないまま固まるのを見張る */
  private searchStarted = 0;
  private done = 0;
  /** 暇なときの殴り合い（spec 3-A-8）。仕事が見つかったら止める */
  private readonly brawler: Brawler;
  /** 最後に何かが進んだ tick。外の見張りが見る（spec 3-A-10） */
  private active = 0;

  constructor(
    private readonly bot: SimulatedPlayer,
    private readonly dimension: Dimension,
    private readonly name: string
  ) {
    this.brawler = new Brawler(bot, name);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * 最後に何かが進んだ tick。
   *
   * **作業中のワーカーの鼓動も見る。**
   * 遠くの目標へ歩いている間は自分では何も記録しないので、
   * これが無いと働いている個体まで蹴り起こしてしまう。
   */
  get lastActive(): number {
    return Math.max(this.active, this.worker?.lastTick ?? 0);
  }

  /** 進んだことを記録する。これが途切れると外から蹴られる */
  private touch(): void {
    this.active = system.currentTick;
  }

  /**
   * 外から蹴り起こされたときの処理（spec 3-A-10）。
   *
   * **どこで止まったかは問わない。** 状態を全部捨ててやり直す。
   * 予約も手放す（持ったまま止まると、そのマスが誰にも触れなくなる）。
   */
  kick(): void {
    if (!this.running) return;
    console.warn(`[leveler] ${this.name} が止まっていたので作業をやり直させます`);

    this.searching = false;
    this.worker?.stop(true);
    this.worker = undefined;
    this.brawler.stop();
    releaseAll(this.name);
    this.touch();
    this.step();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.done = 0;
    this.touch();
    watch(this);
    this.step();
  }

  stop(silent = false): void {
    this.running = false;
    unwatch(this);
    this.brawler.stop();
    releaseAll(this.name);
    this.worker?.stop(true);
    this.worker = undefined;
    if (!silent) world.sendMessage(MSG.stopped);
  }

  /** 1マスぶんの処理: 探す → 埋める → 次へ */
  private step(): void {
    if (!this.running) return;
    if (!this.bot.isValid) {
      this.running = false;
      return;
    }

    // 探索を始めるなら、もう暇ではない
    this.brawler.stop();

    // **探索が返ってこないまま固まっていないか見る。**
    // `system.runJob` のジェネレータが例外で死ぬと完了通知が来ない。
    // 見張らないと、そのボットは二度と動かない
    if (this.searching) {
      if (system.currentTick - this.searchStarted < SEARCH_WATCHDOG_TICKS) return;
      this.searching = false;
    }

    this.searching = true;
    this.searchStarted = system.currentTick;
    this.touch();

    system.runJob(
      findNearestJob(this.dimension, this.bot.location, AUTO_RADIUS, this.name, (target) => {
        this.searching = false;
        if (!this.running) return;
        if (target) {
          this.take(target);
          return;
        }
        this.onNothingNearby();
      })
    );
  }

  /**
   * 近くに何も無かったときの手当て。
   *
   * **止まる前にやることがある。** 順に試す。
   *
   *   1. 探索範囲を広げる（近場の見落とし）
   *   2. **他のボットが見つけた場所をもらう**（世界を読まないのでほぼ無料）
   *   3. 線を飛ばして遠くを探す（四角い走査より桁違いに安い）
   *   4. それでも無ければ待つ
   */
  private onNothingNearby(): void {
    this.touch();

    // 1. **線を飛ばして遠くを探す。**
    //    半径を広げるより先にこちらをやる。
    //    半径16の四角走査は 1089 列でたった16ブロックしか届かないが、
    //    線なら 2048 サンプルで 256 ブロック先まで届く（spec 3-A-4）
    this.searching = true;
    this.searchStarted = system.currentTick;
    system.runJob(
      findByRaysJob(this.dimension, this.bot.location, this.name, (target) => {
        this.searching = false;
        if (!this.running) return;
        if (target) {
          this.take(target);
          return;
        }
        this.fallBackToShared();
      })
    );
  }

  /**
   * 自分では見つけられなかったので、他のボットの見つけた場所をもらう。
   *
   * **自分で集めた結果より必ず後**（spec 3-A-5）。
   * 世界を読まないので、ここまで来ても費用はほぼゼロ。
   */
  private fallBackToShared(): void {
    const shared = findSharedJob(this.bot.location, this.name);
    if (shared) {
      this.take(shared);
      return;
    }
    this.idle();
  }

  /**
   * 本当にやることが無いときだけ待つ。
   *
   * `IDLE_RESCAN_TICKS`（100 tick）ごとに探し直す。
   * **空振りが続いても間隔を延ばさない。**
   * 延ばすと、近くに埋める場所ができても気づけない。
   *
   * 待っている間は他のボットを殴っている（spec 3-A-8）。
   */
  private idle(): void {
    this.touch();

    // **やることが無いなら他のボットを殴る**（spec 3-A-8）。
    // 整地の役には立たないが、止まっているより面白い。
    // 次に探し直すまでの 100 tick、ずっと殴り続ける
    this.brawler.start();

    // **間隔は一定。空振りが続いても延ばさない。**
    // 延ばすと、近くに埋める場所ができても気づけない
    system.runTimeout(() => this.step(), IDLE_RESCAN_TICKS);
  }

  /**
   * 見つけた列を担当する。
   *
   * **他のボットが狙っている列でも構わない。**
   * 空いている列を優先するのは走査側の仕事で（`Candidates`）、
   * ここに来た時点で「空きが無いので相乗りする」と決まっている。
   *
   * 相乗りした先で相手が邪魔なら、殴ってどかす（spec 3-A-3）。
   */
  private take(target: Target): void {
    claim(target, this.name);
    this.touch();
    this.handleOne(target);
  }

  /** 見つけた1マスを処理する */
  private handleOne(target: Target): void {
    this.worker = new LevelWorker(this.bot, this.dimension, this.name);
    this.worker.start([target], () => {
      this.done++;
      this.touch();
      // 進捗はチャットに出さない（うるさいため）。
      // 状況は /level:status で見られる。すぐ次の1マスを探す
      if (this.running) system.runTimeout(() => this.step(), NEXT_TARGET_DELAY);
    });
  }
}
