/**
 * 試合中だけ、マップの範囲を読み込み続ける。
 *
 * 仕様は `docs/spec/11-match.md` 6-C。
 *
 * ## なぜ要るのか
 *
 * 読み込まれていないチャンクでは**時間が進まない。**
 *
 * - **ジェネレータが湧かない**（誰もその島に居ないとき）
 * - **ジェネレータが見つからない**（起動直後に走査すると 0 個）
 * - 後片付けが飛ばされる／マップの記憶が撮れない
 *
 * **一番まずいのは 2 つ目。** 起動時に 0 個だと、そのあと一生湧かない。
 *
 * ## なぜ常時張らないのか
 *
 * **張りっぱなしは常に負荷を掛ける。**
 * 誰も遊んでいない間もチャンクが動き続ける。制作中に払う理由が無い。
 *
 * ## 実行文脈
 *
 * `Dimension.runCommand` は **restricted-execution では呼べない**
 *（`docs/imp.md` 5.1）。必ず `system.run` の中から呼ぶこと。
 */

import { system, world, type Dimension } from "@minecraft/server";

import { ARENAS, type Arena, type Box } from "../../lib/arena.js";

/**
 * 名前の付け方。
 *
 * **アリーナと島の番号から決まる。**
 * 決まった名前なら、外すときに名前で消せる。消し残しが起きない。
 */
function areaName(arena: Arena, index: number): string {
  return `cw_${arena.id}_${index}`;
}

/** 失敗しても進みたいので、投げずに握る */
function tryCommand(dim: Dimension, command: string): boolean {
  try {
    dim.runCommand(command);
    return true;
  } catch {
    return false;
  }
}

function addOne(dim: Dimension, name: string, box: Box): boolean {
  // **同じ名前があると add が失敗する。** 先に外してから張る
  tryCommand(dim, `tickingarea remove ${name}`);
  // 末尾の true は preload。**ワールド起動時から読み込まれる**
  return tryCommand(
    dim,
    `tickingarea add ${box.min.x} ${box.min.y} ${box.min.z} ` + `${box.max.x} ${box.max.y} ${box.max.z} ${name} true`
  );
}

/**
 * 全アリーナぶん張る。
 *
 * @returns 張れた数
 */
export function addTickingAreas(): number {
  const dim = world.getDimension("overworld");
  let n = 0;
  for (const arena of ARENAS) {
    arena.islands.forEach((box, i) => {
      if (addOne(dim, areaName(arena, i), box)) n++;
    });
  }
  return n;
}

/**
 * 全アリーナぶん外す。
 *
 * @returns 外せた数
 */
export function removeTickingAreas(): number {
  const dim = world.getDimension("overworld");
  let n = 0;
  for (const arena of ARENAS) {
    arena.islands.forEach((_box, i) => {
      if (tryCommand(dim, `tickingarea remove ${areaName(arena, i)}`)) n++;
    });
  }
  return n;
}

/**
 * 状態と実体を合わせる。
 *
 * ティッキングエリアは**ワールドに保存される**ので `/reload` では消えない。
 * だが**試合中かどうかはスクリプトが持っている。**
 *
 * 読み直したときに:
 * - 試合中なら**張り直す**
 * - 試合中でないなら**外す**
 *
 * これで状態と実体が必ず一致する（`docs/spec/11-match.md` 6-B / R-3）。
 *
 * **トップレベルから呼ぶこと。** `worldLoad` は `/reload` で来ない。
 */
export function syncTickingAreas(running: boolean): void {
  // **少し待つ。** 読み込み直後はコマンドが通らないことがある
  system.runTimeout(() => {
    if (running) addTickingAreas();
    else removeTickingAreas();
  }, 20);
}
