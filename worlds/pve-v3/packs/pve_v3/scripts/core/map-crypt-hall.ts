/**
 * 15. 地下墓所——**入口から主室まで。** 前室・参道・柱の林。
 *
 * 間取りは `map-crypt-plan.ts`、材は `map-crypt-mat.ts`、造作は `map-crypt-fit.ts`。
 *
 * > ### **柱の林が主戦場**
 * >
 * > **平面だけの戦い**（企画）なので、**遮蔽は柱しかない。**
 * > **太い柱・細い柱・折れた柱**を混ぜて、隠れ方を変える。
 *
 * > ### **交差ヴォールトは、彫り方で作る**
 * >
 * > 天井を 3 段（リブ 7 ／ 迫り 8 ／ 中央 9）に彫ると、
 * > **柱と柱の間に十字の稜が浮かぶ**（`map-crypt-plan.ts` の `vaultLift`）。
 * > **積んでいないので、浮きも段差も出ない。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { GX0, GZ0, HYPO, ROT, SEED, STEP, ceilAt, floorAt, isOpen } from "./map-crypt-plan.js";
import { INLAY, pillarAt, stoneAt } from "./map-crypt-mat.js";
import { cobweb, coffin, hang, lamp, niche, pick, pilaster, stand } from "./map-crypt-fit.js";

/** 柱 1 本。**太さと様子を散らす**（0-6） */
interface Pillar {
  readonly x: number;
  readonly z: number;
  /** 1 か 2。**太い柱と細い柱を混ぜる** */
  readonly w: number;
  /** 0 太い / 1 細い / 2 折れている */
  readonly style: number;
}

/**
 * 柱の林。**格子に立てるが、太さと様子は 1 本ずつ引く。**
 *
 * **参道（|x| ≤ 3）と沈んだ墓室には立てない**——
 * 前者は 0-3 の線が通り、後者は円堂そのものが見せ場だから。
 */
const PILLARS: readonly Pillar[] = ((): Pillar[] => {
  const out: Pillar[] = [];
  for (let x = GX0; x <= 29; x += STEP) {
    for (let z = GZ0; z <= 15; z += STEP) {
      if (x + 1 >= -3 && x <= 3) continue;
      if (Math.hypot(x + 0.5 - ROT.x, z + 0.5 - ROT.z) < ROT.r + 3) continue;
      if (!isOpen(x, z) || !isOpen(x + 1, z + 1)) continue;
      const r = noise(SEED + 19, x, z);
      out.push({ x, z, w: r < 0.24 ? 1 : 2, style: r < 0.12 ? 2 : r < 0.24 ? 1 : 0 });
    }
  }
  return out;
})();

/** 柱 1 本を立てる。**折れた柱だけ、途中で止めて崩す** */
function raise(ops: BuildOp[], p: Pillar): void {
  const broke = p.style === 2 ? 2 + Math.floor(pick(71, p.x, 0, p.z) * 3) : 0;
  for (let x = p.x; x < p.x + p.w; x++) {
    for (let z = p.z; z < p.z + p.w; z++) {
      if (!isOpen(x, z)) continue;
      const c = ceilAt(x, z);
      const top = broke > 0 ? GROUND + broke : c - 1;
      ops.push(fill(x, GROUND + 1, z, x, top, z, "polished_deepslate"));
      for (let y = GROUND + 1; y <= top; y++) {
        const b = pillarAt(x, y, z);
        if (b !== "polished_deepslate") ops.push(set(x, y, z, b));
      }
      ops.push(set(x, GROUND + 1, z, "chiseled_deepslate"));
      ops.push(set(x, top, z, broke > 0 ? "cracked_deepslate_bricks" : "chiseled_deepslate"));
      // ---- **柱に灯りを埋める。** 出っ張らせると柱の間が狭くなる
      if (broke === 0 && pick(73, x, 4, z) < 0.34) ops.push(set(x, GROUND + 4, z, "glowstone"));
    }
  }
  if (broke > 0) rubble(ops, p);
}

/** 折れた柱の足元に散った石。**高さ 1 まで**——2 マス積むと登れない面ができる（0-8） */
function rubble(ops: BuildOp[], p: Pillar): void {
  for (let x = p.x - 2; x <= p.x + p.w + 1; x++) {
    for (let z = p.z - 2; z <= p.z + p.w + 1; z++) {
      if (!isOpen(x, z) || floorAt(x, z) !== GROUND) continue;
      const r = pick(79, x, 5, z);
      if (r > 0.3) continue;
      ops.push(set(x, GROUND + 1, z, r < 0.12 ? "cobblestone" : "cobbled_deepslate"));
    }
  }
}

