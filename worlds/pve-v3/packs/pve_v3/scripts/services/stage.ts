/**
 * 戦場の支度。**片付けて、次のマップを置いて、敵を積む。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 3〜4 章、`16-enemy.md`。
 *
 * > ### 前のマップは「消さない。上から置くだけで消える」
 * >
 * > `place()` は**構造物の空白だけを飛ばす**。空気は空気として置かれる。
 * > **保存を空気のまま取っていれば、置いた瞬間に前のマップは消えている。**
 * >
 * > **ただしブロック以外は残る。** 置く前に範囲の中を片付ける。
 */

import { CommandPermissionLevel, world } from "@minecraft/server";

import { LEGIONS } from "../core/enemy.js";
import { clampStar } from "../core/portal.js";
import { FIELD } from "../core/places.js";
import { clearEnemies, strays } from "./field.js";
import { originXOf, playable } from "./mapstore.js";
import { holdArea } from "./area.js";
import { originX } from "./arena.js";
import { spawnPosts } from "./post.js";
import { VENDOR } from "./vendor.js";
import { legion, legionFor, setFieldMap } from "../state/match.js";
import { queueLegion } from "./spawn.js";
import { multsOf } from "../core/curse.js";
import { curseCount } from "../state/curse.js";

/**
 * 運営にだけ見せる。
 *
 * > ### 何が起きているか、運営には見えていてほしい
 * >
 * > マップが置かれた・敵が積まれた・倉庫が空だった——
 * > **黙って何も起きないのが、いちばん困る。**
 */
export function tellAdmin(text: string): void {
  for (const p of world.getAllPlayers()) {
    try {
      if (p.commandPermissionLevel !== CommandPermissionLevel.Any) p.sendMessage(`§8[運営] §7${text}`);
    } catch {
      /* 抜けた */
    }
  }
}

/**
 * ブロック以外を片付ける。
 *
 * **敵・落ちている物・矢**を消す。**ブロックは触らない**（置けば消える）。
 */
export function sweepField(): { enemies: number; items: number; posts: number } {
  const gone = { enemies: clearEnemies(), items: 0, posts: 0 };
  try {
    const dim = world.getDimension("overworld");
    const r = FIELD.half + 10;
    // **いまのマップの真ん中**（`19-map-store.md` 0-1）
    const mid = { x: originX(), y: 0, z: 0 };
    for (const type of ["minecraft:item", "minecraft:arrow", "minecraft:xp_orb"]) {
      for (const e of dim.getEntities({ type, location: mid, maxDistance: r })) {
        try {
          e.remove();
          gone.items++;
        } catch {
          /* もう居ない */
        }
      }
    }
    // > ### **強化の台も片付ける**（2026-09-05）
    // >
    // > **台は「消えない」ようにしてある**（`minecraft:persistent`）ので、
    // > **`/reload` でも、マップを差し替えても残る。**
    // > **置き直すたびに増えて、重なっていた。**
    // >
    // > **印のブロックから出し直す**（`services/post.ts`）ので、消してよい。
    for (const e of dim.getEntities({ type: VENDOR, location: mid, maxDistance: r })) {
      try {
        e.remove();
        gone.posts++;
      } catch {
        /* もう居ない */
      }
    }
  } catch {
    /* 読み込まれていない */
  }
  return gone;
}

/** 直前に出したマップ。**同じものを続けて出さない**（`14-map-build.md` 4 章） */
let lastMap: string | undefined;

/** **いま戦場に置いてあるマップ。** 湧き点の杖が、既定の相手として使う */
export function currentMap(): string | undefined {
  return lastMap;
}

/**
 * 次のマップを選ぶ。
 *
 * **候補 ＝ 出せるもの − 直前の 1 つ。** 1 つしか無ければ、それを出す。
 */
