# 仕様: モブ作りの手引き（1 体目で分かったこと）

**2026-09-08。** **ゾンビ（`pve_v3:grunt`）を 1 体作り切るまでに引っかかった所**を、
**次のモブで引っかからないように**残す。

**[23-enemy-unit.md](23-enemy-unit.md) が「何を決めるか」**、**この文書が「どう作るか」。**

> ### この文書の使い方
>
> **モブを 1 種類作るたびに、ここへ足す。**
> **1 体目で溶かした時間を、2 体目で溶かさないための文書。**
> **10 章に「まだ直っていない所」を並べる。** **1 つずつ片づけて、消していく。**

**目印**:

| | |
| --- | --- |
| **実測** | **ゲーム内で見て確かめた** |
| **推測** | **筋は通っているが、まだ見ていない。** 疑うならここから |

---

## 1. まず「狙ってくれない」で止まる

### 1-1. **ピースフルでは `monster` は動かない**（実測）

**`minecraft:type_family` に `monster` を入れると、難易度ピースフルでプレイヤーを狙わない。**
**湧いてはいる。突っ立っているだけ。**

> **`follow_range` を疑って半日潰した。原因は難易度だった。**
> **「追ってこない」ときは、まず難易度を見る。**

| | |
| --- | --- |
| **採った手** | **`monster` を入れない。** 自前の family（`pve_mob`）＋ `mob` だけ |
| 採らなかった手 | 難易度を上げる——**ワールドの設定に依存してしまう** |

**`monster` を捨てると、バニラの「モンスター向け」の仕掛けも一緒に消える**
（日光で燃える等）。**要るなら個別に足す。**

### 1-2. 索敵の距離は**3 か所**に書く（実測）

**どれか 1 つ欠けると、そこで頭打ちになる。**

```json
"minecraft:follow_range": { "value": 100, "max": 100 },
"minecraft:behavior.nearest_attackable_target": {
  "within_radius": 100,
  "entity_types": [ { "max_dist": 100, "must_see": false } ]
}
```

| | 効き方 |
| --- | --- |
| **`minecraft:follow_range`** | **本当の上限。** これが小さいと、他をいくら大きくしても届かない |
| **`within_radius`** | その行動が探しに行く半径 |
| **`max_dist`**（`entity_types` の中） | **相手ごとの距離。** ここも要る |

**`must_see: false` で壁越しに追う。** **`true` だと、見えた相手しか狙わない。**

### 1-3. **クリエイティブを殴らせない**（実測）

```json
"none_of": [ { "test": "has_ability", "subject": "other", "value": "instabuild" } ]
```

**これで creative は狙われない。** **スペクテイターは、これでは弾けない**——
**script 側（`services/melee.ts`）で `GameMode` を見て弾く。**

### 1-3-1. **script 側にも同じ縛りが要る**（**踏んだ**・2026-09-10）

**ビヘイビアの `nearest_attackable_target` に `instabuild` の除外を書いても、
それはバニラのゴールが狙う相手を選ぶときだけ。**
**弾を撃つ相手・爆発に巻き込む相手を選んでいるのは script。**

> **クリエイティブで立っていたら、散弾もボマーも普通に撃ってきた。**

**守る所は 2 つ**:

| | |
| --- | --- |
| **相手を選ぶとき** | **`hittable()`**（`services/mobaim.ts`）——**`has()` だけでは足りない。** **`has()` は「HP を持っているか」で、クリエイティブでも真** |
| **当てるとき** | **`hit()`**（`services/combat.ts`）——**全部のダメージが通る 1 か所。後から足した攻撃も守られる** |

**入れた所**: `traits.ts` の `nearest`／`sweep`／`boom`／`zone`／`throw`／`beam`／`blink`／
`flight`／ボスの弾。

### 1-4. **押し合わないと重なる**（実測）

```json
"minecraft:pushable_by_entity": {},
"minecraft:pushable_by_block": {}
```

**書かないと同じ場所に何体でも重なる。** **空の `{}` でよい。**

---

## 2. **属性は `max` を書く。書かないと `value` が上限**（推測・強い／**2026-09-08 に直した**）

**`minecraft:movement` / `minecraft:health` / `minecraft:follow_range` は「属性」で、
`value`（初期値）と `max`（上限）を持つ。**
**公式の説明では `max` の既定は "not set"。**
**実際には `value` がそのまま上限になる**ので、
**script から `setCurrentValue()` で上へ動かしても、上限で止まる。**

```json
"minecraft:movement": { "value": 0.23 }               // 0.23 より速くできない
"minecraft:movement": { "value": 0.23, "max": 1.0 }   // こう書く
```

> ### **「速くしたのに速くならない」はこれを疑う**
>
> **エラーは出ない。黙って上限で止まる。** だから**式のほうを疑って時間を溶かす。**

**確かめ方**——**入れた直後に読み返す。**

```ts
const m = e.getComponent("minecraft:movement");
m?.setCurrentValue(want);
// m.currentValue が want より小さければ、上限で止まっている
// m.effectiveMax で上限そのものも読める
```

### 2-1. **どこまで広げておくか**（2026-09-08 決定）

| | |
| --- | --- |
| **呪いの上限** | **×3**（`core/curse.ts`） |
| **部品に書く `max`** | **×7**（`core/enemy.ts` の `MOVE_TOP`） |

> ### **上限なしの遊び方を足すかもしれない**
>
> **段や上限は、作っておくだけならただ同然。**
> **足りないと、そこで黙って頭打ちになる**——**広めに取る。**

**`max` は `tools/pve3-mobjson.mjs` が書く**（固有値 × `WALK` × `MOVE_TOP`）。**手で書かない。**

---

## 3. **攻撃の速さは、実行中に変えられない**（実測）

**`minecraft:behavior.melee_box_attack` の `cooldown_time` は
ビヘイビアに書いた静的な値で、script から書き換える手段が無い。**
**部品の差し替え（component group）でしか変えられない。**

```json
"component_groups": {
  "pve_v3:haste_150": {
    "minecraft:behavior.melee_box_attack": { "priority": 4, "cooldown_time": 0.667 }
  }
},
"events": {
  "pve_v3:set_haste_150": { "add": { "component_groups": ["pve_v3:haste_150"] } }
}
```

| | |
| --- | --- |
| **段は自動生成する** | **`tools/pve3-mobjson.mjs`。** 手で書くと、段を増やすたび全部書き直しになる |
| **1 体につき 1 段だけ足す** | **2 つ足すと同じ部品が二重になる** |
| **足すのは湧いた瞬間だけ** | 途中で変えないなら **`remove` は要らない** |

### 3-1. **刻みは「割合」で取る**（2026-09-08 決定）

**前は ×1.0 / 1.25 / 1.5 / 2.0 / 2.5 / 3.0 の 6 段しかなく、×1.7 が ×1.5 に落ちていた**（12 % のずれ）。

| | |
| --- | --- |
| **刻み** | **5 % ずつ**（`1.05^n`）。**41 段** |
| **範囲** | **×1.00 〜 ×7.04**（呪いの上限 ×3 より広く） |
| **ずれ** | **どこでも 2.5 % 以内** |

> ### 等間隔にしない
>
> **×1.0 と ×1.05 の差は分かるが、×6.0 と ×6.05 は分からない。**
> **割合で刻めば、どの高さでも同じだけ正確になる**（`core/haste.ts`）。

### 3-2. **JSON は道具が書く**

```bash
node tools/pve3-mobjson.mjs
```

**`scripts/core/enemy.ts` の固有値を読んで、`entities/<id>.json` に写す。**

| 書き換える所 | |
| --- | --- |
| `minecraft:movement` | **`value` と `max`**（2 章） |
| 攻撃の部品の間隔 | `cooldown_time` ／ 撃つ敵なら `attack_interval_*` |
| `pve_v3:haste_*` の部品群と合図 | **丸ごと作り直す** |

**それ以外には触らない。** **手で書いた行動・見た目・当たり判定はそのまま残る。**
**固有値を直したら、これを流してからデプロイする。**

**`speed_multiplier` は「攻撃中の移動速度」で、振る速さではない。** 間違えやすい。

---

## 4. **HP はバニラに任せない**（実測）

| | |
| --- | --- |
| **`minecraft:health`** | **1000 にしておく** |
| **`beforeEvents.entityHurt`** | **`/kill` 以外は全部打ち消す** |
| **`afterEvents.entityHurt`** | **打ち消し漏れを、その tick のうちに満タンへ戻す** |

> ### **なぜ 1000 なのか**
>
> **1 tick に何発も入ることがある。**
> **打ち消しが取りこぼした分が積もっても、戻す処理が間に合うだけの余裕**が要る。
> **20 のままだと、取りこぼし 2 回で死ぬ。**

**体力を 0 にできる道は残す**——**`/kill`（`self_destruct`）と `override` は通す。**
**全部塞ぐと、運営がモブを消せなくなる。**

---

## 5. **バニラの無敵時間を抜ける**（**実測・2026-09-08 に確認**）

**バニラは 1 発当たると 10 tick ほど無敵になる。**
**その間の攻撃は「当たったこと」にならない**ので、**速い攻撃が消える。**

