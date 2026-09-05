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
/**
 * 戦場の決まった座標。**20 マップすべてで同じ**（`spec/14-map-build.md` 0-1）。
 *
 * > ### マップごとに変えてよいのは、地形と意匠だけ
 * >
 * > **湧く所・ポータル・端の大きさを揃えておかないと、
 * > 「どのマップでも同じ動きで戦える」が崩れる。**
 */
export const FIELD = {
  /**
   * **足場の天面。人はこの 1 つ上に立つ。**
   *
   * > ### **y ＝ 0 で固定**（2026-09-05 決定）
   * >
   * > 湧く所もポータルも、**どのマップでも y ＝ 0 の地面に置く。**
   * > 高さが揃っていないと、**同じ動きで戦えない。**
   */
  groundY: 0,
  /** **地形の底。** ここに岩盤を敷き、その上に山を積む */
  bottomY: -50,
  /** 湧く所（手前）。**着いた瞬間 ＋z を向く** */
  spawnZ: -40,
  /** ポータル（奥）。**裏は塞ぐ** */
  portalZ: 40,
  /** **生成してよい端**（含む）。x・z とも −50 〜 +50 */
  half: 50,
  /** バリアを張る端。**手で張る。生成では触らない** */
  barrier: 60,
} as const;

/**
 * **戦場のゲートの箱**（`20-portal.md` 0-1）。
 *
 * **どのマップでも、ここが必ずゲート。** 塗り替えるのはこの中だけ。
 */
export const GATE = { x1: -1, x2: 1, y1: 1, y2: 5, z: 39 } as const;

/**
 * **休憩所の 3 択の立ち位置**（`13-flow.md` 3-2）。**左から順**（x の小さい順）。
 *
 * > ### 印のブロックをやめた（2026-09-05）
 * >
 * > **建て直さないと出てこない**のが面倒だった。**座標で決め打つ。**
 */
export const VOTE_SPOTS: readonly Place[] = [
  { x: -2006, y: 1, z: -1966 },
  { x: -2000, y: 1, z: -1966 },
  { x: -1994, y: 1, z: -1966 },
];

export const PLACES = {
  lobby: { x: 1255, y: 15, z: 701 },
  rest: { x: -2000, y: 1, z: -2000 },
  // **戦場は「湧く所」へ飛ばす。** 中心へ落とすと足場が無い（`14-map-build.md` 0-2）
  field: { x: 0, y: FIELD.groundY + 1, z: FIELD.spawnZ },
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

/**
 * **ブロックの中心へ寄せる。飛ばす前に必ず通す。**
 *
 * > ### 整数の座標は、ブロックの「角」
 * >
 * > ブロック `(x, z)` が占めるのは **`x` から `x+1`** までなので、
 * > **整数のまま飛ばすと、角に立って半マスずれる。**
 * > **`+0.5` して中心に置く。**
 *
 * `Math.floor` を通すので、**すでに中心の値を渡してもずれない**
 * （`floor(0.5) + 0.5 = 0.5`）。どこから呼んでも安全。
 *
 * **y は触らない**——足元の高さは呼ぶ側が決めている。
 */
export function center(at: Place): Place {
  return { x: Math.floor(at.x) + 0.5, y: at.y, z: Math.floor(at.z) + 0.5 };
}
