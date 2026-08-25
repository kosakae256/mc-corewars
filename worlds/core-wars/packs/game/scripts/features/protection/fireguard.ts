/**
 * 火が収まったあと、**焼けたマップを記憶から戻す。**
 *
 * ## 炎には手を触れない
 *
 * 火は普通に点いてよく、延焼してよく、羊毛が燃え尽きてもよい。
 * 困るのは**マップの柵や階段が永久に失われること**だけ。
 *
 * ```
 *   火が点く    → そのまま燃える（普通の挙動）
 *   柵が燃える  → 一時的に消える（見た目も普通）
 *   火が収まる  → **柵が戻る**
 * ```
 *
 * ## なぜ「収まってから」なのか
 *
 * 燃えている最中に戻すと、**戻す→また燃える→戻す**でちらつく。
 * 木の柵はバニラのままなので、火が隣にある限り燃え続ける。
 *
 * ## ここは記憶を持たない
 *
 * 以前はここで「炎の隣にあるブロック」を控えていた。
 * だが**控える前に燃え尽きると戻せない。** 実際に戻らなかった。
 *
 * いまは `repair.ts` が**マップを丸ごと記憶している**（構造物として）。
 * ここは**どこを見に行くかを決めるだけ。**
 *
 * ## 何もしていないときは、何もしない
 *
 * ```
 *   火打ち石を使った / 落雷が落ちた
 *        ↓
 *   その場所を「見張り点」に登録（30 秒）
 *        ↓
 *   0.5 秒ごとに、その周り(半径5)に炎があるか見るだけ
 *        ↓
 *   炎が広がったら、その先も見張り点に足す（追いかける）
 *        ↓
 *   炎が消えたら、その周りを記憶と照合して直す
 *        ↓
 *   期限切れ → **処理ゼロに戻る**
 * ```
 *
 * 見張り点が無いときは、`runInterval` が 1 行で return する。
 */

import { system, world, type Vector3 } from "@minecraft/server";

import { repairArea } from "./repair.js";
import { opMessage } from "../../lib/op.js";

/** 炎とみなすブロック */
const FIRE: ReadonlySet<string> = new Set(["minecraft:fire", "minecraft:soul_fire"]);

/**
 * 見張り点の周りを見る半径（マス）。
 *
 * **小さくてよい。** 炎は隣へ広がるので、
 * 広がった先は新しい見張り点として追いかける。
 */
const RADIUS = 5;

/** 何 tick ごとに見るか。炎の広がりは秒単位なので 0.5 秒で間に合う */
const INTERVAL = 10;

/** 見張りを続ける長さ（tick）。30 秒 */
const WATCH_TICKS = 600;

/** 見張り点の上限。**増えすぎたら古いものから捨てる** */
const MAX_WATCH = 48;

interface Watch {
  readonly at: Vector3;
  /** 期限の tick */
  until: number;
  /** 直し終わったか。同じ場所を何度も照合しない */
  repaired: boolean;
}

/** 見張る場所 */
const watch = new Map<string, Watch>();

let working = false;

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/**
 * 見張りを始める場所を登録する。
 *
 * **火が点きうる操作をしたときに呼ぶ。**
 * これが呼ばれるまで、この機能は一切動かない。
 */
export function watchFireAt(at: Vector3): void {
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  const z = Math.floor(at.z);
  const k = key(x, y, z);
  const until = system.currentTick + WATCH_TICKS;
  const found = watch.get(k);
  if (found !== undefined) {
    found.until = until;
    found.repaired = false;
    return;
  }
  watch.set(k, { at: { x, y, z }, until, repaired: false });

  // **増えすぎたら古いものから捨てる。** 際限なく増やさない
  if (watch.size > MAX_WATCH) {
    const oldest = [...watch.entries()].sort((a, b) => a[1].until - b[1].until)[0];
    if (oldest !== undefined) watch.delete(oldest[0]);
  }
}

function* guardJob(): Generator<void, void, void> {
  const dim = world.getDimension("overworld");
  const tick = system.currentTick;
  const out = { restored: 0, noMemory: 0 };

  for (const [k, w] of [...watch]) {
    if (tick > w.until) {
      watch.delete(k);
      continue;
    }

    // ---- まず炎を探す。**見つけたら追いかけるだけ。消さない**
    let sawFire = false;
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dz = -RADIUS; dz <= RADIUS; dz++) {
          try {
            const b = dim.getBlock({ x: w.at.x + dx, y: w.at.y + dy, z: w.at.z + dz });
            if (b === undefined || !FIRE.has(b.typeId)) continue;
            sawFire = true;
            watchFireAt({ x: w.at.x + dx, y: w.at.y + dy, z: w.at.z + dz });
          } catch {
            /* 読み込まれていない */
          }
        }
      }
      yield;
    }

    if (sawFire) {
      w.repaired = false;
      continue;
    }

    // ---- 炎が消えている。**ここで初めて記憶と照合する**
    if (w.repaired) continue;
    w.repaired = true;
    yield* repairArea(
      dim,
      { x: w.at.x - RADIUS, y: w.at.y - RADIUS, z: w.at.z - RADIUS },
      { x: w.at.x + RADIUS, y: w.at.y + RADIUS, z: w.at.z + RADIUS },
      out
    );
  }

  if (out.restored > 0) {
    opMessage(`§6焼けたマップを ${out.restored} マス戻した`);
  }
  working = false;
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない（実際に事故った）。
 */
export function startFireGuard(): void {
  // **落雷も火種になる。** 落ちた場所を見張る
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.entity.typeId !== "minecraft:lightning_bolt") return;
    watchFireAt(ev.entity.location);
  });

  system.runInterval(() => {
    // **見張る場所が無ければ、ここで終わり。** これが普段の状態。
    // 火が一度も点いていなければ、この機能の費用はこの 1 行だけ
    if (working || watch.size === 0) return;
    working = true;
    system.runJob(guardJob());
  }, INTERVAL);
}