**抜け道は「前の一撃より大きいダメージは通る」という決まり**（damage overflow）。
**演出用のダメージを 1, 2, 3 … と増やしていけば毎回通る**（上限 24 で 1 に戻す）。
**体力は同じ tick に戻す**ので実害は無い（`services/iframe.ts`）。

> ### **これは共通の仕組み。モブごとには何も要らない**
>
> **`services/iframe.ts` が数を配り、`services/cmd.ts` と `services/feedback.ts` が使う。**
> **新しいモブを足しても、そのまま効く。** **相手がプレイヤーでもモブでも同じ。**

---

## 6. **見た目をバニラから借りる**（実測）

```json
"materials": { "default": "zombie" },
"textures": { "default": "textures/entity/zombie/zombie" },
"geometry": { "default": "geometry.zombie.v1.8" }
```

### 6-1. **バニラの定義を丸ごと写すと、見えなくなる**（実測）

**`zombie.entity.json` をコピーして識別子だけ変えると、
描画制御が自分のパックに無いものを指していて透明になる。**
**最小の定義を自分で書く**ほうが速い。

### 6-2. **足が動かないのは `variable.tcos0`**（実測）

**`animation.humanoid.move` は `variable.tcos0` を見ている。**
**バニラのクライアント実体が `pre_animation` で計算している変数**なので、
**自分で書かないと 0 のまま＝足が止まる。**

```json
"scripts": {
  "pre_animation": [
    "variable.tcos0 = math.cos(query.modified_distance_moved * 38.17) * query.modified_move_speed * 57.3;"
  ],
  "animate": ["humanoid_base_pose", "look_at_target_controller", "move", "zombie_attack_bare_hand"]
}
```

**歩く見た目が要るなら、この 1 行は必ず要る。**

### 6-2-1. **見た目の定義は、バニラと同じ版で書く**（**スキーマで確認**・2026-09-08）

**`reference/bedrock-json-schemas/source/resource/entity/` を読んで分かったこと。**

| | `format_version: 1.8.0` | `1.10.0` |
| --- | --- | --- |
| **`animation_controllers`**（description の直下） | **ある** | **無い**（スキーマに存在しない） |
| **`scripts.animate`** | **無い** | **ある** |
| `enable_attachables` | ある | ある |

> ### **版を混ぜると、片方が丸ごと無視される**
>
> **`1.10.0` と書いて `animation_controllers` を入れていた**（2026-09-08 の失敗）。
> **スキーマに無い鍵なので、そのまま捨てられる**——**歩きも殴りも動かない。**
> **クモとシルバーフィッシュは、それに加えて `"scripts": {}` を書いていて、見えなくなっていた。**

**だから、写した元のバニラファイルと同じ `format_version` を書く。**
**バニラは実体ごとに版が違う**——**クモ・スケルトンは 1.8.0、ラヴェジャーは 1.10.0、ゾンビ・ピグリンは 1.26.0。**

### 6-2-2. **空の `scripts` を書かない**

**`"scripts": {}` を書くと、その実体は描画されない。**
**バニラに `scripts` が無い実体を写すとき、空の入れ物を作ってしまいがち。**

### 6-2-3. **持ち物を描くには `enable_attachables`**

```json
"enable_attachables": true
```

**バニラで物を持つモブは全部これを持っている**（ゾンビ・スケルトン・ピグリン・ヴィンディケーター…）。
**無いと、持たせても描かれない。** **「持っていない」ように見える。**

| | |
| --- | --- |
| **持たせ方** | **script から**（`EnemyDef.hand`・10-3 章） |
| **描く条件** | **`enable_attachables: true`**（これが無いと見えない） |
| **殴るモーション** | **`animation_controllers` か `scripts.animate`**（6-2-1）。**持ち物とは別** |

### 6-2-4. **自前スキンの人型は、模型を写して、バニラの人型モブの配線を使う**（2026-09-08）

**プレイヤーのものを直接指すのは、模型もアニメも間違いだった。** **2 つとも作り直した。**

#### **模型**——**バニラの `geometry.humanoid.custom` は、絵の大きさを書いていない**

```json
"description": {
  "identifier": "geometry.humanoid.custom",
  "visible_bounds_width": 1, "visible_bounds_height": 2, "visible_bounds_offset": [0, 1, 0]
}
```

**`texture_width` / `texture_height` が無い。**
**プレイヤーだけは engine が「スキンは 64 × 64」と知っている**——
**ふつうの実体は知らない。** **箱の貼り位置（`uv`）が全部ずれて、人の形に見えなくなる。**

| | |
| --- | --- |
| **やること** | **写して `texture_width: 64` / `texture_height: 64` を書き足す** |
| **置き場** | `resource_packs/pve_v3/models/entity/pve3_humanoid.geo.json` |
| **名前** | **`geometry.pve3.humanoid`** |
| **骨** | **バニラのまま 17 本**（第二層は親子付け済み） |

> **バニラのファイルを指すのではなく、写してから直す。**
> **`bedrock-samples/` は編集しない。**

#### **アニメ**——**制御はモブのもの、絵はプレイヤーのもの**

**`controller.animation.player.root` をそのまま指してはいけない。**
**`initial_state` が `first_person`** で、`variable.is_first_person` / `is_paperdoll` /
`map_face_icon` / `melee_spear_equipped` など、**プレイヤーにしか無い変数で枝分かれする。**

**では `humanoid.*` に丸ごと寄せると、今度はゾンビと同じ動きになる。**

> ### **抜け道**——**制御は「名前」を流すだけ**
>
> **`controller.animation.humanoid.attack` は「`attack.rotations` を流せ」としか言わない。**
> **その名前が何を指すかは、こちらの実体ファイルが決める。**
> **だからモブ用の制御を使ったまま、中身をプレイヤーのアニメに差し替えられる。**

**バニラを読み比べて、中身が違うものだけ差し替えた**（`pve3-newmob.mjs` の `HUMAN_ANIM`）:

| 名前 | `humanoid` | `player` | どうしたか |
| --- | --- | --- | --- |
| `attack.rotations` | **腕を横に振る**（`sin(sqrt(t)*360)*11.46`） | **振りかぶって叩く** | **`player` に差し替え** |
| `attack.positions` | **無い** | 頭の角度を戻す | **`player` を足した** |
| `sneaking` | **腕を 72 度上げる別物** | 腰を落とす | **`player` に差し替え** |
| `move` / `bob` / `holding` | — | — | **式が同じ。そのまま** |

| | |
| --- | --- |
| **制御** | **バニラの `humanoid.*` を 13 本**（`--anim <バニラ>` で丸ごと変えられる） |
| **殴りだけ自前** | **`controller.animation.pve3.attack`**——**プレイヤーは `positions` と `rotations` の 2 本を流す。** バニラの `humanoid.attack` は 1 本しか流さない |
| **動かし方** | **`animate` の先頭に `humanoid_base_pose`**（プレイヤーと同じ。腰の角度を戻す） |

> ### **`variable.attack_body_rot_y` を忘れない**
>
> **`animation.player.attack.rotations` は、これで胴をひねる。**
> **入れないと腕だけが振れて、プレイヤーの殴りに見えない。**
> `pre_animation` に `Math.sin(360*Math.sqrt(variable.attack_time)) * 5.0` を書く。

> ### **`variable.tcos0` も忘れない**
>
> **`animation.humanoid.move` は `variable.tcos0` で脚を振る。**
> **書かないと、歩いても棒立ちになる。** スケルトンの式をそのまま使う。

> ### **ゾンビから借りてはいけない**（2026-09-08 に踏んだ）
>
> **骨は同じなので動きはするが、`zombie_attack_bare_hand` で腕を前に突き出す。**
> **ウィザースケルトンのような歩き方になった。**

> ### **第二層は勝手に付いてくる**
>
> **帽子→頭、上着→胴、袖→腕、ズボン→脚 と親子付けされている。**
> **基本の骨を動かせば、第二層も一緒に動く。**
> **鎧の `helmet` / `bodyArmor` などは別の模型**（`player_armor`）**の骨なので、
> こちらの描画制御に `part_visibility` は要らない。**

### 6-3. **`default` の鍵が無いと、貼られない**（実測・2026-09-08）

**描画制御（`controller.render.pve3_hurt`）は `Texture.default` / `Geometry.default` / `Material.default` を見る。**
**バニラには `default` を持たない実体がある**——**ウサギは `brown` `white` `black` … しか無い。**

```json
"textures": { "brown": "textures/entity/rabbit/rabbit_brown", "white": "..." }
```

**そのまま写すと、鍵が見つからず透明になる。** **エラーは出ない。**
**ひな形の道具は、`default` が無ければ最初の 1 つを `default` にも割り当てる。**

### 6-5. **色味で「上位種」を作る**（2026-09-08）

**同じ模型のまま、別の個体に見せる手。** **絵を描き足さずに済む。**

| | |
| --- | --- |
| **どこで** | 実体の property（`pve_v3:tint_r` / `_g` / `_b` / `_a`） |
| **効かせ方** | **描画制御が `overlay_color` に流す**（`controller.render.pve3_hurt`） |
| **切り方** | **`tint_a` を 0 にすれば、色は乗らない** |
| **書き方** | `node tools/pve3-newmob.mjs <id> ... --tint r,g,b,a` |

