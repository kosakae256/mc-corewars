/**
 * core 層のテスト。
 *
 * ```
 * npm test
 * ```
 *
 * **core は `@minecraft/server` を import しない**（ESLint が見張っている）ので、
 * **ゲームを起動せずにそのまま回せる。**
 * Node が TypeScript をそのまま読む（v22.18 以降の型剥がし）。
 *
 * 設計は `docs/spec/12-architecture.md` 2-1。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clampDefense, finalDamage } from "../scripts/core/damage.ts";
import { bar, barColor, hpNumber, SEGMENTS } from "../scripts/core/bar.ts";
import { plateText } from "../scripts/core/plate.ts";
import {
  canEnter,
  homeOf,
  isResumable,
  isRunning,
  mustFreeze,
  mustSpectate,
  playerPhase,
  WORLD_NEXT,
  type WorldPhase,
} from "../scripts/core/state.ts";
import { affordable, isMaxed, nextCost, STATS, statValue, toStatKey, totalCost } from "../scripts/core/growth.ts";
import { distanceAlong, norm, pointAt } from "../scripts/core/geometry.ts";

describe("core/damage", () => {
  it("防御率 0 なら素通り", () => {
    assert.equal(finalDamage(100, 0), 100);
  });

  it("防御率 50％ で半分", () => {
    assert.equal(finalDamage(100, 50), 50);
  });

  it("**負の防御率は増える**（受けるダメージが増えるという意味）", () => {
    assert.equal(finalDamage(100, -100), 200);
  });

  it("防御率は −100〜100 に収まる", () => {
    assert.equal(clampDefense(999), 100);
    assert.equal(clampDefense(-999), -100);
    // **読めない値は素通り**（0）
    assert.equal(clampDefense(Number.NaN), 0);
  });

  it("攻撃力が 0 以下なら削らない", () => {
    assert.equal(finalDamage(0, 0), 0);
    assert.equal(finalDamage(-5, 0), 0);
  });
});

describe("core/bar", () => {
  it("満タンは全部埋まる", () => {
    const s = bar(100, 100);
    assert.equal((s.match(/\|/g) ?? []).length, SEGMENTS);
  });

  it("**残っていれば必ず 1 目盛り出す**（0 と区別するため）", () => {
    const s = bar(1, 1000);
    assert.ok(s.startsWith("§c|"));
  });

  it("0 でも帯は消えない", () => {
    const s = bar(0, 100);
    assert.equal((s.match(/\|/g) ?? []).length, SEGMENTS);
  });

  it("割合で色が変わる", () => {
    assert.equal(barColor(1), "§a");
    assert.equal(barColor(0.6), "§e");
    assert.equal(barColor(0.3), "§6");
    assert.equal(barColor(0.1), "§c");
  });

  it("数字は四捨五入して出す", () => {
    assert.equal(hpNumber(99.6, 200), "§f100§7/200");
  });

  it("読めない値でも壊れない", () => {
    assert.equal((bar(Number.NaN, 0).match(/\|/g) ?? []).length, SEGMENTS);
  });
});

describe("core/plate", () => {
  it("**空の行は出さない**（塊が縦に伸びて隣と混ざる）", () => {
    assert.equal(plateText({ name: "敵", bar: "|||" }), "敵\n|||");
  });

  it("あるものだけ積む", () => {
    assert.equal(plateText({ name: "敵", bar: "|||", hp: "HP 1/2" }), "敵\n|||\nHP 1/2");
  });
});

describe("core/geometry", () => {
  const shape = { fat: 0.9, marks: [0.9, 1.6] };

  it("長さ 0 の向きは前向きにする（0 除算を避ける）", () => {
    assert.deepEqual(norm({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 1 });
  });

  it("正面に居る相手は当たる", () => {
    const t = distanceAlong({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 10, { x: 0, y: 0, z: 5 }, shape);
    assert.equal(t, 5);
  });

  it("**区間より先は当たらない**（次の tick で当たる）", () => {
    const t = distanceAlong({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 4, { x: 0, y: 0, z: 5 }, shape);
    assert.equal(t, undefined);
  });

  it("後ろは当たらない", () => {
    const t = distanceAlong({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 10, { x: 0, y: 0, z: -3 }, shape);
    assert.equal(t, undefined);
  });

  it("太さの外は当たらない", () => {
    const t = distanceAlong({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 10, { x: 2, y: 0, z: 5 }, shape);
    assert.equal(t, undefined);
  });

  it("**速い弾でも隙間を抜けない**（点ではなく区間で見る）", () => {
    // 1 tick に 4 マス進む弾が、3 マス先の相手を追い越す形
    const t = distanceAlong({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 4, { x: 0, y: 0, z: 3 }, shape);
    assert.equal(t, 3);
  });

  it("胴が外れても頭で当たる", () => {
    const t = distanceAlong({ x: 0, y: 2.5, z: 0 }, { x: 0, y: 0, z: 1 }, 10, { x: 0, y: 0, z: 5 }, shape);
    assert.equal(t, 5);
  });

  it("区間の途中の点", () => {
    assert.deepEqual(pointAt({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, 2), { x: 1, y: 2, z: 5 });
  });
});

describe("core/growth — ステータス強化", () => {
  it("初期値", () => {
    assert.equal(statValue("hp", 0), 100);
    assert.equal(statValue("speed", 0), 1);
    assert.equal(statValue("haste", 0), 1);
    assert.equal(statValue("power", 0), 1);
  });

  it("上限まで買うと、仕様どおりの値になる", () => {
    assert.equal(statValue("hp", 40), 2100);
    assert.equal(statValue("speed", 40), 2);
    assert.equal(statValue("haste", 40), 3);
    assert.equal(statValue("power", 40), 5);
  });

  it("**0.025 を 40 回足しても 2 ちょうど**（浮動小数で溢れない）", () => {
    // 丸めが無いと 2.0000000000000004 になり、上限が上限にならない
    assert.equal(statValue("speed", 40), 2);
    assert.equal(statValue("speed", 1), 1.025);
    assert.equal(statValue("power", 3), 1.3);
  });

  it("上限を越えて渡しても止まる", () => {
    assert.equal(statValue("hp", 999), 2100);
    assert.equal(statValue("hp", -5), 100);
    assert.equal(statValue("hp", Number.NaN), 100);
  });

  it("値段は 50 × n", () => {
    assert.equal(nextCost("power", 0), 50);
    assert.equal(nextCost("power", 9), 500);
    assert.equal(nextCost("power", 39), 2000);
  });

  it("上限に達したら「買えない」", () => {
    assert.equal(nextCost("power", 40), undefined);
    assert.equal(isMaxed("power", 40), true);
    assert.equal(isMaxed("power", 39), false);
  });

  it("1 本を上限まで 41,000 / 4 本で 164,000", () => {
    assert.equal(totalCost("power", 40), 41000);
    assert.equal(totalCost("power", 40) * 4, 164000);
  });

  it("手持ちで買える回数", () => {
    // 50 + 100 + 150 = 300
    assert.deepEqual(affordable("power", 0, 300), { times: 3, cost: 300 });
    // 1 回ぶんに 1 足りない
    assert.deepEqual(affordable("power", 0, 49), { times: 0, cost: 0 });
    // 上限で止まる（財布は無限）
    assert.deepEqual(affordable("power", 39, 999999), { times: 1, cost: 2000 });
    assert.deepEqual(affordable("power", 40, 999999), { times: 0, cost: 0 });
  });

  it("名前から鍵を引く", () => {
    assert.equal(toStatKey("power"), "power");
    assert.equal(toStatKey("攻撃力"), "power");
    assert.equal(toStatKey(" HP "), "hp");
    assert.equal(toStatKey("なにか"), undefined);
  });

  it("4 本とも上限は 40 回", () => {
    for (const def of Object.values(STATS)) assert.equal(def.maxLevel, 40);
  });
});

describe("core/state — 世界の遷移", () => {
  it("表にある遷移は通る", () => {
    assert.equal(canEnter("idle", "prepare"), true);
    assert.equal(canEnter("prepare", "rest"), true);
    assert.equal(canEnter("rest", "wave"), true);
    assert.equal(canEnter("wave", "rest"), true);
    assert.equal(canEnter("paused", "wave"), true);
    assert.equal(canEnter("result", "idle"), true);
  });

  it("**表に無い遷移は通さない**", () => {
    // 非開始からいきなり戦場へは行けない
    assert.equal(canEnter("idle", "wave"), false);
    // リザルトの次は必ず非開始
    assert.equal(canEnter("result", "prepare"), false);
    assert.equal(canEnter("result", "rest"), false);
    // 非開始は止められない
    assert.equal(canEnter("idle", "paused"), false);
    // 準備中はまだ戦えない
    assert.equal(canEnter("prepare", "wave"), false);
  });

  it("**どの状態からも、非開始へ戻る道がある**", () => {
    // 遷移をたどって idle に着けること（袋小路を作らない）
    const reach = (from: WorldPhase): boolean => {
      const seen = new Set<WorldPhase>();
      const stack: WorldPhase[] = [from];
      while (stack.length > 0) {
        const at = stack.pop() as WorldPhase;
        if (at === "idle") return true;
        if (seen.has(at)) continue;
        seen.add(at);
        for (const next of WORLD_NEXT[at]) stack.push(next);
      }
      return false;
    };
    for (const from of Object.keys(WORLD_NEXT) as WorldPhase[]) {
      assert.equal(reach(from), true, `${from} から非開始へ戻れない`);
    }
  });

  it("一時停止から戻れるのは休憩所と戦場だけ", () => {
    assert.equal(isResumable("rest"), true);
    assert.equal(isResumable("wave"), true);
    assert.equal(isResumable("result"), false);
    assert.equal(isResumable("idle"), false);
  });

  it("動いているのは準備より後", () => {
    assert.equal(isRunning("idle"), false);
    assert.equal(isRunning("prepare"), false);
    assert.equal(isRunning("rest"), true);
    assert.equal(isRunning("wave"), true);
  });
});

describe("core/state — 人の状態", () => {
  it("非参加はどの世界でも非参加", () => {
    for (const w of Object.keys(WORLD_NEXT) as WorldPhase[]) {
      assert.equal(playerPhase(w, "out", false), "out");
      assert.equal(playerPhase(w, "out", true), "out");
    }
  });

  it("参加中の 6 つ", () => {
    assert.equal(playerPhase("rest", "member", false), "rest");
    assert.equal(playerPhase("wave", "member", false), "field");
    assert.equal(playerPhase("wave", "member", true), "dead");
    assert.equal(playerPhase("paused", "member", false), "paused");
    assert.equal(playerPhase("result", "member", false), "result");
    // **非開始に参加者は居ない**
    assert.equal(playerPhase("idle", "member", false), "out");
  });

  it("途中参加の 3 つ", () => {
    assert.equal(playerPhase("rest", "late", false), "lateRest");
    assert.equal(playerPhase("wave", "late", false), "lateField");
    assert.equal(playerPhase("result", "late", false), "lateResult");
  });

  it("**途中参加は戦場に立てない**（スペクテイター必須）", () => {
    assert.equal(mustSpectate(playerPhase("wave", "late", false)), true);
    assert.equal(mustSpectate(playerPhase("wave", "member", true)), true);
    assert.equal(mustSpectate(playerPhase("wave", "member", false)), false);
  });

  it("死んでいても、戦場の外では関係ない", () => {
    assert.equal(playerPhase("rest", "member", true), "rest");
    assert.equal(playerPhase("result", "member", true), "result");
  });

  it("止まる状態", () => {
    assert.equal(mustFreeze("paused"), true);
    assert.equal(mustFreeze("result"), true);
    assert.equal(mustFreeze("lateResult"), true);
    assert.equal(mustFreeze("field"), false);
  });

  it("居場所", () => {
    assert.equal(homeOf("idle", "member"), "lobby");
    assert.equal(homeOf("wave", "out"), "lobby");
    assert.equal(homeOf("rest", "member"), "rest");
    assert.equal(homeOf("prepare", "member"), "rest");
    assert.equal(homeOf("wave", "member"), "field");
  });
});
