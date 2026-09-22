/** HUD通信と、バニラへ追加するUIの構造を検査する。実機の描画検査とは区別する。 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness(overrides = {}) {
  const mocks = {
    '@minecraft/server': { HudElement: { Health: 6, Hunger: 8, ProgressBar: 7 }, HudVisibility: { Hide: 0 } },
    hp: { current: p => p.hp, max: p => p.cap, has: p => p.cap > 0 },
    growth: { emeraldOf: p => p.money },
    label: { labelOf: () => 'enemy' }, focus: { focusOf: () => undefined },
    ...overrides,
  };
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, { exports, require: name => mocks[name] ?? mocks[path.basename(name, '.js')]
      ?? load(path.resolve(path.dirname(file), name.replace(/\.js$/, '.ts'))) });
    return exports;
  }
  return name => load(`scripts/features/hud/${name}.ts`);
}
const plain = text => text.replace(/§./g, '');

it('味方の頭上は名前・ゲージ・HPの3行になり、増減・死亡・ロビー復帰でも重複しない', () => {
  class Player {
    constructor(id, name) { this.id = id; this.name = name; this.typeId = 'minecraft:player';
      this.hp = 100; this.cap = 100; this.writes = 0; this.location = { x: 0, y: 0, z: 0 }; }
    set nameTag(value) { this.tag = value; this.writes++; }
  }
  const alice = new Player('alice', 'Alice'), bob = new Player('bob', 'Bob');
  const ally = { id: 'ally', typeId: 'pve_v3:ally', hp: 50, cap: 100, matches: () => false };
  const foe = { id: 'foe', typeId: 'pve_v3:grunt', hp: 50, cap: 100, matches: () => true, nameTag: 'old' };
  alice.dimension = bob.dimension = { getEntities: () => [alice, bob, ally, foe] };
  let players = [alice, bob];
  const { updateNameplates } = harness({
    '@minecraft/server': { Player, world: { getAllPlayers: () => players } },
    field: { ENEMY_FAMILY: 'pve_mob' },
  })('nameplate');
  updateNameplates(); updateNameplates();
  assert.equal(plain(alice.tag), `Alice\n${'|'.repeat(20)}\nHP 100/100`);
  assert.equal(plain(bob.tag), `Bob\n${'|'.repeat(20)}\nHP 100/100`);
  assert.equal(alice.writes, 1); assert.equal(bob.writes, 1);
  for (const [hp, cap] of [[70, 100], [90, 100], [90, 150], [0, 150], [1750, 2100], [100, 100]]) {
    bob.hp = hp; bob.cap = cap; updateNameplates();
    assert.equal(plain(bob.tag), `Bob\n${'|'.repeat(20)}\nHP ${hp}/${cap}`);
    const gauge = bob.tag.split('\n')[1];
    const filled = hp > 0 ? Math.max(1, Math.round(hp / cap * 20)) : 0;
    assert.equal(gauge.split('§0')[0].replace(/§./g, '').length, filled);
    assert.equal(bob.tag.split('\n').length, 3);
  }
  assert.equal(ally.nameTag.split('\n').length, 3);
  assert.equal(foe.nameTag, '');
  players = [alice]; updateNameplates();
  players = [alice, bob]; updateNameplates();
  assert.equal(plain(bob.tag), `Bob\n${'|'.repeat(20)}\nHP 100/100`);
});

it('HPは画像名と数値を送り、満タン・半分・死亡・4桁に追従する', () => {
  const { hpHudText, moneyHudText } = harness()('hp-text');
  const decode = (hp, cap) => {
    const payload = moneyHudText(8, hp, cap).slice('pve3:money:'.length);
    const bytes = Buffer.from(payload, 'utf8');
    assert.equal(bytes[11], 58);
    assert.match(payload.slice(0, 10), /^f\d{2}_______$/);
    const filled = Number(payload.slice(1, 3));
    assert.ok(hpHudText(hp, cap).startsWith('pve3:hp:§f'));
    return { number: plain(hpHudText(hp, cap).slice('pve3:hp:'.length)), rate: filled / 96 };
  };
  assert.equal(decode(200, 200).number, '200/200');
  assert.equal(decode(200, 200).rate, 1);
  assert.equal(decode(100, 200).rate, 0.5);
  assert.equal(decode(0, 200).rate, 0);
  assert.equal(decode(1, 9999).rate, 1 / 96);
  assert.equal(decode(300, 200).rate, 1);
  assert.equal(decode(-1, 200).rate, 0);
  assert.deepEqual(decode(NaN, Infinity), { number: '0/0', rate: 0 });
  for (const hp of [200, 100, 99, 10, 9, 1, 0]) {
    assert.equal(decode(hp, 200).number, `${hp}/200`);
    assert.ok(!hpHudText(hp, 200).includes('|'));
  }
  assert.equal(decode(9999, 9999).number, '9999/9999');
  assert.equal(decode(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).number, `${Number.MAX_SAFE_INTEGER}/${Number.MAX_SAFE_INTEGER}`);
  assert.equal(decode(50, 300).number, '50/300');
  assert.ok(!hpHudText(NaN, Infinity).includes('NaN'));
  for (let width = 0; width <= 96; width++) {
    const frame = moneyHudText(8, width, 96).slice('pve3:money:'.length, 'pve3:money:'.length + 3);
    assert.equal(frame, `f${String(width).padStart(2, '0')}`);
    assert.ok(fs.existsSync(`resource_packs/pve_v3/textures/ui/pve3_hp/frames/${frame}.png`));
  }
});

it('通貨は3桁区切り、0・999・1000・百万を正しく表示する', () => {
  const { moneyHudText } = harness()('hp-text');
  for (const [value, expected] of [[0, '0'], [999, '999'], [1000, '1,000'], [1234567, '1,234,567']]) {
    const font = expected.length <= 7 ? 'K' : 'L';
    assert.equal(plain(moneyHudText(value, 200, 200)), `pve3:money:f96_______${font}:` + expected);
  }
});

it('クリエイティブにも送信し、変化・再送・再入場を扱い、アクションバーを占有しない', () => {
  const { showOwn, forgetOwn, hideHearts } = harness()('own');
  const packets = [];
  const p = { id: 'creative', hp: 200, cap: 200, money: 12345, getGameMode: () => 'Creative',
    onScreenDisplay: { setTitle: (text, options) => packets.push({ text, options }),
      setActionBar: () => assert.fail('HP must not occupy actionbar') } };
  showOwn(p, 0); showOwn(p, 2);
  assert.equal(packets.length, 1);
  assert.equal(plain(packets[0].options.subtitle), 'pve3:money:f96_______K:12,345');
  p.money = 1000; showOwn(p, 4);
  p.hp = 0; showOwn(p, 6);
  p.cap = 300; p.hp = 300; showOwn(p, 8);
  showOwn(p, 108);
  assert.equal(packets.length, 5);
  forgetOwn(p.id); showOwn(p, 110);
  assert.equal(packets.length, 6);
  p.onScreenDisplay.setHudVisibility = (mode, elements) => {
    assert.equal(mode, 0); assert.deepEqual(Array.from(elements), [6, 8, 7]);
  };
  hideHearts(p);
});

it('UIは3つのバニラ親へ追加し、ゲージの中央に数値を重ね、画像を参照する', () => {
  const ui = JSON.parse(fs.readFileSync('resource_packs/pve_v3/ui/hud_screen.json', 'utf8'));
  const vanillaPath = '../../../../bedrock-samples/resource_pack/ui/hud_screen.json';
  const vanilla = ts.parseConfigFileTextToJson(vanillaPath, fs.readFileSync(vanillaPath, 'utf8')).config;
  for (const parent of ['centered_gui_elements_at_bottom_middle', 'centered_gui_elements_at_bottom_middle_touch', 'not_centered_gui_elements']) {
    assert.ok(vanilla[parent]);
    const patch = ui[parent].modifications[0];
    assert.equal(patch.operation, 'insert_back');
    assert.equal(patch.array_name, 'controls');
    assert.equal(patch.value.length, 2);
    assert.ok(!ui[parent].controls);
  }
  const controls = JSON.stringify([ui.pve3_hp_label, ui.pve3_money]);
  assert.ok(!controls.includes('background'));
  assert.ok(!controls.includes('#show_survival_ui'));
  assert.equal(ui.pve3_money.controls[0].emerald.texture, 'textures/items/emerald');
  assert.equal(ui.pve3_money.size[0], 58);
  const moneyLabels = ui.pve3_money.controls[2].amount.controls.map(c => Object.entries(c)[0]);
  const { moneyHudText } = harness()('hp-text');
  for (const count of [8, 999, 1000, 999999, 1234567, 9999999999, Number.MAX_SAFE_INTEGER]) {
    const formatted = String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const chosen = moneyLabels.find(([name]) => formatted.length <= Number(name.slice(7)));
    assert.ok(chosen);
    const label = chosen[1];
    const wire = moneyHudText(count, 100, 100);
    const active = moneyLabels.filter(([, item]) => {
      const expression = item.bindings[2].source_property_name;
      const tag = expression.match(/- '([KLMN])'/)?.[1];
      assert.ok(tag, 'サイズの選択は専用タグを参照する');
      assert.equal(expression, `(not ((#hud_subtitle_text_string - '${tag}') = #hud_subtitle_text_string))`);
      return wire.includes(tag);
    });
    assert.equal(active.length, 1);
    assert.equal(active[0][0], chosen[0]);
    assert.equal(label.size[1], 'default');
    assert.equal(label.anchor_to, 'right_middle');
    assert.ok(formatted.length * 6 * label.font_scale_factor <= 44);
    assert.equal(label.text_alignment, 'right');
  }
  const parts = Object.assign({}, ...ui.pve3_hp_label.controls);
  const { number, fill, frame, empty } = parts;
  assert.equal(number.text_alignment, 'center');
  assert.equal(ui.pve3_hp_label.size[0] / 2 + number.offset[0], fill.offset[0] + fill.size[0] / 2);
  assert.equal(number.size[1], 'default');
  assert.equal(number.anchor_from, 'center');
  assert.equal(number.anchor_to, 'center');
  assert.ok(number.layer > fill.layer && number.layer > frame.layer);
  assert.ok(fill.layer > empty.layer);
  assert.ok(number.size[0] >= 9 * 6 * number.font_scale_factor); // 9999/9999
  assert.equal(fill.texture, '#texture');
  assert.equal(fill.bindings[1].target_property_name, '#texture');
  assert.equal(fill.bindings[1].source_property_name, "('textures/ui/pve3_hp/frames/' + ('%.3s' * (#hud_subtitle_text_string - 'pve3:money:')))");
  assert.ok(!JSON.stringify(fill).includes('clip_ratio'));
  assert.equal(number.bindings[1].source_property_name, "(#hud_title_text_string - 'pve3:hp:')");
  for (const c of [fill, frame, empty]) {
    const texture = c === fill ? 'textures/ui/pve3_hp/frames/f96' : c.texture;
    const png = fs.readFileSync(`resource_packs/pve_v3/${texture}.png`);
    assert.equal(png.readUInt32BE(16), c.size[0]);
    assert.equal(png.readUInt32BE(20), c.size[1]);
    assert.equal(png[25], 6); // RGBA
  }
  for (const parent of ['centered_gui_elements_at_bottom_middle', 'centered_gui_elements_at_bottom_middle_touch']) {
    const placed = ui[parent].modifications[0].value[0]['pve3_hp@hud.pve3_hp_label'];
    assert.equal(placed.offset[0], -1);
    assert.equal(placed.offset[1] + ui.pve3_hp_label.size[1], -26); // 4px gap above hotbar top(-22)
    const money = ui[parent].modifications[0].value[1]['pve3_money@hud.pve3_money'];
    assert.equal(money.offset[0], 1);
    assert.equal(180 + money.offset[0] - ui.pve3_money.size[0] - (placed.offset[0] + ui.pve3_hp_label.size[0]), 4);
  }
  assert.deepEqual(Object.keys(ui.hud_title_text), ['bindings']);
  assert.ok(ui.hud_title_text.bindings[1].source_property_name.includes("- 'pve3:hp:'"));
  assert.equal(ui.mob_effects_renderer.visible, false);
});