**例**——**ラヴェジャー王は金、パワーラヴェジャーは赤、城壁ゴーレムは青、処刑ゴーレムは赤。**

> ### **凍りと同居させる**
>
> **`pve_v3:chill` が立っている間は、そちらを優先する**（青く曇る）。
> **1 つの `overlay_color` しか無い**ので、式の中で切り替えている。

> ### **使う実体は、全部 property を宣言する**
>
> **宣言していない実体で `q.property(...)` を引くと 0 が返る**（色は乗らない）。
> **動きはするが、content log が汚れる。** **描画制御を使う実体には全部書く。**

### 6-3-1. **持っていない property を読むと、見た目が丸ごと出ない**（**踏んだ**・2026-09-09）

**爆弾**（`pve_v3:bomb`）**が地面に置かれても、何も見えなかった。**

| | |
| --- | --- |
| **書いてあったもの** | `render_controllers: ["controller.render.pve3_hurt"]` |
| **その制御が読むもの** | `q.property('pve_v3:chill')` / `pve_v3:tint_*` |
| **実体が持っていたもの** | **何も無い**（`properties` を 1 つも書いていなかった） |

**Molang がそこで止まり、実体が 1 ドットも描かれない。** **エラーは出ない。**

**同じことが 3 つあった**——**矢・種・味方**が、`pre_animation` で
`q.property('pve_v3:swing')` を読むのに宣言していなかった。
**`pve_v3:arrow` が「描かれなかった」のもこれ**（`25-enemy-kit.md` 3-2）。

**`tools/pve3-rpcheck.py` が見つけるようにした**——
**読む property を、ビヘイビア側が宣言しているか照合する。**
**`minecraft:` で始まるものは、バニラが持っているので見ない。**

### 6-3-2. **`1.8.0` の見た目に `scripts.animate` は無い**（**踏んだ**・2026-09-09）

> *description | scripts | animate | child 'animate' not valid here.*

**配線を 1 本足しただけで、15 体の見た目が丸ごと消えた**——
**バニラから写した実体は `format_version: 1.8.0` のものが多い。**

| 版 | 配線の足し方 |
| --- | --- |
| **1.8.0** | **`animation_controllers` の並び**に `{ "名前": "controller.…" }` を足す |
| **1.10.0 以降** | **`animations` に名前を書き、`scripts.animate` に並べる** |

**版の違いで書き方が変わる所は、`pve3-rpcheck.py` が見る。**

**さらに 2 つ踏んだ**（同じ日）:

| 出たもの | 意味 |
| --- | --- |
| *animations \| Node has too few children (0 < 1)* | **空の入れ物を書いた。** **中身が無いなら鍵ごと消す** |
| *animation_controllers \| child 'animation_controllers' not valid here.* | **`animations` を 1 つも持たない実体に、配線だけ足した**（スライム）。**置き場が無い** |

**スライムと大スライムは、アニメを 1 つも持たない**（`scripts.scaleX/Y/Z` で大きさを作るだけ）。
**こういう実体には、配線を足せない。**

### 6-4. **出す前に照合する**

```bash
python tools/pve3-rpcheck.py
```

**見た目の定義は、間違えても何も言われない。** **ゲームを開いて初めて「見えない」と分かる。**
**だから機械で突き合わせる。**

| 見るもの | 突き合わせ先 |
| --- | --- |
| **模型** | バニラと自分の `models/entity/**` |
| **絵** | 実ファイルがあるか（`.png` / `.tga`） |
| **材質** | **バニラの実体定義が実際に使っている名前**（`materials/*.material` は同梱されていない） |
| **アニメ・アニメ制御** | バニラと自分の `animations/**`・`animation_controllers/**` |
| **描画制御** | 自分の `render_controllers/**` |
| **`default` の鍵** | **その描画制御が要求する鍵を持っているか**（6-3） |
| **`animate` の中身** | **宣言していない名前を鳴らそうとしていないか** |

**モブを足したら、デプロイ前にこれを流す。**

---

---

### 6-7. **アニメの正しさを、開かずに確かめる**（`pve3-anim.py`・2026-09-08）

```bash
python tools/pve3-anim.py                 # 全部
python tools/pve3-anim.py crusher         # その実体だけ
python tools/pve3-anim.py crusher --bone rightarm
```

> ### **`pve3-rpcheck.py` では足りない**
>
> **あちらは「その名前が存在するか」までしか見ない。**
> **存在する正しい名前を、間違った条件で流していても、何も言われない。**

**配線を最後まで展開して、「いつ・どの骨が動くか」を並べる。**

```
scripts.animate（または 1.8.0 の animation_controllers）
      ↓ 制御をたどる（状態・遷移・入れ子）
流れうるアニメを、条件つきで全部集める
      ↓ 実体の animations 表で本体に解決する
そのアニメが動かす骨と式を読む
```

| 印 | 意味 |
| --- | --- |
| **`AYASHII`** | **持ち物と噛み合わない条件で入る**（弓を持たないのに弓のアニメ） |
| **`VANILLA <名> NARI`** | **`animate` が丸ごとバニラ一致 ＝ 写したもの。** **バニラの癖はそのまま** |
| **`DARE MO IRENAI`** | **誰も入れていない変数**を読んでいる（＝ 0 のまま） |
| **`NAI`** | 制御が流そうとしている名前が、実体の `animations` に無い |

#### **これで見つけた**——**腕を上げたまま向かってくる**（2026-09-08）

```
bow_and_arrow -> animation.humanoid.bow_and_arrow
  itsu : query.has_target
  hone : leftarm / rightarm  << AYASHII: bow wo motanai noni hairu
```

**`controller.animation.humanoid.bow_and_arrow` が入る条件は `query.has_target` だけ。**
**弓を持っているかは見ていない。**
**`animation.humanoid.bow_and_arrow` は両腕を `query.target_x_rotation - 90.0` にする**——
**近接の敵が、狙いを付けた瞬間に腕を上げる。**

**プレイヤーは `get_equipped_item_name == 'bow'` で縛っている。** **同じように縛る**:

```json
{ "bow_and_arrow_controller": "query.is_item_name_any('slot.weapon.mainhand', 'minecraft:bow')" }
```

> ### **名前の空間は 2 つある**
>
> **1.8.0 の `animation_controllers` は `{短い名前: 制御}` の配列**、
> **`animations` は `{短い名前: アニメ}`。** **同じ短い名前が両方にある**
> （スケルトンの `brandish_spear`）。
> **`animate` の並びは「制御 → アニメ」、制御の中は「アニメ → 制御」の順で引く。**

### 6-8. **どこまでを道具で担保できるか**（2026-09-08 に整理）

| 見るもの | 道具 | 捕まえられるもの |
| --- | --- | --- |
| **名前が実在するか** | `pve3-rpcheck.py` | 模型・絵・材質・アニメ・描画制御の綴り違い、`default` の欠け |
| **いつ何が動くか** | **`pve3-anim.py`** | **条件の間違い**（弓を持たないのに弓のアニメ）、**死んだ変数**、流れない名前 |
| **形と貼り位置** | **絵と模型を並べて見る** | `texture_width` の欠け、UV のずれ |
| **本当にそう動くか** | **ゲームで見る** | **engine の変数の実際の値。ここだけは代わりが無い** |

> ### **道具で捕まらないもの**
>
> **`query.has_target` が「いつ真になるか」は engine が決める。**
> **`variable.attack_time` が実際に入るかも、開いてみるまで分からない。**
> **道具にできるのは「あり得る動きを漏れなく並べる」ところまで。**
> **並べたうえで、おかしいものを人が指す。** **推測で書かないための道具。**

### 6-9. **模型の名前は `:` の前だけ**（**踏んだ**・2026-09-08）

**バニラの `sheep.geo.json` は、こう名乗っている。**

```
geometry.sheep.v1.8:geometry.sheep.sheared.v1.8
```

**`A:B` は「A は B を継いだもの」。** **模型の名前は `A` のほう。**
**実体ファイルに書くのも `geometry.sheep.v1.8` で正しい。**

**`pve3-rpcheck.py` が丸ごと 1 つの名前として数えていた**ので、
**正しい `geometry.sheep.v1.8` が「模型が無い」と落ちた。**
**`:` の前も名前として数えるように直した**（ヒツジで踏んだ）。

**継いでいる模型を持つバニラ**: ヒツジ・ウシ・ブタなど、**刈る／模様の差し替えがあるもの。**

---

---

## 7. **赤く光らせるのは `damage` コマンドだけ**（実測）

```
/damage @s 0 self_destruct
```

| | |
| --- | --- |
| **`applyDamage(0)`** | **何も起きない。** 代わりにならない |
| **原因を `self_destruct` に** | **打ち消しの規則をすり抜ける**ので、演出だけ通る |
| **量は 0** | 光るだけ。体力は動かない |

**バニラの被弾音も一緒に鳴る。** **同じイベントで音だけ止める手は無い**——
**止めたいなら、その音を無音のファイルに差し替え、鳴らしたいときだけ別名で鳴らす。**
（**この決まりは [22-feedback.md](22-feedback.md) 7 章。** **勝手に `damage` を外さない。**）

---

## 8. **どのイベントで「殴られた」を拾うか**（実測）

