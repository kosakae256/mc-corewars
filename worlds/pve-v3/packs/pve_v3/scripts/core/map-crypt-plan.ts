/**
 * 15. 地下墓所——**間取り・寸法。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 15 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 *   z ＝ −45  入口の階段室（湧く所の窪み）
 *   z ＝ −43  前室 ──┬── 骨堂（西）／崩れの間（東）
 *   z ＝ −34  参道    │   低く狭い。楣（まぐさ）をくぐって進む
 *   z ＝ −28  柱の林 ─┴── **主戦場。** 交差ヴォールトと柱の林
 *   z ＝  −5  沈んだ墓室（円。床が 1 段低い）——天蓋と大石棺
 *   z ＝   0  東西の納骨廊（壁龕に棺。西は水が溜まっている）
 *   z ＝ +17  戸口 3 つ
 *   z ＝ +20  玄室——奥の見どころ
 *   z ＝ +39  ゲートの箱  **空けておく**
 * ```
 *
 * > ### **積まずに彫る**（`map-stronghold-plan.ts` と同じ）
 * >
 * > **積むと外壁だけが天井より高くなり、0-8 の塗り広げから切り離される。**
 * > **塊を置いてから彫れば、上から見た高さはどこも平ら**——
 * > 彫り残しがそのまま壁になるので、**浮いたブロックも出ない**（0-5）。
 *
 * > ### **x ＝ 0 の筋は、y ＝ 1〜7 を塞がない**
 * >
 * > 検査 0-3 は**湧く所の目からゲートへ線を引く**（`14-map-build.md` 0-9）。
 * > **前室 → 参道 → 柱の林 → 沈んだ墓室 → 中央の戸口 → 玄室**を
 * > **一直線に通し、そこに柱も棺も立てない。**
 * > **天蓋の梁は y ＝ 7**——線（z ＝ −18〜8 では y ＝ 3〜5）の上を跨ぐ。
 */

import { GROUND, noise, smoothWave } from "./map-frame.js";

/** 種。**変えれば苔とひびの散り方が変わる** */
export const SEED = 3781;

/** 岩の塊。**±50 の内側で、放射がどの向きでも奈落に出る大きさ** */
export const MASS_TOP = 17;
export const MASS_BOT = -14;
export const MASS_R = 48;
export const MASS_WOBBLE = 0.8;

/** 天井の段。**通路は 5〜6 マス、広間は 8〜12 マス空ける**（弓が使えるように） */
export const HYPO = 7;
export const GALLERY = 6;
export const DOOR = 5;

/** 沈んだ墓室。**円。床が 1 段低い**——段差 1 マスなので敵も降りて登れる（0-8） */
export const ROT = { x: 0, z: -5, r: 13 } as const;
export const ROT_FLOOR = GROUND - 1;

/** 柱の格子。**人が作ったものなので、位置は揃っていてよい**（0-6 の但し書き） */
export const STEP = 8;
export const GX0 = -28;
export const GZ0 = -26;

/** 部屋 1 つ。**天井のブロックの段が `ceil`。空は `floor`＋1 〜 `ceil`−1** */
export interface Space {
  readonly name: string;
  readonly x1: number;
  readonly x2: number;
  readonly z1: number;
  readonly z2: number;
  readonly ceil: number;
  /** 床の段。**書かなければ y ＝ 0** */
  readonly floor?: number;
  /** **長方形に内接する楕円で切る**（円い部屋） */
  readonly round?: boolean;
}

/**
 * 間取り。**重なったら天井は高いほうが、床は低いほうが勝つ。**
 *
 * **行き止まりを作らない**——納骨廊は連絡廊で輪にし、
 * **骨堂と崩れの間には、前室と柱の林の両方から口を開ける。**
 */
