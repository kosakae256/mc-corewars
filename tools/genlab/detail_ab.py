"""細部（タイヤ）が 20³ のどこで消えるかを切り分ける。同じ画像で、落とし方だけ変えて並べる。"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline.translate import NEGATIVE_PROMPT, image_prompt, negative_prompt
from pipeline import voxel
from preview import render

word = sys.argv[1] if len(sys.argv) > 1 else "white car"
p = Pipeline(); p.load()
eng = p.translator.translate(word)
img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=2, seed=7)
pre = p.i23d.preprocess(img)

def make(n, factor, min_sub, thr):
    occ, rgb, info = p.i23d.query_grid(pre, n, thr)
    # 多数決の閾値を変えた downsample
    m = n // factor
    blocks = occ.reshape(m, factor, m, factor, m, factor).sum(axis=(1, 3, 5))
    occ20 = blocks >= min_sub
    rgb20 = voxel.downsample_color(rgb, occ, factor)
    occ20 = voxel.fill_between(occ20); rgb20 = voxel._spread_color_down(occ20, rgb20)
    rgb20 = voxel.shift_like(rgb20, occ20); occ20 = voxel.ground(occ20)
    r = voxel.encode(occ20, rgb20); r["text"] = f"{n}³ ≥{min_sub}/{factor**3} thr{thr:g}"
    return r, int(occ.sum())

cases = [(40, 2, 4, 25.0), (40, 2, 2, 25.0), (40, 2, 1, 25.0), (60, 3, 14, 25.0), (60, 3, 5, 25.0), (60, 3, 5, 10.0)]
cells = []
for n, f, k, thr in cases:
    r, fine = make(n, f, k, thr)
    pv = render(r, cell=12, views=2); pv = pv.resize((int(pv.width * 300 / pv.height), 300))
    ImageDraw.Draw(pv).text((6, 282), f"{r['text']}  fine={fine}  {r['count']} blk", fill=(255, 255, 0))
    cells.append(pv); print(r["text"], "fine", fine, "blocks", r["count"], "palette", r["palette"][1:])
im = img.resize((300, 300)); pi = pre.resize((300, 300))
W = im.width + pi.width + sum(c.width + 4 for c in cells[:3]) + 8
sheet = Image.new("RGB", (W, 604), "black"); sheet.paste(im, (0, 0)); sheet.paste(pi, (im.width + 4, 0))
x = im.width + pi.width + 8
for i, c in enumerate(cells):
    if i == 3: x = im.width + pi.width + 8
    sheet.paste(c, (x, 0 if i < 3 else 304)); x += c.width + 4
out = OUT_DIR / "detail-ab.png"; sheet.save(out); print(out)
