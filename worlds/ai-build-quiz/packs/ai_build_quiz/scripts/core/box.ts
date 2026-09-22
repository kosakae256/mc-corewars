/**
 * 建築の箱と行動範囲の幾何（**純粋**）。`docs/spec/14-build.md` 1 章、`16-world-rules.md` 1 章。
 *
 * 箱: 60³、(0,0,0) を中心。各軸 −30 〜 +29。
 * 行動範囲: x, z ∈ [−100, 100]、y ∈ [−100, 100]。
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Box {
  readonly min: Vec3;
  /** **含む**最大（inclusive） */
  readonly max: Vec3;
}

export const BUILD_SIZE = 60;
export const BUILD_BOX: Box = {
  min: { x: -30, y: -30, z: -30 },
  max: { x: 29, y: 29, z: 29 },
};

/** 行動範囲。飛べるので上下も切る */
export const PLAY_BOX: Box = {
  min: { x: -100, y: -100, z: -100 },
  max: { x: 100, y: 100, z: 100 },
};

/** 建築をどこに置くか。"floor" = 箱の底に接地、"center" = 中心に浮かせる */
export const ANCHOR: "floor" | "center" = "floor";

export function inBox(box: Box, p: Vec3): boolean {
  return (
    p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y && p.z >= box.min.z && p.z <= box.max.z
  );
}

/** 箱の外に居たら、中へ戻した座標（境界から inset 内側）。中なら undefined */
export function pushInside(box: Box, p: Vec3, inset: number): Vec3 | undefined {
  let { x, y, z } = p;
  let moved = false;
  if (x < box.min.x) {
    x = box.min.x + inset;
    moved = true;
  } else if (x > box.max.x) {
    x = box.max.x - inset;
    moved = true;
  }
  if (y < box.min.y) {
    y = box.min.y + inset;
    moved = true;
  } else if (y > box.max.y) {
    y = box.max.y - inset;
    moved = true;
  }
  if (z < box.min.z) {
    z = box.min.z + inset;
    moved = true;
  } else if (z > box.max.z) {
    z = box.max.z - inset;
    moved = true;
  }
  return moved ? { x, y, z } : undefined;
}

/**
 * 格子の (gx, gy, gz)（0..size-1、y が上）→ ワールド座標。
 *
 * genlab は接地済み（一番下の占有が gy=0）で、x・z は箱の中央寄せで返す。
 * ANCHOR が "center" のときは、占有の高さ（height）ぶん上げて中心に置く。
 */
export function gridToWorld(size: number, height: number, g: Vec3): Vec3 {
  const half = Math.floor(size / 2);
  const lift = ANCHOR === "center" ? Math.floor((size - height) / 2) : 0;
  return { x: g.x - half, y: g.y - half + lift, z: g.z - half };
}

/** 観覧の輪（16-world-rules 1 章）: y = 0、半径 RING_INNER〜RING_OUTER のガラス。箱（±30）の外 */
export const RING_Y = 0;
export const RING_INNER = 58;
export const RING_OUTER = 62;

/** これより下に落ちたら op 以外はスポーン地点へ（16-world-rules 3 章。本人・2026-09-21） */
export const FALL_Y = -60;

/** 出題キューの板（17-modes 3 章）: +z 側の輪の外、中心（−z）を向く */
export const QUEUE_BOARD_AT: Vec3 = { x: 0, y: 2, z: 68 }; // 本人・2026-09-22「0 2 68 に」

/** 出題の案内（17-modes 3 章）: ボタンの近く、中心（−z）を向く。「お題はボタンから出せます」（本人・2026-09-22「-18 3 66 に」） */
export const GUIDE_AT: Vec3 = { x: -18, y: 3, z: 66 };

/** ランキング板（17-modes 7 章）: 出題キューの板の隣、中心（−z）を向く（本人・2026-09-22「5 2 68 に」） */
export const BOARD_AT: Vec3 = { x: 5, y: 2, z: 68 };

/** 輪に含まれるか（x² + z² が内径²〜外径²） */
export function inRing(x: number, z: number): boolean {
  const d = x * x + z * z;
  return d >= RING_INNER * RING_INNER && d <= RING_OUTER * RING_OUTER;
}
