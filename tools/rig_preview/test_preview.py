"""描画の重要な性質を、小さな独立した場面で検査する。

    python -m unittest discover -s tools/rig_preview -p test_preview.py
"""

import unittest
import numpy as np

from geometry import channels, matrices, points
from raster import render


class PreviewTests(unittest.TestCase):
    def test_parent_pivot_and_scale(self):
        bones = [{"name": "root", "pivot": [0, 2, 0]},
                 {"name": "tip", "parent": "root", "pivot": [0, 0, 0]}]
        pose = channels([{"bones": {"ROOT": {"rotation": [-90, 0, 0], "scale": 2},
                                    "tip": {"position": [1, 0, 0]}}}])
        result = points(matrices(bones, pose)["tip"], [[0, 0, 0]])[0]
        np.testing.assert_allclose(result, [2, 2, -4], atol=1e-9)

    def test_this_overrides_prior_animation(self):
        clips = [{"bones": {"rightarm": {"rotation": [13, 4, 9]}}},
                 {"bones": {"rightArm": {"rotation": ["-60 - this", "-60 - this", "0 - this"]}}}]
        np.testing.assert_equal(channels(clips)["rightarm"]["rotation"], [-60, -60, 0])
        with self.assertRaises(ValueError):
            channels([{"bones": {"root": {"rotation": ["query.life_time", 0, 0]}}}])

    def test_position_this_includes_initial_local_pivot(self):
        bones = [{"name": "arm", "pivot": [-5, 22, 0]},
                 {"name": "item", "parent": "arm", "pivot": [-6, 15, 1]}]
        clip = {"bones": {"item": {"position": ["0 - this", "-1 - this", "-1 - this"]}}}
        pose = channels([clip], bones)
        # 手の初期相対位置 (-1,-7,1) を消すので、手先ではなく肩の近くへ移る。
        actual = points(matrices(bones, pose)["item"], [[-6, 15, 1]])[0]
        np.testing.assert_allclose(actual, [-5, 21, -1])
        numeric = channels([{"bones": {"item": {"position": [0, -1, -1]}}}], bones)
        actual = points(matrices(bones, numeric)["item"], [[-6, 15, 1]])[0]
        np.testing.assert_allclose(actual, [-6, 14, 0])

    def test_depth_is_per_pixel_and_order_independent(self):
        red = np.full((2, 2, 4), [255, 0, 0, 255], dtype=np.uint8)
        blue = np.full((2, 2, 4), [0, 0, 255, 255], dtype=np.uint8)
        uv = np.array([[0, 0], [2, 0], [2, 2], [0, 2]])
        tilted = np.array([[-1, 1, -1], [1, 1, 1], [1, -1, 1], [-1, -1, -1]])
        flat = tilted.copy()
        flat[:, 2] = 0
        faces = [(tilted, uv, red, "tilted"), (flat, uv, blue, "flat")]
        a, _ = render(faces, size=64, center=(0, 0, 0), span=4, unlit=True)
        b, _ = render(list(reversed(faces)), size=64, center=(0, 0, 0), span=4, unlit=True)
        np.testing.assert_equal(np.array(a), np.array(b))
        self.assertEqual(a.getpixel((24, 32)), (255, 0, 0))
        self.assertEqual(a.getpixel((40, 32)), (0, 0, 255))

    def test_transparent_texels_do_not_occlude(self):
        tex = np.full((2, 2, 4), [255, 0, 0, 255], dtype=np.uint8)
        tex[0, 0, 3] = 0
        background = np.full((2, 2, 4), [0, 0, 255, 255], dtype=np.uint8)
        vertices = np.array([[-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0]])
        uv = np.array([[0, 0], [2, 0], [2, 2], [0, 2]])
        faces = [(vertices, uv, tex, "front"), (vertices + [0, 0, 1], uv, background, "back")]
        picture, _ = render(faces, size=64, center=(0, 0, 0), span=4, unlit=True)
        self.assertEqual(picture.getpixel((24, 24)), (0, 0, 255))
        self.assertEqual(picture.getpixel((40, 24)), (255, 0, 0))


if __name__ == "__main__":
    unittest.main()
