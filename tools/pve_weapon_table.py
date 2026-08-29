"""Archer の武器 48 本の一覧（**mythic を除く全部**）。

**ここが唯一の出どころ。** 仕様書・データ・絵・アイテム定義を、全部ここから作る。

| 作るもの | 道具 |
| --- | --- |
| 仕様書の表 | `tools/pve-weapons-doc.py` → `docs/spec/19-weapons.md` |
| script のデータ | `tools/pve-weapons-code.py` → `scripts/features/bow/list.ts` |
| 絵（4 段 ＋ きらめき） | `tools/pve-bow-art.py` |
| アイテム・持ち姿・模型 | `tools/pve-bow-rig.py` |

**手で JSON や絵を書かない。** 48 本もあると、必ずどこかがずれる。

## 欄の意味

| 欄 | |
| --- | --- |
| `num` | 下書き（`docs/drafts/archer-weapons.md`）の番号 |
| `base` | **1 秒ためた 1 発の火力** |
| `full` | ためきるまでの tick（**既定 20**） |
| `ability` | **固有能力の型**（`docs/spec/19-weapons.md` 3 章） |
| `hue` | 色の元（0〜360）。ここから 3 色の陰影を作る |
| `mat` | 素材（`wood` / `steel` / `crystal` / `bone` / `dark`） |
| `decor` | 飾り（`none` / `studs` / `stars` / `runes` / `gems`） |
| `shape` | **弓の形**（`SHAPES` で素材から決まる。個別に上書きできる） |
| `trail` | 軌跡の粒 |
| `tsound` | **軌跡の音**（無ければ鳴らさない） |
| `asound` | **固有能力の音**（無ければ鳴らさない） |
"""

# **軌跡・軌跡の音・能力の音は、弓 1 本ごとに 1 つずつ作る**（2026-08-29 変更）。
#
# 前は 5 種類の粒と 2 種類の音を回していた——
# **「弓ごとに違う」と書いておきながら、そうなっていなかった。**
#
# | 何 | どこで作るか |
# | --- | --- |
# | 軌跡の粒 | `tools/pve-trails.py` → `pve:trail_<key>` |
# | 軌跡の音 | `tools/pve-weapon-sounds.py` → `pve.trail.<key>` |
# | 能力の音 | 同上 → `pve.ability.<key>` |
#
# **`trail` の欄は「見た目の系統」**（絵と色の元）として残す。


def trail_of(w: dict) -> str:
    return f'pve:trail_{w["key"]}'


def trail_sound_of(w: dict) -> str:
    return f'pve.trail.{w["key"]}'


def ability_sound_of(w: dict) -> str:
    """**能力がある弓だけ。** 効果なしの弓には鳴らすものが無い"""
    return None if w["ability"] == "none" else f'pve.ability.{w["key"]}'


# 見た目の系統（絵と色の元。`tools/pve-trails.py` が読む）
TRAILS = {
    "wood": "pve:trail_wood",
    "steel": "pve:trail_steel",
    "star": "pve:trail_star",
    "blood": "pve:trail_blood",
    "void": "pve:trail_void",
}

