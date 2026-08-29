/**
 * エンチャントの一覧（**26 種**）。
 *
 * 仕様は `docs/spec/20-enchants.md`。
 *
 * > ### このファイルは書き出したもの。**手で直さない。**
 * >
 * > 出どころは `tools/pve_enchant_table.py`。
 * > **直したらもう一度走らせる**（`python tools/pve-enchants-code.py`）。
 */

/** エンチャントの名前 */
export type EnchantKey =
  | "power"
  | "crit"
  | "absorb"
  | "miner"
  | "bookworm"
  | "last_stand"
  | "spread"
  | "reflect"
  | "homing"
  | "quick"
  | "snipe"
  | "close"
  | "light_archer"
  | "focus"
  | "pierce"
  | "burst"
  | "chain"
  | "pierce_magic"
  | "erode"
  | "reaper"
  | "first_strike"
  | "pack"
  | "lone"
  | "link"
  | "pursue"
  | "quick_nock";

/** どの軸を動かすか（`docs/spec/20-enchants.md` 3 章） */
export type EnchantAxis =
  "power" | "spread" | "pierce" | "homing" | "bounce" | "explode" | "charge" | "element" | "support" | "gain";

/** エンチャント 1 つの持ち物 */
export interface EnchantInfo {
  readonly key: EnchantKey;
  readonly label: string;
  /** 共通か、弓だけか */
  readonly scope: "common" | "bow";
  /** 段の上限（1〜5） */
  readonly max: number;
  readonly axis: EnchantAxis;
  /** 説明欄に出す一言 */
  readonly about: string;
}

export const ENCHANT_LIST: readonly EnchantInfo[] = [
  {
    key: "power",
    label: "強撃",
    scope: "common",
    max: 5,
    axis: "power",
    about: "基本威力が 段 × 20% 上がる（最大 +100%）",
  },
  {
    key: "crit",
    label: "クリティカルヒット",
    scope: "common",
    max: 3,
    axis: "power",
    about: "クリティカルの威力が +50 / +125 / +200%",
  },
  {
    key: "absorb",
    label: "吸収",
    scope: "common",
    max: 3,
    axis: "support",
    about: "与えたダメージの 段 × 2% を回復",
  },
  {
    key: "miner",
    label: "採掘者",
    scope: "common",
    max: 3,
    axis: "gain",
    about: "エメラルドの落ちる率が上がる",
  },
  {
    key: "bookworm",
    label: "本の虫",
    scope: "common",
    max: 3,
    axis: "gain",
    about: "経験値の取得量が上がる",
  },
  {
    key: "last_stand",
    label: "背水の陣",
    scope: "common",
    max: 3,
    axis: "power",
    about: "自分の HP が低いほど上がる（残り 0% で 段 × 20%）",
  },
  {
    key: "spread",
    label: "拡散",
    scope: "bow",
    max: 4,
    axis: "spread",
    about: "2 / 3 / 4 / 5 発に増える（各 60 / 45 / 40 / 35%）",
  },
  {
    key: "reflect",
    label: "反射",
    scope: "bow",
    max: 1,
    axis: "bounce",
    about: "壁で 1 回跳ねる",
  },
  {
    key: "homing",
    label: "追尾",
    scope: "bow",
    max: 1,
    axis: "homing",
    about: "曲がって追う（−10%）",
  },
  {
    key: "quick",
    label: "速射",
    scope: "bow",
    max: 3,
    axis: "charge",
    about: "ため時間が 段 × 15% 短くなる",
  },
  {
    key: "snipe",
    label: "狙撃",
    scope: "bow",
    max: 3,
    axis: "power",
    about: "遠いほど上がる（30 マスで 段 × 15%）",
  },
  {
    key: "close",
    label: "接射",
    scope: "bow",
    max: 3,
    axis: "power",
    about: "近いほど上がる（0 マスで 段 × 15%）",
  },
  {
    key: "light_archer",
    label: "光の射手",
    scope: "bow",
    max: 1,
    axis: "support",
    about: "味方に当たると回復する",
  },
  {
    key: "focus",
    label: "集中",
    scope: "bow",
    max: 3,
    axis: "charge",
    about: "1 秒より長く引けるようになり、伸ばすほど上がる（+0.5 秒ごとに 段 × 10%）",
  },
  {
    key: "pierce",
    label: "貫通",
    scope: "bow",
    max: 1,
    axis: "pierce",
    about: "もう 1 体貫く（2 体目は −30%）",
  },
  {
    key: "burst",
    label: "炸裂",
    scope: "bow",
    max: 3,
    axis: "explode",
    about: "当たった所で小さく爆発（与ダメの 段 × 12%・半径 2）",
  },
  {
    key: "chain",
    label: "連鎖",
    scope: "bow",
    max: 1,
    axis: "explode",
    about: "近くの敵へ 1 回跳ぶ（30%）",
  },
  {
    key: "pierce_magic",
    label: "貫魔",
    scope: "bow",
    max: 1,
    axis: "element",
    about: "属性が必ず 1 回、その場で起きる（蓄積を待たない）",
  },
  {
    key: "erode",
    label: "浸食",
    scope: "bow",
    max: 3,
    axis: "element",
    about: "属性の蓄積が 段 × 50% 増える",
  },
  {
    key: "reaper",
    label: "死神",
    scope: "bow",
    max: 3,
    axis: "power",
    about: "相手の HP が低いほど上がる（残り 0% で 段 × 17%）",
  },
  {
    key: "first_strike",
    label: "初撃",
    scope: "bow",
    max: 1,
    axis: "power",
    about: "まだ当てていない敵への 1 発目が +50%",
  },
  {
    key: "pack",
    label: "群狼",
    scope: "bow",
    max: 3,
    axis: "power",
    about: "近くの敵が多いほど上がる（1 体ごとに 段 × 3%・最大 +30%）",
  },
  {
    key: "lone",
    label: "孤高",
    scope: "bow",
    max: 2,
    axis: "power",
    about: "近くに味方が居ないと 段 × 12% 上がる",
  },
  {
    key: "link",
    label: "連携",
    scope: "bow",
    max: 2,
    axis: "power",
    about: "味方が最後に当てた敵へ 段 × 12% 上がる",
  },
  {
    key: "pursue",
    label: "追撃",
    scope: "bow",
    max: 3,
    axis: "power",
    about: "同じ敵に当て続けるほど上がる（1 回ごとに 段 × 2%・最大 段 × 10%）",
  },
  {
    key: "quick_nock",
    label: "矢継ぎ早",
    scope: "bow",
    max: 1,
    axis: "charge",
    about: "倒すと、次の 1 発はためきった扱いになる",
  },
];
