/**
 * 周りの地形。**戦場を囲う 500 × 500 を、細い岩尾根と谷で埋める。**
 *
 * 仕様は `docs/02-map.md` 9 章。
 *
 * ## 目指す絵
 *
 * > ### 細い山が連なり、その間に歩ける谷がある
 * >
 * > 見本は Wynncraft の "Canyon of the Lost"（`user/スクリーンショット 2026-09-01 104839.png`）。
 * > **山は細く、連続して並ぶ。** 山と山の間には**歩ける広さ**が要る
 * > （最初は台地を谷で刻んだが、**谷が狭すぎて動けなかった**——2026-09-01 実機）。
 * >
 * > **谷を土の道（けものみち）が通る。** 勾配は**歩ける範囲**に抑える。
 * > 深い谷は暗い木の橋で渡る。
 * >
 * > **要塞は岩の輪に囲まれ、入れるのは道の切り通しからだけ。**
 *
 * ## 作りの順番
 *
 * ```
 * 谷底（ゆるい起伏 20 前後）
 *   ＋ 尾根（3〜4 本の族。細く、長く、うねる）   … ここが「細い山」
 *   ＋ 突起（3〜5 個）                            … 尾根の上の頂
 *   ＋ 岩の刻み                                   … のっぺりさせない
 *   ↓ 段丘（5 マス刻みへ 1/3 寄せる）
 *   ↓ 戦場を囲む輪（道以外から入れない）
 *   ↓ 外周を落として終わる
 *   ↓ 道（削る・盛る・橋）
 * ```
 *
 * ## 見えるのは表面だけではない
 *
 * **崖には地層が出る。** 表面 1 マスだけ気を配っても、
 * **切り立った面は下の石がそのまま見える**——ここが 1 種類だと「土が貼ってあるだけ」に見える。
 * `strataAt` が **y ごとに違う石**を返す（`land.ts` が層ごとに置く）。
 */

/** 戦場（**ここには 1 マスも置かない**）。`docs/02-map.md` 8-1 */
export const FIELD = { x1: 1201, y1: 13, z1: 643, x2: 1308, y2: 132, z2: 757 } as const;

/** 作る範囲（戦場を ±200 広げた所） */
export const AREA = {
  x1: FIELD.x1 - 200,
  z1: FIELD.z1 - 200,
  x2: FIELD.x2 + 200,
  z2: FIELD.z2 + 200,
} as const;

/** 戦場の地面の高さ（道の繋ぎ目もここ） */
const FIELD_Y = 15;

/** 岩の底（**ここから積む**）。これより下は触らない */
const FLOOR = 5;

/** 空にする上端 */
const SKY = 210;

/** 高さの上限 */
const CEIL = 200;

/** 戦場のすぐ外の平場（**輪の足元**） */
const APRON = 6;

/** 戦場を囲む輪：いちばん高くなる距離と、その幅 */
const RING_AT = 42;
const RING_HALF = 34;
const RING_H = 58;

/** 外周をならす幅。**四角い崖で終わらせない** */
const EDGE = 45;

/** 道が出てくる場所（`z = 758` の 2 本）。**ここが戦場との繋ぎ目** */
const ROAD_MOUTHS = [1246, 1264] as const;
const ROAD_Z = FIELD.z2 + 1;

/** 道の半幅（**中心からこの距離までが路面**） */
const HALF = 3;

/** 道の肩（**ここまで地形をならして繋ぐ**） */
const SHOULDER = 10;

/**
 * 道の勾配の上限（**縦 ÷ 横**）。
 *
 * > ### 歩けない坂を作らない
 * >
 * > 実機で「けものみちが急すぎて移動できない」（2026-09-01）。
 * > **0.22 ＝ 横 4.5 マスで縦 1 マス。** 走って登れる。
 */
const MAX_SLOPE = 0.22;

/** これ以上落ち込んでいたら、盛らずに**橋を架ける** */
const BRIDGE_GAP = 9;

/** 戦場からこの距離までの道は**舗装**。外は**けものみち** */
const PAVE = 22;

