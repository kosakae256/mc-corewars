"""色付けの調整用に、③ の手前（細かい格子の占有と色）を npz で残す。

    .venv/Scripts/python.exe grid_dump.py sheep bear "polar bear" ...   # 英語（words.json の en）
    .venv/Scripts/python.exe retune.py                                  # 残した npz を今の voxel.py で塗り直して並べる

**サーバーを止めてから**使う（同じモデルを二重に読み込むと VRAM が溢れる）。
出力: out/grids/<en>.npz（occ, rgb, factor, style, image）
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline.run import Pipeline, factor_for  # noqa: E402
from pipeline.translate import image_prompt, negative_prompt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "worlds" / "ai-build-quiz" / "bridge" / "words.json"
OUT = Path(__file__).resolve().parent / "out" / "grids"


def main() -> None:
    size = 40
    ens = sys.argv[1:]
    words = {w["en"]: w for w in json.loads(WORDS.read_text(encoding="utf-8"))}
    OUT.mkdir(parents=True, exist_ok=True)
    p = Pipeline()
    p.load()
    for en in ens:
        w = words.get(en, {"en": en, "kind": "object", "seed": None})
        style = "creature" if w["kind"] in ("animal", "character") else "object"
        seed = w.get("seed") or 1
        image = p.t2i.generate(image_prompt(en, style), negative_prompt(en, style), steps=4, seed=seed)
        pre = p.i23d.preprocess(image)
        factor = factor_for(size)
        occ, rgb, _info = p.i23d.query_grid(pre, size * factor, p._default_threshold(), False)
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        np.savez_compressed(OUT / f"{en}.npz", occ=occ, rgb=rgb.astype(np.uint8), factor=factor, style=style, image=np.frombuffer(buf.getvalue(), dtype=np.uint8))
        print(en, int(occ.sum()), flush=True)


if __name__ == "__main__":
    main()
