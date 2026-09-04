/**
 * 矢を飛ばす。**自前の弾。**
 *
 * **バニラの矢は使わない**——当たり方も見え方も、こちらで決めたいため。
 *
 * ```
 * 撃つ ──▶ 弾を 1 つ作る
 *            └ 毎 tick、SPEED マスぶんの「区間」を進む
 *                 ├ その区間に敵が居れば、いちばん手前に当たる
 *                 ├ 壁が手前にあれば、そこで消える
 *                 └ どちらも無ければ、軌跡の粒を置いて進む
 * ```
 *
 * ## 点ではなく区間で見る
 *
 * 1 tick に **4 マス**進むので、**点で当たり判定をすると隙間を抜ける。**
 * **線分と相手の距離**で見る（`alongSegment`）。
 *
 * ## v2 から持ってきたもの
 *
 * **札（エンチャント）に関わる部分は全部落とした**——
 * マルチショット・貫通・反射・追尾・連鎖・業火・恵みの雨。
 * **残したのは「飛ぶ・当たる・壁で止まる・軌跡を出す」だけ。**
 */

import { Player, type Dimension, type Entity, type Vector3 } from "@minecraft/server";

import { distanceAlong, norm, pointAt, type HitShape } from "../../core/geometry.js";
import { BOW_HIT, buildShot } from "../../services/attack.js";
import { critFx } from "../../services/fx.js";
import { has } from "../../state/hp.js";
import { hit } from "../../services/combat.js";

/** 弾の速さ（マス/tick）。**80 マス/秒** */
const SPEED = 4;

/** 届く距離（マス） */
const RANGE = 48;

/** 当たりとみなす太さ（半径・マス） */
const FAT = 0.9;

/** 当たり判定の形（足元からの高さ＝胴と頭、太さ） */
const SHAPE: HitShape = { fat: FAT, marks: [0.9, 1.6] };

/** 軌跡の粒 */
const TRAIL = "pve_v3:arrow_trail";

/** 粒を置く間隔（マス）。**空けすぎると点線に見える** */
const TRAIL_GAP = 0.7;

/** 壁を触って探すときの刻み（マス）。**細かいほど面に近づく** */
const PROBE_STEP = 0.25;

/** クリティカルの音。**その場ではなく、撃った本人に鳴らす** */
const CRIT_SOUND = "random.anvil_land";

/** 味方の的（当たらない） */
const ALLY = "pve_v3:ally";

/** 飛んでいる弾。**メモリだけ** */
interface Bullet {
  readonly by: Player;
  readonly dim: Dimension;
  readonly dir: Vector3;
  /** 撃った所。**距離を見るときの基準** */
  readonly from: Vector3;
  /** 撃った瞬間に動いていたか */
  readonly moving: boolean;
  at: Vector3;
  flown: number;
  readonly hitIds: Set<string>;
}

const bullets: Bullet[] = [];

/** 誰が、どの敵に、もう当てたか（初撃）。**メモリだけ** */
const touched = new Map<string, Set<string>>();

/** 味方か（矢が素通りする） */
function isAlly(e: Entity): boolean {
  try {
    return e instanceof Player || e.typeId === ALLY;
  } catch {
    return false;
  }
}

/** 壁までの距離 */
function wallWithin(dim: Dimension, from: Vector3, dir: Vector3, length: number): number | undefined {
  try {
    // **少し先まで見て、面までの距離で切る。**
    //
    // > `maxDistance` は**ブロック単位で切られる**ので、
    // > **面はこの区間の中なのに、見つからない壁**がある。
    // > 見落とすと弾はそのまま進み、**壁に埋まって次の tick で消える。**
    const shot = dim.getBlockFromRay(from, dir, { maxDistance: length + 2 });
    if (shot === undefined) return undefined;
    // **当たった面の点**まで測る。中心までだと**半マスぶん行き過ぎる**
    const b = shot.block.location;
    const f = shot.faceLocation;
    const at = Math.hypot(b.x + f.x - from.x, b.y + f.y - from.y, b.z + f.z - from.z);
    return at > length ? undefined : at;
  } catch {
    return undefined;
  }
}

function insideWall(dim: Dimension, at: Vector3): boolean {
  try {
    const block = dim.getBlock(at);
    if (block === undefined) return false;
    return !block.isAir && !block.isLiquid;
  } catch {
    // 読み込まれていない所は「壁ではない」——消してしまうより飛ばす
    return false;
  }
}

/**
 * **進んだ先が壁なら、手前へ戻して面を探す。**
 *
 * > ### レイだけに頼らない
 * >
 * > `getBlockFromRay` は**見落とすことがある**（区間の切り方・角の抜け）。
 * > 見落とすと弾は壁の中へ入り、**埋まるか、そのまま貫通する。**
 */
function wallByProbe(dim: Dimension, from: Vector3, dir: Vector3, length: number): number | undefined {
  if (!insideWall(dim, pointAt(from, dir, length))) return undefined;
  for (let t = length; t > 0; t -= PROBE_STEP) {
    if (!insideWall(dim, pointAt(from, dir, t))) return t;
  }
  return 0;
}

