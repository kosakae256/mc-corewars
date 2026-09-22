"""Hunyuan3D-2mini turbo を試す: 同じ画像で TripoSR と形を比べ、秒数と VRAM を測る。

    .venv/Scripts/python.exe hy_test.py 象 猫 赤い車 家 ロケット

- Hunyuan3D は**形だけ**（色なし）。ここでは形の比較のため、色は一律の灰にする
- メッシュは作らない。VAE の volume decoder に n³ の格子を直接出させる
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent / "Hunyuan3D-2"))

from pipeline import voxel  # noqa: E402
from pipeline.run import OUT_DIR, Pipeline  # noqa: E402
from pipeline.translate import image_prompt, negative_prompt  # noqa: E402
from preview import render  # noqa: E402


def vram(tag: str) -> None:
    free, total = torch.cuda.mem_get_info()
    print(f"  [{tag}] alloc {torch.cuda.memory_allocated() / 2**30:.2f} GB  all-procs {(total - free) / 2**30:.2f} / {total / 2**30:.1f} GB")


def main() -> None:
    words = sys.argv[1:] or ["象", "猫", "赤い車"]
    p = Pipeline()
    p.load()
    vram("after TripoSR pipeline")

    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

    t = time.perf_counter()
    hy = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2mini", subfolder="hunyuan3d-dit-v2-mini-turbo", use_safetensors=True, device="cuda"
    )
    print(f"  hunyuan load {time.perf_counter() - t:.1f}s")
    vram("after Hunyuan load")

    import rembg
    from tsr.utils import remove_background

    n = 40
    rows = []
    for w in words:
        eng = p.translator.translate(w)
        img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=2, seed=7)
        rgba = remove_background(img.convert("RGBA"), p.i23d._rembg)

        # --- TripoSR（今の経路）
        pre = p.i23d.preprocess(img)
        t = time.perf_counter()
        occ_t, rgb_t, info = p.i23d.query_grid(pre, n, 25.0)
        torch.cuda.synchronize()
        t_tripo = time.perf_counter() - t

        # --- Hunyuan3D: 潜在 → n³ の格子（メッシュ無し）
        t = time.perf_counter()
        with torch.inference_mode():
            latents = hy(image=rgba, num_inference_steps=5, output_type="latent", enable_pbar=False)
            latents = 1.0 / hy.vae.scale_factor * latents
            latents = hy.vae(latents)
            grid = hy.vae.volume_decoder(latents, hy.vae.geo_decoder, bounds=1.01, num_chunks=50000, octree_resolution=n - 1, enable_pbar=False)
        torch.cuda.synchronize()
        t_hy = time.perf_counter() - t
        g = grid[0].float().cpu().numpy()
        inside_pos = int((g > 0).sum())
        inside_neg = int((g < 0).sum())
        occ_h = (g > 0) if inside_pos < inside_neg else (g < 0)
        print(f"{w}: TripoSR {t_tripo:.2f}s ({int(occ_t.sum())} cells)  Hunyuan {t_hy:.2f}s (grid {g.shape}, >0: {inside_pos}, <0: {inside_neg})")
        vram("after hunyuan run")

        # 向き: 3 通りの「上」で描いて目で決める
        cells = []
        img_s = img.resize((220, 220))
        cells.append(img_s)
        gray = np.zeros(occ_t.shape + (3,)) + 160
        r = voxel.build(occ_t, gray, 2, True)
        r["text"] = "TripoSR"
        pv = render(r, cell=12, views=1).resize((220, 220))
        cells.append(pv)
        for name, arr in (("hy xyz", occ_h), ("hy x z y", occ_h.transpose(0, 2, 1)), ("hy z y x", occ_h.transpose(2, 1, 0))):
            arr2 = arr
            rr = voxel.build(arr2, np.zeros(arr2.shape + (3,)) + 160, 2, True)
            rr["text"] = name
            pv = render(rr, cell=12, views=1).resize((220, 220))
            ImageDraw.Draw(pv).text((4, 200), f"{name} {rr['count']}", fill=(255, 255, 0))
            cells.append(pv)
        row = Image.new("RGB", (sum(c.width + 4 for c in cells), 220), "black")
        x = 0
        for c in cells:
            row.paste(c, (x, 0))
            x += c.width + 4
        rows.append(row)
    sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black")
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 6
    out = OUT_DIR / "hy-test.png"
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
