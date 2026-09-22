/** 終了遷移とロビー移動を実際のserviceで通し、HPの復旧順序を検査する。 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const values = new Map(), worldValues = new Map(), cache = new Map();
  const p = { id: 'player', location: { x: -9999, y: 0, z: 0 }, mode: 'Adventure',
    getDynamicProperty: k => values.get(k), setDynamicProperty: (k, v) => values.set(k, v),
    getGameMode() { return this.mode; }, setGameMode(v) { this.mode = v; }, sendMessage() {},
    teleport() { assert.equal(hp.current(p), 100); assert.equal(hp.max(p), 100); } };
  const world = { getAllPlayers: () => [p], getDynamicProperty: k => worldValues.get(k),
    setDynamicProperty: (k, v) => worldValues.set(k, v) };
  const noop = () => {};
  const external = { field: { clearEnemies: noop }, stage: { forgetPrepared: noop },
    restgate: { closeGates: noop }, dark: { forgetAll: noop }, spawn: { stopSpawning: noop },
    area: { releaseArea: noop }, reward: { forgetAll: noop }, pick: { isPicked: () => false } };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name, exports);
    const source = ts.transpileModule(fs.readFileSync(`scripts/${name}.ts`, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = request => {
      if (request === '@minecraft/server') return { world, CommandPermissionLevel: {},
        GameMode: { Creative: 'Creative', Adventure: 'Adventure', Spectator: 'Spectator' } };
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), request.replace(/\.js$/, '')));
      if (target.startsWith('core/') || target.startsWith('state/') && target !== 'state/pick'
        || ['services/match', 'services/presence', 'services/growth'].includes(target)) return load(target);
      return external[path.posix.basename(target)] ?? {};
    };
    vm.runInNewContext(source, { exports, require, console });
    return exports;
  }
  const hp = load('state/hp'), growth = load('services/growth'), member = load('state/member');
  growth.setPlayerHp(p, 1000); hp.damage(p, 1000);
  member.setMembership(p, 'member'); member.setDead(p, true);
  return { p, hp, growth, member, state: load('state/match'), match: load('services/match'),
    presence: load('services/presence') };
}

it('全滅リザルト・準備中止からidleへ戻ると、移動前に100/100と生存状態になる', () => {
  for (const from of ['result', 'prepare']) {
    const { p, hp, growth, member, state, match, presence } = harness();
    state.setPhase(from, 0);
    assert.equal(match.toPhase('idle', 300), true);
    assert.equal(member.membership(p), 'out'); assert.equal(member.isDead(p), false);
    assert.equal(hp.current(p), 100); assert.equal(hp.max(p), 100);
    growth.applyHp(p); presence.reconcile(p, 301);
    assert.equal(hp.max(p), 100);
  }
});

it('既存のidle HP0を修復するが、試合中の死亡者やHPが残っているロビーの人は回復しない', () => {
  const { p, hp, member, state, presence } = harness();
  p.mode = 'Creative'; // 運営の移動ガードより前にHPを直す。
  state.setPhase('wave', 0); presence.reconcile(p, 1);
  assert.equal(hp.current(p), 0); assert.equal(member.isDead(p), true);
  member.setMembership(p, 'out'); member.setDead(p, false);
  state.setPhase('idle', 2); presence.reconcile(p, 3);
  assert.equal(hp.current(p), 100); assert.equal(hp.max(p), 100);
  hp.damage(p, 20); presence.reconcile(p, 4);
  assert.equal(hp.current(p), 80);
});
