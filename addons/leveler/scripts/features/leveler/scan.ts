/**
 * 地形の走査。
 *
 * ボット自身に探らせるのではなく、**Script API で直接地形を読む**。
 * 読んだ結果は `terrain.ts` の共有キャッシュに入り、全ボットで使い回す。
 *
 * 広い範囲を1 tick で走査すると watchdog に落とされるため、
 * ジェネレータにして `system.runJob` で分割する。
 *
 * > **ジェネレータの中で例外を外へ逃がしてはいけない。**
 * > 途中で死ぬと `onDone` が呼ばれず、呼び出し側は「探索中」のまま固まる。
 * > そのボットは二度と動かなくなる（2026-08-22 に実際に発生）。
 */
import type { Dimension, Vector3 } from "@minecraft/server";

import {
  BEDROCK_Y,
  CANDIDATE_LIMIT,
  GROUND_Y,
  RAY_COUNT,
  RAY_LENGTH,
  SCAN_CHUNK,
  SHARED_JOB_LIMIT,
} from "./config.js";
import {
  computeTargets,
  pickWeightedByNearness,
  scanArea,
  type Column,
  type Target,
} from "./logic.js";
import { isClaimedByOther, isDeferred } from "./registry.js";
import { fillYOf, sharedJobs } from "./terrain.js";

export type ScanResult = { columns: number; targets: Target[] };

/**
 * 指定範囲を走査して、埋めるべき座標を洗い出す。
 *
 * `/level:scan` 用。自動整地は `findNearestJob` を使う。
 */
export function* scanJob(
  dimension: Dimension,
  centerX: number,
  centerZ: number,
  radius: number,
  onDone: (result: ScanResult) => void
): Generator<void, void, void> {
  const cells = scanArea(centerX, centerZ, radius);
  const columns: Column[] = [];

  let processed = 0;
  for (const cell of cells) {
    processed++;

    try {
      // 未読み込みのチャンクは触らない。触ると例外が飛ぶ
      if (dimension.isChunkLoaded({ x: cell.x, y: GROUND_Y, z: cell.z })) {
        const fillY = fillYOf(dimension, cell.x, cell.z);
        // computeTargets は「一番上のブロック」を起点に積むので、
        // 埋めるべき高さの1つ下を渡す
        if (fillY !== undefined && fillY !== null) {
          columns.push({ x: cell.x, z: cell.z, top: fillY - 1 });
        }
      }
    } catch {
      // 読めない列は飛ばす。1つの失敗で全体を止めない
    }

    // 一定数ごとに1 tick 空ける（watchdog 対策）
    if (processed % SCAN_CHUNK === 0) yield;
  }

  onDone({
    columns: columns.length,
    targets: computeTargets(columns, GROUND_Y, BEDROCK_Y),
  });
}

/**
 * 候補を溜めて、そこから1つ選ぶための入れ物。
 *
 * 「いちばん低い高さのマスだけを候補に残す」という規則を1箇所にまとめる。
 * 四角い走査・線の走査・共有分の3箇所で同じ規則を使うため。
 */
class Candidates {
  /** 今まででいちばん良い順位。小さいほど良い */
  private bestRank = Infinity;
  private readonly list: Target[] = [];

  /**
   * 候補の順位（spec 3-3）。**小さいほど良い。**
   *
   *   最下層の空き > 最下層の相乗り > 次の層の空き > 次の層の相乗り > ...
   *
   * **高さが先、同じ高さの中で空きが先。**
   * 高さを2倍して相乗りぶんを1足すと、この順序がそのまま数値になる。
   *
   *   y=-63 空き → -126   y=-63 相乗り → -125
   *   y=-62 空き → -124   y=-62 相乗り → -123
   */
  private static rankOf(y: number, contested: boolean): number {
    return y * 2 + (contested ? 1 : 0);
  }

  /** いちばん良い順位。これが取れたら走査を打ち切ってよい */
  private static readonly BEST = Candidates.rankOf(BEDROCK_Y + 1, false);

  /**
   * 候補として差し出す。
   *
   * @param contested 他のボットが既に狙っている列か
   * @returns もう十分集まったなら true（走査を打ち切ってよい）
   */
  offer(at: Target, contested: boolean): boolean {
    const rank = Candidates.rankOf(at.y, contested);

    // より良い順位が出たら、それまでの候補は全部捨てる
    if (rank < this.bestRank) {
      this.bestRank = rank;
      this.list.length = 0;
    } else if (rank > this.bestRank) {
      // 劣る候補は覚えない
      return false;
    }

    if (this.list.length < CANDIDATE_LIMIT) this.list.push(at);

    // これより良い順位は存在しない。全部見ても結果は変わらない
    return this.bestRank === Candidates.BEST && this.list.length >= CANDIDATE_LIMIT;
  }

  /** 同順位の中から、近いほど選ばれやすい抽選で1つ選ぶ */
  pick(from: { x: number; z: number }): Target | undefined {
    return pickWeightedByNearness(this.list, from, Math.random());
  }

