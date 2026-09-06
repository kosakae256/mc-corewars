/**
 * 17「白の神殿」の**置き物。純粋。**
 *
 * 外周の柱廊・尖塔・参道の門・内陣の天蓋・外庭の小祠。
 *
 * > ### 立てる物はすべて**1 マス角**（0-8）
 * >
 * > **3 × 3 の平屋根は、天面が 9 マスになって取り残される。**
 * > 休憩所の `pylons` と同じで、**柱 1 本を上まで伸ばす。**
 * > 持ち送りは**左右 2 つまで**——4 方向に出すと、柱と合わせて 5 マスになる。
 * > 足元の座は **y ＝ 1**——1 マスなら歩いて登れるので、天面として数えられない。
 *
 * > ### 天蓋はゲートの箱の外側だけ（0-2-1）
 * >
 * > **ゲートの箱 (1,1,39)〜(−1,5,39) には何も置かない。**
 * > 天蓋の柱は x ＝ ±3、屋根は y ＝ 12。**ポータルは進行の側が置く。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { glassOf } from "./map-sanctum-mat.js";
import { APSE_CZ, FRONT_Z, ISLE_R, SEED } from "./map-sanctum-plan.js";

/** 足元の座を敷く。**y ＝ 1 の 1 段だけ** */
function seat(ops: BuildOp[], x: number, z: number, half: number): void {
  for (let ax = -half; ax <= half; ax++) {
    for (let az = -half; az <= half; az++) {
      if (ax === 0 && az === 0) continue;
      const edge = Math.abs(ax) === half || Math.abs(az) === half;
      ops.push(set(x + ax, GROUND + 1, z + az, edge ? "calcite" : "quartz_bricks"));
    }
  }
}

/** 尖塔。**柱 1 本＋左右の持ち送り**——天面が 3 マスを超えない */
function spire(ops: BuildOp[], x: number, z: number, top: number, dx: number): void {
  seat(ops, x, z, 3);
  ops.push(fill(x, GROUND + 1, z, x, GROUND + top, z, "quartz_pillar"));
  for (let y = 6; y < top; y += 6) ops.push(set(x, GROUND + y, z, "calcite"));
  ops.push(set(x, GROUND + top + 1, z, "chiseled_quartz_block"));
  ops.push(fill(x, GROUND + top + 2, z, x, GROUND + top + 4, z, glassOf(41, x, z)));
  ops.push(set(x, GROUND + top + 5, z, "sea_lantern"));
  ops.push(set(x, GROUND + top + 6, z, "end_rod"));
  for (const s of [-1, 1]) {
    for (const y of [Math.floor(top / 2), top - 3]) {
      ops.push(set(x + s * dx, GROUND + y, z + (dx === 0 ? s : 0), "chiseled_quartz_block"));
    }
  }
}

/** 外庭に立てる尖塔。**4 本だけ。高さも向きも 1 本ずつ変える**（0-6） */
function spires(ops: BuildOp[]): void {
  const rows: readonly (readonly [number, number, number, number])[] = [
    [-35, -14, 20, 1],
    [36, 2, 16, 0],
    [-34, 19, 22, 0],
    [34, -30, 18, 1],
  ];
  for (const [x, z, top, dx] of rows) spire(ops, x, z, top, dx);
}

/** 外周の柱廊の半径。**島の縁の内側**——座（半径 1）を入れても外へ出ない */
const RING_R = 42;

/**
 * 島の縁をめぐる柱廊。
 *
 * > ### 細い柱を並べすぎると、絵が「爪楊枝の束」になる（2026-09-06）
 * >
 * > 上から見た絵で、外庭に立てた柱が**白い筋の束**にしか見えなかった。
 * > **多くを折れた根株にして、高いものは 3〜4 本に絞る。**
 * > 代わりに**1 マスの縁石で輪を引く**——線は残り、筋は出ない。
 *
 * **参道の側（入口の正面）は空ける**——並べると門が見えなくなる。
 */
function peristyle(ops: BuildOp[]): void {
  // ---- 縁石の輪。**1 マス高**なので歩いて越えられる（0-8）
  for (let z = -RING_R - 1; z <= RING_R + 1; z++) {
    for (let x = -RING_R - 1; x <= RING_R + 1; x++) {
      const d = Math.hypot(x, z);
      if (d < RING_R - 0.6 || d > RING_R + 0.6) continue;
      if (z < -30 && Math.abs(x) < 26) continue;
      ops.push(set(x, GROUND + 1, z, ((x + z) & 1) === 0 ? "quartz_bricks" : "calcite"));
    }
  }
  for (let i = 0; i < 12; i++) {
    const t = ((i * 30 + 15) * Math.PI) / 180;
    const x = Math.round(Math.cos(t) * RING_R);
    const z = Math.round(Math.sin(t) * RING_R);
    if (z < -30 && Math.abs(x) < 26) continue;
    const n = noise(SEED + 101, x, z);
    seat(ops, x, z, 2);
    // ---- ほとんどは折れた根株。**3 本に 1 本だけ立っている**（0-6）
    if (n < 0.68) {
      const stub = 2 + Math.floor(n * 7);
      ops.push(fill(x, GROUND + 1, z, x, GROUND + stub, z, "quartz_pillar"));
      ops.push(set(x, GROUND + stub, z, "calcite"));
      continue;
    }
    const top = 13 + Math.floor(n * 6);
    ops.push(fill(x, GROUND + 1, z, x, GROUND + top, z, "quartz_pillar"));
    ops.push(set(x, GROUND + 5, z, "calcite"));
    ops.push(set(x, GROUND + top + 1, z, "chiseled_quartz_block"));
    ops.push(set(x, GROUND + top + 2, z, "sea_lantern"));
  }
}

