/**
 * 10. 石の要塞——**間取り・寸法・材の引き方。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 10 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 *   z ＝ −45  湧く所（玄関の窪み）
 *   z ＝ −43  玄関の間 ────┐
 *   z ＝ −31  北廊下 ───┐  │  外を一周する廊下（北・南・東・西）
 *   z ＝ −25  図書室 ／ 牢  │  大廊下を挟んで左右に
 *   z ＝   0  中央の広間     │  噴水と 4 本の太柱。井戸の間・石棺の間
 *   z ＝ +19  苔の間 ／ 崩れの間
 *   z ＝ +25  南廊下 ───┘
 *   z ＝ +33  ポータル部屋   枠だけ（`14-map-build.md` 0-2-1）
 *   z ＝ +39  ゲートの箱     **空けておく**
 * ```
 *
 * > ### **岩の塊を置いてから、中を彫る**（`map-aqueduct.ts` と同じ）
 * >
 * > 屋内を「床と壁と天井を積む」で作ると、**天井の上が空になり、
 * > 外周の壁だけが飛び出して、0-8 の塗り広げから切り離される。**
 * >
 * > **半径 48 前後・天面 22 の岩で埋めてから彫れば**、
 * > 上から見た高さはどこも 22 で平ら——**登れない面が生まれない。**
 * > **彫り残しがそのまま壁と柱**になるので、**浮いたブロックも出ない**（0-5）。
 *
 * > ### **x ＝ 0 の筋は、y ＝ 1〜7 を塞がない**
 * >
 * > 検査 0-3 は**湧く所の目からゲートへ線を引く**（`14-map-build.md` 0-9）。
 * > その線は **x ＝ 0・y ＝ 2〜6** を通る。
 * > **玄関 → 大廊下 → 中央 → 南大廊下 → 前室 → ポータル部屋**を
 * > **一直線に通し、そこに柱も噴水も立てない。**
 */

import { GROUND, noise, smoothWave } from "./map-frame.js";

/** 種。**変えれば苔とひびの散り方が変わる** */
export const SEED = 3096;

/** 岩の塊。**±50 の内側で、放射がどの向きでも奈落に出る大きさ** */
export const MASS_TOP = 22;
export const MASS_BOT = -14;

/** 塊の半径。**真円にしない**——上から見たときの輪郭を崩す */
export const MASS_R = 48.4;
export const MASS_WOBBLE = 1.0;

/** 天井の段の目安。**通路は 6 マス、広間は 9〜13 マス空ける**（弓が使えるように） */
export const HALL = 7;
export const DOOR = 6;

/** 部屋 1 つ。**天井のブロックの段が `ceil`。空は 1 〜 ceil−1** */
export interface Space {
  readonly name: string;
  readonly x1: number;
  readonly x2: number;
  readonly z1: number;
  readonly z2: number;
  readonly ceil: number;
}

/**
 * 間取り。**上のものから順に彫る**（重なったら**天井が高いほうが勝つ**）。
 *
 * **部屋と部屋の間は、岩を 2 マス以上残す**——
 * 触れ合わせると壁が消えて、ひと続きの空洞になってしまう。
 */
