/**
 * 敵の実体 JSON に、**段と速さを書き込む**。
 *
 *     node tools/pve3-mobjson.mjs
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 2 章・3 章。
 *
 * ## なぜ道具にするのか
 *
 * > ### **攻撃速度の段は 41 段ある**
 * >
 * > **`cooldown_time` は実行中に書き換えられない**ので、
 * > **段ごとの部品を JSON に並べておく**しかない。
 * > **41 段 × モブの数**を手で写すのは無理**——1 か所直すたびに全部直すことになる。**
 *
 * **固有値は `scripts/core/roster.ts` が持ち主。** ここはそれを読んで写すだけ。
 *
 * ## 触るのはここだけ
 *
 * | | |
 * | --- | --- |
 * | `minecraft:movement` | **`value` と `max`**（`max` が無いと速くならない） |
 * | 攻撃の部品の間隔 | `melee_box_attack.cooldown_time` / `ranged_attack.attack_interval_*` |
 * | `pve_v3:haste_*` の部品群 | **丸ごと作り直す** |
 * | `pve_v3:set_haste_*` / `pve_v3:haste_clear` の合図 | **丸ごと作り直す** |
 *
 * **それ以外には触らない。** **手で書いた行動・見た目・当たり判定はそのまま残る。**
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PACK = path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3");
const SCRIPTS = path.join(PACK, "scripts", "core");
const ENTITIES = path.join(PACK, "behavior_packs", "pve_v3", "entities");

/**
 * **飛ぶ敵の既定の物差し。**
 *
 * > ### **重力を切ると、地面の摩擦が効かない**（実測・2026-09-08）
 * >
 * > **同じ数でも、歩く敵よりずっと速く見える。**
 * > **バニラ**: コウモリ 0.1 ／ ブレイズ 0.23 ／ ガスト 0.03。
 * > **0.5 は速すぎた。** **ミツバチと同じ 0.15 が、ちょうどよかった。** **敵ごとに `baseSpeed` で上書きできる。**
 */
const FLY_BASE = 0.15;

/** 1 秒 ＝ 20 tick */
const TPS = 20;

/** その数を、この桁で丸める */
const round = (v, digits) => Number(v.toFixed(digits));

/** `export const NAME = 1.25;` を読む */
export /**
 * **書き出す。** **`"type": "float"` の property は、必ず小数のまま残す。**
 *
 * > ### **JSON を読み直して書くと `0.0` が `0` になる**（**踏んだ**・2026-09-09）
 * >
 * > **JavaScript に整数と小数の区別が無い。**
 * > **Bedrock は `"type": "float"` に整数が来ると弾き、
 * > その実体の property が全部消える**（`24-mob-howto.md` 9-4-1）。
 * >
 * > **`pve3-newmob.mjs` を直しただけでは足りなかった**——
 * > **この道具も同じ壊し方をしていた。** **書く側は全部これを通す。**
 */
function dump(doc) {
  const props = doc?.["minecraft:entity"]?.description?.properties;
  const mark = (n) => `##${Number(n).toFixed(2)}##`;
  if (props !== undefined && props !== null) {
    for (const v of Object.values(props)) {
      if (v?.type !== "float") continue;
      if (typeof v.default === "number") v.default = mark(v.default);
      if (Array.isArray(v.range)) v.range = v.range.map((x) => (typeof x === "number" ? mark(x) : x));
    }
  }
  return JSON.stringify(doc, null, 2).replace(/"##(-?\d+\.\d+)##"/g, "$1");
}

function constOf(src, name) {
  const m = new RegExp(`export const ${name}\\s*=\\s*([\\d.]+)`).exec(src);
  if (m === null) throw new Error(`${name} が見つからない`);
  return Number(m[1]);
}

/**
 * `ENEMIES` の 1 件ずつを読む。
 *
 * **`hp:` を持つものだけ**——軍団（`LEGIONS`）は持たないので、そこで自然に切れる。
 * **改行の入れ方に左右されない**よう、空白を潰してから区切る。
 */
