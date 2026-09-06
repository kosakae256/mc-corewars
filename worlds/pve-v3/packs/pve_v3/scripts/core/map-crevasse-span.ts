/**
 * 氷河の裂け目の**渡る所と雪庇——柱 1 本ぶんの形。純粋。**
 *
 * > ### **渡れるのは 3 本だけ。姿は全部変える**（0-6）
 * >
 * > | | 姿 | 支え |
 * > | --- | --- | --- |
 * > | **氷の橋** | 自然に残った氷の迫り | **迫りそのもの。** 岸で深く、真ん中で薄い |
 * > | **岩の詰まり** | 落ちた岩が挟まった所 | **両岸に噛んだ岩の塊** |
 * > | **板と縄** | 人が架けたもの | **梁と帆柱と鎖**（`map-crevasse-deco.ts`） |
 * >
 * > **浮いた板を渡さない**（0-5）。どれも下から続く形にしてある。
 *
 * > ### 天面は「1 マスずつ」しか動かさない（0-8）
 * >
 * > 岩の詰まりは**縁から 1 マスずつ降りて、また上がる。**
 * > 一気に 3 マス落とすと、そこから先が**歩いて行けない面**になる。
 *
 * > ### 柱を引く口は、ここに 1 つだけ置く
 * >
 * > 形（`map-crevasse-shape.ts`）はここを知らない。
 * > **互いに読み合わせると読み込みの輪ができる**（`map-basin-const.ts` で実際に起きた）。
 */

import { BOTTOM, GROUND, smoothWave } from "./map-frame.js";
import {
  corniceReach,
  crevHalf,
  crevIn,
  crevZ,
  crossAt,
  CROSSES,
  inFissure,
  landBottom,
  onIsland,
  SEED,
  type Col,
} from "./map-crevasse-shape.js";

/** 落ちた岩。**同じ大きさを並べない**（0-6）。裂け目の芯からの割合で置く */
const JAM_ROCKS = [
  { dx: -2.6, dv: -0.66, r: 5.2, d: 6 },
  { dx: 1.6, dv: -0.22, r: 6.6, d: 8 },
  { dx: -1.1, dv: 0.28, r: 5.8, d: 7 },
  { dx: 2.7, dv: 0.7, r: 4.6, d: 5 },
] as const;

/**
 * 岩の詰まった所。**縁から 1 マスずつ降りて、また上がる。**
 *
 * 腹は**岩の玉をいくつも重ねて**でこぼこにする——
 * 下から見上げたときに、**挟まった岩の塊**として見える。
 */
function jamCol(x: number, z: number, u: number): Col {
  // **深く落とすほど「裂け目に降りる」感じが出る。**
  // 浅いと、地面がそのまま続いているようにしか見えなかった（2026-09-06）
  const dip = 5.2 * u ** 0.8 + smoothWave(SEED + 31, x, z, 5) * 0.9;
  const top = GROUND - Math.max(0, Math.min(5, Math.round(dip)));
  const lump =
    0.7 + ((smoothWave(SEED + 33, x, z, 7) + 1) / 2) * 0.5 + ((smoothWave(SEED + 35, x, z, 4) + 1) / 2) * 0.3;
  let deep = 5 + 14 * u ** 0.6 * lump;
  const cz = crevZ(0);
  const ch = crevHalf(0);
  for (const r of JAM_ROCKS) {
    const d = Math.hypot(x - r.dx, z - (cz + r.dv * ch));
    if (d < r.r) deep += r.d * (1 - d / r.r);
  }
  return { x, z, top, bottom: Math.max(BOTTOM + 2, Math.round(GROUND - deep)), kind: "jam" };
}

/**
 * 自然の氷の橋。**迫りは岸で深く、真ん中で薄い**（0-5。浮いた板にしない）。
 *
 * 橋の**横の縁でも薄くする**——上から見て板、下から見て樋、では困る。
 */
function archCol(x: number, z: number, u: number): Col {
  const c = CROSSES[0];
  const v = c === undefined ? 0 : Math.min(1, Math.abs(x - c.x) / (c.half + 1.6));
  const rise = 2 + 22 * (1 - u) ** 1.5 + v * v * 5;
  return {
    x,
    z,
    top: GROUND + (u > 0.34 ? 1 : 0),
    bottom: Math.max(BOTTOM + 2, Math.round(GROUND - rise)),
    kind: "arch",
  };
}

/**
 * 雪庇。**縁で厚く、先で薄い楔**——先だけ 1 マス反り上がる。
 *
 * **支えのある張り出しにする**（0-5）。腹が縁の側で 6 マス、
 * 先で 1 マスなので、**下から見ると縁の岩が膨らんで庇を持ち上げている。**
 * その裏に氷柱が下がる（`map-crevasse-deco.ts`）。
 */
function corniceCol(x: number, z: number, into: number, reach: number): Col {
  const k = Math.max(1, Math.ceil(into));
  const tip = k >= reach && Math.abs(x) > 5;
  return { x, z, top: GROUND + (tip ? 1 : 0), bottom: GROUND - Math.max(1, 7 - 2 * k), kind: "cornice" };
}

/**
 * その柱。**`null` なら裂け目——底は無い。**
 *
 * **見通しの帯（|x| ≤ 5）には吹き溜まりも雪庇の反りも置かない**（0-3）。
 */
export function colAt(x: number, z: number): Col | null {
  if (!onIsland(x, z) || inFissure(x, z)) return null;
  const into = crevIn(x, z);
  if (into <= 0) {
    const drift = Math.abs(x) > 5 && smoothWave(SEED + 55, x, z, 11) > 0.66 ? 1 : 0;
    return { x, z, top: GROUND + drift, bottom: landBottom(x, z), kind: "bank" };
  }
  const kind = crossAt(x, z);
  if (kind !== null) {
    const u = Math.max(0, Math.min(1, into / crevHalf(x)));
    if (kind === "arch") return archCol(x, z, u);
    if (kind === "jam") return jamCol(x, z, u);
    return { x, z, top: GROUND, bottom: GROUND - 1, kind: "rope" };
  }
  const reach = corniceReach(x, z);
  return into <= reach ? corniceCol(x, z, into, reach) : null;
}
