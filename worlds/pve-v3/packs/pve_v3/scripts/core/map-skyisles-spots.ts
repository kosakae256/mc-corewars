/**
 * 戦場 02「雲の上の浮島」——**決まった場所と、小島の意匠。純粋。**
 *
 * 湧く所（発着の島）と門の島は、**20 マップで座標が同じ**（0-1）。
 * **地形を作り直しても、ここは動かさない。**
 */

import { circlePoints, fill, set, type BuildOp } from "./build.js";
import { GATE_Z, GROUND, noise, speckle, wave } from "./map-frame.js";
import { RIM, SEED, key, type Field } from "./map-skyisles-shape.js";
import { hasTop, level, stand, topOf } from "./map-skyisles-terrain.js";

const BRICK = ["stone_bricks", "cracked_stone_bricks", "mossy_stone_bricks", "chiseled_stone_bricks", "andesite"];
const PALE = ["quartz_block", "smooth_quartz", "calcite", "stone_bricks", "quartz_bricks"];

/** 発着の島——**低い欄干・円の意匠・灯柱**。湧いた人が最初に見る所 */
export function launchIsle(ops: BuildOp[], field: Field, tops: Map<string, number>): void {
  // ---- 縁の欄干。**高さ 1** なので踏み越えられる（0-8）。橋の出口は空ける
  for (const g of field.values()) {
    if (g.isle.id !== "launch" || g.t < 0.85 || g.t > 0.99) continue;
    if (Math.abs(g.x) <= 3 && g.z > -30) continue;
    if (noise(SEED + 301, g.x, g.z) < 0.3) continue;
    const rail = speckle(SEED + 303, g.x, g.z, ["stone_brick_wall", "cobblestone_wall"]);
    ops.push(set(g.x, topOf(tops, g.x, g.z) + 1, g.z, rail));
  }
  // ---- 足元の意匠。**2 重の輪**。平らなので視線も進路も塞がない（0-3）
  for (const [r, mats] of [
    [5, ["polished_diorite", "chiseled_stone_bricks", "stone_bricks"]],
    [8, ["andesite", "cobblestone", "stone_bricks", "polished_andesite"]],
  ] as const) {
    for (const p of circlePoints(-38, r)) {
      if (!hasTop(tops, p.x, p.z)) continue;
      ops.push(set(p.x, topOf(tops, p.x, p.z), p.z, speckle(SEED + 305 + r, p.x, p.z, mats)));
    }
  }
  // ---- 湧く所を囲む 1 段の壇。**1 マスなので敵も上がれる**（0-8）
  for (const g of field.values()) {
    if (g.isle.id !== "launch" || g.t > 0.62 || g.t < 0.34) continue;
    if (Math.abs(g.x) <= 3 && g.z > -34) continue;
    ops.push(set(g.x, topOf(tops, g.x, g.z) + 1, g.z, speckle(SEED + 307, g.x, g.z, ["stone_bricks", "andesite"])));
  }
  // ---- 灯柱 4 本と、焚き火 2 つ。**焚き火は湧く 1 マスを外して置く**（0-2）
  for (const [x, z] of [
    [-7, -40],
    [7, -40],
    [-7, -31],
    [7, -31],
  ] as const) {
    stand(ops, tops, x, z, 3, ["chiseled_stone_bricks", "stone_bricks"], "lantern");
  }
  for (const x of [-4, 4]) if (hasTop(tops, x, -39)) ops.push(set(x, topOf(tops, x, -39) + 1, -39, "campfire"));
}

