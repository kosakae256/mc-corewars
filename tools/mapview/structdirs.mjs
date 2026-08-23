import { join } from "node:path";

/**
 * 構造物の配り先。
 *
 * **アドオンに同梱するのが本命。**
 * ワールドフォルダに置く方式だと、遊ぶワールドが変わるたびに配り直しになる。
 * ビヘイビアーパックに入れておけば、**パックを有効にしたどのワールドでも読める**
 * （`leveler` が `leveler:empty` で実証済み）。
 */
export const STRUCT_DIRS = (here) => [
  // **アドオン同梱。これが本物。** ここに置いたものが実際に配布される
  join(here, "..", "..", "worlds", "core-wars", "packs", "kit", "behavior_packs", "kit", "structures", "corewars"),
  // BDS のワールド（使うときのため）
  "C:/MinecraftServer/1.26.44.3/worlds/flatworld/structures/corewars",
  "C:/MinecraftServer/1.26.44.3/worlds/devworld/structures/corewars",
];