/**
 * 要塞の正面の広場。
 *
 * > ### 門の前は山ではなく、開けた舗装であるべき
 * >
 * > 道の出入口（`z = 758` の 2 本）の南に、**楕円の平場**を作る。
 * > **輪の壁はここだけ開ける**——ここが正門前になる。
 */
const COURT = { x: 1255, z: 792, rx: 52, rz: 40 } as const;

/** 地層 1 枚の厚み */
const BAND = 6;

/** 種つきの乱数（**押すたびに違う地形**） */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 場所から決まる粒（0〜1）。
 *
 * > ### なぜ乱数を使わないのか
 * >
 * > **同じ場所を 2 回聞いたら、同じ答えでなければならない。**
 * > 置くときは**同じブロックが続く区間をまとめて**置く（`land.ts`）ので、
 * > 呼ぶたびに変わる乱数だと、まとめられないうえに縞が出る。
 */
function grain(x: number, z: number, seed: number): number {
  let a = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  a = Math.imul(a ^ (a >>> 13), 1274126177) >>> 0;
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
}

/**
 * 波（−1〜1）。
 *
 * > ### そのまま重ねると、東西南北に十字が出る
 * >
 * > `sin(x) * cos(z)` は**軸に揃った模様**を作る。何枚重ねても揃ったままなので、
 * > 上から見ると**十字の筋**が浮いた（2026-09-01 の写真）。
 * > **1 枚ごとに座標を回す**（回す角は `a` から作るので、呼ぶ場所ごとに違う）。
 */
function n(x: number, z: number, f: number, a: number, b: number): number {
  const c = Math.cos(a * 0.37);
  const t = Math.sin(a * 0.37);
  const u = x * c + z * t;
  const v = z * c - x * t;
  return Math.sin(u * f + a) * Math.cos(v * f * 0.87 + b);
}

/** 尾根 1 本の族（**細く、長く、うねる山の筋**） */
export interface Ridge {
  /** うねりの細かさ（小さいほど長い尾根） */
  readonly f: number;
  /** 太さ（`|波|` がこれ未満の所が山になる） */
  readonly w: number;
  /** 高さ */
  readonly h: number;
  readonly a: number;
  readonly b: number;
}

/** 尾根の上の頂 */
export interface Peak {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly h: number;
}

/**
 * 焼き込んだ道の表。
 *
 * **柱ごとに道を探し直さない。** 種を決めた時点で 1 度だけ全部の升に書き込む。
 */
export interface Roads {
  /** 道の中心までの距離（マス）。**255 は「道が無い」** */
  readonly dist: Uint8Array;
  /** そこでの道の高さ */
  readonly y: Int16Array;
}

/** この回の地形を決める数（**種から作る**） */
export interface Shape {
  readonly p: readonly number[];
  readonly ridges: readonly Ridge[];
  readonly peaks: readonly Peak[];
  readonly grain: number;
  /** 谷底の高さ */
  readonly base: number;
  readonly roads: Roads;
}

/**
 * 正面の広場の効き（1 ＝ 広場のまん中、0 ＝ 外）。
 *
 * **縁は 14 マスかけて地形へなじませる**（崖で終わらせない）。
 */
function courtAt(x: number, z: number): number {
  const dx = (x - COURT.x) / COURT.rx;
  const dz = (z - COURT.z) / COURT.rz;
  const d = Math.hypot(dx, dz);
  if (d >= 1.3) return 0;
  if (d <= 1) return 1;
  return 1 - (d - 1) / 0.3;
}

/** 戦場のふちからの距離（**箱の外側だけ測る**。中は 0） */
function fieldDist(x: number, z: number): number {
  const dx = Math.max(FIELD.x1 - x, 0, x - FIELD.x2);
  const dz = Math.max(FIELD.z1 - z, 0, z - FIELD.z2);
  return Math.hypot(dx, dz);
}

const AW = AREA.x2 - AREA.x1 + 1;
const AL = AREA.z2 - AREA.z1 + 1;

function idx(x: number, z: number): number {
  return (z - AREA.z1) * AW + (x - AREA.x1);
}

function inArea(x: number, z: number): boolean {
  return x >= AREA.x1 && x <= AREA.x2 && z >= AREA.z1 && z <= AREA.z2;
}

// ---------------------------------------------------------------- 地形

