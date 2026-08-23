/**
 * このアドオンの設定値。
 *
 * 変えたくなったらここ1箇所を直す（docs/imp.md 6章）。
 */

/**
 * ボット管理ツールの制御サーバー。
 *
 * `tools/bots/bots.config.json` の `control.port` と一致させること。
 * BDS と同じマシンで動いている前提なので 127.0.0.1。
 */
export const CONTROL_BASE_URL = "http://127.0.0.1:45500";

/** HTTP のタイムアウト（秒）。召喚は spawn 待ちがあるので長めにとる */
export const REQUEST_TIMEOUT_SEC = 30;

/** コマンドの名前空間 */
export const NAMESPACE = "bots";
