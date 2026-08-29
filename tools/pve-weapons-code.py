"""武器のデータを TypeScript に書き出す。

    python tools/pve-weapons-code.py worlds/pve/packs/pve

**出どころは `tools/pve_weapon_table.py`。**
書き出し先: `scripts/features/bow/list.ts`

**この形（データだけ）にしておく理由**——
`docs/spec/11-structure.md` 2-1。**一覧と処理を分ける。**
処理は `features/bow/abilities/`、一覧はこの生成物。
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_weapon_table import (  # noqa: E402
    ABILITIES,
    ability_sound_of,
    spark_of,
    trail_of,
    trail_sound_of,
    weapons,
)

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
OUT = os.path.join(ROOT, "scripts", "features", "bow", "list.ts")

HEAD = '''/**
 * 弓の一覧（**48 本**）。
 *
 * 仕様は `docs/spec/19-weapons.md`。
 *
 * > ### このファイルは書き出したもの。**手で直さない。**
 * >
 * > 出どころは `tools/pve_weapon_table.py`。
 * > **直したらもう一度走らせる**（`python tools/pve-weapons-code.py`）。
 *
 * **ここにあるのはデータだけ。** 何が起きるかは `features/bow/abilities/`
 *（`docs/spec/11-structure.md` 2-1）。
 */

import type { Bow } from "./weapons.js";

export const BOW_LIST: readonly Bow[] = [
'''


def ts(value):
    if value is None:
        return "undefined"
    if isinstance(value, str):
        return '"' + value.replace('"', '\\"') + '"'
    return str(value)


def main() -> int:
    ws = weapons()
    lines = [HEAD]
    for w in ws:
        ab = ABILITIES.get(w["ability"], ("", ""))
        fields = [
            f'    item: "pve:bow_{w["key"]}"',
            f'    label: {ts(w["name"])}',
            f'    rarity: {ts(w["rarity"])}',
            f'    base: {w["base"]}',
        ]
        if w["full"] != 20:
            fields.append(f'    fullTicks: {w["full"]}')
        fields.append(f'    ability: {ts(w["ability"])}')
        if w["ability"] != "none":
            fields.append(f'    effect: {ts(w["name"])}')
            fields.append(f'    about: {ts(ab[0])}')
        # **軌跡も音も、1 本ごとに 1 つ**（`tools/pve-trails.py` / `pve-weapon-sounds.py`）
        fields.append(f"    trail: {ts(trail_of(w))}")
        spark = spark_of(w)
        if spark:
            fields.append(f"    spark: {ts(spark)}")
        fields.append(f"    trailSound: {ts(trail_sound_of(w))}")
        asound = ability_sound_of(w)
        if asound:
            fields.append(f"    abilitySound: {ts(asound)}")
        lines.append("  {\n" + ",\n".join(fields) + ",\n  },\n")
    lines.append("];\n")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("".join(lines))
    print(f"書いた: {OUT}  （{len(ws)} 本）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
