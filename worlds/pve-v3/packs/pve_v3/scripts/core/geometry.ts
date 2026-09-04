/**
 * 弾の当たり判定の算数。**Minecraft API に触らない。**
 *
 * 設計は `docs/spec/12-architecture.md` 2-1（**core 層**）。
 *
 * ## 点ではなく区間で見る
 *
 * 弾は 1 tick に**数マス**進む。**点で当たり判定をすると、隙間を抜ける。**
 * **線分と相手の距離**で見れば、速い弾でも取りこぼさない。
 */

/** 位置。**`@minecraft/server` の `Vector3` と同じ形**（型は借りない） */
export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 長さ 1 に直す。**長さ 0 なら前向き**（0 除算を避ける） */
export function norm(v: Point): Point {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? { x: 0, y: 0, z: 1 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 当たり判定の太さと、狙う高さ */
export interface HitShape {
  /** 半径（マス） */
  readonly fat: number;
  /** 足元からの高さ。**胴と頭のように複数点を見る** */
  readonly marks: readonly number[];
}

/**
 * その相手は、この区間の上に居るか。
 *
 * @param from 区間の始点
 * @param dir **長さ 1 の向き**（`norm` を通したもの）
 * @param length 区間の長さ（マス）
 * @param at 相手の**足元**
 * @returns 居るなら**始点からの距離**。居なければ `undefined`
 */
export function distanceAlong(from: Point, dir: Point, length: number, at: Point, shape: HitShape): number | undefined {
  let best: number | undefined;
  for (const h of shape.marks) {
    const v = { x: at.x - from.x, y: at.y + h - from.y, z: at.z - from.z };
    // **区間へ射影する。** 手前（負）と先（`length` 超え）は当たらない
    const t = v.x * dir.x + v.y * dir.y + v.z * dir.z;
    if (t < 0 || t > length) continue;
    // **区間からの離れ具合**（垂線の長さ）
    const dx = v.x - dir.x * t;
    const dy = v.y - dir.y * t;
    const dz = v.z - dir.z * t;
    if (dx * dx + dy * dy + dz * dz > shape.fat * shape.fat) continue;
    if (best === undefined || t < best) best = t;
  }
  return best;
}

/** 区間の途中の点 */
export function pointAt(from: Point, dir: Point, distance: number): Point {
  return {
    x: from.x + dir.x * distance,
    y: from.y + dir.y * distance,
    z: from.z + dir.z * distance,
  };
}
