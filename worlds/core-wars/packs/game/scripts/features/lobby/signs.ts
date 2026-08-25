/**
 * ロビーの看板。
 *
 * 仕様は `docs/spec/16-participation.md` 4章。
 *
 * ## 看板の文字で見分ける
 *
 * **座標を持たない。**
 *
 * 座標で決めると、マップを直したときに書き換える手間が要る。
 * 文字で決めれば、**看板を増やせばそのまま増える。**
 *
 * | 1 行目 | 何が起きるか |
 * | --- | --- |
 * | `[途中参加]` | 途中参加する |
 * | `[マイセット]` | マイセットの登録画面 |
 * | `[ルール]` | ルールを読む／同意する |
 * | `[観戦]` | 観戦を始める |
 * | `[コンセプト]` | このゲームについて読む |
 * | `[クレジット]` | 作った人を読む |
 * | `[金庫赤]` / `[金庫青]` | 持っている鉱石をまとめて預ける（`docs/spec/22-vault.md`） |
 *
 * ## 一時的に止められる
 *
 * `/game:signs` で、**打った本人だけ**看板が効かなくなる
 *（`docs/spec/16-participation.md` 4 章）。
 *
 * **印のある看板は、クリエイティブでも押した瞬間に動く。**
 * 直すには壊して置き直すしかなかった。
 *
 * **全員ぶん止めない。** 直している間ゲームが止まる。
 *
 * ## 色を付けてよい
 *
 * **色記号（`§`）は無視して見比べる。**
 *
 * 看板は目印なので、**目立つほうがよい。**
 * 色を付けた瞬間に反応しなくなるのでは、置く側が使いづらい。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  GameMode,
  system,
  world,
  type Block,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Player,
} from "@minecraft/server";

import { isRunning, type Team } from "../../lib/match-state.js";
import { showMysets } from "../shop/myset-ui.js";
import { showRules } from "./rules-ui.js";
import { enterSpectate } from "../spectate/index.js";
import { showConcept, showCredits } from "./concept-ui.js";
import { depositAll } from "../shop/vault.js";

/**
 * 同じ人が続けて押したとき、無視する長さ（tick）。
 *
 * **1 回の右クリックで通知が何度も来る**（2026-08-25 の指摘）。
 * ブロックへの操作は、押している間に繰り返し届く。
 *
 * そのまま流すと、**同じ文が何行も出て画面が埋まる。**
 * 画面を開く処理なら、**開き直しが起きる。**
 */
const COOLDOWN = 10;

/** 誰が、いつ押したか。**メモリだけ** */
const lastPush = new Map<string, number>();

/**
 * 看板を止めている人の印。
 *
 * **`/reload` をまたいで残る**（`docs/spec/09-state-management.md` 4 章）。
 * 直している最中に黙って戻ると、**また押すたびに画面が開く。**
 */
const KEY_MUTED = "cw:signs_off";

/** その人は看板を止めているか */
function muted(player: Player): boolean {
  try {
    return player.getDynamicProperty(KEY_MUTED) === true;
  } catch {
    return false;
  }
}

/** 続けて押されたか。**押されたことにするなら false** */
function tooSoon(player: Player): boolean {
  const now = system.currentTick;
  const last = lastPush.get(player.id);
  if (last !== undefined && now - last < COOLDOWN) return true;
  lastPush.set(player.id, now);
  return false;
}

/** 途中参加の看板 */
const JOIN = "[途中参加]";

/** マイセットの看板 */
const MYSET = "[マイセット]";

/** ルールの看板 */
const RULES = "[ルール]";

/** 観戦の看板 */
const SPECTATE = "[観戦]";

/** コンセプトの看板 */
const CONCEPT = "[コンセプト]";

/** クレジットの看板 */
const CREDITS = "[クレジット]";

/**
 * 金庫の看板。**チームごとに分ける。**
 *
 * **ロビーの看板ではない**（`docs/spec/22-vault.md` 2 章）。
 * 拠点に置く——この仕組みは座標を持たないので、**置いた数だけ増える。**
 *
 * **どちらのチームのものかも文字で決める。**
 * 置いた場所では決めない——拠点の範囲を別に持つと、必ずずれる。
 */
const VAULT: Readonly<Record<string, Team>> = {
  "[金庫赤]": "red",
  "[金庫青]": "blue",
};

/** 看板だと分かるブロックか。**種類の名前に `sign` が入っている** */
function isSign(block: Block): boolean {
  return block.typeId.includes("sign");
}

/**
 * 色記号（`§` と次の 1 文字）を取り除く。
 *
 * **正規表現を使わない。** `§` は 1 文字なので、
 * 素直に走査するほうが速く、何をしているかも読んで分かる。
 */
