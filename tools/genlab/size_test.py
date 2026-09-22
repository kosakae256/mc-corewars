"""同じ語を 20³ / 40³ / 80³ で流して、段ごとの秒数・ブロック数・見た目を比べる。"""
import json, sys, time
from pathlib import Path
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from preview import render
words = sys.argv[1:] or ["象"]
p = Pipeline(); p.load()
rows = []
for w in words:
    cells = []
    for size in (20, 40, 80):
        t = time.perf_counter(); stages = {}
        for ev in p.run(w, steps=2, seed=7, size=size):
            stages[ev["stage"]] = ev["seconds"]
            if ev["stage"] == "done": last = ev
        d = Path(last["out_dir"]); r = json.loads((d / "result.json").read_text(encoding="utf-8"))
        cell = max(2, 240 // size)
        pv = render(r, cell=cell, views=1); pv = pv.resize((int(pv.width * 300 / pv.height), 300))
        ImageDraw.Draw(pv).text((6, 282), f"{w} {size}³ {r['count']} blk  model {stages['model']:.2f}s voxel {stages['voxel']:.2f}s total {stages['done']:.2f}s", fill=(255, 255, 0))
        cells.append(pv); print(w, size, r["count"], {k: round(v, 2) for k, v in stages.items()}, "json", len(r["voxels"]))
    img = Image.open(d / "image.png").resize((300, 300))
    row = Image.new("RGB", (img.width + sum(c.width + 4 for c in cells), 300), "black"); row.paste(img, (0, 0)); x = img.width + 4
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "size-test.png"; sheet.save(out); print(out)