/**
 * 内陣の天蓋（キボリウム）。**ゲートの真上に架ける。**
 *
 * **|x| ≦ 3・z ≧ 39 に収める**——検査はこの範囲の天面を見ない（0-8 の門の例外）。
 */
function canopy(ops: BuildOp[]): void {
  for (const sx of [-3, 3]) {
    for (const z of [39, 42]) {
      ops.push(fill(sx, GROUND + 1, z, sx, GROUND + 11, z, "quartz_pillar"));
      ops.push(set(sx, GROUND + 4, z, "calcite"));
      ops.push(set(sx, GROUND + 13, z, "end_rod"));
    }
  }
  ops.push(fill(-3, GROUND + 12, 39, 3, GROUND + 12, 42, "quartz_bricks"));
  ops.push(fill(-2, GROUND + 13, 40, 2, GROUND + 13, 41, "smooth_quartz"));
  ops.push(fill(-1, GROUND + 14, 40, 1, GROUND + 14, 41, "sea_lantern"));
}

/**
 * 祭壇。**ゲートの手前に据える。**
 *
 * **壇は 1 段だけ**（0-8）。真ん中の 1 マスだけ高くする——
 * **1 マス角なら、辿り着けなくても取り残されない。**
 */
function altar(ops: BuildOp[], z: number): void {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      ops.push(set(dx, GROUND + 1, z + dz, Math.abs(dx) === 2 || Math.abs(dz) === 2 ? "calcite" : "quartz_bricks"));
    }
  }
  ops.push(fill(0, GROUND + 2, z, 0, GROUND + 3, z, "chiseled_quartz_block"));
  ops.push(set(0, GROUND + 4, z, "sea_lantern"));
}

/** 内陣の飾り。**段は作らない**——床は y ＝ 0 のまま（0-8） */
function chancel(ops: BuildOp[]): void {
  for (const sx of [-8, 8]) {
    for (const z of [APSE_CZ - 1, APSE_CZ + 6]) {
      ops.push(fill(sx, GROUND + 1, z, sx, GROUND + 4, z, "quartz_pillar"));
      ops.push(set(sx, GROUND + 5, z, "sea_lantern"));
      ops.push(set(sx, GROUND + 6, z, "end_rod"));
    }
  }
  // ---- 内陣の床。**輪を敷いて、ゲートの正面を示す**
  for (let dz = -4; dz <= 7; dz++) {
    for (let dx = -7; dx <= 7; dx++) {
      const d = Math.round(Math.hypot(dx, dz));
      if (d > 7 || d < 5) continue;
      ops.push(set(dx, GROUND, APSE_CZ + dz, d === 5 ? "polished_diorite" : "calcite"));
    }
  }
}

/**
 * 参道の門。**湧く所と神殿の間に立てる。**
 *
 * **x ＝ 0 の帯には何も置かない**（0-3）——梁は渡さない。
 * **柱は x ＝ ±11**——湧く所の足場は x ＝ ±5・z ＝ −45〜−35 を抜くので、
 * **そこに柱を立てると足元だけ消えて宙に浮く**（0-5。実際に落ちた）。
 */
function processionGate(ops: BuildOp[], z: number, top: number): void {
  for (const sx of [-11, 11]) {
    seat(ops, sx, z, 1);
    ops.push(fill(sx, GROUND + 1, z, sx, GROUND + top, z, "quartz_pillar"));
    ops.push(set(sx, GROUND + 4, z, "calcite"));
    ops.push(set(sx, GROUND + top + 1, z, "chiseled_quartz_block"));
    ops.push(set(sx, GROUND + top + 2, z, "sea_lantern"));
    ops.push(set(sx, GROUND + top + 3, z, "end_rod"));
  }
}

/** 外庭の小祠。**柱 1 本と、その足元の座**——回り込めるので登れなくてよい */
function shrines(ops: BuildOp[]): void {
  const rows: readonly (readonly [number, number])[] = [
    [-38, -18],
    [37, -12],
    [-36, 20],
    [30, 34],
  ];
  for (const [x, z] of rows) {
    if (Math.hypot(x, z) > ISLE_R - 3) continue;
    const h = 4 + Math.floor(noise(SEED + 97, x, z) * 5);
    seat(ops, x, z, 1);
    ops.push(fill(x, GROUND + 1, z, x, GROUND + h, z, "quartz_pillar"));
    ops.push(set(x, GROUND + h + 1, z, "sea_lantern"));
    ops.push(set(x, GROUND + h + 2, z, "end_rod"));
  }
}

/** 置き物を並べる。**外殻と列柱のあとに呼ぶ** */
export function propOps(ops: BuildOp[]): void {
  peristyle(ops);
  spires(ops);
  shrines(ops);
  processionGate(ops, FRONT_Z - 5, 14);
  processionGate(ops, FRONT_Z - 13, 10);
  chancel(ops);
  altar(ops, APSE_CZ + 3);
  canopy(ops);
}
