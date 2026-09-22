"""車の色（タイヤが黒いか）を 40³ で確かめる。大きめに描く。"""
import sys, json
from pathlib import Path
from collections import Counter
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline.palette import DIGITS
from preview import render
words = sys.argv[1:] or ["車", "白い車", "赤い車"]
p = Pipeline(); p.load()
rows = []
for w in words:
    last = None
    for ev in p.run(w, seed=11, size=40):
        if ev["stage"] == "done": last = ev
    d = Path(last["out_dir"]); r = json.loads((d / "result.json").read_text(encoding="utf-8"))
    c = Counter(r["voxels"]); dist = {r["palette"][DIGITS.index(k)]: v for k, v in c.items() if k != "0"}
    top = dict(sorted(dist.items(), key=lambda kv: -kv[1])[:6]); print(w, r["count"], top)
    img = Image.open(d / "image.png").resize((360, 360))
    pv = render(r, cell=9, views=2); pv = pv.resize((int(pv.width * 360 / pv.height), 360))
    ImageDraw.Draw(pv).text((6, 342), f"{w} {r['count']} blk {top}", fill=(255, 255, 0))
    row = Image.new("RGB", (img.width + pv.width + 4, 360), "black"); row.paste(img, (0, 0)); row.paste(pv, (img.width + 4, 0)); rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "car-check.png"; sheet.save(out); print(out)
