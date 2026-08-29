"""エンチャントの仕様書を、一覧から書き出す。

    python tools/pve-enchants-doc.py

**出どころは `tools/pve_enchant_table.py`。**
書き出し先: `worlds/pve/docs/spec/20-enchants.md`
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_enchant_table import AXIS, enchants  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "worlds", "pve", "docs", "spec", "20-enchants.md",
)

SCOPE_JP = {"common": "共通", "bow": "弓"}


def main() -> int:
    es = enchants()
    lines = []
    add = lines.append

    add("# 仕様: エンチャント 26 種")
    add("")
    add("下書きは [drafts/archer-enchants.md](../drafts/archer-enchants.md)、")
    add("共通のものは [03-content.md](../03-content.md) 2-1、")
    add("武器の固有能力は [19-weapons.md](19-weapons.md)。")
    add("")
    add("> ### この表は書き出したもの。**手で直さない。**")
    add(">")
    add("> 出どころは `tools/pve_enchant_table.py`。")
    add("> **直したらもう一度走らせる**（`python tools/pve-enchants-doc.py`）。")
    add("")
    add("## 1. 段（グレード）")
    add("")
    add("**エンチャントには段がある。** 段が上がるほど効きが強い。")
    add("")
    add("| | |")
    add("| --- | --- |")
    add("| 段の幅 | **1〜5**。ものによって上限が違う（下の表の「段」） |")
    add("| 効き方 | **段に比例**（強撃 段 3 なら +60%） |")
    add("| 表し方 | 説明欄に `✦ 強撃 III`（ローマ数字） |")
    add("| いくつ付くか | **上限は決めていない**（付け方の仕組みがまだ無い） |")
    add("")
    add("**1 つの弓に同じエンチャントは 1 つだけ**——段が上がるだけ。")
    add("")
    add("## 2. 一覧")
    add("")
    add("| 名前 | どこに | 段 | 軸 | 何が起きるか | いま |")
    add("| --- | --- | --- | --- | --- | --- |")
    for e in es:
        note = e["note"] or "**入っている**"
        add(
            f'| **{e["name"]}** | {SCOPE_JP[e["scope"]]} | 1〜{e["max"]} | `{e["axis"]}` '
            f'| {e["what"]} | {note} |'
        )
    add("")
    add("## 3. 固有能力との重なり")
    add("")
    add("> ### 同じことをするなら、**固有能力が勝つ。**")
    add(">")
    add("> 貫通の弓に貫通のエンチャントを付けても、**固有能力の貫通しか働かない。**")
    add("> **ただし拡散だけは掛け合わせる**——2 本の弓に 5 発の拡散で **10 本。**")
    add("")
    add("**判断は「軸」で行う。** 同じ軸を武器が持っているかどうかだけを見る。")
    add("")
    add("| 軸 | 何を動かすか | 重なり |")
    add("| --- | --- | --- |")
    for key, (what, how) in AXIS.items():
        add(f"| `{key}` | {what} | {how} |")
    add("")
    add("**武器の側は「どの軸を自分が持っているか」を書く**（`Ability.owns`）。")
    add("**書いていない軸は、エンチャントがそのまま働く。**")
    add("")
    add("## 4. どこに持つか")
    add("")
    add("| | |")
    add("| --- | --- |")
    add("| 置き場所 | **その 1 本**（アイテムの動的プロパティ `pve:enchants`） |")
    add("| 形 | `power:3,pierce:1`（名前と段を `:` で繋ぎ、`,` で並べる） |")
    add("| 表示 | **説明欄**（[18-item-view.md](18-item-view.md) 2 章） |")
    add("")
    add("**属性と同じ持ち方**（[17-element.md](17-element.md) 1 章）——")
    add("**持ち替えても、落としても、その 1 本に付いて回る。**")
    add("")
    add("## 5. 付け方（いまは試験用）")
    add("")
    add("**拾ったときに付く仕組みはまだ無い。** 手で付けるコマンドだけ先に作る。")
    add("")
    add("```")
    add("/pve:ench power 3      手に持っているものに強撃 III")
    add("/pve:ench spread       段を書かなければ 1")
    add("/pve:ench power 0      その 1 つを外す")
    add("/pve:ench clear        全部外す")
    add("/pve:ench list         付けられる名前を並べる")
    add("```")
    add("")
    add("## 6. 気をつけるところ")
    add("")
    add("**下書き 2-2 の心配ごとに、いまどう答えているか。**")
    add("")
    add("| 心配 | いまの答え |")
    add("| --- | --- |")
    add("| **炸裂・連鎖 × 速射弓** | **爆ぜるのは与ダメの割合**なので、1 発が軽い速射では小さくなる |")
    add("| **群狼が常時発動** | **上限 +30%**。数えるのは半径 8 マスまで |")
    add("| **孤高がパーティ遊びとぶつかる** | **効きを小さく**（段 × 12%）。離れる利点を作りすぎない |")
    add("| **矢継ぎ早 × 速射弓** | 速射弓は**ためが無い**ので、**そもそも効かない**（軸が同じ） |")
    add("| **貫魔で演出がうるさい** | **1 発に 1 回だけ**。属性ごとの粒は 0.5 秒に 1 回までにしてある |")
    add("")
    add("## 7. まだ無いもの")
    add("")
    add("- **拾ったときに付く**（レア度ごとの確率・[03-content.md](../03-content.md) 2 章）")
    add("- **クリティカル**（クリティカルヒットが待っている）")
    add("- **落とし物と経験**（採掘者・本の虫が待っている）")
    add("- **味方**（光の射手・連携・孤高が待っている。いま人に当たるのは癒しの弓だけ）")
    add("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"書いた: {OUT}  （{len(es)} 種）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
