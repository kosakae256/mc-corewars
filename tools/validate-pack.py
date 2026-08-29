#!/usr/bin/env python
"""パックの JSON を、公式スキーマで確かめる。

    python tools/validate-pack.py <パックの根> [--kind entities|items|...]

## なぜ要るのか

**JSON が 1 つでも不正だと、そのファイルは黙って読み込まれない。**
ゲーム側は「そんなエンティティは無い」としか言わない——
**どの部品が悪いのかは教えてくれない。**

実際に、これで 2 回止まった:

| 書いたもの | 何が悪かったか |
| --- | --- |
| `minecraft:pushable` | **そんな部品は無い**（`pushable_by_entity` などに分かれた） |
| `minecraft:breathable` の `totalSupply` | **綴りが古い**（いまは `total_supply`） |

**スキーマは手元にある**（`reference/bedrock-json-schemas`）。
**書いた直後に、ここで弾く。**

## 使い方

```bash
python tools/validate-pack.py worlds/pve/packs/pve
```

BP の `entities/` `items/` `blocks/`、RP の `particles/` `attachables/` を見る。
"""

from __future__ import annotations

import argparse
import json
import os
import sys

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover
    print("jsonschema が要ります:  python -m pip install jsonschema")
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMAS = os.path.join(ROOT, "reference", "bedrock-json-schemas")

# 見るもの。**スキーマがある分だけ**
TARGETS = [
    ("behavior_packs/*/entities", "behavior/entities/entities.json"),
    ("behavior_packs/*/items", "behavior/items/items.json"),
    ("behavior_packs/*/blocks", "behavior/blocks/blocks.json"),
    ("resource_packs/*/particles", "resource/particles/particles.json"),
    ("resource_packs/*/attachables", "resource/attachables/attachables.json"),
    ("resource_packs/*/entity", "resource/entity/entity.json"),
]


def load(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def find_dirs(pack_root: str, pattern: str):
    head, tail = pattern.split("/*/")
    base = os.path.join(pack_root, head)
    if not os.path.isdir(base):
        return []
    out = []
    for name in os.listdir(base):
        d = os.path.join(base, name, tail)
        if os.path.isdir(d):
            out.append(d)
    return out


def check(pack_root: str, only: str | None) -> int:
    bad = 0
    seen = 0
    for pattern, schema_rel in TARGETS:
        if only is not None and only not in pattern:
            continue
        schema_path = os.path.join(SCHEMAS, schema_rel)
        if not os.path.exists(schema_path):
            continue
        validator = Draft7Validator(load(schema_path))
        for d in find_dirs(pack_root, pattern):
            for name in sorted(os.listdir(d)):
                if not name.endswith(".json"):
                    continue
                path = os.path.join(d, name)
                seen += 1
                try:
                    data = load(path)
                except json.JSONDecodeError as err:
                    print(f"§ {path}\n   壊れた JSON: {err}")
                    bad += 1
                    continue
                errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
                if not errors:
                    continue
                bad += 1
                print(f"× {os.path.relpath(path, ROOT)}")
                for e in errors[:6]:
                    where = "/".join(str(p) for p in e.path) or "(根)"
                    print(f"   {where}: {e.message[:160]}")
    print(f"\n見たファイル {seen} / 問題 {bad}")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="パックの JSON をスキーマで確かめる")
    ap.add_argument("pack", help="パックの根（package.json のある所）")
    ap.add_argument("--kind", help="entities / items / particles など、絞り込み")
    args = ap.parse_args()
    return check(args.pack, args.kind)


if __name__ == "__main__":
    sys.exit(main())
