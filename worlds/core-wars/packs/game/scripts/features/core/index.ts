/**
 * コアの破壊を数える。
 *
 * ルールは `docs/01-rules.md`。**100 回壊されたチームが負け。**
 *
 * ## 「即再生」をどう作るか
 *
 * **壊させない。** `playerBreakBlock` を打ち消す。
 *
 * 一度消してから置き直すのではなく、**そもそも消さない。**
 * こうすると:
 *
 * - 再生までの隙間が**物理的に存在しない**（1 tick も消えない）
 * - アイテムが落ちない。拾われて悪用されることがない
 * - 置き直す処理が要らない
 *
 * 殴っている側から見ると、**壊れた瞬間に元通りになったように見える。**
 * これが仕様どおりの挙動になる。
 *
 * ## 自陣のコアは壊せない
 *
 * `docs/01-rules.md` で「不可にすべき」と決めてある。
 * 事故と嫌がらせを防ぐため。
 *
 * ## 位置で判定する
 *
 * コアは**1 ブロックで、位置が決まっている**（`lib/arena.ts`）。
 * 青が (900, 0, 1000)、赤が (1100, 0, 1000)。
 *
 * 種類（赤/青コンクリート）だけで見ると、
 * **装飾に同じ色を使った瞬間に誤爆する。** 位置で決めるほうが確実。
 *
 * **同じマップを別の座標にもう1つ作る場合にも、これで対応できる。**
 * どのアリーナのコアかまで分かる。
 */

import { BlockPermutation, system, world, type Player } from "@minecraft/server";

import { damageCore, isRunning, teamName, teamOf } from "../../lib/match-state.js";
import { ARENAS, CORE_BLOCK, coreAt } from "../../lib/arena.js";
import { onCoreBroken } from "../match/index.js";

/**
 * **同じコアを同じ tick で二重に数えない。**
 *
 * `/reload` したとき、古い購読が残るかは未検証
 *（`docs/research/02-hot-reload.md` 5章）。
 * 残っていると**1 回殴っただけで 2 回減る。**
 *
 * 二重に呼ばれても壊れない形にしておく
 *（`docs/spec/11-match.md` 6-B の考え方）。
 */
const lastCounted = new Map<string, number>();

function notify(player: Player, text: string): void {
  player.onScreenDisplay.setActionBar(text);
}

/**
 * コアが欠けていたら戻す。
 *
 * **見た目を直すだけ。数は数えない。**
 * 数えるのは殴られたときだけ（下の購読）。
 */
export function restoreCores(): number {
  const dim = world.getDimension("overworld");
  let fixed = 0;
  for (const arena of ARENAS) {
    for (const team of ["red", "blue"] as const) {
      const at = arena.cores[team];
      try {
        const b = dim.getBlock(at);
        if (b === undefined) continue;
        const want = CORE_BLOCK[team];
        if (b.typeId === want) continue;
        b.setPermutation(BlockPermutation.resolve(want));
        fixed++;
      } catch {
        /* 読み込まれていない。次の機会に */
      }
    }
  }
  return fixed;
}

/** この tick で既に数えたか */
function alreadyCounted(key: string, tick: number): boolean {
  if (lastCounted.get(key) === tick) return true;
  lastCounted.set(key, tick);
  return false;
}

/**
 * 購読を始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function registerCore(): void {
  // ---- 保険: **壊れてしまったら、必ず戻す**
  //
  // 打ち消し（下）が効けば、そもそもここは呼ばれない。
  // だが**効かなかったときにコアが消えたままになる**と、試合が成立しない。
  //
  // 打ち消しが効かない理由はいくつも考えられる（購読の順序、他のアドオン、
  // 読み直しの途中）。**原因を潰しきるより、結果を保証するほうが確実。**
  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const at = ev.block.location;
    const hit = coreAt(at.x, at.y, at.z);
    if (hit === undefined) return;
    // **その場で戻す。** 1 tick も遅らせない
    try {
      ev.block.setPermutation(BlockPermutation.resolve(CORE_BLOCK[hit.team]));
    } catch {
      /* 置けなかった。次の restoreCores で拾う */
    }
  });

  // ---- 二重の保険: **定期的に、コアがあるか確かめて戻す**
  //
  // 後追いの復元も取りこぼすこと（チャンク未読み込みなど）があるので、
  // **1 秒ごとに全アリーナのコアを見る。** 数は多くても 2 個 x アリーナ数
  system.runInterval(() => {
    restoreCores();
  }, 20);

  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    // **位置で判定する。** 種類（赤/青コンクリート）だけで見ると、
    // 装飾に同じ色を使った瞬間に誤爆する。コアは 1 ブロックで位置が決まっている
    const at = ev.block.location;
    const hit = coreAt(at.x, at.y, at.z);
    if (hit === undefined) return;
    const owner = hit.team;

    // **コアは常に消えない。** 試合中かどうかに関わらず打ち消す
    ev.cancel = true;

    const player = ev.player;
    if (!isRunning()) {
      system.run(() => notify(player, "§7試合が始まっていません"));
      return;
    }

    const mine = teamOf(player);
    if (mine === undefined) {
      system.run(() => notify(player, "§7チームに入っていません"));
      return;
    }

    // **自陣のコアは壊せない**（docs/01-rules.md）
    if (mine === owner) {
      system.run(() => notify(player, "§c自陣のコアは壊せません"));
      return;
    }

    // **二重に数えない。** /reload で購読が重なっても 1 回で済む
    const key = `${hit.arena.id}:${owner}`;
    if (alreadyCounted(key, system.currentTick)) return;

    // **数えるのは world を変える操作。** 次の tick へ逃がす
    system.run(() => {
      const left = damageCore(hit.arena.id, owner);
      // **必ず出す。** 出ないと「効いていない」と見分けが付かない
      notify(player, `§6${teamName(owner)} のコア  §f残り ${left}`);
      player.playSound("random.orb", { location: player.location });
      onCoreBroken(hit.arena.id, owner, left);
    });
  });
}
