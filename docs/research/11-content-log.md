# 調査: コンテンツログに出るエラーの読み分け

**2026-08-25 に調べた。** Minecraft 1.26.44、`@minecraft/server` 2.9.0。

## なぜ書くか

**コンテンツログには、自分のパックのせいではない行が混ざる。**

全部直そうとすると、直せないものを追い続けることになる。
**「これは自分のせいか」を先に判定する**ための記録。

---

## 1. 出ていた行と、その正体

| 行 | 出どころ | どうしたか |
| --- | --- | --- |
| `Trying to add an invalid classic skin. Skin asset is missing from ...` | **開発機に入っているスキンパック** | 触らない |
| `game:shopkeeper ... Locator: model already has a locator armor_offset.default_neck ...` | **バニラの `geometry.villager_v2`** | 触らない（下記 3） |
| `game:pillar_blue / pillar_red: trying to override the Geometry component with blocks.json settings` | **こちらの `blocks.json`** | **直した**（下記 2） |
| `particles/balloon_gas.json | variable.direction.x ...` | **バニラのパーティクル** | 触らない（下記 4） |

---

## 2. `blocks.json` で独自ブロックの見た目を書いてはいけない

```
[Blocks][warning]-game:pillar_blue: trying to override the Geometry component with
blocks.json settings for a custom block. This isn't supported.
Please remove any legacy texture definition or block shape specification for this block.
```

### 何が起きていたか

`blocks.json` に**`textures` を書いていた。**

```jsonc
// リソースパック側 blocks.json（悪い例）
"game:pillar_red": {
  "textures": "game_pillar_red",   // ← これ
  "sound": "slime"
}
```

独自ブロックの見た目は**ビヘイビアーパック側の `minecraft:material_instances`** で決まる。
`blocks.json` の `textures` は**バニラブロックを差し替えるための古い仕組み**で、
独自ブロックに書くと「ジオメトリを上書きしようとしている」と見なされる。

### 直し方

**`textures` を消し、`sound` だけ残す。**

```jsonc
"game:pillar_red": {
  "sound": "slime"
}
```

`sound` は独自ブロックでもここで指定してよい。
実際、同じファイルの `game:map_parts_*` は `sound` だけなので警告が出ていない。

> **見た目の定義が 2 箇所にある状態だった。**
> 片方を消しても見た目は変わらない（BP 側が正）。

---

## 3. villager のロケーター重複は、こちらでは直せない

```
[Geometry][error]-game:shopkeeper | game:shopkeeper | Locator: Error:
model already has a locator armor_offset.default_neck that doesn't exactly match
the one wanting to be added - skipping new definition in default(geometry.villager_v2)
```

### 調べたこと

- こちらのリソースパックは**モデルを 1 つも同梱していない**（`models/` が無い）
- `resource_packs/game/entity/shopkeeper.entity.json` は
  **バニラの `villager_v2.entity.json` とほぼ同一**
  （違うのは `identifier`、`spawn_egg` 無し、`render_controllers` から
  `villager_v3_level` を外していることの 3 点だけ）
- `geometry.villager_v2` を宣言しているのは**バニラの 1 ファイルだけ**

つまり**重複しているロケーターはバニラのモデルの中にある。**
差し替えるにはバニラのモデルを丸ごと持ち込むことになり、
**villager の見た目全部を自分たちで抱える**ことになる。

### 害があるか

**無い。** `skipping new definition` と書いてある通り、
**新しいほうを捨てて、既にあるほうを使い続ける。**

`armor_offset.*` は防具の位置合わせ用で、店主に防具は着せない。

> **直せないものを直そうとしない。**
> バニラ由来だと分かった時点で、追うのをやめる。

---

## 4. `balloon_gas.json` はこちらのファイルではない

```
[Molang][error]-particles/balloon_gas.json | variable.direction.x |
Error: unable to find member variable .x
```

`balloon_gas.json` は**バニラのパーティクル**（風船。Education 由来）。
こちらのリソースパックに `particles/` は無い。

`variable.direction` に `.x` を読ませているが、
**`variable.direction` はベクトルとして定義されていない**——バニラ側の書き間違い。

**ワールドを開くと必ず出る。** こちらの動作には関係しない。

---

## 5. 判定のしかた

**識別子の頭を見る。**