/**
 * **1 件ずつに切る。**
 *
 * > ### **`"},"` で切ってはいけない**（実測・2026-09-08 に踏んだ）
 * >
 * > **旗は入れ子になっている**（`lob: { ... }` / `charge: { ... }` / `fall: { ... }`）。
 * > **`"},"` で切ると、入れ子の閉じ括弧で 1 件が真っ二つになる。**
 * > **後ろ半分は `hp:` を持たないので捨てられ、そこに書いた旗は届かない。**
 * >
 * > **ブレイズの `charge` が JSON に入らず、3 連射しなかった**のがこれ。
 *
 * **波括弧の対応を数えて切る。**
 */
function entriesOf(body) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") {
      depth += 1;
      // **深さ 1 → 2 が、1 件の始まり**（深さ 1 は `ENEMIES = {` のぶん）
      if (depth === 2) start = i;
      continue;
    }
    if (ch !== "}") continue;
    depth -= 1;
    if (depth === 1 && start >= 0) {
      out.push(body.slice(start, i + 1));
      start = -1;
    }
  }
  return out;
}

export function enemiesOf(src) {
  // **`export const ENEMIES` でも `export const STARn` でも読める**（2026-09-08 に★別へ分けた）
  const at = src.search(/export const (?:ENEMIES|STAR\d)/);
  // > ### **コメントを先に落とす**（実測・2026-09-08 に踏んだ）
  // >
  // > **ここは正規表現で `interval:` などを拾う。**
  // > **コメントに `horizontal_reach: 0` と書いてあると、それを `reach` として読む。**
  // > **`interval: 0` と書けば、攻撃間隔が 0 になる**——**説明のつもりが値になる。**
  const body = (at < 0 ? "" : src.slice(at))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
  const out = [];
  for (const chunk of entriesOf(body)) {
    if (!chunk.includes("hp:")) continue;
    const id = /id:\s*"([a-z0-9_]+)"/.exec(chunk);
    if (id === null) continue;
    const num = (key) => {
      const v = new RegExp(`${key}:\\s*([\\d.]+)`).exec(chunk);
      return v === null ? undefined : Number(v[1]);
    };
    // > ### **旗（`fly` / `neutral` / `still`）も読む**（2026-09-08 に足した）
    // >
    // > **`pve3-newmob.mjs` の `common()` がこれを見て、部品を差し替える**
    // > （`25-enemy-kit.md` 11 章・12 章）。
    // > **ここで落とすと、旗を書いても「歩く・誰でも狙う」ひな形が出てくる**——
    // > **黙って効かないので、コウモリで踏んだ。**
    const flag = (key) => new RegExp(`${key}:\\s*true`).test(chunk);
    const kind = /kind:\s*"([a-z]+)"/.exec(chunk);
    const hand = /hand:\s*"([a-z0-9_:]+)"/.exec(chunk);
    const head = /head:\s*"([a-z0-9_:]+)"/.exec(chunk);
    out.push({
      id: id[1],
      speed: num("speed"),
      interval: num("interval"),
      reach: num("reach"),
      kind: kind === null ? "melee" : kind[1],
      hand: hand === null ? undefined : hand[1],
      head: head === null ? undefined : head[1],
      fly: flag("fly"),
      neutral: flag("neutral"),
      still: flag("still"),
      noMelee: flag("noMelee"),
      roam: flag("roam"),
      ghost: flag("ghost"),
      tallFly: flag("tallFly"),
      charged: flag("charged"),
      chargedInterval: num("chargedInterval"),
      variant: num("variant"),
      standoff: num("standoff"),
      baseSpeed: num("baseSpeed"),
      keepAway: num("keepAway"),
      charge: chargeOf(chunk),
      aura: /aura:\s*\{/.test(chunk) ? {} : undefined,
      sweep: /sweep:\s*\{/.test(chunk) ? { atRange: /atRange:\s*true/.test(chunk) } : undefined,
    });
  }
  return out;
}

/** **撃つ前の溜め**（`EnemyDef.charge`）。**書いていなければ `undefined`** */
function chargeOf(chunk) {
  const at = chunk.indexOf("charge: {");
  if (at < 0) return undefined;
  const body = chunk.slice(at, chunk.indexOf("}", at));
  const pick = (key) => {
    // **`\\s` `\\d` は必ず二重に。** 文字列の中では `\s` が `s` になり、何も拾えない
    const m = new RegExp(`${key}:\\s*([\\d.]+)`).exec(body);
    return m === null ? undefined : Number(m[1]);
  };
  const shoot = pick("shoot");
  if (shoot === undefined) return undefined;
  return { shoot, charged: pick("charged"), burst: pick("burst"), burstGap: pick("burstGap") };
}

/** 段の一覧（倍率）。**`core/haste.ts` と同じ作り方** */
export function tiersOf(step, top) {
  const out = [];
  for (let v = 1; v <= top * step; v *= step) out.push(v);
  return out;
}

/** その段の合図に使う整数 */
const nameOf = (mult) => Math.round(mult * 100);

/**
 * 攻撃の部品の名前（**種類で変わる**）。
 *
 * > ### **薙ぎ払う敵は `delayed_attack`**（2026-09-08）
 * >
 * > **溜めてから当てる部品**（`docs/research/05-entity-behaviors.md`）。
 * > **持っているほうを見る**——**無い部品に書き込んでも意味が無い。**
 */
function attackKey(kind, comp) {
  if (kind === "shoot") return "minecraft:behavior.ranged_attack";
  if (comp !== undefined && comp["minecraft:behavior.delayed_attack"] !== undefined) {
    return "minecraft:behavior.delayed_attack";
  }
  return "minecraft:behavior.melee_box_attack";
}

/** その段の攻撃部品を作る。**基の部品を写して、間隔だけ差し替える** */
function attackAt(kind, base, seconds, mult, key) {
  const at = round(seconds, 3);
  // **溜めて振る敵は、振り全体の長さが間隔**（`attack_duration`）
  if (key === "minecraft:behavior.delayed_attack") return { ...base, attack_duration: at };
  if (kind !== "shoot") return { ...base, cooldown_time: at };
  const out = { ...base, attack_interval_min: at, attack_interval_max: at };
  // > ### **溜めも一緒に縮める**（実測・2026-09-08）
  // >
  // > **ブレイズは `charge_shoot_trigger: 4.0`**（撃つ前に 4 秒溜める）。
  // > **間隔だけ縮めても、溜めが下限になって速くならない。**
  // > **段の倍率で割る**——**バニラの値を基準に、呪いのぶんだけ短くなる。**
  if (typeof base.charge_shoot_trigger === "number") {
    out.charge_shoot_trigger = round(base.charge_shoot_trigger / mult, 3);
  }
  if (typeof base.burst_interval === "number") {
    out.burst_interval = round(base.burst_interval / mult, 3);
  }
  return out;
}

export function stamp(def, tiers, walk, moveTop) {
  const file = path.join(ENTITIES, `${def.id}.json`);
  if (!fs.existsSync(file)) return `${def.id}: JSON が無い（とばす）`;
  const doc = JSON.parse(fs.readFileSync(file, "utf-8"));
  const ent = doc["minecraft:entity"];
  const comp = ent.components ?? {};

  // ---- 速さ。**`max` を書かないと `value` が上限**（24-mob-howto 2 章）
  //
  // > ### **飛ぶ敵は物差しが違う**（2026-09-08）
  // >
  // > **`baseSpeed` を書いた敵は、そちらを 1.0 とする**（バニラのガストは 0.03）。
  // > ### **飛ぶ敵は既定でも遅くする**（実測・2026-09-08）
  // >
  // > **重力を切ってあるので、地面の摩擦が効かない。**
  // > **歩く物差し（0.2875）のままだと、どれも目で追えない速さになった。**
  // > **バニラ**: コウモリ 0.1 ／ ブレイズ 0.23 ／ ガスト 0.03。**既定は 0.1。**
  // > ### **飛ぶ敵は 2 つの速さを持つ**（実測・2026-09-08）
  // >
  // > **ミツバチ**: `movement: 0.3` ／ `flying_speed: 0.15`。
  // > **`minecraft:movement` は経路探索が使い、`flying_speed` が実際に飛ぶ速さ。**
  // > **両方に飛ぶ値を入れたら、歩く側が遅すぎて動きが鈍くなった。**
  const value = round(def.speed * walk, 4);
  comp["minecraft:movement"] = { value, max: round(value * moveTop, 4) };
  // > ### **飛ぶ敵は `flying_speed` で飛ぶ**（`25-enemy-kit.md` 11 章）
  // >
  // > **公式**: *Speed in Blocks that this entity flies at.*（既定 0.02・ミツバチは 0.15）
  // > **`minecraft:movement` とは別の値**——**こちらを書かないと、既定の 0.02 で這う。**
  if (comp["minecraft:flying_speed"] !== undefined) {
    comp["minecraft:flying_speed"] = { value: round(def.speed * (def.baseSpeed ?? FLY_BASE), 4) };
  }

  // ---- 攻撃の間隔。**基の部品は ×1.0**
  const key = attackKey(def.kind, comp);
  const base = comp[key];
  // > ### **殴らない敵は、速さだけ書いて帰る**（2026-09-08）
  // >
  // > **`noMelee` の敵はバニラの攻撃部品を持たない**（`24-mob-howto.md` 9-4）。
  // > **段も要らない**——**script が振る間隔は `KEYS.swing`**（湧かせたときに入る）。
  // > **速さを書かずに帰っていたので、書いてから帰る。**
  if (base === undefined) {
    ent.components = comp;
    // **殴らなくても、飛ぶ速さの段は要る**（弾幕・2026-09-10）
    ent.component_groups = ent.component_groups ?? {};
    ent.events = ent.events ?? {};
    flyTiers(comp, ent.component_groups, ent.events, tiers);
    fs.writeFileSync(file, `${dump(doc)}
`, "utf-8");
    return `${def.id}: ${key} が無い（速さと飛ぶ段だけ書いた）`;
  }
  comp[key] = attackAt(def.kind, base, def.interval / TPS, 1, key);

  // > ### **爆ぜる敵に段を作らない**（2026-09-08 決定）
  // >
  // > **導火線の長さは `EnemyDef.interval`**（`minecraft:explode` の `fuse_length`）。
  // > **呪いで攻撃速度が上がると、爆発までの時間まで縮んで理不尽になる。**
  // > **クリーパー系だけは、いつでも同じ長さで爆ぜる。**
  if (def.kind === "boom") {
    for (const k of Object.keys(ent.component_groups ?? {})) {
      if (k.startsWith("pve_v3:haste_")) delete ent.component_groups[k];
    }
    for (const k of Object.keys(ent.events ?? {})) {
      if (k.startsWith("pve_v3:set_haste_") || k === "pve_v3:haste_clear") delete ent.events[k];
    }
    ent.components = comp;
    fs.writeFileSync(file, `${dump(doc)}
`, "utf-8");
    return `${def.id}: dan nashi (bakuhatsu wa itsumo ${round(def.interval / TPS, 2)} byou) / hayasa ${value}`;
  }

  // ---- 段。**古い段は作り直す**（他の部品群には触らない）
  const groups = ent.component_groups ?? {};
  for (const k of Object.keys(groups)) if (k.startsWith("pve_v3:haste_")) delete groups[k];
  const events = ent.events ?? {};
  for (const k of Object.keys(events)) {
    if (k.startsWith("pve_v3:set_haste_") || k === "pve_v3:haste_clear") delete events[k];
  }

  const names = [];
  for (const mult of tiers) {
    const n = nameOf(mult);
    names.push(`pve_v3:haste_${n}`);
    groups[`pve_v3:haste_${n}`] = { [key]: attackAt(def.kind, base, def.interval / TPS / mult, mult, key) };
    // **足すだけ。** 1 体につき 1 段しか足さないので、消す必要がない
    events[`pve_v3:set_haste_${n}`] = { add: { component_groups: [`pve_v3:haste_${n}`] } };
  }
  // **途中で段を変えたくなったとき用。** 先にこれを鳴らしてから足す
  events["pve_v3:haste_clear"] = { remove: { component_groups: names } };

  // > ### **飛ぶ速さは部品群で差し替える**（実測・2026-09-08）
  // >
  // > **`minecraft:flying_speed` は、script から `value` を書いても速さが変わらない。**
  // > **移動速度の効果でも属性でも伸びない**（バニラのミツバチで確かめた）。
  // >
  // > **攻撃速度と同じ手を使う**（3 章）——**段ごとの部品を並べて、湧いた瞬間に差し替える。**
  flyTiers(comp, groups, events, tiers);

  ent.components = comp;
  ent.component_groups = groups;
  ent.events = events;
  fs.writeFileSync(file, `${dump(doc)}\n`, "utf-8");
  return `${def.id}: ${tiers.length} dan / hayasa ${value} (max ${round(value * moveTop, 4)}) / ${key.split(".").pop()}`;
}

/** 固有値と段の設定を、まとめて読む */
export function settings() {
  const enemy = fs.readFileSync(path.join(SCRIPTS, "enemy.ts"), "utf-8");
  const haste = fs.readFileSync(path.join(SCRIPTS, "haste.ts"), "utf-8");
  // > ### **表は `core/roster/star1.ts` 〜 `star5.ts`**（2026-09-08 に分けた）
  // >
  // > **1 ファイル 300 行という決まりがあり、50 体は 1 枚に入らない。**
  // > **★ごとに分ければ、別の★を足す人と手がぶつからない。**
  const dir = path.join(SCRIPTS, "roster");
  const defs = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    if (!f.startsWith("star")) continue;
    defs.push(...enemiesOf(fs.readFileSync(path.join(dir, f), "utf-8")));
  }
  if (defs.length === 0) throw new Error("STAR* を読めなかった");
  return {
    defs,
    walk: constOf(enemy, "WALK"),
    moveTop: constOf(enemy, "MOVE_TOP"),
    tiers: tiersOf(constOf(haste, "HASTE_STEP"), constOf(haste, "HASTE_TOP")),
  };
}

/**
 * **飛ぶ速さの段を作り直す。**
 *
 * > ### **飛ぶ速さは部品群で差し替える**（実測・2026-09-08）
 * >
 * > **`minecraft:flying_speed` は、script から `value` を書いても速さが変わらない。**
 * > **移動速度の効果でも属性でも伸びない**（バニラのミツバチで確かめた）。
 * >
 * > **攻撃速度と同じ手を使う**（3 章）——**段ごとの部品を並べて、湧いた瞬間に差し替える。**
 *
 * > ### **殴らない飛ぶ敵にも作る**（2026-09-10・弾幕）
 * >
 * > **前は「速さだけ書いて帰る」道の先にあったので、`noMelee` の飛ぶ敵には段ができなかった。**
 * > **呪いと人数で飛ぶ速さが変わらない敵ができてしまう。**
 */
function flyTiers(comp, groups, events, tiers) {
  if (comp["minecraft:flying_speed"] === undefined) return;
  const fly = comp["minecraft:flying_speed"].value;
  for (const k of Object.keys(groups)) if (k.startsWith("pve_v3:fly_")) delete groups[k];
  for (const k of Object.keys(events)) {
    if (k.startsWith("pve_v3:set_fly_") || k === "pve_v3:fly_clear") delete events[k];
  }
  const names = [];
  for (const mult of tiers) {
    const n = nameOf(mult);
    names.push(`pve_v3:fly_${n}`);
    groups[`pve_v3:fly_${n}`] = { "minecraft:flying_speed": { value: round(fly * mult, 4) } };
    events[`pve_v3:set_fly_${n}`] = { add: { component_groups: [`pve_v3:fly_${n}`] } };
  }
  events["pve_v3:fly_clear"] = { remove: { component_groups: names } };
}

/** 全部の敵に書き込む。**`pve3-newmob.mjs` からも呼ぶ** */
export function stampAll(only) {
  const { defs, walk, moveTop, tiers } = settings();
  console.log(`dan: ${tiers.length} (x${round(tiers[0], 2)} .. x${round(tiers[tiers.length - 1], 2)})`);
  for (const def of defs) {
    if (only !== undefined && def.id !== only) continue;
    console.log(`  ${stamp(def, tiers, walk, moveTop)}`);
  }
}

// **道具として叩かれたときだけ動く**（読み込まれただけなら何もしない）
if (process.argv[1] !== undefined && url.pathToFileURL(process.argv[1]).href === import.meta.url) stampAll();
