/**
 * **実機で確かめ終えた敵。**
 *
 * 仕様は `docs/07-enemy-plan.md` 6 章（性能表の「確認」欄）。
 *
 * > ### **確かめ終えたものは、運営に知らせない**（2026-09-10）
 * >
 * > **「旗が動いた」の報せは、切り分けのためのもの**（`24-mob-howto.md` 12 章）。
 * > **確かめ終えた敵まで出し続けると、まだ見ていない敵の報せが埋もれる。**
 *
 * **この表は `tools/pve3-mark.py` が書く。** **手で足さない**——
 * **性能表の「確認」欄と、必ず同じにする。**
 */

export const CHECKED: ReadonlySet<string> = new Set([
  "archer",
  "bat",
  "bigslime",
  "blaze",
  "blinker",
  "boltcreeper",
  "bomber",
  "bomblet",
  "boneman",
  "charged",
  "chiller",
  "cow",
  "creeper",
  "crit",
  "crusher",
  "flyer",
  "gast",
  "grunt",
  "gunner",
  "healer",
  "mite",
  "rouser",
  "sawman",
  "sbowman",
  "sgeneral",
  "sheep",
  "shotgun",
  "silver",
  "sknight",
  "slime",
  "slinger",
  "sroyal",
  "taint",
  "tank",
  "titan",
  "venom",
  "vital",
  "wraith",
  "zgeneral",
  "zguard",
  "zknight",
  "zroyal",
]);
