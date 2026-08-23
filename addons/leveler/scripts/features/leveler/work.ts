/**
 * 埋める作業のループ。
 *
 * 1マスずつ「歩く → 向く → 置く」を繰り返す。
 * 経路探索は `navigateToLocation` に任せる（自前で組まない）。
 *
 * 状態と手続きがセットなのでクラスにしている（docs/imp.md「要するに」3）。
 */
import {
  Direction,
  ItemStack,
  system,
  world,
  type Dimension,
  type Vector3,
} from "@minecraft/server";
import type { SimulatedPlayer } from "@minecraft/server-gametest";

import { toRelative } from "./bot.js";
import { punch } from "./brawl.js";
import {
  botStandingAt,
  defer,
  evacDestination,
  isEvacuating,
  release,
  requestEvacuate,
} from "./registry.js";
import {
  BEDROCK_Y,
  BRAWL_REACH,
  DEFER_TICKS,
  EVACUATE_DISTANCE,
  EVACUATE_PILLAR_AFTER,
  EVACUATE_TICKS,
  DIG_SLOT,
  DIG_TOOL,
  FILL_ITEM,
  FILL_SLOT,
  MOVE_TIMEOUT_TICKS,
  GROUND_Y,
  PLACE_TIMEOUT_TICKS,
  TRAVEL_TICKS_PER_BLOCK,
  WORK_INTERVAL,
} from "./config.js";
import { horizontalDistance, type Target } from "./logic.js";
import { fillYOf, invalidate } from "./terrain.js";
import { MSG } from "../../lib/format.js";

/** 1マスを処理する段階 */
type Phase = "move" | "place";

export class LevelWorker {
  private targets: Target[] = [];
  private index = 0;
  private phase: Phase = "move";
  private waited = 0;
  private runId: number | undefined;
  private giveUp = 0;
  private placed = 0;
  private failed = 0;
  private noSupport = 0;
  private jumped = 0;
  private stuck = 0;
  private lastDist: number | undefined;
  private pendingCheck: Target | undefined;
  private selfBlocked = 0;
  private dug = 0;
  private buried = 0;
  private persisted = 0;
  private jumpedForPlace = false;
  /** ジャンプしてから経った tick。跳べていないときの跳び直し用 */
  private jumpWaited = 0;
  private skipped = 0;
  private punched = 0;
  /** 今どこへどこうとしているか。無駄な出し直しを防ぐ */
  private evacGoal: string | undefined;
  /** どき始めてから経った tick。歩いて逃げられないときの判断に使う */
  private evacTicks = 0;
  /** 今回の退避で、もう積んで上がったか。何段も積み上げないため */
  private pillared = false;
  /** このマスを諦める tick。`system.currentTick` と比べる */
  private deadline = 0;
  /** 今どこへ向かう指示を出しているか。無駄な出し直しを防ぐ */
  private navGoal: string | undefined;

  constructor(
    private readonly bot: SimulatedPlayer,
    private readonly dimension: Dimension,
    private readonly name: string
  ) {}

  get isRunning(): boolean {
    return this.runId !== undefined;
  }

  /**
   * 最後に処理が回った tick。
   *
   * 親（`AutoLeveler`）が生存確認に使う。
   * **これが更新されている間は、時間が掛かっていても止まってはいない。**
   * 遠くの目標へ歩いている最中に蹴り起こされないようにするため。
   */
  get lastTick(): number {
    return this.ticked;
  }

  private ticked = 0;

  get remaining(): number {
    return Math.max(0, this.targets.length - this.index);
  }

  get total(): number {
    return this.targets.length;
  }

  private onDone: (() => void) | undefined;

  start(targets: Target[], onDone?: () => void): void {
    this.onDone = onDone;
    this.targets = targets;
    this.index = 0;
    this.phase = "move";
    this.waited = 0;
    this.deadline = this.deadlineFor(targets[0]);

    this.runId = system.runInterval(() => this.tick(), WORK_INTERVAL);
  }

