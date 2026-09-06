/**
 * 戦場 02「雲の上の浮島」——**島の形と材。純粋。**
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 *
 * > ### 島は「楕円 ＋ ゆっくりした揺らぎ」で決める
 * >
 * > **真円を 8 つ並べると、同じ形が 8 つ並ぶ**（0-6）。
 * > **半径・縦横比・縁の荒れ方・上面の反り**を、島ごとに変えてある。
 *
 * > ### 縁の外は奈落。**ただし雲の裾だけは踏める**
 * >
 * > **島の縁から 1 マス下がった所に、雲が広がっている**（`skirt`）。
 * > 見た目は白い雲、**歩けるので 0-8 の「行けない面」にならない。**
 */

import { GROUND, noise, speckle, wave } from "./map-frame.js";

/** 種。**変えれば島の並びごと変わる** */
export const SEED = 2400;

/**
 * **置いてよい端。**
 *
 * > ### なぜ 50 ではなく 45 なのか
 * >
 * > 0-4 の検査は、**20〜50 マスの各方角に「切れ目」**を求める。
 * > 45 より内に収めておけば、**47 マス目は必ず空**（座標を丸めても半径 46 を割らない）。
 * > **どの方角からも歩いて出られない**ことが、数で保証される。
 */
export const RIM = 45;

/** 島の性格。**表面の材がこれで決まる** */
export type Kind = "pave" | "moss" | "ice" | "bare" | "snow" | "cloud";

export interface Isle {
  readonly id: string;
  readonly cx: number;
  readonly cz: number;
  readonly kind: Kind;
  /** 底の尖り方。**大きい島ほど深く尖らせる** */
  readonly deep: number;
  /** 雲の裾の広さ（`t` の余り）。**0 なら裾なし** */
  readonly skirt: number;
  /** 縁までの隔たり。**ちょうど 1 が縁** */
  readonly edge: (dx: number, dz: number) => number;
  /** 上面の反り。**縁では 0 に戻すこと**——裾と 1 マスで繋がらなくなる */
  readonly lift: (t: number, dx: number, dz: number) => number;
  /** そこは島の外か。**門の島だけ z ＝ 40 で断つ**（裏へ回らせない。0-3） */
  readonly cut?: (x: number, z: number) => boolean;
}

/** 揺らいだ楕円。**波長を長く取って、縁を滑らかに荒らす** */
function blob(rx: number, rz: number, seed: number, wob: number): (dx: number, dz: number) => number {
  return (dx, dz) => Math.hypot(dx / rx, dz / rz) / (1 + wave(seed, dx, dz, 13) * wob);
}

/** 角のとれた四角。**楕円と併せて「舌」を出す**（門の島の参道） */
function tongue(hx: number, hz: number, oz: number): (dx: number, dz: number) => number {
  return (dx, dz) => Math.max(Math.abs(dx) / hx, Math.abs(dz - oz) / hz);
}

/** 2 つの形を足す */
function union(
  a: (dx: number, dz: number) => number,
  b: (dx: number, dz: number) => number
): (dx: number, dz: number) => number {
  return (dx, dz) => Math.min(a(dx, dz), b(dx, dz));
}

/**
 * 中央がふくらんだ上面。**縁で必ず 0 に戻る。**
 *
 * 傾きは 1 マスあたり 0.2 以下（半径 15〜19 に対して高さ 2〜3）——
 * **段差 1 マスの決まり（0-8）を、地形の段階で守る。**
 */
function dome(h: number, seed: number, rough: number): (t: number, dx: number, dz: number) => number {
  return (t, dx, dz) => Math.round((1 - Math.min(1, t)) * (h + wave(seed, dx, dz, 15) * rough));
}

/**
 * 8 つの島。**大きさ・縦横比・性格を全部ずらしてある**（0-6）。
 *
 * ```
 *                 門の島（神殿の残骸）        z ＝ +40
 *        南の島      止まり木   東奥の岩
 *   西の小島      主 島              氷の島    z ＝   0
 *      窪みの小島   発着の島   雲の小島         z ＝ −40
 * ```
 */
