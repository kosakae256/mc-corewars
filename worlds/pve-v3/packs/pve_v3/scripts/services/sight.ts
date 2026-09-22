/** 実際の衝突形状で遮蔽物を見る。判定不能な場所は撃たない（spec/38）。 */
import type { Dimension, Vector3 } from "@minecraft/server";

export function clearSight(dim: Dimension, from: Vector3, to: Vector3): boolean {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.001) return true;
  try {
    if (dim.getBlock(from) === undefined || dim.getBlock(to) === undefined) return false;
    return (
      dim.getBlockFromRay(
        from,
        { x: dx / distance, y: dy / distance, z: dz / distance },
        {
          maxDistance: distance,
          includeLiquidBlocks: false,
          includePassableBlocks: false,
        }
      ) === undefined
    );
  } catch {
    return false;
  }
}
