"""プレイヤーの移動速度を、**ビヘイビア側の段**として書き出す。

    python tools/pve2-player-move.py worlds/pve-v2/packs/pve_v2

仕様は `worlds/pve-v2/docs/spec/12-element.md` 2-3。

## なぜビヘイビアでやるのか

**script から速さを操作する方法は、どれも副作用が出た**（2026-08-31）。

| やり方 | 何が起きたか |
| --- | --- |
| バニラの「移動速度」効果 | **20％ 刻み**でしか刻めない。アイコンも出る |
| 属性を毎 tick 書く | **スプリントの開始・終了で engine と取り合い**になり、速さが波打つ |
| 毎 tick 押し出す | **ジャンプの挙動まで変わった** |

> ### マイクラの動きそのものは触らない。
> **「素の速さ」だけをビヘイビアで差し替え、あとは engine に任せる。**
> スプリントの ×1.3 も、ジャンプも、**バニラの計算がそのまま働く。**

## 作り

**バニラの player 定義をそのまま複製し、段を足すだけ**（`reference/bedrock-samples`）。

```
component_groups   pve_v2:spd_100 … pve_v2:spd_300   （素の速さ × 1.00〜3.00）
events             同名。**他の段を外して、その段を付ける**
```

script は倍率を 0.05 刻みに丸めて、**変わったときだけ**イベントを投げる。
"""

import io
import json
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve-v2/packs/pve_v2"
BP = os.path.join(ROOT, "behavior_packs", "pve_v2")
SRC = os.path.join("reference", "bedrock-samples", "behavior_pack", "entities", "player.json")

# 段の刻みと範囲（**風 1 点 ＝ ＋5％** に合わせる）
STEP = 0.05
LOW = 1.00
HIGH = 3.00


def main() -> int:
    with io.open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    entity = data["minecraft:entity"]
    base = entity["components"]["minecraft:movement"]["value"]

    groups = entity.setdefault("component_groups", {})
    events = entity.setdefault("events", {})

    names = []
    n = LOW
    while n <= HIGH + 1e-9:
        names.append(f"pve_v2:spd_{round(n * 100)}")
        n = round(n + STEP, 2)

    for name in names:
        mult = int(name.split("_")[-1]) / 100
        groups[name] = {"minecraft:movement": {"value": round(base * mult, 4)}}
        # **他の段を全部外してから、その段を付ける**
        events[name] = {
            "remove": {"component_groups": names},
            "add": {"component_groups": [name]},
        }

    out = os.path.join(BP, "entities", "player.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"  書いた: {os.path.relpath(out)}")
    print(f"  素の速さ {base} / 段 {len(names)} 個（×{LOW:.2f}〜×{HIGH:.2f}・{STEP} 刻み）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
