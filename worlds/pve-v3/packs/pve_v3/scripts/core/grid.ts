/**
 * **正方形を等分する。** 純粋。**何も import しない。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 2 章。
 *
 * > ### なぜ切り出したか
 * >
 * > **割り方を変えると、隙間や重なりが出ていないか目で確かめられない。**
 * > **`@minecraft/server` に触れない形にして、テストで固める。**
 */

/**
 * **−half 〜 +half を grid 等分した区切り。**
 *
 * **端まで使い切る**ので、幅は割り切れない分だけ 1 マスずれる
 * （101 を 4 等分 → 26・25・25・25）。
 */
export function spansOf(half: number, grid: number): readonly (readonly [number, number])[] {
  const width = half * 2 + 1;
  const edge = (k: number): number => -half + Math.floor((width * k) / grid);
  const out: (readonly [number, number])[] = [];
  for (let k = 0; k < grid; k++) out.push([edge(k), edge(k + 1) - 1]);
  return out;
}
