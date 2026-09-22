"""バニラのリソパから、使えるブロックの平均色を取って `pipeline/palette_data.json` に固定する。

    .venv/Scripts/python.exe palette_from_rp.py

`docs/spec/08-genlab.md` 2-3。**使えるのは羊毛・コンクリート・テラコッタだけ**（各 16 色 ＋ `hardened_clay`）。
色は **`bedrock-samples/resource_pack` の実物テクスチャの平均 RGB**。目分量で書かない。

出力は git に入れる（実行時に bedrock-samples を要らなくするため）。
リソパを更新したら実行し直す。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RP = ROOT / "bedrock-samples" / "resource_pack"
OUT = Path(__file__).resolve().parent / "pipeline" / "palette_data.json"

# 使えるブロックの id。順番は「羊毛 → コンクリート → テラコッタ」で色順
COLORS = [
    "white", "light_gray", "gray", "black", "brown", "red", "orange", "yellow",
    "lime", "green", "cyan", "light_blue", "blue", "purple", "magenta", "pink",
]
FAMILIES = ["wool", "concrete", "terracotta"]


def load_json(path: Path) -> dict:
    """バニラの json は BOM と // コメントを含むので素の json.load では読めない。"""
    s = path.read_text(encoding="utf-8-sig")
    s = re.sub(r"//[^\n]*", "", s)
    return json.loads(s)


def mean_rgb(png: Path) -> tuple[int, int, int]:
    arr = np.asarray(Image.open(png).convert("RGBA")).astype(np.float64)
    a = arr[..., 3:4] / 255.0
    rgb = (arr[..., :3] * a).sum(axis=(0, 1)) / max(1e-9, a.sum())
    return tuple(int(round(v)) for v in rgb)


def main() -> None:
    blocks = load_json(RP / "blocks.json")
    tex = load_json(RP / "textures" / "terrain_texture.json")["texture_data"]
    ids = [f"{c}_{f}" for f in FAMILIES for c in COLORS] + ["hardened_clay"]
    out = []
    for bid in ids:
        entry = blocks[bid]["textures"]
        name = entry if isinstance(entry, str) else entry["up"]
        rel = tex[name]["textures"]
        assert isinstance(rel, str), (bid, rel)
        png = RP / (rel + ".png")
        rgb = mean_rgb(png)
        out.append({"id": bid, "texture": rel, "rgb": list(rgb)})
        print(f"{bid:22s} {rel:48s} {rgb}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} blocks -> {OUT}")


if __name__ == "__main__":
    main()