/**
 * 天井のリブ。**格子に沿った帯だけ、はっきり違う材にする。**
 *
 * **出っ張らせない**——面を差し替えるだけなので、視線も通り道も塞がない。
 */
function ribs(ops: BuildOp[]): void {
  for (let x = -31; x <= 31; x++) {
    for (let z = -28; z <= 16; z++) {
      if (!isOpen(x, z) || floorAt(x, z) !== GROUND) continue;
      const c = ceilAt(x, z);
      if (c !== HYPO) continue; // **持ち上げていない所＝リブ**
      ops.push(set(x, c, z, pick(83, x, 6, z) < 0.24 ? "cracked_deepslate_bricks" : "polished_deepslate"));
    }
  }
}

/**
 * 迫り持ち。**柱の頭から、リブの帯へ向かって石を差す。**
 *
 * **天井の 1 段下だけ**を差し替えるので、頭上の高さは変わらない。
 */
function corbels(ops: BuildOp[], p: Pillar): void {
  if (p.style === 2) return;
  for (const [dx, dz] of [
    [-1, 0],
    [p.w, 0],
    [0, -1],
    [0, p.w],
  ]) {
    const x = p.x + dx;
    const z = p.z + dz;
    if (!isOpen(x, z)) continue;
    ops.push(set(x, ceilAt(x, z) - 1, z, "chiseled_deepslate"));
  }
}

/** 迫りの中央から吊る灯り。**青と黄を撒き分ける**（青だけだと何も見えない） */
function bayLamps(ops: BuildOp[]): void {
  for (let x = GX0 + 4; x <= 28; x += STEP) {
    for (let z = GZ0 + 4; z <= 14; z += STEP) {
      if (Math.abs(x) <= 3 || !isOpen(x, z) || floorAt(x, z) !== GROUND) continue;
      if (Math.hypot(x - ROT.x, z - ROT.z) < ROT.r + 2) continue;
      const blue = pick(89, x, 7, z) < 0.45;
      hang(ops, x, z, ceilAt(x, z), 1, blue ? "soul_lantern" : "lantern");
    }
  }
}

/** 柱の林ぜんぶ。**副作用: `ops` に手順を足す。** */
export function forestOps(ops: BuildOp[]): void {
  ribs(ops);
  for (const p of PILLARS) {
    raise(ops, p);
    corbels(ops, p);
  }
  bayLamps(ops);
  aisleFloor(ops);
  hallWebs(ops);
}

/** 参道の敷石。**主室の中を貫く帯**——どこへ行けばよいかの手掛かり */
function aisleFloor(ops: BuildOp[]): void {
  for (let z = -28; z <= 16; z++) {
    for (let x = -3; x <= 3; x++) {
      if (!isOpen(x, z) || floorAt(x, z) !== GROUND) continue;
      const edge = Math.abs(x) === 3;
      ops.push(set(x, GROUND, z, edge ? INLAY : "polished_deepslate"));
    }
  }
  rotLip(ops);
}

/**
 * 沈んだ墓室の口。**縁を白く縁取る。**
 *
 * **1 段下がるだけでは、暗い所では段に気づかない**——
 * **落ちる縁は、見えなければならない。**
 */
function rotLip(ops: BuildOp[]): void {
  for (let x = -16; x <= 16; x++) {
    for (let z = -21; z <= 11; z++) {
      if (!isOpen(x, z) || floorAt(x, z) !== GROUND) continue;
      const low =
        floorAt(x + 1, z) < GROUND ||
        floorAt(x - 1, z) < GROUND ||
        floorAt(x, z + 1) < GROUND ||
        floorAt(x, z - 1) < GROUND;
      if (!low) continue;
      ops.push(set(x, GROUND, z, INLAY));
    }
  }
}

/** 天井の隅に張る巣。**天井に接した所だけ**（浮かせない・0-5） */
function hallWebs(ops: BuildOp[]): void {
  for (let x = -30; x <= 30; x += 3) {
    for (let z = -27; z <= 15; z += 3) {
      if (!isOpen(x, z) || floorAt(x, z) !== GROUND) continue;
      if (pick(97, x, 8, z) > 0.035) continue;
      cobweb(ops, x, ceilAt(x, z) - 1, z);
    }
  }
}

// ================================================================ 前室と参道

/** 前室の範囲。**湧く所はこの手前の窪み**（z ＝ −45〜−44） */
const ENT = { x1: -9, x2: 9, z1: -43, z2: -34, ceil: 9 } as const;

