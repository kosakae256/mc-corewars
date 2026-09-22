/**
 * **死に際。** **倒れた瞬間に、その場で何かする。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 10 章。
 *
 * | 使う敵 | 何が起きるか |
 * | --- | --- |
 * | **爆弾**（★2） | **爆弾を落とす。** 2 秒後に爆発 |
 * | **帯電**（★4） | **その場で即、半径 3 に力ぶん** |
 * | **汚染**（★4） | **半径 3 の円が 5 秒** |
 * | **大スライム**（★3） | **子を 4 体出す** |
 *
 * ## 呪いは掛かった後の値を使う
 *
 * > ### **`KEYS.atk` を読む**
 * >
 * > **湧いたときに「その個体の攻撃力」が入っている**（ウェーブ・人数・呪いを掛けた後）。
 * > **死に際の一撃も、そこを読む**——**素の値を使うと、後半で弱くなる。**
 */

import { system, type Dimension, type Entity, type Vector3 } from "@minecraft/server";

import { BOOM, FALL } from "../core/tuning.js";

/** 落とす爆弾の実体 */
const BOMB = "pve_v3:bomb";
import { boom } from "./boom.js";
import { boltCircle, boltFx, boomCircle } from "./fx.js";
import { tellOps } from "./tell.js";
import { putZone } from "./zone.js";

/** 死に際に何をするか */
export interface FallSpec {
  /** **その場で爆ぜる**（帯電） */
  readonly boom?: {
    readonly power: number;
    readonly radius?: number;
    readonly knock?: number;
    readonly up?: number;
    /** **青い円と落雷を足す**（帯電・`25-enemy-kit.md` 10-1） */
    readonly bolt?: boolean;
  };
  /** **爆弾を落とす**（爆弾）。`fuse` tick 後に爆ぜる */
  readonly bomb?: {
    readonly power: number;
    readonly radius?: number;
    readonly knock?: number;
    readonly fuse?: number;
  };
  /** **円を残す**（汚染） */
  readonly zone?: { readonly radius?: number; readonly life?: number; readonly cut?: number };
  /** **子を出す**（大スライム） */
  readonly split?: { readonly into: string; readonly count: number };
}

/** 置いてある爆弾 */
interface Bomb {
  /** 置いた実体。**爆ぜるときに消す** */
  readonly body?: Entity;
  readonly dim: Dimension;
  readonly at: Vector3;
  readonly power: number;
  readonly radius?: number;
  readonly knock?: number;
  /** 置いた時刻（tick）。**膨らみ具合を測るのに要る** */
  readonly from: number;
  /** 爆ぜる時刻（tick） */
  readonly at_: number;
}

/** 膨らみ具合の property（0〜1）。**見た目が読む**（`24-mob-howto.md` 16-6） */
const SWELL = "pve_v3:fuse";
const bombs: Bomb[] = [];

/** 置いてある爆弾の数。**確かめる用** */
export function bombCount(): number {
  return bombs.length;
}

/**
 * 倒れた。
 *
 * @param spawn 子を出す手（`services/spawn.ts` の湧かせ方を渡す）
 */
export function onFall(mob: Entity, spec: FallSpec, now: number, spawn?: (id: string, at: Vector3) => void): void {
  const dim = mob.dimension;
  const at = mob.location;

  if (spec.boom !== undefined) {
    const radius = spec.boom.radius ?? BOOM.radius;
    // > ### **どこまで巻き込んだのかを見せる**（2026-09-10）
    // >
    // > **爆発の粒だけでは、範囲がそのまま見えない。**
    // > **爆弾の予告と同じ円を、爆ぜた一瞬だけ 1 枚敷く**（`25-enemy-kit.md` 10-1）。
    if (spec.boom.bolt === true) {
      boltCircle(dim, at, radius);
      boltFx(dim, at, radius);
    }
    boom({ dim, at, power: spec.boom.power, radius, knock: spec.boom.knock, up: spec.boom.up });
  }
  if (spec.bomb !== undefined) {
    putBomb({ dim, at, now, ...spec.bomb });
  }
  if (spec.zone !== undefined) {
    putZone({ dim, at, now, radius: spec.zone.radius, life: spec.zone.life, cut: spec.zone.cut });
  }
  if (spec.split !== undefined && spawn !== undefined) {
    for (let i = 0; i < spec.split.count; i++) {
      // **同じ点に重ねない。** 円周に等間隔で置く
      const t = (i / spec.split.count) * 2 * Math.PI;
      spawn(spec.split.into, {
        x: at.x + Math.cos(t) * FALL.spread,
        y: at.y,
        z: at.z + Math.sin(t) * FALL.spread,
      });
    }
  }
}

/**
 * **爆弾をそこに置く。**
 *
 * > ### **爆弾は実体として置く**（2026-09-08）
 * >
 * > **粒だけでは「そこに何かある」と分からなかった。**
 * > **丸い模型を落として、爆ぜるときに消す。**
 *
 * **死に際に落とす**（爆弾）**にも、投げて着弾した所に置く**（ボマー）**にも使う。**
 */
export function putBomb(o: {
  readonly dim: Dimension;
  readonly at: Vector3;
  readonly now: number;
  readonly power: number;
  readonly radius?: number;
  readonly knock?: number;
  /** 爆ぜるまで（tick）。**書かなければ既定** */
  readonly fuse?: number;
  /** 置く実体。**書かなければ普通の爆弾** */
  readonly body?: string;
}): void {
  const id = o.body ?? BOMB;
  let body: Entity | undefined;
  try {
    body = o.dim.spawnEntity(id, { x: o.at.x, y: o.at.y + 0.2, z: o.at.z });
  } catch (err) {
    // **出せなくても爆発そのものは起きる。** **だが黙らせない**（`24-mob-howto.md` 12 章）
    tellOps(`爆弾: ${id} を出せなかった — ${String(err)}`);
  }
  bombs.push({
    body,
    dim: o.dim,
    at: o.at,
    power: o.power,
    radius: o.radius,
    knock: o.knock,
    from: o.now,
    at_: o.now + (o.fuse ?? FALL.fuse),
  });
}

/** 置いた爆弾を進める。**毎 tick** */
export function stepBombs(now: number): void {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    if (b === undefined) continue;
    if (now >= b.at_) {
      try {
        b.body?.remove();
      } catch {
        /* もう居ない */
      }
      boom({ dim: b.dim, at: b.at, power: b.power, radius: b.radius, knock: b.knock });
      bombs.splice(i, 1);
      continue;
    }
    // > ### **膨らんで、赤く点滅する**（`24-mob-howto.md` 16-6）
    // >
    // > **粒だけでは、そこに何かあると分からない。**
    // > **バニラのクリーパーと同じ作り**——**進み具合だけ渡して、見た目は Molang が作る。**
    const span = b.at_ - b.from;
    try {
      b.body?.setProperty(SWELL, span <= 0 ? 1 : Math.max(0, Math.min(1, (now - b.from) / span)));
    } catch {
      /* もう居ない */
    }

    // > ### **どこが危ないか、地面に敷く**（2026-09-09）
    // >
    // > **前は粒を円周に 12 個並べていた**——**点が飛んでいるだけに見えた。**
    // > **恵みの雨と同じで、円の絵を 1 枚、地面に寝かせる**（`services/fx.ts`）。
    // > **外周がはっきりした線、中はうっすら赤い。**
    if (now % FALL.drawGap !== 0) continue;
    boomCircle(b.dim, b.at, b.radius ?? BOOM.radius);
  }
  void system;
}
