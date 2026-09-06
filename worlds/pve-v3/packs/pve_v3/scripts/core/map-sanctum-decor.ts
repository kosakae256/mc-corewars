/**
 * 17「白の神殿」の**床と、荒れ具合。純粋。**
 *
 * > ### 市松は**休憩所と同じ流儀**
 * >
 * > **目は 3 マス。** 1 マスだと細かすぎて模様に見えない
 * > （`core/rest-temple.ts` の `checker`）。
 * > **身廊は 3 マスの大きな市松、側廊は 2 マスの細かい市松**——
 * > 歩いている場所が、床の目で分かるようにする。
 *
 * > ### **こちらは手入れされていない**
 * >
 * > 休憩所は磨かれた床だが、戦場の神殿は**罅が入り、苔が乗り、瓦礫が散る。**
 * > **1 マスごとに引く**（0-7）——区画で塗り分けない。
 */

import { fill, halfWidth, set, type BuildOp } from "./build.js";
import { GROUND, noise, smoothWave } from "./map-frame.js";
import { aisleTile, courtPave, naveTile, pathStone } from "./map-sanctum-mat.js";
import { APSE_CZ, APSE_R, BACK_Z, FRONT_Z, ISLE_R, NAVE_HALF, PIER_X, SEED, WALL_X } from "./map-sanctum-plan.js";

/** 後陣（アプス）の中か */
function inApse(x: number, z: number): boolean {
  return z >= APSE_CZ && Math.hypot(x, z - APSE_CZ) <= APSE_R + 1;
}

/** その 1 マスの敷石 */
function surfaceAt(x: number, z: number): string {
  if (inApse(x, z)) return naveTile(x, z);
  if (z >= FRONT_Z && z <= BACK_Z) {
    if (Math.abs(x) <= NAVE_HALF) return naveTile(x, z);
    if (Math.abs(x) <= WALL_X) return aisleTile(x, z);
  }
  if (z < FRONT_Z && Math.abs(x) <= 15) return pathStone(x, z);
  return courtPave(x, z);
}

/** 島の天面を、**1 マスずつ**敷く */
function paving(ops: BuildOp[]): void {
  for (let z = -ISLE_R; z <= ISLE_R; z++) {
    const w = halfWidth(ISLE_R, z);
    for (let x = -w; x <= w; x++) ops.push(set(x, GROUND, z, surfaceAt(x, z)));
  }
}

/**
 * 交差部の輪。**身廊の真ん中に、床の紋章を敷く。**
 *
 * **段差にはしない**——参道の視線（0-3）と、1 マス段差の決まり（0-8）を守る。
 */
function rosette(ops: BuildOp[]): void {
  const rings: readonly string[] = [
    "sea_lantern",
    "chiseled_quartz_block",
    "calcite",
    "quartz_block",
    "polished_diorite",
    "calcite",
    "quartz_bricks",
    "quartz_block",
    "polished_diorite",
    "calcite",
    "quartz_block",
    "polished_diorite",
  ];
  for (let dz = -11; dz <= 11; dz++) {
    for (let dx = -11; dx <= 11; dx++) {
      const d = Math.round(Math.hypot(dx, dz));
      if (d > 11) continue;
      ops.push(set(dx, GROUND, dz, rings[d] as string));
    }
  }
  // ---- 放射の筋。**休憩所の `spokes` と同じ考え**（中心から外へ引く）
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (let d = 12; d <= 19; d++) {
      const x = Math.round(Math.cos(t) * d);
      const z = Math.round(Math.sin(t) * d);
      if (Math.abs(x) > NAVE_HALF) continue;
      ops.push(set(x, GROUND, z, i % 2 === 0 ? "calcite" : "polished_diorite"));
    }
  }
}

/** そこへ物を置いてよいか。**参道の帯と、湧く所の箱は空けておく** */
function free(x: number, z: number): boolean {
  if (Math.abs(x) <= 2 && z <= 34) return false;
  if (Math.abs(x) <= 11 && z >= 31) return false;
  return !(Math.abs(x) <= 6 && z >= -46 && z <= -34);
}

/** 神殿の外か。**中には高いものを積まない** */
function outside(x: number, z: number): boolean {
  if (inApse(x, z)) return false;
  return !(Math.abs(x) <= WALL_X + 1 && z >= FRONT_Z - 1 && z <= BACK_Z + 1);
}