  stop(silent = false): void {
    if (this.runId !== undefined) {
      system.clearRun(this.runId);
      this.runId = undefined;
    }
    this.bot.stopMoving();
    if (!silent) world.sendMessage(MSG.stopped);
  }

  /** 作業の1ステップ。runInterval から呼ばれる */
  private tick(): void {
    this.ticked = system.currentTick;
    try {
      this.tickInner();
    } catch (e) {
      console.error("[leveler/work]", e);
      // **必ず親に知らせる。**
      // 黙って止まると、次のマスが割り当てられずこの個体は永久に動かない
      const cb = this.onDone;
      this.stop(true);
      cb?.();
    }
  }

  private tickInner(): void {
    if (!this.bot.isValid) {
      this.stop(true);
      return;
    }

    // 前回の設置が反映されたかを、次の tick で確かめる
    this.verifyPending();

    // ---- ここから優先順位の高い処理。埋める作業より先にやる ----

    // 1. 埋まっていたら掘り出す。放置すると永久に動けない
    if (this.escapeIfBuried()) return;

    // 2. 誰かが自分の立っている場所を埋めたがっている。どく。
    //    **どいている間は自分の移動指示を出さない。**
    //    出すと、どく動きがその場で打ち消されて一歩も動けない。
    if (isEvacuating(this.name)) {
      this.evacuate();
      // どいている時間は「諦めるまでの時間」に数えない。
      // 自分の都合で止まっているわけではないため
      this.deadline += WORK_INTERVAL;
      return;
    }
    this.evacGoal = undefined;
    this.evacTicks = 0;
    this.pillared = false;

    // ---- ここから通常の作業 ----

    if (this.index >= this.targets.length) {
      const done = this.targets.length;
      const cb = this.onDone;
      this.stop(true);
      void done;
      cb?.();
      return;
    }

    const column = this.targets[this.index]!;

    // **担当は1マスではなく縦3マスの列**（spec 3-3）。
    // 次に埋めるべき高さは毎 tick 数え直す。
    // 100体規模だと、向かっている途中に他のボットが埋めることがある
    const fillY = fillYOf(this.dimension, column.x, column.z);
    if (fillY === undefined) {
      // 読めない列は飛ばす
      this.next();
      return;
    }
    if (fillY === null) {
      // 列が埋まりきった。この担当は完了
      this.skipped++;
      this.next();
      return;
    }

    const target: Target = { x: column.x, y: fillY, z: column.z };

    // **10 秒掛かっても埋められないマスは諦める。**
    // 経路は壊してよいので「到達不可能」は無いが、
    // それでも進まないまま張り付くことはある
    if (system.currentTick > this.deadline) {
      this.giveUp++;
      defer(target, DEFER_TICKS);
      this.next();
      return;
    }

    // 置きたい場所に**他のボット**が立っている。
    // 対象はボットだけ。人は `botStandingAt` の対象外なので殴らない。
    const blocker = botStandingAt(target, this.name);
    if (blocker) {
      const p = this.bot.location;
      const q = blocker.bot.location;
      const reach = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);

      // **届くならぶん殴ってどかす**（spec 3-A-3）。
      // ノックバックは無敵時間に縛られないので、実際にその場から飛ぶ。
      // どく前提で次へ行かず、このマスに留まって空くのを待つ。
      // 空かないまま粘っても、諦める期限（3-9-1）で切れる
      if (reach <= BRAWL_REACH) {
        // **ブロックに埋まっている個体は、掘ってでも掘り出してから殴る。**
        // 埋まったままだと吹き飛ばしても動けず、その列が永久に空かない
        this.freeBuried(blocker.bot);
        punch(this.bot, blocker.bot);
        this.punched++;
        return;
      }

      // 届かないなら口で言う。そのうえで自分は次のマスへ行く。
      // 待って見張るより、その間に別のマスを埋めた方が早い
      requestEvacuate(blocker.name, this.awayFrom(target), EVACUATE_TICKS);
      // **このマスを少しの間だけ保留にする。**
      // これが無いと次の走査でまた同じマスが最優先で選ばれ、
      // 頼んでは飛ばすを繰り返して一歩も進まない
      defer(target, DEFER_TICKS);
      this.skipped++;
      this.next();
      return;
    }