/** 通った跡に粒を置く */
function drawTrail(dim: Dimension, from: Vector3, dir: Vector3, length: number): void {
  for (let d = 0; d < length; d += TRAIL_GAP) {
    try {
      dim.spawnParticle(TRAIL, pointAt(from, dir, d));
    } catch {
      /* 読み込まれていない */
    }
  }
}

function isMoving(player: Player): boolean {
  try {
    const v = player.getVelocity();
    return Math.hypot(v.x, v.z) > 0.05;
  } catch {
    return false;
  }
}

/** 1 発撃つ */
export function shoot(player: Player): void {
  try {
    const at = player.getHeadLocation();
    const dir = norm(player.getViewDirection());
    bullets.push({
      by: player,
      dim: player.dimension,
      dir,
      from: at,
      moving: isMoving(player),
      at,
      flown: 0,
      hitIds: new Set<string>(),
    });
    // **音量は半分**——連射するので、既定のままだと耳に張り付く
    player.playSound("random.bow", { volume: 0.5, pitch: 1.1 + Math.random() * 0.1 });
  } catch {
    /* 消えている */
  }
}

/** 当たった */
function land(b: Bullet, target: Entity, distance: number, now: number, at: Vector3): void {
  const seen = touched.get(b.by.id) ?? new Set<string>();
  const first = !seen.has(target.id);

  const shot = buildShot(BOW_HIT, {
    shooter: b.by,
    target,
    distance,
    moving: b.moving,
    firstHit: first,
    now,
  });

  seen.add(target.id);
  touched.set(b.by.id, seen);
  b.hitIds.add(target.id);

  // **クリと素の値を渡す**——特殊攻撃はクリ前の値を参照する
  hit({
    by: b.by,
    target,
    attack: shot.final,
    via: "pve_v3:bow",
    crit: shot.crit,
    power: shot.power,
  });

  // ---- 当たった合図。**光は当たった点に、音は本人に**
  //
  // > ### 弓の通常ヒットは、**クリティカルの粒**を使う（2026-09-02 決定）
  // >
  // > **v2 の「通常ヒット」の粒（`hit_burst` 1 枚）は、弓には弱すぎた。**
  // > **刺さった手応えは、光の筋があって初めて出る。**
  //
  // **音を場所から鳴らすと、遠くの敵に当てたとき聞こえない**（弓は 48 マス届く）。
  try {
    critFx(b.dim, at);
    if (shot.crit) b.by.playSound(CRIT_SOUND, { volume: 0.35, pitch: 1.9 });
  } catch {
    /* 消えている */
  }
}

/**
 * 飛んでいる弾を進める。**毎 tick。**
 *
 * **1 回の区間で当たるのは 1 体。**
 */
export function stepBullets(now: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b === undefined) continue;

    // **壁の中に居たら、そこで終わり**（貫通して飛んでいくのを防ぐ）
    if (insideWall(b.dim, b.at)) {
      bullets.splice(i, 1);
      continue;
    }

    const step = Math.min(SPEED, RANGE - b.flown);
    const from = b.at;

    // ---- この区間で、いちばん手前の相手
    let target: Entity | undefined;
    let hitAt = step + 1;
    try {
      for (const e of b.dim.getEntities({ location: from, maxDistance: step + FAT + 2 })) {
        if (e.id === b.by.id) continue;
        // **味方は素通りする**（PvE。味方が壁にならない）
        if (isAlly(e)) continue;
        if (!has(e) || b.hitIds.has(e.id)) continue;
        const t = distanceAlong(from, b.dir, step, e.location, SHAPE);
        if (t === undefined || t >= hitAt) continue;
        target = e;
        hitAt = t;
      }
    } catch {
      /* 読み込まれていない */
    }

    // ---- 壁のほうが手前なら消える
    // **レイで探し、外したときは実際に触って確かめる**（`wallByProbe`）
    const wall = wallWithin(b.dim, from, b.dir, step) ?? wallByProbe(b.dim, from, b.dir, step);
    if (wall !== undefined && (target === undefined || wall < hitAt)) {
      drawTrail(b.dim, from, b.dir, wall);
      bullets.splice(i, 1);
      continue;
    }

    if (target !== undefined) {
      drawTrail(b.dim, from, b.dir, hitAt);
      // **矢が止まった点**
      land(b, target, b.flown + hitAt, now, pointAt(from, b.dir, hitAt));
      bullets.splice(i, 1);
      continue;
    }

    // ---- 何も無ければ進む
    drawTrail(b.dim, from, b.dir, step);
    b.at = pointAt(from, b.dir, step);
    b.flown += step;
    if (b.flown >= RANGE) bullets.splice(i, 1);
  }
}

/** 飛んでいる弾の数。**確かめる用** */
export function bulletCount(): number {
  return bullets.length;
}