/**
 * 素の地形（道を考えない）。
 *
 * **谷底 ＋ 細い尾根 ＋ 頂**。輪と外周まで含む。
 */
function rockAt(x: number, z: number, s: Shape): number {
  const p = s.p;

  // ---- 谷底。**ここが「歩ける広さ」**
  let h =
    s.base +
    n(x, z, 0.0062, p[0] ?? 0, p[1] ?? 0) * 7 +
    n(x, z, 0.019, p[2] ?? 0, p[3] ?? 0) * 4 +
    n(x, z, 0.07, p[4] ?? 0, p[5] ?? 0) * 1.6;

  // ---- 尾根。**細い山が連なる**
  //
  // `|波| < 太さ` の帯だけを持ち上げる。**波の零線は長くうねる**ので、
  // 帯はそのまま「細長い山の筋」になる。
  // 高さは筋に沿って変える——**同じ高さの壁にしない。**
  let ridge = 0;
  for (const rg of s.ridges) {
    const a = Math.abs(n(x, z, rg.f, rg.a, rg.b));
    if (a >= rg.w) continue;
    const along = 0.5 + 0.5 * (n(x, z, rg.f * 0.41, rg.b, rg.a) * 0.5 + 0.5);
    // **`^1.3` は稜線が尖りすぎる。** `^0.8` で、上が丸く裾が締まった山になる
    const v = Math.pow(1 - a / rg.w, 0.8) * rg.h * along;
    if (v > ridge) ridge = v;
  }

  // ---- 頂（尾根の上に乗る）
  for (const q of s.peaks) {
    const d = Math.hypot(x - q.x, z - q.z) * (1 + n(x, z, 0.022, p[6] ?? 0, p[7] ?? 0) * 0.22);
    if (d >= q.r) continue;
    const t = 1 - d / q.r;
    const v = q.h * t * t * (3 - 2 * t);
    if (v > ridge) ridge = v;
  }

  if (ridge > 0) {
    const k = Math.min(1, ridge / 60);
    h +=
      ridge +
      // 岩の刻み（**高い所ほど強く**）。**強すぎると櫛の歯になる**ので控えめに
      n(x, z, 0.058, p[8] ?? 0, p[9] ?? 0) * 2.5 * k +
      (1 - Math.abs(n(x, z, 0.115, p[1] ?? 0, p[6] ?? 0))) * 2 * k +
      n(x, z, 0.026, p[3] ?? 0, p[8] ?? 0) * 6 * k;
  }

  // ---- 段丘。**寄せすぎると巨大な階段になる**ので 1/3 だけ
  h = h * 0.68 + Math.round(h / 5) * 5 * 0.32;

  // ---- 戦場を囲む輪。**入れるのは道の切り通しと、正門前の広場からだけ**
  const court = courtAt(x, z);
  const d = fieldDist(x, z);
  if (d < APRON) {
    h = FIELD_Y;
  } else {
    if (d < RING_AT + RING_HALF) {
      const t = Math.max(0, 1 - Math.abs(d - RING_AT) / RING_HALF);
      // **広場のところは壁を開ける**
      const wall = FIELD_Y + Math.pow(t, 0.6) * RING_H * (1 - court);
      if (wall > h) h = wall;
    }
    if (d < APRON + 8) {
      const t = (d - APRON) / 8;
      h = FIELD_Y + (h - FIELD_Y) * t;
    }
  }

  // ---- 正面の広場は平ら
  if (court > 0) h = h * (1 - court) + FIELD_Y * court;

  // ---- 外周は低く落として終わる
  const edge = Math.min(x - AREA.x1, AREA.x2 - x, z - AREA.z1, AREA.z2 - z);
  if (edge < EDGE) {
    const k = Math.pow(Math.max(0, edge) / EDGE, 1.25);
    h = (FLOOR + 9) * (1 - k) + h * k;
  }

  return Math.max(FLOOR + 2, Math.min(CEIL, Math.round(h)));
}

// ---------------------------------------------------------------- 道

interface Node {
  x: number;
  z: number;
  y: number;
  /** 動かせない点（戦場の入口）。**ここは必ず y = 15** */
  fixed: boolean;
}

