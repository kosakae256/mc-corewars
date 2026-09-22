"""Hunyuan3D の step 数と閾値を乗り物で比べる。**サーバーを止めてから**。

    .venv/Scripts/python.exe hy_steps_ab.py [helicopter tractor ...]

60³ テストで乗り物（ヘリ・トラクター・バイク・飛行機）が**千切れた殻**になった。画像は正しく、切り抜きも正しい。
3D の段（turbo 5 step・logits 0）で崩れているので、step と閾値を振って見る。
出力: out/hy-steps-ab.png（行 = 語、列 = 設定 × 2 方向）
"""

import sys
import time

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, ".")
from pipeline import i23d_hy  # noqa: E402
from pipeline.run import OUT_DIR, factor_for  # noqa: E402
from pipeline.t2i import TextToImage  # noqa: E402
from pipeline.translate import image_prompt, negative_prompt  # noqa: E402
from pipeline.voxel import build  # noqa: E402
from preview import render  # noqa: E402
from resheet import crop  # noqa: E402

CONFIGS = [  # (steps, threshold)
    (5, 0.0),
]
# 定型も振る（乗り物の絵は地面すれすれの横向きで、上面の情報が無い → 3D が千切れる？）
NEG_V = "road, street, sky, clouds, water, sea, landscape, scenery, background, close-up, cropped, partial, multiple, person, hand, text, watermark, blurry, motion blur"
PROMPTS = {
    "object": None,
    "toy": ("a toy model of a {x}, whole vehicle visible, three-quarter front view from slightly above, on a flat white floor, isolated on a plain white background, product photo", NEG_V),
    "diecast_top": ("a die-cast toy {x}, complete vehicle seen from a high three-quarter angle, standing on a white table, plain white background, studio product photo", NEG_V),
}
words = sys.argv[1:] or ["helicopter", "tractor", "motorcycle", "airplane", "police car", "steam locomotive"]
size = 60
t2i = TextToImage()
t2i.load()
hy = i23d_hy.ImageTo3DHunyuan()
hy.load()
rows = []
for w in words:
    cells = []
    for pname, pv_ in PROMPTS.items():
        if pv_ is None:
            img = t2i.generate(image_prompt(w, "object"), negative_prompt(w, "object"), steps=4, seed=1)
        else:
            img = t2i.generate(pv_[0].replace("{x}", w), pv_[1], steps=4, seed=1)
        pre = hy.preprocess(img)
        cells.append(img.resize((300, 300)))
        steps, thr = CONFIGS[0]
        i23d_hy.STEPS = steps
        t = time.perf_counter()
        occ, rgb, _ = hy.query_grid(pre, size * factor_for(size), thr, False)
        dt = time.perf_counter() - t
        res = build(occ, rgb, factor_for(size))
        c = crop(res)
        pv = render(c, cell=max(4, 520 // c["size"]), views=2)
        pv = pv.crop(pv.convert("L").point(lambda p: 255 if p > 40 else 0).getbbox() or (0, 0, pv.width, pv.height))
        pv = pv.resize((int(pv.width * 300 / pv.height), 300))
        ImageDraw.Draw(pv).text((4, 4), f"{w} {pname}  {res['count']} blk  {dt:.1f}s", fill=(255, 255, 0))
        cells.append(pv)
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 300), "black")
    x = 0
    for c in cells:
        row.paste(c, (x, 0))
        x += c.width + 4
    rows.append(row)
    print(w, flush=True)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 4 for r in rows)), "black")
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height + 4
out = OUT_DIR / "hy-prompt-ab.png"
sheet.save(out)
print(out)