| イベント | 無敵時間 | 使いどころ |
| --- | --- | --- |
| **`afterEvents.entityHitEntity`** | **関係なく出る** | **モブがプレイヤーを殴った瞬間。** ここで自前のダメージを入れる |
| **`beforeEvents.entityHurt`** | **無敵時間で消える** | **バニラのダメージを打ち消す**用 |

**「モブの攻撃が時々効かない」は、後者で拾っていることが多い。**
**`entityHitEntity` は creative / spectator にも出る**ので、**script 側で弾く。**

---

## 9. **ひな形から作る**（2026-09-08・道具にした）

```bash
# 1. まず固有値を書く（scripts/core/roster/star<★>.ts）
# 2. ひな形を起こす
node tools/pve3-newmob.mjs <id> --look <バニラのモブ> [--gear <装備表>] [--box 幅x高さ]
# 3. npm run check -> デプロイ（リソパの版も上げる）
```

**書くもの**: `behavior_packs/.../entities/<id>.json` と `resource_packs/.../entity/<id>.entity.json`。
**そのまま段と速さも書き込む**（`pve3-mobjson.mjs` を中で呼ぶ）。**もうあるファイルは上書きしない**（`--force`）。

| | |
| --- | --- |
| **固有値の持ち主** | **`core/roster/star<★>.ts`。** **そこに無い id は作れない**——速さも間隔もそこから読む |
| **見た目** | **`bedrock-samples` のバニラ定義から、模型・材質・絵・攻撃アニメを読む** |
| **攻撃まわり** | **`kind` で変わる。** `melee` なら殴る部品、`shoot` なら撃つ部品＋`shooter` |

> ### **ゾンビとスケルトンを突き合わせて割り出した**（2026-09-08）
>
> | | |
> | --- | --- |
> | **ビヘイビア** | **23 個の部品が完全に一致。** 違ったのは**速さ**と**攻撃まわりだけ** |
> | **見た目** | **描画制御と `pre_animation` が一致。** 違ったのは**模型・材質・絵・アニメ名だけ** |
>
> **道具で起こし直したら、手で作ったスケルトンと同じものが出た**（確かめた）。

### 9-2. **型どおりの作り方**（**残りのモブは、ここをなぞる**）

**敵は 3 つの型のどれかに落ちる。** **型が決まれば、叩く命令も決まっている。**

| 型 | 見た目 | 命令 |
| --- | --- | --- |
| **A. バニラの見た目を借りる近接** | バニラのモブそのまま | `node tools/pve3-newmob.mjs <id> --look <バニラ> --box WxH` |
| **B. 自前スキンの人型近接** | プレイヤー模型 ＋ 自前の絵 | `node tools/pve3-newmob.mjs <id> --human` |
| **C. 撃つ敵** | どちらでも | 上に加えて `roster.ts` に `kind: "shoot"` と `shot`（10 章） |

**どの型でも、手順は同じ 4 つ。**

```bash
# 1. 性能表（07-enemy-plan.md 6 章）を、そのまま core/roster/star<★>.ts に 1 行で写す
# 2. 絵を用意する（B のときだけ）
python tools/pve3-skin.py <id>          # 自動生成。既にあれば触らない
# 3. 起こす
node tools/pve3-newmob.mjs <id> --human        # 型 B
node tools/pve3-newmob.mjs <id> --look husk --box 0.6x1.9   # 型 A
# 4. 確かめて出す（照合は check に入っている）
npm run check && npm run local-deploy
```

### 9-3. **仕上げの一覧**（**これを全部見てから「できた」と言う**）

**重撃（`crusher`）を作るのに、7 回直した。** **その 7 つが、ここ。**

| # | 見るところ | 抜けるとどうなる | どこで守るか |
| --- | --- | --- | --- |
| **1** | **`star` を書いたか**（性能表と同じ★） | 名前の色が付かない | **型が必須にしている**（`EnemyDef.star`） |
| **2** | **★5 なら `color` を書いたか** | **金になる**（他の★5と同じ色） | `10-implementation.md` 8-2 |
| **3** | **模型は `geometry.pve3.humanoid` か**（型 B） | **人の形に見えない**（貼り位置が総崩れ） | **道具が入れる**（`--human`） |
| **4** | **アニメの配線は `HUMAN_ANIM` か**（型 B） | **ゾンビの動きになる／殴らない** | **道具が入れる**（`--human`） |
| **5** | **弓を持たないのに弓のアニメが入っていないか** | **腕を上げたまま向かってくる** | **`npm run check`**（`pve3-anim.py`） |
| **6** | **`melee_box_attack` に `track_target: true` があるか** | **途中で固まる**（11 章） | **道具が入れる**（41 段ぶんも） |
| **7** | **絵が 64 × 64 で置いてあるか**（型 B） | 貼られない／黒くなる | **`npm run check`**（`pve3-rpcheck.py`） |

> ### **`npm run check` に照合が入っている**（2026-09-08）
>
> ```
> npm run check = typecheck + lint + test + check:look
> check:look    = pve3-rpcheck.py + pve3-anim.py --quiet
> ```
>
> **通し忘れが一番多かった**ので、**通さないと出せないようにした。**

#### B（自前スキンの人型）で、勝手に付いてくるもの

**書かなくていい。** **道具が入れる。**

| | |
| --- | --- |
| **模型** | **`geometry.pve3.humanoid`**（バニラを写して絵の大きさを足したもの・6-2-4） |
| **絵** | `textures/entity/pve3/<id>.png`（**64 × 64。無いうちは仮にスティーブ**） |
| **アニメ** | **バニラの人型モブと同じ配線**（`HUMAN_ANIM`・6-2-4）。見る・歩く・殴る・持つ・弓・しゃがむ・泳ぐ・乗る |
| **赤く光る／色味** | `pve_v3:hurt` / `chill` / `tint_*` の property と描画制御 |
| **持ち物・被り物** | `EnemyDef.hand` / `head` を書けば、装備表が自動で作られる（10-3） |
| **攻撃速度の 41 段** | `pve3-mobjson.mjs` が書く（3 章） |
| **速さの上限** | `movement.max`（2 章） |

#### 絵の置き方

| | |
| --- | --- |
| **人から渡された絵** | **`textures/entity/pve3/<id>.png` に置くだけ。** 64 × 64 |
| **自動生成** | `tools/pve3-skin.py` の `PEOPLE` に 1 行足して、`python tools/pve3-skin.py <id>` |
| **上書き** | **しない。** 既にあれば触らない（`--force` で明示したときだけ） |

> ### **1 体目で決めたことは、2 体目から書かない**
>
> **重撃（`crusher`）で通した道が、そのまま型 B。**
> **次からは「値を書く → `--human` で起こす → 照合 → 出す」だけ。**

### 9-4. **ゲームが黙って捨てたものを見つける**（**踏んだ**・2026-09-09）

> ### **実体が読み込まれなくても、画面には何も出ない**
>
> **`spawnEntity` して初めて「is not a valid entity type」と分かる。**
> **`ContentLog` には、その理由が 1 行で書いてある。**

```bash
npm run log          # 最新の ContentLog から、うちのパックのエラーだけ
npm run check:mob    # 出す前に、同じ間違いを見つける
```

**置き場**: `%APPDATA%/Minecraft Bedrock/logs/ContentLog<日付>.txt`

#### 9-4-1. **`0.0` が `0` になると、property が丸ごと消える**

> *Error loading property 'pve_v3:chill': 'default' value does not match the specified type 'float'*
> *Error loading Actor Properties*

**JavaScript に整数と小数の区別が無い**ので、**`JSON.stringify(0.0)` は `0` と書く。**
**Bedrock は `"type": "float"` に整数が来ると弾く。**
**1 個弾かれると、その実体の property が全部消える**——
**`q.property()` が何も返さなくなる。**

**これで壊れていたもの**（2026-09-09 に判明）:

| | |
| --- | --- |
| **回転の溜め・回転斬り** | 配線が `q.property()` を見ていた（16-2） |
| **クリーパーの膨らみ** | `pve_v3:fuse` が読めなかった（`25-enemy-kit.md`） |
| **色味・冷気の青** | `pve_v3:tint_*` / `pve_v3:chill` が読めなかった（6-5） |
| **ゴーレムの腕振り** | `pve_v3:swing` が読めなかった |

**`pve3-newmob.mjs` が小数で書くようにした**（`flo()` ／ `unflo()`）。
**`pve3-bpcheck.py` が、生の文字で整数を見つける。**

> ### **道具を 1 つ直しただけでは足りなかった**（**踏んだ**・2026-09-09）
>
> **`pve3-mobjson.mjs` も JSON を読み直して書く**ので、**同じ壊し方をしていた。**
> **1 回動かしただけで、47 体が元に戻った。**
> **`dump()` を通すようにした**——**書く側は全部これを通す。**
>
> **見つけたのは `npm run check`**（`check:mob`）。**道具を直した後は、必ず 1 回動かして確かめる。**

#### 9-4-2. **schema に無い部品は、実体ごと捨てられる**

> *-> components -> minecraft:pushable: this component was found in the input,
> but is not present in the Schema*
> *ERROR: Entity 'pve_v3:bomb' failed to load from JSON*

