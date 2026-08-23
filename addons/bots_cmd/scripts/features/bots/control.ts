/**
 * ボット管理ツールの制御サーバー（`tools/bots`）を HTTP で叩く。
 *
 * チャットを経由しないので、コマンドを打っても**チャット欄に何も出ない**。
 * また、ボットが0体でも動く（ボットに読ませる必要がないため）。
 *
 * `@minecraft/server-net` は **BDS 限定かつ beta**。
 * クライアント単体では動かない（docs/spec/02-llm-chat.md 5-6）。
 */
import { http, HttpRequest, HttpRequestMethod } from "@minecraft/server-net";

import { CONTROL_BASE_URL, REQUEST_TIMEOUT_SEC } from "./config.js";
import { isControlResult, type ControlResult } from "./types.js";

/**
 * 制御サーバーにコマンドを送る。
 *
 * @param path `summon` / `dismiss` / `list` / `forget`
 * @param name 対象のボット名。省略可
 */
export async function callControl(
  path: string,
  name?: string
): Promise<ControlResult> {
  // URL はプレイヤー入力から組み立てない。基底は定数、name のみを載せる
  const query = name === undefined ? "" : `?name=${encodeURIComponent(name)}`;

  const req = new HttpRequest(`${CONTROL_BASE_URL}/${path}${query}`);
  req.method = HttpRequestMethod.Get;
  req.timeout = REQUEST_TIMEOUT_SEC;

  try {
    const res = await http.request(req);
    if (res.status !== 200) {
      return { ok: false, message: `制御サーバーが ${res.status} を返しました` };
    }

    // 外部から来る値なので、必ず型ガードを通す
    const parsed: unknown = JSON.parse(res.body);
    if (!isControlResult(parsed)) {
      return { ok: false, message: "制御サーバーの応答が不正です" };
    }
    return parsed;
  } catch (e) {
    // 詳細はサーバーのログにだけ出す。プレイヤーには出さない
    console.warn(`[bots_cmd] 制御サーバー呼び出しに失敗: ${String(e)}`);
    return { ok: false, message: "ボット管理ツールに接続できません" };
  }
}
