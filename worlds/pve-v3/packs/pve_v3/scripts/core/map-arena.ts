/**
 * 戦場 14「円形闘技場」（`arena`）。**純粋。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 14 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト（2026-09-06 に作り直した）
 *
 * > ### **石レンガの、質素な円形闘技場。2 段だけ。**
 * >
 * > ```
 * >   ████  ──────────  ────────────────────  ──────────  ████
 * >   壁    段差上 幅 6   段差下（広い・平坦）      段差上 幅 6   壁
 * >   y 12  y 0          y −6                  y 0          y 12
 * > ```
 * >
 * > 湧いた者は**段差上**（y ＝ 0）に立つ。ゲートも同じ段差上にある。
 * > 内側は**6 マス下の広い平地**——ここが戦う所。**複雑な地形は要らない。**
 * > 外は**垂直な石レンガの壁**が一周する。
 *
 * ## 形の要
 *
 * | | |
 * | --- | --- |
 * | **外へ出られない**（0-4） | **12 マスの垂直な壁。** 段も出っ張りも作らない |
 * | **ゲートが見える**（0-3） | ゲートは湧く所と同じ段差上。**あいだは 6 マス下**なので何も遮らない |
 * | **上り下り**（0-8） | **要らない。** 6 マスの崖のまま。**`waive` してある**（`core/maps.ts`） |
 * | **落ちない材**（0-11） | 砂・砂利・粉は使わない。**灰色の石だけ** |
 *
 * **数は 3 枚に分けてある**——形は `map-arena-form.ts`、材は `map-arena-mat.ts`、
 * 面の意匠は `map-arena-deco.ts`。
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, gateBack, openGate, spawnPad } from "./map-frame.js";
import { arenaDecoOps, arenaSpawnOps } from "./map-arena-deco.js";
import { bodyAt, surfaceAt } from "./map-arena-mat.js";
import { bottomAt, CAP_OUT, topAt } from "./map-arena-form.js";

/**
 * 闘技場そのもの。**柱 1 本につき、中身の 1 塗りと天面の 1 置き。**
 *
 * 天面の材を別に置くのは、**1 マスごとに引いた材**（0-7）を
 * 表面にだけ出すため——中まで塗り分けても見えないうえ、手順が倍になる。
 */
function shell(ops: BuildOp[]): void {
  for (let x = -CAP_OUT; x <= CAP_OUT; x++) {
    for (let z = -CAP_OUT; z <= CAP_OUT; z++) {
      const top = topAt(x, z);
      if (top === undefined) continue;
      ops.push(fill(x, bottomAt(x, z), z, x, top - 1, z, bodyAt(x, z)));
      ops.push(set(x, top, z, surfaceAt(x, z)));
    }
  }
}

/**
 * 組み立ての手順。**この順でないと壊れる。**
 *
 * | 順 | なぜ |
 * | --- | --- |
 * | 躯体 → 面の意匠 | 面を貼るのは、壁体が積まれてから |
 * | 意匠 → 足場 | `spawnPad` は y ＝ 1〜3 を空ける。**あとに置かないと足を抜かれる** |
 * | 最後に `openGate` | **ゲートの箱は空ける**（`14-map-build.md` 0-2-1） |
 *
 * **足場は 5 × 5**（半径 2）。**7 マス以上にすると段差上からはみ出して、
 * 下の平地に板が浮く**（`14-map-build.md` 0-2）。
 */
export function arenaOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  shell(ops);
  arenaDecoOps(ops);
  gateBack(ops, "stone_bricks");
  spawnPad(ops, "polished_andesite", 2);
  arenaSpawnOps(ops);
  openGate(ops);
  return ops;
}