export const SPACES: readonly Space[] = [
  // ---- 手前。**湧く所の窪みと玄関**
  { name: "玄関の窪み", x1: -5, x2: 5, z1: -45, z2: -44, ceil: HALL },
  { name: "玄関の間", x1: -8, x2: 8, z1: -43, z2: -34, ceil: 11 },
  { name: "玄関の廊", x1: -2, x2: 2, z1: -34, z2: -28, ceil: HALL },

  // ---- 外を一周する廊下。**行き止まりを作らないための輪**
  { name: "北廊下", x1: -31, x2: 31, z1: -31, z2: -28, ceil: HALL },
  { name: "南廊下", x1: -31, x2: 31, z1: 22, z2: 25, ceil: HALL },
  { name: "西廊下", x1: -31, x2: -28, z1: -31, z2: 25, ceil: HALL },
  { name: "東廊下", x1: 28, x2: 31, z1: -31, z2: 25, ceil: HALL },

  // ---- 背骨。**ここが 0-3 の視線の通り道**
  { name: "大廊下", x1: -4, x2: 4, z1: -28, z2: -6, ceil: 9 },
  { name: "南大廊下", x1: -4, x2: 4, z1: 10, z2: 26, ceil: 9 },

  // ---- 主な部屋
  { name: "図書室", x1: -25, x2: -8, z1: -25, z2: -9, ceil: 13 },
  { name: "牢", x1: 8, x2: 25, z1: -25, z2: -9, ceil: 9 },
  { name: "中央の広間", x1: -13, x2: 13, z1: -6, z2: 10, ceil: 14 },
  { name: "井戸の間", x1: -25, x2: -16, z1: -5, z2: 9, ceil: 9 },
  { name: "石棺の間", x1: 16, x2: 25, z1: -5, z2: 9, ceil: 9 },
  { name: "苔の間", x1: -25, x2: -15, z1: 12, z2: 19, ceil: 8 },
  { name: "崩れの間", x1: 15, x2: 25, z1: 12, z2: 19, ceil: 8 },
  { name: "貯水の間", x1: -41, x2: -35, z1: -9, z2: 9, ceil: 8 },
  { name: "掘りかけの間", x1: 35, x2: 41, z1: -9, z2: 9, ceil: 8 },

  // ---- 奥。**前室からポータル部屋へ**
  { name: "前室", x1: -5, x2: 5, z1: 26, z2: 28, ceil: 8 },
  { name: "ポータル部屋", x1: -12, x2: 12, z1: 28, z2: 38, ceil: 12 },

  // ---- 出入口。**3 マス幅。楣（まぐさ）は `lintels` が載せる**
  { name: "戸口", x1: -19, x2: -17, z1: -27, z2: -26, ceil: DOOR },
  { name: "戸口", x1: -27, x2: -26, z1: -19, z2: -17, ceil: DOOR },
  { name: "戸口", x1: -7, x2: -5, z1: -21, z2: -19, ceil: DOOR },
  { name: "戸口", x1: -7, x2: -5, z1: -14, z2: -12, ceil: DOOR },
  { name: "戸口", x1: 17, x2: 19, z1: -27, z2: -26, ceil: DOOR },
  { name: "戸口", x1: 26, x2: 27, z1: -19, z2: -17, ceil: DOOR },
  { name: "戸口", x1: 5, x2: 7, z1: -17, z2: -15, ceil: DOOR },
  { name: "戸口", x1: -27, x2: -26, z1: 0, z2: 2, ceil: DOOR },
  { name: "戸口", x1: -15, x2: -14, z1: 0, z2: 2, ceil: DOOR },
  { name: "戸口", x1: -22, x2: -20, z1: 10, z2: 11, ceil: DOOR },
  { name: "戸口", x1: 26, x2: 27, z1: 0, z2: 2, ceil: DOOR },
  { name: "戸口", x1: 14, x2: 15, z1: 0, z2: 2, ceil: DOOR },
  { name: "戸口", x1: 20, x2: 22, z1: 10, z2: 11, ceil: DOOR },
  { name: "戸口", x1: -22, x2: -20, z1: 20, z2: 21, ceil: DOOR },
  { name: "戸口", x1: 20, x2: 22, z1: 20, z2: 21, ceil: DOOR },
  { name: "戸口", x1: -34, x2: -32, z1: -1, z2: 1, ceil: DOOR },
  { name: "戸口", x1: 32, x2: 34, z1: -1, z2: 1, ceil: DOOR },
];

/**
 * 塊の縁。
 *
 * **`smoothWave` を使う**（`wave` ではない）——
 * **格子の境で値が飛ぶと、縁が階段状に裂けて塊が 2 つに割れる**（0-5）。
 * 波長 26 に対して振幅 1 なので、**隣のマスとの差は 0.1 マスに満たない。**
 */
export function massRadius(x: number, z: number): number {
  return MASS_R + MASS_WOBBLE * smoothWave(SEED + 3, x, z, 26);
}

/** そこが塊の中か */
export function inMass(x: number, z: number): boolean {
  return Math.hypot(x, z) <= massRadius(x, z);
}

/** 開いている柱。**鍵は `x,z`、値は天井の段** */
const OPEN: Map<string, number> = ((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of SPACES) {
    for (let x = s.x1; x <= s.x2; x++) {
      for (let z = s.z1; z <= s.z2; z++) {
        const k = `${x},${z}`;
        if ((m.get(k) ?? 0) < s.ceil) m.set(k, s.ceil);
      }
    }
  }
  return m;
})();

