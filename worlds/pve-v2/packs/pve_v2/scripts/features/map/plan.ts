/**
 * マップの設計図。**どこに何を置くかを、ここで決める。**
 *
 * 仕様は `docs/02-map.md`（**建てる前に、あちらを直す**）。
 *
 * ## ここは「置き方」を知らない
 *
 * **戻すのは命令の一覧だけ**（箱を埋める・1 マス置く）。
 * **実際に置くのは `index.ts`**——1 tick に少しずつ消化する。
 *
 * ## 座標（`docs/02-map.md` 2 章）
 *
 * | 軸 | 向き |
 * | --- | --- |
 * | **X** | 左右（城壁に沿う）。−60 〜 +60 |
 * | **Y** | 高さ。地面が 0 |
 * | **Z** | **＋が街、−が戦場** |
 */

/** ブロックの状態（階段の向きなど）。**渡さなければ既定の姿** */
export type States = Readonly<Record<string, string | number | boolean>>;

/** 1 マス置く */
export interface SetOp {
  readonly kind: "set";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly block: string;
  readonly states?: States;
}

/** 箱を埋める（**両端を含む**） */
export interface FillOp {
  readonly kind: "fill";
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
  readonly block: string;
  readonly states?: States;
}

export type Op = SetOp | FillOp;

/**
 * 種を固定した乱数。**建て直しても同じ街になる。**
 *
 * `Math.random` だと**建て直すたびに違う街**になり、
 * **「さっきの形が良かった」が再現できない。**
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 寸法

const HALF_W = 60; // 左右の広さ（±）
const FIELD = 56; // 戦場の奥行き（−Z）
const TOWN = 80; // 街の奥行き（＋Z）

const WALL_H = 12; // 城壁の高さ
const WALL_T = 4; // 城壁の厚み
const GATE_W = 8; // 門の幅
const GATE_H = 10; // 門の高さ
const TOWER_R = 6; // 塔の半径（**5 だと角柱に見えた**）
const TOWER_H = 20; // 塔の高さ
const TOWER_X = 10; // 塔の中心（門から左右へ）

const MOAT_Z = -8; // 堀の中心
const MOAT_W = 6; // 堀の幅
const MOAT_D = 3; // 堀の深さ

/**
 * 階段の向き（Bedrock の `weirdo_direction`）。
 *
 * **0 東 / 1 西 / 2 南 / 3 北。**
 * 屋根は前後で逆を向く。**逆に見えたら `ROOF_FLIP` を反転**——1 か所で直る。
 */
const ROOF_FLIP = false;
const DIR_FRONT = ROOF_FLIP ? 2 : 3;
const DIR_BACK = ROOF_FLIP ? 3 : 2;

function stair(dir: number): States {
  return { weirdo_direction: dir, upside_down_bit: false };
}

/** 城壁の石。**混ぜる**（下ほど苔むす） */
function wallStone(r: () => number, y: number): string {
  const v = r();
  if (y <= 3 && v < 0.28) return "mossy_stone_bricks";
  if (v < 0.68) return "stone_bricks";
  if (v < 0.82) return "cracked_stone_bricks";
  if (v < 0.9) return "mossy_stone_bricks";
  return "cobblestone";
}

/** 屋根の色 */
const ROOFS = ["deepslate_brick_stairs", "dark_oak_stairs", "stone_brick_stairs"] as const;

/**
 * 設計図を組む。**返すのは命令の一覧だけ。**
 *
 * **順番に意味がある**——地面 → 掘る → 道 → 生やす → 建てる。
 */
export function plan(): Op[] {
  const r = rng(20260831);
  const ops: Op[] = [];

  const fill: Fill = (x1, y1, z1, x2, y2, z2, block, states) => {
    ops.push({ kind: "fill", x1, y1, z1, x2, y2, z2, block, states });
  };
  const set: Set_ = (x, y, z, block, states) => {
    ops.push({ kind: "set", x, y, z, block, states });
  };

  ground(fill, set, r);
  moat(fill);
  trail(set, r);
  const rocks = scatterRocks(set, r);
  flora(set, r);
  trees(set, r, rocks);
  wall(fill, set, r);
  towers(fill, set, r);
  gate(fill, set, r);
  town(fill, set, r);
  lights(set);

  return ops;
}

// ---------------------------------------------------------------- 地形

/**
 * 地面の高さ。**なだらかな起伏。**
 *
 * **±2 まで**——弓の射線を塞がない。
 * **城壁と街の近くは平ら**にする（建物が地形に埋まると直しようがない）。
 */
function height(x: number, z: number): number {
  const a = Math.sin(x * 0.11 + 0.7) * Math.cos(z * 0.09 - 1.3);
  const b = Math.sin((x + z) * 0.045 + 2.1);
  const flat = Math.max(0, Math.min(1, (-z - 4) / 12));
  return Math.round((a * 1.2 + b * 1.1) * flat);
}

