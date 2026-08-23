/**
 * 設計の物理的な破綻を探す。
 *
 * **見た目で探すより確実。** 目で見て気づけるのは表面だけで、
 * 「そこへ行けるか」「頭がつかえないか」は歩いてみないと分からない。
 * それをデータの上でやる。
 *
 * ## 何を見るか
 *
 *   1. **到達できるか** — 湧き地点から歩いて、各設備・コアまで行けるか
 *   2. **頭がつかえないか** — 立てる場所には空気が2マス要る
 *   3. **宙に浮いていないか** — 支えの無いブロックの塊
 *   4. **階段が繋がっているか** — 1段ずつで上がれるか
 */
import { colorOf } from "./palette.mjs";

const SOLID = (v, x, y, z) => {
  const id = v.get(x, y, z);
  if (id === "air") return false;
  // 通り抜けられるものは「床」に数えない
  if (["vine", "oak_fence", "spruce_leaves", "oak_leaves"].includes(id)) return false;
  return colorOf(id) !== null;
};

/** そこに立てるか。床があり、体の2マスが空いている */
const STANDABLE = (v, x, y, z) =>
  SOLID(v, x, y - 1, z) && !SOLID(v, x, y, z) && !SOLID(v, x, y + 1, z);

/**
 * 湧き地点から歩ける範囲を塗る。
 *
 * 上へは1段まで（ジャンプ）、下へは3段まで（落下）。
 */
export function reachable(v, start) {
  const seen = new Set();
  const key = (x, y, z) => `${x},${y},${z}`;
  const queue = [start];
  seen.add(key(...start));

  while (queue.length) {
    const [x, y, z] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let dy = 1; dy >= -3; dy--) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!v.inside(nx, ny, nz)) continue;
        if (!STANDABLE(v, nx, ny, nz)) continue;
        // 1段上がるときは、頭上が空いている必要がある
        if (dy === 1 && SOLID(v, x, y + 2, z)) continue;
        const k = key(nx, ny, nz);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push([nx, ny, nz]);
        break;   // その方向はいちばん高い着地点だけ採る
      }
    }
  }
  return seen;
}

/** 指定のブロックがある座標を全部集める */
export function find(v, id) {
  const out = [];
  for (let y = 0; y < v.sy; y++)
    for (let z = 0; z < v.sz; z++)
      for (let x = 0; x < v.sx; x++)
        if (v.get(x, y, z) === id) out.push([x, y, z]);
  return out;
}

/** 支えの無いブロックの塊を探す（下に何も無く、横にも繋がっていない） */
export function floating(v) {
  const bad = [];
  for (let y = 1; y < v.sy; y++) {
    for (let z = 0; z < v.sz; z++) {
      for (let x = 0; x < v.sx; x++) {
        if (!SOLID(v, x, y, z)) continue;
        if (SOLID(v, x, y - 1, z)) continue;                 // 下に支えがある
        const side = SOLID(v, x + 1, y, z) || SOLID(v, x - 1, y, z)
                  || SOLID(v, x, y, z + 1) || SOLID(v, x, y, z - 1);
        const above = SOLID(v, x, y + 1, z);
        if (side || above) continue;                          // 横か上に繋がっている
        bad.push([x, y, z]);
      }
    }
  }
  return bad;
}

/** 検査して結果を出す */
export function report(v, start, targets) {
  const reach = reachable(v, start);
  const key = (x, y, z) => `${x},${y},${z}`;

  console.log(`歩ける場所: ${reach.size} マス（湧き地点 ${start.join(",")} から）`);

  let ng = 0;
  for (const [name, id] of Object.entries(targets)) {
    const spots = find(v, id);
    if (spots.length === 0) {
      console.log(`  ✗ ${name}: 見つからない`);
      ng++;
      continue;
    }
    // そのブロックの隣に立てる場所があるか
    const ok = spots.some(([x, y, z]) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([dx, dz]) =>
        [0, 1].some((dy) => reach.has(key(x + dx, y + dy, z + dz)))));
    console.log(`  ${ok ? "○" : "✗"} ${name}: ${spots.length} 個${ok ? "" : "  ← 到達できない"}`);
    if (!ok) ng++;
  }

  const air = floating(v);
  if (air.length) {
    console.log(`  ✗ 宙に浮いたブロック: ${air.length} 個`);
    for (const p of air.slice(0, 8)) console.log(`      ${p.join(", ")}  ${v.get(...p)}`);
    ng++;
  } else {
    console.log("  ○ 宙に浮いたブロック: なし");
  }

  return ng;
}

/**
 * 張り出し（せり出して宙に浮いている部分）を探す。
 *
 * `floating` は「完全に孤立したブロック」しか見つけられない。
 * **実際に破綻して見えるのは、床や屋根が支え無しに伸びている場所**なので、
 * 「下がずっと空気の柱」を数える。
 *
 * @param limit これ以上せり出していたら報告する
 */
export function overhang(v, limit = 2, ignore = []) {
  const bad = [];
  for (let y = 1; y < v.sy; y++) {
    for (let z = 0; z < v.sz; z++) {
      for (let x = 0; x < v.sx; x++) {
        const id = v.get(x, y, z);
        if (!SOLID(v, x, y, z)) continue;
        if (SOLID(v, x, y - 1, z)) continue;
        // **軒や梁など、張り出すのが正しいものは除外する。**
        // 全部を弾くと、建築として正しい形まで直すことになる
        if (ignore.includes(id)) continue;

        // 下がどこまで空か
        let gap = 0;
        for (let k = 1; k <= 6 && y - k >= 0; k++) {
          if (SOLID(v, x, y - k, z)) break;
          gap++;
        }
        if (gap <= limit) continue;

        // 支えている柱がどれだけ近くにあるか
        let near = 99;
        for (let r = 1; r <= 3; r++) {
          for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
            if (SOLID(v, x + dx, y - 1, z + dz)) near = Math.min(near, r);
          }
        }
        if (near > limit) bad.push([x, y, z, v.get(x, y, z)]);
      }
    }
  }
  return bad;
}
