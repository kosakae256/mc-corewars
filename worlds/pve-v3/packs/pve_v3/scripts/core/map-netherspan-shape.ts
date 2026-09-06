/**
 * 戦場 06「深淵の橋」——**平面の形。純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 6 番。
 * 決まりは `spec/14-map-build.md` 0 章。
 *
 * ## コンセプト
 *
 * > ### **底の見えない裂け目に、石の橋が一本だけ架かっている。**
 * >
 * > 幅は 7〜11。**縁は欠け、欄干は所々折れている。**
 * > 真ん中に**古い踊り場**があり、そこから左右へ**枝の桟道**が伸びる。
 * > 奥へ渡る途中で**橋は一度落ちていて、板と鎖で継いである。**
 * >
 * > **橋の外は無い。** 落ちれば奈落。
 *
 * > ### 形の判定は、この口に集める
 * >
 * > 甲板（`map-netherspan-deck.ts`）と下部構造（`map-netherspan-under.ts`）が
 * > **同じ形を読む。** 互いに読み合わせると読み込みの輪ができて、
 * > **定数が空のまま使われる**（`map-basin-const.ts` で実際に起きた）。
 */

import { GROUND, wave } from "./map-frame.js";

/** 種。**変えれば別の橋になる** */
export const SEED = 6041;

/** 甲板の高さ。**全マップ共通で y ＝ 0**（`14-map-build.md` 0-1） */
export const DECK = GROUND;

/** 甲板の版の下端。**ここから下が下部構造** */
export const SOFFIT = DECK - 3;

/**
 * **中心から 46 マスより外へは、1 マスも置かない。**
 *
 * > ### 橋には外壁が立てられない
 * >
 * > 0-4 の検査は**中心から 20〜50 マスを放射に辿り、
 * > 途中で床が切れれば「奈落で閉じている」**と見なす。
 * > **半径 46 に収めておけば、どの向きも 47 マス目で必ず切れる。**
 */
export const REACH = 46;

/** 床の素性。**材も、下に伸びるものも変わる** */
export type Kind = "rock" | "span" | "landing" | "spur" | "plank";

/** 崩れて落ちた所。**板で継いである** */
export function inCollapse(z: number): boolean {
  return z >= 15 && z <= 21;
}

/**
 * **見通しの帯**（0-3）。**ここには甲板より上に何も置かない。**
 *
 * 湧く所からゲートまで、**目の高さの線が通っていること**が要る——
 * 途中に欄干の 1 マスでも入ると、どこへ行けばいいのか分からなくなる。
 */
export function inLane(x: number, z: number): boolean {
  return Math.abs(x) <= 2 && z >= -46 && z <= 37;
}

/**
 * **その柱に積んでよい段数。**
 *
 * 帯の際（|x| ≤ 6）は 2 段までに抑える——**ポータルを隠さないため。**
 * 外側は 3 段まで。**内から外へ 1 段ずつ上がる形**にしておけば、
 * 敵も登れる（0-8）。
 */
export function maxRise(x: number, z: number): number {
  if (inLane(x, z)) return 0;
  return Math.abs(x) <= 6 && z >= -46 && z <= 37 ? 2 : 3;
}

// ================================================================ 両端の岩

/** 両端の岩塊。**楕円の芯**——内外の判定と、腹の厚みの両方をここから出す */
export const ROCK_NEAR = { cz: -39, rx: 13, rz: 7 } as const;
export const ROCK_FAR = { cz: 40, rx: 12, rz: 6.5 } as const;

/** 岩の芯からの隔たり。**0 が芯、1 が縁** */
export function rockT(
  x: number,
  z: number,
  r: { readonly cz: number; readonly rx: number; readonly rz: number }
): number {
  return Math.hypot(x / r.rx, (z - r.cz) / r.rz);
}

/** 縁を揺らす。**きれいな楕円の岩は作り物に見える**（0-6） */
function rockEdge(x: number, z: number, seed: number): number {
  return 1 + wave(seed, x, z, 9) * 0.14;
}

/** 手前の岩棚。**ここに湧く** */
export function inRockNear(x: number, z: number): boolean {
  return rockT(x, z, ROCK_NEAR) <= rockEdge(x, z, SEED + 5);
}

/** 奥の橋台。**ここにゲートが立つ** */
export function inRockFar(x: number, z: number): boolean {
  return rockT(x, z, ROCK_FAR) <= rockEdge(x, z, SEED + 7);
}

// ================================================================ 橋

/**
 * 径間の半幅。**幅 7〜11**（企画は 6〜10。**場所ごとに変えてよい**）。
 *
 * **手前と奥で揺らぎの波長を変える**——同じ関数に同じ引数を渡さない（0-6）。
 */