/**
 * 表土の斑。
 *
 * > ### 1 マスごとの乱数では「砂嵐」になる（2026-08-31）
 * >
 * > **同じ土は固まって現れる。** なだらかな波を 2 つ重ねて**斑**を作り、
 * > **その値で土の種類を決める**——粒が散るのではなく、**面で変わる。**
 */
function patch(x: number, z: number): number {
  const a = Math.sin(x * 0.07 - 1.1) * Math.cos(z * 0.061 + 0.4);
  const b = Math.sin((x * 0.9 - z * 1.3) * 0.033 + 2.7);
  return (a * 0.6 + b * 0.4 + 1) / 2; // 0〜1
}

/** 表の土。**斑で決める**（乱数は縁をぼかすためだけ） */
function topsoil(x: number, z: number, r: () => number): string {
  const p = patch(x, z) + (r() - 0.5) * 0.06;
  if (p < 0.17) return "coarse_dirt";
  if (p < 0.24) return "podzol";
  if (p < 0.3) return "dirt";
  if (p > 0.9) return "gravel";
  if (p > 0.82) return "moss_block";
  return "grass";
}

/**
 * 地面を作る。
 *
 * **土台は Y ＝ −12 まで石**——元の地形が下がっていても抜けない。
 * **岩が顔を出すのは戦場だけ**（街の中で石が飛び出すと不自然・2026-08-31）。
 */
function ground(fill: Fill, set: Set_, r: () => number): void {
  fill(-HALF_W, -12, -FIELD, HALF_W, -3, TOWN, "stone");
  fill(-HALF_W, -2, -FIELD, HALF_W, 34, TOWN, "air");

  for (let x = -HALF_W; x <= HALF_W; x++) {
    for (let z = -FIELD; z <= TOWN; z++) {
      const h = height(x, z);
      for (let y = -2; y < h; y++) set(x, y, z, "dirt");
      set(x, h, z, topsoil(x, z, r));
      // **岩は戦場にだけ。** 斑の濃い所へまとめて出す
      if (z < -10 && patch(x, z) > 0.94 && r() < 0.35) {
        set(x, h, z, r() < 0.6 ? "andesite" : "cobblestone");
      }
    }
  }
}

/** けもの道の中心（`z` に対する `x`）。**左右に揺れる** */
function trailX(z: number): number {
  const bend = Math.sin(z * 0.07) * 6 + Math.sin(z * 0.021 + 1.7) * 4;
  const near = Math.max(0, Math.min(1, (-z - 2) / 8));
  return Math.round(bend * near);
}

/**
 * けもの道。**うねる細い土の道。**
 *
 * **まっすぐで幅の揃った道は人工物に見える**ので、
 * **中心が揺れ、幅も変わり、縁も揃えない。**
 */
function trail(set: Set_, r: () => number): void {
  for (let z = -FIELD; z <= 2; z++) {
    const cx = trailX(z);
    const w = 1 + Math.floor(r() * 2 + (Math.sin(z * 0.13) + 1) * 0.6);
    for (let dx = -w; dx <= w; dx++) {
      const x = cx + dx;
      const h = height(x, z);
      if (Math.abs(dx) === w && r() < 0.45) continue;
      set(x, h, z, r() < 0.75 ? "coarse_dirt" : "dirt");
      if (r() < 0.08) set(x, h, z, "gravel");
    }
  }
}

/** 遮蔽の岩。**低く、まばらに。** 置いた場所を返す（木を重ねないため） */
function scatterRocks(set: Set_, r: () => number): Array<[number, number, number]> {
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const cx = Math.round((r() * 2 - 1) * (HALF_W - 12));
    const cz = -14 - Math.round(r() * (FIELD - 22));
    const rad = 2 + Math.round(r() * 2);
    spots.push([cx, cz, rad]);
    const h0 = 1 + Math.round(r() * 2);
    for (let x = -rad; x <= rad; x++) {
      for (let z = -rad; z <= rad; z++) {
        const d = Math.hypot(x, z) / rad;
        if (d > 1) continue;
        const base = height(cx + x, cz + z);
        const top = Math.max(1, Math.round(h0 * (1 - d) + 0.3));
        for (let y = 1; y <= top; y++) {
          set(cx + x, base + y, cz + z, r() < 0.7 ? "cobblestone" : "mossy_cobblestone");
        }
      }
    }
  }
  return spots;
}

/** 草と花。**道の上には生やさない** */
function flora(set: Set_, r: () => number): void {
  for (let x = -HALF_W; x <= HALF_W; x++) {
    for (let z = -FIELD; z <= -4; z++) {
      if (Math.abs(x - trailX(z)) <= 3) continue;
      // **草は斑で、花はごく少なく**（2026-08-31）——
      // 一面に散らすと**紙吹雪**になり、戦場が賑やかになりすぎる
      const v = r();
      const p2 = patch(x + 40, z - 30);
      if (v > (p2 > 0.6 ? 0.16 : 0.03)) continue;
      const h = height(x, z);
      if (v < 0.145) set(x, h + 1, z, "short_grass");
      else if (v < 0.153) set(x, h + 1, z, "red_flower");
      else set(x, h + 1, z, "yellow_flower");
    }
  }
}

