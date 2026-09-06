/**
 * 戦場 13「氷河の裂け目」（`crevasse`）——**組み立ての口。純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 13 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 * map-crevasse-shape.ts   どこに床が有るか（島・裂け目・枝の亀裂）
 * map-crevasse-span.ts    渡る所と雪庇（柱 1 本ぶんの天面と腹）
 * map-crevasse-mat.ts     どのマスに何を置くか（表の雪と、壁の地層）
 * map-crevasse-deco.ts    上下に伸びるもの（氷柱・吊り氷柱・索具・門）
 * ```
 *
 * > ### 渡る所は 3 本だけ
 * >
 * > | | どこ | 姿 |
 * > | --- | --- | --- |
 * > | **氷の橋** | x ＝ −29 | **自然に残った氷の迫り。** 岸で深く、真ん中で薄い |
 * > | **岩の詰まり** | x ＝ 0 | **落ちた岩が挟まった所。** 1 マスずつ降りて、また上がる |
 * > | **板と縄** | x ＝ +27 | **人が架けたもの。** 帆柱・索・吊り鎖 |
 * >
 * > **それ以外は落ちる。** 裂け目に底は無い。
 *
 * > ### 手順は「平面 → 上下」の順で出す
 * >
 * > **先に柱の表を作り、天面を均してから積む。**
 * > 均す前に飾りを置くと、**下がった床の上に手すりだけが残る。**
 */

import { set, type BuildOp } from "./build.js";
import { clearBox, gateBack, GROUND, openGate, spawnPad, SPAWN_Z } from "./map-frame.js";
import { key, NEIGH, type Col } from "./map-crevasse-shape.js";
import { colAt } from "./map-crevasse-span.js";
import { bodyOps, snowSkin, surfaceOf } from "./map-crevasse-mat.js";
import { gateFrameOps, icicleOps, ropeOps, seracOps } from "./map-crevasse-deco.js";

/** 端。**±47 に収めてある**（0-1 の上限は ±50） */
const REACH = 47;

/**
 * **一人ぼっちの床を消す。**
 *
 * 枝の亀裂が縁を削ったあと、**隣が 1 つ以下しか残っていない柱**が出る。
 * その柱は**島から切り離された塊**になり 0-5 が落ちる
 * （実際に、雪庇の先が 2 か所ちぎれて残った）。
 *
 * **落ち着くまで繰り返す**——消した隣が、また一人になるため。
 */
function prune(cols: Map<string, Col>): void {
  for (let pass = 0; pass < 6; pass++) {
    const drop: string[] = [];
    for (const c of cols.values()) {
      let n = 0;
      for (const [dx, dz] of NEIGH) {
        if (cols.has(key(c.x + dx, c.z + dz))) n++;
      }
      if (n < 2) drop.push(key(c.x, c.z));
    }
    if (drop.length === 0) return;
    for (const k of drop) cols.delete(k);
  }
}

/**
 * **1 段ずつしか上がれないように均す**（0-8）。
 *
 * > ### 隣を見ないで積むと、登れない面ができる
 * >
 * > 吹き溜まりも雪庇も岩の詰まりも 1 マスごとに引いているので、
 * > **隣が 0 段なのに自分が 2 段**という所が必ず出る。
 * >
 * > **下げるだけ**なので形は壊れない。落ち着くまで繰り返す。
 */
function relax(cols: ReadonlyMap<string, Col>): void {
  for (let pass = 0; pass < 6; pass++) {
    let moved = 0;
    for (const c of cols.values()) {
      let lo = 99;
      for (const [dx, dz] of NEIGH) {
        const n = cols.get(key(c.x + dx, c.z + dz));
        if (n !== undefined) lo = Math.min(lo, n.top);
      }
      if (lo < 99 && c.top > lo + 1) {
        c.top = lo + 1;
        moved++;
      }
    }
    if (moved === 0) break;
  }
  // **腹を天面より下に保つ**——均したあとで上下が入れ替わると、帯が裏返る
  for (const c of cols.values()) c.bottom = Math.min(c.bottom, c.top - 1);
}

/** 裂け目や島の縁に面しているか。**面した柱だけ、地層を細かく積む** */
function isFace(cols: ReadonlyMap<string, Col>, c: Col): boolean {
  for (const [dx, dz] of NEIGH) {
    if (!cols.has(key(c.x + dx, c.z + dz))) return true;
  }
  return false;
}

/**
 * 湧く所の足場を敷き直す。**副作用は無い**（手順を足すだけ）。
 *
 * `spawnPad` は**一色の四角**で塗る（`map-frame.ts`）。
 * そのままだと**雪原の真ん中に、人工の板が 11 × 11 で残る。**
 * **同じ引き方で敷き直して馴染ませる。**
 */
function repave(ops: BuildOp[]): void {
  for (let x = -5; x <= 5; x++) {
    for (let z = SPAWN_Z - 5; z <= SPAWN_Z + 5; z++) ops.push(set(x, GROUND, z, snowSkin(x, z)));
  }
}

/** 組み立ての手順 */
export function crevasseOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);

  // ---- 平面を決める。**裂け目の中は `null`**——底を作らない
  const cols = new Map<string, Col>();
  for (let x = -REACH; x <= REACH; x++) {
    for (let z = -REACH; z <= REACH; z++) {
      const c = colAt(x, z);
      if (c !== null) cols.set(key(x, z), c);
    }
  }
  prune(cols);
  relax(cols);

  for (const c of cols.values()) {
    ops.push(set(c.x, c.top, c.z, surfaceOf(c)));
    bodyOps(ops, c, isFace(cols, c));
  }

  seracOps(ops, cols);
  icicleOps(ops, cols);
  ropeOps(ops, cols);
  gateFrameOps(ops);

  // **地形を積んだあとに足場を置き直す**（0-2）——生成に消させない
  spawnPad(ops, "snow");
  repave(ops);
  gateBack(ops, "packed_ice");
  openGate(ops);
  return ops;
}
