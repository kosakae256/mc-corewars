"""人型の敵の絵（スキン）を描く。

    python tools/pve3-skin.py

**書き出す先**: `worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3/<名前>.png`

仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 6 章。

## なぜ描くのか

**バニラのモブを借りるだけでは、人型の敵が足りない。**
**プレイヤーと同じ模型（`geometry.humanoid.custom`）に、自前の絵を貼れば、
いくらでも別の人が作れる。**

> ### **人が置いた絵のほうが強い**
>
> **`textures/entity/pve3/<id>.png` に絵があれば、この道具は触らない**（`--force` のときだけ上書き）。
> **これは「絵が無いときの埋め合わせ」。**

## 絵の作り

**64 × 64。** バニラのスキンと同じ並び。

| 部位 | 場所 |
| --- | --- |
| **頭** | 上 (8,0) ／ 横と前後 (0,8)〜(31,15) |
| **胴** | (16,20)〜(39,31) |
| **腕** | 右 (40,20)〜(55,31) ／ 左 (32,52)〜(47,63) |
| **脚** | 右 (0,20)〜(15,31) ／ 左 (0,52)〜(15,63) |

**顔だけは前面 (8,8)〜(15,15) に描く。** 目が無いと人に見えない。

## 必要なもの

```bash
python -m pip install pillow
```
"""

import os

from PIL import Image

OUT = os.path.join(
    "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3", "textures", "entity", "pve3"
)

# **色。** (肌, 髪・頭巾, 上着, ズボン, 靴・小物, 差し色)
PEOPLE = {
    "bandit": {
        "eye": (200, 190, 90),
        "name": "盗賊",
        "skin": (200, 160, 130),
        "hair": (40, 40, 46),
        "coat": (54, 54, 62),
        "pants": (38, 38, 44),
        "boots": (28, 28, 32),
        "accent": (150, 40, 40),
        "mask": True,
    },
    "swordsman": {
        "eye": (70, 110, 200),
        "name": "剣士",
        "skin": (214, 175, 140),
        "hair": (70, 50, 34),
        "coat": (52, 78, 140),
        "pants": (60, 60, 70),
        "boots": (44, 40, 38),
        "accent": (176, 182, 194),
        "mask": False,
    },
    "brigand": {
        "eye": (120, 90, 50),
        "name": "山賊",
        "skin": (186, 142, 108),
        "hair": (96, 62, 34),
        "coat": (110, 78, 46),
        "pants": (80, 58, 38),
        "boots": (56, 40, 28),
        "accent": (150, 120, 70),
        "mask": False,
    },
    "berserker": {
        "eye": (200, 70, 60),
        "name": "狂戦士",
        "skin": (206, 158, 124),
        "hair": (150, 40, 36),
        "coat": (206, 158, 124),
        "pants": (92, 60, 44),
        "boots": (60, 40, 30),
        "accent": (170, 44, 40),
        "mask": False,
    },
    "guard": {
        "eye": (90, 120, 160),
        "name": "衛兵",
        "skin": (198, 160, 130),
        "hair": (140, 146, 158),
        "coat": (150, 156, 168),
        "pants": (108, 112, 122),
        "boots": (70, 72, 80),
        "accent": (200, 206, 216),
        "mask": False,
    },
    "crusher": {
        "name": "重撃",
        "eye": (190, 60, 50),
        "armor": (118, 122, 132),
        "skin": (196, 150, 118),
        "hair": (52, 50, 56),
        "coat": (86, 90, 100),
        "pants": (60, 58, 62),
        "boots": (44, 42, 46),
        "accent": (168, 46, 40),
        "mask": False,
    },
    "cultist": {
        "eye": (170, 120, 220),
        "name": "呪術士",
        "skin": (170, 150, 160),
        "hair": (58, 40, 78),
        "coat": (78, 52, 104),
        "pants": (52, 36, 70),
        "boots": (40, 28, 54),
        "accent": (160, 120, 200),
        "mask": True,
    },
}

# **部位の場所**（左上 x, y, 幅, 高さ）。**バニラのスキンと同じ並び**
HEAD_SIDES = (0, 8, 32, 8)
HEAD_TOP = (8, 0, 16, 8)
BODY = (16, 20, 24, 12)
ARM_R = (40, 20, 16, 12)
ARM_L = (32, 52, 16, 12)
LEG_R = (0, 20, 16, 12)
# **左脚の「地」は (16,52)。** (0,52) は第二層（ズボン）——**前はここを塗っていて、地が透明だった**
LEG_L = (16, 52, 16, 12)
FACE = (8, 8, 8, 8)