/**
 * 入口・前室・参道。
 *
 * **x ＝ 0 には何も置かない**——湧いた所からの視線が通らなくなる（0-3）。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function naveOps(ops: BuildOp[]): void {
  entryFrame(ops);
  entryPillars(ops);
  entryNiches(ops);
  passage(ops);
}

/** 入口の窪みの枠。**降りてきた正面だと分かるようにする** */
function entryFrame(ops: BuildOp[]): void {
  for (const x of [-6, 6]) ops.push(fill(x, GROUND + 1, -45, x, 5, -45, "chiseled_deepslate"));
  for (let x = -5; x <= 5; x++) ops.push(set(x, 6, -45, "chiseled_deepslate"));
  for (let x = -9; x <= 9; x++) ops.push(set(x, ENT.ceil, -43, "chiseled_deepslate"));
  // ---- 湧いた瞬間に見える所なので、**暗くしない**
  for (const x of [-7, 7]) {
    stand(ops, x, GROUND + 1, -42, 2, "lantern");
    stand(ops, x, GROUND + 1, -36, 2, "soul_lantern");
  }
  for (const x of [-4, 4]) {
    for (const z of [-42, -38]) lamp(ops, x, z, ENT.ceil);
  }
}

/** 前室の 4 本の柱。**根元と柱頭に彫り石の帯** */
function entryPillars(ops: BuildOp[]): void {
  for (const x of [-6, 6]) {
    for (const z of [-41, -37]) {
      ops.push(fill(x, GROUND + 1, z, x, ENT.ceil - 1, z, "polished_deepslate"));
      for (let y = GROUND + 1; y < ENT.ceil; y++) {
        const b = pillarAt(x, y, z);
        if (b !== "polished_deepslate") ops.push(set(x, y, z, b));
      }
      ops.push(set(x, GROUND + 1, z, "chiseled_deepslate"));
      ops.push(set(x, ENT.ceil - 1, z, "chiseled_deepslate"));
      ops.push(set(x, ENT.ceil - 4, z, "chiseled_deepslate"));
    }
  }
}

/** 前室の壁龕。**降りてすぐ「墓所だ」と分かる棺を並べる** */
function entryNiches(ops: BuildOp[]): void {
  for (const [wx, dx] of [
    [-10, -1],
    [10, 1],
  ]) {
    for (let z = -42; z <= -35; z += 2) {
      // **戸口と重なる所は彫らない**——開いた所に彫ると、置いた石が宙に浮く（0-5）
      if (isOpen(wx, z) || isOpen(wx + dx, z)) continue;
      niche(ops, wx, GROUND + 1, z, 2, 101);
    }
  }
  for (let x = -8; x <= 8; x += 4) {
    if (Math.abs(x) < 3) continue;
    coffin(ops, x, GROUND + 1, -40, "z", 3, 103);
  }
}

/**
 * 参道。**低く狭い。楣（まぐさ）をくぐって主室へ出る。**
 *
 * > ### **楣は要石を落とさない**
 * >
 * > 跨ぐ石を y ＝ 6 に置くと、**下に 5 マス残る**ので道は断たれない
 * > （`14-map-build.md` 0 章の注意）。
 */
function passage(ops: BuildOp[]): void {
  // ---- 参道の口。**白い敷居と立て枠**——暗くても、奥へ続く道だと分かる
  for (let x = -3; x <= 3; x++) {
    ops.push(set(x, GROUND, -34, INLAY));
    ops.push(set(x, HYPO - 1, -34, INLAY));
  }
  for (const x of [-4, 4]) ops.push(fill(x, GROUND + 1, -34, x, HYPO - 1, -34, INLAY));
  for (const x of [-4, 4]) {
    for (let z = -33; z <= -29; z += 2) pilaster(ops, x, z, GROUND + 1, HYPO - 1);
  }
  for (const z of [-33, -30]) {
    for (let x = -3; x <= 3; x++) ops.push(set(x, HYPO - 1, z, "chiseled_deepslate"));
  }
  // ---- 燭。**壁の内側に置く**（壁の中に埋めると火が見えない）
  for (const [x, z] of [
    [-3, -32],
    [3, -31],
  ]) {
    ops.push(set(x, GROUND + 3, z, "torch"));
  }
  for (let z = -33; z <= -29; z++) {
    for (const x of [-4, 4]) {
      if (pick(107, x, 9, z) > 0.3) continue;
      ops.push(set(x, GROUND + 1, z, stoneAt(x, GROUND + 1, z)));
    }
  }
}
