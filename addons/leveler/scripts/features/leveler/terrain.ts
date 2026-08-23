/**
 * 地形の走査結果を、全ボットで共有する。
 *
 * ## なぜ要るか
 *
 * 各ボットは自分の周りを毎回走査する。範囲は重なっているので、
 * **100体いれば同じ列を 100 回読むことになる**。
 * 半径16なら 1089 列 × 100体 = 10万回/走査 になり、無視できない。
 *
 * 読んだ結果をここに置いて使い回す。
 *
 * ## `getTopmostBlock` を使ってはいけない
 *
 * **一番上のブロックを見るやり方は間違い**（2026-08-22 に実際に嵌まった）。
 * `getTopmostBlock` はその列の**最も高い**ブロックを返すので、
 * 空中にブロックが1つ浮いているだけで
 * 「この列は埋まっている」と判定してしまう。
 * 足元の -63 が穴でも、上に何かあれば見逃す。
 *
 * そこで**対象の高さ（`BEDROCK_Y+1` 〜 `GROUND_Y`）だけを下から見て、
 * 最初に見つかった空気の高さ**を覚える。上に何があろうと関係ない。
 *
 * ## 鮮度をどう保つか
 *
 * 地形はボット自身が変えるので、放っておくと嘘になる。
 *
 *   - **埋めた／掘った** → `invalidate()` で捨てて読み直させる
 *   - **それ以外**       → `TERRAIN_TTL` で期限切れ（人が地形を変える場合の保険）
 *
 * 多少古くても致命的にはならない。
 * 実際に埋める直前に `getBlock().isAir` で必ず確かめているため、
 * 古い情報で選んでしまっても「飛ばして次へ」で済む。
 */
import { system, type Dimension } from "@minecraft/server";

import {
  BEDROCK_Y,
  GROUND_Y,
  SHARED_SCAN_LIMIT,
  TERRAIN_CACHE_LIMIT,
  TERRAIN_TTL,
} from "./config.js";

/**
 * その列で**次に埋めるべき高さ**と、記録した tick。
 * `fillY` が null なら、対象の高さは全部埋まっている。
 */
type Entry = { fillY: number | null; at: number };

const cache = new Map<string, Entry>();

/**
 * **埋める場所が残っている列だけ**を集めたもの。
 *
 * これが「仕事の在りか」の共有メモリ。
 * 自分の周りに何も無いボットは、ここを見て他のボットが見つけた場所へ向かう。
 * `cache` を全部なめると 2 万件になるので、必要なものだけ別に持つ。
 */
const jobs = new Map<string, { x: number; z: number; y: number }>();

function columnKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * その列で次に埋めるべき高さを返す。
 *
 * 共有キャッシュにあればそれを使い、無ければ読んで記録する。
 *
 * @returns 埋めるべき高さ。埋める場所が無ければ null。読めなければ undefined
 */
export function fillYOf(dimension: Dimension, x: number, z: number): number | null | undefined {
  const key = columnKey(x, z);
  const now = system.currentTick;

  const hit = cache.get(key);
  if (hit && now - hit.at < TERRAIN_TTL) return hit.fillY;

  let fillY: number | null = null;
  try {
    // **下から見て、最初の空気**。上に何があっても関係ない
    for (let y = BEDROCK_Y + 1; y <= GROUND_Y; y++) {
      const block = dimension.getBlock({ x, y, z });
      if (!block) return undefined;
      if (block.isAir) {
        fillY = y;
        break;
      }
    }
  } catch {
    // 読めない列は覚えない。次の機会に読み直す
    return undefined;
  }

  remember(key, x, z, fillY, now);
  return fillY;
}

function remember(key: string, x: number, z: number, fillY: number | null, now: number): void {
  // 際限なく増えないよう、時々まとめて掃除する
  if (cache.size >= TERRAIN_CACHE_LIMIT) {
    for (const [k, e] of cache) {
      if (now - e.at >= TERRAIN_TTL) {
        cache.delete(k);
        jobs.delete(k);
      }
    }
    // 掃除しても減らないなら、全部捨てて作り直す。
    // 少しずつ消すより、まとめて捨てた方が偏りが出ない
    if (cache.size >= TERRAIN_CACHE_LIMIT) {
      cache.clear();
      jobs.clear();
    }
  }

  cache.set(key, { fillY, at: now });
  if (fillY === null) jobs.delete(key);
  else jobs.set(key, { x, z, y: fillY });
}

/**
 * その列の記録を捨てる。
 *
 * 埋めたあと・掘ったあとに呼ぶ。
 * **新しい高さは分からない**ので、上げ下げせずに捨てて読み直させる。
 * 対象の高さは3段しかないので、読み直しても安い。
 */
export function invalidate(x: number, z: number): void {
  const key = columnKey(x, z);
  cache.delete(key);
  jobs.delete(key);
}

/**
 * 他のボットが見つけた「まだ埋まっていない場所」を分けてもらう。
 *
 * 自分の周りに仕事が無いボットが使う。
 * これが無いと、近くを埋め終えたボットはただ止まってしまう。
 *
 * @param limit 返す件数の上限。多いと呼び出し側の選別が重くなる
 */
export function sharedJobs(limit: number): { x: number; z: number; y: number }[] {
  const out: { x: number; z: number; y: number }[] = [];

  // **先頭から順に取ってはいけない。**
  // Map は挿入順に回るので、毎回同じ古い列ばかり返すことになる。
  // それが予約済みや保留中だと、他に何千件あっても毎回空振りする（実際そうなっていた）。
  // 全体から**ランダムに抜き取る**（reservoir sampling）。
  let seen = 0;
  for (const job of jobs.values()) {
    seen++;
    if (out.length < limit) {
      out.push(job);
      continue;
    }
    // 以降は確率 limit/seen で既存の1件と入れ替える。
    // これで全件が等確率で選ばれる
    const i = Math.floor(Math.random() * seen);
    if (i < limit) out[i] = job;

    // 数が多いときに全部なめると重い。途中で切る
    if (seen >= SHARED_SCAN_LIMIT) break;
  }

  return out;
}

/** 記録している列の数。`/level:status` 用 */
export function cachedColumns(): number {
  return cache.size;
}

/** 共有している「まだ埋まっていない列」の数。`/level:status` 用 */
export function knownJobs(): number {
  return jobs.size;
}
