"""PVE v2 の弓の「持ち姿」一式を書き出す。

    python tools/pve2-bow-rig.py worlds/pve-v2/packs/pve_v2

仕様は `worlds/pve-v2/docs/spec/10-bow.md` 3 章。

## 何を書き出すか

| | どこへ |
| --- | --- |
| アイテム定義 | `behavior_packs/pve_v2/items/bow.json` |
| 絵の登録 | `resource_packs/pve_v2/textures/item_texture.json` |
| 模型 | `resource_packs/pve_v2/models/entity/pve2_bow.geo.json` |
| 描き分け | `resource_packs/pve_v2/render_controllers/` |
| 手つき | `resource_packs/pve_v2/animations/` |
| 持ち姿 | `resource_packs/pve_v2/attachables/pve2_bow.json` |

## v1 で分かっていること（そのまま使う）

| | |
| --- | --- |
| **絵から立体を起こす**（`texture_meshes`） | 立方体を書かなくてよい |
| **絵が 4 倍なら模型も 4 倍**になる | 持ち姿で **1/4 に縮める**（`scale`） |
| **添字は変数を通さない** | 変数が読めないと**弓ごと消える**。query から直接組み立てる |
| **段の選び方はバニラと違う** | `query.get_animation_frame` は独自アイテムで進まない |

## v2 で変わったところ——**段が無い**

**絵は 1 枚だけ**（2026-08-30 決定）。**持っている限り引き絞った姿。**

| | |
| --- | --- |
| 段の切り替え | **しない**（`array` も `math.mod` も要らない） |
| 撃った合図 | **小さく蹴り返すだけ**（0.15 秒） |
| 他人から見た姿 | **弓を構えた姿**（`tools/pve2-player-bow.py`） |

**引く動きは見せない**——**銃のように撃つ**ので、見せる間が無い。
"""

import io
import json
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve-v2/packs/pve_v2"
BP = os.path.join(ROOT, "behavior_packs", "pve_v2")
RP = os.path.join(ROOT, "resource_packs", "pve_v2")

# 絵の一辺（`tools/pve2-bow-art.py` と揃える）
TEX = 64

# 画素を立方体に起こすので、**絵が 4 倍なら模型も 4 倍**。持ち姿で縮めて戻す
SCALE = 16 / TEX

# 撃つ周期（tick）。**`docs/spec/10-bow.md` 1 章の 0.5 秒**
CYCLE = 10

FRAME = "bow"

# 押していた長さ（tick）。**`use_duration` は残り時間なので、上限から引く**
ELAPSED = "(query.main_hand_item_max_duration - query.main_hand_item_use_duration)"
PHASE = f"math.mod({ELAPSED}, {CYCLE}.0)"

# 撃った直後の強さ（1 → 0）。**3 tick で戻る**
#
# **撃つ間隔と同じ周期で回している**——押した瞬間に 1 発目が出て、
# そこから 10 tick ごとに出るので、**位相が実際の発射と合う。**
KICK = f"(math.clamp(3.0 - {PHASE}, 0.0, 3.0) / 3.0)"

# 息づかい。**止まっていても、わずかに動く**（秒あたり 70 度・43 度）
BREATH = "math.sin(query.life_time * 70.0)"
DRIFT = "math.cos(query.life_time * 43.0)"




