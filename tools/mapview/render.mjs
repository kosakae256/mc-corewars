/**
 * ボクセルを画像に描く。
 *
 * ## 等角投影（アイソメトリック）
 *
 * 立方体を3面（上・左・右）に分けて、明るさを変えて描く。
 * これだけで立体に見える。カメラも透視投影も要らない。
 *
 * **奥から手前へ描く**（画家のアルゴリズム）。
 * 手前のものが後から上書きされるので、隠面処理が要らない。
 */
import { colorOf } from "./palette.mjs";

/** 描画先。RGBA の平坦な配列 */
class Canvas {
  constructor(w, h, bg = [24, 26, 30, 255]) {
    this.w = w; this.h = h;
    this.px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg[0]; this.px[i * 4 + 1] = bg[1];
      this.px[i * 4 + 2] = bg[2]; this.px[i * 4 + 3] = bg[3];
    }
  }

  dot(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = 255;
  }

  /** 凸多角形を塗る。走査線で埋める */
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let x = Math.floor(xs[0]); x <= Math.ceil(xs[xs.length - 1]); x++) this.dot(x, y, c);
    }
  }
}

const shade = (c, f) => [
  Math.min(255, Math.round(c[0] * f)),
  Math.min(255, Math.round(c[1] * f)),
  Math.min(255, Math.round(c[2] * f)),
];

/**
 * 等角投影で描く。
 *
 * @param voxels Voxels
 * @param opts.scale 1ブロックの大きさ（画素）
 */
export function renderIso(voxels, opts = {}) {
  const s = opts.scale ?? 8;      // 立方体の半幅
  // **縦倍率。** 小さいと高さが潰れて平板に見える。
  // 1ブロックの立方体らしく見えるのは s に近い値
  const hz = Math.round(s * (opts.height ?? 0.9));
  // **カメラの高さ。** 小さいほど低い位置から見る（横から見る形に近づく）。
  // 高いままだと屋根の上面ばかり見えて、軒の下が確認できない
  const tilt = opts.tilt ?? 0.5;

  // 画像の大きさを、投影後の範囲から決める
  const W = (voxels.sx + voxels.sz) * s + s * 4;
  const H = (voxels.sx + voxels.sz) * (s * tilt) + voxels.sy * hz + s * 4;
  const cv = new Canvas(Math.ceil(W), Math.ceil(H));

  const ox = voxels.sz * s + s * 2;
  const oy = voxels.sy * hz + s * 2;

  const px = (x, y, z) => [ox + (x - z) * s, oy + (x + z) * (s * tilt) - y * hz];

  // **奥から手前へ。** x+z が小さいほど奥、y が小さいほど下
  for (let d = 0; d <= voxels.sx + voxels.sz; d++) {
    for (let y = 0; y < voxels.sy; y++) {
      for (let x = 0; x < voxels.sx; x++) {
        const z = d - x;
        if (z < 0 || z >= voxels.sz) continue;

        const id = voxels.get(x, y, z);
        const base = colorOf(id);
        if (!base) continue;

        // 隣が埋まっている面は見えないので描かない。描画量を減らす
        const topVisible   = colorOf(voxels.get(x, y + 1, z)) === null;
        const leftVisible  = colorOf(voxels.get(x, y, z + 1)) === null;
        const rightVisible = colorOf(voxels.get(x + 1, y, z)) === null;
        if (!topVisible && !leftVisible && !rightVisible) continue;

        const p = px(x, y, z);
        const X = p[0], Y = p[1];

        const t = s * tilt;
        if (topVisible) {
          cv.poly([[X, Y - hz], [X + s, Y - hz + t], [X, Y - hz + t * 2], [X - s, Y - hz + t]],
            shade(base, 1.0));
        }
        if (leftVisible) {
          cv.poly([[X - s, Y - hz + t], [X, Y - hz + t * 2], [X, Y + t * 2], [X - s, Y + t]],
            shade(base, 0.72));
        }
        if (rightVisible) {
          cv.poly([[X, Y - hz + t * 2], [X + s, Y - hz + t], [X + s, Y + t], [X, Y + t * 2]],
            shade(base, 0.55));
        }
      }
    }
  }
  return cv;
}

/**
 * 真上から見た図。
 *
 * **一番上にあるブロックの色で塗る。**
 * 高さが分かるよう、高いところほど明るくする。
 */
export function renderTop(voxels, opts = {}) {
  const s = opts.scale ?? 6;
  const cv = new Canvas(voxels.sx * s, voxels.sz * s);

  for (let z = 0; z < voxels.sz; z++) {
    for (let x = 0; x < voxels.sx; x++) {
      let color = null, top = -1;
      for (let y = voxels.sy - 1; y >= 0; y--) {
        const c = colorOf(voxels.get(x, y, z));
        if (c) { color = c; top = y; break; }
      }
      if (!color) continue;
      // 高いほど明るく。段差が読めるようにする
      const f = 0.62 + 0.38 * (top / Math.max(1, voxels.sy - 1));
      const c = shade(color, f);
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) cv.dot(x * s + dx, z * s + dy, c);
    }
  }
  return cv;
}

/**
 * 断面。指定した Z で切って、X-Y 面を描く。
 * 階層の構成を確かめるのに使う。
 */
export function renderSlice(voxels, z, opts = {}) {
  const s = opts.scale ?? 6;
  const cv = new Canvas(voxels.sx * s, voxels.sy * s);
  for (let y = 0; y < voxels.sy; y++) {
    for (let x = 0; x < voxels.sx; x++) {
      const c = colorOf(voxels.get(x, y, z));
      if (!c) continue;
      // 画像は上が小さい Y なので、上下を反転する
      const py = (voxels.sy - 1 - y) * s;
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) cv.dot(x * s + dx, py + dy, c);
    }
  }
  return cv;
}

/**
 * 平面図。指定した高さで水平に切る。
 *
 * **戦闘空間の判断に使う。** 真上から見ると屋根に隠れて中が見えない。
 * 「この階のどこが歩けて、どこが塞がっているか」はこれでしか分からない。
 *
 * 足元（y-1）が床なら薄く敷いて、歩ける範囲を示す。
 */
export function renderPlan(voxels, y, opts = {}) {
  const s = opts.scale ?? 6;
  const cv = new Canvas(voxels.sx * s, voxels.sz * s);

  for (let z = 0; z < voxels.sz; z++) {
    for (let x = 0; x < voxels.sx; x++) {
      const here = colorOf(voxels.get(x, y, z));
      const below = colorOf(voxels.get(x, y - 1, z));

      let c = null;
      if (here) c = here;                       // 障害物。そのままの色
      else if (below) c = shade(below, 0.42);   // 歩ける床。暗く敷く
      if (!c) continue;

      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) cv.dot(x * s + dx, z * s + dy, c);
    }
  }
  return cv;
}
