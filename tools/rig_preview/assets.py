"""client entity / attachable の参照を RP からたどり、入力のハッシュを記録する。"""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .geometry import channels, matrices, mesh, translation
from .timeline import sample


class Assets:
    def __init__(self, rp):
        self.rp = Path(rp)
        self.inputs = {}

    def track(self, path):
        self.inputs[str(path.relative_to(self.rp)).replace("\\", "/")] = hashlib.sha256(path.read_bytes()).hexdigest()

    def read(self, path):
        path = self.rp / path
        self.track(path)
        return json.loads(path.read_text(encoding="utf-8-sig"))

    def find(self, folder, kind, name):
        for path in sorted((self.rp / folder).rglob("*.json")):
            doc = json.loads(path.read_text(encoding="utf-8-sig"))
            values = doc.get(kind, {})
            if isinstance(values, list):
                match = next((v for v in values if v["description"]["identifier"] == name), None)
            else:
                match = values.get(name)
            if match is not None:
                self.track(path)
                return match
        raise ValueError(f"Cannot resolve {kind}: {name}")

    def model(self, desc):
        model = self.find("models", "minecraft:geometry", desc["geometry"]["default"])
        path = self.rp / (desc["textures"]["default"] + ".png")
        self.track(path)
        texture = np.array(Image.open(path).convert("RGBA"))
        return model, texture


def scene(rp, head_pitch=0, head_yaw=0, overrides=None, show_item=True, time=0):
    """銃装備、停止、通常、遷移完了の散弾。省略する動的状態はレポートに残す。"""
    assets = Assets(rp)
    desc = assets.read("entity/shotgun.entity.json")["minecraft:client_entity"]["description"]
    controller_id = desc["animations"]["gun_controller"]
    controller = assets.find("animation_controllers", "animation_controllers", controller_id)
    aliases = controller["states"]["on"]["animations"]
    overrides = overrides or {}
    clips = [overrides.get(desc["animations"][a]) or assets.find("animations", "animations", desc["animations"][a]) for a in aliases]
    model, texture = assets.model(desc)
    pose = channels([sample(clip, time) for clip in clips], model["bones"])
    pose.setdefault("head", {}).setdefault("rotation", np.zeros(3))
    pose["head"]["rotation"] += np.array([head_pitch, head_yaw, 0])
    world = matrices(model["bones"], pose)
    faces = mesh(model, world, texture, "entity")
    attached = assets.read("attachables/pve3_gun.json")["minecraft:attachable"]["description"]
    clip_id = attached["animations"]["shotgun"]
    held = overrides.get(clip_id) or assets.find("animations", "animations", clip_id)
    gun, gun_texture = assets.model(attached)
    item = next(b for b in model["bones"] if b["name"].lower() == "rightitem")
    # 装備模型の標準基準 y=24。実機との校正対象でもあるため report に明記する。
    binding = world["rightitem"] @ translation(np.array(item["pivot"]) - [0, 24, 0])
    gun_world = matrices(gun["bones"], channels([sample(held, time)], gun["bones"]), {
        "q.item_slot_to_bone_name(context.item_slot)": binding,
    })
    if show_item:
        faces += mesh(gun, gun_world, gun_texture, "attachable")
    report = {
        "entity": desc["identifier"], "inputs_sha256": assets.inputs,
        "entity_clips": [desc["animations"][a] for a in aliases], "attachable_clip": clip_id,
        "snapshot": "standing still, gun equipped, transition complete, neutral body",
        "head_rotation": [head_pitch, head_yaw, 0],
        "time": time,
        "binding": {"bone": item["name"], "reference": [0, 24, 0]},
        "this_position_basis": "initial parent-relative pivot plus accumulated animation translation",
        "not_simulated": ["Molang state machine", "walking/riding/swimming/roused/damage",
                          "world lighting, nametag, HUD, engine materials"],
        "client_animate_order": desc["scripts"]["animate"],
        "note": "Static gun channels override arm rotations; neutral values assumed for other bones. In-game calibration required.",
        "face_count": len(faces),
    }
    return faces, report
