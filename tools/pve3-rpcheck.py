"""見た目の定義を、バニラのリソースパックと突き合わせて確かめる。

    python tools/pve3-rpcheck.py

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 6 章。

## なぜ道具にするのか

> ### **見た目の定義は、間違えても何も言われない**
>
> **模型の名前を 1 文字間違えると、モブは透明になる。**
> **絵のパスが違っても、アニメの名前が違っても、エラーは出ない。**
> **ゲームを開いて初めて「見えない」と分かる。**

**だから、出す前に照合する。**

## 何を照合するか

| | どこと突き合わせるか |
| --- | --- |
| **模型**（`geometry`） | バニラの `models/entity/**` と、自分の `models/entity/**` |
| **絵**（`textures`） | バニラの `textures/**` と、自分の `textures/**`（`.png` / `.tga`） |
| **材質**（`materials`） | バニラの `materials/entity.material` |
| **アニメ**（`animations`） | バニラの `animations/**` と `animation_controllers/**` |
| **描画制御**（`render_controllers`） | 自分の `render_controllers/**` |
| **描画制御が要る鍵** | `Geometry.default` などを使うので、`default` が要る |

**バニラのファイルはコメント付き JSON**なので、そのまま `json.load` できない。ここで剥がす。
"""

import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VANILLA = os.path.join(ROOT, "bedrock-samples", "resource_pack")
MINE = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
MINE_BP = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "behavior_packs", "pve_v3")


