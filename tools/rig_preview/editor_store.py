"""構え編集の読み込み・検証・保存。描画中はパックに書き込まない。"""

import copy
import hashlib
import json
from datetime import datetime
from pathlib import Path

from .assets import scene
from .timeline import sample, validate

CLIPS = {
    "animation.pve3.gun.hold": ("animations/pve3_gun.animation.json", ["rightArm", "leftArm", "rightItem"]),
    "animation.pve3.gun_item.shotgun": ("animations/pve3_gun_item.animation.json", ["gun", "gun_yaw"]),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class EditorStore:
    def __init__(self, rp, backups):
        self.rp, self.backups = Path(rp), Path(backups)

    def load(self):
        clips, revisions = {}, {}
        for name, (relative, _) in CLIPS.items():
            path = self.rp / relative
            clips[name] = json.loads(path.read_text(encoding="utf-8"))["animations"][name]
            revisions[name] = digest(path)
        model = json.loads((self.rp / "models/entity/pve3_humanoid.geo.json").read_text(encoding="utf-8"))["minecraft:geometry"][0]
        gun = json.loads((self.rp / "models/entity/pve3_gun.geo.json").read_text(encoding="utf-8"))["minecraft:geometry"][0]
        return {"clips": clips, "revisions": revisions,
                "bones": {"body": [{"name": b["name"], "parent": b.get("parent")} for b in model["bones"]],
                          "item": [{"name": b["name"], "parent": b.get("parent")} for b in gun["bones"]]}}

    def validate(self, clips):
        """編集対象と数値の範囲を限定する。未知の式やファイル名を受け付けない。"""
        if not isinstance(clips, dict) or set(clips) != set(CLIPS):
            raise ValueError("編集対象のアニメーションが一致しません。")
        loaded = self.load()
        result = loaded["clips"]
        for name, clip in clips.items():
            target = "body" if name == "animation.pve3.gun.hold" else "item"
            validate(clip, {b["name"].lower() for b in loaded["bones"][target]})
            result[name] = copy.deepcopy(clip)
        return result

    def save(self, clips, revisions):
        clips = self.validate(clips)
        # 読み取った全チャンネルを実際の描画経路に通してから保存する。
        scene(self.rp, overrides={name: sample(clip, 0) for name, clip in clips.items()})
        if revisions != self.load()["revisions"]:
            raise ValueError("パックが別の操作で変更されています。JSONをダウンロードしてから読み直してください。")
        backup = self.backups / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        backup.mkdir(parents=True)
        updates = []
        for name, (relative, _) in CLIPS.items():
            path = self.rp / relative
            raw = path.read_bytes()
            (backup / path.name).write_bytes(raw)
            doc = json.loads(raw.decode("utf-8"))
            doc["animations"][name] = clips[name]
            updates.append((path, json.dumps(doc, ensure_ascii=False, indent=2)+"\n"))
        for path, contents in updates:
            temporary = path.with_suffix(path.suffix + ".rig-tmp")
            temporary.write_text(contents, encoding="utf-8")
            temporary.replace(path)
        return {**self.load(), "backup": str(backup)}
