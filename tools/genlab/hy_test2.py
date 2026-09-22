"""TripoSR と Hunyuan3D-2mini turbo を**同居させずに**測り、40³ の形を 2 方向で並べる。"""
import sys, time, gc
from pathlib import Path
import numpy as np, torch
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parent / "Hunyuan3D-2"))
from pipeline import voxel
from pipeline.run import OUT_DIR, Pipeline
from pipeline.translate import image_prompt, negative_prompt
from preview import render

def vram(tag):
    free, total = torch.cuda.mem_get_info(); print(f"  [{tag}] alloc {torch.cuda.memory_allocated()/2**30:.2f} GB  all-procs {(total-free)/2**30:.2f} GB")

words = sys.argv[1:] or ["象", "猫", "家", "ロケット", "犬"]
N = 40
p = Pipeline(); p.load(); vram("sd-turbo + TripoSR")
from tsr.utils import remove_background
imgs, rgbas, pres, tripo = {}, {}, {}, {}
for w in words:
    eng = p.translator.translate(w)
    imgs[w] = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=2, seed=7)
    rgbas[w] = remove_background(imgs[w].convert("RGBA"), p.i23d._rembg)
    pres[w] = p.i23d.preprocess(imgs[w])
    t = time.perf_counter(); occ, rgb, info = p.i23d.query_grid(pres[w], N, 25.0); torch.cuda.synchronize()
    tripo[w] = (occ, time.perf_counter() - t)
    print(f"{w}: TripoSR {tripo[w][1]:.2f}s {int(occ.sum())} cells")
# TripoSR を解放
p.i23d._model = None; gc.collect(); torch.cuda.empty_cache(); vram("TripoSR released")

from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
t = time.perf_counter()
hy = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2mini", subfolder="hunyuan3d-dit-v2-mini-turbo", use_safetensors=True, device="cuda")
print(f"  hunyuan load {time.perf_counter()-t:.1f}s"); vram("sd-turbo + Hunyuan")
hyres = {}
for rep in range(2):
    for w in words:
        t = time.perf_counter()
        with torch.inference_mode():
            lat = hy(image=rgbas[w], num_inference_steps=5, output_type="latent", enable_pbar=False)
            lat = 1.0 / hy.vae.scale_factor * lat; lat = hy.vae(lat)
            grid = hy.vae.volume_decoder(lat, hy.vae.geo_decoder, bounds=1.01, num_chunks=50000, octree_resolution=N - 1, enable_pbar=False)
        torch.cuda.synchronize(); dt = time.perf_counter() - t
        g = grid[0].float().cpu().numpy(); occ = g > 0
        hyres[w] = (occ, dt)
        if rep == 1: print(f"{w}: Hunyuan {dt:.2f}s {int(occ.sum())} cells")
vram("after runs")
rows = []
for w in words:
    cells = [imgs[w].resize((300, 300))]
    for name, (occ, dt) in (("TripoSR", tripo[w]), ("Hunyuan3D", hyres[w])):
        gray = np.zeros(occ.shape + (3,)) + 170
        r = voxel.build(occ, gray, 1, True); r["text"] = name
        pv = render(r, cell=7, views=2); pv = pv.resize((int(pv.width * 300 / pv.height), 300))
        ImageDraw.Draw(pv).text((6, 282), f"{w} {name} {r['count']} blk {dt:.2f}s", fill=(255, 255, 0)); cells.append(pv)
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 300), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "hy-test2.png"; sheet.save(out); print(out)
