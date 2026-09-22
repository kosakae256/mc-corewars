"""80³ で fill_between あり／なしを並べる（溶ける原因の確認）。"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline.translate import image_prompt, negative_prompt
from pipeline import voxel
from preview import render
words = sys.argv[1:] or ["象"]
p = Pipeline(); p.load()
rows = []
for w in words:
    eng = p.translator.translate(w)
    img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=4, seed=11)
    rgba = p.i23d.preprocess(img)
    occ, rgb, info = p.i23d.query_grid(rgba, 80, 0.0)
    cells = [img.resize((320, 320))]
    for name, solid in (("raw (fill なし)", False), ("fill_between あり", True)):
        r = voxel.build(occ, rgb, 1, solid); r["text"] = name
        pv = render(r, cell=4, views=2); pv = pv.resize((int(pv.width * 320 / pv.height), 320))
        ImageDraw.Draw(pv).text((6, 300), f"{w} 80³ {name} {r['count']} blk", fill=(255, 255, 0)); cells.append(pv)
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 320), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "fill-ab.png"; sheet.save(out); print(out)