    if (this.phase === "move") this.doMove(target);
    else this.doPlace(target);
  }

  /**
   * 対象の近くまで歩く。
   *
   * **目標を「穴の中」にしない。** 穴の中は空気で立てないため、
   * 経路探索が必ず失敗する（実測: isFullPath=false）。
   * 代わりに**穴の縁（地表の高さ）**を目指す。
   * そこまで行ければ、足元に向かってブロックを置ける。
   */
  private doMove(target: Target): void {
    const pos = this.bot.location;
    const dist = horizontalDistance({ x: pos.x, y: pos.y, z: pos.z }, target);

    // 置ける距離まで来たら移動を止める
    if (dist <= 3.5) {
      this.phase = "place";
      this.waited = 0;
      this.bot.stopMoving();
      return;
    }

    // **1マスずつ指示する。**
    // 遠くを一度に指示すると、経路を引き直すたびに歩き出せず揺れる。
    // 隣の1マスなら経路はほぼ必ず見つかり、着けば次の1マスへ進む。
    const step = this.nextStep(target);
    const goalKey = `${Math.floor(step.x)},${Math.floor(step.z)}`;
    if (goalKey !== this.navGoal || this.stuck > 0) {
      this.navGoal = goalKey;
      // navigate が経路を持たない地形では moveToLocation の方が確実に近づく。
      // SimulatedPlayer は相対座標を取るので、必ず変換してから渡す
      const rel = toRelative(step);
      const result = this.bot.navigateToLocation(rel);
      if (!result?.isFullPath) {
        this.bot.moveToLocation(rel);
      }
    }

    this.waited += WORK_INTERVAL;

    // 進んでいないなら詰まっている。
    // まずジャンプ、それでも駄目なら進路を掘って抜ける（掘ってよい方針）
    if (this.lastDist !== undefined && dist > this.lastDist - 0.1) {
      this.stuck += 1;

      if (this.stuck === 3 && this.bot.isOnGround) {
        this.bot.jump();
        this.jumped++;
      } else if (this.stuck >= 6) {
        this.digToward(target);
        this.stuck = 0;
      }
    } else {
      this.stuck = 0;
    }
    this.lastDist = dist;

    // **諦めない。**
    // 進路は掘ってよい方針なので、到達できない条件は無い。
    // ただし長く掛かりすぎたら、掘る頻度を上げて強引に進む
    if (this.waited >= MOVE_TIMEOUT_TICKS) {
      this.digToward(target);
      this.waited = Math.floor(MOVE_TIMEOUT_TICKS / 2);
      this.persisted++;
      // 手こずっていることは黙って掘り進む（チャットに出さない）
    }
  }

  /**
   * 目標へ向かう**次の1マス**を求める。
   *
   * x/z それぞれ1マスずつ寄せる（斜めも許す）。
   * 遠くを一度に指示しないためのもの。
   */
  private nextStep(target: Target): Vector3 {
    const p = this.bot.location;
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    const nx = cx + Math.sign(target.x - cx);
    const nz = cz + Math.sign(target.z - cz);
    return this.walkableAt(nx, nz, p.y);
  }

  /**
   * その (x,z) で、実際に立てる高さを求める。
   *
   * 穴の中は空気なので立てない。**その列の一番上のブロックの上**を狙う。
   * 取れなければ `fallbackY` をそのまま使う。
   */
  private walkableAt(x: number, z: number, fallbackY: number): Vector3 {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const fillY = fillYOf(this.dimension, bx, bz);

    // 埋める場所が残っている列は、そこが立てる高さ。
    // 全部埋まっている列は地表の1つ上に立てる
    if (fillY !== undefined) return { x: bx + 0.5, y: fillY ?? GROUND_Y + 1, z: bz + 0.5 };

    // 読めない列は呼び出し側の高さで代用する
    return { x: bx + 0.5, y: fallbackY, z: bz + 0.5 };
  }

  /**
   * 対象のマスにブロックを置く。
   *
   * **`useItemOnBlock` の第2引数は「クリックする既存ブロック」**であって、
   * 置きたい空間ではない。空気を指定しても何も起きない。
   *
   * そこで対象の**真下にある既存ブロック**を探し、その上面（Up）に置く。
   * 真下が空気なら、さらに下へ最大3マス探す。
   */
  private doPlace(target: Target): void {
    // 自分の真下（または体と重なる位置）は、
    // **ジャンプして浮いている間に置く**。プレイヤーが柱を立てるのと同じ。
    if (this.wouldBurySelf(target)) {
      this.placeUnderSelf(target);
      return;
    }

    const support = this.findSupport(target);
    if (!support) {
      // 足場が見つからない。ここは埋められないので保留にして次へ
      this.noSupport++;
      defer(target, DEFER_TICKS);
      this.next();
      return;
    }

    // Creative でも手に持っていないと置けない
    // **置く前に毎回持ち直す**。残数を数えず、毎回入れ直せば必ず足りる
    this.bot.setItem(new ItemStack(FILL_ITEM, 64), FILL_SLOT, true);
    // 設置と視線も相対座標
    const relSupport = toRelative(support);
    this.bot.lookAtBlock(relSupport);

    try {
      // support の上面に置く → target の位置が埋まる
      this.bot.useItemOnBlock(new ItemStack(FILL_ITEM, 1), relSupport, Direction.Up);
    } catch (e) {
      void e;
      this.failed++;
      defer(target, DEFER_TICKS);
      this.next();
      return;
    }

    // **本当に置けたかを確かめる。**
    // useItemOnBlock は失敗しても例外を投げないことがあり、
    // 数えるだけだと「置けていないのに成功」になる。
    // 設置は即時反映されないので、次の tick で確認する
    this.pendingCheck = { ...target };
    this.next();
  }

  /** 直前の設置が実際に反映されたかを確かめる */
  private verifyPending(): void {
    const t = this.pendingCheck;
    if (!t) return;
    this.pendingCheck = undefined;

    try {
      const block = this.dimension.getBlock(t);
      if (block && !block.isAir) {
        this.placed++;
        // 埋めた列は次の高さが変わる。捨てて読み直させる
        invalidate(t.x, t.z);
        return;
      }
    } catch {
      // 読めない場所も失敗として扱う
    }

    // **置けなかったマスは少しの間だけ候補から外す。**
    // 優先順位は低い順なので、外さないと次の走査でまた同じマスが選ばれ、
    // 置けないマスを延々と狙い続けて手が止まる。
    this.failed++;
    defer(t, DEFER_TICKS);
  }

  /**
   * そのマスを諦める時刻を決める。
   *
   * **固定の制限時間にしてはいけない。**
   * 他のボットが見つけた遠くの場所へ向かうことがあり、
   * 固定だと着く前に必ず諦めてしまう。移動にかかる分を足す。
   */
  private deadlineFor(target: Target | undefined): number {
    const base = system.currentTick + PLACE_TIMEOUT_TICKS;
    if (!target) return base;

    const p = this.bot.location;
    const dist = horizontalDistance({ x: p.x, y: p.y, z: p.z }, target);
    return base + Math.ceil(dist * TRAVEL_TICKS_PER_BLOCK);
  }

  /**
   * ブロックに埋まっている相手を掘り出す。
   *
   * 埋まったままの相手は、殴って吹き飛ばしても動けない。
   * その列が永久に空かなくなるので、**整地対象のマスであっても掘る**。
   *
   * 掘るのは相手の体が占める2マス（足元と頭）だけ。
   * 自分に隣接していなければ届かないので何もしない。
   */
  private freeBuried(other: SimulatedPlayer): void {
    const q = other.location;
    const x = Math.floor(q.x);
    const z = Math.floor(q.z);
    const feet = Math.floor(q.y);

    for (const y of [feet, feet + 1]) {
      const at: Target = { x, y, z };
      if (this.isAir(at)) continue;
      // 相手の足場を守る判定は通さない。ここでは掘り出すのが目的
      this.tryDig(at, true);
    }
  }

  /**
   * そのマスを掘る。  /**
   * そのマスを掘る。
   *
   * **掘ってよいのは自分の真上下左右だけ。**
   * 離れた場所を壊すと、他のボットの足場や作りかけの地面まで崩れる。
   *
   * **斜めは掘らない。** x と z の両方がずれているマスは対象外。
   * 斜めまで許すと、通る必要のない角まで削って地形が荒れる。
   *
   * @returns 掘ったら true
   */
  private tryDig(at: Target, force = false): boolean {
    const p = this.bot.location;
    const feet = Math.floor(p.y);

    // 隣接判定: x/z のずれの合計が1以内。
    // 0 なら自分の足元、1 なら真横。2 になるのは斜めだけなので弾かれる
    const dx = Math.abs(at.x - Math.floor(p.x));
    const dz = Math.abs(at.z - Math.floor(p.z));
    if (dx + dz > 1) return false;
    if (at.y < feet || at.y > feet + 1) return false;

    try {
      const block = this.dimension.getBlock(at);
      if (!block || block.isAir) return false;
      // 岩盤は掘れないので触らない
      if (block.typeId === "minecraft:bedrock") return false;
      // 他のボットの足場を崩さない。
      // ただし埋まった相手を掘り出すときだけは例外（`force`）
      if (!force && botStandingAt({ x: at.x, y: at.y - 1, z: at.z }, this.name)) return false;

      // **掘る前に道具を持ち直す**（spec 3-7）。
      // サバイバルでは素手だと遅すぎて、脱出が間に合わない
      this.bot.setItem(new ItemStack(DIG_TOOL, 1), DIG_SLOT, true);
      this.bot.breakBlock(toRelative(at));
      // 掘った後の高さは分からないので、共有記録は捨てて読み直させる
      invalidate(at.x, at.z);
      this.dug++;
      return true;
    } catch {
      // 掘れなければ次の tick で再挑戦する
      return false;
    }
  }

  /**
   * 自分が埋まっていたら掘り出す。
   *
   * 足元や頭がブロックで塞がれると動けなくなる。
   * **経路は壊してよい**方針なので、その場を掘って復帰する。
   *
   * @returns 掘り出した（＝この tick は他のことをしない）なら true
   */
  private escapeIfBuried(): boolean {
    const p = this.bot.location;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const feet = Math.floor(p.y);

    let escaped = false;
    for (const y of [feet, feet + 1]) {
      if (this.tryDig({ x, y, z })) {
        this.buried++;
        escaped = true;
      }
    }
    return escaped;
  }

  /** そのマスが空気か。読めない場合は false（触らない） */
  private isAir(at: Target): boolean {
    try {
      const block = this.dimension.getBlock(at);
      return block !== undefined && block.isAir;
    } catch {
      return false;
    }
  }

  /**
   * どく先を決める。
   *
   * 相手はそのマスの上に立っているので「相手から離れる向き」が作れない。
   * そこでマスの座標から**決まった向き**を作る。
   * 毎回同じ向きになるので、指示が揺れない。
   */
  private awayFrom(target: Target): Vector3 {
    const angle = ((target.x * 7 + target.z * 13) % 360) * (Math.PI / 180);
    return {
      x: target.x + 0.5 + Math.cos(angle) * EVACUATE_DISTANCE,
      y: target.y,
      z: target.z + 0.5 + Math.sin(angle) * EVACUATE_DISTANCE,
    };
  }

  /**
   * その場からどく。
   *
   * 誰かが自分の立っている場所を埋めようとしているときに呼ばれる。
   * **行き先は依頼側が決めて持たせてある**ので、ここでは計算し直さない。
   * 計算し直すと毎 tick 行き先が変わり、その場で揺れるだけになる。
   *
   * 歩いて逃げられないこともある（四方を囲まれている等）。
   * その場合は**下にブロックを積んで上へ逃げる**。
   * 1マス上がれば、相手が埋めたいマスからは抜けられる。
   */
  private evacuate(): void {
    this.evacTicks += WORK_INTERVAL;

    // しばらく歩いても抜けられないなら、上へ逃げる。
    // **1段だけ。** 何段も積むと塔になってしまう
    if (this.evacTicks >= EVACUATE_PILLAR_AFTER) {
      if (!this.pillared) this.pillarUp();
      return;
    }

    const to = evacDestination(this.name);
    if (!to) return;

    // 同じ行き先へ何度も出し直さない
    const key = `${Math.floor(to.x)},${Math.floor(to.z)}`;
    if (key === this.evacGoal) return;
    this.evacGoal = key;

    try {
      const rel = toRelative(this.walkableAt(to.x, to.z, to.y));
      const result = this.bot.navigateToLocation(rel);
      if (!result?.isFullPath) this.bot.moveToLocation(rel);
    } catch {
      // 動けなければ次の tick で再挑戦する
    }
  }

  /**
   * 自分の足元にブロックを積んで、1マス上がる。
   *
   * どくために使う。歩いて逃げられなくても、上へは抜けられる。
   * 仕組みは `placeUnderSelf` と同じ（ジャンプして浮いている間に置く）。
   */
  private pillarUp(): void {
    const p = this.bot.location;
    const under: Target = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    this.placeUnderSelf(under, false);
    // ジャンプ待ちが終わって実際に置きにいったら、この退避ではもう積まない
    if (this.pendingCheck) this.pillared = true;
  }

  /**
   * 目標の方向にある邪魔なブロックを掘る。
   *
   * ジャンプでも進めないときの脱出手段。
   * 足元と頭の高さの2つが空けば通れる。
   *
   * **斜めには掘らない。** ずれの大きい方の軸だけを1マス進む。
   * 両方の軸を同時に動かすと斜めのマスを指してしまい、`tryDig` に弾かれて
   * 何も掘れないまま詰まる。
   */
  private digToward(target: Target): void {
    const p = this.bot.location;
    const dx = target.x + 0.5 - p.x;
    const dz = target.z + 0.5 - p.z;
    if (Math.hypot(dx, dz) < 0.01) return;

    // ずれの大きい方の軸だけを動かす
    const useX = Math.abs(dx) >= Math.abs(dz);
    const nx = Math.floor(p.x) + (useX ? Math.sign(dx) : 0);
    const nz = Math.floor(p.z) + (useX ? 0 : Math.sign(dz));
    const feet = Math.floor(p.y);

    for (const y of [feet, feet + 1]) {
      this.tryDig({ x: nx, y, z: nz });
    }
  }

  /**
   * 自分の足元にブロックを置く。
   *
   * 立っている場所は自分の体が邪魔で置けないので、
   * **ジャンプして浮いている間に置く**（プレイヤーが柱を立てるのと同じ）。
   *
   * ジャンプ→着地までは数 tick かかるので、
   * 「ジャンプした」「置く」を tick をまたいで行う。
   */
  private placeUnderSelf(target: Target, advance = true): void {
    if (!this.jumpedForPlace) {
      if (!this.bot.isOnGround) return; // 着地を待つ
      this.bot.jump();
      this.jumped++;
      this.jumpedForPlace = true;
      this.jumpWaited = 0;
      return;
    }

    this.jumpWaited += WORK_INTERVAL;

    // **体がそのマスから抜けるまで待つ。**
    // 抜ける前に置こうとしても、自分の当たり判定に阻まれて設置できない。
    // 「ジャンプしてから N tick 後」と決め打ちすると
    // WORK_INTERVAL を変えたときに壊れるので、実際の高さで判定する。
    if (Math.floor(this.bot.location.y) <= target.y) {
      // 落ち始めても抜けられていない＝跳べていない。跳び直す
      if (this.jumpWaited >= 20) {
        this.jumpedForPlace = false;
        this.jumpWaited = 0;
      }
      return;
    }

    // **置く直前にもう一度確かめる。**
    // ジャンプしている間に他のボットが埋めることがある。
    // そのまま置くと、その上に積んでしまって地面が高くなる。
    // 脱出・退避で積む経路は tickInner 冒頭の確認を通らないので、ここでも見る
    try {
      const block = this.dimension.getBlock(target);
      if (block && !block.isAir) {
        this.jumpedForPlace = false;
        if (advance) {
          this.skipped++;
          this.next();
        }
        return;
      }
    } catch {
      // 読めなければ置かない。次の tick で見直す
      this.jumpedForPlace = false;
      return;
    }

    // 浮いている間に足元へ置く
    const support = this.findSupport(target);
    this.jumpedForPlace = false;

    if (!support) {
      this.noSupport++;
      if (advance) {
        defer(target, DEFER_TICKS);
        this.next();
      }
      return;
    }

    // **置く前に毎回持ち直す**。残数を数えず、毎回入れ直せば必ず足りる
    this.bot.setItem(new ItemStack(FILL_ITEM, 64), FILL_SLOT, true);
    const relSupport = toRelative(support);
    this.bot.lookAtBlock(relSupport);

    try {
      this.bot.useItemOnBlock(new ItemStack(FILL_ITEM, 1), relSupport, Direction.Up);
    } catch {
      this.failed++;
      if (advance) {
        defer(target, DEFER_TICKS);
        this.next();
      }
      return;
    }

    // どくために積んだ場合は、今のマスを続ける（次へは進まない）
    this.pendingCheck = { ...target };
    if (advance) this.next();
  }

  /**
   * その座標がボット自身の体と重なるかを判定する。
   *
   * 自分の足元や立っている場所を埋めると**埋没して動けなくなる**。
   * プレイヤーは足元1マス + 頭の1マスを占めるので、その範囲を避ける。
   */
  private wouldBurySelf(target: Target): boolean {
    const p = this.bot.location;
    if (target.x !== Math.floor(p.x) || target.z !== Math.floor(p.z)) return false;

    const feet = Math.floor(p.y);
    return target.y >= feet - 1 && target.y <= feet + 1;
  }

  /**
   * 対象の下にある「置く足がかりになるブロック」を探す。
   *
   * @returns 見つかった既存ブロックの座標。無ければ undefined
   */
  private findSupport(target: Target): Vector3 | undefined {
    for (let dy = 1; dy <= 4; dy++) {
      const at = { x: target.x, y: target.y - dy, z: target.z };
      try {
        const block = this.dimension.getBlock(at);
        if (block && !block.isAir) return at;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private next(): void {
    // 済んだマスの予約は解放する
    const done = this.targets[this.index];
    if (done) release(done, this.name);

    this.index++;
    this.phase = "move";
    this.waited = 0;
    this.stuck = 0;
    this.lastDist = undefined;
    this.jumpedForPlace = false;
    this.jumpWaited = 0;
    this.navGoal = undefined;
    this.deadline = this.deadlineFor(this.targets[this.index]);

    // 進捗を時々知らせる
    void 0;
  }
}