**`minecraft:pushable` は 1.26.20 の schema に無い**（`minecraft:pushable_by_entity` になった）。
**バニラにはまだ残っている**が、**あちらは `format_version` が古い。**

**`minecraft:behavior.move_around_target` の `destination_position_range` も同じ**——
**1.26.20 からは「物」**（`{ "min": 4.0, "max": 8.0 }`）。**配列で書くと実体ごと落ちる。**

| これで出せなかったもの | |
| --- | --- |
| **爆弾・矢・石** | `minecraft:pushable` |
| **ボマー・恵み・鼓舞・カウボーイ・チェンバー・妖狐・散弾** | `destination_position_range` が配列 |

**公式の JSON schema を正とする**——
`bedrock-samples/metadata/json_schemas/server/entity/<版>/`。

### 9-1. **最小の骨組み**（道具が書くもの）

```json
"description": { "identifier": "pve_v3:<id>", "is_summonable": true, "is_spawnable": false },
"components": {
  "minecraft:type_family": { "family": ["pve_mob", "mob"] },
  "minecraft:collision_box": { "width": 0.6, "height": 1.9 },
  "minecraft:physics": {},
  "minecraft:movement": { "value": 0.23, "max": 1.0 },
  "minecraft:movement.basic": {},
  "minecraft:navigation.walk": { "can_pass_doors": true, "can_walk": true },
  "minecraft:jump.static": {},
  "minecraft:can_climb": {},
  "minecraft:persistent": {},
  "minecraft:health": { "value": 1000, "max": 1000 },
  "minecraft:fire_immune": {},
  "minecraft:knockback_resistance": { "value": 1 },
  "minecraft:loot": { "table": "loot_tables/empty.json" },
  "minecraft:nameable": { "always_show": true, "allow_name_tag_renaming": false },
  "minecraft:pushable_by_entity": {},
  "minecraft:pushable_by_block": {},
  "minecraft:follow_range": { "value": 100, "max": 100 },
  "minecraft:behavior.float": { "priority": 0 },
  "minecraft:behavior.hurt_by_target": { "priority": 1 },
  "minecraft:behavior.nearest_attackable_target": { "priority": 2 },
  "minecraft:behavior.melee_box_attack": { "priority": 4, "track_target": true },
  "minecraft:behavior.random_stroll": { "priority": 7 },
  "minecraft:behavior.look_at_player": { "priority": 8 },
  "minecraft:behavior.random_look_around": { "priority": 9 }
}
```

**何気なく効いているもの**——**外すと壊れる。**

| | 無いとどうなる |
| --- | --- |
| **`is_spawnable: false`** | **自然湧きに混ざる** |
| **`persistent`** | **遠ざかると消える** |
| **`loot` を空に** | **バニラの落とし物が出る** |
| **`knockback_resistance: 1`** | **殴るたびに吹き飛んで、追ってこない** |
| **`fire_immune`** | **溶岩や日光で勝手に死ぬ** |
| **`behavior.float`** | **水に沈んで出てこない** |
| **`behavior.melee_box_attack` の `track_target`** | **近づく途中で固まる**（11 章） |
| **`follow_range` 100 ＋ `must_see: false`** | **壁越しに追ってこない** |

---

## 10. **弾を撃つ敵**（2026-09-08・スケルトンで作り切った）

### 10-0. **作るときの順番**（これだけ守れば動く）

| | |
| --- | --- |
| **1** | **`kind: "shoot"`** と **`reach`**（撃ち始める距離）を `roster.ts` に書く |
| **2** | **`hand`** に武器を書く（**見た目。弓が無くても撃てる**——10-1-2） |
| **3** | `node tools/pve3-newmob.mjs <id> --look <バニラ>` で起こす |
| **4** | `python tools/pve3-rpcheck.py` で見た目を照合する |
| **5** | `npm run check` → デプロイ |

**弾の速さ・押す強さ・散らばりは、全部 `roster.ts` と `services/mobshot.ts` の値。**

### 10-1. **バニラに撃たせて、弾だけ差し替える**（決定）

**`minecraft:behavior.ranged_attack` は、撃つ敵の面倒をほとんど見てくれる。**

```
バニラの ranged_attack ──▶ minecraft:shooter が「種」を出す
                                    │
                       湧いた瞬間に script が捕まえる（entitySpawn）
                                    │
                       ├ 種は消す
                       └ 同じ場所・同じ向きで、自前の弾を撃つ
```

| | |
| --- | --- |
| **どこで** | `services/mobshot.ts`（`world.afterEvents.entitySpawn`） |
| **見分け方** | **`pve_v3:seed` で、撃った主が `pve_mob`** |
| **自前の弾** | **味方の矢と同じ仕組み**（`services/bullet.ts`） |

> ### **消し損ねると 2 発分入る**
>
> **種を消せなかったら、そのまま飛んでいって当たる。** **消えたことを確かめてから撃つ。**

### 10-1-1. **優先度は 0**（**実測・2026-09-08。いちばん効いた**）

```json
"minecraft:behavior.ranged_attack": { "priority": 0, ... }
```

**バニラのスケルトンは 0。** **うちは 4 にしていて、`equip_item`(3)・`nearest_attackable_target`(2)・
`hurt_by_target`(1) より後回しだった。**

> ### **後回しにすると、撃たずに寄ってくる**
>
> **撃つ動きが割り込まれて、「近づく」だけが残る。**
> **足が速い個体ほど 0 距離まで張り付いた。** **0 にしたら止まるようになった。**

### 10-1-2. **`ranged_attack` は弓を必要としない**（**公式ドキュメント**）

> *Requires minecraft:shooter to define projectile behaviour.*

**必要なのは `minecraft:shooter` だけ。** **武器は見た目**（10-3）。
**「弓が無いから撃たない」は誤り**——2026-09-08 に一度そう判断して、遠回りした。

### 10-1-3. **`attack_radius_min` は使わない**

> *Minimum distance the target can be for this mob to fire.*
> *If the target is closer, this mob will move first before firing.*

**「近すぎたら動く」＝ 下がる。** **こちらが近づくと逃げていく**ので、入れない。
**近づきすぎを止めたいときは、優先度（10-1-1）か `speed_multiplier` で。**

### 10-1-4. **`shooter` に `sound` を入れない**

**バニラのスケルトンは `"sound": "bow"` を持っているが、写してはいけない。**
**うちは弓の音を `is3D: false` にしてある**（`22-feedback.md` 1-1）——
**距離で小さくならないので、敵が撃つたびに耳元で鳴る。**

### 10-1-5. **バニラの矢は種に使わない**

```json
"uncertainty_base": 16,
"uncertainty_multiplier": 4
```

**バニラの矢が持っている値。** **狙った所からわざとずらす**ので、**まっすぐ飛ばない。**
**自前の種（`pve_v3:seed`）を用意して、どちらも 0 にする。**
**散らしたいときは script 側で角度を足す**（10-5）。

### 10-1-6. 仮の矢の描画と取りこぼし（2026-09-11）

スケルトンの実体の矢・射撃が出ない報告への修正。
`seed`の既存描画先`controller.render.pve3_none`には非表示指定がなく、矢の模型が描かれる。
他の投擲物も同じ描画先を使うため、種だけ専用のrender controllerへ切り替えて全パーツを非表示にする。

`entitySpawn`で`projectile.owner`を取得できない場合の即時破棄をやめ、最大2tickまで1tick刻みで再取得する。
owner未設定のタイミングが実機で起きているかは未確定だが、APIのownerはoptionalで現行コードはこの場合に射撃を取りこぼす。
敵のownerを取得したら1回だけ種を削除して独自の弾に変換する。削除失敗時・死亡した敵からの種は撃たない。
期限までownerが不明なら種を削除して1度警告し、近くの別の敵から撃ったと推測しない。
待機中の種の重複通知はidで抑止し、消滅時も再試行を終了する。
検証はownerの遅延・未設定・通常取得・重複通知・消滅・削除失敗と、赤い粒への変換を含める。

### 10-2. **弾は味方の矢と同じ仕組み**（`services/bullet.ts`）

```
毎 tick、速さのぶんの「区間」を進む
  ├ その区間に相手が居れば、いちばん手前に当たる
  ├ 壁が手前にあれば、そこで消える
  └ どちらも無ければ、軌跡の粒を置いて進む
```

**点ではなく区間で見る**ので、速い弾でも隙間を抜けない。

| 変えられる所 | |
| --- | --- |
| **速さ**（マス/tick） | `EnemyDef.shot`。**スケルトン系5種は2.025**（40.5マス/秒）。2026-09-11指定で1.0125から2倍。対象はarcher / sbowman / sroyal / sknight / sgeneral |
| **届く距離** | **`reach` の 2 倍**（10-5） |
| **当たりの太さ** | **相手がプレイヤーなら細く**（0.45） |
| **軌跡の粒** | **敵の弾は赤**（`pve_v3:foe_trail`）。味方の矢は金色 |
| **素通りする相手** | 敵の弾はプレイヤー以外を抜ける |

> ### **壁は「1×1×1 の塊」だけ**（2026-09-08 決定）
>
> **はしご・松明・草・半ブロック・階段・柵は通す。**
> **「水を止める、かつ 水を置けない」＝ 塊**（`isLiquidBlocking` ＋ `canContainLiquid`）。
> **`getBlockFromRay` は使わない**——engine の「通り抜けられる」の基準と食い違う。