/** 西の小島——**焼け落ちた小屋。土台と、折れた柱 3 本だけが残っている** */
export function westIsle(ops: BuildOp[], tops: Map<string, number>): void {
  const cx = -35;
  const cz = -15;
  const base = topOf(tops, cx, cz);
  for (let x = cx - 3; x <= cx + 3; x++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      if (!hasTop(tops, x, z)) continue;
      level(
        ops,
        tops,
        x,
        z,
        base,
        speckle(SEED + 311, x, z, ["spruce_planks", "cobblestone", "andesite", "cobblestone"])
      );
      const wall = Math.abs(x - cx) === 3 || Math.abs(z - cz) === 2;
      // **土台だけ残す**（高さ 1）。虫食いにして崩れた形にする
      if (wall && noise(SEED + 313, x, z) > 0.3) {
        ops.push(set(x, base + 1, z, speckle(SEED + 315, x, z, ["cobblestone", "mossy_cobblestone", "andesite"])));
      }
    }
  }
  for (const [x, z] of [
    [cx - 3, cz - 2],
    [cx + 3, cz - 2],
    [cx - 3, cz + 2],
  ] as const) {
    stand(ops, tops, x, z, 3, ["spruce_log", "cobblestone", "mossy_cobblestone"]);
  }
  if (hasTop(tops, cx, cz)) ops.push(set(cx, base + 1, cz, "campfire"));
  for (let z = cz - 4; z <= cz + 4; z++) {
    if (noise(SEED + 317, cx - 5, z) < 0.45 || !hasTop(tops, cx - 5, z)) continue;
    ops.push(set(cx - 5, topOf(tops, cx - 5, z) + 1, z, "spruce_fence"));
  }
}

/** 南の島——**雪の吹きだまりと、途中で折れた橋** */
export function southIsle(ops: BuildOp[], tops: Map<string, number>): void {
  for (const [cx, cz, r] of [
    [-31, 20, 3],
    [-24, 27, 4],
    [-29, 29, 2],
  ] as const) {
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        if (Math.hypot(x - cx, z - cz) > r - noise(SEED + 321, x, z) || !hasTop(tops, x, z)) continue;
        ops.push(set(x, topOf(tops, x, z) + 1, z, speckle(SEED + 323, x, z, ["snow", "snow", "calcite"])));
      }
    }
  }
  stand(ops, tops, -32, 26, 3, ["cobblestone", "andesite", "stone"], "lantern");
  broken(ops, tops);
}

/**
 * 途中で折れた橋。
 *
 * **奈落へ向かって伸び、ぷつりと終わる。**
 * 渡れないが、**ここが「かつて繋がっていた」ことを見せる**——
 * 島が点在するだけでは、遺跡に見えない。
 */
function broken(ops: BuildOp[], tops: Map<string, number>): void {
  const done = new Set<string>();
  for (let w = -1; w <= 1; w++) {
    // **列ごとに、折れる所を変える。** まばらに抜くと破片が浮く（0-5）
    const far = 8 + Math.round(noise(SEED + 331, w, 0) * 5);
    // **刻みを細かく取る。** 1 マスずつ進めると斜めに飛び、繋がりが切れる（0-5）
    for (let i = 0; i <= far * 4; i++) {
      const d = i / 4;
      const x = Math.round(-24 + d * 0.84 - w * 0.54);
      const z = Math.round(29 + d * 0.54 + w * 0.84);
      const k = key(x, z);
      if (done.has(k) || Math.hypot(x, z) > RIM || hasTop(tops, x, z)) continue;
      done.add(k);
      ops.push(set(x, GROUND, z, speckle(SEED + 333, x, z, ["stone_bricks", "cracked_stone_bricks", "calcite"])));
      ops.push(fill(x, GROUND - 1 - Math.round((far - d) / 3), z, x, GROUND - 1, z, "stone"));
      tops.set(k, GROUND);
    }
  }
}

/**
 * 東奥の岩——**崩れた見張り塔。**
 *
 * **段の丘を 1 段ずつ積み**（0-8。敵も登る）、
 * **てっぺんの縁に高さ 1 の崩れ壁**を回し、**折れた柱を 3 本**だけ高く残す。
 * 1 本きりの柱は**歩いて回り込める**ので、登れなくてよい。
 */
