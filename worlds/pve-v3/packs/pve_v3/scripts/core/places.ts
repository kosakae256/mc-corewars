/**
 * 決まった場所。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md` 2 章・`../02-map.md`。
 */

export interface Place {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 3 つの場所。
 *
 * | | 中心 |
 * | --- | --- |
 * | ロビー | **1255, 15, 701**（建ててある） |
 * | 休憩所 | **−2000, 0, −2000**（床が y ＝ 0） |
 * | 戦場 | **0, 0, 0** |
 *
 * **足元の y は 1 つ上に置く**——中心 y のブロックに埋まらないように。
 * **戦場の y は仮**（`../02-map.md` 3 章・5 章が未定）。
 */
export const PLACES = {
  lobby: { x: 1255, y: 15, z: 701 },
  rest: { x: -2000, y: 1, z: -2000 },
  field: { x: 0, y: 2, z: 0 },
} as const satisfies Record<string, Place>;

/**
 * その場所に着いたときの向き（ヨー）。**書いていない場所では向きを変えない。**
 *
 * > ### 休憩所と戦場は、**必ず ＋z を向く**（2026-09-04 決定）
 * >
 * > **どちらも「手前に立って、奥へ進む」形**（`../02-map.md` 4 章）。
 * > **着いた瞬間に奥を向いていないと、どちらへ行けばいいのか分からない。**
 *
 * **ヨー 0 が ＋z**（南）。90 が −x、180 が −z、−90 が ＋x。
 */
export const FACING: Readonly<Partial<Record<keyof typeof PLACES, number>>> = {
  rest: 0,
  field: 0,
};

/**
 * 「その場所の圏内」とみなす半径。
 *
 * **3 つの場所は 2,000 マス以上離れている**ので、
 * **150 で見れば取り違えない。**
 *
 * > **毎周期ぴったりの座標へ引き戻さない。**
 * > **圏外に居るときだけ戻す**——さもないと動けなくなる。
 */
export const AREA_RADIUS = 150;

/** 固定するときの許容。**これを越えたら引き戻す** */
export const FREEZE_RADIUS = 2;

/** 平面距離（y は見ない）。**高さで圏外にしない** */
export function flatDistance(a: Place, b: Place): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** その場所の圏外か */
export function isOutside(at: Place, home: Place, radius = AREA_RADIUS): boolean {
  return flatDistance(at, home) > radius;
}