### 10-3. **武器と被り物は「装備表」で持たせる**（**実測・2026-09-08**）

> ### **script の `setEquipment` では入らなかった**
>
> **`EntityEquippableComponent.setEquipment` を呼んでも、弓も帽子も付かなかった。**
> **バニラのモブは全部 `minecraft:equipment`（装備表）で持っている**——**同じやり方にしたら付いた。**

```json
"minecraft:equipment": { "table": "loot_tables/gear/<id>.json" },
"minecraft:behavior.equip_item": { "priority": 3 }
```

**表の中身**（`pve3-newmob.mjs` が `EnemyDef.hand` / `head` から書く）:

```json
{ "pools": [ { "rolls": 1, "entries": [ { "type": "item", "name": "minecraft:bow", "weight": 1 } ] } ] }
```

**1 つの持ち物につき 1 プール。** **描くには `enable_attachables: true` も要る**（6-2-3）——
**両方揃って初めて見える。**

### 10-4. **弾の見た目は、実体ではなく粒**（2026-09-08 決定）

**一度は `pve_v3:arrow` を連れて歩いたが、描かれなかった**（当たってはいた）。
**弾は script が飛ばしているので、実体は要らない。**

| | |
| --- | --- |
| **見せ方** | **赤い粒**（`pve_v3:foe_trail`）。**味方の金色と区別が付く** |
| **粒の作り** | **4 粒を少し散らし、強い空気抵抗ですぐ止める。** 寿命と回転をばらけさせる |
| **材質** | **`particles_alpha`**——`particles_add`（加算）は**明るい背景で消える** |

**`services/bullet.ts` の `body` はそのまま残してある**——**実体を見せたい弾**（大玉など）で使える。

### 10-5. **距離・向き・散らばり**

| | |
| --- | --- |
| **撃ち始める距離** | **`reach`**（＝ `attack_radius`）。スケルトンは 15 |
| **弾が届く距離** | **`reach` の 2 倍。** **下がられても追いつく**ため（前は同じ値で、途中で消えていた） |
| **狙いの散らばり** | **script 側で角度を足す**（`SPREAD` 0.03 ＝ 約 1.7 度）。**上下は半分** |

> ### **押す向きは「飛んできた方向」**（実測・2026-09-08）
>
> **当たった点は、ほぼ相手の体の中。** **そこから向きを出すと、わずかなずれで横向きになる。**
> **当たった点から進行方向へ 3 マス戻した点**を `hit({ source })` に渡す。

---

## 11. **近づく途中で固まる**（実測・2026-09-08 に原因を特定）

**近接の敵が、中途半端な距離で止まる。** **殴りもせず、歩きもせず、その場に立つ。**

### 11-1. **原因**——**`melee_box_attack` は「感じ取れている」前提**

**同梱の公式ドキュメント**（`bedrock-samples/documentation/Entities.html`）:

| 値 | 既定 | 説明 |
| --- | --- | --- |
| `melee_fov` | **90** | *Field of view (in degrees) **when using the sensing component** to detect an attack target.* |
| `track_target` | **false** | *Allows the entity to track the attack target, **even if the entity has no sensing**.* |

**こちらの敵は `nearest_attackable_target` を `must_see: false` ／ 100 マス**で書いている
（**壁越しでも追ってくる**のがこのゲームの仕様）。

```
狙いは付く（must_see: false なので、壁の向こうでも付く）
      ↓
melee_box_attack が動き出す（優先度 4）
      ↓
だが目標を「感じ取れて」いない ＝ 90 度の視界の外・壁の向こう
      ↓
track_target が false なので、追えない ── 動かない
      ↓
それでも goal は動き続けて random_stroll（7）を押さえる ── 歩きもしない
```

**間合いには入っていないので、殴りもしない。** **これが「固まる」の正体。**

> ### **なぜバニラのゾンビは踏まないか**
>
> **バニラのゾンビは `must_see: true` ／ 25 マス。** **感じ取れる相手しか狙わない。**
> **ピグリンは狙い方が広いぶん、`track_target: true` を持っている。**

### 11-2. **直し方**

```json
"minecraft:behavior.melee_box_attack": {
  "priority": 4,
  "can_spread_on_fire": true,
  "cooldown_time": 1.0,
  "track_target": true
}
```

**`must_see: false` で狙うなら、`track_target: true` は必ず対にする。**
**片方だけにすると、この症状が出る。**

> ### **41 段の差し替えぶんにも入れる**
>
> **攻撃速度は `melee_box_attack` を丸ごと差し替えて効かせている**（3 章）。
> **`pve_v3:haste_*` の 41 個にも同じ値が要る**——**1 つでも抜けると、その段だけ固まる。**
> **`pve3-newmob.mjs` が両方に書く。**

---

## 12. **黙って失敗させない**（2026-09-08）

> ### **content log は既定で切れている**
>
> **「弓が出ない」「矢が見えない」とき、どこで止まっているか分からなかった。**
> **画面に出せば、次の 1 回で分かる。**

`services/tell.ts` の **`tellOps()`**——**運営にだけ、同じ文は 1 度だけ。**

| いま出しているもの | 何が分かるか |
| --- | --- |
| `装備: <id>: <item> を <slot> に入れられなかった` | **装備が入っていない** |
| `矢: 種を捕まえて自前の弾に差し替えた` | **撃ててはいる**（見えないなら見た目の問題） |
| `弾: <id> を出せなかった — <理由>` | **見た目の実体が湧かせられない** |
| 湧き点が無い／区画が読み込まれていない | 敵が出ない理由 |

**新しい仕組みを作るときは、失敗する所に 1 行足す。** **原因の切り分けが 1 往復で済む。**

---

## 13. **まだ直っていない所**

**1 つずつ片づけて、消していく。**

| | どこ | いつ気づいた |
| --- | --- | --- |
| （いまは無い） | | |

> ### **2 体目を作り終えてから道具にする**（2026-09-08 決定）
>
> **ゾンビ 1 体だけを見て「共通部分」を決めると外す。**
> **スケルトンを作り切ったら、2 体を突き合わせて「毎回同じだった所」を割り出し、
> それをひな形にする。**

> ### **なぜひな形が要るのか——バグを取るため**
>
> **手で写すと、モブごとに少しずつ違う JSON ができる。**
> **1 体で直したバグが、他の体では直っていない**——**同じバグを何度も踏む。**
> **ひな形から作れば、直す所は 1 つで済む。**
>
> **だから「共通の所は、他のモブと 1 文字も変えない」で書く。**
> **差分がそのままひな形になる。**

**片づいたもの**:

| | 直した日 |
| --- | --- |
| ~~攻撃速度の段が粗い（6 段）~~ → **41 段・5 % 刻み** | 2026-09-08 |
| ~~`minecraft:movement` に `max` が無い~~ → **×7 まで書く** | 2026-09-08 |
| ~~無敵時間の抜けが未確認~~ → **動いていた**（5 章） | 2026-09-08 |
| ~~段の JSON を手で写している~~ → **`tools/pve3-mobjson.mjs`** | 2026-09-08 |
| ~~ひな形を作る道具が無い~~ → **`tools/pve3-newmob.mjs`**（9 章） | 2026-09-08 |

---

## 14. **跳ねて進む敵**（スライム・2026-09-08）

**`node tools/pve3-newmob.mjs slime --look slime --box 0.52x0.52 --move jump --nav walk`。**

### 14-1. **跳ねを作っているのは移動制御**

**バニラの `slime.json` を読むと、跳ねは `minecraft:movement.jump` が作っている。**
**同梱の公式ドキュメント**: *Move control that causes the mob to jump as it moves* /
`jump_delay` は *Delay after landing when **using the slime move control***。

| | |
| --- | --- |
| **`--move jump`** | **これだけで跳ねる。** 進む向きは navigation が決める |
| **`jump_delay`** | **道具は書かない**（既定は `[0, 0]` ＝ 一切止まらない）。**手で足す** |
| **書く値** | **`[0.16, 0.5]`**——**バニラの `minecraft:slime_aggressive`。** **うちの敵は常に追う**ので、落ち着いている側（`[0.5, 1.5]`）は使わない |

### 14-2. **バニラの `behavior.slime_*` は写さない**

| 部品 | なぜ入れないか |
| --- | --- |
| **`slime_attack`**（優先度 3） | **`melee_box_attack`（4）を押さえてしまう。** **ダメージは「バニラが当てた瞬間」に乗せている**（`services/melee.ts`）ので、**動かないと殴っても何も起きない** |
| **`slime_random_direction`** | **追わずにさまよう。** 狙いを付ける部品と噛み合わない |
| **`slime_keep_on_jumping`** | **`movement.jump` だけで跳ねる**ので要らない |

> ### **バニラのダメージも写さない**
>
> **バニラのスライムは `minecraft:area_attack` で削る**（小スライムは 0）。
> **こちらは `melee_box_attack` ＋ `services/melee.ts`**——**41 段も、その部品に効く。**

### 14-3. **`query.variant` を書かないと透明になる**（**踏んだ**）

