/**
 * `/bots ...` のカスタムコマンドを登録する。
 *
 * 実行内容は制御サーバーへの HTTP に委譲する（control.ts）。
 * ここは「コマンドの形」と「結果の返し方」だけを担う。
 */
import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  system,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type Player,
  type StartupEvent,
} from "@minecraft/server";

import { NAMESPACE } from "./config.js";
import { callControl } from "./control.js";
import { MSG } from "../../lib/format.js";

/**
 * 実行者にだけ結果を返す。
 *
 * コマンドの結果を全体に流すと、隠した意味がなくなる。
 */
function replyTo(origin: CustomCommandOrigin, text: string): void {
  const player = origin.sourceEntity as Player | undefined;
  // sourceEntity が無い場合（コンソール実行など）はサーバーログに出す
  if (player?.sendMessage) player.sendMessage(text);
  else console.log(`[bots_cmd] ${text}`);
}

/**
 * 制御サーバーを叩いて結果を返す。
 *
 * **コマンドのコールバックは restricted execution** なので、
 * ここで HTTP を投げたりメッセージを送ったりできない。
 * `system.run()` で次の tick に逃がす。
 */
function dispatch(origin: CustomCommandOrigin, path: string, name?: string): CustomCommandResult {
  system.run(() => {
    void callControl(path, name).then((result) => {
      replyTo(origin, result.ok ? MSG.ok(result.message) : MSG.ng(result.message));
    });
  });
  return { status: CustomCommandStatus.Success };
}

/**
 * ## 権限レベルについて
 *
 * `CommandPermissionLevel.Any` にしている。**Admin では動かなかった。**
 *
 * `online-mode=false`（ボットを認証なしで繋ぐために必須）にすると、
 * xuid ベースの権限が安定しない。`op` を実行した直後でも
 * 「コマンドの権限レベルが正しくありません」と拒否され、
 * 再接続すると権限が外れる、という挙動を実測した。
 *
 * 認証していない identity に権限を紐付けられないためと思われる。
 *
 * `Any` にしても、これらのコマンドで**できるのはボットの操作だけ**で、
 * ワールドを壊す操作は含まない。
 * 入室そのものを制限したい場合は `allow-list` で対処する。
 *
 * ## コマンド名の付け方に注意。
 *
 * バニラに同名のコマンドがあると**短縮形（名前空間なし）が使えなくなる**。
 * 実測: `summon` / `list` は衝突し、
 * 「Custom Command alias [summon] already in use.
 *   Required to use full name [bots:summon].」と警告が出て、
 * `/bots:summon` と完全名で打つ必要があった。
 *
 * そのため衝突しない名前（add / remove / show / forget）にしている。
 * これにより `/add` `/remove` のような短縮形でも呼べる。
 */
export function registerBotsCommands(init: StartupEvent): void {
  const registry = init.customCommandRegistry;

  registry.registerCommand(
    {
      name: `${NAMESPACE}:add`,
      description: "ボットを召喚する。名前を省略するとランダムな名前になる",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ type: CustomCommandParamType.String, name: "name" }],
    },
    (origin: CustomCommandOrigin, name?: string) => dispatch(origin, "summon", name)
  );

  registry.registerCommand(
    {
      name: `${NAMESPACE}:remove`,
      description: "ボットを退出させる。all を指定すると全員",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ type: CustomCommandParamType.String, name: "name" }],
    },
    (origin: CustomCommandOrigin, name: string) => dispatch(origin, "dismiss", name)
  );

  registry.registerCommand(
    {
      name: `${NAMESPACE}:show`,
      description: "いまいるボットの一覧を表示する",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin) => dispatch(origin, "list")
  );

  registry.registerCommand(
    {
      name: `${NAMESPACE}:forget`,
      description: "LLM の会話履歴を破棄する",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin) => dispatch(origin, "forget")
  );
}