# num, key, 名前, レア度, base, full, ability, hue, mat, decor, trail, tsound, asound
WEAPONS = [
    # ---- common
    (1, "common", "支給された弓", "common", 30, 20, "none", 30, "wood", "none", "wood", None, None),
    # ---- uncommon（11）
    (2, "heal", "癒しの弓", "uncommon", 50, 20, "heal_ally", 60, "wood", "runes", "star", None, "pve.ability.bless"),
    (3, "rapid", "速射弓", "uncommon", 25, 1, "rapid", 20, "wood", "none", "wood", None, None),
    (4, "long", "長弓", "uncommon", 64, 40, "long_draw", 35, "wood", "studs", "wood", "pve.trail.steel", None),
    (5, "scatter", "散華", "uncommon", 38, 20, "spread3", 15, "wood", "none", "wood", None, None),
    (6, "stake", "杭打ち弓", "uncommon", 50, 20, "knock_far", 25, "steel", "studs", "steel", "pve.trail.steel", "pve.ability.slam"),
    (7, "heavy", "重弓", "uncommon", 52, 30, "heavy_draw", 40, "steel", "studs", "steel", "pve.trail.steel", None),
    (8, "chain", "鎖弓", "uncommon", 50, 20, "chain_mark", 210, "steel", "studs", "steel", "pve.trail.steel", None),
    (9, "recoil", "反動弓", "uncommon", 50, 20, "recoil", 10, "steel", "studs", "steel", "pve.trail.steel", "pve.ability.slam"),
    (10, "purify", "破魔矢", "uncommon", 50, 20, "element_boost", 300, "wood", "runes", "star", None, None),
    (11, "hunter", "狩人の弓", "uncommon", 50, 20, "heal_on_kill", 100, "wood", "none", "wood", None, None),
    (12, "picker", "拾い屋の弓", "uncommon", 50, 20, "more_drops", 45, "wood", "gems", "star", None, None),
    # ---- rare（17）
    (13, "guardian", "守護者の弓", "rare", 60, 20, "guardian", 190, "crystal", "runes", "star", "pve.trail.star", "pve.ability.bless"),
    (14, "plain", "無銘弓", "rare", 70, 20, "none", 205, "steel", "studs", "steel", "pve.trail.steel", None),
    (15, "burst", "炸裂弓", "rare", 60, 20, "explode_small", 25, "steel", "studs", "steel", "pve.trail.steel", "pve.ability.boom"),
    (16, "lance", "光槍", "rare", 55, 20, "pierce_all", 55, "crystal", "runes", "star", "pve.trail.star", None),
    (17, "billiard", "ビリヤード", "rare", 55, 20, "bounce", 285, "steel", "gems", "steel", "pve.trail.steel", None),
    (18, "firework", "花火弓", "rare", 55, 20, "firework", 330, "wood", "gems", "star", None, "pve.ability.boom"),
    (19, "gravity", "重力錘", "rare", 55, 20, "slam_down", 265, "dark", "studs", "void", "pve.trail.steel", "pve.ability.slam"),
    (20, "blood", "血の弓", "rare", 60, 20, "lifesteal", 355, "bone", "runes", "blood", None, None),
    (21, "railgun", "レールガン", "rare", 60, 24, "railgun", 200, "steel", "gems", "steel", "pve.trail.steel", "pve.ability.beam"),
    (22, "spider", "蜘蛛の弓", "rare", 55, 20, "web", 80, "bone", "none", "wood", None, None),
    (23, "mine", "地雷矢", "rare", 55, 20, "mine", 5, "steel", "studs", "steel", "pve.trail.steel", "pve.ability.boom"),
    (24, "twin", "双龍弓", "rare", 50, 20, "twin_spiral", 220, "crystal", "gems", "star", "pve.trail.star", None),
    (25, "holy", "聖水弓", "rare", 55, 20, "light_pillar", 50, "crystal", "runes", "star", "pve.trail.star", "pve.ability.bless"),
    (26, "brand", "烙印弓", "rare", 55, 20, "brand", 0, "bone", "runes", "blood", None, "pve.ability.boom"),
    (27, "dice", "賽の弓", "rare", 60, 20, "dice", 45, "wood", "gems", "star", None, None),
    (28, "card", "札の弓", "rare", 60, 20, "cards", 315, "wood", "gems", "star", None, None),
    (29, "cannon", "大砲弓", "rare", 62, 30, "cannon", 15, "dark", "studs", "void", "pve.trail.steel", "pve.ability.boom"),
    # ---- legendary（19）
    (30, "harpoon", "ハープーンボウ", "legendary", 40, 20, "spread5", 195, "steel", "studs", "steel", "pve.trail.steel", None),
    (31, "pierce", "貫き", "legendary", 60, 20, "pierce_line", 185, "steel", "gems", "steel", "pve.trail.steel", None),
    (32, "named", "銘入りの弓", "legendary", 60, 20, "enchant_luck", 45, "crystal", "runes", "star", "pve.trail.star", None),
    (33, "stardust", "星屑", "legendary", 45, 20, "starfall", 270, "crystal", "stars", "star", "pve.trail.star", "pve.weapon.stardust_land"),
    (34, "clock", "時詠み", "legendary", 60, 20, "time_stop", 175, "crystal", "runes", "star", "pve.trail.star", "pve.ability.chime"),
    (35, "pin", "影縫い", "legendary", 60, 20, "root", 250, "dark", "studs", "void", "pve.trail.steel", None),
    (36, "echo", "残響", "legendary", 35, 20, "echo", 165, "crystal", "runes", "star", "pve.trail.star", None),
    (37, "ward", "結界弓", "legendary", 50, 20, "ward", 145, "crystal", "runes", "star", "pve.trail.star", "pve.ability.bless"),
    (38, "missile", "追尾ミサイル", "legendary", 60, 20, "homing", 20, "steel", "studs", "steel", "pve.trail.steel", None),
    (39, "reverb", "反響弓", "legendary", 55, 20, "kill_echo", 215, "crystal", "gems", "star", "pve.trail.star", None),
    (40, "meteor", "流星", "legendary", 45, 20, "meteor", 10, "dark", "gems", "blood", "pve.trail.steel", "pve.ability.boom"),
    (41, "return", "回旋", "legendary", 35, 20, "boomerang", 160, "crystal", "gems", "star", "pve.trail.star", None),
    (42, "hook", "鉤縄", "legendary", 60, 20, "pull", 230, "steel", "studs", "steel", "pve.trail.steel", None),
    (43, "combo", "連撃の証", "legendary", 40, 20, "combo", 48, "wood", "gems", "star", None, None),
    (44, "shadow", "影武者", "legendary", 35, 20, "shadow_shot", 275, "dark", "runes", "void", "pve.trail.star", None),
    (45, "quiver", "無限矢筒", "legendary", 30, 20, "quiver", 40, "wood", "gems", "wood", None, None),
    (46, "dual", "双属の弓", "legendary", 55, 20, "dual_element", 290, "crystal", "gems", "star", "pve.trail.star", None),
    (47, "blackhole", "黒穴弓", "legendary", 55, 20, "blackhole", 260, "dark", "runes", "void", "pve.trail.star", "pve.ability.chime"),
    (48, "aurora", "極光", "legendary", 55, 20, "aurora", 155, "crystal", "stars", "star", "pve.trail.star", "pve.ability.bless"),
]

