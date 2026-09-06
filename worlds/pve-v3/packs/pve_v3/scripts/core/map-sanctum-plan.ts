/**
 * 17「白の神殿」の**割り付け。純粋。**（材は `map-sanctum-mat.ts`）
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 17 番。
 * 決まりは `spec/14-map-build.md` 0 章。
 *
 * ## 休憩所と同じ材で、同じ比率で建てる
 *
 * > ### 「安全な神殿」と「戦う神殿」
 * >
 * > **休憩所**（`core/rest-temple.ts` ほか）と**同じ材・同じ意匠**——
 * > クォーツ、市松の床、列柱、ステンドグラス、シーランタン、エンドロッド、尖塔。
 * > **同じ姿の場所が 2 つあることで、世界に筋が通る。**
 * >
 * > **違うのは手入れの度合い。** こちらは戦場なので、
 * > **壁は崩れ、柱は折れ、床に苔が乗っている。**
 *
 * ## 割り付け（上から見た図）
 *
 * ```
 *        z ＝ +45   ◠ 後陣（アプス。ステンドグラスの大窓）
 *        z ＝ +39   ▉ ゲートの箱（空けておく）
 *        z ＝ +35   ══ 後ろの壁
 *        z ＝   0   ✳ 交差部（床の輪）
 *        z ＝ −30   ╥╥ 前面（入口。x ＝ −5〜+5 が空へ抜ける）
 *        z ＝ −40   ▲ 湧く所（参道の起点）
 *
 *   x:  −46 …… −27 …… −12 …… 0 …… +12 …… +27 …… +46
 *        外庭    外壁  柱列  身廊  柱列  外壁    外庭
 * ```
 *
 * > ### **身廊がそのまま参道**（0-3）
 * >
 * > **x ＝ 0 の帯の上には、何も渡さない。**
 * > **身廊の屋根は落ちている**ことにして、空へ抜けたままにする——
 * > 側廊にだけ片流れの屋根が残っている。
 *
 * > ### **0-8 の検査は「柱の天面」しか見ない**（2026-09-06 に落ちて分かった）
 * >
 * > 床が地続きでも、**その上に梁を渡すと、その柱の天面は梁の高さになる。**
 * > 入口に鴨居を渡したら、**身廊まるごと（1668 マス）が「歩いて行けない」**になった。
 * > **通り道の上には、何も置かない。**
 */

import { noise } from "./map-frame.js";

/** 種。**変えれば別の崩れ方になる** */
export const SEED = 4055;

/** 島（基壇）の半径。**±50 の内に収める**（0-1）。外は奈落（0-4） */
export const ISLE_R = 46;

/** 外壁の x（±） */
export const WALL_X = 27;

/** 側廊と身廊を分ける柱列の x（±） */
export const PIER_X = 12;

/** 側廊の内端・外端 */
export const AISLE_IN = 13;
export const AISLE_OUT = 26;

/** 身廊の半幅。**後陣の半径と揃える**——身廊がそのまま半円に収まる */
export const NAVE_HALF = 11;

/** 前面（入口）と後ろの壁の z */
export const FRONT_Z = -30;
export const BACK_Z = 35;

/** 後陣（アプス）。**中心 (0, 34)・半径 11**。ゲート (z ＝ 39) はこの中に立つ */
export const APSE_CZ = 34;
export const APSE_R = 11;

/**
 * 外壁の天端と、付け柱の天端。
 *
 * > ### **付け柱は 1 マスだけ高くする**（0-8）
 * >
 * > 2 マス高いと、そこで**壁の上の道が切れて**、
 * > 切れた向こう側が「辿り着けない天面」として取り残される。
 */
export const WALL_TOP = 12;
export const PILASTER_TOP = 13;

/** 側廊の屋根の軒（外壁側）の高さ。**外の大階段で登れる**（0-8） */
export const DECK_Y = 11;

/**
 * 側廊の屋根の高さ。**2 マスにつき 1 マス上がる片流れ。**
 *
 * > ### 平らな屋根は、上から見ると台地にしか見えない（2026-09-06）
 * >
 * > **絵にして、完成した 5「城の中庭」と並べたら差が出た。**
 * > あちらは切妻の屋根が影を作って、建物の形が読める。
 * > **こちらは平らな床だったので、白い皿に見えた。**
 * >
 * > **傾きを 2 マスに 1 マスに抑えれば、屋根のまま歩いて登れる**（0-8）——
 * > 弓を持って屋根に上がれる戦場になる。
 */