/** 折れ線を曲げる（**直線の道にしない**）。中点をずらす、を繰り返す */
function wiggle(a: Node, b: Node, r: () => number, depth: number): Array<{ x: number; z: number }> {
  let pts: Array<{ x: number; z: number }> = [
    { x: a.x, z: a.z },
    { x: b.x, z: b.z },
  ];
  for (let step = 0; step < depth; step++) {
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      if (p0 === undefined || p1 === undefined) continue;
      out.push(p0);
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const len = Math.hypot(dx, dz);
      if (len < 6) continue;
      const off = (r() * 2 - 1) * len * 0.18;
      out.push({ x: (p0.x + p1.x) / 2 - (dz / len) * off, z: (p0.z + p1.z) / 2 + (dx / len) * off });
    }
    const last = pts[pts.length - 1];
    if (last !== undefined) out.push(last);
    pts = out;
  }
  return pts;
}

/**
 * 道の網を焼き込む。
 *
 * ```
 * 谷底に点を置く → 近い 2 つずつ結ぶ → 傾きを緩める → 折れ線を曲げて焼き込む
 * ```
 */
function roadsOf(s: Omit<Shape, "roads">, r: () => number): Roads {
  const dist = new Uint8Array(AW * AL).fill(255);
  const y = new Int16Array(AW * AL);

  // **道を焼く前の地形**を測るための影武者
  const bare: Shape = { ...s, roads: { dist, y } };
  const rock = (px: number, pz: number): number => rockAt(px, pz, bare);

  // ---- 点を置く
  const nodes: Node[] = [];
  for (const mouth of ROAD_MOUTHS) nodes.push({ x: mouth, z: ROAD_Z + 3, y: FIELD_Y, fixed: true });
  const want = 13 + Math.floor(r() * 5);
  for (let guard = 0; guard < 900 && nodes.length < want + 2; guard++) {
    const x = AREA.x1 + 30 + Math.floor(r() * (AREA.x2 - AREA.x1 - 60));
    const z = AREA.z1 + 30 + Math.floor(r() * (AREA.z2 - AREA.z1 - 60));
    if (fieldDist(x, z) < APRON + 6) continue;
    let near = false;
    for (const q of nodes) if (Math.hypot(q.x - x, q.z - z) < 55) near = true;
    if (near) continue;

    // **谷底へ寄せる**（山と山の間を通す）。まわり 8 か所を見て、いちばん低い所
    let bx = x;
    let bz = z;
    let by = rock(x, z);
    for (let k = 0; k < 8; k++) {
      const tx = x + Math.round((r() * 2 - 1) * 28);
      const tz = z + Math.round((r() * 2 - 1) * 28);
      if (!inArea(tx, tz) || fieldDist(tx, tz) < APRON + 6) continue;
      const ty = rock(tx, tz);
      if (ty < by) {
        bx = tx;
        bz = tz;
        by = ty;
      }
    }
    // **1/5 は高い所**——尾根へ登る道も要る
    const high = r() < 0.2;
    nodes.push({
      x: high ? x : bx,
      z: high ? z : bz,
      y: Math.max(FIELD_Y + 3, Math.min(150, high ? rock(x, z) : by)),
      fixed: false,
    });
  }

  // **外へ出る道は 1 本だけ**（四辺に作ると外から入り放題になる）
  const cxm = Math.round((AREA.x1 + AREA.x2) / 2);
  const czm = Math.round((AREA.z1 + AREA.z2) / 2);
  const side = Math.floor(r() * 4);
  const jitter = Math.round((r() * 2 - 1) * 90);
  const ex = side === 0 ? AREA.x1 + 5 : side === 1 ? AREA.x2 - 5 : cxm + jitter;
  const ez = side === 2 ? AREA.z1 + 5 : side === 3 ? AREA.z2 - 5 : czm + jitter;
  nodes.push({ x: ex, z: ez, y: Math.max(FIELD_Y + 2, Math.min(70, rock(ex, ez))), fixed: false });

  // ---- 近い 2 つずつ結ぶ
  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();
  const link = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([a, b]);
  };
  for (let i = 0; i < nodes.length; i++) {
    const me = nodes[i];
    if (me === undefined) continue;
    const order = nodes
      .map((q, j) => ({ j, d: Math.hypot(me.x - q.x, me.z - q.z) }))
      .filter((v) => v.j !== i)
      .sort((a, b) => a.d - b.d);
    for (let k = 0; k < 2 && k < order.length; k++) link(i, order[k]?.j ?? i);
  }
  // **繋がっていない塊を繋ぐ**（入口から辿り着けない道は意味が無い）
  const group = nodes.map((_, i) => i);
  const find = (i: number): number => {
    let a = i;
    while ((group[a] ?? a) !== a) a = group[a] ?? a;
    return a;
  };
  for (const [a, b] of edges) group[find(a)] = find(b);
  for (let i = 1; i < nodes.length; i++) {
    if (find(i) === find(0)) continue;
    const me = nodes[i];
    if (me === undefined) continue;
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      const q = nodes[j];
      if (q === undefined || find(j) !== find(0)) continue;
      const d = Math.hypot(me.x - q.x, me.z - q.z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    link(i, best);
    group[find(i)] = find(0);
  }

  // ---- 傾きを緩める。**歩けない坂を作らない**
  //
  // 辺ごとに「縦の差 ≦ 長さ × 上限」へ寄せる。**両端を少しずつ動かす**のを繰り返すと、
  // 網全体でなだらかになる（入口は動かさない）。
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (const [ai, bi] of edges) {
      const a = nodes[ai];
      const b = nodes[bi];
      if (a === undefined || b === undefined) continue;
      const len = Math.max(1, Math.hypot(a.x - b.x, a.z - b.z));
      const cap = len * MAX_SLOPE;
      const diff = b.y - a.y;
      if (Math.abs(diff) <= cap) continue;
      const over = (Math.abs(diff) - cap) / 2;
      const dir = Math.sign(diff);
      if (!a.fixed) a.y += dir * over;
      if (!b.fixed) b.y -= dir * over;
      if (a.fixed && !b.fixed) b.y -= dir * over;
      if (b.fixed && !a.fixed) a.y += dir * over;
      moved = true;
    }
    if (!moved) break;
  }
  for (const q of nodes) q.y = Math.max(FLOOR + 3, Math.min(CEIL - 10, Math.round(q.y)));

  // ---- 焼き込む
  const stamp = (px: number, pz: number, py: number): void => {
    const x0 = Math.round(px);
    const z0 = Math.round(pz);
    for (let dx = -SHOULDER; dx <= SHOULDER; dx++) {
      for (let dz = -SHOULDER; dz <= SHOULDER; dz++) {
        const d = Math.round(Math.hypot(dx, dz));
        if (d > SHOULDER) continue;
        const px2 = x0 + dx;
        const pz2 = z0 + dz;
        if (!inArea(px2, pz2)) continue;
        const i = idx(px2, pz2);
        if (d >= (dist[i] ?? 255)) continue;
        dist[i] = d;
        y[i] = Math.round(py);
      }
    }
  };

  for (const [ai, bi] of edges) {
    const a = nodes[ai];
    const b = nodes[bi];
    if (a === undefined || b === undefined) continue;
    const pts = wiggle(a, b, r, 3);
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      if (p0 !== undefined && p1 !== undefined) total += Math.hypot(p1.x - p0.x, p1.z - p0.z);
    }
    let run = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      if (p0 === undefined || p1 === undefined) continue;
      const seg = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const steps = Math.max(1, Math.ceil(seg * 2));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const at = (run + seg * t) / Math.max(1, total);
        stamp(p0.x + (p1.x - p0.x) * t, p0.z + (p1.z - p0.z) * t, a.y + (b.y - a.y) * at);
      }
      run += seg;
    }
  }

  return { dist, y };
}

