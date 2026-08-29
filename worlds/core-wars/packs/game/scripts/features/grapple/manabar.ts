/**
 * マナを、経験値の所に常に出す。
 *
 * 仕様は `docs/spec/13-grapple.md` 2-E。
 *
 * ## なぜ足元の行ではないのか
 *
 * 足元の 1 行（`lib/fx.ts` の `bar`）は**取り合いになる。**
 * 買えない・置けない・倒した、どれもそこへ出る。
 * **マナは常に見えていてほしい**のに、他の知らせで隠れる。
 *
 * ## 食料ゲージは使えない
 *
 * `minecraft:player.hunger` は**読み取り専用。**
 * 書き換える手段が API にもコマンドにも無い。
 *
 * **経験値なら書ける。** このゲームは経験値を使っていないので、空いている。
 *
 * ## 数と帯、両方で出す
 *
 * | | |
 * | --- | --- |
 * | 段（level）の数字 | **マナの値**（0〜100） |
 * | 帯（progress） | **マナの割合**（増えるほど伸びる） |
 *
 * **色は水色に変えてある**（`ui/_global_variables.json` と
 * `textures/ui/experiencebarfull.png`）。
 *
 * ## 音は別名に逃がした
 *
 * 段が上がると鳴る。マナは 1 秒に 3 ずつ戻るので、**鳴りっぱなしになる。**
 *
 * かといって `random.levelup` を黙らせると、
 * **引き寄せ・決着・金庫の音まで消える**（2026-08-26 の指摘）。
 *
 * **同じ音の実体を別名（`game.levelup`）で持つ。**
 * 黙らせるのは `random.levelup` だけ——**経験値が上がったときだけ**が静かになる。
 */

import { system, world, type Player } from "@minecraft/server";

import { GAS_MAX, gasOf } from "./gas.js";

/** 満タンの値 */
const MAX = GAS_MAX;

/**
 * 書き換えを見る間隔（tick）。**毎 tick。**
 *
 * **減るのは一瞬**（射出で 5、TNT で 50）なので、
 * 間を空けると**押した手応えが遅れて出る。**
 *
 * 書き換えるのは**値が変わったときだけ**なので、
 * 毎 tick 見ても、実際に触るのは変わった人だけ。
 */
const INTERVAL = 1;

/** 最後に出した値。**変わった時だけ書き換える** */
const shown = new Map<string, number>();

function apply(player: Player, value: number): void {
  try {
    player.resetLevel();
    // **段にマナの値を入れる。** 数字がそのままマナ
    if (value > 0) player.addLevels(value);

    // **帯はマナの割合。** 段の中の進み具合として出す。
    // **次の段に届かない範囲**で埋める（届くと数字が 1 ずれる）
    const need = player.totalXpNeededForNextLevel;
    const fill = Math.min(need - 1, Math.round((value / MAX) * (need - 1)));
    if (fill > 0) player.addExperience(fill);
  } catch {
    /* 消えている */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startManaBar(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const now = Math.floor(gasOf(player));
      if (shown.get(player.id) === now) continue;
      shown.set(player.id, now);
      apply(player, now);
    }

    // **居なくなった人を残さない**
    if (shown.size > world.getAllPlayers().length) {
      const here = new Set(world.getAllPlayers().map((p) => p.id));
      for (const id of [...shown.keys()]) if (!here.has(id)) shown.delete(id);
    }
  }, INTERVAL);
}
