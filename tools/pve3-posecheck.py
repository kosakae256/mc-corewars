"""**アニメが、その敵の骨に本当に届くかを照合する。**

    python tools/pve3-posecheck.py

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 17 章。

## なぜ要るのか

> ### **骨の名前が違っても、ゲームは何も言わない**（2026-09-10）
>
> **`rightItem` を `rightitem` と書いても、無い骨を書いても、エラーは出ない。**
> **ただ動かないだけ**——**「工房で作ったのに、ゲームではめちゃくちゃ」の正体はここ。**

**見るもの**:

| | |
| --- | --- |
| **骨がある** | **そのアニメを鳴らす実体の模型に、その名前の骨があるか** |
| **形が正しい** | **回す・寄せるは 3 つ組か。** 時刻は長さの中に収まっているか |
| **式が読めるか** | **数か、`数 - this` か**（このパックの書き方） |

**`pve3-anim.py` と同じ読み方をする**——**見る道具と照合する道具で、食い違いが出ないように。**
"""

import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
VANILLA = os.path.join(ROOT, "bedrock-samples", "resource_pack")

OK_EXPR = re.compile(r"^\s*-?\d+(\.\d+)?\s*(-\s*this\s*)?$")


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
    """**模型の骨の名前**（小文字で持つ。Bedrock は大小を見ない）"""
    raw, out = {}, {}
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
                    raw[k] = {"bones": v.get("bones", [])}
    for key, g in raw.items():
        names = {b["name"].lower() for b in (g.get("bones") or [])}
        if ":" in key:                       # **継承元の骨も持っている**
            parent = raw.get(key.split(":")[1])
            if parent is not None:
                names |= {b["name"].lower() for b in (parent.get("bones") or [])}
        out[key.split(":")[0]] = names
    return out


def our_anims():
    out = {}
    for p in walk(RP, "animations"):
        try:
            d = load(p)
        except Exception:
            continue
        for k, v in (d.get("animations") or {}).items():
            out[k] = (os.path.relpath(p, RP).replace(os.sep, "/"), v)
    return out


def plays(anim_id, de):
    """**その実体は、そのアニメを鳴らすか**（名前でも、配線ごしでも）"""
    return anim_id in (de.get("animations") or {}).values()


def entities():
    """**見た目の定義と、持ち物の定義**（どちらもアニメを鳴らす）"""
    out = []
    for sub, key in (("entity", "minecraft:client_entity"), ("attachables", "minecraft:attachable")):
        d = os.path.join(RP, sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".json"):
                continue
            try:
                de = load(os.path.join(d, f))[key]["description"]
            except Exception:
                continue
            out.append((f, de))
    return out


def check_shape(name, body, problems):
    """**形が正しいか。** 3 つ組・時刻・式"""
    length = body.get("animation_length")
    for bone, moves in (body.get("bones") or {}).items():
        for kind in ("rotation", "position", "scale"):
            v = moves.get(kind)
            if v is None:
                continue
            frames = v if isinstance(v, dict) else {"0": v}
            for t, arr in frames.items():
                if not re.fullmatch(r"\d+(?:\.\d+)?", t):
                    problems.append(f"{name} / {bone}: invalid keyframe time {t!r}; use 0.25, not .25")
                if isinstance(arr, dict):
                    arr = arr.get("post") or arr.get("pre") or []
                if kind != "scale" and (not isinstance(arr, list) or len(arr) != 3):
                    problems.append(f"{name} / {bone} / {kind}: 3 tsu-gumi de nai")
                    continue
                if length is not None:
                    try:
                        if float(t) > float(length) + 1e-6:
                            problems.append(f"{name} / {bone}: jikoku {t} ga nagasa {length} yori soto")
                    except ValueError:
                        pass
                for x in arr if isinstance(arr, list) else []:
                    if isinstance(x, (int, float)):
                        continue
                    ok = ("math." in x or "q." in x or "v." in x or "c." in x
                          or "variable." in x or "query." in x or "context." in x or "?" in x)
                    if isinstance(x, str) and (OK_EXPR.match(x) or ok):
                        continue
                    problems.append(f"{name} / {bone} / {kind}: yomenai shiki: {x!r}")


def main() -> int:
    geo = geometries()
    anims = our_anims()
    ents = entities()
    problems = []
    used = 0
    for name, (where, body) in sorted(anims.items()):
        check_shape(name, body, problems)
        bones = {b.lower() for b in (body.get("bones") or {})}
        if not bones:
            continue
        holders = [(f, de) for f, de in ents if plays(name, de)]
        if not holders:
            problems.append(f"{name}: dare mo narasanai（{where}）")
            continue
        used += 1
        for f, de in holders:
            have = set()
            for g in (de.get("geometry") or {}).values():
                have |= geo.get(g.split(":")[0], set())
            missing = sorted(bones - have)
            if missing:
                problems.append(f"{name}: {f} no mokei ni hone ga nai -> {', '.join(missing)}")

    for x in problems:
        print("NG", x)
    print(f"--- anime {len(anims)} ko / tsukatte iru {used} ko / NG {len(problems)} ken ---")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
