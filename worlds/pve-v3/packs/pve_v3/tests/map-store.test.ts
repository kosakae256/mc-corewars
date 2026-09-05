/**
 * マップの割り方のテスト。
 *
 * ```
 * npm test
 * ```
 *
 * **1 枚を置いている間サーバーが止まる**ので、割り方を細かくした
 * （`worlds/pve-v3/docs/spec/14-map-build.md` 2-2）。
 * **割り直したときに、隙間も重なりも作らないこと**をここで固める。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { spansOf } from "../scripts/core/grid.ts";

/** 戦場の半径（`core/places.ts` の `FIELD.half`）。**ここは値だけ写す** */
const HALF = 50;

describe("マップ — 区画の割り方", () => {
  for (const grid of [2, 3, 4, 5]) {
    it(`**${grid} 等分で ±${HALF} を隙間なく覆う**`, () => {
      const cuts = spansOf(HALF, grid);
      assert.equal(cuts.length, grid);

      // **1 マスずつ、ちょうど 1 つの区切りに入る**
      const seen = new Map<number, number>();
      for (const [a, b] of cuts) {
        assert.ok(a <= b, `${a}〜${b} が空`);
        for (let v = a; v <= b; v++) seen.set(v, (seen.get(v) ?? 0) + 1);
      }
      assert.equal(seen.size, HALF * 2 + 1, "覆えていない所がある");
      for (const [v, n] of seen) assert.equal(n, 1, `${v} が ${n} 個に入っている`);
    });

    it(`**${grid} 等分の 1 枚は、1 辺 64 マスに収まる**`, () => {
      for (const [a, b] of spansOf(HALF, grid)) assert.ok(b - a + 1 <= 64, `${a}〜${b} が 64 を超える`);
    });
  }

  it("**端は −50 と +50。使い切る**", () => {
    for (const grid of [1, 2, 4, 8]) {
      const cuts = spansOf(HALF, grid);
      assert.equal(cuts[0]?.[0], -HALF);
      assert.equal(cuts[cuts.length - 1]?.[1], HALF);
    }
  });

  it("**4 等分は 26・25・25・25**（101 は割り切れない）", () => {
    assert.deepEqual(
      spansOf(HALF, 4).map(([a, b]) => b - a + 1),
      [25, 25, 25, 26]
    );
  });
});