export const SPACES: readonly Space[] = [
  // ---- 手前。**降りてきた所**
  { name: "入口", x1: -5, x2: 5, z1: -45, z2: -44, ceil: GALLERY },
  { name: "前室", x1: -9, x2: 9, z1: -43, z2: -34, ceil: 9 },
  { name: "参道", x1: -3, x2: 3, z1: -34, z2: -28, ceil: HYPO },

  // ---- 前室の左右。**骨堂と、土が流れ込んだ所**
  { name: "骨堂", x1: -22, x2: -12, z1: -38, z2: -31, ceil: HYPO },
  { name: "崩れの間", x1: 12, x2: 22, z1: -38, z2: -31, ceil: HYPO },
  { name: "戸口", x1: -11, x2: -10, z1: -39, z2: -37, ceil: DOOR },
  { name: "戸口", x1: 10, x2: 11, z1: -39, z2: -37, ceil: DOOR },
  { name: "戸口", x1: -21, x2: -19, z1: -30, z2: -29, ceil: DOOR },
  { name: "戸口", x1: 19, x2: 21, z1: -30, z2: -29, ceil: DOOR },

  // ---- 主室。**彫り残しが壁になる**
  { name: "柱の林", x1: -31, x2: 31, z1: -28, z2: 16, ceil: HYPO },
  { name: "沈んだ墓室", x1: -13, x2: 13, z1: -18, z2: 8, ceil: 12, floor: ROT_FLOOR, round: true },

  // ---- 東西の納骨廊。**低くて狭い。輪にして行き止まりを消す**
  { name: "西の納骨廊", x1: -43, x2: -30, z1: -9, z2: -5, ceil: GALLERY },
  { name: "東の納骨廊", x1: 30, x2: 43, z1: -9, z2: -5, ceil: GALLERY },
  { name: "水の納骨廊", x1: -43, x2: -30, z1: 3, z2: 7, ceil: GALLERY, floor: GROUND - 1 },
  { name: "東の納骨廊", x1: 30, x2: 43, z1: 3, z2: 7, ceil: GALLERY },
  { name: "西の連絡廊", x1: -43, x2: -39, z1: -9, z2: 7, ceil: GALLERY },
  { name: "東の連絡廊", x1: 39, x2: 43, z1: -9, z2: 7, ceil: GALLERY },

  // ---- 奥。**戸口 3 つを抜けて玄室へ**
  { name: "中央の戸口", x1: -4, x2: 4, z1: 17, z2: 19, ceil: HYPO },
  { name: "西の戸口", x1: -17, x2: -14, z1: 17, z2: 19, ceil: GALLERY },
  { name: "東の戸口", x1: 14, x2: 17, z1: 17, z2: 19, ceil: GALLERY },
  { name: "玄室", x1: -19, x2: 19, z1: 20, z2: 38, ceil: 10 },
];

/**
 * 塊の縁。
 *
 * **`smoothWave` を使う**（`wave` ではない）——
 * **格子の境で値が飛ぶと、縁が階段状に裂けて塊が 2 つに割れる**（0-5）。
 */
export function massRadius(x: number, z: number): number {
  return MASS_R + MASS_WOBBLE * smoothWave(SEED + 3, x, z, 26);
}

/** そこが塊の中か */
export function inMass(x: number, z: number): boolean {
  return Math.hypot(x, z) <= massRadius(x, z);
}

/** 柱の格子からの隔たり。**0.5 が柱の芯** */
function bayDist(v: number, origin: number): number {
  const m = (((v - origin) % STEP) + STEP) % STEP;
  const d = Math.abs(m - 0.5);
  return Math.min(d, STEP - d);
}

/**
 * **交差ヴォールトの持ち上げ。**
 *
 * **柱の格子に沿った 2 マスがリブ**（持ち上げない）。
 * その間を 1 段、中央をもう 1 段持ち上げると、
 * **下から見たとき、柱と柱の間に十字の稜が浮かぶ。**
 */
export function vaultLift(x: number, z: number): number {
  const d = Math.min(bayDist(x, GX0), bayDist(z, GZ0));
  if (d >= 3) return 2;
  if (d >= 1.5) return 1;
  return 0;
}

/** 沈んだ墓室の丸天井。**中央が 12、縁が 9** */
function domeCeil(x: number, z: number): number {
  const d = Math.hypot(x - ROT.x, z - ROT.z);
  return 9 + Math.round(3 * Math.cos((Math.PI / 2) * Math.min(1, d / ROT.r)));
}

/** その部屋の、その 1 マスの天井の段 */
function ceilOf(s: Space, x: number, z: number): number {
  if (s.name === "沈んだ墓室") return domeCeil(x, z);
  if (s.name === "柱の林") return s.ceil + vaultLift(x, z);
  return s.ceil;
}

