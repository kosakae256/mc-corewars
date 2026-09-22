/** 狐火の射程・角度・溜め時計。遅い更新や呪い短縮でも一撃だけ（spec/34）。 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceSweep, beginSweep, coneBasis, insideCone, insideFan } from "../scripts/core/charged-sweep.ts";

const origin = { x: 0, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const point = (angle: number, radius: number) => ({
  x: Math.sin((angle * Math.PI) / 180) * radius,
  y: 0,
  z: Math.cos((angle * Math.PI) / 180) * radius,
});

describe("狐火の一撃", () => {
  it("15マス・左右50度の境界を含み、その外側と背面は含めない", () => {
    for (const angle of [-50, 0, 50]) assert(insideFan(origin, point(angle, 15), forward, 15, 100, 2.5));
    for (const angle of [-50.1, 50.1, 180]) assert(!insideFan(origin, point(angle, 10), forward, 15, 100, 2.5));
    assert(!insideFan(origin, point(0, 15.01), forward, 15, 100, 2.5));
  });
  it("別の階層を焼かず、向きの長さや高さ成分に水平角度を左右されない", () => {
    assert(!insideFan(origin, { x: 0, y: 3, z: 1 }, forward, 15, 100, 2.5));
    assert(insideFan(origin, point(49, 12), { x: 0, y: -4, z: 2 }, 15, 100, 2.5));
    assert(insideFan(origin, origin, forward, 15, 100, 2.5));
  });
  it("既存の全周攻撃は後ろにも当たり、高さ制限を指定しなければ従来どおり", () => {
    assert(insideFan(origin, point(180, 3), undefined, 4, 360));
    assert(insideFan(origin, { x: 0, y: 3, z: 1 }, forward, 4, 360));
  });
});

describe("狐火の溜め時計", () => {
  it("通常は60tick溜める。10マス到達直後や59tick目には撃たない", () => {
    const clock = beginSweep(100, 60, 10, 60, 60);
    assert.equal(advanceSweep(clock, 100).fire, false);
    assert.equal(advanceSweep(clock, 159).fire, false);
    assert.equal(advanceSweep(clock, 160).fire, true);
  });
  it("2倍速の呪いで溜め30tick、戻り5tickになる", () => {
    const clock = beginSweep(0, 60, 10, 60, 30);
    assert.equal(advanceSweep(clock, 29).fire, false);
    const shot = advanceSweep(clock, 30);
    assert.equal(shot.fire, true);
    assert.deepEqual(shot.clock, { phase: "release", until: 35 });
    assert.equal(advanceSweep(shot.clock, 35).clock.phase, "ready");
  });
  it("1回の溜めからは1回だけ発射し、同じtickの再評価でも重ならない", () => {
    let clock = beginSweep(0, 60, 10, 60, 60);
    let shots = 0;
    for (const now of [58, 60, 60, 62, 68, 70, 70, 100]) {
      const result = advanceSweep(clock, now);
      if (result.fire) shots++;
      clock = result.clock;
    }
    assert.equal(shots, 1);
  });
  it("更新が遅れても過去分を連射せず、実際の発射から戻り時間を取る", () => {
    const result = advanceSweep(beginSweep(0, 60, 10, 60, 60), 200);
    assert.equal(result.fire, true);
    assert.deepEqual(result.clock, { phase: "release", until: 210 });
  });
  it("極端な短縮でも溜めと戻りは最低2tick", () => {
    const clock = beginSweep(0, 60, 10, 60, 0.01);
    assert.equal(advanceSweep(clock, 1).fire, false);
    assert.deepEqual(advanceSweep(clock, 2).clock, { phase: "release", until: 4 });
  });
});

describe("狐火の三次元放射", () => {
  it("上下にも50度まで届き、水平角だけ合う真上や背面には当たらない", () => {
    for (const angle of [-50, 0, 50]) {
      const p = point(angle, 15);
      assert(insideCone(origin, { x: 0, y: p.x, z: p.z }, forward, 15, 100));
    }
    assert(!insideCone(origin, { x: 0, y: 10, z: 0 }, forward, 15, 100));
    assert(!insideCone(origin, { x: 0, y: 0, z: -1 }, forward, 15, 100));
    assert(!insideCone(origin, { x: 0, y: 0, z: 15.01 }, forward, 15, 100));
    assert(!insideCone(origin, { x: 8, y: 8, z: 8 }, forward, 15, 100));
    assert(insideCone(origin, origin, forward, 15, 100));
  });
  it("上向き・真上・真下へ照準を回しても、粒に渡す基底が正規直交する", () => {
    for (const dir of [
      { x: 0, y: 1, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 2, y: 3, z: -4 },
    ]) {
      const basis = coneBasis(dir);
      const axes = Object.values(basis);
      for (const v of axes) assert(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
      for (const [a, b] of [
        [axes[0], axes[1]],
        [axes[0], axes[2]],
        [axes[1], axes[2]],
      ]) {
        assert(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z) < 1e-9);
      }
      const f = basis.forward;
      assert(insideCone(origin, { x: f.x * 15, y: f.y * 15, z: f.z * 15 }, dir, 15, 100));
      assert(!insideCone(origin, basis.right, dir, 15, 100));
    }
  });
});