export function shapeOf(seed: number): Shape {
  const r = rng(seed);
  const p: number[] = [];
  for (let i = 0; i < 10; i++) p.push(r() * 100);

  // ---- 尾根の族。**細く、長く**
  const ridges: Ridge[] = [];
  const count = 5 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    // **波長は 80〜170 マス。**
    // 0.006 まで下げたら尾根が 3 本しか出ず、ただの平原になった（2026-09-01 の写真）。
    // **零線の間隔 ＝ π / f** なので、これくらいで「細い山が連続」する。
    const f = 0.019 + r() * 0.021;
    ridges.push({
      f,
      // **太さは細かさに比例**。`f * 15〜27` で、裾の幅がだいたい 30〜54 マス。
      // これより細いと**ナイフの刃**になり、登ることも歩くこともできない（2026-09-01 の写真）
      w: f * (15 + r() * 12),
      h: 40 + r() * 80,
      a: r() * 100,
      b: r() * 100,
    });
  }

  // ---- 頂
  const peaks: Peak[] = [];
  const pk = 3 + Math.floor(r() * 3);
  for (let guard = 0; guard < 400 && peaks.length < pk; guard++) {
    const x = AREA.x1 + 40 + Math.floor(r() * (AREA.x2 - AREA.x1 - 80));
    const z = AREA.z1 + 40 + Math.floor(r() * (AREA.z2 - AREA.z1 - 80));
    if (fieldDist(x, z) < 110) continue;
    let near = false;
    for (const q of peaks) if (Math.hypot(q.x - x, q.z - z) < 90) near = true;
    if (near) continue;
    peaks.push({ x, z, r: 34 + Math.round(r() * 34), h: 90 + Math.round(r() * 95) });
  }

  const half: Omit<Shape, "roads"> = {
    p,
    ridges,
    peaks,
    grain: Math.floor(r() * 1000000),
    // **谷底。** ここが歩く高さ
    base: 18 + Math.round(r() * 10),
  };
  return { ...half, roads: roadsOf(half, r) };
}

