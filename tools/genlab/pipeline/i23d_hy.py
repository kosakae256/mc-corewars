"""② 画像 → 3D（**Hunyuan3D-2mini turbo**）→ 細かい格子の占有と色（`docs/spec/08-genlab.md` 5-3）。

## TripoSR から替えた理由（2026-09-21）

TripoSR は 1 枚から「復元」するので、見えている面だけ忠実で裏は崩れる。
Hunyuan3D は学習した 3D の知識で「生成」するので、犬はどちらから見ても犬になる。
代償は 3D の段が 0.3 → 2.5 秒、VRAM が 4 → 6.2 GB（sd-turbo 込み）。

## メッシュを作らない

`output_type="latent"` で潜在を取り、VAE の volume decoder に **n³ の格子を直接**出させる。
`bounds` に外接箱を渡せるので、粗く 32³ で箱を測ってから、箱の中だけ n³ で出す。

## 色

Hunyuan3D は形だけ。**生成画像の色を平行投影で貼る**（`project_colors`）。
カメラがどの軸かは、占有の影絵と画像の alpha の重なりが最大の向きを毎回選ぶ。

## 座標

出力は **y が上**（比較で確認。家の屋根が上に来る）。voxel.py の前提と同じなので入れ替えない。
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from .i23d import keep_largest_blob, largest_component
from .level import level_matrix

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "Hunyuan3D-2"))

MODEL_ID = "tencent/Hunyuan3D-2mini"
SUBFOLDER = "hunyuan3d-dit-v2-mini-turbo"
STEPS = 5  # turbo は 5 step で学習されている
BOUNDS = 1.01  # 本家の既定。この箱の中に物体がある
REMBG_MODEL = "u2netp"
DEFAULT_THRESHOLD = 0.0  # logits。正なら中
DARK_PICK = 60  # ボクセルの範囲の暗い側 30% の平均がこれ未満なら、平均ではなく暗い側の色を使う（タイヤ・窓）


class ImageTo3DHunyuan:
    def __init__(self) -> None:
        self._pipe = None
        self._rembg = None

    def load(self) -> float:
        import rembg
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

        t = time.perf_counter()
        self._pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            MODEL_ID, subfolder=SUBFOLDER, use_safetensors=True, device="cuda"
        )
        self._rembg = rembg.new_session(REMBG_MODEL)
        return time.perf_counter() - t

    def to_device(self, device: str) -> None:
        """v2 の順番運転用（run.py）: 画像を作る間だけ CPU へ退避し、終わったら戻す。約 4 GB の往復で 0.3 秒ほど"""
        if self._pipe is not None:
            self._pipe.to(device)

    def preprocess(self, image: Image.Image) -> Image.Image:
        """背景を抜いた RGBA（一番大きい塊だけ）。Hunyuan3D はこれを自分で 512² に寄せ直す。"""
        import rembg

        img = rembg.remove(image.convert("RGBA"), session=self._rembg)
        return keep_largest_blob(img)

    def _decode(self, latents, bounds, n: int) -> np.ndarray:
        """潜在 → (n,n,n) の logits（正なら中）。"""
        import torch

        vae = self._pipe.vae
        with torch.inference_mode():
            grid = vae.volume_decoder(
                latents, vae.geo_decoder, bounds=bounds, num_chunks=50000, octree_resolution=n - 1, enable_pbar=False
            )
        return grid[0].float().cpu().numpy()

    def query_grid(self, rgba: Image.Image, n: int, threshold: float = 0.0, level: bool = False) -> tuple[np.ndarray, np.ndarray, dict]:
        """RGBA → (n,n,n) の占有 bool と (n,n,n,3) の色 0〜255（画像を投影）。**y が上**。"""
        assert self._pipe is not None, "load() が先"
        import torch

        with torch.inference_mode():
            latents = self._pipe(image=rgba, num_inference_steps=STEPS, output_type="latent", enable_pbar=False)
            latents = 1.0 / self._pipe.vae.scale_factor * latents
            latents = self._pipe.vae(latents)

        # 1. 粗く見て外接箱
        coarse_n = 32
        cell = 2 * BOUNDS / coarse_n
        g_c = self._decode(latents, BOUNDS, coarse_n)
        # 外接箱は**全部の占有**から取る。粗い格子では薄い壁が千切れるので、ここで塊を選ばない（家で踏んだ）
        occ_c = g_c > threshold
        info = {"coarse_count": int(occ_c.sum())}
        if not occ_c.any():
            return np.zeros((n, n, n), dtype=bool), np.zeros((n, n, n, 3)), {**info, "pitch": 0.0, "roll": 0.0}
        idx = np.argwhere(occ_c)
        pts = -BOUNDS + (idx + 0.5) * cell  # y が上のまま

        # 2. 傾き。Hunyuan3D は直立して出るので**既定では回さない**（回すとピカチュウが倒れた）
        rot, lv = level_matrix(pts, cell) if level else (np.eye(3), {"pitch": 0.0, "roll": 0.0, "center": pts.mean(axis=0).tolist()})
        center = np.array(lv["center"])
        info.update({k: v for k, v in lv.items() if k != "center"})
        pts_level = (pts - center) @ rot.T + center

        # 3. 外接箱（最長辺の立方体）
        lo_c = pts_level.min(axis=0) - cell / 2
        hi_c = pts_level.max(axis=0) + cell / 2
        box_center = (lo_c + hi_c) / 2
        half = float((hi_c - lo_c).max()) / 2 + cell
        lo, hi = box_center - half, box_center + half
        info["box"] = [float(v) for v in lo] + [float(v) for v in hi]

        # 4. 箱の中を n³ で。傾きを直すときは格子点を回して問い合わせる
        if abs(float(info.get("pitch", 0))) > 0 or abs(float(info.get("roll", 0))) > 0:
            axes = [np.linspace(lo[i] + half / n, hi[i] - half / n, n) for i in range(3)]
            gx, gy, gz = np.meshgrid(axes[0], axes[1], axes[2], indexing="ij")
            grid_level = np.stack([gx, gy, gz], axis=-1).reshape(-1, 3)
            grid_orig = (grid_level - center) @ rot + center
            g = self._decode_points(latents, grid_orig).reshape(n, n, n)
        else:
            g = self._decode(latents, [float(v) for v in lo] + [float(v) for v in hi], n)
        occ = largest_component(g > threshold)

        # 5. 色: 画像を投影
        rgb, view = project_colors(occ, rgba)
        info["view"] = view
        return occ, rgb, info

    def _decode_points(self, latents, pts: np.ndarray) -> np.ndarray:
        """任意の点の logits（傾き補正で格子を回すとき用）。"""
        import torch
        from einops import repeat

        vae = self._pipe.vae
        q = torch.from_numpy(pts.astype(np.float32)).to(latents.device, latents.dtype)
        out = []
        with torch.inference_mode():
            for s in range(0, len(q), 50000):
                chunk = repeat(q[s : s + 50000], "p c -> b p c", b=1)
                out.append(vae.geo_decoder(queries=chunk, latents=latents).float().cpu())
        return torch.cat(out, dim=1).numpy().reshape(-1)


def project_colors(occ: np.ndarray, rgba: Image.Image) -> tuple[np.ndarray, str]:
    """占有セルに、生成画像の色を平行投影で付ける。

    Hunyuan3D は **入力画像を z 軸の正から見た向き**で形を出す（2026-09-21 に 4 候補の IoU で確認。
    家・象・犬で z+ が最大、鏡像なし）。なので軸は固定。
    画素は **ボクセル 1 個ぶんの大きさに平均してから**貼る（写真のしわ・粒がそのまま乗るのを防ぐ）。
    裏側も表と同じ色になる（見えない側の色は分からない）。
    """
    arr = np.asarray(rgba.convert("RGBA"))
    alpha = arr[:, :, 3] > 0
    if not alpha.any() or not occ.any():
        return np.zeros(occ.shape + (3,)), "none"
    ys, xs = np.nonzero(alpha)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    ox = np.nonzero(occ.any(axis=(1, 2)))[0]
    oy = np.nonzero(occ.any(axis=(0, 2)))[0]
    bx = (ox.min(), ox.max() + 1)
    by = (oy.min(), oy.max() + 1)
    wv, hv = bx[1] - bx[0], by[1] - by[0]  # ボクセルで見た幅と高さ

    # 物体の外接箱を、ボクセルの幅×高さに縮める。alpha も同じ大きさに
    crop = Image.fromarray(arr[y0:y1, x0:x1])
    small = np.asarray(crop.resize((wv, hv), Image.BOX)).astype(np.float64)  # BOX = 面積平均
    a = small[:, :, 3:4] / 255.0
    # 半透明の縁は、色を alpha で割って元の色に戻す（黒が混ざるのを防ぐ）
    col = np.where(a > 0.05, small[:, :, :3] / np.maximum(a, 1e-6), 0.0)
    has = (a[:, :, 0] > 0.05)
    # **暗い側の候補**: 平均だとタイヤ（黒）がホイール（銀）や周りの白と混ざって灰になる（2026-09-21 に踏んだ）。
    # ボクセル 1 個の範囲を 8×8 に刻み、その中の暗い側 30% の平均を取っておき、十分暗ければそちらを使う
    sub = 8
    fine = np.asarray(crop.resize((wv * sub, hv * sub), Image.BILINEAR)).astype(np.float64)
    fine = fine.reshape(hv, sub, wv, sub, 4).transpose(0, 2, 1, 3, 4).reshape(hv, wv, sub * sub, 4)
    fa = fine[..., 3] / 255.0
    frgb = np.where(fa[..., None] > 0.05, fine[..., :3] / np.maximum(fa[..., None], 1e-6), 255.0)  # 透明な所は白扱い（暗い側に入らない）
    luma = frgb.mean(axis=-1)
    order = np.argsort(luma, axis=-1)[:, :, : max(1, int(sub * sub * 0.3))]
    darkest = np.take_along_axis(frgb, order[..., None], axis=2).mean(axis=2)  # (hv, wv, 3)
    dark_luma = darkest.mean(axis=-1)
    use_dark = has & (dark_luma < DARK_PICK)
    col = np.where(use_dark[..., None], darkest, col)

    xi, yi, zi = np.nonzero(occ)
    px = xi - bx[0]                 # 画像の左 = x 小
    py = (hv - 1) - (yi - by[0])    # 画像の上 = y 大
    colors = col[py, px].copy()
    outside = ~has[py, px]
    if outside.any():
        # 物体の隙間に当たったら、同じ行で一番近い物体の画素
        for k in np.nonzero(outside)[0]:
            row = np.nonzero(has[py[k]])[0]
            if len(row):
                j = row[np.abs(row - px[k]).argmin()]
                colors[k] = col[py[k], j]
    rgb = np.zeros(occ.shape + (3,))
    rgb[xi, yi, zi] = np.clip(colors, 0, 255)
    return rgb, "z+"
