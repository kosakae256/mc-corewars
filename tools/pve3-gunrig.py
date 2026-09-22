"""散弾の銃を、既存の絵から装備用の模型にする。

    python tools/pve3-gunrig.py

仕様: worlds/pve-v3/docs/spec/25-enemy-kit.md 7-2。
透明な画素を避けて行ごとの連続区間を押し出す。絵そのものは変更しない。
texture_meshes と違い、寸法がアニメの scale やテクスチャ解像度に依存しない。
握る画素を (39,42)、1px を 0.25 モデル単位として持つ。
"""

import json
import copy
import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RP = ROOT / "worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3"
GRIP = (39, 42)
PIXEL = 0.25
THICKNESS = 0.9
RESET_POSE = False


def write(relative, data):
    """生成先はこの銃のファイルだけ。ユーザーの Blockbench 原稿には触らない。"""
    path = RP / relative
    if relative.startswith("animations/") and path.exists() and not RESET_POSE:
        print(f"Keep edited animation: {relative}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def geometry(texture_path="textures/items/pve3_gun.png", output="models/entity/pve3_gun.geo.json",
             identifier="geometry.pve3.gun", grip=GRIP, pixel=PIXEL, pixel_rotation=42):
    """絵の連続した不透明区間を cube にする。両側面の UV を揃える。"""
    texture = Image.open(RP / texture_path).convert("RGBA")
    cubes = []
    for v in range(texture.height):
        u = 0
        while u < texture.width:
            if texture.getpixel((u, v))[3] < 128:
                u += 1
                continue
            begin = u
            while u < texture.width and texture.getpixel((u, v))[3] >= 128:
                u += 1
            width = u - begin
            edge = {"uv": [begin, v], "uv_size": [1, 1]}
            cubes.append({
                "origin": [-THICKNESS / 2, 24 + (grip[1] - v - 1) * pixel, (begin - grip[0]) * pixel],
                "size": [THICKNESS, pixel, width * pixel],
                "uv": {
                    "west": {"uv": [begin, v], "uv_size": [width, 1]},
                    "east": {"uv": [u, v], "uv_size": [-width, 1]},
                    "up": edge, "down": edge, "north": edge, "south": edge,
                },
            })
    # Vanilla trident と同じ、装備用の基準点 (0,24,0)。手側の pivot を足し直さない。
    # 2 本で腕の逆回転を適用する。保持姿勢の値は初回生成後、調整ツールから編集できる。
    doc = {"format_version": "1.16.0", "minecraft:geometry": [{
        "description": {
            "identifier": identifier, "texture_width": texture.width,
            "texture_height": texture.height, "visible_bounds_width": 4,
            "visible_bounds_height": 4, "visible_bounds_offset": [0, 1, 0],
        },
        "bones": [
            {"name": "gun", "binding": "q.item_slot_to_bone_name(context.item_slot)", "pivot": [0, 24, 0]},
            {"name": "gun_yaw", "parent": "gun", "pivot": [0, 24, 0]},
            {"name": "gun_pixels", "parent": "gun_yaw", "pivot": [0, 24, 0],
             "rotation": [pixel_rotation, 0, 0], "cubes": cubes},
        ],
    }]}
    write(output, doc)
    print(f"{identifier}: {len(cubes)} cubes / grip pixel {grip}")


def attachable():
    """装備の模型はここだけから描く。モブの render controller に別の銃は足さない。"""
    write("attachables/pve3_gun.json", {
        "format_version": "1.20.30", "minecraft:attachable": {"description": {
            "identifier": "pve_v3:gun", "item": {"pve_v3:gun": "1.0"},
            "materials": {"default": "entity_alphatest", "enchanted": "entity_alphatest_glint"},
            "textures": {"default": "textures/items/pve3_gun", "enchanted": "textures/misc/enchanted_item_glint"},
            "geometry": {"default": "geometry.pve3.gun"},
            "animations": {
                "shotgun": "animation.pve3.gun_item.shotgun",
                "held": "animation.pve3.gun_item.held",
                "first_person": "animation.pve3.gun_item.first_person",
            },
            "scripts": {
                "should_update_bones_and_effects_offscreen": True,
                "should_update_effects_offscreen": True,
                "animate": [
                    {"shotgun": "q.is_owner_identifier_any('pve_v3:shotgun')"},
                    {"held": "!q.is_owner_identifier_any('pve_v3:shotgun') && !context.is_first_person"},
                    {"first_person": "context.is_first_person"},
                ],
            },
            "render_controllers": ["controller.render.item_default"],
        }},
    })
    write("animations/pve3_gun_item.animation.json", {"format_version": "1.8.0", "animations": {
        "animation.pve3.gun_item.shotgun": {"loop": True, "bones": {
            "gun": {"rotation": [90, 0, 0]}, "gun_yaw": {"rotation": [0, 10, 0]},
        }},
        "animation.pve3.gun_item.held": {"loop": True, "bones": {
            "gun": {"rotation": [-90, 0, 0]},
        }},
        "animation.pve3.gun_item.first_person": {"loop": True, "bones": {
            "gun": {"rotation": [0, -15, 0], "position": [0, 0, -2]},
        }},
    }})


def pose():
    """歩きの脚は残し、構える両腕だけを最後に上書きする。"""
    # 参考画像のように肘を曲げず前へ伸ばす。左右の腕を交差させない。
    # position の this は初期の相対位置を含むので、握りの微調整は数値の加算にする。
    bones = {
        "rightArm": {"rotation": ["-90 + (q.property('pve_v3:gun_aim') ? q.property('pve_v3:gun_pitch') : 0) - this", "-10 - this", "0 - this"]},
        "rightItem": {"position": [2.4, -1, -2],
                      "rotation": ["0 - this", "0 - this", "0 - this"]},
        "leftArm": {"rotation": ["-90 + (q.property('pve_v3:gun_aim') ? q.property('pve_v3:gun_pitch') : 0) - this", "32 - this", "0 - this"]},
        "waist": {"rotation": [0, "q.property('pve_v3:gun_aim') ? q.property('pve_v3:gun_yaw') - q.body_y_rotation - this : 0", 0]},
    }
    write("animations/pve3_gun.animation.json", {"format_version": "1.8.0", "animations": {
        "animation.pve3.gun.hold": {"loop": True, "bones": bones},
    }})


def pistol_pose():
    """右手の構えを共用し、左手だけ下ろした専用クリップを作る。"""
    source = json.loads((RP / 'animations/pve3_gun.animation.json').read_text(encoding='utf-8'))
    clip = copy.deepcopy(source['animations']['animation.pve3.gun.hold'])
    clip['bones']['leftArm']['rotation'] = ['0 - this'] * 3
    write('animations/pve3_pistol.animation.json', {'format_version': '1.8.0', 'animations': {
        'animation.pve3.pistol.hold': clip,
    }})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset-pose", action="store_true", help="編集済みの構えを参考画像の初期値へ戻す")
    RESET_POSE = parser.parse_args().reset_pose
    geometry()
    attachable()
    pose()
