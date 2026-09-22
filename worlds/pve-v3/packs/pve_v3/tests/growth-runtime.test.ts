/** 実際の購入・HP保存処理を使い、コマンド指定との競合を検査する。 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, { exports, require: name =>
      load(path.resolve(path.dirname(file), name.replace(/\.js$/, '.ts'))) });
    return exports;
  }
  const values = new Map();
  const player = { getDynamicProperty: k => values.get(k), setDynamicProperty: (k, v) => values.set(k, v) };
  return { player, values, growth: load('scripts/services/growth.ts'), hp: load('scripts/state/hp.ts'),
    state: load('scripts/state/growth.ts'), keys: load('scripts/state/keys.ts').KEYS };
}

it('通常購入・まとめ買いで最大HPが即座に増え、現在HPは維持する', () => {
  const { player, growth, hp, state } = harness();
  growth.applyHp(player);
  hp.damage(player, 30);
  state.setEmerald(player, 100000);
  assert.equal(growth.buy(player, 'hp', 1).bought, 1);
  assert.equal(hp.max(player), 150);
  assert.equal(hp.current(player), 70);
  assert.equal(growth.buy(player, 'hp', 40).bought, 39);
  assert.equal(hp.max(player), 2100);
  assert.equal(hp.current(player), 70);
  growth.applyHp(player);
  assert.equal(hp.max(player), 2100);
});

it('旧hpコマンドの固定値にも購入済み分が戻り、周期処理で二重加算しない', () => {
  const { player, values, keys, growth, hp, state } = harness();
  values.set(keys.hpBase, 200);
  hp.setup(player, 200);
  state.setLevel(player, 'hp', 3);
  growth.applyHp(player);
  growth.applyHp(player);
  assert.equal(hp.max(player), 350);
  assert.equal(hp.current(player), 200);
  state.setEmerald(player, 1000);
  growth.buy(player, 'hp', 1);
  assert.equal(hp.max(player), 400);
});

it('hpコマンドは購入済みでも指定値になり、その後の購入だけを加算する', () => {
  const { player, growth, hp, state } = harness();
  state.setLevel(player, 'hp', 5);
  growth.applyHp(player);
  growth.setPlayerHp(player, 500);
  assert.equal(hp.max(player), 500);
  state.setEmerald(player, 10000);
  growth.buy(player, 'hp', 5);
  assert.equal(hp.max(player), 750);
  growth.applyHp(player);
  assert.equal(hp.max(player), 750);
  growth.setPlayerHp(player, 200);
  assert.equal(hp.max(player), 200);
  growth.buy(player, 'hp', 1);
  assert.equal(hp.max(player), 250);
});

it('購入失敗・他ステータスの購入ではHPが増えず、死亡状態も維持する', () => {
  const { player, growth, hp, state } = harness();
  growth.setPlayerHp(player, 200);
  assert.equal(growth.buy(player, 'hp', 1).bought, 0);
  assert.equal(hp.max(player), 200);
  state.setEmerald(player, 1000);
  growth.buy(player, 'power', 1);
  assert.equal(hp.max(player), 200);
  hp.damage(player, 200);
  growth.buy(player, 'hp', 1);
  assert.equal(hp.max(player), 250);
  assert.equal(hp.current(player), 0);
});

it('ロビー復帰はHP0と確認用指定を100/100へ戻し、次の購入にも古い指定を残さない', () => {
  const { player, growth, hp, state, values, keys } = harness();
  state.setLevel(player, 'hp', 8);
  state.setEmerald(player, 50000);
  growth.setPlayerHp(player, 1000);
  hp.damage(player, 1000);
  growth.resetForLobby(player);
  growth.applyHp(player);
  assert.equal(hp.current(player), 100);
  assert.equal(hp.max(player), 100);
  assert.equal(state.levelOf(player, 'hp'), 0);
  assert.equal(state.emeraldOf(player), 0);
  assert.equal(values.get(keys.hpBase), undefined);
  assert.equal(values.get(keys.hpBaseGrowth), undefined);
  state.setEmerald(player, 1000);
  growth.buy(player, 'hp', 1);
  assert.equal(hp.max(player), 150);
  assert.equal(hp.current(player), 100);
});