/** 倒れた柱。**寝かせた柱身**。1 マス高なので歩いて越えられる */
function fallenPillar(ops: BuildOp[], x: number, z: number, dx: number, dz: number, len: number): void {
  for (let i = 0; i < len; i++) {
    const px = x + dx * i;
    const pz = z + dz * i;
    if (!free(px, pz)) continue;
    ops.push(set(px, GROUND + 1, pz, i === 0 || i === len - 1 ? "chiseled_quartz_block" : "quartz_pillar"));
  }
}

/** 散らばる瓦礫。**同じ形を並べない**（0-6） */
function rubble(ops: BuildOp[]): void {
  for (let z = -ISLE_R + 2; z <= ISLE_R - 2; z++) {
    const w = halfWidth(ISLE_R - 2, z);
    for (let x = -w; x <= w; x++) {
      if (!free(x, z)) continue;
      const n = noise(SEED + 61, x, z);
      const bias = (smoothWave(SEED + 67, x, z, 13) + 1) / 2;
      if (n > 0.028 + bias * 0.045) continue;
      const kind = noise(SEED + 71, x, z);
      const block = kind < 0.3 ? "diorite" : kind < 0.55 ? "andesite" : kind < 0.8 ? "calcite" : "quartz_bricks";
      ops.push(set(x, GROUND + 1, z, block));
      // ---- ときどき 2 段。**神殿の中には積まない**
      //
      // > ### 2 マスの瓦礫が、柱の起こしに触ると落ちる（0-8）
      // >
      // > 起こし（柱 1 ＋ 2 マス）で既に上限の 3 マス。
      // > **隣に辿り着けない天面がもう 1 つ来ると 4 マスになる。**
      if (kind > 0.94 && outside(x, z)) ops.push(set(x, GROUND + 2, z, "mossy_cobblestone"));
    }
  }
}

/** 苔。**日陰の側に寄せる**——一様に撒かない（0-7） */
function moss(ops: BuildOp[]): void {
  for (let z = -ISLE_R + 1; z <= ISLE_R - 1; z++) {
    const w = halfWidth(ISLE_R - 1, z);
    for (let x = -w; x <= w; x++) {
      if (!free(x, z)) continue;
      // **湿った側にだけ寄せる。** 一様に撒くと、床が緑の紙吹雪になる（0-7）
      const damp = (smoothWave(SEED + 83, x, z, 23) + 1) / 2;
      const n = noise(SEED + 89, x, z);
      if (n > Math.max(0, damp - 0.58) * 0.55) continue;
      ops.push(set(x, GROUND + 1, z, n < 0.02 ? "azalea_leaves" : "moss_carpet"));
    }
  }
}

/** 倒れた柱を、**長さも向きも変えて**置く（0-6） */
function fallen(ops: BuildOp[]): void {
  const rows: readonly (readonly [number, number, number, number, number])[] = [
    [30, -32, 1, 0, 7],
    [-38, -12, 0, 1, 9],
    [35, 6, 0, 1, 6],
    [-34, 26, 1, 0, 8],
    [18, 38, 1, 0, 5],
    [-20, -26, 0, 1, 6],
    [37, 16, 1, 1, 5],
    [-40, 24, 1, 0, 7],
    [22, -20, 0, 1, 7],
    [6, -14, 0, 1, 8],
    [-7, 4, 0, 1, 7],
    [8, 20, 1, 0, 4],
    [-9, -2, 1, 0, 5],
  ];
  for (const [x, z, dx, dz, len] of rows) fallenPillar(ops, x, z, dx, dz, len);
}

/** 床と荒れ具合を敷く。**建物より先に呼ぶ** */
export function floorOps(ops: BuildOp[]): void {
  paving(ops);
  rosette(ops);
}

/**
 * 瓦礫と苔。
 *
 * **建物より先に呼ぶ**——柱や壁の足元に来たものは、あとから上書きされて消える。
 * **逆にすると、壁の中に瓦礫が埋まる。**
 */
export function ruinOps(ops: BuildOp[]): void {
  fallen(ops);
  rubble(ops);
  moss(ops);
}
