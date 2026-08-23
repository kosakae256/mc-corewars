/**
 * チャットに出す文言と色を集約する。
 *
 * `§` の色コードを本文中に散らさない（docs/imp.md 6章）。
 * 文言を変えたくなったら、必ずここだけを直す。
 */

/** Minecraft のチャット色コード */
export const COLOR = {
  reset: "§r",
  gray: "§7",
  red: "§c",
  green: "§a",
  yellow: "§e",
  aqua: "§b",
} as const;

/**
 * LLM の応答に付ける色。
 *
 * 素のままだと他のチャットに埋もれて読みにくいので、水色で目立たせる。
 * 応答本文からは sanitizeReply が `§` を除去しているため、
 * ここで付けた色が本文中で打ち消されることはない。
 */
export const replyStyle = (text: string): string => `${COLOR.aqua}${text}${COLOR.reset}`;

export const MSG = {
  /** LLM が返事をしなかった／失敗した */
  noReply: `${COLOR.gray}…（返事がない）${COLOR.reset}`,

  summoned: (name: string) => `${COLOR.green}${name}${COLOR.reset} を召喚しました`,
  dismissed: (name: string) => `${COLOR.yellow}${name}${COLOR.reset} を退出させました`,
  dismissedAll: (n: number) => `${COLOR.yellow}${n}${COLOR.reset} 体を退出させました`,

  notFound: (name: string) => `${COLOR.red}${name} はいません${COLOR.reset}`,
  summonFailed: (name: string, reason: string) =>
    `${COLOR.red}${name} の召喚に失敗: ${reason}${COLOR.reset}`,

  botList: (names: string[]) =>
    names.length === 0
      ? `${COLOR.gray}ボットはいません${COLOR.reset}`
      : `${COLOR.aqua}ボット(${names.length})${COLOR.reset}: ${names.join(", ")}`,

  forgot: `${COLOR.gray}会話を忘れました${COLOR.reset}`,

  usage: `${COLOR.gray}!summon [名前] / !dismiss <名前|all> / !bots / !forget${COLOR.reset}`,
} as const;
