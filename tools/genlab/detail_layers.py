"""白い車の下の層を文字で出す。黒系のブロック = '#'、それ以外 = 'o'。"""
import sys
import numpy as np
from pipeline.run import Pipeline
from pipeline.translate import NEGATIVE_PROMPT, image_prompt, negative_prompt
from pipeline import voxel
from pipeline.palette import BLOCKS, DIGITS

word = sys.argv[1] if len(sys.argv) > 1 else "white car"
p = Pipeline(); p.load()
eng = p.translator.translate(word)
img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=2, seed=7)
pre = p.i23d.preprocess(img)
occ, rgb, info = p.i23d.query_grid(pre, 40, 25.0)

def show(occ20, rgb20, title, layers=(0, 1, 2, 3)):
    occ20 = voxel.fill_between(occ20); rgb20 = voxel._spread_color_down(occ20, rgb20)
    rgb20 = voxel.shift_like(rgb20, occ20); occ20 = voxel.ground(occ20)
    r = voxel.encode(occ20, rgb20); v = r["voxels"]; pal = r["palette"]
    print(f"=== {title}  {r['count']} blk ===")
    for y in layers:
        print(f"-- y={y}")
        for z in range(20):
            row = ""
            for x in range(20):
                ch = v[y * 400 + z * 20 + x]
                if ch == "0": row += "."
                else:
                    name = pal[DIGITS.index(ch)]
                    row += "#" if name.startswith(("black", "gray")) else "o"
            print(row)

# 40³ の生の占有: 下の 6 層（= 20³ の y=0..2 相当）の黒っぽい点
dark = (rgb.max(axis=-1) < 70) & occ
ys = np.where(occ.any(axis=(0, 2)))[0]
print("fine occupied y range", ys.min(), ys.max(), " dark voxels", int(dark.sum()), " of", int(occ.sum()))
for y in range(int(ys.min()), int(ys.min()) + 4):
    print(f"-- fine y={y}  (row=z, col=x; # = dark)")
    for z in range(0, 40, 2):
        print("".join("#" if dark[x, y, z] else ("o" if occ[x, y, z] else ".") for x in range(0, 40, 1)))
for k in (4, 2):
    m = 20; f = 2
    blocks = occ.reshape(m, f, m, f, m, f).sum(axis=(1, 3, 5))
    show(blocks >= k, voxel.downsample_color(rgb, occ, f), f"40³ ≥{k}/8")