function stripColor(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "§") {
      i++; // 次の 1 文字も飛ばす
      continue;
    }
    out += text[i];
  }
  return out;
}

/**
 * 看板から印を探す。
 *
 * **どの行にあってもよい。**
 *
 * 1 行目だけを見ていたが、
 * **看板は「表題 + 説明」の形で書くほうが自然**なので、
 * 印が 2 行目以降に来ることがある。
 *
 * 色記号は落としてから見比べる（`stripColor`）。
 */
function markOf(block: Block): string | undefined {
  let text = "";
  try {
    text = block.getComponent("minecraft:sign")?.getText() ?? "";
  } catch {
    return undefined;
  }
  for (const raw of text.split("\n")) {
    const line = stripColor(raw).trim();
    if (
      line === JOIN ||
      line === MYSET ||
      line === RULES ||
      line === SPECTATE ||
      line === CONCEPT ||
      line === CREDITS ||
      VAULT[line] !== undefined
    ) {
      return line;
    }
  }
  return undefined;
}

/** 途中参加させる。**`features/match` の処理を渡してもらう** */
export type JoinFn = (player: Player) => void;

/**
 * 看板を押したときの動き。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerLobbySigns(joinNow: JoinFn): void {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const block = ev.block;
    if (!isSign(block)) return;
    const player = ev.player;

    // ---- **止めている人には何もしない**（docs/spec/16-participation.md 4 章）
    //
    // 打ち消しもしない。**バニラの動き（編集画面）をそのまま通す**
    if (muted(player)) return;

    // ---- **クリエイティブの人だけ編集できる**
    //
    // 遊ぶ人はサバイバルか観戦者。
    // **看板はゲームの入口**なので、書き換えられると入れなくなる。
    //
    // 運営はロビーでクリエイティブに切り替えられる（`features/admin`）ので、
    // 置くのも直すのもそちらで行う
    let creative = false;
    try {
      creative = player.getGameMode() === GameMode.Creative;
    } catch {
      /* 読めなかった。触らせない側に倒す */
    }

    const line = markOf(block);

    // 印の無い看板。**黙って打ち消す**
    //
    // **何も言わない**（2026-08-25 変更）。
    // 看板は右クリックで使うものなので、
    // 押すたびに「編集できません」と出ると**うるさいだけ。**
    // 編集できないことは、編集画面が出ない時点で伝わる
    if (line === undefined) {
      if (!creative) ev.cancel = true;
      return;
    }

    // **印のある看板は、クリエイティブでも押したら動く。**
    // 直したいなら壊して置き直す
    ev.cancel = true;

    // **続けて押されたぶんは捨てる**（COOLDOWN の説明）
    if (tooSoon(player)) return;

    system.run(() => {
      if (line === RULES) {
        showRules(player);
        return;
      }
      if (line === CONCEPT) {
        showConcept(player);
        return;
      }
      if (line === CREDITS) {
        showCredits(player);
        return;
      }
      if (line === SPECTATE) {
        // **いつでも入れる**（docs/spec/20-spectate.md 2 章）
        const why = enterSpectate(player);
        if (why !== undefined) player.sendMessage(why);
        return;
      }
      const vaultTeam = VAULT[line];
      if (vaultTeam !== undefined) {
        // **自陣の金庫にだけ預けられる**（docs/spec/22-vault.md 2 章）
        depositAll(player, vaultTeam);
        return;
      }
      if (line === MYSET) {
        // **ロビーでは買えない**（docs/spec/17-myset.md 2章）。
        // 試合前に資源を持っていないので意味が無い
        showMysets(player, false);
        return;
      }
      // ---- 途中参加
      if (!isRunning()) {
        player.sendMessage("§7いま試合は行われていません");
        return;
      }
      // **同意の確認は `joinNow` の側で行う**（2026-08-25 変更）。
      // 両方で見ていると、片方だけ直したときに食い違う
      joinNow(player);
    });
  });
}

/**
 * 看板の反応を止める／戻すコマンド。
 *
 * **トップレベルの `startup` から呼ぶこと。**
 *
 * **運営だけ。** 遊ぶ人が止められると、ゲームの入口が塞がる。
 */
export function registerSignCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:signs",
      description: "看板の反応を止める／戻す（自分だけ・運営のみ）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      const off = !muted(player);
      system.run(() => {
        try {
          player.setDynamicProperty(KEY_MUTED, off ? true : undefined);
        } catch {
          /* 消えている */
        }
      });
      return {
        status: CustomCommandStatus.Success,
        message: off ? "看板を止めた（自分だけ。もう一度で戻る）" : "看板を戻した",
      };
    }
  );
}