/** その柱の天井の段。**0 なら岩のまま** */
export function ceilAt(x: number, z: number): number {
  return OPEN.get(`${x},${z}`) ?? 0;
}

/** そこが部屋の中か */
export function isOpen(x: number, z: number): boolean {
  return OPEN.has(`${x},${z}`);
}

/** 縦に 1 本ぶん。**同じ天井が続く z をまとめて 1 手にする** */
export interface Run {
  readonly x: number;
  readonly z1: number;
  readonly z2: number;
  readonly ceil: number;
}

/**
 * 柱の集まりを、**x ごとの帯**にまとめる。
 *
 * **1 柱 1 手で流すと、部屋だけで 1 万手を超える。**
 * **同じ天井が並ぶ所は 1 回の `fill` で済む。**
 */
export function runsOf(cols: ReadonlyMap<string, number>): Run[] {
  const byX = new Map<number, { z: number; ceil: number }[]>();
  for (const [k, ceil] of cols) {
    const p = k.split(",");
    const x = Number(p[0]);
    const z = Number(p[1]);
    const list = byX.get(x);
    if (list === undefined) byX.set(x, [{ z, ceil }]);
    else list.push({ z, ceil });
  }
  const out: Run[] = [];
  for (const [x, list] of byX) {
    list.sort((a, b) => a.z - b.z);
    let head = 0;
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const next = list[i + 1];
      if (next !== undefined && next.z === cur.z + 1 && next.ceil === cur.ceil) continue;
      out.push({ x, z1: list[head].z, z2: cur.z, ceil: cur.ceil });
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
 * **面を石レンガに張り替える**ため——彫りっぱなしの生石を見せない。
 * 値は**そこに面している中でいちばん高い天井。**
 */
export function wallColumns(): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const [k, ceil] of OPEN) {
    const p = k.split(",");
    const x = Number(p[0]);
    const z = Number(p[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const n = `${x + dx},${z + dz}`;
        if (OPEN.has(n)) continue;
        if ((m.get(n) ?? 0) < ceil) m.set(n, ceil);
      }
    }
  }
  return m;
}

// ================================================================ 材

/**
 * 壁と天井の石。**1 マスごとに引く**（`14-map-build.md` 0-7）。
 *
 * **苔は低い所へ寄せる**——バニラの要塞も、床際ほど苔とひびが多い。
 */
export function stoneAt(x: number, y: number, z: number): string {
  const wet = y <= GROUND + 1 ? 1 : y <= GROUND + 3 ? 0.5 : 0;
  const r = noise(SEED + 17, x, y, z);
  // **苔を多めに引く**——ひびも玉石も画面では同じ灰色で、
  // **緑の苔だけが「古びている」と分かる唯一の手掛かり**になる
  if (r < 0.1 + 0.14 * wet) return "mossy_stone_bricks";
  if (r < 0.18 + 0.2 * wet) return "mossy_cobblestone";
  if (r < 0.3) return "cracked_stone_bricks";
  if (r < 0.34) return "cobblestone";
  return "stone_bricks";
}

/** 床。**踏まれる所なので、割れと苔を少し多めに** */
export function floorAt(x: number, z: number): string {
  const r = noise(SEED + 31, x, 3, z);
  if (r < 0.1) return "cracked_stone_bricks";
  if (r < 0.2) return "mossy_stone_bricks";
  if (r < 0.26) return "mossy_cobblestone";
  if (r < 0.3) return "cobblestone";
  return "stone_bricks";
}

/** 天井。**苔は付きにくい**ので、ひびを主にする */
export function ceilBlockAt(x: number, z: number): string {
  const r = noise(SEED + 43, x, 9, z);
  if (r < 0.14) return "cracked_stone_bricks";
  if (r < 0.24) return "mossy_stone_bricks";
  if (r < 0.28) return "mossy_cobblestone";
  return "stone_bricks";
}

/** 塊の天面に混ぜる材。**上から見たとき、のっぺりした円盤にしない** */
export const CAP_MATS = ["stone", "andesite", "cobblestone", "cobblestone", "deepslate", "mossy_cobblestone"];
