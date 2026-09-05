/**
 * 進行のテスト。
 *
 * ```
 * npm test
 * ```
 *
 * **ゲームを起動しないと確かめられない所を減らすため**、
 * 幕間の判断は `core/flow.ts` の 1 つの関数に寄せてある。
 * ここでは**その関数だけを回して、流れ全体を組み立てて確かめる。**
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canEnter, interludePlan, LAST_WAVE, restsAfter, type WorldPhase } from "../scripts/core/state.ts";

describe("進行 — 幕間で何をするか", () => {
  it("**休憩所を出るとき**は、戦場へ運び、マップを置き、3 択は出さない", () => {
    const p = interludePlan("rest", 3);
    assert.equal(p.dest, "field");
    assert.equal(p.rebuild, true);
    assert.equal(p.picker, false);
    assert.equal(p.next, "wave");
  });

  it("**戦場 → 戦場**は、戦場へ運び、マップを置き、3 択を出す", () => {
    for (const w of [1, 2, 4, 5, 7]) {
      const p = interludePlan("wave", w);
      assert.equal(p.dest, "field", `wave ${w}`);
      assert.equal(p.rebuild, true, `wave ${w}`);
      assert.equal(p.picker, true, `wave ${w}`);
      assert.equal(p.next, "wave", `wave ${w}`);
    }
  });

  it("**3 の倍数を終えたら休憩所**。マップは置かない", () => {
    for (const w of [3, 6, 9, 12]) {
      const p = interludePlan("wave", w);
      assert.equal(p.dest, "rest", `wave ${w}`);
      // **休憩所へ行くときは差し替えない**——だから暗転も落ちない
      assert.equal(p.rebuild, false, `wave ${w}`);
      assert.equal(p.picker, true, `wave ${w}`);
      assert.equal(p.next, "rest", `wave ${w}`);
    }
  });

  it("**最終ウェーブを終えたら終了**", () => {
    const p = interludePlan("wave", LAST_WAVE);
    assert.equal(p.next, "result");
  });
});

describe("進行 — 戦場 3 連戦", () => {
  /** 幕間を通しながら、最後まで回す */
  function run(): readonly WorldPhase[] {
    const seen: WorldPhase[] = [];
    let at: WorldPhase = "prepare";
    let wave = 0;
    let from: WorldPhase | undefined;

    for (let guard = 0; guard < 500 && at !== "result"; guard++) {
      seen.push(at);
      let next: WorldPhase;
      if (at === "prepare") next = "rest";
      else if (at === "rest" || at === "wave") {
        from = at;
        next = "interlude";
      } else {
        next = interludePlan(from, wave).next;
      }
      // **表に無い遷移は通さない**（`core/state.ts`）
      assert.ok(canEnter(at, next), `${at} → ${next} は表に無い`);
      if (next === "wave") wave++;
      at = next;
    }
    seen.push(at);
    return seen;
  }

  it("**休憩所 → 戦場 ×3 → 休憩所** を繰り返す", () => {
    const seen = run();
    // 幕間を抜いた並びで見る
    const places = seen.filter((p) => p === "rest" || p === "wave" || p === "result");
    assert.equal(places[0], "rest", "**最初は休憩所から**（wave 0 も 3 の倍数）");
    assert.deepEqual(places.slice(0, 9), ["rest", "wave", "wave", "wave", "rest", "wave", "wave", "wave", "rest"]);
  });

  it("**30 戦で終わる**", () => {
    const seen = run();
    assert.equal(seen[seen.length - 1], "result");
    assert.equal(seen.filter((p) => p === "wave").length, LAST_WAVE);
  });

  it("**移動は必ず幕間を通る**——戦場と休憩所が隣り合わない", () => {
    const seen = run();
    for (let i = 1; i < seen.length; i++) {
      const a = seen[i - 1];
      const b = seen[i];
      if (a === undefined || b === undefined) continue;
      const move = (a === "rest" && b === "wave") || (a === "wave" && b === "rest") || (a === "wave" && b === "wave");
      assert.ok(!move, `${a} → ${b} が直に繋がっている`);
    }
  });

  it("**休憩所が挟まるのは 3 戦ごと**", () => {
    for (let w = 0; w <= 30; w++) {
      assert.equal(restsAfter(w), w % 3 === 0, `wave ${w}`);
    }
  });
});
