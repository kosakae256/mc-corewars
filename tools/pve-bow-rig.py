"""弓の「持ち姿」一式を、バニラの弓と同じ作りで書き出す。

    python tools/pve-bow-rig.py worlds/pve/packs/pve

絵は作らない（それは `tools/pve-bow-textures.py`）。
ここで書くのは **模型・描き分け・手つき・attachable** の 4 つ。

## バニラから何を持ってきたか

`bedrock-samples/resource_pack/` の弓を読んで、**同じ値をそのまま使っている。**

| こちら | バニラ |
| --- | --- |
| `texture_meshes` の `local_pivot` / `position` / `rotation` | `models/entity/bow.geo.json` **と同じ** |
| 手つき（構え・引き）の位置と角度 | `animations/bow.animation.json` **と同じ** |
| 引き具合 `variable.charge_amount` | `attachables/bow.json` **の式が下敷き** |

## 1 つだけ変えた所——段の選び方

バニラは `query.get_animation_frame` で 4 段を選ぶ。
**これはバニラの弓のために用意された数え方で、独自アイテムでは進む保証が無い。**

なので**引いた長さから段を出す。**

```
0 = 構え / 1 = 引き0 / 2 = 引き1 / 3 = 引き2
```

> ### 添字は、変数を通さない
>
> 一度は `pre_animation` で `variable.pve_frame` を作り、
> **render controller からそれを読んでいた。**
> **引くと弓が丸ごと消えた**（2026-08-29）——
> **変数が読めない・値が壊れると、添字が外れてモデルが選ばれない。**
>
> **query から直接組み立て、`math.clamp` で 0〜3 に閉じ込める。**
> こうすると、**どう転んでも「どれかの弓」が出る。**
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_weapon_table import weapons  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
RP = os.path.join(ROOT, "resource_packs", "pve")
for d in ["models/entity", "attachables", "render_controllers", "animations"]:
    os.makedirs(os.path.join(RP, *d.split("/")), exist_ok=True)

# **一覧から回す**（`tools/pve_weapon_table.py`）
WEAPONS = weapons()
BOWS = [w["key"] for w in WEAPONS]

# きらめきを持つ弓（光る飾り）。**持たない弓は構えの絵を使い回す**
TWINKLING = {w["key"] for w in WEAPONS if w["decor"] in ("stars", "gems")}

# 絵の一辺（`tools/pve-bow-art.py` と揃える）。**バニラの 4 倍**
TEX = 64

# 画素を立方体に起こすので、**絵が 4 倍なら模型も 4 倍**になる。
# **持ち姿で 1/4 に縮めて**、大きさを元へ戻す（`animation.pve_bow.wield` の scale）
SCALE = 16 / TEX
FRAMES = ["standby", "pulling_0", "pulling_1", "pulling_2"]

# きらめきの絵（**構えのときだけ入れ替わる**）。星屑だけ中身が変わる
TWINKLE_KEYS = ["twinkle_0", "twinkle_1"]
TWINKLES = [f"texture.{k}" for k in TWINKLE_KEYS]

# ためきるまでの tick。**script 側（lib/charge.ts の FULL_CHARGE_TICKS）と同じ値にする**
FULL_TICKS = 20.0

# 引いた長さ（tick）。**`use_duration` は残り時間なので、上限から引く**
ELAPSED = "(query.main_hand_item_max_duration - query.main_hand_item_use_duration)"

# ため具合 0〜1
RATE = f"math.clamp({ELAPSED} / {FULL_TICKS}, 0.0, 1.0)"

# 段（0 = 構え / 1〜3 = 引き）。
#
# **必ず 0〜3 に収める。** 添字が外れると**モデルが選ばれず、消える。**
FRAME = (
    f"query.main_hand_item_use_duration > 0.0"
    f" ? math.clamp(math.floor(1.0 + 2.0 * {RATE}), 1.0, 3.0) : 0.0"
)

# きらめきの番（0〜2）。**構えているときだけ、ゆっくり回る**
TWINKLE = "math.mod(math.floor(query.life_time * 1.5), 3.0)"

# 絵の番。**引いている間は段、構えているときはきらめき**
#
# 0 = 構え / 1〜3 = 引き / 4・5 = きらめき
# **立体は段（FRAME）で選ぶ。** 形が同じ絵なので、色だけ差し替わる
# **きらめきを持たない弓は、構えの絵から動かさない。**
#
# 以前は全部の弓で 0 → 4 → 5 と回していた。
# **きらめきの絵が無い弓では、その番の絵が解決できず、消えたり出たりした**
#（2026-08-29 の不具合）。**持っているかどうかを attachable が変数で伝える。**
TEXFRAME = (
    f"query.main_hand_item_use_duration > 0.0"
    f" ? math.clamp(math.floor(1.0 + 2.0 * {RATE}), 1.0, 3.0)"
    f" : (variable.pve_twinkle > 0.5 && {TWINKLE} != 0.0 ? 3.0 + {TWINKLE} : 0.0)"
)


def write(path: str, data: dict) -> None:
    with open(os.path.join(RP, path), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    if len(BOWS) <= 6:
        print("  ", path)


# ---------------------------------------------------------------- 模型
#
# 絵から立体を起こす（`texture_meshes`）。**立方体は 1 つも書かない**
geo = {"format_version": "1.16.0", "minecraft:geometry": []}
for key in BOWS:
    # 段の 4 つ ＋ **きらめきの 2 つ**（持つ弓だけ。構えと同じ置き方）
    for i, f in enumerate(FRAMES + (TWINKLE_KEYS if key in TWINKLING else [])):
        geo["minecraft:geometry"].append({
            "description": {
                "identifier": f"geometry.pve_bow_{key}_{f}",
                "texture_width": TEX,
                "texture_height": TEX,
            },
            "bones": [{
                "name": "rightitem",
                "texture_meshes": [{
                    # **絵が 4 倍なので、絵の中の位置も 4 倍**（texture space）
                    "local_pivot": [6.0 / SCALE, 0.0, 6.0 / SCALE],
                    # バニラと同じ置き方。**縮める前の値**なので 1/SCALE 倍しておく
                    "position": [
                        (2.0 if (i <= 1 or i >= len(FRAMES)) else 2.01) / SCALE,
                        1.0 / SCALE,
                        # **きらめきは構えと同じ置き方**（段ではないので）
                        (-2.0 if (i == 0 or i >= len(FRAMES)) else -1.0) / SCALE,
                    ],
                    "rotation": [0.0, -135.0, 90.0],
                    "texture": "default" if i == 0 else f,
                }],
            }],
        })
write("models/entity/pve_bow.geo.json", geo)

# ---------------------------------------------------------------- 描き分け
write("render_controllers/pve_bow.render_controllers.json", {
    "format_version": "1.10",
    "render_controllers": {
        "controller.render.pve_bow": {
            "arrays": {
                "textures": {"array.frames": [f"texture.{'default' if i == 0 else f}"
                                              for i, f in enumerate(FRAMES)] + TWINKLES},
                "geometries": {"array.geos": [f"geometry.{'default' if i == 0 else f}"
                                              for i, f in enumerate(FRAMES)]
                               + [f"geometry.{k}" for k in TWINKLE_KEYS]},
            },
            # **段はここで出す**（バニラの get_animation_frame の代わり）。
            # **変数を経由しない**——変数が読めなかったときに
            # **添字が壊れて、弓が丸ごと消える**（2026-08-29 の不具合）
            # **立体も絵と同じ番で選ぶ。**
            # `texture_meshes` は**絵から立体を起こす**ので、
            # **絵だけ差し替えても見た目は変わらない**（2026-08-29 に気付いた）
            "geometry": f"array.geos[{TEXFRAME}]",
            "materials": [{"*": "material.default"}],
            "textures": [f"array.frames[{TEXFRAME}]"],
        }
    },
})

# ---------------------------------------------------------------- 手つき
#
# **バニラ `animation.bow.wield` / `wield_first_person_pull` と同じ値**
write("animations/pve_bow.animation.json", {
    "format_version": "1.10.0",
    "animations": {
        "animation.pve_bow.wield": {
            "loop": True,
            "bones": {"rightitem": {
                # **絵を 4 倍にしたぶん、ここで縮める**（模型は絵の画素数ぶん大きくなる）
                "scale": SCALE,
                "position": ["c.is_first_person ? -5.5 : 0.5",
                             "c.is_first_person ? -3.0 : -2.5",
                             "c.is_first_person ? -3.0 : 1.0"],
                "rotation": ["c.is_first_person ? 38.0 : 0.0",
                             "c.is_first_person ? -120.0 : 0.0",
                             "c.is_first_person ? -63.0 : 0.0"],
            }},
        },
        "animation.pve_bow.pull": {
            "loop": True,
            "bones": {"rightitem": {
                # **引き切ると小さく震える**（バニラと同じ式）
                "position": [-1.5,
                             "2.5 + (variable.charge_amount >= 1.0 ?"
                             " math.sin(q.life_time * 1000.0 * 1.3) * 0.1"
                             " - math.sin(q.life_time * 45.0) * 0.5 : 0.0)",
                             -4.8],
                "rotation": [-53.0, 8.0, 35.0],
            }},
        },
    },
})

# ---------------------------------------------------------------- 手に持つ姿
#
# **引き具合だけを渡す**（段は render controller が出す）
def pre_animation(key: str) -> list:
    """引き具合と、**きらめきを持つかどうか**を渡す"""
    return [
        f"variable.charge_amount = math.clamp(({ELAPSED} + query.frame_alpha) / {FULL_TICKS}, 0.0, 1.0);",
        f"variable.pve_twinkle = {1.0 if key in TWINKLING else 0.0};",
    ]
for key in BOWS:
    write(f"attachables/pve_bow_{key}.json", {
        "format_version": "1.10.0",
        "minecraft:attachable": {
            "description": {
                "identifier": f"pve:bow_{key}",
                "materials": {"default": "entity_alphatest", "enchanted": "entity_alphatest_glint"},
                "textures": {
                    "default": f"textures/items/pve_bow_{key}_standby",
                    **{f: f"textures/items/pve_bow_{key}_{f}" for f in FRAMES[1:]},
                    **{
                        k: f"textures/items/pve_bow_{key}_{k if key in TWINKLING else 'standby'}"
                        for k in TWINKLE_KEYS
                    },
                },
                "geometry": {
                    "default": f"geometry.pve_bow_{key}_standby",
                    **{f: f"geometry.pve_bow_{key}_{f}" for f in FRAMES[1:]},
                    **{
                        k: f"geometry.pve_bow_{key}_{k if key in TWINKLING else 'standby'}"
                        for k in TWINKLE_KEYS
                    },
                },
                "animations": {"wield": "animation.pve_bow.wield", "pull": "animation.pve_bow.pull"},
                "scripts": {
                    "pre_animation": pre_animation(key),
                    "animate": ["wield", {"pull": "query.main_hand_item_use_duration > 0.0f && c.is_first_person"}],
                },
                "render_controllers": ["controller.render.pve_bow"],
            }
        },
    })
# ---------------------------------------------------------------- アイテムと絵の登録
BP = os.path.join(ROOT, "behavior_packs", "pve", "items")
os.makedirs(BP, exist_ok=True)
tex = {"resource_pack_name": "pve", "texture_name": "atlas.items", "texture_data": {}}
for w in WEAPONS:
    key = w["key"]
    item = {
        "format_version": "1.26.40",
        "minecraft:item": {
            "description": {"identifier": f"pve:bow_{key}", "menu_category": {"category": "equipment"}},
            "components": {
                "minecraft:display_name": {"value": w["name"]},
                "minecraft:icon": f"pve_bow_{key}",
                "minecraft:max_stack_size": 1,
                "minecraft:hand_equipped": True,
                # **ためは自分で切る**（`docs/spec/13-bow-view.md` 1-2）
                "minecraft:use_modifiers": {"use_duration": 3600.0, "movement_modifier": 1.0},
                "minecraft:tags": {"tags": ["pve:bow"]},
            },
        },
    }
    with open(os.path.join(BP, f"bow_{key}.json"), "w", encoding="utf-8") as f:
        json.dump(item, f, indent=2, ensure_ascii=False)
    tex["texture_data"][f"pve_bow_{key}"] = {
        "textures": [f"textures/items/pve_bow_{key}_{n}" for n in FRAMES]
    }
with open(os.path.join(RP, "textures", "item_texture.json"), "w", encoding="utf-8") as f:
    json.dump(tex, f, indent=2, ensure_ascii=False)
print(f"  アイテム {len(WEAPONS)} / 絵の登録 {len(tex['texture_data'])}")

print("できた")