export function spurIsle(ops: BuildOp[], tops: Map<string, number>): void {
  const cx = 26;
  const cz = 26;
  const base = topOf(tops, cx, cz);
  for (let step = 0; step <= 3; step++) {
    const r = 4 - step;
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        if (Math.hypot(x - cx, z - cz) > r + 0.4 || !hasTop(tops, x, z)) continue;
        level(ops, tops, x, z, base + step, speckle(SEED + 341, x, z, BRICK));
      }
    }
  }
  // **崩れ壁は高さ 1。** 立てたままにすると、頂が「行けない面」になる（0-8）
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let z = cz - 1; z <= cz + 1; z++) {
      if ((x === cx && z === cz) || noise(SEED + 343, x, z) < 0.25 || !hasTop(tops, x, z)) continue;
      ops.push(set(x, base + 4, z, speckle(SEED + 345, x, z, ["cracked_stone_bricks", "mossy_stone_bricks"])));
    }
  }
  for (const [dx, dz, h] of [
    [-1, -1, 4],
    [1, 1, 2],
    [1, -2, 5],
  ] as const) {
    stand(ops, tops, cx + dx, cz + dz, h, ["stone_bricks", "cracked_stone_bricks", "chiseled_stone_bricks"]);
  }
  stand(ops, tops, cx, cz, 1, ["chiseled_stone_bricks"], "lantern");
}

/** 雲の小島——**道標を 1 本だけ。** 雲そのものを踏んで渡る */
export function cloudIsle(ops: BuildOp[], tops: Map<string, number>): void {
  stand(ops, tops, 20, -27, 4, ["quartz_pillar", "quartz_block", "smooth_quartz"], "lantern");
  stand(ops, tops, 17, -23, 2, ["calcite", "quartz_block"]);
  stand(ops, tops, 23, -30, 2, ["calcite", "smooth_quartz"]);
}

/**
 * 小さな 2 島——**窪みの小島（苔）と、止まり木（石）。**
 *
 * **寄り道の島。** 大きな造作は置かず、**目印だけ**にする——
 * ここに物を詰めると、島が「点在している」感じが消える。
 */
export function smallIsles(ops: BuildOp[], tops: Map<string, number>): void {
  // ---- 窪みの小島。**立石 2 本と、転がった石**
  stand(ops, tops, -26, -28, 3, ["andesite", "mossy_cobblestone", "tuff"]);
  stand(ops, tops, -22, -33, 2, ["cobblestone", "andesite"]);
  for (const [x, z] of [
    [-21, -28],
    [-20, -29],
    [-25, -33],
  ] as const) {
    if (hasTop(tops, x, z)) ops.push(set(x, topOf(tops, x, z) + 1, z, "mossy_cobblestone"));
  }

  // ---- 止まり木。**1 段の見張り台と、灯り**
  const base = topOf(tops, 13, 17);
  for (let x = 11; x <= 15; x++) {
    for (let z = 15; z <= 19; z++) {
      if (Math.abs(x - 13) + Math.abs(z - 17) > 3 || !hasTop(tops, x, z)) continue;
      level(ops, tops, x, z, base + 1, speckle(SEED + 381, x, z, BRICK));
    }
  }
  stand(ops, tops, 13, 17, 3, ["chiseled_stone_bricks", "stone_bricks"], "lantern");
  stand(ops, tops, 15, 19, 2, ["cracked_stone_bricks", "stone_bricks"]);
}

/**
 * 門の島——**参道の列柱と、正面の壁。**
 *
 * > ### 門の裏へは回れない（0-3）
 * >
 * > **島は z ＝ 40 で切ってある**（`map-skyisles-shape.ts` の `cut`）。
 * > その最後の 1 列に**壁を立てる**ので、**門の向こうは壁と奈落しかない。**
 *
 * > ### 壁は |x| ≤ 6 に収める
 * >
 * > 0-8 の検査は**門の前（|x| ≤ 6、z ≥ 39）だけ**「登れなくてよい」と見る。
 * > **はみ出した壁は「行けない面」として落ちる。**
 */
