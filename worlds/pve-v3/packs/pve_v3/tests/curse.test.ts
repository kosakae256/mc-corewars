/**
 * 呪いの数え方（`worlds/pve-v3/docs/spec/16-enemy.md` 4 章）。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apply, draw, drawCount, isFull, multOf, multsOf, NO_CURSE } from "../scripts/core/curse.ts";
import { addMult, waveScale } from "../scripts/core/enemy.ts";

describe("呪い", () => {
  it("**引く数はウェーブで変わる**（3 / 5 / 7）", () => {
    assert.equal(drawCount(1), 3);
    assert.equal(drawCount(5), 3);
    assert.equal(drawCount(6), 5);
    assert.equal(drawCount(10), 5);
    assert.equal(drawCount(11), 7);
    assert.equal(drawCount(30), 7);
  });

  it("**倍率は 1.0 から、足し算で積む**", () => {
    assert.equal(multOf(NO_CURSE, "hp"), 1);
    assert.equal(multOf({ ...NO_CURSE, hp: 3 }, "hp"), 1.6);
    assert.equal(multOf({ ...NO_CURSE, power: 5 }, "power"), 2);
  });

  it("**速さは ×3.0 で止まる。HP と攻撃力は止まらない**", () => {
    assert.equal(multOf({ ...NO_CURSE, speed: 40 }, "speed"), 3);
    assert.equal(multOf({ ...NO_CURSE, haste: 100 }, "haste"), 3);
    assert.equal(multOf({ ...NO_CURSE, hp: 100 }, "hp"), 21);
  });

  it("**上限に達したものは、候補から外れる**", () => {
    const full = { hp: 0, power: 0, speed: 40, haste: 40 };
    assert.equal(isFull(full, "speed"), true);
    assert.equal(isFull(full, "hp"), false);
    // **いつも先頭を引く**ようにすると、開いているものだけが並ぶ
    const picks = draw(full, 4, () => 0);
    assert.deepEqual(picks, ["hp", "hp", "hp", "hp"]);
  });

  it("**引いたぶんだけ積む**", () => {
    const next = apply(NO_CURSE, ["hp", "hp", "speed"]);
    assert.deepEqual(next, { hp: 2, power: 0, speed: 1, haste: 0 });
    const m = multsOf(next);
    assert.equal(m.hp, 1.4);
    assert.equal(m.speed, 1.05);
    assert.equal(m.power, 1);
  });

  it("**n 個ちょうど引く**", () => {
    assert.equal(draw(NO_CURSE, 7, () => 0.5).length, 7);
  });
});

describe("倍率の重ね方", () => {
  it("**力・速度・攻撃速度は加算で重ねる**（`16-enemy.md` 1-2）", () => {
    // 3 人（×1.10）＋ 呪い ×1.85 → **×1.95**（掛けると 2.035）
    assert.equal(Number(addMult(1.1, 1.85).toFixed(4)), 1.95);
    assert.equal(addMult(1), 1);
    assert.equal(addMult(), 1);
    assert.equal(Number(addMult(1.2, 1.2, 1.2).toFixed(4)), 1.6);
  });

  it("**HP は掛け算のまま**——ウェーブと呪いは二重に伸びる", () => {
    // wave 11 の 1.1^10 ＝ 2.5937…、呪い ×3.0
    const wave = waveScale(11);
    assert.equal(Number((wave * 3).toFixed(3)), 7.781);
  });
});
