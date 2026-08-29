"""属性の粒を、絵から定義まで書き出す。

    python tools/pve-element-particles.py worlds/pve/packs/pve

仕様は `worlds/pve/docs/spec/17-element.md` 5-4。
見せ方の元は `worlds/pve/docs/04-roles.md` 2-4。

## 絵の作り（2026-08-29 に作り直した）

> ### 記号を描かない。**光の形を描く。**
>
> はじめは「しずく・稲妻・炎・斬撃・雪の結晶」を**くっきり**描いた。
> **アイコンが飛び出しているようにしか見えなかった。**

| やめたこと | 代わりに |
| --- | --- |
| 輪郭のはっきりした記号 | **中心が明るく、外へ溶ける**（放射状に薄くなる） |
| 大きい粒を数個 | **小さい粒をたくさん**（細かいほど「霧」「粉」に見える） |
| 形で見せる | **動きと色で見せる**（落ちる・昇る・抜ける） |

## 何を作るか

| 属性 | 当たった時 | **溜まっている間** |
| --- | --- | --- |
| 水 | しずくが弾ける | **足元に滴が落ちる**（濡れている） |
| 雷 | 縦の閃光が落ちる | — |
| 火 | 炎が立ち昇る | （焼けるたびに出る） |
| 風 | 薄い筋が横へ抜ける | — |
| 氷 | 粉が漂う | **冷気がまとわりつく** |
| 氷（満ちた） | **一気に弾ける** | — |
"""

import io
import json
import math
import os
import sys

from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
RP = os.path.join(ROOT, "resource_packs", "pve")
TEX = os.path.join(RP, "textures", "particle")
PAR = os.path.join(RP, "particles")
for d in (TEX, PAR):
    os.makedirs(d, exist_ok=True)


