/**
 * 戦場 08「黒曜石の祭壇」の**形**。**純粋な計算だけ**——手順は積まない。
 *
 * 広場の高さ・段の高さ・聖路の床・表面の材を、**ここ 1 か所**で決める。
 * **`map-altar.ts` と `map-altar-decor.ts` の両方がここを読む**ので、
 * **飾りが地形とずれない**——浮いた台座も、届かない段も出ない。
 *
 * > ### **周りは静かに、中央だけを見せる**（2026-09-06 作り直し）
 * >
 * > 前の版は外周にも胸壁・控え壁・塔を置いたので、**「周りの山」**に見えた。
 * > **外周の高さの飾りは全部やめて**、手数を祭壇へ回してある。
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 */

import { BOTTOM, GROUND, smoothWave, speckle } from "./map-frame.js";

/** 種。**変えれば材の散り方が変わる** */
export const SEED = 2822;

/** 島の縁。**真円のまま、すっきり切る**（±50 の内側。0-1） */
export const EDGE = 46;

/**
 * 祭壇の裾。**ここから外は、ぜんぶ平らな広場。**
 *
 * **正方形で測る**（チェビシェフ距離）——丸い広場の中に角ばった祭壇が建つと、
 * **どこが人の手で組んだ物か**が一目で分かる。
 */
export const ALTAR_C = 23;

/** 祭壇の天面の高さ */
export const CROWN_Y = GROUND + 12;

/** 聖路の半幅。**x が ±2 まで** */
export const AISLE_HALF = 2;

/** ゲートの裏を塞ぐ壁が始まる z */
const PYLON_Z = 40;

/** 正方形で測った隔たり */
export function chebOf(x: number, z: number): number {
  return Math.max(Math.abs(x), Math.abs(z));
}

/**
 * 段の高さ。**三層。段の面は 1 マスずつ、間に広い踊り場を取る**（0-8）。
 *
 * ```
 *  c 24〜   y 0      広場（平ら。ここは何も置かない）
 *  c 19〜23 y 1〜5    一の面
 *  c 15〜18 y 5      一のテラス（幅 4）
 *  c 11〜14 y 6〜9    二の面
 *  c  9〜10 y 9      二のテラス（ここに列柱が立つ）
 *  c  7〜 8 y 10〜11  三の面
 *  c ≦ 6   y 12     祭壇の天面（13 × 13）
 * ```
 */
function tierAt(c: number): number {
  if (c > ALTAR_C) return GROUND;
  if (c >= 19) return GROUND + (24 - c);
  if (c >= 15) return GROUND + 5;
  if (c >= 11) return GROUND + (20 - c);
  if (c >= 9) return GROUND + 9;
  if (c >= 7) return GROUND + (18 - c);
  return CROWN_Y;
}

/**
 * 聖路の床の高さ。
 *
 * > ### **湧く所からゲートが見えないといけない**（0-3）
 * >
 * > 祭壇は中央がいちばん高いので、**そのままでは視線を塞ぐ。**
 * > **中央を貫く聖路を切り下げて、通り抜ける口にする。**
 * > 目の高さから引いた線より、**必ず 1 マス以上低い**ように段を決めてある。
 */
export function aisleTop(z: number): number {
  const d = Math.abs(z);
  if (d >= 30) return GROUND;
  if (d >= 14) return GROUND + 1;
  return GROUND + 2;
}

/**
 * 聖路の**両脇が開く高さ**。
 *
 * > ### 垂直に切ると、ただの溝になる
 * >
 * > **聖所の前（|z| ≧ 7）では、脇を 1 マスずつ段にして開く。**
 * > 段の斜面へそのまま繋がるので、**どこからでも上がれて、見通しもよい。**
 * > **聖所の中（|z| ≦ 6）だけは垂直**——ここは壁で囲まれた部屋にする。
 */
