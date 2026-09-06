/**
 * 戦場の一覧。**id → 組み立ての手順。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章（採用した 17）。
 * 組み立て方は `spec/14-map-build.md`。
 *
 * ```
 * /pve:mapdraft <id> ok            ゲームの中に組む
 * node tools/pve3-map-view.mjs <id>  絵にして見る
 * ```
 *
 * > ### **足すときは、ここに 1 行**
 * >
 * > コマンドも道具も、この表を読む。**書き忘れが起きない。**
 */

import type { BuildOp } from "./build.js";
import { basinOps } from "./map-basin.js";
import { cloudseaOps } from "./map-cloudsea.js";
import { skyislesOps } from "./map-skyisles.js";
import { lavaisleOps } from "./map-lavaisle.js";
import { ruinvillOps } from "./map-ruinvill.js";
import { courtyardOps } from "./map-courtyard.js";
import { netherspanOps } from "./map-netherspan.js";
import { aqueductOps } from "./map-aqueduct.js";
import { altarOps } from "./map-altar.js";
import { fortressOps } from "./map-fortress.js";
import { strongholdOps } from "./map-stronghold.js";
import { craterOps } from "./map-crater.js";
import { crevasseOps } from "./map-crevasse.js";
import { arenaOps } from "./map-arena.js";
import { cryptOps } from "./map-crypt.js";
import { libraryOps } from "./map-library.js";
import { sanctumOps } from "./map-sanctum.js";

/** 1 枚ぶん */
export interface MapDef {
  /** 画面に出す名前 */
  readonly name: string;
  /** `02-map.md` 5 章の番号 */
  readonly no: number;
  readonly ops: () => BuildOp[];
  /**
   * **満たさないことにした決まり**（`14-map-build.md` 0-10）。
   *
   * **企画に書いてあるものだけ。**「検査が通らないから免除」は禁止。
   */
  readonly waive?: readonly string[];
}

/** 組めるマップ。**番号の順** */
// > ### 没にしたものは載せない（2026-09-06）
// >
// > **`mansion`（森の洋館）は組んでみて没**（`02-map.md` 5-0-1-1）。
// > **生成器のファイルは残してある**が、ここに載せないので出てこない。
export const MAPS: Readonly<Record<string, MapDef>> = {
  basin: { name: "宙の窪地", no: 1, ops: basinOps },
  skyisles: { name: "雲の上の浮島", no: 2, ops: skyislesOps },
  lavaisle: { name: "溶岩の島", no: 3, ops: lavaisleOps },
  ruinvill: { name: "廃村", no: 4, ops: ruinvillOps },
  courtyard: { name: "城の中庭", no: 5, ops: courtyardOps },
  netherspan: { name: "深淵の橋", no: 6, ops: netherspanOps },
  aqueduct: { name: "地下水路", no: 7, ops: aqueductOps },
  altar: { name: "黒曜石の祭壇", no: 8, ops: altarOps },
  fortress: { name: "ネザー要塞", no: 9, ops: fortressOps },
  stronghold: { name: "石の要塞", no: 10, ops: strongholdOps },
  crater: { name: "隕石孔", no: 12, ops: craterOps },
  crevasse: { name: "氷河の裂け目", no: 13, ops: crevasseOps },
  // **段差の上り下りができないのが指定**（`02-map.md` 5-0-3）
  arena: { name: "円形闘技場", no: 14, ops: arenaOps, waive: ["0-8"] },
  crypt: { name: "地下墓所", no: 15, ops: cryptOps },
  library: { name: "大書庫", no: 16, ops: libraryOps },
  sanctum: { name: "白の神殿", no: 17, ops: sanctumOps },
  // **歩いて渡れないのが狙い**（`02-map.md` 5-0-2）
  cloudsea: { name: "雲海", no: 18, ops: cloudseaOps, waive: ["0-5", "0-8"] },
};

/** 番号の順に並べた id */
export function mapIds(): readonly string[] {
  return Object.keys(MAPS).sort((a, b) => (MAPS[a]?.no ?? 0) - (MAPS[b]?.no ?? 0));
}
