/**
 * 11「森の洋館」の**材の引き方と、塗りの道具。純粋。**
 *
 * > ### **人が建てたものは揃っていてよい**（`spec/14-map-build.md` 0-7）
 * >
 * > **自然地形のように 1 マスごとに散らすと、板張りに見えない。**
 * > **縦の筋（柱）は 5 マスおきの規則で、汚れだけを乱数で散らす。**
 */

import { noise } from "./map-frame.js";
import { SEED } from "./map-mansion-plan.js";
import { edgeAt, roofAt } from "./map-mansion-roof.js";

/**
 * 壁の 1 本。**5 マスおきに柱を通す**——洋館の木骨に見せる。
 *
 * > ### 柱は**皮を剥いだ丸太**を主にする（2026-09-06 に直した）
 * >
 * > `dark_oak_log` は板とほぼ同じ色で、**絵にすると柱が消えた。**
 * > `stripped_dark_oak_log` なら 1 段明るく、縦の筋がはっきり出る。
 */
export function wallColumn(x: number, z: number): string {
  const m = (((x + z) % 5) + 5) % 5;
  const r = noise(SEED + 11, x, 2, z);
  if (m === 0) return r < 0.62 ? "stripped_dark_oak_log" : "dark_oak_log";
  // **丸石は混ぜない**——1 本だけ石の柱が立つと、吹き抜けで灰色の帯として悪目立ちする。
  // **石は腰壁（`wainscot`）だけに寄せる**（2026-09-06 に絵で気づいた）
  if (r < 0.1) return "spruce_planks";
  return "dark_oak_planks";
}

/**
 * 外壁の 1 本。**丸石の腰と、木骨の面。**
 *
 * **外は奈落なので誰も近寄らない**——だが**遠景の輪郭**として必ず見える。
 * **一枚の平らな壁にしない**（`spec/14-map-build.md` 0-4）。
 */
export function facadeColumn(x: number, z: number): string {
  const m = (((x * 2 + z) % 4) + 4) % 4;
  if (m === 0) return "dark_oak_log";
  const r = noise(SEED + 37, x, 3, z);
  if (r < 0.14) return "spruce_planks";
  if (r < 0.2) return "stripped_dark_oak_log";
  return "dark_oak_planks";
}

/** 腰壁（床から 2 マス）。**丸石を混ぜて、板一色にしない** */
export function wainscot(x: number, z: number): string {
  const r = noise(SEED + 13, x, 4, z);
  if (r < 0.18) return "mossy_cobblestone";
  if (r < 0.62) return "cobblestone";
  return "stone_bricks";
}

/** 基礎。**建物の下から見える所** */
export function footing(x: number, y: number, z: number): string {
  const r = noise(SEED + 17, x, y, z);
  if (r < 0.22) return "mossy_cobblestone";
  if (r < 0.62) return "cobblestone";
  if (r < 0.82) return "stone_bricks";
  return "andesite";
}

/**
 * 屋根。**胸壁は丸石、面は板、棟と破風は明るい材。**
 *
 * > ### 高さの差だけでは、上から見て段が読めない
 * >
 * > **真上から見た絵は、傾きの陰影しか出ない。**
 * > **周りより高いマスを明るい材にする**と、棟の筋がはっきり通る。
 */
export function roofMat(x: number, z: number): string {
  const r = noise(SEED + 29, x, 5, z);
  if (edgeAt(x, z) <= 2) return r < 0.4 ? "cobblestone" : "mossy_cobblestone";
  const h = roofAt(x, z);
  const crest = h > roofAt(x - 1, z) || h > roofAt(x + 1, z) || h > roofAt(x, z - 1) || h > roofAt(x, z + 1);
  if (crest) return r < 0.3 ? "cobblestone" : "stripped_dark_oak_log";
  if (r < 0.08) return "spruce_planks";
  if (r < 0.13) return "dark_oak_log";
  return "dark_oak_planks";
}

/** その z で、条件を満たす x の連なりを返す。**1 本を 1 回の fill にまとめる** */
export function rowRuns(x0: number, x1: number, ok: (x: number) => boolean): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  let s: number | undefined;
  for (let x = x0; x <= x1; x++) {
    if (ok(x)) {
      if (s === undefined) s = x;
      continue;
    }
    if (s !== undefined) out.push([s, x - 1]);
    s = undefined;
  }
  if (s !== undefined) out.push([s, x1]);
  return out;
}