**`slime.entity.json` の `pre_animation` は、`query.variant` で模型を拡縮する。**

```json
"variable.horizontal_scale_amount = variable.bounce * query.variant;"
```

**`minecraft:variant` を実体に書かないと `query.variant` は 0**——**倍率 0 ＝ 見えない。**
**エラーは出ない**（6-3 と同じ形の落とし穴）。

```json
"minecraft:variant": { "value": 1 }
```

**1 ＝ 小、2 ＝ 中、4 ＝ 大**（バニラの `slime_small` / `_medium` / `_large` と同じ）。
**当たり判定もバニラに合わせる**——**小は `0.52 x 0.52`。**

> ### **当たり判定は見た目と別に決める**（2026-09-09 決定）
>
> **`query.variant` は見た目の倍率を作る**が、**当たり判定は `minecraft:collision_box`。**
> **別々に書ける**——**「当てやすくしたいだけ」なら、見た目は触らない。**
>
> | 敵 | `variant`（見た目） | 当たり判定 |
> | --- | --- | --- |
> | **スライム** | 1（バニラの小） | **0.78**（1.5 倍） |
> | **大スライム** | 2（バニラの中） | **2.08**（2 倍） |

> ### **`entities/<id>.json` にコメントは書けない**
>
> **`tools/pve3-mobjson.mjs` が `JSON.parse` で読む**ので、`//` を入れると道具が落ちる。
> **手で足した部品の理由は、ここ（この文書）か `roster.ts` に書く。**

---

## 15. **中立の敵**（ヒツジ・2026-09-08）

**`roster.ts` に `neutral: true` と書くだけ**（`25-enemy-kit.md` 12 章）。
**`pve3-newmob.mjs` が `behavior.nearest_attackable_target` を外し、
`behavior.hurt_by_target` だけを残す。**

### 15-1. **旗は `pve3-mobjson.mjs` が読み落としていた**（**踏んだ**）

**`fly` / `neutral` / `still` は `EnemyDef` の真偽値**だが、
**`enemiesOf()` は数値と文字列しか拾っていなかった。**
**旗を書いても `undefined` のまま道具に渡り、
「歩く・誰でも狙う」ひな形が黙って出てくる**（コウモリで踏んだ）。

**`enemiesOf()` が 3 つの旗も読むように直した。** **エラーは出ないので、
起こしたあとは必ず `entities/<id>.json` を開いて、
`movement.fly` / `navigation.fly`（飛ぶ）・
`nearest_attackable_target` が無いこと（中立）を目で確かめる。**

### 15-2. **`hurt_by_target` の既定値では足りない**（`Entities.html` で確認）

**中立の敵は、狙いを付ける部品が `hurt_by_target` **だけ**になる。**
**既定値のままだと、こう困る。**

| 既定 | 何が起きるか | どうしたか |
| --- | --- | --- |
| **`max_dist` 16** | **16 マス離れられたら、狙いが外れる。** ほかの敵は `follow_range` 100・`within_radius` 100 で追う（1-2） | **`entity_types` に `max_dist: 100`** |
| **`must_see` false** | **そのままでよい**（壁の向こうでも追う） | **明示して書く**（1-2 と同じ 3 か所目） |
| **相手を絞っていない** | **クリエイティブの人にも向かう**（1-3）。**敵に殴られても、その敵を狙う** | **`entity_types` の `filters` を `nearest_attackable_target` と同じ形にする** |
| **`alert_same_type` false** | **1 匹殴ったら群れ全部が来る、を防いでいる。** そのままでよい | **明示して書く** |

```json
"minecraft:behavior.hurt_by_target": {
  "priority": 1,
  "entity_types": [
    {
      "filters": { "all_of": [
        { "test": "is_family", "subject": "other", "value": "player" },
        { "none_of": [{ "test": "has_ability", "subject": "other", "value": "instabuild" }] }
      ] },
      "max_dist": 100,
      "must_see": false
    }
  ],
  "alert_same_type": false
}
```

**これは `entities/sheep.json` に手で足してある**——
**`pve3-newmob.mjs --force` で起こし直すと消える。** **起こし直したら書き戻す。**

### 15-3. **「最初に殴った人だけ」は、部品では作れない**（**未解決**）

**性能表（`07-enemy-plan.md` 6-1）はこう言っている。**

> **最初に攻撃してきた人を、最後まで追い続ける**（**他の人は狙わない**）。
> **その人が倒れたら、また中立に戻る。**

| | |
| --- | --- |
| **できている** | **殴られるまで襲ってこない。** **その人が倒れたら中立に戻る**（目標が消えれば goal も止まる） |
| **できていない** | **他の人は狙わない。** **`hurt_by_target` は、後から殴った人へ乗り換える** |

**`Entities.html` に並ぶ引数（`entity_types` / `hurt_owner` / `alert_same_type`）に、
乗り換えを止めるものは無い。** **`entity_types` の `cooldown`
（*wait before selecting a target of the same type again*）は乗り換えを塞げるが、
目標が倒れた後の再標的まで塞ぐ**——**「また中立に戻る」と噛み合わない。**

**やるなら script 側**（`services/` に「最初の攻撃者を控えて、それ以外を弾く」共通部品）。
**部品を増やす話なので、勝手に足さない。** **決めてから作る。**

---

## 16. **人型モブに自前の動きを付ける**（2026-09-09・回転の刀で作り切った）

**バニラの人型の配線**（`controller.animation.humanoid.*`）**は「歩く・殴る・弓を引く」しか持たない。**
**溜めて回って斬るような動きは、自分で書く。**

### 16-1. **飛竜と同じ作り**（`animation_controllers/wyvern.ac.json`）

```
状態を持つ配線（animation controller）
   │
   ├ どの状態か ── Molang の条件で決める
   └ 状態ごとに ── 1 本のアニメを流す
```

**飛竜は `pve_v3:act`（文字の property）で状態を切っている。**
**script が「いま何をしているか」を書き込み、見た目がそれに従う。**

### 16-2. **切り替えの合図は、なるべく部品から取る**

> ### **script の時計と、ビヘイビアの振りはずれる**（`25-enemy-kit.md` 7 章）
>
> **script が自分で数えると、振りの見た目と当たりが揃わない。**
> **部品の状態を Molang から読めるなら、そちらが必ず揃う。**

| 合図 | どこから |
| --- | --- |
| **いま何をしているか** | **`query.mark_variant`**（0 なし／1 溜め／2 振り・`services/windup.ts`） |
| **飛ぶ・跳ねるなど** | **バニラの Molang**（`query.is_delayed_attacking` ほか） |

> ### **`q.property()` では見た目が変わらなかった**（**踏んだ**・2026-09-09）
>
> **`client_sync: true` を付けた property を script から書き、
> 配線の条件に `q.property('pve_v3:windup') > 0` と書いた**——**一度も切り替わらなかった。**
> **`pve_v3:swing` で振りを出そうとしたときも同じだった。**
>
> **`query.mark_variant` は昔からある値で、確実に client まで届く。**
> **部品群を差し替えて数字を変える**（`pve_v3:pose_charge` / `pve_v3:pose_slash`）。
>
> **バニラが実際に使っている手を選ぶ。** **property は宣言だけ残してある。**

**`is_delayed_attacking` は `attack_duration` のあいだ 1。**
**`hit_delay_pct` の所で当たる**ので、**前半が溜め・後半が戻り**になる。

> ### **`delayed_attack` の `on_attack` は鳴らなかった**（**実測・2026-09-09**）
>
> **公式には載っている**: *on_attack — Defines the event to trigger when this entity
> **successfully** attacks.*
>
> **`damage: 0` では当たったことにならない**と考えて `damage: 1` に直したが、**それでも鳴らなかった。**
> **`pve_v3:swung` が一度も飛ばず、溜めるだけで一生振らない敵のままだった。**
>
> **バニラでこの口を使っているモブは 1 体も居ない**——**ラヴェジャーは `on_attack` を書いていない。**
> **`bedrock-samples` に実物が無い書き方は、載っていても動くとは限らない。**
>
> **溜めの時計は script が持つことにした**（`services/windup.ts`）。
> **見た目も当たりも同じ時計から出る**ので、**ずれようがない。**

### 16-2-1. **溜めを script で持つ**（`services/windup.ts`・2026-09-09）

```
間合いに入った ── 溜める ── 振る ── 休む ── はじめへ
                    │        │
                    │        └ ここで当たりを決める
                    └ **途中で相手が離れても、やめない**
```

> ### **溜め切ったら、必ず振る**（2026-09-09）
>
> **一度は「間合いから出たら溜めを取り消す」ようにしていた。**
> **溜めたのに何も起きないと、見ている側は「壊れている」と思う。**
> **当たるかどうかは、振った後に `services/sweep.ts` が決める。**

| | |
| --- | --- |
| **溜めの長さ** | **攻撃間隔の半分**（`delayed_attack` の `hit_delay_pct: 0.5` と同じ考え） |
| **振りの長さ** | **10 tick**（`services/swing.ts` と同じ） |
| **休み** | **攻撃間隔の残り**——**溜め ＋ 振り ＋ 休み ＝ 攻撃間隔** |
| **呪い** | **`swingOf` を通す**ので、**攻撃速度が上がれば溜めも縮む** |
| **見た目** | **`query.mark_variant`**（0 / 1 / 2） |

