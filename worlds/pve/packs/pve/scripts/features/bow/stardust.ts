/**
 * 星屑（legendary 33）。**降ってきて、削る。**
 *
 * 性能表は `docs/spec/14-effect.md` 2 章、見せ方は `docs/spec/12-stardust.md`。
 *
 * ## ここは「フック」から呼ばれる
 *
 * **ダメージの通り道には触らない**（`docs/spec/10-damage.md` 4-1）。
 * 当たったことだけを受け取り、**絵を出し、落ちた所を削る。**
 *
 * ## 組み立て
 *
 * ```
 * 0.00s  閃光 ＋ 地を這う輪
 * 0.10s〜 星が順に降ってくる（2 tick おき・それぞれ筋を引く）
 *        └ 落ちた所で弾け、**半径 2 マスのモブを削る**
 * 0.60s  舞い残る粉
 * ```
 *
 * ## ためで数が変わる
 *
 * **ためきっていない攻撃で、星が満額降ってはいけない**
 *（`docs/spec/10-damage.md` 5-1）。
 *
 * | ため | 星 |
 * | --- | --- |
 * | なし（0.1） | **1 発** |
 * | 半分（0.55） | **3 発** |
 * | ためきり（1.0） | **5 発** |
 *
 * **粒と削りは同じ数。** 片方だけ出さない。
 */

import { system, type Dimension, type Entity, type Player, type Vector3 } from "@minecraft/server";

import type { Element } from "../../lib/element.js";
import { has } from "../../state/hp.js";
import { hit } from "../damage/index.js";

/** ためきりで降る星の数 */
const STARS = 5;

/** 星 1 発の威力。**最終攻撃力に対する割合**（`docs/spec/14-effect.md` 2 章） */
const STAR_RATE = 0.09;

/** 削る範囲（マス）。**落ちた地点から** */
const RADIUS = 2.0;

/**
 * 星と星の間隔（tick）。
 *
 * **2**（2026-08-29 に半分にした）。5 では**降り始めるのが遅く、間延びした。**
 */
const GAP = 2;

/** 落ち始める高さ（マス） */
const HEIGHT = 7;

/**
 * 落ちる速さ（マス/tick）。
 *
 * **2.8**（2026-08-29 に倍にした）。1.4 では**ゆっくり降りすぎて、間延びした。**
 */
const FALL = 2.8;

/** 散らばる幅（マス） */
const SPREAD = 1.6;

/**
 * 星が落ちた音（`docs/spec/16-feedback.md` 3-1）。
 *
 * **武器の固有効果には、固有の音を付ける**——
 * **何が起きたかは、音のほうが早く分かる。**
 */
const LAND_SOUND = "pve.weapon.stardust_land";

/** 音の大きさ。**5 つ続けて落ちるので小さく** */
const LAND_VOLUME = 0.35;

/** 同時に降っている星の上限（`docs/spec/14-effect.md` 2-3） */
const MAX_FALLING = 60;

/** いま降っている星の数 */
let falling = 0;

/** 星屑の当たり方 */
export interface StardustShot {
  readonly by?: Player;
  /** 当たった場所（**足元**） */
  readonly at: Vector3;
  /** **最終攻撃力**（基礎ダメージに使われた値） */
  readonly attack: number;
  /** ため具合（0.1〜1.0） */
  readonly charge: number;
  /** 何で撃ったか（表示・記録用） */
  readonly via?: string;
  /**
   * 乗っている属性。
   *
   * **星の 1 つ 1 つにも乗る**（`docs/spec/17-element.md` 4 章）。
   * 火なら**星が落ちるたびに燃やす。**
   */
  readonly elements?: readonly Element[];
}

/**
 * 降る星の数。
 *
 * ```
 * 発数 ＝ clamp(round(最大 × ため具合), 1, 最大)
 * ```
 *
 * **1 発は必ず出す**（`docs/spec/10-damage.md` 5-1）。
 * ゼロにすると「効果が壊れている」ように見える。
 */
