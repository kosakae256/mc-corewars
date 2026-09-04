# 地形を写真で確かめる（`mc-scene.mjs` ＋ `mc-render.py`）

**ゲームに入らずに、作った地形を任意の角度から見る道具。**

> ### なぜ要るか
>
> **平面図では、色合いと起伏の違和感が分からない。**
> 上から見た図は「どこに何があるか」しか教えてくれない。
> **山が唐突か、色が濁っていないか、遠景が眠くないか**は、
> **その場に立って見た絵**でしか分からない。
>
> ゲームに入って歩いて確かめると 1 往復で数分かかる。
> 地形は**決まりきった計算**なので、同じ結果をこちらで描ける。

## 流れ

```
terrain.ts  ─tsc─▶ terrain.js  ─┐
fortress.ts ─tsc─▶ fortress.js ─┴─ mc-scene.mjs ─▶ scene.json ─ mc-render.py ─▶ 写真
```

```bash
# 1. 出来上がった js を作る（一時ディレクトリでよい）
cd worlds/pve-v2/packs/pve_v2
npx tsc scripts/features/map/terrain.ts scripts/features/map/models/fortress.ts     --outDir /tmp/scene --module es2020 --target es2020     --moduleResolution bundler --rootDir scripts/features/map

# 2. 場面を作る（種を変えると別の地形）
node tools/mc-scene.mjs /tmp/scene 1 /tmp/scene/scene-1.json

# 3. 撮る
python tools/mc-render.py /tmp/scene/scene-1.json --from 1254,230,1080 --at 1254,30,700 --out far.png
python tools/mc-render.py /tmp/scene/scene-1.json --ring 6 --radius 300 --height 110 --out shots/ring
```

## 場面（`scene.json`）

**柱の一番上だけ**を持つ（高さと、そこに見えるブロック）。
中身は見えないので要らない——**写真で見るのは表面だけ。**

| | |
| --- | --- |
| `x0` `z0` `w` `l` | 範囲 |
| `h` | 高さ（`-999` は「何も無い」＝戦場の中） |
| `b` | `palette` の番号 |
| `field` | 戦場の箱（撮る位置の既定値に使う） |

**要塞（`.schem` から取り込んだ `fortress.ts`）は戦場の箱に置く。**
**橋は地面より上に乗せる**——写真で見えないと、谷を渡れているか分からない。

## 撮る（`mc-render.py`）

**画素ごとに光線を飛ばし、地面に当たった所の色を塗る。**
斜め投影と違って**画角・向きの制限が無い**（真下も向ける）。

| 引数 | |
| --- | --- |
| `--from x,y,z` | カメラの位置。**`y` に `~` を付けると、その場の地面からの高さ** |
| `--at x,y,z` | 見る先（同じく `~` が使える） |
| `--fov` | 画角（既定 65） |
| `--size` | 大きさ（既定 1000x560） |
| `--far` | 霧が完全に掛かる距離（既定 900） |
| `--ring N` | **戦場を中心に N 枚まわして撮る**（`--radius` `--height`） |

| 描き方 | |
| --- | --- |
| 明るさ | 傾きから作る。**崖は暗く** |
| 影 | **太陽へ光線を飛ばし、遮られていれば日陰。** 影が無いと山が板に見える |
| 霧 | 遠いほど空の色へ。**濃くしすぎると全部白くなって色が判断できない** |

色は目分量（`COLORS`）。**形と色合いの当たりを見るためのもので、最終確認ではない。**
**色を決めていないブロックは紫**で出る（気付けるように）。

## 撮った写真

`worlds/pve-v2/user/shots/` に置いている（**git 管理外の置き場**）。