/** 開いている 1 柱 */
export interface Cell {
  ceil: number;
  floor: number;
}

const OPEN: Map<string, Cell> = ((): Map<string, Cell> => {
  const m = new Map<string, Cell>();
  for (const s of SPACES) {
    const cx = (s.x1 + s.x2) / 2;
    const cz = (s.z1 + s.z2) / 2;
    const rx = (s.x2 - s.x1) / 2 + 0.5;
    const rz = (s.z2 - s.z1) / 2 + 0.5;
    for (let x = s.x1; x <= s.x2; x++) {
      for (let z = s.z1; z <= s.z2; z++) {
        if (s.round === true && Math.hypot((x - cx) / rx, (z - cz) / rz) > 1) continue;
        const ceil = ceilOf(s, x, z);
        const floor = s.floor ?? GROUND;
        const k = `${x},${z}`;
        const cur = m.get(k);
        if (cur === undefined) m.set(k, { ceil, floor });
        else {
          cur.ceil = Math.max(cur.ceil, ceil);
          cur.floor = Math.min(cur.floor, floor);
        }
      }
    }
  }
  return m;
})();

/** その柱の天井の段。**0 なら岩のまま** */
export function ceilAt(x: number, z: number): number {
  return OPEN.get(`${x},${z}`)?.ceil ?? 0;
}

/** その柱の床の段 */
export function floorAt(x: number, z: number): number {
  return OPEN.get(`${x},${z}`)?.floor ?? GROUND;
}

/** そこが部屋の中か */
export function isOpen(x: number, z: number): boolean {
  return OPEN.has(`${x},${z}`);
}

/** 縦に 1 本ぶん。**同じ天井・同じ床が続く z をまとめて 1 手にする** */
export interface Run {
  readonly x: number;
  readonly z1: number;
  readonly z2: number;
  readonly ceil: number;
  readonly floor: number;
}

/**
 * 柱の集まりを、**x ごとの帯**にまとめる。
 *
 * **1 柱 1 手で流すと、主室だけで 1 万手を超える。**
 */
export function runsOf(cols: ReadonlyMap<string, Cell>): Run[] {
  const byX = new Map<number, { z: number; c: Cell }[]>();
  for (const [k, c] of cols) {
    const p = k.split(",");
    const x = Number(p[0]);
    const z = Number(p[1]);
    const list = byX.get(x);
    if (list === undefined) byX.set(x, [{ z, c }]);
    else list.push({ z, c });
  }
  const out: Run[] = [];
  for (const [x, list] of byX) {
    list.sort((a, b) => a.z - b.z);
    let head = 0;
    for (let i = 0; i < list.length; i++) {
      const cur = list[i] as { z: number; c: Cell };
      const nx = list[i + 1];
      if (nx !== undefined && nx.z === cur.z + 1 && nx.c.ceil === cur.c.ceil && nx.c.floor === cur.c.floor) continue;
      const first = list[head] as { z: number; c: Cell };
      out.push({ x, z1: first.z, z2: cur.z, ceil: cur.c.ceil, floor: cur.c.floor });
      head = i + 1;
    }
  }
  return out;
}

/** 部屋の柱を帯にしたもの */
export function roomRuns(): readonly Run[] {
  return runsOf(OPEN);
}

/**
 * 壁になる柱。**部屋に面した、彫られていない柱**（斜めも含む）。
 *
 * **彫りっぱなしの生石を見せない**ため、あとで面を張り替える。
 */
export function wallColumns(): ReadonlyMap<string, Cell> {
  const m = new Map<string, Cell>();
  for (const [k, c] of OPEN) {
    const p = k.split(",");
    const x = Number(p[0]);
    const z = Number(p[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const n = `${x + dx},${z + dz}`;
        if (OPEN.has(n)) continue;
        const cur = m.get(n);
        if (cur === undefined) m.set(n, { ceil: c.ceil, floor: c.floor });
        else {
          cur.ceil = Math.max(cur.ceil, c.ceil);
          cur.floor = Math.min(cur.floor, c.floor);
        }
      }
    }
  }
  return m;
}
