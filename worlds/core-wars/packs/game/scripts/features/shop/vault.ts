/**
 * 金庫の看板。
 *
 * 仕様は `docs/spec/22-vault.md` 2 章。
 *
 * ## 選ばせない
 *
 * 押した瞬間、**持ち物にある 4 種の鉱石を全部**預ける。
 *
 * 何をいくつ、を選ばせると手間が増えるだけ。
 * **全部でよい**——引き出せないぶん、預けすぎて困ることが無い。
 *
 * ## エンダーチェストからは取らない
 *
 * あちらは**自分で置いた物。** 勝手に動かさない。
 *
 * ## 敵陣の金庫は使えない
 *
 * **看板ごとに所属を持たせる**（`[金庫赤]` / `[金庫青]`）。
 *
 * 金庫は**自陣まで戻って預ける**もの。
 * 敵陣で預けられると、**攻め込んだ先で資源を安全にできてしまう。**
 */

import type { Container, Player } from "@minecraft/server";

import {
  CURRENCY_ITEM,
  CURRENCY_NAME_PLAIN,
  CURRENCY_ORDER,
  CURRENCY_SHORT,
  type Currency,
} from "../../lib/shop-items.js";
import { addVault, vaultOf } from "../../lib/vault.js";
import { teamName, teamOf, type Team } from "../../lib/match-state.js";
import { BAR, bar } from "../../lib/fx.js";

/** 持ち物からその鉱石を全部抜き取る。**抜いた数を返す** */
function takeAll(c: Container, currency: Currency): number {
  const id = CURRENCY_ITEM[currency];
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it?.typeId !== id) continue;
    n += it.amount;
    c.setItem(i, undefined);
  }
  return n;
}

/**
 * いまの残高を 1 行で返す。**0 のものは出さない。**
 *
 * 4 種すべて並べると長い（`docs/spec/22-vault.md` 4 章）。
 * **全部 0 なら空文字。**
 */
export function vaultLine(player: Player): string {
  const parts: string[] = [];
  for (const c of CURRENCY_ORDER) {
    const n = vaultOf(player, c);
    if (n > 0) parts.push(`${CURRENCY_SHORT[c]}${n}`);
  }
  return parts.length === 0 ? "" : parts.join(" ");
}

/** 画面に出しておく長さ（tick）。**3 秒** */
const SHOW_TICKS = 60;

/**
 * 画面に出す残高。
 *
 * **4 種すべて出す。** 0 のものも出す——
 * 並びが毎回変わると、**どこを見ればよいか分からなくなる。**
 *
 * 数を確かめに来ることもあるので、**預けるものが無くても出す。**
 */
function showVault(player: Player): void {
  const line = CURRENCY_ORDER.map((c) => `§f${CURRENCY_SHORT[c]}${vaultOf(player, c)}`).join("  ");
  // ---- **足元の行に出す**（docs/spec/22-vault.md 4 章）
  //
  // ワイヤーのガス残量と**同じ場所。**
  // 画面の真ん中に出すほどのことではない——**数を見に来ただけ**なので。
  //
  // 強さは「その場の知らせ」。ガスの残量（いちばん弱い）より強いので、
  // **ワイヤーを持っていても 3 秒はこちらが残る**
  bar(player, line, BAR.notice, SHOW_TICKS);
}

/**
 * 預ける。**看板を押したときに呼ぶ。**
 *
 * **何も無ければ、その旨を出す。**
 * 黙って何も起きないのが一番困る。
 */
export function depositAll(player: Player, sign: Team): void {
  // ---- **自陣の金庫だけ**（docs/spec/22-vault.md 2 章）
  //
  // 敵陣で預けられると、**攻め込んだ先で資源を安全にできてしまう。**
  // 所属が無い人（試合に出ていない人）も、どちらとも合わない
  const mine = teamOf(player);
  if (mine === undefined) {
    bar(player, "§c試合に出ている間だけ使えます");
    return;
  }
  if (mine !== sign) {
    bar(player, `§c${teamName(sign)}§c の金庫です §7(自陣の金庫を使ってください)`);
    return;
  }

  const c = player.getComponent("minecraft:inventory")?.container;
  if (c === undefined) {
    bar(player, "§c持ち物を読めません");
    return;
  }

  const took: string[] = [];
  for (const cur of CURRENCY_ORDER) {
    const n = takeAll(c, cur);
    if (n <= 0) continue;
    addVault(player, cur, n);
    took.push(`${CURRENCY_NAME_PLAIN[cur]} ${n}`);
  }

  // **預けるものが無くても、いまの残高は出す。**
  // 数を確かめに来ることもある
  if (took.length === 0) {
    showVault(player);
    return;
  }

  player.sendMessage(`§a金庫へ預けた§r §f${took.join("§7 / §f")}`);
  showVault(player);
  try {
    player.playSound("random.levelup", { location: player.location, pitch: 1.4, volume: 0.5 });
  } catch {
    /* 消えている */
  }
}
