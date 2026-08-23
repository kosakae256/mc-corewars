# Core Wars

2チームに分かれて、相手のコアを **100回** 壊した方が勝ちのチーム PvP。

設計は [docs/](docs/) を見ること。**ここが起点。**

---

## この中に何があるか

```
worlds/core-wars/
├── docs/                 このワールドの設計。企画・ルール・マップ
│   ├── 00-concept.md         企画
│   ├── 01-rules.md           ルール
│   ├── 02-map.md             マップ（座標もここ）
│   ├── 03-content.md         中身
│   ├── spec/                 このワールドの技術仕様
│   └── decisions/            なぜそう決めたかの記録
├── packs/                ソース（TypeScript）
│   ├── game/                 ゲーム本体。ルール・進行・勝敗
│   └── kit/                  制作の道具。建築補助・運営コマンド・構造物
└── world/                ワールドデータ（手動 export した .mcworld）
```

### なぜ `addons/` ではなくここなのか

**ワールドに属するものを1箇所に集めるため。**
アドオン単位で管理すると、設計文書・パック・ワールドデータが
リポジトリ中に散らばって、どれがこの世界のものか分からなくなる。

`addons/` は**実験用**。試作の置き場であって、ゲーム本体は入れない。

---

## 作業のしかた

### パックを直す

```bash
cd worlds/core-wars/packs/kit      # または game
npm install                        # 初回のみ
npm run local-deploy               # ビルドしてゲームへ配置（--watch で監視）
```

配置先は `development_behavior_packs` / `development_resource_packs`。
**ワールドの中には入らない。** ワールド側はパックの UUID を参照している。

### マップを直す

```bash
cd tools/mapview
node build-mid.mjs                 # 中央の島
node main.mjs                      # 拠点
node build-underside.mjs           # 中央の島の地面より下
```

画像が `tools/mapview/out/` に出る。**見てから**構造物を書き出す。
書き出し先は `packs/kit/behavior_packs/kit/structures/corewars/`。

> **構造物は名前でキャッシュされる。** 同じ名前で差し替えても
> 古い中身が読まれるので、版番号を付けてある（`mid_nw_v4` など）。
> 実行すると最新の名前とコマンドが出力される。
> 詳細は [docs/spec/08-map-authoring.md](docs/spec/08-map-authoring.md)。

### ワールドを保存する

**手動で export する。** Minecraft の「ワールドの設定 → ワールドをエクスポート」。
出てきた `.mcworld` を `world/` に置いて commit する。

> **export 中・プレイ中はコピーしない。** 書き込み途中を掴んで壊れる。

---

## ゲーム内で使うコマンド

地面の高さ **-10**、中央の島の中心 **(1000, 1000)**。

```
拠点A  /structure load corewars:base_v3    880 -32  980 270_degrees
拠点B  /structure load corewars:base_v3   1080 -32  980  90_degrees

中央   /structure load corewars:mid_nw_v4   960 -44  960
       /structure load corewars:mid_ne_v4   987 -44  960
       /structure load corewars:mid_sw_v4   960 -44  987
       /structure load corewars:mid_se_v4   987 -44  987
```

最新の版番号は `tools/mapview` を実行すると出る。
座標の根拠は [docs/02-map.md](docs/02-map.md)。
