/**
 * 16. 大書庫——**間取り・寸法・材の引き方。** 実際に置くのは他のファイル。
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 16 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 *   八角の外端  octR ＝ 45      いちばん遠い角でも中心から 48.5（±50 の内）
 *   壁の内面    octR ＝ 41      ここに壁一面の書架と高窓
 *   部屋の端    octR ＝ 40
 *   外周の回廊  octR 37〜40     **書架を置かない帯。** ここを回れば行き止まりが無い
 *   2 階の床    octR 21〜40     y ＝ 9。手すりは内端（21）に立てる
 *   吹き抜け    octR ≦ 20      y ＝ 1〜21。天球儀が吊ってある
 * ```
 *
 * > ### **積まずに彫る**（`map-stronghold.ts` と同じ）
 * >
 * > 屋内を「床と壁と天井を積む」で作ると、**外壁だけが天井より高く残り、
 * > 上から見た高さが不連続になって 0-8 に落ちる。**
 * > **八角の塊を置いてから彫れば、天面はどこも屋根**——登れない面が生まれない。
 *
 * > ### **屋根に穴を開けない**
 * >
 * > 天窓（オクルス）を抜くと、**その柱の天面だけが床まで落ちる。**
 * > 0-8 の塗り広げは屋根の上を歩くので、**そこがまとまった「行けない面」になる。**
 * > **高窓は壁を横に抜く**——縦には抜かない。
 *
 * > ### **x ＝ 0 の筋は、y ＝ 1〜6 を塞がない**
 * >
 * > 検査 0-3 は湧く所の目からゲートへ線を引く（`14-map-build.md` 0-9）。
 * > **身廊（|x| ≦ 2）には、1 階の高さに何も立てない。**
 * > 2 階の橋（y ＝ 9）は線より上なので跨いでよい。
 */

/** 種。**変えれば書架の並びと苔の散り方が変わる** */
export const SEED = 3918;

/** 八角の外端。**いちばん遠い角でも 48.5** なので ±50 に収まる（0-1） */
export const MASS_R = 45;
/** 壁の内側の面 */
export const WALL_R = 41;
/** 部屋の端 */
export const INNER_R = 40;
/** 外周の回廊の内端。**ここから外は書架を置かない** */
export const AMBULATORY_R = 37;
/** 2 階の床の内端 */
export const DECK_R = 21;
/** 吹き抜けの端 */
export const ATRIUM_R = 20;

/** 塊の底 */
export const MASS_BOT = -12;
/** 屋根の基準（上限は ＋29。段丘で ＋28 まで上げる） */
export const ROOF = 25;
/** 翼の天井。**2 階の内法は 8**（y ＝ 10〜17） */
export const CEIL_1 = 18;
/** 吹き抜けの天井。**内法 21**（0 章の「吹き抜けは 14 以上」） */
export const CEIL_A = 22;
/** 2 階の床の段。**1 階の内法は 8**（y ＝ 1〜8） */
export const DECK = 9;

/**
 * 八角形の「半径」。**縦横と斜めの 3 つで抑える。**
 *
 * **真円にしないのは、人の建てたものだから**（0-6 の但し書き）。
 * 係数 0.72 は、外端の角が (45, 18) に来るように選んである。
 */
export function octR(x: number, z: number): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return Math.max(ax, az, Math.round((ax + az) * 0.72));
}

/**
 * **玄関の窪み。** 湧く所（0, 1, −40）が乗る前室。
 *
 * **壁の中を彫って作る**——`spawnPad` の足場が塊の外へ出ると、
 * **その柱だけ天面が床まで落ちて 0-8 に落ちる**（屋根から切り離される）。
 * **奥の壁は z ＝ −45 に残す**——外へ抜けさせない。
 */
export function inAlcove(x: number, z: number): boolean {
  return Math.abs(x) <= 5 && z >= -44 && z <= -41;
}

/** 窪みの天井 */
export const ALCOVE_CEIL = 8;

/** そこが塊の中か */
export function inMass(x: number, z: number): boolean {
  return octR(x, z) <= MASS_R;
}

/**
 * 屋根の天面。**段丘にして 1 マスずつ上げる。**
 *
 * **1 段 1 マスなら歩いて登れる**ので、0-8 の塗り広げが屋根の端から
 * てっぺんまで届く。**2 マス上げると、そこから内側が全部「行けない面」になる。**
 */
export function roofTop(x: number, z: number): number {
  const r = octR(x, z);
  return ROOF + (r <= 36 ? 1 : 0) + (r <= 28 ? 1 : 0) + (r <= 18 ? 1 : 0);
}

/** その柱の天井の段。**0 なら岩のまま** */
export function ceilOf(x: number, z: number): number {
  if (inAlcove(x, z)) return ALCOVE_CEIL;
  const r = octR(x, z);
  if (r > INNER_R) return 0;
  return r <= ATRIUM_R ? CEIL_A : CEIL_1;
}

/** そこが部屋の中か */
export function isOpen(x: number, z: number): boolean {
  return ceilOf(x, z) > 0;
}

// ================================================================ 2 階

/** 2 階の床を抜く所 */
export interface Rect {
  readonly name: string;
  readonly x1: number;
  readonly x2: number;
  readonly z1: number;
  readonly z2: number;
}

