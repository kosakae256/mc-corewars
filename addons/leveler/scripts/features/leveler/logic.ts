/**
 * 整地の計算部分。純粋関数だけを置く。
 *
 * Minecraft の API に一切依存しないので、単体で検証できるし
 * 他所からも使い回せる（docs/imp.md「要するに」3）。
 */

/** 埋めるべき1マス */
export type Target = { x: number; y: number; z: number };

/** 走査結果の1列ぶん。`top` はその (x,z) の一番上のブロックの Y */
export type Column = { x: number; z: number; top: number };

/**
 * 走査結果から「埋めるべき座標」を洗い出す。
 *
 * 地表より低い列は、地表の高さまで積む必要がある。
 * 1マス = 1件として返すので、深い穴は複数件になる。
 *
 * @param columns 各 (x,z) の一番上のブロックの高さ
 * @param groundY 揃えたい地表の高さ
 * @param bedrockY この高さ以下は触らない（岩盤）
 */
export function computeTargets(
  columns: readonly Column[],
  groundY: number,
  bedrockY: number
): Target[] {
  const targets: Target[] = [];

  for (const col of columns) {
    // 地面が groundY 以上あるなら、埋めるべき穴は無い
    if (col.top >= groundY) continue;

    // 岩盤の1つ上から groundY まで積む。下から順に並べる
    const from = Math.max(col.top + 1, bedrockY + 1);
    for (let y = from; y <= groundY; y++) {
      targets.push({ x: col.x, y, z: col.z });
    }
  }

  return targets;
}

/**
 * ある地点から近い順に並べ替える。
 *
 * 同じ (x,z) の中では**下から順**になるようにする。
 * 上から埋めると足場がなく設置できないため。
 */
export function sortByDistance(targets: readonly Target[], from: Target): Target[] {
  const dist = (t: Target) => (t.x - from.x) ** 2 + (t.z - from.z) ** 2;

  return [...targets].sort((a, b) => {
    const d = dist(a) - dist(b);
    if (d !== 0) return d;
    // 同じ列なら下から
    return a.y - b.y;
  });
}

/** 2点間の水平距離 */
export function horizontalDistance(a: Target, b: Target): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * 走査する範囲の座標を列挙する。
 *
 * 中心から外側へ向かう順（同心の四角）で返す。
 * ボットの近くから作業できるようにするため。
 */
export function scanArea(centerX: number, centerZ: number, radius: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        // その半径の「外周」だけを拾う（内側は既に出している）
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        out.push({ x: centerX + dx, z: centerZ + dz });
      }
    }
  }
  return out;
}

/**
 * 候補の中から1つを**確率で**選ぶ。近いほど選ばれやすい。
 *
 * 一番近いマスを常に選ぶと、複数体が同じ場所に集まりやすい。
 * 近さを重みにした抽選にすると、近い場所を優先しつつ自然に散る。
 *
 * 重みは `1 / (距離 + 1)`。距離0で1、離れるほどなだらかに減る。
 * 二乗距離を使うと近い1マスに偏りすぎるので使わない。
 *
 * @param random 0以上1未満の乱数。**呼び出し側から渡す**（この関数を純粋に保つため）
 */
export function pickWeightedByNearness(
  candidates: readonly Target[],
  from: { x: number; z: number },
  random: number
): Target | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const weights = candidates.map((c) => 1 / (Math.hypot(c.x - from.x, c.z - from.z) + 1));
  const total = weights.reduce((a, b) => a + b, 0);

  let r = random * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return candidates[i];
  }
  // 丸め誤差で落ちてきた場合の保険
  return candidates[candidates.length - 1];
}
