"""「溶ける」の切り分け: 同じ Hunyuan の 40³ を、落とし方だけ変えて 20³ にする。"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline.translate import image_prompt, negative_prompt
from pipeline import voxel
from preview import render
words = sys.argv[1:] or ["犬", "家"]
p = Pipeline(); p.load()
rows = []
for w in words:
    eng = p.translator.translate(w)
    img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=4, seed=11)
    rgba = p.i23d.preprocess(img)
    occ40, rgb40, info = p.i23d.query_grid(rgba, 40, 0.0)
    cases = []
    # 40³ そのまま（参考）
    r = voxel.encode(occ40, voxel.unshade(rgb40, occ40)); r["text"] = "40³ raw"; cases.append(("40³ そのまま", r))
    for k, solid in ((2, True), (4, True), (4, False)):
        r = voxel.build(occ40, rgb40, 2, solid, k); r["text"] = f"20³ ≥{k}/8 {'solid' if solid else 'shell'}"; cases.append((r["text"], r))
    cells = [img.resize((260, 260))]
    for name, r in cases:
        pv = render(r, cell=(6 if r["size"] == 40 else 12), views=2); pv = pv.resize((int(pv.width * 260 / pv.height), 260))
        ImageDraw.Draw(pv).text((6, 244), f"{w} {name} {r['count']} blk", fill=(255, 255, 0)); cells.append(pv)
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 260), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "melt-ab.png"; sheet.save(out); print(out)
