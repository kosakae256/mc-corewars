/** 地面からの高度を保つ上下速度。横方向はAIに任せる（spec/36）。 */
export function groundHoverVelocity(height: number | undefined, min: number, max: number): number {
  if (height === undefined) return -0.12;
  const target = (min + max) / 2;
  return Math.max(-0.16, Math.min(0.12, (target - height) * 0.12));
}
