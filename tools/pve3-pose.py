"""**モブの姿勢と持ち物を、見ながら決める道具を組み立てる。**

    python tools/pve3-pose.py

**書き出すもの**: `tools/pve3-pose.html`（**そのまま開ける。中に模型と絵が入っている**）

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 17 章。

## なぜ要るのか

> ### **推測で数字を動かしても当たらない**（2026-09-10）
>
> **持ち物の位置・角度を、ゲームを開かずに見られなかった。**
> **1 往復に 1 回しか試せず、当てずっぽうを繰り返すことになった。**

**模型・骨・絵をそのまま読み込んで、ブラウザで組み立てて見せる。**
**滑子（スライダー）で動かし、そのままアニメの JSON を書き出す。**

**どのモブでも使える**——**選ぶだけ。**
"""

import base64
import io
import json
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3")
RP = os.path.join(PACK, "resource_packs", "pve_v3")
VANILLA = os.path.join(ROOT, "bedrock-samples", "resource_pack")
HERE = os.path.dirname(os.path.abspath(__file__))


def load(path):
    """**コメント付きの JSON も読む**（バニラに入っている）"""
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
    """**模型を全部集める**（うちの ＋ バニラ）。**継承（`A:B`）もたどる**"""
    raw = {}
    for base in (VANILLA, RP):
        for p in walk(base, "models"):
            try:
                d = load(p)
            except Exception:
                continue
            for g in d.get("minecraft:geometry", []) or []:
                raw[g["description"]["identifier"]] = g
            for k, v in d.items():
                if isinstance(k, str) and k.startswith("geometry."):
                    raw[k] = {"description": {"identifier": k}, "bones": v.get("bones", [])}
    out = {}
    for key, g in raw.items():
        name = key.split(":")[0]
        bones = list(g.get("bones") or [])
        if ":" in key:                       # **親から骨を引き継ぐ**
            parent = raw.get(key.split(":")[1])
            if parent is not None:
                have = {b["name"] for b in bones}
                bones = [b for b in parent.get("bones") or [] if b["name"] not in have] + bones
        out[name] = {
            "id": name,
            "tw": g["description"].get("texture_width", 64),
            "th": g["description"].get("texture_height", 64),
            "bones": bones,
        }
    return out


def texture_uri(rel):
    """絵を PNG のまま埋め込む。**無ければ空**"""
    for base in (RP, VANILLA):
        p = os.path.join(base, rel.replace("/", os.sep) + ".png")
        if os.path.exists(p):
            with open(p, "rb") as f:
                return "data:image/png;base64," + base64.b64encode(f.read()).decode()
    return ""


HUMAN = {"head", "body", "leftarm", "rightarm", "leftleg", "rightleg"}


def is_human(g):
    """**人型か。** **頭・胴・両腕・両脚がそろっていれば人型**（`24-mob-howto.md` 17 章）"""
    names = {b["name"].lower() for b in g["bones"]}
    return HUMAN <= names


def entities(geo):
    """**人型のモブだけ、そのまま使える形にする**"""
    out = []
    d = os.path.join(RP, "entity")
    for f in sorted(os.listdir(d)):
        if not f.endswith(".json"):
            continue
        try:
            de = load(os.path.join(d, f))["minecraft:client_entity"]["description"]
        except Exception:
            continue
        name = (de.get("geometry") or {}).get("default")
        key = None if name is None else name.split(":")[0]
        if key is None or key not in geo or not is_human(geo[key]):
            continue
        tex = (de.get("textures") or {}).get("default", "")
        out.append({"id": de["identifier"], "file": f, "geo": key, "tex": texture_uri(tex), "texName": tex})
    return out


def our_anims():
    """**このパックのアニメ。** **開いて直せるように、そのまま持っていく**"""
    out = {}
    for p in walk(RP, "animations"):
        try:
            d = load(p)
        except Exception:
            continue
        for k, v in (d.get("animations") or {}).items():
            out[k] = {
                "file": os.path.relpath(p, RP).replace(os.sep, "/"),
                "loop": v.get("loop", True),
                "length": v.get("animation_length"),
                "bones": v.get("bones") or {},
            }
    return out


def items():
    """**持たせられる絵**（自前のアイテム）"""
    out = []
    p = os.path.join(RP, "textures", "item_texture.json")
    if not os.path.exists(p):
        return out
    for key, v in (load(p).get("texture_data") or {}).items():
        rel = v.get("textures")
        if isinstance(rel, str):
            out.append({"id": key, "tex": texture_uri(rel)})
    return out


def main() -> int:
    geo = geometries()
    ent = entities(geo)
    used = {e["geo"] for e in ent}
    data = {
        # **人型で使う模型だけ運ぶ**（254 個ぜんぶ入れると重い）
        "geo": {k: v for k, v in geo.items() if k in used},
        "entities": ent,
        "items": items(),
        "anims": our_anims(),
    }
    tpl = io.open(os.path.join(HERE, "pve3-pose.tpl.html"), encoding="utf-8").read()
    html = tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    out = os.path.join(HERE, "pve3-pose.html")
    io.open(out, "w", encoding="utf-8", newline="\n").write(html)
    print(f"kaita: {os.path.relpath(out, ROOT)}")
    print(
        f"  ningata {len(data['entities'])} tai / mokei {len(data['geo'])} ko"
        f" / e {len(data['items'])} mai / anime {len(data['anims'])} ko"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
