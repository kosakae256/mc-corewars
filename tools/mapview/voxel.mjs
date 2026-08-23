/**
 * ボクセルの器。
 *
 * 設計は「箱を積む操作の並び」で書く。座標を直に書くより読みやすく、
 * 対称の複製も計算でできる。
 */
export class Voxels {
  /**
   * @param {number} sx 幅（X）
   * @param {number} sy 高さ（Y）
   * @param {number} sz 奥行（Z）
   */
  constructor(sx, sy, sz) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = new Array(sx * sy * sz).fill("air");
  }

  idx(x, y, z) { return (y * this.sz + z) * this.sx + x; }

  inside(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x, y, z) { return this.inside(x, y, z) ? this.data[this.idx(x, y, z)] : "air"; }

  set(x, y, z, id) {
    if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = id;
  }

  /** 直方体を埋める。両端を含む */
  box(x0, y0, z0, x1, y1, z1, id) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) this.set(x, y, z, id);
    return this;
  }

  /** 直方体の外周だけ（中は触らない）。壁や枠に使う */
  frame(x0, y0, z0, x1, y1, z1, id) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) {
          const edge = x === ax || x === bx || z === az || z === bz;
          if (edge) this.set(x, y, z, id);
        }
    return this;
  }

  /**
   * 上へ行くほど内側へ反る壁（石垣）。
   *
   * 城の石垣は垂直ではなく、上へ行くほど内に入る。
   * **この反りがあるだけで「積んだ石」に見える。** 垂直だと壁になってしまう。
   *
   * @param cx,cz  中心
   * @param half   一番下の半径
   * @param y0,y1  下端・上端
   * @param batter 1段あたり内へ寄る量
   */
  batter(cx, cz, half, y0, y1, batter, id) {
    for (let y = y0; y <= y1; y++) {
      const r = Math.max(1, Math.round(half - (y - y0) * batter));
      this.frame(cx - r, y, cz - r, cx + r, y, cz + r, id);
    }
    return this;
  }

  /**
   * 四方に張り出す屋根。中心から外へ、下がりながら広がる。
   *
   * **深い軒が木造らしさを作る。** 屋根が薄いと安っぽく見える。
   */
  roof(cx, cz, half, y, steps, id, capId) {
    for (let i = 0; i < steps; i++) {
      const r = half + i;
      this.frame(cx - r, y - i, cz - r, cx + r, y - i, cz + r, id);
    }
    if (capId) this.box(cx - half + 1, y + 1, cz - half + 1, cx + half - 1, y + 1, cz + half - 1, capId);
    return this;
  }

  /**
   * 階段。**1段ずつ上がる実ブロックで作る。**
   *
   * 階段ブロック（stairs）は向きを持つが、`.mcstructure` に状態を書いていないので
   * 全部同じ向きになってしまう。**実ブロックの段なら向きの概念が無く、確実に歩ける。**
   *
   * @param x,y,z  一段目の位置（この高さに立つ）
   * @param dx,dz  上がっていく向き（どちらかが ±1）
   * @param steps  段数
   * @param width  通路の幅（進行方向に対して直角）
   */
  stairs(x, y, z, dx, dz, steps, width, id, baseY = null) {
    const half = Math.floor((width - 1) / 2);
    const wx = dz === 0 ? 0 : 1, wz = dx === 0 ? 0 : 1;
    // **段の下を床まで埋める。**
    // 1マスだけ埋めると、宙に浮いた斜めの塊に見えてしまう
    const floor = baseY === null ? y - 1 : baseY;

    for (let i = 0; i < steps; i++) {
      const cx = x + dx * i, cz = z + dz * i, cy = y + i;
      for (let k = -half; k <= half + (width % 2 === 0 ? 1 : 0); k++) {
        const px = cx + wx * k, pz = cz + wz * k;
        for (let yy = floor; yy <= cy; yy++) this.set(px, yy, pz, id);
      }
    }
    return this;
  }

  /**
   * 胸壁（battlement）。**1つ飛ばしにブロックを置くだけで城壁に見える。**
   *
   * 参考: delphic/vorld-fort の addRing（`i % 2 == 1` の判定）
   */
  battlement(x0, z0, x1, z1, y, id, height = 2) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let dy = 0; dy < height; dy++) {
      for (let z = az; z <= bz; z++) {
        for (let x = ax; x <= bx; x++) {
          if (x !== ax && x !== bx && z !== az && z !== bz) continue;
          // 外周に沿った位置で1つ飛ばし
          const along = (x === ax || x === bx) ? z : x;
          if (along % 2 === 0) this.set(x, y + dy, z, id);
        }
      }
    }
    return this;
  }

  /**
   * アーチ形の穴を開ける。門に使う。
   *
   * 上辺を丸めるだけで、四角い穴より格段に建築らしくなる。
   *
   * @param axis "x" なら X 方向に伸びる壁を貫く
   */
  arch(cx, cz, y0, y1, halfWidth, axis, depth) {
    const h = y1 - y0;
    for (let d = -depth; d <= depth; d++) {
      for (let dy = 0; dy <= h; dy++) {
        // 上へ行くほど幅を狭める。丸みを出す
        const t = dy / h;
        const wHere = Math.round(halfWidth * Math.sqrt(Math.max(0, 1 - t * t)));
        for (let k = -wHere; k <= wHere; k++) {
          if (axis === "x") this.set(cx + d, y0 + dy, cz + k, "air");
          else this.set(cx + k, y0 + dy, cz + d, "air");
        }
      }
    }
    return this;
  }

  /** 何ブロック使っているか。規模の把握用 */
  count() {
    let n = 0;
    for (const v of this.data) if (v !== "air") n++;
    return n;
  }
}