FIELDS = ["num", "key", "name", "rarity", "base", "full", "ability", "hue", "mat", "decor", "trail", "tsound", "asound"]

# **軌跡にきらめきを散らす弓。**
#
# 線の上に粒を点々と置く（`docs/spec/13-bow-view.md` 4-1）。
# **1 本だけ。** 全部に付けると**線がぼやけて、どれも同じに見える。**
SPARK_KEYS = {"stardust"}
SPARK_PARTICLE = "pve:trail_star_spark"


def spark_of(w: dict):
    return SPARK_PARTICLE if w["key"] in SPARK_KEYS else None

# 素材ごとの既定の形（`docs/spec/19-weapons.md` 1 章）。
#
# **角度と大きさは変えない。** 変えるのは**弧の張り・太さ・先端・握り**だけ——
# 極端に変えると**持ち姿がぶれて、同じ武器に見えなくなる。**
SHAPE_BY_MAT = {
    "wood": "plain",
    "steel": "recurve",
    "crystal": "sharp",
    "bone": "thin",
    "dark": "heavy",
}

# 個別の上書き。**性格が形に出るもの**だけ
SHAPE_OVERRIDE = {
    "rapid": "thin",       # 速射：軽い
    "long": "long",        # 長弓：伸びた弧
    "heavy": "heavy",      # 重弓：太い
    "cannon": "heavy",
    "harpoon": "split",    # 銛：二又
    "scatter": "split",
    "twin": "split",
    "railgun": "long",
    "stardust": "sharp",
    "aurora": "sharp",
    "quiver": "plain",
}


def shape_of(w: dict) -> str:
    return SHAPE_OVERRIDE.get(w["key"], SHAPE_BY_MAT[w["mat"]])


def weapons():
    """辞書の一覧にして返す。**形も入れて返す**"""
    out = []
    for row in WEAPONS:
        w = dict(zip(FIELDS, row))
        w["shape"] = shape_of(w)
        out.append(w)
    return out