/**
 * 林。
 *
 * > ### 木は重ならない（2026-08-31）
 * >
 * > 乱数だけで置くと**同じ所に 2 本生えて、幹が食い込む。**
 * > **置いた木を覚えて、6 マス以内には生やさない。**
 * > **道・岩・堀の上にも生やさない**——地形が破綻して見える。
 *
 * **幹の下には土を敷く**（石や砂利から生えていると嘘に見える）。
 */
function trees(set: Set_, r: () => number, rocks: ReadonlyArray<[number, number, number]>): void {
  const placed: Array<[number, number]> = [];
  const ok = (x: number, z: number): boolean => {
    if (z > -12 || z < -FIELD + 2) return false;
    if (Math.abs(x) > HALF_W - 3) return false;
    if (Math.abs(x - trailX(z)) <= 4) return false;
    for (const spot of rocks) {
      if (Math.hypot(x - spot[0], z - spot[1]) < spot[2] + 3) return false;
    }
    for (const p of placed) {
      if (Math.hypot(x - p[0], z - p[1]) < 6) return false;
    }
    return true;
  };

  let tries = 0;
  while (placed.length < 34 && tries < 800) {
    tries += 1;
    // **奥と両端に寄せる**（湧き元を隠し、真ん中は開けておく）
    const edge = r() < 0.45;
    const x = edge
      ? (r() < 0.5 ? -1 : 1) * (HALF_W - 4 - Math.round(r() * 12))
      : Math.round((r() * 2 - 1) * (HALF_W - 8));
    const z = edge ? -14 - Math.round(r() * (FIELD - 20)) : -FIELD + 2 + Math.round(r() * 16);
    if (!ok(x, z)) continue;
    placed.push([x, z]);

    const h = height(x, z);
    const tall = 4 + Math.floor(r() * 3);
    const birch = r() < 0.3;
    const log = birch ? "birch_log" : "oak_log";
    const leaf = birch ? "birch_leaves" : "oak_leaves";

    // **根元の土**
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (r() < 0.35) continue;
        set(x + dx, height(x + dx, z + dz), z + dz, r() < 0.5 ? "dirt" : "podzol");
      }
    }
    for (let y = 1; y <= tall; y++) set(x, h + y, z, log);
    for (let dy = -1; dy <= 1; dy++) {
      const rad = dy === 1 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue;
          set(x + dx, h + tall + dy, z + dz, leaf);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 城

/** 堀。**渡れるのは橋 1 本だけ**——敵の流れを作る */
function moat(fill: Fill): void {
  const z1 = MOAT_Z - Math.floor(MOAT_W / 2);
  const z2 = MOAT_Z + Math.floor(MOAT_W / 2);
  fill(-HALF_W, -MOAT_D, z1, HALF_W, 3, z2, "air");
  fill(-HALF_W, -MOAT_D - 1, z1, HALF_W, -MOAT_D - 1, z2, "polished_deepslate");
  fill(-HALF_W, -MOAT_D, z1, HALF_W, 0, z1, "deepslate_tiles");
  fill(-HALF_W, -MOAT_D, z2, HALF_W, 0, z2, "deepslate_tiles");
  bridge(fill);
}

/** 橋 */
function bridge(fill: Fill): void {
  const z1 = MOAT_Z - Math.floor(MOAT_W / 2) - 2;
  const z2 = MOAT_Z + Math.floor(MOAT_W / 2) + 2;
  fill(-3, 0, z1, 3, 0, z2, "stone_bricks");
  fill(-3, -1, z1, 3, -1, z2, "stone_bricks");
  fill(-4, 1, z1, -4, 1, z2, "stone_brick_wall");
  fill(4, 1, z1, 4, 1, z2, "stone_brick_wall");
}

/**
 * 城壁。
 *
 * > ### 平らな面は書き割りに見える（2026-08-31）
 * >
 * > **凹凸を 3 つ足した。**
 * >
 * > | | |
 * > | --- | --- |
 * > | **控え壁** | 12 マスおきに外へ 1〜2 マス出す（下ほど太い） |
 * > | **裾** | 下 2 段を外へ張り出す——**重さが出る** |
 * > | **矢狭間** | 6 マスおきに縦の隙間 |
 */
function wall(fill: Fill, set: Set_, r: () => number): void {
  const z1 = 0;
  const z2 = WALL_T - 1;
  const half = Math.floor(GATE_W / 2);

  for (let x = -HALF_W; x <= HALF_W; x++) {
    if (Math.abs(x) <= half) continue;
    const buttress = Math.abs(x) % 12 === 0 && Math.abs(x) > TOWER_X + TOWER_R + 2;

    for (let y = 1; y <= WALL_H; y++) {
      for (let z = z1; z <= z2; z++) set(x, y, z, wallStone(r, y));
      if (y <= 2) set(x, y, z1 - 1, wallStone(r, y));
      if (buttress && y <= WALL_H - 3) {
        set(x, y, z1 - 1, wallStone(r, y));
        if (y <= 5) set(x, y, z1 - 2, wallStone(r, y));
      }
    }
    // **矢狭間**
    if (Math.abs(x) % 6 === 3) {
      for (let y = 7; y <= 8; y++) {
        set(x, y, z1, "air");
        set(x, y, z1 + 1, "air");
      }
      set(x, 6, z1, "stone_brick_slab");
    }
    // 胸壁（**歯の高さを揃えすぎない**）
    if (((x + HALF_W) & 1) === 0) {
      set(x, WALL_H + 1, z1, wallStone(r, WALL_H));
      set(x, WALL_H + 1, z2, wallStone(r, WALL_H));
      if (r() < 0.25) set(x, WALL_H + 2, z1, "stone_brick_slab");
    }
  }
  fill(-HALF_W, WALL_H, z1 + 1, HALF_W, WALL_H, z2 - 1, "stone_brick_slab");
}

/** 門の左右の塔 */
function towers(fill: Fill, set: Set_, r: () => number): void {
  for (const side of [-1, 1]) {
    const cx = side * TOWER_X;
    const cz = Math.floor(WALL_T / 2);
    for (let y = 1; y <= TOWER_H; y++) {
      for (let x = -TOWER_R; x <= TOWER_R; x++) {
        for (let z = -TOWER_R; z <= TOWER_R; z++) {
          // **角を丸める**（0.5 ずらして測る——整数だけで測ると八角形になる）
          const d = Math.hypot(x + 0.5, z + 0.5);
          if (d > TOWER_R || d < TOWER_R - 1.6) continue;
          set(cx + x, y, cz + z, wallStone(r, y));
        }
      }
    }
    for (let x = -TOWER_R; x <= TOWER_R; x++) {
      for (let z = -TOWER_R; z <= TOWER_R; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > TOWER_R) continue;
        set(cx + x, TOWER_H + 1, cz + z, "stone_bricks");
        // **張り出し**（1 段外へ出す）——上が細いと棒に見える
        if (d > TOWER_R - 1.6) {
          set(cx + x, TOWER_H, cz + z, "stone_brick_slab");
          if ((x + z) % 2 === 0) set(cx + x, TOWER_H + 2, cz + z, "stone_bricks");
        }
      }
    }
    for (let y = 6; y <= TOWER_H - 4; y += 4) {
      set(cx, y, cz - TOWER_R, "air");
      set(cx, y + 1, cz - TOWER_R, "air");
    }
    fill(cx - 1, TOWER_H + 3, cz - 1, cx + 1, TOWER_H + 3, cz + 1, "lantern");
  }
}

