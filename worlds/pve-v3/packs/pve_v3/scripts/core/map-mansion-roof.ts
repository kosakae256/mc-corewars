/**
 * 11「森の洋館」の**屋根の形。純粋。**
 *
 * > ### 屋根は**縁からの距離**だけで決める
 * >
 * > **屋内マップは、上から見た天面がそのまま「歩ける面」になる**（`spec/14-map-build.md` 0-8）。
 * > **距離から作れば、隣り合うマスの差は必ず 1 以下。**
 * > そこへ棟と破風を足したうえで、**均し**を通して 1 マス以内に戻す。
 */

import { ROOF, inMass } from "./map-mansion-plan.js";

const GX = 44;
const GZ = 47;
const GW = GX * 2 + 1;

/**
 * **縁からの距離**（チェビシェフ）。屋根の段を決めるのに使う。
 *
 * > ### 距離で決めれば、傾きは必ず 1 マス以内に収まる
 * >
 * > **屋根に 2 マスの段ができると、そこから上が 0-8 で「登れない面」になる。**
 * > **隣り合うマスの距離の差は 1 以下**なので、距離から作った高さも 1 以下しか動かない。
 */
const EDGE: Int16Array = ((): Int16Array => {
  const d = new Int16Array(GW * (GZ * 2 + 1));
  const at = (x: number, z: number): number => (z + GZ) * GW + (x + GX);
  for (let z = -GZ; z <= GZ; z++) {
    for (let x = -GX; x <= GX; x++) d[at(x, z)] = inMass(x, z) ? 9999 : 0;
  }
  // **前向きと後ろ向きの 2 回**で、8 近傍のチェビシェフ距離になる
  for (let z = -GZ; z <= GZ; z++) {
    for (let x = -GX; x <= GX; x++) {
      let m = d[at(x, z)] ?? 0;
      for (const [dx, dz] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < -GX || nx > GX || nz < -GZ) continue;
        m = Math.min(m, (d[at(nx, nz)] ?? 0) + 1);
      }
      d[at(x, z)] = m;
    }
  }
  for (let z = GZ; z >= -GZ; z--) {
    for (let x = GX; x >= -GX; x--) {
      let m = d[at(x, z)] ?? 0;
      for (const [dx, dz] of [
        [1, 1],
        [0, 1],
        [-1, 1],
        [1, 0],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < -GX || nx > GX || nz > GZ) continue;
        m = Math.min(m, (d[at(nx, nz)] ?? 0) + 1);
      }
      d[at(x, z)] = m;
    }
  }
  return d;
})();

/** 縁からの距離。**外は 0** */
export function edgeAt(x: number, z: number): number {
  if (x < -GX || x > GX || z < -GZ || z > GZ) return 0;
  return EDGE[(z + GZ) * GW + (x + GX)] ?? 0;
}

/**
 * 屋根の天面。**段丘 ＋ 棟 ＋ 破風**を素で描き、**あとから 2 マスの段を均す。**
 *
 * > ### 足し算で作ると、必ず 2 マスの段が出る
 * >
 * > 段丘の高さは**縁からの距離**で 1 マスずつ動く。そこへ棟の ＋2 を足すと、
 * > **「棟の上で距離が 1 増えた所」と「棟の外で距離が 1 減った所」が隣り合って 2 マス**になり、
 * > **0-8 の「登れない面」で落ちる。**
 * >
 * > **均し**（前から後ろ・後ろから前の 2 回、隣より 2 以上高い所を削る）を通せば、
 * > **どんな素の形を描いても、傾きは必ず 1 マス以内に収まる。**
 */
const ROOF_H: Int16Array = ((): Int16Array => {
  const h = new Int16Array(GW * (GZ * 2 + 1));
  const at = (x: number, z: number): number => (z + GZ) * GW + (x + GX);
  for (let z = -GZ; z <= GZ; z++) {
    for (let x = -GX; x <= GX; x++) {
      // **建物の外は「無限に高い」ことにする**——均しの相手にしない
      if (!inMass(x, z)) {
        h[at(x, z)] = 9999;
        continue;
      }
      const e = edgeAt(x, z);
      if (e <= 2) {
        h[at(x, z)] = ROOF + 1;
        continue;
      }
      let v = ROOF + Math.min(4, Math.floor((e - 3) / 3));
      // **棟**——中央の 1 本と、13 マスおきの筋
      if (e >= 6 && (Math.abs(x) <= 1 || (Math.abs(x) + 6) % 13 <= 1)) v += 2;
      // **破風**——それに直交する 15 マスおきの筋
      if (e >= 6 && (Math.abs(z) + 7) % 15 <= 1) v += 1;
      h[at(x, z)] = v;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let z = -GZ; z <= GZ; z++) {
      for (let x = -GX; x <= GX; x++) {
        const c = h[at(x, z)] ?? 0;
        const a = x > -GX ? (h[at(x - 1, z)] ?? 0) : 9999;
        const b = z > -GZ ? (h[at(x, z - 1)] ?? 0) : 9999;
        h[at(x, z)] = Math.min(c, Math.min(a, b) + 1);
      }
    }
    for (let z = GZ; z >= -GZ; z--) {
      for (let x = GX; x >= -GX; x--) {
        const c = h[at(x, z)] ?? 0;
        const a = x < GX ? (h[at(x + 1, z)] ?? 0) : 9999;
        const b = z < GZ ? (h[at(x, z + 1)] ?? 0) : 9999;
        h[at(x, z)] = Math.min(c, Math.min(a, b) + 1);
      }
    }
  }
  return h;
})();

/** 屋根の天面。**建物の外は 0** */
export function roofAt(x: number, z: number): number {
  if (!inMass(x, z)) return 0;
  return ROOF_H[(z + GZ) * GW + (x + GX)] ?? ROOF;
}
