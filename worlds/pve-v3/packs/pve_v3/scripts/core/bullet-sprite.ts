/** 実体を使わない丸弾表示の時間契約（spec/36）。速度はマス/tick。 */
export const BULLET_SPRITE_TICKS = 4;

/** 更新間隔と寿命をそろえる。射程の端では残り距離で短くする。 */
export function bulletSpriteLife(speed: number, remaining: number): number {
  if (speed <= 0 || remaining <= 0) return 0;
  return Math.min(BULLET_SPRITE_TICKS, remaining / speed) / 20;
}