/** その升の道（**無ければ `undefined`**） */
function roadAt(x: number, z: number, s: Shape): { d: number; y: number } | undefined {
  if (!inArea(x, z)) return undefined;
  const i = idx(x, z);
  const d = s.roads.dist[i] ?? 255;
  if (d > SHOULDER) return undefined;
  return { d, y: s.roads.y[i] ?? FIELD_Y };
}

/**
 * その柱の地面の高さ。
 *
 * | 道と地面 | どうするか |
 * | --- | --- |
 * | 地面が高い | **削る**（切り通し） |
 * | 少し低い | **盛る**（土手） |
 * | 大きく低い | **触らない**——`bridgeAt` が橋を架ける |
 */
export function heightAt(x: number, z: number, s: Shape): number {
  const rock = rockAt(x, z, s);
  const road = roadAt(x, z, s);
  if (road === undefined) return rock;
  if (road.y - rock > BRIDGE_GAP) return rock;
  if (road.d <= HALF) return road.y;
  const k = (road.d - HALF) / (SHOULDER - HALF);
  return Math.round(road.y * (1 - k) + rock * k);
}

/** そこに橋が要るか。**要るなら桁の高さと、欄干・橋脚の有無。** */
export function bridgeAt(x: number, z: number, s: Shape): { y: number; rail: boolean; pillar: boolean } | undefined {
  const road = roadAt(x, z, s);
  if (road === undefined || road.d > HALF) return undefined;
  const rock = rockAt(x, z, s);
  if (road.y - rock <= BRIDGE_GAP) return undefined;
  return {
    y: road.y,
    rail: road.d >= HALF,
    pillar: road.d <= 1 && Math.abs(Math.round(x) * 7 + Math.round(z) * 13) % 9 === 0,
  };
}

// ---------------------------------------------------------------- 石の表
//
// > ### 戦場に近いほど黒く、遠いほど明るく
// >
// > 要塞は黒い石で建っている。**その足元が明るい岩だと浮く。**
// > **明るさを 5 段の表にして、距離と高さで段を選ぶ。**
// >
// > **段の中は種類を多くする。** 少ないと「同じ石が貼ってあるだけ」に見える。

/** 0 段目：**いちばん暗い**（戦場のすぐ外） */
const T0 = [
  "blackstone",
  "polished_blackstone",
  "polished_blackstone_bricks",
  "cracked_polished_blackstone_bricks",
  "chiseled_polished_blackstone",
  "deepslate",
  "cobbled_deepslate",
  "polished_deepslate",
  "deepslate_bricks",
  "cracked_deepslate_bricks",
  "deepslate_tiles",
  "cracked_deepslate_tiles",
  "chiseled_deepslate",
  "smooth_basalt",
  "basalt",
  "black_terracotta",
] as const;

