# reference — ローカルに置いた外部資料

**ここは自分たちで書く場所ではない。** 外部リポジトリを取ってきただけの参照用ディレクトリ。
自分たちの構想・仕様は `docs/` に書く。

取得日: 2026-08-21 / 対象バージョン: Minecraft BE 1.26.40〜1.26.44

いずれも `--depth 1 --filter=blob:none --sparse` で **Markdown / JSON だけ** に絞って取得している
（フルクローンだと画像・音声込みで数 GB あるため）。

---

## 一覧

| ディレクトリ | 中身 | サイズ | 元 |
| --- | --- | --- | --- |
| [minecraft-creator-docs/](minecraft-creator-docs/) | **公式ドキュメント全文**（Markdown 3,652 ファイル） | 24MB | [MicrosoftDocs/minecraft-creator](https://github.com/MicrosoftDocs/minecraft-creator) |
| [bedrock-samples/](bedrock-samples/) | **バニラの behavior_pack / resource_pack 一式**（v1.26.40.5） | 123MB | [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) |
| `../bedrock-samples/` | **同じものの完全版。** 絵・音と **公式 HTML 資料 21 本**込み（v1.26.40.5） | 701MB | 同上（2026-08-29 に手で配置） |
| [bedrock-wiki/](bedrock-wiki/) | コミュニティ Wiki（Markdown 276 ファイル） | 7.6MB | [Bedrock-OSS/bedrock-wiki](https://github.com/Bedrock-OSS/bedrock-wiki) |
| [bedrock-json-schemas/](bedrock-json-schemas/) | 各種 JSON の検証スキーマ | 8MB | [Blockception/Minecraft-bedrock-json-schemas](https://github.com/Blockception/Minecraft-bedrock-json-schemas) |
| [Chest-UI/](Chest-UI/) | **チェスト風のフォーム一式。** ショップで取り込んで使っている | 1MB | [Herobrine643928/Chest-UI](https://github.com/Herobrine643928/Chest-UI) |
| `../addons/<名前>/node_modules/@minecraft/` | **Script API の型定義（.d.ts）** | — | npm |

---

## 根に置いた完全版 `bedrock-samples/`（2026-08-29）

`reference/bedrock-samples/` は **JSON だけ**に絞ってある——**絵と音が無い。**
**バニラの絵を下敷きにしたい**ときは、根の完全版を見る。

| 欲しいもの | どこ |
| --- | --- |
| バニラの絵（PNG） | `bedrock-samples/resource_pack/textures/` |
| **公式の HTML 資料** | `bedrock-samples/documentation/` |

`documentation/` は **JSON の書式そのものの説明**（Molang・Particles・Entities・
Item・Blocks・Animations・Schemas ほか 21 本）。
**部品名や綴りで迷ったら、まずここ**——`tools/validate-pack.py` で弾かれた理由もここに載っている。

実例:

| 使った所 | 何を持ってきたか |
| --- | --- |
| [worlds/pve](../worlds/pve/docs/spec/13-bow-view.md) の弓 | **弓の絵 4 枚を塗り替えて**こちらの弓にした。置き方・手つきの値もそのまま |

**git には入れない**（701MB）。消えても Mojang/bedrock-samples から取り直せる。

---

## 用途別・どれを見るか

### Script API の関数・クラス・イベントを調べたい（最優先）

**`addons/<名前>/node_modules/@minecraft/server/index.d.ts`**（25,961行, v2.9.0）

TSDoc コメント付きで全 API が載っている。**これが最も正確**。
npm でインストールした実物なので、バージョンのズレが起きない。

```bash
grep -n "worldLoad" addons/hello/node_modules/@minecraft/server/index.d.ts
```

他:
- `@minecraft/server-ui/index.d.ts` (1,988行, v2.1.0) — フォーム UI
- `@minecraft/math/dist/minecraft-math.d.ts` (1,209行, v2.4.0) — ベクトル演算
- `@minecraft/vanilla-data/lib/` (v1.26.44) — バニラのブロック/アイテム/エンティティ ID の enum

### 概念・チュートリアル・仕様の説明を読みたい

**`reference/minecraft-creator-docs/creator/`**

| パス | 内容 |
| --- | --- |
| `Documents/scripting/` | スクリプト全般。**`v2-overview.md` は必読** |
| `Documents/AddOns/` | アドオンの基礎 |
| `Documents/Update1.26.*.md` | バージョンごとの変更点（差分追跡用） |
| `Documents/Practices/` | 推奨プラクティス |
| `Documents/molang/` | Molang |
| `ScriptAPI/minecraft/` | Script API リファレンス（Markdown 版） |
| `Reference/Content/` | JSON スキーマの解説 |

### JSON の書き方を実例で知りたい

**`reference/bedrock-samples/behavior_pack/`** — バニラの実物。

- `entities/`（127体） — エンティティ定義の完全な実例
- `items/`（77個）
- `loot_tables/` / `recipes/` / `trading/` / `spawn_rules/` / `biomes/`
- `resource_pack/` — models, animations, render_controllers, particles, ui（textures と sounds は除外済み）

「このコンポーネントどう書くんだっけ」は、ここを grep するのが一番速い。

```bash
grep -rl "minecraft:behavior.melee_attack" reference/bedrock-samples/behavior_pack/entities/
```

### 配置先・環境まわり

`Documents/GDKPCProjectFolder.md` — **1.21.120 の UWP → GDK 移行で `com.mojang` の場所が変わった件**。
Web の記事はほぼ旧パスのままなので、迷ったらこれを見る。

### コミュニティの実践知

**`reference/bedrock-wiki/docs/`** — 公式に載っていない小技・落とし穴。
`scripting/`, `blocks/`, `items/`, `entities/`, `json-ui/`, `world-generation/` など。

---

## 更新のしかた

```bash
cd reference/<repo> && git pull --depth 1
```

Script API の型定義は `cd addons/<名前> && npm update @minecraft/server`。
ゲームが更新されたら、`minecraft-creator-docs/creator/Documents/Update1.26.XX.md` で差分を確認する。