/**
 * 門。**扉は木**（2026-08-31 決定）。
 *
 * **鉄格子だけだと倉庫の入口に見える。**
 * **厚板を張り、丸太で枠と筋交いを入れ、鉄で留める**——城の扉にする。
 * **閉じたまま。**
 */
function gate(fill: Fill, set: Set_, r: () => number): void {
  const half = Math.floor(GATE_W / 2);
  const face = WALL_T - 1;

  fill(-half, 1, -1, half, GATE_H, WALL_T - 1, "air");

  // アーチ（**角を落とす**）
  for (let x = -half - 1; x <= half + 1; x++) {
    const h = GATE_H + 1 - Math.round(Math.abs(x) * 0.45);
    for (let z = -1; z <= WALL_T - 1; z++) set(x, h, z, "stone_bricks");
    if (Math.abs(x) === half + 1) {
      for (let y = 1; y <= h; y++) {
        for (let z = -1; z <= WALL_T - 1; z++) set(x, y, z, "polished_deepslate");
      }
    }
  }

  // ---- 門楼（**外へ 3 マス張り出す**）。
  //
  // **塔に挟まれて埋もれていた**ので、**壁より前に出す**（2026-08-31）。
  for (let x = -half - 3; x <= half + 3; x++) {
    for (let z = -3; z <= 0; z++) {
      const outer = Math.abs(x) > half + 1 || z === -3;
      for (let y = 1; y <= GATE_H + 3; y++) {
        if (outer) set(x, y, z, wallStone(r, y));
      }
    }
    // 胸壁
    if ((x & 1) === 0) set(x, GATE_H + 4, -3, "stone_bricks");
  }
  // 張り出しの中を通路に
  fill(-half, 1, -3, half, GATE_H, 0, "air");
  fill(-half - 1, GATE_H + 1, -3, half + 1, GATE_H + 1, 0, "stone_bricks");
  // 旗（**門の顔**）
  for (const bx of [-half - 2, half + 2]) {
    for (let y = 5; y <= 9; y++) set(bx, y, -4, "red_wool");
    set(bx, 10, -4, "dark_oak_log");
  }

  // ---- 木の扉
  for (let x = -half; x <= half; x++) {
    for (let y = 1; y <= GATE_H - 1; y++) set(x, y, face, "dark_oak_planks");
  }
  for (let y = 1; y <= GATE_H - 1; y++) {
    set(-half, y, face, "dark_oak_log");
    set(half, y, face, "dark_oak_log");
  }
  for (const y of [2, GATE_H - 2]) {
    for (let x = -half; x <= half; x++) set(x, y, face, "stripped_dark_oak_log");
  }
  // 筋交い（**左右から中央へ上がる**）
  for (let i = 0; i <= half; i++) {
    const y = 3 + Math.round(i * 0.8);
    if (y >= GATE_H - 2) break;
    set(-half + i, y, face, "stripped_dark_oak_log");
    set(half - i, y, face, "stripped_dark_oak_log");
  }
  // 鉄の鋲
  for (let x = -half + 1; x < half; x += 2) {
    if (r() < 0.6) set(x, 5, face, "iron_bars");
  }
  set(0, GATE_H - 1, face, "lantern");

  // 落とし格子（**扉の外に 1 枚**）
  for (let x = -half; x <= half; x++) set(x, GATE_H, -1, "iron_bars");
  for (let x = -half; x <= half; x += 2) set(x, GATE_H + 1, 0, "chain");
}

