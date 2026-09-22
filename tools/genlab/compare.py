"""様式 × 閾値 × step を同じ seed で比べ、1 枚のシートにする。

    .venv/Scripts/python.exe compare.py cat dog car house rocket --seed 7
"""
from __future__ import annotations
import argparse, json
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from preview import render

ap = argparse.ArgumentParser(); ap.add_argument("words", nargs="+"); ap.add_argument("--seed", type=int, default=7)
args = ap.parse_args()
CASES = [("figurine", 2, 25.0), ("figurine", 2, 10.0), ("lowpoly", 2, 10.0)]
p = Pipeline(); p.load()
rows = []
for w in args.words:
    cells = []
    for style, steps, thr in CASES:
        last = None; tilt = ""
        for ev in p.run(w, steps=steps, seed=args.seed, style=style, threshold=thr):
            if ev["stage"] == "done": last = ev
            if ev["stage"] == "model": tilt = f"p{ev.get('pitch', 0):g} r{ev.get('roll', 0):g}"
        d = Path(last["out_dir"]); r = json.loads((d / "result.json").read_text(encoding="utf-8"))
        img = Image.open(d / "image.png").resize((200, 200)); pv = render(r, cell=12, views=2); pv = pv.resize((int(pv.width * 200 / pv.height), 200))
        c = Image.new("RGB", (img.width + pv.width + 4, 214), "black"); c.paste(img, (0, 0)); c.paste(pv, (img.width + 4, 0))
        ImageDraw.Draw(c).text((2, 201), f"{style} s{steps} t{thr:g} {tilt}  {r['count']} blk {last['seconds']:.2f}s", fill=(255, 255, 0))
        cells.append(c); print(w, style, steps, thr, r["count"], f"{last['seconds']:.2f}s")
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 214), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / f"compare-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"; sheet.save(out); print(out)