function bankAt(x: number, z: number): number {
  if (Math.abs(z) < 7) return 999;
  return aisleTop(z) + (Math.abs(x) - AISLE_HALF);
}

/**
 * ゲートの裏を塞ぐ、**段になった低い壁**（0-3）。
 *
 * **回り込めるポータルは、置く意味がない。**
 * 垂直に立てると登れない面が残る（0-8）ので、
 * **x にも z にも 1 マスずつ落として**、どこからでも登れる形にする。
 */
function pylonAt(x: number, z: number): number {
  if (z < PYLON_Z) return -1;
  return GROUND + 6 - (z - PYLON_Z) - Math.max(0, Math.abs(x) - 5);
}

/**
 * その柱の天面。**島の外なら `undefined`。**
 *
 * **飾りを置く側も必ずここを見る**——地形とずれると、浮いた台座になる（0-5）。
 */
export function topAt(x: number, z: number): number | undefined {
  if (Math.hypot(x, z) > EDGE) return undefined;
  let h = tierAt(chebOf(x, z));
  // ---- 聖路と、その脇の段。**切り下げるだけ。上げることはしない**
  if (Math.abs(x) <= AISLE_HALF) h = Math.min(h, aisleTop(z));
  else h = Math.min(h, bankAt(x, z));
  return Math.max(h, pylonAt(x, z));
}

/** その柱の底。**中央ほど深い皿**——裏から見て浮島に見えるように */
export function bottomAt(x: number, z: number): number {
  const t = Math.max(0, EDGE - Math.hypot(x, z));
  const root = Math.round(smoothWave(SEED + 21, x, z, 17) * 3);
  return Math.max(BOTTOM, GROUND - Math.max(3, 4 + Math.floor(t * 0.4) + root));
}

// ================================================================ 材

/**
 * **広場は静かに、祭壇は明るく。**
 *
 * > ### 遠くから見て、中央に目が行くこと
 * >
 * > 広場は**深層岩の暗い帯**でまとめ、線も控えめにする。
 * > 祭壇だけ**磨いた玄武岩の白い縁**と**金の帯**を回して、そこだけ浮かせる。
 *
 * **1 つの帯の中では明るさを揃える**——明暗の開いた材を混ぜると、
 * **ざらついて紋様が消える**（0-7 の「まばら」は、明るさを散らせという意味ではない）。
 */
const PLAZA_MATS = [
  "blackstone",
  "deepslate_tiles",
  "cracked_deepslate_tiles",
  "polished_blackstone",
  "polished_blackstone_bricks",
  "chiseled_deepslate",
];

/**
 * 段。**広場よりはっきり明るくする。**
 *
 * > ### 明るさが近いと、祭壇が広場に溶ける
 * >
 * > **暗い広場の上に、明るい壇。** その真ん中に**黒曜石の聖所**を据えると、
 * > **遠くからでも中央に目が行く。**
 */
const ALTAR_MATS = [
  "polished_deepslate",
  "deepslate_bricks",
  "basalt",
  "smooth_basalt",
  "polished_deepslate",
  "chiseled_deepslate",
];

/** 天面。**黒曜石に金を差す** */
const CROWN_MATS = [
  "obsidian",
  "obsidian",
  "gilded_blackstone",
  "black_concrete",
  "coal_block",
  "chiseled_polished_blackstone",
];

/** 聖路。**いちばん黒く沈める** */
const AISLE_MATS = ["obsidian", "black_concrete", "obsidian", "sculk", "coal_block", "gilded_blackstone"];

/** ゲートの裏壁。**切石で積んだ壁**に見せる */
const GATE_MATS = [
  "polished_blackstone_bricks",
  "blackstone",
  "cracked_polished_blackstone_bricks",
  "chiseled_polished_blackstone",
  "polished_blackstone",
  "gilded_blackstone",
];

/** 中身（見えない所）。**掘れば違う石が出る** */
const BODY_MATS = ["deepslate", "blackstone", "basalt", "cobbled_deepslate", "smooth_basalt", "coal_ore"];