**`delayed_attack` は残す**——**寄る足として要る**（`melee_box_attack` と同じ役）。
**`on_attack` も消さない**（鳴るようになったら、それはそれで動く）——
**二度振らないように、`services/swung.ts` が直前に振った時刻を見て弾く。**

### 16-3. **人型の骨の名前**（`geometry.pve3.humanoid`）

```
root ─ body ─ waist / head(+hat, cape) / leftArm(+leftSleeve, leftItem)
             / rightArm(+rightSleeve, rightItem) / leftLeg / rightLeg / jacket
```

**持ち物は `rightItem`。** **腕を回せば、持ち物も付いてくる。**

| 回す向き | 見え方 |
| --- | --- |
| **腕の `x` を負に** | **前へ上げる**（−180 で真上） |
| **腕の `z`** | **横へ開く**（右腕は負で外向き） |
| **`body` の `y`** | **体ごと回る**（回転斬り） |

### 16-4. **回転の刀**（`animation.pve3.katana.*`）

| 状態 | いつ | 動き |
| --- | --- | --- |
| **`charge`** | `query.is_delayed_attacking` かつ まだ振っていない | **刀を頭上に構え、腰を落として震える** |
| **`slash`** | `pve_v3:swing > 0`（**当たった瞬間から 10 tick**） | **腕を横に伸ばし、体が 2 回転** |
| **`recover`** | 振り終わり | **刀を正面に下ろして構え直す** |

**`slash` の長さ 0.5 秒は `pve_v3:swing` の 10 tick と同じ。**
**溜めと戻りは長さを決め打ちしない**（**攻撃速度が上がると `attack_duration` が縮む**ため）。

### 16-6. **溜まっていく見た目**（爆弾・2026-09-09）

**script は「進み具合」だけ渡す。** **膨らみ方も点滅も Molang が作る**——
**バニラのクリーパーと同じ作り**（`animation.creeper.swelling`）。

| | |
| --- | --- |
| **渡すもの** | `pve_v3:fuse`（0 → 1・`services/onfall.ts` が毎 tick 書く） |
| **膨らみ** | `math.pow(fuse, 1.6) * 0.6 + 1.0`——**1.0 倍から 1.6 倍へ、じわじわ** |
| **揺れ** | `math.sin(fuse * 5730) * fuse * 0.02`（バニラと同じ式。**終わりほど震える**） |
| **点滅** | `math.mod(math.round(math.pow(fuse, 2.0) * 18.0), 2.0)`——**2 乗なので、終わりほど速くなる**（2 秒で 18 回） |
| **赤** | `controller.render.pve3_bomb` の `overlay_color`（バニラのクリーパーは白） |

**`this` を使って、光らせない時は元の色に戻す**（バニラと同じ書き方）。

### 16-7-1. **バニラの見た目を借りると、engine の値まで借りたことになる**（追尾弾・2026-09-10）

> ### **シュルカーの見た目が斜めになり、名前板とずれた**（**踏んだ**）
>
> **`entity/shulker.entity.json` の `pre_animation` をそのまま写していた。**
> **そこに出てくる `variable.Shulker.FacingDirection` / `PeekAmount` は、
> engine が「本物のシュルカー」にだけ入れる値**——
> **こちらの実体（`pve_v3:seeker`）には入らない。**
>
> **入らない値から `XPreRotation`（傾き）と `YOffset`（寄せ）を作っていたので、
> model だけが傾いて、名前板（実体の位置）とずれた。**

**借りた `pre_animation` が `variable.<何か>` を読んでいたら、こちらで先に決めておく。**

```json
"variable.Shulker.FacingDirection = 0.0;",   // **床向き**——傾きも寄せも 0 になる
"variable.Shulker.PeekAmount = 0.0;",        // **蓋は閉じたまま**
```

**バニラの見た目を借りるときは、`pre_animation` に出てくる変数を全部数える**——
**`query.` は engine がどの実体にも答えるが、`variable.` は誰かが入れないと空。**

### 16-8. **範囲を地面に敷く**（2026-09-09）

**粒を円周に並べると、点が飛んでいるようにしか見えない。**
**円の絵を 1 枚、地面に寝かせる**——**pve-v2 の「恵みの雨」と同じ作り。**

| | |
| --- | --- |
| **絵** | `textures/particle/pve3_ring`——**外周がはっきりした線、中はうっすら**（中の濃さ 34／線 255） |
| **寝かせる** | `facing_camera_mode: "emitter_transform_xz"` |
| **高さ** | **真下の地面を探して置く**（`groundAt`）——**段差で浮いたり埋まったりしないため** |
| **大きさ** | **`v.size` で渡す**（`MolangVariableMap.setFloat`）。**`size` は差し渡し ＝ 半径 × 2** |
| **敷き直す間隔** | `FALL.drawGap`（8 tick）——**粒の寿命 0.6 秒より短くする** |

**色は粒の側で決める**（絵は白）。**爆弾は赤**（`pve_v3:boom_circle`）、**帯電は青**（`pve_v3:bolt_circle`・`25-enemy-kit.md` 10-1）。

> ### **予告に使う**（2026-09-09 決定）
>
> **爆弾が置かれている間、届く範囲を敷き続ける。**
> **爆ぜた瞬間には出さない**——**もう終わったことを見せても遅い。**
> **どこが危ないかは、爆ぜる前に見えていないと理不尽**（`22-feedback.md`）。

### 16-7. **撃つ・投げる敵に殴りモーションを付ける**（投石ハスク・2026-09-09）

> ### **ゾンビの殴りは `variable.attack_time` で動く**
>
> **engine が「殴った」ときだけ 0 → 1 に動かす値。**
> **`ranged_attack` しか持たない敵では、一度も動かない。**

**`pre_animation` で、自分で作る。**

```
variable.attack_time = q.property('pve_v3:swing') > 0.0
  ? (1.0 - q.property('pve_v3:swing') / 10.0) : 0.0;
```

**`pve_v3:swing` は 10 → 0**（`services/swing.ts`）**なので、裏返して 0 → 1 にする。**
**投げた瞬間に `startSwing` を呼ぶ**（`services/mobshot.ts`）。

### 16-9. **動きは、見ながら作る**（`tools/pve3-pose.py`・2026-09-10）

```bash
npm run pose          # tools/pve3-pose.html を組み立てる（そのまま開ける）
npm run check:pose    # 作ったものが、その敵の骨に本当に届くか照合する
```

> ### **推測で数字を動かしても当たらない**（**踏んだ**・2026-09-10）
>
> **銃の持ち方を、ゲームを開かずに見られなかった。**
> **1 往復に 1 回しか試せず、当てずっぽうを 10 回近く繰り返した。**

| | |
| --- | --- |
| **相手** | **人型のモブだけ**（頭・胴・両腕・両脚がそろっているもの） |
| **できること** | **骨を回す・寄せる／時間軸に山を打って動きを作る／再生する** |
| **持ち物** | **右手・左手に、自前のアイテムの絵を載せて確かめる** |
| **読み込み** | **このパックのアニメを開いて、そのまま直せる** |
| **書き出し** | **アニメの JSON ぜんぶ**（写す・ファイルに落とす） |

**貼り先**は `resource_packs/pve_v3/animations/`。
**`- this` は「ほかの動きを打ち消してから置く」印**（16-1）——**工房もその形で書き出す。**

### 17. **工房で作ったものの正しさを担保する**（`tools/pve3-posecheck.py`）

> ### **骨の名前が違っても、ゲームは何も言わない**（2026-09-10）
>
> **無い骨を書いても、エラーは出ない。** **ただ動かないだけ。**
> **「工房では合っていたのに、ゲームではめちゃくちゃ」の正体はここ。**

**`npm run check` に入っている。** 見るのは 3 つ:

| | |
| --- | --- |
| **骨がある** | **そのアニメを鳴らす実体の模型に、その名前の骨があるか**（大小は見ない） |
| **形が正しい** | **回す・寄せるは 3 つ組か。** 時刻が長さの外に出ていないか |
| **式が読めるか** | **数か、`数 - this` か、Molang か** |

**誰も鳴らさないアニメも見つける**——**貼ったのに実体へ繋いでいない、が分かる。**

**壊して試した**（`rightItem` を `rightHand` に変えた）:

```
NG animation.pve3.gun.hold: shotgun.entity.json no mokei ni hone ga nai -> righthand
```

### 16-5. **自前の武器を持たせる**

**持たせ方は装備表**（10-3 と同じ）。**違うのはアイテムを自分で作る所だけ。**

| 作るもの | どこ |
| --- | --- |
| **絵** | `resource_packs/pve_v3/textures/items/<名>.png`（**自分で描く**） |
| **絵の名前** | `resource_packs/pve_v3/textures/item_texture.json` |
| **アイテム** | `behavior_packs/pve_v3/items/<名>.json`（`minecraft:hand_equipped: true`） |
| **持たせる** | `behavior_packs/pve_v3/loot_tables/gear/<敵>.json` に id を書く |

**`hand_equipped: true` を書くと、バニラの剣と同じように斜めに握る。**
**書かないと板を平らに持つ。**