# ---- 第二層（少し大きく描かれる。鎧や頭巾に使う）
HAT = (32, 8, 32, 8)
JACKET = (16, 36, 24, 12)
SLEEVE_R = (40, 36, 16, 12)
SLEEVE_L = (48, 52, 16, 12)


def shade(c, d):
    """明るさを足し引きする。**上を明るく、下を暗く**すると立体に見える"""
    return tuple(max(0, min(255, v + d)) for v in c)


def fill(img, box, color, top_light=14, grain=6):
    """
    その区画を塗る。

    **上ほど明るく**（立体に見える）。**さらに 1 マスごとに少し揺らす**——
    **単色べた塗りは、遠目に「板」に見える。**
    """
    x, y, w, h = box
    for j in range(h):
        d = top_light - int(top_light * 2 * j / max(1, h - 1))
        for i in range(w):
            n = ((i * 7 + j * 13 + x + y) % 5) - 2
            img.putpixel((x + i, y + j), (*shade(color, d + n * grain // 2), 255))


def band(img, box, rows, color):
    """帯を引く（ベルト・裾）"""
    x, y, w, _ = box
    for j in rows:
        for i in range(w):
            img.putpixel((x + i, y + j), (*color, 255))


def face(img, p):
    """顔。**目・眉・鼻の影・口**——ここが人らしさの大半"""
    x, y, _, _ = FACE
    fill(img, FACE, p["skin"], 10, grain=3)
    hair = p["hair"]
    dark = shade(p["skin"], -55)
    # **前髪**。**両端を 1 段下げる**と、丸みが出る
    band(img, FACE, [0, 1], hair)
    for ex in (0, 1, 6, 7):
        img.putpixel((x + ex, y + 2), (*hair, 255))
    if p["mask"]:
        band(img, FACE, [3, 4], p["accent"])
    # **眉**
    for ex in (1, 2, 5, 6):
        img.putpixel((x + ex, y + 3), (*shade(hair, -10), 255))
    # **目**（白目 ＋ 瞳）
    for ex in (2, 5):
        img.putpixel((x + ex, y + 4), (240, 240, 245, 255))
        img.putpixel((x + ex, y + 5), (*shade(p["eye"], -10), 255))
    # **鼻の影**
    img.putpixel((x + 3, y + 5), (*dark, 255))
    img.putpixel((x + 4, y + 5), (*shade(p["skin"], -25), 255))
    # **口**
    for mx in (2, 3, 4, 5):
        img.putpixel((x + mx, y + 6), (*shade(p["skin"], -45), 255))


def draw(key, p):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    # ---- 頭
    fill(img, HEAD_SIDES, p["hair"], 8)
    fill(img, HEAD_TOP, shade(p["hair"], 8), 4)
    face(img, p)
    # ---- 胴。**襟・ベルト・裾**で締める
    fill(img, BODY, p["coat"])
    band(img, BODY, [0], shade(p["coat"], 18))
    band(img, BODY, [7], p["boots"])
    band(img, BODY, [8], shade(p["accent"], -20))
    # ---- 腕。**先の 3 段は手**、肩口を明るく
    for arm in (ARM_R, ARM_L):
        fill(img, arm, p["coat"])
        band(img, arm, [0], shade(p["coat"], 18))
        band(img, arm, [9, 10, 11], p["skin"])
    # ---- 脚。**先の 3 段は靴**
    for leg in (LEG_R, LEG_L):
        fill(img, leg, p["pants"])
        band(img, leg, [8], shade(p["pants"], -18))
        band(img, leg, [9, 10, 11], p["boots"])
    # ---- 第二層。**胸当てと肩当て**——ここが「装備している」感を出す
    if p.get("armor"):
        plate = p["armor"]
        fill(img, JACKET, plate, 16)
        band(img, JACKET, [0], shade(plate, 26))
        band(img, JACKET, [5], shade(plate, -26))
        for sleeve in (SLEEVE_R, SLEEVE_L):
            for j in range(4):
                for i in range(sleeve[2]):
                    img.putpixel((sleeve[0] + i, sleeve[1] + j), (*shade(plate, 14 - j * 8), 255))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{key}.png")
    img.save(path)
    return path


def main() -> int:
    import sys

    args = [a for a in sys.argv[1:] if a != "--force"]
    force = "--force" in sys.argv
    want = set(args)
    for key, p in PEOPLE.items():
        if want and key not in want:
            continue
        # > ### **渡された絵を上書きしない**（2026-09-08）
        # >
        # > **人が用意した絵のほうが良い。** **消してしまわないよう、あれば触らない。**
        path = os.path.join(OUT, f"{key}.png")
        if os.path.exists(path) and not force:
            print(f"aru node sawaranai: {path}（上書きは --force）")
            continue
        print(f"kaita: {draw(key, p)}  ({p['name']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