/** 崖の天端。**縁に 1 本だけ色を変えた層を入れて、切り口を締める** */
const CORNICE_MATS = ["polished_deepslate", "deepslate_bricks", "smooth_basalt", "polished_basalt"];

/** 段の縁。**明るい線を回して、三層の輪郭を見せる** */
const RIM_C = [23, 18, 10, 5];

/** 金の帯。**テラスの内側の縁に 1 本** */
const GOLD_C = [15, 9];

/** 段の面。**1 段おきに明暗を替える**——遠目に段数が読めるように */
const STEP_MATS = [
  "blackstone",
  "polished_blackstone",
  "deepslate_tiles",
  "cracked_deepslate_tiles",
  "polished_blackstone_bricks",
  "chiseled_deepslate",
];

/** 広場の輪。**2 本だけ。多いと広場がうるさくなる** */
function isPlazaRing(r: number): boolean {
  const i = Math.floor(r);
  return i === 31 || i === 42;
}

/** 放射の筋。**16 本。広場だけに、控えめに通す** */
function isSpoke(x: number, z: number, r: number): boolean {
  if (r < 22 || r > 44) return false;
  const step = Math.PI / 8;
  const off = Math.atan2(z, x) / step;
  return Math.abs(off - Math.round(off)) * step * r < 1.1;
}

/**
 * 四方の参道の帯。**中央へ向かう線を、床の色で示す**（高さは変えない）。
 *
 * **横切る側の隔たり**で見る——±z の参道なら x、±x の参道なら z。
 */
function laneDepth(x: number, z: number): number {
  return Math.min(Math.abs(x), Math.abs(z));
}

/** 段の面か（テラスでも天面でもない、上がっている途中か） */
function onStep(c: number, top: number): boolean {
  return top > GROUND && top < CROWN_Y && !RIM_C.includes(c) && !GOLD_C.includes(c);
}

/** 祭壇の面 */
function altarFace(x: number, z: number, c: number, top: number): string {
  if (RIM_C.includes(c)) return "polished_basalt";
  if (GOLD_C.includes(c)) return "gilded_blackstone";
  if (top >= CROWN_Y) return speckle(SEED + 7, x, z, CROWN_MATS);
  // **1 段おきに明るくする**——同じ色で積むと、面がのっぺりして段数が見えない
  if (onStep(c, top) && (top & 1) === 1) return speckle(SEED + 43, x, z, STEP_MATS);
  return speckle(SEED + 19, x, z, ALTAR_MATS);
}

/** 広場の面 */
function plazaFace(x: number, z: number, r: number): string {
  const d = laneDepth(x, z);
  if (d === 4) return "polished_basalt";
  if (d <= 1) return "gilded_blackstone";
  if (d < 4) return "polished_deepslate";
  if (isPlazaRing(r)) return "polished_deepslate";
  if (isSpoke(x, z, r)) return "deepslate_bricks";
  return speckle(SEED + 11, x, z, PLAZA_MATS);
}

/** その柱の表面。**1 マスごとに引く**（0-7） */
export function surfaceAt(x: number, z: number, top: number): string {
  if (Math.abs(x) <= AISLE_HALF && top <= GROUND + 2) return speckle(SEED + 3, x, z, AISLE_MATS);
  if (z >= PYLON_Z && top > GROUND) return speckle(SEED + 31, x, z, GATE_MATS);
  const c = chebOf(x, z);
  if (c <= ALTAR_C) return altarFace(x, z, c, top);
  return plazaFace(x, z, Math.hypot(x, z));
}

/** その柱の中身 */
export function bodyAt(x: number, z: number): string {
  return speckle(SEED + 17, x, z, BODY_MATS);
}

/** 天面のすぐ下に入れる層。**崖から見たときの帯になる** */
export function corniceAt(x: number, z: number): string {
  return speckle(SEED + 23, x, z, CORNICE_MATS);
}
