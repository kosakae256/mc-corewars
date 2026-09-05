/**
 * 休憩所の 3 択のテスト。
 *
 * ```
 * npm test
 * ```
 *
 * **多数決**（`worlds/pve-v3/docs/spec/13-flow.md` 3-2）。
 * **候補の引き方**は `LEGIONS` を読むので、ここでは見ない。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { winner } from "../scripts/core/tally.ts";

/** 決め打ちの「ランダム」 */
function fixed(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe("3 択 — 多数決", () => {
  it("**いちばん多いものが勝つ**", () => {
    assert.equal(winner([1, 3, 2], fixed([0])), 1);
    assert.equal(winner([5, 0, 0], fixed([0])), 0);
    assert.equal(winner([0, 0, 4], fixed([0])), 2);
  });

  it("**同数なら、その中から引く**", () => {
    // 0 と 2 が同数。引き値 0 → 前のほう、0.99 → 後ろのほう
    assert.equal(winner([2, 1, 2], fixed([0])), 0);
    assert.equal(winner([2, 1, 2], fixed([0.99])), 2);
  });

  it("**誰も入れなければ、3 つから引く**", () => {
    assert.equal(winner([0, 0, 0], fixed([0.5])), 1);
    assert.equal(winner([0, 0, 0], fixed([0])), 0);
  });
});
