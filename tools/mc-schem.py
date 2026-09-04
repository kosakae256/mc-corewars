"""WorldEdit の `.schem`（Sponge Schematic）を読んで、ブロックの並びにする。

    python tools/mc-schem.py <入力.schem> --ts <出力.ts>

## なぜ扱えるか

`.schem` は **gzip で固めた NBT**。**外部ライブラリ無しで読める**
（NBT は素朴な形式なので、読み手をここに書いた）。

## Java の名前 → Bedrock の名前

中身は **Java 版のブロック名**（`minecraft:oak_planks[facing=north]`）。
**Bedrock とは名前が違うものがある**ので、`JAVA_TO_BEDROCK` で読み替える
（`bricks` → `brick_block` など。**`reference/bedrock-samples` で存在を確かめている**）。

**状態（`[facing=north]`）は落とす**——階段の向きは別途こちらで決める。
"""

import argparse
import gzip
import io
import json
import os
import struct
import sys

# ---------------------------------------------------------------- NBT

TAG_END, TAG_BYTE, TAG_SHORT, TAG_INT, TAG_LONG = 0, 1, 2, 3, 4
TAG_FLOAT, TAG_DOUBLE, TAG_BYTE_ARRAY, TAG_STRING = 5, 6, 7, 8
TAG_LIST, TAG_COMPOUND, TAG_INT_ARRAY, TAG_LONG_ARRAY = 9, 10, 11, 12


class Reader:
    """**ビッグエンディアンで前から読む**だけの、素朴な読み手"""

    def __init__(self, data):
        self.d = data
        self.i = 0

    def take(self, n):
        v = self.d[self.i : self.i + n]
        self.i += n
        return v

    def u1(self):
        return self.take(1)[0]

    def i2(self):
        return struct.unpack(">h", self.take(2))[0]

    def i4(self):
        return struct.unpack(">i", self.take(4))[0]

    def i8(self):
        return struct.unpack(">q", self.take(8))[0]

    def f4(self):
        return struct.unpack(">f", self.take(4))[0]

    def f8(self):
        return struct.unpack(">d", self.take(8))[0]

    def string(self):
        n = struct.unpack(">H", self.take(2))[0]
        return self.take(n).decode("utf-8", "replace")

    def value(self, t):
        if t == TAG_BYTE:
            return self.u1()
        if t == TAG_SHORT:
            return self.i2()
        if t == TAG_INT:
            return self.i4()
        if t == TAG_LONG:
            return self.i8()
        if t == TAG_FLOAT:
            return self.f4()
        if t == TAG_DOUBLE:
            return self.f8()
        if t == TAG_BYTE_ARRAY:
            return self.take(self.i4())
        if t == TAG_STRING:
            return self.string()
        if t == TAG_LIST:
            et = self.u1()
            n = self.i4()
            return [self.value(et) for _ in range(n)]
        if t == TAG_COMPOUND:
            out = {}
            while True:
                nt = self.u1()
                if nt == TAG_END:
                    return out
                # **名前を先に読む。**
                # `out[self.string()] = self.value(nt)` と書くと、
                # **Python は右辺を先に評価する**ので、読む順が逆になる（2026-08-31 に踏んだ）
                key = self.string()
                out[key] = self.value(nt)
        if t == TAG_INT_ARRAY:
            n = self.i4()
            return [self.i4() for _ in range(n)]
        if t == TAG_LONG_ARRAY:
            n = self.i4()
            return [self.i8() for _ in range(n)]
        raise ValueError("unknown tag %d" % t)


def read_nbt(path):
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    r = Reader(raw)
    t = r.u1()
    name = r.string()
    return name, r.value(t)


# ---------------------------------------------------------------- 名前の読み替え
#
# **Java と Bedrock で違うものだけ**書く（同じものは素通り）。

JAVA_TO_BEDROCK = {
    "bricks": "brick_block",
    "terracotta": "hardened_clay",
    "grass_block": "grass",
    "dirt_path": "grass_path",
    "cobweb": "web",
    "snow_block": "snow",
    "melon": "melon_block",
    "lily_pad": "waterlily",
    "note_block": "noteblock",
    "smooth_stone_slab": "stone_block_slab",
    "oak_sign": "standing_sign",
    "oak_wall_sign": "wall_sign",
    "beetroots": "beetroot",
    "nether_quartz_ore": "quartz_ore",
    "mycelium": "mycelium",
    "sugar_cane": "reeds",
    "wheat": "wheat",
    "tripwire": "tripWire",
    "rose_bush": "double_plant",
    "peony": "double_plant",
    "lilac": "double_plant",
    "sunflower": "double_plant",
    "tall_grass": "double_plant",
    "large_fern": "double_plant",
    "dandelion": "yellow_flower",
    "poppy": "red_flower",
    "blue_orchid": "red_flower",
    "allium": "red_flower",
    "azure_bluet": "red_flower",
    "oxeye_daisy": "red_flower",
    "cornflower": "red_flower",
    "lily_of_the_valley": "red_flower",
    "fern": "tallgrass",
    "grass": "short_grass",
    "wall_torch": "torch",
    "soul_wall_torch": "soul_torch",
    "redstone_wall_torch": "redstone_torch",
}


