"""飛んでいる矢の**見た目**を書き出す。

    python tools/pve2-arrow.py worlds/pve-v2/packs/pve_v2

仕様は `worlds/pve-v2/docs/spec/10-bow.md` 2 章・3-3。

## 見た目は**バニラの矢そのもの**

**模型も絵も作らない。** バニラのものを名前で指すだけ。

| | 何を指すか |
| --- | --- |
| 模型 | `geometry.arrow` |
| 絵 | `textures/entity/arrows` |
| 材質 | `arrow` |

> **自作の矢を描いてみたが、バニラの矢と別物に見えた。**
> **見慣れた矢**のほうが「矢が飛んでいる」と分かる。

## それでもバニラの矢**ではない**

**当たり判定は script が持つ**（毎 tick、区間で見る）。
実体は**そこに矢を描くためだけ**に居る。

| | |
| --- | --- |
| 当たり判定 | **無い**（当てるのは script） |
| 重力・押し合い | **無い**（`minecraft:physics` を入れない） |
| 消え方 | **script が消す。** 取りこぼしても **2 秒で自然に消える** |

> ### バニラの発射に乗らない
>
> **拡散・貫通・追尾を script で決めたい**（`docs/00-concept.md` 6 章）。
> バニラの矢を撃つと、**放った後を触れなくなる。**

## 向きの付け方

**実体の体は横回転（yaw）しか向かない。**
**上下（pitch）は、実体のプロパティを見て模型（`body`）を回す。**

```
script → pve_v2:pitch（−90〜90・下向きが正）→ アニメーションが骨を回す
```

**`client_sync` を付けないと、絵の側に届かない。**
"""

import io
import json
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve-v2/packs/pve_v2"
BP = os.path.join(ROOT, "behavior_packs", "pve_v2")
RP = os.path.join(ROOT, "resource_packs", "pve_v2")

# バニラの矢は **少し縮めて** 描かれている（`arrow.animation.json` と同じ値）
SCALE = [0.7, 0.7, 0.9]


def write(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("  ", os.path.relpath(path, ROOT))


def drop(path: str) -> None:
    """前に自作していた模型・絵を消す"""
    if os.path.exists(path):
        os.remove(path)
        print("   消した", os.path.relpath(path, ROOT))


def main() -> int:
    # ---------------------------------------------------------------- 実体
    write(os.path.join(BP, "entities", "arrow.json"), {
        "format_version": "1.26.20",
        "minecraft:entity": {
            "description": {
                "identifier": "pve_v2:arrow",
                "is_summonable": True,
                "is_spawnable": False,
                # **上下の向き。** `client_sync` が無いと絵に届かない
                "properties": {
                    "pve_v2:pitch": {"type": "float", "range": [-90.0, 90.0], "default": 0.0, "client_sync": True}
                },
            },
            "components": {
                "minecraft:type_family": {"family": ["pve2_arrow", "inanimate"]},
                # **ぶつからない・押されない**（位置は script が決める）。
                # **`minecraft:physics` を入れない**——重力も当たりも要らない
                "minecraft:collision_box": {"width": 0.01, "height": 0.01},
                "minecraft:health": {"value": 1, "max": 1},
                "minecraft:fire_immune": {},
                "minecraft:knockback_resistance": {"value": 1},
                "minecraft:push_through": {"value": 1},
                # **取りこぼしても消える**
                "minecraft:timer": {"time": 2, "looping": False, "time_down_event": {"event": "pve_v2:gone"}},
            },
            "events": {"pve_v2:gone": {"remove": {}}},
        },
    })

    # ---------------------------------------------------------------- 見た目
    # **バニラの矢を名前で指すだけ**（模型も絵も持たない）
    write(os.path.join(RP, "entity", "arrow.entity.json"), {
        "format_version": "1.10.0",
        "minecraft:client_entity": {
            "description": {
                "identifier": "pve_v2:arrow",
                "materials": {"default": "arrow"},
                "textures": {"default": "textures/entity/arrows"},
                "geometry": {"default": "geometry.arrow"},
                "animations": {"aim": "animation.pve2_arrow.aim"},
                "scripts": {"animate": ["aim"]},
                "render_controllers": ["controller.render.arrow"],
            }
        },
    })

    # ---------------------------------------------------------------- 上下を向く
    write(os.path.join(RP, "animations", "pve2_arrow.animation.json"), {
        "format_version": "1.10.0",
        "animations": {
            "animation.pve2_arrow.aim": {
                "loop": True,
                "bones": {
                    # **体は横しか向かない。** 上下はここで回す。
                    # 骨の名前は `geometry.arrow` のもの
                    "body": {"rotation": ["query.property('pve_v2:pitch')", 0, 0], "scale": SCALE}
                },
            }
        },
    })

    # ---------------------------------------------------------------- 後片付け
    drop(os.path.join(RP, "models", "entity", "pve2_arrow.geo.json"))
    drop(os.path.join(RP, "textures", "entity", "pve2_arrow.png"))

    print("できた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
