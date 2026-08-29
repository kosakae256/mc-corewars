"""武器の仕様書を、一覧から書き出す。

    python tools/pve-weapons-doc.py

**出どころは `tools/pve_weapon_table.py`。**
手で表を書くと、**48 本ぶんのどこかが必ずずれる。**

書き出し先: `worlds/pve/docs/spec/19-weapons.md`
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_weapon_table import ABILITIES, TRAILS, weapons  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "worlds", "pve", "docs", "spec", "19-weapons.md",
)

MAT_JP = {"wood": "木", "steel": "鋼", "crystal": "水晶", "bone": "骨", "dark": "黒鉄"}
DECOR_JP = {"none": "無し", "studs": "鋲", "stars": "星", "runes": "刻印", "gems": "宝石"}
RARITY_JP = {"common": "common", "uncommon": "uncommon", "rare": "rare", "legendary": "legendary"}
SHAPE_JP = {
    "plain": "素直な弧",
    "recurve": "反り返り",
    "sharp": "鋭い",
    "thin": "細身",
    "heavy": "肉厚",
    "long": "伸びた弧",
    "split": "二又",
}


def hue_name(h: int) -> str:
    table = [
        (15, "赤"), (40, "橙"), (65, "黄"), (95, "黄緑"), (150, "緑"),
        (185, "青緑"), (210, "空"), (245, "青"), (280, "紫"), (320, "桃"), (360, "赤"),
    ]
    for limit, name in table:
        if h <= limit:
            return name
    return "赤"


def main() -> int:
    ws = weapons()
    lines = []
    add = lines.append

    add("# 仕様: Archer の武器 48 本")
    add("")
    add("下書きは [drafts/archer-weapons.md](../drafts/archer-weapons.md)、")
    add("見せ方の決まりは [13-bow-view.md](13-bow-view.md)、")
    add("追加ダメージの表は [14-effect.md](14-effect.md)。")
    add("")
    add("> ### この表は書き出したもの。**手で直さない。**")
    add(">")
    add("> 出どころは `tools/pve_weapon_table.py`。")
    add("> **直したらもう一度走らせる**（`python tools/pve-weapons-doc.py`）。")
    add("")
    add("**mythic の 2 本はまだ作らない**（下書き 6 章）。")
    add("")
    add("## 1. 何を 1 本ごとに持つか")
    add("")
    add("| | 決まり |")
    add("| --- | --- |")
    add("| **絵** | **4 段（構え・引き 0/1/2）** ＋ 光るものは**きらめき 2 枚**。64x64 |")
    add("| **形** | **弓ごとに変える。** ただし**角度と大きさは変えない**（持ち姿がぶれる） |")
    add("| **放つ音** | **バニラ共通**（`random.bow`）。**ここは変えない** |")
    add("| **軌跡の粒** | 5 種類から選ぶ（[4 章](#4-軌跡の粒は-5-種類から選ぶ)） |")
    add("| **軌跡の音** | **特別な弓だけ。** 無ければ鳴らさない |")
    add("| **固有能力の音** | **能力があるものだけ**（当たった瞬間・発動した瞬間） |")
    add("")
    add("## 2. 一覧")
    add("")
    add("| # | 名前 | 段 | 基礎 | ため | 固有能力 | 素材/色/飾り | 形 | 軌跡 | 軌跡の音 | 能力の音 |")
    add("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for w in ws:
        ab = ABILITIES.get(w["ability"], ("？", "？"))[0]
        full = f'{w["full"] / 20:.2f}'.rstrip("0").rstrip(".") + " 秒"
        mat = f'{MAT_JP[w["mat"]]}・{hue_name(w["hue"])}・{DECOR_JP[w["decor"]]}'
        ts = w["tsound"].replace("pve.", "") if w["tsound"] else "—"
        as_ = w["asound"].replace("pve.", "") if w["asound"] else "—"
        add(
            f'| {w["num"]} | **{w["name"]}** | {RARITY_JP[w["rarity"]]} | {w["base"]} | {full} '
            f'| {ab} | {mat} | {SHAPE_JP[w["shape"]]} | {w["trail"]} | {ts} | {as_} |'
        )
    add("")
    add("## 3. 固有能力の型")
    add("")
    add("**48 本を 48 通りに書かない。** **型に分けて、数値だけ変える。**")
    add("")
    add("| 型 | 何が起きるか | **エンチャントと重なったら** | いま |")
    add("| --- | --- | --- | --- |")
    # **仕組みが無くて中身を入れられないもの**（`docs/spec/19-weapons.md` 5 章）
    waiting = {"more_drops": "落とし物の仕組み待ち（見た目だけ）",
               "enchant_luck": "エンチャント本体待ち（見た目だけ）",
               "heal_ally": "味方が居ないので回復先が無い"}
    for key, (what, stack) in ABILITIES.items():
        add(f"| `{key}` | {what} | {stack} | {waiting.get(key, '**入っている**')} |")
    add("")
    add("### 3-1. 固有能力とエンチャントの優先順位")
    add("")
    add("> ### 同じことをするなら、**固有能力が勝つ。**")
    add("")
    add("| 場合 | どうなるか |")
    add("| --- | --- |")
    add("| **同じこと**（貫通の弓に貫通のエンチャント） | **固有能力だけが働く。** エンチャントは意味を持たない |")
    add("| **重ねられること**（拡散の弓に拡散のエンチャント） | **掛け合わせる。** 2 本 × 5 本 ＝ 10 本 |")
    add("| **別のこと** | **両方働く** |")
    add("")
    add("**重ねてよいかは、型ごとに上の表へ書く。**")
    add("**書いていないものは重ねない**——迷ったら弱いほうへ倒す。")
    add("")
    add("## 4. 軌跡も音も、1 本ごとに 1 つ")
    add("")
    add("> ### 5 種類の使い回しをやめた（2026-08-29）")
    add(">")
    add("> **「弓ごとに違う」と書いておきながら、粒は 5 種類・音は 2 種類を回していた。**")
    add("> **48 本ぶん作る。** 手では無理なので、**一覧から書き出す。**")
    add("")
    add("| 何 | いくつ | 作る道具 |")
    add("| --- | --- | --- |")
    add("| 軌跡の粒 | **48**（`pve:trail_<key>`） | `tools/pve-trails.py` |")
    add("| 軌跡の音 | **48**（`pve.trail.<key>`） | `tools/pve-weapon-sounds.py` |")
    add("| 能力の音 | **48**（`pve.ability.<key>`） | 同上 |")
    add("")
    add("**何で差が出るか。**")
    add("")
    add("| 元 | 粒 | 音 |")
    add("| --- | --- | --- |")
    add("| `hue` | **色**（芯は明るく、尾は濃く） | **高さ**（色の輪をそのまま音階に写す） |")
    add("| `mat` | **形**（木＝太い筋 / 鋼＝細く長い / 水晶＝尖る / 骨＝丸い / 黒鉄＝煙） | **音色**（鈍い・金属・澄む・掠れる・低い） |")
    add("| `base` | **太さ**（重い弓ほど太い） | **重さ**（強い弓ほど低い） |")
    add("| `rarity` | **残る長さ** | 長さ |")
    add("| `ability` | **癖**（爆ぜる＝膨らむ / 貫く＝伸びる / 拡散＝短い） | **癖**（爆ぜる・抜ける・溜める・散る・歪む） |")
    add("")
    add("**放つ音だけは共通**（バニラの `random.bow`）——")
    add("**そこまで変えると、弓を撃った感じそのものが薄くなる**（[13-bow-view.md](13-bow-view.md) 3-1）。")
    add("")
    add("## 5. 実装の決まり")
    add("")
    add("**48 本ぶんの落とし穴を、同じところで踏まないための決まり。**")
    add("")
    add("| 決まり | なぜ |")
    add("| --- | --- |")
    add("| **能力から撃った矢は、着弾の能力を動かさない**（`depth`） | **跳弾が跳弾を呼んで止まらなくなる** |")
    add("| **遅らせて動かすものは `safe()` で包む** | `runTimeout` の中で投げると**その輪ごと止まる** |")
    add("| **倍率は足し算**（跳弾の +50% など） | 掛け算だと**3 回目で 3.4 倍**になる |")
    add("| **外したときだけ `onMiss`** | 当たった数を数えてから呼ぶ（連撃が毎回切れていた） |")
    add("| **数を撃つ弓は線を粗く**（`trailStep`） | 速射は毎 tick 撃つので**粒が溢れる** |")
    add("| **同じ道具は `abilities/util.ts` に集める** | 同じものを 4 か所に写していた |")
    add("| **能力の登録は混ぜる**（上書きしない） | 撃ち方と当たり方が別ファイルなので、**後勝ちで消えていた** |")
    add("")
    add("## 6. まだ無いもの")
    add("")
    add("- **mythic 2 本**（下書き 6 章）")
    add("- **エンチャント本体**（[drafts/archer-enchants.md](../drafts/archer-enchants.md)）")
    add("- 未鑑定の見た目")
    add("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"書いた: {OUT}  （{len(ws)} 本 / {len(ABILITIES)} 型）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