def soft(name: str, size: int, fn) -> None:
    """**1 画素ずつ濃さを置く。** 縁を作らない"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size * 2 - 1
            v = (y + 0.5) / size * 2 - 1
            a = fn(u, v)
            if a <= 0.004:
                continue
            a = min(1.0, a)
            # **芯だけ白を強める。** 外は色が乗るように薄く
            px[x, y] = (255, 255, 255, round(255 * a))
    img.save(os.path.join(TEX, f"{name}.png"))
    print("  ", f"{name}.png")


def blob(u, v):
    """丸い光。**中心が明るく、外へ溶ける**"""
    r = math.hypot(u, v)
    return max(0.0, 1.0 - r) ** 2.2


def droplet(u, v):
    """滴。**下がふくらみ、上へ細く伸びる**"""
    y = (v + 0.35) * 1.25
    w = 0.55 + 0.45 * max(0.0, min(1.0, (y + 1) / 2))
    r = math.hypot(u / w, y)
    return max(0.0, 1.0 - r) ** 2.0


def streak(u, v):
    """縦の筋。**上下へ長く、横へすぐ薄く**"""
    return max(0.0, 1.0 - abs(u) ** 0.9 * 2.4) * max(0.0, 1.0 - abs(v) ** 2.4)


def wisp(u, v):
    """横の筋。**片側が濃く、片側へ流れて消える**"""
    along = max(0.0, 1.0 - abs(u) ** 1.7)
    across = max(0.0, 1.0 - abs(v) ** 0.8 * 2.2)
    return along * across * (0.55 + 0.45 * (1 - (u + 1) / 2))


def fire_shape(u, v):
    """炎ひとつ。**下がふくらみ、上へすぼまる。** 根元が明るい

    丸い粒を昇らせると**謎の粒**にしか見えなかった（2026-08-29）。
    **形そのものを炎にする。**
    """
    # v: -1（上）〜 1（下）
    t = (v + 1) / 2                      # 0（上）〜 1（下）
    if t <= 0.02:
        return 0.0
    width = 0.18 + 0.62 * (t ** 0.75)    # 上は細く、下は太い
    if t > 0.86:                         # 底は丸く閉じる
        width *= max(0.0, 1.0 - ((t - 0.86) / 0.14) ** 2) ** 0.5
    r = abs(u) / max(width, 1e-3)
    if r >= 1.0:
        return 0.0
    body = (1.0 - r) ** 1.5
    # **根元ほど濃く、先はゆらいで薄い**
    return body * (0.35 + 0.65 * t) ** 1.2


def bolt_shape(u, v):
    """雷の一節。**芯が白く細い ＋ 外側にうすい光**

    1 つでは雷にならない。**script が何本も縦に繋いで、折れ線にする**
    （`features/element/thunder.ts`）。
    """
    core = max(0.0, 1.0 - abs(u) * 5.0)          # 細い芯
    glow = max(0.0, 1.0 - abs(u) * 1.7) ** 2.2   # 外のにじみ
    along = max(0.0, 1.0 - abs(v) ** 3.0)        # 上下の端だけ落とす
    return min(1.0, core * 1.0 + glow * 0.5) * along


def splinter(u, v):
    """粉。**細長い光の粒**（結晶の形は描かない）"""
    a = math.radians(35)
    ru = u * math.cos(a) - v * math.sin(a)
    rv = u * math.sin(a) + v * math.cos(a)
    return max(0.0, 1.0 - math.hypot(ru / 0.35, rv)) ** 1.8


soft("pve_blob", 16, blob)
soft("pve_droplet", 16, droplet)
soft("pve_streak", 16, streak)
soft("pve_wisp", 16, wisp)
soft("pve_splinter", 16, splinter)
soft("pve_fire", 24, fire_shape)
soft("pve_bolt", 16, bolt_shape)


def particle(ident, texture, count, size, life, speed, accel, drag, color_from, color_to,
             radius=0.45, facing="lookat_xyz", offset=(0, 1.0, 0), material="particles_add", tex=16):
    """粒 1 つ。**どれも同じ骨から作る**

    `size` は `(横, 縦)`。**筋ものは横長・縦長にする。**
    """
    fade = "(1 - (v.particle_age / v.particle_lifetime))"
    w, h = size
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": ident,
                "basic_render_parameters": {"material": material, "texture": f"textures/particle/{texture}"},
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": count},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_sphere": {
                    "offset": list(offset),
                    "radius": radius,
                    "direction": "outwards",
                },
                "minecraft:particle_initial_speed": speed,
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": list(accel),
                    "linear_drag_coefficient": drag,
                },
                "minecraft:particle_lifetime_expression": {"max_lifetime": life},
                "minecraft:particle_appearance_billboard": {
                    "size": [f"{w} * {fade}", f"{h} * {fade}"],
                    "facing_camera_mode": facing,
                    "uv": {"texture_width": tex, "texture_height": tex, "uv": [0, 0], "uv_size": [tex, tex]},
                },
                "minecraft:particle_appearance_tinting": {
                    "color": {"gradient": [color_from, color_to],
                              "interpolant": "v.particle_age / v.particle_lifetime"}
                },
            },
        },
    }


FILES = {
    # ---- 当たった時
    #
    # 水：**細かい滴が弾けて落ちる。** 光ではないので加算にしない
    "el_water.json": particle("pve:el_water", "pve_droplet", 14, (0.16, 0.21), 0.5, 2.6,
                              (0, -11.0, 0), 1.1, (0.72, 0.92, 1.0, 0.95), (0.25, 0.55, 0.95, 0.0),
                              # **外へ出す。** 0.4 ではモブの体に埋まって見えなかった（2026-08-29）
                              radius=0.85, material="particles_alpha"),
    # 雷（節）：**script が縦に繋いで 1 本の落雷にする**
    #（`features/element/thunder.ts`。`docs/spec/17-element.md` 5-7）
    "el_thunder_seg.json": particle("pve:el_thunder_seg", "pve_bolt", 1, (0.34, 1.15), 0.24, 0,
                                    (0, 0, 0), 0, (1.0, 1.0, 1.0, 1.0), (0.85, 0.75, 1.0, 0.0),
                                    radius=0.02, offset=(0, 0, 0), facing="lookat_y"),
    # 雷（着弾の閃光）：**低く広がる光**
    "el_thunder_flash.json": particle("pve:el_thunder_flash", "pve_blob", 1, (2.6, 2.6), 0.22, 0,
                                      (0, 0, 0), 0, (1.0, 1.0, 0.92, 0.9), (0.9, 0.85, 1.0, 0.0),
                                      radius=0.02, offset=(0, 0.15, 0)),
    # 雷（火花）：**足元から跳ねる**
    "el_thunder_spark.json": particle("pve:el_thunder_spark", "pve_splinter", 16, (0.1, 0.16), 0.45, 5.5,
                                      (0, -12.0, 0), 1.2, (1.0, 1.0, 0.8, 1.0), (1.0, 0.75, 0.15, 0.0),
                                      radius=0.15, offset=(0, 0.2, 0)),
    # 風：**薄い筋が横へ抜ける。** 大きく、すぐ消える
    "el_wind.json": particle("pve:el_wind", "pve_wisp", 9, (0.85, 0.11), 0.28, 4.2,
                             # **はっきり緑**（白いと「何の属性か」分からなかった）
                             (0, 0.6, 0), 2.6, (0.55, 1.0, 0.6, 0.95), (0.15, 0.85, 0.35, 0.0),
                             radius=0.45),
    # 氷：**細かい粉が漂う。** 落ちも昇りもしない
    "el_ice.json": particle("pve:el_ice", "pve_splinter", 12, (0.1, 0.13), 0.9, 0.55,
                            (0, 0.25, 0), 2.2, (0.9, 0.98, 1.0, 0.9), (0.45, 0.78, 1.0, 0.0),
                            radius=0.5),
    # 氷（満ちた）：**同じ粉が、一気に**
    "el_ice_burst.json": particle("pve:el_ice_burst", "pve_splinter", 90, (0.22, 0.34), 0.95, 11.0,
                                  (0, -5.0, 0), 1.3, (1.0, 1.0, 1.0, 1.0), (0.35, 0.7, 1.0, 0.0),
                                  radius=0.2, offset=(0, 0.9, 0)),
    # 炸裂の閃光：**一瞬、白く広がる**
    "el_ice_flash.json": particle("pve:el_ice_flash", "pve_blob", 1, (3.4, 3.4), 0.3, 0,
                                  (0, 0, 0), 0, (0.95, 1.0, 1.0, 0.9), (0.4, 0.8, 1.0, 0.0),
                                  radius=0.02, offset=(0, 1.0, 0)),
    # 炸裂の輪：**足元から外へ**
    "el_ice_ring.json": particle("pve:el_ice_ring", "pve_splinter", 40, (0.3, 0.12), 0.55, 9.0,
                                 (0, 0.2, 0), 3.0, (0.9, 1.0, 1.0, 0.95), (0.4, 0.8, 1.0, 0.0),
                                 radius=0.1, offset=(0, 0.25, 0)),

    # ---- 溜まっている間（`docs/spec/17-element.md` 5-5）
    #
    # 水：**足元へ滴が落ち続ける。** 濡れている
    "el_water_wet.json": particle("pve:el_water_wet", "pve_droplet", 4, (0.13, 0.17), 0.55, 0.3,
                                  (0, -9.0, 0), 0.6, (0.7, 0.9, 1.0, 0.75), (0.3, 0.6, 1.0, 0.0),
                                  # **体の外側から滴らせる**（内側だと埋まる）
                                  radius=0.7, offset=(0, 1.1, 0), material="particles_alpha"),
    # 氷：**冷気がまとわりつく。** ゆっくり、うっすら
    "el_ice_chill.json": particle("pve:el_ice_chill", "pve_splinter", 7, (0.16, 0.2), 1.3, 0.18,
                                  (0, 0.1, 0), 1.6, (0.92, 0.99, 1.0, 0.85), (0.45, 0.8, 1.0, 0.0),
                                  # **体の外側をまとう**（内側だと埋まる）
                                  radius=0.85, offset=(0, 1.0, 0)),
}

for name, data in FILES.items():
    with io.open(os.path.join(PAR, name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("  ", name)

for old in ["pve_drop.png", "pve_flame.png", "pve_slash.png", "pve_crystal.png"]:
    p = os.path.join(TEX, old)
    if os.path.exists(p):
        os.remove(p)
        print("   消した:", old)
print("できた")
