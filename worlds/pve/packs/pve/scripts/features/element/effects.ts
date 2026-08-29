/**
 * 属性が何をするか。
 *
 * 仕様は `docs/spec/17-element.md` 3 章、効果の元は `docs/04-roles.md` 2-4。
 *
 * | 属性 | 最大の効果 | 効き具合を掛ける先 |
 * | --- | --- | --- |
 * | **水** | 受けるダメージ **1.25 倍** | 倍率（`features/damage` が読む） |
 * | **雷** | 与ダメの **50%** ＋ 一瞬止める | **止める長さ**（溜まるほど止まらない） |
 * | **火** | 与ダメの **75%** を **1 秒おきに 5 回** | **蓄積を積むかどうか**（量は効き具合を掛けない） |
 * | **風** | **後ろへ弾き飛ばす** ＋ 与ダメの **20%** | 弾く強さと量 |
 * | **氷** | **満ちたら炸裂**。現在 HP の **5%** | 炸裂するかどうか |
 *
 * **属性が与えるダメージは `kind: "element"`** で通す——
 * **属性から属性は起きない**（`docs/spec/17-element.md` 4 章）。
 */

import { EffectTypes, Player, type Entity, type Vector3 } from "@minecraft/server";

import { elementRate, type Element } from "../../lib/element.js";
import { addGauge, clearGauge } from "../../state/gauge.js";
import { accumulates, weaponKindOf, type WeaponKind } from "./gauges.js";
import { lookOf } from "./looks.js";
import { addBurn } from "./burn.js";
import { current } from "../../state/hp.js";
import { hit, type HitInfo } from "../damage/index.js";
import { resistOf } from "./resist.js";
import { strike } from "./thunder.js";

/** 雷：与ダメに対する割合 */
const THUNDER_RATE = 0.5;

/** 雷：止める長さ（tick）。**効き具合が上がるほど短くなる** */
const THUNDER_STUN = 6;

/** 風：与ダメに対する割合 */
const WIND_RATE = 0.2;

/**
 * 風：後ろへ弾く強さ（最大）。
 *
 * **0.4**（2026-08-29 に 1/4 にした）。1.6 では**吹き飛びすぎて、追えなかった。**
 */
const WIND_PUSH = 0.4;

/** 風：浮かせる強さ（最大）。**押す強さと一緒に 1/4** */
const WIND_LIFT = 0.11;

/** 氷：炸裂したときに削る、相手の現在 HP の割合 */
const ICE_RATE = 0.05;

/** 炎を散らす幅（マス） */
const FLAME_SPREAD = 0.45;

/** 炎を何本立てるか */
const FLAME_COUNT = 3;

/**
 * 炎だけは**バニラの粒を使う**（2026-08-29 決定）。
 *
 * **自分で描いた炎より、バニラのほうが炎に見えた。**
 * **数と置き場所はこちらで決める**（体の周りに散らす）。
 */
const VANILLA_FLAME = "pve:el_fire";

/** 音の大きさ。**戦っている最中に何度も鳴るので小さく** */
const SOUND_VOLUME = 0.45;

function put(entity: Entity, id: string): void {
  try {
    const at: Vector3 = entity.location;
    entity.dimension.spawnParticle(id, { x: at.x, y: at.y, z: at.z });
  } catch {
    /* もう居ない・読み込まれていない */
  }
}

/**
 * その武器・その属性の音を鳴らす。**無ければ鳴らさない**
 *（`features/element/looks.ts`）。
 */
function sound(entity: Entity, kind: WeaponKind, element: Element): void {
  const id = lookOf(kind, element).sound;
  if (id === undefined) return;
  play(entity, id);
}

/** 音を鳴らす。**当たった場所から** */
function play(entity: Entity, id: string): void {
  try {
    const at: Vector3 = entity.location;
    entity.dimension.playSound(id, { x: at.x, y: at.y + 1, z: at.z }, { volume: SOUND_VOLUME });
  } catch {
    /* もう居ない */
  }
}

/** 炎を体の周りに立てる。**バニラの粒を、こちらの置き方で** */
function flames(entity: Entity): void {
  try {
    const at: Vector3 = entity.location;
    const dim = entity.dimension;
    for (let i = 0; i < FLAME_COUNT; i++) {
      dim.spawnParticle(VANILLA_FLAME, {
        x: at.x + (Math.random() - 0.5) * FLAME_SPREAD * 2,
        y: at.y + 0.15 + Math.random() * 1.2,
        z: at.z + (Math.random() - 0.5) * FLAME_SPREAD * 2,
      });
    }
  } catch {
    /* もう居ない */
  }
}

/**
 * 当たった印を出す。**武器の種類で見せ方が変わる**
 *（`features/element/looks.ts`）。
 */
