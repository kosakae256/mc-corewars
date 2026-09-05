/**
 * 進捗。**ロビーの板に出す。純粋。**
 *
 * 中身は `worlds/pve-v3/docs/05-progress.md`。**直したら、あちらも直す。**
 *
 * > ### いま集中する 6 つ
 * >
 * > **マップ・職業・エンチャント・敵・デザイン・システム。**
 * > **初回解放まで**の目安。
 */

/** 1 つぶん */
export interface Area {
  readonly name: string;
  /** 0〜100 */
  readonly percent: number;
  /** 板の下に添える一言 */
  readonly note: string;
}

/** ゲージの長さ（本） */
export const WIDTH = 20;

/**
 * いまの進み具合（`05-progress.md` 1 章）。
 *
 * **直したらドキュメントも直すこと。**
 */
export const AREAS: readonly Area[] = [
  { name: "マップ", percent: 5, note: "20 マップ中 1（下地のみ）" },
  { name: "職業", percent: 5, note: "弓 6 ロール／左クリック未実装" },
  { name: "エンチャント", percent: 15, note: "モーション強化。仕組みだけ／中身 0" },
  { name: "敵", percent: 25, note: "6 種／★2・4・5・6 が仮置き" },
  { name: "デザイン", percent: 15, note: "飛竜・ゲート・台だけ" },
  { name: "システム", percent: 80, note: "進行は一通り回る" },
];

/** 全部ならしたときの % */
export function overall(): number {
  if (AREAS.length === 0) return 0;
  let sum = 0;
  for (const a of AREAS) sum += a.percent;
  return Math.round(sum / AREAS.length);
}

/** 進み具合の色。**進むほど緑に寄る** */
export function color(percent: number): string {
  if (percent >= 80) return "§a";
  if (percent >= 50) return "§e";
  if (percent >= 25) return "§6";
  if (percent > 0) return "§c";
  return "§4";
}

/**
 * ゲージ。**`|` を並べる。**
 *
 * **長さは固定**（`WIDTH`）——伸び縮みすると、板が崩れる。
 */
export function gauge(percent: number): string {
  const on = Math.max(0, Math.min(WIDTH, Math.round((percent / 100) * WIDTH)));
  return `${color(percent)}${"|".repeat(on)}§8${"|".repeat(WIDTH - on)}`;
}

/** 名前を決まった幅にそろえる（全角の空白で埋める） */
export function pad(name: string, width = 7): string {
  return name.length >= width ? name : name + "　".repeat(width - name.length);
}

/** 板に出す中身 */
export function boardText(): string {
  const lines = ["§6§l進捗 §7— 初回解放まで", `§7ぜんぶで ${color(overall())}${overall()}%`, ""];
  for (const a of AREAS) {
    lines.push(`§f${pad(a.name)} ${gauge(a.percent)} ${color(a.percent)}${String(a.percent).padStart(3)}%`);
    lines.push(`§8      ${a.note}`);
  }
  return lines.join("\n");
}
