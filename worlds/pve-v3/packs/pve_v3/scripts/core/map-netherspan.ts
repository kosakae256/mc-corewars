/**
 * 戦場 06「深淵の橋」（`netherspan`）——**組み立ての口。純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 6 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 * map-netherspan-shape.ts   どこに床が有るか（形）
 * map-netherspan-mat.ts     どのマスに、どの石を置くか（材）
 * map-netherspan-under.ts   その下に何が伸びているか（アーチ・橋脚・鎖）
 * map-netherspan-deck.ts    その上に何が載るか（欄干・胸壁・柱・ゲートの枠）
 * ```
 *
 * > ### 手順は「平面 → 上下」の順で出す
 * >
 * > **欄干は「削れたあとの縁」に置きたい。**
 * > 先に**削り終えた天面の表**を作り、それを見ながら積む——
 * > 削る前の輪郭に欄干を置くと、**落ちた縁の上に手すりだけが残る。**
 */

import { set, type BuildOp } from "./build.js";
import { clearBox, gateBack, GROUND, HALF, openGate, spawnPad, SPAWN_Z } from "./map-frame.js";
import { edgeDist, erodeTop, inField, kindAt } from "./map-netherspan-shape.js";
import { gateOps, pillarOps, riseOps, type Cell, type Has } from "./map-netherspan-deck.js";
import { paveAt } from "./map-netherspan-mat.js";
import { underOps } from "./map-netherspan-under.js";

function parseKey(k: string): { x: number; z: number } {
  const p = k.split(",");
  return { x: Number(p[0] ?? 0), z: Number(p[1] ?? 0) };
}

/**
 * **一人ぼっちの床を消す。**
 *
 * 縁を削ったあと、**隣が 1 つ以下しか残っていない柱**が出ることがある。
 * その柱は**下の石ごと、島から切り離された塊**になり 0-5 が落ちる。
 * **落ち着くまで繰り返す**——消した隣が、また一人になるため。
 */
function prune(tops: Map<string, number>): void {
  for (let pass = 0; pass < 6; pass++) {
    const drop: string[] = [];
    for (const k of tops.keys()) {
      const { x, z } = parseKey(k);
      let n = 0;
      if (tops.has(`${x + 1},${z}`)) n++;
      if (tops.has(`${x - 1},${z}`)) n++;
      if (tops.has(`${x},${z + 1}`)) n++;
      if (tops.has(`${x},${z - 1}`)) n++;
      if (n < 2) drop.push(k);
    }
    if (drop.length === 0) return;
    for (const k of drop) tops.delete(k);
  }
}

/** 平面を決める。**下地の輪郭を引いてから、縁を削る** */
function plan(): Map<string, number> {
  const base = new Set<string>();
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) if (inField(x, z)) base.add(`${x},${z}`);
  }
  const inBase: Has = (x, z) => base.has(`${x},${z}`);
  const tops = new Map<string, number>();
  for (const k of base) {
    const { x, z } = parseKey(k);
    const t = erodeTop(x, z, kindAt(x, z), edgeDist(inBase, x, z));
    if (t !== null) tops.set(k, t);
  }
  prune(tops);
  return tops;
}

/**
 * 湧く所の足場を敷き直す。**副作用は無い**（手順を足すだけ）。
 *
 * `spawnPad` は**一色の四角**で塗る（`map-frame.ts`）。
 * そのままだと**岩棚の真ん中に、人工の板が 11 × 11 で残る。**
 * **同じ引き方で敷き直して馴染ませる。**
 */
function repave(ops: BuildOp[]): void {
  for (let x = -5; x <= 5; x++) {
    for (let z = SPAWN_Z - 5; z <= SPAWN_Z + 5; z++) ops.push(set(x, GROUND, z, paveAt(x, z, "rock")));
  }
}

/** 組み立ての手順 */
export function netherspanOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);

  const tops = plan();
  const has: Has = (x, z) => tops.has(`${x},${z}`);
  const cells: Cell[] = [];
  for (const [k, top] of tops) {
    const { x, z } = parseKey(k);
    cells.push({ x, z, top, kind: kindAt(x, z) });
  }

  for (const c of cells) {
    ops.push(set(c.x, c.top, c.z, paveAt(c.x, c.z, c.kind)));
    underOps(ops, c.x, c.z, c.top, c.kind);
  }

  riseOps(ops, cells, has);
  pillarOps(ops, tops);
  gateOps(ops);

  // **地形を積んだあとに足場を置き直す**（0-2）——生成に消させない
  spawnPad(ops, "deepslate_tiles");
  repave(ops);
  gateBack(ops, "polished_blackstone_bricks");
  openGate(ops);
  return ops;
}