def to_bedrock(name):
    """`minecraft:oak_planks[facing=north]` → `oak_planks`"""
    n = name.split("[")[0]
    if ":" in n:
        n = n.split(":", 1)[1]
    return JAVA_TO_BEDROCK.get(n, n)


def varints(data):
    """`BlockData` は**可変長の整数が詰まった並び**"""
    out = []
    i = 0
    while i < len(data):
        v = 0
        shift = 0
        while True:
            b = data[i]
            i += 1
            v |= (b & 0x7F) << shift
            if not (b & 0x80):
                break
            shift += 7
        out.append(v)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("schem")
    ap.add_argument("--ts", help="パックへ持っていく TypeScript を書き出す先")
    ap.add_argument("--json", help="ブロックの一覧を JSON で書き出す先")
    ap.add_argument("--info", action="store_true", help="中身を見るだけ")
    args = ap.parse_args()

    _, root = read_nbt(args.schem)
    # v3 は `Schematic` の下、v2 は直下
    body = root.get("Schematic", root)
    w = body["Width"]
    h = body["Height"]
    l = body["Length"]
    print("大きさ %d x %d x %d（幅 x 高さ x 奥行き）" % (w, h, l))

    # **v3 は `Blocks` の下、v2 は直下**（`Palette` / `BlockData`）
    blocks = body.get("Blocks")
    if isinstance(blocks, dict):
        palette = blocks.get("Palette")
        data = blocks.get("Data")
    else:
        palette = body.get("Palette")
        data = body.get("BlockData")
    if palette is None or data is None:
        print("読めない形式。中身:", list(body.keys()))
        return 1

    # palette は「名前 → 番号」。番号から引けるように裏返す
    by_id = {}
    for name, idx in palette.items():
        by_id[idx] = name
    print("種類 %d" % len(by_id))

    ids = varints(bytes(data) if not isinstance(data, bytes) else data)
    print("ブロック %d（空気を含む）" % len(ids))

    if args.info:
        from collections import Counter
        c = Counter(to_bedrock(by_id[i]) for i in ids if i in by_id)
        for name, n in c.most_common(25):
            print("  %-32s %d" % (name, n))
        return 0

    # 並びは **Y → Z → X の順**（Sponge Schematic）
    out = []
    for i, pid in enumerate(ids):
        name = by_id.get(pid)
        if name is None:
            continue
        b = to_bedrock(name)
        if b == "air" or b == "cave_air" or b == "void_air":
            continue
        y = i // (w * l)
        z = (i % (w * l)) // w
        x = i % w
        out.append((x, y, z, b))
    print("置くブロック %d" % len(out))

    if args.json:
        with io.open(args.json, "w", encoding="utf-8") as f:
            json.dump({"size": [w, h, l], "blocks": [{"x": a, "y": b2, "z": c, "b": d} for a, b2, c, d in out]}, f)
        print("書き出し:", args.json)

    if args.ts:
        names = sorted({b for _, _, _, b in out})
        idx = {n: i for i, n in enumerate(names)}
        rows = ",".join("[%d,%d,%d,%d]" % (x, y, z, idx[b]) for x, y, z, b in out)
        name = os.path.splitext(os.path.basename(args.ts))[0]
        lines = [
            "/**",
            " * %s。**`.schem` から取り込んだブロックの並び。**" % name,
            " *",
            " * `tools/mc-schem.py` が書き出す。**手で直さない。**",
            " */",
            "",
            'import type { VoxelModel } from "./simple.js";',
            "",
            "export const %s: VoxelModel = {" % name,
            "  size: [%d, %d, %d]," % (w, h, l),
            "  palette: %s," % json.dumps(names),
            "  blocks: [%s]," % rows,
            "};",
            "",
        ]
        with io.open(args.ts, "w", encoding="utf-8") as f:
            f.write(chr(10).join(lines))
        print("書き出し:", args.ts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
