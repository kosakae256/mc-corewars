# 調査: マップのブロックを「壊せないオリジナルブロック」に置き換えられるか

2026-08-24 / 対象 `@minecraft/server` 2.9.0 / Minecraft BE 1.26.44

## 何を知りたかったか

マップに使われているブロックを、**見た目は同じで、壊せない独自ブロック**
（`map_parts_*`）に置き換えたい。

> **なぜ独自ブロックなのか。**
> Core Wars では**プレイヤーが橋としてブロックを置く**。
> それは壊せなければならない。
> つまり「マップの一部か、誰かが置いたものか」を区別する必要がある。
> **ブロックの種類そのもので区別できれば、状態を持たずに済む。**
> （[game/02-map.md] の「ブロックが正」と同じ考え方）

---

## 1. 結論

**全部はできない。3つに分かれる。**

| 分類 | 数 | 置き換え |
| --- | --- | --- |
| **立方体** | 20 種 | **できる。** 手間も小さい |
| **形を持つ** | 7 種 | **できるが重い。** モデルを自作する必要がある |
| **機能を持つ** | チェスト等 | **できない。** 別の手段で守る |

---

## 2. マップで実際に使われているブロック（実測）

構造物ファイルのパレットから数えた。**27 種**。

### 2-1. 立方体（20 種）— 置き換えられる

```
andesite            deepslate_tiles     oak_planks
cobblestone         moss_block          polished_andesite
dark_oak_planks     mossy_stone_bricks  spruce_planks
deepslate_bricks    oak_log             stone
                    spruce_log          stone_bricks
```

加えて、**用途が特別なもの**（下記 4 章）:

```
diamond_block  emerald_block  gold_block  iron_block   ジェネレータの目印
white_concrete                                         コア
light_blue_concrete                                    リスポーン地点の目印
```

### 2-2. 形を持つ（7 種）— 重い

```
oak_stairs  stone_stairs  oak_fence  glass_pane  vine  lantern  spruce_leaves
```

---

## 3. 分かったこと

### 3-1. テクスチャはバニラのものを流用できる（確認済み）

**テクスチャファイルを複製する必要はない。**

独自ブロックの `minecraft:material_instances` で、
バニラが使っているテクスチャのキーをそのまま指定すればよい。

```json
"minecraft:geometry": "minecraft:geometry.full_block",
"minecraft:material_instances": {
  "*": { "texture": "cobblestone" }
}
```

キーは `reference/bedrock-samples/resource_pack/blocks.json` に載っている。
そこから各ブロックのキーを機械的に引ける。実例:

| ブロック | テクスチャのキー |
| --- | --- |
| `andesite` | `andesite` |
| `oak_planks` | `oak_planks` |
| `oak_log` | `{down: oak_log_top, side: oak_log_side, up: oak_log_top}` |

**丸太のように面ごとに違うものも、そのまま書ける。**

### 3-2. 立方体以外は、モデルを自作するしかない（確認済み）

Mojang が用意している組み込みモデルは **`minecraft:geometry.full_block` のみ**。

> 出典: `reference/bedrock-wiki/docs/blocks/vanilla-block-models.md`
> 「custom blocks are unable to make use of vanilla block shapes」

つまり**階段・柵・板ガラス・ツタ・ランタンの形は、自分で作る**ことになる。

さらに悪いことに、形だけの問題ではない。

| 失うもの | 中身 |
| --- | --- |
| **置いたときの向き** | 階段は置く向き・上下反転で 8 通り。全部 permutation で書く |
| **繋がる挙動** | 柵と板ガラスは隣と繋がる。**バニラの柵とは繋がらない** |
| **葉の描画** | 半透明・カリング・色付けの設定が要る |
| **ツタ** | 面に貼り付く挙動そのものを再現できない |

**7 種のために、相当な量の JSON を書くことになる。**

### 3-3. 機能を持つブロックは置き換えられない（確定）

**チェスト・エンダーチェストは独自ブロックにできない。**
独自ブロックに「中に物を入れる」機能を持たせる手段が無い。

同じ理由で、置き換えられないもの:

- チェスト（チーム共有・[game/01-rules.md] で「表に置く」と決めた）
- エンダーチェスト
- ショップの入口（NPC や仕掛けを使うなら、それも）

**これらは別の手段で守る必要がある。**

### 3-4. 壊せなくする指定（未確認あり）

```json
"minecraft:destructible_by_mining": false
```

> 公式の説明:「If set to false, this block is indestructible by mining.」

**未確認: クリエイティブなら壊せるのか。**

公式にもコミュニティ資料にも、クリエイティブでの挙動が書かれていない。
バニラの岩盤はクリエイティブで壊せるが、
**独自ブロックで同じになるかは実機で確かめるしかない。**

> 「クリエイティブでないと壊せない」という要件を満たすかは、
> **ここが確かめられるまで断言しない。**

### 3-5. オペレーターだけ壊せるようにする（できる）

`@minecraft/server` 2.9.0 に権限を見る手段がある。

```ts
import { world, PlayerPermissionLevel } from "@minecraft/server";

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (ev.player.playerPermissionLevel === PlayerPermissionLevel.Operator) return;
  if (!ev.block.typeId.startsWith("kit:map_parts_")) return;
  ev.cancel = true;
});
```

**これは 3-4 と独立して効く。**
ブロック側で壊せなくしなくても、スクリプトで止められる。

そして**チェストのように置き換えられないものも、これなら守れる。**

---

## 4. 置き換えてはいけないブロック

**見た目が同じでも、役割が違うものがある。**

| ブロック | 役割 | 置き換え |
| --- | --- | --- |
| `white_concrete` | **コア** | **絶対に守らない。** 壊すことが目的 |
| `iron/gold/diamond/emerald_block` | **ジェネレータの目印** | 置き換えるなら**検出側も直す**（[game/02-map.md]） |
| `light_blue_concrete` | リスポーン地点の目印 | 同上 |

> **コアを守ってしまうとゲームが成立しない。** ここは明確に外す。

---

## 5. 現実的な進め方（提案）

**全部を独自ブロックにしない。手間と効果が釣り合わない。**

| 対象 | 手段 |
| --- | --- |
| 立方体 20 種 | **独自ブロック `map_parts_*`。** テクスチャはバニラ流用 |
| 形を持つ 7 種 | **バニラのまま + スクリプトで保護** |
| チェスト等 | **バニラのまま + スクリプトで保護** |
| コア・目印 | **何もしない**（壊せる／検出に使う） |

### なぜこの分け方か

**独自ブロックの価値は「マップか、誰かが置いたか」の区別にある。**

立方体 20 種は**マップの大半の体積**を占める。ここを独自ブロックにすれば、
「プレイヤーが置いた石は壊せる／マップの石は壊せない」が
**状態を持たずに成立する。**

一方、階段や柵は**数が少なく、プレイヤーが同じものを置く場面も少ない。**
モデルを自作する労力に見合わない。

### 保護の判定（スクリプト側）

```
壊そうとしたブロックが…
  kit:map_parts_* か          → オペレーター以外は不可
  マップの範囲内のバニラか     → オペレーター以外は不可（階段・チェスト等）
  それ以外（プレイヤーが置いた）→ 壊せる
```

**「マップの範囲内」は座標で判定できる。**
島は 3 つしかなく、位置は [game/02-map.md] で確定している。

---

## 6. 次に確かめること

1. **`destructible_by_mining: false` はクリエイティブで壊せるか**（実機）
2. `/setblock` と `/structure load` で独自ブロックを置けるか
3. 独自ブロック 20 種を含む構造物が、そのまま読み込めるか
4. 爆発耐性（`minecraft:destructible_by_explosion`）も要るか

---

## 7. まだ決まっていないこと

- 独自ブロックを **`kit`** に入れるか **`game`** に入れるか
  （`kit` は完成品に同梱しない前提なので、**`game` が妥当**に見える）
- 名前空間（`game:map_parts_stone` か、別の付け方か）
- プレイヤーが `map_parts_*` を**入手できてしまう**と困る。
  クリエイティブの持ち物一覧から隠すか