  get size(): number {
    return this.list.length;
  }
}

/**
 * その列が候補になるか調べ、なるなら `Candidates` に入れる。
 *
 * @returns 走査を打ち切ってよいなら true
 */
function offerColumn(
  dimension: Dimension,
  x: number,
  z: number,
  self: string,
  out: Candidates
): boolean {
  try {
    if (!dimension.isChunkLoaded({ x, y: GROUND_Y, z })) return false;

    const fillY = fillYOf(dimension, x, z);
    if (fillY === undefined || fillY === null) return false;

    const at: Target = { x, y: fillY, z };

    // 保留中の列（誰かに「どいて」と頼んだ／埋められなかった）は候補にしない
    if (isDeferred(at)) return false;

    // **他のボットが狙っている列も候補にする。**
    // ただし同じ高さなら空いている列が優先（順位付けは `Candidates` 側）
    return out.offer(at, isClaimedByOther(at, self));
  } catch {
    // 読めない列は飛ばす
    return false;
  }
}

/**
 * 近くを四角く走査して、次に埋めるべき1マスを探す。
 *
 * ## 優先順位（spec 3-3）
 *
 *   1. **低いところが最優先**（深い穴から埋める）
 *   2. 同じ高さなら**近いほど選ばれやすい抽選**
 *
 * 2 を「一番近いマス」にすると、複数体が同じ場所に集まる。
 * 抽選にすると近くを優先しつつ自然に散る。
 */
export function* findNearestJob(
  dimension: Dimension,
  from: Vector3,
  radius: number,
  self: string,
  onDone: (target: Target | undefined) => void
): Generator<void, void, void> {
  const cx = Math.floor(from.x);
  const cz = Math.floor(from.z);
  const cells = scanArea(cx, cz, radius);
  const out = new Candidates();

  let processed = 0;
  for (const cell of cells) {
    processed++;
    if (offerColumn(dimension, cell.x, cell.z, self, out)) break;
    if (processed % SCAN_CHUNK === 0) yield;
  }

  onDone(out.pick({ x: cx, z: cz }));
}

/**
 * 遠くを**線で**探す。
 *
 * 四角く走査すると半径 r で (2r+1)^2 列になり、遠くは現実的でない
 * （半径128 なら 66049 列）。
 * **ランダムな角度へ線を数本飛ばして拾い読みする**方がはるかに安い
 * （8本 × 256 = 2048 サンプル）。
 *
 * 隙間だらけの探し方だが、角度が毎回ランダムなので
 * **何度も試すうちに周囲がまんべんなく当たる**。
 *
 * > シミュレーション距離の外はチャンクが読み込まれていないので何も見えない。
 * > ただし**チャンクは各プレイヤーの周りに読み込まれ、
 * > SimulatedPlayer もプレイヤーとして数えられる**ので、
 * > 他のボットがいる方向へ伸ばした線は当たる。
 * > 外れた分は `isChunkLoaded` で弾かれるだけなので、長くしても損はしない。
 *
 * 読んだ結果は共有キャッシュに入るので、
 * **他のボットも同じ場所を見つけられるようになる**（`findSharedJob`）。
 */
export function* findByRaysJob(
  dimension: Dimension,
  from: Vector3,
  self: string,
  onDone: (target: Target | undefined) => void
): Generator<void, void, void> {
  const cx = Math.floor(from.x);
  const cz = Math.floor(from.z);
  const out = new Candidates();

  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);

    let lastX = cx;
    let lastZ = cz;
    let enough = false;

    for (let d = 1; d <= RAY_LENGTH; d++) {
      const x = Math.floor(cx + dx * d);
      const z = Math.floor(cz + dz * d);
      // 同じマスを続けて見ない（斜めだと同じマスに何度も当たる）
      if (x === lastX && z === lastZ) continue;
      lastX = x;
      lastZ = z;

      if (offerColumn(dimension, x, z, self, out)) {
        enough = true;
        break;
      }

      if (d % SCAN_CHUNK === 0) yield;
    }

    if (enough) break;
    yield;
  }

  onDone(out.pick({ x: cx, z: cz }));
}

/**
 * **他のボットが見つけた場所**から1つもらう。
 *
 * 世界を読まないので、走査に比べてほぼ無料。
 * 自分の周りに仕事が無いとき、遠くを走査する前にここを見る。
 *
 * ジェネレータではない（世界を読まないので分割する必要がない）。
 */
export function findSharedJob(from: Vector3, self: string): Target | undefined {
  const cx = Math.floor(from.x);
  const cz = Math.floor(from.z);
  const out = new Candidates();

  for (const job of sharedJobs(SHARED_JOB_LIMIT)) {
    const at: Target = { x: job.x, y: job.y, z: job.z };
    if (isDeferred(at)) continue;
    if (out.offer(at, isClaimedByOther(at, self))) break;
  }

  return out.size === 0 ? undefined : out.pick({ x: cx, z: cz });
}
