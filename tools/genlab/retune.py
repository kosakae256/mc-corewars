"""grid_dump.py が残した npz を、**今の pipeline/voxel.py** で塗り直して 1 枚に並べる（GPU 不要・数秒）。

    .venv/Scripts/python.exe retune.py [--out out/retune.png]

色付け（unshade / nearest_blocks）を変えたら、これで前後を見比べる。
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline.voxel import build  # noqa: E402
from resheet import crop  # noqa: E402
from preview import render  # noqa: E402

GRIDS = Path(__file__).resolve().parent / "out" / "grids"


def cell(path: Path, w: int = 260) -> Image.Image:
    z = np.load(path)
    res = build(z["occ"], z["rgb"].astype(np.float64), int(z["factor"]))
    img = Image.open(io.BytesIO(z["image"].tobytes())).resize((w, w))
    c = crop(res)
    pv = render(c, cell=max(4, 520 // c["size"]), views=2)
    pv = pv.crop(pv.convert("L").point(lambda p: 255 if p > 40 else 0).getbbox() or (0, 0, pv.width, pv.height))
    pv = pv.resize((int(pv.width * w / pv.height), w))
    out = Image.new("RGB", (img.width + pv.width + 4, w + 20), "black")
    out.paste(img, (0, 0))
    out.paste(pv, (img.width + 4, 0))
    ImageDraw.Draw(out).text((4, w + 4), f"{path.stem}  {res['count']} blk  {', '.join(res['palette'][1:6])}", fill=(255, 255, 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "out" / "retune.png"))
    ap.add_argument("names", nargs="*")
    args = ap.parse_args()
    paths = [GRIDS / f"{n}.npz" for n in args.names] if args.names else sorted(GRIDS.glob("*.npz"))
    cells = [cell(p) for p in paths]
    cols = 2
    cw = max(c.width for c in cells)
    ch = max(c.height for c in cells)
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cw + 6), rows * (ch + 6)), "black")
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * (cw + 6), (i // cols) * (ch + 6)))
    sheet.save(args.out)
    print(args.out)


if __name__ == "__main__":
    main()
