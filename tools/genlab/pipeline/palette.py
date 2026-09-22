"""色 → ブロックの対応表（**固定ルール。AI は使わない**）。

`docs/spec/08-genlab.md` 2-3。**使えるのは羊毛・コンクリート・テラコッタだけ**（各 16 色 ＋ `hardened_clay` の 49 種）。
色は **バニラのリソパの実物テクスチャの平均 RGB**（`palette_from_rp.py` が `palette_data.json` に書く）。
ここに手で数字を書かない——目分量は必ずずれる。

**同じ色なら必ず同じブロック**になる。表を変えれば出来上がりが変わる——それ以外では変わらない。
名前は **Bedrock の id**（`white_wool` / `white_concrete` / `white_terracotta` / `hardened_clay`）。
"""

from __future__ import annotations

import json
from pathlib import Path

# 添字 0 は必ず air。voxels 文字列の "0" が空気になる
AIR = "air"

_DATA = json.loads((Path(__file__).resolve().parent / "palette_data.json").read_text(encoding="utf-8"))

# (ブロック id, (R, G, B))。RGB の距離が最小のものを選ぶ（voxel.nearest_block）。
BLOCKS: list[tuple[str, tuple[int, int, int]]] = [(d["id"], tuple(d["rgb"])) for d in _DATA]

# voxels 文字列の 1 文字。0 = air。palette の添字をこの文字に写す。62 種まで書ける。
DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

assert len(BLOCKS) + 1 <= len(DIGITS), "palette が DIGITS の数を超えた"
