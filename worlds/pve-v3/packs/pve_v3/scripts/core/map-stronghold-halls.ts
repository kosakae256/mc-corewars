/**
 * 10. 石の要塞——**廊下と玄関の意匠。** 付け柱・横帯・戸口の楣（まぐさ）。
 *
 * 間取りは `map-stronghold-plan.ts`。
 *
 * > ### **平らな一枚壁は、それ自体が手抜き**（`14-map-build.md` 0-4）
 * >
 * > **廊下は長い。** 付け柱と横帯で刻まないと、ただの筒になる。
 *
 * > ### **x ＝ 0 の筋には何も立てない**
 * >
 * > 検査 0-3 の線が通る（`14-map-build.md` 0-9）。
 * > **背骨（|x| ≤ 4）に付け柱を立てない**のはそのため。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { SEED, SPACES, ceilAt, floorAt, isOpen, stoneAt } from "./map-stronghold-plan.js";

/** 廊下 1 本。**`along` が長手の向き** */
interface Corridor {
  readonly x1: number;
  readonly x2: number;
  readonly z1: number;
  readonly z2: number;
  readonly along: "x" | "z";
  /** 付け柱の間隔。**本ごとに変える**——同じ律動を並べない（0-6） */
  readonly step: number;
}

/** 一周する廊下と、背骨の 2 本 */
const CORRIDORS: readonly Corridor[] = [
  { x1: -31, x2: 31, z1: -31, z2: -28, along: "x", step: 7 },
  { x1: -31, x2: 31, z1: 22, z2: 25, along: "x", step: 8 },
  { x1: -31, x2: -28, z1: -31, z2: 25, along: "z", step: 9 },
  { x1: 28, x2: 31, z1: -31, z2: 25, along: "z", step: 7 },
  { x1: -4, x2: 4, z1: -28, z2: -6, along: "z", step: 6 },
  { x1: -4, x2: 4, z1: 10, z2: 26, along: "z", step: 5 },
];

/**
 * 廊下の意匠と、戸口の楣。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function corridorOps(ops: BuildOp[]): void {
  for (const c of CORRIDORS) {
    pilasters(ops, c);
    wallTorches(ops, c);
    ceilLamps(ops, c);
  }
  lintels(ops);
}

/**
 * 付け柱の間に立てる松明。
 *
 * **付け柱だけだと 7〜9 マスおきになり、その間が真っ暗**になる。
 * **バニラの要塞も、廊下は松明で繋いである。**
 */
function wallTorches(ops: BuildOp[], c: Corridor): void {
  const lo = c.along === "x" ? c.x1 : c.z1;
  const hi = c.along === "x" ? c.x2 : c.z2;
  const sides = c.along === "x" ? [c.z1, c.z2] : [c.x1, c.x2];
  let i = 0;
  for (let t = lo + 4; t <= hi - 3; t += 6, i++) {
    if (c.along === "x" && Math.abs(t) <= 5) continue;
    // **左右で交互に立てる**——両側に揃えると、廊下が滑走路に見える（0-6）
    const s = sides[i % 2];
    const x = c.along === "x" ? t : s;
    const z = c.along === "x" ? s : t;
    if (ceilAt(x, z) === 0) continue;
    ops.push(fill(x, GROUND + 1, z, x, GROUND + 2, z, "cobblestone_wall"));
    ops.push(set(x, GROUND + 3, z, "torch"));
  }
}

/** 天井を刳る部屋。**廊下と戸口には掛けない**（低すぎて効かない） */
const COVED = [
  "玄関の間",
  "図書室",
  "牢",
  "中央の広間",
  "井戸の間",
  "石棺の間",
  "苔の間",
  "崩れの間",
  "貯水の間",
  "ポータル部屋",
];

/**
 * 部屋の天井の縁を、1 段下げる。
 *
 * **平らな一枚天井は、平らな一枚壁と同じで手抜きに見える**（`14-map-build.md` 0-4）。
 * **縁を落とすと、真ん中が持ち上がって見える。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function coveOps(ops: BuildOp[]): void {
  for (const s of SPACES) {
    if (!COVED.includes(s.name)) continue;
    for (let x = s.x1; x <= s.x2; x++) {
      for (let z = s.z1; z <= s.z2; z++) {
        if (x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2) continue;
        ops.push(set(x, s.ceil - 1, z, stoneAt(x, s.ceil - 1, z)));
      }
    }
  }
}

/**
 * 天井に埋める明かり。
 *
 * **面から出さない**——出っ張らせると 0-3 の線に当たる恐れがある。
 * **廊下が暗いと、石の帯も付け柱も見えない。**
 */
