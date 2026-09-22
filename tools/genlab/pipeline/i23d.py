"""② 画像 → 3D（TripoSR）→ 細かい格子の占有と色（`docs/spec/08-genlab.md` 2-2）。

## メッシュを作らない

TripoSR は画像から **triplane NeRF**（scene code）を出す。
本家は marching cubes でメッシュにするが、**欲しいのは 20³ の「詰まっているか・何色か」だけ**。
`renderer.query_triplane(decoder, points, scene_code)` で任意の点の `density_act` と `color` が
取れるので、**格子の点を直接問い合わせる**。`torchmcubes`（要コンパイル）を入れずに済む。

## 座標

TripoSR の枠は **z が上**（`get_spherical_cameras` の up = [0,0,1]）。
Minecraft は **y が上**なので、ここで (x, y, z) → (x, z, y) に入れ替えて返す。
以後の段（voxel.py）は「y が上」だけを前提にする。
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from .level import level_matrix

HERE = Path(__file__).resolve().parent.parent
# shim を**先頭**に置く: 本物の torchmcubes が無くても TripoSR の import を通す
sys.path.insert(0, str(HERE / "shim"))
sys.path.insert(0, str(HERE / "TripoSR"))

MODEL_ID = "stabilityai/TripoSR"
FOREGROUND_RATIO = 0.85  # 本家 run.py の既定
DENSITY_THRESHOLD = 25.0  # 本家 extract_mesh の既定。density_act がこれ以上なら「詰まっている」
DEFAULT_THRESHOLD = DENSITY_THRESHOLD
REMBG_MODEL = "u2netp"  # 4.7 MB・CPU で 0.13 秒。u2net（176 MB・0.27 秒）より粗いが、白背景の切り抜きには足りる


class ImageTo3D:
    def __init__(self) -> None:
        self._model = None
        self._rembg = None

    def load(self) -> float:
        import rembg
        import torch
        from tsr.system import TSR

        t = time.perf_counter()
        model = TSR.from_pretrained(MODEL_ID, config_name="config.yaml", weight_name="model.ckpt")
        # 1 回の問い合わせ点数の上限。64,000 点（40³）はこれで数回に分かれる
        model.renderer.set_chunk_size(8192)
        model.to("cuda")
        model.eval()
        self._model = model
        self._rembg = rembg.new_session(REMBG_MODEL)
        return time.perf_counter() - t

    def preprocess(self, image: Image.Image) -> Image.Image:
        """本家 run.py と同じ前処理: 背景を抜く → 前景を 85% に → 灰色 0.5 で埋める。"""
        from tsr.utils import remove_background, resize_foreground

        img = remove_background(image.convert("RGBA"), self._rembg)
        img = keep_largest_blob(img)
        img = resize_foreground(img, FOREGROUND_RATIO)
        arr = np.array(img).astype(np.float32) / 255.0
        arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
        return Image.fromarray((arr * 255.0).astype(np.uint8))

    def _query(self, scene_code, lo: np.ndarray, hi: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
        """箱 [lo, hi]（TripoSR の枠）を n³ に等分し、セル中心の density_act と color を返す。"""
        import torch

        model = self._model
        axes = [
            torch.linspace(float(lo[i]) + (hi[i] - lo[i]) / (2 * n), float(hi[i]) - (hi[i] - lo[i]) / (2 * n), n, device="cuda")
            for i in range(3)
        ]
        gx, gy, gz = torch.meshgrid(axes[0], axes[1], axes[2], indexing="ij")
        pts = torch.stack([gx, gy, gz], dim=-1).reshape(-1, 3)
        with torch.no_grad():
            out = model.renderer.query_triplane(model.decoder, pts, scene_code)
        dens = out["density_act"].reshape(n, n, n).float().cpu().numpy()
        col = out["color"].reshape(n, n, n, 3).float().cpu().numpy()
        return dens, col

    def query_grid(self, image: Image.Image, n: int, threshold: float = DENSITY_THRESHOLD, level: bool = True) -> tuple[np.ndarray, np.ndarray, dict]:
        """前処理済み画像 → (n,n,n) の占有 bool と (n,n,n,3) の色 0〜255。**y が上**の並びで返す。

        ## 手順（問い合わせは 2 回。傾きは 2 回目の格子を回して吸収する）

        1. 粗い格子（32³）で全体を見る → **一番大きい塊だけ残す**（別の物・浮きかすを捨てる）
        2. その点群から **水平に直す回転**を決める（level.py。「床に接する柱が最大」）
        3. 回した点群の**外接箱**を取る（最長辺で立方体。spec 2-3「一番長い軸を 20 に合わせる」）
        4. 外接箱の中を n³ で問い合わせる。**格子点は水平化した座標で並べ、問い合わせ時だけ元の座標へ戻す**
        5. 細かい占有でも一番大きい塊だけ残す

        TripoSR の枠（半径 radius）に対して物体は小さい（犬で 1 割ほど）ので、3 が無いと
        20 のうち数マスにしか物が入らない。
        """
        assert self._model is not None, "load() が先"
        import torch

        model = self._model
        with torch.no_grad():
            scene_codes = model([image], device="cuda")  # (1, 3, C, H, W)
        code = scene_codes[0]
        r = float(model.renderer.cfg.radius)

        # 1. 粗く見る
        coarse_n = 32
        cell = 2 * r / coarse_n
        dens_c, _ = self._query(code, np.array([-r] * 3), np.array([r] * 3), coarse_n)
        occ_c = largest_component(dens_c >= threshold)
        info = {"coarse_count": int(occ_c.sum()), "density_max": float(dens_c.max())}
        if not occ_c.any():
            occ = np.zeros((n, n, n), dtype=bool)
            return occ, np.zeros((n, n, n, 3)), {**info, "pitch": 0.0, "roll": 0.0}

        # 占有セルの中心（TripoSR の枠 → y が上の並びへ）
        idx = np.argwhere(occ_c)
        pts_native = -r + (idx + 0.5) * cell
        pts = pts_native[:, [0, 2, 1]]

        # 2. 水平に直す
        rot, lv = level_matrix(pts, cell) if level else (np.eye(3), {"pitch": 0.0, "roll": 0.0, "center": pts.mean(axis=0).tolist()})
        center = np.array(lv["center"])
        info.update({k: v for k, v in lv.items() if k != "center"})
        pts_level = (pts - center) @ rot.T + center

        # 3. 外接箱（水平化した座標で）
        lo_c = pts_level.min(axis=0) - cell / 2
        hi_c = pts_level.max(axis=0) + cell / 2
        box_center = (lo_c + hi_c) / 2
        half = float((hi_c - lo_c).max()) / 2 + cell  # 粗さぶん 1 セル余裕
        lo, hi = box_center - half, box_center + half
        info["box"] = [float(v) for v in lo] + [float(v) for v in hi]

        # 4. 細かい格子（水平化した座標）→ 元の座標へ戻して問い合わせ
        axes = [np.linspace(lo[i] + half / n, hi[i] - half / n, n) for i in range(3)]
        gx, gy, gz = np.meshgrid(axes[0], axes[1], axes[2], indexing="ij")
        grid_level = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
        grid_orig = (grid_level - center) @ rot + center  # rot は直交行列。逆回転は転置 = 右から掛ける
        grid_native = grid_orig[:, [0, 2, 1]]
        dens, col = self._query_points(code, grid_native)
        dens = dens.reshape(n, n, n)
        col = col.reshape(n, n, n, 3)

        # 5. 仕上げ
        occ = largest_component(dens >= threshold)
        rgb = np.clip(col * 255.0, 0, 255)
        return occ, rgb, info

    def _query_points(self, scene_code, pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """任意の点（TripoSR の枠）の density_act と color。"""
        import torch

        model = self._model
        t = torch.from_numpy(pts.astype(np.float32)).to("cuda")
        with torch.no_grad():
            out = model.renderer.query_triplane(model.decoder, t, scene_code)
        return out["density_act"].float().cpu().numpy().reshape(-1), out["color"].float().cpu().numpy().reshape(-1, 3)


def largest_component(occ: np.ndarray, min_share: float = 0.6) -> np.ndarray:
    """繋がっている塊のうち一番大きいものだけ残す。別の物・浮きかすを捨てる。

    26 近傍（角で触れていれば繋がっている）。薄い壁は 6 近傍だと格子の粗さで千切れる（家で踏んだ）。
    **一番大きい塊が全体の min_share 未満なら何も捨てない**——千切れた本体を捨てるより、ゴミを残すほうがまし。
    """
    from skimage.measure import label

    if not occ.any():
        return occ
    lab = label(occ, connectivity=3)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    best = int(counts.argmax())
    if counts[best] < min_share * occ.sum():
        return occ
    return lab == best


def keep_largest_blob(img: Image.Image) -> Image.Image:
    """RGBA の alpha で一番大きい塊だけ残す。**車が 5 台出た絵から 1 台にする**保険。"""
    from skimage.measure import label

    arr = np.array(img)
    mask = arr[:, :, 3] > 0
    if not mask.any():
        return img
    lab = label(mask, connectivity=1)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    keep = lab == int(counts.argmax())
    arr[~keep, 3] = 0
    return Image.fromarray(arr)
