"""ビヘイビアーパックの実体 JSON を、**バニラと突き合わせる。**

    python tools/mc-entity-check.py worlds/pve-v3/packs/pve_v3/behavior_packs/pve_v3

## なぜ要るのか

> ### 部品を 1 つ間違えると、実体ごと読み込まれない
>
> **エラーは content log にしか出ない。** 置く前に、こちらで照合する。

`docs/imp.md` 10-8-A（JSON はスキーマで確かめる）。

## 何を見ているか

| 見るもの | どこから |
| --- | --- |
| **項目の綴り** | `bedrock-samples/metadata/json_schemas/server/entity/`（部品ごとのスキーマ） |
| **部品そのものの綴り／版** | **`bedrock-samples/behavior_pack/entities/` の実物**（バニラが実際に使っている形） |

> ### 版を見ないと、**消えた部品**を見逃す
>
> **`minecraft:pushable` は 1.26.20 で `minecraft:pushable_by_entity` になった。**
> スキーマの有無だけ見ていたので、
> **実体ごと読み込まれていないのに「問題なし」と言っていた**（2026-09-05）。
>
> **バニラでその部品を使っている実体の `format_version` の上限**を調べ、
> **こちらがそれより新しい版を名乗っていたら NG。**

| 出るもの | |
| --- | --- |
| `NG` | **ほぼ確実に読み込まれない**（知らない項目） |
| `?!` | **その版では消えている疑い。** 名前が変わったかもしれない。**目で見て確かめる** |
| `??` | バニラにもスキーマにも無い名前。**確かめられていない**だけのこともある |
"""

import glob
import io
import json
import os
import re
import sys

ROOT = os.path.join("bedrock-samples")
SCHEMA_ROOT = os.path.join(ROOT, "metadata", "json_schemas", "server", "entity")
VANILLA = os.path.join(ROOT, "behavior_pack", "entities")

COMMENT = re.compile(r"^\s*//.*$", re.MULTILINE)


def loose(path):
    """バニラの JSON は `//` を含むことがある。**落として読む**"""
    try:
        return json.loads(COMMENT.sub("", io.open(path, encoding="utf-8-sig").read()))
    except Exception:
        return None


def ver(text):
    try:
        return tuple(int(x) for x in str(text).split("."))
    except ValueError:
        return (0,)


def load_schemas():
    """部品名 → スキーマの場所。**全部の版をまとめて読む**（新しい版を優先）"""
    have = {}
    dirs = sorted(glob.glob(os.path.join(SCHEMA_ROOT, "*")))
    dirs = [d for d in dirs if os.path.basename(d) != "beta"] + [
        d for d in dirs if os.path.basename(d) == "beta"
    ]
    for d in dirs:
        for p in glob.glob(os.path.join(d, "*.json")):
            name = os.path.basename(p)[:-5]
            if name.startswith("minecraft_"):
                have.setdefault(name.replace("minecraft_", "minecraft:", 1), p)
    return have


def comps_of(ent):
    """その実体が使っている部品の名前を全部"""
    out = set(ent.get("components", {}))
    for g in (ent.get("component_groups") or {}).values():
        out |= set(g)
    return out


def load_vanilla():
    """部品名 → **バニラで使われている `format_version` の上限**"""
    top = {}
    for p in glob.glob(os.path.join(VANILLA, "*.json")):
        d = loose(p)
        if d is None:
            continue
        ent = d.get("minecraft:entity")
        if ent is None:
            continue
        v = ver(d.get("format_version", "0"))
        for name in comps_of(ent):
            if v > top.get(name, (0,)):
                top[name] = v
    return top


def props_of(path, seen=None):
    """そのスキーマが許す項目。**`allOf` の参照先も辿る**"""
    seen = seen or set()
    if path in seen:
        return set()
    seen.add(path)
    j = loose(path)
    if j is None:
        return set()
    out = set(j.get("properties", {}))
    for item in j.get("allOf", []):
        if not isinstance(item, dict):
            continue
        ref = item.get("$ref")
        if not ref:
            out |= set(item.get("properties", {}))
            continue
        rp = os.path.join(os.path.dirname(path), os.path.basename(ref))
        if os.path.exists(rp):
            out |= props_of(rp, seen)
    return out


def check_components(where, comps, fv, have, top, report):
    for name, val in comps.items():
        best = top.get(name)
        if best is not None and fv > best:
            # **バニラでは、その版より前でしか使われていない。**
            #
            # > **当たりが多い**——バニラにその部品を使う新しい実体が居ないだけ、
            # > ということもある（`minecraft:movement.fly` など）。
            # > **止めはしない。目で見て確かめる。**
            report["warn"].append(
                f"{where}: {name} → **{'.'.join(map(str, best))} までの部品**"
                f"（{'.'.join(map(str, fv))} を名乗っている。名前が変わった可能性）"
            )
            continue
        path = have.get(name)
        if path is None:
            if best is None:
                report["unknown"].append(f"{where}: {name}")
            continue
        allowed = props_of(path)
        if not isinstance(val, dict) or not allowed:
            continue
        bad = [k for k in val if k not in allowed]
        if bad:
            report["bad"].append(f"{where}: {name} → 知らない項目 {', '.join(bad)}")


def check_file(path, have, top, report):
    d = loose(path)
    if d is None:
        report["bad"].append(f"{path}: 読めない")
        return
    ent = d.get("minecraft:entity")
    if ent is None:
        return
    fv = ver(d.get("format_version", "0"))
    name = f'{os.path.basename(path)} [{d.get("format_version")}]'
    check_components(f"{name} components", ent.get("components", {}), fv, have, top, report)
    for g, comps in (ent.get("component_groups") or {}).items():
        check_components(f"{name} group {g}", comps, fv, have, top, report)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    have = load_schemas()
    top = load_vanilla()
    if not have or not top:
        print("参照が見つからない:", SCHEMA_ROOT, VANILLA)
        return 1
    report = {"bad": [], "warn": [], "unknown": []}
    files = sorted(glob.glob(os.path.join(root, "entities", "*.json")))
    for p in files:
        check_file(p, have, top, report)

    print(f"見た実体 {len(files)} 個 / スキーマ {len(have)} 個 / バニラの部品 {len(top)} 種")
    for line in report["bad"]:
        print("  NG", line)
    for line in report["warn"]:
        print("  ?!", line)
    if report["unknown"]:
        names = sorted({line.split(": ")[-1] for line in report["unknown"]})
        print(f"  ?? バニラにもスキーマにも無い名前 {len(names)} 種: {', '.join(names)}")
    if report["bad"]:
        print("**読み込まれない可能性が高い。** 直すこと")
        return 1
    print("問題なし")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
