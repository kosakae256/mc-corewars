/**
 * 層を文字で書いて、ボクセルに起こす。
 *
 * ## なぜこの方式にするか
 *
 * 座標計算（`box(x0,y0,z0,x1,y1,z1)`）で書くと、
 * **書いている本人が形を見られない。** できあがってから初めて分かる。
 * その結果、足しては引きを繰り返して、散らかるか空っぽになるかに振れる。
 *
 * **文字の格子なら、形がソースにそのまま見える。**
 * 直したいときも1文字変えるだけで済むし、読む側も指で場所を指せる。
 *
 * ## 書き方
 *
 *   const 記号 = { "#": "stone_bricks", ".": "air", ... };
 *
 *   plan(v, 記号, 高さ, [
 *     "###########",
 *     "#.........#",
 *     "###########",
 *   ]);
 *
 * **文字列の並びは上から順に Z が増える。** 画面で見たとおりに置かれる。
 */

/**
 * 1つの高さに、文字の格子を置く。
 *
 * @param v      Voxels
 * @param key    文字 → ブロック名。載っていない文字は「触らない」
 * @param y      高さ
 * @param rows   文字列の配列。上から順に Z+
 * @param ox,oz  左上の位置
 */
export function plan(v, key, y, rows, ox = 0, oz = 0) {
  rows.forEach((row, dz) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx];
      const id = key[ch];
      if (id === undefined) continue;      // 未定義の文字は触らない
      v.set(ox + dx, y, oz + dz, id);
    }
  });
  return v;
}

/**
 * 同じ格子を、高さの範囲にまとめて置く。壁や柱に使う。
 */
export function planRange(v, key, y0, y1, rows, ox = 0, oz = 0) {
  for (let y = y0; y <= y1; y++) plan(v, key, y, rows, ox, oz);
  return v;
}

/**
 * 格子の一部を、別のブロックに散らす。
 *
 * **一色でベタ塗りすると、大きさだけが目立って安っぽくなる。**
 * 近い色の別ブロックをまばらに混ぜると、面に質感が出る。
 *
 * 散らし方は座標から決まるので、毎回同じ結果になる
 * （画像で見たものと構造物の中身がズレないため）。
 *
 * @param ratio  0〜1。どれくらいの割合を置き換えるか
 */
export function speckle(v, y0, y1, from, to, ratio = 0.15, seed = 0) {
  for (let y = y0; y <= y1; y++) {
    for (let z = 0; z < v.sz; z++) {
      for (let x = 0; x < v.sx; x++) {
        if (v.get(x, y, z) !== from) continue;
        const h = Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791 ^ seed, 2654435761) >>> 0;
        if ((h % 1000) / 1000 < ratio) v.set(x, y, z, to);
      }
    }
  }
  return v;
}
