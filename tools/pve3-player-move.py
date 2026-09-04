"""プレイヤーの移動速度を、**ビヘイビア側の段**として書き出す。

    python tools/pve3-player-move.py

仕様は `worlds/pve-v3/docs/spec/15-growth.md` 4 章。

## なぜビヘイビアでやるのか

**script から速さを操作する方法は、どれも副作用が出た**（2026-08-31・v2 での確認）。

| やり方 | 何が起きたか |
| --- | --- |
| バニラの「移動速度」効果 | **20％ 刻み**でしか刻めない。アイコンも出る |
| 属性を毎 tick 書く | **スプリントの開始・終了で engine と取り合い**になり、速さが波打つ |
| 毎 tick 押し出す | **ジャンプの挙動まで変わった** |

> ### マイクラの動きそのものは触らない。
> **「素の速さ」だけをビヘイビアで差し替え、あとは engine に任せる。**
> スプリントの ×1.3 も、ジャンプも、**バニラの計算がそのまま働く。**

## 作り

**いまの `player.json` を読み、`pve_v3:spd_*` だけを入れ替える。**

```
component_groups   pve_v3:spd_1000 … pve_v3:spd_5000   （素の速さ × 1.000〜5.000）
events             同名。**他の段を外して、その段を付ける**
```

> **元から書き直さない。** v3 の player.json には速さ以外の上書き
>（攻撃力 1 など）も入っているので、**そこを消さないように差分で当てる。**

script は倍率を 0.025 刻みに丸めて、**あるべき値と違うときだけ**イベントを投げる。
"""

import io
import json
import os
import re
import sys

BP = os.path.join("worlds", "pve-v3", "packs", "pve_v3", "behavior_packs", "pve_v3")
TARGET = os.path.join(BP, "entities", "player.json")

# 段の刻みと範囲（`docs/spec/15-growth.md` 4 章）
#
# **買える範囲は 2.0 まで**だが、**買う以外で伸びうる**ので 5.0 まで用意する。
STEP = 0.025
LOW = 1.000
HIGH = 5.000

# **名前は倍率 ×1000**。`spd_1000` ＝ 1.000、`spd_5000` ＝ 5.000
SCALE = 1000

OLD = re.compile(r"^pve_v3:spd_")


def main() -> int:
    if not os.path.exists(TARGET):
        print(f"  無い: {TARGET}")
        return 1

    with io.open(TARGET, encoding="utf-8") as f:
        data = json.load(f)

    entity = data["minecraft:entity"]
    base = entity["components"]["minecraft:movement"]["value"]

    groups = entity.setdefault("component_groups", {})
    events = entity.setdefault("events", {})

    # **古い段を全部落とす。** 刻みを変えたときに残骸が残らないように
    dropped = 0
    for table in (groups, events):
        for name in [k for k in table if OLD.match(k)]:
            del table[name]
            dropped += 1

    names = []
    n = LOW
    while n <= HIGH + 1e-9:
        names.append(f"pve_v3:spd_{round(n * SCALE)}")
        n = round(n + STEP, 3)

    for name in names:
        mult = int(name.split("_")[-1]) / SCALE
        groups[name] = {"minecraft:movement": {"value": round(base * mult, 5)}}
        # **他の段を全部外してから、その段を付ける**
        events[name] = {
            "remove": {"component_groups": names},
            "add": {"component_groups": [name]},
        }

    with io.open(TARGET, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  書いた: {TARGET}")
    print(f"  落とした古い段: {dropped} 個")
    print(f"  素の速さ {base} / 段 {len(names)} 個（×{LOW:.3f}〜×{HIGH:.3f}・{STEP} 刻み）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
