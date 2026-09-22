import assert from "node:assert/strict";
import { it } from "node:test";
import fs from "node:fs";
import { ENEMY_SEARCH, rangedMode, rangedReach } from "../scripts/core/ranged-ai.ts";
import { starLabel } from "../scripts/core/star.ts";
import { STAR1 } from "../scripts/core/roster/star1.ts";
import { STAR2 } from "../scripts/core/roster/star2.ts";
import { STAR3 } from "../scripts/core/roster/star3.ts";
import { STAR4 } from "../scripts/core/roster/star4.ts";
import { STAR5 } from "../scripts/core/roster/star5.ts";

it("射程外と遮蔽時に接近し、射線が通れば停止する", () => {
  assert.equal(ENEMY_SEARCH, 100);
  assert.equal(rangedMode(31, 30, true, false), "seek");
  assert.equal(rangedMode(10, 30, false, false), "seek");
  assert.equal(rangedMode(30, 30, true, false), "hold");
  assert.equal(rangedMode(31, 30, false, true), "hold");
  assert.equal(rangedMode(undefined, 30, false, false), "hold");
});

it("全16遠距離モブは近接reachではなく攻撃の射程で判断する", () => {
  const roster = { ...STAR1, ...STAR2, ...STAR3, ...STAR4, ...STAR5 };
  const expected = { archer: 15, sbowman: 15, slinger: 7, gast: 50, sroyal: 15,
    venom: 12, blaze: 30, gunner: 20, bomber: 10, sknight: 15, shotgun: 20,
    sgeneral: 15, seeker: 100, chamber: 50, kitsune: 30, barrage: 30 };
  const actual = Object.fromEntries(Object.values(roster).filter(d => rangedReach(d) !== undefined)
    .map(d => [d.id, rangedReach(d)]));
  assert.deepEqual(actual, expected);
});

it("指定された速度・追尾頻度を適用し、狐とチェンバーの攻撃周期は維持する", () => {
  assert.equal(STAR5.titan.speed, 0.4);
  assert.equal(STAR5.golem.speed, 0.5);
  assert.equal(STAR5.seeker.interval, 10);
  assert.equal(STAR5.chamber.interval, 80);
  assert.equal(STAR5.kitsune.sweep?.windup, 60);
  assert.equal(STAR3.healer.speed, 1);
  assert.equal(STAR3.rouser.speed, 1);
  assert.equal(STAR5.vital.speed, 0.7);
  assert.equal(STAR5.chamber.knockback, 1);
});

it("星数を明記し、★5の個別色を失わない", () => {
  for (let star = 1; star <= 5; star++) assert.ok(starLabel("敵", star).includes(`[★${star}] 敵`));
  assert.equal(starLabel("チェンバー", 5, "§e"), "§e§l[★5] チェンバー");
  assert.equal(starLabel("妖狐", 5, "§d"), "§d§l[★5] 妖狐");
  assert.ok(!starLabel("味方").includes("★"));
});

it("全遠距離が継続追跡し、接近では殴らず、射程内で追跡を解除できる", () => {
  const roster = { ...STAR1, ...STAR2, ...STAR3, ...STAR4, ...STAR5 };
  for (const def of Object.values(roster).filter(d => rangedReach(d) !== undefined)) {
    const ent = JSON.parse(fs.readFileSync(`behavior_packs/pve_v3/entities/${def.id}.json`, "utf8"))["minecraft:entity"];
    const seek = "pve_v3:ranged_seek";
    const group = ent.component_groups[seek];
    const goal = group["minecraft:behavior.melee_box_attack"];
    assert.equal(group["minecraft:behavior.move_towards_target"], undefined, def.id);
    assert.equal(goal.track_target, true, def.id);
    assert.equal(goal.require_complete_path, false, def.id);
    assert.equal(goal.random_stop_interval, 0, def.id);
    assert.equal(group["minecraft:attack"].damage, 0, def.id);
    assert.equal(goal.can_spread_on_fire, false, def.id);
    assert.equal(ent.components["minecraft:follow_range"].value, ENEMY_SEARCH, def.id);
    assert.ok(goal.speed_multiplier > 0, def.id);
    assert.ok(ent.events[seek].remove.component_groups.includes(seek), def.id);
    assert.ok(ent.events[seek].add.component_groups.includes(seek), def.id);
    assert.ok(ent.events["pve_v3:ranged_hold"].remove.component_groups.includes(seek), def.id);
    if (def.charge?.commit) {
      for (const c of [ent.components, ...Object.values(ent.component_groups)]) {
        assert.equal(c['minecraft:behavior.ranged_attack'], undefined, 'Script射撃とnative射撃を重複させない');
      }
      assert.ok(ent.component_groups['pve_v3:shot_charge']['minecraft:is_charged']);
    }
    const wander = ent.components["minecraft:behavior.random_hover"];
    if (def.id === "barrage") {
      assert.ok(wander.priority > goal.priority, "射程外は接近を優先する");
      assert.deepEqual(wander.hover_height, { min: 1, max: 2 });
      assert.equal(wander.interval, 1);
    } else {
      assert.equal(wander, undefined, def.id);
    }
  }
});