export const ISLES: readonly Isle[] = [
  {
    // **発着の島。** 湧く所を必ず含むよう、楕円に「舌」を足してある
    id: "launch",
    cx: 0,
    cz: -35,
    kind: "pave",
    deep: 13,
    skirt: 0.12,
    edge: union(blob(12, 8, SEED + 1, 0.11), tongue(6.5, 6.5, -3)),
    lift: () => 0,
  },
  {
    // **主島。** いちばん大きく、いちばん厚い。中央が 2 マス盛り上がる
    id: "main",
    cx: -3,
    cz: -6,
    kind: "moss",
    deep: 27,
    skirt: 0.18,
    edge: blob(15, 13, SEED + 3, 0.15),
    lift: dome(2.3, SEED + 21, 1.2),
  },
  {
    // **氷の島。** 縦長。氷柱が立つ
    id: "east",
    cx: 32,
    cz: 6,
    kind: "ice",
    deep: 19,
    skirt: 0.17,
    edge: blob(9, 11, SEED + 4, 0.16),
    lift: dome(2.6, SEED + 22, 1.0),
  },
  {
    // **西の小島。** 平たい。崩れた小屋がある
    id: "west",
    cx: -35,
    cz: -15,
    kind: "bare",
    deep: 13,
    skirt: 0.22,
    edge: blob(7, 6.5, SEED + 5, 0.15),
    lift: dome(1.4, SEED + 23, 0.9),
  },
  {
    // **南の島。** 雪に埋もれ、裾の雲がいちばん広い
    id: "south",
    cx: -27,
    cz: 24,
    kind: "snow",
    deep: 16,
    skirt: 0.24,
    edge: blob(8.5, 7.5, SEED + 6, 0.14),
    lift: dome(2.0, SEED + 24, 1.1),
  },
  {
    // **雲の小島。** 岩が無く、雲そのものを踏んで渡る
    id: "cloudlet",
    cx: 20,
    cz: -27,
    kind: "cloud",
    deep: 9,
    skirt: 0.28,
    edge: blob(7, 6, SEED + 7, 0.19),
    lift: dome(1.6, SEED + 25, 0.8),
  },
  {
    // **東奥の岩。** いちばん小さい。橋の中継ぎ
    id: "spur",
    cx: 26,
    cz: 26,
    kind: "bare",
    deep: 11,
    skirt: 0.2,
    edge: blob(5.5, 5, SEED + 8, 0.18),
    lift: dome(1.8, SEED + 26, 0.9),
  },
  {
    // **窪みの小島。** 発着と西を結ぶ寄り道。苔だけの小さな緑
    id: "hollow",
    cx: -24,
    cz: -30,
    kind: "moss",
    deep: 10,
    skirt: 0.26,
    edge: blob(6.5, 5.5, SEED + 9, 0.2),
    lift: dome(1.4, SEED + 27, 0.7),
  },
  {
    // **止まり木。** 門へ向かう east 側のもう 1 本の道。石だけの小島
    id: "perch",
    cx: 13,
    cz: 17,
    kind: "pave",
    deep: 12,
    skirt: 0.2,
    edge: blob(5.5, 5, SEED + 10, 0.18),
    lift: dome(1.6, SEED + 28, 0.9),
  },
  {
    // **門の島。** 参道の舌を伸ばし、z ＝ 40 でぷつりと切る——**門の裏は無い**
    id: "gate",
    cx: 0,
    cz: 32,
    kind: "pave",
    deep: 21,
    skirt: 0.14,
    edge: union(blob(12, 7.5, SEED + 2, 0.1), tongue(7.5, 7, 2.5)),
    lift: (t, _dx, dz) => (dz < -2 && t > 0.62 && t < 0.88 ? 1 : 0),
    cut: (_x, z) => z > 40,
  },
];

/** その 1 マスが、どの島のどこか */
export interface Ground {
  readonly x: number;
  readonly z: number;
  readonly isle: Isle;
  /** 縁からの隔たり。**1 以下が島、超えた分が雲の裾** */
  readonly t: number;
}

export type Field = ReadonlyMap<string, Ground>;

export function key(x: number, z: number): string {
  return `${x},${z}`;
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * 盤面を 1 マスずつ引いて、島の地図を作る。
 *
 * **縁の揺らぎで飛び離れた 1 マスが残ると、0-5（塊が 2 つ以上）に落ちる。**
 * だから**島の中心から塗り広げて、繋がっている所だけを残す。**
 */
export function fieldOf(): Field {
  const raw = new Map<string, Ground>();
  for (let x = -RIM; x <= RIM; x++) {
    for (let z = -RIM; z <= RIM; z++) {
      if (Math.hypot(x, z) > RIM) continue;
      let best: Ground | undefined;
      for (const isle of ISLES) {
        if (isle.cut?.(x, z) === true) continue;
        const t = isle.edge(x - isle.cx, z - isle.cz);
        if (t > 1 + isle.skirt) continue;
        if (best === undefined || t < best.t) best = { x, z, isle, t };
      }
      if (best !== undefined) raw.set(key(x, z), best);
    }
  }
  const out = new Map<string, Ground>();
  for (const isle of ISLES) keep(raw, out, isle);
  return out;
}

/** 島 1 つぶんを、中心から塗り広げて写す */
function keep(raw: Map<string, Ground>, out: Map<string, Ground>, isle: Isle): void {
  const start = key(Math.round(isle.cx), Math.round(isle.cz));
  const head = raw.get(start);
  if (head === undefined) return;
  const queue: Ground[] = [head];
  out.set(start, head);
  while (queue.length > 0) {
    const g = queue.pop();
    if (g === undefined) break;
    for (const [dx, dz] of STEPS) {
      const k = key(g.x + dx, g.z + dz);
      if (out.has(k)) continue;
      const n = raw.get(k);
      if (n === undefined || n.isle !== isle) continue;
      out.set(k, n);
      queue.push(n);
    }
  }
}

/** そこの天面。**裾は 1 段・2 段と下がる**（1 マスずつなので登り返せる） */
export function surfaceY(g: Ground): number {
  if (g.t <= 1) return GROUND + g.isle.lift(g.t, g.x - g.isle.cx, g.z - g.isle.cz);
  const d = (g.t - 1) / Math.max(0.01, g.isle.skirt);
  return GROUND - (d <= 0.5 ? 1 : 2);
}

/** そこの底。**中央ほど深く尖り、縁で薄くなる** */
export function bottomY(g: Ground): number {
  const top = surfaceY(g);
  // **裾は雲なので薄い**——厚いと島の輪郭がぼやける
  if (g.t > 1) return top - (2 + Math.round(noise(SEED + 7, g.x, g.z) * 2));
  const core = (1 - Math.min(1, g.t) ** 1.7) ** 1.25;
  const rough = wave(SEED + 31, g.x, g.z, 12) * 2.4;
  return top - Math.max(3, Math.round(3 + g.isle.deep * core + rough));
}
