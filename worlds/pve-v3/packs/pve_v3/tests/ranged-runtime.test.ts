/** 実際のserviceを読み、ワールドAPIだけ置換して移動・遮蔽・移行を検査する。 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness(players = [], overrides = {}) {
  const mocks = {
    '@minecraft/server': { world: { getAllPlayers: () => players } },
    mobaim: { hittable: p => !p.creative && !p.spectator },
    hp: { has: p => p.hp !== undefined, current: p => p.hp },
    combat: { hit: s => { s.target.hp -= s.attack; s.target.hits++; } },
    ...overrides,
  };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = name => mocks[name] ?? mocks[path.basename(name, '.js')]
      ?? load(path.resolve(path.dirname(file), name.replace(/\.js$/, '.ts')));
    vm.runInNewContext(output, { exports, require }, { filename: file });
    return exports;
  }
  return name => load(`scripts/${name}.ts`);
}

function dimension() {
  return { id: 'overworld', blocked: false, missing: false,
    getBlock() { return this.missing ? undefined : {}; },
    getBlockFromRay(_from, _dir, options) {
      assert.equal(options.includePassableBlocks, false);
      assert.equal(options.includeLiquidBlocks, false);
      return this.blocked ? { block: {} } : undefined;
    },
  };
}
function player(dim, z, extra = {}) {
  return { dimension: dim, location: { x: 0, y: 0, z }, hp: 100, hits: 0, burns: [],
    setOnFire(...args) { this.burns.push(args); }, ...extra };
}

it('スケルトン: ownerが2tick遅れても種を一度だけ消して赤い弾へ変換する', () => {
  const dim = dimension(), p = player(dim, 10), shots = [], jobs = [], warnings = [];
  let onSpawn;
  const load = harness([p], {
    '@minecraft/server': { world: { getAllPlayers: () => [p], afterEvents: {
      entitySpawn: { subscribe: callback => { onSpawn = callback; } } } },
      system: { runTimeout: (callback, ticks) => { assert.equal(ticks, 1); jobs.push(callback); } } },
    melee: { isEnemy: e => e?.enemy === true, powerOf: () => 7, knockOf: () => 0.4 },
    bullet: { fire: s => shots.push(s) }, boom: {}, swing: {},
    tell: { tellOps: message => warnings.push(message) },
    mobaim: { hittable: () => true, aimFor: () => ({ x: 0, y: 0, z: 1 }), arcTo: () => undefined },
  });
  const keys = load('state/keys').KEYS;
  const mob = { enemy: true, hp: 40, dimension: dim, location: { x: 0, y: 0, z: 0 },
    getDynamicProperty: key => key === keys.kind ? 'archer' : undefined };
  load('services/mobshot').subscribeMobShot();
  const seed = (id, owner) => ({ id, typeId: 'pve_v3:seed', isValid: true, owner, removed: 0,
    getComponent() { return { owner: this.owner }; }, remove() { this.removed++; this.isValid = false; } });
  const delayed = seed('delayed');
  onSpawn({ entity: delayed }); onSpawn({ entity: delayed });
  assert.equal(jobs.length, 1);
  jobs.shift()(); delayed.owner = mob; jobs.shift()();
  assert.equal(delayed.removed, 1); assert.equal(shots.length, 1);
  assert.equal(shots[0].trail, 'pve_v3:foe_trail');
  assert.equal(shots[0].range, 30);
  shots[0].onHit(p, 10, { x: 0, y: 1, z: 10 });
  assert.equal(p.hp, 93);

  const missing = seed('missing'); onSpawn({ entity: missing }); jobs.shift()(); jobs.shift()();
  assert.equal(missing.removed, 1); assert.equal(shots.length, 1); assert.equal(warnings.length, 1);
  const gone = seed('gone'); onSpawn({ entity: gone }); gone.isValid = false; jobs.shift()();
  assert.equal(jobs.length, 0); assert.equal(shots.length, 1);
  const failed = seed('failed', mob); failed.remove = () => { throw Error('remove failed'); };
  onSpawn({ entity: failed }); assert.equal(shots.length, 1);
  mob.hp = 0;
  const dead = seed('dead', mob); onSpawn({ entity: dead });
  assert.equal(dead.removed, 1); assert.equal(shots.length, 1);
  mob.hp = 40; p.hp = 0;
  onSpawn({ entity: seed('target-dead', mob) }); assert.equal(shots.length, 1);
  p.hp = 100;
  onSpawn({ entity: seed('target-restored', mob) }); assert.equal(shots.length, 2);

  const rp = 'resource_packs/pve_v3/';
  const client = JSON.parse(fs.readFileSync(rp + 'entity/seed.entity.json', 'utf8'));
  const name = client['minecraft:client_entity'].description.render_controllers[0];
  const rc = JSON.parse(fs.readFileSync(rp + 'render_controllers/pve3_seed_hidden.render_controllers.json', 'utf8'));
  assert.deepEqual(rc.render_controllers[name].part_visibility, [{ '*': false }]);
});

it('実行時: 100m索敵、壁の出入り、溜め、別次元と死亡者の除外', () => {
  const api = harness()('services/ranged-ai');
  const dim = dimension(), p = player(dim, 40), events = [];
  const mob = { id: 'mob', dimension: dim, location: { x: 0, y: 0, z: 0 },
    triggerEvent: e => events.push(e), getVelocity: () => ({ x: 1, y: -0.1, z: 0 }),
    clearVelocity() {}, applyImpulse(v) { assert.equal(v.y, -0.1); assert.equal(v.x, 0); },
  };
  const def = { beam: { range: 30 } };
  api.updateRanged(mob, def, [p], 0);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  p.location.z = 20;
  api.updateRanged(mob, def, [p], 10);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold');
  dim.blocked = true;
  api.updateRanged(mob, def, [p], 20);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  api.rangedBusy(mob, true);
  api.updateRanged(mob, def, [p], 30);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold');
  api.rangedBusy(mob, false);
  api.updateRanged(mob, def, [p], 32);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  p.location.z = 100;
  assert.equal(api.rangedTarget(mob, [p], 100), p);
  p.location.z = 100.01;
  assert.equal(api.rangedTarget(mob, [p], 100), undefined);
  const excluded = [player({ id: 'nether' }, 1), player(dim, 1, { hp: 0 }),
    player(dim, 1, { creative: true }), player(dim, 1, { spectator: true })];
  assert.equal(api.rangedTarget(mob, excluded, 100), undefined);
});

it('妖狐: 遮蔽時はダメージも炎上も0、開通時は1撃と5秒炎上', () => {
  const dim = dimension(), p = player(dim, 10);
  const load = harness([p]), { sweep } = load('services/sweep');
  const spec = { dim, at: { x: 0, y: 1.3, z: 0 }, dir: { x: 0, y: 0, z: 1 },
    power: 30, radius: 30, angle: 100, shape: 'cone', targetHeight: 1,
    igniteSeconds: 5, cover: true, showParticles: false };
  dim.blocked = true;
  assert.equal(sweep(spec), 0);
  assert.equal(p.hits, 0); assert.equal(p.burns.length, 0);
  dim.blocked = false; dim.missing = true;
  assert.equal(sweep(spec), 0);
  dim.missing = false;
  assert.equal(sweep(spec), 1);
  assert.equal(p.hp, 70); assert.deepEqual(p.burns, [[5, true]]);
  dim.blocked = true;
  assert.equal(sweep({ ...spec, cover: false, igniteSeconds: undefined }), 1);
  assert.equal(p.burns.length, 1);
});

it('接近停止は2秒後に再試行し、移動中・攻撃位置・溜め中には再試行しない', () => {
  const api = harness()('services/ranged-ai');
  const dim = dimension(), p = player(dim, 40), events = [];
  const mob = { id: 'stuck', dimension: dim, location: { x: 0, y: 0, z: 0 },
    triggerEvent: e => events.push(e), getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    clearVelocity() {}, applyImpulse() {} };
  const def = { beam: { range: 30 } };
  api.updateRanged(mob, def, [p], 0);
  api.updateRanged(mob, def, [p], 20);
  assert.equal(events.length, 1);
  api.updateRanged(mob, def, [p], 40);
  assert.equal(events.length, 2);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  mob.location.z = 1;
  api.updateRanged(mob, def, [p], 60);
  api.updateRanged(mob, def, [p], 80);
  assert.equal(events.length, 2);
  api.rangedBusy(mob, true);
  api.updateRanged(mob, def, [p], 120);
  assert.equal(events.length, 3);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold');
  api.rangedBusy(mob, false);
  p.location.z = 10;
  api.updateRanged(mob, def, [p], 130);
  api.updateRanged(mob, def, [p], 180);
  assert.equal(events.length, 3);
  dim.blocked = true;
  api.updateRanged(mob, def, [p], 190);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  api.updateRanged(mob, { ...def, throughWall: true }, [p], 200);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold');
});

it('追尾弾の旧個体: 呪い倍率を保ち、一度だけ移行する', () => {
  const load = harness(), { migrateEnemyAi } = load('services/enemy-ai-migration');
  const { KEYS } = load('state/keys');
  const values = new Map([[KEYS.swing, 20]]), events = [];
  const mob = { getDynamicProperty: k => values.get(k), setDynamicProperty: (k, v) => values.set(k, v),
    getComponent: () => undefined, triggerEvent: e => events.push(e) };
  const def = { id: 'seeker', interval: 10, speed: 1 };
  migrateEnemyAi(mob, def); migrateEnemyAi(mob, def);
  assert.equal(values.get(KEYS.swing), 5);
  assert.equal(events.length, 1);
  values.set(KEYS.enemyAiRevision, undefined); values.set(KEYS.swing, 20);
  mob.triggerEvent = () => { throw new Error('unloaded'); };
  assert.throws(() => migrateEnemyAi(mob, def));
  assert.equal(values.get(KEYS.swing), 20);
});

it('追跡用の近接イベントは、全遠距離16種で独自ダメージへ変換しない', () => {
  const load = harness(), { hitsInMelee } = load('services/enemydef');
  const { ENEMIES } = load('core/roster');
  const { rangedReach } = load('core/ranged-ai');
  const ranged = Object.values(ENEMIES).filter(d => rangedReach(d) !== undefined);
  assert.equal(ranged.length, 16);
  for (const def of ranged) assert.equal(hitsInMelee(def), false, def.id);
  assert.equal(hitsInMelee(ENEMIES.grunt), true);
  assert.equal(hitsInMelee(ENEMIES.titan), true);
});

it('ブレイズ: 溜め・連射中に射程外へ逃げても3発を完了し、次の攻撃は開始しない', () => {
  const dim = dimension(), p = player(dim, 30, { id: 'player' });
  dim.playSound = () => {};
  const shots = [], events = [], rotations = [], particles = [];
  dim.spawnParticle = (name, at) => particles.push({ name, at });
  let gap = 80;
  const load = harness([p], { traits: { swingOf: () => gap }, mobshot: { fireMobShot: (_m, _d, dir) => shots.push(dir) },
    mobaim: { hittable: p => !p.creative, scatter: dir => dir } });
  const { doChargedShot, pruneChargedShots } = load('services/charged-shot');
  const { updateRanged } = load('services/ranged-ai');
  const { STAR3 } = load('core/roster/star3');
  const def = STAR3.blaze;
  const mob = { id: 'blaze', hp: 60, isValid: true, dimension: dim, location: { x: 0, y: 0, z: 0 },
    triggerEvent: e => events.push(e), setRotation(r) { rotations.push(r); }, getVelocity: () => ({ x: 0, y: 0, z: 0 }), clearVelocity() {}, applyImpulse() {} };
  const tick = t => { updateRanged(mob, def, [p], t); doChargedShot(mob, def, [p], t); };
  tick(0);
  assert.equal(particles[0].name, 'pve_v3:blaze_charge');
  tick(2); assert.equal(particles.length, 1, '生成間隔は4tick');
  p.location.z = 45;
  tick(40); tick(78);
  assert.equal(shots.length, 0);
  const beforeBurst = particles.length;
  assert.equal(rotations.length, 0, '接近する向きは経路探索へ任せる');
  assert.ok(events.includes('pve_v3:ranged_seek'), '溜め中も射程外へ離れた相手を追う');
  tick(80);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold', '実際の連射中だけ停止する');
  p.location.z = 40;
  dim.blocked = true;
  tick(86); tick(92);
  assert.equal(shots.length, 3);
  assert.equal(particles.length, beforeBurst, '発射開始後は溜めの炎を追加しない');
  assert.equal(events.at(-1), 'pve_v3:shot_done');
  tick(100); tick(200);
  assert.equal(shots.length, 3);
  assert.ok(events.includes('pve_v3:ranged_seek'));
  // 呪いで溜め40tick・連射3tick（2tick更新なので4tick）へ短縮。
  gap = 40; p.location.z = 10; dim.blocked = false;
  dim.spawnParticle = () => { throw Error('particle unavailable'); };
  tick(202); tick(240); assert.equal(shots.length, 3);
  tick(242); assert.equal(shots.length, 4);
  // 標的の退出後も最後の方向へ撃ち切る。
  doChargedShot(mob, def, [], 246); doChargedShot(mob, def, [], 250);
  assert.equal(shots.length, 6);
  tick(252);
  mob.hp = 0; tick(292);
  assert.equal(shots.length, 6);
  pruneChargedShots([]);
  mob.hp = 60; tick(400); tick(438);
  assert.equal(shots.length, 6);
});

it('ブレイズは攻撃開始30mと接近停止10mを分け、壁の裏へも接近する', () => {
  const dim = dimension(), p = player(dim, 40, { id: 'player' }), events = [];
  const load = harness([p]), { updateRanged, rangedBusy } = load('services/ranged-ai');
  const def = load('core/roster/star3').STAR3.blaze;
  const mob = { id: 'approach-blaze', dimension: dim, location: { x: 0, y: 0, z: 0 },
    triggerEvent: e => events.push(e), getVelocity: () => ({ x: 0, y: 0, z: 0 }), clearVelocity() {}, applyImpulse() {} };
  updateRanged(mob, def, [p], 0);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  p.location.z = 14; updateRanged(mob, def, [p], 10);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  p.location.z = 10; updateRanged(mob, def, [p], 20);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold');
  dim.blocked = true; updateRanged(mob, def, [p], 30);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
  rangedBusy(mob, true); updateRanged(mob, def, [p], 40);
  assert.equal(events.at(-1), 'pve_v3:ranged_hold');
  rangedBusy(mob, false); updateRanged(mob, def, [p], 42);
  assert.equal(events.at(-1), 'pve_v3:ranged_seek');
});

it('移行版2: 支援役2倍・急所0.7倍・帯電の間隔を一度だけ変更する', () => {
  const load = harness(), { migrateEnemyAi } = load('services/enemy-ai-migration'), { KEYS } = load('state/keys');
  for (const [id, speed, factor] of [['healer', 1, 2], ['rouser', 1, 2], ['vital', 0.7, 0.7]]) {
    const values = new Map([[KEYS.enemyAiRevision, 1]]);
    const move = { currentValue: 0.2, setCurrentValue(v) { this.currentValue = v; } };
    const mob = { getDynamicProperty: k => values.get(k), setDynamicProperty: (k, v) => values.set(k, v), getComponent: () => move };
    migrateEnemyAi(mob, { id, speed }); migrateEnemyAi(mob, { id, speed });
    assert.equal(move.currentValue, 0.2 * factor);
    assert.equal(values.get(KEYS.enemyAiRevision), 3);
  }
  const values = new Map([[KEYS.enemyAiRevision, 1], [KEYS.swing, 36000], [KEYS.atk, 100]]);
  const events = [], mob = { getDynamicProperty: k => values.get(k), setDynamicProperty: (k, v) => values.set(k, v),
    getComponent: () => undefined, triggerEvent: e => events.push(e) };
  migrateEnemyAi(mob, { id: 'charged', interval: 20 }); migrateEnemyAi(mob, { id: 'charged', interval: 20 });
  assert.equal(values.get(KEYS.swing), 10);
  assert.equal(values.get(KEYS.atk), 100); // 死に際の攻撃値は維持。
  assert.equal(events.length, 1);
});

it('移行版3: テレポートは呪い倍率を保って一度だけ半減し、新個体はそのまま', () => {
  const load = harness(), { migrateEnemyAi } = load('services/enemy-ai-migration'), { KEYS } = load('state/keys');
  const def = load('core/roster').ENEMIES.blinker;
  assert.equal(def.attack, 10);
  for (const [revision, old, expected] of [[2, 20, 10], [2, 60, 30], [3, 10, 10]]) {
    const values = new Map([[KEYS.enemyAiRevision, revision], [KEYS.atk, old]]);
    const mob = { getDynamicProperty: k => values.get(k), setDynamicProperty: (k, v) => values.set(k, v) };
    migrateEnemyAi(mob, def); migrateEnemyAi(mob, def);
    assert.equal(values.get(KEYS.atk), expected);
  }
});

it('汚染・帯電は通常4ダメージ、帯電の死に際の攻撃値50は書き換えない', () => {
  const load = harness([], { '@minecraft/server': { GameMode: { Creative: 'creative', Spectator: 'spectator' } },
    ailment: {}, field: { ENEMY_FAMILY: 'pve_mob' }, swing: { startSwing() {} } });
  const { enemyMelee } = load('services/melee'), { KEYS } = load('state/keys');
  for (const [id, attack, expected] of [['taint', 4, 4], ['charged', 50, 4], ['charged', 100, 8]]) {
    const values = new Map([[KEYS.kind, id], [KEYS.atk, attack], [KEYS.kbPower, 0]]);
    const mob = { matches: () => true, getDynamicProperty: k => values.get(k) };
    const p = { hp: 100, hits: 0, getGameMode: () => 'survival' };
    assert.equal(enemyMelee(p, mob), true);
    assert.equal(p.hp, 100 - expected);
    assert.equal(values.get(KEYS.atk), attack);
  }
});

it('銃の照準: 左右・高低差を体と腕へ同期し、標的不在なら補正を解除する', () => {
  const { aimGun } = harness()('services/gun-aim');
  const props = new Map(), mob = { location: { x: 0, y: 0, z: 0 }, setProperty: (k, v) => props.set(k, v), setRotation(v) { this.rotation = v; } };
  for (const [x, z, expectedYaw] of [[10, 0, -90], [-10, 0, 90], [0, 10, 0]]) {
    aimGun(mob, { location: { x, y: 0.25, z } });
    assert.ok(Math.abs(props.get('pve_v3:gun_yaw') - expectedYaw) < 1e-6);
    assert.ok(Math.abs(props.get('pve_v3:gun_pitch')) < 1e-6);
  }
  aimGun(mob, { location: { x: 0, y: 10.25, z: 10 } });
  assert.equal(props.get('pve_v3:gun_pitch'), -45);
  assert.equal(mob.rotation.x, -45);
  aimGun(mob, undefined);
  assert.equal(props.get('pve_v3:gun_aim'), false);
});
