/** 頭だけでなく銃を持つ体・腕へ照準を同期する（spec/41）。 */
import type { Entity, Player } from "@minecraft/server";

export function aimGun(mob: Entity, target: Player | undefined, height = 1.25): void {
  mob.setProperty("pve_v3:gun_aim", target !== undefined);
  if (target === undefined) return;
  const at = mob.location;
  const to = target.location;
  const dx = to.x - at.x,
    dz = to.z - at.z;
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  const pitch = (-Math.atan2(to.y + 1 - at.y - height, Math.hypot(dx, dz)) * 180) / Math.PI;
  mob.setRotation({ x: pitch, y: yaw });
  mob.setProperty("pve_v3:gun_yaw", yaw);
  mob.setProperty("pve_v3:gun_pitch", pitch);
}
