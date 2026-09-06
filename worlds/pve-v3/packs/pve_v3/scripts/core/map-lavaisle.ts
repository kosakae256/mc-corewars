/**
 * 3. 溶岩の島——**溶岩の海に浮かぶ黒い岩。橋で繋ぐ。落ちたら溶岩＝死。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 3 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **溶岩の海そのものが、盤の外周。**
 * >
 * > 冷えて固まった黒い岩が、赤い海に**大小 9 つ**浮かんでいる。
 * > **島ごとに性格が違う**——深緑がかった深層岩の板、ネザーラックの赤い丘、
 * > 折れた黒曜石、噴き出し口。**手前と奥だけが人の手の入った黒石**で、
 * > 湧く所から門まで、**縁のマグマが光る土手**が真っ直ぐ通っている。
 * >
 * > 島には**冷えた溶岩流の筋**（＋1）が走り、**割れ目**（−1）から下の赤が覗く。
 * > **どちらも段差 1 マス**なので、敵も歩いて越えてくる（0-8）。
 * >
 * > **海の外は奈落。** 壁は無い——**落ちれば溶岩、その先は何も無い。**
 *
 * ## 組む順
 *
 * ```
 * clearBox    まず全部消す
 * ground      海と島（1 マスごとに材を引く）
 * vents       噴き出し口と、そこから走る筋（＋1）
 * cracks      割れ目（−1）。**筋の隣は避ける**——足すと段差 2 になる
 * groves      島の上の柱（1 マス角。**掘った所には立てない**）
 * reefs       海に立つ岩と、沈みかけの板
 * spans       橋 12 本と、溶岩の中に立つ橋脚の塔 6 本
 * gateFront   門構えと、その裏を塞ぐ壁
 * spawnPad    湧く所の足場（**地形に消させないので、地形の後**）
 * spawnDeck   湧く所の飾り（足場の外側だけ）
 * openGate    ゲートの箱を空ける（**最後**）
 * ```
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, HALF, noise, openGate, spawnPad, speckle } from "./map-frame.js";
import { cracks, reefs, vents } from "./map-lavaisle-flow.js";
import { gateFront, spawnDeck } from "./map-lavaisle-gate.js";
import { groves } from "./map-lavaisle-grove.js";
import { landAt, landBottom, landSurface, rimAt, seaAt, seaBottom, SEA_TOP, SEED } from "./map-lavaisle-land.js";
import { spans } from "./map-lavaisle-span.js";

/** 島の中身。**表に出るのは縁と、割れ目の底だけ** */
const CORE = ["blackstone", "deepslate", "basalt", "obsidian", "smooth_basalt"];

/** 海の底。**奈落から見上げたときの顔** */
const CRUST = ["obsidian", "blackstone", "basalt", "smooth_basalt", "deepslate", "obsidian"];

/** 海の縁の、冷えた殻。**溶岩に近いほど焼けた色が混じる** */
const RIM = ["obsidian", "blackstone", "basalt", "smooth_basalt", "black_concrete", "magma"];

/**
 * 海と島を積む。
 *
 * **柱 1 本を 2 手で済ませる**——中身をひと塗りしてから、天面だけ差し替える。
 * 1 マスずつ置くと、手順が 3 倍に膨らむ。
 */
function ground(ops: BuildOp[]): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      const land = landAt(x, z);
      if (land !== undefined) {
        ops.push(fill(x, landBottom(land.t), z, x, land.top - 1, z, speckle(SEED + 3, x, z, CORE)));
        ops.push(set(x, land.top, z, landSurface(land, x, z)));
        continue;
      }
      if (!seaAt(x, z)) continue;
      // **海は 1 マスだけ溶岩**。その下は冷えた殻——**溶岩の板が浮いて見えないように**
      ops.push(fill(x, seaBottom(x, z), z, x, SEA_TOP - 1, z, speckle(SEED + 4, x, z, CRUST)));
      const rim = rimAt(x, z);
      if (rim <= 0) {
        ops.push(set(x, SEA_TOP, z, "lava"));
        continue;
      }
      // **縁は冷えて黒い殻になる。** 外へ行くほど高く、天端は 1 マスずつ欠けさせる
      const up = rim > 0.42 || noise(SEED + 8, x, z) > 0.78 ? 1 : 0;
      ops.push(fill(x, SEA_TOP, z, x, SEA_TOP + up, z, speckle(SEED + 9, x, z, RIM)));
    }
  }
}

/** 組み立ての手順 */
export function lavaisleOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  ground(ops);

  // **掘った所を覚えておく**——割れ目どうし、割れ目と焼け縁がぶつからないように
  const cut = new Set<string>();
  const ridged = vents(ops, cut);
  cracks(ops, cut, ridged);
  groves(ops, cut);
  reefs(ops);
  spans(ops);
  gateFront(ops);

  // **足場は地形の後**（0-2）。**`gateBack` は使わない**——
  // 門の裏は `gateFront` が、この島の意匠で塞いでいる
  spawnPad(ops, "polished_blackstone_bricks", 4);
  spawnDeck(ops);
  openGate(ops);
  return ops;
}