/** 1 段目 */
const T1 = [
  "cobbled_deepslate",
  "deepslate",
  "deepslate_bricks",
  "deepslate_tiles",
  "polished_basalt",
  "basalt",
  "smooth_basalt",
  "tuff",
  "polished_tuff",
  "tuff_bricks",
  "gray_concrete",
  "blackstone",
  "gilded_blackstone",
  "mud",
  "packed_mud",
  "cobblestone",
] as const;

/** 2 段目：中間 */
const T2 = [
  "tuff",
  "polished_tuff",
  "tuff_bricks",
  "chiseled_tuff",
  "andesite",
  "polished_andesite",
  "cobblestone",
  "mossy_cobblestone",
  "stone",
  "cobbled_deepslate",
  "gravel",
  "coarse_dirt",
  "podzol",
  "packed_mud",
  "brown_terracotta",
  "clay",
] as const;

/** 3 段目 */
const T3 = [
  "stone",
  "andesite",
  "polished_andesite",
  "cobblestone",
  "mossy_cobblestone",
  "granite",
  "polished_granite",
  "stone_bricks",
  "mossy_stone_bricks",
  "cracked_stone_bricks",
  "gravel",
  "tuff",
  "clay",
  "dripstone_block",
  "coarse_dirt",
  "smooth_stone",
] as const;

/** 4 段目：**いちばん明るい**（外周）。**それでも白い石は入れない** */
const T4 = [
  "stone",
  "smooth_stone",
  "granite",
  "polished_granite",
  "diorite",
  "calcite",
  "dripstone_block",
  "andesite",
  "cobblestone",
  "chiseled_stone_bricks",
  "stone_bricks",
  "cracked_stone_bricks",
  "gravel",
  "clay",
  "tuff",
  "polished_andesite",
] as const;

const TONES: ReadonlyArray<readonly string[]> = [T0, T1, T2, T3, T4];

/** 棚地の緑 */
const LEDGE = [
  "moss_block",
  "grass",
  "podzol",
  "coarse_dirt",
  "moss_block",
  "grass_path",
  "grass",
  "mud",
  "packed_mud",
  "dirt",
] as const;

/** 谷底の土 */
const SOIL = [
  "coarse_dirt",
  "gravel",
  "podzol",
  "dirt",
  "mud",
  "packed_mud",
  "clay",
  "grass_path",
  "brown_terracotta",
  "coarse_dirt",
] as const;

/** 舗装（**要塞の目の前だけ**） */
const PAVED = [
  "cobbled_deepslate",
  "deepslate_bricks",
  "polished_blackstone_bricks",
  "cobblestone",
  "deepslate_tiles",
  "gravel",
  "cracked_deepslate_bricks",
  "blackstone",
] as const;

/** けものみち。**踏み固められた土**が主。石畳にしない */
const TRAIL = ["grass_path", "coarse_dirt", "dirt", "grass_path", "gravel", "podzol", "coarse_dirt", "mud"] as const;

/**
 * まだらの値（0〜1）から 1 つ選ぶ。
 *
 * **表を並べるだけで種類を増やせる。** まだらの値は滑らかなので、**同じ石が塊で出る。**
 */
function pick(t: number, list: readonly string[]): string {
  const i = Math.floor(Math.max(0, Math.min(0.999, t)) * list.length);
  return list[i] ?? "stone";
}

/** その場所の明るさの段（0〜4） */
function toneOf(x: number, z: number, h: number, v: number): number {
  const far = Math.min(1, fieldDist(x, z) / 300);
  const up = Math.max(0, Math.min(1, (h - 30) / 150));
  const t = far * 0.6 + up * 0.25 + (v - 0.5) * 0.5;
  return Math.max(0, Math.min(TONES.length - 1, Math.floor(t * TONES.length)));
}

