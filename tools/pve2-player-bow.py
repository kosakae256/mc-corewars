"""**他人から見たときの、弓を構える姿**を出せるようにする（PVE v2）。

    python tools/pve-player-bow.py bedrock-samples worlds/pve-v2/packs/pve_v2

## なぜ要るのか

一人称の引き姿は attachable が出す（`tools/pve-bow-rig.py`）。
**三人称——他人から見た「腕を前に出す」姿は、attachable では出せない。**
バニラの attachable も `rightitem` しか動かしていない。

あれは**プレイヤー本体のアニメーション**で、条件がこうなっている:

```
"third_person_bow_equipped": "query.get_equipped_item_name == 'bow' && ..."
```

**名前で見ている。** 独自アイテム（`pve:bow_*`）は**この条件に一生入らない。**

## どこに足すか——バニラと同じ場所

**`controller.animation.player.root` の `third_person` という状態の中。**
バニラの弓の条件が置いてあるのと**同じ並び**に、こちらの条件を足す。

| 触るもの | 何を足すか |
| --- | --- |
| `entity/player.entity.json` | `animations` に `pve_bow_third` → **`animation.player.bow_equipped`** |
| `animation_controllers/player.animation_controllers.json` | `third_person` 状態に**条件を 1 行** |

**動き自体は作らない。** バニラと同じでよい（2026-08-29 決定）。

> ### 実体の直下（`scripts.animate`）に足してはいけない
>
> 一度そうした。**一人称にも掛かって、手元の弓が消えた。**
> `!c.is_first_person` で外そうとしたら、**今度は三人称から消えた**——
> **視点の見分けを自分で書くと、どちらかで必ず外れる。**
>
> **バニラと同じ状態の中に置けば、視点の判定はバニラがやってくれる。**

> ### 丸ごとの上書きになる
>
> プレイヤーの**見た目の定義**と**動きの制御**を、まるごと持つことになる。
> **バニラが更新されても付いていかない。**
> **手で書かない。** `bedrock-samples` を新しくして、**もう一度走らせれば追従できる。**
>
> **弓を増やしたら、この道具の `BOWS` にも足す。**
"""

import json
import os
import sys

SAMPLES = sys.argv[1] if len(sys.argv) > 1 else "bedrock-samples"
PACK = sys.argv[2] if len(sys.argv) > 2 else "worlds/pve-v2/packs/pve_v2"

SRC_RP = os.path.join(SAMPLES, "resource_pack")
DST_RP = os.path.join(PACK, "resource_packs", "pve")

# 弓のアイテム。**増やしたらここに足す**（`scripts/features/bow/weapons.ts` と揃える）
BOWS = ["pve_v2:bow"]

# 借りる動き。**バニラの三人称の弓構え**
BORROWED = "animation.player.bow_equipped"

NAME = "pve2_bow_third"

# バニラの弓の条件が置いてある場所
CONTROLLER = "controller.animation.player.root"
STATE = "third_person"


def load_jsonc(path: str):
    """`//` の注釈が入っている JSON を読む。**バニラの一部はこれ。**"""
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    out = []
    i = 0
    in_str = False
    while i < len(raw):
        ch = raw[i]
        if in_str:
            out.append(ch)
            if ch == "\\" and i + 1 < len(raw):
                out.append(raw[i + 1])
                i += 2
                continue
            if ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < len(raw) and raw[i + 1] == "/":
            while i < len(raw) and raw[i] != "\n":
                i += 1
            continue
        out.append(ch)
        i += 1
    return json.loads("".join(out))


def write(rel: str, data) -> None:
    path = os.path.join(DST_RP, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("  ", rel)


items = ", ".join(f"'{i}'" for i in BOWS)
# **引いている間だけ。** `main_hand_item_use_duration` は使っていないとき 0
# **持っている間ずっと**（2026-08-30 決定）。
#
# v1 は「引いている間だけ」だったが、v2 は**引く動きが無い**——
# **手に持っていれば、外から見て弓を構えている姿**にする。
COND = f"query.is_item_name_any('slot.weapon.mainhand', {items})"

# ---------------------------------------------------------------- 見た目の定義
entity = load_jsonc(os.path.join(SRC_RP, "entity", "player.entity.json"))
desc = entity["minecraft:client_entity"]["description"]
desc["animations"][NAME] = BORROWED
# **実体の直下には足さない**（視点で外れる）。控えが残っていたら消す
desc["scripts"]["animate"] = [a for a in desc["scripts"]["animate"] if not (isinstance(a, dict) and NAME in a)]
write("entity/player.entity.json", entity)

# ---------------------------------------------------------------- 動きの制御
ctrl = load_jsonc(os.path.join(SRC_RP, "animation_controllers", "player.animation_controllers.json"))
state = ctrl["animation_controllers"][CONTROLLER]["states"][STATE]
anims = state["animations"]
anims = [a for a in anims if not (isinstance(a, dict) and NAME in a)]
# **バニラの弓の条件の隣へ**
anims.append({NAME: COND})
state["animations"] = anims
write("animation_controllers/player.animation_controllers.json", ctrl)

ver = json.load(open(os.path.join(SAMPLES, "version.json"), encoding="utf-8"))["latest"]["version"]
print(f"下敷き: bedrock-samples {ver}\n足した条件: {COND}\n置いた所: {CONTROLLER} / {STATE}")