function ceilLamps(ops: BuildOp[], c: Corridor): void {
  const lo = c.along === "x" ? c.x1 : c.z1;
  const hi = c.along === "x" ? c.x2 : c.z2;
  const mid = c.along === "x" ? Math.round((c.z1 + c.z2) / 2) : Math.round((c.x1 + c.x2) / 2);
  for (let t = lo + 3; t <= hi - 3; t += 6) {
    const x = c.along === "x" ? t : mid;
    const z = c.along === "x" ? mid : t;
    const top = ceilAt(x, z);
    if (top === 0) continue;
    ops.push(set(x, top, z, "glowstone"));
  }
}

/** 付け柱と、その間に渡す横帯 */
function pilasters(ops: BuildOp[], c: Corridor): void {
  const lo = c.along === "x" ? c.x1 : c.z1;
  const hi = c.along === "x" ? c.x2 : c.z2;
  const sides = c.along === "x" ? [c.z1, c.z2] : [c.x1, c.x2];
  for (let t = lo + 2; t <= hi - 2; t += c.step) {
    // **背骨と交わる所は空ける**——0-3 の線が通る
    if (c.along === "x" && Math.abs(t) <= 5) continue;
    for (const s of sides) {
      const x = c.along === "x" ? t : s;
      const z = c.along === "x" ? s : t;
      const top = ceilAt(x, z);
      if (top === 0) continue;
      ops.push(fill(x, GROUND + 1, z, x, top - 1, z, "stone_bricks"));
      ops.push(set(x, GROUND + 1, z, "chiseled_stone_bricks"));
      ops.push(set(x, top - 1, z, "chiseled_stone_bricks"));
      // ---- 灯りは**柱に埋める。**
      //
      // > ### 柱の内側に腕木を出したら、廊下が塞がった
      // >
      // > **廊下は 4 マス幅。** 両端に付け柱、その内側に腕木を出すと
      // > **4 マスとも埋まって、その線で道が断たれていた**（2026-09-06 に絵で見つけた）。
      // > **出っ張りを付けない。** 柱の中に明かりを埋めれば、幅は減らない。
      ops.push(set(x, GROUND + 4, z, "glowstone"));
    }
    ceilBand(ops, c, t);
  }
}

/** 横帯。**天井の面だけ彫り石に替える**——出っ張らせないので視線を遮らない */
function ceilBand(ops: BuildOp[], c: Corridor, t: number): void {
  const lo = c.along === "x" ? c.z1 : c.x1;
  const hi = c.along === "x" ? c.z2 : c.x2;
  for (let s = lo; s <= hi; s++) {
    const x = c.along === "x" ? t : s;
    const z = c.along === "x" ? s : t;
    const top = ceilAt(x, z);
    if (top === 0) continue;
    ops.push(set(x, top, z, "chiseled_stone_bricks"));
  }
}

/**
 * 戸口の楣。**開口の頭を彫り石にして、脇に立て枠を付ける。**
 *
 * **塞がない**——0 章の「跨ぐアーチは要石を落とす」と同じで、
 * **道を断つと部屋が孤立する。**
 */
function lintels(ops: BuildOp[]): void {
  for (const s of SPACES) {
    if (s.name !== "戸口") continue;
    for (let x = s.x1; x <= s.x2; x++) {
      for (let z = s.z1; z <= s.z2; z++) {
        ops.push(set(x, s.ceil, z, "chiseled_stone_bricks"));
        ops.push(set(x, s.ceil - 1, z, stoneAt(x, s.ceil - 1, z)));
      }
    }
    // ---- 脇の立て枠。**開口の外側の柱を彫り石にする**
    for (const [x, z] of jambs(s.x1, s.x2, s.z1, s.z2)) {
      if (isOpen(x, z)) continue;
      ops.push(fill(x, GROUND + 1, z, x, s.ceil - 1, z, "chiseled_stone_bricks"));
    }
  }
}

