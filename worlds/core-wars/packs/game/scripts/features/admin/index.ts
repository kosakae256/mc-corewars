/**
 * 運営の手元の道具。
 *
 * 仕様は `docs/spec/16-participation.md`（参加札）と
 * `docs/spec/15-presentation.md`（ロビー）。
 *
 * ## なぜアイテムにするのか
 *
 * **コマンドを打つのは、遊んでいる最中には遅い。**
 * `/game:start` を打つには一度画面を離れることになる。
 *
 * 持ち物から押せれば、**そのまま進められる。**
 *
 * ## 誰に渡すのか
 *
 * **オペレーター権限を持っている人だけ。**
 * 名前で判定しない。名前は変わりうる（`docs/spec/11-match.md` 6-D の教訓）。
 */

import { GameMode, ItemLockMode, ItemStack, system, world, type Container, type Player } from "@minecraft/server";

import { shouldBeInBattle } from "../../lib/match-state.js";
// **「運営か」の判定は 1 箇所に置く**（docs/spec/15-presentation.md 5-A）
import { isOp } from "../../lib/op.js";

/**
 * 設定の道具。**コンパス 1 つだけ。**
 *
 * **以前は 7 つ並べていた**（切り替えの札 + 開始・建築・掃除・状態・値段・移動）。
 * ロビーで**枠を 7 つ占めていて邪魔**だった
 *（`docs/spec/19-admin-menu.md` 1 章）。
 *
 * **機能を足すほど邪魔になる**作りでもあったので、
 * 中身は全部メニューへ移した。
 */
const MENU_ITEM = "minecraft:compass";

/** 見張る間隔（tick） */
const INTERVAL = 20;

/** 名前の中の見えない目印。**押されたときに何の道具か分かるように** */
const MARK = "§r§8";

/** その名前の道具を、持ち物のどこかに持っているか */
function has(c: Container, label: string): boolean {
  for (let i = 0; i < c.size; i++) {
    if (c.getItem(i)?.nameTag === label) return true;
  }
  return false;
}

function put(c: Container, slot: number, id: string, label: string): void {
  // **どこかに持っていれば触らない**（2026-08-25 変更）。
  //
  // 以前は決まった枠を見ていたので、
  // **動かすと元の枠に増え続けた。**
  if (has(c, label)) return;

  const it = new ItemStack(id, 1);
  it.nameTag = label;
  // ---- **捨てられないだけ。動かすのは自由**
  //
  // 枠に固定していたが、**並べ替えられないのが邪魔**だった
  //（2026-08-25 の指摘）。
  //
  // `inventory` は「持ち物の外へ出せない」という印。
  // **捨てられず、置けず、しまえないが、枠の間は動かせる。**
  it.lockMode = ItemLockMode.inventory;
  it.keepOnDeath = true;
  try {
    // 決まった枠が空いていればそこへ。埋まっていれば空きへ
    if (c.getItem(slot) === undefined) c.setItem(slot, it);
    else c.addItem(it);
  } catch {
    /* 置けなかった */
  }
}

/** 設定の道具の名前 */
const MENU_LABEL = `${MARK}§b設定`;

/** 印の付いたものを全部消す。**戦場に出るとき** */
function clearAllKit(c: Container): void {
  for (let i = 0; i < c.size; i++) {
    if (c.getItem(i)?.nameTag?.startsWith(MARK) === true) c.setItem(i, undefined);
  }
}

/**
 * 運営の持ち物を整える。
 *
 * **戦場に居ない間だけ。** 試合に出ている最中に持たせると、
 * 間違って押して試合を壊す。
 */
/** なぜ配られないのかを、1 度だけ知らせるための印 */
const told = new Set<string>();

function refresh(player: Player): void {
  const c = player.getComponent("minecraft:inventory")?.container;
  if (c === undefined) {
    // **黙って諦めない。** 持ち物を読めないなら、それが理由
    if (!told.has(player.id)) {
      told.add(player.id);
      player.sendMessage("§c運営の道具を配れません: 持ち物を読めません");
    }
    return;
  }
  told.delete(player.id);

  // **設定の道具だけ。** 中身はメニューに集めてある
  put(c, 0, MENU_ITEM, MENU_LABEL);
}

/**
 * 配ってよいか。
 *
 * **戦場に居ない間は配る。**
 * 試合に出ている最中に持たせると、間違って押して試合を壊す。
 *
 * **ただしクリエイティブなら、戦場に居ても配る**（2026-08-25 追加）。
 * クリエイティブの運営は**遊んでいない。**
 * 見ながら回している最中こそ、止めたい・チームを直したいが起きる。
 * ロビーへ戻らないと開けないのでは、道具の意味が無い
 *（`docs/spec/19-admin-menu.md` 3 章）。
 */
function mayHold(player: Player): boolean {
  if (!shouldBeInBattle(player)) return true;
  try {
    return player.getGameMode() === GameMode.Creative;
  } catch {
    // **読めないなら配らない。** 出ている側に倒す
    return false;
  }
}

/** 片付ける。**試合が始まったら全部消す** */
function strip(player: Player): void {
  const c = player.getComponent("minecraft:inventory")?.container;
  if (c === undefined) return;
  // **札も道具も、印で見分けて全部消す**
  clearAllKit(c);
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function startAdminKit(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      if (!isOp(player)) continue;
      // ---- **戦場に居ない間は持たせる**（2026-08-25 変更）
      //
      // 「非開始のときだけ」にしていたので、
      // **一時停止が残っているだけで配られなかった。**
      //
      // ロビーの支給品と同じ条件に揃える（`features/lobby`）。
      // 配ってよいかの判断は `mayHold` の 1 箇所に集めてある
      if (mayHold(player)) refresh(player);
      else strip(player);
    }
  }, INTERVAL);
}

/**
 * 押されたときの動き。
 *
 * **設定を開くだけ。**
 * 何をするかはメニューの側にある（`features/admin/menu.ts`）。
 */
export function registerAdminKit(open: (player: Player) => void): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    const player = ev.source;
    if (!isOp(player)) return;
    if (ev.itemStack.typeId !== MENU_ITEM) return;
    if (ev.itemStack.nameTag !== MENU_LABEL) return;
    system.run(() => open(player));
  });
}

/**
 * その場で配り直す。**`/game:kit` から呼ぶ。**
 *
 * **何が起きたかを返す。**
 * 配られないと言われたとき、どこで止まっているかを
 * 推測で追うと時間だけが溶ける。
 */
export function forceKit(player: Player): string {
  if (!isOp(player)) return `§cオペレーターではありません §7(権限=${player.playerPermissionLevel})`;
  if (!mayHold(player)) return "§c戦場に居る間は配りません §7(クリエイティブなら配ります)";

  const c = player.getComponent("minecraft:inventory")?.container;
  if (c === undefined) return "§c持ち物を読めません";

  const before = countMarked(c);
  refresh(player);
  const after = countMarked(c);
  let mode = "不明";
  try {
    mode = String(player.getGameMode());
  } catch {
    /* 読めなかった */
  }
  return `§a配りました §7${before} → ${after} 個（モード=${mode}）`;
}

/** 印の付いた道具を数える */
function countMarked(c: Container): number {
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    if (c.getItem(i)?.nameTag?.startsWith(MARK) === true) n++;
  }
  return n;
}
