/**
 * 戦場 08「黒曜石の祭壇」（`altar`）。**純粋。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 8 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **拓けた黒石の広場。その真ん中に、祭壇が一基だけ建つ。**
 * >
 * > 外周は**ぜんぶ平ら**——戦う場所を広く取り、床の紋様だけで見せる。
 * > 中央に**正方形の三層の祭壇**が建ち、二のテラスを**列柱**が囲む。
 * > 聖路が南北に貫き、突き当りが**迫り出し天井の聖所**。
 * > **盤面のいちばん高い所は、ちょうど中心。**
 * >
 * > **縁から先は無い。** 落ちれば奈落。
 *
 * > ### **周りの山をやめた**（2026-09-06 作り直し）
 * >
 * > 前の版は外周にも胸壁・控え壁・塔を並べたので、
 * > **祭壇が「その他の山」に埋もれた。**
 * > **1 か所を見せ場にして、周りは静かにする。**
 *
 * ## 形の要
 *
 * | | |
 * | --- | --- |
 * | **外へ出られない**（0-4） | 縁の外は奈落。**高さの飾りは縁に置かない** |
 * | **ゲートが見える**（0-3） | **中央を貫く聖路を切り下げ**、天井は目線のはるか上に架ける |
 * | **どこでも登れる**（0-8） | 段も聖路の脇も**1 マスずつ。** 天井さえ端から歩いて登れる |
 *
 * **数は 3 枚に分けてある**——形は `map-altar-form.ts`、飾りは `map-altar-decor.ts`。
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, gateBack, openGate, spawnPad } from "./map-frame.js";
import { altarDecorOps, altarGateOps } from "./map-altar-decor.js";
import { bodyAt, bottomAt, corniceAt, EDGE, surfaceAt, topAt } from "./map-altar-form.js";

/** 走らせる端。**島は半径 46 の真円** */
const LIMIT = EDGE;

/**
 * 島そのもの。**柱 1 本につき、中身・天端の帯・表面の 3 手。**
 *
 * 表面を別に置くのは、**1 マスごとに引いた材**（0-7）を表面だけに出すため。
 * **天端の帯**（`corniceAt`）は、崖から見たときに切り口が締まって見えるように入れる。
 */
function ground(ops: BuildOp[]): void {
  for (let x = -LIMIT; x <= LIMIT; x++) {
    for (let z = -LIMIT; z <= LIMIT; z++) {
      const top = topAt(x, z);
      if (top === undefined) continue;
      const bottom = bottomAt(x, z);
      const band = Math.max(bottom, top - 3);
      if (band > bottom) ops.push(fill(x, bottom, z, x, band - 1, z, bodyAt(x, z)));
      ops.push(fill(x, band, z, x, top - 1, z, corniceAt(x, z)));
      ops.push(set(x, top, z, surfaceAt(x, z, top)));
    }
  }
}

/**
 * 組み立ての手順。**この順でないと壊れる。**
 *
 * | 順 | なぜ |
 * | --- | --- |
 * | 飾り → 足場 | `spawnPad` は y ＝ 1〜3 を空ける。**あとに置かないと飾りが足を抜かれる** |
 * | 最後に `openGate` | **ゲートの箱は空ける**（`14-map-build.md` 0-2-1） |
 */
export function altarOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  ground(ops);
  altarDecorOps(ops);
  gateBack(ops, "polished_blackstone_bricks");
  altarGateOps(ops);
  spawnPad(ops, "polished_blackstone");
  openGate(ops);
  return ops;
}