// ---------------------------------------------------------------- 街

/**
 * 街。**通りの網と区画。**
 *
 * > ### 石畳は地面の高さに敷く（2026-08-31）
 * >
 * > 1 段上げて敷いたら、**道と広場が一段高い台**になった。
 * > **地面と同じ高さ**に敷けば段差は出ない。
 */
function town(fill: Fill, set: Set_, r: () => number): void {
  const z0 = WALL_T;
  const back = TOWN - 2;

  // ---- 通りの網（**地面の高さ**）
  //
  // > ### 石畳を敷きすぎない（2026-08-31）
  // >
  // > 一面に敷いたら**駐車場**に見えた。**通りは細く**、
  // > **区画の中は土**（庭）にして、灰色の面積を減らす。
  fill(-3, 0, z0, 3, 0, back, "cobblestone");
  const crossZ: number[] = [];
  for (let z = z0 + 14; z < back - 8; z += 14) {
    crossZ.push(z);
    fill(-HALF_W + 3, 0, z - 1, HALF_W - 3, 0, z + 1, "cobblestone");
  }
  // 区画の中は土と草（**庭**）
  for (let x = -HALF_W + 3; x <= HALF_W - 3; x++) {
    for (let z = z0; z <= back; z++) {
      if (Math.abs(x) <= 3) continue;
      if (r() < 0.55) continue;
      set(x, 0, z, r() < 0.55 ? "coarse_dirt" : "grass");
    }
  }

  // ---- 門の前の広場
  const plazaZ2 = z0 + 11;
  fill(-14, 0, z0, 14, 0, plazaZ2, "stone_bricks");
  for (let x = -14; x <= 14; x++) {
    for (let z = z0; z <= plazaZ2; z++) {
      const v = r();
      if (v < 0.25) set(x, 0, z, "cobblestone");
      else if (v < 0.32) set(x, 0, z, "mossy_cobblestone");
    }
  }
  // 井戸
  fill(9, 1, z0 + 7, 11, 2, z0 + 9, "cobblestone");
  fill(10, 1, z0 + 8, 10, 2, z0 + 8, "air");

  // ---- 区画に家を建てる（**通りと通りのあいだ**）
  const bands: Array<[number, number]> = [];
  let zA = plazaZ2 + 3;
  for (const cz of crossZ) {
    if (cz - 3 - zA >= 8) bands.push([zA, cz - 3]);
    zA = cz + 3;
  }
  if (back - 26 - zA >= 8) bands.push([zA, back - 26]);

  for (const band of bands) {
    const z1 = band[0];
    const depth = Math.min(11, band[1] - z1);
    for (const side of [-1, 1]) {
      let x = side > 0 ? 6 : -6;
      while (Math.abs(x) < HALF_W - 14) {
        const w = 7 + Math.floor(r() * 6);
        const left = side > 0 ? x : x - w + 1;
        // **高さも棟の向きもばらす**（揃うと団地に見える）
        house(fill, set, r, left, z1, w, depth, 7 + Math.floor(r() * 6), r() < 0.4);
        x += side * (w + 2 + Math.floor(r() * 3));
      }
    }
  }

  // ---- 市場（屋台）
  const mz = crossZ[1] ?? z0 + 30;
  fill(-12, 0, mz + 4, 12, 0, mz + 12, "stone_bricks");
  for (let i = 0; i < 6; i++) {
    const sx = -10 + i * 4;
    const sz = mz + 5 + (i % 2) * 5;
    set(sx, 1, sz, "dark_oak_log");
    set(sx + 2, 1, sz + 1, "dark_oak_log");
    set(sx, 2, sz, "dark_oak_log");
    set(sx + 2, 2, sz + 1, "dark_oak_log");
    fill(sx - 1, 3, sz - 1, sx + 3, 3, sz + 2, "red_wool");
    set(sx + 1, 1, sz, "barrel");
  }

  castle(fill, set, r, back - 22);

  // ---- 外壁（三方）。
  //
  // > ### のっぺりした壁は「箱」に見える（2026-08-31）
  // >
  // > **20 マスおきに塔**を立て、**厚みも変える。** 遠くから見たときの輪郭が変わる。
  for (let z = z0; z <= back; z++) {
    for (const x of [-HALF_W, HALF_W]) {
      for (let y = 1; y <= 8; y++) set(x, y, z, wallStone(r, y));
      if ((z & 1) === 0) set(x, 9, z, "stone_bricks");
    }
  }
  for (let x = -HALF_W; x <= HALF_W; x++) {
    for (let y = 1; y <= 8; y++) set(x, y, back, wallStone(r, y));
    if ((x & 1) === 0) set(x, 9, back, "stone_bricks");
  }
  // 塔（**壁の角と、20 マスおき**）
  const towerSpots: Array<[number, number]> = [
    [-HALF_W, back],
    [HALF_W, back],
    [-HALF_W, z0 + 2],
    [HALF_W, z0 + 2],
  ];
  for (let z = z0 + 20; z < back - 6; z += 20) {
    towerSpots.push([-HALF_W, z]);
    towerSpots.push([HALF_W, z]);
  }
  for (let x = -HALF_W + 20; x < HALF_W - 6; x += 20) towerSpots.push([x, back]);
  for (const spot of towerSpots) {
    for (let y = 1; y <= 13; y++) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const d = Math.hypot(dx + 0.5, dz + 0.5);
          if (d > 3 || d < 2) continue;
          set(spot[0] + dx, y, spot[1] + dz, wallStone(r, y));
        }
      }
    }
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (Math.hypot(dx + 0.5, dz + 0.5) > 3) continue;
        set(spot[0] + dx, 14, spot[1] + dz, "stone_bricks");
      }
    }
    set(spot[0], 15, spot[1], "lantern");
  }

  // ---- 教会（**街の目印**。時計塔とは別の方角に）
  const chx = -22;
  const chz = plazaZ2 + 26;
  fill(chx - 6, 1, chz - 8, chx + 6, 10, chz + 8, "smooth_quartz");
  fill(chx - 5, 1, chz - 7, chx + 5, 9, chz + 7, "air");
  for (let i = 0; i <= 6; i++) {
    fill(chx - 6 + i, 11 + i, chz - 8, chx - 6 + i, 11 + i, chz + 8, "stone_brick_stairs", stair(0));
    fill(chx + 6 - i, 11 + i, chz - 8, chx + 6 - i, 11 + i, chz + 8, "stone_brick_stairs", stair(1));
  }
  hollowTower(fill, chx, chz - 10, 2, 20);
  for (let i = 0; i <= 3; i++) {
    const rad = 3 - i;
    for (let dx = -rad; dx <= rad; dx++) {
      for (let dz = -rad; dz <= rad; dz++) set(chx + dx, 21 + i, chz - 10 + dz, "deepslate_brick_stairs");
    }
  }
  set(chx, 25, chz - 10, "gold_block");
  for (let y = 4; y <= 8; y += 2) {
    set(chx - 6, y, chz, "glass_pane");
    set(chx + 6, y, chz, "glass_pane");
    set(chx - 5, y, chz, "glowstone");
    set(chx + 5, y, chz, "glowstone");
  }

  // ---- 時計塔
  const tx = 24;
  const tz = plazaZ2 + 20;
  hollowTower(fill, tx, tz, 3, 26);
  fill(tx - 3, 27, tz - 3, tx + 3, 27, tz + 3, "dark_oak_planks");
  set(tx, 24, tz - 3, "glowstone");
  fill(tx - 4, 28, tz - 4, tx + 4, 28, tz + 4, "dark_oak_stairs");
}

