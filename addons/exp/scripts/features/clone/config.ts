/**
 * 分身（ヨルの Fakeout 相当）の設定値。
 *
 * 仕様: docs/spec/05-exp-clone.md
 * 実験用なので、触りたくなる値はすべてここに集める。
 */

/** 発動アイテム。参加者の左端に固定される */
export const CLONE_ITEM = "minecraft:blaze_rod";

/** 発動アイテムを置くスロット（ホットバー左端） */
export const CLONE_SLOT = 0;

/** 発動アイテムの表示名 */
export const CLONE_ITEM_NAME = "§b分身§r";

/** 左端に発動アイテムがあるか確認する間隔（tick） */
export const EQUIP_INTERVAL = 40;

/** 分身が走る時間（tick）。20 tick = 1秒 */
export const CLONE_RUN_TICKS = 100;

/** 分身が走る速さ */
export const CLONE_SPEED = 1;

/**
 * 参加・退出の通知を止めておく窓の長さ（tick）。
 *
 * **長くしてはいけない。** この間の `TextPacket` を全部止めるので、
 * 普通のチャットまで消える。分身が出入りする一瞬だけ立てる。
 */
export const SUPPRESS_TICKS = 2;

/**
 * スキンを着せ直すまでの待ち（tick）。
 *
 * 湧いた直後は中身が整っていないことがあるので、少し置いてもう一度着せる。
 */
export const SKIN_RETRY_TICKS = 10;
