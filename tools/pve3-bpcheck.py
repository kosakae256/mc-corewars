"""ビヘイビア側の実体を、**出す前に**照合する。

    python tools/pve3-bpcheck.py

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 9-4。

## なぜ要るのか

> ### **実体が読み込まれなくても、何も言われない**（**踏んだ**・2026-09-09）
>
> **`minecraft:pushable` は 1.26.20 の schema に無い。**
> **1 個混ざっているだけで、その実体は丸ごと読み込まれない**——
> **script から出そうとして初めて「is not a valid entity type」と分かる。**
>
> **`"type": "float"` の property に `0`（整数）を書くのも同じ。**
> **`Error loading Actor Properties` になり、その実体の property が全部消える。**
> **`q.property()` が何も返さなくなる**（見た目が切り替わらない・膨らまない）。

**公式の JSON schema**（`bedrock-samples/metadata/json_schemas/server/entity/<版>/`）
**を正とする。** **入っていない部品は、engine も弾く。**
"""

import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "behavior_packs", "pve_v3", "entities")
SCHEMA = os.path.join(ROOT, "bedrock-samples", "metadata", "json_schemas", "server", "entity")


def known(version):
    """**その版の schema にある部品の名前。** 無ければ近い版を使う"""
    have = sorted(os.listdir(SCHEMA))
    if version not in have:
        version = max((v for v in have if v[0].isdigit() and v <= version), default=have[-1])
    p = os.path.join(SCHEMA, version, "Entity component definitions.json")
    if not os.path.exists(p):
        return None
    return set(json.load(io.open(p, encoding="utf-8")).get("properties", {}))


def float_written_as_int(text):
    """**生の文字で見る。** `"type": "float"` の塊に、小数点の無い数が無いか"""
    bad = []
    for block in re.findall(r'\{[^{}]*"type":\s*"float"[^{}]*\}', text):
        for m in re.finditer(r'"default":\s*(-?\d+)(?![.\d])', block):
            bad.append(f'default: {m.group(1)}')
    # range は入れ子なので別に見る
    for block in re.findall(r'"type":\s*"float",\s*"range":\s*\[\s*([^\]]*?)\s*\]', text, re.S):
        for n in re.findall(r"-?\d+(?:\.\d+)?", block):
            if "." not in n:
                bad.append(f"range: {n}")
    return bad


def main() -> int:
    names = sorted(f for f in os.listdir(BP) if f.endswith(".json"))
    bad = 0
    for f in names:
        p = os.path.join(BP, f)
        text = io.open(p, encoding="utf-8").read()
        d = json.loads(text)["minecraft:entity"]
        problems = []

        ok = known(json.loads(text)["format_version"])
        if ok is not None:
            bags = [d.get("components") or {}]
            bags += list((d.get("component_groups") or {}).values())
            for bag in bags:
                for k in bag:
                    if k not in ok:
                        problems.append(f"buhin ga schema ni nai: {k}")

        for x in sorted(set(float_written_as_int(text))):
            problems.append(f"float na noni seisuu: {x}")

        # **`destination_position_range` は 1.26.20 から「物」**
        for bag in [d.get("components") or {}] + list((d.get("component_groups") or {}).values()):
            c = bag.get("minecraft:behavior.move_around_target")
            if isinstance(c, dict) and isinstance(c.get("destination_position_range"), list):
                problems.append("destination_position_range wa mono (min/max) de kaku")
            hover = bag.get("minecraft:behavior.random_hover", {})
            height = hover.get("hover_height")
            if height is not None and tuple(map(int, json.loads(text)["format_version"].split('.'))) >= (1, 26, 20):
                if (not isinstance(height, dict)
                        or type(height.get("min")) is not int
                        or type(height.get("max")) is not int
                        or height["min"] > height["max"]):
                    problems.append("random_hover.hover_height wa {min: integer, max: integer} de kaku")

        if problems:
            bad += 1
            print(f"NG {f}")
            for x in sorted(set(problems)):
                print(f"     {x}")
    print(f"--- {len(names)} ken / NG {bad} ken ---")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
