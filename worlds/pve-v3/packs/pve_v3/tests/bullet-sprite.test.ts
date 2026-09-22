/** クライアントで飛ぶ一粒が、次の表示や射程端を越えないことを確認する。 */
import assert from "node:assert/strict";
import { it } from "node:test";
import { bulletSpriteLife, BULLET_SPRITE_TICKS } from "../scripts/core/bullet-sprite.ts";

it("丸弾は次の表示の位置で寿命を迎え、軌跡として残らない", () => {
  for (const speed of [0.1, 0.225, 1]) {
    const life = bulletSpriteLife(speed, 30);
    assert.equal(life, BULLET_SPRITE_TICKS / 20);
    assert.equal(speed * 20 * life, speed * BULLET_SPRITE_TICKS);
  }
});

it("射程末端で表示が飛び越えず、終了した弾は描かない", () => {
  for (const remaining of [0.01, 0.2, 0.8]) {
    assert(Math.abs(bulletSpriteLife(0.225, remaining) * 4.5 - remaining) < 1e-9);
  }
  assert.equal(bulletSpriteLife(0.225, 0), 0);
  assert.equal(bulletSpriteLife(0, 30), 0);
});
