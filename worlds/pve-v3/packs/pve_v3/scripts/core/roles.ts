/**
 * ロールの一覧。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/01-roles.md`。
 *
 * > ### いま選べるのは 1 つだけ（2026-09-05）
 * >
 * > **左クリック（特殊攻撃）の仕組みがまだ無い。**
 * > **左クリックを使わない「通常のみ」だけを選べるようにする**——
 * > 残りは並べるが、押しても断る。
 */

/** ロールの id */
export type RoleId = "bow_plain" | "bow_tech" | "bow_power" | "bow_blast" | "bow_trap" | "bow_support";

export interface RoleDef {
  /** 画面に出す名前 */
  readonly name: string;
  /** 武器種 */
  readonly weapon: string;
  /** ひとこと */
  readonly summary: string;
  /** 説明（何行でも） */
  readonly lore: readonly string[];
  /** 盤面に出す絵 */
  readonly icon: string;
  /** **いま選べるか。** 左クリックが要るものは false */
  readonly ready: boolean;
  /** **通常攻撃の倍率**（`services/attack.ts`） */
  readonly normal: number;
}

/** 既定のロール。**何も選んでいない人はこれ** */
export const DEFAULT_ROLE: RoleId = "bow_plain";

export const ROLES: Readonly<Record<RoleId, RoleDef>> = {
  bow_plain: {
    name: "弓 / 通常のみ",
    weapon: "弓",
    summary: "左クリックを持たない代わりに、通常攻撃が 2 倍",
    lore: ["§7特殊攻撃を持たない。", "§7そのぶん§f通常攻撃の威力が ×2§7。", "", "§a今すぐ選べる"],
    icon: "minecraft:bow",
    ready: true,
    normal: 2,
  },
  bow_tech: {
    name: "弓 / 連射・技",
    weapon: "弓",
    summary: "左クリックで連射。外さないほど強い",
    lore: ["§7左クリックで連射する。", "§7当て続けるほど威力が上がる。", "", "§8まだ作っていない"],
    icon: "minecraft:arrow",
    ready: false,
    normal: 1,
  },
  bow_power: {
    name: "弓 / 連射・剛",
    weapon: "弓",
    summary: "左クリックで連射。散るが手数で押す",
    lore: ["§7左クリックで連射する。", "§7散りが大きく、外してもよい。", "", "§8まだ作っていない"],
    icon: "minecraft:spectral_arrow",
    ready: false,
    normal: 1,
  },
  bow_blast: {
    name: "弓 / 爆発",
    weapon: "弓",
    summary: "左クリックで爆発する矢を放つ",
    lore: ["§7着弾した所で爆ぜる。", "§7かたまりに強い。", "", "§8まだ作っていない"],
    icon: "minecraft:fire_charge",
    ready: false,
    normal: 1,
  },
  bow_trap: {
    name: "弓 / トラッパー",
    weapon: "弓",
    summary: "左クリックで着弾地点に罠を置く",
    lore: ["§7置いて、誘い込んで戦う。", "", "§8まだ作っていない"],
    icon: "minecraft:tripwire_hook",
    ready: false,
    normal: 1,
  },
  bow_support: {
    name: "弓 / サポート",
    weapon: "弓",
    summary: "左クリックで味方を回復する",
    lore: ["§7味方を支える。", "", "§8まだ作っていない"],
    icon: "minecraft:golden_apple",
    ready: false,
    normal: 1,
  },
};

/** 盤面に並べる順 */
export const ROLE_ORDER: readonly RoleId[] = [
  "bow_plain",
  "bow_tech",
  "bow_power",
  "bow_blast",
  "bow_trap",
  "bow_support",
];

/** 保存した値からの読み替え */
export function toRoleId(value: unknown): RoleId | undefined {
  if (typeof value !== "string") return undefined;
  return value in ROLES ? (value as RoleId) : undefined;
}