/** まだら（滑らかな波。0〜1） */
function patch(x: number, z: number, s: Shape): number {
  const p = s.p;
  const g = n(x, z, 0.013, p[5] ?? 0, p[6] ?? 0);
  const f = n(x, z, 0.062, p[8] ?? 0, p[4] ?? 0);
  return Math.max(0, Math.min(1, (g * 0.72 + f * 0.28 + 1) / 2));
}

/** 路面のブロック。**要塞の目の前だけ舗装、あとはけものみち** */
function roadBlock(x: number, z: number, s: Shape): string {
  const q = grain(x, z, s.grain + 31);
  return fieldDist(x, z) < PAVE ? pick(q, PAVED) : pick(q, TRAIL);
}

/** 橋のブロック。**暗い木**（樫は安っぽい） */
export function bridgeBlock(x: number, z: number, s: Shape, what: "deck" | "rail" | "pillar"): string {
  const q = grain(x, z, s.grain + 37);
  if (what === "rail") return "dark_oak_fence";
  if (what === "pillar") return q < 0.6 ? "dark_oak_log" : "stripped_dark_oak_log";
  return q < 0.7 ? "dark_oak_planks" : "spruce_planks";
}

/**
 * 表面のブロック（**柱のいちばん上 1 マス**）。
 *
 * **急な斜面は岩肌**（土も草も乗らない）。**平らな棚には苔と草。**
 * **谷底の平らな所は土。** **道は路面。**
 */
export function surfaceAt(x: number, z: number, h: number, s: Shape, steep: number): string {
  const road = roadAt(x, z, s);
  if (road !== undefined && road.d <= HALF && road.y - rockAt(x, z, s) <= BRIDGE_GAP) return roadBlock(x, z, s);

  const q = grain(x, z, s.grain);
  // **正門前の広場は舗装**（縁は砂利混じりで地面へ溶かす）
  const court = courtAt(x, z);
  if (court > 0.35) return pick(q * (0.6 + court * 0.4), PAVED);
  const v = patch(x, z, s);
  const p = s.p;

  if (steep <= 1 && h < 150 && v > 0.72) return pick(q, LEDGE);

  const row = TONES[toneOf(x, z, h, v)] ?? T2;
  const far = fieldDist(x, z) / 300;
  if (steep <= 1 && h < 45 && far > 0.35 && q > 0.45) return pick(v * 0.5 + q * 0.5, SOIL);

  // **粒を効かせすぎると砂嵐になる。** まだらで選び、粒は表 2〜3 個ぶんだけ揺らす
  const spot = n(x, z, 0.21, p[1] ?? 0, p[7] ?? 0) * 0.1;
  return pick(v + spot + (q - 0.5) * 0.16, row);
}

/**
 * 地層。**表面の下に何が積んであるか。**
 *
 * > ### 崖は「下の石」がそのまま見える
 * >
 * > 表面 1 マスだけ気を配っても、**切り立った面は積んである石が出る。**
 * > ここが 1 種類だと「岩肌に土が貼ってあるだけ」に見えた（2026-09-01 実機）。
 *
 * **6 マスごとに層を替える。** 層の境目は場所によって上下する（`wobble`）ので、
 * **地層が波打って見える**——定規で引いた縞にはならない。
 *
 * 石は表面と同じ 5 段の表から選ぶので、**戦場に近いほど黒い崖**になる。
 */
export function strataAt(x: number, z: number, y: number, s: Shape): string {
  // **境目の上下は 16 マスの升ごと**（`land.ts` がまとめて置けるように、細かくしない）
  const cell = grain(x >> 4, z >> 4, s.grain + 53);
  const band = Math.floor((y + cell * BAND) / BAND);

  const v = patch(x, z, s);
  const row = TONES[toneOf(x, z, y, v)] ?? T2;
  // 層ごとに 1 つ引く（**同じ層は同じ石**）
  const pickAt = grain(band, x >> 6, s.grain + 71);
  return pick(pickAt * 0.75 + v * 0.25, row);
}

/** そこは戦場の中か（**触らない**） */
export function inField(x: number, z: number): boolean {
  return x >= FIELD.x1 && x <= FIELD.x2 && z >= FIELD.z1 && z <= FIELD.z2;
}

export const LIMITS = { FLOOR, SKY, FIELD_Y, BAND } as const;
