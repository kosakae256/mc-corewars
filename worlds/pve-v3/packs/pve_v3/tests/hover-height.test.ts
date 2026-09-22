import assert from "node:assert/strict";
import { it } from "node:test";
import { groundHoverVelocity } from "../scripts/core/hover-height.ts";

it("低空飛行は地面から1〜2マスの帯へ収束する", () => {
  for (const start of [0, 0.5, 2, 5, 20]) {
    let height = start;
    for (let i = 0; i < 200; i++) height += groundHoverVelocity(height, 1, 2) * 2;
    assert(height >= 1 && height <= 2);
  }
});

it("崖で地面が見つからない場合は上昇せず、降下を続ける", () => {
  assert(groundHoverVelocity(undefined, 1, 2) < 0);
  assert.equal(groundHoverVelocity(1.5, 1, 2), 0);
  assert(groundHoverVelocity(30, 1, 2) >= -0.16);
});