/** 螺旋階段の中心。**4 基。回廊のどこからでも近い所にある** */
export const SPIRALS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -24, z: -14 },
  { x: 24, z: -14 },
  { x: -24, z: 16 },
  { x: 24, z: 16 },
];

/**
 * **2 階の床を抜く所。**
 *
 * **階段の上に床があると、頭がつかえて上がれない**（`map-stronghold-rooms.ts` と同じ）。
 * 玄関と前室は、抜いたぶんが**2 層ぶんの高さの広間**になる。
 */
export const WELLS: readonly Rect[] = [
  { name: "玄関の吹き抜け", x1: -6, x2: 6, z1: -41, z2: -30 },
  { name: "西の大階段", x1: -11, x2: -7, z1: -41, z2: -32 },
  { name: "東の大階段", x1: 7, x2: 11, z1: -41, z2: -32 },
  { name: "前室の吹き抜け", x1: -8, x2: 8, z1: 30, z2: 41 },
  ...SPIRALS.map((s) => ({ name: "螺旋階段", x1: s.x - 2, x2: s.x + 2, z1: s.z - 2, z2: s.z + 2 })),
];

/** 床を抜く所の中か。**`pad` はその周りも含めて見る** */
export function inWell(x: number, z: number, pad = 0): boolean {
  return WELLS.some((w) => x >= w.x1 - pad && x <= w.x2 + pad && z >= w.z1 - pad && z <= w.z2 + pad);
}

/**
 * 吹き抜けを渡る橋か。**2 階の回廊を東西に繋ぐ。**
 *
 * **天球儀（z ＝ 1 のあたり）は避ける**——真上を橋が通ると見えなくなる。
 */
export function isBridge(x: number, z: number): boolean {
  if (Math.abs(x) > 21) return false;
  return (z >= -9 && z <= -5) || (z >= 9 && z <= 13);
}

/**
 * **身廊の吹き抜け。** 2 階の床を細く割って、1 階から天井まで通す。
 *
 * > ### **身廊は 2 層ぶんの高さにする**
 * >
 * > 床で蓋をすると、**玄関からゲートまでが内法 8 マスの筒**になり、
 * > 大書庫に見えない。**割れば、両脇の回廊から見下ろせる**（撃ち下ろす所）。
 *
 * **|z| ＝ 24〜26 だけ残す**——2 階の東西を渡る橋にするため。
 */
export function inNaveSlot(x: number, z: number): boolean {
  const az = Math.abs(z);
  return Math.abs(x) <= 4 && az >= 20 && az <= 30 && !(az >= 24 && az <= 26);
}

/** そこに 2 階の床が有るか */
export function hasDeck(x: number, z: number): boolean {
  const r = octR(x, z);
  if (r > INNER_R) return false;
  if (r < DECK_R) return isBridge(x, z);
  return !inWell(x, z) && !inNaveSlot(x, z);
}

/**
 * 階段の降り口か。**ここに手すりを立てない。**
 *
 * **立てると上がれなくなる**（`map-stronghold-rooms.ts` で踏んだのと同じ穴）。
 */
export function isLanding(x: number, z: number): boolean {
  if (z === -31 && Math.abs(x) >= 7 && Math.abs(x) <= 11) return true;
  return SPIRALS.some((s) => z === s.z - 3 && x >= s.x && x <= s.x + 2);
}

// ================================================================ 帯にまとめる

/** x ごとの帯（z を繋げたもの） */
export interface RunX {
  readonly x: number;
  readonly z1: number;
  readonly z2: number;
}

/** z ごとの帯（x を繋げたもの） */
export interface RunZ {
  readonly z: number;
  readonly x1: number;
  readonly x2: number;
}

/**
 * 条件に合う柱を、**x ごとの帯**にまとめる。
 *
 * **1 柱 1 手で流すと、床だけで 5 千手を超える。**
 * **並んでいる所は 1 回の `fill` で済ませる。**
 */
export function runsX(pick: (x: number, z: number) => boolean, lim = INNER_R): RunX[] {
  const out: RunX[] = [];
  for (let x = -lim; x <= lim; x++) {
    let head: number | undefined;
    for (let z = -lim; z <= lim + 1; z++) {
      const on = z <= lim && pick(x, z);
      if (on && head === undefined) head = z;
      else if (!on && head !== undefined) {
        out.push({ x, z1: head, z2: z - 1 });
        head = undefined;
      }
    }
  }
  return out;
}

/** 同じことを **z ごとの帯**で。**梁を横に渡すときに使う** */
export function runsZ(pick: (x: number, z: number) => boolean, lim = INNER_R): RunZ[] {
  const out: RunZ[] = [];
  for (let z = -lim; z <= lim; z++) {
    let head: number | undefined;
    for (let x = -lim; x <= lim + 1; x++) {
      const on = x <= lim && pick(x, z);
      if (on && head === undefined) head = x;
      else if (!on && head !== undefined) {
        out.push({ z, x1: head, x2: x - 1 });
        head = undefined;
      }
    }
  }
  return out;
}

/** 八角の縁を、角度の順に並べて返す。**高窓を等間隔ではなく散らして置くため** */
export function ringOf(r: number): readonly { readonly x: number; readonly z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let x = -r; x <= r; x++) {
    for (let z = -r; z <= r; z++) {
      if (octR(x, z) === r) out.push({ x, z });
    }
  }
  return out.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
}