/** 中を空けた四角い塔 */
function hollowTower(fill: Fill, cx: number, cz: number, rad: number, top: number): void {
  fill(cx - rad, 1, cz - rad, cx + rad, top, cz + rad, "stone_bricks");
  fill(cx - rad + 1, 1, cz - rad + 1, cx + rad - 1, top - 1, cz + rad - 1, "air");
}

/**
 * 城。**奥の中央。門からまっすぐ見える。**
 *
 * > ### 箱にしない（2026-08-31）
 * >
 * > ただの直方体は**灰色の塊**にしかならなかった。
 * > **段を作る**（低い前庭 → 本館 → 天守）と、**屋根を載せる**と城に見える。
 */
function castle(fill: Fill, set: Set_, r: () => number, cz: number): void {
  // ---- 前庭（低い塀と門）
  fill(-20, 1, cz - 6, 20, 3, cz - 6, "stone_bricks");
  fill(-20, 1, cz - 6, -20, 3, cz + 20, "stone_bricks");
  fill(20, 1, cz - 6, 20, 3, cz + 20, "stone_bricks");
  fill(-3, 1, cz - 6, 3, 3, cz - 6, "air");
  fill(-20, 0, cz - 6, 20, 0, cz + 20, "stone_bricks");

  // ---- 本館（**壁は殻**。中は空）
  const x1 = -14;
  const x2 = 14;
  const z1 = cz;
  const z2 = cz + 16;
  const h = 16;
  for (let y = 1; y <= h; y++) {
    fill(x1, y, z1, x2, y, z1, "stone_bricks");
    fill(x1, y, z2, x2, y, z2, "stone_bricks");
    fill(x1, y, z1, x1, y, z2, "stone_bricks");
    fill(x2, y, z1, x2, y, z2, "stone_bricks");
  }
  fill(x1, h, z1, x2, h, z2, "stone_bricks");
  // 胸壁
  for (let x = x1; x <= x2; x += 2) {
    set(x, h + 1, z1, "stone_bricks");
    set(x, h + 1, z2, "stone_bricks");
  }
  for (let z = z1; z <= z2; z += 2) {
    set(x1, h + 1, z, "stone_bricks");
    set(x2, h + 1, z, "stone_bricks");
  }

  // ---- 天守（**本館の上に、細く高く**）
  const kx = 0;
  const kz = cz + 8;
  for (let y = h; y <= h + 12; y++) {
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        const edge = Math.abs(dx) === 5 || Math.abs(dz) === 5;
        if (edge) set(kx + dx, y, kz + dz, wallStone(r, y));
      }
    }
  }
  // 天守の屋根（**四方から寄せる**）
  for (let i = 0; i <= 5; i++) {
    const y = h + 13 + i;
    const rad = 5 - i;
    for (let dx = -rad; dx <= rad; dx++) {
      for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) !== rad && Math.abs(dz) !== rad) continue;
        set(kx + dx, y, kz + dz, "deepslate_brick_stairs");
      }
    }
  }
  set(kx, h + 19, kz, "gold_block");

  // ---- 隅の塔（**丸く**）
  for (const tx of [x1, x2]) {
    for (const tz of [z1, z2]) {
      for (let y = 1; y <= h + 6; y++) {
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            const d = Math.hypot(dx + 0.5, dz + 0.5);
            if (d > 3 || d < 2) continue;
            set(tx + dx, y, tz + dz, wallStone(r, y));
          }
        }
      }
      for (let i = 0; i <= 3; i++) {
        const y = h + 7 + i;
        const rad = 3 - i;
        for (let dx = -rad; dx <= rad; dx++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (Math.hypot(dx + 0.5, dz + 0.5) > rad) continue;
            set(tx + dx, y, tz + dz, "deepslate_brick_stairs");
          }
        }
      }
      set(tx, h + 11, tz, "lantern");
    }
  }

  // ---- 正面（**扉と窓と旗**）
  fill(-3, 1, z1, 3, 6, z1, "dark_oak_planks");
  for (let y = 1; y <= 6; y++) {
    set(-4, y, z1, "dark_oak_log");
    set(4, y, z1, "dark_oak_log");
  }
  set(0, 7, z1, "lantern");
  for (let x = -10; x <= 10; x += 5) {
    for (let y = 6; y <= 13; y += 4) {
      set(x, y, z1, "glass_pane");
      set(x, y + 1, z1, "glowstone");
    }
  }
  for (const bx of [-8, 8]) {
    for (let y = 8; y <= 12; y++) set(bx, y, z1 - 1, "red_wool");
  }
}