/** 開口の左右にある柱の座標 */
function jambs(x1: number, x2: number, z1: number, z2: number): [number, number][] {
  const out: [number, number][] = [];
  if (x2 - x1 >= z2 - z1) {
    for (let z = z1; z <= z2; z++) {
      out.push([x1 - 1, z]);
      out.push([x2 + 1, z]);
    }
    return out;
  }
  for (let x = x1; x <= x2; x++) {
    out.push([x, z1 - 1]);
    out.push([x, z2 + 1]);
  }
  return out;
}

// ================================================================ 玄関

/** 玄関の間の範囲。**湧く所はこの手前の窪み**（z ＝ −45〜−44） */
const ENT = { x1: -8, x2: 8, z1: -43, z2: -34, ceil: 11 } as const;

/**
 * 玄関の間。**列柱と、奥へ続く一段低い枠。**
 *
 * **x ＝ 0 には柱を置かない**——湧いた所からの視線が通らなくなる。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function entranceOps(ops: BuildOp[]): void {
  entryPillars(ops);
  entryNiche(ops);
  entryFloor(ops);
  // ---- 明かり。**湧いた瞬間に見える場所なので、暗くしない**
  //
  // **天井は 11 マス上**で遠い。**壁の高さ 4 にも埋める。**
  for (const x of [-4, 0, 4]) {
    for (const z of [-42, -39, -36]) ops.push(set(x, ENT.ceil, z, "glowstone"));
  }
  for (const x of [-9, 9]) {
    for (const z of [-42, -39, -36]) ops.push(set(x, GROUND + 4, z, "glowstone"));
  }
}

/** 6 本の列柱。**根元と柱頭に彫り石の帯** */
function entryPillars(ops: BuildOp[]): void {
  for (const x of [-6, 6]) {
    for (const z of [-41, -38, -35]) {
      // **柱に沿えた灯り台。目の高さより上に掛ける**
      const bx = x + (x < 0 ? 1 : -1);
      ops.push(fill(bx, GROUND + 1, z, bx, GROUND + 3, z, "cobblestone_wall"));
      ops.push(set(bx, GROUND + 4, z, "lantern"));
      ops.push(fill(x, GROUND + 1, z, x, ENT.ceil - 1, z, "stone_bricks"));
      for (let y = GROUND + 1; y < ENT.ceil; y++) {
        const b = stoneAt(x, y, z);
        if (b !== "stone_bricks") ops.push(set(x, y, z, b));
      }
      ops.push(set(x, GROUND + 1, z, "chiseled_stone_bricks"));
      ops.push(set(x, ENT.ceil - 1, z, "chiseled_stone_bricks"));
      ops.push(set(x, ENT.ceil - 4, z, "chiseled_stone_bricks"));
    }
  }
}

/** 湧く所の窪み。**枠を彫り石で囲って、正面だと分かるようにする** */
function entryNiche(ops: BuildOp[]): void {
  for (let x = -6; x <= 6; x++) ops.push(set(x, ENT.ceil, -43, "chiseled_stone_bricks"));
  for (const x of [-6, 6]) ops.push(fill(x, GROUND + 1, -44, x, 6, -44, "chiseled_stone_bricks"));
  for (let x = -5; x <= 5; x++) ops.push(set(x, 7, -44, "chiseled_stone_bricks"));
  // ---- 奥へ抜ける口の枠。**背骨の入口**
  for (const x of [-3, 3]) ops.push(fill(x, GROUND + 1, -34, x, 7, -34, "chiseled_stone_bricks"));
  for (let x = -3; x <= 3; x++) ops.push(set(x, 8, -34, "chiseled_stone_bricks"));
}

/** 床の紋様。**中央に彫り石の輪**——玄関だと分かる印 */
function entryFloor(ops: BuildOp[]): void {
  for (let x = -4; x <= 4; x++) {
    for (let z = -42; z <= -34; z++) {
      const d = Math.hypot(x, z + 38);
      if (d < 2.4 || d > 3.6) continue;
      ops.push(set(x, GROUND, z, "chiseled_stone_bricks"));
    }
  }
  for (let x = -8; x <= 8; x++) {
    for (let z = -43; z <= -34; z++) {
      if (noise(SEED + 113, x, 7, z) > 0.06) continue;
      ops.push(set(x, GROUND, z, floorAt(x, z) === "stone_bricks" ? "cobblestone" : "cobblestone"));
    }
  }
}