def write(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("  ", os.path.relpath(path, ROOT))


def main() -> int:
    # ---------------------------------------------------------------- 模型
    geo = {"format_version": "1.16.0", "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.pve2_bow",
            "texture_width": TEX,
            "texture_height": TEX,
        },
        "bones": [{
            "name": "rightitem",
            "texture_meshes": [{
                # **絵の中の位置も 4 倍**（texture space）
                "local_pivot": [6.0 / SCALE, 0.0, 6.0 / SCALE],
                # バニラの弓と同じ置き方（**縮める前の値**）
                "position": [2.0 / SCALE, 1.0 / SCALE, -2.0 / SCALE],
                "rotation": [0.0, -135.0, 90.0],
                "texture": "default",
            }],
        }],
    }]}
    write(os.path.join(RP, "models", "entity", "pve2_bow.geo.json"), geo)

    # ---------------------------------------------------------------- 描き分け
    write(os.path.join(RP, "render_controllers", "pve2_bow.render_controllers.json"), {
        "format_version": "1.10",
        "render_controllers": {
            # **段が無いので、選ぶものも無い**（`docs/spec/10-bow.md` 3-2）
            "controller.render.pve2_bow": {
                "geometry": "geometry.default",
                "materials": [{"*": "material.default"}],
                "textures": ["texture.default"],
            }
        },
    })

    # ---------------------------------------------------------------- 手つき
    write(os.path.join(RP, "animations", "pve2_bow.animation.json"), {
        "format_version": "1.10.0",
        "animations": {
            "animation.pve2_bow.wield": {
                "loop": True,
                "bones": {"rightitem": {
                    # **絵を 4 倍にしたぶん、ここで縮める**
                    "scale": SCALE,
                    "position": ["c.is_first_person ? -5.5 : 0.5",
                                 "c.is_first_person ? -3.0 : -2.5",
                                 "c.is_first_person ? -3.0 : 1.0"],
                    "rotation": ["c.is_first_person ? 38.0 : 0.0",
                                 "c.is_first_person ? -120.0 : 0.0",
                                 "c.is_first_person ? -63.0 : 0.0"],
                }},
            },
            # **撃った直後だけ、小さく蹴り返す**（0.15 秒）。
            # **引く動きは見せない**——銃のように撃つので、その間が無い
            "animation.pve2_bow.fire": {
                "loop": True,
                "bones": {"rightitem": {
                    "position": [0.0, f"{KICK} * 0.5", f"{KICK} * -1.6"],
                    "rotation": [f"{KICK} * 13.0", f"{KICK} * -4.0", f"{KICK} * 2.0"],
                }},
            },
            # **止まっていても、わずかに揺れる**。
            # 動かないと、**手に持っている物ではなく貼り紙に見える**
            "animation.pve2_bow.sway": {
                "loop": True,
                "bones": {"rightitem": {
                    "position": [f"{DRIFT} * 0.12", f"{BREATH} * 0.22", 0.0],
                    "rotation": [f"{BREATH} * 1.1", f"{DRIFT} * 1.6", f"{BREATH} * 0.9"],
                }},
            },
            # **走っている間は下げる**（構えたままだと走っている感じが出ない）
            "animation.pve2_bow.run": {
                "loop": True,
                "bones": {"rightitem": {
                    "position": [0.0, -1.2, -0.6],
                    "rotation": [18.0, -10.0, 6.0],
                }},
            },
        },
    })

    # ---------------------------------------------------------------- 持ち姿
    write(os.path.join(RP, "attachables", "pve2_bow.json"), {
        "format_version": "1.10.0",
        "minecraft:attachable": {
            "description": {
                "identifier": "pve_v2:bow",
                "materials": {"default": "entity_alphatest", "enchanted": "entity_alphatest_glint"},
                "textures": {"default": f"textures/items/pve2_bow_{FRAME}"},
                "geometry": {"default": "geometry.pve2_bow"},
                "animations": {
                    "wield": "animation.pve2_bow.wield",
                    "fire": "animation.pve2_bow.fire",
                    "sway": "animation.pve2_bow.sway",
                    "run": "animation.pve2_bow.run",
                },
                # **重ねがけ**——後のものが前のものへ足される。
                # `fire` は**一人称だけに絞らない**（他人からも蹴り返って見える）
                "scripts": {
                    "animate": [
                        "wield",
                        "sway",
                        {"fire": "query.main_hand_item_use_duration > 0.0f"},
                        {"run": "query.is_sprinting"},
                    ]
                },
                "render_controllers": ["controller.render.pve2_bow"],
            }
        },
    })

    # ---------------------------------------------------------------- アイテム
    write(os.path.join(BP, "items", "bow.json"), {
        "format_version": "1.26.40",
        "minecraft:item": {
            "description": {"identifier": "pve_v2:bow", "menu_category": {"category": "equipment"}},
            "components": {
                "minecraft:display_name": {"value": "弓"},
                "minecraft:icon": "pve2_bow",
                "minecraft:max_stack_size": 1,
                "minecraft:hand_equipped": True,
                # **長押しを自分で切る**（勝手に終わらせない）。
                # **移動は遅くならない**（`docs/spec/10-bow.md` 1 章）
                "minecraft:use_modifiers": {"use_duration": 3600.0, "movement_modifier": 1.0},
                "minecraft:tags": {"tags": ["pve_v2:weapon"]},
            },
        },
    })

    # ---------------------------------------------------------------- 絵の登録
    write(os.path.join(RP, "textures", "item_texture.json"), {
        "resource_pack_name": "pve_v2",
        "texture_name": "atlas.items",
        "texture_data": {
            "pve2_bow": {"textures": f"textures/items/pve2_bow_{FRAME}"},
            # **ステータスの本**（`docs/spec/12-element.md` 3-1）。
            # **バニラの本の絵をそのまま指す**——独自の絵は要らない。
            # `"minecraft:icon": "book"` では出なかったので、**ここに登録して指す**
            "pve2_sheet": {"textures": "textures/items/book_normal"},
        },
    })

    print("できた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