# 固有能力の型（`docs/spec/19-weapons.md` 3 章）。
#
# | 欄 | |
# | --- | --- |
# | 説明 | 何が起きるか |
# | 重なり | **同じことをするエンチャントが付いたとき**どうなるか |
ABILITIES = {
    "none": ("効果なし", "エンチャントがそのまま働く"),
    "heal_ally": ("味方に当てると回復（最終攻撃力に依存）", "重なる"),
    "rapid": ("ためが無い。1 発は 1/10、0.05 秒ごとに撃てる", "ため系のエンチャントは効かない"),
    "long_draw": ("ためを 2 秒まで延ばせる（1.6 倍）", "ため短縮と打ち消し合う（短縮が勝つ）"),
    "spread3": ("3 本に散らす（各 70%）", "**拡散と重なる**（3 × 拡散の本数）"),
    "spread5": ("5 本に散らす（各 40%）", "**拡散と重なる**"),
    "knock_far": ("大きく吹き飛ばす", "重なる（強さを足す）"),
    "heavy_draw": ("ため 1.5 秒で 1.5 倍", "ため短縮と打ち消し合う"),
    "chain_mark": ("当てた敵に鎖。次の 1 発は必ず当たる", "重なる"),
    "recoil": ("撃つと自分が後ろへ跳ぶ", "重なる"),
    "element_boost": ("属性の蓄積が 2 倍", "**浸食と重なる**（掛け算）"),
    "heal_on_kill": ("倒すと回復", "重なる"),
    "more_drops": ("落とし物が増える", "重なる"),
    "guardian": ("背後の射手が、近い敵へ自動で撃つ", "重なる（射手の弾には乗らない）"),
    "explode_small": ("当たった所で小爆発（20）", "**炸裂を上書き**（固有が優先）"),
    "pierce_all": ("並んだ敵を全部貫く（1 体ごとに −15%）", "**貫通を上書き**"),
    "bounce": ("壁で 3 回跳ねる。跳ねるほど +50%", "跳弾と上書き"),
    "firework": ("着弾で花火。破片が飛ぶ", "炸裂と重なる"),
    "slam_down": ("敵を地面へ叩きつける", "重なる"),
    "lifesteal": ("与えたダメージの 5% を回復", "**吸収と重なる**（足し算）"),
    "railgun": ("溜め切ると極太のビーム（貫通）", "貫通を上書き"),
    "web": ("当てた敵から糸。近くの敵を巻き込む", "重なる"),
    "mine": ("地面に刺さると杭。踏むと爆発", "炸裂と重なる"),
    "twin_spiral": ("2 本が螺旋を描く（各 60%）", "**拡散と重なる**"),
    "light_pillar": ("着弾点に光の柱。中の敵が削れる", "重なる"),
    "brand": ("印を付ける。印の敵を倒すと爆散", "炸裂と重なる"),
    "dice": ("命中ごとに 1〜6 倍（平均は同じ）", "重なる（倍率に掛かる）"),
    "cards": ("3 枚のカードを順に撃つ", "重なる"),
    "cannon": ("溜め切ってしか撃てない（1.5 秒・1.5 倍）。着弾で大爆発", "炸裂を上書き"),
    "pierce_line": ("後ろの敵へ貫通（−20%・最大数あり）", "**貫通を上書き**"),
    "enchant_luck": ("エンチャントが付きやすい", "重なる"),
    "starfall": ("着弾地点に星が降る（落ちるたびに削る）", "重なる"),
    "time_stop": ("当てた敵の時間が止まる（短時間）", "スタンと重なる（長いほうが残る）"),
    "root": ("その場に縫い止める", "スタンと重なる"),
    "echo": ("0.3 秒後、同じ場所にもう 1 発", "重なる"),
    "ward": ("刺さった所に陣。陣の上で撃つと矢が 3 本", "**拡散と重なる**"),
    "homing": ("曲がって追う（−20%）", "追尾を上書き"),
    "kill_echo": ("倒すと、その位置からもう 1 発", "重なる"),
    "meteor": ("溜め切ると空から隕石。広く吹き飛ばす", "炸裂を上書き"),
    "boomerang": ("矢が戻ってくる（往復 2 ヒット）", "重なる"),
    "pull": ("当てた敵を引き寄せる", "重なる"),
    "combo": ("当てるほど +10%（最大 +100%・外すとリセット）", "重なる"),
    "shadow_shot": ("分身が 0.2 秒後に同じ矢を撃つ", "**拡散と重なる**（分身も拡散する）"),
    "quiver": ("当てるたび矢が 1 本増える（最大 3 本・−40%）", "**拡散と重なる**"),
    "dual_element": ("属性が必ず 2 つ付く", "重なる"),
    "blackhole": ("着弾点に黒い球。吸いながら削る", "重なる"),
    "aurora": ("着弾点に光のカーテン（範囲・持続）", "重なる"),
}
