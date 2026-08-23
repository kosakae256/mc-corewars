/**
 * 浮島の土台を作る。
 *
 * ## なぜ専用にするか
 *
 * 規則的に段を縮めるだけだと、**階段ピラミッドにしか見えない。**
 * 浮島は「引きちぎられた岩の塊」なので、**輪郭も底も不規則**である必要がある。
 *
 * ## やっていること
 *
 *   1. 上面の輪郭を、円 + ゆらぎ で決める（四角い島にしない）
 *   2. 中心から離れるほど浅く、中心ほど深い底を作る
 *   3. 底面にゆらぎを足して、平らな面を作らない
 *   4. 何本か鍾乳石状の突起を垂らす
 *
 * 乱数は**座標から決まる値**を使う。実行のたびに形が変わると、
 * 画像で確認したものと構造物の中身がズレるため。
 */

/** 座標から決まる 0〜1 の値。同じ座標なら必ず同じ値を返す */
function hash(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** なめらかなゆらぎ。格子の値を補間する */
function noise(x, z, scale, seed = 0) {
  const gx = x / scale, gz = z / scale;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  const s = (t) => t * t * (3 - 2 * t);          // なめらかに繋ぐ
  const a = hash(x0, z0, seed), b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed), d = hash(x0 + 1, z0 + 1, seed);
  const u = s(fx), w = s(fz);
  return a * (1 - u) * (1 - w) + b * u * (1 - w) + c * (1 - u) * w + d * u * w;
}

/**
 * 浮島を作る。
 *
 * @param v        Voxels
 * @param cx,cz    中心
 * @param radius   上面の半径（平均）
 * @param groundY  上面の高さ
 * @param opts.depth   中心の深さ
 * @param opts.seed    形を変えたいときに変える
 * @param opts.top     上面のブロック
 * @param opts.square  0=円 / 1=正方形。**上に正方形の建物を載せるときは 1 に寄せる**
 */
export function island(v, cx, cz, radius, groundY, opts = {}) {
  const depth = opts.depth ?? 14;
  const seed = opts.seed ?? 1;
  const top = opts.top ?? "stone_bricks";

  for (let z = 0; z < v.sz; z++) {
    for (let x = 0; x < v.sx; x++) {
      const dx = x - cx, dz = z - cz;

      // **円と正方形を混ぜる。**
      // 真円の島に正方形の城を載せると、四隅が島からはみ出す。
      // `square` を上げると角が膨らみ、正方形の建物が収まるようになる
      const round = Math.hypot(dx, dz);                 // 円としての距離
      const boxed = Math.max(Math.abs(dx), Math.abs(dz)); // 正方形としての距離
      const q = opts.square ?? 0;
      const dist = round * (1 - q) + boxed * q;

      // **輪郭をゆらす。** きれいすぎると人工物に見える
      const edge = radius * (0.88 + 0.24 * noise(x, z, 9, seed));
      if (dist > edge) continue;

      v.set(x, groundY, z, top);

      // 中心ほど深く。縁は薄く
      const t = dist / edge;                       // 0（中心）〜 1（縁）
      const shape = Math.pow(Math.max(0, 1 - t * t), 0.7);
      const wobble = (noise(x, z, 6, seed + 7) - 0.5) * 5;
      const d = Math.max(1, Math.round(depth * shape + wobble));

      for (let i = 1; i <= d; i++) {
        const y = groundY - i;
        if (y < 0) break;
        // **深いほど古い石にする。** 層が見えると厚みが出る
        const r = i / depth;
        const n = noise(x, z, 4, seed + i);
        const mat =
          i <= 2 ? (n > 0.6 ? "cobblestone" : "stone") :
          r < 0.35 ? (n > 0.55 ? "andesite" : "stone") :
          r < 0.7 ? (n > 0.5 ? "deepslate_bricks" : "andesite") :
          "deepslate_tiles";
        v.set(x, y, z, mat);
      }
    }
  }

  // **鍾乳石状の突起。** これがあると「浮いている」感が一気に出る
  for (let i = 0; i < 40; i++) {
    const a = hash(i, 3, seed) * Math.PI * 2;
    const r = radius * (0.15 + 0.7 * hash(i, 11, seed));
    const x = Math.round(cx + Math.cos(a) * r);
    const z = Math.round(cz + Math.sin(a) * r);

    // その位置の底を探す
    let bottom = -1;
    for (let y = groundY; y >= 0; y--) {
      if (v.get(x, y, z) !== "air") bottom = y; else if (bottom >= 0) break;
    }
    if (bottom < 0) continue;

    const len = 2 + Math.round(hash(i, 23, seed) * 7);
    for (let k = 1; k <= len; k++) {
      const y = bottom - k;
      if (y < 0) break;
      // 先へ行くほど細くする
      const thin = k > len * 0.6;
      v.set(x, y, z, k > len * 0.8 ? "deepslate_tiles" : "deepslate_bricks");
      if (!thin) {
        v.set(x + 1, y, z, "deepslate_bricks");
        v.set(x, y, z + 1, "deepslate_bricks");
      }
    }
  }
}
