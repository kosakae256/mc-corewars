"""**Blockbench で作ったアニメを、パックに取り込む。**

    python tools/pve3-poseapply.py worlds/pve-v3/user/default_player.animation.json

**書き出し先**: そのアニメの名前から決める
（`animation.pve3.gun.hold` → `resource_packs/pve_v3/animations/pve3_gun.animation.json`）。
**`--to <path>` で行き先を指しても良い。**

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 17-2。

## 何をするか

> ### **Blockbench は素の数値で出す**（`24-mob-howto.md` 16-1）
>
> **そのまま入れると、歩き・殴りの腕振りに「足し算」される。**
> **`値 - this` にすると、ほかの動きを打ち消してからその値になる**
> （バニラ自身が `animation.humanoid.damage_nearby_mobs` で使っている書き方）。

| 直すもの | |
| --- | --- |
| **`rotation` / `position`** | **`- this` を足す** |
| **`scale`** | **そのまま**——**掛け算なので、打ち消すと消える** |

**取り込んだ後は `python tools/pve3-posecheck.py` が照合する**
（骨の名前・形・繋がり）。
"""

import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANIM = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3", "animations")


def with_this(v):
    """**数を `数 - this` にする。** 式（Molang）はそのまま"""
    out = []
    for x in v:
        if isinstance(x, (int, float)):
            out.append(f"{x} - this")
        elif isinstance(x, str) and re.match(r"^\s*-?\d+(\.\d+)?\s*$", x):
            out.append(f"{x.strip()} - this")
        else:
            out.append(x)
    return out


def convert(body):
    out = {}
    for bone, moves in (body.get("bones") or {}).items():
        one = {}
        for kind in ("rotation", "position"):
            v = moves.get(kind)
            if v is None:
                continue
            if isinstance(v, list):
                one[kind] = with_this(v)
            else:                                   # 山（キーフレーム）
                one[kind] = {t: with_this(a) if isinstance(a, list) else a for t, a in v.items()}
        if "scale" in moves:
            one["scale"] = moves["scale"]
        out[bone] = one
    got = {"loop": bool(body.get("loop", True)), "bones": out}
    if body.get("animation_length") is not None:
        got["animation_length"] = body["animation_length"]
    return got


def where(name):
    """`animation.pve3.gun.hold` → `pve3_gun.animation.json`"""
    parts = name.split(".")
    stem = "_".join(parts[1:3]) if len(parts) >= 3 else "_".join(parts[1:])
    return os.path.join(ANIM, f"{stem}.animation.json")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("tsukaikata: python tools/pve3-poseapply.py <blockbench no json> [--to <path>]")
        return 1
    src = json.load(io.open(args[0], encoding="utf-8"))
    to = None
    if "--to" in sys.argv:
        to = sys.argv[sys.argv.index("--to") + 1]

    for name, body in (src.get("animations") or {}).items():
        path = to or where(name)
        doc = {"format_version": "1.8.0", "animations": {}}
        if os.path.exists(path):
            # **同じファイルの、ほかのアニメは残す**
            old = json.load(io.open(path, encoding="utf-8"))
            doc["animations"] = old.get("animations") or {}
        doc["animations"][name] = convert(body)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        io.open(path, "w", encoding="utf-8", newline="\n").write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
        print("kaita:", os.path.relpath(path, ROOT))
        for bone, v in doc["animations"][name]["bones"].items():
            print("  ", bone, json.dumps(v, ensure_ascii=False)[:120])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