export function gateIsle(ops: BuildOp[], tops: Map<string, number>): void {
  for (const [x, z, h] of [
    [-9, 28, 4],
    [-9, 31, 5],
    [-9, 34, 3],
    [9, 34, 4],
    [-5, 30, 5],
    [5, 30, 4],
    [-5, 33, 2],
    [5, 33, 5],
    [-5, 36, 4],
    [5, 36, 3],
  ] as const) {
    stand(ops, tops, x, z, h, BRICK, h >= 4 ? "lantern" : undefined);
  }
  // ---- 参道の敷石。**平らなので視線を塞がない**（0-3）
  for (let z = 26; z <= 39; z++) {
    for (let x = -3; x <= 3; x++) {
      if (!hasTop(tops, x, z)) continue;
      const mats = Math.abs(x) === 3 ? ["andesite", "cobblestone", "stone"] : PALE;
      ops.push(set(x, topOf(tops, x, z), z, speckle(SEED + 351, x, z, mats)));
    }
  }
  facade(ops, tops);
}

/** 正面の壁。**帯・付け柱・狭間**で、平らな一枚壁にしない（0-4） */
function facade(ops: BuildOp[], tops: Map<string, number>): void {
  const z = GATE_Z + 1;
  for (let x = -6; x <= 6; x++) {
    if (!hasTop(tops, x, z)) continue;
    const y0 = topOf(tops, x, z);
    const pilaster = Math.abs(x) === 3 || Math.abs(x) === 6;
    const high = 5 + (pilaster ? 2 : 0) + (Math.abs(x) <= 1 ? 1 : 0);
    for (let i = 1; i <= high; i++) {
      const v = noise(SEED + 361, x, i);
      const mat = pilaster
        ? i % 3 === 0
          ? "chiseled_stone_bricks"
          : "stone_bricks"
        : i === 4
          ? "chiseled_stone_bricks"
          : v > 0.72
            ? "mossy_stone_bricks"
            : v > 0.4
              ? "stone_bricks"
              : "cracked_stone_bricks";
      ops.push(set(x, y0 + i, z, mat));
    }
    // **狭間。** 1 マスおきに立てて、上端を割る
    if (x % 2 === 0) ops.push(set(x, y0 + high + 1, z, "cobblestone_wall"));
  }
  // 門の脇の燭台。**箱（|x| ≤ 1）には触らない**（0-2-1）
  for (const x of [-3, 3]) if (hasTop(tops, x, GATE_Z)) ops.push(set(x, GROUND + 4, GATE_Z, "lantern"));
}

/** 散らしもの。**一様に撒かない**——湿った側・雪の寄りに寄せる（0-7） */
export function litter(ops: BuildOp[], field: Field, tops: Map<string, number>, paved: ReadonlySet<string>): void {
  for (const g of field.values()) {
    // **橋と道の上には載せない**——舗装した所に草が生えていると、道に見えない
    if (g.t > 1 || paved.has(key(g.x, g.z))) continue;
    const r = noise(SEED + 371, g.x, g.z);
    if (r > 0.055) continue;
    const y = topOf(tops, g.x, g.z) + 1;
    const wet = wave(SEED + 373, g.x, g.z, 14);
    const kind = g.isle.kind;
    if (kind === "ice" || kind === "snow" || kind === "cloud") {
      ops.push(set(g.x, y, g.z, r > 0.03 ? "snow_layer" : "calcite"));
      continue;
    }
    if (wet > 0.15) ops.push(set(g.x, y, g.z, r > 0.032 ? "short_grass" : "moss_carpet"));
    else ops.push(set(g.x, y, g.z, speckle(SEED + 375, g.x, g.z, ["cobblestone", "andesite", "cobblestone"])));
  }
}
