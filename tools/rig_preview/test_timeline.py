"""姿勢のサンプリングと保存の退行を検査する。実パックは書き換えない。"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from rig_preview.timeline import channel_at, sample, validate
from rig_preview.editor_store import EditorStore, CLIPS


class TimelineTests(unittest.TestCase):
    def test_interpolation_and_discontinuous_step(self):
        self.assertEqual(channel_at({"0": [0, 0, 0], "1": [90, 0, 0]}, .5), [45, 0, 0])
        keys = {"0": [0, 0, 0], "1": {"pre": [0, 0, 0], "post": [90, 0, 0]}}
        self.assertEqual(channel_at(keys, .9), [0, 0, 0])
        self.assertEqual(channel_at(keys, 1), [90, 0, 0])

    def test_override_expression_survives_interpolation(self):
        value = channel_at({"0": ["0 - this", 0, 0], "1": ["-90 - this", 0, 0]}, .5)
        self.assertEqual(value[0], "-45.00000000 - this")
        with self.assertRaises(ValueError):
            channel_at({"0": ["q.life_time", 0, 0]}, 0)

    def test_head_and_leg_tracks_are_supported(self):
        clip = {"animation_length": 2, "bones": {"head": {"rotation": {"0": [0, 0, 0], "2": [0, 90, 0]}},
                                                "leftLeg": {"position": [1, 0, 0]}}}
        validate(clip, {"head", "leftleg"})
        self.assertEqual(sample(clip, 1)["bones"]["head"]["rotation"], [0, 45, 0])

    def test_catmullrom_and_invalid_keys(self):
        keys = {str(t): {"post": [t, 0, 0], "lerp_mode": "catmullrom"} for t in range(4)}
        self.assertEqual(channel_at(keys, 1.5), [1.5, 0, 0])
        with self.assertRaises(ValueError):
            validate({"bones": {"head": {"rotation": {"nan": [0, 0, 0]}}}}, {"head"})

    def test_save_preserves_other_clips_and_rejects_stale_revision(self):
        with tempfile.TemporaryDirectory() as temp:
            rp = Path(temp) / "rp"
            for name, (relative, _) in CLIPS.items():
                path = rp / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"format_version": "1.8.0", "animations": {name: {"bones": {}}, "animation.keep": {"loop": True}}}), encoding="utf-8")
            model = {"minecraft:geometry": [{"bones": [{"name": "head"}]}]}
            folder = rp / "models/entity"
            folder.mkdir(parents=True)
            for name in ("pve3_humanoid", "pve3_gun"):
                (folder / (name + ".geo.json")).write_text(json.dumps(model), encoding="utf-8")
            store = EditorStore(rp, Path(temp) / "backups")
            loaded = store.load()
            loaded["clips"]["animation.pve3.gun.hold"] = {"bones": {"head": {"rotation": [0, 25, 0]}}}
            with patch("rig_preview.editor_store.scene"):
                saved = store.save(loaded["clips"], loaded["revisions"])
                with self.assertRaises(ValueError):
                    store.save(loaded["clips"], loaded["revisions"])
            doc = json.loads((rp / CLIPS["animation.pve3.gun.hold"][0]).read_text(encoding="utf-8"))
            self.assertEqual(doc["animations"]["animation.keep"], {"loop": True})
            self.assertEqual(len(list(Path(saved["backup"]).iterdir())), 2)


if __name__ == "__main__":
    unittest.main()
