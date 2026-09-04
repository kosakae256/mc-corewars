/**
 * チェスト UI の設定（`worlds/core-wars` から持ってきたものを、v3 向けに直した）。
 *
 * | | |
 * | --- | --- |
 * | **大きさ** | **27（縦 3 × 横 9）だけを使う** |
 * | **持ち物欄** | **出さない**（`ui/_global_variables.json` の `$show_inventory` と揃える） |
 *
 * **両方を揃えないと、押した場所と押された物がずれる。**
 */

/** 持ち物欄を出すか。**RP 側（`$show_inventory`）と必ず揃える** */
export const inventory_enabled = false;

/** 自前のアイコン。**いまは無い** */
export const custom_content = {};

export const number_of_custom_items = 0;
export const custom_content_keys = new Set(Object.keys(custom_content));

/** 使える大きさ。**UI 側で有効にしたものだけが出る** */
export const CHEST_UI_SIZES = new Map([
	['single', ['§c§h§e§s§t§2§7§r', 27]], ['small', ['§c§h§e§s§t§2§7§r', 27]],
	['double', ['§c§h§e§s§t§5§4§r', 54]], ['large', ['§c§h§e§s§t§5§4§r', 54]],
	['1', ['§c§h§e§s§t§0§1§r', 1]],
	['5', ['§c§h§e§s§t§0§5§r', 5]],
	['9', ['§c§h§e§s§t§0§9§r', 9]],
	['18', ['§c§h§e§s§t§1§8§r', 18]],
	['27', ['§c§h§e§s§t§2§7§r', 27]],
	['36', ['§c§h§e§s§t§3§6§r', 36]],
	['45', ['§c§h§e§s§t§4§5§r', 45]],
	['54', ['§c§h§e§s§t§5§4§r', 54]],
	[1, ['§c§h§e§s§t§0§1§r', 1]],
	[5, ['§c§h§e§s§t§0§5§r', 5]],
	[9, ['§c§h§e§s§t§0§9§r', 9]],
	[18, ['§c§h§e§s§t§1§8§r', 18]],
	[27, ['§c§h§e§s§t§2§7§r', 27]],
	[36, ['§c§h§e§s§t§3§6§r', 36]],
	[45, ['§c§h§e§s§t§4§5§r', 45]],
	[54, ['§c§h§e§s§t§5§4§r', 54]]
]);