export function starCount(charge: number, stars = STARS): number {
  if (!Number.isFinite(charge)) return 1;
  return Math.max(1, Math.min(stars, Math.round(stars * Math.max(0, Math.min(1, charge)))));
}

function put(dim: Dimension, id: string, at: Vector3): void {
  try {
    dim.spawnParticle(id, at);
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 落ちた所を削る。
 *
 * **モブだけ**（`docs/spec/14-effect.md` 2 章）。
 * プレイヤーには入らない——撃った本人にも、味方にも。
 */
function strike(dim: Dimension, at: Vector3, shot: StardustShot): void {
  let targets: Entity[];
  try {
    targets = dim.getEntities({ location: at, maxDistance: RADIUS });
  } catch {
    return;
  }
  for (const e of targets) {
    try {
      if (e.typeId === "minecraft:player") continue;
      if (!has(e)) continue;
      // **追加ダメージ。** 効果のフックは呼ばれない（星が星を呼ばない）が、
      // **属性は乗る**（`docs/spec/17-element.md` 4 章）
      hit({
        by: shot.by,
        target: e,
        attack: shot.attack * STAR_RATE,
        via: shot.via,
        kind: "extra",
        elements: shot.elements,
      });
    } catch {
      /* もう居ない */
    }
  }
}

/** 星 1 つ。**上から落として、着いた所で弾けさせる** */
function dropStar(dim: Dimension, ground: Vector3, delay: number, shot: StardustShot): void {
  const dx = (Math.random() - 0.5) * SPREAD * 2;
  const dz = (Math.random() - 0.5) * SPREAD * 2;
  const steps = Math.ceil(HEIGHT / FALL);
  falling += 1;

  for (let i = 0; i <= steps; i++) {
    system.runTimeout(() => {
      const y = ground.y + HEIGHT - FALL * i;
      const at = { x: ground.x + dx, y, z: ground.z + dz };
      // **芯と筋を重ねる。** 筋だけだと速さが出ず、芯だけだと軌跡が見えない
      //
      // 一度「★の形」に作り替えたが、**思っていたものと違うと言われて戻した**
      //（2026-08-29）。**光る芯＋縦の筋**がこの武器の見た目。
      put(dim, "pve:star_core", at);
      put(dim, "pve:star_streak", { x: at.x, y: y + 0.5, z: at.z });
      if (i !== steps) return;
      const land = { x: at.x, y: ground.y + 0.1, z: at.z };
      put(dim, "pve:star_land", land);
      try {
        // **落ちるたびに鳴る。** 少しずつ高さを変えて、続けて鳴っても濁らせない
        dim.playSound(LAND_SOUND, land, { volume: LAND_VOLUME, pitch: 0.92 + Math.random() * 0.22 });
      } catch {
        /* 読み込まれていない */
      }
      // **落ちた所を削る**（`docs/spec/12-stardust.md` 4-1）
      strike(dim, { x: at.x, y: ground.y + 0.9, z: at.z }, shot);
      falling = Math.max(0, falling - 1);
    }, delay + i);
  }
}

/**
 * 星屑が当たった。
 *
 * **絵と削りは同じ数**——片方だけ出さない。
 */
export function stardustBurst(dim: Dimension, shot: StardustShot): void {
  const at = shot.at;
  put(dim, "pve:star_flash", { x: at.x, y: at.y + 1.0, z: at.z });
  put(dim, "pve:star_ring", { x: at.x, y: at.y + 0.1, z: at.z });

  const n = starCount(shot.charge);
  for (let s = 0; s < n; s++) {
    // **溢れたら新しい星を出さない**（降りかけの星は消さない）
    if (falling >= MAX_FALLING) break;
    dropStar(dim, at, 2 + s * GAP, shot);
  }

  // **最後に、舞い残る粉**
  system.runTimeout(() => put(dim, "pve:star_dust", { x: at.x, y: at.y + 0.8, z: at.z }), 2 + n * GAP);
}
