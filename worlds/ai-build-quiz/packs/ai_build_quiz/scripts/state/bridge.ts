/**
 * bridge の生存（`docs/spec/15-state.md`、`13-transport.md` の `quiz:ping`）。
 *
 * bridge は 1 秒ごとに `quiz:ping` を送る。5 秒（100 tick）以内に受けていなければ「繋がっていない」。
 */

/** これ以上古い ping は「切れている」とみなす（tick） */
export const BRIDGE_TIMEOUT_TICKS = 100;

let lastPing = -1;

export function markBridgePing(tick: number): void {
  lastPing = tick;
}

export function bridgeConnected(now: number): boolean {
  return lastPing >= 0 && now - lastPing <= BRIDGE_TIMEOUT_TICKS;
}
