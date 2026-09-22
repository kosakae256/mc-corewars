/** 遠距離の移動AIを統一し、全rosterの索敵100を監査する（spec/38）。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dump, settings } from './pve3-mobjson.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = path.join(root, 'worlds/pve-v3/packs/pve_v3');
const require = createRequire(path.join(pack, 'package.json'));
const ts = require('typescript');
const defs = [];
for (let i = 1; i <= 5; i++) {
  const source = fs.readFileSync(path.join(pack, `scripts/core/roster/star${i}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = { exports: {} };
  vm.runInNewContext(compiled.outputText, context);
  defs.push(...Object.values(context.exports[`STAR${i}`]));
}
const { walk, moveTop, tiers } = settings();
const check = process.argv.includes('--check');
const entities = path.join(pack, 'behavior_packs/pve_v3/entities');
const docs = new Map(fs.readdirSync(entities).filter(f => f.endsWith('.json')).map(file => {
  const doc = JSON.parse(fs.readFileSync(path.join(entities, file), 'utf8'));
  return [doc['minecraft:entity'].description.identifier, { file, doc }];
}));
const seek = 'pve_v3:ranged_seek';
const foxWalk = 'pve_v3:fox_walk';
const movementGoals = ['random_stroll', 'random_hover', 'float_wander', 'move_around_target',
  'avoid_mob_type', 'move_towards_target', 'melee_box_attack', 'delayed_attack'];
const reachOf = d => d.beam?.range ?? (d.sweep?.atRange ? d.sweep.radius : undefined)
  ?? d.lob?.range ?? d.orbit?.range ?? (d.kind === 'shoot' ? d.reach : undefined);
const round = n => Number(n.toFixed(4));

function removeFoxActivation(node) {
  if (!node || typeof node !== 'object') return;
  if (node.add?.component_groups) {
    node.add.component_groups = node.add.component_groups.filter(g => g !== foxWalk);
  }
  for (const child of Object.values(node)) removeFoxActivation(child);
}

function adjust(doc, def) {
  const ent = doc['minecraft:entity'];
  const comp = ent.components;
  const ranged = reachOf(def) !== undefined;
  ent.component_groups ??= {};
  ent.events ??= {};
  if (['shotgun', 'gunner'].includes(def.id)) {
    ent.description.properties ??= {};
    Object.assign(ent.description.properties, {
      'pve_v3:gun_aim': { type: 'bool', default: false, client_sync: true },
      'pve_v3:gun_yaw': { type: 'float', range: [-180, 180], default: 0, client_sync: true },
      'pve_v3:gun_pitch': { type: 'float', range: [-90, 90], default: 0, client_sync: true },
    });
  }
  comp['minecraft:follow_range'] = { value: 100, max: 100 };
  for (const [name, c] of [['base', comp], ...Object.entries(ent.component_groups)]) {
    for (const key of ['nearest_attackable_target', 'hurt_by_target']) {
      const goal = c[`minecraft:behavior.${key}`];
      if (!goal) continue;
      if (key === 'nearest_attackable_target') {
        goal.within_radius = 100;
        goal.must_see = false;
        goal.reselect_targets = true;
      }
      for (const type of goal.entity_types ?? []) {
        type.max_dist = 100;
        if (key === 'nearest_attackable_target') type.must_see = false;
      }
      if (ranged) goal.priority = key === 'nearest_attackable_target' ? 1 : 2;
    }
    if (!ranged || name === foxWalk || name === seek) continue;
    for (const goal of movementGoals) delete c[`minecraft:behavior.${goal}`];
    const attack = c['minecraft:behavior.ranged_attack'];
    if (def.charge?.commit && attack) {
      delete c['minecraft:behavior.ranged_attack'];
      continue;
    }
    if (attack) {
      // この部品の倍率は正数必須。接近はpriority 0の共通移動だけが担当する。
      attack.priority = 4;
      attack.speed_multiplier = 0.0001;
      if (def.id === 'seeker') {
        const tier = name === 'base' ? 1 : tiers.find(t => `pve_v3:haste_${Math.round(t * 100)}` === name);
        if (tier === undefined) throw new Error(`Unknown attack tier: ${name}`);
        attack.attack_interval_min = Number((def.interval / 20 / tier).toFixed(3));
        attack.attack_interval_max = attack.attack_interval_min;
      }
    }
  }
  // 弾幕は構えて静止せず、放射しながら低空をうろつく。接近priority 0が必要な間だけ優先。
  if (def.id === 'barrage') {
    comp['minecraft:behavior.random_hover'] = {
      priority: 6, interval: 1, xz_dist: 8, y_dist: 1, y_offset: 0, hover_height: { min: 1, max: 2 },
    };
  }
  if (def.charge?.commit) {
    ent.component_groups['pve_v3:shot_charge'] = { 'minecraft:is_charged': {} };
    ent.events['pve_v3:shot_charge'] = { add: { component_groups: ['pve_v3:shot_charge'] } };
    ent.events['pve_v3:shot_done'] = { remove: { component_groups: ['pve_v3:shot_charge'] } };
  }
  if (['taint', 'charged'].includes(def.id)) {
    comp['minecraft:attack'] = { damage: 1 };
    for (const [name, c] of [['base', comp], ...Object.entries(ent.component_groups)]) {
      const goal = c['minecraft:behavior.melee_box_attack'];
      if (!goal) continue;
      const tier = name === 'base' ? 1 : tiers.find(t => `pve_v3:haste_${Math.round(t * 100)}` === name);
      if (tier === undefined) throw new Error(`Unknown melee tier: ${name}`);
      goal.cooldown_time = round(def.interval / 20 / tier);
      goal.track_target = true;
    }
  }
  if (['titan', 'gunner', 'chamber', 'seeker', 'healer', 'rouser', 'vital'].includes(def.id)) {
    const value = round(def.speed * walk);
    comp['minecraft:movement'] = { value, max: round(value * moveTop) };
  }
  if (ranged) {
    ent.component_groups[seek] = {
      // spec/25 §14で実績のある追跡。攻撃はBPとScriptの両方で無効にする。
      'minecraft:attack': { damage: 0 },
      'minecraft:behavior.melee_box_attack': {
        priority: 0, speed_multiplier: 1, track_target: true, require_complete_path: false,
        random_stop_interval: 0, horizontal_reach: 0, can_spread_on_fire: false,
      },
    };
    removeFoxActivation(ent.events);
    const legacy = ent.component_groups[foxWalk] ? [foxWalk] : [];
    ent.events[seek] = { remove: { component_groups: [seek, ...legacy] }, add: { component_groups: [seek] } };
    ent.events['pve_v3:ranged_hold'] = { remove: { component_groups: [seek, ...legacy] } };
  }
}

const rows = [], issues = [], visited = new Set();
for (const def of defs) {
  const id = def.spawnId ?? `pve_v3:${def.id}`;
  const item = docs.get(id);
  if (!item) { issues.push(`${def.id}: missing ${id}`); continue; }
  const original = JSON.stringify(item.doc);
  adjust(item.doc, def);
  const ent = item.doc['minecraft:entity'];
  if (!def.neutral && !ent.components['minecraft:behavior.nearest_attackable_target']) {
    issues.push(`${def.id}: no active nearest_attackable_target`);
  }
  if (!visited.has(id)) {
    if (check && original !== JSON.stringify(item.doc)) issues.push(`${def.id}: regenerate AI config`);
    if (!check) fs.writeFileSync(path.join(entities, item.file), dump(structuredClone(item.doc)) + '\n');
    visited.add(id);
  }
  rows.push({ id: def.id, entity: id, neutral: !!def.neutral, search: 100,
    attackRange: reachOf(def) ?? null, movement: ent.components['minecraft:movement']?.value });
}
const out = path.join(root, 'out/enemy-ai');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify({ rows, issues }, null, 2) + '\n');
console.log(`Enemy AI: ${rows.length} roster entries / ${visited.size} entities / ${rows.filter(r => r.attackRange !== null).length} ranged; ${issues.length} issues`);
for (const issue of issues) console.error(issue);
if (issues.length) process.exitCode = 1;