/**
 * 家 1 軒。
 *
 * > ### 中身を詰めない（2026-08-31 に作り直した）
 * >
 * > 前は**箱を丸ごと石で埋めていた**ので、**何の建物か分からない塊**になっていた。
 * > **壁は殻**（中は空）。**扉と窓を通りの側に付ける**と、家に見える。
 *
 * | | |
 * | --- | --- |
 * | 下 | 石レンガ（2〜3 段） |
 * | 上 | 濃樫の板 ＋ **四隅と梁の丸太**（ハーフティンバー） |
 * | 屋根 | **階段の切妻**（前後で向きを変える）＋ 棟のハーフブロック。**1 マス出す** |
 */
function house(
  fill: Fill,
  set: Set_,
  r: () => number,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  alongX = false
): void {
  const x2 = x + w - 1;
  const z2 = z + d - 1;
  const stone = 2 + (r() < 0.4 ? 1 : 0);

  // 床
  fill(x, 0, z, x2, 0, z2, "cobblestone");
  // 壁（**殻だけ**）
  for (let y = 1; y <= h; y++) {
    const mat = y <= stone ? "stone_bricks" : "dark_oak_planks";
    fill(x, y, z, x2, y, z, mat);
    fill(x, y, z2, x2, y, z2, mat);
    fill(x, y, z, x, y, z2, mat);
    fill(x2, y, z, x2, y, z2, mat);
  }
  // 柱と梁
  for (const cx of [x, x2]) {
    for (const cz of [z, z2]) fill(cx, 1, cz, cx, h, cz, "dark_oak_log");
  }
  fill(x, stone, z, x2, stone, z, "dark_oak_log");
  fill(x, stone, z2, x2, stone, z2, "dark_oak_log");
  // 天井（**屋根裏を塞ぐ**）
  fill(x + 1, h, z + 1, x2 - 1, h, z2 - 1, "dark_oak_planks");

  // 扉（**通りの側 ＝ 手前**）
  const dx = x + Math.floor(w / 2);
  fill(dx, 1, z, dx, 2, z, "air");
  set(dx, 1, z, "dark_oak_door");

  // 窓（**光る**——人が居るように見える）
  for (let wy = stone + 1; wy <= h - 1; wy += 3) {
    for (let wx = x + 1; wx <= x2 - 1; wx += 2) {
      if (wx === dx && wy <= 2) continue;
      if (r() < 0.5) continue;
      set(wx, wy, z, "glass_pane");
      set(wx, wy, z + 1, "glowstone");
      if (r() < 0.5) {
        set(wx, wy, z2, "glass_pane");
        set(wx, wy, z2 - 1, "glowstone");
      }
    }
  }

  // 屋根（**切妻**）。
  //
  // > ### 棟の向きを変える（2026-08-31）
  // >
  // > 全部同じ向きだと**兵舎**に見える。**半分は棟を横に走らせる。**
  const roof = ROOFS[Math.floor(r() * ROOFS.length)] ?? ROOFS[0];
  if (alongX) {
    const steps = Math.floor((w + 1) / 2);
    for (let i = 0; i < steps; i++) {
      const y = h + 1 + i;
      const xf = x + i;
      const xb = x2 - i;
      if (xf > xb) break;
      fill(xf, y, z - 1, xf, y, z2 + 1, roof, stair(1));
      if (xb !== xf) fill(xb, y, z - 1, xb, y, z2 + 1, roof, stair(0));
      if (i > 0 && xf + 1 <= xb - 1) fill(xf + 1, y, z, xb - 1, y, z2, "dark_oak_planks");
    }
    const ridgeX = x + steps - 1;
    fill(ridgeX, h + steps, z - 1, ridgeX, h + steps, z2 + 1, "stone_brick_slab");
  } else {
    const steps = Math.floor((d + 1) / 2);
    for (let i = 0; i < steps; i++) {
      const y = h + 1 + i;
      const zf = z + i;
      const zb = z2 - i;
      if (zf > zb) break;
      fill(x - 1, y, zf, x2 + 1, y, zf, roof, stair(DIR_FRONT));
      if (zb !== zf) fill(x - 1, y, zb, x2 + 1, y, zb, roof, stair(DIR_BACK));
      if (i > 0 && zf + 1 <= zb - 1) fill(x, y, zf + 1, x2, y, zb - 1, "dark_oak_planks");
    }
    const ridgeZ = z + steps - 1;
    fill(x - 1, h + steps, ridgeZ, x2 + 1, h + steps, ridgeZ, "stone_brick_slab");
  }
  // 煙突
  if (r() < 0.55) {
    const cx = x + 1 + Math.floor(r() * Math.max(1, w - 2));
    const topY = h + Math.floor(Math.max(w, d) / 2) + 1;
    fill(cx, h + 1, z + 1, cx, topY, z + 1, "stone_bricks");
    set(cx, topY + 1, z + 1, "campfire");
  }
}

/** 明かり。**夜でも戦える** */
function lights(set: Set_): void {
  for (let z = -6; z >= -FIELD + 8; z -= 10) {
    const cx = trailX(z);
    set(cx + 4, height(cx + 4, z) + 1, z, "campfire");
    set(cx - 4, height(cx - 4, z) + 1, z, "campfire");
  }
  const half = Math.floor(GATE_W / 2);
  for (const x of [-half - 2, half + 2]) {
    for (let y = 4; y <= 10; y += 3) set(x, y, -1, "torch");
  }
}

type Fill = (
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  block: string,
  states?: States
) => void;
type Set_ = (x: number, y: number, z: number, block: string, states?: States) => void;