export function pickMap(): string | undefined {
  const all = playable();
  if (all.length === 0) return undefined;
  const pool = all.length > 1 ? all.filter((n) => n !== lastMap) : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * **その wave の相手**（`13-flow.md` 3-2）。
 *
 * **休憩所の 3 択で決まったもの。** 決まっていなければ `/pve:legion` の 1 つ。
 */
export function legionAt(wave: number): string {
  return legionFor(wave) ?? legion() ?? "zombie";
}

/** その wave の相手の★（ゲートの色。`20-portal.md` 4 章） */
export function starAt(wave: number): number {
  return clampStar(LEGIONS[legionAt(wave)]?.star);
}

/**
 * **箱の外に残った敵を消す**（`19-map-store.md` 0-7）。
 *
 * > ### 迷子は必ず消す
 * >
 * > **数えるのは戦場の箱の中だけ。** **外に残ると、次のマップへ持ち越す。**
 * > **倒すのではなく消す**——**報酬は出ない。** 片付けであって、戦果ではない。
 *
 * @returns 消した数
 */
export function sweepStrays(): number {
  let n = 0;
  for (const e of strays()) {
    try {
      e.remove();
      n++;
    } catch {
      /* もう居ない */
    }
  }
  if (n > 0) tellAdmin(`§8戦場の外に居た敵を ${n} 体消した`);
  return n;
}

/**
 * 戦場を切り替える。**片付けて、次のマップへ向ける。**
 *
 * > ### **もう置かない**（2026-09-07 変更・`19-map-store.md` 0 章）
 * >
 * > **マップは 1000 マスずつ離して常設してある。**
 * > **構造物を置く代わりに、「どのマップに居るか」を差し替えるだけ。**
 * > 運ぶのは `services/presence.ts` の `moveAll`。
 *
 * @returns 向けたマップの名前
 */
export function rebuildField(): string | undefined {
  // **片付けるのは「前のマップ」**——向きを変える前にやる
  const swept = sweepField();
  const name = pickMap();
  if (name === undefined) {
    tellAdmin("§cマップが倉庫に無い。§7/pve:mapsave で保存して /pve:mapon で出すようにする");
    return undefined;
  }
  lastMap = name;
  // **湧き点も、ゲートも、湧く所も、ここから先は新しいマップの座標**
  setFieldMap(name);
  // **着く前に読み込ませる**（`19-map-store.md` 0-3）
  holdArea(originXOf(name));
  // **強化の台はここでは出さない**——**まだ読み込まれていない**（`services/match.ts` の wave 入口で出す）
  tellAdmin(`戦場を §f${name}§7 に切り替えた（片付け 敵 ${swept.enemies} ／ 物 ${swept.items} ／ 台 ${swept.posts}）`);
  return name;
}

/** どのウェーブのために置いたか。**同じぶんを二度置かない** */
let readyFor: number | undefined;

/**
 * **そのウェーブの戦場を用意する。もう出来ていれば何もしない。**
 *
 * > ### 休憩所に居る間に済ませる（`13-flow.md` 2 章）
 * >
 * > 幕間で始めると、**暗転の 2 秒の中に置き終わりを押し込む**ことになる。
 * > **休憩所は 30 秒ある**ので、そこで作っておけば**幕間は運ぶだけ**になる。
 * >
 * > **戦場 → 戦場**のときは先に作れない（戦場を使っている）ので、幕間で作る。
 */
export function prepareField(forWave: number): void {
  if (readyFor === forWave) return;
  readyFor = forWave;
  rebuildField();
}

/** 用意したことを忘れる。**試合を畳んだとき** */
export function forgetPrepared(): void {
  readyFor = undefined;
}

/** そのウェーブの敵を積む */
export function readyEnemies(legionId: string, players: number, wave: number): number {
  const n = queueLegion(legionId, players, wave);
  const label = LEGIONS[legionId]?.name ?? legionId;
  const c = multsOf(curseCount());
  tellAdmin(
    `§f${label}§7 を ${n} 体 積んだ（wave ${wave} ／ ${players} 人 ／ ` +
      `呪い HP ×${c.hp.toFixed(2)} 力 ×${c.power.toFixed(2)} 速 ×${c.speed.toFixed(2)} 攻速 ×${c.haste.toFixed(2)}）`
  );
  return n;
}
