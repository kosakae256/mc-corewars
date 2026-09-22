/** 狐火の見た目。バニラ炎を色調変換した粒を青・紫で重ねる（spec/34）。 */
import { MolangVariableMap, type Entity, type Vector3 } from "@minecraft/server";
import { coneBasis } from "../core/charged-sweep.js";

/** 手元の小さい炎。呼び手で間引き、持続エミッターを残さない。 */
export function chargeFlames(mob: Entity, dir: Vector3, audible = false): void {
  for (const [side, color] of [
    [-1, "blue"],
    [1, "purple"],
  ] as const) {
    try {
      const at = mob.location;
      mob.dimension.spawnParticle(`pve_v3:foxfire_charge_${color}`, {
        x: at.x + dir.x * 0.65 + dir.z * side * 0.25,
        y: at.y + 1.35,
        z: at.z + dir.z * 0.65 - dir.x * side * 0.25,
      });
    } catch {
      /* 描画できない場所でも攻撃の時計は進める。 */
    }
  }
  const center = { x: mob.location.x + dir.x * 0.6, y: mob.location.y + 1.3, z: mob.location.z + dir.z * 0.6 };
  for (const name of ["orbit", "charge_glow"]) {
    try {
      mob.dimension.spawnParticle(`pve_v3:foxfire_${name}`, center);
    } catch {
      /* 溜め中の光だけを省略する。 */
    }
  }
  for (const color of ["blue", "purple"]) {
    try {
      mob.dimension.spawnParticle(`pve_v3:foxfire_aura_${color}`, mob.location);
    } catch {
      /* 体にまとう炎だけを省略する。 */
    }
  }
  if (audible) {
    try {
      mob.dimension.playSound("fire.fire", mob.location, { volume: 0.55, pitch: 1.15 });
    } catch {
      /* 炎音だけを省略する。 */
    }
  }
}

/** 主炎2種と閃光・火の粉で扇全体を描く。ダメージはこの粒からは与えない。 */
export function releaseFlames(mob: Entity, dir: Vector3, radius: number, angle: number): void {
  const vars = new MolangVariableMap();
  const basis = coneBasis(dir);
  for (const name of ["forward", "right", "up"] as const) {
    for (const axis of ["x", "y", "z"] as const) vars.setFloat(`fox_${name}_${axis}`, basis[name][axis]);
  }
  vars.setFloat("fox_range", radius);
  vars.setFloat("fox_angle", angle);
  const origin = { ...mob.location, y: mob.location.y + 1.3 };
  for (const color of ["blue", "purple"]) {
    try {
      mob.dimension.spawnParticle(`pve_v3:foxfire_wave_${color}`, origin, vars);
    } catch {
      /* 消滅・未ロード時の描画失敗は戦闘判定から切り離す。 */
    }
  }
  for (const name of ["front", "embers", "flash"]) {
    try {
      const at =
        name === "flash"
          ? { x: mob.location.x + dir.x * 0.6, y: mob.location.y + 1.3, z: mob.location.z + dir.z * 0.6 }
          : origin;
      mob.dimension.spawnParticle(`pve_v3:foxfire_${name}`, at, vars);
    } catch {
      /* 補助の閃光が失敗しても主炎と判定は残す。 */
    }
  }
  try {
    for (const player of mob.dimension.getPlayers({ location: origin, maxDistance: 60 })) {
      player.playSound("pve_v3:foxfire.ignite", { location: origin, volume: 4, pitch: 0.85 });
      player.playSound("pve_v3:foxfire.blast", { location: origin, volume: 4, pitch: 1.4 });
    }
  } catch {
    /* 音が鳴らなくても攻撃は成立する。 */
  }
}