| 頭 | |
| --- | --- |
| `game:` / `kit:` | **こちらのもの。** 直す |
| `minecraft:` / 名前空間なし | バニラ。触らない |
| ファイル名だけ（`particles/...`） | **そのファイルが自分のパックにあるか探す。** 無ければバニラ |

探す前に `find`。**記憶で判断しない。**

---

## 6. おまけ: `DebugText` の向きは yaw が逆（2026-08-25 実測）

`useRotation` を立てると、`rotation`（[Pitch, Yaw, Roll]）で向きが決まる。

| | |
| --- | --- |
| エンティティの yaw | **0 が +z**（南を向く） |
| `DebugText` の yaw | **0 が −z** |

**逆。** ドキュメントに基準が書かれていないので、置いて見るまで分からない。

`+z` を向かせたければ **`rotation.y = 180`**。

---

## 7. 自分で出しているバニラのパーティクルが壊れていることがある（2026-08-25）

```
[Molang][error]-particles/balloon_gas.json | variable.direction.x | Error: unable to find member variable .x
[Molang][error]-particles/explosion_death.json | variable.aabb.x ... | Error: unable to find member variable .x
```

**バニラのファイル名が出るので、バニラのせいに見える。**
実際は**こちらが `spawnParticle` で呼び出していた。**

### なぜ壊れるのか

**そのパーティクルは「実体が出すもの」だった。**

| パーティクル | 何を見ているか |
| --- | --- |
| `explosion_death` | `variable.aabb`（**体の大きさ**） |
| `balloon_gas` | `variable.direction`（**風船の向き**） |

実体が出すなら、その実体が値を持っている。
**座標を指して出すと、値がどこにも無い。**

`spawnParticle(id, location)` は**座標に出すもの**なので、
**実体の値を必要とするパーティクルは使えない。**

### 選び方

**そのパーティクルの JSON に `variable.` が出てくるか見る。**

```bash
grep -o 'variable\.[a-zA-Z_.]*' reference/bedrock-samples/resource_pack/particles/<名前>.json | sort -u
```

| 出てくる変数 | 使えるか |
| --- | --- |
| `variable.particle_age` / `particle_lifetime` / `particle_random_*` | **使える。** パーティクル自身が持つ値 |
| `variable.direction` / `aabb` / `velocity` / `acceleration` | **使えない。** 出す側が入れる値 |

### 使えると確かめたもの（1.26.44）

| 用途 | 識別子 |
| --- | --- |
| 細い線・軌跡 | `minecraft:endrod` |
| 爆発（大） | `minecraft:huge_explosion_emitter` |
| 爆発（中） | `minecraft:large_explosion` |
| 手動の爆発 | `minecraft:explosion_manual` |

**`minecraft:explosion_particle` は使えない**（`variable.velocity` を見る）。

---

## 8. バニラのアニメーションコントローラも、こちらの都合で鳴る（2026-08-25）

```
[Molang][error]-data/resource_packs/vanilla_.../villager_v2.animation_controllers.json
| controller.animation.villager_v2.raise_arms | variable.raise_arms | unknown variable
```

**バニラのファイルだが、鳴らしているのはこちらの実体。**

`game:shopkeeper` はバニラの村人の定義をほぼそのまま写していたので、
**取引の身振り（`raise_arms`）まで抱えていた。**
店主は立っているだけなので、その変数は誰も入れない。

### 消してはいけなかった（2026-08-25 修正）

**要らないものを消したら、別の場所が壊れた。**

```
[Animation][error]-Error: can't find animation get_in_bed
```

アニメーションは**コントローラから短い名前で呼ばれている。**
一覧から消すと、**呼んでいる側が見つけられなくなる。**

どれがどれを呼んでいるかは、**バニラのコントローラを読まないと分からない。**
写してきた定義は、**塊として動いている。**

### 直し方: 変数を自分で 0 にする

**構成はバニラのまま戻し、足りない変数だけこちらで入れる。**

```jsonc
"pre_animation": [
  "variable.raise_arms = 0;",   // ← 足した。**店主は取引しない**ので常に 0
  ...
]
```

コントローラは `variable.raise_arms > 0` を見ているだけなので、
**0 を入れておけば、エラーも出ず、動きもしない。**

> **消すより、埋めるほうが安全。**
> 写してきたものの**どこが繋がっているか分からない**うちは、
> 引き算ではなく足し算で直す。