def load(path):
    """コメント付き JSON を読む"""
    s = io.open(path, encoding="utf-8", errors="replace").read()
    out, i, n, instr, esc = [], 0, len(s), False, False
    while i < n:
        ch = s[i]
        if instr:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                instr = False
            i += 1
            continue
        if ch == '"':
            instr = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and s[i + 1] == "/":
            while i < n and s[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and s[i + 1] == "*":
            i += 2
            while i + 1 < n and not (s[i] == "*" and s[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(out)))


def walk(base, sub):
    d = os.path.join(base, sub)
    for dirpath, _, files in os.walk(d):
        for f in files:
            if f.endswith(".json"):
                yield os.path.join(dirpath, f)


def geometries():
    """使える模型の名前を全部集める"""
    out = set()
    for base in (VANILLA, MINE):
        for p in walk(base, "models"):
            try:
                d = load(p)
            except Exception:
                continue
            for g in d.get("minecraft:geometry", []) or []:
                name = (g.get("description") or {}).get("identifier")
                if name:
                    out.add(name)
                    # **`geometry.A:geometry.B` は「A は B を継いだもの」**
                    # （`24-mob-howto.md` 6-9）。**名前は `:` の前だけ。**
                    # **丸ごと入れると `geometry.sheep.v1.8` が「無い」ことになる。**
                    out.add(name.split(":")[0])
            for k in d:
                if k.startswith("geometry."):
                    out.add(k)
                    out.add(k.split(":")[0])
    return out


def animations():
    """
    使えるアニメと、アニメ制御の名前。

    > ### **バニラの実体が使っている名前も、存在するものとして数える**
    >
    > **公開サンプルには、定義ファイルが同梱されていないものがある**
    > （`controller.animation.player.hudplayer` / `animation.humanoid.fishing_rod` など）。
    > **バニラの実体がそれを指している以上、ゲーム本体にはある。**
    > **無い扱いにすると、正しい定義を消してしまう。**
    """
    out = set()
    for base in (VANILLA, MINE):
        for sub in ("animations", "animation_controllers"):
            for p in walk(base, sub):
                try:
                    d = load(p)
                except Exception:
                    continue
                out |= set(d.get("animations", {}))
                out |= set(d.get("animation_controllers", {}))
    # ---- バニラの実体が指している名前を足す
    for sub in ("entity", "attachables"):
        d = os.path.join(VANILLA, sub)
        if not os.path.isdir(d):
            continue
        for dirpath, _, files in os.walk(d):
            for f in files:
                if not f.endswith(".json"):
                    continue
                try:
                    doc = load(os.path.join(dirpath, f))
                except Exception:
                    continue
                for top in ("minecraft:client_entity", "minecraft:attachable"):
                    de = (doc.get(top) or {}).get("description") or {}
                    out |= set((de.get("animations") or {}).values())
                    for e in de.get("animation_controllers") or []:
                        out |= set(e.values())
    return out


def render_controllers():
    """
    描画制御の名前と、**それが要求する鍵**。

    > ### **`Texture.default` を使う制御なら、`default` が要る**
    >
    > **鍵が無いと、その実体は貼られない**（透明になる）。
    > **制御ごとに要求が違う**ので、中を読んで拾う。
    """
    out = {}
    for base in (VANILLA, MINE):
        for p in walk(base, "render_controllers"):
            try:
                d = load(p)
            except Exception:
                continue
            for name, body in d.get("render_controllers", {}).items():
                raw = json.dumps(body, ensure_ascii=False)
                out[name] = {
                    "textures": set(re.findall(r"Texture\.([A-Za-z0-9_]+)", raw)),
                    "geometry": set(re.findall(r"Geometry\.([A-Za-z0-9_]+)", raw)),
                    "materials": set(re.findall(r"Material\.([A-Za-z0-9_]+)", raw)),
                }
    return out


def props_of_entity():
    """
    **ビヘイビア側が宣言している property**（実体 id ごと）。

    > ### **持っていない property を読むと、見た目が丸ごと出ない**（**踏んだ**・2026-09-09）
    >
    > **爆弾は `controller.render.pve3_hurt`**（`q.property('pve_v3:chill')` を読む）**を
    > 指していたのに、property を 1 つも宣言していなかった。**
    > **Molang がそこで止まり、実体が何も描かれなかった。**
    > **矢・種・味方も、`pre_animation` で持っていない `pve_v3:swing` を読んでいた。**
    """
    out = {}
    for p in walk(MINE_BP, "entities"):
        try:
            d = load(p)["minecraft:entity"]["description"]
        except Exception:
            continue
        out[d.get("identifier", "")] = set((d.get("properties") or {}).keys())
    return out


def render_controller_props():
    """**描画制御が読む property**（制御の名前ごと）"""
    out = {}
    for base in (VANILLA, MINE):
        for p in walk(base, "render_controllers"):
            try:
                d = load(p)
            except Exception:
                continue
            for name, body in d.get("render_controllers", {}).items():
                out[name] = props_used(body)
    return out


def props_used(body):
    """その中で読んでいる property の名前"""
    return set(re.findall(r"property\('([^']+)'\)", json.dumps(body, ensure_ascii=False)))


def materials():
    """
    使える材質の名前。

    > ### **`materials/*.material` は同梱されていない**
    >
    > **bedrock-samples にはマテリアル定義が入っていない。**
    > **代わりに「バニラの実体定義が実際に使っている名前」を集める**——
    > **バニラが使っているなら、その名前は存在する。**
    """
    out = set()
    for base in (VANILLA, MINE):
        for sub in ("entity", "attachables"):
            d = os.path.join(base, sub)
            if not os.path.isdir(d):
                continue
            for dirpath, _, files in os.walk(d):
                for f in files:
                    if not f.endswith(".json"):
                        continue
                    try:
                        doc = load(os.path.join(dirpath, f))
                    except Exception:
                        continue
                    for top in ("minecraft:client_entity", "minecraft:attachable"):
                        de = (doc.get(top) or {}).get("description") or {}
                        for v in (de.get("materials") or {}).values():
                            out.add(v)
    return out


def texture_exists(rel):
    for base in (MINE, VANILLA):
        for ext in (".png", ".tga", ""):
            if os.path.exists(os.path.join(base, rel.replace("/", os.sep) + ext)):
                return True
    return False


def main() -> int:
    geo, anim, rc, mat = geometries(), animations(), render_controllers(), materials()
    props, rcprops = props_of_entity(), render_controller_props()
    bad = 0
    files = sorted(os.listdir(os.path.join(MINE, "entity")))
    for f in files:
        if not f.endswith(".json"):
            continue
        p = os.path.join(MINE, "entity", f)
        d = load(p)["minecraft:client_entity"]["description"]
        problems = []

        for key, name in (d.get("geometry") or {}).items():
            if name not in geo:
                problems.append(f"mokei nai: {key}={name}")
        for key, name in (d.get("textures") or {}).items():
            if not texture_exists(name):
                problems.append(f"e nai: {key}={name}")
        for key, name in (d.get("materials") or {}).items():
            if name not in mat:
                problems.append(f"zaishitsu nai: {key}={name}")
        for key, name in (d.get("animations") or {}).items():
            if name not in anim:
                problems.append(f"anime nai: {key}={name}")
        for entry in d.get("animation_controllers") or []:
            for key, name in entry.items():
                if name not in anim:
                    problems.append(f"anime seigyo nai: {key}={name}")
        for name in d.get("render_controllers") or []:
            if isinstance(name, dict):
                name = list(name)[0]
            need = rc.get(name)
            if need is None:
                problems.append(f"byouga seigyo nai: {name}")
                continue
            # ---- **その制御が要求する鍵**を持っているか
            for key in ("textures", "geometry", "materials"):
                have = set(d.get(key) or {})
                for k in need[key]:
                    if k not in have:
                        problems.append(f"{key} ni '{k}' ga nai（{name} ga iru）")

        # ---- **読む property を、ビヘイビア側が宣言しているか**
        have = props.get(d.get("identifier", ""))
        if have is not None:
            want = props_used(d.get("scripts") or {})
            for name in d.get("render_controllers") or []:
                if isinstance(name, dict):
                    name = list(name)[0]
                want |= rcprops.get(name, set())
            for k in sorted(want):
                # **バニラの property は向こうが持っている**
                if k.startswith("minecraft:"):
                    continue
                if k not in have:
                    problems.append(f"property '{k}' wo yomu ga behavior ni nai")

        # ---- **その版に無い書き方をしていないか**
        #
        # > ### **1.8.0 に `scripts.animate` は無い**（**踏んだ**・2026-09-09）
        # >
        # > *description | scripts | animate | child 'animate' not valid here.*
        # > **実体が丸ごと読み込まれず、見た目が消える。**
        # > **昔の形は `animation_controllers` の並び。**
        ver = load(p).get("format_version", "")
        if ver.startswith("1.8") and "animate" in ((d.get("scripts") or {})):
            problems.append("1.8.0 ni scripts.animate wa nai（animation_controllers ni kaku）")

        # ---- **`animations` の無い `animation_controllers` は弾かれる**（**踏んだ**・2026-09-09）
        #
        # > *description | animation_controllers | child 'animation_controllers' not valid here.*
        # > **スライムのように、アニメを 1 つも持たない実体がある。**
        if d.get("animation_controllers") and not (d.get("animations") or {}):
            problems.append("animations ga nai noni animation_controllers wo kaite iru")

        # ---- **空の入れ物を書かない**（**踏んだ**・2026-09-09）
        #
        # > *description | animations | Node has too few children (0 < 1)*
        # > **中身を全部消したのに鍵だけ残すと、実体ごと読み込まれない。**
        for key in ("animations", "scripts", "particle_effects", "textures", "geometry", "materials"):
            v = d.get(key)
            if isinstance(v, (dict, list)) and len(v) == 0:
                problems.append(f"kara no '{key}' wa kakanai（kagi goto kesu）")

        # ---- 鳴らす名前は宣言してあるか
        animate = ((d.get("scripts") or {}).get("animate")) or []
        declared = set(d.get("animations") or {}) | {
            k for e in (d.get("animation_controllers") or []) for k in e
        }
        for a in animate:
            key = list(a)[0] if isinstance(a, dict) else a
            if key not in declared:
                problems.append(f"animate ni aru ga sengen nai: {key}")

        if problems:
            bad += 1
            print(f"NG {f}")
            for x in problems:
                print(f"     {x}")
    print(f"--- {len(files)} ken / NG {bad} ken ---")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
