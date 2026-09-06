/**
 * 戦場 02「雲の上の浮島」——**島と島を繋ぐ橋。純粋。**
 *
 * **どこに架けるかは `map-skyisles-net.ts`。** ここは架け方だけ。
 *
 * > ### 迫り（アーチ）は**端で厚く、中央で薄い**
 * >
 * > **浮いた板を渡さない**（0-5）。橋桁は島の縁から生え、
 * > **中央へ向かって細くなる**——石橋の形そのもの。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, speckle } from "./map-frame.js";
import { SPANS, type Span } from "./map-skyisles-net.js";
import { RIM, SEED, key } from "./map-skyisles-shape.js";
import { stand } from "./map-skyisles-terrain.js";

/** 中心線の 1 点 */
interface Node {
  readonly x: number;
  readonly z: number;
  readonly land: boolean;
  /** 迫りの厚み。**陸の上では使わない** */
  thick: number;
}

/** 甲板の 1 マス */
interface Cell {
  readonly x: number;
  readonly z: number;
  /** 中心からの外れ。**|w| が半幅と等しいマスだけが欄干になる** */
  readonly w: number;
  readonly node: Node;
}

/** 橋を全部架ける。**返すのは敷き終えた甲板のマス**——散らしものを載せないため */
export function spans(ops: BuildOp[], tops: Map<string, number>): Set<string> {
  const paved = new Set<string>();
  for (const s of SPANS) bridge(ops, tops, s, paved);
  return paved;
}

function bridge(ops: BuildOp[], tops: Map<string, number>, s: Span, paved: Set<string>): void {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len = Math.hypot(dx, dz);
  if (len < 1) return;
  const px = -dz / len;
  const pz = dx / len;
  const steps = Math.ceil(len * 4);

  // ---- まず中心線を辿って、**どこが空中なのか**を知る
  const line: Node[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = Math.round(s.ax + dx * u);
    const z = Math.round(s.az + dz * u);
    line.push({ x, z, land: tops.has(key(x, z)), thick: 1 });
  }
  archOf(line, s.thick);

  // ---- どのマスを何に使うか決める
  //
  // > ### 丸めた座標はぶつかる
  // >
  // > 斜めの橋では、**中心の列と欄干の列が同じマスに落ちる**ことがある。
  // > 先に置いたほうを残すと**欄干だけの橋**ができ、渡れなくなる（0-8）。
  // > **中心に近いほうを勝たせる。**
  const cells = new Map<string, Cell>();
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const node = line[i];
    if (node === undefined) continue;
    for (let w = -s.half; w <= s.half; w++) {
      const x = Math.round(s.ax + dx * u + px * w);
      const z = Math.round(s.az + dz * u + pz * w);
      if (Math.hypot(x, z) > RIM) continue;
      const k = key(x, z);
      const prev = cells.get(k);
      if (prev !== undefined && Math.abs(prev.w) <= Math.abs(w)) continue;
      cells.set(k, { x, z, w, node });
    }
  }

  for (const [k, c] of cells) {
    const land = tops.get(k);
    const y = land ?? GROUND;
    ops.push(set(c.x, y, c.z, speckle(SEED + 111, c.x, c.z, s.deck)));
    paved.add(k);
    if (land !== undefined) continue;
    // **空中。** 迫りを下ろし、縁に欄干を立てる
    ops.push(fill(c.x, y - c.node.thick, c.z, c.x, y - 1, c.z, speckle(SEED + 113, c.x, c.z, s.arch)));
    tops.set(k, y);
    if (Math.abs(c.w) === s.half && s.rail !== undefined) ops.push(set(c.x, y + 1, c.z, s.rail));
  }
  lamps(ops, tops, s, line, px, pz, len, steps);
}

/**
 * 迫りの厚みを決める。
 *
 * **空中が続く一続き**を見つけ、**その両端で厚く、真ん中で薄く**する。
 * 橋の長さではなく**「渡っている隙間」**を基準にしないと、
 * 短い橋がぺらぺらの板になる。
 */
function archOf(line: Node[], thick: number): void {
  let i = 0;
  while (i < line.length) {
    if (line[i]?.land !== false) {
      i++;
      continue;
    }
    let j = i;
    while (j < line.length && line[j]?.land === false) j++;
    const run = j - i;
    for (let k = i; k < j; k++) {
      const v = run <= 1 ? 0.5 : (k - i) / (run - 1);
      const node = line[k];
      if (node !== undefined) node.thick = 1 + Math.round(thick * (1 - Math.sin(Math.PI * v)));
    }
    i = j;
  }
}

/**
 * 灯柱。**空中の所だけ**、左右に立てる。
 *
 * **間隔はマスで数える。** 刻みの番号で数えると、
 * **細かく刻んだ橋ほど柱が密になり**、柱の列が「登れない面」になる（0-8）。
 */
function lamps(
  ops: BuildOp[],
  tops: Map<string, number>,
  s: Span,
  line: Node[],
  px: number,
  pz: number,
  len: number,
  steps: number
): void {
  const post = s.post;
  if (post === undefined) return;
  for (let d = post.every; d < len; d += post.every) {
    const node = line[Math.round((d / len) * steps)];
    if (node === undefined || node.land) continue;
    for (const side of [-1, 1]) {
      const x = Math.round(node.x + px * s.half * side);
      const z = Math.round(node.z + pz * s.half * side);
      stand(ops, tops, x, z, 3, [post.mat], "lantern");
    }
  }
}