export function markElement(entity: Entity, element: Element, kind: WeaponKind = "bow"): void {
  const look = lookOf(kind, element);
  if (look.flame === true) {
    flames(entity);
    return;
  }
  if (look.hit !== undefined) put(entity, look.hit);
}

/** 溜まっている間の印（`docs/spec/17-element.md` 5-5） */
export function markState(entity: Entity, element: Element, kind: WeaponKind = "bow"): void {
  const look = lookOf(kind, element);
  if (look.state !== undefined) put(entity, look.state);
}

/** 属性が削る。**ここからは何も起きない**（`kind: "element"`） */
function bite(info: HitInfo, amount: number, element: Element): void {
  if (amount <= 0) return;
  hit({ by: info.by, target: info.target, attack: amount, via: info.via, kind: "element", element });
}

/** 一瞬止める。**溜まるほど止まらない**（`docs/spec/17-element.md` 3-1） */
function stun(target: Entity, ticks: number): void {
  if (ticks < 1) return;
  try {
    if (target instanceof Player) return; // **プレイヤーは止めない**（操作が奪われる）
    target.addEffect(EffectTypes.get("slowness") ?? "slowness", Math.round(ticks), {
      amplifier: 250,
      showParticles: false,
    });
  } catch {
    /* 効かない相手 */
  }
}

/**
 * 属性 1 つぶんを効かせる。
 *
 * @param now いまの tick
 */
export function applyElement(info: HitInfo, element: Element, now: number): void {
  const target = info.target;
  // **武器ごとに分かれた入れ物へ溜める**（`docs/spec/17-element.md` 2-2）
  const weapon = weaponKindOf(info.via);
  // **溜まらない属性は、当たればその場で満**（雷・風。同 2-3）
  // **蓄積は倍率を掛けられる**（破魔矢。削る量は変わらない）
  const gain = info.dealt * (info.elementScale ?? 1);
  const rate = accumulates(weapon, element)
    ? elementRate(addGauge(target, weapon, element, gain, now), resistOf(target, element))
    : 1;

  switch (element) {
    case "water":
      // **削る側が蓄積を読む**（`features/damage` の防御率）。ここでは印だけ
      markElement(target, element, weapon);
      return;

    case "thunder":
      bite(info, info.dealt * THUNDER_RATE, element);
      // **溜まらない属性は、いつも同じ長さで止める**（`docs/spec/17-element.md` 3-1）
      stun(target, accumulates(weapon, element) ? THUNDER_STUN * (1 - rate) : THUNDER_STUN);
      // **上から落ちる 1 本の雷**（`features/element/thunder.ts`）
      try {
        strike(target, target.location);
      } catch {
        /* もう居ない */
      }
      sound(target, weapon, element);
      return;

    case "fire":
      // **蓄積を 1 つ積む。** 1 秒おきに 5 回、与ダメの 15% ずつ焼ける
      //（`features/element/burn.ts`）
      addBurn(target, info.dealt, now);
      markElement(target, element, weapon);
      return;

    case "wind":
      bite(info, info.dealt * WIND_RATE * rate, element);
      // **後ろへ飛ばす。** 溜まるほど遠くへ
      blow(target, info.by, WIND_PUSH * rate, WIND_LIFT * rate);
      markElement(target, element, weapon);
      return;

    case "ice":
      // **満ちて初めて起きる**（`docs/spec/17-element.md` 3-2）
      if (rate < 1) {
        markElement(target, element, weapon);
        return;
      }
      clearGauge(target, weapon, element);
      bite(info, (current(target) ?? 0) * ICE_RATE, element);
      // **満ちた瞬間だけは派手に**（`features/element/looks.ts` の `burst`）
      for (const id of lookOf(weapon, element).burst ?? []) put(target, id);
      sound(target, weapon, element);
      return;

    default:
      return;
  }
}

/**
 * 後ろへ弾き飛ばす。
 *
 * **撃った相手から見て、まっすぐ後ろへ。**
 * 上へ浮かせるだけだと**その場で跳ねるだけ**になる（2026-08-29 の直し）。
 *
 * @param push 横に押す強さ
 * @param lift 上へ浮かせる強さ
 */
function blow(target: Entity, from: Entity | undefined, push: number, lift: number): void {
  if (push <= 0 && lift <= 0) return;
  let dx = 0;
  let dz = 0;
  try {
    if (from !== undefined) {
      const a = target.location;
      const b = from.location;
      const len = Math.hypot(a.x - b.x, a.z - b.z);
      if (len > 1e-4) {
        dx = ((a.x - b.x) / len) * push;
        dz = ((a.z - b.z) / len) * push;
      }
    }
  } catch {
    /* もう居ない */
  }
  try {
    if (target instanceof Player) {
      target.applyKnockback({ x: dx, z: dz }, lift);
      return;
    }
    target.applyImpulse({ x: dx, y: lift, z: dz });
  } catch {
    /* 押せない相手 */
  }
}