export function spanHalf(z: number): number {
  if (inCollapse(z)) return 3;
  // **細くなる所を 2 か所つくる。** 幅が一定だと、渡っていて怖くない
  if ((z >= -30 && z <= -26) || (z >= 26 && z <= 30)) return 3;
  if (z < 0) return 4 + Math.round(wave(SEED + 11, 0, z, 12) * 1.3);
  return 3 + Math.round((wave(SEED + 12, 0, z, 9) + 1) * 0.9);
}

/** 橋そのもの。**両端の岩に食い込ませて繋ぐ** */
export function inSpan(x: number, z: number): boolean {
  if (z < -35 || z > 37) return false;
  return Math.abs(x) <= spanHalf(z);
}

/**
 * 中央の踊り場。**角を丸めた四角**にする——
 * 真円だと橋との継ぎ目が細って、渡る所が分かりにくい。
 */
export function inLanding(x: number, z: number): boolean {
  const rx = 11 + wave(SEED + 13, x, z, 9) * 1.6;
  const rz = 12 + wave(SEED + 14, x, z, 8) * 1.4;
  return (Math.abs(x) / rx) ** 2.6 + (Math.abs(z) / rz) ** 2.6 <= 1;
}

/** 枝の踊り場。**左右で大きさも位置もずらす**（0-6） */
export const SPURS = [
  { x: -24, z: -5, r: 5.2 },
  { x: 23, z: 7, r: 4.4 },
] as const;

export function inSpur(x: number, z: number): boolean {
  return SPURS.some((s, i) => Math.hypot(x - s.x, z - s.z) <= s.r + wave(SEED + 21 + i, x, z, 7) * 0.9);
}

/** 枝へ渡す桟道。**5 マス幅**——欄干を置くと通れるのは 3 マス */
export function inWalk(x: number, z: number): boolean {
  if (x >= -22 && x <= -8 && Math.abs(z + 5) <= 2) return true;
  return x >= 8 && x <= 21 && Math.abs(z - 7) <= 2;
}

// ================================================================ まとめ

/** そこに床が有るか。**半径 46 の外へは出さない**（`REACH`） */
export function inField(x: number, z: number): boolean {
  if (Math.hypot(x, z) > REACH) return false;
  return inRockNear(x, z) || inRockFar(x, z) || inSpan(x, z) || inLanding(x, z) || inSpur(x, z) || inWalk(x, z);
}

/** その床の素性 */
export function kindAt(x: number, z: number): Kind {
  if (inCollapse(z)) return "plank";
  if (inRockNear(x, z) || inRockFar(x, z)) return "rock";
  if (inLanding(x, z)) return "landing";
  if (inSpur(x, z)) return "spur";
  // **桟道は橋と同じ扱い。** 胸壁を立てると 5 マス幅の道が 1 マスになる
  return "span";
}

/**
 * 縁からの隔たり（0〜3）。**有る／無しを引く関数を渡す。**
 *
 * 下地の輪郭にも、削ったあとの輪郭にも同じものを使う——
 * **欄干は「削れたあとの縁」に置きたい**ので、表を差し替えて呼ぶ。
 */
export function edgeDist(has: (x: number, z: number) => boolean, x: number, z: number): number {
  for (let k = 1; k <= 3; k++) {
    if (!has(x + k, z) || !has(x - k, z) || !has(x, z + k) || !has(x, z - k)) return k - 1;
  }
  return 3;
}

/**
 * 削れた縁の天面。**null なら、そこは落ちて無くなっている。**
 *
 * > ### 芯の 5 マスは絶対に残す
 * >
 * > **削り過ぎると向こう岸へ行けなくなる**（0-8 の「歩いて行けない面」）。
 * > **|x| ≤ 2 は削らない**——ここが最後まで残る通り道。
 *
 * 揺らぎは**波長 6 の波**で引く。1 マスごとの乱数だと、
 * **縁が虫食いの点々**になって、崩れたようには見えない。
 */
export function erodeTop(x: number, z: number, kind: Kind, d: number): number | null {
  if (kind === "plank" || d >= 2) return DECK;
  const e = (wave(SEED + 31, x, z, 6) + 1) / 2;
  // **桟道は 5 マスしかない。** 落とすと枝へ渡れなくなるので、下げるだけにする
  if (inWalk(x, z)) return d === 0 && e < 0.5 ? DECK - 1 : DECK;
  // **芯の 5 マスは落とさない。** 段だけ下げて、擦り減って見せる
  if (Math.abs(x) <= 2) return d === 0 && e < 0.55 ? DECK - 1 : DECK;
  if (d === 0) return e < 0.42 ? null : e < 0.7 ? DECK - 1 : DECK;
  return e < 0.2 ? null : e < 0.33 ? DECK - 1 : DECK;
}
