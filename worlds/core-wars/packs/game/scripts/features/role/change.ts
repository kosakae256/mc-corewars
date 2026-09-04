/**
 * ロールを変える。
 *
 * 仕様は `docs/spec/24-role.md` 2 章。
 *
 * ## 変えると、一度倒れる
 *
 * **戦っている最中に、その場で乗り換えられては困る。**
 * 不利になったら別のロールへ、が無料でできると**選ぶ意味が消える。**
 *
 * 死ぬのと同じ代償を払わせる。**ただし持ち物は守る**——
 * 買った装備まで失うと、**変えること自体ができなくなる。**
 *
 * ## 前のロールのものは、必ず片付ける
 *
 * **ロールごとに `if` を書かない。**
 * 「そのロールだけのもの」を片付ける手続きを**ロールの側に持たせ**、
 * 変えるときに必ず通す。
 *
 * > ロールは増える。**増えるたびに変更処理を直していたら、必ずどれか忘れる。**
 */

import { system, world, type Player } from "@minecraft/server";

import { ROLES, hasRole, roleEnabled, roleOf, setRoleId, type RoleId } from "../../lib/roles.js";
import { goDown } from "../death/index.js";
import { removeDroneById, removeDroneOf } from "../drone/index.js";
import { isRunning } from "../../lib/match-state.js";
import { BAR, bar } from "../../lib/fx.js";

/**
 * ロールごとの片付け。
 *
 * **そのロールだけのもの**（実体・アイテム）を消す。
 *
 * ここに足すだけで、
 * **ロールを変えたときも、居なくなったときも**同じように片付く。
 */
/**
 * 戻す先。**誰でも持っていて、止められない**（`lib/roles.ts` の `roleEnabled`）。
 *
 * 持っていないロール・止められたロールから落ちる先が、**ここ 1 つに揃う。**
 */
const DEFAULT: RoleId = "swift";

const CLEANUP: Readonly<Partial<Record<RoleId, (player: Player) => void>>> = {
  engineer: (player) => removeDroneOf(player),
};

/** その人のロールに付いているものを片付ける */
export function cleanupRole(player: Player): void {
  CLEANUP[roleOf(player).id]?.(player);
}

/**
 * **持っていないロールで試合に入らせない**（`docs/spec/25-practice.md` 4 章）。
 *
 * ロビーでは**買っていないロールも試せる。**
 * そのまま参加できてしまうと、**点を貯める意味が消える。**
 *
 * | | |
 * | --- | --- |
 * | 持っている | **そのまま持ち込む** |
 * | 持っていない | **Swift に戻す**（誰でも持っている） |
 *
 * **倒れない。** 参加処理の途中で呼ぶので、
 * ここで倒すと**入った瞬間に死ぬ**ことになる。
 */
export function settleRole(player: Player): void {
  const now = roleOf(player);
  // ---- **止められているロールも Swift に戻す**（2026-09-01 追加）
  //
  // 仕様は `docs/spec/19-admin-menu.md` 10 章。
  //
  // 止めた瞬間に居る人は戻している（`evictRole`）が、
  // **止まっている間にロビーで試して、そのまま参加する**道が残る。
  // **入口でもう一度見る。**
  const why = !hasRole(player, now.id) ? "は持っていない" : !roleEnabled(now.id) ? "はいま使えない" : undefined;
  if (why === undefined) return;

  cleanupRole(player);
  setRoleId(player, DEFAULT);
  try {
    player.sendMessage(`§7${now.name} ${why}ので §bSwift§7 で参加します`);
  } catch {
    /* 送れなかった */
  }
}

/**
 * そのロールで居る人を、全員 Swift に戻す。
 *
 * **運営がロールを止めたときに呼ぶ**（`docs/spec/19-admin-menu.md` 10 章）。
 *
 * ## 倒さない
 *
 * ロールを変えると一度倒れる（`docs/spec/24-role.md` 2-2）が、**ここでは倒さない。**
 *
 * 倒れるのは**「不利になったら乗り換える」を防ぐための代償**で、
 * **本人が選んだときの話。**
 * 運営が止めたせいで倒れるのは、**とばっちりでしかない。**
 *
 * **黙って戻さない。** 何が起きたのかをその人に伝える。
 *
 * @returns 戻した人数
 */
export function evictRole(id: RoleId): number {
  if (id === DEFAULT) return 0;
  let moved = 0;
  for (const player of world.getAllPlayers()) {
    if (roleOf(player).id !== id) continue;
    // **付いている物を先に片付ける**（機体が残ると持ち主のいない実体になる）
    cleanupRole(player);
    setRoleId(player, DEFAULT);
    moved += 1;
    try {
      player.sendMessage(`§c${ROLES[id].name} は使用停止になりました。§bSwift§7 に戻します`);
    } catch {
      /* 送れなかった */
    }
  }
  return moved;
}

/**
 * ロールを変える。
 *
 * @returns 変えられなければ理由
 */
export function changeRole(player: Player, id: RoleId): string | undefined {
  const now = roleOf(player);
  if (now.id === id) return "§7もうそのロールです";

  // ---- **止められているロールは選べない**（2026-09-01 追加）
  //
  // 仕様は `docs/spec/19-admin-menu.md` 10 章。
  //
  // **関門はここ 1 つ。** 盤面・ロビーのお試し・運営のプレイヤー管理——
  // **ロールが変わる経路は全部ここを通る。**
  // 画面で押せなくするのは見せ方であって、止めているのはこちら
  if (!roleEnabled(id)) return `§c${ROLES[id].name} はいま使えません`;

  const next = ROLES[id];

  // ---- **前のロールのものを片付ける**（`docs/spec/24-role.md` 2-3）
  cleanupRole(player);
  setRoleId(player, id);

  // ---- **一度倒れる**（2-2）
  //
  // **持ち物は落とさない。**
  // `goDown` の `dropped` は「落とす処理はもう済んでいる」という意味なので、
  // 立てておけば**何も落ちない。**
  if (isRunning()) {
    system.run(() => goDown(player, undefined, "hit", true));
  }

  bar(player, `§b${next.name} §7になった`, BAR.important, 60);
  try {
    world.sendMessage(`§7${player.name} が §b${next.name}§7 になった`);
  } catch {
    /* 送れなかった */
  }
  return undefined;
}

/**
 * 居なくなった人の片付けを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function registerRoleCleanup(): void {
  world.afterEvents.playerLeave.subscribe((ev) => {
    // **抜けた人の機体を残さない**（`docs/spec/24-role.md` 2-3）。
    // ロールを読む相手がもう居ないので、**機体のほうから消す**
    removeDroneById(ev.playerId);
  });
}
