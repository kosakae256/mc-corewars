/**
 * 雑音。**純粋。**
 *
 * 地形の凹凸を作るための、種から決まる乱数。
 * **同じ種なら、いつでも同じ形が出る**——直して建て直すのに要る。
 */

function hash(ix: number, iz: number, seed: number): number {
  let n = (ix * 374761393 + iz * 668265263 + seed * 1013904223) >>> 0;
  n = ((n ^ (n >>> 13)) * 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) & 0xffff) / 65535;
}

/** 滑らかな雑音（0〜1） */
export function noise(x: number, z: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** 重ねた雑音。**細かい凹凸が乗る** */
export function fbm(x: number, z: number, scale: number, seed: number, octaves = 3): number {
  let total = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise(x, z, scale / 2 ** i, seed + i * 977) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return total / norm;
}

/** その場所だけで決まる 0〜1。**散らすのに使う** */
export function spot(x: number, z: number, seed: number): number {
  return hash(x, z, seed * 7919 + 13);
}