export function roofY(absX: number): number {
  return DECK_Y + Math.floor((AISLE_OUT - absX) / 2);
}

/** 高窓（クリアストーリー）の天端。**屋根の棟より 1 マス高い** */
export const CLERESTORY_TOP = 18;

/** 大階段の段数。**y ＝ 1 から胸壁（12）まで 1 段ずつ** */
export const STAIR_STEPS = 12;

/**
 * 外の大階段。**左右で位置を変える**（0-6）。
 *
 * > ### 階段は「島の細い所」に置かない（2026-09-06 に検査で落ちた）
 * >
 * > 階段は幅 6・高さ 12 の**塊**。島の縁に寄せると、
 * > **その先の外庭が丸ごと歩いて行けなくなる**（0-8）。
 * > **崩れ目にも当てない**——当てると天端の差が開いて、屋根へ繋がらない。
 */
export const STAIRS: readonly { readonly side: number; readonly z0: number }[] = [
  { side: 1, z0: 18 },
  { side: -1, z0: -22 },
];

/** 柱間。**4 マスに 1 本**——天端の帯が 3 マスずつに切れる（0-8） */
export const BAY = 4;

/** 柱の立つ z か */
export function isPier(z: number): boolean {
  return ((z % BAY) + BAY) % BAY === 0;
}

/** 付け柱の立つ x か。**柱列と目地を揃える** */
export function isPilasterX(x: number): boolean {
  return (((x - 2) % BAY) + BAY) % BAY === 0;
}

/** 崩れた壁の場所。**左右で数も位置も変える**（0-6） */
const BREACHES: readonly { readonly side: number; readonly z: number }[] = [
  { side: 1, z: -14 },
  { side: 1, z: 15 },
  { side: -1, z: 3 },
  { side: -1, z: 26 },
  { side: -1, z: -8 },
];

/** 崩れ目の天端（中心ほど低い）。**0 なら壁が無い＝通り抜けられる** */
const BREACH_TOPS = [0, 1, 3];

/**
 * 外壁の天端。
 *
 * > ### **平らな壁の天端は、帯のまま取り残されて落ちる**（0-8）
 * >
 * > 逃げ道は 2 つしかない——**3 マス以下に切る**か、**登れるようにする**か。
 * > **壁は長いので、切って回るのは無理。** 屋根の軒（y ＝ 11）から 1 マスの
 * > **歩ける胸壁**にした。付け柱は**1 マスだけ高くする**——
 * > 2 マス高いと、そこで道が切れる。
 */
export function wallTop(side: number, z: number): number {
  const br = breachTop(side, z);
  if (br !== undefined) return br;
  if (isPier(z)) return PILASTER_TOP;
  // ---- 狭間。**1 マスおきに 1 つ上げる**——差が 1 なので道は切れない
  return z % 2 === 0 ? PILASTER_TOP : WALL_TOP;
}

/** そこが崩れ目なら、その天端 */
export function breachTop(side: number, z: number): number | undefined {
  for (const b of BREACHES) {
    if (b.side !== side) continue;
    const d = Math.abs(z - b.z);
    if (d > 2) continue;
    return BREACH_TOPS[d] as number;
  }
  return undefined;
}

/** その柱間にステンドグラスの高窓を入れるか。**入れない所は低い欄干だけ** */
export function isGlazedBay(side: number, z: number): boolean {
  return noise(SEED + 31, side, Math.floor(z / BAY)) < 0.6;
}

/** その柱に、身廊へ突き出す**折れたアーチの起こし**を付けるか */
export function hasSpringer(side: number, z: number): boolean {
  return noise(SEED + 47, side, z) < 0.55;
}

/**
 * その柱は**折れているか**。
 *
 * **同じ柱が並ぶと作り物に見える**（0-6）。1 割ほどを途中で断つ。
 * **前面と後陣の際は折らない**——入口と内陣の格好が崩れる。
 */
export function isBrokenPier(side: number, z: number): boolean {
  if (z <= FRONT_Z + 4 || z >= BACK_Z - 4) return false;
  return noise(SEED + 53, side, z) < 0.18;
}
