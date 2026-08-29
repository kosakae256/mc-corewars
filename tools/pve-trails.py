"""軌跡の粒を、**弓 1 本ごとに 1 つ**作る（48 個）。

    python tools/pve-trails.py worlds/pve/packs/pve

仕様は `docs/spec/13-bow-view.md` 4 章、一覧は `docs/spec/19-weapons.md`。
**出どころは `tools/pve_weapon_table.py`。**

## 5 種類の使い回しをやめた（2026-08-29）

**「弓ごとに違う絵」と書いておきながら、5 種類を回していた。**
**48 本ぶん作る。** 手で書くのは無理なので、**一覧から書き出す。**

| 何で変わるか | どこに出るか |
| --- | --- |
| `hue` | **色**（芯は明るく、尾は濃く） |
| `mat` | **形**（木＝太い筋 / 鋼＝細く長い / 水晶＝尖る / 骨＝丸い / 黒鉄＝煙） |
| `base` | **太さ**（重い弓ほど太い） |
| `rarity` | **残る長さ**（段が上がるほど長く残る） |
| `ability` | **癖**（爆ぜる弓は膨らむ・貫く弓は伸びる・拡散は短い） |
"""

import colorsys
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_weapon_table import weapons  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
PAR = os.path.join(ROOT, "resource_packs", "pve", "particles")
os.makedirs(PAR, exist_ok=True)

# 素材ごとの絵と、基本の形（長さ・太さ・材質）
MATERIAL = {
    #          絵           長さ  太さ  合成
    "wood": ("pve_dash", 1.05, 0.085, "particles_add"),
    "steel": ("pve_dash", 1.35, 0.06, "particles_add"),
    "crystal": ("pve_splinter", 0.95, 0.11, "particles_add"),
    "bone": ("pve_droplet", 0.75, 0.10, "particles_alpha"),
    "dark": ("pve_wisp", 1.15, 0.14, "particles_alpha"),
}

# 段ごとの、残る長さ（秒）
LIFE = {"common": 0.16, "uncommon": 0.20, "rare": 0.26, "legendary": 0.32}

# 能力ごとの癖（長さ・太さ・寿命の倍率）
QUIRK = {
    "spread3": (0.8, 1.0, 0.8),
    "spread5": (0.75, 1.0, 0.8),
    "twin_spiral": (0.85, 1.1, 0.9),
    "quiver": (0.85, 1.0, 0.9),
    "ward": (0.9, 1.1, 1.1),
    "pierce_all": (1.5, 0.85, 1.2),
    "pierce_line": (1.45, 0.9, 1.2),
    "railgun": (1.8, 1.3, 1.4),
    "rapid": (0.7, 0.8, 0.6),
    "cannon": (1.2, 1.6, 1.2),
    "meteor": (1.2, 1.5, 1.2),
    "explode_small": (1.0, 1.3, 1.0),
    "firework": (1.0, 1.2, 1.1),
    "mine": (1.0, 1.2, 0.9),
    "homing": (1.1, 1.0, 1.3),
    "bounce": (1.0, 1.0, 1.2),
    "blackhole": (1.1, 1.3, 1.3),
    "aurora": (1.2, 1.2, 1.4),
    "starfall": (1.1, 1.1, 1.2),
    "time_stop": (1.0, 1.0, 1.5),
    "root": (0.9, 1.2, 1.1),
}


def rgb(hue, sat, val):
    r, g, b = colorsys.hsv_to_rgb((hue % 360) / 360.0, min(1.0, sat), min(1.0, val))
    return [round(r, 3), round(g, 3), round(b, 3)]


def particle(w):
    """1 本ぶんの軌跡"""
    tex, length, width, material = MATERIAL[w["mat"]]
    ql, qw, qt = QUIRK.get(w["ability"], (1.0, 1.0, 1.0))

    # **重い弓ほど太い**（基礎攻撃力から）
    heavy = 0.85 + (w["base"] / 70) * 0.5
    length = round(length * ql, 3)
    width = round(width * qw * heavy, 4)
    life = round(LIFE[w["rarity"]] * qt, 3)

    hue = w["hue"]
    # **芯は明るく、尾は濃い。** 同じ色でも、明るさの差で「速さ」が出る
    head = rgb(hue, 0.35, 1.0) + [0.95]
    tail = rgb(hue - 12, 0.95, 0.75) + [0.0]

    fade = "(1 - (v.particle_age / v.particle_lifetime))"
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": f'pve:trail_{w["key"]}',
                "basic_render_parameters": {"material": material, "texture": f"textures/particle/{tex}"},
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 1},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
                "minecraft:particle_initial_speed": 0,
                "minecraft:particle_lifetime_expression": {"max_lifetime": life},
                "minecraft:particle_appearance_billboard": {
                    "size": [length, f"{width} * {fade}"],
                    # **進む向きへ寝かせる**（向きは script が渡す）
                    "facing_camera_mode": "direction_x",
                    "direction": {"mode": "custom", "custom_direction": ["v.dx", "v.dy", "v.dz"]},
                    "uv": {"texture_width": 16, "texture_height": 16, "uv": [0, 0], "uv_size": [16, 16]},
                },
                "minecraft:particle_appearance_tinting": {
                    "color": {"gradient": [head, tail], "interpolant": "v.particle_age / v.particle_lifetime"}
                },
            },
        },
    }


def main() -> int:
    ws = weapons()
    for w in ws:
        d = particle(w)
        # 絵によって枡の大きさが違う（`pve_dash` は 32x8）
        if w["mat"] in ("wood", "steel"):
            uv = d["particle_effect"]["components"]["minecraft:particle_appearance_billboard"]["uv"]
            uv.update({"texture_width": 32, "texture_height": 8, "uv_size": [32, 8]})
        path = os.path.join(PAR, f'trail_{w["key"]}.json')
        with io.open(path, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
    print(f"軌跡の粒 {len(ws)} 個を書いた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
