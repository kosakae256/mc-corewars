"""**Blockbench で動きを作るための、仮の模型を書き出す。**

    python tools/pve3-poseref.py shotgun pve3_gun

**書き出すもの**: `worlds/pve-v3/user/pose-<モブ>.geo.json`

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 17-1。

## なぜ要るのか

> ### **Blockbench は持ち物を映さない**（2026-09-10）
>
> **手に何を持っているかが見えないまま、腕の角度を決めることになる。**
> **`rightItem` の骨に、持ち物と同じ大きさの板を 1 枚足した模型**を作れば、
> **見ながら決められる。**

**この模型はゲームに入れない。** **Blockbench で動きを作るためだけのもの。**
**書き出すのはアニメだけ**——**アニメは骨の名前で効くので、板があってもなくても同じに効く。**

## 使い方

1. **Blockbench で開く**: `File → Open Model` → 書き出した `pose-<モブ>.geo.json`
2. **絵を 2 枚貼る**: 右の `Textures` に **モブの絵** と **持ち物の絵** を足す
3. **板に持ち物の絵を割り当てる**: `held_item` の面を選んで、持ち物の絵を選ぶ
4. **`Animate` で動きを作る**——**板が付いてくるので、持ち方が見える**
5. **`File → Export → Bedrock Animation`**——**アニメだけを書き出す**
"""

import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
VANILLA = os.path.join(ROOT, "bedrock-samples", "resource_pack")
OUT = os.path.join(ROOT, "worlds", "pve-v3", "user")


def load(path):
    s = io.open(path, encoding="utf-8-sig", errors="replace").read()
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = re.sub(r"(^|\s)//.*", "", s)
    return json.loads(s)


def walk(base, sub):
    d = os.path.join(base, sub)
    if not os.path.isdir(d):
        return
    for cur, _dirs, files in os.walk(d):
        for f in files:
            if f.endswith(".json"):
                yield os.path.join(cur, f)


def geometries():
    raw = {}
    for base in (VANILLA, RP):
        for p in walk(base, "models"):
            try:
                d = load(p)
            except Exception:
                continue
            for g in d.get("minecraft:geometry", []) or []:
                raw[g["description"]["identifier"]] = g
    out = {}
    for key, g in raw.items():
        bones = list(g.get("bones") or [])
        if ":" in key:
            parent = raw.get(key.split(":")[1])
            if parent is not None:
                have = {b["name"] for b in bones}
                bones = [b for b in (parent.get("bones") or []) if b["name"] not in have] + bones
        out[key.split(":")[0]] = {"desc": g["description"], "bones": bones}
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("tsukaikata: python tools/pve3-poseref.py <mob> [item]")
        return 1
    mob = sys.argv[1]
    item = sys.argv[2] if len(sys.argv) > 2 else None

    p = os.path.join(RP, "entity", f"{mob}.entity.json")
    if not os.path.exists(p):
        print("mitsukaranai:", p)
        return 1
    de = load(p)["minecraft:client_entity"]["description"]
    key = (de.get("geometry") or {}).get("default", "").split(":")[0]
    geo = geometries().get(key)
    if geo is None:
        print("mokei ga nai:", key)
        return 1

    bones = json.loads(json.dumps(geo["bones"]))
    names = {b["name"].lower() for b in bones}
    if "rightitem" not in names:
        print("rightItem no hone ga nai:", key)
        return 1
    hand = next(b for b in bones if b["name"].lower() == "rightitem")
    piv = hand.get("pivot", [0, 0, 0])
    # **持ち物と同じ大きさの板**（16 × 16 × 1）。**マイクラは横を向いた面に絵を出す**
    bones.append(
        {
            "name": "held_item",
            "parent": hand["name"],
            "pivot": piv,
            "cubes": [
                {
                    "origin": [piv[0] - 0.5, piv[1] - 8, piv[2] - 8],
                    "size": [1, 16, 16],
                    "uv": {
                        "west": {"uv": [0, 0], "uv_size": [16, 16]},
                        "east": {"uv": [0, 0], "uv_size": [16, 16]},
                        "north": {"uv": [0, 0], "uv_size": [0, 0]},
                        "south": {"uv": [0, 0], "uv_size": [0, 0]},
                        "up": {"uv": [0, 0], "uv_size": [0, 0]},
                        "down": {"uv": [0, 0], "uv_size": [0, 0]},
                    },
                }
            ],
        }
    )

    desc = dict(geo["desc"])
    desc["identifier"] = f"geometry.pose.{mob}"
    doc = {"format_version": "1.12.0", "minecraft:geometry": [{"description": desc, "bones": bones}]}
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f"pose-{mob}.geo.json")
    io.open(out, "w", encoding="utf-8", newline="\n").write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")

    print("kaita:", os.path.relpath(out, ROOT))
    print("  mokei:", key, "/ hone", len(bones), "ko（held_item wo 1 tsu tashita）")
    print("  mob no e:", (de.get("textures") or {}).get("default", "?"))
    if item is not None:
        print("  mochimono no e: textures/items/" + item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
